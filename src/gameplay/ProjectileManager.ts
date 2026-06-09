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
  Texture,
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
  sourceProjectileType?: string;
  dotRadius?: number;
  dotDps?: number;
  dotDuration?: number;
  finalDuration?: number;
}

interface AoeZone {
  id: number;
  position: Vector3;
  radius: number;
  dps: number;
  remaining: number;
  mesh?: Mesh;
  sourceProjectileType?: string;
  baseRemaining?: number;
  visualPhase?: number;
}

interface SplitTravel {
  position: Vector3;
  target: Vector3;
  speed: number;
  mesh?: Mesh;
  trail?: ParticleSystem;
  explosionRadius: number;
  explosionDamage: number;
  sourceProjectileType?: string;
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
    this.mesh.computeWorldMatrix(true);
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
  private static readonly CASTER_PROJECTILE_MIN_Y = 0.14;
  private static readonly CASTER_PROJECTILE_FLATTEN_Y = 0.18;
  private static readonly HOSTILE_STYLE_PROJECTILE_TYPES = new Set<string>([
    'healer',
    'healer_bolt',
    'bullet_hell',
    'turret',
    'sentinel',
    'prefire_sentinel',
    'necromancer',
    'swarm_coordinator',
    'artificer_main',
    'rocket_sentry',
  ]);
  private projectilePool: Pool<Projectile>;
  private activeProjectiles: Projectile[] = [];
  private eventBus: EventBus;
  private delayedExplosions: DelayedExplosion[] = [];
  private activeAoeZones: AoeZone[] = [];
  private activeSplitTravels: SplitTravel[] = [];
  private hostileSlowZone: { center: Vector3; radius: number; multiplier: number } | null = null;
  private currentRoomManager?: RoomManager;
  private readonly aoeVisualY = 0.075;
  private projectileParticleEffects: Map<Projectile, ParticleSystem> = new Map();
  private projectileParticleTextures: Map<Projectile, DynamicTexture> = new Map();
  private mageProjectileParticleTexture: DynamicTexture | null = null;
  private hostileProjectileTrailTexture: DynamicTexture | null = null;
  private hostileProjectileCoreTexture: DynamicTexture | null = null;
  private hostileImpactGlitchTexture: DynamicTexture | null = null;
  private deferredMeshDisposalQueue: Mesh[] = [];
  private readonly maxAoeVisualCells: number = 140;
  private nextAoeZoneId: number = 1;
  private unsubscriber: (() => void) | null = null;
  public isDisposed: boolean = false;

  constructor(private scene: Scene, poolSize: number = 20) {
    this.eventBus = EventBus.getInstance();
    
    this.projectilePool = new Pool<Projectile>(
      () => new Projectile(scene),
      poolSize
    );
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (this.unsubscriber) return;
    this.unsubscriber = this.eventBus.on(GameEvents.PROJECTILE_SPAWNED, (payload: {
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
    if (projectileType === 'artificer_main') {
      this.eventBus.emit(GameEvents.ENEMY_ARTIFICIER_PROJECTILE_FLIGHT_STARTED, {
        position: position.clone(),
      });
    }
    if (projectileType && ['sentinel', 'prefire_sentinel', 'swarm_coordinator', 'turret', 'necromancer', 'bullet_hell'].includes(projectileType)) {
      this.eventBus.emit(GameEvents.ENEMY_SENTRY_SHOOTER_PROJECTILE_FLIGHT_STARTED, {
        position: position.clone(),
        projectileType,
      });
    }
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
    } else if (!projectile.data.friendly || this.shouldUseHostileProjectileStyle(projectile.data.projectileType)) {
      const isHealer = projectile.data.projectileType === 'healer' || projectile.data.projectileType === 'healer_bolt';
      const projectileType = projectile.data.projectileType ?? 'enemy';
      const colorMap: Record<string, { core: Color3; p: Color4 }> = {
        healer: { core: new Color3(1.0, 1.0, 0.4), p: new Color4(1.0, 1.0, 0.4, 0.84) },
        healer_bolt: { core: new Color3(1.0, 1.0, 0.4), p: new Color4(1.0, 1.0, 0.4, 0.84) },
        bullet_hell: { core: new Color3(1.0, 0.26, 0.72), p: new Color4(1.0, 0.3, 0.74, 0.86) },
        turret: { core: new Color3(1.0, 0.4, 0.08), p: new Color4(1.0, 0.48, 0.1, 0.86) },
        sentinel: { core: new Color3(0.28, 1.0, 0.92), p: new Color4(0.32, 1.0, 0.94, 0.86) },
        prefire_sentinel: { core: new Color3(0.28, 1.0, 0.92), p: new Color4(0.32, 1.0, 0.94, 0.86) },
        necromancer: { core: new Color3(0.8, 0.45, 1.0), p: new Color4(0.84, 0.5, 1.0, 0.84) },
        swarm_coordinator: { core: new Color3(0.56, 0.78, 1.0), p: new Color4(0.6, 0.84, 1.0, 0.84) },
        artificer_main: { core: new Color3(1.0, 0.58, 0.1), p: new Color4(1.0, 0.62, 0.14, 0.9) },
      };
      const fallback = { core: new Color3(1.0, 0.1, 0.1), p: new Color4(1.0, 0.2, 0.2, 0.8) };
      const selected = colorMap[projectileType] ?? fallback;
      const coreColor = selected.core;
      const profileMap: Record<string, { minSize: number; maxSize: number; lifeMin: number; lifeMax: number; emitRate: number; coreScale: number }> = {
        turret: { minSize: 0.12, maxSize: 0.36, lifeMin: 0.11, lifeMax: 0.27, emitRate: 920, coreScale: 0.28 },
        bullet_hell: { minSize: 0.09, maxSize: 0.26, lifeMin: 0.07, lifeMax: 0.2, emitRate: 980, coreScale: 0.22 },
        sentinel: { minSize: 0.11, maxSize: 0.32, lifeMin: 0.08, lifeMax: 0.22, emitRate: 860, coreScale: 0.26 },
        prefire_sentinel: { minSize: 0.11, maxSize: 0.32, lifeMin: 0.08, lifeMax: 0.22, emitRate: 860, coreScale: 0.26 },
        necromancer: { minSize: 0.1, maxSize: 0.3, lifeMin: 0.09, lifeMax: 0.24, emitRate: 820, coreScale: 0.24 },
        swarm_coordinator: { minSize: 0.1, maxSize: 0.3, lifeMin: 0.09, lifeMax: 0.24, emitRate: 820, coreScale: 0.24 },
      };
      const profile = profileMap[projectileType] ?? { minSize: 0.1, maxSize: 0.32, lifeMin: 0.08, lifeMax: 0.22, emitRate: 860, coreScale: 0.32 };
      
      material.alpha = 0.42;
      material.emissiveColor = coreColor;
      material.diffuseColor = Color3.Black();
      if (projectile.mesh) {
        projectile.mesh.scaling.setAll(profile.coreScale);
      }

      const particles = new ParticleSystem(`${isHealer ? 'healer' : 'enemy'}_projectile_fx_${Date.now()}`, 180, this.scene);
      const localTrailTexture = this.createLocalHostileTrailTexture(projectile);
      particles.particleTexture = localTrailTexture;
      this.projectileParticleTextures.set(projectile, localTrailTexture);
      particles.layerMask = SCENE_LAYER;
      particles.emitter = projectile.mesh;
      particles.isLocal = false;
      particles.startPositionFunction = (_worldMatrix, positionToUpdate) => {
        const emitter = projectile.mesh as any;
        if (emitter?.absolutePosition) {
          positionToUpdate.copyFrom(emitter.absolutePosition);
          const d = projectile.data?.direction ?? Vector3.Forward();
          positionToUpdate.subtractInPlace(d.scale(0.18));
          positionToUpdate.y += 0.06;
          positionToUpdate.x += (Math.random() - 0.5) * 0.04;
          positionToUpdate.y += (Math.random() - 0.5) * 0.04;
          positionToUpdate.z += (Math.random() - 0.5) * 0.04;
        }
      };
      particles.minSize = profile.minSize;
      particles.maxSize = profile.maxSize;
      particles.minLifeTime = profile.lifeMin;
      particles.maxLifeTime = profile.lifeMax;
      particles.emitRate = profile.emitRate;
      particles.blendMode = ParticleSystem.BLENDMODE_ADD;
      
      const pColor = selected.p;
      particles.color1 = pColor;
      particles.color2 = new Color4(
        Math.min(1, pColor.r * 1.08),
        Math.min(1, pColor.g * 1.08),
        Math.min(1, pColor.b * 1.08),
        Math.max(0.5, pColor.a - 0.1)
      );
      particles.colorDead = new Color4(pColor.r * 0.2, pColor.g * 0.2, pColor.b * 0.2, 0);
      
      particles.gravity = new Vector3(0, 0, 0);
      particles.minEmitPower = 0.45;
      particles.maxEmitPower = 1.3;
      particles.updateSpeed = 0.016;
      particles.direction1 = new Vector3(-0.16, -0.03, -0.16);
      particles.direction2 = new Vector3(0.16, 0.05, 0.16);
      particles.minAngularSpeed = -Math.PI * 2.2;
      particles.maxAngularSpeed = Math.PI * 2.2;
      particles.createSphereEmitter(0.055);
      particles.start();
      this.projectileParticleEffects.set(projectile, particles);
      return;
    }

    material.diffuseColor = new Color3(1.0, 1.0, 0.0);
    material.emissiveColor = new Color3(1.0, 1.0, 0.0);
  }

  private shouldUseHostileProjectileStyle(projectileType?: string): boolean {
    return !!projectileType && ProjectileManager.HOSTILE_STYLE_PROJECTILE_TYPES.has(projectileType);
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

  private getHostileProjectileTrailTexture(): DynamicTexture {
    if (this.hostileProjectileTrailTexture) {
      return this.hostileProjectileTrailTexture;
    }
    const texture = new DynamicTexture('hostile_projectile_trail_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 64, 64);
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.2, 'rgba(190,255,255,0.65)');
    g.addColorStop(0.52, 'rgba(140,180,255,0.9)');
    g.addColorStop(0.88, 'rgba(70,90,160,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.hostileProjectileTrailTexture = texture;
    return texture;
  }

  private getHostileProjectileCoreTexture(): DynamicTexture {
    if (this.hostileProjectileCoreTexture) {
      return this.hostileProjectileCoreTexture;
    }
    const texture = new DynamicTexture('hostile_projectile_core_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 64, 64);
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.28, 'rgba(210,245,255,0.94)');
    gradient.addColorStop(0.65, 'rgba(85,140,255,0.65)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.hostileProjectileCoreTexture = texture;
    return texture;
  }

  private getHostileImpactGlitchTexture(): DynamicTexture {
    if (this.hostileImpactGlitchTexture) {
      return this.hostileImpactGlitchTexture;
    }
    const texture = new DynamicTexture('hostile_impact_glitch_texture', { width: 32, height: 32 }, this.scene, false);
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 4) {
      for (let x = 0; x < 32; x += 4) {
        const on = Math.random() > 0.35;
        if (!on) continue;
        const alpha = 0.45 + Math.random() * 0.55;
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    texture.update();
    this.hostileImpactGlitchTexture = texture;
    return texture;
  }

  private disposeProjectileParticleEffect(projectile: Projectile): void {
    const particles = this.projectileParticleEffects.get(projectile);
    if (particles) {
      this.projectileParticleEffects.delete(projectile);
      try {
        particles.stop();
      } catch {}
      try {
        particles.dispose(false);
      } catch {}
    }
    const texture = this.projectileParticleTextures.get(projectile);
    if (texture) {
      this.projectileParticleTextures.delete(projectile);
      try {
        texture.dispose();
      } catch {}
    }
  }

  private createLocalHostileTrailTexture(projectile: Projectile): DynamicTexture {
    const texture = new DynamicTexture(
      `hostile_trail_tex_${Date.now()}_${Math.floor(Math.random() * 100000)}_${projectile.mesh?.name ?? 'proj'}`,
      { width: 64, height: 64 },
      this.scene,
      false
    );
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, 64, 64);
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.2, 'rgba(190,255,255,0.65)');
    g.addColorStop(0.52, 'rgba(140,180,255,0.9)');
    g.addColorStop(0.88, 'rgba(70,90,160,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    return texture;
  }

  private releaseProjectileAt(index: number): void {
    const projectile = this.activeProjectiles[index];
    if (!projectile) return;
    const projectileType = projectile.data?.projectileType;
    const position = projectile.data?.position.clone() ?? new Vector3(0, 0, 0);
    this.disposeProjectileParticleEffect(projectile);
    projectile.setActive(false);
    this.projectilePool.release(projectile);
    this.activeProjectiles.splice(index, 1);
    if (projectileType === 'artificer_main') {
      this.eventBus.emit(GameEvents.ENEMY_ARTIFICIER_PROJECTILE_FLIGHT_ENDED, {
        position,
      });
    }
    if (projectileType && ['sentinel', 'prefire_sentinel', 'swarm_coordinator', 'turret', 'necromancer', 'bullet_hell'].includes(projectileType)) {
      this.eventBus.emit(GameEvents.ENEMY_SENTRY_SHOOTER_PROJECTILE_FLIGHT_ENDED, {
        position,
        projectileType,
      });
    }
  }

  update(deltaTime: number, enemies: ProjectileEnemy[], player: ProjectilePlayer, roomManager?: RoomManager): void {
    const deferredCount = this.deferredMeshDisposalQueue.length;
    const adaptiveDisposeBatch = deferredCount > 60 ? 8 : deferredCount > 30 ? 6 : deferredCount > 12 ? 4 : 2;
    this.processDeferredMeshDisposals(adaptiveDisposeBatch);
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
        if (exp.sourceProjectileType === 'artificer_main') {
          this.spawnArtificerExplosionFx(exp.position, exp.radius);
        }
        this.spawnProjectileImpactFx(exp.sourceProjectileType, exp.position, exp.radius);
        this.createClippedAoeVisual(exp.position, exp.radius, finalDuration, roomManager, exp.sourceProjectileType);
        if (exp.dotRadius && exp.dotDps && exp.dotDuration) {
          this.spawnOrRefreshAoeZone(exp.position, exp.dotRadius, exp.dotDps, exp.dotDuration, exp.sourceProjectileType);
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
        if (zone.sourceProjectileType === 'artificer_main') {
          this.eventBus.emit(GameEvents.ENEMY_ARTIFICIER_ZONE_DAMAGE_TICK, {
            position: zone.position.clone(),
          });
        }
      }
      if (zone.sourceProjectileType === 'artificer_main' && zone.mesh?.material instanceof StandardMaterial) {
        const phase = (zone.visualPhase ?? 0) + deltaTime * 6.5;
        zone.visualPhase = phase;
        const lifeRatio = Math.max(0.18, Math.min(1, zone.remaining / Math.max(0.001, zone.baseRemaining ?? zone.remaining)));
        const pulse = 0.62 + (0.38 * Math.sin(phase));
        zone.mesh.material.alpha = Math.max(0.24, lifeRatio * 0.4 + pulse * 0.18);
        zone.mesh.material.emissiveColor = new Color3(0.88 + pulse * 0.12, 0.22 + pulse * 0.08, 0.06);
      }
      if (zone.remaining <= 0) {
        if (zone.mesh) zone.mesh.dispose();
        if (zone.sourceProjectileType === 'artificer_main') {
          this.eventBus.emit(GameEvents.ENEMY_ARTIFICIER_DOT_ZONE_ENDED, {
            zoneId: zone.id,
            position: zone.position.clone(),
          });
        }
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
        if (split.trail) {
          split.trail.stop();
          setTimeout(() => { if (!this.isDisposed) split.trail?.dispose(false); }, 220);
          split.trail = undefined;
        }
        if (this.isPointAffectedByExplosion(split.position, player.getPosition(), split.explosionRadius, roomManager)) {
          player.applyDamage(split.explosionDamage);
        }
        const finalDuration = split.finalDuration ?? 0.2;
        if (split.sourceProjectileType === 'artificer_main') {
          this.spawnArtificerExplosionFx(split.position, split.explosionRadius);
        }
        this.spawnProjectileImpactFx(split.sourceProjectileType, split.position, split.explosionRadius);
        this.createClippedAoeVisual(split.position, split.explosionRadius, finalDuration, roomManager, split.sourceProjectileType);
        if (split.dotRadius && split.dotDps && split.dotDuration) {
          this.spawnOrRefreshAoeZone(split.position, split.dotRadius, split.dotDps, split.dotDuration, split.sourceProjectileType);
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
          if (split.trail) {
            split.trail.stop();
            setTimeout(() => { if (!this.isDisposed) split.trail?.dispose(false); }, 220);
            split.trail = undefined;
          }

          if (this.isPointAffectedByExplosion(impactPos, player.getPosition(), split.explosionRadius, roomManager)) {
            player.applyDamage(split.explosionDamage);
          }

          const finalDuration = split.finalDuration ?? 0.2;
          this.spawnProjectileImpactFx(split.sourceProjectileType, impactPos, split.explosionRadius);
          this.createClippedAoeVisual(impactPos, split.explosionRadius, finalDuration, roomManager, split.sourceProjectileType);

          if (split.dotRadius && split.dotDps && split.dotDuration) {
            this.spawnOrRefreshAoeZone(impactPos, split.dotRadius, split.dotDps, split.dotDuration, split.sourceProjectileType);
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
      if (projectile.data && !projectile.data.friendly) {
        this.applyHostileCasterTrajectoryFloor(projectile);
      }
      if (projectile.data && !projectile.data.friendly && projectile.mesh) {
        const d = projectile.data.direction;
        if (d.lengthSquared() > 0.0001) {
          projectile.mesh.lookAt(projectile.data.position.add(d));
          const fx = this.projectileParticleEffects.get(projectile);
          if (fx) {
            const jitter = 0.14;
            fx.direction1 = new Vector3(
              (-d.x * 1.9) - jitter,
              -0.02,
              (-d.z * 1.9) - jitter
            );
            fx.direction2 = new Vector3(
              (-d.x * 1.9) + jitter,
              0.08,
              (-d.z * 1.9) + jitter
            );
          }
        }
        // Stretch hostile projectiles a bit to avoid "simple ball" look.
        const stretch = projectile.data.projectileType === 'bullet_hell' ? 1.7 : 1.45;
        const base = projectile.data.projectileType === 'bullet_hell' ? 0.18 : 0.22;
        projectile.mesh.scaling.set(base, base, base * stretch);
      }

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
          if (projectile.data.projectileType === 'rocket_sentry') {
            this.eventBus.emit(GameEvents.ENEMY_ROCKET_SENTRY_IMPACT, {
              position: impactPos.clone(),
              projectileType: projectile.data.projectileType,
            });
          }
          this.spawnProjectileImpactFx(projectile.data.projectileType, impactPos, projectile.data.splitConfig?.impactRadius ?? 0.52);
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
            const enemyPos = enemy.getPosition();
            const dx = projectile.data.position.x - enemyPos.x;
            const dz = projectile.data.position.z - enemyPos.z;
            const planarDistance = Math.sqrt((dx * dx) + (dz * dz));
            if (planarDistance < 1.0) {
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
          let playerHitRadius = 0.8;
          if (projectile.data.projectileType === 'artificer_main') {
            playerHitRadius = 0.95;
          } else if (projectile.data.projectileType === 'bullet_hell') {
            playerHitRadius = 0.35;
          }
          const hitPoint = this.segmentCircleImpactPointXZ(startPos, projectile.data.position, playerPos, playerHitRadius);

          if (hitPoint) {
            const reflection = player.reflectProjectileIfShielding?.(
              hitPoint,
              projectile.data.damage,
              projectile.data.direction
            );

            if (reflection) {
              if (projectile.data.projectileType === 'rocket_sentry') {
                this.eventBus.emit(GameEvents.ENEMY_ROCKET_SENTRY_IMPACT, {
                  position: hitPoint.clone(),
                  projectileType: projectile.data.projectileType,
                });
              }
              this.spawnProjectile(
                reflection.position,
                reflection.direction,
                reflection.damage,
                projectile.data.speed * reflection.speedMultiplier,
                projectile.data.range,
                true,
                projectile.data.projectileType,
                projectile.data.splitConfig,
                projectile.data.maxBounces,
                projectile.data.bounceDamping,
                projectile.data.pierceCount,
                projectile.data.homingRadius,
                projectile.data.homingTurnRate
              );
              this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);
              this.releaseProjectileAt(i);
              continue;
            }

            if (projectile.data.projectileType === 'artificer_main') {
              this.applyImpactAoeToPlayer(projectile, hitPoint, player);
              this.spawnProjectileImpactFx(projectile.data.projectileType, hitPoint, projectile.data.splitConfig?.impactRadius ?? 0.62);
              this.handleProjectileImpact(projectile, hitPoint.clone(), roomManager);
              this.releaseProjectileAt(i);
              continue;
            }

            if (projectile.data.projectileType === 'rocket_sentry') {
              this.eventBus.emit(GameEvents.ENEMY_ROCKET_SENTRY_IMPACT, {
                position: hitPoint.clone(),
                projectileType: projectile.data.projectileType,
              });
            }
            if (projectile.data.projectileType && ['sentinel', 'prefire_sentinel', 'swarm_coordinator', 'turret', 'necromancer', 'bullet_hell'].includes(projectile.data.projectileType)) {
              this.eventBus.emit(GameEvents.ENEMY_SENTRY_SHOOTER_ONHIT_PLAYER, {
                position: hitPoint.clone(),
                projectileType: projectile.data.projectileType,
              });
            }

            player.applyDamage(projectile.data.damage);
            this.spawnProjectileImpactFx(projectile.data.projectileType, hitPoint, 0.48);
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

  private isHostileCasterProjectileType(projectileType?: string): boolean {
    if (!projectileType) return false;
    return [
      'artificer_main',
      'sentinel',
      'prefire_sentinel',
      'swarm_coordinator',
      'turret',
      'necromancer',
      'bullet_hell',
      'healer',
      'healer_bolt',
    ].includes(projectileType);
  }

  private applyHostileCasterTrajectoryFloor(projectile: Projectile): void {
    const data = projectile.data;
    if (!data || data.friendly || !this.isHostileCasterProjectileType(data.projectileType)) return;

    if (data.position.y < ProjectileManager.CASTER_PROJECTILE_MIN_Y) {
      data.position.y = ProjectileManager.CASTER_PROJECTILE_MIN_Y;
    }

    if (data.position.y <= ProjectileManager.CASTER_PROJECTILE_FLATTEN_Y && data.direction.y < 0) {
      const planar = new Vector3(data.direction.x, 0, data.direction.z);
      if (planar.lengthSquared() > 0.000001) {
        data.direction = planar.normalize();
      } else {
        data.direction = Vector3.Forward();
      }
    }

    if (projectile.mesh) {
      projectile.mesh.position.y = data.position.y;
    }
  }

  private handleProjectileImpact(projectile: Projectile, position: Vector3, roomManager?: RoomManager): void {
    const data = projectile.data;
    if (!data?.splitConfig) return;

    if (data.projectileType === 'artificer_main') {
      this.eventBus.emit(GameEvents.ENEMY_ARTIFICIER_SPLIT_IMPACT, {
        position: position.clone(),
      });
    }

    if (data.splitConfig.impactRadius && data.splitConfig.impactDamage) {
      // Actual player damage handled in update loop; this is a visual-only placeholder hook
      const impactDuration = data.splitConfig.impactDuration ?? 0.6;
      this.createClippedAoeVisual(position, data.splitConfig.impactRadius, impactDuration, roomManager, data.projectileType);
      this.spawnProjectileImpactFx(data.projectileType, position, data.splitConfig.impactRadius);
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
        const splitMat = this.ensureProjectileMaterial(mesh);
        splitMat.alpha = 0.45;
        splitMat.emissiveColor = new Color3(1.0, 0.5, 0.12);
        splitMat.diffuseColor = Color3.Black();
        mesh.scaling.setAll(0.12);
        this.activeSplitTravels.push({
          position: position.clone(),
          target: nodePos.clone(),
          speed: data.splitConfig.travelSpeed,
          mesh,
          trail: data.projectileType === 'artificer_main'
            ? this.createArtificerSubProjectileTrail(mesh)
            : undefined,
          explosionRadius: data.splitConfig.explosionRadius,
          explosionDamage: data.splitConfig.explosionDamage,
          sourceProjectileType: data.projectileType,
          dotRadius: data.splitConfig.dotRadius,
          dotDps: data.splitConfig.dotDps,
          dotDuration: data.splitConfig.dotDuration,
          finalDuration: data.splitConfig.finalDuration,
        });
      } else {
        const mesh = VisualPlaceholder.createProjectilePlaceholder(this.scene, `split_node_${Date.now()}_${i}`);
        mesh.position = nodePos.clone();
        const nodeMat = this.ensureProjectileMaterial(mesh);
        nodeMat.alpha = 0.4;
        nodeMat.emissiveColor = new Color3(1.0, 0.45, 0.1);
        nodeMat.diffuseColor = Color3.Black();
        mesh.scaling.setAll(0.11);
        this.delayedExplosions.push({
          position: nodePos,
          timer: data.splitConfig.delay,
          radius: data.splitConfig.explosionRadius,
          damage: data.splitConfig.explosionDamage,
          mesh,
          sourceProjectileType: data.projectileType,
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

  getRuntimeLoadStats(): {
    activeProjectiles: number;
    delayedExplosions: number;
    activeAoeZones: number;
    activeSplitTravels: number;
    deferredMeshDisposals: number;
    particleEffects: number;
  } {
    return {
      activeProjectiles: this.activeProjectiles.length,
      delayedExplosions: this.delayedExplosions.length,
      activeAoeZones: this.activeAoeZones.length,
      activeSplitTravels: this.activeSplitTravels.length,
      deferredMeshDisposals: this.deferredMeshDisposalQueue.length,
      particleEffects: this.projectileParticleEffects.size,
    };
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
    setTimeout(() => { if (!this.isDisposed) blast.dispose(); }, 140);
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

  private createClippedAoeVisual(
    center: Vector3,
    radius: number,
    durationSec: number,
    roomManager?: RoomManager,
    sourceProjectileType?: string
  ): void {
    if (!roomManager) {
      const mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, radius);
      mesh.position = this.toGroundPosition(center);
      if (mesh.material instanceof StandardMaterial) {
        if (sourceProjectileType === 'artificer_main') {
          mesh.material.diffuseColor = new Color3(0.52, 0.08, 0.03);
          mesh.material.emissiveColor = new Color3(0.98, 0.22, 0.08);
          mesh.material.alpha = 0.38;
        } else {
          mesh.material.diffuseColor = new Color3(0.35, 0.95, 0.88);
          mesh.material.emissiveColor = new Color3(0.12, 0.45, 0.42);
          mesh.material.alpha = 0.32;
        }
      }
      setTimeout(() => {
        if (this.isDisposed) return;
        if (!mesh.isDisposed()) {
          this.deferredMeshDisposalQueue.push(mesh);
        }
      }, durationSec * 1000);
      return;
    }

    const miniRadius = Math.max(0.12, Math.min(0.38, radius * 0.18));
    const spacing = Math.max(0.24, miniRadius * 0.95);
    const visuals: Mesh[] = [];
    const obstacles = roomManager.getObstacleBounds();

    for (let x = center.x - radius; x <= center.x + radius; x += spacing) {
      for (let z = center.z - radius; z <= center.z + radius; z += spacing) {
        if (visuals.length >= this.maxAoeVisualCells) {
          break;
        }
        const sample = new Vector3(x, center.y, z);
        if (Vector3.Distance(sample, center) > radius) continue;
        if (!roomManager.isWalkable(x, z)) continue;
        if (this.isInsideObstacle(sample, obstacles)) continue;
        if (!this.isLineWalkable(center, sample, roomManager)) continue;
        if (!this.isDiscClearAt(sample, miniRadius, roomManager, obstacles)) continue;

        const mesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_clip_${Date.now()}`, miniRadius);
        mesh.position = new Vector3(x, this.aoeVisualY, z);
        if (mesh.material instanceof StandardMaterial) {
          if (sourceProjectileType === 'artificer_main') {
            mesh.material.diffuseColor = new Color3(0.52, 0.08, 0.03);
            mesh.material.emissiveColor = new Color3(0.96, 0.2, 0.08);
            mesh.material.alpha = 0.4;
          } else {
            mesh.material.alpha = 0.34;
            mesh.material.diffuseColor = new Color3(0.35, 0.95, 0.88);
            mesh.material.emissiveColor = new Color3(0.12, 0.45, 0.42);
          }
        }
        visuals.push(mesh);
      }
      if (visuals.length >= this.maxAoeVisualCells) {
        break;
      }
    }

    setTimeout(() => {
      if (this.isDisposed) return;
      for (const mesh of visuals) {
        if (!mesh.isDisposed()) {
          this.deferredMeshDisposalQueue.push(mesh);
        }
      }
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

  private segmentCircleImpactPointXZ(start: Vector3, end: Vector3, center: Vector3, radius: number): Vector3 | null {
    const segment = end.subtract(start);
    segment.y = 0;
    const segmentLengthSq = segment.lengthSquared();
    if (segmentLengthSq <= 0.000001) {
      const dx = start.x - center.x;
      const dz = start.z - center.z;
      return Math.sqrt((dx * dx) + (dz * dz)) <= radius ? start.clone() : null;
    }

    const toCenter = new Vector3(center.x - start.x, 0, center.z - start.z);
    const t = Math.max(0, Math.min(1, Vector3.Dot(toCenter, segment) / segmentLengthSq));
    const closest = start.add(segment.scale(t));
    const dx = closest.x - center.x;
    const dz = closest.z - center.z;
    return Math.sqrt((dx * dx) + (dz * dz)) <= radius ? closest : null;
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

  private spawnProjectileImpactFx(projectileType: string | undefined, position: Vector3, radius: number): void {
    const type = projectileType ?? 'enemy';
    const colorMap: Record<string, Color4> = {
      healer: new Color4(1.0, 1.0, 0.48, 0.95),
      healer_bolt: new Color4(1.0, 1.0, 0.48, 0.95),
      bullet_hell: new Color4(1.0, 0.34, 0.76, 0.95),
      turret: new Color4(1.0, 0.52, 0.14, 0.95),
      sentinel: new Color4(0.4, 1.0, 0.96, 0.95),
      prefire_sentinel: new Color4(0.4, 1.0, 0.96, 0.95),
      swarm_coordinator: new Color4(0.64, 0.88, 1.0, 0.95),
      necromancer: new Color4(0.9, 0.6, 1.0, 0.95),
      artificer_main: new Color4(1.0, 0.65, 0.2, 0.95),
      rocket_sentry: new Color4(1.0, 0.45, 0.16, 0.95),
      mage_missile: new Color4(1.0, 0.45, 0.16, 0.95),
    };
    const c = colorMap[type] ?? new Color4(1.0, 0.3, 0.3, 0.9);

    const burst = new ParticleSystem(`proj_impact_${type}_${Date.now()}`, 140, this.scene);
    burst.particleTexture = this.getHostileProjectileCoreTexture();
    burst.layerMask = SCENE_LAYER;
    burst.emitter = new Vector3(position.x, this.aoeVisualY + 0.07, position.z);
    burst.minSize = Math.max(0.08, radius * 0.07);
    burst.maxSize = Math.max(0.16, radius * 0.16);
    burst.minLifeTime = 0.08;
    burst.maxLifeTime = 0.24;
    burst.emitRate = 0;
    burst.manualEmitCount = Math.round(34 + Math.min(70, radius * 54));
    burst.blendMode = ParticleSystem.BLENDMODE_ADD;
    burst.color1 = c;
    burst.color2 = new Color4(
      Math.min(1, c.r * 1.08),
      Math.min(1, c.g * 1.08),
      Math.min(1, c.b * 1.08),
      Math.max(0.6, c.a - 0.14)
    );
    burst.colorDead = new Color4(c.r * 0.12, c.g * 0.12, c.b * 0.12, 0);
    burst.minEmitPower = Math.max(0.6, radius * 2.2);
    burst.maxEmitPower = Math.max(1.4, radius * 3.6);
    burst.direction1 = new Vector3(-1, -0.1, -1);
    burst.direction2 = new Vector3(1, 0.8, 1);
    burst.updateSpeed = 0.016;
    burst.gravity = new Vector3(0, -0.4, 0);
    burst.disposeOnStop = true;
    burst.start();
    setTimeout(() => { if (!this.isDisposed) burst.stop(); }, 90);

    if (this.isHostileCasterProjectileType(type) || type === 'rocket_sentry' || type === 'mage_missile') {
      this.spawnCasterGlitchImpactFx(position, radius, c);
    }
    if (type === 'rocket_sentry' || type === 'mage_missile') {
      this.spawnMissileDetonationImpactFx(position, radius);
    }
  }

  private spawnCasterGlitchImpactFx(position: Vector3, radius: number, baseColor: Color4): void {
    const glitch = new ParticleSystem(`proj_impact_glitch_${Date.now()}`, 120, this.scene);
    glitch.particleTexture = this.getHostileImpactGlitchTexture();
    glitch.layerMask = SCENE_LAYER;
    glitch.emitter = new Vector3(position.x, this.aoeVisualY + 0.06, position.z);
    glitch.minSize = Math.max(0.06, radius * 0.06);
    glitch.maxSize = Math.max(0.18, radius * 0.12);
    glitch.minLifeTime = 0.06;
    glitch.maxLifeTime = 0.18;
    glitch.emitRate = 0;
    glitch.manualEmitCount = Math.round(20 + Math.min(56, radius * 40));
    glitch.blendMode = ParticleSystem.BLENDMODE_ADD;
    glitch.color1 = new Color4(Math.min(1, baseColor.r + 0.1), Math.min(1, baseColor.g + 0.1), Math.min(1, baseColor.b + 0.1), 0.92);
    glitch.color2 = new Color4(baseColor.r, baseColor.g, baseColor.b, 0.76);
    glitch.colorDead = new Color4(baseColor.r * 0.12, baseColor.g * 0.12, baseColor.b * 0.12, 0);
    glitch.minEmitPower = Math.max(0.9, radius * 1.8);
    glitch.maxEmitPower = Math.max(2.0, radius * 2.8);
    glitch.direction1 = new Vector3(-1, -0.12, -1);
    glitch.direction2 = new Vector3(1, 0.55, 1);
    glitch.gravity = new Vector3(0, -0.25, 0);
    glitch.updateSpeed = 0.016;
    glitch.minAngularSpeed = -Math.PI * 1.7;
    glitch.maxAngularSpeed = Math.PI * 1.7;
    glitch.disposeOnStop = true;
    glitch.start();
    setTimeout(() => { if (!this.isDisposed) glitch.stop(); }, 80);
  }

  private spawnMissileDetonationImpactFx(position: Vector3, radius: number): void {
    const emitter = new Vector3(position.x, this.aoeVisualY + 0.1, position.z);
    const fireball = new ParticleSystem(`rocket_detonation_${Date.now()}`, 220, this.scene);
    fireball.particleTexture = this.getMageProjectileParticleTexture();
    fireball.layerMask = SCENE_LAYER;
    fireball.emitter = emitter;
    fireball.minSize = Math.max(0.1, radius * 0.12);
    fireball.maxSize = Math.max(0.24, radius * 0.22);
    fireball.minLifeTime = 0.09;
    fireball.maxLifeTime = 0.26;
    fireball.emitRate = 0;
    fireball.manualEmitCount = Math.round(70 + Math.min(160, radius * 140));
    fireball.blendMode = ParticleSystem.BLENDMODE_ADD;
    fireball.color1 = new Color4(1.0, 0.8, 0.24, 0.98);
    fireball.color2 = new Color4(1.0, 0.22, 0.08, 0.9);
    fireball.colorDead = new Color4(0.2, 0.06, 0.02, 0);
    fireball.minEmitPower = Math.max(1.5, radius * 2.2);
    fireball.maxEmitPower = Math.max(3.4, radius * 3.8);
    fireball.direction1 = new Vector3(-1, -0.08, -1);
    fireball.direction2 = new Vector3(1, 1.2, 1);
    fireball.gravity = new Vector3(0, -0.58, 0);
    fireball.updateSpeed = 0.016;
    fireball.disposeOnStop = true;
    fireball.start();
    setTimeout(() => { if (!this.isDisposed) fireball.stop(); }, 110);

    const shock = new ParticleSystem(`rocket_shock_${Date.now()}`, 120, this.scene);
    shock.particleTexture = this.getHostileImpactGlitchTexture();
    shock.layerMask = SCENE_LAYER;
    shock.emitter = emitter;
    shock.minSize = Math.max(0.12, radius * 0.14);
    shock.maxSize = Math.max(0.24, radius * 0.3);
    shock.minLifeTime = 0.08;
    shock.maxLifeTime = 0.2;
    shock.emitRate = 0;
    shock.manualEmitCount = Math.round(36 + Math.min(84, radius * 52));
    shock.blendMode = ParticleSystem.BLENDMODE_ADD;
    shock.color1 = new Color4(1.0, 0.64, 0.18, 0.9);
    shock.color2 = new Color4(1.0, 0.26, 0.12, 0.72);
    shock.colorDead = new Color4(0.16, 0.05, 0.03, 0);
    shock.minEmitPower = Math.max(2.0, radius * 3.2);
    shock.maxEmitPower = Math.max(4.6, radius * 5.4);
    shock.direction1 = new Vector3(-1, -0.04, -1);
    shock.direction2 = new Vector3(1, 0.46, 1);
    shock.gravity = new Vector3(0, -0.35, 0);
    shock.updateSpeed = 0.016;
    shock.disposeOnStop = true;
    shock.start();
    setTimeout(() => { if (!this.isDisposed) shock.stop(); }, 100);
  }

  private styleArtificerZoneMesh(mesh: Mesh): void {
    if (!(mesh.material instanceof StandardMaterial)) return;
    mesh.material.diffuseColor = new Color3(0.52, 0.08, 0.03);
    mesh.material.emissiveColor = new Color3(0.98, 0.22, 0.08);
    mesh.material.alpha = 0.46;
    mesh.material.needDepthPrePass = true;
  }

  private spawnOrRefreshAoeZone(
    position: Vector3,
    radius: number,
    dps: number,
    duration: number,
    sourceProjectileType?: string
  ): void {
    if (sourceProjectileType === 'artificer_main') {
      const mergeDistance = Math.max(0.55, radius * 0.78);
      const existing = this.activeAoeZones.find((z) =>
        z.sourceProjectileType === 'artificer_main' &&
        Vector3.Distance(z.position, position) <= mergeDistance
      );
      if (existing) {
        existing.position = Vector3.Lerp(existing.position, position, 0.42);
        existing.radius = Math.max(existing.radius, radius);
        existing.dps = Math.max(existing.dps, dps);
        existing.remaining = Math.max(existing.remaining, duration);
        existing.baseRemaining = Math.max(existing.baseRemaining ?? 0, duration);
        if (existing.mesh) {
          existing.mesh.position = this.toGroundPosition(existing.position);
        }
        return;
      }
    }

    const zoneId = this.nextAoeZoneId++;
    const zoneMesh = VisualPlaceholder.createAoEPlaceholder(this.scene, `aoe_${Date.now()}`, radius);
    zoneMesh.position = this.toGroundPosition(position);
    if (sourceProjectileType === 'artificer_main') {
      this.styleArtificerZoneMesh(zoneMesh);
    }
    this.activeAoeZones.push({
      id: zoneId,
      position: position.clone(),
      radius,
      dps,
      remaining: duration,
      baseRemaining: duration,
      visualPhase: Math.random() * Math.PI * 2,
      mesh: zoneMesh,
      sourceProjectileType,
    });
    if (sourceProjectileType === 'artificer_main') {
      this.eventBus.emit(GameEvents.ENEMY_ARTIFICIER_DOT_ZONE_STARTED, {
        zoneId,
        position: position.clone(),
      });
    }
  }

  private spawnArtificerExplosionFx(position: Vector3, radius: number): void {
    const emitter = new Vector3(position.x, this.aoeVisualY + 0.16, position.z);
    const particles = new ParticleSystem(`artificer_explosion_fx_${Date.now()}`, 320, this.scene);
    particles.particleTexture = this.getMageProjectileParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = emitter;
    particles.minSize = Math.max(0.07, radius * 0.09);
    particles.maxSize = Math.max(0.2, radius * 0.2);
    particles.minLifeTime = 0.13;
    particles.maxLifeTime = 0.42;
    particles.emitRate = 1600;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(1.0, 0.78, 0.24, 0.95);
    particles.color2 = new Color4(1.0, 0.34, 0.12, 0.9);
    particles.colorDead = new Color4(0.25, 0.06, 0.02, 0);
    particles.minEmitPower = Math.max(1.1, radius * 1.1);
    particles.maxEmitPower = Math.max(2.6, radius * 2.6);
    particles.direction1 = new Vector3(-1, 0.2, -1);
    particles.direction2 = new Vector3(1, 1.2, 1);
    particles.gravity = new Vector3(0, 0.3, 0);
    particles.updateSpeed = 0.016;
    particles.start();
    setTimeout(() => {
      if (this.isDisposed) return;
      particles.stop();
      setTimeout(() => { if (!this.isDisposed) particles.dispose(false); }, 420);
    }, 140);

    const rainbow = new ParticleSystem(`artificer_firework_fx_${Date.now()}`, 360, this.scene);
    rainbow.particleTexture = this.getHostileProjectileCoreTexture();
    rainbow.layerMask = SCENE_LAYER;
    rainbow.emitter = emitter;
    rainbow.minSize = Math.max(0.08, radius * 0.08);
    rainbow.maxSize = Math.max(0.24, radius * 0.2);
    rainbow.minLifeTime = 0.24;
    rainbow.maxLifeTime = 0.62;
    rainbow.emitRate = 0;
    rainbow.manualEmitCount = Math.round(180 + Math.min(340, radius * 190));
    rainbow.blendMode = ParticleSystem.BLENDMODE_ADD;
    rainbow.color1 = new Color4(0.25, 0.95, 1.0, 0.95);
    rainbow.color2 = new Color4(1.0, 0.24, 0.92, 0.9);
    rainbow.colorDead = new Color4(0.1, 0.1, 0.2, 0);
    rainbow.minEmitPower = Math.max(1.8, radius * 1.9);
    rainbow.maxEmitPower = Math.max(4.8, radius * 4.1);
    rainbow.direction1 = new Vector3(-1, -0.2, -1);
    rainbow.direction2 = new Vector3(1, 1.4, 1);
    rainbow.gravity = new Vector3(0, -0.38, 0);
    rainbow.minAngularSpeed = -Math.PI * 3;
    rainbow.maxAngularSpeed = Math.PI * 3;
    rainbow.updateSpeed = 0.016;
    rainbow.start();
    setTimeout(() => {
      if (this.isDisposed) return;
      rainbow.stop();
      setTimeout(() => { if (!this.isDisposed) rainbow.dispose(false); }, 620);
    }, 240);
  }

  private createArtificerSubProjectileTrail(emitter: Mesh): ParticleSystem {
    const trail = new ParticleSystem(`artificer_sub_trail_${Date.now()}`, 120, this.scene);
    trail.particleTexture = this.getHostileProjectileTrailTexture();
    trail.layerMask = SCENE_LAYER;
    trail.emitter = emitter;
    trail.minSize = 0.04;
    trail.maxSize = 0.12;
    trail.minLifeTime = 0.08;
    trail.maxLifeTime = 0.2;
    trail.emitRate = 520;
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    trail.color1 = new Color4(1.0, 0.72, 0.22, 0.9);
    trail.color2 = new Color4(1.0, 0.34, 0.1, 0.82);
    trail.colorDead = new Color4(0.22, 0.07, 0.03, 0);
    trail.minEmitPower = 0.3;
    trail.maxEmitPower = 0.95;
    trail.direction1 = new Vector3(-0.16, -0.04, -0.16);
    trail.direction2 = new Vector3(0.16, 0.08, 0.16);
    trail.updateSpeed = 0.016;
    trail.start();
    return trail;
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
      if (split.trail) {
        split.trail.stop();
        setTimeout(() => { if (!this.isDisposed) split.trail?.dispose(false); }, 220);
        split.trail = undefined;
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
    const frameBudgetMs = this.deferredMeshDisposalQueue.length > 24 ? 1.6 : 0.8;

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
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.unsubscriber) {
      this.unsubscriber();
      this.unsubscriber = null;
    }
    this.resetForRoomTransition();
    this.projectilePool.dispose((p) => p.dispose());
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
      if (split.trail) {
        try { split.trail.stop(); } catch {}
        try { split.trail.dispose(false); } catch {}
      }
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
    if (this.hostileProjectileTrailTexture) {
      this.hostileProjectileTrailTexture.dispose();
      this.hostileProjectileTrailTexture = null;
    }
    if (this.hostileProjectileCoreTexture) {
      this.hostileProjectileCoreTexture.dispose();
      this.hostileProjectileCoreTexture = null;
    }
    if (this.hostileImpactGlitchTexture) {
      this.hostileImpactGlitchTexture.dispose();
      this.hostileImpactGlitchTexture = null;
    }
    this.projectileParticleEffects.clear();
  }
}
