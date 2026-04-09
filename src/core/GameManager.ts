/**
 * GameManager - Central orchestrator for the entire game
 * Manages game state, systems, and core loops
 */

import { Scene, Engine, Vector3, ArcRotateCamera } from '@babylonjs/core';
import { SceneBootstrap } from '../scene/SceneBootstrap';
import { StateMachine, GameState } from './StateMachine';
import { EventBus, GameEvents } from './EventBus';
import {
  AttackPerformedPayload,
  BonusRerollRequestedPayload,
  BonusSelectedPayload,
  DevRoomLoadRequestedPayload,
  DevTileLoadRequestedPayload,
  EnemyDiedPayload,
  EnemySpawnedPayload,
  GameEventBindings,
  GameStartRequestedPayload,
} from './GameEventBindings';
import { RunEconomyManager } from './RunEconomyManager';
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
import { RoomTransitionManager } from '../systems/RoomTransitionManager';
import { BonusSystemManager } from '../systems/BonusSystemManager';
import { GameEventCoordinator } from '../systems/GameEventCoordinator';
import { UltimateSystemManager } from '../systems/UltimateSystemManager';
import type { RoomConfig as LoadedRoomConfig } from '../types/config';
import { ClassSelectScene } from '../scene/ClassSelectScene';
import { MainMenuScene } from '../scene/MainMenuScene';
import { CodexScene } from '../scene/CodexScene';
import { BootSequenceScene } from '../scene/BootSequenceScene';
import { AchievementDefinition, CodexService } from '../services/CodexService';
import { getMergedAchievementDefinitions } from '../data/achievements/loadAchievementDefinitions';
import { GameSettingsStore } from '../settings/GameSettings';
import { GameCombatActionManager } from './GameCombatActionManager';
import { GameRuntimeOrchestrator, type GameRuntimeFrameContext } from './GameRuntimeOrchestrator';
import { GameWorldCollisionHazardManager } from './GameWorldCollisionHazardManager';
import { GamePlayerVoidRecoveryManager } from './GamePlayerVoidRecoveryManager';
import { GameRoomStreamingManager, type RoomPreloadOptions } from './GameRoomStreamingManager';
import { GameDaemonTestManager } from './GameDaemonTestManager';
import { GameEconomyFlowManager } from './GameEconomyFlowManager';

type TextureRenderMode = 'classic' | 'proceduralRelief';
type RuntimeGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';
type SceneWithMainCamera = Scene & { mainCamera?: ArcRotateCamera };
type AchievementSourceEntry = {
  name?: string;
  description?: string;
  type?: string;
  target?: number;
};

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
  private roomTransitionManager: RoomTransitionManager;
  private bonusSystemManager: BonusSystemManager;
  private eventCoordinator: GameEventCoordinator;
  private ultimateSystemManager: UltimateSystemManager;
  private combatActionManager: GameCombatActionManager | null = null;
  private worldCollisionHazardManager: GameWorldCollisionHazardManager | null = null;
  private playerVoidRecoveryManager: GamePlayerVoidRecoveryManager | null = null;
  private roomStreamingManager: GameRoomStreamingManager | null = null;
  private daemonTestManager: GameDaemonTestManager | null = null;
  private economyFlowManager: GameEconomyFlowManager | null = null;
  private readonly runtimeOrchestrator = new GameRuntimeOrchestrator();
  
  private isRunning: boolean = false;
  private gameplayInitialized: boolean = false;
  private gameplayStartInProgress: boolean = false;
  private eventListenersBound: boolean = false;
  private eventBusUnsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private selectedClassId: 'mage' | 'firewall' | 'rogue' = 'mage';
  private tilesEnabled: boolean = true;
  private textureRenderMode: TextureRenderMode = 'proceduralRelief';
  private roomLayoutCache: Map<string, RoomLayout> = new Map();
  private proceduralPrewarmPromise: Promise<void> | null = null;
  private proceduralWarmCacheReady: boolean = false;
  private pendingProceduralPrewarmRoomIds: string[] = [];
  private proceduralPrewarmTimer: number | null = null;
  private gameState: RuntimeGameState = 'menu';
  private roomOrder: string[] = [];
  private currentRoomIndex: number = 0;
  private roomCleared: boolean = false;
  private roomSpacing: number = 17; // Increased from 14 to match larger tile size (1.2)
  private cameraMove: { from: Vector3; to: Vector3; t: number; duration: number; nextIndex: number } | null = null;
  private cameraAlpha: number = 0;
  private cameraBeta: number = 0;
  private cameraRadius: number = 0;
  private readonly runEconomy = new RunEconomyManager();
  private roomElapsedSeconds: number = 0;

  private constructor() {
    this.stateMachine = new StateMachine();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.codexService = new CodexService();
    this.eventCoordinator = new GameEventCoordinator(this.eventBus);
    this.ultimateSystemManager = new UltimateSystemManager({
      getPlayerController: () => this.playerController,
      onTankZoneStarted: (radius) => this.combatActionManager?.ensureTankUltimateZoneVisual(radius),
      onTankZoneUpdated: (deltaTime) => this.combatActionManager?.updateTankUltimateZoneVisual(deltaTime),
      onTankZoneDisposed: () => this.combatActionManager?.disposeTankUltimateZoneVisual(),
    });
    this.roomTransitionManager = new RoomTransitionManager({
      isGameplayInitialized: () => this.gameplayInitialized,
      getRoomOrder: () => this.roomOrder,
      setRoomOrder: (roomOrder) => {
        this.roomOrder = roomOrder;
      },
      getCurrentRoomIndex: () => this.currentRoomIndex,
      setCurrentRoomIndex: (index) => {
        this.currentRoomIndex = index;
      },
      setRoomCleared: (value) => {
        this.roomCleared = value;
      },
      hideOverlays: () => {
        this.hudManager?.hideOverlays();
      },
      setGameState: (state) => {
        this.transitionGameState(state);
      },
      preloadRoomsAround: (preloadIndex, activeIndex, forceRebuild, options) => {
        this.preloadRoomsAround(preloadIndex, activeIndex, forceRebuild, options);
      },
      loadRoomByIndex: (index) => {
        this.loadRoomByIndex(index);
      },
      getRoomBoundsForInstance: (instanceKey) => this.roomManager.getRoomBoundsForInstance(instanceKey),
      getCameraTarget: () => {
        const camera = (this.scene as SceneWithMainCamera)?.mainCamera ?? this.scene?.activeCamera;
        return camera && camera instanceof ArcRotateCamera ? camera.getTarget() : null;
      },
      setCameraMove: (move) => {
        this.cameraMove = move;
      },
    });
    this.bonusSystemManager = new BonusSystemManager({
      isGameplayInitialized: () => this.gameplayInitialized,
      getGameState: () => this.gameState,
      setGameState: (state) => {
        this.transitionGameState(state);
      },
      getSelectedClassId: () => this.selectedClassId,
      getCurrency: () => this.runEconomy.getCurrency(),
      trySpendCurrency: (cost) => this.trySpendCurrency(cost),
      showBonusChoices: (choices, currency, rerollCost) => {
        this.hudManager.showBonusChoices(choices, currency, rerollCost);
      },
      applyBonus: (bonusId) => {
        this.applyBonus(bonusId);
      },
      startRoomTransition: (nextIndex) => {
        this.startRoomTransition(nextIndex);
      },
      getCurrentRoomIndex: () => this.currentRoomIndex,
      getRoomOrderLength: () => this.roomOrder.length,
      markBonusDiscovered: (bonusId) => {
        void this.codexService.markBonusDiscovered(bonusId);
      },
      recordBonusCollected: () => {
        this.codexService.recordBonusCollected();
      },
    });

    const achievementData = getMergedAchievementDefinitions();
    const definitions: AchievementDefinition[] = Object.entries(achievementData as Record<string, AchievementSourceEntry>).map(([id, value]) => ({
      id,
      name: value?.name ?? id,
      description: value?.description ?? 'No description available.',
      type: value?.type === 'incremental' ? 'incremental' : 'oneTime',
      target: Number.isFinite(value?.target) ? Number(value.target) : 1,
    }));
    this.codexService.initializeAchievements(definitions);
    this.registerStates();
  }

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    GameSettingsStore.applyRuntimeEffects(this.canvas);

    // Initialize Babylon.js engine
    this.engine = new Engine(canvas, true);
    this.setupGlobalAudioUnlock();

    // Load configurations
    await this.configLoader.loadAllConfigs();

    const gameplayDebug = this.configLoader.getGameplayConfig()?.debug;
    this.codexService.setDevUnlockCodexEntries(!!gameplayDebug?.enabled);

    // Setup event listeners
    this.setupEventListeners();

    if (BootSequenceScene.shouldPlay()) {
      await this.openBootSequenceScene();
    } else {
      await this.openMainMenuScene();
    }

    // Start in menu scene
    this.transitionGameState('menu');

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

      const context = (audioEngine as { audioContext?: AudioContext } | undefined)?.audioContext;
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

  private disposeFrontendScenes(): void {
    if (this.bootScene) {
      this.bootScene.dispose();
      this.bootScene = undefined;
    }
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
  }

  private async openMainMenuScene(): Promise<void> {
    this.disposeFrontendScenes();

    this.mainMenuScene = new MainMenuScene(this.engine, () => {
      void this.openClassSelectScene();
    }, () => {
      void this.openCodexScene();
    });
    this.scene = this.mainMenuScene.getScene();
  }

  private async openCodexScene(): Promise<void> {
    this.disposeFrontendScenes();

    try {
      this.codexScene = new CodexScene(
        this.engine,
        this.codexService,
        this.configLoader.getEnemiesConfig() ?? {},
        () => {
          void this.openMainMenuScene();
        }
      );
      this.scene = this.codexScene.getScene();
      this.transitionGameState('menu');
    } catch (error) {
      console.error('[GameManager] Failed to open Codex scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openClassSelectScene(): Promise<void> {
    this.disposeFrontendScenes();

    const classSelectPostFx = this.configLoader.getGameplayConfig()?.postProcessing;
    this.classSelectScene = new ClassSelectScene(this.engine, (classId) => {
      this.eventCoordinator.emitGameStartRequested(classId);
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

    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (!camera) throw new Error('Main camera not found in scene');

    this.cameraAlpha = camera.alpha;
    this.cameraBeta = camera.beta;
    this.cameraRadius = camera.radius;

    const gameplayConfig = this.configLoader.getGameplayConfig();
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

    const rooms = this.configLoader.getRoomsConfig();
    const playableRooms = Array.isArray(rooms)
      ? rooms.filter((room: LoadedRoomConfig) => this.shouldIncludeInRunOrder(room))
      : [];
    this.roomOrder = playableRooms.map((r: LoadedRoomConfig) => r.id);
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

    const playerConfig = this.configLoader.getPlayerConfig();
    this.playerController = new PlayerController(this.scene, this.inputManager, playerConfig!, this.selectedClassId);
    this.enemySpawner = new EnemySpawner(this.scene, this.roomManager);
    this.combatActionManager = new GameCombatActionManager(this.scene, this.playerController, this.projectileManager);
    this.worldCollisionHazardManager = new GameWorldCollisionHazardManager(
      this.playerController,
      this.roomManager,
      this.tileFloorManager,
      this.configLoader,
    );
    this.playerVoidRecoveryManager = new GamePlayerVoidRecoveryManager(
      this.scene,
      this.playerController,
      this.roomManager,
      (reason) => this.eventCoordinator.emitPlayerDied(reason),
    );
    this.daemonTestManager = new GameDaemonTestManager((payload) => this.eventCoordinator.emitDaemonTaunt(payload));
    this.economyFlowManager = new GameEconomyFlowManager(
      this.configLoader,
      this.runEconomy,
      this.bonusSystemManager,
      this.hudManager,
      this.playerController,
      this.inputManager,
    );
    this.roomStreamingManager = new GameRoomStreamingManager({
      roomManager: this.roomManager,
      tileFloorManager: this.tileFloorManager,
      isGameplayInitialized: () => this.gameplayInitialized,
      isTilesEnabled: () => this.tilesEnabled,
      getRoomOrder: () => this.roomOrder,
      getRoomSpacing: () => this.roomSpacing,
      getRenderProfileForRoom: (roomId) => this.getRenderProfileForRoom(roomId),
      preloadTileFloorInstance: (roomId, instanceKey, origin) => this.preloadTileFloorInstance(roomId, instanceKey, origin),
      setCurrentRoomInstance: (roomKey) => {
        this.roomManager.setCurrentRoom(roomKey);
        if (this.tilesEnabled) {
          this.tileFloorManager.setCurrentRoomInstance(roomKey);
        }
      },
      focusCameraOnRoomBounds: (roomKey) => this.focusCameraOnRoomBounds(roomKey),
    });
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
    const bindings = new GameEventBindings(this.eventBus, {
      onGameStartRequested: (data) => {
        this.tryUnlockAudioNow();
        const classId = data?.classId as ('mage' | 'firewall' | 'rogue' | undefined);
        if (classId) {
          this.selectedClassId = classId;
        }
        this.codexService.startRunTracking();
        void this.startNewGame();
      },
      onGameRestartRequested: () => {
        this.tryUnlockAudioNow();
        this.codexService.startRunTracking();
        void this.startNewGame();
      },
      onCodexOpenRequested: () => {
        void this.openCodexScene();
      },
      onRoomNextRequested: () => {
        if (!this.gameplayInitialized) return;
        this.loadNextRoom();
      },
      onDevRoomLoadRequested: (data) => {
        if (!this.gameplayInitialized) return;
        const roomId = data?.roomId;
        if (roomId) {
          this.loadIsolatedRoom(roomId);
          this.loadTilesForRoom(roomId);
        }
      },
      onDevTileToggleRequested: () => {
        if (!this.gameplayInitialized) return;
        this.setTilesEnabled(!this.tilesEnabled);
        if (this.tilesEnabled && this.roomOrder[this.currentRoomIndex]) {
          this.loadTilesForRoom(this.roomOrder[this.currentRoomIndex]);
        }
        console.log(`Tiles ${this.tilesEnabled ? 'enabled' : 'disabled'}`);
      },
      onDevTileLoadRequested: (data) => {
        if (!this.gameplayInitialized) return;
        const roomId = data?.roomId;
        if (roomId) {
          this.loadTilesForRoom(roomId);
        }
      },
      onBonusSelected: (data) => {
        if (!this.gameplayInitialized) return;
        const bonusId = data?.bonusId;
        if (bonusId) {
          this.bonusSystemManager.handleBonusSelected(bonusId);
        }
      },
      onBonusRerollRequested: (data) => {
        if (!this.gameplayInitialized) return;
        if (this.gameState !== 'bonus') return;
        const requestedCost = Number.isFinite(data?.cost) ? Number(data.cost) : 40;
        this.bonusSystemManager.handleBonusRerollRequested(requestedCost);
      },
      onPlayerDied: (payload) => {
        if (!this.gameplayInitialized) return;
        if (this.playerVoidRecoveryManager?.isFalling() && payload?.reason !== 'void_fall') return;
        this.codexService.endRunTracking();
        this.transitionGameState('gameover');
        this.hudManager.showGameOverScreen();
      },
      onEnemySpawned: (data) => {
        const enemyType = data?.enemyType;
        if (typeof enemyType === 'string' && enemyType.length > 0) {
          void this.codexService.markEnemyEncountered(enemyType);
        }
      },
      onEnemyDied: (data) => {
        this.codexService.recordEnemyKilled();
        const reward = this.computeEnemyKillReward(data?.enemyType);
        if (reward > 0) {
          this.addCurrency(reward);
        }
      },
      onAttackPerformed: (data) => {
        this.handleAttackPerformedEvent(data);
      },
      onPlayerDamaged: () => {
        this.codexService.recordPlayerDamaged();
        this.resetDaemonIdleTimer();
      },
      onRoomEntered: () => {
        this.codexService.recordRoomReached(this.currentRoomIndex + 1);
      },
      onEnemyDamaged: () => {
        this.resetDaemonIdleTimer();
      },
    });

    this.eventBusUnsubscribers = bindings.bind();
  }

  private tryUnlockAudioNow(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    try {
      audioEngine.unlock();
    } catch {
      // Ignore; global gesture listeners keep retrying.
    }

    const context = (audioEngine as { audioContext?: AudioContext } | undefined)?.audioContext;
    if (context && context.state !== 'running') {
      void context.resume().catch(() => {
        // Ignore and let next gesture retry.
      });
    }
  }

  private handleAttackPerformedEvent(data: AttackPerformedPayload): void {
    if (!this.gameplayInitialized) return;
    if (this.gameState !== 'playing') return;

    if (data?.type === 'melee' && data?.attacker) {
      const rawDamage = data.damage || 0;
      const finalDamage = this.resolveIncomingMeleeDamage(rawDamage, data.attacker);
      if (finalDamage > 0) {
        this.playerController.applyDamage(finalDamage);
      }
    }

    if (data?.attacker === 'player') {
      this.tryTriggerDaemonTestOnFire();
    }
    this.resetDaemonIdleTimer();
  }

  private resolveIncomingMeleeDamage(rawDamage: number, attackerId: string): number {
    if (this.playerController.getClassId() !== 'firewall') {
      return rawDamage;
    }
    if (attackerId === 'player') {
      return rawDamage;
    }

    const enemies = this.enemySpawner?.getEnemies?.() ?? [];
    const attackerEnemy = enemies.find((enemy: EnemyController) => enemy.getId?.() === attackerId);
    if (!attackerEnemy) {
      return rawDamage;
    }

    const attackerPos = attackerEnemy.getPosition();
    if (!this.playerController.canBlockMeleeFrom(attackerPos)) {
      return rawDamage;
    }

    const blockRatio = this.playerController.getTankMeleeBlockRatio();
    const finalDamage = Math.max(0, rawDamage * (1 - blockRatio));
    const riposteRatio = this.playerController.getTankRiposteMeleeRatio();
    if (riposteRatio > 0) {
      attackerEnemy.takeDamage(rawDamage * riposteRatio);
    }

    return finalDamage;
  }

  private registerStates(): void {
    const noopState = {
      enter: () => {},
      update: (_deltaTime: number) => {
        void _deltaTime;
      },
      exit: () => {},
    };

    this.stateMachine.registerState(GameState.BOOT, noopState);
    this.stateMachine.registerState(GameState.MAIN_MENU, noopState);
    this.stateMachine.registerState(GameState.CHARACTER_SELECT, noopState);
    this.stateMachine.registerState(GameState.GAMEPLAY_LOOP, noopState);
    this.stateMachine.registerState(GameState.PAUSE, noopState);
    this.stateMachine.registerState(GameState.GAME_OVER, noopState);
  }

  private mapRuntimeStateToStateMachine(state: RuntimeGameState): GameState {
    switch (state) {
      case 'menu':
        return GameState.MAIN_MENU;
      case 'playing':
        return GameState.GAMEPLAY_LOOP;
      case 'roomclear':
      case 'bonus':
      case 'transition':
        return GameState.PAUSE;
      case 'gameover':
        return GameState.GAME_OVER;
      default:
        return GameState.MAIN_MENU;
    }
  }

  private transitionGameState(nextState: RuntimeGameState): void {
    if (this.gameState === nextState) return;
    this.gameState = nextState;
    this.stateMachine.transition(this.mapRuntimeStateToStateMachine(nextState));
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

      this.updateCameraTransition(deltaTime);

      if (this.gameplayInitialized && this.gameState === 'playing') {
        const shouldSkipRender = this.updatePlayingFrame(deltaTime);
        if (shouldSkipRender) {
          return;
        }
      } else if (this.gameplayInitialized) {
        this.updateNonPlayingFrame(deltaTime);
      }

      // Render scene
      this.scene.render();
    });
  }

  private updateCameraTransition(deltaTime: number): void {
    if (!this.gameplayInitialized || !this.cameraMove) return;

    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
    if (!camera || !(camera instanceof ArcRotateCamera)) return;

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
      this.transitionGameState('playing');
    }
  }

  private updatePlayingFrame(deltaTime: number): boolean {
    this.roomElapsedSeconds += deltaTime;
    return this.runtimeOrchestrator.updatePlayingFrame(this.createRuntimeFrameContext(), deltaTime);
  }

  private updateNonPlayingFrame(deltaTime: number): void {
    this.runtimeOrchestrator.updateNonPlayingFrame(this.createRuntimeFrameContext(), deltaTime);
  }

  private createRuntimeFrameContext(): GameRuntimeFrameContext {
    return {
      playerController: this.playerController,
      enemySpawner: this.enemySpawner,
      roomManager: this.roomManager,
      projectileManager: this.projectileManager,
      ultimateSystemManager: this.ultimateSystemManager,
      ultimateManager: this.ultimateManager,
      hudManager: this.hudManager,
      tileFloorManager: this.tileFloorManager,
      tilesEnabled: this.tilesEnabled,
      roomOrder: this.roomOrder,
      currentRoomIndex: this.currentRoomIndex,
      gameState: this.gameState,
      roomCleared: this.roomCleared,
      getCurrency: () => this.runEconomy.getCurrency(),
      getConsumableStatusLabel: () => this.getConsumableStatusLabel(),
      applyPassiveIncome: (frameDelta) => this.applyPassiveIncome(frameDelta),
      updateConsumablesFromInput: () => this.updateConsumablesFromInput(),
      detectAndStartPlayerVoidFall: () => this.detectAndStartPlayerVoidFall(),
      updatePlayerVoidFall: (frameDelta) => this.updatePlayerVoidFall(frameDelta),
      applySecondaryEnemySlow: (enemies, center, radius, speedMultiplier) => this.applySecondaryEnemySlow(enemies, center, radius, speedMultiplier),
      resolveEntityCollisions: (enemies, frameDelta) => this.resolveEntityCollisions(enemies, frameDelta),
      applyHazardDamage: (frameDelta) => this.applyHazardDamage(frameDelta),
      updateDaemonIdleTest: (frameDelta, enemyCount) => this.updateDaemonIdleTest(frameDelta, enemyCount),
      resolveSecondaryBurst: (burst, enemies) => this.resolveSecondaryBurst(burst, enemies),
      resolveTankSweep: (sweep, enemies) => this.resolveTankSweep(sweep, enemies),
      resolveTankShieldBash: (bash, enemies) => this.resolveTankShieldBash(bash, enemies),
      resolveRogueStrike: (strike, enemies) => this.resolveRogueStrike(strike, enemies),
      resolveRogueDashAttack: (dash, enemies) => this.resolveRogueDashAttack(dash, enemies),
      setRoomCleared: (value) => {
        this.roomCleared = value;
      },
      onRoomCleared: (roomId) => {
        this.eventCoordinator.emitRoomCleared(roomId);
      },
      openBonusChoices: () => {
        this.bonusSystemManager.openBonusChoices();
      },
      renderScene: () => {
        this.scene.render();
      },
    };
  }

  stop(): void {
    this.isRunning = false;
    this.engine.stopRenderLoop();
    this.dispose();
  }

  private updateDaemonIdleTest(deltaTime: number, enemyCount: number): void {
    this.daemonTestManager?.updateIdle(
      deltaTime,
      enemyCount,
      this.gameState,
      this.roomManager.getCurrentRoom()?.id,
      this.hudManager.isDaemonMessageActive(),
      this.isDaemonTestEnabled(),
    );
  }

  private resetDaemonIdleTimer(): void {
    this.daemonTestManager?.resetIdleTimer();
  }

  private isDaemonTestEnabled(): boolean {
    const gameplayConfig = this.configLoader.getGameplayConfig();
    return !!gameplayConfig?.debugConfig?.daemonVoicelineTest;
  }

  private triggerDaemonTestVoiceline(): void {
    this.daemonTestManager?.tryTriggerOnFire(
      this.roomManager.getCurrentRoom()?.id,
      this.isDaemonTestEnabled(),
      this.hudManager.isDaemonMessageActive(),
    );
  }

  private tryTriggerDaemonTestOnFire(): void {
    this.triggerDaemonTestVoiceline();
  }

  private dispose(): void {
    this.disposeRuntimeHooks();
    this.disposeGameplaySystems();
    this.disposeScenesAndEngine();
  }

  private disposeRuntimeHooks(): void {
    this.eventBusUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.eventBusUnsubscribers = [];

    if (this.proceduralPrewarmTimer !== null) {
      window.clearTimeout(this.proceduralPrewarmTimer);
      this.proceduralPrewarmTimer = null;
    }
    this.roomStreamingManager?.clearDeferredTilePreloadQueue();
    this.pendingProceduralPrewarmRoomIds = [];
    this.proceduralPrewarmPromise = null;

    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
      window.removeEventListener('touchstart', this.audioUnlockHandler);
      this.audioUnlockHandler = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private disposeGameplaySystems(): void {
    this.projectileManager?.dispose();
    this.ultimateManager?.dispose();
    this.ultimateSystemManager?.reset();
    this.combatActionManager?.dispose();
    this.combatActionManager = null;
    this.playerVoidRecoveryManager?.reset();
    this.playerVoidRecoveryManager = null;
    this.daemonTestManager = null;
    this.economyFlowManager = null;
    this.roomStreamingManager = null;
    this.worldCollisionHazardManager = null;
    this.hudManager?.dispose();
    this.devConsole?.dispose();
    this.playerController?.dispose();
    this.enemySpawner?.dispose();
    this.roomManager?.dispose();
  }

  private disposeScenesAndEngine(): void {
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

  private resolveEntityCollisions(enemies: EnemyController[], deltaTime: number): void {
    this.worldCollisionHazardManager?.resolveEntityCollisions(enemies, deltaTime);
  }

  private applyHazardDamage(deltaTime: number): void {
    this.worldCollisionHazardManager?.applyHazardDamage(
      deltaTime,
      this.playerVoidRecoveryManager?.isFalling() ?? false,
      this.tilesEnabled,
    );
  }

  private applySecondaryEnemySlow(enemies: EnemyController[], center: Vector3, radius: number, speedMultiplier: number): void {
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
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveSecondaryBurst(burst, enemies);
  }


  private resolveTankSweep(
    sweep: {
      origin: Vector3;
      direction: Vector3;
      swingDirection: 'left' | 'right';
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveTankSweep(sweep, enemies);
  }

  private resolveTankShieldBash(
    bash: {
      origin: Vector3;
      direction: Vector3;
      radius: number;
      damage: number;
      knockback: number;
      stunDuration: number;
      groupDistance: number;
      groupWidth: number;
      pullStrength: number;
      forwardPush: number;
      isFinisher: boolean;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveTankShieldBash(bash, enemies);
  }

  private ensureTankUltimateZoneVisual(radius: number): void {
    this.combatActionManager?.ensureTankUltimateZoneVisual(radius);
  }

  private updateTankUltimateZoneVisual(deltaTime: number): void {
    this.combatActionManager?.updateTankUltimateZoneVisual(deltaTime);
  }

  private disposeTankUltimateZoneVisual(): void {
    this.combatActionManager?.disposeTankUltimateZoneVisual();
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
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveRogueStrike(strike, enemies);
  }

  private resolveRogueDashAttack(
    dash: {
      from: Vector3;
      to: Vector3;
      radius: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveRogueDashAttack(dash, enemies);
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

      this.prepareRunStateForStart();
      this.transitionGameState('transition');
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false);
      this.loadRoomByIndex(this.currentRoomIndex);
      this.setLoadingOverlay(true, 'HANDSHAKE WITH DAEMON CORE...', '100%');
      await this.waitForNextPaint(1);
      await this.waitForMs(1000);
      this.transitionGameState('playing');
      this.setLoadingOverlay(false);
    } finally {
      this.setLoadingOverlay(false);
      this.gameplayStartInProgress = false;
    }
  }

  private prepareRunStateForStart(): void {
    this.currentRoomIndex = 0;
    this.roomCleared = false;
    this.ultimateSystemManager.reset();
    this.bonusSystemManager.resetRun();
    this.runEconomy.resetRun();
    this.roomElapsedSeconds = 0;
    this.resetPlayerVoidFallState();
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);
    this.hudManager.hideOverlays();
    this.hudManager.updateCurrency(this.runEconomy.getCurrency());
    this.hudManager.updateItemStatus(this.getConsumableStatusLabel());
  }

  private loadNextRoom(): void {
    this.roomTransitionManager.loadNextRoom();
  }

  private loadIsolatedRoom(roomId: string): void {
    this.roomTransitionManager.loadIsolatedRoom(roomId);
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
    this.ultimateSystemManager.reset();
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);

    const roomBounds = this.roomManager.getRoomBounds();
    if (roomBounds) {
      const centerX = (roomBounds.minX + roomBounds.maxX) / 2;
      const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2;
      const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
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
    this.eventCoordinator.emitRoomEntered({
      roomId,
      roomName: currentRoomConfig?.name ?? roomId,
      roomType: currentRoomConfig?.roomType ?? 'normal',
    });
  }

  private preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean = false,
    options?: RoomPreloadOptions
  ): void {
    this.roomStreamingManager?.preloadRoomsAround(preloadIndex, activeIndex, forceRebuild, options);
  }

  private focusCameraOnRoomBounds(roomKey: string): void {
    const bounds = this.roomManager.getRoomBoundsForInstance(roomKey);
    if (!bounds) return;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
    if (!camera || !(camera instanceof ArcRotateCamera)) return;

    camera.setTarget(new Vector3(centerX, 0.5, centerZ));
    camera.alpha = this.cameraAlpha;
    camera.beta = this.cameraBeta;
    camera.radius = this.cameraRadius;
  }

  private startRoomTransition(nextIndex: number): void {
    this.roomTransitionManager.startRoomTransition(nextIndex);
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
    return this.economyFlowManager?.computeEnemyKillReward(enemyType, this.roomElapsedSeconds) ?? 1;
  }

  private addCurrency(amount: number): void {
    this.economyFlowManager?.addCurrency(amount);
  }

  private addCurrencyFraction(amount: number): void {
    this.economyFlowManager?.addCurrencyFraction(amount);
  }

  private applyPassiveIncome(deltaTime: number): void {
    this.economyFlowManager?.applyPassiveIncome(deltaTime);
  }

  private trySpendCurrency(cost: number): boolean {
    return this.economyFlowManager?.trySpendCurrency(cost) ?? false;
  }

  private updateConsumablesFromInput(): void {
    this.economyFlowManager?.updateConsumablesFromInput();
  }

  private getConsumableStatusLabel(): string {
    if (this.economyFlowManager) {
      return this.economyFlowManager.getConsumableStatusLabel();
    }

    const damage = this.playerController?.getDamageBoostState?.();
    const shield = this.playerController?.getDamageReductionState?.();
    return this.runEconomy.getConsumableStatusLabel(
      { active: !!damage?.active, remaining: damage?.remaining ?? 0 },
      { active: !!shield?.active, remaining: shield?.remaining ?? 0 },
    );
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
    this.playerVoidRecoveryManager?.reset();
  }

  private detectAndStartPlayerVoidFall(): void {
    this.playerVoidRecoveryManager?.detectAndStart(this.roomOrder, this.currentRoomIndex);
  }

  private updatePlayerVoidFall(deltaTime: number): boolean {
    return this.playerVoidRecoveryManager?.update(deltaTime) ?? false;
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

  private buildRoomLayoutForTiles(room: LoadedRoomConfig): RoomLayout | null {
    if (!room?.layout || !Array.isArray(room.layout)) return null;

    const layoutWidth = room.layout.reduce((max: number, row: string) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      return Math.max(max, rowData.length);
    }, 0);

    const layoutHeight = room.layout.length;
    const shouldTreatVoidAsWall = layoutWidth <= 16 && layoutHeight <= 12;

    const normalizedLayout = room.layout.map((row: string) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      const padded = rowData.padEnd(layoutWidth, '#').replace(/O/g, '#');
      return shouldTreatVoidAsWall ? padded.replace(/V/g, '#') : padded;
    });

    const obstacles = Array.isArray(room.obstacles)
      ? room.obstacles.flatMap((ob: { x: number; y?: number; z?: number; width: number; height: number; type: string }) => {
          if (ob.type === 'hazard') return [];
          const obstacleZ = Number.isFinite(ob?.y)
            ? ob.y
            : (Number.isFinite(ob?.z) ? ob.z : undefined);
          if (!Number.isFinite(ob?.x) || !Number.isFinite(obstacleZ)) return [];
          const obstacleZValue = Number(obstacleZ);
          const width = Math.max(1, ob.width || 1);
          const height = Math.max(1, ob.height || 1);
          const tiles = [] as Array<{ x: number; z: number; type: string }>;
          for (let dx = 0; dx < width; dx++) {
            for (let dz = 0; dz < height; dz++) {
              tiles.push({ x: ob.x + dx, z: obstacleZValue + dz, type: 'wall' });
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

  private shouldIncludeInRunOrder(room: LoadedRoomConfig): boolean {
    if (!room?.id || !Array.isArray(room.layout)) return false;

    const layoutWidth = room.layout.reduce((max: number, row: string) => {
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

    const rooms = this.configLoader.getRoomsConfig();
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
    this.transitionGameState('playing');

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

    this.eventCoordinator.emitRoomEntered({
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
        this.roomStreamingManager?.clearDeferredTilePreloadQueue();
        this.tileFloorManager.clearAllRoomInstances();
      }
      return;
    }

    if (!enabled) {
      this.roomStreamingManager?.clearDeferredTilePreloadQueue();
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
    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.alpha = alpha;
    }
  }

  public setCameraBeta(beta: number): void {
    this.cameraBeta = beta;
    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.beta = beta;
    }
  }

  public setCameraRadius(radius: number): void {
    this.cameraRadius = radius;
    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
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
