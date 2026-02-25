/**
 * PlayerController - Controls the player character (Mage)
 */

import { Scene, Mesh, Vector3, Matrix, StandardMaterial, Color3 } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { InputManager } from '../input/InputManager';
import { PlayerAnimationController } from './PlayerAnimationController';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { MathUtils } from '../utils/Math';
import { ConfigLoader } from '../utils/ConfigLoader';

export class PlayerController {
  private mesh!: Mesh;
  private health!: Health;
  private inputManager: InputManager;
  private eventBus: EventBus;
  private time: Time;
  public animationController!: PlayerAnimationController; // Public pour DevConsole
  private modelLoadingPromise: Promise<void> | null = null;
  
  private config: any;
  private position: Vector3 = Vector3.Zero();
  private velocity: Vector3 = Vector3.Zero();
  private knockback: Knockback = new Knockback(10);
  private speed: number = 5.5;
  
  // Direction tracking for model rotation
  private lastMovementDirection: Vector3 = new Vector3(1, 0, 0);
  private lastAttackDirection: Vector3 = new Vector3(1, 0, 0);
  private wasJustAttacking: boolean = false; // Track if we just attacked to show attack direction briefly
  private justAttackingTimeLeft: number = 0; // Time remaining to show attack direction (0.3 seconds)
  
  // Ultimate state tracking
  private wasUltimateActive: boolean = false;
  
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
  private isFiring: boolean = false;
  private poisonBonusPercent: number = 0;
  private poisonDuration: number = 0;
  
  // Ultimate
  private ultCharge: number = 0;
  private ultCooldown: number = 0;
  private ultChargePerSecond: number = 1 / 30; // 30 second charge
  private hasEnemiesInRoom: boolean = false;
  private gameplayActive: boolean = false;

  // Secondary stance (mage posture)
  private secondaryResourceMax: number = 100;
  private secondaryResource: number = 100;
  private secondaryActivationThreshold: number = 25;
  private secondaryDrainPerSecond: number = 12;
  private secondaryRegenPerSecond: number = 16;
  private secondaryBurstCost: number = 50;
  private secondaryZoneRadius: number = 4.2;
  private secondarySlowMultiplier: number = 0.2; // 80% slow
  private secondaryBurstBaseDamage: number = 18;
  private secondaryBurstDamagePerEnemy: number = 8;
  private secondaryBurstDamagePerProjectile: number = 5;
  private secondaryBurstKnockback: number = 2.6;
  private secondaryActive: boolean = false;
  private secondaryLockUntilRightRelease: boolean = false;
  private secondaryZoneMesh: Mesh | null = null;
  private pendingSecondaryBurst: {
    position: Vector3;
    radius: number;
    baseDamage: number;
    damagePerEnemy: number;
    damagePerProjectile: number;
    knockback: number;
  } | null = null;

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
    // Create animation controller and load model asynchronously
    this.animationController = new PlayerAnimationController(this.scene);
    
    // Start loading the mage model (fire and forget, with error handling)
    this.modelLoadingPromise = this.animationController
      .loadModel('/models/player/')
      .then(() => {
        // Get mesh reference from animation controller
        const loadedMesh = this.animationController.getMesh();
        if (loadedMesh) {
          this.mesh = loadedMesh;
          this.mesh.position.y = 1.0; // Raise above ground
          console.log('✓ Player mage model loaded successfully');
        }
      })
      .catch((error) => {
        console.error('Failed to load player model:', error);
        // Fallback: create a simple placeholder if model loading fails
        console.warn('Creating fallback placeholder...');
        this.createFallbackPlaceholder();
      });
    
    // Setup health
    const maxHP = this.config.mage.baseStats.hp;
    this.health = new Health(maxHP, 'player');

    // Setup attack stats
    const attackConfig = this.config.mage.attack;
    this.fireRate = this.config.mage.baseStats.fireRate;
    this.baseFireRate = this.fireRate;
    this.speed = this.config.mage.baseStats.speed;

    this.createSecondaryZoneVisual();
  }

  /**
   * Fallback placeholder creation if model loading fails
   */
  private createFallbackPlaceholder(): void {
    const { MeshBuilder, StandardMaterial, Color3 } = require('@babylonjs/core');
    const cube = MeshBuilder.CreateBox('player_fallback', { size: 0.6 }, this.scene);
    const material = new StandardMaterial('player_mat', this.scene);
    material.diffuseColor = new Color3(0.2, 0.5, 1.0); // Blue
    material.emissiveColor = new Color3(0.1, 0.3, 0.5);
    cube.material = material;
    cube.position.y = 1.0;
    this.mesh = cube;
  }

  setPosition(position: Vector3): void {
    this.position = position.clone();
    this.position.y = 1.0; // Keep player at floor level
    // Use animation controller's setPosition which handles height offset
    this.animationController.setPosition(this.position);
  }

  update(deltaTime: number): void {
    if (!this.mesh) return;

    // Update movement
    this.updateMovement(deltaTime);
    
    // Update position (simple movement with room boundaries)
    const knock = this.knockback.update(deltaTime);
    const newPosition = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    
    this.position = newPosition;
    this.position.y = 1.0; // Keep at floor level
    
    // Update parent position using animation controller (handles height offset)
    this.animationController.setPosition(this.position);

    // Update attack cooldown
    this.timeSinceLastAttack += deltaTime;

    // Update just-attacking flag timer (keep attack direction for 0.3 seconds)
    if (this.wasJustAttacking) {
      this.justAttackingTimeLeft -= deltaTime;
      if (this.justAttackingTimeLeft <= 0) {
        this.wasJustAttacking = false;
      }
    }

    // Update passive (Focus Fire)
    this.updateFocusFire(deltaTime);

    // Update ultimate
    this.updateUltimate(deltaTime);

    // Update animations based on current state
    // Priority: Ultimate > Attack > Movement > Idle
    const isUltimateActive = this.inputManager.isSpaceHeld() && this.ultCharge >= 1.0;
    this.animationController.updateAnimationState(
      this.isMoving,
      this.isFiring,
      isUltimateActive
    );

    // Handle input
    this.handleInput(deltaTime);

    this.updateSecondaryStance(deltaTime);

    // Reset input frame state
    this.inputManager.updateFrame();

    // Update smooth rotation toward target direction
    this.animationController.updateRotation(deltaTime);
  }

  private updateMovement(deltaTime: number): void {
    const input = this.inputManager.getMovementInput();

    if (input.length() > 0) {
      // Reset "just attacking" flag when starting to move
      this.wasJustAttacking = false;
      
      this.isMoving = true;
      this.timeSinceMovement = 0;
      this.focusFireBonus = 1.0; // Reset focus fire
      
      // Move in XZ plane (top-down)
      this.velocity = new Vector3(input.x, 0, input.z).normalize().scale(this.speed);
      
      // Update last movement direction for model rotation
      this.lastMovementDirection = new Vector3(input.x, 0, input.z).normalize();
      
      // Set rotation target (rotation will be interpolated smoothly)
      this.animationController.rotateTowardDirection(this.lastMovementDirection);
    } else {
      this.isMoving = false;
      this.velocity = Vector3.Zero();
      this.timeSinceMovement += deltaTime;
    }
  }

  private updateAimDirection(): void {
    const camera = (this.scene as any).mainCamera ?? this.scene.activeCamera;
    if (!camera) return;

    const mousePos = this.inputManager.getMousePosition();
    
    // Create a ray from mouse position through the scene
    const ray = this.scene.createPickingRay(mousePos.x, mousePos.y, Matrix.Identity(), camera, false);

    // Find where the ray intersects the ground plane (y = 1.0, same as player height)
    if (Math.abs(ray.direction.y) > 0.0001) {
      const t = (1.0 - ray.origin.y) / ray.direction.y;
      if (t > 0) {
        // Point where mouse ray hits the ground plane
        const hitPoint = ray.origin.add(ray.direction.scale(t));
        
        // Calculate direction from player position to this hit point
        const dir = hitPoint.subtract(this.position);
        dir.y = 0; // Flatten to horizontal plane
        
        if (dir.lengthSquared() > 0.0001) {
          this.attackDirection = dir.normalize();
          this.lastAttackDirection = this.attackDirection.clone();
        }
      }
    }
  }

  private updateFocusFire(deltaTime: number): void {
    // Stack only while firing and stationary
    if (this.isFiring && !this.isMoving && this.timeSinceMovement > 0) {
      const passiveConfig = this.config.mage.passive;
      const bonusPerSecond = passiveConfig.fireRateBonus;
      const maxBonus = passiveConfig.maxBonus;
      
      this.focusFireBonus = Math.min(
        maxBonus,
        1.0 + (this.timeSinceMovement * bonusPerSecond)
      );
    } else if (!this.isFiring) {
      // Reset when not firing
      this.focusFireBonus = 1.0;
      this.timeSinceMovement = 0;
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
    this.isFiring = this.inputManager.isMouseDown() && !this.secondaryActive;
    // Attack (click = single shot, hold = continuous)
    if (this.isFiring) {
      // Update aim direction only when firing
      this.updateAimDirection();
      this.wasJustAttacking = true; // Mark that we just attacked
      this.justAttackingTimeLeft = 999; // Keep attack direction indefinitely until we move
      
      if (this.timeSinceLastAttack >= this.fireRate) {
        this.fireProjectile();
        this.timeSinceLastAttack = 0;
      }
    }

    // Ultimate (space) - trigger only once when transitioning from not-ready to ready+pressed
    const isSpaceHeld = this.inputManager.isSpaceHeld();
    const isUltimateReadyAndPressed = isSpaceHeld && this.ultCharge >= 1.0;
    
    if (isUltimateReadyAndPressed && !this.wasUltimateActive) {
      this.castUltimate();
    }
    this.wasUltimateActive = isUltimateReadyAndPressed;

    // Apply rotation based on state
    if (this.isFiring) {
      // While attacking: rotate toward attack direction (mouse aim)
      this.animationController.rotateTowardDirection(this.attackDirection);
    } else if (!this.isMoving) {
      // While idle: keep last movement direction
      // Only briefly show attack direction if we just finished attacking
      if (this.wasJustAttacking) {
        this.animationController.rotateTowardDirection(this.lastAttackDirection);
      } else {
        this.animationController.rotateTowardDirection(this.lastMovementDirection);
      }
    }
    // While moving: rotation is already applied in updateMovement()
  }

  private createSecondaryZoneVisual(): void {
    const mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, 'player_secondary_zone', this.secondaryZoneRadius);
    const material = new StandardMaterial('player_secondary_zone_mat', this.scene);
    material.diffuseColor = new Color3(0.3, 0.8, 1.0);
    material.emissiveColor = new Color3(0.1, 0.35, 0.5);
    material.alpha = 0.25;
    mesh.material = material;
    mesh.isVisible = false;
    mesh.position.y = 1.02;
    this.secondaryZoneMesh = mesh;
  }

  private updateSecondaryStance(deltaTime: number): void {
    const rightHeld = this.inputManager.isRightMouseDown();

    if (!this.gameplayActive) {
      this.secondaryActive = false;
      this.secondaryLockUntilRightRelease = false;
    }

    if (this.secondaryLockUntilRightRelease && !rightHeld) {
      this.secondaryLockUntilRightRelease = false;
    }

    if (!this.secondaryLockUntilRightRelease && rightHeld) {
      if (!this.secondaryActive && this.secondaryResource >= this.secondaryActivationThreshold) {
        this.secondaryActive = true;
      }
    }

    if (!rightHeld) {
      this.secondaryActive = false;
    }

    if (this.secondaryActive) {
      const leftClicked = this.inputManager.isMouseClickedThisFrame();
      if (leftClicked && this.secondaryResource >= this.secondaryBurstCost) {
        this.triggerSecondaryBurst();
        this.secondaryResource = Math.max(0, this.secondaryResource - this.secondaryBurstCost);
        this.secondaryActive = false;
        this.secondaryLockUntilRightRelease = true;
      } else {
        this.secondaryResource = Math.max(0, this.secondaryResource - this.secondaryDrainPerSecond * deltaTime);
        if (this.secondaryResource <= 0) {
          this.secondaryActive = false;
          this.secondaryLockUntilRightRelease = true;
        }
      }
    } else {
      this.secondaryResource = Math.min(this.secondaryResourceMax, this.secondaryResource + this.secondaryRegenPerSecond * deltaTime);
    }

    if (this.secondaryZoneMesh) {
      this.secondaryZoneMesh.isVisible = this.secondaryActive;
      this.secondaryZoneMesh.position.x = this.position.x;
      this.secondaryZoneMesh.position.z = this.position.z;
      this.secondaryZoneMesh.position.y = 1.02;
    }
  }

  private triggerSecondaryBurst(): void {
    this.pendingSecondaryBurst = {
      position: this.position.clone(),
      radius: this.secondaryZoneRadius,
      baseDamage: this.secondaryBurstBaseDamage,
      damagePerEnemy: this.secondaryBurstDamagePerEnemy,
      damagePerProjectile: this.secondaryBurstDamagePerProjectile,
      knockback: this.secondaryBurstKnockback,
    };
  }

  private fireProjectile(): void {
    const attackConfig = this.config.mage.attack;
    const damage = this.config.mage.baseStats.damage;

    // Rotate model to face attack direction at moment of firing
    console.log(`🎯 Attack fired, rotating to: x=${this.attackDirection.x.toFixed(2)}, z=${this.attackDirection.z.toFixed(2)}`);
    this.animationController.rotateTowardDirection(this.attackDirection);

    this.eventBus.emit(GameEvents.PROJECTILE_SPAWNED, {
      position: this.position.clone(),
      direction: this.attackDirection.clone(),
      damage: damage,
      speed: attackConfig.projectileSpeed,
      range: attackConfig.range,
      friendly: true,
    });

    this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
      attacker: 'player',
      type: 'projectile',
    });
  }

  private castUltimate(): void {
    const ultConfig = this.config.mage.ultimate;
    
    // Rotate model to face attack direction when casting ultimate
    this.animationController.rotateTowardDirection(this.attackDirection);
    
    // Set callback to emit event when animation finishes
    this.animationController.setOnUltimateAnimationFinished(() => {
      this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_USED, {
        position: this.position.clone(),
        radius: ultConfig.radius,
        damage: ultConfig.damage,
        duration: ultConfig.dotDuration,
        dotTickRate: ultConfig.dotTickRate,
        healPerTick: ultConfig.healPerTick,
      });
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

  getMoveSpeed(): number {
    return this.speed;
  }

  getCurrentFireRate(): number {
    return this.fireRate;
  }

  getBaseFireRate(): number {
    return this.baseFireRate;
  }

  getFocusFireBonusValue(): number {
    return this.focusFireBonus;
  }

  getVelocity(): Vector3 {
    return this.velocity.clone();
  }

  applyMaxHpMultiplier(multiplier: number): void {
    const maxHP = Math.floor(this.health.getMaxHP() * multiplier);
    this.health.setMaxHP(maxHP, true);
    this.eventBus.emit(GameEvents.PLAYER_DAMAGED, {
      health: {
        current: this.health.getCurrentHP(),
        max: this.health.getMaxHP(),
      },
      damage: 0,
    });
  }

  applyMoveSpeedMultiplier(multiplier: number): void {
    this.speed *= multiplier;
  }

  enablePoisonBonus(percent: number, duration: number): void {
    this.poisonBonusPercent += percent;
    this.poisonDuration = Math.max(this.poisonDuration, duration);
  }

  getPoisonBonus(): { percent: number; duration: number } {
    return { percent: this.poisonBonusPercent, duration: this.poisonDuration };
  }

  isSecondaryActive(): boolean {
    return this.secondaryActive;
  }

  getSecondaryZoneRadius(): number {
    return this.secondaryZoneRadius;
  }

  getSecondarySlowMultiplier(): number {
    return this.secondarySlowMultiplier;
  }

  getSecondaryResourceCurrent(): number {
    return this.secondaryResource;
  }

  getSecondaryResourceMax(): number {
    return this.secondaryResourceMax;
  }

  getSecondaryActivationThreshold(): number {
    return this.secondaryActivationThreshold;
  }

  consumePendingSecondaryBurst(): {
    position: Vector3;
    radius: number;
    baseDamage: number;
    damagePerEnemy: number;
    damagePerProjectile: number;
    knockback: number;
  } | null {
    const payload = this.pendingSecondaryBurst;
    this.pendingSecondaryBurst = null;
    return payload;
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
    const configLoader = ConfigLoader.getInstance();
    const gameplayConfig = configLoader.getGameplay();
    if (gameplayConfig?.debugConfig?.godMode) {
      return;
    }
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

  applyKnockback(force: Vector3): void {
    this.knockback.apply(force);
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
    if (this.secondaryZoneMesh) {
      this.secondaryZoneMesh.dispose();
      this.secondaryZoneMesh = null;
    }
    if (this.mesh) {
      this.mesh.dispose();
    }
    if (this.animationController) {
      this.animationController.dispose();
    }
  }
}
