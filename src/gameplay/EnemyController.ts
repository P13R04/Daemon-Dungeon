/**
 * EnemyController - Controls a single enemy
 */

import { Scene, Mesh, Vector3, SceneLoader, AnimationGroup, TransformNode, AbstractMesh } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { Health } from '../components/Health';
import { Knockback } from '../components/Knockback';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { MathUtils } from '../utils/Math';
import { ConfigLoader } from '../utils/ConfigLoader';
import type { RoomManager } from '../systems/RoomManager';

export class EnemyController {
  private mesh!: Mesh;
  private health!: Health;
  private eventBus: EventBus;
  private time: Time;
  private scene: Scene;
  private id: string;
  
  private config: any;
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
  private knockbackStrength: number = 0;
  private selfKnockbackStrength: number = 0;
  private useCrowdSteering: boolean = false;
  private separationRadius: number = 1.1;
  private separationStrength: number = 1.0;
  private avoidObstacles: boolean = false;
  private avoidDistance: number = 0.9;
  private stuckTimer: number = 0;
  private lastPosition: Vector3 = Vector3.Zero();
  private stuckThreshold: number = 0.02;
  private stuckTimeToNudge: number = 0.35;
  private pongDirection: Vector3 = Vector3.Zero();
  private pongInitialized: boolean = false;
  private pongInitialAngleDeg: number | null = null;
  private pongRadius: number = 0.35;
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
  private kiteMinRange: number = 2.5;
  private kiteMaxRange: number = 4.5;
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
  private rangedWindup: number = 0;
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
  
  private target: Vector3 | null = null;
  private isAlive: boolean = true;

  constructor(scene: Scene, typeId: string, position: Vector3, config: any) {
    this.scene = scene;
    this.config = config;
    this.position = position.clone();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.id = `enemy_${typeId}_${Date.now()}_${Math.random()}`;

    // Initialize from config
    this.speed = config.baseStats?.speed || 2.5;
    this.damage = config.baseStats?.damage || 8;
    this.attackRange = config.baseStats?.attackRange || 1.5;
    this.behavior = config.behavior || 'chase';
    this.knockbackStrength = config.knockbackStrength ?? 0;
    this.selfKnockbackStrength = config.selfKnockbackStrength ?? 0;

    if (config.behaviorConfig) {
      this.bullTriggerRange = config.behaviorConfig.triggerRange ?? this.bullTriggerRange;
      this.bullAimDuration = config.behaviorConfig.aimDuration ?? this.bullAimDuration;
      this.bullChargeDuration = config.behaviorConfig.chargeDuration ?? this.bullChargeDuration;
      this.bullChargeSpeedMultiplier = config.behaviorConfig.chargeSpeedMultiplier ?? this.bullChargeSpeedMultiplier;
      this.bullHitRange = config.behaviorConfig.hitRange ?? this.bullHitRange;
      this.bullCooldownDuration = config.behaviorConfig.chargeCooldown ?? this.bullCooldownDuration;
      this.bullKnockbackStrength = config.behaviorConfig.knockbackStrength ?? this.bullKnockbackStrength;
      this.useCrowdSteering = config.behaviorConfig.useCrowd ?? this.useCrowdSteering;
      this.separationRadius = config.behaviorConfig.separationRadius ?? this.separationRadius;
      this.separationStrength = config.behaviorConfig.separationStrength ?? this.separationStrength;
      this.avoidObstacles = config.behaviorConfig.avoidObstacles ?? this.avoidObstacles;
      this.avoidDistance = config.behaviorConfig.avoidDistance ?? this.avoidDistance;
      this.pongInitialAngleDeg = config.behaviorConfig.initialAngleDeg ?? this.pongInitialAngleDeg;
      this.jumperTriggerRange = config.behaviorConfig.triggerRange ?? this.jumperTriggerRange;
      this.jumperAimDuration = config.behaviorConfig.aimDuration ?? this.jumperAimDuration;
      this.jumperJumpDuration = config.behaviorConfig.jumpDuration ?? this.jumperJumpDuration;
      this.jumperJumpSpeedMultiplier = config.behaviorConfig.jumpSpeedMultiplier ?? this.jumperJumpSpeedMultiplier;
      this.jumperHitRange = config.behaviorConfig.hitRange ?? this.jumperHitRange;
      this.jumperCooldownDuration = config.behaviorConfig.jumpCooldown ?? this.jumperCooldownDuration;
      this.jumperJumpHeight = config.behaviorConfig.jumpHeight ?? this.jumperJumpHeight;
      this.pongRadius = config.behaviorConfig.pongRadius ?? this.pongRadius;
      this.kiteMinRange = config.behaviorConfig.kiteMinRange ?? this.kiteMinRange;
      this.kiteMaxRange = config.behaviorConfig.kiteMaxRange ?? this.kiteMaxRange;
      this.orbitStrength = config.behaviorConfig.orbitStrength ?? this.orbitStrength;
      this.leadTime = config.behaviorConfig.leadTime ?? this.leadTime;
      this.rangedMinRange = config.behaviorConfig.rangedMinRange ?? this.rangedMinRange;
      this.rangedMaxRange = config.behaviorConfig.rangedMaxRange ?? this.rangedMaxRange;
      this.rangedCooldown = config.behaviorConfig.rangedCooldown ?? this.rangedCooldown;
      this.rangedProjectileSpeed = config.behaviorConfig.projectileSpeed ?? this.rangedProjectileSpeed;
      this.rangedProjectileRange = config.behaviorConfig.projectileRange ?? this.rangedProjectileRange;
      this.rangedWindup = config.behaviorConfig.rangedWindup ?? this.rangedWindup;
      this.healerRange = config.behaviorConfig.healRange ?? this.healerRange;
      this.healerAmount = config.behaviorConfig.healAmount ?? this.healerAmount;
      this.healerCooldown = config.behaviorConfig.healCooldown ?? this.healerCooldown;
      this.artificerMinRange = config.behaviorConfig.artificerMinRange ?? this.artificerMinRange;
      this.artificerMaxRange = config.behaviorConfig.artificerMaxRange ?? this.artificerMaxRange;
      this.artificerCooldown = config.behaviorConfig.artificerCooldown ?? this.artificerCooldown;
      this.artificerWindup = config.behaviorConfig.artificerWindup ?? this.artificerWindup;
      this.artificerSplitCount = config.behaviorConfig.splitCount ?? this.artificerSplitCount;
      this.artificerSplitRadius = config.behaviorConfig.splitRadius ?? this.artificerSplitRadius;
      this.artificerSplitDelay = config.behaviorConfig.splitDelay ?? this.artificerSplitDelay;
      this.artificerExplosionRadius = config.behaviorConfig.explosionRadius ?? this.artificerExplosionRadius;
      this.artificerExplosionDamage = config.behaviorConfig.explosionDamage ?? this.artificerExplosionDamage;
      this.artificerImpactRadius = config.behaviorConfig.impactRadius ?? this.artificerImpactRadius;
      this.artificerImpactDamage = config.behaviorConfig.impactDamage ?? this.artificerImpactDamage;
      this.artificerDotRadius = config.behaviorConfig.dotRadius ?? this.artificerDotRadius;
      this.artificerDotDps = config.behaviorConfig.dotDps ?? this.artificerDotDps;
      this.artificerDotDuration = config.behaviorConfig.dotDuration ?? this.artificerDotDuration;
      this.artificerSplitTravelSpeed = config.behaviorConfig.splitTravelSpeed ?? this.artificerSplitTravelSpeed;
      this.artificerImpactDuration = config.behaviorConfig.impactDuration ?? this.artificerImpactDuration;
      this.artificerFinalDuration = config.behaviorConfig.finalDuration ?? this.artificerFinalDuration;
      this.bulletHellCount = config.behaviorConfig.bulletCount ?? this.bulletHellCount;
      this.bulletHellSpreadDeg = config.behaviorConfig.spreadDeg ?? this.bulletHellSpreadDeg;
      this.bulletHellCooldown = config.behaviorConfig.bulletCooldown ?? this.bulletHellCooldown;
      this.missileCooldown = config.behaviorConfig.missileCooldown ?? this.missileCooldown;
      this.missileTurnRate = config.behaviorConfig.missileTurnRate ?? this.missileTurnRate;
      this.missileMinSpeed = config.behaviorConfig.missileMinSpeed ?? this.missileMinSpeed;
      this.missileMaxSpeed = config.behaviorConfig.missileMaxSpeed ?? this.missileMaxSpeed;
      this.missileAccel = config.behaviorConfig.missileAccel ?? this.missileAccel;
    }

    if (this.behavior === 'bull' && config.knockbackStrength != null) {
      this.bullKnockbackStrength = config.knockbackStrength;
    }

    this.initialize();
  }

  private initialize(): void {
    // Create visual
    this.mesh = VisualPlaceholder.createEnemyPlaceholder(this.scene, this.id);
    this.mesh.position = this.position.clone();
    this.mesh.rotation = Vector3.Zero();
    // Ensure enemy is at correct height
    this.mesh.position.y = 1.0;
    
    console.log('Enemy initialized:', this.id, 'at position:', this.mesh.position);
    console.log('Enemy mesh visible:', this.mesh.isVisible, 'enabled:', this.mesh.isEnabled());

    // Setup health
    const maxHP = this.config.baseStats?.hp || 40;
    this.health = new Health(maxHP, this.id);

    // Setup attack stats (config is already the zombie_basic object)
    this.speed = this.config.baseStats.speed;
    this.damage = this.config.baseStats.damage;
    this.attackRange = this.config.baseStats.attackRange;
    this.attackCooldown = 0;

    this.eventBus.emit(GameEvents.ENEMY_SPAWNED, {
      entityId: this.id,
      enemyName: this.config?.name ?? this.id,
      maxHP: maxHP,
      mesh: this.mesh,
    });

    if (this.behavior === 'bull') {
      this.loadBullModel();
    }
  }

  update(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager,
    playerVelocity: Vector3 = Vector3.Zero()
  ): void {
    if (!this.isAlive || !this.mesh) return;

    // Check if enemies are frozen via debug flag
    const configLoader = ConfigLoader.getInstance();
    const gameplayConfig = configLoader.getGameplay();
    if (gameplayConfig?.debugConfig?.freezeEnemies) {
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
    } else if (this.behavior === 'sentinel') {
      this.updateRanged(deltaTime, playerPosition, playerVelocity, allEnemies, roomManager, false);
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
      const hitsWall = !roomManager.isWalkable(candidate.x, candidate.z);
      const sweptHit = this.pathBlockedWithRadius(this.position, candidate, roomManager, radius);
      if (hitsWall || hitsObstacle || sweptHit) {
        this.explodeMissile(playerPosition, candidate);
        this.die();
        return;
      }
    }
    this.position = candidate;
    this.applyMeshPosition();
  }

  private explodeMissile(playerPosition: Vector3, explosionPosition: Vector3 = this.position): void {
    const distance = Vector3.Distance(playerPosition, explosionPosition);
    if (distance <= this.attackRange) {
      this.attackPlayer();
    }
    const expMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `missile_ex_${Date.now()}`, this.attackRange);
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
      if (!roomManager.isWalkable(sample.x, sample.z)) {
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

  private updateFuyard(
    deltaTime: number,
    playerPosition: Vector3,
    allEnemies: EnemyController[] = [],
    roomManager?: RoomManager
  ): void {
    const toPlayer = playerPosition.subtract(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    let desired = Vector3.Zero();
    if (distance < this.kiteMinRange) {
      desired = toPlayer.scale(-1);
    } else if (distance > this.kiteMaxRange) {
      desired = toPlayer;
    } else {
      desired = new Vector3(-toPlayer.z, 0, toPlayer.x)
        .scale(this.orbitStrength * this.orbitSign);
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

    // Flip orbit if too close or stuck (with cooldown)
    if (this.orbitFlipTimer > 0) {
      this.orbitFlipTimer -= deltaTime;
    }
    if (this.orbitFlipTimer <= 0) {
      if (distance < this.kiteMinRange * 0.8) {
        this.orbitSign *= -1;
        this.orbitFlipTimer = this.orbitFlipCooldown;
      } else if (this.stuckTimer >= this.stuckTimeToNudge) {
        this.orbitSign *= -1;
        this.orbitFlipTimer = this.orbitFlipCooldown;
        this.stuckTimer = 0;
      }
    }

    this.velocity = desired.scale(this.speed);

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

  private fireProjectile(playerPosition: Vector3, playerVelocity: Vector3): void {
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

    const dx = dir.x * this.speed * deltaTime;
    const dz = dir.z * this.speed * deltaTime;

    this.previousPosition = this.position.clone();

    // Move X axis
    let nextX = new Vector3(this.position.x + dx, this.position.y, this.position.z).add(knock);
    if (this.isPongBlocked(nextX, playerPosition, allEnemies, roomManager)) {
      dir = new Vector3(-dir.x, 0, dir.z);
    } else {
      this.position.x = nextX.x;
    }

    // Move Z axis
    let nextZ = new Vector3(this.position.x, this.position.y, this.position.z + dz).add(knock);
    if (this.isPongBlocked(nextZ, playerPosition, allEnemies, roomManager)) {
      dir = new Vector3(dir.x, 0, -dir.z);
    } else {
      this.position.z = nextZ.z;
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
          // Landing impact
          if (distance <= this.jumperHitRange && this.attackCooldown <= 0) {
            this.attackPlayer();
          }
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

    if (this.useCrowdSteering && allEnemies.length > 0) {
      const separation = this.computeSeparation(allEnemies);
      if (separation.lengthSquared() > 0.0001) {
        desired = desired.add(separation).normalize();
      }
    }

    if (this.avoidObstacles && roomManager) {
      desired = this.avoidWalls(desired, roomManager);
    }

    this.velocity = desired.scale(this.speed);
  }

  private computeSeparation(allEnemies: EnemyController[]): Vector3 {
    let force = Vector3.Zero();
    let count = 0;

    for (const other of allEnemies) {
      if (other === this || !other.isActive()) continue;
      const otherPos = other.getPosition();
      const delta = this.position.subtract(otherPos);
      const distSq = delta.lengthSquared();
      const range = this.separationRadius + other.getRadius();
      if (distSq > 0.0001 && distSq < range * range) {
        const dist = Math.sqrt(distSq);
        const away = delta.scale(1 / dist);
        const strength = (range - dist) / range;
        force = force.add(away.scale(strength));
        count++;
      }
    }

    if (count > 0) {
      force = force.scale(1 / count).scale(this.separationStrength);
    }

    return force;
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

  private isWalkable(position: Vector3, roomManager: RoomManager): boolean {
    if (!roomManager.isWalkable(position.x, position.z)) return false;
    const obstacles = roomManager.getObstacleBounds();
    for (const ob of obstacles) {
      const inside =
        position.x >= ob.minX && position.x <= ob.maxX &&
        position.z >= ob.minZ && position.z <= ob.maxZ;
      if (inside) return false;
    }
    return true;
  }

  private attackPlayer(): void {
    this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
      attacker: this.id,
      type: 'melee',
      damage: this.damage,
    });

    this.attackCooldown = this.config.baseStats.attackCooldown;
  }

  takeDamage(amount: number): void {
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
    this.isAlive = false;
    if (this.mesh) {
      this.mesh.dispose();
    }
    this.eventBus.emit(GameEvents.ENEMY_DIED, {
      entityId: this.id,
      position: this.position.clone(),
    });
  }

  getPosition(): Vector3 {
    return this.position.clone();
  }

  setPosition(position: Vector3): void {
    this.position = position.clone();
    this.position.y = 1.0;
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

  dispose(): void {
    for (const group of this.bullAnimGroups.values()) {
      group.stop();
      group.dispose();
    }
    this.bullAnimGroups.clear();
    if (this.bullModelRoot) {
      this.bullModelRoot.dispose();
      this.bullModelRoot = null;
    }
    if (this.mesh) {
      this.mesh.dispose();
    }
  }

  private applyMeshPosition(): void {
    if (!this.mesh) return;
    this.mesh.position = this.position.clone();
    this.mesh.position.y = 1.0 + this.verticalOffset;
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

  private async loadBullModel(): Promise<void> {
    try {
      const baseUrl = (import.meta as any).env?.BASE_URL ?? '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const rootUrl = `${normalizedBase}models/bull/`;
      const result = await SceneLoader.ImportMeshAsync(
        '',
        rootUrl,
        'bull.glb',
        this.scene
      );

      const root = new TransformNode(`bull_root_${this.id}`, this.scene);
      for (const mesh of result.meshes as AbstractMesh[]) {
        if (mesh) {
          mesh.parent = root;
        }
      }
      root.position = Vector3.Zero();
      root.rotation = new Vector3(0, Math.PI/2, 0);
      root.scaling = new Vector3(0.1, 0.1, 0.1);
      root.parent = this.mesh;

      this.mesh.isVisible = false;
      this.bullModelRoot = root;
      this.bullAnimGroups.clear();
      for (const group of result.animationGroups) {
        this.bullAnimGroups.set(group.name, group);
      }
    } catch (error) {
      console.warn('Bull model failed to load, using placeholder.', error);
    }
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
}
