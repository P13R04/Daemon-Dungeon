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

export class GameManager {
  private static instance: GameManager;
  
  private engine!: Engine;
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
  
  private isRunning: boolean = false;
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
    // Initialize Babylon.js engine and scene using SceneBootstrap
    this.engine = new Engine(canvas, true);
    this.scene = SceneBootstrap.createScene(this.engine, canvas);

    // Load configurations
    await this.configLoader.loadAllConfigs();

    // Get camera from scene (created by SceneBootstrap)
    const camera = (this.scene as any).mainCamera as ArcRotateCamera;
    if (!camera) throw new Error('Main camera not found in scene');
    
    this.cameraAlpha = camera.alpha;
    this.cameraBeta = camera.beta;
    this.cameraRadius = camera.radius;

    // Post-processing pipeline
    const gameplayConfig = this.configLoader.getGameplay();
    this.postProcessManager = new PostProcessManager(this.scene, this.engine);
    this.postProcessManager.setupPipeline(camera, gameplayConfig?.postProcessing ?? undefined);

    // Initialize systems
    this.roomManager = new RoomManager(this.scene, 1.2); // Tile size increased by 20%
    this.inputManager = new InputManager(canvas, this.scene);
    this.projectileManager = new ProjectileManager(this.scene);
    this.ultimateManager = new UltimateManager(this.scene);
    this.hudManager = new HUDManager(this.scene);
    this.tileFloorManager = new TileFloorManager(this.scene, 1.2); // Tile size increased by 20%
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.devConsole = new DevConsole(this.scene, this);

    // Attach mouse listeners AFTER scene is fully initialized
    console.log('GameManager: Attaching mouse listeners after scene init...');
    this.inputManager.attachMouseListeners();

    // Build room order
    const rooms = this.configLoader.getRooms();
    this.roomOrder = Array.isArray(rooms) ? rooms.map((r: any) => r.id) : [];
    if (this.roomOrder.length === 0) {
      this.roomOrder = ['room_test_dummies'];
    }

    // Initialize player & enemies (actual room load happens on start)
    const playerConfig = this.configLoader.getPlayer();
    this.playerController = new PlayerController(this.scene, this.inputManager, playerConfig!);
    this.enemySpawner = new EnemySpawner(this.scene, this.roomManager);
    this.devConsole.setPlayer(this.playerController);

    // Setup event listeners
    this.setupEventListeners();

    // Start in menu
    this.gameState = 'menu';
    this.hudManager.showStartScreen();

    // Start game loop
    this.startGameLoop();

    this.isRunning = true;
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.GAME_START_REQUESTED, () => {
      this.startNewGame();
    });

    this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.startNewGame();
    });

    this.eventBus.on(GameEvents.ROOM_NEXT_REQUESTED, () => {
      this.loadNextRoom();
    });

    this.eventBus.on(GameEvents.DEV_ROOM_LOAD_REQUESTED, (data) => {
      const roomId = data?.roomId;
      if (roomId) {
        this.loadIsolatedRoom(roomId);
        // Try to load tiles if available
        this.loadTilesForRoom(roomId);
      }
    });

    this.eventBus.on(GameEvents.DEV_TILE_TOGGLE_REQUESTED, () => {
      this.setTilesEnabled(!this.tilesEnabled);
      if (this.tilesEnabled && this.roomOrder[this.currentRoomIndex]) {
        this.loadTilesForRoom(this.roomOrder[this.currentRoomIndex]);
      }
      console.log(`Tiles ${this.tilesEnabled ? 'enabled' : 'disabled'}`);
    });

    this.eventBus.on(GameEvents.DEV_TILE_LOAD_REQUESTED, (data) => {
      const roomId = data?.roomId;
      if (roomId) {
        this.loadTilesForRoom(roomId);
      }
    });

    this.eventBus.on(GameEvents.BONUS_SELECTED, (data) => {
      const bonusId = data?.bonusId;
      if (bonusId) {
        this.applyBonus(bonusId);
        const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
        this.startRoomTransition(nextIndex);
      }
    });

    this.eventBus.on(GameEvents.PLAYER_DIED, () => {
      this.gameState = 'gameover';
      this.hudManager.showGameOverScreen();
    });

    this.eventBus.on(GameEvents.ATTACK_PERFORMED, (data) => {
      if (this.gameState !== 'playing') return;
      if (data?.type === 'melee' && data?.attacker) {
        this.playerController.applyDamage(data.damage || 0);
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

      // Camera transition between rooms
      if (this.cameraMove) {
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

      if (this.gameState === 'playing') {
        // Update all game systems
        const enemies = this.enemySpawner.getEnemies();
        this.playerController.setGameplayActive(true);
        this.playerController.setEnemiesPresent(enemies.length > 0);
        this.playerController.update(deltaTime);
        
        // Get active enemies for collision checks
        
        // Update enemy AI
        this.enemySpawner.update(
          deltaTime,
          this.playerController.getPosition(),
          this.roomManager,
          this.playerController.getVelocity()
        );

        // Resolve collisions between entities (player/enemies)
        this.resolveEntityCollisions(enemies);

        // Apply hazard damage zones
        this.applyHazardDamage(deltaTime);
        
        // Update projectiles and check collisions
        this.projectileManager.update(deltaTime, enemies, this.playerController, this.roomManager);
        
        // Update ultimate zones
        this.ultimateManager.update(deltaTime, enemies, this.playerController);
        
        // Update HUD
        this.hudManager.update(deltaTime);

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
      } else {
        this.playerController.setGameplayActive(false);
        this.hudManager.update(deltaTime);
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
    this.scene?.dispose();
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
      if (tile?.type === 'spikes' && spikesDps > 0) {
        this.playerController.applyDamage(spikesDps * deltaTime);
      }
    }
  }

  private startNewGame(): void {
    this.currentRoomIndex = 0;
    this.roomCleared = false;
    this.hudManager.hideOverlays();
    this.gameState = 'playing';
    this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex);
    this.loadRoomByIndex(this.currentRoomIndex);
  }

  private loadNextRoom(): void {
    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    this.roomCleared = false;
    this.hudManager.hideOverlays();
    this.startRoomTransition(nextIndex);
  }

  private loadIsolatedRoom(roomId: string): void {
    this.cameraMove = null;
    this.roomOrder = [roomId];
    this.currentRoomIndex = 0;
    this.roomCleared = false;
    this.hudManager.hideOverlays();
    this.gameState = 'playing';
    this.preloadRoomsAround(0, 0);
    this.loadRoomByIndex(0);
  }

  private loadRoomByIndex(index: number): void {
    const roomId = this.roomOrder[index];
    const instanceKey = `${roomId}::${index}`;
    this.roomManager.setCurrentRoom(instanceKey);
    this.roomManager.setDoorActive(false);
    this.roomCleared = false;

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

    this.eventBus.emit(GameEvents.ROOM_ENTERED, { roomId });
  }

  private preloadRoomsAround(preloadIndex: number, activeIndex: number): void {
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

    this.eventBus.emit(GameEvents.ROOM_ENTERED, { roomId });
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
