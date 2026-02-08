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
  private gameState: 'menu' | 'playing' | 'roomclear' | 'gameover' = 'menu';
  private roomOrder: string[] = [];
  private currentRoomIndex: number = 0;
  private roomCleared: boolean = false;

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

    this.eventBus.on(GameEvents.PLAYER_DIED, () => {
      this.gameState = 'gameover';
      this.hudManager.showGameOverScreen();
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
          this.gameState = 'roomclear';
          this.hudManager.showRoomClearScreen();
          this.eventBus.emit(GameEvents.ROOM_CLEARED, { roomId: this.roomOrder[this.currentRoomIndex] });
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

    // Clamp player to walkable interior bounds (matches PlayerController)
    const minX = 1;
    const maxX = 11;
    const minZ = 1;
    const maxZ = 9;
    playerPos.x = Math.max(minX + playerRadius, Math.min(maxX - playerRadius, playerPos.x));
    playerPos.z = Math.max(minZ + playerRadius, Math.min(maxZ - playerRadius, playerPos.z));
    playerPos.y = 1.0;

    this.playerController.setPosition(playerPos);
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
    this.loadRoomByIndex(this.currentRoomIndex);
  }

  private loadNextRoom(): void {
    this.currentRoomIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    this.roomCleared = false;
    this.hudManager.hideOverlays();
    this.gameState = 'playing';
    this.loadRoomByIndex(this.currentRoomIndex);
  }

  private loadRoomByIndex(index: number): void {
    const roomId = this.roomOrder[index];
    this.roomManager.loadRoom(roomId);

    const roomBounds = this.roomManager.getRoomBounds();
    if (roomBounds) {
      const centerX = (roomBounds.minX + roomBounds.maxX) / 2;
      const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2;
      const camera = this.scene.activeCamera;
      if (camera && camera instanceof ArcRotateCamera) {
        camera.setTarget(new Vector3(centerX, 0.5, centerZ));
      }
    }

    const spawnPoint = this.roomManager.getPlayerSpawnPoint(roomId) || Vector3.Zero();
    this.playerController.setPosition(spawnPoint);
    this.playerController.healToFull();
    this.playerController.resetFocusFire();

    this.projectileManager.dispose();
    this.ultimateManager.dispose();

    this.enemySpawner.dispose();
    this.enemySpawner.spawnEnemiesForRoom(roomId);

    this.eventBus.emit(GameEvents.ROOM_ENTERED, { roomId });
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
