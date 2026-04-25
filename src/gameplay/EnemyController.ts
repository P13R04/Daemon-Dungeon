/**
 * EnemyController - Controls a single enemy
 */

import { Scene, Mesh, Vector3, SceneLoader, AnimationGroup, TransformNode, StandardMaterial, Color3, MeshBuilder, AbstractMesh } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { MathUtils } from '../utils/Math';
import type { NavigationCapabilities, RoomManager } from '../systems/RoomManager';
import type { EnemyRuntimeConfig } from './enemy/EnemyControllerTypes';
import { EnemyLaserPatternSubsystem } from './enemy/EnemyLaserPatternSubsystem';
import { EnemySpikeCastSubsystem } from './enemy/EnemySpikeCastSubsystem';

type EnemyControllerSpawnOptions = {
  suppressSpawnEvent?: boolean;
  suppressAI?: boolean;
  suppressRender?: boolean;
};

type EnemyFogMask = {
  z: number;
  direction: number;
  revealDistance: number;
  hiddenVisibility: number;
};

export class EnemyController {
  public mesh!: Mesh; // Public pour DevConsole
  private health!: Health;
  private eventBus: EventBus;
  private time: Time;
  private static globalHeightOffset: number = 0; // Global height adjustment for all enemies
  private static bullInstantiationChain: Promise<void> = Promise.resolve();
  private scene: Scene;
  private id: string;
  private typeId: string;
  
  private config: EnemyRuntimeConfig;
  private position: Vector3 = Vector3.Zero();
  private previousPosition: Vector3 = Vector3.Zero();
  private velocity: Vector3 = Vector3.Zero();
  private knockback: Knockback = new Knockback(12);
  private verticalOffset: number = 0;
  
  private speed: number = 0;
  private damage: number = 0;
  private attackRange: number = 0;
  private attackCooldown: number = 0;
  private dots: Array<{ remaining: number; dps: number }> = [];
  private behavior: string = 'chase';
  private bullState: 'chase' | 'aim' | 'charge' | 'cooldown' = 'chase';
  private bullTimer: number = 0;
  private bullLockedDirection: Vector3 = new Vector3(1, 0, 0);
  private bullTriggerRange: number = 6.0;
  private bullAimDuration: number = 0.5;
  private bullChargeDuration: number = 0.8;
  private bullChargeSpeedMultiplier: number = 2.6;
  private bullHitRange: number = 1.0;
  private bullCooldownDuration: number = 1.2;
  private bullKnockbackStrength: number = 1.6;
  private bullAnimGroups: Map<string, AnimationGroup> = new Map();
  private bullModelRoot: TransformNode | null = null;
  private bullAnimState: 'none' | 'start' | 'run' | 'end' = 'none';
  private bullModelLoadPromise: Promise<void> | null = null;
  private bullModelScale: number = 0.1;
  private knockbackStrength: number = 0;
  private selfKnockbackStrength: number = 0;
  private useCrowdSteering: boolean = false;
  private separationRadius: number = 1.1;
  private separationStrength: number = 1.0;
  private crowdMinDistance: number = 0.45;
  private avoidObstacles: boolean = false;
  private avoidDistance: number = 0.9;
  private canFly: boolean = false;
  private avoidVoid: boolean = true;
  private canFallIntoVoid: boolean = false;
  private navPath: Vector3[] = [];
  private navPathCursor: number = 0;
  private navRepathTimer: number = 0;
  private navRepathInterval: number = 0.35;
  private navTargetSnapshot: Vector3 | null = null;
  private commandTarget: Vector3 | null = null;
  private commandRemaining: number = 0;
  private commandWeight: number = 0;
  private falling: boolean = false;
  private fallSpeed: number = 0;
  private fallOffset: number = 0;
  private fallDeathDepth: number = 4.2;
  private fallFxTimer: number = 0;
  private stuckTimer: number = 0;
  private lastPosition: Vector3 = Vector3.Zero();
  private stuckThreshold: number = 0.02;
  private stuckTimeToNudge: number = 0.35;
  private pongDirection: Vector3 = Vector3.Zero();
  private pongInitialized: boolean = false;
  private pongInitialAngleDeg: number | null = null;
  private pongRadius: number = 0.35;
  private pongContactDamageRatio: number = 0.5;
  private pongContactKnockback: number = 0.55;
  private jumperState: 'chase' | 'aim' | 'jump' | 'cooldown' = 'chase';
  private jumperTimer: number = 0;
  private jumperLockedDirection: Vector3 = new Vector3(1, 0, 0);
  private jumperTriggerRange: number = 6.0;
  private jumperAimDuration: number = 0.5;
  private jumperJumpDuration: number = 0.7;
  private jumperJumpSpeedMultiplier: number = 2.2;
  private jumperHitRange: number = 1.0;
  private jumperCooldownDuration: number = 1.0;
  private jumperJumpHeight: number = 1.2;
  private jumperShockwaveEnabled: boolean = false;
  private jumperShockwaveRadius: number = 0;
  private jumperShockwaveDuration: number = 0.55;
  private jumperShockwaveDamage: number = 0;
  private kiteMinRange: number = 2.5;
  private kiteMaxRange: number = 4.5;
  private fuyardPanicTriggerRange: number = 1.9;
  private fuyardPanicDuration: number = 1.25;
  private fuyardPanicTimer: number = 0;
  private fuyardChaosDirection: Vector3 = new Vector3(1, 0, 0);
  private fuyardChaosTimer: number = 0;
  private fuyardChaosJitter: number = 0.9;
  private fuyardStrafeStrength: number = 0.52;
  private orbitStrength: number = 0.4;
  private orbitSign: number = 1;
  private orbitFlipCooldown: number = 0.6;
  private orbitFlipTimer: number = 0;
  private leadTime: number = 0.4;
  private rangedMinRange: number = 3.5;
  private rangedMaxRange: number = 6.5;
  private rangedCooldown: number = 1.2;
  private rangedProjectileSpeed: number = 6.0;
  private rangedProjectileRange: number = 12.0;
  private rangedProjectileBounces: number = 0;
  private rangedProjectileBounceDamping: number = 0.9;
  private rangedWindup: number = 0;
  private prefireState: 'idle' | 'windup' = 'idle';
  private prefireTimer: number = 0;
  private prefireWindup: number = 0.55;
  private prefireLockedDirection: Vector3 = new Vector3(1, 0, 0);
  private prefireLeadBonus: number = 0.15;
  private swarmCommandInterval: number = 1.4;
  private swarmCommandTimer: number = 0.55;
  private swarmCommandRange: number = 9.0;
  private swarmCommandDuration: number = 1.35;
  private swarmCommandWeight: number = 0.64;
  private swarmFormationRadius: number = 3.0;
  private healerRange: number = 4.0;
  private healerAmount: number = 6.0;
  private healerCooldown: number = 1.5;
  private healerTimer: number = 0;
  private artificerMinRange: number = 3.5;
  private artificerMaxRange: number = 6.5;
  private artificerCooldown: number = 2.2;
  private artificerWindup: number = 0.6;
  private artificerTimer: number = 0;
  private artificerSplitCount: number = 4;
  private artificerSplitRadius: number = 1.6;
  private artificerSplitDelay: number = 2.0;
  private artificerExplosionRadius: number = 1.6;
  private artificerExplosionDamage: number = 10;
  private artificerImpactRadius: number = 1.6;
  private artificerImpactDamage: number = 12;
  private artificerDotRadius: number = 1.4;
  private artificerDotDps: number = 4;
  private artificerDotDuration: number = 4.0;
  private artificerSplitTravelSpeed: number = 6.0;
  private artificerImpactDuration: number = 0.6;
  private artificerFinalDuration: number = 0.2;
  private bulletHellCount: number = 4;
  private bulletHellSpreadDeg: number = 35;
  private bulletHellCooldown: number = 1.5;
  private bulletHellTimer: number = 0;
  private missileCooldown: number = 2.0;
  private missileTimer: number = 0;
  private missileTurnRate: number = 3.0;
  private missileMinSpeed: number = 2.0;
  private missileMaxSpeed: number = 6.0;
  private missileAccel: number = 3.0;
  private missileDirection: Vector3 = new Vector3(1, 0, 0);
  private missileSpeed: number = 0;
  private necromancerSummonCooldown: number = 2.0;
  private necromancerSummonTimer: number = 0;
  private necromancerSummonType: string = 'zombie_basic';
  private necromancerSummonRadius: number = 2.0;
  private spikeCastSubsystem: EnemySpikeCastSubsystem;
  private laserPatternSubsystem: EnemyLaserPatternSubsystem;
  
  private target: Vector3 | null = null;
  private isAlive: boolean = true;
  private isDisposed: boolean = false;
  private suppressSpawnEvent: boolean = false;
  private aiSuppressed: boolean = false;
  private renderSuppressed: boolean = false;
  private stunRemaining: number = 0;
  private fogMask: EnemyFogMask | null = null;
  private fogRevealProgress: number = 1;
  private fogScanPulseTimer: number = 0;
  private fogScanPulseDuration: number = 0.62;

  constructor(
    scene: Scene,
    typeId: string,
    position: Vector3,
    config: EnemyRuntimeConfig,
    options?: EnemyControllerSpawnOptions
  ) {
    this.scene = scene;
    this.typeId = typeId;
    this.config = config;
    this.position = position.clone();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.id = `enemy_${typeId}_${Date.now()}_${Math.random()}`;
    this.spikeCastSubsystem = new EnemySpikeCastSubsystem(this.scene);
    this.laserPatternSubsystem = new EnemyLaserPatternSubsystem(this.scene, this.id);

    // Initialize from config
    this.speed = config.baseStats?.speed || 2.5;
    this.damage = config.baseStats?.damage || 8;
    this.attackRange = config.baseStats?.attackRange || 1.5;
    this.behavior = config.behavior || 'chase';
    this.suppressSpawnEvent = options?.suppressSpawnEvent === true;
    this.aiSuppressed = options?.suppressAI === true;
    this.renderSuppressed = options?.suppressRender === true;
    this.knockbackStrength = config.knockbackStrength ?? 0;
    this.selfKnockbackStrength = config.selfKnockbackStrength ?? 0;

    const behaviorPreset = typeof config.behaviorPreset === 'string'
      ? config.behaviorPreset
      : (typeof config.behaviorConfig?.preset === 'string' ? config.behaviorConfig.preset : null);
    if (behaviorPreset) {
      this.applyBehaviorPreset(behaviorPreset);
    }
    this.applyBehaviorConfig(config.behaviorConfig);

    if (this.behavior === 'bull' && config.knockbackStrength != null) {
      this.bullKnockbackStrength = config.knockbackStrength;
    }

    // Stagger initial nav repath to avoid synchronized CPU spikes on grouped enemy spawns.
    this.navRepathTimer = this.getJitteredRepathInterval();

    this.initialize();
  }

  private applyBehaviorConfig(behaviorConfig: EnemyRuntimeConfig['behaviorConfig']): void {
    if (!behaviorConfig) return;

    this.bullTriggerRange = behaviorConfig.triggerRange ?? this.bullTriggerRange;
    this.bullAimDuration = behaviorConfig.aimDuration ?? this.bullAimDuration;
    this.bullChargeDuration = behaviorConfig.chargeDuration ?? this.bullChargeDuration;
    this.bullChargeSpeedMultiplier = behaviorConfig.chargeSpeedMultiplier ?? this.bullChargeSpeedMultiplier;
    this.bullHitRange = behaviorConfig.hitRange ?? this.bullHitRange;
    this.bullCooldownDuration = behaviorConfig.chargeCooldown ?? this.bullCooldownDuration;
    this.bullKnockbackStrength = behaviorConfig.knockbackStrength ?? this.bullKnockbackStrength;
    this.bullModelScale = behaviorConfig.modelScale ?? this.bullModelScale;
    this.useCrowdSteering = behaviorConfig.useCrowd ?? this.useCrowdSteering;
    this.separationRadius = behaviorConfig.separationRadius ?? this.separationRadius;
    this.separationStrength = behaviorConfig.separationStrength ?? this.separationStrength;
    this.crowdMinDistance = behaviorConfig.crowdMinDistance ?? this.crowdMinDistance;
    this.avoidObstacles = behaviorConfig.avoidObstacles ?? this.avoidObstacles;
    this.avoidDistance = behaviorConfig.avoidDistance ?? this.avoidDistance;
    this.canFly = behaviorConfig.canFly ?? this.canFly;
    this.avoidVoid = behaviorConfig.avoidVoid ?? this.avoidVoid;
    this.canFallIntoVoid = behaviorConfig.canFallIntoVoid ?? this.canFallIntoVoid;
    this.navRepathInterval = behaviorConfig.navRepathInterval ?? this.navRepathInterval;
    this.pongInitialAngleDeg = behaviorConfig.initialAngleDeg ?? this.pongInitialAngleDeg;
    this.pongContactDamageRatio = behaviorConfig.contactDamageRatio ?? this.pongContactDamageRatio;
    this.pongContactKnockback = behaviorConfig.contactKnockback ?? this.pongContactKnockback;
    this.jumperTriggerRange = behaviorConfig.triggerRange ?? this.jumperTriggerRange;
    this.jumperAimDuration = behaviorConfig.aimDuration ?? this.jumperAimDuration;
    this.jumperJumpDuration = behaviorConfig.jumpDuration ?? this.jumperJumpDuration;
    this.jumperJumpSpeedMultiplier = behaviorConfig.jumpSpeedMultiplier ?? this.jumperJumpSpeedMultiplier;
    this.jumperHitRange = behaviorConfig.hitRange ?? this.jumperHitRange;
    this.jumperCooldownDuration = behaviorConfig.jumpCooldown ?? this.jumperCooldownDuration;
    this.jumperJumpHeight = behaviorConfig.jumpHeight ?? this.jumperJumpHeight;
    this.jumperShockwaveEnabled = behaviorConfig.shockwaveEnabled ?? this.jumperShockwaveEnabled;
    this.jumperShockwaveRadius = behaviorConfig.shockwaveRadius ?? this.jumperShockwaveRadius;
    this.jumperShockwaveDuration = behaviorConfig.shockwaveDuration ?? this.jumperShockwaveDuration;
    this.jumperShockwaveDamage = behaviorConfig.shockwaveDamage ?? this.jumperShockwaveDamage;
    this.pongRadius = behaviorConfig.pongRadius ?? this.pongRadius;
    this.kiteMinRange = behaviorConfig.kiteMinRange ?? this.kiteMinRange;
    this.kiteMaxRange = behaviorConfig.kiteMaxRange ?? this.kiteMaxRange;
    this.fuyardPanicTriggerRange = behaviorConfig.panicTriggerRange ?? this.fuyardPanicTriggerRange;
    this.fuyardPanicDuration = behaviorConfig.panicDuration ?? this.fuyardPanicDuration;
    this.fuyardChaosJitter = behaviorConfig.panicChaosJitter ?? this.fuyardChaosJitter;
    this.fuyardStrafeStrength = behaviorConfig.strafeStrength ?? this.fuyardStrafeStrength;
    this.orbitStrength = behaviorConfig.orbitStrength ?? this.orbitStrength;
    this.leadTime = behaviorConfig.leadTime ?? this.leadTime;
    this.rangedMinRange = behaviorConfig.rangedMinRange ?? this.rangedMinRange;
    this.rangedMaxRange = behaviorConfig.rangedMaxRange ?? this.rangedMaxRange;
    this.rangedCooldown = behaviorConfig.rangedCooldown ?? this.rangedCooldown;
    this.rangedProjectileSpeed = behaviorConfig.projectileSpeed ?? this.rangedProjectileSpeed;
    this.rangedProjectileRange = behaviorConfig.projectileRange ?? this.rangedProjectileRange;
    this.rangedProjectileBounces = behaviorConfig.projectileBounces ?? this.rangedProjectileBounces;
    this.rangedProjectileBounceDamping = behaviorConfig.projectileBounceDamping ?? this.rangedProjectileBounceDamping;
    this.rangedWindup = behaviorConfig.rangedWindup ?? this.rangedWindup;
    this.prefireWindup = behaviorConfig.prefireWindup ?? this.prefireWindup;
    this.prefireLeadBonus = behaviorConfig.prefireLeadBonus ?? this.prefireLeadBonus;
    this.swarmCommandInterval = behaviorConfig.swarmCommandInterval ?? this.swarmCommandInterval;
    this.swarmCommandRange = behaviorConfig.swarmCommandRange ?? this.swarmCommandRange;
    this.swarmCommandDuration = behaviorConfig.swarmCommandDuration ?? this.swarmCommandDuration;
    this.swarmCommandWeight = behaviorConfig.swarmCommandWeight ?? this.swarmCommandWeight;
    this.swarmFormationRadius = behaviorConfig.swarmFormationRadius ?? this.swarmFormationRadius;
    this.healerRange = behaviorConfig.healRange ?? this.healerRange;
    this.healerAmount = behaviorConfig.healAmount ?? this.healerAmount;
    this.healerCooldown = behaviorConfig.healCooldown ?? this.healerCooldown;
    this.artificerMinRange = behaviorConfig.artificerMinRange ?? this.artificerMinRange;
    this.artificerMaxRange = behaviorConfig.artificerMaxRange ?? this.artificerMaxRange;
    this.artificerCooldown = behaviorConfig.artificerCooldown ?? this.artificerCooldown;
    this.artificerWindup = behaviorConfig.artificerWindup ?? this.artificerWindup;
    this.artificerSplitCount = behaviorConfig.splitCount ?? this.artificerSplitCount;
    this.artificerSplitRadius = behaviorConfig.splitRadius ?? this.artificerSplitRadius;
    this.artificerSplitDelay = behaviorConfig.splitDelay ?? this.artificerSplitDelay;
    this.artificerExplosionRadius = behaviorConfig.explosionRadius ?? this.artificerExplosionRadius;
    this.artificerExplosionDamage = behaviorConfig.explosionDamage ?? this.artificerExplosionDamage;
    this.artificerImpactRadius = behaviorConfig.impactRadius ?? this.artificerImpactRadius;
    this.artificerImpactDamage = behaviorConfig.impactDamage ?? this.artificerImpactDamage;
    this.artificerDotRadius = behaviorConfig.dotRadius ?? this.artificerDotRadius;
    this.artificerDotDps = behaviorConfig.dotDps ?? this.artificerDotDps;
    this.artificerDotDuration = behaviorConfig.dotDuration ?? this.artificerDotDuration;
    this.artificerSplitTravelSpeed = behaviorConfig.splitTravelSpeed ?? this.artificerSplitTravelSpeed;
    this.artificerImpactDuration = behaviorConfig.impactDuration ?? this.artificerImpactDuration;
    this.artificerFinalDuration = behaviorConfig.finalDuration ?? this.artificerFinalDuration;
    this.bulletHellCount = behaviorConfig.bulletCount ?? this.bulletHellCount;
    this.bulletHellSpreadDeg = behaviorConfig.spreadDeg ?? this.bulletHellSpreadDeg;
    this.bulletHellCooldown = behaviorConfig.bulletCooldown ?? this.bulletHellCooldown;
    this.missileCooldown = behaviorConfig.missileCooldown ?? this.missileCooldown;
    this.missileTurnRate = behaviorConfig.missileTurnRate ?? this.missileTurnRate;
    this.missileMinSpeed = behaviorConfig.missileMinSpeed ?? this.missileMinSpeed;
    this.missileMaxSpeed = behaviorConfig.missileMaxSpeed ?? this.missileMaxSpeed;
    this.missileAccel = behaviorConfig.missileAccel ?? this.missileAccel;
    this.necromancerSummonCooldown = behaviorConfig.summonCooldown ?? this.necromancerSummonCooldown;
    this.necromancerSummonType = behaviorConfig.summonType ?? this.necromancerSummonType;
    this.necromancerSummonRadius = behaviorConfig.summonRadius ?? this.necromancerSummonRadius;
    this.spikeCastSubsystem.configure(behaviorConfig);
    this.laserPatternSubsystem.configure(behaviorConfig);
  }

  private initialize(): void {
    // Create visual
    this.mesh = VisualPlaceholder.createEnemyPlaceholder(this.scene, this.id);
    this.mesh.position = this.position.clone();
    this.mesh.rotation = Vector3.Zero();
    // Ensure enemy is at correct height
    this.mesh.position.y = 1.0 + EnemyController.globalHeightOffset;
    this.mesh.checkCollisions = true;
    this.mesh.metadata = { isEnemy: true, enemyId: this.id, typeId: this.typeId };

    // Setup health
    const maxHP = this.config.baseStats?.hp || 40;
    this.health = new Health(maxHP, this.id);

    // Setup attack stats (config is already the zombie_basic object)
    this.speed = this.config.baseStats?.speed ?? this.speed;
    this.damage = this.config.baseStats?.damage ?? this.damage;
    this.attackRange = this.config.baseStats?.attackRange ?? this.attackRange;
    this.attackCooldown = 0;

    this.emitSpawnEventIfNeeded();

    if (this.behavior === 'bull') {
      this.queueBullModelLoad();
    }

    this.applyRenderSuppressionState();
  }

  update(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager,
    playerVelocity: Vector3 = Vector3.Zero(),
    playerDetected: boolean = true,
    freezeEnemies: boolean = false,
  ): void {
    if (this.isDisposed || !this.isAlive || !this.mesh || this.mesh.isDisposed()) return;

    if (this.behavior === 'dummy') {
      this.previousPosition = this.position.clone();
      const knock = this.knockback.update(deltaTime);
      this.position = this.position.add(knock);
      this.applyMeshPosition();
      this.checkVoidFallCandidate(roomManager);
      return;
    }

    if (this.commandRemaining > 0) {
      this.commandRemaining = Math.max(0, this.commandRemaining - deltaTime);
      if (this.commandRemaining <= 0) {
        this.commandTarget = null;
        this.commandWeight = 0;
      }
    }

    if (this.falling) {
      this.updateFalling(deltaTime);
      return;
    }

    if (freezeEnemies || this.aiSuppressed) {
      return; // Don't update if frozen
    }

    // Apply DOTs
    if (this.dots.length > 0) {
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        const dmg = dot.dps * deltaTime;
        if (dmg > 0) {
          this.takeDamage(dmg);
        }
        dot.remaining -= deltaTime;
        if (dot.remaining <= 0) {
          this.dots.splice(i, 1);
        }
      }
    }

    if (this.stunRemaining > 0) {
      this.stunRemaining = Math.max(0, this.stunRemaining - deltaTime);
      this.previousPosition = this.position.clone();
      const knock = this.knockback.update(deltaTime);
      this.position = this.position.add(knock);
      this.applyMeshPosition();
      if (this.attackCooldown > 0) {
        this.attackCooldown -= deltaTime;
      }
      this.checkVoidFallCandidate(roomManager);
      return;
    }

    if (!playerDetected) {
      this.velocity = Vector3.Zero();
      this.previousPosition = this.position.clone();
      const knock = this.knockback.update(deltaTime);
      this.position = this.position.add(knock);
      this.applyMeshPosition();
      if (this.attackCooldown > 0) {
        this.attackCooldown -= deltaTime;
      }
      this.checkVoidFallCandidate(roomManager);
      return;
    }

    this.target = playerPosition;

    if (this.behavior === 'bull') {
      this.updateBull(deltaTime, playerPosition, allEnemies, roomManager);
    } else if (this.behavior === 'pong') {
      this.updatePong(deltaTime, playerPosition, allEnemies, roomManager);
    } else if (this.behavior === 'jumper') {
      this.updateJumper(deltaTime, playerPosition, allEnemies, roomManager);
    } else if (this.behavior === 'fuyard') {
      this.updateFuyard(deltaTime, playerPosition, allEnemies, roomManager);
    } else if (this.behavior === 'strategist') {
      this.updateStrategist(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);
    } else if (this.behavior === 'swarm_coordinator') {
      this.updateSwarmCoordinator(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);
    } else if (this.behavior === 'prefire_sentinel') {
      this.updatePrefireSentinel(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);
    } else if (this.behavior === 'sentinel') {
      this.updateRanged(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager, false);
    } else if (this.behavior === 'necromancer') {
      this.updateNecromancer(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);
    } else if (this.behavior === 'spike_strategist') {
      this.updateSpikeStrategist(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);
    } else if (this.behavior === 'laser_patterns') {
      this.updateLaserPatternBoss(deltaTime, playerPosition, playerVelocity, roomManager);
    } else if (this.behavior === 'turret') {
      this.updateRanged(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager, true);
    } else if (this.behavior === 'healer') {
      this.updateHealer(deltaTime, playerPosition, allEnemies, roomManager);
    } else if (this.behavior === 'artificer') {
      this.updateArtificer(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);
    } else if (this.behavior === 'bullet_hell') {
      this.updateBulletHell(deltaTime, playerPosition, playerVelocity);
    } else if (this.behavior === 'mage_missile') {
      this.updateMageMissile(deltaTime, playerPosition);
    } else if (this.behavior === 'missile') {
      this.updateMissile(deltaTime, playerPosition, roomManager);
    } else {
      // Update movement towards player
      this.updateMovement(deltaTime, playerPosition, allEnemies, roomManager);

      this.previousPosition = this.position.clone();
      const knock = this.knockback.update(deltaTime);
      this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
      this.applyMeshPosition();

      // Update attack cooldown
      if (this.attackCooldown > 0) {
        this.attackCooldown -= deltaTime;
      }
    }

    this.checkVoidFallCandidate(roomManager);
  }

  private updateHealer(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    let target: EnemyController | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const ally of allEnemies) {
      if (ally === this || !ally.isActive()) continue;
      const hp = ally.getHealth();
      if (hp && hp.getCurrentHP() < hp.getMaxHP()) {
        const dist = Vector3.Distance(this.position, ally.getPosition());
        if (dist < bestDist) {
          bestDist = dist;
          target = ally;
        }
      }
    }

    if (!target) {
      this.velocity = Vector3.Zero();
    } else {
      const toTarget = target.getPosition().subtract(this.position);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist > this.healerRange) {
        let desired = toTarget.normalize();
        if (this.useCrowdSteering && allEnemies.length > 0) {
          const separation = this.computeSeparation(allEnemies);
          if (separation.lengthSquared() > 0.0001) {
            desired = desired.add(separation).normalize();
          }
        }
        if (this.avoidObstacles && roomManager) {
          desired = this.avoidWalls(desired, roomManager);
          desired = this.applyStuckNudge(desired, deltaTime, roomManager);
        }
        this.velocity = desired.scale(this.speed);
      } else {
        this.velocity = Vector3.Zero();
        this.healerTimer -= deltaTime;
        if (this.healerTimer <= 0) {
          target.heal(this.healerAmount);
          this.healerTimer = this.healerCooldown;
        }
      }
    }

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();
  }

  private updateArtificer(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    let desired = Vector3.Zero();
    if (distance < this.artificerMinRange) {
      desired = toPlayer.scale(-1);
    } else if (distance > this.artificerMaxRange) {
      desired = toPlayer;
    }

    if (desired.lengthSquared() > 0.0001) {
      desired = desired.normalize();
    }

    if (this.useCrowdSteering && allEnemies.length > 0) {
      const separation = this.computeSeparation(allEnemies);
      if (separation.lengthSquared() > 0.0001) {
        desired = desired.add(separation).normalize();
      }
    }

    if (this.avoidObstacles && roomManager) {
      desired = this.avoidWalls(desired, roomManager);
      desired = this.applyStuckNudge(desired, deltaTime, roomManager);
    }

    this.velocity = desired.scale(this.speed);

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();

    this.artificerTimer -= deltaTime;
    if (this.artificerTimer <= 0 && distance <= this.artificerMaxRange) {
      this.fireArtificerProjectile(playerPosition, playerVelocity);
      this.artificerTimer = this.artificerCooldown;
      if (this.selfKnockbackStrength > 0) {
        const recoil = toPlayer.normalize().scale(-this.selfKnockbackStrength);
        this.knockback.apply(recoil);
      }
    }
  }

  private fireArtificerProjectile(playerPosition: Vector3, playerVelocity: Vector3): void {
    const target = playerPosition.add(playerVelocity.scale(this.leadTime));
    const dir = target.subtract(this.position);
    dir.y = 0;
    if (dir.lengthSquared() <= 0.0001) return;

    this.eventBus.emit(GameEvents.PROJECTILE_SPAWNED, {
      position: this.position.clone(),
      direction: dir.normalize(),
      damage: this.damage,
      speed: this.rangedProjectileSpeed,
      range: this.rangedProjectileRange,
      friendly: false,
      projectileType: 'artificer_main',
      splitConfig: {
        count: this.artificerSplitCount,
        radius: this.artificerSplitRadius,
        delay: this.artificerSplitDelay,
        explosionRadius: this.artificerExplosionRadius,
        explosionDamage: this.artificerExplosionDamage,
        impactRadius: this.artificerImpactRadius,
        impactDamage: this.artificerImpactDamage,
        dotRadius: this.artificerDotRadius,
        dotDps: this.artificerDotDps,
        dotDuration: this.artificerDotDuration,
        travelSpeed: this.artificerSplitTravelSpeed,
        impactDuration: this.artificerImpactDuration,
        finalDuration: this.artificerFinalDuration,
      },
    });
  }

  private updateBulletHell(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3
  ): void {
    this.velocity = Vector3.Zero();
    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(knock);
    this.applyMeshPosition();

    this.bulletHellTimer -= deltaTime;
    if (this.bulletHellTimer <= 0) {
      this.fireBulletHell(playerPosition, playerVelocity);
      this.bulletHellTimer = this.bulletHellCooldown;
    }
  }

  private fireBulletHell(playerPosition: Vector3, playerVelocity: Vector3): void {
    const target = playerPosition.add(playerVelocity.scale(this.leadTime));
    const dir = target.subtract(this.position);
    dir.y = 0;
    if (dir.lengthSquared() <= 0.0001) return;

    const baseDir = dir.normalize();
    const spread = (this.bulletHellSpreadDeg * Math.PI) / 180;
    const count = Math.max(1, this.bulletHellCount);
    const start = -spread / 2;
    const step = count > 1 ? spread / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const angle = start + step * i;
      const rotated = this.rotate2D(baseDir, angle);
      this.eventBus.emit(GameEvents.PROJECTILE_SPAWNED, {
        position: this.position.clone(),
        direction: rotated.normalize(),
        damage: this.damage,
        speed: this.rangedProjectileSpeed,
        range: this.rangedProjectileRange,
        friendly: false,
        maxBounces: this.rangedProjectileBounces,
        bounceDamping: this.rangedProjectileBounceDamping,
      });
    }
  }

  private updateMageMissile(deltaTime: number, playerPosition: Vector3): void {
    this.velocity = Vector3.Zero();
    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(knock);
    this.applyMeshPosition();

    this.missileTimer -= deltaTime;
    if (this.missileTimer <= 0) {
      const spawnPos = this.position.add(new Vector3(0, 0, 0));
      this.eventBus.emit(GameEvents.ENEMY_SPAWN_REQUESTED, {
        typeId: 'missile',
        position: spawnPos,
      });
      this.missileTimer = this.missileCooldown;
    }
  }

  private updateMissile(
    deltaTime: number,
    playerPosition: Vector3,
    roomManager?: RoomManager
  ): void {
    const desired = playerPosition.subtract(this.position);
    desired.y = 0;
    if (desired.lengthSquared() <= 0.0001) return;

    const desiredDir = desired.normalize();
    if (this.missileSpeed <= 0) {
      this.missileDirection = desiredDir;
      this.missileSpeed = this.missileMinSpeed;
    }

    const turn = this.missileTurnRate * deltaTime;
    this.missileDirection = this.missileDirection.add(desiredDir.subtract(this.missileDirection).scale(turn)).normalize();
    const alignment = Math.max(-1, Math.min(1, Vector3.Dot(this.missileDirection, desiredDir)));
    const targetSpeed = this.missileMinSpeed + (this.missileMaxSpeed - this.missileMinSpeed) * ((alignment + 1) / 2);
    this.missileSpeed += (targetSpeed - this.missileSpeed) * this.missileAccel * deltaTime;

    this.velocity = this.missileDirection.scale(this.missileSpeed);

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    const candidate = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    if (roomManager) {
      const radius = this.getRadius();
      const hitsObstacle = this.collidesObstacle(candidate, roomManager, radius);
      const hitsWall = this.isVisionBlockedAtXZ(candidate.x, candidate.z, roomManager);
      const sweptHit = this.pathBlockedWithRadius(this.position, candidate, roomManager, radius);
      if (hitsWall || hitsObstacle || sweptHit) {
        this.explodeMissile(playerPosition, candidate, roomManager);
        this.die();
        return;
      }
    }
    this.position = candidate;
    this.applyMeshPosition();
  }

  private explodeMissile(
    playerPosition: Vector3,
    explosionPosition: Vector3 = this.position,
    roomManager?: RoomManager
  ): void {
    const effectiveRadius = roomManager
      ? this.computeMaskedEffectRadius(explosionPosition, this.attackRange, roomManager)
      : this.attackRange;

    const distance = Vector3.Distance(playerPosition, explosionPosition);
    if (distance <= effectiveRadius) {
      this.attackPlayer();
    }
    const expMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `missile_ex_${Date.now()}`, effectiveRadius);
    expMesh.position = explosionPosition.clone();
    setTimeout(() => expMesh.dispose(), 200);
  }

  private pathBlockedWithRadius(start: Vector3, end: Vector3, roomManager: RoomManager, radius: number): boolean {
    const delta = end.subtract(start);
    const distance = delta.length();
    if (distance <= 0.0001) return false;
    const steps = Math.max(2, Math.ceil(distance / 0.25));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sample = start.add(delta.scale(t));
      if (this.isVisionBlockedAt(sample, roomManager)) {
        return true;
      }
      if (this.collidesObstacle(sample, roomManager, radius)) {
        return true;
      }
    }
    return false;
  }

  private collidesObstacle(position: Vector3, roomManager: RoomManager, radius: number): boolean {
    const obstacles = roomManager.getObstacleBounds();
    for (const ob of obstacles) {
      if (
        position.x >= ob.minX - radius && position.x <= ob.maxX + radius &&
        position.z >= ob.minZ - radius && position.z <= ob.maxZ + radius
      ) {
        return true;
      }
    }
    return false;
  }

  private computeMaskedEffectRadius(center: Vector3, desiredRadius: number, roomManager: RoomManager): number {
    const desired = Math.max(0.1, desiredRadius);
    const directions = 28;
    const step = 0.07;
    let minDistance = desired;

    for (let i = 0; i < directions; i++) {
      const angle = (Math.PI * 2 * i) / directions;
      const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      let distance = step;
      let lastWalkable = 0;

      while (distance <= desired) {
        const sample = center.add(dir.scale(distance));
        if (this.isVisionBlockedAt(sample, roomManager)) {
          break;
        }
        lastWalkable = distance;
        distance += step;
      }

      minDistance = Math.min(minDistance, Math.max(step, lastWalkable));
    }

    return Math.max(0.1, minDistance);
  }

  private updateFuyard(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    if (distance <= this.fuyardPanicTriggerRange && this.fuyardPanicTimer <= 0) {
      this.fuyardPanicTimer = this.fuyardPanicDuration;
      this.fuyardChaosTimer = 0;
    }

    const panicActive = this.fuyardPanicTimer > 0;
    if (panicActive) {
      this.fuyardPanicTimer = Math.max(0, this.fuyardPanicTimer - deltaTime);
      this.fuyardChaosTimer -= deltaTime;
    }

    let desired = Vector3.Zero();
    if (panicActive) {
      const away = this.position.subtract(playerPosition);
      away.y = 0;
      if (away.lengthSquared() > 0.0001) {
        desired = away.normalize();
      }

      if (this.fuyardChaosTimer <= 0) {
        const jitterAngle = (Math.random() - 0.5) * Math.PI * 1.1;
        this.fuyardChaosDirection = this.rotate2D(desired.lengthSquared() > 0.0001 ? desired : new Vector3(1, 0, 0), jitterAngle).normalize();
        this.fuyardChaosTimer = 0.12 + Math.random() * 0.18;
      }

      desired = desired.scale(1.0).add(this.fuyardChaosDirection.scale(this.fuyardChaosJitter));
    } else {
      if (distance > this.kiteMaxRange) {
        desired = toPlayer;
      } else {
        const radialSign = distance < this.kiteMinRange ? -1 : 0.2;
        const radial = toPlayer.lengthSquared() > 0.0001 ? toPlayer.normalize().scale(radialSign) : Vector3.Zero();
        this.orbitFlipTimer -= deltaTime;
        if (this.orbitFlipTimer <= 0) {
          this.orbitSign = Math.random() < 0.5 ? -1 : 1;
          this.orbitFlipTimer = this.orbitFlipCooldown;
        }
        const tangentSource = toPlayer.lengthSquared() > 0.0001 ? toPlayer.normalize() : new Vector3(1, 0, 0);
        const tangent = this.rotate2D(tangentSource, this.orbitSign * Math.PI * 0.5).scale(this.fuyardStrafeStrength);
        desired = radial.add(tangent);
      }
    }

    if (desired.lengthSquared() <= 0.0001) {
      const fallback = toPlayer.lengthSquared() > 0.0001
        ? this.rotate2D(toPlayer.normalize(), this.orbitSign * Math.PI * 0.5)
        : this.rotate2D(new Vector3(1, 0, 0), deltaTime * 3.3);
      desired = fallback;
    }

    if (this.avoidObstacles && roomManager && desired.lengthSquared() > 0.0001) {
      const virtualTarget = this.position.add(desired.normalize().scale(3));
      const pathDirection = this.computePathDirection(virtualTarget, roomManager, deltaTime);
      if (pathDirection.lengthSquared() > 0.0001) {
        desired = pathDirection;
      }
    }

    if (this.useCrowdSteering && allEnemies.length > 0) {
      const separation = this.computeSeparation(allEnemies);
      if (separation.lengthSquared() > 0.0001) {
        desired = desired.add(separation);
      }
    }

    desired = this.applyCommandInfluence(desired);

    if (desired.lengthSquared() > 0.0001) {
      desired = desired.normalize();
    }

    if (this.avoidObstacles && roomManager && desired.lengthSquared() > 0.0001) {
      desired = this.avoidWalls(desired, roomManager);
      desired = this.applyStuckNudge(desired, deltaTime, roomManager);
    }

    const panicSpeedMultiplier = panicActive ? 1.25 : 1;
    this.velocity = desired.lengthSquared() > 0.0001
      ? desired.scale(this.speed * panicSpeedMultiplier)
      : Vector3.Zero();

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();
  }

  private updateStrategist(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    const predicted = playerPosition.add(playerVelocity.scale(this.leadTime));
    this.target = predicted;
    this.updateMovement(deltaTime, predicted, allEnemies, roomManager);

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
  }

  private updateSwarmCoordinator(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    this.updateRanged(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager, false);

    this.swarmCommandTimer -= deltaTime;
    if (this.swarmCommandTimer > 0) {
      return;
    }

    const allies = allEnemies.filter((enemy) => {
      if (enemy === this || !enemy.isActive()) return false;
      if (enemy.getBehavior() === 'missile') return false;
      return Vector3.DistanceSquared(enemy.getPosition(), this.position) <= this.swarmCommandRange * this.swarmCommandRange;
    });

    if (allies.length === 0) {
      this.swarmCommandTimer = this.swarmCommandInterval;
      return;
    }

    const predictedCenter = playerPosition.add(playerVelocity.scale(this.leadTime * 0.8));
    const baseAngle = Math.atan2(this.position.z - predictedCenter.z, this.position.x - predictedCenter.x);

    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      const angle = baseAngle + (Math.PI * 2 * i) / Math.max(1, allies.length) + (Math.random() - 0.5) * 0.35;
      const radiusJitter = this.swarmFormationRadius * (0.82 + Math.random() * 0.36);
      const target = new Vector3(
        predictedCenter.x + Math.cos(angle) * radiusJitter,
        ally.getPosition().y,
        predictedCenter.z + Math.sin(angle) * radiusJitter,
      );

      ally.applySwarmCommand(target, this.swarmCommandDuration, this.swarmCommandWeight);
    }

    this.swarmCommandTimer = this.swarmCommandInterval;
  }

  private updatePrefireSentinel(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    let desired = Vector3.Zero();
    if (distance < this.rangedMinRange) {
      desired = toPlayer.scale(-1);
    } else if (distance > this.rangedMaxRange) {
      desired = toPlayer;
    } else if (toPlayer.lengthSquared() > 0.0001) {
      desired = this.rotate2D(toPlayer.normalize(), this.orbitSign * Math.PI * 0.5).scale(0.24);
    }

    if (desired.lengthSquared() > 0.0001) {
      desired = desired.normalize();
    }

    if (this.useCrowdSteering && allEnemies.length > 0) {
      const separation = this.computeSeparation(allEnemies);
      if (separation.lengthSquared() > 0.0001) {
        desired = desired.add(separation).normalize();
      }
    }

    desired = this.applyCommandInfluence(desired);

    if (this.avoidObstacles && roomManager) {
      desired = this.avoidWalls(desired, roomManager);
      desired = this.applyStuckNudge(desired, deltaTime, roomManager);
    }

    this.velocity = desired.scale(this.speed);
    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    if (this.prefireState === 'windup') {
      this.prefireTimer -= deltaTime;
      this.rotateToward(this.prefireLockedDirection, deltaTime, 8);
      if (this.prefireTimer <= 0) {
        this.fireProjectileInDirection(this.prefireLockedDirection);
        this.prefireState = 'idle';
      }
      return;
    }

    if (distance <= this.rangedMaxRange && this.attackCooldown <= 0) {
      const predictiveDirection = this.computePredictiveDirection(
        this.position,
        playerPosition,
        playerVelocity,
        this.rangedProjectileSpeed,
        this.leadTime + this.prefireLeadBonus,
      );
      if (predictiveDirection.lengthSquared() > 0.0001) {
        this.prefireLockedDirection = predictiveDirection;
        this.prefireTimer = this.prefireWindup;
        this.prefireState = 'windup';
        this.attackCooldown = this.prefireWindup;
      }
    }
  }

  private updateRanged(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager,
    stationary: boolean = false
  ): void {
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    if (!stationary) {
      let desired = Vector3.Zero();
      if (distance < this.rangedMinRange) {
        desired = toPlayer.scale(-1);
      } else if (distance > this.rangedMaxRange) {
        desired = toPlayer;
      }

      if (desired.lengthSquared() > 0.0001) {
        desired = desired.normalize();
      }

      if (this.useCrowdSteering && allEnemies.length > 0) {
        const separation = this.computeSeparation(allEnemies);
        if (separation.lengthSquared() > 0.0001) {
          desired = desired.add(separation).normalize();
        }
      }

      desired = this.applyCommandInfluence(desired);

      if (this.avoidObstacles && roomManager) {
        desired = this.avoidWalls(desired, roomManager);
        desired = this.applyStuckNudge(desired, deltaTime, roomManager);
      }

      this.velocity = desired.scale(this.speed);
    } else {
      this.velocity = Vector3.Zero();
    }

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    if (distance <= this.rangedMaxRange && this.attackCooldown <= 0) {
      if (this.rangedWindup > 0) {
        this.attackCooldown = this.rangedWindup;
      } else {
        this.fireProjectile(playerPosition, playerVelocity);
      }
    } else if (this.attackCooldown > 0 && this.attackCooldown <= 0.001 && this.rangedWindup > 0) {
      this.fireProjectile(playerPosition, playerVelocity);
    }
  }

  private updateNecromancer(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    this.updateRanged(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager, false);

    this.necromancerSummonTimer -= deltaTime;
    if (this.necromancerSummonTimer > 0) {
      return;
    }

    const summonPosition = this.getNecromancerSummonPosition(roomManager);
    this.eventBus.emit(GameEvents.ENEMY_SPAWN_REQUESTED, {
      typeId: this.necromancerSummonType,
      position: summonPosition,
    });
    this.necromancerSummonTimer = this.necromancerSummonCooldown;
  }

  private getNecromancerSummonPosition(roomManager?: RoomManager): Vector3 {
    const center = this.position.clone();
    const base = center.add(new Vector3(this.necromancerSummonRadius, 0, 0));

    if (!roomManager) {
      return base;
    }

    const attempts = 8;
    for (let i = 0; i < attempts; i++) {
      const angle = (Math.PI * 2 * i) / attempts;
      const candidate = center.add(new Vector3(
        Math.cos(angle) * this.necromancerSummonRadius,
        0,
        Math.sin(angle) * this.necromancerSummonRadius
      ));
      if (roomManager.isWalkable(candidate.x, candidate.z)) {
        return candidate;
      }
    }

    return center;
  }

  private updateSpikeStrategist(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    this.updateStrategist(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager);

    if (!roomManager) return;

    this.spikeCastSubsystem.update({
      deltaTime,
      playerPosition,
      roomManager,
      onAttackPlayerWithDamage: (damage) => this.attackPlayerWithDamage(damage),
    });
  }

  private updateLaserPatternBoss(
    deltaTime: number,
    playerPosition: Vector3,
    playerVelocity: Vector3,
    roomManager?: RoomManager
  ): void {
    if (!roomManager) return;

    const bounds = roomManager.getRoomBounds();
    if (bounds) {
      this.velocity = Vector3.Zero();
      this.previousPosition = this.position.clone();
      this.position.x = (bounds.minX + bounds.maxX) * 0.5;
      this.position.z = (bounds.minZ + bounds.maxZ) * 0.5;
      const knock = this.knockback.update(deltaTime);
      this.position = this.position.add(knock);
      this.applyMeshPosition();
    }

    const bossCenter = new Vector3(this.position.x, 0.06, this.position.z);
    this.laserPatternSubsystem.update({
      deltaTime,
      bossCenter,
      playerPosition,
      playerVelocity,
      roomManager,
      isVisionBlockedAt: (position, room) => this.isVisionBlockedAt(position, room),
      onRotateToward: (direction, dt, speed) => this.rotateToward(direction, dt, speed),
      onAttackPlayerWithDamage: (damage) => this.attackPlayerWithDamage(damage),
    });
  }

  private fireProjectile(playerPosition: Vector3, playerVelocity: Vector3): void {
    const target = playerPosition.add(playerVelocity.scale(this.leadTime));
    const dir = target.subtract(this.position);
    dir.y = 0;
    if (dir.lengthSquared() <= 0.0001) return;

    this.fireProjectileInDirection(dir.normalize());
  }

  private fireProjectileInDirection(direction: Vector3): void {
    const dir = direction.lengthSquared() > 0.0001 ? direction.normalize() : Vector3.Zero();
    if (dir.lengthSquared() <= 0.0001) {
      return;
    }

    this.eventBus.emit(GameEvents.PROJECTILE_SPAWNED, {
      position: this.position.clone(),
      direction: dir,
      damage: this.damage,
      speed: this.rangedProjectileSpeed,
      range: this.rangedProjectileRange,
      friendly: false,
      maxBounces: this.rangedProjectileBounces,
      bounceDamping: this.rangedProjectileBounceDamping,
    });

    this.attackCooldown = this.rangedCooldown;
  }

  private updateBull(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    const distance = Vector3.Distance(this.position, playerPosition);

    const previousState = this.bullState;

    switch (this.bullState) {
      case 'chase': {
        if (distance <= this.bullTriggerRange) {
          this.bullState = 'aim';
          this.bullTimer = this.bullAimDuration;
          const dir = playerPosition.subtract(this.position);
          dir.y = 0;
          if (dir.lengthSquared() > 0.0001) {
            this.bullLockedDirection = dir.normalize();
          }
          this.velocity = Vector3.Zero();
        } else {
          this.updateMovement(deltaTime, playerPosition, allEnemies, roomManager);
        }
        break;
      }
      case 'aim': {
        this.velocity = Vector3.Zero();
        const dir = playerPosition.subtract(this.position);
        dir.y = 0;
        if (dir.lengthSquared() > 0.0001) {
          this.bullLockedDirection = dir.normalize();
          this.rotateToward(this.bullLockedDirection, deltaTime, 10);
        }
        this.bullTimer -= deltaTime;
        if (this.bullTimer <= 0) {
          this.bullState = 'charge';
          this.bullTimer = this.bullChargeDuration;
        }
        break;
      }
      case 'charge': {
        this.rotateToward(this.bullLockedDirection, deltaTime, 25);
        this.velocity = this.bullLockedDirection.scale(this.speed * this.bullChargeSpeedMultiplier);
        this.bullTimer -= deltaTime;
        if (this.bullTimer <= 0) {
          this.bullState = 'cooldown';
          this.bullTimer = this.bullCooldownDuration;
          this.velocity = Vector3.Zero();
        }
        break;
      }
      case 'cooldown': {
        this.velocity = Vector3.Zero();
        this.bullTimer -= deltaTime;
        if (this.bullTimer <= 0) {
          this.bullState = 'chase';
        }
        break;
      }
      default:
        this.bullState = 'chase';
        break;
    }

    if (previousState !== this.bullState) {
      this.handleBullStateChange(previousState, this.bullState);
    }

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    this.position = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    this.applyMeshPosition();
  }

  private updatePong(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    if (!this.pongInitialized) {
      const angleDeg = this.pongInitialAngleDeg ?? (Math.random() * 360);
      const angleRad = (angleDeg * Math.PI) / 180;
      this.pongDirection = new Vector3(Math.cos(angleRad), 0, Math.sin(angleRad)).normalize();
      this.pongInitialized = true;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    let dir = this.pongDirection.clone();
    const knock = this.knockback.update(deltaTime);
    const movement = dir.scale(this.speed * deltaTime).add(knock);

    this.previousPosition = this.position.clone();
    let candidate = this.position.add(movement);

    const bounceAxis = this.getPongBounceAxis(candidate, movement, roomManager);

    const hitsPlayer = this.isPongTouchingPlayer(candidate, playerPosition);
    if (hitsPlayer && this.attackCooldown <= 0) {
      this.applyPongContactDamage();
    }

    let finalAxis = bounceAxis;
    if (!finalAxis && hitsPlayer) {
      finalAxis = this.getPongPlayerBounceAxis(candidate, playerPosition, movement);
    }

    if (finalAxis === 'x') {
      dir = new Vector3(-dir.x, 0, dir.z);
    } else if (finalAxis === 'z') {
      dir = new Vector3(dir.x, 0, -dir.z);
    }

    if (finalAxis) {
      candidate = this.position.add(dir.scale(this.speed * deltaTime)).add(knock);
      if (this.isPongTouchingPlayer(candidate, playerPosition) || this.isPongBlockedByEnvironment(candidate, roomManager)) {
        dir = dir.scale(-1);
        candidate = this.position.add(dir.scale(this.speed * deltaTime)).add(knock);
      }
    }

    if (!this.isPongBlockedByEnvironment(candidate, roomManager) && !this.isPongTouchingEnemy(candidate, allEnemies)) {
      this.position.copyFrom(candidate);
    }

    this.pongDirection = dir.normalize();
    this.velocity = this.pongDirection.scale(this.speed);
    this.applyMeshPosition();
  }

  private updateJumper(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    const distance = Vector3.Distance(this.position, playerPosition);

    switch (this.jumperState) {
      case 'chase': {
        if (distance <= this.jumperTriggerRange) {
          this.jumperState = 'aim';
          this.jumperTimer = this.jumperAimDuration;
          const dir = playerPosition.subtract(this.position);
          dir.y = 0;
          if (dir.lengthSquared() > 0.0001) {
            this.jumperLockedDirection = dir.normalize();
          }
          this.velocity = Vector3.Zero();
        } else {
          this.updateMovement(deltaTime, playerPosition, allEnemies, roomManager);
        }
        break;
      }
      case 'aim': {
        this.velocity = Vector3.Zero();
        this.jumperTimer -= deltaTime;
        if (this.jumperTimer <= 0) {
          this.jumperState = 'jump';
          this.jumperTimer = this.jumperJumpDuration;
        }
        break;
      }
      case 'jump': {
        this.velocity = this.jumperLockedDirection.scale(this.speed * this.jumperJumpSpeedMultiplier);
        this.jumperTimer -= deltaTime;
        if (this.jumperTimer <= 0) {
          this.handleJumperLandingImpact(playerPosition, roomManager);
          this.jumperState = 'cooldown';
          this.jumperTimer = this.jumperCooldownDuration;
          this.velocity = Vector3.Zero();
        }
        break;
      }
      case 'cooldown': {
        this.velocity = Vector3.Zero();
        this.jumperTimer -= deltaTime;
        if (this.jumperTimer <= 0) {
          this.jumperState = 'chase';
        }
        break;
      }
      default:
        this.jumperState = 'chase';
        break;
    }

    this.previousPosition = this.position.clone();
    const knock = this.knockback.update(deltaTime);
    const candidate = this.position.add(this.velocity.scale(deltaTime)).add(knock);
    if (this.jumperState === 'jump' && roomManager && !this.isWalkable(candidate, roomManager)) {
      this.jumperState = 'cooldown';
      this.jumperTimer = this.jumperCooldownDuration;
      this.velocity = Vector3.Zero();
    } else {
      this.position = candidate;
    }

    // Apply vertical arc during jump
    if (this.jumperState === 'jump') {
      const progress = 1 - Math.max(0, this.jumperTimer) / this.jumperJumpDuration;
      this.verticalOffset = Math.sin(Math.PI * progress) * this.jumperJumpHeight;
    } else {
      this.verticalOffset = 0;
    }
    this.applyMeshPosition();
  }

  private handleJumperLandingImpact(playerPosition: Vector3, roomManager?: RoomManager): void {
    const distance = Vector3.Distance(this.position, playerPosition);

    if (this.jumperShockwaveEnabled && this.jumperShockwaveRadius > 0) {
      const effectiveRadius = roomManager
        ? this.computeMaskedEffectRadius(this.position, this.jumperShockwaveRadius, roomManager)
        : this.jumperShockwaveRadius;

      this.renderJumperShockwave(effectiveRadius, this.jumperShockwaveDuration);
      if (distance <= effectiveRadius && this.attackCooldown <= 0) {
        const damage = this.jumperShockwaveDamage > 0 ? this.jumperShockwaveDamage : this.damage;
        this.attackPlayerWithDamage(damage);
      }
      return;
    }

    if (distance <= this.jumperHitRange && this.attackCooldown <= 0) {
      this.attackPlayer();
    }
  }

  private renderJumperShockwave(radius: number, duration: number): void {
    const shockwave = VisualPlaceholder.createAoEPlaceholder(this.scene, `jumper_shock_${Date.now()}`, 0.2);
    shockwave.position = this.position.clone();
    shockwave.position.y = 0.06;

    const material = new StandardMaterial(`jumper_shock_mat_${Date.now()}`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.2, 0.2);
    material.emissiveColor = new Color3(0.5, 0.0, 0.0);
    material.alpha = 0.45;
    shockwave.material = material;

    const startMs = Date.now();
    const totalMs = Math.max(100, duration * 1000);
    const handle = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const t = Math.min(1, elapsed / totalMs);
      const currentRadius = 0.2 + (radius - 0.2) * t;
      shockwave.scaling.x = currentRadius / 0.2;
      shockwave.scaling.z = currentRadius / 0.2;
      material.alpha = 0.45 * (1 - t);

      if (t >= 1) {
        clearInterval(handle);
        material.dispose();
        shockwave.dispose();
      }
    }, 16);
  }

  handleContactHit(playerPosition: Vector3): Vector3 | null {
    if (this.attackCooldown > 0) return null;

    if (this.behavior === 'bull') {
      if (this.bullState !== 'charge') return null;
      this.attackPlayer();
      this.bullState = 'cooldown';
      this.bullTimer = this.bullCooldownDuration;
      this.velocity = Vector3.Zero();

      if (this.selfKnockbackStrength > 0) {
        const recoil = this.bullLockedDirection.scale(-this.selfKnockbackStrength);
        this.knockback.apply(recoil);
      }

      const knock = playerPosition.subtract(this.position);
      knock.y = 0;
      if (knock.lengthSquared() > 0.0001) {
        return knock.normalize().scale(this.bullKnockbackStrength);
      }
      return null;
    }

    if (this.behavior === 'jumper' && this.jumperState === 'jump') {
      return null;
    }

    if (this.behavior === 'missile') {
      this.attackPlayer();
      this.die();
      return null;
    }

    if (this.behavior === 'pong') {
      this.applyPongContactDamage();
      const knock = playerPosition.subtract(this.position);
      knock.y = 0;
      if (knock.lengthSquared() > 0.0001) {
        return knock.normalize().scale(this.pongContactKnockback);
      }
      return null;
    }

    this.attackPlayer();
    if (this.selfKnockbackStrength > 0) {
      const recoil = this.position.subtract(playerPosition);
      recoil.y = 0;
      if (recoil.lengthSquared() > 0.0001) {
        this.knockback.apply(recoil.normalize().scale(this.selfKnockbackStrength));
      }
    }
    if (this.knockbackStrength > 0) {
      const knock = playerPosition.subtract(this.position);
      knock.y = 0;
      if (knock.lengthSquared() > 0.0001) {
        return knock.normalize().scale(this.knockbackStrength);
      }
    }
    return null;
  }

  onWallCollision(): void {
    if (this.behavior === 'bull' && this.bullState === 'charge') {
      this.bullState = 'cooldown';
      this.bullTimer = this.bullCooldownDuration;
      this.velocity = Vector3.Zero();
    }
    if (this.behavior === 'jumper' && this.jumperState === 'jump') {
      this.jumperState = 'cooldown';
      this.jumperTimer = this.jumperCooldownDuration;
      this.velocity = Vector3.Zero();
    }
    if (this.behavior === 'pong' && this.pongDirection.lengthSquared() > 0.0001) {
      this.pongDirection = this.pongDirection.scale(-1);
      this.velocity = Vector3.Zero();
    }
  }

  private bounceAgainstAabb(
    direction: Vector3,
    nextPos: Vector3,
    radius: number,
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): Vector3 {
    const expanded = {
      minX: box.minX - radius,
      maxX: box.maxX + radius,
      minZ: box.minZ - radius,
      maxZ: box.maxZ + radius,
    };

    const inside =
      nextPos.x >= expanded.minX && nextPos.x <= expanded.maxX &&
      nextPos.z >= expanded.minZ && nextPos.z <= expanded.maxZ;

    if (!inside) return direction;

    const distLeft = Math.abs(nextPos.x - expanded.minX);
    const distRight = Math.abs(expanded.maxX - nextPos.x);
    const distTop = Math.abs(expanded.maxZ - nextPos.z);
    const distBottom = Math.abs(nextPos.z - expanded.minZ);

    const minX = Math.min(distLeft, distRight);
    const minZ = Math.min(distTop, distBottom);

    if (minX < minZ) {
      return new Vector3(-direction.x, 0, direction.z);
    }
    return new Vector3(direction.x, 0, -direction.z);
  }

  private reflectFromNormal(direction: Vector3, normal: Vector3): Vector3 {
    const dot = direction.x * normal.x + direction.z * normal.z;
    return new Vector3(direction.x - 2 * dot * normal.x, 0, direction.z - 2 * dot * normal.z).normalize();
  }

  getPreviousPosition(): Vector3 {
    return this.previousPosition.clone();
  }

  private updateMovement(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    if (!this.target) {
      this.velocity = Vector3.Zero();
      return;
    }

    let desired = this.target.subtract(this.position);
    const distance = desired.length();

    if (distance <= this.attackRange) {
      this.velocity = Vector3.Zero();
      return;
    }

    if (desired.lengthSquared() > 0.0001) {
      desired = desired.normalize();
    }

    if (this.avoidObstacles && roomManager) {
      const pathDirection = this.computePathDirection(playerPosition, roomManager, deltaTime);
      if (pathDirection.lengthSquared() > 0.0001) {
        desired = pathDirection;
      }
    }

    if (this.useCrowdSteering && allEnemies.length > 0) {
      const separation = this.computeSeparation(allEnemies);
      if (separation.lengthSquared() > 0.0001) {
        desired = desired.add(separation).normalize();
      }
    }

    desired = this.applyCommandInfluence(desired);

    if (this.avoidObstacles && roomManager) {
      desired = this.avoidWalls(desired, roomManager);
    }

    this.velocity = desired.scale(this.speed);
  }

  private computePathDirection(target: Vector3, roomManager: RoomManager, deltaTime: number): Vector3 {
    this.navRepathTimer -= deltaTime;
    const targetMoved = !this.navTargetSnapshot || Vector3.DistanceSquared(this.navTargetSnapshot, target) > 0.64;

    if (this.navRepathTimer <= 0 || targetMoved || this.navPath.length === 0) {
      const path = roomManager.findPath(this.position, target, this.getNavigationCapabilities());
      this.navPath = path;
      this.navPathCursor = path.length > 1 ? 1 : 0;
      this.navTargetSnapshot = target.clone();
      this.navRepathTimer = this.getJitteredRepathInterval();
    }

    if (this.navPath.length === 0) {
      const direct = target.subtract(this.position);
      direct.y = 0;
      return direct.lengthSquared() > 0.0001 ? direct.normalize() : Vector3.Zero();
    }

    while (this.navPathCursor < this.navPath.length - 1) {
      const waypoint = this.navPath[this.navPathCursor];
      if (Vector3.DistanceSquared(this.position, waypoint) > 0.09) {
        break;
      }
      this.navPathCursor++;
    }

    const nextWaypoint = this.navPath[this.navPathCursor] ?? target;
    const dir = nextWaypoint.subtract(this.position);
    dir.y = 0;
    if (dir.lengthSquared() <= 0.0001) {
      const direct = target.subtract(this.position);
      direct.y = 0;
      return direct.lengthSquared() > 0.0001 ? direct.normalize() : Vector3.Zero();
    }
    return dir.normalize();
  }

  private computeSeparation(allEnemies: EnemyController[]): Vector3 {
    let forceX = 0;
    let forceZ = 0;
    let count = 0;

    for (const other of allEnemies) {
      if (other === this || !other.isActive()) continue;
      const otherPos = other.getPositionRef();
      const deltaX = this.position.x - otherPos.x;
      const deltaZ = this.position.z - otherPos.z;
      const distSq = deltaX * deltaX + deltaZ * deltaZ;
      const range = Math.max(this.separationRadius + other.getRadius(), this.crowdMinDistance + other.getRadius());
      if (distSq > 0.0001 && distSq < range * range) {
        const dist = Math.sqrt(distSq);
        const strength = (range - dist) / range;
        const invDist = 1 / dist;
        forceX += deltaX * invDist * strength;
        forceZ += deltaZ * invDist * strength;
        count++;
      }
    }

    if (count > 0) {
      const scale = (1 / count) * this.separationStrength;
      return new Vector3(forceX * scale, 0, forceZ * scale);
    }

    return Vector3.Zero();
  }

  private avoidWalls(desired: Vector3, roomManager: RoomManager): Vector3 {
    const forwardPos = this.position.add(desired.scale(this.avoidDistance));
    if (this.isWalkable(forwardPos, roomManager)) {
      return desired;
    }

    const left45 = this.rotate2D(desired, Math.PI / 4);
    const right45 = this.rotate2D(desired, -Math.PI / 4);
    if (this.isWalkable(this.position.add(left45.scale(this.avoidDistance)), roomManager)) return left45;
    if (this.isWalkable(this.position.add(right45.scale(this.avoidDistance)), roomManager)) return right45;

    const left90 = this.rotate2D(desired, Math.PI / 2);
    const right90 = this.rotate2D(desired, -Math.PI / 2);
    if (this.isWalkable(this.position.add(left90.scale(this.avoidDistance)), roomManager)) return left90;
    if (this.isWalkable(this.position.add(right90.scale(this.avoidDistance)), roomManager)) return right90;

    return desired;
  }

  private applyStuckNudge(desired: Vector3, deltaTime: number, roomManager: RoomManager): Vector3 {
    const forwardPos = this.position.add(desired.scale(this.avoidDistance));
    const forwardBlocked = !this.isWalkable(forwardPos, roomManager);

    if (!forwardBlocked) {
      this.stuckTimer = 0;
      this.lastPosition = this.position.clone();
      return desired;
    }

    const moved = Vector3.Distance(this.position, this.lastPosition);
    if (moved < this.stuckThreshold) {
      this.stuckTimer += deltaTime;
    } else {
      this.stuckTimer = 0;
    }
    this.lastPosition = this.position.clone();

    if (this.stuckTimer < this.stuckTimeToNudge) {
      return desired;
    }

    const left = this.rotate2D(desired, Math.PI / 2);
    const right = this.rotate2D(desired, -Math.PI / 2);
    const leftPos = this.position.add(left.scale(this.avoidDistance));
    const rightPos = this.position.add(right.scale(this.avoidDistance));

    if (this.isWalkable(leftPos, roomManager)) return left;
    if (this.isWalkable(rightPos, roomManager)) return right;

    return desired;
  }

  private rotate2D(dir: Vector3, angle: number): Vector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector3(dir.x * cos - dir.z * sin, 0, dir.x * sin + dir.z * cos);
  }

  applySwarmCommand(target: Vector3, duration: number, weight: number): void {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
      return;
    }

    this.commandTarget = target.clone();
    this.commandRemaining = Math.max(this.commandRemaining, Math.max(0.05, duration));
    this.commandWeight = Math.max(0, Math.min(1, weight));
  }

  private applyCommandInfluence(baseDesired: Vector3): Vector3 {
    if (!this.commandTarget || this.commandRemaining <= 0) {
      return baseDesired;
    }

    const towardCommand = this.commandTarget.subtract(this.position);
    towardCommand.y = 0;
    if (towardCommand.lengthSquared() <= 0.0001) {
      return baseDesired;
    }

    const commandDirection = towardCommand.normalize();
    if (baseDesired.lengthSquared() <= 0.0001) {
      return commandDirection;
    }

    return baseDesired.scale(1 - this.commandWeight).add(commandDirection.scale(this.commandWeight));
  }

  private computePredictiveDirection(
    shooterPosition: Vector3,
    targetPosition: Vector3,
    targetVelocity: Vector3,
    projectileSpeed: number,
    fallbackLead: number
  ): Vector3 {
    const toTarget = targetPosition.subtract(shooterPosition);
    toTarget.y = 0;
    const targetVel2D = new Vector3(targetVelocity.x, 0, targetVelocity.z);
    const speedSq = Math.max(0.0001, projectileSpeed * projectileSpeed);

    const a = targetVel2D.lengthSquared() - speedSq;
    const b = 2 * Vector3.Dot(toTarget, targetVel2D);
    const c = toTarget.lengthSquared();

    let time: number | null = null;
    if (Math.abs(a) < 0.0001) {
      if (Math.abs(b) > 0.0001) {
        const t = -c / b;
        if (t > 0) {
          time = t;
        }
      }
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtDisc = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);
        const candidates = [t1, t2].filter((t) => t > 0);
        if (candidates.length > 0) {
          time = Math.min(...candidates);
        }
      }
    }

    const leadTime = time != null ? time : Math.max(0, fallbackLead);
    const intercept = targetPosition.add(targetVel2D.scale(leadTime));
    const direction = intercept.subtract(shooterPosition);
    direction.y = 0;
    return direction.lengthSquared() > 0.0001 ? direction.normalize() : Vector3.Zero();
  }

  private applyBehaviorPreset(preset: string): void {
    switch (preset) {
      case 'aggressive-melee':
        this.useCrowdSteering = true;
        this.avoidObstacles = true;
        this.navRepathInterval = 0.3;
        this.separationRadius = 1.05;
        this.separationStrength = 1.0;
        this.avoidVoid = true;
        this.canFallIntoVoid = false;
        break;
      case 'panic-kiter':
        this.useCrowdSteering = true;
        this.avoidObstacles = true;
        this.navRepathInterval = 0.2;
        this.kiteMinRange = 2.0;
        this.kiteMaxRange = 5.0;
        this.fuyardPanicTriggerRange = 1.8;
        this.fuyardPanicDuration = 1.3;
        this.fuyardChaosJitter = 1.0;
        this.fuyardStrafeStrength = 0.55;
        this.canFallIntoVoid = false;
        this.avoidVoid = true;
        break;
      case 'swarm-coordinator':
        this.useCrowdSteering = true;
        this.avoidObstacles = true;
        this.rangedMinRange = 3.2;
        this.rangedMaxRange = 6.2;
        this.rangedCooldown = 1.35;
        this.swarmCommandInterval = 1.35;
        this.swarmCommandRange = 9.5;
        this.swarmCommandDuration = 1.5;
        this.swarmCommandWeight = 0.66;
        this.swarmFormationRadius = 3.1;
        break;
      case 'predictive-prefire':
        this.useCrowdSteering = true;
        this.avoidObstacles = true;
        this.rangedMinRange = 3.6;
        this.rangedMaxRange = 7.4;
        this.rangedCooldown = 1.5;
        this.prefireWindup = 0.52;
        this.prefireLeadBonus = 0.28;
        this.leadTime = Math.max(this.leadTime, 0.35);
        break;
      default:
        break;
    }
  }

  private isWalkable(position: Vector3, roomManager: RoomManager): boolean {
    return roomManager.isWalkableFor(position.x, position.z, this.getNavigationCapabilities());
  }

  private isVisionBlockedAt(position: Vector3, roomManager: RoomManager): boolean {
    return this.isVisionBlockedAtXZ(position.x, position.z, roomManager);
  }

  private isVisionBlockedAtXZ(x: number, z: number, roomManager: RoomManager): boolean {
    const tileType = roomManager.getTileTypeAtWorld(x, z);
    return tileType === 'wall' || tileType === 'out';
  }

  private getJitteredRepathInterval(): number {
    const base = Math.max(0.05, this.navRepathInterval);
    const jitter = 0.75 + Math.random() * 0.5;
    return base * jitter;
  }

  private attackPlayerWithDamage(damage: number): void {
    this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
      attacker: this.id,
      type: 'melee',
      damage,
    });

    this.attackCooldown = this.config.baseStats?.attackCooldown ?? this.attackCooldown;
  }

  private attackPlayer(): void {
    this.attackPlayerWithDamage(this.damage);
  }

  private emitSpawnEventIfNeeded(): void {
    if (this.suppressSpawnEvent || !this.mesh) {
      return;
    }

    const maxHP = this.health?.getMaxHP?.() ?? (this.config.baseStats?.hp || 40);
    this.eventBus.emit(GameEvents.ENEMY_SPAWNED, {
      entityId: this.id,
      enemyType: this.typeId,
      enemyName: this.config?.name ?? this.id,
      maxHP,
      mesh: this.mesh,
    });
  }

  revealSpawnEventIfSuppressed(): void {
    if (!this.suppressSpawnEvent || this.isDisposed || !this.mesh) {
      return;
    }
    this.suppressSpawnEvent = false;
    this.emitSpawnEventIfNeeded();
  }

  setAISuppressed(value: boolean): void {
    this.aiSuppressed = value;
  }

  setRenderSuppressed(value: boolean): void {
    this.renderSuppressed = value === true;
    this.applyRenderSuppressionState();
  }

  setFogMask(mask: EnemyFogMask | null): void {
    this.fogMask = mask;
    this.applyRenderSuppressionState();
  }

  deactivateForTransition(): void {
    if (this.isDisposed || !this.isAlive) {
      return;
    }

    this.isAlive = false;
    this.aiSuppressed = true;
    this.stunRemaining = 0;
    if (this.mesh) {
      this.mesh.setEnabled(false);
    }
    if (this.bullModelRoot) {
      this.bullModelRoot.setEnabled(false);
    }
  }

  takeDamage(amount: number): void {
    console.log(`[EnemyController] ${this.id} (${this.typeId}) took ${amount} damage at ${this.position}`);
    this.health.takeDamage(amount);

    this.eventBus.emit(GameEvents.ENEMY_DAMAGED, {
      entityId: this.id,
      damage: amount,
      position: this.position.clone(),
    });

    if (this.health.getCurrentHP() <= 0) {
      this.die();
    }
  }

  heal(amount: number): void {
    if (!this.health || amount <= 0) return;
    this.health.heal(amount);
  }

  private die(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.isAlive = false;
    this.laserPatternSubsystem.dispose();
    this.spikeCastSubsystem.dispose();
    this.disposeBullVisuals();
    this.bullModelLoadPromise = null;
    if (this.mesh) {
      this.mesh.dispose();
    }
    this.eventBus.emit(GameEvents.ENEMY_DIED, {
      entityId: this.id,
      enemyType: this.typeId,
      position: this.position.clone(),
    });
  }

  getPosition(): Vector3 {
    return this.position.clone();
  }

  getPositionRef(): Vector3 {
    return this.position;
  }

  setPosition(position: Vector3): void {
    this.position = position.clone();
    this.position.y = 1.0 + EnemyController.globalHeightOffset;
    if (!this.falling && this.mesh) {
      this.mesh.visibility = this.renderSuppressed ? 0 : 1;
    }
    this.applyMeshPosition();
  }

  getRadius(): number {
    return 0.35;
  }

  applyDot(totalDamage: number, duration: number): void {
    if (duration <= 0) return;
    const dps = totalDamage / duration;
    this.dots.push({ remaining: duration, dps });
  }

  applyExternalKnockback(force: Vector3): void {
    this.knockback.apply(force);
  }

  applyStun(duration: number): void {
    if (duration <= 0) return;
    this.stunRemaining = Math.max(this.stunRemaining, duration);
  }

  getHealth(): Health {
    return this.health;
  }

  getMesh(): Mesh {
    return this.mesh;
  }

  isActive(): boolean {
    return this.isAlive;
  }

  getId(): string {
    return this.id;
  }

  getBehavior(): string {
    return this.behavior;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.isAlive = false;
    this.laserPatternSubsystem.dispose();
    this.spikeCastSubsystem.dispose();
    this.disposeBullVisuals();
    this.bullModelLoadPromise = null;
    this.navPath = [];
    this.navPathCursor = 0;
    this.navTargetSnapshot = null;
    this.commandTarget = null;
    this.commandRemaining = 0;
    this.commandWeight = 0;
    this.target = null;
    this.velocity = Vector3.Zero();
    this.stunRemaining = 0;
    this.falling = false;
    this.fallOffset = 0;
    this.fallSpeed = 0;
    this.fallFxTimer = 0;
    this.bullState = 'chase';
    this.bullTimer = 0;
    this.bullAnimState = 'none';
    this.jumperState = 'chase';
    this.jumperTimer = 0;
    this.pongInitialized = false;
    this.prefireState = 'idle';
    this.prefireTimer = 0;
    this.swarmCommandTimer = 0;
    this.healerTimer = 0;
    this.artificerTimer = 0;
    this.bulletHellTimer = 0;
    this.missileTimer = 0;
    this.necromancerSummonTimer = 0;
    if (this.mesh) {
      this.mesh.dispose();
    }
  }

  private disposeBullVisuals(): void {
    for (const group of this.bullAnimGroups.values()) {
      group.stop();
      group.dispose();
    }
    this.bullAnimGroups.clear();
    if (this.bullModelRoot) {
      this.bullModelRoot.dispose(false, false);
      this.bullModelRoot = null;
    }
  }

  private applyMeshPosition(): void {
    if (!this.mesh) return;
    this.mesh.position = this.position.clone();
    this.mesh.position.y = 1.0 + this.verticalOffset + this.fallOffset + EnemyController.globalHeightOffset;
    this.applyRenderSuppressionState();
  }

  private applyRenderSuppressionState(): void {
    const delta = Math.max(0, this.time.deltaTime || 0);
    if (this.fogScanPulseTimer > 0) {
      this.fogScanPulseTimer = Math.max(0, this.fogScanPulseTimer - delta);
    }

    let baseVisibility = this.renderSuppressed ? 0 : 1;
    let revealProgressForScan = this.fogRevealProgress;

    // Apply Z-based fog masking
    if (this.fogMask && !this.renderSuppressed) {
      const { z, direction, revealDistance, hiddenVisibility } = this.fogMask;
      const distBehindFog = (this.position.z - z) * direction;
      const revealRange = Math.max(0.2, revealDistance);
      const revealProgress = Math.max(0, Math.min(1, (-distBehindFog) / revealRange));
      revealProgressForScan = revealProgress;
      if (revealProgress > this.fogRevealProgress + 0.08 && revealProgress > 0.04 && revealProgress < 1.0) {
        this.fogScanPulseTimer = this.fogScanPulseDuration;
      }
      const easedReveal = revealProgress * revealProgress * (3 - (2 * revealProgress));
      const minVisibility = Math.max(0, Math.min(1, hiddenVisibility));
      const fogVisibility = minVisibility + ((1 - minVisibility) * easedReveal);
      baseVisibility = Math.min(baseVisibility, fogVisibility);
    } else {
      revealProgressForScan = 1;
    }
    this.fogRevealProgress = revealProgressForScan;

    const scanPulse = this.fogScanPulseDuration > 0
      ? Math.max(0, Math.min(1, this.fogScanPulseTimer / this.fogScanPulseDuration))
      : 0;
    const scanEdge = this.fogMask && !this.renderSuppressed
      ? Math.max(0, 1 - (Math.abs(revealProgressForScan - 0.24) * 3.0)) * 0.82
      : 0;
    const visibilityGate = baseVisibility > 0.02 ? 1 : 0;
    const scanIntensity = Math.max(scanPulse * 1.2, scanEdge) * visibilityGate;
    this.applyFogScanOverlay(scanIntensity);

    if (this.mesh && !this.mesh.isDisposed()) {
      if (!this.falling) {
        this.mesh.visibility = baseVisibility;
        this.mesh.setEnabled(baseVisibility > 0.01);
      }
    }

    if (this.bullModelRoot && !this.bullModelRoot.isDisposed()) {
      const shouldEnable = baseVisibility > 0.12;
      this.bullModelRoot.setEnabled(shouldEnable);
    }
  }

  private applyFogScanOverlay(intensity: number): void {
    const overlayIntensity = Math.max(0, Math.min(1, intensity));
    const applyToMesh = (mesh: AbstractMesh | null | undefined): void => {
      if (!mesh || mesh.isDisposed()) {
        return;
      }
      mesh.renderOverlay = overlayIntensity > 0.01;
      mesh.overlayColor = new Color3(0.26, 0.80, 1.0);
      mesh.overlayAlpha = Math.min(1, overlayIntensity * 0.92);
    };

    applyToMesh(this.mesh);
    if (this.mesh && !this.mesh.isDisposed()) {
      for (const child of this.mesh.getChildMeshes()) {
        applyToMesh(child);
      }
    }
  }

  private getNavigationCapabilities(): NavigationCapabilities {
    return {
      canFly: this.canFly,
      avoidVoid: this.avoidVoid,
      canFallIntoVoid: this.canFallIntoVoid,
    };
  }

  private checkVoidFallCandidate(roomManager?: RoomManager): void {
    if (!roomManager) return;
    if (this.falling || this.canFly || !this.canFallIntoVoid || !this.isAlive) return;
    const tileType = roomManager.getTileTypeAtWorld(this.position.x, this.position.z);
    if (tileType === 'void') {
      this.beginFall();
    }
  }

  private beginFall(): void {
    if (this.falling) return;
    this.falling = true;
    this.velocity = Vector3.Zero();
    this.fallSpeed = 0;
    this.fallOffset = 0;
    this.fallFxTimer = 0;
    this.navPath = [];
    this.navPathCursor = 0;
    this.navTargetSnapshot = null;
    this.spawnVoidDisintegrationBurst(this.position, 6);
  }

  private updateFalling(deltaTime: number): void {
    this.fallSpeed += 20 * deltaTime;
    this.fallOffset -= this.fallSpeed * deltaTime;
    const progress = Math.min(1, Math.abs(this.fallOffset) / this.fallDeathDepth);
    if (this.mesh) {
      this.mesh.visibility = this.renderSuppressed
        ? 0
        : Math.max(0.04, 1 - progress * 0.96);
    }

    this.fallFxTimer -= deltaTime;
    if (this.fallFxTimer <= 0) {
      this.spawnVoidDisintegrationBurst(this.position.add(new Vector3(0, this.fallOffset * 0.15, 0)), 2);
      this.fallFxTimer = 0.09;
    }

    this.applyMeshPosition();
    if (this.fallOffset <= -this.fallDeathDepth) {
      this.die();
    }
  }

  private spawnVoidDisintegrationBurst(origin: Vector3, count: number): void {
    const particleCount = Math.max(1, Math.floor(count));
    for (let i = 0; i < particleCount; i++) {
      const shard = MeshBuilder.CreateBox(`void_enemy_shard_${this.id}_${Date.now()}_${i}`, {
        size: 0.06 + Math.random() * 0.08,
      }, this.scene);
      shard.position = origin.add(new Vector3(
        (Math.random() - 0.5) * 0.35,
        0.05 + Math.random() * 0.35,
        (Math.random() - 0.5) * 0.35,
      ));

      const shardMat = new StandardMaterial(`void_enemy_shard_mat_${this.id}_${Date.now()}_${i}`, this.scene);
      shardMat.diffuseColor = new Color3(0.08, 0.95, 0.55);
      shardMat.emissiveColor = new Color3(0.06, 0.6, 0.32);
      shardMat.alpha = 0.85;
      shard.material = shardMat;

      const velocity = new Vector3(
        (Math.random() - 0.5) * 2.1,
        0.4 + Math.random() * 1.4,
        (Math.random() - 0.5) * 2.1,
      );
      const gravity = 6.5;
      const bornAt = Date.now();
      const ttlMs = 220 + Math.random() * 190;

      const tick = window.setInterval(() => {
        if (shard.isDisposed()) {
          window.clearInterval(tick);
          return;
        }

        const elapsedMs = Date.now() - bornAt;
        const t = Math.min(1, elapsedMs / ttlMs);
        const dt = 1 / 60;
        velocity.y -= gravity * dt;
        shard.position.addInPlace(velocity.scale(dt));
        shard.scaling.scaleInPlace(0.95);
        shardMat.alpha = Math.max(0, 0.85 * (1 - t));

        if (t >= 1) {
          window.clearInterval(tick);
          shard.dispose();
          shardMat.dispose();
        }
      }, 16);
    }
  }

  private rotateToward(direction: Vector3, deltaTime: number, turnSpeed: number): void {
    if (!this.mesh) return;
    const dir = direction.clone();
    dir.y = 0;
    if (dir.lengthSquared() <= 0.0001) return;
    const targetYaw = Math.atan2(dir.x, dir.z);
    const currentYaw = this.mesh.rotation.y;
    const delta = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
    const maxStep = turnSpeed * deltaTime;
    const step = Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
    this.mesh.rotation.y = currentYaw + step;
  }

  private handleBullStateChange(previous: typeof this.bullState, next: typeof this.bullState): void {
    if (next === 'charge') {
      this.playBullAnimStartThenRun();
      return;
    }
    if (previous === 'charge' && next === 'cooldown') {
      this.playBullAnimEnd();
      return;
    }
    if (next === 'chase') {
      this.stopBullAnims();
    }
  }

  private playBullAnimStartThenRun(): void {
    const start = this.bullAnimGroups.get('charge_start.002');
    const run = this.bullAnimGroups.get('charge_run.001');
    if (!run) return;
    if (!start) {
      this.stopBullAnims();
      this.bullAnimState = 'run';
      run.start(true, 1.0, run.from, run.to, false);
      return;
    }
    this.stopBullAnims();
    this.bullAnimState = 'start';
    start.start(false, 1.0, start.from, start.to, false);
    start.onAnimationEndObservable.addOnce(() => {
      if (this.bullState !== 'charge') {
        return;
      }
      this.stopBullAnims();
      this.bullAnimState = 'run';
      run.start(true, 1.0, run.from, run.to, false);
    });
  }

  private playBullAnimEnd(): void {
    const end = this.bullAnimGroups.get('charge_end.004');
    if (!end) return;
    this.stopBullAnims();
    this.bullAnimState = 'end';
    end.start(false, 1.0, end.from, end.to, false);
    end.onAnimationEndObservable.addOnce(() => {
      this.bullAnimState = 'none';
      end.stop();
    });
  }

  private stopBullAnims(): void {
    for (const group of this.bullAnimGroups.values()) {
      group.stop();
    }
    this.bullAnimState = 'none';
  }

  private queueBullModelLoad(): void {
    if (this.isDisposed || this.mesh.isDisposed() || this.bullModelRoot || this.bullModelLoadPromise) {
      return;
    }

    const task = EnemyController.enqueueBullInstantiation(async () => {
      if (this.isDisposed || !this.isAlive || !this.mesh || this.bullModelRoot) {
        return;
      }
      await this.loadBullModel();
    });

    this.bullModelLoadPromise = task;
    task.finally(() => {
      if (this.bullModelLoadPromise === task) {
        this.bullModelLoadPromise = null;
      }
    });
  }

  private static enqueueBullInstantiation(run: () => Promise<void>): Promise<void> {
    const task = this.bullInstantiationChain.then(run, run);
    this.bullInstantiationChain = task
      .then(() => this.waitForBullInstantiateTimeslice())
      .catch(() => this.waitForBullInstantiateTimeslice());
    return task;
  }

  private static waitForBullInstantiateTimeslice(): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(), 0);
    });
  }

  private static getBullVisualOwnerId(node: TransformNode): string | null {
    const metadata = node.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const ownerId = (metadata as Record<string, unknown>).bullVisualOwnerId;
    return typeof ownerId === 'string' ? ownerId : null;
  }

  private static isBullVisualRootNode(node: TransformNode): boolean {
    const metadata = node.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }
    return (metadata as Record<string, unknown>).bullVisualRoot === true;
  }

  private static markBullVisualNode(node: TransformNode, ownerId: string, isRoot: boolean): void {
    const metadata = (node.metadata && typeof node.metadata === 'object')
      ? (node.metadata as Record<string, unknown>)
      : {};

    metadata.bullVisualOwnerId = ownerId;
    if (isRoot) {
      metadata.bullVisualRoot = true;
    } else if (metadata.bullVisualRoot === true) {
      delete metadata.bullVisualRoot;
    }

    node.metadata = metadata;
  }

  private static markBullVisualHierarchy(root: TransformNode, ownerId: string): void {
    this.markBullVisualNode(root, ownerId, true);
    for (const child of root.getChildTransformNodes(true)) {
      this.markBullVisualNode(child, ownerId, false);
    }
    for (const childMesh of root.getChildMeshes(true)) {
      this.markBullVisualNode(childMesh, ownerId, false);
    }
  }

  private static dedupeBullVisualRootsForOwner(scene: Scene, ownerId: string): void {
    const expectedRootName = `bull_root_${ownerId}`;
    const roots = scene.transformNodes.filter((node) => {
      if (!node || node.isDisposed()) {
        return false;
      }
      if (node.name === expectedRootName) {
        return true;
      }
      return this.getBullVisualOwnerId(node) === ownerId && this.isBullVisualRootNode(node);
    });

    if (roots.length <= 1) {
      return;
    }

    const keep = roots.reduce((best, current) => {
      const currentCount = current.getChildMeshes(false).length;
      const bestCount = best.getChildMeshes(false).length;
      return currentCount > bestCount ? current : best;
    }, roots[0]);

    for (const root of roots) {
      if (root === keep || root.isDisposed()) {
        continue;
      }
      root.dispose(false, false);
    }
  }

  static cleanupOrphanBullVisuals(scene: Scene, activeEnemyIds: Set<string>): void {
    const activeRootsByOwner = new Map<string, TransformNode[]>();
    const activeRootNames = new Set<string>();
    for (const activeEnemyId of activeEnemyIds) {
      activeRootNames.add(`bull_root_${activeEnemyId}`);
    }

    for (const node of scene.transformNodes) {
      if (!node || node.isDisposed()) {
        continue;
      }

      if (node.name.startsWith('bull_root_') && !activeRootNames.has(node.name)) {
        node.dispose(false, false);
        continue;
      }

      const ownerId = this.getBullVisualOwnerId(node);
      if (!ownerId) {
        continue;
      }

      if (!activeEnemyIds.has(ownerId)) {
        node.dispose(false, false);
        continue;
      }

      if (!this.isBullVisualRootNode(node)) {
        continue;
      }

      const list = activeRootsByOwner.get(ownerId);
      if (list) {
        list.push(node);
      } else {
        activeRootsByOwner.set(ownerId, [node]);
      }
    }

    for (const mesh of scene.meshes) {
      if (!mesh || mesh.isDisposed()) {
        continue;
      }

      const ownerId = this.getBullVisualOwnerId(mesh);
      if (!ownerId || activeEnemyIds.has(ownerId)) {
        continue;
      }

      mesh.dispose(false, false);
    }

    for (const roots of activeRootsByOwner.values()) {
      if (roots.length <= 1) {
        continue;
      }

      const keep = roots.reduce((best, current) => {
        const currentCount = current.getChildMeshes(false).length;
        const bestCount = best.getChildMeshes(false).length;
        return currentCount > bestCount ? current : best;
      }, roots[0]);

      for (const root of roots) {
        if (root === keep || root.isDisposed()) {
          continue;
        }
        root.dispose(false, false);
      }
    }
  }

  private async loadBullModel(): Promise<void> {
    if (this.isDisposed || this.bullModelRoot || !this.mesh || this.mesh.isDisposed() || !this.isAlive) {
      return;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL ?? '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const rootUrl = `${normalizedBase}models/bull/`;
      const result = await SceneLoader.ImportMeshAsync(
        '',
        rootUrl,
        'bull.glb',
        this.scene,
      );

      if (this.isDisposed || !this.mesh || this.mesh.isDisposed() || !this.isAlive || this.bullModelRoot) {
        for (const group of result.animationGroups) {
          group.dispose();
        }
        for (const transformNode of result.transformNodes) {
          transformNode.dispose(false, false);
        }
        for (const importedMesh of result.meshes as AbstractMesh[]) {
          importedMesh.dispose(false, false);
        }
        return;
      }

      const root = new TransformNode(`bull_root_${this.id}`, this.scene);
      EnemyController.markBullVisualNode(root, this.id, true);

      // Parent only top-level imported nodes to avoid duplicating hierarchy links.
      for (const transformNode of result.transformNodes) {
        if (!transformNode || transformNode.isDisposed()) {
          continue;
        }
        if (transformNode.parent == null) {
          transformNode.parent = root;
        }
      }
      for (const importedMesh of result.meshes as AbstractMesh[]) {
        if (!importedMesh || importedMesh.isDisposed()) {
          continue;
        }
        if (importedMesh.parent == null) {
          importedMesh.parent = root;
        }
      }

      EnemyController.markBullVisualHierarchy(root, this.id);

      if (this.isDisposed || !this.mesh || this.mesh.isDisposed() || !this.isAlive || this.bullModelRoot) {
        root.dispose(false, false);
        for (const group of result.animationGroups) {
          group.dispose();
        }
        return;
      }

      root.position = Vector3.Zero();
      root.rotation = new Vector3(0, -Math.PI / 2, 0);
      root.scaling = new Vector3(this.bullModelScale, this.bullModelScale, this.bullModelScale);
      root.parent = this.mesh;

      this.mesh.isVisible = false;
      this.disposeBullVisuals();
      this.bullModelRoot = root;
      this.applyRenderSuppressionState();
      EnemyController.dedupeBullVisualRootsForOwner(this.scene, this.id);
      for (const group of result.animationGroups) {
        this.bullAnimGroups.set(group.name, group);
      }
    } catch (error) {
      console.warn('Bull model failed to load, using placeholder.', error);
    }
  }

  static prewarmBullModel(scene: Scene): void {
    // Intentionally no-op: shared container prewarm caused source/master visual leaks.
    void scene;
  }

  static setGlobalHeightOffset(offset: number): void {
    EnemyController.globalHeightOffset = offset;
  }

  static getGlobalHeightOffset(): number {
    return EnemyController.globalHeightOffset;
  }

  private getBounceAxis(
    prevPos: Vector3,
    nextPos: Vector3,
    radius: number,
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): { axis: 'x' | 'z'; penetration: number } | null {
    const expanded = {
      minX: box.minX - radius,
      maxX: box.maxX + radius,
      minZ: box.minZ - radius,
      maxZ: box.maxZ + radius,
    };

    const inside =
      nextPos.x >= expanded.minX && nextPos.x <= expanded.maxX &&
      nextPos.z >= expanded.minZ && nextPos.z <= expanded.maxZ;
    if (!inside) return null;

    const hitX =
      (prevPos.x < expanded.minX && nextPos.x >= expanded.minX) ||
      (prevPos.x > expanded.maxX && nextPos.x <= expanded.maxX);
    const hitZ =
      (prevPos.z < expanded.minZ && nextPos.z >= expanded.minZ) ||
      (prevPos.z > expanded.maxZ && nextPos.z <= expanded.maxZ);

    if (!hitX && !hitZ) return null;

    const distLeft = Math.abs(nextPos.x - expanded.minX);
    const distRight = Math.abs(expanded.maxX - nextPos.x);
    const distTop = Math.abs(expanded.maxZ - nextPos.z);
    const distBottom = Math.abs(nextPos.z - expanded.minZ);
    const minX = Math.min(distLeft, distRight);
    const minZ = Math.min(distTop, distBottom);

    if (hitX && !hitZ) return { axis: 'x', penetration: minX };
    if (hitZ && !hitX) return { axis: 'z', penetration: minZ };

    return minX <= minZ ? { axis: 'x', penetration: minX } : { axis: 'z', penetration: minZ };
  }

  private getWallBounceAxis(
    prevPos: Vector3,
    nextPos: Vector3,
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): { axis: 'x' | 'z' } | null {
    const dx = nextPos.x - prevPos.x;
    const dz = nextPos.z - prevPos.z;

    let tx: number | null = null;
    let tz: number | null = null;

    if (dx < 0 && nextPos.x < box.minX) {
      tx = (box.minX - prevPos.x) / dx;
    } else if (dx > 0 && nextPos.x > box.maxX) {
      tx = (box.maxX - prevPos.x) / dx;
    }

    if (dz < 0 && nextPos.z < box.minZ) {
      tz = (box.minZ - prevPos.z) / dz;
    } else if (dz > 0 && nextPos.z > box.maxZ) {
      tz = (box.maxZ - prevPos.z) / dz;
    }

    if (tx == null && tz == null) return null;
    if (tx != null && tz == null) return { axis: 'x' };
    if (tz != null && tx == null) return { axis: 'z' };

    return (tx as number) <= (tz as number) ? { axis: 'x' } : { axis: 'z' };
  }

  private isPongBlocked(
    position: Vector3,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): boolean {
    if (roomManager) {
      if (!roomManager.isWalkable(position.x, position.z)) {
        return true;
      }

      const bounds = roomManager.getRoomBounds();
      if (bounds) {
        const minX = bounds.minX + this.pongRadius;
        const maxX = bounds.maxX - this.pongRadius;
        const minZ = bounds.minZ + this.pongRadius;
        const maxZ = bounds.maxZ - this.pongRadius;
        if (position.x < minX || position.x > maxX || position.z < minZ || position.z > maxZ) {
          return true;
        }
      }

      for (const ob of roomManager.getObstacleBounds()) {
        const expanded = {
          minX: ob.minX - this.pongRadius,
          maxX: ob.maxX + this.pongRadius,
          minZ: ob.minZ - this.pongRadius,
          maxZ: ob.maxZ + this.pongRadius,
        };
        if (
          position.x >= expanded.minX && position.x <= expanded.maxX &&
          position.z >= expanded.minZ && position.z <= expanded.maxZ
        ) {
          return true;
        }
      }
    }

    const playerHalf = 0.45 + this.pongRadius;
    if (
      position.x >= playerPosition.x - playerHalf && position.x <= playerPosition.x + playerHalf &&
      position.z >= playerPosition.z - playerHalf && position.z <= playerPosition.z + playerHalf
    ) {
      return true;
    }

    for (const other of allEnemies) {
      if (other === this || !other.isActive()) continue;
      const otherPos = other.getPosition();
      const half = other.getRadius() + this.pongRadius;
      if (
        position.x >= otherPos.x - half && position.x <= otherPos.x + half &&
        position.z >= otherPos.z - half && position.z <= otherPos.z + half
      ) {
        return true;
      }
    }

    return false;
  }

  private applyPongContactDamage(): void {
    const damage = Math.max(1, this.damage * this.pongContactDamageRatio);
    this.attackPlayerWithDamage(damage);
  }

  private isPongBlockedByEnvironment(position: Vector3, roomManager?: RoomManager): boolean {
    if (!roomManager) return false;
    if (!roomManager.isWalkable(position.x, position.z)) return true;

    const bounds = roomManager.getRoomBounds();
    if (bounds) {
      const minX = bounds.minX + this.pongRadius;
      const maxX = bounds.maxX - this.pongRadius;
      const minZ = bounds.minZ + this.pongRadius;
      const maxZ = bounds.maxZ - this.pongRadius;
      if (position.x < minX || position.x > maxX || position.z < minZ || position.z > maxZ) {
        return true;
      }
    }

    for (const ob of roomManager.getObstacleBounds()) {
      const expanded = {
        minX: ob.minX - this.pongRadius,
        maxX: ob.maxX + this.pongRadius,
        minZ: ob.minZ - this.pongRadius,
        maxZ: ob.maxZ + this.pongRadius,
      };
      if (
        position.x >= expanded.minX && position.x <= expanded.maxX &&
        position.z >= expanded.minZ && position.z <= expanded.maxZ
      ) {
        return true;
      }
    }

    return false;
  }

  private isPongTouchingPlayer(position: Vector3, playerPosition: Vector3): boolean {
    const minDistance = this.pongRadius + 0.35;
    return Vector3.DistanceSquared(position, playerPosition) <= minDistance * minDistance;
  }

  private isPongTouchingEnemy(position: Vector3, allEnemies: EnemyController[]): boolean {
    for (const other of allEnemies) {
      if (other === this || !other.isActive()) continue;
      const otherPos = other.getPosition();
      const minDistance = this.pongRadius + other.getRadius();
      if (Vector3.DistanceSquared(position, otherPos) <= minDistance * minDistance) {
        return true;
      }
    }
    return false;
  }

  private getPongPlayerBounceAxis(candidate: Vector3, playerPosition: Vector3, movement: Vector3): 'x' | 'z' {
    const delta = candidate.subtract(playerPosition);
    delta.y = 0;
    const horizontalDominant = Math.abs(delta.x) >= Math.abs(delta.z);
    if (horizontalDominant) {
      return 'x';
    }
    if (Math.abs(movement.x) > Math.abs(movement.z)) {
      return 'x';
    }
    return 'z';
  }

  private getPongBounceAxis(candidate: Vector3, movement: Vector3, roomManager?: RoomManager): 'x' | 'z' | null {
    if (!roomManager) return null;

    const physicalNormal = roomManager.getPhysicsBounceNormal(this.position, candidate);
    if (physicalNormal && physicalNormal.lengthSquared() > 0.0001) {
      return Math.abs(physicalNormal.x) >= Math.abs(physicalNormal.z) ? 'x' : 'z';
    }

    let axis: 'x' | 'z' | null = null;
    let penetration = Number.POSITIVE_INFINITY;

    const consider = (candidateAxis: 'x' | 'z', candidatePenetration: number) => {
      if (candidatePenetration < penetration) {
        penetration = candidatePenetration;
        axis = candidateAxis;
      }
    };

    const bounds = roomManager.getRoomBounds();
    if (bounds) {
      const minX = bounds.minX + this.pongRadius;
      const maxX = bounds.maxX - this.pongRadius;
      const minZ = bounds.minZ + this.pongRadius;
      const maxZ = bounds.maxZ - this.pongRadius;
      if (candidate.x < minX) consider('x', minX - candidate.x);
      if (candidate.x > maxX) consider('x', candidate.x - maxX);
      if (candidate.z < minZ) consider('z', minZ - candidate.z);
      if (candidate.z > maxZ) consider('z', candidate.z - maxZ);
    }

    for (const obstacle of roomManager.getObstacleBounds()) {
      const expanded = {
        minX: obstacle.minX - this.pongRadius,
        maxX: obstacle.maxX + this.pongRadius,
        minZ: obstacle.minZ - this.pongRadius,
        maxZ: obstacle.maxZ + this.pongRadius,
      };
      const inside =
        candidate.x >= expanded.minX && candidate.x <= expanded.maxX &&
        candidate.z >= expanded.minZ && candidate.z <= expanded.maxZ;
      if (!inside) continue;

      const distLeft = Math.abs(candidate.x - expanded.minX);
      const distRight = Math.abs(expanded.maxX - candidate.x);
      const distBottom = Math.abs(candidate.z - expanded.minZ);
      const distTop = Math.abs(expanded.maxZ - candidate.z);
      const minX = Math.min(distLeft, distRight);
      const minZ = Math.min(distBottom, distTop);
      if (minX <= minZ) {
        consider('x', minX);
      } else {
        consider('z', minZ);
      }
    }

    if (!axis && !roomManager.isWalkable(candidate.x, candidate.z)) {
      const xBlocked = !roomManager.isWalkable(candidate.x, this.position.z);
      const zBlocked = !roomManager.isWalkable(this.position.x, candidate.z);
      if (xBlocked && !zBlocked) return 'x';
      if (zBlocked && !xBlocked) return 'z';
      if (Math.abs(movement.x) >= Math.abs(movement.z)) return 'x';
      return 'z';
    }

    return axis;
  }
}
