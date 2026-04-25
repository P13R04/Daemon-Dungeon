/**
 * ProjectileManager - Manages projectile lifecycle
 */

import {
  Scene,
  Mesh,
  Vector3,
  Ray,
  RayHelper,
  ParticleSystem,
  DynamicTexture,
  Color3,
  Color4,
  StandardMaterial,
} from '@babylonjs/core';
import type { RoomManager } from '../systems/RoomManager';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { EventBus, GameEvents } from '../core/EventBus';
import { Pool, IPoolable } from '../utils/Pool';
import { SCENE_LAYER } from '../ui/uiLayers';

interface ProjectileData {
  position: Vector3;
  direction: Vector3;
  damage: number;
  speed: number;
  range: number;
  distanceTraveled: number;
  friendly: boolean;
  maxBounces: number;
  remainingBounces: number;
  bounceDamping: number;
  pierceCount: number;
  homingRadius: number;
  homingTurnRate: number;
  projectileType?: string;
  splitConfig?: {
    count: number;
    radius: number;
    delay: number;
    explosionRadius: number;
    explosionDamage: number;
    impactRadius?: number;
    impactDamage?: number;
    dotRadius?: number;
    dotDps?: number;
    dotDuration?: number;
    travelSpeed?: number;
    impactDuration?: number;
    finalDuration?: number;
  };
}

interface DelayedExplosion {
  position: Vector3;
  timer: number;
  radius: number;
  damage: number;
  mesh?: Mesh;
  dotRadius?: number;
  dotDps?: number;
  dotDuration?: number;
  finalDuration?: number;
}

interface AoeZone {
  position: Vector3;
  radius: number;
  dps: number;
  remaining: number;
  mesh?: Mesh;
}

interface SplitTravel {
  position: Vector3;
  target: Vector3;
  speed: number;
  mesh?: Mesh;
  explosionRadius: number;
  explosionDamage: number;
  dotRadius?: number;
  dotDps?: number;
  dotDuration?: number;
  finalDuration?: number;
}

interface ProjectilePlayer {
  getPosition(): Vector3;
  applyDamage(amount: number): void;
  onPlayerDealtDamage?(damage: number): void;
  getMageImpactAoeConfig?(): { chance: number; radius: number; damageRatio: number; knockback: number } | null;
  getPoisonBonus?: () => { percent: number; duration: number } | null | undefined;
  reflectProjectileIfShielding?: (
    hitPoint: Vector3,
    damage: number,
    direction: Vector3
  ) => { position: Vector3; direction: Vector3; damage: number; speedMultiplier: number } | null | undefined;
}

interface ProjectileEnemy {
  getPosition(): Vector3;
  getId(): string;
  takeDamage(amount: number): void;
  applyDot?(damagePerSecond: number, duration: number): void;
  applyExternalKnockback?(force: Vector3): void;
}

class Projectile implements IPoolable {
  mesh?: Mesh;
  data: ProjectileData | null = null;
  private activeFlag: boolean = false;
  private readonly baseScaling: Vector3 = new Vector3(1, 1, 1);

  constructor(private scene: Scene) {}

  setData(data: Omit<ProjectileData, 'distanceTraveled'>): void {
    this.data = { ...data, distanceTraveled: 0 };
    
    if (!this.mesh) {
      this.mesh = VisualPlaceholder.createProjectilePlaceholder(this.scene, `projectile_${Date.now()}`);
      this.baseScaling.copyFrom(this.mesh.scaling);
    }
    
    this.mesh.position = data.position.clone();
    this.mesh.scaling.copyFrom(this.baseScaling);
    this.mesh.rotationQuaternion = null;
    this.mesh.rotation.set(0, 0, 0);
  }

  update(deltaTime: number, speedMultiplier: number = 1): void {
    if (!this.data || !this.mesh) return;

    const movement = this.data.direction.scale(this.data.speed * speedMultiplier * deltaTime);
    this.data.position.addInPlace(movement);
    this.data.distanceTraveled += movement.length();
    
    this.mesh.position = this.data.position;

    if (this.data.projectileType === 'mage_arcane') {
      this.updateMageArcaneDeformation(speedMultiplier);
      return;
    }

    this.mesh.scaling.copyFrom(this.baseScaling);
  }

  private updateMageArcaneDeformation(speedMultiplier: number): void {
    if (!this.data || !this.mesh) return;

    const effectiveSpeed = Math.max(0, this.data.speed * speedMultiplier);
    const speedFactor = Math.min(1, effectiveSpeed / 28);
    const stretch = 1 + (speedFactor * 0.95);
    const compression = 1 - (speedFactor * 0.33);
    const pulse = 1 + (0.05 * Math.sin((this.data.distanceTraveled * 18) + (performance.now() * 0.008)));

    this.mesh.scaling.x = this.baseScaling.x * compression * pulse;
    this.mesh.scaling.y = this.baseScaling.y * compression * pulse;
    this.mesh.scaling.z = this.baseScaling.z * stretch;

    if (this.data.direction.lengthSquared() > 0.0001) {
      this.mesh.lookAt(this.data.position.add(this.data.direction));
    }
  }

  reset(): void {
    this.data = null;
    if (this.mesh) {
      this.mesh.scaling.copyFrom(this.baseScaling);
      this.mesh.position = new Vector3(0, -100, 0); // Move off-screen
    }
  }

  isActive(): boolean {
    return this.activeFlag;
  }

  setActive(active: boolean): void {
    this.activeFlag = active;
    if (this.mesh) {
      this.mesh.isVisible = active;
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}

export class ProjectileManager {
  private projectilePool: Pool<Projectile>;
  private activeProjectiles: Projectile[] = [];
  private eventBus: EventBus;
  private delayedExplosions: DelayedExplosion[] = [];
  private activeAoeZones: AoeZone[] = [];
  private activeSplitTravels: SplitTravel[] = [];
  private hostileSlowZone: { center: Vector3; radius: number; multiplier: number } | null = null;
  private currentRoomManager?: RoomManager;
  private readonly aoeVisualY = 0.03;
  private mageProjectileParticleTexture: DynamicTexture | null = null;
  private projectileParticleEffects: Map<Projectile, ParticleSystem> = new Map();
  private deferredMeshDisposalQueue: Mesh[] = [];

  constructor(private scene: Scene, poolSize: number = 20) {
    this.eventBus = EventBus.getInstance();
    
    this.projectilePool = new Pool<Projectile>(
      () => new Projectile(scene),
      poolSize
    );

    this.eventBus.on(GameEvents.PROJECTILE_SPAWNED, (payload: {
      position: Vector3;
      direction: Vector3;
      damage: number;
      speed: number;
      range: number;
      friendly?: boolean;
      projectileType?: string;
      splitConfig?: {
        count: number;
        radius: number;
        delay: number;
        explosionRadius: number;
        explosionDamage: number;
        impactRadius?: number;
        impactDamage?: number;
        dotRadius?: number;
        dotDps?: number;
        dotDuration?: number;
        travelSpeed?: number;
        impactDuration?: number;
        finalDuration?: number;
      };
      maxBounces?: number;
      bounceDamping?: number;
      pierceCount?: number;
      homingRadius?: number;
      homingTurnRate?: number;
    }) => {
      if (!payload) return;
      this.spawnProjectile(
        payload.position,
        payload.direction,
        payload.damage,
        payload.speed,
        payload.range,
        payload.friendly,
        payload.projectileType,
        payload.splitConfig,
        payload.maxBounces,
        payload.bounceDamping,
        payload.pierceCount,
        payload.homingRadius,
        payload.homingTurnRate
      );
    });
  }

  spawnProjectile(
    position: Vector3,
    direction: Vector3,
    damage: number,
    speed: number,
    range: number,
    friendly: boolean = true,
    projectileType?: string,
    splitConfig?: {
      count: number;
      radius: number;
      delay: number;
      explosionRadius: number;
      explosionDamage: number;
      impactRadius?: number;
      impactDamage?: number;
      dotRadius?: number;
      dotDps?: number;
      dotDuration?: number;
      travelSpeed?: number;
      impactDuration?: number;
      finalDuration?: number;
    },
    maxBounces: number = 0,
    bounceDamping: number = 1,
    pierceCount: number = 0,
    homingRadius: number = 0,
    homingTurnRate: number = 0
  ): void {
    const projectile = this.projectilePool.get();
    const safeBounces = Math.max(0, Math.floor(maxBounces));
    projectile.setData({
      position: position.clone(),
      direction: direction.normalize(),
      damage,
      speed,
      range,
      friendly,
      maxBounces: safeBounces,
      remainingBounces: safeBounces,
      bounceDamping: Math.max(0.4, Math.min(1, bounceDamping)),
      pierceCount: Math.max(0, Math.floor(pierceCount)),
      homingRadius: Math.max(0, homingRadius),
      homingTurnRate: Math.max(0, homingTurnRate),
      projectileType,
      splitConfig,
    });
    projectile.setActive(true);
    this.activeProjectiles.push(projectile);
    this.applyProjectileSpawnVisual(projectile);
  }

  private applyProjectileSpawnVisual(projectile: Projectile): void {
    if (!projectile.mesh || !projectile.data) return;

    this.disposeProjectileParticleEffect(projectile);

    const material = this.ensureProjectileMaterial(projectile.mesh);
    if (projectile.data.projectileType === 'mage_arcane') {
      material.diffuseColor = new Color3(0.62, 0.84, 1.0);
      material.emissiveColor = new Color3(0.42, 0.32, 0.95);

      const particles = new ParticleSystem(`mage_projectile_fx_${Date.now()}`, 180, this.scene);
      particles.particleTexture = this.getMageProjectileParticleTexture();
      particles.layerMask = SCENE_LAYER;
      particles.emitter = projectile.mesh;
      particles.minSize = 0.04;
      particles.maxSize = 0.11;
      particles.minLifeTime = 0.07;
      particles.maxLifeTime = 0.2;
      particles.emitRate = 640;
      particles.blendMode = ParticleSystem.BLENDMODE_ADD;
      particles.color1 = new Color4(0.62, 0.92, 1.0, 0.92);
      particles.color2 = new Color4(0.56, 0.36, 1.0, 0.78);
      particles.colorDead = new Color4(0.08, 0.16, 0.4, 0);
      particles.gravity = new Vector3(0, 0, 0);
      particles.minEmitPower = 0.2;
      particles.maxEmitPower = 0.9;
      particles.updateSpeed = 0.016;
      particles.direction1 = new Vector3(-0.2, 0.05, -0.2);
      particles.direction2 = new Vector3(0.2, 0.2, 0.2);
      particles.start();
      this.projectileParticleEffects.set(projectile, particles);
      return;
    }

    material.diffuseColor = new Color3(1.0, 1.0, 0.0);
    material.emissiveColor = new Color3(1.0, 1.0, 0.0);
  }

  private ensureProjectileMaterial(mesh: Mesh): StandardMaterial {
    const existing = mesh.material;
    if (existing instanceof StandardMaterial) {
      return existing;
    }

    const mat = new StandardMaterial(`${mesh.name}_mat`, this.scene);
    mesh.material = mat;
    return mat;
  }

  private getMageProjectileParticleTexture(): DynamicTexture {
    if (this.mageProjectileParticleTexture) {
      return this.mageProjectileParticleTexture;
    }

    const texture = new DynamicTexture('mage_projectile_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(148,240,255,0.96)');
    gradient.addColorStop(0.72, 'rgba(138,98,255,0.88)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.mageProjectileParticleTexture = texture;
    return texture;
  }

  private disposeProjectileParticleEffect(projectile: Projectile): void {
    const particles = this.projectileParticleEffects.get(projectile);
    if (!particles) return;
    particles.stop();
    particles.dispose(false);
    this.projectileParticleEffects.delete(projectile);
  }

  private releaseProjectileAt(index: number): void {
    const projectile = this.activeProjectiles[index];
    if (!projectile) return;
    this.disposeProjectileParticleEffect(projectile);
    projectile.setActive(false);
    this.projectilePool.release(projectile);
    this.activeProjectiles.splice(index, 1);
  }

  update(deltaTime: number, enemies: ProjectileEnemy[], player: ProjectilePlayer, roomManager?: RoomManager): void {
    this.processDeferredMeshDisposals(2);
    this.currentRoomManager = roomManager;

    // Update delayed explosions
    for (let i = this.delayedExplosions.length - 1; i >= 0; i--) {
      const exp = this.delayedExplosions[i];
      exp.timer -= deltaTime;
      if (exp.timer <= 0) {
        if (this.isPointAffectedByExplosion(exp.position, player.getPosition(), exp.radius, roomManager)) {
          player.applyDamage(exp.damage);
        }
        const finalDuration = exp.finalDuration ?? 0.2;
        this.createClippedAoeVisual(exp.position, exp.radius, finalDuration, roomManager);
        if (exp.dotRadius && exp.dotDps && exp.dotDuration) {
          const zoneMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, exp.dotRadius);
          zoneMesh.position = this.toGroundPosition(exp.position);
          this.activeAoeZones.push({
            position: exp.position.clone(),
            radius: exp.dotRadius,
            dps: exp.dotDps,
            remaining: exp.dotDuration,
            mesh: zoneMesh,
          });
        }
        if (exp.mesh) exp.mesh.dispose();
        this.delayedExplosions.splice(i, 1);
      }
    }

    // Update active AoE zones (DOT)
    for (let i = this.activeAoeZones.length - 1; i >= 0; i--) {
      const zone = this.activeAoeZones[i];
      zone.remaining -= deltaTime;
      if (this.isPointAffectedByExplosion(zone.position, player.getPosition(), zone.radius, roomManager)) {
        player.applyDamage(zone.dps * deltaTime);
      }
      if (zone.remaining <= 0) {
        if (zone.mesh) zone.mesh.dispose();
        this.activeAoeZones.splice(i, 1);
      }
    }

    // Update traveling split projectiles
    for (let i = this.activeSplitTravels.length - 1; i >= 0; i--) {
      const split = this.activeSplitTravels[i];
      const toTarget = split.target.subtract(split.position);
      const dist = toTarget.length();
      const step = split.speed * deltaTime;
      if (dist <= step || dist <= 0.05) {
        split.position = split.target.clone();
        if (split.mesh) {
          split.mesh.position = split.position;
          split.mesh.dispose();
        }
        if (this.isPointAffectedByExplosion(split.position, player.getPosition(), split.explosionRadius, roomManager)) {
          player.applyDamage(split.explosionDamage);
        }
        const finalDuration = split.finalDuration ?? 0.2;
        this.createClippedAoeVisual(split.position, split.explosionRadius, finalDuration, roomManager);
        if (split.dotRadius && split.dotDps && split.dotDuration) {
          const zoneMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, split.dotRadius);
          zoneMesh.position = this.toGroundPosition(split.position);
          this.activeAoeZones.push({
            position: split.position.clone(),
            radius: split.dotRadius,
            dps: split.dotDps,
            remaining: split.dotDuration,
            mesh: zoneMesh,
          });
        }
        this.activeSplitTravels.splice(i, 1);
        continue;
      }
      const prevPos = split.position.clone();
      const move = toTarget.normalize().scale(step);
      const nextPos = split.position.add(move);

      if (roomManager) {
        const obstacles = roomManager.getObstacleBounds();
        const hitObstacle = this.segmentHitsObstacle(prevPos, nextPos, obstacles);
        const hitBlockedTile = this.segmentHitsBlockedTile(prevPos, nextPos, roomManager);

        if (hitObstacle || hitBlockedTile || !this.isProjectileTilePassableAt(nextPos.x, nextPos.z, roomManager)) {
          const blockedPoint = this.findFirstBlockedPointOnSegment(prevPos, nextPos, roomManager, obstacles);
          const impactPos = this.resolveImpactPosition(blockedPoint, toTarget.normalize(), roomManager);

          if (split.mesh) {
            split.mesh.position = impactPos;
            split.mesh.dispose();
          }

          if (this.isPointAffectedByExplosion(impactPos, player.getPosition(), split.explosionRadius, roomManager)) {
            player.applyDamage(split.explosionDamage);
          }

          const finalDuration = split.finalDuration ?? 0.2;
          this.createClippedAoeVisual(impactPos, split.explosionRadius, finalDuration, roomManager);

          if (split.dotRadius && split.dotDps && split.dotDuration) {
            const zoneMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, split.dotRadius);
            zoneMesh.position = this.toGroundPosition(impactPos);
            this.activeAoeZones.push({
              position: impactPos.clone(),
              radius: split.dotRadius,
              dps: split.dotDps,
              remaining: split.dotDuration,
              mesh: zoneMesh,
            });
          }

          this.activeSplitTravels.splice(i, 1);
          continue;
        }
      }

      split.position = nextPos;
      if (split.mesh) split.mesh.position = split.position;
    }

    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const projectile = this.activeProjectiles[i];
      const previousPosition = projectile.data?.position.clone();
      if (projectile.data && projectile.data.friendly && projectile.data.homingRadius > 0 && projectile.data.homingTurnRate > 0) {
        this.applyFriendlyHoming(projectile, enemies, deltaTime);
      }
      let speedMultiplier = 1;
      if (projectile.data && !projectile.data.friendly && this.hostileSlowZone) {
        const dist = Vector3.Distance(projectile.data.position, this.hostileSlowZone.center);
        if (dist <= this.hostileSlowZone.radius) {
          speedMultiplier = this.hostileSlowZone.multiplier;
        }
      }

      projectile.update(deltaTime, speedMultiplier);

      if (!projectile.isActive()) {
        this.releaseProjectileAt(i);
        continue;
      }

      // Check collision with walls/obstacles
      if (roomManager && projectile.data) {
        const startPos = previousPosition ?? projectile.data.position;
        const pos = projectile.data.position;
        const obstacles = roomManager.getObstacleBounds();
        const hitObstacle = this.segmentHitsObstacle(startPos, pos, obstacles);
        const hitBlockedTile = this.segmentHitsBlockedTile(startPos, pos, roomManager);

        if (!this.isProjectileTilePassableAt(pos.x, pos.z, roomManager) || hitObstacle || hitBlockedTile) {
          const blockedPoint = this.findFirstBlockedPointOnSegment(startPos, pos, roomManager, obstacles);
          if (projectile.data.remainingBounces > 0) {
            const normal = this.computeBounceNormal(startPos, blockedPoint, projectile.data.direction, roomManager, obstacles);
            if (normal.lengthSquared() > 0.0001) {
              projectile.data.remainingBounces -= 1;
              projectile.data.direction = this.reflectDirection(projectile.data.direction, normal);
              projectile.data.speed = Math.max(0.1, projectile.data.speed * projectile.data.bounceDamping);
              projectile.data.position = this.resolveImpactPosition(blockedPoint, projectile.data.direction, roomManager);
              if (projectile.mesh) {
                projectile.mesh.position.copyFrom(projectile.data.position);
              }
              continue;
            }
          }
          const impactPos = this.resolveImpactPosition(blockedPoint, projectile.data.direction, roomManager);
          this.applyImpactAoeToPlayer(projectile, impactPos, player);
          this.handleProjectileImpact(projectile, impactPos.clone(), roomManager);
          this.releaseProjectileAt(i);
          continue;
        }
      }

      if (projectile.data && projectile.data.distanceTraveled >= projectile.data.range) {
        this.applyImpactAoeToPlayer(projectile, projectile.data.position, player);
        this.handleProjectileImpact(projectile, projectile.data.position.clone(), roomManager);
        this.releaseProjectileAt(i);
        continue;
      }

      if (projectile.data) {
        if (projectile.data.friendly) {
          // Check collision with enemies
          for (const enemy of enemies) {
            const distance = Vector3.Distance(projectile.data.position, enemy.getPosition());
            if (distance < 1.0) {
              enemy.takeDamage(projectile.data.damage);
              player.onPlayerDealtDamage?.(projectile.data.damage);

              const poison = player.getPoisonBonus?.();
              if (poison && poison.percent > 0 && poison.duration > 0) {
                enemy.applyDot?.(projectile.data.damage * poison.percent, poison.duration);
              }

              const impactAoe = player.getMageImpactAoeConfig?.();
              if (impactAoe && Math.random() < impactAoe.chance) {
                this.applyFriendlyImpactAoe(enemy, projectile.data.damage, impactAoe, enemies, player);
              }

              if (projectile.data.pierceCount > 0) {
                projectile.data.pierceCount -= 1;
                projectile.data.position = projectile.data.position.add(projectile.data.direction.scale(0.4));
                if (projectile.mesh) {
                  projectile.mesh.position.copyFrom(projectile.data.position);
                }
                break;
              }

              this.eventBus.emit(GameEvents.PROJECTILE_HIT, {
                projectile: projectile,
                target: enemy.getId(),
                damage: projectile.data.damage,
              });

              this.handleProjectileImpact(projectile, projectile.data.position.clone(), roomManager);

              this.releaseProjectileAt(i);
              break;
            }
          }
        } else {
          const startPos = previousPosition ?? projectile.data.position;
          const playerPos = player.getPosition();
          const playerHitRadius = projectile.data.projectileType === 'artificer_main' ? 0.95 : 0.8;
          const hitPoint = this.segmentSphereImpactPoint(startPos, projectile.data.position, playerPos, playerHitRadius);

          if (hitPoint) {
            const reflection = player.reflectProjectileIfShielding?.(
              hitPoint,
              projectile.data.damage,
              projectile.data.direction
            );

            if (reflection) {
              this.spawnProjectile(
                reflection.position,
                reflection.direction,
                reflection.damage,
                projectile.data.speed * reflection.speedMultiplier,
                projectile.data.range,
                true
              );
              this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);
              this.releaseProjectileAt(i);
              continue;
            }

            if (projectile.data.projectileType === 'artificer_main') {
              this.applyImpactAoeToPlayer(projectile, hitPoint, player);
              this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);
              this.releaseProjectileAt(i);
              continue;
            }

            player.applyDamage(projectile.data.damage);
            this.eventBus.emit(GameEvents.PROJECTILE_HIT, {
              projectile: projectile,
              target: 'player',
              damage: projectile.data.damage,
            });

            this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);

            this.releaseProjectileAt(i);
          }
        }
      }
    }
  }

  private handleProjectileImpact(projectile: Projectile, position: Vector3, roomManager?: RoomManager): void {
    const data = projectile.data;
    if (!data?.splitConfig) return;

    if (data.splitConfig.impactRadius && data.splitConfig.impactDamage) {
      // Actual player damage handled in update loop; this is a visual-only placeholder hook
      const impactDuration = data.splitConfig.impactDuration ?? 0.6;
      this.createClippedAoeVisual(position, data.splitConfig.impactRadius, impactDuration, roomManager);
    }

    const count = data.splitConfig.count;
    const radius = data.splitConfig.radius;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const offset = new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      const rawNodePos = position.add(offset);
      const nodePos = roomManager
        ? this.clipPointToWalkableAlongRay(position, rawNodePos, roomManager)
        : rawNodePos;
      if (!nodePos) continue;
      if (data.splitConfig.travelSpeed && data.splitConfig.travelSpeed > 0) {
        const mesh = VisualPlaceholder.createProjectilePlaceholder(this.scene, `split_travel_${Date.now()}_${i}`);
        mesh.position = position.clone();
        this.activeSplitTravels.push({
          position: position.clone(),
          target: nodePos.clone(),
          speed: data.splitConfig.travelSpeed,
          mesh,
          explosionRadius: data.splitConfig.explosionRadius,
          explosionDamage: data.splitConfig.explosionDamage,
          dotRadius: data.splitConfig.dotRadius,
          dotDps: data.splitConfig.dotDps,
          dotDuration: data.splitConfig.dotDuration,
          finalDuration: data.splitConfig.finalDuration,
        });
      } else {
        const mesh = VisualPlaceholder.createProjectilePlaceholder(this.scene, `split_node_${Date.now()}_${i}`);
        mesh.position = nodePos.clone();
        this.delayedExplosions.push({
          position: nodePos,
          timer: data.splitConfig.delay,
          radius: data.splitConfig.explosionRadius,
          damage: data.splitConfig.explosionDamage,
          mesh,
          dotRadius: data.splitConfig.dotRadius,
          dotDps: data.splitConfig.dotDps,
          dotDuration: data.splitConfig.dotDuration,
          finalDuration: data.splitConfig.finalDuration,
        });
      }
    }
  }

  getActiveProjectiles(): Projectile[] {
    return this.activeProjectiles;
  }

  setHostileProjectileSlowZone(zone: { center: Vector3; radius: number; multiplier: number } | null): void {
    this.hostileSlowZone = zone ? {
      center: zone.center.clone(),
      radius: zone.radius,
      multiplier: zone.multiplier,
    } : null;
  }

  countHostileProjectilesInRadius(center: Vector3, radius: number): number {
    let count = 0;
    for (const projectile of this.activeProjectiles) {
      if (!projectile.data || projectile.data.friendly) continue;
      if (Vector3.Distance(projectile.data.position, center) <= radius) {
        count++;
      }
    }
    return count;
  }

  destroyHostileProjectilesInRadius(center: Vector3, radius: number): number {
    let destroyed = 0;
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const projectile = this.activeProjectiles[i];
      if (!projectile.data || projectile.data.friendly) continue;
      if (Vector3.Distance(projectile.data.position, center) > radius) continue;

      this.releaseProjectileAt(i);
      destroyed++;
    }
    return destroyed;
  }

  private applyImpactAoeToPlayer(projectile: Projectile, position: Vector3, player: ProjectilePlayer): void {
    const data = projectile.data;
    if (!data?.splitConfig?.impactRadius || !data.splitConfig.impactDamage) return;
    if (data.friendly) return;
    if (this.isPointAffectedByExplosion(position, player.getPosition(), data.splitConfig.impactRadius, this.currentRoomManager)) {
      player.applyDamage(data.splitConfig.impactDamage);
    }
  }

  private applyFriendlyHoming(projectile: Projectile, enemies: ProjectileEnemy[], deltaTime: number): void {
    const data = projectile.data;
    if (!data || !data.friendly || data.homingRadius <= 0 || data.homingTurnRate <= 0) return;

    let nearestEnemy: ProjectileEnemy | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const dist = Vector3.Distance(data.position, enemy.getPosition());
      if (dist <= data.homingRadius && dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = enemy;
      }
    }

    if (!nearestEnemy) return;

    const desired = nearestEnemy.getPosition().subtract(data.position);
    desired.y = 0;
    if (desired.lengthSquared() <= 0.0001) return;

    const desiredDir = desired.normalize();
    const blend = Math.max(0, Math.min(1, data.homingTurnRate * deltaTime));
    data.direction = Vector3.Lerp(data.direction, desiredDir, blend).normalize();
  }

  private applyFriendlyImpactAoe(
    primaryTarget: ProjectileEnemy,
    sourceDamage: number,
    config: { chance: number; radius: number; damageRatio: number; knockback: number },
    enemies: ProjectileEnemy[],
    player: ProjectilePlayer
  ): void {
    const impactPos = primaryTarget.getPosition();
    const splashDamage = sourceDamage * config.damageRatio;
    if (!Number.isFinite(splashDamage) || splashDamage <= 0) return;

    for (const enemy of enemies) {
      if (enemy.getId() === primaryTarget.getId()) continue;
      const delta = enemy.getPosition().subtract(impactPos);
      delta.y = 0;
      const distance = delta.length();
      if (distance > config.radius) continue;

      enemy.takeDamage(splashDamage);
      player.onPlayerDealtDamage?.(splashDamage);

      if (distance > 0.0001) {
        enemy.applyExternalKnockback?.(delta.normalize().scale(config.knockback));
      }
    }

    const blast = VisualPlaceholder.createAoEPlaceholder(this.scene, `mage_impact_aoe_${Date.now()}`, config.radius);
    blast.position = this.toGroundPosition(impactPos);
    setTimeout(() => blast.dispose(), 140);
  }

  private resolveImpactPosition(position: Vector3, direction: Vector3, roomManager: RoomManager): Vector3 {
    if (this.isProjectileTilePassableAt(position.x, position.z, roomManager)) return position.clone();

    const back = direction.normalize().scale(-1);
    const step = 0.06;
    for (let d = step; d <= 1.2; d += step) {
      const candidate = position.add(back.scale(d));
      if (this.isProjectileTilePassableAt(candidate.x, candidate.z, roomManager)) {
        return candidate;
      }
    }
    return position.clone();
  }

  private isPointAffectedByExplosion(center: Vector3, point: Vector3, radius: number, roomManager?: RoomManager): boolean {
    if (Vector3.Distance(center, point) > radius) return false;
    if (!roomManager) return true;
    return this.isLineWalkable(center, point, roomManager);
  }

  private isLineWalkable(start: Vector3, end: Vector3, roomManager: RoomManager): boolean {
    const delta = end.subtract(start);
    const length = delta.length();
    if (length <= 0.001) return this.isVisionPassableAt(start.x, start.z, roomManager);
    const dir = delta.scale(1 / length);
    const step = 0.08;
    const obstacles = roomManager.getObstacleBounds();
    for (let d = 0; d <= length; d += step) {
      const sample = start.add(dir.scale(d));
      if (!this.isVisionPassableAt(sample.x, sample.z, roomManager) || this.isInsideObstacle(sample, obstacles)) {
        return false;
      }
    }
    return true;
  }

  private createClippedAoeVisual(center: Vector3, radius: number, durationSec: number, roomManager?: RoomManager): void {
    if (!roomManager) {
      const mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, radius);
      mesh.position = this.toGroundPosition(center);
      setTimeout(() => mesh.dispose(), durationSec * 1000);
      return;
    }

    const miniRadius = Math.max(0.12, Math.min(0.38, radius * 0.18));
    const spacing = Math.max(0.24, miniRadius * 0.95);
    const visuals: Mesh[] = [];
    const obstacles = roomManager.getObstacleBounds();

    for (let x = center.x - radius; x <= center.x + radius; x += spacing) {
      for (let z = center.z - radius; z <= center.z + radius; z += spacing) {
        const sample = new Vector3(x, center.y, z);
        if (Vector3.Distance(sample, center) > radius) continue;
        if (!roomManager.isWalkable(x, z)) continue;
        if (this.isInsideObstacle(sample, obstacles)) continue;
        if (!this.isLineWalkable(center, sample, roomManager)) continue;
        if (!this.isDiscClearAt(sample, miniRadius, roomManager, obstacles)) continue;

        const mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_clip_${Date.now()}`, miniRadius);
        mesh.position = new Vector3(x, this.aoeVisualY, z);
        visuals.push(mesh);
      }
    }

    setTimeout(() => {
      for (const mesh of visuals) mesh.dispose();
    }, durationSec * 1000);
  }

  private clipPointToWalkableAlongRay(origin: Vector3, target: Vector3, roomManager: RoomManager): Vector3 | null {
    const delta = target.subtract(origin);
    const length = delta.length();
    if (length <= 0.001) {
      return this.isProjectileTilePassableAt(origin.x, origin.z, roomManager) ? origin.clone() : null;
    }

    const dir = delta.scale(1 / length);
    const step = 0.06;
    let lastWalkable: Vector3 | null = this.isProjectileTilePassableAt(origin.x, origin.z, roomManager) ? origin.clone() : null;

    for (let d = step; d <= length; d += step) {
      const sample = origin.add(dir.scale(d));
      if (!this.isProjectileTilePassableAt(sample.x, sample.z, roomManager)) {
        break;
      }
      lastWalkable = sample;
    }

    if (!lastWalkable) return null;
    if (Vector3.DistanceSquared(origin, lastWalkable) < 0.01) return null;
    return lastWalkable;
  }

  private segmentSphereImpactPoint(start: Vector3, end: Vector3, center: Vector3, radius: number): Vector3 | null {
    const segment = end.subtract(start);
    const segmentLengthSq = segment.lengthSquared();
    if (segmentLengthSq <= 0.000001) {
      return Vector3.Distance(start, center) <= radius ? start.clone() : null;
    }

    const toCenter = center.subtract(start);
    const t = Math.max(0, Math.min(1, Vector3.Dot(toCenter, segment) / segmentLengthSq));
    const closest = start.add(segment.scale(t));
    return Vector3.Distance(closest, center) <= radius ? closest : null;
  }

  private reflectDirection(direction: Vector3, normal: Vector3): Vector3 {
    const normalizedDirection = direction.normalize();
    const normalizedNormal = normal.normalize();
    const dot = Vector3.Dot(normalizedDirection, normalizedNormal);
    return normalizedDirection.subtract(normalizedNormal.scale(2 * dot)).normalize();
  }

  private computeBounceNormal(
    start: Vector3,
    impactPoint: Vector3,
    direction: Vector3,
    roomManager: RoomManager,
    obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>
  ): Vector3 {
    const physicsNormal = roomManager.getPhysicsBounceNormal(start, impactPoint);
    if (physicsNormal && physicsNormal.lengthSquared() > 0.0001) {
      return physicsNormal;
    }

    const obstacleNormal = this.computeObstacleNormal(impactPoint, obstacles);
    if (obstacleNormal.lengthSquared() > 0.0001) {
      return obstacleNormal;
    }

    const sampleStep = 0.12;
    const leftWalkable = roomManager.isWalkable(impactPoint.x - sampleStep, impactPoint.z);
    const rightWalkable = roomManager.isWalkable(impactPoint.x + sampleStep, impactPoint.z);
    const bottomWalkable = roomManager.isWalkable(impactPoint.x, impactPoint.z - sampleStep);
    const topWalkable = roomManager.isWalkable(impactPoint.x, impactPoint.z + sampleStep);

    if (leftWalkable && !rightWalkable) return new Vector3(-1, 0, 0);
    if (rightWalkable && !leftWalkable) return new Vector3(1, 0, 0);
    if (bottomWalkable && !topWalkable) return new Vector3(0, 0, -1);
    if (topWalkable && !bottomWalkable) return new Vector3(0, 0, 1);

    const travel = impactPoint.subtract(start);
    if (Math.abs(travel.x) >= Math.abs(travel.z)) {
      const nx = travel.x >= 0 ? -1 : 1;
      return new Vector3(nx, 0, 0);
    }
    const nz = travel.z >= 0 ? -1 : 1;
    return new Vector3(0, 0, nz);
  }

  private computeObstacleNormal(
    point: Vector3,
    obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>
  ): Vector3 {
    for (const obstacle of obstacles) {
      if (point.x < obstacle.minX || point.x > obstacle.maxX || point.z < obstacle.minZ || point.z > obstacle.maxZ) {
        continue;
      }

      const distLeft = Math.abs(point.x - obstacle.minX);
      const distRight = Math.abs(obstacle.maxX - point.x);
      const distBottom = Math.abs(point.z - obstacle.minZ);
      const distTop = Math.abs(obstacle.maxZ - point.z);
      const min = Math.min(distLeft, distRight, distBottom, distTop);

      if (min === distLeft) return new Vector3(-1, 0, 0);
      if (min === distRight) return new Vector3(1, 0, 0);
      if (min === distBottom) return new Vector3(0, 0, -1);
      return new Vector3(0, 0, 1);
    }

    return Vector3.Zero();
  }

  private segmentHitsBlockedTile(start: Vector3, end: Vector3, roomManager: RoomManager): boolean {
    const delta = end.subtract(start);
    const length = delta.length();
    if (length <= 0.001) return !this.isProjectileTilePassableAt(end.x, end.z, roomManager);
    const dir = delta.scale(1 / length);
    const step = 0.06;
    const startOffset = Math.min(step, Math.max(0.01, length * 0.2));

    for (let d = startOffset; d <= length; d += step) {
      const sample = start.add(dir.scale(d));
      if (!this.isProjectileTilePassableAt(sample.x, sample.z, roomManager)) {
        return true;
      }
    }
    return false;
  }

  private segmentHitsObstacle(start: Vector3, end: Vector3, obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>): boolean {
    const delta = end.subtract(start);
    const length = delta.length();
    if (length <= 0.001) return this.isInsideObstacle(end, obstacles);
    const dir = delta.scale(1 / length);
    const step = 0.06;
    const startOffset = Math.min(step, Math.max(0.01, length * 0.2));

    for (let d = startOffset; d <= length; d += step) {
      const sample = start.add(dir.scale(d));
      if (this.isInsideObstacle(sample, obstacles)) {
        return true;
      }
    }
    return false;
  }

  private findFirstBlockedPointOnSegment(
    start: Vector3,
    end: Vector3,
    roomManager: RoomManager,
    obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>
  ): Vector3 {
    const delta = end.subtract(start);
    const length = delta.length();
    if (length <= 0.001) return end.clone();
    const dir = delta.scale(1 / length);
    const step = 0.04;
    const startOffset = Math.min(step, Math.max(0.01, length * 0.2));

    for (let d = startOffset; d <= length; d += step) {
      const sample = start.add(dir.scale(d));
      if (!this.isProjectileTilePassableAt(sample.x, sample.z, roomManager) || this.isInsideObstacle(sample, obstacles)) {
        return sample;
      }
    }
    return end.clone();
  }

  private isInsideObstacle(point: Vector3, obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>): boolean {
    return obstacles.some(ob => point.x >= ob.minX && point.x <= ob.maxX && point.z >= ob.minZ && point.z <= ob.maxZ);
  }

  private isProjectileTilePassableAt(x: number, z: number, roomManager: RoomManager): boolean {
    const tileType = roomManager.getTileTypeAtWorld(x, z);
    return tileType !== 'wall' && tileType !== 'out';
  }

  private isVisionPassableAt(x: number, z: number, roomManager: RoomManager): boolean {
    return this.isProjectileTilePassableAt(x, z, roomManager);
  }

  private isDiscClearAt(
    center: Vector3,
    radius: number,
    roomManager: RoomManager,
    obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>
  ): boolean {
    if (!roomManager.isWalkable(center.x, center.z) || this.isInsideObstacle(center, obstacles)) {
      return false;
    }

    const samples = 10;
    for (let i = 0; i < samples; i++) {
      const angle = (Math.PI * 2 * i) / samples;
      const px = center.x + Math.cos(angle) * radius;
      const pz = center.z + Math.sin(angle) * radius;
      const p = new Vector3(px, center.y, pz);
      if (!roomManager.isWalkable(px, pz) || this.isInsideObstacle(p, obstacles)) {
        return false;
      }
    }

    return true;
  }

  private toGroundPosition(position: Vector3): Vector3 {
    return new Vector3(position.x, this.aoeVisualY, position.z);
  }

  resetForRoomTransition(): void {
    for (const exp of this.delayedExplosions) {
      if (exp.mesh) {
        this.deferredMeshDisposalQueue.push(exp.mesh);
      }
    }
    this.delayedExplosions = [];

    for (const zone of this.activeAoeZones) {
      if (zone.mesh) {
        this.deferredMeshDisposalQueue.push(zone.mesh);
      }
    }
    this.activeAoeZones = [];

    for (const split of this.activeSplitTravels) {
      if (split.mesh) {
        this.deferredMeshDisposalQueue.push(split.mesh);
      }
    }
    this.activeSplitTravels = [];

    for (const projectile of this.activeProjectiles) {
      this.disposeProjectileParticleEffect(projectile);
      projectile.setActive(false);
      this.projectilePool.release(projectile);
    }
    this.activeProjectiles = [];
    this.hostileSlowZone = null;
    this.currentRoomManager = undefined;
  }

  private processDeferredMeshDisposals(batchSize: number = 2): void {
    if (this.deferredMeshDisposalQueue.length === 0) {
      return;
    }

    const count = Math.max(1, Math.min(8, Math.round(batchSize)));
    const frameStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameBudgetMs = 0.8;

    for (let i = 0; i < count && this.deferredMeshDisposalQueue.length > 0; i++) {
      const mesh = this.deferredMeshDisposalQueue.shift();
      if (mesh && !mesh.isDisposed()) {
        mesh.dispose();
      }

      if (i + 1 < count) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (now - frameStart >= frameBudgetMs) {
          break;
        }
      }
    }
  }

  dispose(): void {
    this.resetForRoomTransition();
    for (const mesh of this.deferredMeshDisposalQueue) {
      if (!mesh.isDisposed()) {
        mesh.dispose();
      }
    }
    this.deferredMeshDisposalQueue = [];
    for (const exp of this.delayedExplosions) {
      exp.mesh?.dispose();
    }
    this.delayedExplosions = [];
    for (const zone of this.activeAoeZones) {
      zone.mesh?.dispose();
    }
    this.activeAoeZones = [];
    for (const split of this.activeSplitTravels) {
      split.mesh?.dispose();
    }
    this.activeSplitTravels = [];
    this.activeProjectiles.forEach((p) => {
      this.disposeProjectileParticleEffect(p);
      p.dispose();
    });
    this.activeProjectiles = [];
    if (this.mageProjectileParticleTexture) {
      this.mageProjectileParticleTexture.dispose();
      this.mageProjectileParticleTexture = null;
    }
    this.projectileParticleEffects.clear();
  }
}
