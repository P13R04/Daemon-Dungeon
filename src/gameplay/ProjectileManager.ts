/**
 * ProjectileManager - Manages projectile lifecycle
 */

import { Scene, Mesh, Vector3, Ray, RayHelper } from '@babylonjs/core';
import type { RoomManager } from '../systems/RoomManager';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { EventBus, GameEvents } from '../core/EventBus';
import { Pool, IPoolable } from '../utils/Pool';

interface ProjectileData {
  position: Vector3;
  direction: Vector3;
  damage: number;
  speed: number;
  range: number;
  distanceTraveled: number;
  friendly: boolean;
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

class Projectile implements IPoolable {
  mesh?: Mesh;
  data: ProjectileData | null = null;
  private activeFlag: boolean = false;

  constructor(private scene: Scene) {}

  setData(data: Omit<ProjectileData, 'distanceTraveled'>): void {
    this.data = { ...data, distanceTraveled: 0 };
    
    if (!this.mesh) {
      this.mesh = VisualPlaceholder.createProjectilePlaceholder(this.scene, `projectile_${Date.now()}`);
    }
    
    this.mesh.position = data.position.clone();
  }

  update(deltaTime: number, speedMultiplier: number = 1): void {
    if (!this.data || !this.mesh) return;

    const movement = this.data.direction.scale(this.data.speed * speedMultiplier * deltaTime);
    this.data.position.addInPlace(movement);
    this.data.distanceTraveled += movement.length();
    
    this.mesh.position = this.data.position;
  }

  reset(): void {
    this.data = null;
    if (this.mesh) {
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
        payload.splitConfig
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
    }
  ): void {
    const projectile = this.projectilePool.get();
    projectile.setData({
      position: position.clone(),
      direction: direction.normalize(),
      damage,
      speed,
      range,
      friendly,
      projectileType,
      splitConfig,
    });
    projectile.setActive(true);
    this.activeProjectiles.push(projectile);
  }

  update(deltaTime: number, enemies: any[], player: any, roomManager?: RoomManager): void {
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

        if (hitObstacle || hitBlockedTile || !roomManager.isWalkable(nextPos.x, nextPos.z)) {
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
      let speedMultiplier = 1;
      if (projectile.data && !projectile.data.friendly && this.hostileSlowZone) {
        const dist = Vector3.Distance(projectile.data.position, this.hostileSlowZone.center);
        if (dist <= this.hostileSlowZone.radius) {
          speedMultiplier = this.hostileSlowZone.multiplier;
        }
      }

      projectile.update(deltaTime, speedMultiplier);

      if (!projectile.isActive()) {
        this.projectilePool.release(projectile);
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      // Check collision with walls/obstacles
      if (roomManager && projectile.data) {
        const startPos = previousPosition ?? projectile.data.position;
        const pos = projectile.data.position;
        const obstacles = roomManager.getObstacleBounds();
        const hitObstacle = this.segmentHitsObstacle(startPos, pos, obstacles);
        const hitBlockedTile = this.segmentHitsBlockedTile(startPos, pos, roomManager);

        if (!roomManager.isWalkable(pos.x, pos.z) || hitObstacle || hitBlockedTile) {
          const blockedPoint = this.findFirstBlockedPointOnSegment(startPos, pos, roomManager, obstacles);
          const impactPos = this.resolveImpactPosition(blockedPoint, projectile.data.direction, roomManager);
          this.applyImpactAoeToPlayer(projectile, impactPos, player);
          this.handleProjectileImpact(projectile, impactPos.clone(), roomManager);
          projectile.setActive(false);
          this.projectilePool.release(projectile);
          this.activeProjectiles.splice(i, 1);
          continue;
        }
      }

      if (projectile.data && projectile.data.distanceTraveled >= projectile.data.range) {
        this.applyImpactAoeToPlayer(projectile, projectile.data.position, player);
        this.handleProjectileImpact(projectile, projectile.data.position.clone(), roomManager);
        projectile.setActive(false);
        this.projectilePool.release(projectile);
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      if (projectile.data) {
        if (projectile.data.friendly) {
          // Check collision with enemies
          for (const enemy of enemies) {
            const distance = Vector3.Distance(projectile.data.position, enemy.getPosition());
            if (distance < 1.0) {
              enemy.takeDamage(projectile.data.damage);

              const poison = player.getPoisonBonus?.();
              if (poison && poison.percent > 0 && poison.duration > 0) {
                enemy.applyDot(projectile.data.damage * poison.percent, poison.duration);
              }

              this.eventBus.emit(GameEvents.PROJECTILE_HIT, {
                projectile: projectile,
                target: enemy.getId(),
                damage: projectile.data.damage,
              });

              this.handleProjectileImpact(projectile, projectile.data.position.clone(), roomManager);

              projectile.setActive(false);
              this.projectilePool.release(projectile);
              this.activeProjectiles.splice(i, 1);
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
              projectile.setActive(false);
              this.projectilePool.release(projectile);
              this.activeProjectiles.splice(i, 1);
              continue;
            }

            if (projectile.data.projectileType === 'artificer_main') {
              this.applyImpactAoeToPlayer(projectile, hitPoint, player);
              this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);
              projectile.setActive(false);
              this.projectilePool.release(projectile);
              this.activeProjectiles.splice(i, 1);
              continue;
            }

            player.applyDamage(projectile.data.damage);
            this.eventBus.emit(GameEvents.PROJECTILE_HIT, {
              projectile: projectile,
              target: 'player',
              damage: projectile.data.damage,
            });

            this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);

            projectile.setActive(false);
            this.projectilePool.release(projectile);
            this.activeProjectiles.splice(i, 1);
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

      projectile.setActive(false);
      this.projectilePool.release(projectile);
      this.activeProjectiles.splice(i, 1);
      destroyed++;
    }
    return destroyed;
  }

  private applyImpactAoeToPlayer(projectile: Projectile, position: Vector3, player: any): void {
    const data = projectile.data;
    if (!data?.splitConfig?.impactRadius || !data.splitConfig.impactDamage) return;
    if (data.friendly) return;
    if (this.isPointAffectedByExplosion(position, player.getPosition(), data.splitConfig.impactRadius, this.currentRoomManager)) {
      player.applyDamage(data.splitConfig.impactDamage);
    }
  }

  private resolveImpactPosition(position: Vector3, direction: Vector3, roomManager: RoomManager): Vector3 {
    if (roomManager.isWalkable(position.x, position.z)) return position.clone();

    const back = direction.normalize().scale(-1);
    const step = 0.06;
    for (let d = step; d <= 1.2; d += step) {
      const candidate = position.add(back.scale(d));
      if (roomManager.isWalkable(candidate.x, candidate.z)) {
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
    if (length <= 0.001) return roomManager.isWalkable(start.x, start.z);
    const dir = delta.scale(1 / length);
    const step = 0.08;
    const obstacles = roomManager.getObstacleBounds();
    for (let d = 0; d <= length; d += step) {
      const sample = start.add(dir.scale(d));
      if (!roomManager.isWalkable(sample.x, sample.z) || this.isInsideObstacle(sample, obstacles)) {
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
      return roomManager.isWalkable(origin.x, origin.z) ? origin.clone() : null;
    }

    const dir = delta.scale(1 / length);
    const step = 0.06;
    let lastWalkable: Vector3 | null = roomManager.isWalkable(origin.x, origin.z) ? origin.clone() : null;

    for (let d = step; d <= length; d += step) {
      const sample = origin.add(dir.scale(d));
      if (!roomManager.isWalkable(sample.x, sample.z)) {
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

  private segmentHitsBlockedTile(start: Vector3, end: Vector3, roomManager: RoomManager): boolean {
    const delta = end.subtract(start);
    const length = delta.length();
    if (length <= 0.001) return !roomManager.isWalkable(end.x, end.z);
    const dir = delta.scale(1 / length);
    const step = 0.06;
    const startOffset = Math.min(step, Math.max(0.01, length * 0.2));

    for (let d = startOffset; d <= length; d += step) {
      const sample = start.add(dir.scale(d));
      if (!roomManager.isWalkable(sample.x, sample.z)) {
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
      if (!roomManager.isWalkable(sample.x, sample.z) || this.isInsideObstacle(sample, obstacles)) {
        return sample;
      }
    }
    return end.clone();
  }

  private isInsideObstacle(point: Vector3, obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>): boolean {
    return obstacles.some(ob => point.x >= ob.minX && point.x <= ob.maxX && point.z >= ob.minZ && point.z <= ob.maxZ);
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

  dispose(): void {
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
    this.activeProjectiles.forEach(p => p.dispose());
    this.activeProjectiles = [];
  }
}
