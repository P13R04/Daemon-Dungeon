/**
 * PlayerController - Controls the player character (Mage)
 */

import { Scene, Mesh, Vector3, Matrix, StandardMaterial, Color3, MeshBuilder } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { InputManager } from '../input/InputManager';
import { PlayerAnimationController } from './PlayerAnimationController';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { MathUtils } from '../utils/Math';
import { ConfigLoader } from '../utils/ConfigLoader';

type PlayerClassId = 'mage' | 'firewall' | 'rogue';

export class PlayerController {
  private mesh!: Mesh;
  private health!: Health;
  private inputManager: InputManager;
  private eventBus: EventBus;
  private time: Time;
  public animationController!: PlayerAnimationController; // Public pour DevConsole
  private modelLoadingPromise: Promise<void> | null = null;
  
  private config: any;
  private classId: PlayerClassId;
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
  private attackTargetPoint: Vector3 | null = null;
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

  // Tank gameplay
  private tankShieldActive: boolean = false;
  private tankShieldLockUntilRightRelease: boolean = false;
  private tankShieldFrontalAngleDeg: number = 95;
  private tankProjectileReflectMultiplier: number = 1;
  private tankMeleeBlockRatio: number = 1;
  private tankStanceResourceMax: number = 100;
  private tankStanceResource: number = 100;
  private tankStanceActivationThreshold: number = 20;
  private tankStanceDrainPerSecond: number = 16;
  private tankStanceRegenPerSecond: number = 18;
  private tankShieldBashCost: number = 25;
  private tankPassiveRiposteMeleeRatio: number = 0.35;
  private tankPrimaryRange: number = 2.8;
  private tankPrimaryConeAngleDeg: number = 70;
  private tankPrimaryDamage: number = 28;
  private tankPrimaryKnockback: number = 1.4;
  private tankShieldBashDamage: number = 26;
  private tankShieldBashDashSpeed: number = 14;
  private tankShieldBashDuration: number = 0.25;
  private tankShieldBashHitRadius: number = 1.5;
  private tankShieldBashKnockback: number = 3.2;
  private tankShieldBashStunDuration: number = 1.0;
  private tankShieldBashCooldown: number = 0.9;
  private tankShieldBashCooldownTimer: number = 0;
  private tankShieldBashRemaining: number = 0;
  private tankShieldBashDirection: Vector3 = new Vector3(1, 0, 0);
  private pendingTankSweep: {
    origin: Vector3;
    direction: Vector3;
    range: number;
    coneAngleDeg: number;
    damage: number;
    knockback: number;
  } | null = null;
  private pendingTankShieldBash: {
    origin: Vector3;
    radius: number;
    damage: number;
    knockback: number;
    stunDuration: number;
  } | null = null;
  private pendingTankUltimate: {
    position: Vector3;
    radius: number;
    damage: number;
    stunDuration: number;
    pullStrength: number;
  } | null = null;

  // Rogue gameplay
  private rogueStealthActive: boolean = false;
  private rogueStealthLockUntilRightRelease: boolean = false;
  private rogueStealthResourceMax: number = 100;
  private rogueStealthResource: number = 100;
  private rogueStealthActivationThreshold: number = 18;
  private rogueStealthDrainPerSecond: number = 14;
  private rogueStealthRegenPerSecond: number = 20;
  private rogueStealthZoneRadius: number = 4.5;
  private rogueCritChance: number = 0.22;
  private rogueCritMultiplier: number = 2.0;
  private roguePrimaryRange: number = 1.9;
  private roguePrimaryConeAngleDeg: number = 65;
  private roguePrimaryDamage: number = 18;
  private roguePrimaryKnockback: number = 0.9;
  private rogueDashCost: number = 28;
  private rogueDashSpeed: number = 18;
  private rogueDashDuration: number = 0.32;
  private rogueDashHitRadius: number = 1.05;
  private rogueDashDamage: number = 28;
  private rogueDashKnockback: number = 1.6;
  private rogueDashCooldown: number = 0.7;
  private rogueDashCooldownTimer: number = 0;
  private rogueDashRemaining: number = 0;
  private rogueDashDistanceRemaining: number = 0;
  private rogueDashDirection: Vector3 = new Vector3(1, 0, 0);
  private rogueDashStartPosition: Vector3 = Vector3.Zero();
  private rogueUltimateDuration: number = 6;
  private rogueUltimateZoneRadius: number = 5.5;
  private rogueUltimateHitDamage: number = 22;
  private rogueUltimateTeleportInterval: number = 0.22;
  private rogueUltimateTeleportOffset: number = 0.8;
  private rogueUltimateActive: boolean = false;
  private pendingRogueStrike: {
    origin: Vector3;
    direction: Vector3;
    range: number;
    coneAngleDeg: number;
    damage: number;
    knockback: number;
  } | null = null;
  private pendingRogueDashAttack: {
    from: Vector3;
    to: Vector3;
    radius: number;
    damage: number;
    knockback: number;
  } | null = null;
  private pendingRogueUltimate: {
    duration: number;
    zoneRadius: number;
    hitDamage: number;
    teleportInterval: number;
    teleportOffset: number;
  } | null = null;

  constructor(scene: Scene, inputManager: InputManager, config: any, classId: PlayerClassId = 'mage') {
    this.scene = scene;
    this.inputManager = inputManager;
    this.config = config;
    this.classId = classId;
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();

    this.initialize();
  }

  private scene: Scene;

  private initialize(): void {
    if (this.classId === 'mage') {
      this.animationController = new PlayerAnimationController(this.scene);
      this.modelLoadingPromise = this.animationController
        .loadModel('/models/player/')
        .then(() => {
          const loadedMesh = this.animationController.getMesh();
          if (loadedMesh) {
            this.mesh = loadedMesh;
            this.mesh.position.y = 1.0;
            console.log('✓ Player mage model loaded successfully');
          }
        })
        .catch((error) => {
          console.error('Failed to load player model:', error);
          this.createFallbackPlaceholder();
        });
    } else {
      this.createClassPlaceholder(this.classId);
    }

    const classConfig = this.config[this.classId] ?? this.config.mage;
    const maxHP = classConfig.baseStats.hp;
    this.health = new Health(maxHP, 'player');

    this.fireRate = classConfig.baseStats.fireRate;
    this.baseFireRate = this.fireRate;
    this.speed = classConfig.baseStats.speed;

    if (this.classId === 'mage') {
      this.applySecondaryConfig();
      this.createSecondaryZoneVisual();
    }

    if (this.classId === 'firewall') {
      this.applyTankConfig();
    }

    if (this.classId === 'rogue') {
      this.applyRogueConfig();
    }
  }

  private createClassPlaceholder(classId: PlayerClassId): void {
    const cube = MeshBuilder.CreateBox(`player_${classId}_placeholder`, { size: 0.8 }, this.scene);
    const material = new StandardMaterial(`player_${classId}_mat`, this.scene);
    if (classId === 'firewall') {
      material.diffuseColor = new Color3(1.0, 0.45, 0.25);
      material.emissiveColor = new Color3(0.35, 0.15, 0.08);
    } else {
      material.diffuseColor = new Color3(0.6, 0.9, 0.35);
      material.emissiveColor = new Color3(0.2, 0.35, 0.12);
    }
    cube.material = material;
    cube.position.y = 1.0;
    this.mesh = cube;
  }

  private applyTankConfig(): void {
    const tank = this.config?.firewall ?? {};
    const attack = tank.attack ?? {};
    const shield = tank.shield ?? {};
    const bash = tank.shieldBash ?? {};
    const passive = tank.passive ?? {};

    this.tankPrimaryRange = this.readPositiveNumber(attack.range, this.tankPrimaryRange);
    this.tankPrimaryConeAngleDeg = this.readPositiveNumber(attack.coneAngleDeg, this.tankPrimaryConeAngleDeg);
    this.tankPrimaryDamage = this.readPositiveNumber(attack.damage, this.tankPrimaryDamage);
    this.tankPrimaryKnockback = this.readPositiveNumber(attack.knockback, this.tankPrimaryKnockback);

    this.tankShieldFrontalAngleDeg = this.readPositiveNumber(shield.frontalAngleDeg, this.tankShieldFrontalAngleDeg);
    this.tankProjectileReflectMultiplier = this.readPositiveNumber(shield.projectileReflectMultiplier, this.tankProjectileReflectMultiplier);
    this.tankMeleeBlockRatio = this.readClampedNumber(shield.meleeBlockRatio, this.tankMeleeBlockRatio, 0, 1);
    this.tankStanceResourceMax = this.readPositiveNumber(shield.resourceMax, this.tankStanceResourceMax);
    this.tankStanceActivationThreshold = this.readClampedNumber(
      shield.activationThreshold,
      this.tankStanceActivationThreshold,
      0,
      this.tankStanceResourceMax
    );
    this.tankStanceDrainPerSecond = this.readPositiveNumber(shield.drainPerSecond, this.tankStanceDrainPerSecond);
    this.tankStanceRegenPerSecond = this.readPositiveNumber(shield.regenPerSecond, this.tankStanceRegenPerSecond);

    this.tankShieldBashDamage = this.readPositiveNumber(bash.damage, this.tankShieldBashDamage);
    this.tankShieldBashDashSpeed = this.readPositiveNumber(bash.dashSpeed, this.tankShieldBashDashSpeed);
    this.tankShieldBashDuration = this.readPositiveNumber(bash.dashDuration, this.tankShieldBashDuration);
    this.tankShieldBashHitRadius = this.readPositiveNumber(bash.hitRadius, this.tankShieldBashHitRadius);
    this.tankShieldBashKnockback = this.readPositiveNumber(bash.knockback, this.tankShieldBashKnockback);
    this.tankShieldBashStunDuration = this.readPositiveNumber(bash.stunDuration, this.tankShieldBashStunDuration);
    this.tankShieldBashCooldown = this.readPositiveNumber(bash.cooldown, this.tankShieldBashCooldown);
    this.tankShieldBashCost = this.readClampedNumber(
      bash.cost,
      this.tankShieldBashCost,
      0,
      this.tankStanceResourceMax
    );

    this.tankPassiveRiposteMeleeRatio = this.readClampedNumber(passive.riposteMeleeRatio, this.tankPassiveRiposteMeleeRatio, 0, 1);
    this.tankStanceResource = this.tankStanceResourceMax;
  }

  private applySecondaryConfig(): void {
    const secondary = this.config?.mage?.secondary ?? {};

    this.secondaryResourceMax = this.readPositiveNumber(secondary.resourceMax, this.secondaryResourceMax);
    this.secondaryActivationThreshold = this.readClampedNumber(
      secondary.activationThreshold,
      this.secondaryActivationThreshold,
      0,
      this.secondaryResourceMax
    );
    this.secondaryDrainPerSecond = this.readPositiveNumber(secondary.drainPerSecond, this.secondaryDrainPerSecond);
    this.secondaryRegenPerSecond = this.readPositiveNumber(secondary.regenPerSecond, this.secondaryRegenPerSecond);
    this.secondaryBurstCost = this.readClampedNumber(
      secondary.burstCost,
      this.secondaryBurstCost,
      0,
      this.secondaryResourceMax
    );
    this.secondaryZoneRadius = this.readPositiveNumber(secondary.zoneRadius, this.secondaryZoneRadius);
    this.secondarySlowMultiplier = this.readClampedNumber(secondary.slowMultiplier, this.secondarySlowMultiplier, 0.05, 1);
    this.secondaryBurstBaseDamage = this.readPositiveNumber(secondary.burstBaseDamage, this.secondaryBurstBaseDamage);
    this.secondaryBurstDamagePerEnemy = this.readPositiveNumber(secondary.burstDamagePerEnemy, this.secondaryBurstDamagePerEnemy);
    this.secondaryBurstDamagePerProjectile = this.readPositiveNumber(
      secondary.burstDamagePerProjectile,
      this.secondaryBurstDamagePerProjectile
    );
    this.secondaryBurstKnockback = this.readPositiveNumber(secondary.burstKnockback, this.secondaryBurstKnockback);

    this.secondaryResource = this.secondaryResourceMax;
  }

  private applyRogueConfig(): void {
    const rogue = this.config?.rogue ?? {};
    const attack = rogue.attack ?? {};
    const stealth = rogue.stealth ?? {};
    const dash = rogue.dashAttack ?? {};
    const passive = rogue.passive ?? {};
    const ultimate = rogue.ultimate ?? {};

    this.roguePrimaryRange = this.readPositiveNumber(attack.range, this.roguePrimaryRange);
    this.roguePrimaryConeAngleDeg = this.readPositiveNumber(attack.coneAngleDeg, this.roguePrimaryConeAngleDeg);
    this.roguePrimaryDamage = this.readPositiveNumber(attack.damage, this.roguePrimaryDamage);
    this.roguePrimaryKnockback = this.readPositiveNumber(attack.knockback, this.roguePrimaryKnockback);

    this.rogueStealthResourceMax = this.readPositiveNumber(stealth.resourceMax, this.rogueStealthResourceMax);
    this.rogueStealthActivationThreshold = this.readClampedNumber(
      stealth.activationThreshold,
      this.rogueStealthActivationThreshold,
      0,
      this.rogueStealthResourceMax
    );
    this.rogueStealthDrainPerSecond = this.readPositiveNumber(stealth.drainPerSecond, this.rogueStealthDrainPerSecond);
    this.rogueStealthRegenPerSecond = this.readPositiveNumber(stealth.regenPerSecond, this.rogueStealthRegenPerSecond);
    this.rogueStealthZoneRadius = this.readPositiveNumber(stealth.zoneRadius, this.rogueStealthZoneRadius);

    this.rogueDashCost = this.readClampedNumber(dash.cost, this.rogueDashCost, 0, this.rogueStealthResourceMax);
    this.rogueDashSpeed = this.readPositiveNumber(dash.dashSpeed, this.rogueDashSpeed);
    this.rogueDashDuration = this.readPositiveNumber(dash.dashDuration, this.rogueDashDuration);
    this.rogueDashHitRadius = this.readPositiveNumber(dash.hitRadius, this.rogueDashHitRadius);
    this.rogueDashDamage = this.readPositiveNumber(dash.damage, this.rogueDashDamage);
    this.rogueDashKnockback = this.readPositiveNumber(dash.knockback, this.rogueDashKnockback);
    this.rogueDashCooldown = this.readPositiveNumber(dash.cooldown, this.rogueDashCooldown);

    this.rogueCritChance = this.readClampedNumber(passive.critChance, this.rogueCritChance, 0, 1);
    this.rogueCritMultiplier = this.readPositiveNumber(passive.critMultiplier, this.rogueCritMultiplier);

    this.rogueUltimateDuration = this.readPositiveNumber(ultimate.duration, this.rogueUltimateDuration);
    this.rogueUltimateZoneRadius = this.readPositiveNumber(ultimate.zoneRadius, this.rogueUltimateZoneRadius);
    this.rogueUltimateHitDamage = this.readPositiveNumber(ultimate.hitDamage, this.rogueUltimateHitDamage);
    this.rogueUltimateTeleportInterval = this.readPositiveNumber(ultimate.teleportInterval, this.rogueUltimateTeleportInterval);
    this.rogueUltimateTeleportOffset = this.readPositiveNumber(ultimate.teleportOffset, this.rogueUltimateTeleportOffset);

    this.rogueStealthResource = this.rogueStealthResourceMax;
  }

  private readPositiveNumber(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  }

  private readClampedNumber(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Fallback placeholder creation if model loading fails
   */
  private createFallbackPlaceholder(): void {
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
    if (this.animationController) {
      this.animationController.setPosition(this.position);
    } else if (this.mesh) {
      this.mesh.position.copyFrom(this.position);
    }
  }

  update(deltaTime: number): void {
    if (!this.mesh) return;

    if (this.tankShieldBashCooldownTimer > 0) {
      this.tankShieldBashCooldownTimer = Math.max(0, this.tankShieldBashCooldownTimer - deltaTime);
    }
    if (this.rogueDashCooldownTimer > 0) {
      this.rogueDashCooldownTimer = Math.max(0, this.rogueDashCooldownTimer - deltaTime);
    }

    // Update movement
    this.updateMovement(deltaTime);

    if (this.classId === 'firewall' && this.tankShieldBashRemaining > 0) {
      this.velocity = this.tankShieldBashDirection.scale(this.tankShieldBashDashSpeed);
      this.tankShieldBashRemaining = Math.max(0, this.tankShieldBashRemaining - deltaTime);
      if (this.tankShieldBashRemaining <= 0) {
        this.pendingTankShieldBash = {
          origin: this.position.clone(),
          radius: this.tankShieldBashHitRadius,
          damage: this.tankShieldBashDamage,
          knockback: this.tankShieldBashKnockback,
          stunDuration: this.tankShieldBashStunDuration,
        };
      }
    }
    if (this.classId === 'rogue' && this.rogueDashRemaining > 0) {
      this.velocity = this.rogueDashDirection.scale(this.rogueDashSpeed);
      const dashStep = this.rogueDashSpeed * deltaTime;
      this.rogueDashDistanceRemaining = Math.max(0, this.rogueDashDistanceRemaining - dashStep);
      this.rogueDashRemaining = Math.max(0, this.rogueDashRemaining - deltaTime);
      if (this.rogueDashRemaining <= 0 || this.rogueDashDistanceRemaining <= 0) {
        this.pendingRogueDashAttack = {
          from: this.rogueDashStartPosition.clone(),
          to: this.position.clone(),
          radius: this.rogueDashHitRadius,
          damage: this.computeRogueDamage(this.rogueDashDamage),
          knockback: this.rogueDashKnockback,
        };
        this.rogueDashRemaining = 0;
        this.rogueDashDistanceRemaining = 0;
      }
    }
    
    // Update position (simple movement with room boundaries)
    const knock = this.knockback.update(deltaTime);
    const newPosition = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    
    this.position = newPosition;
    this.position.y = 1.0; // Keep at floor level
    
    // Update parent position using animation controller (handles height offset)
    if (this.animationController) {
      this.animationController.setPosition(this.position);
    } else {
      this.mesh.position.copyFrom(this.position);
    }

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
    if (this.classId === 'mage') {
      this.updateFocusFire(deltaTime);
    }

    // Update ultimate
    this.updateUltimate(deltaTime);

    // Update animations based on current state
    // Priority: Ultimate > Attack > Movement > Idle
    if (this.animationController) {
      const isUltimateActive = this.inputManager.isSpaceHeld() && this.ultCharge >= 1.0;
      this.animationController.updateAnimationState(
        this.isMoving,
        this.isFiring,
        isUltimateActive
      );
    }

    // Handle input
    this.handleInput(deltaTime);

    if (this.classId === 'mage') {
      this.updateSecondaryStance(deltaTime);
    } else if (this.classId === 'firewall') {
      this.updateTankStance(deltaTime);
    } else if (this.classId === 'rogue') {
      this.updateRogueStealth(deltaTime);
    } else {
      this.secondaryActive = false;
      if (this.secondaryZoneMesh) {
        this.secondaryZoneMesh.isVisible = false;
      }
    }

    // Reset input frame state
    this.inputManager.updateFrame();

    // Update smooth rotation toward target direction
    if (this.animationController) {
      this.animationController.updateRotation(deltaTime);
    }
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
      if (this.animationController) {
        this.animationController.rotateTowardDirection(this.lastMovementDirection);
      }
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
          this.attackTargetPoint = hitPoint.clone();
        }
      }
    }
  }

  private updateFocusFire(deltaTime: number): void {
    // Stack only while firing and stationary
    if (this.classId !== 'mage') {
      this.focusFireBonus = 1.0;
      this.fireRate = this.baseFireRate;
      return;
    }

    if (this.isFiring && !this.isMoving && this.timeSinceMovement > 0) {
      const passiveConfig = this.config.mage?.passive ?? { fireRateBonus: 0, maxBonus: 1 };
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
      const classConfig = this.config[this.classId] ?? this.config.mage;
      const chargeTime = Math.max(0.01, classConfig.ultimate?.chargeTime ?? 14);
      const chargePerSecond = 1 / chargeTime;
      this.ultCharge = Math.min(1.0, this.ultCharge + chargePerSecond * deltaTime);
    }

    this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_READY, { charge: this.ultCharge });
  }

  private handleInput(deltaTime: number): void {
    this.updateAimDirection();

    const leftHeld = this.inputManager.isMouseDown();
    const leftClicked = this.inputManager.isMouseClickedThisFrame();
    const rightHeld = this.inputManager.isRightMouseDown();

    if (this.classId === 'firewall') {
      if (this.tankShieldLockUntilRightRelease && !rightHeld) {
        this.tankShieldLockUntilRightRelease = false;
      }
      if (!this.tankShieldLockUntilRightRelease && rightHeld && this.tankStanceResource >= this.tankStanceActivationThreshold) {
        this.tankShieldActive = true;
      } else if (!rightHeld) {
        this.tankShieldActive = false;
      }

      this.isFiring = leftHeld;
      if (this.tankShieldActive && leftClicked && this.tankShieldBashCooldownTimer <= 0 && this.tankShieldBashRemaining <= 0 && this.tankStanceResource >= this.tankShieldBashCost) {
        this.tankShieldBashDirection = this.attackDirection.clone();
        this.tankShieldBashRemaining = this.tankShieldBashDuration;
        this.tankShieldBashCooldownTimer = this.tankShieldBashCooldown;
        this.tankStanceResource = Math.max(0, this.tankStanceResource - this.tankShieldBashCost);
        this.tankShieldActive = false;
        this.tankShieldLockUntilRightRelease = true;
      } else if (!this.tankShieldActive && this.timeSinceLastAttack >= this.fireRate && leftHeld) {
        this.pendingTankSweep = {
          origin: this.position.clone(),
          direction: this.attackDirection.clone(),
          range: this.tankPrimaryRange,
          coneAngleDeg: this.tankPrimaryConeAngleDeg,
          damage: this.tankPrimaryDamage,
          knockback: this.tankPrimaryKnockback,
        };
        this.timeSinceLastAttack = 0;
      }
    } else if (this.classId === 'rogue') {
      if (this.rogueStealthLockUntilRightRelease && !rightHeld) {
        this.rogueStealthLockUntilRightRelease = false;
      }
      if (!this.rogueStealthLockUntilRightRelease && rightHeld && this.rogueStealthResource >= this.rogueStealthActivationThreshold) {
        this.rogueStealthActive = true;
      } else if (!rightHeld) {
        this.rogueStealthActive = false;
      }

      this.isFiring = leftHeld;
      if (
        this.rogueStealthActive &&
        leftClicked &&
        this.rogueDashCooldownTimer <= 0 &&
        this.rogueDashRemaining <= 0 &&
        this.rogueStealthResource >= this.rogueDashCost
      ) {
        const maxDashDistance = this.rogueDashSpeed * this.rogueDashDuration;
        const targetDistance = this.attackTargetPoint
          ? Vector3.Distance(this.position, this.attackTargetPoint)
          : maxDashDistance;
        const actualDistance = Math.max(0.001, Math.min(maxDashDistance, targetDistance));
        this.rogueDashDirection = this.attackDirection.clone();
        this.rogueDashStartPosition = this.position.clone();
        this.rogueDashDistanceRemaining = actualDistance;
        this.rogueDashRemaining = actualDistance / this.rogueDashSpeed;
        this.rogueDashCooldownTimer = this.rogueDashCooldown;
        this.rogueStealthResource = Math.max(0, this.rogueStealthResource - this.rogueDashCost);
        this.rogueStealthActive = false;
        this.rogueStealthLockUntilRightRelease = true;
        this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
          attacker: 'player',
          type: 'melee',
        });
      } else if (!this.rogueStealthActive && this.rogueDashRemaining <= 0 && this.timeSinceLastAttack >= this.fireRate && leftHeld) {
        this.pendingRogueStrike = {
          origin: this.position.clone(),
          direction: this.attackDirection.clone(),
          range: this.roguePrimaryRange,
          coneAngleDeg: this.roguePrimaryConeAngleDeg,
          damage: this.computeRogueDamage(this.roguePrimaryDamage),
          knockback: this.roguePrimaryKnockback,
        };
        this.timeSinceLastAttack = 0;
        this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
          attacker: 'player',
          type: 'melee',
        });
      }
    } else {
      this.isFiring = leftHeld && !this.secondaryActive;
      if (this.isFiring) {
        this.wasJustAttacking = true;
        this.justAttackingTimeLeft = 999;
        if (this.timeSinceLastAttack >= this.fireRate) {
          this.fireProjectile();
          this.timeSinceLastAttack = 0;
        }
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
    if (this.animationController) {
      if (this.isFiring) {
        this.animationController.rotateTowardDirection(this.attackDirection);
      } else if (!this.isMoving) {
        if (this.wasJustAttacking) {
          this.animationController.rotateTowardDirection(this.lastAttackDirection);
        } else {
          this.animationController.rotateTowardDirection(this.lastMovementDirection);
        }
      }
    } else if (this.mesh) {
      const rotY = Math.atan2(this.attackDirection.x, this.attackDirection.z);
      this.mesh.rotation.y = rotY;
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
    if (this.classId !== 'mage') {
      this.secondaryActive = false;
      if (this.secondaryZoneMesh) this.secondaryZoneMesh.isVisible = false;
      return;
    }

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

  private updateTankStance(deltaTime: number): void {
    const rightHeld = this.inputManager.isRightMouseDown();

    if (!this.gameplayActive) {
      this.tankShieldActive = false;
      this.tankShieldLockUntilRightRelease = false;
    }

    if (this.tankShieldLockUntilRightRelease && !rightHeld) {
      this.tankShieldLockUntilRightRelease = false;
    }

    if (!this.tankShieldLockUntilRightRelease && rightHeld) {
      if (!this.tankShieldActive && this.tankStanceResource >= this.tankStanceActivationThreshold) {
        this.tankShieldActive = true;
      }
    }

    if (!rightHeld) {
      this.tankShieldActive = false;
    }

    if (this.tankShieldActive) {
      this.tankStanceResource = Math.max(0, this.tankStanceResource - this.tankStanceDrainPerSecond * deltaTime);
      if (this.tankStanceResource <= 0) {
        this.tankShieldActive = false;
        this.tankShieldLockUntilRightRelease = true;
      }
    } else {
      this.tankStanceResource = Math.min(this.tankStanceResourceMax, this.tankStanceResource + this.tankStanceRegenPerSecond * deltaTime);
    }
  }

  private updateRogueStealth(deltaTime: number): void {
    const rightHeld = this.inputManager.isRightMouseDown();

    if (!this.gameplayActive) {
      this.rogueStealthActive = false;
      this.rogueStealthLockUntilRightRelease = false;
    }

    if (this.rogueStealthLockUntilRightRelease && !rightHeld) {
      this.rogueStealthLockUntilRightRelease = false;
    }

    if (!this.rogueStealthLockUntilRightRelease && rightHeld) {
      if (!this.rogueStealthActive && this.rogueStealthResource >= this.rogueStealthActivationThreshold) {
        this.rogueStealthActive = true;
      }
    }

    if (!rightHeld) {
      this.rogueStealthActive = false;
    }

    if (this.rogueStealthActive) {
      this.rogueStealthResource = Math.max(0, this.rogueStealthResource - this.rogueStealthDrainPerSecond * deltaTime);
      if (this.rogueStealthResource <= 0) {
        this.rogueStealthActive = false;
        this.rogueStealthLockUntilRightRelease = true;
      }
    } else {
      this.rogueStealthResource = Math.min(this.rogueStealthResourceMax, this.rogueStealthResource + this.rogueStealthRegenPerSecond * deltaTime);
    }
  }

  private computeRogueDamage(baseDamage: number): number {
    if (this.classId !== 'rogue') return baseDamage;
    const isCrit = Math.random() < this.rogueCritChance;
    return isCrit ? baseDamage * this.rogueCritMultiplier : baseDamage;
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
    const classConfig = this.config[this.classId] ?? this.config.mage;
    const attackConfig = classConfig.attack;
    const damage = classConfig.baseStats.damage;

    // Rotate model to face attack direction at moment of firing
    console.log(`🎯 Attack fired, rotating to: x=${this.attackDirection.x.toFixed(2)}, z=${this.attackDirection.z.toFixed(2)}`);
    if (this.animationController) {
      this.animationController.rotateTowardDirection(this.attackDirection);
    }

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
    if (this.classId === 'firewall') {
      const ultConfig = this.config.firewall?.ultimate ?? {};
      this.pendingTankUltimate = {
        position: this.position.clone(),
        radius: this.readPositiveNumber(ultConfig.radius, 4.2),
        damage: this.readPositiveNumber(ultConfig.damage, 60),
        stunDuration: this.readPositiveNumber(ultConfig.stunDuration, 1.2),
        pullStrength: this.readPositiveNumber(ultConfig.pullStrength, 4.0),
      };
      this.ultCharge = 0;
      this.ultCooldown = this.readPositiveNumber(ultConfig.cooldown, 14);
      return;
    }

    if (this.classId === 'rogue') {
      const ultConfig = this.config.rogue?.ultimate ?? {};
      this.pendingRogueUltimate = {
        duration: this.readPositiveNumber(ultConfig.duration, this.rogueUltimateDuration),
        zoneRadius: this.readPositiveNumber(ultConfig.zoneRadius, this.rogueUltimateZoneRadius),
        hitDamage: this.readPositiveNumber(ultConfig.hitDamage, this.rogueUltimateHitDamage),
        teleportInterval: this.readPositiveNumber(ultConfig.teleportInterval, this.rogueUltimateTeleportInterval),
        teleportOffset: this.readPositiveNumber(ultConfig.teleportOffset, this.rogueUltimateTeleportOffset),
      };
      this.ultCharge = 0;
      this.ultCooldown = this.readPositiveNumber(ultConfig.cooldown, 13);
      return;
    }

    const ultConfig = this.config.mage.ultimate;
    if (this.animationController) {
      this.animationController.rotateTowardDirection(this.attackDirection);
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
    } else {
      this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_USED, {
        position: this.position.clone(),
        radius: ultConfig.radius,
        damage: ultConfig.damage,
        duration: ultConfig.dotDuration,
        dotTickRate: ultConfig.dotTickRate,
        healPerTick: ultConfig.healPerTick,
      });
    }
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
    if (this.classId !== 'mage') return 0;
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
    if (this.classId === 'mage') return this.secondaryActive;
    if (this.classId === 'firewall') return this.tankShieldActive;
    if (this.classId === 'rogue') return this.rogueStealthActive;
    return false;
  }

  getSecondaryZoneRadius(): number {
    if (this.classId === 'mage') return this.secondaryZoneRadius;
    if (this.classId === 'rogue') return this.rogueStealthZoneRadius;
    return 0;
  }

  getSecondarySlowMultiplier(): number {
    if (this.classId === 'mage') return this.secondarySlowMultiplier;
    return 1;
  }

  getSecondaryResourceCurrent(): number {
    if (this.classId === 'mage') return this.secondaryResource;
    if (this.classId === 'firewall') return this.tankStanceResource;
    if (this.classId === 'rogue') return this.rogueStealthResource;
    return 0;
  }

  getSecondaryResourceMax(): number {
    if (this.classId === 'mage') return this.secondaryResourceMax;
    if (this.classId === 'firewall') return this.tankStanceResourceMax;
    if (this.classId === 'rogue') return this.rogueStealthResourceMax;
    return 0;
  }

  getSecondaryActivationThreshold(): number {
    if (this.classId === 'mage') return this.secondaryActivationThreshold;
    if (this.classId === 'firewall') return this.tankStanceActivationThreshold;
    if (this.classId === 'rogue') return this.rogueStealthActivationThreshold;
    return 0;
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

  getClassId(): PlayerClassId {
    return this.classId;
  }

  isTankShieldActive(): boolean {
    return this.classId === 'firewall' && this.tankShieldActive;
  }

  canBlockMeleeFrom(attackerPosition: Vector3): boolean {
    if (!this.isTankShieldActive()) return false;
    const toAttacker = attackerPosition.subtract(this.position);
    toAttacker.y = 0;
    if (toAttacker.lengthSquared() <= 0.0001) return true;
    const attackerDir = toAttacker.normalize();
    const facing = this.attackDirection.lengthSquared() > 0.0001 ? this.attackDirection.normalize() : this.lastMovementDirection.normalize();
    const dot = Vector3.Dot(facing, attackerDir);
    const maxAngle = (this.tankShieldFrontalAngleDeg * Math.PI) / 180;
    return Math.acos(Math.max(-1, Math.min(1, dot))) <= maxAngle * 0.5;
  }

  getTankMeleeBlockRatio(): number {
    return this.classId === 'firewall' ? this.tankMeleeBlockRatio : 0;
  }

  getTankRiposteMeleeRatio(): number {
    return this.classId === 'firewall' ? this.tankPassiveRiposteMeleeRatio : 0;
  }

  reflectProjectileIfShielding(projectilePosition: Vector3, projectileDamage: number, projectileDirection: Vector3): {
    position: Vector3;
    direction: Vector3;
    damage: number;
    speedMultiplier: number;
  } | null {
    if (!this.canBlockMeleeFrom(projectilePosition)) return null;
    const reflectedDirection = projectileDirection.scale(-1).normalize();
    return {
      position: this.position.add(reflectedDirection.scale(0.8)),
      direction: reflectedDirection,
      damage: Math.max(1, projectileDamage * this.tankProjectileReflectMultiplier),
      speedMultiplier: 1.1,
    };
  }

  consumePendingTankSweep(): {
    origin: Vector3;
    direction: Vector3;
    range: number;
    coneAngleDeg: number;
    damage: number;
    knockback: number;
  } | null {
    const payload = this.pendingTankSweep;
    this.pendingTankSweep = null;
    return payload;
  }

  consumePendingTankShieldBash(): {
    origin: Vector3;
    radius: number;
    damage: number;
    knockback: number;
    stunDuration: number;
  } | null {
    const payload = this.pendingTankShieldBash;
    this.pendingTankShieldBash = null;
    return payload;
  }

  consumePendingTankUltimate(): {
    position: Vector3;
    radius: number;
    damage: number;
    stunDuration: number;
    pullStrength: number;
  } | null {
    const payload = this.pendingTankUltimate;
    this.pendingTankUltimate = null;
    return payload;
  }

  consumePendingRogueStrike(): {
    origin: Vector3;
    direction: Vector3;
    range: number;
    coneAngleDeg: number;
    damage: number;
    knockback: number;
  } | null {
    const payload = this.pendingRogueStrike;
    this.pendingRogueStrike = null;
    return payload;
  }

  consumePendingRogueDashAttack(): {
    from: Vector3;
    to: Vector3;
    radius: number;
    damage: number;
    knockback: number;
  } | null {
    const payload = this.pendingRogueDashAttack;
    this.pendingRogueDashAttack = null;
    return payload;
  }

  consumePendingRogueUltimate(): {
    duration: number;
    zoneRadius: number;
    hitDamage: number;
    teleportInterval: number;
    teleportOffset: number;
  } | null {
    const payload = this.pendingRogueUltimate;
    this.pendingRogueUltimate = null;
    return payload;
  }

  setRogueUltimateActive(active: boolean): void {
    if (this.classId !== 'rogue') {
      this.rogueUltimateActive = false;
      return;
    }
    this.rogueUltimateActive = active;
  }

  getRogueStealthRadius(): number {
    return this.classId === 'rogue' ? this.rogueStealthZoneRadius : 0;
  }

  computeRogueHitDamage(baseDamage: number): number {
    return this.computeRogueDamage(baseDamage);
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
    if (this.classId === 'rogue' && this.rogueUltimateActive) {
      return;
    }
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
