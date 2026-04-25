/**
 * UltimateManager - Manages ultimate ability zones and effects
 */

import {
  Scene,
  Vector3,
  Mesh,
  ParticleSystem,
  DynamicTexture,
  Color3,
  Color4,
  StandardMaterial,
} from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { EventBus, GameEvents } from '../core/EventBus';
import { Pool, IPoolable } from '../utils/Pool';
import { SCENE_LAYER } from '../ui/uiLayers';

interface PlayerUltimateUsedPayload {
  position: Vector3;
  radius: number;
  damage: number;
  duration: number;
  healPerTick?: number;
  dotTickRate?: number;
}

interface UltimateZoneData {
  position: Vector3;
  radius: number;
  damage: number;
  duration: number;
  healPerTick: number;
  dotTickRate: number;
  timeElapsed: number;
}

interface UltimateEnemy {
  getPosition(): Vector3;
  getId(): string;
  takeDamage(amount: number): void;
}

interface UltimatePlayer {
  getPosition(): Vector3;
  heal(amount: number): void;
}

class UltimateZone implements IPoolable {
  mesh?: Mesh;
  data: UltimateZoneData | null = null;
  private activeFlag: boolean = false;
  private damagedEnemies: Set<string> = new Set();
  private dotTickTimer: number = 0;

  constructor(private scene: Scene) {}

  setData(data: Omit<UltimateZoneData, 'timeElapsed'>): void {
    this.data = { ...data, timeElapsed: 0 };
    this.damagedEnemies.clear();
    this.dotTickTimer = 0;
    
    if (!this.mesh) {
      this.mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `ult_zone_${Date.now()}`, data.radius);
    }
    
    this.mesh.position = data.position.clone();
  }

  update(deltaTime: number): void {
    if (!this.data) return;

    this.data.timeElapsed += deltaTime;
    this.dotTickTimer += deltaTime;

    if (this.data.timeElapsed >= this.data.duration) {
      this.setActive(false);
    }
  }

  consumeDotTickPulse(): boolean {
    if (!this.data) return false;
    if (this.dotTickTimer < this.data.dotTickRate) return false;
    this.dotTickTimer = 0;
    return true;
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
  private mageDotParticleTexture: DynamicTexture | null = null;
  private zoneParticleEffects: Map<UltimateZone, ParticleSystem> = new Map();

  constructor(private scene: Scene, poolSize: number = 5) {
    this.eventBus = EventBus.getInstance();
    
    this.zonePool = new Pool<UltimateZone>(
      () => new UltimateZone(scene),
      poolSize
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.PLAYER_ULTIMATE_USED, (data: PlayerUltimateUsedPayload) => {
      this.spawn(data.position, data.radius, data.damage, data.duration, data.healPerTick ?? 1, data.dotTickRate ?? 0.5);
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
    this.configureZoneVisual(zone);
    this.startZoneParticles(zone);
    this.spawnZoneActivationBurst(position, radius);
  }

  update(deltaTime: number, enemies: UltimateEnemy[], player: UltimatePlayer): void {
    for (let i = this.activeZones.length - 1; i >= 0; i--) {
      const zone = this.activeZones[i];
      zone.update(deltaTime);

      if (!zone.isActive()) {
        this.stopZoneParticles(zone);
        this.zonePool.release(zone);
        this.activeZones.splice(i, 1);
        continue;
      }

      if (!zone.data) continue;

      this.updateZoneVisual(zone);
      if (zone.consumeDotTickPulse()) {
        this.spawnDotPulseBurst(zone.data.position, zone.data.radius);
      }

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

  private configureZoneVisual(zone: UltimateZone): void {
    if (!zone.mesh) return;
    const mat = zone.mesh.material;
    if (!(mat instanceof StandardMaterial)) return;
    mat.diffuseColor = new Color3(0.32, 0.8, 1.0);
    mat.emissiveColor = new Color3(0.36, 0.22, 0.8);
    mat.alpha = 0.24;
    mat.backFaceCulling = false;
  }

  private updateZoneVisual(zone: UltimateZone): void {
    if (!zone.mesh || !zone.data) return;
    const mat = zone.mesh.material;
    if (!(mat instanceof StandardMaterial)) return;
    const t = zone.data.timeElapsed;
    const pulse = 1 + (0.07 * Math.sin(t * 9));
    zone.mesh.scaling.x = pulse;
    zone.mesh.scaling.y = pulse;
    zone.mesh.scaling.z = 1;
    mat.alpha = 0.18 + (0.08 * (0.5 + (0.5 * Math.sin(t * 13))));

    const particles = this.zoneParticleEffects.get(zone);
    if (particles) {
      particles.emitter = zone.data.position.add(new Vector3(0, 0.08, 0));
    }
  }

  private startZoneParticles(zone: UltimateZone): void {
    if (!zone.data) return;
    this.stopZoneParticles(zone);

    const particles = new ParticleSystem(`mage_ult_dot_fx_${Date.now()}`, 920, this.scene);
    particles.particleTexture = this.getMageDotParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = zone.data.position.add(new Vector3(0, 0.08, 0));
    particles.minSize = 0.05;
    particles.maxSize = 0.18;
    particles.minLifeTime = 0.22;
    particles.maxLifeTime = 0.58;
    particles.emitRate = 980;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.55, 0.9, 1.0, 0.92);
    particles.color2 = new Color4(0.62, 0.34, 1.0, 0.82);
    particles.colorDead = new Color4(0.08, 0.15, 0.4, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.minEmitPower = 1.0;
    particles.maxEmitPower = 2.2;
    particles.updateSpeed = 0.016;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      if (!zone.data) return;
      const angle = Math.random() * Math.PI * 2;
      const r = zone.data.radius * (0.25 + (Math.random() * 0.75));
      positionToUpdate.x = zone.data.position.x + (Math.cos(angle) * r);
      positionToUpdate.y = zone.data.position.y + 0.08 + (Math.random() * 0.2);
      positionToUpdate.z = zone.data.position.z + (Math.sin(angle) * r);
    };

    particles.start();
    this.zoneParticleEffects.set(zone, particles);
  }

  private stopZoneParticles(zone: UltimateZone): void {
    const particles = this.zoneParticleEffects.get(zone);
    if (!particles) return;
    particles.stop();
    particles.dispose(false);
    this.zoneParticleEffects.delete(zone);
  }

  private spawnZoneActivationBurst(position: Vector3, radius: number): void {
    const burst = new ParticleSystem(`mage_ult_start_fx_${Date.now()}`, 320, this.scene);
    burst.particleTexture = this.getMageDotParticleTexture();
    burst.layerMask = SCENE_LAYER;
    burst.emitter = position.add(new Vector3(0, 0.1, 0));
    burst.minSize = 0.07;
    burst.maxSize = 0.24;
    burst.minLifeTime = 0.16;
    burst.maxLifeTime = 0.28;
    burst.emitRate = 1500;
    burst.blendMode = ParticleSystem.BLENDMODE_ADD;
    burst.color1 = new Color4(0.62, 0.94, 1.0, 0.95);
    burst.color2 = new Color4(0.64, 0.38, 1.0, 0.82);
    burst.colorDead = new Color4(0.08, 0.16, 0.42, 0);
    burst.gravity = new Vector3(0, 0, 0);
    burst.minEmitPower = 1.6;
    burst.maxEmitPower = 3.1;
    burst.updateSpeed = 0.016;

    burst.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.max(0.2, radius * 0.2);
      positionToUpdate.x = position.x + (Math.cos(angle) * r);
      positionToUpdate.y = position.y + 0.1 + ((Math.random() - 0.5) * 0.05);
      positionToUpdate.z = position.z + (Math.sin(angle) * r);
    };

    burst.start();
    window.setTimeout(() => {
      burst.stop();
      window.setTimeout(() => burst.dispose(false), 420);
    }, 120);
  }

  private spawnDotPulseBurst(position: Vector3, radius: number): void {
    const pulse = new ParticleSystem(`mage_ult_tick_fx_${Date.now()}`, 220, this.scene);
    pulse.particleTexture = this.getMageDotParticleTexture();
    pulse.layerMask = SCENE_LAYER;
    pulse.emitter = position.add(new Vector3(0, 0.09, 0));
    pulse.minSize = 0.05;
    pulse.maxSize = 0.16;
    pulse.minLifeTime = 0.1;
    pulse.maxLifeTime = 0.22;
    pulse.emitRate = 900;
    pulse.blendMode = ParticleSystem.BLENDMODE_ADD;
    pulse.color1 = new Color4(0.56, 0.92, 1.0, 0.88);
    pulse.color2 = new Color4(0.56, 0.34, 1.0, 0.74);
    pulse.colorDead = new Color4(0.08, 0.16, 0.4, 0);
    pulse.gravity = new Vector3(0, 0, 0);
    pulse.minEmitPower = 0.8;
    pulse.maxEmitPower = 1.9;
    pulse.updateSpeed = 0.016;

    pulse.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const r = radius * (0.2 + (0.65 * Math.random()));
      positionToUpdate.x = position.x + (Math.cos(angle) * r);
      positionToUpdate.y = position.y + 0.08 + ((Math.random() - 0.5) * 0.04);
      positionToUpdate.z = position.z + (Math.sin(angle) * r);
    };

    pulse.start();
    window.setTimeout(() => {
      pulse.stop();
      window.setTimeout(() => pulse.dispose(false), 260);
    }, 90);
  }

  private getMageDotParticleTexture(): DynamicTexture {
    if (this.mageDotParticleTexture) {
      return this.mageDotParticleTexture;
    }

    const texture = new DynamicTexture('mage_ult_dot_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(134,236,255,0.95)');
    gradient.addColorStop(0.76, 'rgba(128,86,255,0.9)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.mageDotParticleTexture = texture;
    return texture;
  }

  resetForRoomTransition(): void {
    for (const zone of this.activeZones) {
      this.stopZoneParticles(zone);
      zone.setActive(false);
      this.zonePool.release(zone);
    }
    this.activeZones = [];
  }

  dispose(): void {
    this.resetForRoomTransition();
    if (this.mageDotParticleTexture) {
      this.mageDotParticleTexture.dispose();
      this.mageDotParticleTexture = null;
    }
    this.zoneParticleEffects.clear();
  }
}
