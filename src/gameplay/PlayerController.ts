/**
 * PlayerController - Controls the player character (Mage, Tank, Rogue)
 */

import {
  Scene,
  Mesh,
  Vector3,
  Matrix,
  StandardMaterial,
  Color3,
  MeshBuilder,
  Camera,
  ParticleSystem,
  DynamicTexture,
  Color4,
} from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { InputManager } from '../input/InputManager';
import { PlayerAnimationController, AnimationState } from './PlayerAnimationController';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { MathUtils } from '../utils/Math';
import { ConfigLoader } from '../utils/ConfigLoader';
import { GameSettings, GameSettingsStore } from '../settings/GameSettings';
import { BONUS_TUNING } from '../data/bonuses/bonusTuning';
import { SCENE_LAYER } from '../ui/uiLayers';
import type {
  PlayerConfig,
  PlayerClassConfig,
  PlayerFirewallAttackConfig,
  PlayerFirewallPassiveConfig,
  PlayerFirewallShieldBashConfig,
  PlayerFirewallShieldConfig,
  PlayerMageSecondaryConfig,
  PlayerRogueAttackConfig,
  PlayerRogueDashAttackConfig,
  PlayerRoguePassiveConfig,
  PlayerRogueStealthConfig,
  PlayerRogueUltimateConfig,
} from '../types/config';

type PlayerClassId = 'mage' | 'firewall' | 'rogue' | 'cat';
type SceneWithMainCamera = Scene & { mainCamera?: Camera };

export class PlayerController {
  private static readonly MODEL_VERTICAL_TILE_FIX = 1.8;
  private static readonly ROGUE_MODEL_VERTICAL_TILE_FIX = 1.5;

  private mesh!: Mesh;
  private health!: Health;
  private inputManager: InputManager;
  private eventBus: EventBus;
  private time: Time;
  public animationController!: PlayerAnimationController; // Public pour DevConsole
  private modelLoadingPromise: Promise<void> | null = null;
  
  private config: PlayerConfig;
  private classId: PlayerClassId;
  private position: Vector3 = Vector3.Zero();
  private velocity: Vector3 = Vector3.Zero();
  private externalVerticalOffset: number = 0;
  private renderVisibility: number = 1;
  private stealthVisibilityMultiplier: number = 1;
  private knockback: Knockback = new Knockback(10);
  private speed: number = 5.5;
  private movementDustCooldown: number = 0;
  private movementDustParticleTexture: DynamicTexture | null = null;
  private mageAmbientAuraParticles: ParticleSystem | null = null;
  private tankAmbientArcParticles: ParticleSystem | null = null;
  private mageAmbientParticleTexture: DynamicTexture | null = null;
  private tankAmbientParticleTexture: DynamicTexture | null = null;
  
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

  // Bonus runtime state (room-to-room build progression)
  private bonusDodgeChance: number = 0;
  private bonusCritChance: number = 0;
  private bonusCritMultiplier: number = 0;
  private bonusUltChargeRateMultiplier: number = 1;
  private bonusUltDurationMultiplier: number = 1;
  private bonusStanceEfficiencyMultiplier: number = 1;
  private mageArcMultishotStacks: number = 0;
  private mageDualBurstStacks: number = 0;
  private mageBounceStacks: number = 0;
  private magePierceStacks: number = 0;
  private mageReactiveAoeStacks: number = 0;
  private mageImpactAoeStacks: number = 0;
  private mageReactiveAoeCooldownRemaining: number = 0;
  private mageAutolockEnabled: boolean = false;
  private rogueLifestealRatio: number = 0;
  private rogueChainDamageRatio: number = 0;
  private rogueChainRadius: number = 0;
  private rogueChainMaxTargets: number = 0;
  private firewallThornsDamageRatio: number = 0;
  private firewallDamageReductionRatio: number = 0;
  
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
  private secondaryZoneVisualRadius: number = 1;
  private secondaryZoneParticles: ParticleSystem | null = null;
  private mageSecondaryParticleTexture: DynamicTexture | null = null;
  private pendingSecondaryBurst: {
    position: Vector3;
    radius: number;
    baseDamage: number;
    damagePerEnemy: number;
    damagePerProjectile: number;
    knockback: number;
  } | null = null;
  private pendingMageReactiveBurst: {
    position: Vector3;
    radius: number;
    damage: number;
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
  private tankShieldBashGroupDistance: number = 1.5;
  private tankShieldBashGroupWidth: number = 1.1;
  private tankShieldBashPullStrength: number = 4.2;
  private tankShieldBashForwardPush: number = 2.0;
  private tankShieldBashCooldown: number = 0.9;
  private tankShieldBashCooldownTimer: number = 0;
  private tankShieldBashRemaining: number = 0;
  private tankShieldBashRecoveryDuration: number = 0.14;
  private tankShieldBashRecoveryTimer: number = 0;
  private tankShieldBashDirection: Vector3 = new Vector3(1, 0, 0);
  private pendingTankSweep: {
    origin: Vector3;
    direction: Vector3;
    swingDirection: 'left' | 'right';
    range: number;
    coneAngleDeg: number;
    damage: number;
    knockback: number;
  } | null = null;
  private tankComboSecondSwingPending: boolean = false;
  private tankComboSecondSwingTimer: number = 0;
  private tankComboDirection: Vector3 = new Vector3(1, 0, 0);
  private pendingTankShieldBash: {
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
  } | null = null;
  private pendingTankUltimate: {
    position: Vector3;
    radius: number;
    damage: number;
    stunDuration: number;
    knockbackStrength: number;
    tickInterval: number;
    duration: number; // Duration before animation ends
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
  private rogueOpeningStrikeMultiplier: number = 1.8;
  private rogueOpeningStrikeWindow: number = 2.2;
  private rogueOpeningStrikeTimer: number = 0;
  private rogueOpeningStrikeReady: boolean = false;
  private rogueUltimateDuration: number = 6;
  private rogueUltimateZoneRadius: number = 5.5;
  private rogueUltimateHitDamage: number = 22;
  private rogueUltimateTeleportInterval: number = 0.22;
  private rogueUltimateTeleportOffset: number = 0.8;
  private rogueUltimateActive: boolean = false;
  private tankUltimateActive: boolean = false;
  private rogueStealthZoneMesh: Mesh | null = null;
  private rogueStealthZoneVisualRadius: number = 1;
  private rogueAmbientGlitchParticles: ParticleSystem | null = null;
  private rogueParticleTexture: DynamicTexture | null = null;
  private rogueDashImpactPending: boolean = false;
  private rogueDashTrailLastPoint: Vector3 | null = null;
  private rogueDashTrailAccumulatedDistance: number = 0;
  private pendingRogueDashTrailSegments: Array<{
    from: Vector3;
    to: Vector3;
    radius: number;
  }> = [];
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
  private damageBoostTimer: number = 0;
  private damageBoostMultiplier: number = 1;
  private damageReductionTimer: number = 0;
  private damageReductionRatio: number = 0;
  private catGodModeEnabled: boolean = false;
  private benchmarkInvulnerable: boolean = false;
  private catContactDamage: number = 260;
  private keyboardOnlyMode: boolean = false;
  private autoAimTowardMovement: boolean = true;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(scene: Scene, inputManager: InputManager, config: PlayerConfig, classId: PlayerClassId = 'mage') {
    this.scene = scene;
    this.inputManager = inputManager;
    this.config = config;
    this.classId = classId;
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.applySettings(GameSettingsStore.get());
    this.unsubscribeSettings = GameSettingsStore.subscribe((settings) => {
      this.applySettings(settings);
    });

    this.initialize();
  }

  private scene: Scene;

  private initialize(): void {
    if (this.classId === 'mage') {
      this.animationController = new PlayerAnimationController(this.scene, 'mage');
      this.modelLoadingPromise = this.animationController
        .loadModel('models/player/')
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
    } else if (this.classId === 'firewall') {
      this.animationController = new PlayerAnimationController(this.scene, 'firewall');
      this.modelLoadingPromise = this.animationController
        .loadModel('models/player/')
        .then(() => {
          const loadedMesh = this.animationController.getMesh();
          if (loadedMesh) {
            this.mesh = loadedMesh;
            this.mesh.position.y = 1.0;
            console.log('✓ Player tank model loaded successfully');
          }
        })
        .catch((error) => {
          console.error('Failed to load player tank model:', error);
          this.createClassPlaceholder(this.classId);
        });
    } else if (this.classId === 'rogue') {
      this.animationController = new PlayerAnimationController(this.scene, 'rogue');
      this.modelLoadingPromise = this.animationController
        .loadModel('models/player/')
        .then(() => {
          const loadedMesh = this.animationController.getMesh();
          if (loadedMesh) {
            this.mesh = loadedMesh;
            this.mesh.position.y = 1.0;
            console.log('✓ Player rogue model loaded successfully');
          }
        })
        .catch((error) => {
          console.error('Failed to load player rogue model:', error);
          this.createClassPlaceholder(this.classId);
        });
    } else if (this.classId === 'cat') {
      this.animationController = new PlayerAnimationController(this.scene, 'cat');
      this.modelLoadingPromise = this.animationController
        .loadModel('/models/player/')
        .then(() => {
          const loadedMesh = this.animationController.getMesh();
          if (loadedMesh) {
            this.mesh = loadedMesh;
            this.mesh.position.y = 1.0;
            console.log('✓ Player cat model loaded successfully');
          }
        })
        .catch((error) => {
          console.error('Failed to load player cat model:', error);
          this.createClassPlaceholder(this.classId);
        });
    } else {
      this.createClassPlaceholder(this.classId);
    }

    const classConfig = this.getCurrentClassConfig();
    const maxHP = classConfig.baseStats.hp;
    this.health = new Health(maxHP, 'player');

    this.fireRate = classConfig.baseStats.fireRate;
    this.baseFireRate = this.fireRate;
    this.speed = classConfig.baseStats.speed;

    if (this.classId === 'mage') {
      this.applySecondaryConfig();
      this.createSecondaryZoneVisual();
      this.startMageAmbientAuraParticles();
    }

    if (this.classId === 'firewall') {
      this.applyTankConfig();
      this.startTankAmbientArcParticles();
    }

    if (this.isRogueLikeClass()) {
      this.applyRogueConfig();
      this.createRogueStealthZoneVisual();
      if (this.classId === 'rogue') {
        this.startRogueAmbientGlitchParticles();
      }
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
    const attack = (tank.attack ?? {}) as PlayerFirewallAttackConfig;
    const shield = (tank.shield ?? {}) as PlayerFirewallShieldConfig;
    const bash = (tank.shieldBash ?? {}) as PlayerFirewallShieldBashConfig;
    const passive = (tank.passive ?? {}) as PlayerFirewallPassiveConfig;

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
    this.tankShieldBashGroupDistance = this.readPositiveNumber(bash.groupDistance, this.tankShieldBashGroupDistance);
    this.tankShieldBashGroupWidth = this.readPositiveNumber(bash.groupWidth, this.tankShieldBashGroupWidth);
    this.tankShieldBashPullStrength = this.readPositiveNumber(bash.pullStrength, this.tankShieldBashPullStrength);
    this.tankShieldBashForwardPush = this.readPositiveNumber(bash.forwardPush, this.tankShieldBashForwardPush);
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
    const secondary = (this.config?.mage?.secondary ?? {}) as PlayerMageSecondaryConfig;

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
    const attack = (rogue.attack ?? {}) as PlayerRogueAttackConfig;
    const stealth = (rogue.stealth ?? {}) as PlayerRogueStealthConfig;
    const dash = (rogue.dashAttack ?? {}) as PlayerRogueDashAttackConfig;
    const passive = (rogue.passive ?? {}) as PlayerRoguePassiveConfig;
    const ultimate = (rogue.ultimate ?? {}) as PlayerRogueUltimateConfig;

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
    this.rogueOpeningStrikeMultiplier = this.readPositiveNumber(dash.openingStrikeMultiplier, this.rogueOpeningStrikeMultiplier);
    this.rogueOpeningStrikeWindow = this.readPositiveNumber(dash.openingStrikeWindow, this.rogueOpeningStrikeWindow);

    this.rogueCritChance = this.readClampedNumber(passive.critChance, this.rogueCritChance, 0, 1);
    this.rogueCritMultiplier = this.readPositiveNumber(passive.critMultiplier, this.rogueCritMultiplier);

    this.rogueUltimateDuration = this.readPositiveNumber(ultimate.duration, this.rogueUltimateDuration);
    this.rogueUltimateZoneRadius = this.readPositiveNumber(ultimate.zoneRadius, this.rogueUltimateZoneRadius);
    this.rogueUltimateHitDamage = this.readPositiveNumber(ultimate.hitDamage, this.rogueUltimateHitDamage);
    this.rogueUltimateTeleportInterval = this.readPositiveNumber(ultimate.teleportInterval, this.rogueUltimateTeleportInterval);
    this.rogueUltimateTeleportOffset = this.readPositiveNumber(ultimate.teleportOffset, this.rogueUltimateTeleportOffset);

    this.rogueStealthResource = this.rogueStealthResourceMax;
    this.rogueOpeningStrikeReady = false;
    this.rogueOpeningStrikeTimer = 0;
  }

  private getCritChance(): number {
    return Math.max(0, Math.min(1, this.bonusCritChance));
  }

  private getCritMultiplier(): number {
    return BONUS_TUNING.general.critMultiplierBase + Math.max(0, this.bonusCritMultiplier);
  }

  private getRogueCritChance(): number {
    return Math.max(0, Math.min(1, this.rogueCritChance + this.bonusCritChance));
  }

  private getRogueCritMultiplier(): number {
    return this.rogueCritMultiplier + Math.max(0, this.bonusCritMultiplier);
  }

  private getStanceEfficiencyMultiplier(): number {
    return Math.max(1, this.bonusStanceEfficiencyMultiplier);
  }

  private getUltimateChargeRateMultiplier(): number {
    return Math.max(1, this.bonusUltChargeRateMultiplier);
  }

  private getUltimateDurationMultiplier(): number {
    return Math.max(1, this.bonusUltDurationMultiplier);
  }

  private rollCrit(baseDamage: number, critChance: number, critMultiplier: number): number {
    if (!Number.isFinite(baseDamage) || baseDamage <= 0) return 0;
    if (critChance <= 0 || critMultiplier <= 1) return baseDamage;
    return Math.random() < critChance ? baseDamage * critMultiplier : baseDamage;
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

  private isRogueLikeClass(): boolean {
    return this.classId === 'rogue' || this.classId === 'cat';
  }

  private getCurrentClassConfig(): PlayerClassConfig {
    if (this.classId === 'cat') {
      return this.config.rogue;
    }
    return this.config[this.classId] ?? this.config.mage;
  }

  isCatGodModeActive(): boolean {
    return this.classId === 'cat' && this.catGodModeEnabled;
  }

  getCatContactDamage(): number {
    if (!this.isCatGodModeActive()) return 0;
    return Math.max(1, this.computeOutgoingDamage(this.catContactDamage, true));
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
    this.syncVisualPosition();
  }

  setExternalVerticalOffset(offset: number): void {
    this.externalVerticalOffset = Number.isFinite(offset) ? offset : 0;
    this.syncVisualPosition();
  }

  getExternalVerticalOffset(): number {
    return this.externalVerticalOffset;
  }

  setRenderVisibility(visibility: number): void {
    this.renderVisibility = Math.max(0, Math.min(1, Number.isFinite(visibility) ? visibility : 1));
    this.syncVisualPosition();
  }

  getRenderVisibility(): number {
    return this.renderVisibility;
  }

  private syncVisualPosition(): void {
    const renderPosition = this.position.clone();
    const animHeightOffset = this.animationController ? this.animationController.getHeightOffset() : 0;
    renderPosition.y = 1.0 + this.externalVerticalOffset - animHeightOffset + this.getClassModelVisualOffsetY();
    const effectiveVisibility = Math.max(0, Math.min(1, this.renderVisibility * this.stealthVisibilityMultiplier));
    if (this.animationController) {
      this.animationController.setPosition(renderPosition);
      this.animationController.setVisibility(effectiveVisibility);
    } else if (this.mesh) {
      this.mesh.position.copyFrom(renderPosition);
      this.mesh.visibility = effectiveVisibility;
    }
  }

  private getClassModelVisualOffsetY(): number {
    // Mage and firewall rigs sit visually too high in isometric view; lower by one tile.
    if (this.classId === 'mage' || this.classId === 'firewall') {
      return -PlayerController.MODEL_VERTICAL_TILE_FIX;
    }
    if (this.classId === 'rogue') {
      return -PlayerController.ROGUE_MODEL_VERTICAL_TILE_FIX;
    }
    return 0;
  }

  update(deltaTime: number): void {
    if (!this.mesh) return;
    const previousPosition = this.position.clone();
    const rogueDashWasActiveAtFrameStart = this.isRogueLikeClass() && this.rogueDashRemaining > 0;

    if (this.damageBoostTimer > 0) {
      this.damageBoostTimer = Math.max(0, this.damageBoostTimer - deltaTime);
      if (this.damageBoostTimer <= 0) {
        this.damageBoostMultiplier = 1;
      }
    }
    if (this.damageReductionTimer > 0) {
      this.damageReductionTimer = Math.max(0, this.damageReductionTimer - deltaTime);
      if (this.damageReductionTimer <= 0) {
        this.damageReductionRatio = 0;
      }
    }
    if (this.mageReactiveAoeCooldownRemaining > 0) {
      this.mageReactiveAoeCooldownRemaining = Math.max(0, this.mageReactiveAoeCooldownRemaining - deltaTime);
    }

    if (this.tankShieldBashCooldownTimer > 0) {
      this.tankShieldBashCooldownTimer = Math.max(0, this.tankShieldBashCooldownTimer - deltaTime);
    }
    if (this.tankShieldBashRecoveryTimer > 0) {
      this.tankShieldBashRecoveryTimer = Math.max(0, this.tankShieldBashRecoveryTimer - deltaTime);
    }
    if (this.classId === 'firewall' && this.tankComboSecondSwingPending) {
      this.tankComboSecondSwingTimer = Math.max(0, this.tankComboSecondSwingTimer - deltaTime);
      if (this.tankShieldBashRemaining > 0) {
        this.tankComboSecondSwingPending = false;
      } else if (this.tankComboSecondSwingTimer <= 0) {
        this.pendingTankSweep = {
          origin: this.position.clone(),
          direction: this.attackDirection.clone(),
          swingDirection: 'right',
          range: this.tankPrimaryRange,
          coneAngleDeg: this.tankPrimaryConeAngleDeg,
          damage: this.computeOutgoingDamage(this.tankPrimaryDamage),
          knockback: this.tankPrimaryKnockback,
        };
        this.tankComboSecondSwingPending = false;
      }
    }
    if (this.rogueDashCooldownTimer > 0) {
      this.rogueDashCooldownTimer = Math.max(0, this.rogueDashCooldownTimer - deltaTime);
    }
    if (this.rogueOpeningStrikeTimer > 0) {
      this.rogueOpeningStrikeTimer = Math.max(0, this.rogueOpeningStrikeTimer - deltaTime);
      if (this.rogueOpeningStrikeTimer <= 0) {
        this.rogueOpeningStrikeReady = false;
      }
    }

    // Update movement
    this.updateMovement(deltaTime);

    if (this.classId === 'firewall' && this.tankShieldBashRemaining > 0) {
      this.velocity = this.tankShieldBashDirection.scale(this.tankShieldBashDashSpeed);
      this.tankShieldBashRemaining = Math.max(0, this.tankShieldBashRemaining - deltaTime);
      this.pendingTankShieldBash = {
        origin: this.position.clone(),
        direction: this.tankShieldBashDirection.clone(),
        radius: this.tankShieldBashHitRadius,
        damage: 0,
        knockback: this.tankShieldBashKnockback,
        stunDuration: 0,
        groupDistance: this.tankShieldBashGroupDistance,
        groupWidth: this.tankShieldBashGroupWidth,
        pullStrength: this.tankShieldBashPullStrength,
        forwardPush: this.tankShieldBashForwardPush,
        isFinisher: false,
      };
      if (this.tankShieldBashRemaining <= 0) {
        this.tankShieldBashRecoveryTimer = this.tankShieldBashRecoveryDuration;
        this.pendingTankShieldBash = {
          origin: this.position.clone(),
          direction: this.tankShieldBashDirection.clone(),
          radius: this.tankShieldBashHitRadius,
          damage: this.tankShieldBashDamage,
          knockback: this.tankShieldBashKnockback,
          stunDuration: this.tankShieldBashStunDuration,
          groupDistance: this.tankShieldBashGroupDistance,
          groupWidth: this.tankShieldBashGroupWidth,
          pullStrength: this.tankShieldBashPullStrength,
          forwardPush: this.tankShieldBashForwardPush,
          isFinisher: true,
        };
      }
    }
    if (this.isRogueLikeClass() && this.rogueDashRemaining > 0) {
      this.velocity = this.rogueDashDirection.scale(this.rogueDashSpeed);
      const dashStep = this.rogueDashSpeed * deltaTime;
      this.rogueDashDistanceRemaining = Math.max(0, this.rogueDashDistanceRemaining - dashStep);
      this.rogueDashRemaining = Math.max(0, this.rogueDashRemaining - deltaTime);
      if (this.rogueDashRemaining <= 0 || this.rogueDashDistanceRemaining <= 0) {
        this.rogueDashRemaining = 0;
        this.rogueDashDistanceRemaining = 0;
        this.rogueDashImpactPending = true;
        if (this.animationController && this.animationController.getCurrentState() === AnimationState.DASH) {
          this.animationController.playAnimation(this.isMoving ? AnimationState.WALKING : AnimationState.IDLE);
        }
      }
    }
    
    // Update position (simple movement with room boundaries)
    const knock = this.knockback.update(deltaTime);
    const newPosition = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    
    this.position = newPosition;
    this.position.y = 1.0; // Keep at floor level

    const rogueDashIsActiveAfterMovement = this.isRogueLikeClass() && (this.rogueDashRemaining > 0 || this.rogueDashImpactPending);
    if (rogueDashWasActiveAtFrameStart || rogueDashIsActiveAfterMovement) {
      this.queueRogueDashTrailSegment(previousPosition, this.position);
    }

    // Update parent position using animation controller (handles height offset)
    this.syncVisualPosition();

    if (this.isRogueLikeClass() && this.rogueDashImpactPending) {
      if (this.rogueDashTrailLastPoint && Vector3.Distance(this.rogueDashTrailLastPoint, this.position) > 0.01) {
        this.pendingRogueDashTrailSegments.push({
          from: this.rogueDashTrailLastPoint.clone(),
          to: this.position.clone(),
          radius: this.rogueDashHitRadius,
        });
      }
      this.pendingRogueDashAttack = {
        from: this.rogueDashStartPosition.clone(),
        to: this.position.clone(),
        radius: this.rogueDashHitRadius,
        damage: this.computeRogueDamage(this.rogueDashDamage),
        knockback: this.rogueDashKnockback,
      };
      this.rogueDashImpactPending = false;
      this.rogueDashTrailLastPoint = null;
      this.rogueDashTrailAccumulatedDistance = 0;
    }

    this.updateMovementDust(deltaTime);
    this.updateAmbientClassParticles();

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
      const forceStealthWalk = this.isRogueLikeClass() && this.rogueStealthActive && this.rogueDashRemaining <= 0;
      const animationMoving = this.isMoving || forceStealthWalk;
      this.animationController.updateAnimationState(
        animationMoving,
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
    } else if (this.isRogueLikeClass()) {
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
    // During tank ultimate, keep model orientation frozen.
    if (this.animationController && !(this.classId === 'firewall' && this.tankUltimateActive)) {
      this.animationController.updateRotation(deltaTime);
    }

    if (this.classId === 'firewall' && this.animationController) {
      this.animationController.updateTankThrusterState(this.isMoving, this.tankShieldBashRemaining > 0);
      this.animationController.updateTankThrusterVelocity(this.velocity);
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
      if (this.animationController && !(this.classId === 'firewall' && this.tankUltimateActive)) {
        this.animationController.rotateTowardDirection(this.lastMovementDirection);
      }
    } else {
      this.isMoving = false;
      this.velocity = Vector3.Zero();
      this.timeSinceMovement += deltaTime;
    }
  }

  private updateAimDirection(): void {
    if (this.keyboardOnlyMode && this.autoAimTowardMovement) {
      this.updateAimDirectionFromMovement();
      return;
    }

    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
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

  private updateAimDirectionFromMovement(): void {
    let sourceDirection = this.lastMovementDirection;
    if (sourceDirection.lengthSquared() < 0.0001) {
      sourceDirection = this.lastAttackDirection;
    }
    if (sourceDirection.lengthSquared() < 0.0001) {
      sourceDirection = new Vector3(0, 0, 1);
    }

    const snappedDirection = this.quantizeToEightDirections(sourceDirection);
    this.attackDirection = snappedDirection;
    this.lastAttackDirection = snappedDirection.clone();
    this.attackTargetPoint = this.position.add(snappedDirection.scale(8));
  }

  private quantizeToEightDirections(direction: Vector3): Vector3 {
    const flat = new Vector3(direction.x, 0, direction.z);
    if (flat.lengthSquared() < 0.0001) {
      return new Vector3(0, 0, 1);
    }

    const angle = Math.atan2(flat.x, flat.z);
    const step = Math.PI / 4;
    const snappedAngle = Math.round(angle / step) * step;
    const snapped = new Vector3(Math.sin(snappedAngle), 0, Math.cos(snappedAngle));
    return snapped.normalize();
  }

  private computeMageAttackAnimationSpeed(): number {
    if (!this.animationController) return 1;
    const baseDuration = this.animationController.getPrimaryAttackBaseDurationSeconds();
    const targetDuration = Math.max(0.06, this.fireRate * 0.9);
    const speed = baseDuration / targetDuration;
    return MathUtils.clamp(speed, 0.85, 4.5);
  }

  private computeRogueAttackAnimationSpeed(): number {
    if (this.classId !== 'rogue' || !this.animationController) return 1;
    const baseDuration = this.animationController.getPrimaryAttackBaseDurationSeconds();
    const targetDuration = Math.max(0.05, this.fireRate * 0.82);
    const speed = baseDuration / targetDuration;
    return MathUtils.clamp(Math.max(1.25, speed), 1.25, 5.5);
  }

  private computeRogueDashAnimationSpeed(actualDistance: number, maxDashDistance: number): number {
    if (this.classId !== 'rogue' || !this.animationController) return 1;

    const baseDuration = this.animationController.getDashBaseDurationSeconds();
    const dashTravelTime = actualDistance / Math.max(0.001, this.rogueDashSpeed);
    const targetDuration = Math.max(0.05, dashTravelTime);
    const cadenceSpeed = baseDuration / targetDuration;

    void maxDashDistance;
    return MathUtils.clamp(cadenceSpeed, 0.35, 6.0);
  }

  private applySettings(settings: GameSettings): void {
    this.keyboardOnlyMode = !!settings.controls.keyboardOnlyMode;
    this.autoAimTowardMovement = !!settings.controls.autoAimTowardMovement;
    this.catGodModeEnabled = !!settings.accessibility.catGodModeEnabled;
  }

  private updateFocusFire(deltaTime: number): void {
    // Stack only while firing and stationary
    if (this.classId !== 'mage') {
      this.focusFireBonus = 1.0;
      this.fireRate = this.baseFireRate;
      return;
    }

    if (this.isFiring && !this.isMoving && this.timeSinceMovement > 0) {
      const passiveConfig = (this.config.mage?.passive as { fireRateBonus?: number; maxBonus?: number } | undefined) ?? {};
      const bonusPerSecond = this.readPositiveNumber(passiveConfig.fireRateBonus, 0);
      const maxBonus = this.readPositiveNumber(passiveConfig.maxBonus, 1);
      
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
    const gameplayConfig = configLoader.getGameplayConfig();

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
      const classConfig = this.getCurrentClassConfig();
      const chargeTime = Math.max(
        0.01,
        this.readPositiveNumber((classConfig.ultimate as { chargeTime?: number } | undefined)?.chargeTime, 14)
      );
      const chargePerSecond = (1 / chargeTime) * this.getUltimateChargeRateMultiplier();
      this.ultCharge = Math.min(1.0, this.ultCharge + chargePerSecond * deltaTime);
    }

    this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_READY, { charge: this.ultCharge });
  }

  private handleInput(deltaTime: number): void {
    this.updateAimDirection();

    void deltaTime;

    const leftHeld = this.inputManager.isMouseDown();
    const leftClicked = this.inputManager.isMouseClickedThisFrame();
    const rightHeld = this.inputManager.isRightMouseDown();
    const slot1Held = this.inputManager.isAttackSlotHeld(1) || leftHeld;
    const slot1Pressed = this.inputManager.isAttackSlotPressedThisFrame(1) || leftClicked;
    const slot2Held = this.inputManager.isAttackSlotHeld(2) || rightHeld;

    if (this.classId === 'firewall') {
      if (this.tankShieldLockUntilRightRelease && !slot2Held) {
        this.tankShieldLockUntilRightRelease = false;
      }
      if (!this.tankShieldLockUntilRightRelease && slot2Held && this.tankStanceResource >= this.tankStanceActivationThreshold) {
        if (!this.tankShieldActive) {
          this.tankShieldActive = true;
          this.animationController.activateShield();
        }
      } else if (!slot2Held && this.tankShieldActive) {
        this.tankShieldActive = false;
        this.animationController.deactivateShield();
      }

      this.isFiring = slot1Held;
      if (this.tankShieldActive && slot1Pressed && this.tankShieldBashCooldownTimer <= 0 && this.tankShieldBashRemaining <= 0 && this.tankStanceResource >= this.tankShieldBashCost) {
        this.tankShieldBashDirection = this.attackDirection.clone();
        this.tankShieldBashRemaining = this.tankShieldBashDuration;
        this.tankComboSecondSwingPending = false;
        this.tankShieldBashCooldownTimer = this.tankShieldBashCooldown;
        this.tankStanceResource = Math.max(0, this.tankStanceResource - this.tankShieldBashCost);
        this.tankShieldActive = false;
        this.tankShieldLockUntilRightRelease = true;
        this.animationController.playShieldBash();
      } else if (
        !this.tankShieldActive &&
        this.tankShieldBashRemaining <= 0 &&
        this.tankShieldBashRecoveryTimer <= 0 &&
        !this.tankComboSecondSwingPending &&
        this.timeSinceLastAttack >= this.fireRate &&
        slot1Held
      ) {
        this.pendingTankSweep = {
          origin: this.position.clone(),
          direction: this.attackDirection.clone(),
          swingDirection: 'left',
          range: this.tankPrimaryRange,
          coneAngleDeg: this.tankPrimaryConeAngleDeg,
          damage: this.computeOutgoingDamage(this.tankPrimaryDamage),
          knockback: this.tankPrimaryKnockback,
        };
        this.tankComboDirection = this.attackDirection.clone();
        this.tankComboSecondSwingPending = true;
        this.tankComboSecondSwingTimer = this.fireRate * 0.5;
        this.timeSinceLastAttack = 0;
        this.animationController.playTankPrimaryCombo(this.fireRate * 0.9);
      }
    } else if (this.isRogueLikeClass()) {
      if (this.rogueStealthLockUntilRightRelease && !slot2Held) {
        this.rogueStealthLockUntilRightRelease = false;
      }
      if (!this.rogueStealthLockUntilRightRelease && slot2Held && this.rogueStealthResource >= this.rogueStealthActivationThreshold) {
        this.rogueStealthActive = true;
      } else if (!slot2Held) {
        this.rogueStealthActive = false;
      }

      this.isFiring = slot1Held;
      if (
        this.rogueStealthActive &&
        slot1Pressed &&
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
        this.rogueDashTrailLastPoint = this.position.clone();
        this.rogueDashTrailAccumulatedDistance = 0;
        this.rogueDashDistanceRemaining = actualDistance;
        this.rogueDashRemaining = actualDistance / this.rogueDashSpeed;
        this.rogueDashCooldownTimer = this.rogueDashCooldown;
        this.rogueStealthResource = Math.max(0, this.rogueStealthResource - this.rogueDashCost);
        this.rogueOpeningStrikeReady = true;
        this.rogueOpeningStrikeTimer = this.rogueOpeningStrikeWindow;
        this.rogueStealthActive = false;
        this.rogueStealthLockUntilRightRelease = true;
        this.animationController.playAnimation(
          AnimationState.DASH,
          this.computeRogueDashAnimationSpeed(actualDistance, maxDashDistance)
        );
      } else if (!this.rogueStealthActive && this.rogueDashRemaining <= 0 && this.timeSinceLastAttack >= this.fireRate && slot1Held) {
        this.pendingRogueStrike = {
          origin: this.position.clone(),
          direction: this.attackDirection.clone(),
          range: this.roguePrimaryRange,
          coneAngleDeg: this.roguePrimaryConeAngleDeg,
          damage: this.consumeRogueOpeningStrike(this.computeRogueDamage(this.roguePrimaryDamage)),
          knockback: this.roguePrimaryKnockback,
        };
        this.timeSinceLastAttack = 0;
        this.animationController.playAnimation(AnimationState.ATTACKING, this.computeRogueAttackAnimationSpeed());
        this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
          attacker: 'player',
          type: 'melee',
        });
      }
    } else {
      this.isFiring = slot1Held && !this.secondaryActive;
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
    if (this.animationController && !(this.classId === 'firewall' && this.tankUltimateActive)) {
      if (this.classId === 'firewall' && this.tankShieldActive) {
        this.animationController.rotateTowardDirection(this.attackDirection);
      } else if (this.isFiring) {
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
    this.secondaryZoneVisualRadius = Math.max(0.1, this.secondaryZoneRadius);
  }

  private createRogueStealthZoneVisual(): void {
    const mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, 'player_rogue_stealth_zone', this.rogueStealthZoneRadius);
    const material = new StandardMaterial('player_rogue_stealth_zone_mat', this.scene);
    material.diffuseColor = new Color3(0.12, 0.88, 0.48);
    material.emissiveColor = new Color3(0.05, 0.34, 0.18);
    material.alpha = 0.26;
    mesh.material = material;
    mesh.isVisible = false;
    mesh.position.y = 1.02;
    this.rogueStealthZoneMesh = mesh;
    this.rogueStealthZoneVisualRadius = Math.max(0.1, this.rogueStealthZoneRadius);
  }

  private getMageSecondaryParticleTexture(): DynamicTexture {
    if (this.mageSecondaryParticleTexture) {
      return this.mageSecondaryParticleTexture;
    }

    const texture = new DynamicTexture('mage_secondary_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.42, 'rgba(136,239,255,0.95)');
    gradient.addColorStop(0.74, 'rgba(132,98,255,0.88)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.mageSecondaryParticleTexture = texture;
    return texture;
  }

  private getRogueParticleTexture(): DynamicTexture {
    if (this.rogueParticleTexture) {
      return this.rogueParticleTexture;
    }

    const texture = new DynamicTexture('rogue_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 64, 64);

    // Build a blocky/glitch look instead of a smooth radial dot.
    const cell = 8;
    for (let y = 0; y < 64; y += cell) {
      for (let x = 0; x < 64; x += cell) {
        const checker = ((x / cell) + (y / cell)) % 2 === 0;
        const alpha = checker ? 0.38 : 0.18;
        ctx.fillStyle = checker ? `rgba(82,255,155,${alpha})` : `rgba(20,168,86,${alpha})`;
        ctx.fillRect(x, y, cell, cell);
      }
    }

    ctx.fillStyle = 'rgba(255,64,200,0.26)';
    ctx.fillRect(8, 16, 10, 8);
    ctx.fillRect(40, 38, 12, 8);

    const core = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
    core.addColorStop(0, 'rgba(230,255,236,1)');
    core.addColorStop(0.4, 'rgba(98,255,170,0.92)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 64, 64);

    texture.update();
    this.rogueParticleTexture = texture;
    return texture;
  }

  private getMageAmbientParticleTexture(): DynamicTexture {
    if (this.mageAmbientParticleTexture) {
      return this.mageAmbientParticleTexture;
    }

    const texture = new DynamicTexture('mage_ambient_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 64, 64);
    const outer = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    outer.addColorStop(0, 'rgba(216,236,255,0.72)');
    outer.addColorStop(0.45, 'rgba(118,196,255,0.46)');
    outer.addColorStop(0.8, 'rgba(132,100,255,0.26)');
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 64, 64);

    const core = ctx.createRadialGradient(32, 32, 0, 32, 32, 16);
    core.addColorStop(0, 'rgba(242,248,255,0.7)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 64, 64);

    ctx.strokeStyle = 'rgba(154,130,255,0.24)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(32, 32, 17, 0, Math.PI * 2);
    ctx.stroke();

    texture.update();
    this.mageAmbientParticleTexture = texture;
    return texture;
  }

  private getTankAmbientParticleTexture(): DynamicTexture {
    if (this.tankAmbientParticleTexture) {
      return this.tankAmbientParticleTexture;
    }

    const texture = new DynamicTexture('tank_ambient_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 64, 64);

    const glow = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.36, 'rgba(114,214,255,0.95)');
    glow.addColorStop(0.72, 'rgba(255,196,86,0.82)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);

    ctx.fillStyle = 'rgba(166,226,255,0.6)';
    ctx.fillRect(31, 10, 2, 44);
    ctx.fillRect(10, 31, 44, 2);
    texture.update();
    this.tankAmbientParticleTexture = texture;
    return texture;
  }

  private getMovementDustParticleTexture(): DynamicTexture {
    if (this.movementDustParticleTexture) {
      return this.movementDustParticleTexture;
    }

    const texture = new DynamicTexture('movement_dust_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(242,246,252,0.92)');
    gradient.addColorStop(0.58, 'rgba(148,160,178,0.72)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.movementDustParticleTexture = texture;
    return texture;
  }

  private startMageSecondaryZoneParticles(): void {
    this.stopMageSecondaryZoneParticles();

    const particles = new ParticleSystem(`mage_secondary_zone_fx_${Date.now()}`, 620, this.scene);
    particles.particleTexture = this.getMageSecondaryParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.position.add(new Vector3(0, 0.1, 0));
    particles.minSize = 0.04;
    particles.maxSize = 0.12;
    particles.minLifeTime = 0.7;
    particles.maxLifeTime = 1.6;
    particles.emitRate = 170;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.58, 0.92, 1.0, 0.84);
    particles.color2 = new Color4(0.58, 0.34, 1.0, 0.74);
    particles.colorDead = new Color4(0.08, 0.18, 0.42, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.minEmitPower = 0.02;
    particles.maxEmitPower = 0.08;
    particles.updateSpeed = 0.012;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const r = this.secondaryZoneRadius * (0.15 + (Math.random() * 0.85));
      positionToUpdate.x = this.position.x + (Math.cos(angle) * r);
      positionToUpdate.y = this.position.y + 0.08 + (Math.random() * 0.2);
      positionToUpdate.z = this.position.z + (Math.sin(angle) * r);
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      directionToUpdate.x = (Math.random() - 0.5) * 0.05;
      directionToUpdate.y = 0.02 + (Math.random() * 0.05);
      directionToUpdate.z = (Math.random() - 0.5) * 0.05;
    };

    particles.start();
    this.secondaryZoneParticles = particles;
  }

  private stopMageSecondaryZoneParticles(): void {
    if (!this.secondaryZoneParticles) return;
    this.secondaryZoneParticles.stop();
    this.secondaryZoneParticles.dispose(false);
    this.secondaryZoneParticles = null;
  }

  private spawnMageSecondaryActivationBurst(): void {
    const burst = new ParticleSystem(`mage_secondary_activate_fx_${Date.now()}`, 220, this.scene);
    burst.particleTexture = this.getMageSecondaryParticleTexture();
    burst.layerMask = SCENE_LAYER;
    burst.emitter = this.position.add(new Vector3(0, 0.12, 0));
    burst.minSize = 0.06;
    burst.maxSize = 0.18;
    burst.minLifeTime = 0.18;
    burst.maxLifeTime = 0.32;
    burst.emitRate = 1200;
    burst.blendMode = ParticleSystem.BLENDMODE_ADD;
    burst.color1 = new Color4(0.62, 0.94, 1.0, 0.92);
    burst.color2 = new Color4(0.62, 0.36, 1.0, 0.78);
    burst.colorDead = new Color4(0.08, 0.16, 0.4, 0);
    burst.gravity = new Vector3(0, 0, 0);
    burst.minEmitPower = 1.1;
    burst.maxEmitPower = 2.6;
    burst.updateSpeed = 0.016;
    burst.start();

    window.setTimeout(() => {
      burst.stop();
      window.setTimeout(() => burst.dispose(false), 360);
    }, 120);
  }

  private startRogueAmbientGlitchParticles(): void {
    this.stopRogueAmbientGlitchParticles();

    const particles = new ParticleSystem(`rogue_ambient_glitch_fx_${Date.now()}`, 620, this.scene);
    particles.particleTexture = this.getRogueParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.position.add(new Vector3(0, 0.9, 0));
    particles.minSize = 0.02;
    particles.maxSize = 0.12;
    particles.minLifeTime = 0.08;
    particles.maxLifeTime = 0.28;
    particles.emitRate = 250;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.26, 1.0, 0.65, 0.84);
    particles.color2 = new Color4(0.1, 0.76, 0.33, 0.66);
    particles.colorDead = new Color4(0.03, 0.2, 0.08, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.minEmitPower = 0.05;
    particles.maxEmitPower = 0.26;
    particles.updateSpeed = 0.011;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const ring = 0.18 + (Math.random() * 0.55);
      positionToUpdate.x = this.position.x + (Math.cos(angle) * ring);
      positionToUpdate.y = this.position.y + 0.32 + (Math.random() * 0.95);
      positionToUpdate.z = this.position.z + (Math.sin(angle) * ring);
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      directionToUpdate.x = (Math.random() - 0.5) * 0.34;
      directionToUpdate.y = -0.06 + (Math.random() * 0.15);
      directionToUpdate.z = (Math.random() - 0.5) * 0.34;
    };

    particles.start();

    this.rogueAmbientGlitchParticles = particles;
  }

  private stopRogueAmbientGlitchParticles(): void {
    if (!this.rogueAmbientGlitchParticles) return;
    this.rogueAmbientGlitchParticles.stop();
    this.rogueAmbientGlitchParticles.dispose(false);
    this.rogueAmbientGlitchParticles = null;
  }

  private startMageAmbientAuraParticles(): void {
    this.stopMageAmbientAuraParticles();

    const particles = new ParticleSystem(`mage_ambient_aura_fx_${Date.now()}`, 540, this.scene);
    particles.particleTexture = this.getMageAmbientParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.position.add(new Vector3(0, 0.85, 0));
    particles.minSize = 0.012;
    particles.maxSize = 0.06;
    particles.minLifeTime = 0.35;
    particles.maxLifeTime = 1.2;
    particles.emitRate = 280;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.54, 0.88, 1.0, 0.52);
    particles.color2 = new Color4(0.55, 0.35, 1.0, 0.38);
    particles.colorDead = new Color4(0.08, 0.12, 0.34, 0);
    particles.gravity = new Vector3(0, 0.012, 0);
    particles.minEmitPower = 0.006;
    particles.maxEmitPower = 0.04;
    particles.updateSpeed = 0.01;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const ring = 0.08 + (Math.random() * 0.78);
      positionToUpdate.x = this.position.x + (Math.cos(angle) * ring);
      positionToUpdate.y = this.position.y + 0.18 + (Math.random() * 1.04);
      positionToUpdate.z = this.position.z + (Math.sin(angle) * ring);
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      directionToUpdate.x = (Math.random() - 0.5) * 0.03;
      directionToUpdate.y = 0.012 + (Math.random() * 0.03);
      directionToUpdate.z = (Math.random() - 0.5) * 0.03;
    };

    particles.start();
    this.mageAmbientAuraParticles = particles;
  }

  private stopMageAmbientAuraParticles(): void {
    if (!this.mageAmbientAuraParticles) return;
    this.mageAmbientAuraParticles.stop();
    this.mageAmbientAuraParticles.dispose(false);
    this.mageAmbientAuraParticles = null;
  }

  private startTankAmbientArcParticles(): void {
    this.stopTankAmbientArcParticles();

    const particles = new ParticleSystem(`tank_ambient_arc_fx_${Date.now()}`, 560, this.scene);
    particles.particleTexture = this.getTankAmbientParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.position.add(new Vector3(0, 0.88, 0));
    particles.minSize = 0.022;
    particles.maxSize = 0.13;
    particles.minLifeTime = 0.08;
    particles.maxLifeTime = 0.24;
    particles.emitRate = 182;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.52, 0.9, 1.0, 0.92);
    particles.color2 = new Color4(1.0, 0.78, 0.36, 0.8);
    particles.colorDead = new Color4(0.09, 0.12, 0.18, 0);
    particles.gravity = new Vector3(0, -0.02, 0);
    particles.minEmitPower = 0.8;
    particles.maxEmitPower = 2.4;
    particles.minAngularSpeed = -26;
    particles.maxAngularSpeed = 26;
    particles.updateSpeed = 0.012;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const ring = 0.2 + (Math.random() * 0.64);
      positionToUpdate.x = this.position.x + (Math.cos(angle) * ring);
      positionToUpdate.y = this.position.y + 0.22 + (Math.random() * 1.02);
      positionToUpdate.z = this.position.z + (Math.sin(angle) * ring);
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const burst = 1.1 + (Math.random() * 2.2);
      directionToUpdate.x = Math.cos(angle) * burst;
      directionToUpdate.y = -0.2 + (Math.random() * 0.45);
      directionToUpdate.z = Math.sin(angle) * burst;
    };

    particles.start();
    this.tankAmbientArcParticles = particles;
  }

  private stopTankAmbientArcParticles(): void {
    if (!this.tankAmbientArcParticles) return;
    this.tankAmbientArcParticles.stop();
    this.tankAmbientArcParticles.dispose(false);
    this.tankAmbientArcParticles = null;
  }

  private spawnRogueStealthActivationSmoke(): void {
    const smoke = new ParticleSystem(`rogue_stealth_smoke_fx_${Date.now()}`, 280, this.scene);
    smoke.particleTexture = this.getRogueParticleTexture();
    smoke.layerMask = SCENE_LAYER;
    smoke.emitter = this.position.add(new Vector3(0, 0.12, 0));
    smoke.minSize = 0.08;
    smoke.maxSize = 0.26;
    smoke.minLifeTime = 0.2;
    smoke.maxLifeTime = 0.42;
    smoke.emitRate = 1350;
    smoke.blendMode = ParticleSystem.BLENDMODE_ADD;
    smoke.color1 = new Color4(0.32, 0.95, 0.58, 0.72);
    smoke.color2 = new Color4(0.1, 0.7, 0.28, 0.52);
    smoke.colorDead = new Color4(0.03, 0.2, 0.08, 0);
    smoke.gravity = new Vector3(0, 0, 0);
    smoke.minEmitPower = 0.8;
    smoke.maxEmitPower = 2.1;
    smoke.updateSpeed = 0.016;
    smoke.start();

    window.setTimeout(() => {
      smoke.stop();
      window.setTimeout(() => smoke.dispose(false), 340);
    }, 120);
  }

  private updateAmbientClassParticles(): void {
    if (this.secondaryZoneParticles) {
      this.secondaryZoneParticles.emitter = this.position.add(new Vector3(0, 0.1, 0));
    }
    if (this.mageAmbientAuraParticles) {
      this.mageAmbientAuraParticles.emitter = this.position.add(new Vector3(0, 0.85, 0));
      const magePulse = 0.82 + (0.18 * Math.sin(performance.now() * 0.0055));
      this.mageAmbientAuraParticles.emitRate = 230 * magePulse;
    }
    if (this.tankAmbientArcParticles) {
      this.tankAmbientArcParticles.emitter = this.position.add(new Vector3(0, 0.88, 0));
      const tankPulse = 0.86 + (0.22 * Math.sin(performance.now() * 0.01));
      this.tankAmbientArcParticles.emitRate = 172 * tankPulse;
    }
    if (this.rogueAmbientGlitchParticles) {
      this.rogueAmbientGlitchParticles.emitter = this.position.add(new Vector3(0, 0.9, 0));
    }
  }

  private updateMovementDust(deltaTime: number): void {
    this.movementDustCooldown = Math.max(0, this.movementDustCooldown - deltaTime);
    const flatSpeed = Math.sqrt((this.velocity.x * this.velocity.x) + (this.velocity.z * this.velocity.z));
    if (!this.isMoving || flatSpeed <= 0.2) return;
    if (this.movementDustCooldown > 0) return;

    this.spawnMovementDustBurst(flatSpeed);
    const cadence = flatSpeed > this.speed * 1.6 ? 0.05 : 0.11;
    this.movementDustCooldown = cadence;
  }

  private spawnMovementDustBurst(flatSpeed: number): void {
    const particles = new ParticleSystem(`player_move_dust_${Date.now()}`, 110, this.scene);
    particles.particleTexture = this.getMovementDustParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.position.add(new Vector3(0, 0.04, 0));
    particles.minEmitBox = new Vector3(-0.2, -0.01, -0.2);
    particles.maxEmitBox = new Vector3(0.2, 0.01, 0.2);
    particles.minSize = 0.04;
    particles.maxSize = 0.14;
    particles.minLifeTime = 0.1;
    particles.maxLifeTime = 0.28;
    particles.emitRate = 720;
    particles.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    particles.color1 = new Color4(0.84, 0.87, 0.92, 0.68);
    particles.color2 = new Color4(0.6, 0.65, 0.72, 0.46);
    particles.colorDead = new Color4(0.24, 0.26, 0.3, 0);
    particles.gravity = new Vector3(0, 0.02, 0);
    particles.minEmitPower = 0.25;
    particles.maxEmitPower = Math.min(1.2, 0.4 + (flatSpeed * 0.1));
    particles.updateSpeed = 0.016;
    particles.direction1 = new Vector3(-0.75, 0.02, -0.75);
    particles.direction2 = new Vector3(0.75, 0.16, 0.75);
    particles.start();

    window.setTimeout(() => {
      particles.stop();
      window.setTimeout(() => particles.dispose(false), 340);
    }, 90);
  }

  private updateSecondaryStance(deltaTime: number): void {
    if (this.classId !== 'mage') {
      this.secondaryActive = false;
      this.stopMageSecondaryZoneParticles();
      if (this.secondaryZoneMesh) this.secondaryZoneMesh.isVisible = false;
      return;
    }

    const wasSecondaryActive = this.secondaryActive;

    const rightHeld = this.inputManager.isRightMouseDown() || this.inputManager.isAttackSlotHeld(2);

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
      const leftClicked = this.inputManager.isMouseClickedThisFrame() || this.inputManager.isAttackSlotPressedThisFrame(1);
      if (leftClicked && this.secondaryResource >= this.secondaryBurstCost) {
        this.triggerSecondaryBurst();
        this.secondaryResource = Math.max(0, this.secondaryResource - this.secondaryBurstCost);
        this.secondaryActive = false;
        this.secondaryLockUntilRightRelease = true;
      } else {
        const efficiency = this.getStanceEfficiencyMultiplier();
        this.secondaryResource = Math.max(0, this.secondaryResource - (this.secondaryDrainPerSecond / efficiency) * deltaTime);
        if (this.secondaryResource <= 0) {
          this.secondaryResource = 0;
          this.secondaryActive = false;
        }
      }
    } else {
      const efficiency = this.getStanceEfficiencyMultiplier();
      this.secondaryResource = Math.min(this.secondaryResourceMax, this.secondaryResource + (this.secondaryRegenPerSecond * efficiency) * deltaTime);
    }

    if (this.secondaryZoneMesh) {
      this.secondaryZoneMesh.isVisible = this.secondaryActive;
      this.secondaryZoneMesh.position.x = this.position.x;
      this.secondaryZoneMesh.position.z = this.position.z;
      this.secondaryZoneMesh.position.y = 1.02;
      const scale = Math.max(0.1, this.secondaryZoneRadius) / Math.max(0.1, this.secondaryZoneVisualRadius);
      this.secondaryZoneMesh.scaling.x = scale;
      this.secondaryZoneMesh.scaling.y = scale;
      this.secondaryZoneMesh.scaling.z = 1;

      const material = this.secondaryZoneMesh.material;
      if (material instanceof StandardMaterial) {
        const pulse = 0.5 + (0.5 * Math.sin(performance.now() * 0.008));
        material.alpha = this.secondaryActive ? 0.2 + (0.09 * pulse) : 0.14;
      }
    }

    if (this.secondaryActive && !wasSecondaryActive) {
      this.startMageSecondaryZoneParticles();
      this.spawnMageSecondaryActivationBurst();
    } else if (!this.secondaryActive && wasSecondaryActive) {
      this.stopMageSecondaryZoneParticles();
    }
  }

  private updateTankStance(deltaTime: number): void {
    const rightHeld = this.inputManager.isRightMouseDown() || this.inputManager.isAttackSlotHeld(2);

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
      const efficiency = this.getStanceEfficiencyMultiplier();
      this.tankStanceResource = Math.max(0, this.tankStanceResource - (this.tankStanceDrainPerSecond / efficiency) * deltaTime);
      if (this.tankStanceResource <= 0) {
        this.tankShieldActive = false;
        this.tankShieldLockUntilRightRelease = true;
      }
    } else {
      const efficiency = this.getStanceEfficiencyMultiplier();
      this.tankStanceResource = Math.min(this.tankStanceResourceMax, this.tankStanceResource + (this.tankStanceRegenPerSecond * efficiency) * deltaTime);
    }
  }

  private updateRogueStealth(deltaTime: number): void {
    const wasStealthActive = this.rogueStealthActive;
    const rightHeld = this.inputManager.isRightMouseDown() || this.inputManager.isAttackSlotHeld(2);

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
      const efficiency = this.getStanceEfficiencyMultiplier();
      this.rogueStealthResource = Math.max(0, this.rogueStealthResource - (this.rogueStealthDrainPerSecond / efficiency) * deltaTime);
      if (this.rogueStealthResource <= 0) {
        this.rogueStealthActive = false;
        this.rogueStealthLockUntilRightRelease = true;
      }
    } else {
      const efficiency = this.getStanceEfficiencyMultiplier();
      this.rogueStealthResource = Math.min(this.rogueStealthResourceMax, this.rogueStealthResource + (this.rogueStealthRegenPerSecond * efficiency) * deltaTime);
    }

    if (this.rogueStealthZoneMesh) {
      this.rogueStealthZoneMesh.isVisible = this.rogueStealthActive;
      this.rogueStealthZoneMesh.position.x = this.position.x;
      this.rogueStealthZoneMesh.position.z = this.position.z;
      this.rogueStealthZoneMesh.position.y = 1.02;
      const scale = Math.max(0.1, this.rogueStealthZoneRadius) / Math.max(0.1, this.rogueStealthZoneVisualRadius);
      this.rogueStealthZoneMesh.scaling.x = scale;
      this.rogueStealthZoneMesh.scaling.y = scale;
      this.rogueStealthZoneMesh.scaling.z = 1;

      const mat = this.rogueStealthZoneMesh.material;
      if (mat instanceof StandardMaterial) {
        const pulse = 0.5 + (0.5 * Math.sin(performance.now() * 0.01));
        mat.alpha = this.rogueStealthActive ? 0.18 + (0.08 * pulse) : 0.1;
      }
    }

    this.stealthVisibilityMultiplier = this.rogueStealthActive ? 0.46 : 1;
    if (this.rogueStealthActive !== wasStealthActive) {
      this.syncVisualPosition();
    }
    if (this.rogueStealthActive && !wasStealthActive) {
      this.spawnRogueStealthActivationSmoke();
    }
  }

  private computeRogueDamage(baseDamage: number): number {
    if (!this.isRogueLikeClass()) return baseDamage;
    return this.computeOutgoingDamage(baseDamage, true);
  }

  private consumeRogueOpeningStrike(baseDamage: number): number {
    if (!this.isRogueLikeClass() || !this.rogueOpeningStrikeReady || this.rogueOpeningStrikeTimer <= 0) {
      return baseDamage;
    }

    this.rogueOpeningStrikeReady = false;
    this.rogueOpeningStrikeTimer = 0;
    return baseDamage * this.rogueOpeningStrikeMultiplier;
  }

  private triggerSecondaryBurst(): void {
    this.pendingSecondaryBurst = {
      position: this.position.clone(),
      radius: this.secondaryZoneRadius,
      baseDamage: this.computeOutgoingDamage(this.secondaryBurstBaseDamage),
      damagePerEnemy: this.secondaryBurstDamagePerEnemy,
      damagePerProjectile: this.secondaryBurstDamagePerProjectile,
      knockback: this.secondaryBurstKnockback,
    };
  }

  private fireProjectile(): void {
    const classConfig = this.getCurrentClassConfig();
    const attackConfig = (classConfig.attack ?? {}) as { projectileSpeed?: number; range?: number };
    const damage = this.isRogueLikeClass()
      ? this.computeRogueDamage(classConfig.baseStats.damage)
      : this.computeOutgoingDamage(classConfig.baseStats.damage);
    const baseSpeed = this.readPositiveNumber(attackConfig.projectileSpeed, 25);
    const baseRange = this.readPositiveNumber(attackConfig.range, 30);

    if (this.animationController) {
      this.animationController.playAnimation(AnimationState.ATTACKING, this.computeMageAttackAnimationSpeed());
    }

    // Rotate model to face attack direction at moment of firing
    console.log(`🎯 Attack fired, rotating to: x=${this.attackDirection.x.toFixed(2)}, z=${this.attackDirection.z.toFixed(2)}`);
    if (this.animationController) {
      this.animationController.rotateTowardDirection(this.attackDirection);
    }

    const spreadDirections = this.getMageProjectileDirections();
    const projectileCount = spreadDirections.length;
    const dualBurstTriggered = this.shouldTriggerMageDualBurst();
    const volleyOffsets = dualBurstTriggered ? [0, BONUS_TUNING.mage.dualBurstLateralOffset] : [0];

    for (const direction of spreadDirections) {
      for (let volleyIndex = 0; volleyIndex < volleyOffsets.length; volleyIndex++) {
        const spreadDamageMultiplier = projectileCount > 1 ? BONUS_TUNING.mage.multishotDamageMultiplier : 1;
        const dualBurstDamageMultiplier = volleyIndex === 0 ? 1 : BONUS_TUNING.mage.dualBurstDamageMultiplier;

        this.eventBus.emit(GameEvents.PROJECTILE_SPAWNED, {
          position: this.getProjectileSpawnPosition(direction, volleyIndex === 0 ? 0 : volleyOffsets[volleyIndex]),
          direction,
          damage: damage * spreadDamageMultiplier * dualBurstDamageMultiplier,
          speed: baseSpeed,
          range: baseRange,
          friendly: true,
          projectileType: 'mage_arcane',
          maxBounces: this.getProjectileBounceCount(),
          bounceDamping: BONUS_TUNING.mage.bounceDamping,
          homingRadius: this.mageAutolockEnabled ? BONUS_TUNING.mage.autolockRadius : undefined,
          homingTurnRate: this.mageAutolockEnabled ? BONUS_TUNING.mage.autolockTurnRate : undefined,
          pierceCount: this.getProjectilePierceCount(),
        });
      }
    }

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
        damage: this.computeOutgoingDamage(this.readPositiveNumber(ultConfig.damage, 12)),
        stunDuration: this.readPositiveNumber(ultConfig.stunDuration, 1.2),
        knockbackStrength: this.readPositiveNumber(
          ultConfig.knockbackStrength,
          this.readPositiveNumber(ultConfig.pullStrength, 2.4)
        ),
        tickInterval: this.readPositiveNumber(ultConfig.tickInterval, 0.6),
        duration: this.applyUltimateDurationModifier(this.readPositiveNumber(ultConfig.duration, 5)),
      };
      this.ultCharge = 0;
      this.ultCooldown = this.readPositiveNumber(ultConfig.cooldown, 14);
      this.animationController.playAnimation(AnimationState.ULTIMATE);
      return;
    }

    if (this.isRogueLikeClass()) {
      const ultConfig = this.config.rogue?.ultimate ?? {};
      this.pendingRogueUltimate = {
        duration: this.applyUltimateDurationModifier(this.readPositiveNumber(ultConfig.duration, this.rogueUltimateDuration)),
        zoneRadius: this.readPositiveNumber(ultConfig.zoneRadius, this.rogueUltimateZoneRadius),
        hitDamage: this.computeRogueDamage(this.readPositiveNumber(ultConfig.hitDamage, this.rogueUltimateHitDamage)),
        teleportInterval: this.readPositiveNumber(ultConfig.teleportInterval, this.rogueUltimateTeleportInterval),
        teleportOffset: this.readPositiveNumber(ultConfig.teleportOffset, this.rogueUltimateTeleportOffset),
      };
      this.ultCharge = 0;
      this.ultCooldown = this.readPositiveNumber(ultConfig.cooldown, 13);
      return;
    }

    const ultConfig = this.config.mage?.ultimate as
      | {
          cooldown?: number;
          radius?: number;
          damage?: number;
          dotDuration?: number;
          dotTickRate?: number;
          healPerTick?: number;
        }
      | undefined;
    const mageUltConfig = ultConfig ?? {};
    if (this.animationController) {
      this.animationController.rotateTowardDirection(this.attackDirection);
      this.animationController.setOnUltimateAnimationFinished(() => {
        this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_USED, {
          position: this.position.clone(),
          radius: this.readPositiveNumber(mageUltConfig.radius, 4),
          damage: this.computeOutgoingDamage(this.readPositiveNumber(mageUltConfig.damage, 50)),
          duration: this.applyUltimateDurationModifier(this.readPositiveNumber(mageUltConfig.dotDuration, 8)),
          dotTickRate: this.readPositiveNumber(mageUltConfig.dotTickRate, 0.5),
          healPerTick: this.readPositiveNumber(mageUltConfig.healPerTick, 6),
        });
      });
    } else {
      this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_USED, {
        position: this.position.clone(),
        radius: this.readPositiveNumber(mageUltConfig.radius, 4),
        damage: this.computeOutgoingDamage(this.readPositiveNumber(mageUltConfig.damage, 50)),
        duration: this.applyUltimateDurationModifier(this.readPositiveNumber(mageUltConfig.dotDuration, 8)),
        dotTickRate: this.readPositiveNumber(mageUltConfig.dotTickRate, 0.5),
        healPerTick: this.readPositiveNumber(mageUltConfig.healPerTick, 6),
      });
    }
    this.ultCharge = 0;
    this.ultCooldown = this.readPositiveNumber(mageUltConfig.cooldown, 0);
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

  applyFireRateMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    this.baseFireRate = Math.max(0.01, this.baseFireRate / multiplier);
    this.fireRate = this.baseFireRate;
  }

  enablePoisonBonus(percent: number, duration: number): void {
    this.poisonBonusPercent += percent;
    this.poisonDuration = Math.max(this.poisonDuration, duration);
  }

  applyDodgeRollBonus(): void {
    this.bonusDodgeChance = Math.min(
      BONUS_TUNING.general.dodgeChanceCap,
      this.bonusDodgeChance + BONUS_TUNING.general.dodgeChancePerStack
    );
  }

  applyCritEngineBonus(): void {
    this.bonusCritChance = Math.min(
      BONUS_TUNING.general.critChanceCap,
      this.bonusCritChance + BONUS_TUNING.general.critChancePerStack
    );
    this.bonusCritMultiplier = Math.min(
      BONUS_TUNING.general.critMultiplierBonusCap,
      this.bonusCritMultiplier + BONUS_TUNING.general.critMultiplierBonusPerStack
    );
  }

  applyUltimateChargeBonus(): void {
    this.bonusUltChargeRateMultiplier = Math.min(
      BONUS_TUNING.general.ultChargeRateMultiplierCap,
      this.bonusUltChargeRateMultiplier + BONUS_TUNING.general.ultChargeRateMultiplierPerStack
    );
  }

  applyUltimateDurationBonus(): void {
    this.bonusUltDurationMultiplier = Math.min(
      BONUS_TUNING.general.ultDurationMultiplierCap,
      this.bonusUltDurationMultiplier + BONUS_TUNING.general.ultDurationMultiplierPerStack
    );
  }

  applyStanceEfficiencyBonus(): void {
    this.bonusStanceEfficiencyMultiplier = Math.min(
      BONUS_TUNING.general.stanceEfficiencyMultiplierCap,
      this.bonusStanceEfficiencyMultiplier + BONUS_TUNING.general.stanceEfficiencyMultiplierPerStack
    );
  }

  applyMageMultishotArcBonus(): void {
    this.mageArcMultishotStacks = Math.min(BONUS_TUNING.mage.multishotArcMaxProjectiles - 1, this.mageArcMultishotStacks + 1);
  }

  applyMageDualBurstBonus(): void {
    this.mageDualBurstStacks += 1;
  }

  applyMageBounceKernelBonus(): void {
    this.mageBounceStacks = Math.min(
      BONUS_TUNING.mage.bounceMaxStacks,
      this.mageBounceStacks + BONUS_TUNING.mage.bounceStacksPerBonus
    );
  }

  applyMagePierceBonus(): void {
    this.magePierceStacks = Math.min(
      BONUS_TUNING.mage.pierceMaxStacks,
      this.magePierceStacks + BONUS_TUNING.mage.pierceStacksPerBonus
    );
  }

  applyMageReactiveAoEBonus(): void {
    this.mageReactiveAoeStacks += 1;
  }

  applyMageImpactAoEBonus(): void {
    this.mageImpactAoeStacks += 1;
  }

  enableMageAutolockBonus(): void {
    this.mageAutolockEnabled = true;
  }

  applyFirewallDeflectBonus(): void {
    this.tankProjectileReflectMultiplier *= BONUS_TUNING.firewall.deflectMultiplierPerStack;
  }

  applyFirewallStunBonus(): void {
    this.tankShieldBashStunDuration *= BONUS_TUNING.firewall.stunMultiplierPerStack;
  }

  applyFirewallThornsBonus(): void {
    this.firewallThornsDamageRatio += BONUS_TUNING.firewall.thornsRatioPerStack;
  }

  applyFirewallBashRangeBonus(): void {
    this.tankShieldBashHitRadius = Math.min(
      BONUS_TUNING.firewall.bashRangeRadiusCap,
      this.tankShieldBashHitRadius + BONUS_TUNING.firewall.bashRangeRadiusPerStack
    );
    this.tankShieldBashGroupDistance = Math.min(
      BONUS_TUNING.firewall.bashRangeGroupDistanceCap,
      this.tankShieldBashGroupDistance + BONUS_TUNING.firewall.bashRangeGroupDistancePerStack
    );
    this.tankShieldBashGroupWidth = Math.min(
      BONUS_TUNING.firewall.bashRangeGroupWidthCap,
      this.tankShieldBashGroupWidth + BONUS_TUNING.firewall.bashRangeGroupWidthPerStack
    );
  }

  applyFirewallDamageReductionBonus(): void {
    this.firewallDamageReductionRatio = Math.min(
      BONUS_TUNING.firewall.damageReductionCap,
      this.firewallDamageReductionRatio + BONUS_TUNING.firewall.damageReductionPerStack
    );
  }

  applyRogueLifestealBonus(): void {
    this.rogueLifestealRatio = Math.min(
      BONUS_TUNING.rogue.lifestealRatioCap,
      this.rogueLifestealRatio + BONUS_TUNING.rogue.lifestealRatioPerStack
    );
  }

  applyRogueWhitehatChainBonus(): void {
    this.rogueChainDamageRatio = Math.min(
      BONUS_TUNING.rogue.chainDamageRatioCap,
      this.rogueChainDamageRatio + BONUS_TUNING.rogue.chainDamageRatioPerStack
    );
    this.rogueChainRadius = Math.min(
      BONUS_TUNING.rogue.chainRadiusCap,
      Math.max(BONUS_TUNING.rogue.chainRadiusMin, this.rogueChainRadius + BONUS_TUNING.rogue.chainRadiusPerStack)
    );
    this.rogueChainMaxTargets = Math.min(BONUS_TUNING.rogue.chainMaxTargetsCap, Math.max(1, this.rogueChainMaxTargets + 1));
  }

  applyRogueStealthZoneBonus(): void {
    this.rogueStealthZoneRadius = Math.min(
      BONUS_TUNING.rogue.stealthZoneRadiusCap,
      this.rogueStealthZoneRadius + BONUS_TUNING.rogue.stealthZoneRadiusPerStack
    );
    this.rogueStealthDrainPerSecond = Math.max(
      BONUS_TUNING.rogue.stealthDrainMin,
      this.rogueStealthDrainPerSecond * BONUS_TUNING.rogue.stealthDrainMultiplierPerStack
    );
    this.rogueStealthRegenPerSecond = Math.min(
      BONUS_TUNING.rogue.stealthRegenCap,
      this.rogueStealthRegenPerSecond * BONUS_TUNING.rogue.stealthRegenMultiplierPerStack
    );
  }

  applyRogueRangePatchBonus(): void {
    this.roguePrimaryRange = Math.min(
      BONUS_TUNING.rogue.rangePatchPrimaryRangeCap,
      this.roguePrimaryRange + BONUS_TUNING.rogue.rangePatchPrimaryRangePerStack
    );
    this.rogueDashHitRadius = Math.min(
      BONUS_TUNING.rogue.rangePatchDashRadiusCap,
      this.rogueDashHitRadius + BONUS_TUNING.rogue.rangePatchDashRadiusPerStack
    );
  }

  applyRogueBackdoorBonus(): void {
    this.rogueOpeningStrikeMultiplier += BONUS_TUNING.rogue.backdoorDamageBonusPerStack;
    this.rogueOpeningStrikeWindow += BONUS_TUNING.rogue.backdoorWindowBonusPerStack;
  }

  public resetBonuses(): void {
    const classConfig = this.getCurrentClassConfig();
    if (!classConfig) return;

    // Reset base stats
    this.fireRate = classConfig.baseStats.fireRate;
    this.baseFireRate = this.fireRate;
    this.speed = classConfig.baseStats.speed;
    
    // Reset general bonus variables
    this.bonusDodgeChance = 0;
    this.bonusCritChance = 0;
    this.bonusCritMultiplier = 1.0;
    this.bonusUltChargeRateMultiplier = 1.0;
    this.bonusUltDurationMultiplier = 1.0;
    this.bonusStanceEfficiencyMultiplier = 1.0;
    this.poisonBonusPercent = 0;
    this.poisonDuration = 0;
    
    // Reset class specific bonus variables
    this.mageArcMultishotStacks = 0;
    this.mageDualBurstStacks = 0;
    this.mageBounceStacks = 0;
    this.magePierceStacks = 0;
    this.mageReactiveAoeStacks = 0;
    this.mageImpactAoeStacks = 0;
    this.mageAutolockEnabled = false;
    
    this.firewallThornsDamageRatio = 0;
    this.firewallDamageReductionRatio = 0;
    
    this.rogueLifestealRatio = 0;
    this.rogueChainDamageRatio = 0;
    this.rogueChainRadius = 0;
    this.rogueChainMaxTargets = 1; // Default is usually 1 target

    // Re-apply class config to restore specific values that might have been modified by stacks
    if (this.classId === 'mage') this.applySecondaryConfig();
    if (this.classId === 'firewall') this.applyTankConfig();
    if (this.isRogueLikeClass()) this.applyRogueConfig();
    
    // Reset HP to base
    if (this.health) {
      this.health.setMaxHP(classConfig.baseStats.hp, true);
    }
  }

  onPlayerDealtDamage(damage: number): void {
    if (!Number.isFinite(damage) || damage <= 0) return;
    if (!this.isRogueLikeClass() || this.rogueLifestealRatio <= 0) return;

    const rawHeal = damage * this.rogueLifestealRatio;
    const cappedHeal = Math.min(rawHeal, BONUS_TUNING.rogue.lifestealHealCapPerHit);
    if (cappedHeal > 0) {
      this.heal(cappedHeal);
    }
  }

  getRogueChainConfig(): { damageRatio: number; radius: number; maxTargets: number } | null {
    if (!this.isRogueLikeClass()) return null;
    if (this.rogueChainDamageRatio <= 0 || this.rogueChainRadius <= 0 || this.rogueChainMaxTargets <= 0) return null;
    return {
      damageRatio: this.rogueChainDamageRatio,
      radius: this.rogueChainRadius,
      maxTargets: this.rogueChainMaxTargets,
    };
  }

  getFirewallThornsDamageRatio(): number {
    if (this.classId !== 'firewall') return 0;
    return this.firewallThornsDamageRatio;
  }

  getPoisonBonus(): { percent: number; duration: number } {
    return { percent: this.poisonBonusPercent, duration: this.poisonDuration };
  }

  getMageImpactAoeConfig(): { chance: number; radius: number; damageRatio: number; knockback: number } | null {
    if (this.classId !== 'mage' || this.mageImpactAoeStacks <= 0) return null;

    const chance = Math.min(
      BONUS_TUNING.mage.impactAoeChanceCap,
      this.mageImpactAoeStacks * BONUS_TUNING.mage.impactAoeChancePerStack
    );
    const radius = Math.min(
      BONUS_TUNING.mage.impactAoeRadiusCap,
      BONUS_TUNING.mage.impactAoeRadiusBase + (this.mageImpactAoeStacks * BONUS_TUNING.mage.impactAoeRadiusPerStack)
    );
    const damageRatio = Math.min(
      BONUS_TUNING.mage.impactAoeDamageRatioCap,
      BONUS_TUNING.mage.impactAoeDamageRatioBase + (this.mageImpactAoeStacks * BONUS_TUNING.mage.impactAoeDamageRatioPerStack)
    );

    return {
      chance,
      radius,
      damageRatio,
      knockback: BONUS_TUNING.mage.impactAoeKnockback,
    };
  }

  private getProjectileBounceCount(): number {
    if (this.classId !== 'mage') return 0;
    return this.mageBounceStacks;
  }

  private getMageProjectileDirections(): Vector3[] {
    const baseDirection = this.attackDirection.lengthSquared() > 0.0001
      ? this.attackDirection.normalize()
      : new Vector3(1, 0, 0);

    if (this.classId !== 'mage' || this.mageArcMultishotStacks <= 0) {
      return [baseDirection.clone()];
    }

    const projectileCount = Math.min(BONUS_TUNING.mage.multishotArcMaxProjectiles, 1 + this.mageArcMultishotStacks);
    const spreadDeg = BONUS_TUNING.mage.multishotArcSpreadBaseDeg + (this.mageArcMultishotStacks * BONUS_TUNING.mage.multishotArcSpreadPerStackDeg);
    const spreadRad = (spreadDeg * Math.PI) / 180;

    const directions: Vector3[] = [];
    if (projectileCount === 1) return [baseDirection.clone()];

    for (let i = 0; i < projectileCount; i++) {
      const t = i / (projectileCount - 1);
      const angle = -spreadRad + (2 * spreadRad * t);
      const rotated = this.rotateDirectionY(baseDirection, angle);
      directions.push(rotated);
    }

    return directions;
  }

  private rotateDirectionY(direction: Vector3, angle: number): Vector3 {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x = direction.x * cosA - direction.z * sinA;
    const z = direction.x * sinA + direction.z * cosA;
    return new Vector3(x, 0, z).normalize();
  }

  private shouldTriggerMageDualBurst(): boolean {
    if (this.classId !== 'mage' || this.mageDualBurstStacks <= 0) return false;
    const chance = Math.min(
      BONUS_TUNING.mage.dualBurstChanceCap,
      this.mageDualBurstStacks * BONUS_TUNING.mage.dualBurstChancePerStack
    );
    return Math.random() < chance;
  }

  private getProjectileSpawnPosition(direction: Vector3, lateralOffset: number): Vector3 {
    if (lateralOffset <= 0.0001) return this.position.clone();
    const side = new Vector3(direction.z, 0, -direction.x);
    if (side.lengthSquared() <= 0.0001) return this.position.clone();
    return this.position.add(side.normalize().scale(lateralOffset));
  }

  isSecondaryActive(): boolean {
    if (this.classId === 'mage') return this.secondaryActive;
    if (this.classId === 'firewall') return this.tankShieldActive;
    if (this.isRogueLikeClass()) return this.rogueStealthActive;
    return false;
  }

  getSecondaryZoneRadius(): number {
    if (this.classId === 'mage') return this.secondaryZoneRadius;
    if (this.isRogueLikeClass()) return this.rogueStealthZoneRadius;
    return 0;
  }

  getSecondarySlowMultiplier(): number {
    if (this.classId === 'mage') return this.secondarySlowMultiplier;
    return 1;
  }

  getSecondaryResourceCurrent(): number {
    if (this.classId === 'mage') return this.secondaryResource;
    if (this.classId === 'firewall') return this.tankStanceResource;
    if (this.isRogueLikeClass()) return this.rogueStealthResource;
    return 0;
  }

  getSecondaryResourceMax(): number {
    if (this.classId === 'mage') return this.secondaryResourceMax;
    if (this.classId === 'firewall') return this.tankStanceResourceMax;
    if (this.isRogueLikeClass()) return this.rogueStealthResourceMax;
    return 0;
  }

  getSecondaryActivationThreshold(): number {
    if (this.classId === 'mage') return this.secondaryActivationThreshold;
    if (this.classId === 'firewall') return this.tankStanceActivationThreshold;
    if (this.isRogueLikeClass()) return this.rogueStealthActivationThreshold;
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

  consumePendingMageReactiveBurst(): {
    position: Vector3;
    radius: number;
    damage: number;
    knockback: number;
  } | null {
    const payload = this.pendingMageReactiveBurst;
    this.pendingMageReactiveBurst = null;
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
    swingDirection: 'left' | 'right';
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
    knockbackStrength: number;
    tickInterval: number;
    duration: number;
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

  consumePendingRogueDashTrailSegments(): Array<{
    from: Vector3;
    to: Vector3;
    radius: number;
  }> {
    const payload = this.pendingRogueDashTrailSegments;
    this.pendingRogueDashTrailSegments = [];
    return payload;
  }

  private queueRogueDashTrailSegment(from: Vector3, to: Vector3): void {
    const traveled = Vector3.Distance(from, to);
    if (traveled <= 0.0001) return;

    if (!this.rogueDashTrailLastPoint) {
      this.rogueDashTrailLastPoint = from.clone();
      this.rogueDashTrailAccumulatedDistance = 0;
    }

    this.rogueDashTrailAccumulatedDistance += traveled;
    const segmentThreshold = 0.08;
    const dashStillActive = this.rogueDashRemaining > 0;
    if (dashStillActive && this.rogueDashTrailAccumulatedDistance < segmentThreshold) {
      return;
    }

    const segmentStart = this.rogueDashTrailLastPoint.clone();
    const segmentEnd = to.clone();
    if (Vector3.Distance(segmentStart, segmentEnd) <= 0.01) {
      return;
    }

    this.pendingRogueDashTrailSegments.push({
      from: segmentStart,
      to: segmentEnd,
      radius: this.rogueDashHitRadius,
    });
    this.rogueDashTrailLastPoint = segmentEnd;
    this.rogueDashTrailAccumulatedDistance = 0;
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
    if (!this.isRogueLikeClass()) {
      this.rogueUltimateActive = false;
      return;
    }
    this.rogueUltimateActive = active;
  }

  setTankUltimateActive(active: boolean): void {
    if (this.classId !== 'firewall') {
      this.tankUltimateActive = false;
      return;
    }
    this.tankUltimateActive = active;
  }

  getRogueStealthRadius(): number {
    return this.isRogueLikeClass() ? this.rogueStealthZoneRadius : 0;
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

  setBenchmarkInvulnerable(active: boolean): void {
    this.benchmarkInvulnerable = active;
  }

  resetFocusFire(): void {
    this.focusFireBonus = 1.0;
    this.timeSinceMovement = 0;
    this.isMoving = false;
    this.fireRate = this.baseFireRate;
  }

  applyDamage(amount: number): void {
    if (!this.health) return;
    if (this.benchmarkInvulnerable) {
      return;
    }
    if (this.isCatGodModeActive()) {
      return;
    }
    if (this.isRogueLikeClass() && this.rogueUltimateActive) {
      return;
    }
    if (this.classId === 'firewall' && this.tankUltimateActive) {
      return;
    }
    if (this.bonusDodgeChance > 0 && Math.random() < this.bonusDodgeChance) {
      return;
    }
    const configLoader = ConfigLoader.getInstance();
    const gameplayConfig = configLoader.getGameplayConfig();
    if (gameplayConfig?.debugConfig?.godMode) {
      return;
    }
    const persistentFirewallReduction = this.classId === 'firewall' ? this.firewallDamageReductionRatio : 0;
    const totalReduction = Math.max(0, Math.min(0.95, this.damageReductionRatio + persistentFirewallReduction));
    const reducedDamage = amount * (1 - totalReduction);
    this.health.takeDamage(reducedDamage);
    this.eventBus.emit(GameEvents.PLAYER_DAMAGED, {
      health: {
        current: this.health.getCurrentHP(),
        max: this.health.getMaxHP(),
      },
      damage: reducedDamage,
    });
    this.tryTriggerMageReactiveAoe(reducedDamage);

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

  refillUltimate(): void {
    this.ultCharge = 1.0;
    this.ultCooldown = 0;
    this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_READY, { charge: this.ultCharge });
  }

  activateDamageBoost(multiplier: number, duration: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 1 || duration <= 0) return;
    this.damageBoostMultiplier = Math.max(this.damageBoostMultiplier, multiplier);
    this.damageBoostTimer = Math.max(this.damageBoostTimer, duration);
  }

  activateDamageReduction(ratio: number, duration: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0 || duration <= 0) return;
    this.damageReductionRatio = Math.max(this.damageReductionRatio, Math.min(0.95, ratio));
    this.damageReductionTimer = Math.max(this.damageReductionTimer, duration);
  }

  getDamageBoostState(): { active: boolean; remaining: number } {
    return { active: this.damageBoostTimer > 0, remaining: this.damageBoostTimer };
  }

  getDamageReductionState(): { active: boolean; remaining: number } {
    return { active: this.damageReductionTimer > 0, remaining: this.damageReductionTimer };
  }

  private applyDamageModifiers(baseDamage: number): number {
    return baseDamage * this.damageBoostMultiplier;
  }

  private computeOutgoingDamage(baseDamage: number, includeRogueCrit: boolean = false): number {
    const boostedDamage = this.applyDamageModifiers(baseDamage);

    if (includeRogueCrit && this.isRogueLikeClass()) {
      return this.rollCrit(boostedDamage, this.getRogueCritChance(), this.getRogueCritMultiplier());
    }

    const critChance = this.getCritChance();
    if (critChance <= 0) return boostedDamage;
    return this.rollCrit(boostedDamage, critChance, this.getCritMultiplier());
  }

  private tryTriggerMageReactiveAoe(incomingDamage: number): void {
    if (this.classId !== 'mage' || this.mageReactiveAoeStacks <= 0) return;
    if (!Number.isFinite(incomingDamage) || incomingDamage <= 0) return;
    if (this.mageReactiveAoeCooldownRemaining > 0) return;

    const chance = Math.min(
      BONUS_TUNING.mage.reactiveAoeChanceCap,
      this.mageReactiveAoeStacks * BONUS_TUNING.mage.reactiveAoeChancePerStack
    );
    if (Math.random() >= chance) return;

    const radius = Math.min(
      BONUS_TUNING.mage.reactiveAoeRadiusCap,
      BONUS_TUNING.mage.reactiveAoeRadiusBase + (this.mageReactiveAoeStacks * BONUS_TUNING.mage.reactiveAoeRadiusPerStack)
    );
    const damageRatio = Math.min(
      BONUS_TUNING.mage.reactiveAoeDamageRatioCap,
      BONUS_TUNING.mage.reactiveAoeDamageRatioBase + (this.mageReactiveAoeStacks * BONUS_TUNING.mage.reactiveAoeDamageRatioPerStack)
    );
    const damage = Math.max(BONUS_TUNING.mage.reactiveAoeMinDamage, incomingDamage * damageRatio);

    this.pendingMageReactiveBurst = {
      position: this.position.clone(),
      radius,
      damage,
      knockback: BONUS_TUNING.mage.reactiveAoeKnockback,
    };
    this.mageReactiveAoeCooldownRemaining = BONUS_TUNING.mage.reactiveAoeCooldownSeconds;
  }

  private applyUltimateDurationModifier(baseDuration: number): number {
    return Math.max(0.1, baseDuration * this.getUltimateDurationMultiplier());
  }

  private getProjectilePierceCount(): number {
    if (this.classId !== 'mage') return 0;
    return this.magePierceStacks;
  }

  dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }
    this.stopMageSecondaryZoneParticles();
    this.stopMageAmbientAuraParticles();
    this.stopTankAmbientArcParticles();
    this.stopRogueAmbientGlitchParticles();
    if (this.secondaryZoneMesh) {
      this.secondaryZoneMesh.dispose();
      this.secondaryZoneMesh = null;
    }
    if (this.rogueStealthZoneMesh) {
      this.rogueStealthZoneMesh.dispose();
      this.rogueStealthZoneMesh = null;
    }
    if (this.mageSecondaryParticleTexture) {
      this.mageSecondaryParticleTexture.dispose();
      this.mageSecondaryParticleTexture = null;
    }
    if (this.rogueParticleTexture) {
      this.rogueParticleTexture.dispose();
      this.rogueParticleTexture = null;
    }
    if (this.mageAmbientParticleTexture) {
      this.mageAmbientParticleTexture.dispose();
      this.mageAmbientParticleTexture = null;
    }
    if (this.tankAmbientParticleTexture) {
      this.tankAmbientParticleTexture.dispose();
      this.tankAmbientParticleTexture = null;
    }
    if (this.movementDustParticleTexture) {
      this.movementDustParticleTexture.dispose();
      this.movementDustParticleTexture = null;
    }
    this.pendingRogueDashTrailSegments = [];
    this.rogueDashTrailLastPoint = null;
    this.rogueDashTrailAccumulatedDistance = 0;
    if (this.mesh) {
      this.mesh.dispose();
    }
    if (this.animationController) {
      this.animationController.dispose();
    }
  }
}
