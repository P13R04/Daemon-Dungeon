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

  update(deltaTime: number): void {
    if (!this.data || !this.mesh) return;

    const movement = this.data.direction.scale(this.data.speed * deltaTime);
    this.data.position.addInPlace(movement);
    this.data.distanceTraveled += movement.length();
    
    this.mesh.position = this.data.position;

    // Check if out of range
    if (this.data.distanceTraveled >= this.data.range) {
      this.setActive(false);
    }
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
    // Update delayed explosions
    for (let i = this.delayedExplosions.length - 1; i >= 0; i--) {
      const exp = this.delayedExplosions[i];
      exp.timer -= deltaTime;
      if (exp.timer <= 0) {
        const distance = Vector3.Distance(exp.position, player.getPosition());
        if (distance <= exp.radius) {
          player.applyDamage(exp.damage);
        }
        const finalDuration = exp.finalDuration ?? 0.2;
        const expMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `final_${Date.now()}`, exp.radius);
        expMesh.position = exp.position.clone();
        setTimeout(() => expMesh.dispose(), finalDuration * 1000);
        if (exp.dotRadius && exp.dotDps && exp.dotDuration) {
          const zoneMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, exp.dotRadius);
          zoneMesh.position = exp.position.clone();
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
      const distance = Vector3.Distance(zone.position, player.getPosition());
      if (distance <= zone.radius) {
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
        const distance = Vector3.Distance(split.position, player.getPosition());
        if (distance <= split.explosionRadius) {
          player.applyDamage(split.explosionDamage);
        }
        const finalDuration = split.finalDuration ?? 0.2;
        const expMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `final_${Date.now()}`, split.explosionRadius);
        expMesh.position = split.position.clone();
        setTimeout(() => expMesh.dispose(), finalDuration * 1000);
        if (split.dotRadius && split.dotDps && split.dotDuration) {
          const zoneMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, split.dotRadius);
          zoneMesh.position = split.position.clone();
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
      const move = toTarget.normalize().scale(step);
      split.position = split.position.add(move);
      if (split.mesh) split.mesh.position = split.position;
    }

    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const projectile = this.activeProjectiles[i];
      projectile.update(deltaTime);

      if (!projectile.isActive()) {
        this.projectilePool.release(projectile);
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      // Check collision with walls/obstacles
      if (roomManager && projectile.data) {
        const pos = projectile.data.position;
        const obstacles = roomManager.getObstacleBounds();
        const hitObstacle = obstacles.some(ob => pos.x >= ob.minX && pos.x <= ob.maxX && pos.z >= ob.minZ && pos.z <= ob.maxZ);

        if (!roomManager.isWalkable(pos.x, pos.z) || hitObstacle) {
          this.applyImpactAoeToPlayer(projectile, pos, player);
          this.handleProjectileImpact(projectile, pos.clone());
          projectile.setActive(false);
          this.projectilePool.release(projectile);
          this.activeProjectiles.splice(i, 1);
          continue;
        }
      }

      if (projectile.data && projectile.data.distanceTraveled >= projectile.data.range) {
        this.applyImpactAoeToPlayer(projectile, projectile.data.position, player);
        this.handleProjectileImpact(projectile, projectile.data.position.clone());
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

              this.handleProjectileImpact(projectile, projectile.data.position.clone());

              projectile.setActive(false);
              this.projectilePool.release(projectile);
              this.activeProjectiles.splice(i, 1);
              break;
            }
          }
        } else {
          // Check collision with player
          if (projectile.data.projectileType === 'artificer_main') {
            continue;
          }
          const distance = Vector3.Distance(projectile.data.position, player.getPosition());
          if (distance < 0.8) {
            player.applyDamage(projectile.data.damage);
            this.eventBus.emit(GameEvents.PROJECTILE_HIT, {
              projectile: projectile,
              target: 'player',
              damage: projectile.data.damage,
            });

            this.handleProjectileImpact(projectile, projectile.data.position.clone());

            projectile.setActive(false);
            this.projectilePool.release(projectile);
            this.activeProjectiles.splice(i, 1);
          }
        }
      }
    }
  }

  private handleProjectileImpact(projectile: Projectile, position: Vector3): void {
    const data = projectile.data;
    if (!data?.splitConfig) return;

    if (data.splitConfig.impactRadius && data.splitConfig.impactDamage) {
      // Actual player damage handled in update loop; this is a visual-only placeholder hook
      const impactMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `impact_${Date.now()}`, data.splitConfig.impactRadius);
      impactMesh.position = position.clone();
      const impactDuration = data.splitConfig.impactDuration ?? 0.6;
      setTimeout(() => impactMesh.dispose(), impactDuration * 1000);
    }

    const count = data.splitConfig.count;
    const radius = data.splitConfig.radius;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const offset = new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      const nodePos = position.add(offset);
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

  private applyImpactAoeToPlayer(projectile: Projectile, position: Vector3, player: any): void {
    const data = projectile.data;
    if (!data?.splitConfig?.impactRadius || !data.splitConfig.impactDamage) return;
    if (data.friendly) return;
    const distance = Vector3.Distance(position, player.getPosition());
    if (distance <= data.splitConfig.impactRadius) {
      player.applyDamage(data.splitConfig.impactDamage);
    }
  }

  dispose(): void {
    this.activeProjectiles.forEach(p => p.dispose());
    this.activeProjectiles = [];
  }
}
