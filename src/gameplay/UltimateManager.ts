/**
 * UltimateManager - Manages ultimate ability zones and effects
 */

import { Scene, Vector3, Mesh } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { EventBus, GameEvents } from '../core/EventBus';
import { Pool, IPoolable } from '../utils/Pool';

interface UltimateZoneData {
  position: Vector3;
  radius: number;
  damage: number;
  duration: number;
  healPerTick: number;
  dotTickRate: number;
  timeElapsed: number;
}

class UltimateZone implements IPoolable {
  mesh?: Mesh;
  data: UltimateZoneData | null = null;
  private activeFlag: boolean = false;
  private damagedEnemies: Set<string> = new Set();

  constructor(private scene: Scene) {}

  setData(data: Omit<UltimateZoneData, 'timeElapsed'>): void {
    this.data = { ...data, timeElapsed: 0 };
    this.damagedEnemies.clear();
    
    if (!this.mesh) {
      this.mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `ult_zone_${Date.now()}`, data.radius);
    }
    
    this.mesh.position = data.position.clone();
  }

  update(deltaTime: number): void {
    if (!this.data) return;

    this.data.timeElapsed += deltaTime;

    if (this.data.timeElapsed >= this.data.duration) {
      this.setActive(false);
    }
  }

  reset(): void {
    this.data = null;
    this.damagedEnemies.clear();
    if (this.mesh) {
      this.mesh.position = new Vector3(0, -100, 0);
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

  hasHitEnemy(enemyId: string): boolean {
    return this.damagedEnemies.has(enemyId);
  }

  markEnemyHit(enemyId: string): void {
    this.damagedEnemies.add(enemyId);
  }

  getTickDamage(): number {
    if (!this.data) return 0;
    return this.data.damage / (this.data.duration / this.data.dotTickRate);
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}

export class UltimateManager {
  private zonePool: Pool<UltimateZone>;
  private activeZones: UltimateZone[] = [];
  private eventBus: EventBus;

  constructor(private scene: Scene, poolSize: number = 5) {
    this.eventBus = EventBus.getInstance();
    
    this.zonePool = new Pool<UltimateZone>(
      () => new UltimateZone(scene),
      poolSize
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.PLAYER_ULTIMATE_USED, (data) => {
      this.spawn(data.position, data.radius, data.damage, data.duration, data.healPerTick, data.dotTickRate);
    });
  }

  spawn(position: Vector3, radius: number, damage: number, duration: number, healPerTick: number, dotTickRate: number): void {
    const zone = this.zonePool.get();
    zone.setData({ 
      position: position.clone(), 
      radius, 
      damage,
      duration,
      healPerTick: healPerTick ?? 1,
      dotTickRate: dotTickRate ?? 0.5,
    });
    zone.setActive(true);
    this.activeZones.push(zone);
  }

  update(deltaTime: number, enemies: any[], player: any): void {
    for (let i = this.activeZones.length - 1; i >= 0; i--) {
      const zone = this.activeZones[i];
      zone.update(deltaTime);

      if (!zone.isActive()) {
        this.zonePool.release(zone);
        this.activeZones.splice(i, 1);
        continue;
      }

      if (!zone.data) continue;

      // Apply DOT to enemies in radius
      for (const enemy of enemies) {
        const distance = Vector3.Distance(zone.data.position, enemy.getPosition());
        if (distance <= zone.data.radius) {
          if (!zone.hasHitEnemy(enemy.getId())) {
            zone.markEnemyHit(enemy.getId());
          }
          
          // Apply tick damage
          const tickDamage = zone.getTickDamage() * zone.data.dotTickRate;
          enemy.takeDamage(tickDamage);
        }
      }

      // Heal player
      const playerDistance = Vector3.Distance(zone.data.position, player.getPosition());
      if (playerDistance <= zone.data.radius) {
        player.heal(zone.data.healPerTick * deltaTime);
      }
    }
  }

  getActiveZones(): UltimateZone[] {
    return this.activeZones;
  }

  dispose(): void {
    this.activeZones.forEach(z => z.dispose());
    this.activeZones = [];
  }
}
