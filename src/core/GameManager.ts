/**
 * GameManager - Central orchestrator for the entire game
 * Manages game state, systems, and core loops
 */

import { Scene, Engine, Vector3, ArcRotateCamera } from '@babylonjs/core';
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
import { ClassSelectScene } from '../scene/ClassSelectScene';
import { MainMenuScene } from '../scene/MainMenuScene';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';

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
  private mainMenuScene?: MainMenuScene;
  private classSelectScene?: ClassSelectScene;
  
  private isRunning: boolean = false;
  private gameplayInitialized: boolean = false;
  private gameplayStartInProgress: boolean = false;
  private eventListenersBound: boolean = false;
  private selectedClassId: 'mage' | 'firewall' | 'rogue' = 'mage';
  private tilesEnabled: boolean = true;
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

  private constructor() {
    this.stateMachine = new StateMachine();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.configLoader = ConfigLoader.getInstance();
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

    // Load configurations
    await this.configLoader.loadAllConfigs();

    // Setup event listeners
    this.setupEventListeners();

    await this.openMainMenuScene();

    // Start in menu scene
    this.gameState = 'menu';

    // Start game loop
    this.startGameLoop();

    this.isRunning = true;
  }

  private async openMainMenuScene(): Promise<void> {
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }

    this.mainMenuScene = new MainMenuScene(this.engine, () => {
      void this.openClassSelectScene();
    });
    this.scene = this.mainMenuScene.getScene();
  }

  private async openClassSelectScene(): Promise<void> {
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
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

    this.scene = SceneBootstrap.createScene(this.engine, this.canvas);

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
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.devConsole = new DevConsole(this.scene, this);

    this.inputManager.attachMouseListeners();

    const rooms = this.configLoader.getRooms();
    this.roomOrder = Array.isArray(rooms) ? rooms.map((r: any) => r.id) : [];
    if (this.roomOrder.length === 0) {
      this.roomOrder = ['room_test_dummies'];
    }

    const playerConfig = this.configLoader.getPlayer();
    this.playerController = new PlayerController(this.scene, this.inputManager, playerConfig!, this.selectedClassId);
    this.enemySpawner = new EnemySpawner(this.scene, this.roomManager);
    this.devConsole.setPlayer(this.playerController);

    this.gameplayInitialized = true;
  }

  private setupEventListeners(): void {
    if (this.eventListenersBound) return;
    this.eventListenersBound = true;

    this.eventBus.on(GameEvents.GAME_START_REQUESTED, (data) => {
      const classId = data?.classId as ('mage' | 'firewall' | 'rogue' | undefined);
      if (classId) {
        this.selectedClassId = classId;
      }
      void this.startNewGame();
    });

    this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      void this.startNewGame();
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
        this.applyBonus(bonusId);
        const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
        this.startRoomTransition(nextIndex);
      }
    });

    this.eventBus.on(GameEvents.PLAYER_DIED, () => {
      if (!this.gameplayInitialized) return;
      this.gameState = 'gameover';
      this.hudManager.showGameOverScreen();
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
      this.resetDaemonIdleTimer();
    });

    this.eventBus.on(GameEvents.ENEMY_DAMAGED, () => {
      this.resetDaemonIdleTimer();
    });
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
            this.gameState = 'playing';
          }
        }
      }

      if (this.gameplayInitialized && this.gameState === 'playing') {
        // Update all game systems
        const enemies = this.enemySpawner.getEnemies();
        this.playerController.setGameplayActive(true);
        this.playerController.setEnemiesPresent(enemies.length > 0);
        this.playerController.update(deltaTime);

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

        // Resolve collisions between entities (player/enemies)
        this.resolveEntityCollisions(enemies);

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
              this.hudManager.showBonusChoices(this.getBonusChoices());
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

  private resolveEntityCollisions(enemies: any[]): void {
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
        const half = push.scale(0.5);
        playerPos = playerPos.subtract(half);
        enemy.setPosition(enemyPos.add(half));
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

    if (this.tilesEnabled) {
      const gameplayConfig = this.configLoader.getGameplay();
      const tileHazards = gameplayConfig?.tileHazards ?? {};
      const poisonDps = tileHazards.poisonDps ?? 0;
      const spikesDps = tileHazards.spikesDps ?? 0;

      const tile = this.tileFloorManager.getTileAtWorld(playerPos.x, playerPos.z);
      if (tile?.type === 'void' && this.gameState === 'playing') {
        this.eventBus.emit(GameEvents.PLAYER_DIED, { reason: 'void' });
      }
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
      pullStrength: number;
    },
    enemies: any[]
  ): void {
    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const toEnemy = enemyPos.subtract(ultimate.position);
      const distance = toEnemy.length();
      if (distance > ultimate.radius) continue;

      enemy.takeDamage(ultimate.damage);
      enemy.applyStun?.(ultimate.stunDuration);

      const pullDir = ultimate.position.subtract(enemyPos);
      if (pullDir.lengthSquared() > 0.0001) {
        enemy.applyExternalKnockback(pullDir.normalize().scale(ultimate.pullStrength));
      }
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

  private async startNewGame(): Promise<void> {
    if (this.gameplayStartInProgress) return;
    this.gameplayStartInProgress = true;
    try {
      if (!this.gameplayInitialized) {
        await this.initializeGameplayScene();
      }

      this.currentRoomIndex = 0;
      this.roomCleared = false;
      this.rogueUltimateState = null;
      this.playerController.setRogueUltimateActive(false);
      this.hudManager.hideOverlays();
      this.gameState = 'playing';
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex);
      this.loadRoomByIndex(this.currentRoomIndex);
    } finally {
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
    this.rogueUltimateState = null;
    this.playerController.setRogueUltimateActive(false);
    this.hudManager.hideOverlays();
    this.gameState = 'playing';
    this.preloadRoomsAround(0, 0);
    this.loadRoomByIndex(0);
  }

  private loadRoomByIndex(index: number): void {
    if (!this.gameplayInitialized) return;
    const roomId = this.roomOrder[index];
    const instanceKey = `${roomId}::${index}`;
    this.roomManager.setCurrentRoom(instanceKey);
    this.roomManager.setDoorActive(false);
    this.roomCleared = false;
    this.rogueUltimateState = null;
    this.playerController.setRogueUltimateActive(false);

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
      this.loadTilesForRoom(roomId);
    }

    const currentRoomConfig = this.roomManager.getCurrentRoom();
    this.eventBus.emit(GameEvents.ROOM_ENTERED, {
      roomId,
      roomName: currentRoomConfig?.name ?? roomId,
      roomType: currentRoomConfig?.roomType ?? 'normal',
    });
  }

  private preloadRoomsAround(preloadIndex: number, activeIndex: number): void {
    if (!this.gameplayInitialized) return;
    this.roomManager.clearAllRooms();

    const indices = [preloadIndex - 2, preloadIndex - 1, preloadIndex, preloadIndex + 1];
    for (const idx of indices) {
      if (idx < 0 || idx >= this.roomOrder.length) continue;
      const roomId = this.roomOrder[idx];
      const origin = new Vector3(0, 0, idx * this.roomSpacing);
      const instanceKey = `${roomId}::${idx}`;
      this.roomManager.loadRoomInstance(roomId, instanceKey, origin);
    }
    const currentRoomId = this.roomOrder[activeIndex];
    const currentKey = `${currentRoomId}::${activeIndex}`;
    this.roomManager.setCurrentRoom(currentKey);

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

    this.preloadRoomsAround(nextIndex, this.currentRoomIndex);

    const nextRoomId = this.roomOrder[nextIndex];
    const nextKey = `${nextRoomId}::${nextIndex}`;
    const roomBounds = this.roomManager.getRoomBoundsForInstance(nextKey);
    if (!roomBounds) {
      this.currentRoomIndex = nextIndex;
      this.loadRoomByIndex(nextIndex);
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
      this.gameState = 'playing';
    }
  }

  private getBonusChoices(): Array<{ id: string; label: string }> {
    return [
      { id: 'bonus_hp', label: 'HP +10%' },
      { id: 'bonus_ms', label: 'Move Speed +10%' },
      { id: 'bonus_poison', label: 'Poison: 20% DMG over 2s' },
    ];
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
    }
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

  private async loadTilesForRoom(roomId: string): Promise<void> {
    const room = this.configLoader.getRoom(roomId);
    if (!room) {
      console.warn(`Room ${roomId} not found in config`);
      return;
    }

    if (!room.layout || !Array.isArray(room.layout)) {
      console.warn(`Room ${roomId} has no layout array`);
      return;
    }

    const obstacles = Array.isArray(room.obstacles)
      ? room.obstacles.flatMap((ob: any) => {
          if (ob.type === 'hazard') return [];
          const width = Math.max(1, ob.width || 1);
          const height = Math.max(1, ob.height || 1);
          const tiles = [] as Array<{ x: number; z: number; type: string }>;
          for (let dx = 0; dx < width; dx++) {
            for (let dz = 0; dz < height; dz++) {
              tiles.push({ x: ob.x + dx, z: ob.y + dz, type: ob.type ?? 'pillar' });
            }
          }
          return tiles;
        })
      : [];

    const layout: RoomLayout = {
      layout: room.layout,
      obstacles,
    };

    const origin = this.roomManager.getCurrentRoomOrigin();
    this.loadTilesForLayout(layout, origin);
    console.log(`✓ Tiles loaded for room ${roomId} (${room.layout.length} rows)`);
  }

  private loadTilesForLayout(layout: RoomLayout, origin: Vector3): void {
    this.tileFloorManager.clearFloor();
    this.tileFloorManager.loadRoomFloor(layout, origin);
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
    this.hudManager.hideOverlays();
    this.gameState = 'playing';

    this.roomManager.clearAllRooms();
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
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
    this.tilesEnabled = enabled;
    this.roomManager.setFloorRenderingEnabled(!enabled);
    if (!enabled) {
      this.tileFloorManager.clearFloor();
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
