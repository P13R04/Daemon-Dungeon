/**
 * PlayerController - Controls the player character (Mage)
 */

import { Scene, Mesh, Vector3, Matrix } from '@babylonjs/core';
import { InputManager } from '../input/InputManager';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { Health } from '../components/Health';
import { MathUtils } from '../utils/Math';
import { ConfigLoader } from '../utils/ConfigLoader';

export class PlayerController {
  private mesh!: Mesh;
  private health!: Health;
  private inputManager: InputManager;
  private eventBus: EventBus;
  private time: Time;
  
  private config: any;
  private position: Vector3 = Vector3.Zero();
  private velocity: Vector3 = Vector3.Zero();
  private speed: number = 5.5;
  
  // Attack
  private attackDirection: Vector3 = new Vector3(1, 0, 0);
  private fireRate: number = 0.15;
  private timeSinceLastAttack: number = 0;
  private baseFireRate: number = 0.15;
  private fireRateBonus: number = 1.0; // Increases when idle
  
  // Passive: Focus Fire
  private isMoving: boolean = false;
  private timeSinceMovement: number = 0;
  private focusFireBonus: number = 1.0;
  private maxFocusFire: number = 2.0;
  
  // Ultimate
  private ultCharge: number = 0;
  private ultCooldown: number = 0;
  private ultChargePerSecond: number = 1 / 30; // 30 second charge
  private hasEnemiesInRoom: boolean = false;
  private gameplayActive: boolean = false;

  constructor(scene: Scene, inputManager: InputManager, config: any) {
    this.scene = scene;
    this.inputManager = inputManager;
    this.config = config;
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();

    this.initialize();
  }

  private scene: Scene;

  private initialize(): void {
    // Create visual
    this.mesh = VisualPlaceholder.createPlayerPlaceholder(this.scene, 'player');
    this.mesh.position.y = 1.0; // Raise above ground
    
    // Setup health
    const maxHP = this.config.mage.baseStats.hp;
    this.health = new Health(maxHP, 'player');

    // Setup attack stats
    const attackConfig = this.config.mage.attack;
    this.fireRate = this.config.mage.baseStats.fireRate;
    this.baseFireRate = this.fireRate;
    this.speed = this.config.mage.baseStats.speed;
  }

  setPosition(position: Vector3): void {
    this.position = position.clone();
    this.mesh.position.copyFrom(position);
  }

  update(deltaTime: number): void {
    if (!this.mesh) return;

    // Update movement
    this.updateMovement(deltaTime);
    
    // Update position (simple movement with room boundaries)
    const newPosition = this.position.add(this.velocity.scale(deltaTime));
    
    // Room boundaries: room_test_1 layout is 9 lines of 15 chars
    // Layout [y][x] maps to world (x, z)
    // Tiles go from 0 to 14 in X (15 tiles), 0 to 8 in Z (9 tiles)
    // Each tile is 2 units, walls are at tile 0 and last tile
    const tileSize = 1.0;
    const minX = 1 * tileSize;     // After left wall (tile 0)
    const maxX = 11 * tileSize;    // Before right wall (tile 12)
    const minZ = 1 * tileSize;     // After top wall (tile 0)
    const maxZ = 9 * tileSize;     // Before bottom wall (tile 10)
    
    // Clamp position within walkable area
    if (newPosition.x >= minX && newPosition.x <= maxX && 
        newPosition.z >= minZ && newPosition.z <= maxZ) {
      this.position = newPosition;
      this.position.y = 1.0; // Keep at visible height
    }
    
    this.mesh.position = this.position;

    // Update attack direction based on mouse
    this.updateAimDirection();

    // Update attack cooldown
    this.timeSinceLastAttack += deltaTime;

    // Update passive (Focus Fire)
    this.updateFocusFire(deltaTime);

    // Update ultimate
    this.updateUltimate(deltaTime);

    // Handle input
    this.handleInput(deltaTime);

    // Reset input frame state
    this.inputManager.updateFrame();
  }

  private updateMovement(deltaTime: number): void {
    const input = this.inputManager.getMovementInput();

    if (input.length() > 0) {
      this.isMoving = true;
      this.timeSinceMovement = 0;
      this.focusFireBonus = 1.0; // Reset focus fire
      
      // Move in XZ plane (top-down)
      this.velocity = new Vector3(input.x, 0, input.z).normalize().scale(this.speed);
    } else {
      this.isMoving = false;
      this.velocity = Vector3.Zero();
      this.timeSinceMovement += deltaTime;
    }
  }

  private updateAimDirection(): void {
    const camera = this.scene.activeCamera;
    if (!camera || !this.mesh) return;

    const engine = this.scene.getEngine();
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const playerScreenPos = Vector3.Project(
      this.mesh.position,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      viewport
    );

    const mousePos = this.inputManager.getMousePosition();
    const direction = mousePos.subtract(playerScreenPos);

    if (direction.length() > 0) {
      this.attackDirection = new Vector3(direction.x, 0, -direction.y).normalize();
    }
  }

  private updateFocusFire(deltaTime: number): void {
    if (!this.isMoving && this.timeSinceMovement > 0) {
      const passiveConfig = this.config.mage.passive;
      const bonusPerSecond = passiveConfig.fireRateBonus;
      const maxBonus = passiveConfig.maxBonus;
      
      this.focusFireBonus = Math.min(
        maxBonus,
        1.0 + (this.timeSinceMovement * bonusPerSecond)
      );
    }
    
    this.fireRate = this.baseFireRate / this.focusFireBonus;
  }

  private updateUltimate(deltaTime: number): void {
    const configLoader = ConfigLoader.getInstance();
    const gameplayConfig = configLoader.getGameplay();

    if (gameplayConfig?.debugConfig?.infiniteUltimate) {
      this.ultCharge = 1.0;
      this.ultCooldown = 0;
      this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_READY, { charge: this.ultCharge });
      return;
    }

    if (this.ultCooldown > 0) {
      this.ultCooldown -= deltaTime;
      this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_READY, { charge: this.ultCharge });
      return;
    }

    // Charge only during gameplay when enemies are present
    if (this.gameplayActive && this.hasEnemiesInRoom) {
      const chargePerSecond = 1 / this.config.mage.ultimate.chargeTime;
      this.ultCharge = Math.min(1.0, this.ultCharge + chargePerSecond * deltaTime);
    }

    this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_READY, { charge: this.ultCharge });
  }

  private handleInput(deltaTime: number): void {
    // Attack (click = single shot, hold = continuous)
    if (this.inputManager.isMouseDown()) {
      if (this.timeSinceLastAttack >= this.fireRate) {
        this.fireProjectile();
        this.timeSinceLastAttack = 0;
      }
    }

    // Ultimate (space)
    if (this.inputManager.isSpacePressed() && this.ultCharge >= 1.0) {
      this.castUltimate();
    }
  }

  private fireProjectile(): void {
    const attackConfig = this.config.mage.attack;
    const damage = this.config.mage.baseStats.damage;

    this.eventBus.emit(GameEvents.PROJECTILE_SPAWNED, {
      position: this.position.clone(),
      direction: this.attackDirection.clone(),
      damage: damage,
      speed: attackConfig.projectileSpeed,
      range: attackConfig.range,
    });

    this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
      attacker: 'player',
      type: 'projectile',
    });
  }

  private castUltimate(): void {
    const ultConfig = this.config.mage.ultimate;
    
    this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_USED, {
      position: this.position.clone(),
      radius: ultConfig.radius,
      damage: ultConfig.damage,
      duration: ultConfig.dotDuration,
      dotTickRate: ultConfig.dotTickRate,
      healPerTick: ultConfig.healPerTick,
    });

    this.ultCharge = 0;
    this.ultCooldown = ultConfig.cooldown;
  }

  getPosition(): Vector3 {
    return this.position.clone();
  }

  getHealth(): Health {
    return this.health;
  }

  getMesh(): Mesh {
    return this.mesh;
  }

  getUltChargePercentage(): number {
    return this.ultCharge;
  }

  getFocusFirePercentage(): number {
    return MathUtils.clamp((this.focusFireBonus - 1) / (this.maxFocusFire - 1), 0, 1);
  }

  setEnemiesPresent(hasEnemies: boolean): void {
    this.hasEnemiesInRoom = hasEnemies;
  }

  setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
  }

  resetFocusFire(): void {
    this.focusFireBonus = 1.0;
    this.timeSinceMovement = 0;
    this.isMoving = false;
    this.fireRate = this.baseFireRate;
  }

  applyDamage(amount: number): void {
    if (!this.health) return;
    this.health.takeDamage(amount);
    this.eventBus.emit(GameEvents.PLAYER_DAMAGED, {
      health: {
        current: this.health.getCurrentHP(),
        max: this.health.getMaxHP(),
      },
      damage: amount,
    });

    if (this.health.getCurrentHP() <= 0) {
      this.eventBus.emit(GameEvents.PLAYER_DIED, { reason: 'damage' });
    }
  }

  heal(amount: number): void {
    if (!this.health || amount <= 0) return;
    this.health.heal(amount);
    this.eventBus.emit(GameEvents.PLAYER_DAMAGED, {
      health: {
        current: this.health.getCurrentHP(),
        max: this.health.getMaxHP(),
      },
      damage: 0,
    });
  }

  healToFull(): void {
    if (!this.health) return;
    const missing = this.health.getMaxHP() - this.health.getCurrentHP();
    if (missing > 0) {
      this.health.heal(missing);
      this.eventBus.emit(GameEvents.PLAYER_DAMAGED, {
        health: {
          current: this.health.getCurrentHP(),
          max: this.health.getMaxHP(),
        },
        damage: 0,
      });
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}
