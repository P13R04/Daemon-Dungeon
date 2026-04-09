import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { EnemyController } from '../gameplay/EnemyController';
import { PlayerController } from '../gameplay/PlayerController';
import { ProjectileManager } from '../gameplay/ProjectileManager';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { SCENE_LAYER } from '../ui/uiLayers';

export class GameCombatActionManager {
  private tankUltimateZoneMesh: Mesh | null = null;
  private tankUltimateZoneMaterial: StandardMaterial | null = null;
  private tankUltimateZoneTime = 0;
  private tankUltimateVortexParticles: ParticleSystem | null = null;
  private tankUltimateVortexRadius = 0;
  private tankFxParticleTexture: DynamicTexture | null = null;
  private activeTankParticleEffects: Set<ParticleSystem> = new Set();
  private lastTankShieldBashVisualAt = 0;

  constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly projectileManager: ProjectileManager,
  ) {}

  dispose(): void {
    this.disposeTankUltimateZoneVisual();
    this.disposeTankFxParticleTexture();
    for (const effect of this.activeTankParticleEffects) {
      effect.stop();
      effect.dispose(false);
    }
    this.activeTankParticleEffects.clear();
  }

  resolveSecondaryBurst(
    burst: {
      position: Vector3;
      radius: number;
      baseDamage: number;
      damagePerEnemy: number;
      damagePerProjectile: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    let enemiesInZone = 0;
    for (const enemy of enemies) {
      if (Vector3.Distance(enemy.getPosition(), burst.position) <= burst.radius) {
        enemiesInZone++;
      }
    }

    const projectilesInZone = this.projectileManager.countHostileProjectilesInRadius(burst.position, burst.radius);
    this.projectileManager.destroyHostileProjectilesInRadius(burst.position, burst.radius);

    const burstDamage = burst.baseDamage + (enemiesInZone * burst.damagePerEnemy) + (projectilesInZone * burst.damagePerProjectile);

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const distance = Vector3.Distance(enemyPos, burst.position);
      if (distance > burst.radius) continue;

      enemy.takeDamage(burstDamage);

      const outward = enemyPos.subtract(burst.position);
      const force = outward.lengthSquared() > 0.0001
        ? outward.normalize().scale(burst.knockback)
        : new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().scale(burst.knockback);
      enemy.applyExternalKnockback(force);
    }

    const blast = VisualPlaceholder.createAoEPlaceholder(this.scene, `player_secondary_burst_${Date.now()}`, burst.radius);
    blast.position = burst.position.clone();
    setTimeout(() => blast.dispose(), 220);
  }

  resolveTankSweep(
    sweep: {
      origin: Vector3;
      direction: Vector3;
      swingDirection: 'left' | 'right';
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    const dir = sweep.direction.lengthSquared() > 0.0001 ? sweep.direction.normalize() : new Vector3(1, 0, 0);
    const maxAngle = (sweep.coneAngleDeg * Math.PI) / 180;

    this.spawnTankSweepVisual(sweep.origin, dir, sweep.range, sweep.coneAngleDeg, sweep.swingDirection);

    for (const enemy of enemies) {
      const toEnemy = enemy.getPosition().subtract(sweep.origin);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      if (distance <= 0.0001 || distance > sweep.range) continue;

      const dot = Vector3.Dot(dir, toEnemy.normalize());
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle > maxAngle * 0.5) continue;

      enemy.takeDamage(sweep.damage);
      enemy.applyExternalKnockback(toEnemy.normalize().scale(sweep.knockback));
    }
  }

  resolveTankShieldBash(
    bash: {
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
    },
    enemies: EnemyController[]
  ): void {
    const now = performance.now();
    if (bash.isFinisher || now - this.lastTankShieldBashVisualAt >= 55) {
      this.spawnTankShieldBashLaneVisual(bash.origin, bash.direction, bash.groupDistance, bash.groupWidth, bash.radius);
      this.spawnTankShieldBashSpeedParticles(bash.origin, bash.direction, bash.isFinisher, bash.groupDistance, bash.groupWidth);
      this.lastTankShieldBashVisualAt = now;
    }

    const forward = bash.direction.lengthSquared() > 0.0001
      ? bash.direction.normalize()
      : new Vector3(1, 0, 0);
    const gatherCenter = bash.origin.add(forward.scale(bash.groupDistance));
    const lateralAxis = new Vector3(forward.z, 0, -forward.x);
    if (lateralAxis.lengthSquared() > 0.0001) {
      lateralAxis.normalize();
    }
    const barDepth = Math.max(bash.radius * 1.6, bash.groupDistance + bash.radius * 1.1);
    const barHalfWidth = Math.max(bash.radius * 1.2, bash.groupWidth * 0.5);
    const rearReach = Math.max(0.55, bash.radius * 0.75);
    const stunDuration = Math.max(1.0, bash.stunDuration);

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const rel = enemyPos.subtract(bash.origin);
      rel.y = 0;
      const forwardDist = Vector3.Dot(rel, forward);
      const lateralDist = Math.abs(Vector3.Dot(rel, lateralAxis));
      const insideFrontBar = forwardDist >= -rearReach && forwardDist <= barDepth && lateralDist <= barHalfWidth;
      const nearGatherCenter = Vector3.Distance(enemyPos, gatherCenter) <= bash.radius * 1.25;
      if (!insideFrontBar && !nearGatherCenter) continue;

      if (bash.damage > 0) {
        enemy.takeDamage(bash.damage);
      }
      if (bash.isFinisher && bash.stunDuration > 0) {
        enemy.applyStun?.(stunDuration);
      }

      const relativeToGather = enemyPos.subtract(gatherCenter);
      relativeToGather.y = 0;
      const lateralOffset = Math.max(
        -bash.groupWidth * 0.5,
        Math.min(bash.groupWidth * 0.5, Vector3.Dot(relativeToGather, lateralAxis))
      );
      const targetInLane = gatherCenter.add(lateralAxis.scale(lateralOffset));
      const laneForwardTarget = targetInLane.add(forward.scale(Math.max(0.45, bash.forwardPush * 0.35)));
      const toLane = laneForwardTarget.subtract(enemyPos);
      toLane.y = 0;

      const carryBlend = Math.min(1, bash.isFinisher ? 0.7 : 0.82);
      const carriedPos = enemyPos.add(toLane.scale(carryBlend));
      carriedPos.y = enemyPos.y;
      enemy.setPosition(carriedPos);

      const pullForce = toLane.lengthSquared() > 0.0001 ? toLane.normalize().scale(bash.pullStrength) : Vector3.Zero();
      const shoveForce = forward.scale(bash.forwardPush + (bash.isFinisher ? bash.knockback : bash.knockback * 0.2));
      enemy.applyExternalKnockback(pullForce.add(shoveForce));
    }
  }

  resolveRogueStrike(
    strike: {
      origin: Vector3;
      direction: Vector3;
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    const dir = strike.direction.lengthSquared() > 0.0001 ? strike.direction.normalize() : new Vector3(1, 0, 0);
    const maxAngle = (strike.coneAngleDeg * Math.PI) / 180;
    let bestEnemy: EnemyController | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      const toEnemy = enemy.getPosition().subtract(strike.origin);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      if (distance <= 0.0001 || distance > strike.range) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dir, toEnemy.normalize()))));
      if (angle > maxAngle * 0.5) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnemy = enemy;
      }
    }

    if (!bestEnemy) return;
    bestEnemy.takeDamage(strike.damage);
    const forceDir = bestEnemy.getPosition().subtract(strike.origin);
    if (forceDir.lengthSquared() > 0.0001) {
      bestEnemy.applyExternalKnockback(forceDir.normalize().scale(strike.knockback));
    }
  }

  resolveRogueDashAttack(
    dash: {
      from: Vector3;
      to: Vector3;
      radius: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    const segment = dash.to.subtract(dash.from);
    const segmentLenSq = Math.max(0.0001, segment.lengthSquared());

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const toEnemy = enemyPos.subtract(dash.from);
      const t = Math.max(0, Math.min(1, Vector3.Dot(toEnemy, segment) / segmentLenSq));
      const closestPoint = dash.from.add(segment.scale(t));
      const distanceToPath = Vector3.Distance(enemyPos, closestPoint);
      if (distanceToPath > dash.radius) continue;

      enemy.takeDamage(dash.damage);
      const forceDir = enemyPos.subtract(closestPoint);
      if (forceDir.lengthSquared() > 0.0001) {
        enemy.applyExternalKnockback(forceDir.normalize().scale(dash.knockback));
      }
    }
  }

  ensureTankUltimateZoneVisual(radius: number): void {
    this.disposeTankUltimateZoneVisual();

    const visualRadius = Math.max(0.8, radius * 0.9);
    const zone = MeshBuilder.CreateDisc(`tank_ult_zone_${Date.now()}`, {
      radius: visualRadius,
      tessellation: 48,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    zone.position.y = 1.035;
    zone.rotation.x = Math.PI / 2;

    const mat = new StandardMaterial(`tank_ult_zone_mat_${Date.now()}`, this.scene);
    mat.diffuseColor = new Color3(0.95, 0.66, 0.22);
    mat.emissiveColor = new Color3(0.78, 0.32, 0.06);
    mat.alpha = 0.24;
    mat.backFaceCulling = false;
    zone.material = mat;

    this.tankUltimateZoneMesh = zone;
    this.tankUltimateZoneMaterial = mat;
    this.tankUltimateZoneTime = 0;
    this.tankUltimateVortexRadius = visualRadius;
    this.startTankUltimateVortexParticles();
  }

  updateTankUltimateZoneVisual(deltaTime: number): void {
    if (!this.tankUltimateZoneMesh || !this.tankUltimateZoneMaterial) return;

    const center = this.playerController.getPosition();
    this.tankUltimateZoneMesh.position.x = center.x;
    this.tankUltimateZoneMesh.position.z = center.z;

    this.tankUltimateZoneTime += deltaTime;
    const pulse = 1 + (0.08 * Math.sin(this.tankUltimateZoneTime * 10));
    this.tankUltimateZoneMesh.scaling.x = pulse;
    this.tankUltimateZoneMesh.scaling.y = pulse;
    this.tankUltimateZoneMesh.scaling.z = 1;
    this.tankUltimateZoneMaterial.alpha = 0.2 + (0.08 * (0.5 + 0.5 * Math.sin(this.tankUltimateZoneTime * 12)));

    if (this.tankUltimateVortexParticles) {
      this.tankUltimateVortexParticles.emitter = center.add(new Vector3(0, 0.1, 0));
    }
  }

  disposeTankUltimateZoneVisual(): void {
    this.disposeTankUltimateVortexParticles();
    if (this.tankUltimateZoneMesh) {
      this.tankUltimateZoneMesh.dispose();
      this.tankUltimateZoneMesh = null;
    }
    if (this.tankUltimateZoneMaterial) {
      this.tankUltimateZoneMaterial.dispose();
      this.tankUltimateZoneMaterial = null;
    }
    this.tankUltimateZoneTime = 0;
    this.tankUltimateVortexRadius = 0;
  }

  private spawnTankSweepVisual(
    origin: Vector3,
    direction: Vector3,
    range: number,
    coneAngleDeg: number,
    swingDirection: 'left' | 'right'
  ): void {
    const dir = new Vector3(direction.x, 0, direction.z);
    if (dir.lengthSquared() <= 0.0001) {
      dir.set(1, 0, 0);
    } else {
      dir.normalize();
    }

    const outerRadius = Math.max(0.52, range * 0.78);
    const innerRadius = Math.max(0.09, outerRadius * 0.26);
    const span = (Math.max(24, Math.min(108, coneAngleDeg * 0.8)) * Math.PI) / 180;
    const segments = 34;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = -span * 0.5 + (span * t);
      const ox = Math.sin(angle);
      const oz = Math.cos(angle);

      positions.push(ox * innerRadius, 0, oz * innerRadius);
      uvs.push(t, 1);
      positions.push(ox * outerRadius, 0, oz * outerRadius);
      uvs.push(t, 0);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const normals = new Array(positions.length).fill(0);
    VertexData.ComputeNormals(positions, indices, normals);
    const sweep = new Mesh(`tank_sweep_${Date.now()}`, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.applyToMesh(sweep);
    sweep.position = origin.add(dir.scale(Math.max(0.015, outerRadius * 0.02))).add(new Vector3(0, 0.03, 0));

    const mat = new StandardMaterial(`tank_sweep_mat_${Date.now()}`, this.scene);
    mat.diffuseColor = new Color3(0.98, 0.73, 0.26);
    mat.emissiveColor = new Color3(0.86, 0.42, 0.08);
    mat.specularColor = new Color3(0.18, 0.12, 0.03);
    mat.alpha = 0.5;
    mat.backFaceCulling = false;
    sweep.material = mat;

    this.spawnTankSweepTrailParticles(origin, dir, swingDirection === 'left' ? 1 : -1, innerRadius, outerRadius, span);

    const baseYaw = Math.atan2(dir.x, dir.z);
    const startOffset = swingDirection === 'left' ? 0.11 : -0.11;
    const endOffset = -startOffset;
    sweep.rotation.y = baseYaw + startOffset;

    const startTime = performance.now();
    const ttlMs = 165;
    const tick = window.setInterval(() => {
      if (sweep.isDisposed()) {
        window.clearInterval(tick);
        return;
      }

      const t = Math.min(1, (performance.now() - startTime) / ttlMs);
      sweep.rotation.y = baseYaw + startOffset + ((endOffset - startOffset) * t);
      const arcStretch = 1 + (0.04 * t);
      sweep.scaling.x = arcStretch;
      sweep.scaling.z = 1 + (0.06 * t);
      mat.alpha = Math.max(0, 0.5 * (1 - t));

      if (t >= 1) {
        window.clearInterval(tick);
        sweep.dispose();
        mat.dispose();
      }
    }, 16);
  }

  private getTankFxParticleTexture(): DynamicTexture {
    if (this.tankFxParticleTexture) {
      return this.tankFxParticleTexture;
    }

    const texture = new DynamicTexture('tank_fx_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(96,214,255,0.95)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.tankFxParticleTexture = texture;
    return texture;
  }

  private disposeTankFxParticleTexture(): void {
    if (this.tankFxParticleTexture) {
      this.tankFxParticleTexture.dispose();
      this.tankFxParticleTexture = null;
    }
  }

  private spawnTankSweepTrailParticles(
    origin: Vector3,
    direction: Vector3,
    sweepSign: number,
    innerRadius: number,
    outerRadius: number,
    span: number,
  ): void {
    const center = origin.add(direction.scale(Math.max(0.03, outerRadius * 0.03))).add(new Vector3(0, 0.1, 0));
    const particles = new ParticleSystem(`tank_sweep_fx_${Date.now()}`, 220, this.scene);
    particles.particleTexture = this.getTankFxParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = center;
    particles.minSize = 0.06;
    particles.maxSize = 0.16;
    particles.minLifeTime = 0.14;
    particles.maxLifeTime = 0.32;
    particles.emitRate = 1250;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.gravity = new Vector3(0, 0, 0);
    particles.minEmitPower = 1.0;
    particles.maxEmitPower = 2.1;
    particles.updateSpeed = 0.016;
    particles.color1 = new Color4(0.5, 0.82, 1.0, 0.9);
    particles.color2 = new Color4(0.16, 0.48, 1.0, 0.75);
    particles.colorDead = new Color4(0.08, 0.16, 0.4, 0);

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const t = Math.random();
      const angle = (-span * 0.5) + (span * t);
      const radius = innerRadius + ((outerRadius - innerRadius) * (0.5 + (0.5 * Math.random())));
      const localX = Math.sin(angle) * radius;
      const localZ = Math.cos(angle) * radius;
      const worldX = (direction.x * localZ) - (direction.z * localX);
      const worldZ = (direction.z * localZ) + (direction.x * localX);
      positionToUpdate.x = center.x + worldX;
      positionToUpdate.y = center.y + ((Math.random() - 0.5) * 0.05);
      positionToUpdate.z = center.z + worldZ;
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      particle,
      _isLocal,
    ) => {
      const toParticle = new Vector3(
        particle.position.x - center.x,
        0,
        particle.position.z - center.z,
      );
      if (toParticle.lengthSquared() <= 0.0001) {
        toParticle.set(direction.x, 0, direction.z);
      }
      toParticle.normalize();
      const tangent = new Vector3(-toParticle.z * sweepSign, 0, toParticle.x * sweepSign).normalize();
      directionToUpdate.x = tangent.x * (1.8 + (Math.random() * 0.8));
      directionToUpdate.y = 0.25 + (Math.random() * 0.35);
      directionToUpdate.z = tangent.z * (1.8 + (Math.random() * 0.8));
    };

    particles.start();
    this.activeTankParticleEffects.add(particles);
    window.setTimeout(() => {
      particles.stop();
      window.setTimeout(() => particles.dispose(false), 520);
      this.activeTankParticleEffects.delete(particles);
    }, 150);
  }

  private spawnTankShieldBashSpeedParticles(
    origin: Vector3,
    direction: Vector3,
    isFinisher: boolean,
    zoneDistance: number,
    zoneWidth: number,
  ): void {
    const dir = direction.lengthSquared() > 0.0001 ? direction.normalize() : new Vector3(1, 0, 0);
    const side = new Vector3(dir.z, 0, -dir.x);

    const rearEmitterPos = origin.add(dir.scale(-0.16)).add(new Vector3(0, 0.08, 0));
    const trailParticles = new ParticleSystem(`tank_bash_trail_fx_${Date.now()}`, 260, this.scene);
    trailParticles.particleTexture = this.getTankFxParticleTexture();
    trailParticles.layerMask = SCENE_LAYER;
    trailParticles.emitter = rearEmitterPos;
    trailParticles.minEmitBox = new Vector3(-0.16, -0.03, -0.16);
    trailParticles.maxEmitBox = new Vector3(0.16, 0.03, 0.16);
    trailParticles.minSize = 0.07;
    trailParticles.maxSize = isFinisher ? 0.25 : 0.19;
    trailParticles.minLifeTime = 0.11;
    trailParticles.maxLifeTime = isFinisher ? 0.33 : 0.24;
    trailParticles.emitRate = isFinisher ? 1650 : 1150;
    trailParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
    trailParticles.color1 = new Color4(1.0, 0.92, 0.68, 0.95);
    trailParticles.color2 = new Color4(1.0, 0.43, 0.08, 0.88);
    trailParticles.colorDead = new Color4(0.22, 0.06, 0.0, 0);
    trailParticles.gravity = new Vector3(0, 0, 0);
    trailParticles.updateSpeed = 0.016;
    const reverseDir = dir.scale(-1);
    trailParticles.direction1 = reverseDir.scale(3.6).add(side.scale(-0.8));
    trailParticles.direction2 = reverseDir.scale(6.1).add(side.scale(0.8));
    trailParticles.minEmitPower = isFinisher ? 2.2 : 1.4;
    trailParticles.maxEmitPower = isFinisher ? 4.6 : 2.7;

    const frontEmitterPos = origin.add(dir.scale(Math.max(0.5, zoneDistance * 0.8))).add(new Vector3(0, 0.09, 0));
    const frontParticles = new ParticleSystem(`tank_bash_front_fx_${Date.now()}`, 180, this.scene);
    frontParticles.particleTexture = this.getTankFxParticleTexture();
    frontParticles.layerMask = SCENE_LAYER;
    frontParticles.emitter = frontEmitterPos;
    const halfWidth = Math.max(0.14, zoneWidth * 0.32);
    frontParticles.minEmitBox = new Vector3(-halfWidth, -0.03, -halfWidth * 0.7);
    frontParticles.maxEmitBox = new Vector3(halfWidth, 0.03, halfWidth * 0.7);
    frontParticles.minSize = 0.05;
    frontParticles.maxSize = isFinisher ? 0.18 : 0.13;
    frontParticles.minLifeTime = 0.1;
    frontParticles.maxLifeTime = isFinisher ? 0.24 : 0.18;
    frontParticles.emitRate = isFinisher ? 760 : 520;
    frontParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
    frontParticles.color1 = new Color4(0.62, 0.9, 1.0, 0.92);
    frontParticles.color2 = new Color4(0.22, 0.56, 1.0, 0.78);
    frontParticles.colorDead = new Color4(0.08, 0.18, 0.4, 0);
    frontParticles.gravity = new Vector3(0, 0, 0);
    frontParticles.updateSpeed = 0.016;
    frontParticles.direction1 = dir.scale(1.5).add(side.scale(-0.45));
    frontParticles.direction2 = dir.scale(2.6).add(side.scale(0.45));
    frontParticles.minEmitPower = isFinisher ? 0.95 : 0.65;
    frontParticles.maxEmitPower = isFinisher ? 1.9 : 1.25;

    trailParticles.start();
    frontParticles.start();
    this.activeTankParticleEffects.add(trailParticles);
    this.activeTankParticleEffects.add(frontParticles);
    window.setTimeout(() => {
      trailParticles.stop();
      frontParticles.stop();
      window.setTimeout(() => {
        trailParticles.dispose(false);
        frontParticles.dispose(false);
      }, 520);
      this.activeTankParticleEffects.delete(trailParticles);
      this.activeTankParticleEffects.delete(frontParticles);
    }, isFinisher ? 180 : 120);
  }

  private spawnTankShieldBashLaneVisual(
    origin: Vector3,
    direction: Vector3,
    groupDistance: number,
    groupWidth: number,
    radius: number
  ): void {
    const dir = new Vector3(direction.x, 0, direction.z);
    if (dir.lengthSquared() <= 0.0001) {
      dir.set(1, 0, 0);
    } else {
      dir.normalize();
    }

    const slashRadius = Math.max(radius * 0.9, (groupWidth * 0.55) + 0.28);
    const center = origin.add(dir.scale(Math.max(0.5, groupDistance * 0.55)));
    const lane = MeshBuilder.CreateDisc(`tank_bash_lane_${Date.now()}`, {
      radius: slashRadius,
      tessellation: 32,
      arc: 0.42,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    lane.position = center.add(new Vector3(0, 0.04, 0));
    lane.rotation.x = Math.PI / 2;
    lane.rotation.y = Math.atan2(dir.x, dir.z);
    lane.scaling.x = 1.08;
    lane.scaling.y = 0.58;

    const mat = new StandardMaterial(`tank_bash_lane_mat_${Date.now()}`, this.scene);
    mat.diffuseColor = new Color3(0.95, 0.66, 0.22);
    mat.emissiveColor = new Color3(0.78, 0.32, 0.06);
    mat.alpha = 0.32;
    mat.backFaceCulling = false;
    lane.material = mat;

    const start = performance.now();
    const ttlMs = 72;
    const tick = window.setInterval(() => {
      if (lane.isDisposed()) {
        window.clearInterval(tick);
        return;
      }

      const t = Math.min(1, (performance.now() - start) / ttlMs);
      lane.scaling.x = 1.08 + (0.08 * t);
      lane.scaling.y = 0.58 + (0.04 * t);
      mat.alpha = Math.max(0, 0.32 * (1 - t));

      if (t >= 1) {
        window.clearInterval(tick);
        lane.dispose();
        mat.dispose();
      }
    }, 16);
  }

  private startTankUltimateVortexParticles(): void {
    this.disposeTankUltimateVortexParticles();

    const particles = new ParticleSystem(`tank_ult_vortex_fx_${Date.now()}`, 1400, this.scene);
    particles.particleTexture = this.getTankFxParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.playerController.getPosition().add(new Vector3(0, 0.1, 0));
    particles.minSize = 0.09;
    particles.maxSize = 0.24;
    particles.minLifeTime = 0.28;
    particles.maxLifeTime = 0.72;
    particles.emitRate = 1550;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.6, 0.9, 1.0, 0.95);
    particles.color2 = new Color4(0.16, 0.5, 1.0, 0.82);
    particles.colorDead = new Color4(0.06, 0.15, 0.44, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.updateSpeed = 0.016;
    particles.minEmitPower = 2.1;
    particles.maxEmitPower = 4.1;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const center = this.playerController.getPosition();
      const angle = Math.random() * Math.PI * 2;
      const ringRadius = this.tankUltimateVortexRadius * (0.28 + (Math.random() * 0.72));
      positionToUpdate.x = center.x + Math.cos(angle) * ringRadius;
      positionToUpdate.y = center.y + 0.04 + (Math.random() * 0.22);
      positionToUpdate.z = center.z + Math.sin(angle) * ringRadius;
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      particle,
      _isLocal,
    ) => {
      const center = this.playerController.getPosition();
      const radial = new Vector3(particle.position.x - center.x, 0, particle.position.z - center.z);
      if (radial.lengthSquared() <= 0.0001) {
        radial.set(1, 0, 0);
      }
      radial.normalize();
      const tangent = new Vector3(-radial.z, 0, radial.x).normalize();
      const swirlSpeed = 2.2 + (Math.random() * 1.8);
      directionToUpdate.x = tangent.x * swirlSpeed;
      directionToUpdate.y = 0.28 + (Math.random() * 0.26);
      directionToUpdate.z = tangent.z * swirlSpeed;
    };

    particles.start();
    this.tankUltimateVortexParticles = particles;
    this.activeTankParticleEffects.add(particles);
  }

  private disposeTankUltimateVortexParticles(): void {
    if (!this.tankUltimateVortexParticles) return;
    this.tankUltimateVortexParticles.stop();
    this.tankUltimateVortexParticles.dispose(false);
    this.activeTankParticleEffects.delete(this.tankUltimateVortexParticles);
    this.tankUltimateVortexParticles = null;
  }
}
