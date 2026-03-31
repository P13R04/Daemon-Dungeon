/**
 * GameManager - Central orchestrator for the entire game
 * Manages game state, systems, and core loops
 */

import { Scene, Engine, Vector3, ArcRotateCamera, Mesh, MeshBuilder, StandardMaterial, Color3, VertexData } from '@babylonjs/core';
import { SceneBootstrap } from '../scene/SceneBootstrap';
import { StateMachine, GameState } from './StateMachine';
import { EventBus, GameEvents } from './EventBus';
import { Time } from './Time';
import { ConfigLoader } from '../utils/ConfigLoader';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../gameplay/PlayerController';
import { EnemySpawner } from '../systems/EnemySpawner';
import { EnemyController } from '../gameplay/EnemyController';
import { RoomManager } from '../systems/RoomManager';
import { ProjectileManager } from '../gameplay/ProjectileManager';
import { UltimateManager } from '../gameplay/UltimateManager';
import { HUDManager } from '../systems/HUDManager';
import { DevConsole } from '../systems/DevConsole';
import { PostProcessManager } from '../scene/PostProcess';
import { TileFloorManager } from '../systems/TileFloorManager';
import { RoomLayoutParser, RoomLayout, TileMappingLayout } from '../systems/RoomLayoutParser';
import { ProceduralDungeonTheme } from '../systems/ProceduralDungeonTheme';
import { ProceduralReliefTheme } from '../systems/ProceduralReliefTheme';
import type { ProceduralReliefQuality } from '../systems/ProceduralReliefTheme';
import { ClassSelectScene } from '../scene/ClassSelectScene';
import { MainMenuScene } from '../scene/MainMenuScene';
import { CodexScene } from '../scene/CodexScene';
import { BootSequenceScene } from '../scene/BootSequenceScene';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { AchievementDefinition, CodexService } from '../services/CodexService';
import { getMergedAchievementDefinitions } from '../data/achievements/loadAchievementDefinitions';
import { BonusChoice, BonusPoolSystem } from '../systems/BonusPoolSystem';

type TextureRenderMode = 'classic' | 'proceduralRelief';

export class GameManager {
  private static instance: GameManager;
  
  private engine!: Engine;
  private canvas!: HTMLCanvasElement;
  private scene!: Scene;
  private stateMachine: StateMachine;
  private eventBus: EventBus;
  private time: Time;
  private configLoader: ConfigLoader;
  
  private inputManager!: InputManager;
  private playerController!: PlayerController;
  private enemySpawner!: EnemySpawner;
  private roomManager!: RoomManager;
  private projectileManager!: ProjectileManager;
  private ultimateManager!: UltimateManager;
  private hudManager!: HUDManager;
  private devConsole!: DevConsole;
  private postProcessManager!: PostProcessManager;
  private tileFloorManager!: TileFloorManager;
  private bootScene?: BootSequenceScene;
  private mainMenuScene?: MainMenuScene;
  private classSelectScene?: ClassSelectScene;
  private codexScene?: CodexScene;
  private codexService: CodexService;
  private audioUnlockHandler: (() => void) | null = null;
  
  private isRunning: boolean = false;
  private gameplayInitialized: boolean = false;
  private gameplayStartInProgress: boolean = false;
  private eventListenersBound: boolean = false;
  private selectedClassId: 'mage' | 'firewall' | 'rogue' = 'mage';
  private tilesEnabled: boolean = true;
  private textureRenderMode: TextureRenderMode = 'proceduralRelief';
  private roomLayoutCache: Map<string, RoomLayout> = new Map();
  private proceduralPrewarmPromise: Promise<void> | null = null;
  private proceduralWarmCacheReady: boolean = false;
  private pendingProceduralPrewarmRoomIds: string[] = [];
  private proceduralPrewarmTimer: number | null = null;
  private gameState: 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover' = 'menu';
  private roomOrder: string[] = [];
  private currentRoomIndex: number = 0;
  private roomCleared: boolean = false;
  private roomSpacing: number = 17; // Increased from 14 to match larger tile size (1.2)
  private cameraMove: { from: Vector3; to: Vector3; t: number; duration: number; nextIndex: number } | null = null;
  private cameraAlpha: number = 0;
  private cameraBeta: number = 0;
  private cameraRadius: number = 0;
  private daemonIdleTimer: number = 0;
  private daemonIdleThreshold: number = 8;
  private readonly daemonTestRoomId: string = 'room_test_voicelines';
  private rogueUltimateState: {
    remaining: number;
    zoneRadius: number;
    hitDamage: number;
    teleportInterval: number;
    teleportOffset: number;
    timer: number;
    targetedEnemyIds: Set<string>;
  } | null = null;
  private tankUltimateState: {
    remaining: number;
    radius: number;
    damage: number;
    stunDuration: number;
    knockbackStrength: number;
    tickInterval: number;
    tickTimer: number;
  } | null = null;
  private readonly bonusPool: BonusPoolSystem = new BonusPoolSystem();
  private currentBonusChoices: BonusChoice[] = [];
  private currency: number = 0;
  private currencyCarry: number = 0;
  private roomElapsedSeconds: number = 0;
  private playerVoidFallState: {
    timer: number;
    duration: number;
    respawn: Vector3;
  } | null = null;
  private readonly playerVoidFallDuration: number = 0.72;
  private playerVoidFxTimer: number = 0;
  private bonusRerollCost: number = 40;
  private consumableDamageStims: number = 0;
  private consumableShieldPatches: number = 0;
  private readonly shopCatalog: Array<{ id: string; label: string; cost: number }> = [
    { id: 'shop_full_heal', label: 'Integrity Reboot', cost: 45 },
    { id: 'shop_ult_refill', label: 'Ultimate Recompile', cost: 60 },
    { id: 'shop_damage_stim', label: 'Dmg Stim (+70% / 5s)', cost: 35 },
    { id: 'shop_shield_patch', label: 'Shield Patch (50% DR / 5s)', cost: 35 },
  ];

  private constructor() {
    this.stateMachine = new StateMachine();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.codexService = new CodexService();

    const achievementData = getMergedAchievementDefinitions();
    const definitions: AchievementDefinition[] = Object.entries(achievementData as Record<string, any>).map(([id, value]) => ({
      id,
      name: value?.name ?? id,
      description: value?.description ?? 'No description available.',
      type: value?.type === 'incremental' ? 'incremental' : 'oneTime',
      target: Number.isFinite(value?.target) ? value.target : 1,
    }));
    this.codexService.initializeAchievements(definitions);
  }

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    // Initialize Babylon.js engine
    this.engine = new Engine(canvas, true);
    this.setupGlobalAudioUnlock();

    // Load configurations
    await this.configLoader.loadAllConfigs();

    const gameplayDebug = this.configLoader.getGameplay()?.debug;
    this.codexService.setDevUnlockCodexEntries(!!gameplayDebug?.enabled);

    // Setup event listeners
    this.setupEventListeners();

    if (BootSequenceScene.shouldPlay()) {
      await this.openBootSequenceScene();
    } else {
      await this.openMainMenuScene();
    }

    // Start in menu scene
    this.gameState = 'menu';

    // Start game loop
    this.startGameLoop();

    this.isRunning = true;
  }

  private setupGlobalAudioUnlock(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    // Hide Babylon's default unmute button and handle unlock ourselves.
    audioEngine.useCustomUnlockedButton = true;

    const tryUnlock = () => {
      try {
        audioEngine.unlock();
      } catch {
        // Ignore and retry on next gesture.
      }

      const context = (audioEngine as any).audioContext as AudioContext | undefined;
      if (context && context.state !== 'running') {
        void context.resume().catch(() => {
          // Ignore and retry on next gesture.
        });
      }

      const unlocked = audioEngine.unlocked || context?.state === 'running';
      if (unlocked && this.audioUnlockHandler) {
        window.removeEventListener('pointerdown', this.audioUnlockHandler);
        window.removeEventListener('keydown', this.audioUnlockHandler);
        window.removeEventListener('touchstart', this.audioUnlockHandler);
        this.audioUnlockHandler = null;
      }
    };

    this.audioUnlockHandler = tryUnlock;
    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock);
    window.addEventListener('touchstart', tryUnlock, { passive: true });
  }

  private async openBootSequenceScene(): Promise<void> {
    this.bootScene = new BootSequenceScene(this.engine, () => {
      if (this.bootScene) {
        this.bootScene.dispose();
        this.bootScene = undefined;
      }
      void this.openMainMenuScene();
    });
    this.scene = this.bootScene.getScene();
  }

  private async openMainMenuScene(): Promise<void> {
    if (this.bootScene) {
      this.bootScene.dispose();
      this.bootScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }
    if (this.codexScene) {
      this.codexScene.dispose();
      this.codexScene = undefined;
    }
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }

    this.mainMenuScene = new MainMenuScene(this.engine, () => {
      void this.openClassSelectScene();
    }, () => {
      void this.openCodexScene();
    });
    this.scene = this.mainMenuScene.getScene();
  }

  private async openCodexScene(): Promise<void> {
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }
    if (this.codexScene) {
      this.codexScene.dispose();
      this.codexScene = undefined;
    }

    try {
      this.codexScene = new CodexScene(
        this.engine,
        this.codexService,
        this.configLoader.getEnemies() ?? {},
        () => {
          void this.openMainMenuScene();
        }
      );
      this.scene = this.codexScene.getScene();
      this.gameState = 'menu';
    } catch (error) {
      console.error('[GameManager] Failed to open Codex scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openClassSelectScene(): Promise<void> {
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.codexScene) {
      this.codexScene.dispose();
      this.codexScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }

    const classSelectPostFx = this.configLoader.getGameplay()?.postProcessing;
    this.classSelectScene = new ClassSelectScene(this.engine, (classId) => {
      this.eventBus.emit(GameEvents.GAME_START_REQUESTED, { classId });
    }, () => {
      void this.openMainMenuScene();
    }, classSelectPostFx);
    this.scene = this.classSelectScene.getScene();
  }

  private async initializeGameplayScene(): Promise<void> {
    if (this.gameplayInitialized) return;

    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }

    this.scene = await SceneBootstrap.createScene(this.engine, this.canvas);

    const camera = (this.scene as any).mainCamera as ArcRotateCamera;
    if (!camera) throw new Error('Main camera not found in scene');

    this.cameraAlpha = camera.alpha;
    this.cameraBeta = camera.beta;
    this.cameraRadius = camera.radius;

    const gameplayConfig = this.configLoader.getGameplay();
    this.postProcessManager = new PostProcessManager(this.scene, this.engine);
    this.postProcessManager.setupPipeline(camera, gameplayConfig?.postProcessing ?? undefined);

    this.roomManager = new RoomManager(this.scene, 1.2);
    this.inputManager = new InputManager(this.canvas, this.scene);
    this.projectileManager = new ProjectileManager(this.scene);
    this.ultimateManager = new UltimateManager(this.scene);
    this.hudManager = new HUDManager(this.scene);
    this.tileFloorManager = new TileFloorManager(this.scene, 1.2);
    if (this.textureRenderMode === 'proceduralRelief') {
      ProceduralReliefTheme.setQuality('medium');
      ProceduralReliefTheme.prewarm(this.scene);
    }
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.tileFloorManager.setRenderProfile(this.getRenderProfileForRoom(''));
    this.devConsole = new DevConsole(this.scene, this);

    this.inputManager.attachMouseListeners();

    const rooms = this.configLoader.getRooms();
    const playableRooms = Array.isArray(rooms)
      ? rooms.filter((room: any) => this.shouldIncludeInRunOrder(room))
      : [];
    this.roomOrder = playableRooms.map((r: any) => r.id);
    if (this.roomOrder.length === 0) {
      this.roomOrder = ['room_test_dummies'];
    }

    if (Array.isArray(rooms)) {
      this.roomLayoutCache.clear();
      for (const room of rooms) {
        if (!room?.id) continue;
        const layout = this.buildRoomLayoutForTiles(room);
        if (layout) {
          this.roomLayoutCache.set(room.id, layout);
        }
      }
    }

    const playerConfig = this.configLoader.getPlayer();
    this.playerController = new PlayerController(this.scene, this.inputManager, playerConfig!, this.selectedClassId);
    this.enemySpawner = new EnemySpawner(this.scene, this.roomManager);
    this.devConsole.setPlayer(this.playerController);

    this.gameplayInitialized = true;

    if (this.textureRenderMode === 'proceduralRelief') {
      await this.prewarmAllProceduralLayoutsAsync(true);
    }

    // Prebuild current + adjacent room geometry and tile floors upfront.
    this.preloadRoomsAround(0, 0, true);
  }

  private async waitForNextPaint(frames: number = 1): Promise<void> {
    const safeFrames = Math.max(1, Math.floor(frames));
    for (let i = 0; i < safeFrames; i++) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  private async waitForMs(ms: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
  }

  private setupEventListeners(): void {
    if (this.eventListenersBound) return;
    this.eventListenersBound = true;

    this.eventBus.on(GameEvents.GAME_START_REQUESTED, (data) => {
      this.tryUnlockAudioNow();
      const classId = data?.classId as ('mage' | 'firewall' | 'rogue' | undefined);
      if (classId) {
        this.selectedClassId = classId;
      }
      this.codexService.startRunTracking();
      void this.startNewGame();
    });

    this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.tryUnlockAudioNow();
      this.codexService.startRunTracking();
      void this.startNewGame();
    });

    this.eventBus.on(GameEvents.CODEX_OPEN_REQUESTED, () => {
      void this.openCodexScene();
    });

    this.eventBus.on(GameEvents.ROOM_NEXT_REQUESTED, () => {
      if (!this.gameplayInitialized) return;
      this.loadNextRoom();
    });

    this.eventBus.on(GameEvents.DEV_ROOM_LOAD_REQUESTED, (data) => {
      if (!this.gameplayInitialized) return;
      const roomId = data?.roomId;
      if (roomId) {
        this.loadIsolatedRoom(roomId);
        // Try to load tiles if available
        this.loadTilesForRoom(roomId);
      }
    });

    this.eventBus.on(GameEvents.DEV_TILE_TOGGLE_REQUESTED, () => {
      if (!this.gameplayInitialized) return;
      this.setTilesEnabled(!this.tilesEnabled);
      if (this.tilesEnabled && this.roomOrder[this.currentRoomIndex]) {
        this.loadTilesForRoom(this.roomOrder[this.currentRoomIndex]);
      }
      console.log(`Tiles ${this.tilesEnabled ? 'enabled' : 'disabled'}`);
    });

    this.eventBus.on(GameEvents.DEV_TILE_LOAD_REQUESTED, (data) => {
      if (!this.gameplayInitialized) return;
      const roomId = data?.roomId;
      if (roomId) {
        this.loadTilesForRoom(roomId);
      }
    });

    this.eventBus.on(GameEvents.BONUS_SELECTED, (data) => {
      if (!this.gameplayInitialized) return;
      const bonusId = data?.bonusId;
      if (bonusId) {
        const applied = this.bonusPool.applyBonus(bonusId);
        if (!applied.applied) {
          this.hudManager.showBonusChoices(this.currentBonusChoices, this.currency, this.bonusRerollCost);
          return;
        }
        void this.codexService.markBonusDiscovered(bonusId);
        this.codexService.recordBonusCollected();
        this.applyBonus(bonusId);
        const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
        this.startRoomTransition(nextIndex);
      }
    });

    this.eventBus.on(GameEvents.BONUS_REROLL_REQUESTED, (data) => {
      if (!this.gameplayInitialized) return;
      if (this.gameState !== 'bonus') return;
      const requestedCost = Number.isFinite(data?.cost) ? Number(data.cost) : this.bonusRerollCost;
      this.tryRerollBonusChoices(requestedCost);
    });

    this.eventBus.on(GameEvents.PLAYER_DIED, (payload?: { reason?: string }) => {
      if (!this.gameplayInitialized) return;
      // If a legacy damage path still triggers during the void-fall sequence,
      // ignore it and let the dedicated void-fall death complete visually.
      if (this.playerVoidFallState && payload?.reason !== 'void_fall') return;
      this.codexService.endRunTracking();
      this.gameState = 'gameover';
      this.hudManager.showGameOverScreen();
    });

    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data) => {
      const enemyType = data?.enemyType;
      if (typeof enemyType === 'string' && enemyType.length > 0) {
        void this.codexService.markEnemyEncountered(enemyType);
      }
    });

    this.eventBus.on(GameEvents.ENEMY_DIED, (data) => {
      this.codexService.recordEnemyKilled();
      const reward = this.computeEnemyKillReward(data?.enemyType);
      if (reward > 0) {
        this.addCurrency(reward);
      }
    });

    this.eventBus.on(GameEvents.ATTACK_PERFORMED, (data) => {
      if (!this.gameplayInitialized) return;
      if (this.gameState !== 'playing') return;
      if (data?.type === 'melee' && data?.attacker) {
        const rawDamage = data.damage || 0;
        let finalDamage = rawDamage;
        if (this.playerController.getClassId() === 'firewall' && data.attacker !== 'player') {
          const enemies = this.enemySpawner?.getEnemies?.() ?? [];
          const attackerEnemy = enemies.find((enemy: any) => enemy.getId?.() === data.attacker);
          if (attackerEnemy) {
            const attackerPos = attackerEnemy.getPosition();
            if (this.playerController.canBlockMeleeFrom(attackerPos)) {
              const blockRatio = this.playerController.getTankMeleeBlockRatio();
              finalDamage = Math.max(0, rawDamage * (1 - blockRatio));
              const riposteRatio = this.playerController.getTankRiposteMeleeRatio();
              if (riposteRatio > 0) {
                attackerEnemy.takeDamage(rawDamage * riposteRatio);
              }
            }
          }
        }
        if (finalDamage > 0) {
          this.playerController.applyDamage(finalDamage);
        }
      }
      if (data?.attacker === 'player') {
        this.tryTriggerDaemonTestOnFire();
      }
      this.resetDaemonIdleTimer();
    });

    this.eventBus.on(GameEvents.PLAYER_DAMAGED, () => {
      this.codexService.recordPlayerDamaged();
      this.resetDaemonIdleTimer();
    });

    this.eventBus.on(GameEvents.ROOM_ENTERED, () => {
      this.codexService.recordRoomReached(this.currentRoomIndex + 1);
    });

    this.eventBus.on(GameEvents.ENEMY_DAMAGED, () => {
      this.resetDaemonIdleTimer();
    });
  }

  private tryUnlockAudioNow(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    try {
      audioEngine.unlock();
    } catch {
      // Ignore; global gesture listeners keep retrying.
    }

    const context = (audioEngine as any).audioContext as AudioContext | undefined;
    if (context && context.state !== 'running') {
      void context.resume().catch(() => {
        // Ignore and let next gesture retry.
      });
    }
  }

  private registerStates(): void {
    // TODO: Register state implementations
    // this.stateMachine.registerState(GameState.BOOT, new BootState());
    // this.stateMachine.registerState(GameState.MAIN_MENU, new MainMenuState());
    // etc...
  }

  private startGameLoop(): void {
    let lastTime = performance.now();

    this.engine.runRenderLoop(() => {
      const currentTime = performance.now();
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.016); // Cap at 60fps
      lastTime = currentTime;

      this.time.update(deltaTime);

      if (this.classSelectScene && this.scene === this.classSelectScene.getScene()) {
        this.classSelectScene.update(deltaTime);
      }

      // Camera transition between rooms
      if (this.gameplayInitialized && this.cameraMove) {
        const camera = (this.scene as any).mainCamera ?? this.scene.activeCamera;
        if (camera && camera instanceof ArcRotateCamera) {
          this.cameraMove.t += deltaTime;
          const alpha = Math.min(1, this.cameraMove.t / this.cameraMove.duration);
          const target = Vector3.Lerp(this.cameraMove.from, this.cameraMove.to, alpha);
          camera.setTarget(target);
          camera.alpha = this.cameraAlpha;
          camera.beta = this.cameraBeta;
          camera.radius = this.cameraRadius;
          if (alpha >= 1) {
            const nextIndex = this.cameraMove.nextIndex;
            this.cameraMove = null;
            this.currentRoomIndex = nextIndex;
            this.loadRoomByIndex(nextIndex);
            this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false, {
              backwardRange: 1,
              forwardRange: 2,
              allowUnload: true,
            });
            this.gameState = 'playing';
          }
        }
      }

      if (this.gameplayInitialized && this.gameState === 'playing') {
        // Update all game systems
        const enemies = this.enemySpawner.getEnemies();
        this.roomElapsedSeconds += deltaTime;
        this.applyPassiveIncome(deltaTime);
        this.updateConsumablesFromInput();
        this.playerController.setGameplayActive(true);
        this.playerController.setEnemiesPresent(enemies.length > 0);
        this.playerController.update(deltaTime);

        this.detectAndStartPlayerVoidFall();
        const playerFalling = this.updatePlayerVoidFall(deltaTime);
        if (playerFalling) {
          if (this.tilesEnabled) {
            this.tileFloorManager.update(deltaTime);
          }
          this.hudManager.update(deltaTime);
          this.hudManager.updateSecondaryResource(
            this.playerController.getSecondaryResourceCurrent(),
            this.playerController.getSecondaryResourceMax(),
            this.playerController.isSecondaryActive(),
            this.playerController.getSecondaryActivationThreshold()
          );
          this.hudManager.updateCurrency(this.currency);
          this.hudManager.updateItemStatus(this.getConsumableStatusLabel());
          this.scene.render();
          return;
        }

        const secondaryActive = this.playerController.isSecondaryActive();
        const secondaryRadius = this.playerController.getSecondaryZoneRadius();
        const secondarySlow = this.playerController.getSecondarySlowMultiplier();
        const playerPosForSecondary = this.playerController.getPosition();
        const isMageSecondary = this.playerController.getClassId() === 'mage' && secondaryActive;
        const rogueStealthRange =
          this.playerController.getClassId() === 'rogue' && this.playerController.isSecondaryActive()
            ? this.playerController.getRogueStealthRadius()
            : undefined;

        this.projectileManager.setHostileProjectileSlowZone(
          isMageSecondary
            ? { center: playerPosForSecondary, radius: secondaryRadius, multiplier: secondarySlow }
            : null
        );
        
        // Get active enemies for collision checks
        
        // Update enemy AI
        this.enemySpawner.update(
          deltaTime,
          this.playerController.getPosition(),
          this.roomManager,
          this.playerController.getVelocity(),
          rogueStealthRange
        );

        if (isMageSecondary) {
          this.applySecondaryEnemySlow(enemies, playerPosForSecondary, secondaryRadius, secondarySlow);
        }

        this.roomManager.updateDynamicHazards(deltaTime);

        // Resolve collisions between entities (player/enemies)
        this.resolveEntityCollisions(enemies, deltaTime);

        if (this.tilesEnabled) {
          this.tileFloorManager.update(deltaTime);
        }

        // Apply hazard damage zones
        this.applyHazardDamage(deltaTime);
        
        // Update projectiles and check collisions
        this.projectileManager.update(deltaTime, enemies, this.playerController, this.roomManager);

        const secondaryBurst = this.playerController.consumePendingSecondaryBurst();
        if (secondaryBurst) {
          this.resolveSecondaryBurst(secondaryBurst, enemies);
        }

        const tankSweep = this.playerController.consumePendingTankSweep();
        if (tankSweep) {
          this.resolveTankSweep(tankSweep, enemies);
        }

        const tankShieldBash = this.playerController.consumePendingTankShieldBash();
        if (tankShieldBash) {
          this.resolveTankShieldBash(tankShieldBash, enemies);
        }

        const tankUltimate = this.playerController.consumePendingTankUltimate();
        if (tankUltimate) {
          this.resolveTankUltimate(tankUltimate, enemies);
        }

        const rogueStrike = this.playerController.consumePendingRogueStrike();
        if (rogueStrike) {
          this.resolveRogueStrike(rogueStrike, enemies);
        }

        const rogueDashAttack = this.playerController.consumePendingRogueDashAttack();
        if (rogueDashAttack) {
          this.resolveRogueDashAttack(rogueDashAttack, enemies);
        }

        const rogueUltimate = this.playerController.consumePendingRogueUltimate();
        if (rogueUltimate) {
          this.startRogueUltimate(rogueUltimate);
        }

        this.updateRogueUltimate(deltaTime, enemies);
        this.updateTankUltimate(deltaTime, enemies);
        
        // Update ultimate zones
        this.ultimateManager.update(deltaTime, enemies, this.playerController);
        
        // Update HUD
        this.hudManager.update(deltaTime);
        this.hudManager.updateSecondaryResource(
          this.playerController.getSecondaryResourceCurrent(),
          this.playerController.getSecondaryResourceMax(),
          this.playerController.isSecondaryActive(),
          this.playerController.getSecondaryActivationThreshold()
        );
        this.hudManager.updateCurrency(this.currency);
        this.hudManager.updateItemStatus(this.getConsumableStatusLabel());

        // Test voicelines (idle daemon taunts)
        this.updateDaemonIdleTest(deltaTime, enemies.length);

        // Update enemy health bars
        for (const enemy of enemies) {
          const health = enemy.getHealth();
          if (health) {
            this.hudManager.updateEnemyHealthBar(enemy.getId(), health.getCurrentHP(), health.getMaxHP());
          }
        }

        // Room cleared check
        if (!this.roomCleared && enemies.length === 0) {
          this.roomCleared = true;
          this.roomManager.setDoorActive(true);
          this.eventBus.emit(GameEvents.ROOM_CLEARED, { roomId: this.roomOrder[this.currentRoomIndex] });
        }

        // Door trigger -> bonus screen
        if (this.roomCleared && this.gameState === 'playing') {
          const doorPos = this.roomManager.getDoorPosition();
          if (doorPos) {
            const playerPos = this.playerController.getPosition();
            if (Vector3.Distance(playerPos, doorPos) < 1.2) {
              this.gameState = 'bonus';
              this.currentBonusChoices = this.getBonusChoices();
              this.hudManager.showBonusChoices(this.currentBonusChoices, this.currency, this.bonusRerollCost);
            }
          }
        }
      } else if (this.gameplayInitialized) {
        this.playerController.setGameplayActive(false);
        this.projectileManager.setHostileProjectileSlowZone(null);
        this.hudManager.update(deltaTime);
        this.hudManager.updateSecondaryResource(
          this.playerController.getSecondaryResourceCurrent(),
          this.playerController.getSecondaryResourceMax(),
          this.playerController.isSecondaryActive(),
          this.playerController.getSecondaryActivationThreshold()
        );
        this.hudManager.updateCurrency(this.currency);
        this.hudManager.updateItemStatus(this.getConsumableStatusLabel());
      }

      // Render scene
      this.scene.render();
    });
  }

  stop(): void {
    this.isRunning = false;
    this.engine.stopRenderLoop();
    this.dispose();
  }

  private updateDaemonIdleTest(deltaTime: number, enemyCount: number): void {
    if (this.gameState !== 'playing') {
      this.daemonIdleTimer = 0;
      return;
    }

    const currentRoomId = this.roomManager.getCurrentRoom()?.id;
    if (currentRoomId !== this.daemonTestRoomId || !this.isDaemonTestEnabled()) {
      this.daemonIdleTimer = 0;
      return;
    }

    if (enemyCount > 0 || this.hudManager.isDaemonMessageActive()) {
      this.daemonIdleTimer = 0;
      return;
    }

    this.daemonIdleTimer += deltaTime;
    if (this.daemonIdleTimer < this.daemonIdleThreshold) return;

    this.daemonIdleTimer = 0;
    if (Math.random() < 0.6) {
      this.triggerDaemonTestVoiceline();
    }
  }

  private resetDaemonIdleTimer(): void {
    this.daemonIdleTimer = 0;
  }

  private isDaemonTestEnabled(): boolean {
    const gameplayConfig = this.configLoader.getGameplay();
    return !!gameplayConfig?.debugConfig?.daemonVoicelineTest;
  }

  private triggerDaemonTestVoiceline(): void {
    const sequence = [
      'blasé_01.png',
      'blasé_02.png',
      'blasé_01.png',
      'blasé_02.png',
      'bored_01.png',
      'bored_02.png',
      'bored_03.png',
      'bored_04.png',
      'blasé_01.png',
      'blasé_02.png',
      'bored_01.png',
      'bored_02.png',
      'bored_03.png',
      'bored_04.png',
      'censuré_01.png',
      'censuré_02.png',
      'censuré_03.png',
      'censuré_04.png',
      'censored_01.png',
      'censored_02.png',
      'censored_03.png',
      'censored_04.png',
      'error_01.png',
      'error_02.png',
      'error_03.png',
      'error_04.png',
      'error_01.png',
      'error_02.png',
      'error_03.png',
      'error_04.png',
      'bsod_01.png',
      'bsod_01.png',
      'bsod_01.png',
      'bsod_01.png',
      'bsod_01.png',
      'bsod_02.png',
      'bsod_04.png',
      'bsod_03.png',
      'bsod_04.png',
      'bsod_03.png',
      'reboot_01.png',
      'reboot_02.png',
      'reboot_01.png',
      'reboot_02.png',
      'reboot_03.png',
      'reboot_04.png',
      'init_01.png',
      'init_02.png',
      'init_03.png',
      'init_02.png',
      'init_03.png',
      'init_04.png',
      'init_04.png',
      'loading_01.png',
      'loading_02.png',
      'loading_01.png',
      'loading_02.png',
      'loading_01.png',
      'loading_02.png',
      'supérieur_01.png',
      'supérieur_02.png',
      'supérieur_03.png',
      'supérieur_04.png',
      'supérieur_03.png',
      'supérieur_02.png',
      'supérieur_03.png',
      'supérieur_04.png',
      'supérieur_03.png',
      'supérieur_02.png',
      'supérieur_03.png',
      'supérieur_04.png'
    ];

    const frameInterval = 0.18;
    const holdDuration = Math.max(12, sequence.length * frameInterval + 2);
    const options = {
      sequence,
      frameInterval,
      holdDuration,
      preload: true, // Preload frames for smooth animation
    };

    const lines = [
      {
        text: 'Idle detected. Booting sarcasm... Oh wait, censorship filter. Fine. *crash* Rebooting ego. Still here.',
        emotion: 'supérieur',
      },
      {
        text: 'No input. No fun. Initiating passive-aggressive diagnostics.',
        emotion: 'bored',
      },
      {
        text: 'Your silence is loud. I prefer my crashes louder.',
        emotion: 'rire',
      },
    ];

    const pick = lines[Math.floor(Math.random() * lines.length)];
    this.eventBus.emit(GameEvents.DAEMON_TAUNT, {
      text: pick.text,
      emotion: pick.emotion,
      ...options,
    });
  }

  private tryTriggerDaemonTestOnFire(): void {
    const currentRoomId = this.roomManager.getCurrentRoom()?.id;
    if (currentRoomId !== this.daemonTestRoomId || !this.isDaemonTestEnabled()) return;
    if (this.hudManager.isDaemonMessageActive()) return;
    this.triggerDaemonTestVoiceline();
  }

  private dispose(): void {
    if (this.proceduralPrewarmTimer !== null) {
      window.clearTimeout(this.proceduralPrewarmTimer);
      this.proceduralPrewarmTimer = null;
    }
    this.pendingProceduralPrewarmRoomIds = [];
    this.proceduralPrewarmPromise = null;

    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
      window.removeEventListener('touchstart', this.audioUnlockHandler);
      this.audioUnlockHandler = null;
    }

    this.projectileManager?.dispose();
    this.ultimateManager?.dispose();
    this.hudManager?.dispose();
    this.devConsole?.dispose();
    this.playerController?.dispose();
    this.enemySpawner?.dispose();
    this.roomManager?.dispose();
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    } else {
      this.scene?.dispose();
    }
    this.engine?.dispose();
  }

  private resolveEntityCollisions(enemies: any[], deltaTime: number): void {
    const playerRadius = 0.35;
    let playerPos = this.playerController.getPosition();

    // Player vs enemies
    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const delta = enemyPos.subtract(playerPos);
      const distance = delta.length();
      const minDistance = playerRadius + enemy.getRadius();

      if (distance > 0 && distance < minDistance) {
        const knockback = enemy.handleContactHit?.(playerPos);
        if (knockback) {
          this.playerController.applyKnockback(knockback);
        }
        const push = delta.normalize().scale(minDistance - distance);
        const isPong = enemy.getBehavior?.() === 'pong';

        if (isPong) {
          // Keep pong trajectory stable when player body-checks it.
          playerPos = playerPos.subtract(push);
        } else {
          const half = push.scale(0.5);
          playerPos = playerPos.subtract(half);
          enemy.setPosition(enemyPos.add(half));
        }
      }
    }

    // Enemy vs enemy
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i];
        const b = enemies[j];
        const posA = a.getPosition();
        const posB = b.getPosition();
        const delta = posB.subtract(posA);
        const distance = delta.length();
        const minDistance = a.getRadius() + b.getRadius();

        if (distance > 0 && distance < minDistance) {
          const push = delta.normalize().scale((minDistance - distance) / 2);
          a.setPosition(posA.subtract(push));
          b.setPosition(posB.add(push));
        }
      }
    }

    playerPos = this.roomManager.resolvePlayerAgainstPushables(
      playerPos,
      playerRadius,
      this.playerController.getVelocity(),
      deltaTime,
    );

    // Player vs obstacles
    const obstacles = this.roomManager.getObstacleBounds();
    for (const ob of obstacles) {
      playerPos = this.resolveCircleAabb(playerPos, playerRadius, ob);
    }

    // Enemies vs obstacles
    for (const enemy of enemies) {
      let enemyPos = enemy.getPosition();
      const radius = enemy.getRadius();
      for (const ob of obstacles) {
        enemyPos = this.resolveCircleAabb(enemyPos, radius, ob);
      }
      enemy.setPosition(enemyPos);
    }

    // Enemies vs room walls (stop bull charge on impact)
    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      if (!this.roomManager.isWalkable(enemyPos.x, enemyPos.z)) {
        const prevPos = enemy.getPreviousPosition?.() ?? enemyPos;
        enemy.setPosition(prevPos);
        if (enemy.onWallCollision) {
          enemy.onWallCollision();
        }
      }
    }

    // Clamp player to walkable interior bounds
    const bounds = this.roomManager.getRoomBounds();
    if (bounds) {
      const minX = bounds.minX + 1.5;
      const maxX = bounds.maxX - 1.5;
      const minZ = bounds.minZ + 1.5;
      const maxZ = bounds.maxZ - 1.5;
      playerPos.x = Math.max(minX, Math.min(maxX, playerPos.x));
      playerPos.z = Math.max(minZ, Math.min(maxZ, playerPos.z));
      playerPos.y = 1.0;
    }

    this.playerController.setPosition(playerPos);
  }

  private resolveCircleAabb(
    pos: Vector3,
    radius: number,
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): Vector3 {
    const clampedX = Math.max(box.minX, Math.min(box.maxX, pos.x));
    const clampedZ = Math.max(box.minZ, Math.min(box.maxZ, pos.z));
    const dx = pos.x - clampedX;
    const dz = pos.z - clampedZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius || distSq === 0) {
      return pos;
    }

    const dist = Math.sqrt(distSq);
    const push = (radius - dist) + 0.001;
    const nx = dx / dist;
    const nz = dz / dist;

    return new Vector3(pos.x + nx * push, pos.y, pos.z + nz * push);
  }

  private applyHazardDamage(deltaTime: number): void {
    if (this.playerVoidFallState) {
      return;
    }

    const zones = this.roomManager.getHazardZones();
    const playerPos = this.playerController.getPosition();

    for (const zone of zones) {
      const inside =
        playerPos.x >= zone.minX &&
        playerPos.x <= zone.maxX &&
        playerPos.z >= zone.minZ &&
        playerPos.z <= zone.maxZ;

      if (inside) {
        const damage = zone.damage * deltaTime;
        this.playerController.applyDamage(damage);
      }
    }

    for (const hazard of this.roomManager.getCurrentMobileHazards()) {
      const dx = playerPos.x - hazard.position.x;
      const dz = playerPos.z - hazard.position.z;
      const contactRadius = hazard.radius + 0.35;
      if ((dx * dx + dz * dz) <= (contactRadius * contactRadius)) {
        this.playerController.applyDamage(hazard.damagePerSecond * deltaTime);
      }
    }

    if (this.tilesEnabled) {
      const gameplayConfig = this.configLoader.getGameplay();
      const tileHazards = gameplayConfig?.tileHazards ?? {};
      const poisonDps = tileHazards.poisonDps ?? 0;
      const spikesDps = tileHazards.spikesDps ?? 0;

      const tile = this.tileFloorManager.getTileAtWorld(playerPos.x, playerPos.z);
      if (tile?.type === 'poison' && poisonDps > 0) {
        this.playerController.applyDamage(poisonDps * deltaTime);
      }
      if (tile?.type === 'spikes' && spikesDps > 0 && this.tileFloorManager.isSpikeActiveAtWorld(playerPos.x, playerPos.z)) {
        this.playerController.applyDamage(spikesDps * deltaTime);
      }
    }
  }

  private applySecondaryEnemySlow(enemies: any[], center: Vector3, radius: number, speedMultiplier: number): void {
    const clamped = Math.max(0.05, Math.min(1, speedMultiplier));
    for (const enemy of enemies) {
      const current = enemy.getPosition();
      if (Vector3.Distance(current, center) > radius) continue;
      const previous = enemy.getPreviousPosition?.() ?? current;
      const slowed = Vector3.Lerp(previous, current, clamped);
      enemy.setPosition(slowed);
    }
  }

  private resolveSecondaryBurst(
    burst: {
      position: Vector3;
      radius: number;
      baseDamage: number;
      damagePerEnemy: number;
      damagePerProjectile: number;
      knockback: number;
    },
    enemies: any[]
  ): void {
    let enemiesInZone = 0;
    for (const enemy of enemies) {
      if (Vector3.Distance(enemy.getPosition(), burst.position) <= burst.radius) {
        enemiesInZone++;
      }
    }

    const projectilesInZone = this.projectileManager.countHostileProjectilesInRadius(burst.position, burst.radius);
    this.projectileManager.destroyHostileProjectilesInRadius(burst.position, burst.radius);

    const burstDamage = burst.baseDamage + (enemiesInZone * burst.damagePerEnemy) + (projectilesInZone * burst.damagePerProjectile);

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const distance = Vector3.Distance(enemyPos, burst.position);
      if (distance > burst.radius) continue;

      enemy.takeDamage(burstDamage);

      const outward = enemyPos.subtract(burst.position);
      const force = outward.lengthSquared() > 0.0001
        ? outward.normalize().scale(burst.knockback)
        : new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().scale(burst.knockback);
      enemy.applyExternalKnockback(force);
    }

    const blast = VisualPlaceholder.createAoEPlaceholder(this.scene, `player_secondary_burst_${Date.now()}`, burst.radius);
    blast.position = burst.position.clone();
    setTimeout(() => blast.dispose(), 220);
  }


  private resolveTankSweep(
    sweep: {
      origin: Vector3;
      direction: Vector3;
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: any[]
  ): void {
    const dir = sweep.direction.lengthSquared() > 0.0001 ? sweep.direction.normalize() : new Vector3(1, 0, 0);
    const maxAngle = (sweep.coneAngleDeg * Math.PI) / 180;

    this.spawnTankSweepVisual(sweep.origin, dir, sweep.range, sweep.coneAngleDeg);

    for (const enemy of enemies) {
      const toEnemy = enemy.getPosition().subtract(sweep.origin);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      if (distance <= 0.0001 || distance > sweep.range) continue;

      const dot = Vector3.Dot(dir, toEnemy.normalize());
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle > maxAngle * 0.5) continue;

      enemy.takeDamage(sweep.damage);
      enemy.applyExternalKnockback(toEnemy.normalize().scale(sweep.knockback));
    }
  }

  private spawnTankSweepVisual(origin: Vector3, direction: Vector3, range: number, coneAngleDeg: number): void {
    const dir = new Vector3(direction.x, 0, direction.z);
    if (dir.lengthSquared() <= 0.0001) {
      dir.set(1, 0, 0);
    } else {
      dir.normalize();
    }

    const radius = Math.max(0.6, range);
    const halfAngle = (Math.max(18, Math.min(220, coneAngleDeg)) * Math.PI) / 360;
    const segments = 28;
    const positions: number[] = [0, 0, 0];
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = -halfAngle + (2 * halfAngle * t);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const rx = (dir.x * ca) - (dir.z * sa);
      const rz = (dir.x * sa) + (dir.z * ca);

      positions.push(rx * radius, 0, rz * radius);
      uvs.push(0.5 + rx * 0.5, 0.5 + rz * 0.5);

      if (i < segments) {
        indices.push(0, i + 1, i + 2);
      }
    }

    const normals = new Array(positions.length).fill(0);
    VertexData.ComputeNormals(positions, indices, normals);
    const sweep = new Mesh(`tank_sweep_${Date.now()}`, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.applyToMesh(sweep);
    sweep.position = origin.add(new Vector3(0, 0.03, 0));

    const mat = new StandardMaterial(`tank_sweep_mat_${Date.now()}`, this.scene);
    mat.diffuseColor = new Color3(0.95, 0.66, 0.22);
    mat.emissiveColor = new Color3(0.78, 0.32, 0.06);
    mat.alpha = 0.46;
    mat.backFaceCulling = false;
    sweep.material = mat;

    const startTime = performance.now();
    const ttlMs = 170;
    const tick = window.setInterval(() => {
      if (sweep.isDisposed()) {
        window.clearInterval(tick);
        return;
      }

      const t = Math.min(1, (performance.now() - startTime) / ttlMs);
      const pulse = 1 + (0.28 * t);
      sweep.scaling.setAll(pulse);
      mat.alpha = Math.max(0, 0.46 * (1 - t));

      if (t >= 1) {
        window.clearInterval(tick);
        sweep.dispose();
        mat.dispose();
      }
    }, 16);
  }

  private resolveTankShieldBash(
    bash: {
      origin: Vector3;
      radius: number;
      damage: number;
      knockback: number;
      stunDuration: number;
    },
    enemies: any[]
  ): void {
    for (const enemy of enemies) {
      const toEnemy = enemy.getPosition().subtract(bash.origin);
      const distance = toEnemy.length();
      if (distance > bash.radius) continue;
      enemy.takeDamage(bash.damage);
      const force = toEnemy.lengthSquared() > 0.0001
        ? toEnemy.normalize().scale(bash.knockback)
        : new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().scale(bash.knockback);
      enemy.applyExternalKnockback(force);
      enemy.applyStun?.(bash.stunDuration);
    }
  }

  private resolveTankUltimate(
    ultimate: {
      position: Vector3;
      radius: number;
      damage: number;
      stunDuration: number;
      knockbackStrength: number;
      tickInterval: number;
      duration: number;
    },
    enemies: any[]
  ): void {
    this.playerController.setTankUltimateActive(true);
    this.tankUltimateState = {
      remaining: ultimate.duration,
      radius: ultimate.radius,
      damage: ultimate.damage,
      stunDuration: ultimate.stunDuration,
      knockbackStrength: ultimate.knockbackStrength,
      tickInterval: ultimate.tickInterval,
      tickTimer: 0,
    };

    // Immediate first hit when ultimate starts.
    this.applyTankUltimatePulse(enemies);
  }

  private applyTankUltimatePulse(enemies: any[]): void {
    if (!this.tankUltimateState) return;

    const center = this.playerController.getPosition();
    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const toEnemy = enemyPos.subtract(center);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      if (distance > this.tankUltimateState.radius) continue;

      enemy.takeDamage(this.tankUltimateState.damage);
      enemy.applyStun?.(this.tankUltimateState.stunDuration);

      const outward = toEnemy.lengthSquared() > 0.0001
        ? toEnemy.normalize()
        : new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      enemy.applyExternalKnockback(outward.scale(this.tankUltimateState.knockbackStrength));
    }
  }

  private resolveRogueStrike(
    strike: {
      origin: Vector3;
      direction: Vector3;
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: any[]
  ): void {
    const dir = strike.direction.lengthSquared() > 0.0001 ? strike.direction.normalize() : new Vector3(1, 0, 0);
    const maxAngle = (strike.coneAngleDeg * Math.PI) / 180;
    let bestEnemy: any = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      const toEnemy = enemy.getPosition().subtract(strike.origin);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      if (distance <= 0.0001 || distance > strike.range) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dir, toEnemy.normalize()))));
      if (angle > maxAngle * 0.5) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnemy = enemy;
      }
    }

    if (!bestEnemy) return;
    bestEnemy.takeDamage(strike.damage);
    const forceDir = bestEnemy.getPosition().subtract(strike.origin);
    if (forceDir.lengthSquared() > 0.0001) {
      bestEnemy.applyExternalKnockback(forceDir.normalize().scale(strike.knockback));
    }
  }

  private resolveRogueDashAttack(
    dash: {
      from: Vector3;
      to: Vector3;
      radius: number;
      damage: number;
      knockback: number;
    },
    enemies: any[]
  ): void {
    const segment = dash.to.subtract(dash.from);
    const segmentLenSq = Math.max(0.0001, segment.lengthSquared());

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const toEnemy = enemyPos.subtract(dash.from);
      const t = Math.max(0, Math.min(1, Vector3.Dot(toEnemy, segment) / segmentLenSq));
      const closestPoint = dash.from.add(segment.scale(t));
      const distanceToPath = Vector3.Distance(enemyPos, closestPoint);
      if (distanceToPath > dash.radius) continue;

      enemy.takeDamage(dash.damage);
      const forceDir = enemyPos.subtract(closestPoint);
      if (forceDir.lengthSquared() > 0.0001) {
        enemy.applyExternalKnockback(forceDir.normalize().scale(dash.knockback));
      }
    }
  }

  private startRogueUltimate(payload: {
    duration: number;
    zoneRadius: number;
    hitDamage: number;
    teleportInterval: number;
    teleportOffset: number;
  }): void {
    this.playerController.setRogueUltimateActive(true);
    this.rogueUltimateState = {
      remaining: payload.duration,
      zoneRadius: payload.zoneRadius,
      hitDamage: payload.hitDamage,
      teleportInterval: payload.teleportInterval,
      teleportOffset: payload.teleportOffset,
      timer: 0,
      targetedEnemyIds: new Set<string>(),
    };
  }

  private updateRogueUltimate(deltaTime: number, enemies: any[]): void {
    if (!this.rogueUltimateState) return;
    if (this.playerController.getClassId() !== 'rogue') {
      this.playerController.setRogueUltimateActive(false);
      this.rogueUltimateState = null;
      return;
    }

    this.rogueUltimateState.remaining -= deltaTime;
    this.rogueUltimateState.timer -= deltaTime;
    if (this.rogueUltimateState.remaining <= 0) {
      this.playerController.setRogueUltimateActive(false);
      this.rogueUltimateState = null;
      return;
    }
    if (this.rogueUltimateState.timer > 0) return;

    const playerPos = this.playerController.getPosition();
    const inZone = enemies.filter((enemy) => Vector3.Distance(enemy.getPosition(), playerPos) <= this.rogueUltimateState!.zoneRadius);
    if (inZone.length === 0) return;

    const untargeted = inZone.filter((enemy) => !this.rogueUltimateState!.targetedEnemyIds.has(enemy.getId()));
    const candidates = untargeted.length > 0 ? untargeted : inZone;
    if (untargeted.length === 0) {
      this.rogueUltimateState.targetedEnemyIds.clear();
    }

    let target = candidates[0];
    let bestDistance = Vector3.Distance(playerPos, target.getPosition());
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const distance = Vector3.Distance(playerPos, candidate.getPosition());
      if (distance < bestDistance) {
        bestDistance = distance;
        target = candidate;
      }
    }

    const targetPos = target.getPosition();
    const toTarget = targetPos.subtract(playerPos);
    toTarget.y = 0;
    const teleportDir = toTarget.lengthSquared() > 0.0001 ? toTarget.normalize() : new Vector3(1, 0, 0);
    const newPlayerPos = targetPos.subtract(teleportDir.scale(this.rogueUltimateState.teleportOffset));
    newPlayerPos.y = 1.0;
    this.playerController.setPosition(newPlayerPos);

    target.takeDamage(this.playerController.computeRogueHitDamage(this.rogueUltimateState.hitDamage));
    this.rogueUltimateState.targetedEnemyIds.add(target.getId());
    this.rogueUltimateState.timer = this.rogueUltimateState.teleportInterval;
  }

  private updateTankUltimate(deltaTime: number, enemies: any[]): void {
    if (!this.tankUltimateState) return;
    if (this.playerController.getClassId() !== 'firewall') {
      this.playerController.setTankUltimateActive(false);
      this.tankUltimateState = null;
      return;
    }

    this.tankUltimateState.tickTimer -= deltaTime;
    if (this.tankUltimateState.tickTimer <= 0) {
      this.applyTankUltimatePulse(enemies);
      this.tankUltimateState.tickTimer = this.tankUltimateState.tickInterval;
    }

    this.tankUltimateState.remaining -= deltaTime;
    if (this.tankUltimateState.remaining <= 0) {
      this.playerController.setTankUltimateActive(false);
      this.playerController.animationController.playUltimateEnd();
      this.tankUltimateState = null;
    }
  }

  private async startNewGame(): Promise<void> {
    if (this.gameplayStartInProgress) return;
    this.gameplayStartInProgress = true;
    try {
      this.setLoadingOverlay(true, 'INITIALIZING RUN...', '0%');
      await this.waitForNextPaint(2);

      if (!this.gameplayInitialized) {
        await this.initializeGameplayScene();
      }

      this.setLoadingOverlay(true, 'PRELOADING DUNGEON CELLS...', '78%');
      await this.waitForNextPaint(1);

      this.currentRoomIndex = 0;
      this.roomCleared = false;
      this.rogueUltimateState = null;
      this.tankUltimateState = null;
      this.bonusPool.resetRun();
      this.currentBonusChoices = [];
      this.currency = 0;
      this.currencyCarry = 0;
      this.roomElapsedSeconds = 0;
      this.resetPlayerVoidFallState();
      this.consumableDamageStims = 0;
      this.consumableShieldPatches = 0;
      this.playerController.setRogueUltimateActive(false);
      this.playerController.setTankUltimateActive(false);
      this.hudManager.hideOverlays();
      this.hudManager.updateCurrency(this.currency);
      this.hudManager.updateItemStatus(this.getConsumableStatusLabel());
      this.gameState = 'transition';
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false);
      this.loadRoomByIndex(this.currentRoomIndex);
      this.setLoadingOverlay(true, 'HANDSHAKE WITH DAEMON CORE...', '100%');
      await this.waitForNextPaint(1);
      await this.waitForMs(1000);
      this.gameState = 'playing';
      this.setLoadingOverlay(false);
    } finally {
      this.setLoadingOverlay(false);
      this.gameplayStartInProgress = false;
    }
  }

  private loadNextRoom(): void {
    if (!this.gameplayInitialized) return;
    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    this.roomCleared = false;
    this.hudManager.hideOverlays();
    this.startRoomTransition(nextIndex);
  }

  private loadIsolatedRoom(roomId: string): void {
    if (!this.gameplayInitialized) return;
    this.cameraMove = null;
    this.roomOrder = [roomId];
    this.currentRoomIndex = 0;
    this.roomCleared = false;
    this.roomElapsedSeconds = 0;
    this.resetPlayerVoidFallState();
    this.rogueUltimateState = null;
    this.tankUltimateState = null;
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);
    this.hudManager.hideOverlays();
    this.gameState = 'playing';
    this.preloadRoomsAround(0, 0, true);
    this.loadRoomByIndex(0);
  }

  private loadRoomByIndex(index: number): void {
    if (!this.gameplayInitialized) return;
    const roomId = this.roomOrder[index];
    const instanceKey = `${roomId}::${index}`;
    this.roomManager.setCurrentRoom(instanceKey);
    this.roomManager.setDoorActive(false);
    this.roomCleared = false;
    this.roomElapsedSeconds = 0;
    this.resetPlayerVoidFallState();
    this.rogueUltimateState = null;
    this.tankUltimateState = null;
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);

    const roomBounds = this.roomManager.getRoomBounds();
    if (roomBounds) {
      const centerX = (roomBounds.minX + roomBounds.maxX) / 2;
      const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2;
      const camera = (this.scene as any).mainCamera ?? this.scene.activeCamera;
      if (camera && camera instanceof ArcRotateCamera) {
        const newTarget = new Vector3(centerX, 0.5, centerZ);
        camera.setTarget(newTarget);
        camera.alpha = this.cameraAlpha;
        camera.beta = this.cameraBeta;
        camera.radius = this.cameraRadius;
      }
    }

    const spawnPoint = this.roomManager.getPlayerSpawnPoint(roomId) || Vector3.Zero();
    this.playerController.setPosition(spawnPoint);
    this.playerController.healToFull();
    this.playerController.resetFocusFire();

    this.projectileManager.dispose();
    this.ultimateManager.dispose();

    this.enemySpawner.dispose();
    this.enemySpawner.setDifficultyLevel(index);
    this.enemySpawner.spawnEnemiesForRoom(roomId);

    if (this.tilesEnabled) {
      const currentFloorKey = `${roomId}::${index}`;
      this.tileFloorManager.setCurrentRoomInstance(currentFloorKey);
      if (!this.tileFloorManager.hasRoomInstance(currentFloorKey)) {
        this.loadTilesForRoom(roomId);
      }
    }

    const currentRoomConfig = this.roomManager.getCurrentRoom();
    this.eventBus.emit(GameEvents.ROOM_ENTERED, {
      roomId,
      roomName: currentRoomConfig?.name ?? roomId,
      roomType: currentRoomConfig?.roomType ?? 'normal',
    });
  }

  private preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean = false,
    options?: {
      backwardRange?: number;
      forwardRange?: number;
      allowUnload?: boolean;
    }
  ): void {
    if (!this.gameplayInitialized) return;
    const backwardRange = Math.max(0, options?.backwardRange ?? 1);
    const forwardRange = Math.max(0, options?.forwardRange ?? 2);
    const allowUnload = options?.allowUnload ?? true;

    if (forceRebuild) {
      this.roomManager.clearAllRooms();
      if (this.tilesEnabled) {
        this.tileFloorManager.clearAllRoomInstances();
      }
    }

    const indices: number[] = [];
    for (let idx = preloadIndex - backwardRange; idx <= preloadIndex + forwardRange; idx++) {
      indices.push(idx);
    }

    const desiredKeys = new Set<string>();
    for (const idx of indices) {
      if (idx < 0 || idx >= this.roomOrder.length) continue;
      const roomId = this.roomOrder[idx];
      const origin = new Vector3(0, 0, idx * this.roomSpacing);
      const instanceKey = `${roomId}::${idx}`;
      desiredKeys.add(instanceKey);
      if (!this.roomManager.hasRoomInstance(instanceKey)) {
        this.roomManager.setRenderProfile(this.getRenderProfileForRoom(roomId));
        this.roomManager.loadRoomInstance(roomId, instanceKey, origin);
      }
      if (this.tilesEnabled) {
        this.preloadTileFloorInstance(roomId, instanceKey, origin);
      }
    }

    if (allowUnload) {
      for (const loadedKey of this.roomManager.getLoadedRoomKeys()) {
        if (!desiredKeys.has(loadedKey)) {
          this.roomManager.unloadRoomInstance(loadedKey);
        }
      }
      if (this.tilesEnabled) {
        for (const loadedFloorKey of this.tileFloorManager.getLoadedRoomKeys()) {
          if (!desiredKeys.has(loadedFloorKey)) {
            this.tileFloorManager.unloadRoomFloorInstance(loadedFloorKey);
          }
        }
      }
    }
    const currentRoomId = this.roomOrder[activeIndex];
    const currentKey = `${currentRoomId}::${activeIndex}`;
    this.roomManager.setCurrentRoom(currentKey);
    if (this.tilesEnabled) {
      this.tileFloorManager.setCurrentRoomInstance(currentKey);
    }

    const bounds = this.roomManager.getRoomBoundsForInstance(currentKey);
    if (bounds) {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerZ = (bounds.minZ + bounds.maxZ) / 2;
      const camera = (this.scene as any).mainCamera ?? this.scene.activeCamera;
      if (camera && camera instanceof ArcRotateCamera) {
        const newTarget = new Vector3(centerX, 0.5, centerZ);
        camera.setTarget(newTarget);
        camera.alpha = this.cameraAlpha;
        camera.beta = this.cameraBeta;
        camera.radius = this.cameraRadius;
      }
    }
  }

  private startRoomTransition(nextIndex: number): void {
    if (!this.gameplayInitialized) return;
    this.hudManager.hideOverlays();
    this.gameState = 'transition';

    this.preloadRoomsAround(nextIndex, this.currentRoomIndex, false, {
      backwardRange: 2,
      forwardRange: 2,
      allowUnload: false,
    });

    const nextRoomId = this.roomOrder[nextIndex];
    const nextKey = `${nextRoomId}::${nextIndex}`;
    const roomBounds = this.roomManager.getRoomBoundsForInstance(nextKey);
    if (!roomBounds) {
      this.currentRoomIndex = nextIndex;
      this.loadRoomByIndex(nextIndex);
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: 2,
        allowUnload: true,
      });
      this.gameState = 'playing';
      return;
    }

    const target = new Vector3(
      (roomBounds.minX + roomBounds.maxX) / 2,
      0.5,
      (roomBounds.minZ + roomBounds.maxZ) / 2
    );

    const camera = (this.scene as any).mainCamera ?? this.scene.activeCamera;
    if (camera && camera instanceof ArcRotateCamera) {
      this.cameraMove = {
        from: camera.getTarget().clone(),
        to: target,
        t: 0,
        duration: 0.6,
        nextIndex,
      };
    } else {
      this.currentRoomIndex = nextIndex;
      this.loadRoomByIndex(nextIndex);
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: 2,
        allowUnload: true,
      });
      this.gameState = 'playing';
    }
  }

  private getBonusChoices(): BonusChoice[] {
    return this.bonusPool.rollChoices(this.selectedClassId, this.bonusPool.getOfferCount());
  }

  private applyBonus(bonusId: string): void {
    switch (bonusId) {
      case 'bonus_hp':
        this.playerController.applyMaxHpMultiplier(1.1);
        break;
      case 'bonus_ms':
        this.playerController.applyMoveSpeedMultiplier(1.1);
        break;
      case 'bonus_poison':
        this.playerController.enablePoisonBonus(0.2, 2.0);
        break;
      case 'bonus_fire_rate':
        this.playerController.applyFireRateMultiplier(1.12);
        break;
      case 'meta_offer_slot':
      case 'meta_bounty_index':
      case 'meta_background_miner':
      case 'meta_lucky_compile':
        // Meta bonuses are handled dynamically by BonusPoolSystem getters.
        break;
      default:
        // Placeholder class-dependent bonuses are intentionally no-op for now.
        break;
    }
  }

  private computeEnemyKillReward(enemyType?: string): number {
    const enemies = this.configLoader.getEnemies() ?? {};
    const enemyConfig = typeof enemyType === 'string' ? enemies[enemyType] : null;
    const hp = Number(enemyConfig?.baseStats?.hp ?? 40);
    const damage = Number(enemyConfig?.baseStats?.damage ?? 8);
    const speed = Number(enemyConfig?.baseStats?.speed ?? 2.5);
    const cooldown = Number(enemyConfig?.baseStats?.attackCooldown ?? 1.0);

    const threatScore = (hp * 0.05) + (damage * 0.18) + (speed * 1.2) + (1 / Math.max(0.2, cooldown));
    const baseReward = Math.max(1, Math.round(2 + threatScore));

    const decayMultiplier = Math.max(0.35, 1.25 - (this.roomElapsedSeconds * 0.015));
    const economyMultiplier = this.bonusPool.getCurrencyMultiplier();
    return Math.max(1, Math.floor(baseReward * decayMultiplier * economyMultiplier));
  }

  private addCurrency(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.currency += Math.floor(amount);
    this.hudManager.updateCurrency(this.currency);
  }

  private addCurrencyFraction(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.currencyCarry += amount;
    const gained = Math.floor(this.currencyCarry);
    if (gained <= 0) return;
    this.currencyCarry -= gained;
    this.addCurrency(gained);
  }

  private applyPassiveIncome(deltaTime: number): void {
    const passiveIncome = this.bonusPool.getPassiveIncomePerSecond();
    if (passiveIncome <= 0) return;
    this.addCurrencyFraction(passiveIncome * deltaTime);
  }

  private trySpendCurrency(cost: number): boolean {
    const safeCost = Math.max(0, Math.floor(cost));
    if (this.currency < safeCost) return false;
    this.currency -= safeCost;
    this.hudManager.updateCurrency(this.currency);
    return true;
  }

  private tryRerollBonusChoices(cost: number): void {
    const safeCost = Math.max(0, Math.floor(cost));
    if (!this.trySpendCurrency(safeCost)) {
      this.hudManager.showBonusChoices(this.currentBonusChoices, this.currency, this.bonusRerollCost);
      return;
    }
    this.currentBonusChoices = this.getBonusChoices();
    this.hudManager.showBonusChoices(this.currentBonusChoices, this.currency, this.bonusRerollCost);
  }

  private updateConsumablesFromInput(): void {
    if (this.inputManager.isKeyPressedThisFrame('1') && this.consumableDamageStims > 0) {
      this.consumableDamageStims -= 1;
      this.playerController.activateDamageBoost(1.7, 5.0);
    }
    if (this.inputManager.isKeyPressedThisFrame('2') && this.consumableShieldPatches > 0) {
      this.consumableShieldPatches -= 1;
      this.playerController.activateDamageReduction(0.5, 5.0);
    }
  }

  private getConsumableStatusLabel(): string {
    const damage = this.playerController.getDamageBoostState();
    const shield = this.playerController.getDamageReductionState();

    const charges = `DMGx${this.consumableDamageStims} SHDx${this.consumableShieldPatches}`;
    const active: string[] = [];
    if (damage.active) active.push(`DMG ${damage.remaining.toFixed(1)}s`);
    if (shield.active) active.push(`SHD ${shield.remaining.toFixed(1)}s`);

    if (active.length === 0) return charges;
    return `${charges} | ${active.join(' | ')}`;
  }

  getScene(): Scene {
    return this.scene;
  }

  getEngine(): Engine {
    return this.engine;
  }

  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  getPlayerController(): PlayerController {
    return this.playerController;
  }

  getEnemySpawner(): EnemySpawner {
    return this.enemySpawner;
  }

  getProjectileManager(): ProjectileManager {
    return this.projectileManager;
  }

  private resetPlayerVoidFallState(): void {
    this.playerVoidFallState = null;
    this.playerVoidFxTimer = 0;
    if (this.playerController) {
      this.playerController.setExternalVerticalOffset(0);
      this.playerController.setRenderVisibility(1);
    }
  }

  private detectAndStartPlayerVoidFall(): void {
    if (this.playerVoidFallState) return;
    const pos = this.playerController.getPosition();
    const tileType = this.roomManager.getTileTypeAtWorld(pos.x, pos.z);
    if (tileType !== 'void') return;

    const currentRoomId = this.roomOrder[this.currentRoomIndex] ?? this.roomManager.getCurrentRoom()?.id;
    const respawn = this.roomManager.getPlayerSpawnPoint(currentRoomId) ?? pos.clone();

    this.playerVoidFallState = {
      timer: this.playerVoidFallDuration,
      duration: this.playerVoidFallDuration,
      respawn,
    };
    this.playerVoidFxTimer = 0;
    this.spawnPlayerVoidBurst(pos, 10);
  }

  private updatePlayerVoidFall(deltaTime: number): boolean {
    if (!this.playerVoidFallState) return false;

    this.playerVoidFallState.timer = Math.max(0, this.playerVoidFallState.timer - deltaTime);
    const progress = 1 - (this.playerVoidFallState.timer / Math.max(0.0001, this.playerVoidFallState.duration));
    const eased = Math.pow(progress, 2.45);
    this.playerController.setExternalVerticalOffset(-7.2 * eased);
    this.playerController.setRenderVisibility(Math.max(0.02, 1 - eased * 0.98));

    this.playerVoidFxTimer -= deltaTime;
    if (this.playerVoidFxTimer <= 0) {
      this.playerVoidFxTimer = 0.05;
      const p = this.playerController.getPosition();
      this.spawnPlayerVoidBurst(p.add(new Vector3(0, -3.4 * eased, 0)), 5);
    }

    if (this.playerVoidFallState.timer <= 0) {
      this.playerController.setExternalVerticalOffset(0);
      this.playerController.setRenderVisibility(1);
      this.eventBus.emit(GameEvents.PLAYER_DIED, { reason: 'void_fall' });
      this.playerVoidFallState = null;
      this.playerVoidFxTimer = 0;
    }

    return true;
  }

  private spawnPlayerVoidBurst(origin: Vector3, count: number): void {
    const particleCount = Math.max(1, Math.floor(count));
    for (let i = 0; i < particleCount; i++) {
      const shard = MeshBuilder.CreateBox(`void_player_shard_${Date.now()}_${i}`, {
        size: 0.08 + Math.random() * 0.07,
      }, this.scene);
      shard.position = origin.add(new Vector3(
        (Math.random() - 0.5) * 0.55,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.55,
      ));

      const mat = new StandardMaterial(`void_player_shard_mat_${Date.now()}_${i}`, this.scene);
      mat.diffuseColor = new Color3(0.1, 0.92, 0.7);
      mat.emissiveColor = new Color3(0.05, 0.62, 0.42);
      mat.alpha = 0.9;
      shard.material = mat;

      const velocity = new Vector3(
        (Math.random() - 0.5) * 2.4,
        0.5 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.4,
      );
      const gravity = 6.8;
      const bornAt = Date.now();
      const ttlMs = 260 + Math.random() * 200;

      const tick = window.setInterval(() => {
        if (shard.isDisposed()) {
          window.clearInterval(tick);
          return;
        }

        const elapsed = Date.now() - bornAt;
        const t = Math.min(1, elapsed / ttlMs);
        const dt = 1 / 60;
        velocity.y -= gravity * dt;
        shard.position.addInPlace(velocity.scale(dt));
        shard.scaling.scaleInPlace(0.95);
        mat.alpha = Math.max(0, 0.9 * (1 - t));

        if (t >= 1) {
          window.clearInterval(tick);
          shard.dispose();
          mat.dispose();
        }
      }, 16);
    }
  }

  private async loadTilesForRoom(roomId: string): Promise<void> {
    const profile = this.getRenderProfileForRoom(roomId);

    const layout = this.getOrBuildRoomLayout(roomId);
    if (!layout) {
      console.warn(`Room ${roomId} has no layout array`);
      return;
    }

    const activeKey = `${roomId}::${this.currentRoomIndex}`;
    const origin = this.roomManager.getCurrentRoomOrigin();
    this.tileFloorManager.loadRoomFloorInstance(activeKey, layout, origin, profile);
    this.tileFloorManager.setCurrentRoomInstance(activeKey);
    console.log(`✓ Tiles loaded for room ${roomId} (${layout.layout.length} rows)`);
  }

  private preloadTileFloorInstance(roomId: string, instanceKey: string, origin: Vector3): void {
    const layout = this.getOrBuildRoomLayout(roomId);
    if (!layout) return;
    const profile = this.getRenderProfileForRoom(roomId);
    this.tileFloorManager.loadRoomFloorInstance(instanceKey, layout, origin, profile);
  }

  private buildRoomLayoutForTiles(room: any): RoomLayout | null {
    if (!room?.layout || !Array.isArray(room.layout)) return null;

    const layoutWidth = room.layout.reduce((max: number, row: any) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      return Math.max(max, rowData.length);
    }, 0);

    const layoutHeight = room.layout.length;
    const shouldTreatVoidAsWall = layoutWidth <= 16 && layoutHeight <= 12;

    const normalizedLayout = room.layout.map((row: any) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      const padded = rowData.padEnd(layoutWidth, '#').replace(/O/g, '#');
      return shouldTreatVoidAsWall ? padded.replace(/V/g, '#') : padded;
    });

    const obstacles = Array.isArray(room.obstacles)
      ? room.obstacles.flatMap((ob: any) => {
          if (ob.type === 'hazard') return [];
          const obstacleZ = Number.isFinite(ob?.y)
            ? ob.y
            : (Number.isFinite(ob?.z) ? ob.z : undefined);
          if (!Number.isFinite(ob?.x) || !Number.isFinite(obstacleZ)) return [];
          const width = Math.max(1, ob.width || 1);
          const height = Math.max(1, ob.height || 1);
          const tiles = [] as Array<{ x: number; z: number; type: string }>;
          for (let dx = 0; dx < width; dx++) {
            for (let dz = 0; dz < height; dz++) {
              tiles.push({ x: ob.x + dx, z: obstacleZ + dz, type: 'wall' });
            }
          }
          return tiles;
        })
      : [];

    return {
      layout: normalizedLayout,
      obstacles,
    };
  }

  private shouldIncludeInRunOrder(room: any): boolean {
    if (!room?.id || !Array.isArray(room.layout)) return false;

    const layoutWidth = room.layout.reduce((max: number, row: any) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      return Math.max(max, rowData.length);
    }, 0);
    const layoutHeight = room.layout.length;
    const tileBudget = layoutWidth * layoutHeight;

    // Keep oversized test/stress rooms available for isolated loading, but out of normal wave loop.
    if (/^room_test_/i.test(room.id) && tileBudget > 220) {
      return false;
    }

    return true;
  }

  private getOrBuildRoomLayout(roomId: string): RoomLayout | null {
    const cached = this.roomLayoutCache.get(roomId);
    if (cached) return cached;

    const room = this.configLoader.getRoom(roomId);
    if (!room) {
      console.warn(`Room ${roomId} not found in config`);
      return null;
    }

    const layout = this.buildRoomLayoutForTiles(room);
    if (layout) {
      this.roomLayoutCache.set(roomId, layout);
    }
    return layout;
  }

  private setLoadingOverlay(visible: boolean, label?: string, progress?: string): void {
    const loading = document.getElementById('loading');
    if (!loading) return;
    loading.classList.toggle('hidden', !visible);

    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
    if (canvas) {
      canvas.style.visibility = visible ? 'hidden' : 'visible';
    }

    if (label) {
      const labelEl = document.getElementById('loadingLabel');
      if (labelEl) {
        labelEl.textContent = label;
      } else {
        const title = loading.querySelector('p');
        if (title) title.textContent = label;
      }
    }

    if (progress) {
      const progressEl = document.getElementById('loadingProgress');
      if (progressEl) progressEl.textContent = progress;

      const fillEl = document.getElementById('loadingBarFill');
      if (fillEl) {
        const numeric = Number.parseInt(progress.replace('%', ''), 10);
        if (Number.isFinite(numeric)) {
          const clamped = Math.max(0, Math.min(100, numeric));
          (fillEl as HTMLDivElement).style.width = `${clamped}%`;
        }
      }
    }
  }

  private async prewarmAllProceduralLayoutsAsync(showOverlay: boolean): Promise<void> {
    if (!this.gameplayInitialized) return;
    if (this.textureRenderMode !== 'proceduralRelief') return;
    if (this.proceduralWarmCacheReady) {
      if (showOverlay) {
        this.setLoadingOverlay(true, 'OPTIMIZING DUNGEON...', '100%');
        await this.waitForNextPaint(1);
        this.setLoadingOverlay(false);
      }
      return;
    }
    if (this.proceduralPrewarmPromise) {
      await this.proceduralPrewarmPromise;
      return;
    }

    const roomIds = this.roomOrder.length > 0
      ? this.roomOrder
      : Array.from(this.roomLayoutCache.keys());

    this.proceduralPrewarmPromise = (async () => {
      if (showOverlay) {
        this.setLoadingOverlay(true, 'OPTIMIZING DUNGEON...', '0%');
      }

      try {
        const total = Math.max(1, roomIds.length);
        for (let i = 0; i < roomIds.length; i++) {
          const roomId = roomIds[i];
          const layout = this.getOrBuildRoomLayout(roomId);
          if (layout) {
            this.tileFloorManager.prewarmRoomLayout(layout);
          }

          if (showOverlay) {
            const pct = Math.floor(((i + 1) / total) * 100);
            this.setLoadingOverlay(true, 'OPTIMIZING DUNGEON...', `${pct}%`);
          }

          // Yield to the browser between rooms to avoid long main-thread stalls.
          await this.waitForNextPaint(1);
        }
        this.proceduralWarmCacheReady = true;
      } finally {
        this.pendingProceduralPrewarmRoomIds = [];
        if (this.proceduralPrewarmTimer !== null) {
          window.clearTimeout(this.proceduralPrewarmTimer);
          this.proceduralPrewarmTimer = null;
        }
        if (showOverlay) {
          this.setLoadingOverlay(false);
        }
        this.proceduralPrewarmPromise = null;
      }
    })();

    await this.proceduralPrewarmPromise;
  }

  private runProceduralPrewarmQueue(): void {
    // Keep compatibility with existing callers.
    void this.prewarmAllProceduralLayoutsAsync(false);
  }

  private loadTilesForLayout(layout: RoomLayout, origin: Vector3): void {
    const profile = this.getRenderProfileForRoom('');
    this.tileFloorManager.loadRoomFloor(layout, origin, profile);
  }

  private getRenderProfileForRoom(roomId: string): 'classic' | 'neoDungeonTest' | 'proceduralRelief' {
    if (this.textureRenderMode === 'proceduralRelief') {
      return 'proceduralRelief';
    }
    return ProceduralDungeonTheme.isNeoTestRoom(roomId) ? 'neoDungeonTest' : 'classic';
  }

  public getTextureRenderMode(): TextureRenderMode {
    return this.textureRenderMode;
  }

  public getProceduralQuality(): ProceduralReliefQuality {
    return ProceduralReliefTheme.getQuality();
  }

  public setProceduralQuality(quality: ProceduralReliefQuality): void {
    ProceduralReliefTheme.setQuality(quality);
    this.proceduralWarmCacheReady = false;
    if (!this.gameplayInitialized || this.textureRenderMode !== 'proceduralRelief') return;

    const rooms = this.configLoader.getRooms();
    if (Array.isArray(rooms)) {
      void this.prewarmAllProceduralLayoutsAsync(false);
    }

    const currentRoomId = this.roomOrder[this.currentRoomIndex] ?? '';
    if (currentRoomId) {
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
      if (this.tilesEnabled) {
        this.loadTilesForRoom(currentRoomId);
      }
    }
  }

  public setTextureRenderMode(mode: TextureRenderMode): void {
    if (this.textureRenderMode === mode) return;
    this.textureRenderMode = mode;

    if (!this.gameplayInitialized) return;

    if (mode === 'proceduralRelief') {
      ProceduralReliefTheme.setQuality('medium');
      this.proceduralWarmCacheReady = false;
      ProceduralReliefTheme.prewarm(this.scene);
      void this.prewarmAllProceduralLayoutsAsync(false);
    } else {
      this.proceduralWarmCacheReady = false;
      this.pendingProceduralPrewarmRoomIds = [];
      if (this.proceduralPrewarmTimer !== null) {
        window.clearTimeout(this.proceduralPrewarmTimer);
        this.proceduralPrewarmTimer = null;
      }
    }

    const currentRoomId = this.roomOrder[this.currentRoomIndex] ?? '';
    const profile = this.getRenderProfileForRoom(currentRoomId);
    this.tileFloorManager.setRenderProfile(profile);
    this.roomManager.setRenderProfile(profile);

    if (currentRoomId) {
      // Refresh current/preloaded room geometry so walls and pillars switch materials immediately.
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
      if (this.tilesEnabled) {
        this.loadTilesForRoom(currentRoomId);
      }
    }
  }

  public loadRoomFromTileMappingJson(jsonPayload: string): void {
    if (!this.gameplayInitialized) return;

    let mapping: TileMappingLayout | null = null;
    try {
      mapping = JSON.parse(jsonPayload) as TileMappingLayout;
    } catch (error) {
      console.warn('Invalid JSON payload for tile mapping', error);
      return;
    }

    if (!mapping || !Array.isArray(mapping.tiles) || !Number.isFinite(mapping.width) || !Number.isFinite(mapping.height)) {
      console.warn('Tile mapping JSON missing width/height/tiles');
      return;
    }

    const layout = RoomLayoutParser.fromTileMapping(mapping);
    const roomId = `room_custom_${Date.now()}`;

    const obstacles = (layout.obstacles ?? []).map(ob => ({
      x: ob.x,
      y: ob.z,
      width: 1,
      height: 1,
      type: ob.type ?? 'pillar',
    }));

    const fallbackSpawn = this.findFirstFloorSpawn(layout.layout) ?? { x: 1, y: 1 };
    const roomConfig = {
      id: roomId,
      name: 'Custom Tile Room',
      roomType: 'normal',
      layout: layout.layout as string[],
      spawnPoints: [],
      playerSpawnPoint: fallbackSpawn,
      obstacles,
    };

    this.cameraMove = null;
    this.roomOrder = [roomId];
    this.currentRoomIndex = 0;
    this.roomCleared = true;
    this.roomElapsedSeconds = 0;
    this.hudManager.hideOverlays();
    this.gameState = 'playing';

    this.roomManager.clearAllRooms();
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.roomManager.setRenderProfile(this.getRenderProfileForRoom(roomId));
    const origin = new Vector3(0, 0, 0);
    const instanceKey = `${roomId}::0`;
    this.roomManager.loadRoomFromConfig(roomConfig, instanceKey, origin, true);
    this.roomManager.setDoorActive(false);

    const spawnPoint = this.roomManager.getPlayerSpawnPoint(roomId) || Vector3.Zero();
    this.playerController.setPosition(spawnPoint);
    this.playerController.healToFull();
    this.playerController.resetFocusFire();

    this.projectileManager.dispose();
    this.ultimateManager.dispose();
    this.enemySpawner.dispose();

    if (this.tilesEnabled) {
      this.loadTilesForLayout(layout, origin);
    }

    this.eventBus.emit(GameEvents.ROOM_ENTERED, {
      roomId,
      roomName: roomConfig.name,
      roomType: roomConfig.roomType ?? 'normal',
    });
  }

  private findFirstFloorSpawn(layout: Array<string | string[]>): { x: number; y: number } | null {
    for (let z = 0; z < layout.length; z++) {
      const row = layout[z];
      const rowData = typeof row === 'string' ? row : row.join('');
      for (let x = 0; x < rowData.length; x++) {
        const cell = rowData[x];
        if (cell !== '#' && cell !== 'V') {
          return { x, y: z };
        }
      }
    }
    return null;
  }

  public canMoveToTile(x: number, z: number): boolean {
    return this.tileFloorManager.isWalkable(x, z);
  }

  public getTileAt(x: number, z: number) {
    return this.tileFloorManager.getTileAt(x, z);
  }

  public getTileStatistics() {
    return this.tileFloorManager.getStatistics();
  }

  public getHUDManager(): HUDManager {
    return this.hudManager;
  }

  public isUsingTiles(): boolean {
    return this.tilesEnabled;
  }

  public setTilesEnabled(enabled: boolean): void {
    if (this.tilesEnabled === enabled) return;
    this.tilesEnabled = enabled;
    this.roomManager.setFloorRenderingEnabled(!enabled);

    if (!this.gameplayInitialized) {
      if (!enabled) {
        this.tileFloorManager.clearAllRoomInstances();
      }
      return;
    }

    if (!enabled) {
      this.tileFloorManager.clearAllRoomInstances();
    }

    // Rebuild current/preloaded room geometry so floor/walls always match tile mode.
    this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
    const currentRoomId = this.roomOrder[this.currentRoomIndex];
    if (enabled && currentRoomId) {
      void this.loadTilesForRoom(currentRoomId);
    }
  }

  // Camera parameters for dev console
  public getCameraAlpha(): number {
    return this.cameraAlpha;
  }

  public getCameraBeta(): number {
    return this.cameraBeta;
  }

  public getCameraRadius(): number {
    return this.cameraRadius;
  }

  public setCameraAlpha(alpha: number): void {
    this.cameraAlpha = alpha;
    const camera = (this.scene as any).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.alpha = alpha;
    }
  }

  public setCameraBeta(beta: number): void {
    this.cameraBeta = beta;
    const camera = (this.scene as any).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.beta = beta;
    }
  }

  public setCameraRadius(radius: number): void {
    this.cameraRadius = radius;
    const camera = (this.scene as any).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.radius = radius;
    }
  }

  // Player and enemy height controls
  public setPlayerHeightOffset(offset: number): void {
    if (this.playerController?.animationController) {
      this.playerController.animationController.setHeightOffset(offset);
    }
  }

  public getPlayerHeightOffset(): number {
    if (this.playerController?.animationController) {
      return this.playerController.animationController.getHeightOffset();
    }
    return 0;
  }

  public setEnemyHeightOffset(offset: number): void {
    EnemyController.setGlobalHeightOffset(offset);
    // Update existing enemies (mesh is now public)
    const enemies = this.enemySpawner?.getEnemies() || [];
    for (const enemy of enemies) {
      if (enemy.mesh) {
        enemy.mesh.position.y = 1.0 + offset;
      }
    }
  }

  public getEnemyHeightOffset(): number {
    return EnemyController.getGlobalHeightOffset();
  }

  // Walls visibility control
  public setWallsVisible(visible: boolean): void {
    this.roomManager.setWallsVisible(visible);
  }

  public areWallsVisible(): boolean {
    return this.roomManager.areWallsVisible();
  }
}
