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
    }) => {
      if (!payload) return;
      this.spawnProjectile(
        payload.position,
        payload.direction,
        payload.damage,
        payload.speed,
        payload.range
      );
    });
  }

  spawnProjectile(position: Vector3, direction: Vector3, damage: number, speed: number, range: number): void {
    const projectile = this.projectilePool.get();
    projectile.setData({ position: position.clone(), direction: direction.normalize(), damage, speed, range });
    projectile.setActive(true);
    this.activeProjectiles.push(projectile);
  }

  update(deltaTime: number, enemies: any[], player: any, roomManager?: RoomManager): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const projectile = this.activeProjectiles[i];
      projectile.update(deltaTime);

      if (!projectile.isActive()) {
        this.projectilePool.release(projectile);
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      // Check collision with walls
      if (roomManager && projectile.data) {
        const pos = projectile.data.position;
        if (!roomManager.isWalkable(pos.x, pos.z)) {
          projectile.setActive(false);
          this.projectilePool.release(projectile);
          this.activeProjectiles.splice(i, 1);
          continue;
        }
      }

      // Check collision with enemies
      if (projectile.data) {
        for (const enemy of enemies) {
          const distance = Vector3.Distance(projectile.data.position, enemy.getPosition());
          if (distance < 1.0) {
            // Hit!
            enemy.takeDamage(projectile.data.damage);
            
            this.eventBus.emit(GameEvents.PROJECTILE_HIT, {
              projectile: projectile,
              target: enemy.getId(),
              damage: projectile.data.damage,
            });

            projectile.setActive(false);
            this.projectilePool.release(projectile);
            this.activeProjectiles.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  getActiveProjectiles(): Projectile[] {
    return this.activeProjectiles;
  }

  dispose(): void {
    this.activeProjectiles.forEach(p => p.dispose());
    this.activeProjectiles = [];
  }
}
