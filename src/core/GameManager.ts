/**
 * GameManager - Central orchestrator for the entire game
 * Manages game state, systems, and core loops
 */

import { Scene, Engine, Vector3, HemisphericLight, ArcRotateCamera, Matrix } from '@babylonjs/core';
import { StateMachine, GameState } from './StateMachine';
import { EventBus, GameEvents } from './EventBus';
import { Time } from './Time';
import { ConfigLoader } from '../utils/ConfigLoader';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../gameplay/PlayerController';
import { EnemySpawner } from '../systems/EnemySpawner';
import { RoomManager } from '../systems/RoomManager';
import { ProjectileManager } from '../gameplay/ProjectileManager';
import { UltimateManager } from '../gameplay/UltimateManager';
import { HUDManager } from '../systems/HUDManager';
import { DevConsole } from '../systems/DevConsole';

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
  
  private isRunning: boolean = false;
  private gameState: 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover' = 'menu';
  private roomOrder: string[] = [];
  private currentRoomIndex: number = 0;
  private roomCleared: boolean = false;
  private roomSpacing: number = 14;
  private cameraMove: { from: Vector3; to: Vector3; t: number; duration: number; nextIndex: number } | null = null;
  private cameraAlpha: number = 0;
  private cameraBeta: number = 0;
  private cameraRadius: number = 0;

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
    // Initialize Babylon.js engine and scene
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);

    // Load configurations
    await this.configLoader.loadAllConfigs();

    // Setup camera
    const camera = new ArcRotateCamera('mainCamera', Math.PI / 4 - Math.PI / 2 - Math.PI / 12, Math.PI / 5, 30, Vector3.Zero(), this.scene);
    // Completely disable camera controls - no mouse interaction
    camera.inputs.clear();
    this.cameraAlpha = camera.alpha;
    this.cameraBeta = camera.beta;
    this.cameraRadius = camera.radius;

    // Setup lighting
    const light = new HemisphericLight('mainLight', new Vector3(1, 1, 0), this.scene);
    light.intensity = 0.9;

    // Initialize systems
    this.roomManager = new RoomManager(this.scene);
    this.inputManager = new InputManager(canvas, this.scene);
    this.projectileManager = new ProjectileManager(this.scene);
    this.ultimateManager = new UltimateManager(this.scene);
    this.hudManager = new HUDManager(this.scene);
    this.devConsole = new DevConsole(this.scene);

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
        const camera = this.scene.activeCamera;
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
        this.enemySpawner.update(deltaTime, this.playerController.getPosition());

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

        // Update enemy health bars (world-to-screen projection)
        const camera = this.scene.activeCamera;
        if (camera) {
          const engine = this.scene.getEngine();
          const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());

          for (const enemy of enemies) {
            const enemyPos = enemy.getPosition();
            const health = enemy.getHealth();
            if (health) {
              this.hudManager.updateEnemyHealthBar(enemy.getId(), health.getCurrentHP(), health.getMaxHP());

              const screenPos = Vector3.Project(
                enemyPos,
                Matrix.Identity(),
                this.scene.getTransformMatrix(),
                viewport
              );

              this.hudManager.updateEnemyHealthBarPosition(enemy.getId(), screenPos);
            }
          }
        }

        // Room cleared check
        if (!this.roomCleared && enemies.length === 0) {
          this.roomCleared = true;
          this.roomManager.setDoorActive(true);
          this.eventBus.emit(GameEvents.ROOM_CLEARED, { roomId: this.roomOrder[this.currentRoomIndex] });
        }

        // Door trigger -> bonus screen
                      camera.alpha = this.cameraAlpha;
                      camera.beta = this.cameraBeta;
                      camera.radius = this.cameraRadius;
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
    if (!zones.length) return;

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
      const camera = this.scene.activeCamera;
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
      const camera = this.scene.activeCamera;
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

    const camera = this.scene.activeCamera;
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
}
