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
  private mageFxParticleTexture: DynamicTexture | null = null;
  private rogueFxParticleTexture: DynamicTexture | null = null;
  private activeTankParticleEffects: Set<ParticleSystem> = new Set();
  private lastTankShieldBashVisualAt = 0;
  private rogueUltimateZoneMesh: Mesh | null = null;
  private rogueUltimateZoneMaterial: StandardMaterial | null = null;
  private rogueUltimateZoneTime = 0;
  private rogueUltimateGlitchParticles: ParticleSystem | null = null;
  private rogueUltimateZoneRadius = 0;

  constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly projectileManager: ProjectileManager,
  ) {}

  dispose(): void {
    this.disposeTankUltimateZoneVisual();
    this.disposeRogueUltimateVisual();
    this.disposeTankFxParticleTexture();
    this.disposeMageFxParticleTexture();
    this.disposeRogueFxParticleTexture();
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
    this.spawnMageSecondaryBurstVisual(burst.position, burst.radius);

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
      this.playerController.onPlayerDealtDamage(burstDamage);

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

  resolveMageReactiveBurst(
    burst: {
      position: Vector3;
      radius: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.spawnMageReactiveBurstVisual(burst.position, burst.radius);

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const distance = Vector3.Distance(enemyPos, burst.position);
      if (distance > burst.radius) continue;

      enemy.takeDamage(burst.damage);
      this.playerController.onPlayerDealtDamage(burst.damage);

      const outward = enemyPos.subtract(burst.position);
      const force = outward.lengthSquared() > 0.0001
        ? outward.normalize().scale(burst.knockback)
        : new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().scale(burst.knockback);
      enemy.applyExternalKnockback(force);
    }

    const blast = VisualPlaceholder.createAoEPlaceholder(this.scene, `player_reactive_burst_${Date.now()}`, burst.radius);
    blast.position = burst.position.clone();
    setTimeout(() => blast.dispose(), 180);
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
      this.playerController.onPlayerDealtDamage(sweep.damage);
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
        this.playerController.onPlayerDealtDamage(bash.damage);
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
    const lateral = new Vector3(dir.z, 0, -dir.x).normalize();
    const laneHalfWidth = Math.max(0.2, Math.min(0.58, (strike.range * 0.18) + (strike.coneAngleDeg * 0.002)));
    this.spawnRoguePrimaryRangeVisual(strike.origin, dir, strike.range, laneHalfWidth);
    let bestEnemy: EnemyController | null = null;
    let bestForwardDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      const rel = enemy.getPosition().subtract(strike.origin);
      rel.y = 0;
      const forwardDistance = Vector3.Dot(rel, dir);
      if (forwardDistance <= 0.05 || forwardDistance > strike.range) continue;
      const lateralDistance = Math.abs(Vector3.Dot(rel, lateral));
      if (lateralDistance > laneHalfWidth) continue;
      if (forwardDistance < bestForwardDistance) {
        bestForwardDistance = forwardDistance;
        bestEnemy = enemy;
      }
    }

    if (!bestEnemy) return;
    bestEnemy.takeDamage(strike.damage);
    this.playerController.onPlayerDealtDamage(strike.damage);
    this.applyRogueChainFromPrimaryHit(bestEnemy, strike.damage, enemies);
    const forceDir = bestEnemy.getPosition().subtract(strike.origin);
    if (forceDir.lengthSquared() > 0.0001) {
      bestEnemy.applyExternalKnockback(forceDir.normalize().scale(strike.knockback));
    }
  }

  resolveRogueDashTrailSegment(segment: {
    from: Vector3;
    to: Vector3;
    radius: number;
  }): void {
    this.spawnRogueDashTrailVisual(segment.from, segment.to, segment.radius);
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
      this.playerController.onPlayerDealtDamage(dash.damage);
      this.applyRogueChainFromPrimaryHit(enemy, dash.damage, enemies);
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

  startRogueUltimateVisual(radius: number): void {
    this.disposeRogueUltimateVisual();

    const visualRadius = Math.max(0.9, radius * 0.92);
    const zone = MeshBuilder.CreateDisc(`rogue_ult_zone_${Date.now()}`, {
      radius: visualRadius,
      tessellation: 52,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    zone.position.y = 1.028;
    zone.rotation.x = Math.PI / 2;

    const mat = new StandardMaterial(`rogue_ult_zone_mat_${Date.now()}`, this.scene);
    mat.diffuseColor = new Color3(0.1, 0.96, 0.6);
    mat.emissiveColor = new Color3(0.1, 0.74, 0.42);
    mat.alpha = 0.065;
    mat.backFaceCulling = false;
    zone.material = mat;

    this.rogueUltimateZoneMesh = zone;
    this.rogueUltimateZoneMaterial = mat;
    this.rogueUltimateZoneTime = 0;
    this.rogueUltimateZoneRadius = visualRadius;
    this.startRogueUltimateGlitchParticles();
  }

  updateRogueUltimateVisual(deltaTime: number): void {
    if (!this.rogueUltimateZoneMesh || !this.rogueUltimateZoneMaterial) return;

    const center = this.playerController.getPosition();
    this.rogueUltimateZoneMesh.position.x = center.x;
    this.rogueUltimateZoneMesh.position.z = center.z;

    this.rogueUltimateZoneTime += deltaTime;
    const pulse = 1 + (0.012 * Math.sin(this.rogueUltimateZoneTime * 4.2));
    this.rogueUltimateZoneMesh.scaling.x = pulse;
    this.rogueUltimateZoneMesh.scaling.y = pulse;
    this.rogueUltimateZoneMesh.scaling.z = 1;
    this.rogueUltimateZoneMaterial.alpha = 0.045 + (0.012 * (0.5 + 0.5 * Math.sin(this.rogueUltimateZoneTime * 5.2)));

    if (this.rogueUltimateGlitchParticles) {
      this.rogueUltimateGlitchParticles.emitter = center.add(new Vector3(0, 0.08, 0));
    }
  }

  notifyRogueUltimateTeleport(from: Vector3, to: Vector3, target: Vector3): void {
    this.spawnRogueUltimateTeleportTrail(from, to, target);
  }

  disposeRogueUltimateVisual(): void {
    this.disposeRogueUltimateGlitchParticles();
    if (this.rogueUltimateZoneMesh) {
      this.rogueUltimateZoneMesh.dispose();
      this.rogueUltimateZoneMesh = null;
    }
    if (this.rogueUltimateZoneMaterial) {
      this.rogueUltimateZoneMaterial.dispose();
      this.rogueUltimateZoneMaterial = null;
    }
    this.rogueUltimateZoneTime = 0;
    this.rogueUltimateZoneRadius = 0;
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

  private applyRogueChainFromPrimaryHit(
    primaryTarget: EnemyController,
    primaryDamage: number,
    enemies: EnemyController[]
  ): void {
    const chain = this.playerController.getRogueChainConfig();
    if (!chain) return;

    const sourcePos = primaryTarget.getPosition();
    const chainDamage = primaryDamage * chain.damageRatio;
    if (!Number.isFinite(chainDamage) || chainDamage <= 0) return;

    let hits = 0;
    for (const enemy of enemies) {
      if (enemy.getId() === primaryTarget.getId()) continue;
      if (Vector3.Distance(sourcePos, enemy.getPosition()) > chain.radius) continue;

      enemy.takeDamage(chainDamage);
      this.playerController.onPlayerDealtDamage(chainDamage);
      hits++;
      if (hits >= chain.maxTargets) break;
    }
  }

  private spawnMageSecondaryBurstVisual(position: Vector3, radius: number): void {
    const center = position.add(new Vector3(0, 0.08, 0));
    const shockwave = MeshBuilder.CreateDisc(`mage_secondary_shockwave_${Date.now()}`, {
      radius: Math.max(0.45, radius * 0.62),
      tessellation: 42,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    shockwave.position = center;
    shockwave.rotation.x = Math.PI / 2;

    const waveMat = new StandardMaterial(`mage_secondary_shockwave_mat_${Date.now()}`, this.scene);
    waveMat.diffuseColor = new Color3(0.34, 0.84, 1.0);
    waveMat.emissiveColor = new Color3(0.45, 0.25, 0.95);
    waveMat.alpha = 0.45;
    waveMat.backFaceCulling = false;
    shockwave.material = waveMat;

    const waveStart = performance.now();
    const waveTtl = 200;
    const waveTick = window.setInterval(() => {
      if (shockwave.isDisposed()) {
        window.clearInterval(waveTick);
        return;
      }
      const t = Math.min(1, (performance.now() - waveStart) / waveTtl);
      const scale = 0.6 + (0.75 * t);
      shockwave.scaling.x = scale;
      shockwave.scaling.y = scale;
      shockwave.scaling.z = 1;
      waveMat.alpha = Math.max(0, 0.45 * (1 - t));
      if (t >= 1) {
        window.clearInterval(waveTick);
        shockwave.dispose();
        waveMat.dispose();
      }
    }, 16);

    const particles = new ParticleSystem(`mage_secondary_burst_fx_${Date.now()}`, 460, this.scene);
    particles.particleTexture = this.getMageFxParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = center;
    particles.minEmitBox = new Vector3(-0.16, -0.03, -0.16);
    particles.maxEmitBox = new Vector3(0.16, 0.04, 0.16);
    particles.minSize = 0.07;
    particles.maxSize = 0.22;
    particles.minLifeTime = 0.18;
    particles.maxLifeTime = 0.34;
    particles.emitRate = 1650;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.58, 0.92, 1.0, 0.95);
    particles.color2 = new Color4(0.64, 0.33, 1.0, 0.82);
    particles.colorDead = new Color4(0.09, 0.18, 0.44, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.updateSpeed = 0.016;
    particles.minEmitPower = 1.4;
    particles.maxEmitPower = 3.4;

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      directionToUpdate.x = radial.x * (2.4 + (Math.random() * 2.8));
      directionToUpdate.y = 0.25 + (Math.random() * 0.45);
      directionToUpdate.z = radial.z * (2.4 + (Math.random() * 2.8));
    };

    particles.start();
    this.activeTankParticleEffects.add(particles);
    window.setTimeout(() => {
      particles.stop();
      window.setTimeout(() => particles.dispose(false), 520);
      this.activeTankParticleEffects.delete(particles);
    }, 120);
  }

  private spawnMageReactiveBurstVisual(position: Vector3, radius: number): void {
    const center = position.add(new Vector3(0, 0.06, 0));
    const particles = new ParticleSystem(`mage_reactive_burst_fx_${Date.now()}`, 220, this.scene);
    particles.particleTexture = this.getMageFxParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = center;
    particles.minSize = 0.05;
    particles.maxSize = 0.16;
    particles.minLifeTime = 0.12;
    particles.maxLifeTime = 0.28;
    particles.emitRate = 900;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.55, 0.9, 1.0, 0.86);
    particles.color2 = new Color4(0.45, 0.3, 1.0, 0.72);
    particles.colorDead = new Color4(0.08, 0.16, 0.4, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.updateSpeed = 0.016;
    particles.minEmitPower = 0.9;
    particles.maxEmitPower = 1.9;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.max(0.3, radius * 0.35);
      positionToUpdate.x = center.x + (Math.cos(angle) * r);
      positionToUpdate.y = center.y + ((Math.random() - 0.5) * 0.06);
      positionToUpdate.z = center.z + (Math.sin(angle) * r);
    };

    particles.start();
    this.activeTankParticleEffects.add(particles);
    window.setTimeout(() => {
      particles.stop();
      window.setTimeout(() => particles.dispose(false), 400);
      this.activeTankParticleEffects.delete(particles);
    }, 90);
  }

  private spawnRoguePrimaryRangeVisual(origin: Vector3, direction: Vector3, range: number, laneHalfWidth: number): void {
    const dir = direction.lengthSquared() > 0.0001 ? direction.normalize() : new Vector3(1, 0, 0);
    const lateralAxis = new Vector3(dir.z, 0, -dir.x).normalize();
    const laneLength = Math.max(0.7, range * 0.95);
    const laneWidth = Math.max(0.28, laneHalfWidth * 2.15);

    const lane = MeshBuilder.CreatePlane(`rogue_primary_lane_${Date.now()}`, {
      width: laneWidth,
      height: laneLength,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    lane.position = origin.add(dir.scale((laneLength * 0.5) + 0.06)).add(new Vector3(0, 0.04, 0));
    lane.rotation.x = Math.PI / 2;
    lane.rotation.y = Math.atan2(dir.x, dir.z);

    const laneMat = new StandardMaterial(`rogue_primary_lane_mat_${Date.now()}`, this.scene);
    laneMat.diffuseColor = new Color3(0.2, 0.98, 0.58);
    laneMat.emissiveColor = new Color3(0.1, 0.48, 0.25);
    laneMat.alpha = 0.2;
    laneMat.backFaceCulling = false;
    lane.material = laneMat;

    const tip = MeshBuilder.CreateDisc(`rogue_primary_tip_${Date.now()}`, {
      radius: Math.max(0.14, laneHalfWidth * 0.85),
      tessellation: 26,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    tip.position = origin.add(dir.scale(laneLength + 0.05)).add(new Vector3(0, 0.045, 0));
    tip.rotation.x = Math.PI / 2;
    const tipMat = new StandardMaterial(`rogue_primary_tip_mat_${Date.now()}`, this.scene);
    tipMat.diffuseColor = new Color3(0.32, 1.0, 0.68);
    tipMat.emissiveColor = new Color3(0.14, 0.66, 0.34);
    tipMat.alpha = 0.28;
    tipMat.backFaceCulling = false;
    tip.material = tipMat;

    const fx = new ParticleSystem(`rogue_primary_fx_${Date.now()}`, 210, this.scene);
    fx.particleTexture = this.getRogueFxParticleTexture();
    fx.layerMask = SCENE_LAYER;
    fx.emitter = origin.add(new Vector3(0, 0.1, 0));
    fx.minSize = 0.035;
    fx.maxSize = 0.12;
    fx.minLifeTime = 0.08;
    fx.maxLifeTime = 0.18;
    fx.emitRate = 980;
    fx.blendMode = ParticleSystem.BLENDMODE_ADD;
    fx.color1 = new Color4(0.24, 1.0, 0.62, 0.78);
    fx.color2 = new Color4(0.1, 0.82, 0.34, 0.6);
    fx.colorDead = new Color4(0.03, 0.2, 0.08, 0);
    fx.gravity = new Vector3(0, 0, 0);
    fx.minEmitPower = 0.75;
    fx.maxEmitPower = 1.7;
    fx.updateSpeed = 0.016;

    fx.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const forward = 0.08 + (Math.random() * laneLength);
      const lateral = (Math.random() - 0.5) * laneWidth * 0.8;
      const forwardOffset = dir.scale(forward);
      const lateralOffset = lateralAxis.scale(lateral);
      positionToUpdate.x = origin.x + forwardOffset.x + lateralOffset.x;
      positionToUpdate.y = origin.y + 0.09 + ((Math.random() - 0.5) * 0.05);
      positionToUpdate.z = origin.z + forwardOffset.z + lateralOffset.z;
    };

    fx.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const forwardSpeed = 0.75 + (Math.random() * 1.15);
      directionToUpdate.x = dir.x * forwardSpeed;
      directionToUpdate.y = 0.05 + (Math.random() * 0.12);
      directionToUpdate.z = dir.z * forwardSpeed;
    };

    fx.start();
    this.activeTankParticleEffects.add(fx);

    const start = performance.now();
    const ttlMs = 120;
    const tick = window.setInterval(() => {
      if (lane.isDisposed() || tip.isDisposed()) {
        window.clearInterval(tick);
        return;
      }

      const t = Math.min(1, (performance.now() - start) / ttlMs);
      lane.scaling.y = 1 + (0.08 * t);
      laneMat.alpha = Math.max(0, 0.2 * (1 - t));
      tip.scaling.x = 1 + (0.15 * t);
      tip.scaling.y = 1 + (0.15 * t);
      tipMat.alpha = Math.max(0, 0.28 * (1 - t));

      if (t >= 1) {
        window.clearInterval(tick);
        lane.dispose();
        laneMat.dispose();
        tip.dispose();
        tipMat.dispose();
      }
    }, 16);

    window.setTimeout(() => {
      fx.stop();
      window.setTimeout(() => fx.dispose(false), 340);
      this.activeTankParticleEffects.delete(fx);
    }, 95);
  }

  private spawnRogueDashTrailVisual(from: Vector3, to: Vector3, radius: number): void {
    const path = [from.add(new Vector3(0, 0.09, 0)), to.add(new Vector3(0, 0.09, 0))];
    const trail = MeshBuilder.CreateTube(`rogue_dash_trail_${Date.now()}`, {
      path,
      radius: Math.max(0.04, radius * 0.08),
      tessellation: 8,
      updatable: false,
    }, this.scene);

    const mat = new StandardMaterial(`rogue_dash_trail_mat_${Date.now()}`, this.scene);
    mat.diffuseColor = new Color3(0.18, 0.96, 0.58);
    mat.emissiveColor = new Color3(0.08, 0.55, 0.24);
    mat.alpha = 0.58;
    mat.backFaceCulling = false;
    trail.material = mat;

    const segment = to.subtract(from);
    const segmentLength = Math.max(0.05, segment.length());
    const dir = segment.normalize();
    const side = new Vector3(dir.z, 0, -dir.x);

    const particles = new ParticleSystem(`rogue_dash_fx_${Date.now()}`, 240, this.scene);
    particles.particleTexture = this.getRogueFxParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = from.add(new Vector3(0, 0.1, 0));
    particles.minSize = 0.04;
    particles.maxSize = 0.13;
    particles.minLifeTime = 0.09;
    particles.maxLifeTime = 0.22;
    particles.emitRate = 1200;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.24, 1.0, 0.63, 0.95);
    particles.color2 = new Color4(0.09, 0.75, 0.34, 0.78);
    particles.colorDead = new Color4(0.02, 0.17, 0.08, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.minEmitPower = 0.4;
    particles.maxEmitPower = 1.15;
    particles.updateSpeed = 0.016;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const t = Math.random();
      const along = segment.scale(t);
      const jitter = side.scale((Math.random() - 0.5) * Math.max(0.06, radius * 0.35));
      positionToUpdate.x = from.x + along.x + jitter.x;
      positionToUpdate.y = from.y + 0.1 + ((Math.random() - 0.5) * 0.05);
      positionToUpdate.z = from.z + along.z + jitter.z;
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const lift = 0.14 + (Math.random() * 0.22);
      directionToUpdate.x = dir.x * (0.7 + (Math.random() * 1.2));
      directionToUpdate.y = lift;
      directionToUpdate.z = dir.z * (0.7 + (Math.random() * 1.2));
    };

    particles.start();
    this.activeTankParticleEffects.add(particles);

    const ttlMs = Math.max(95, Math.min(180, segmentLength * 24));
    const start = performance.now();
    const tick = window.setInterval(() => {
      if (trail.isDisposed()) {
        window.clearInterval(tick);
        return;
      }
      const t = Math.min(1, (performance.now() - start) / ttlMs);
      mat.alpha = Math.max(0, 0.58 * (1 - t));
      if (t >= 1) {
        window.clearInterval(tick);
        trail.dispose();
        mat.dispose();
      }
    }, 16);

    window.setTimeout(() => {
      particles.stop();
      window.setTimeout(() => particles.dispose(false), 340);
      this.activeTankParticleEffects.delete(particles);
    }, 115);
  }

  private spawnRogueUltimateTeleportTrail(from: Vector3, to: Vector3, target: Vector3): void {
    const segment = to.subtract(from);
    if (segment.lengthSquared() <= 0.0001) return;

    this.spawnRogueDashTrailVisual(from, to, 0.42);

    const dir = segment.normalize();
    const side = new Vector3(dir.z, 0, -dir.x).normalize();
    const ribbon = MeshBuilder.CreateTube(`rogue_ult_chain_${Date.now()}`, {
      path: [from.add(new Vector3(0, 0.1, 0)), to.add(new Vector3(0, 0.1, 0))],
      radius: 0.05,
      tessellation: 8,
      updatable: false,
    }, this.scene);

    const ribbonMat = new StandardMaterial(`rogue_ult_chain_mat_${Date.now()}`, this.scene);
    ribbonMat.diffuseColor = new Color3(0.2, 1.0, 0.62);
    ribbonMat.emissiveColor = new Color3(0.1, 0.65, 0.31);
    ribbonMat.alpha = 0.52;
    ribbonMat.backFaceCulling = false;
    ribbon.material = ribbonMat;

    const chainParticles = new ParticleSystem(`rogue_ult_chain_fx_${Date.now()}`, 340, this.scene);
    chainParticles.particleTexture = this.getRogueFxParticleTexture();
    chainParticles.layerMask = SCENE_LAYER;
    chainParticles.emitter = from.add(new Vector3(0, 0.12, 0));
    chainParticles.minSize = 0.05;
    chainParticles.maxSize = 0.16;
    chainParticles.minLifeTime = 0.12;
    chainParticles.maxLifeTime = 0.26;
    chainParticles.emitRate = 1450;
    chainParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
    chainParticles.color1 = new Color4(0.32, 1.0, 0.68, 0.96);
    chainParticles.color2 = new Color4(0.12, 0.78, 0.35, 0.78);
    chainParticles.colorDead = new Color4(0.03, 0.2, 0.09, 0);
    chainParticles.gravity = new Vector3(0, 0, 0);
    chainParticles.minEmitPower = 0.35;
    chainParticles.maxEmitPower = 1.25;
    chainParticles.updateSpeed = 0.016;

    chainParticles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const t = Math.random();
      const wave = Math.sin((t * Math.PI * 5) + (Math.random() * Math.PI));
      const jitter = side.scale(wave * (0.06 + (Math.random() * 0.18)));
      positionToUpdate.x = from.x + (segment.x * t) + jitter.x;
      positionToUpdate.y = from.y + 0.11 + ((Math.random() - 0.5) * 0.07);
      positionToUpdate.z = from.z + (segment.z * t) + jitter.z;
    };

    chainParticles.start();
    this.activeTankParticleEffects.add(chainParticles);

    const impactParticles = new ParticleSystem(`rogue_ult_impact_fx_${Date.now()}`, 210, this.scene);
    impactParticles.particleTexture = this.getRogueFxParticleTexture();
    impactParticles.layerMask = SCENE_LAYER;
    impactParticles.emitter = target.add(new Vector3(0, 0.1, 0));
    impactParticles.minSize = 0.06;
    impactParticles.maxSize = 0.2;
    impactParticles.minLifeTime = 0.12;
    impactParticles.maxLifeTime = 0.24;
    impactParticles.emitRate = 1100;
    impactParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
    impactParticles.color1 = new Color4(0.46, 1.0, 0.72, 0.95);
    impactParticles.color2 = new Color4(0.15, 0.82, 0.38, 0.82);
    impactParticles.colorDead = new Color4(0.05, 0.21, 0.1, 0);
    impactParticles.gravity = new Vector3(0, 0, 0);
    impactParticles.minEmitPower = 1.1;
    impactParticles.maxEmitPower = 2.8;
    impactParticles.updateSpeed = 0.016;
    impactParticles.start();
    this.activeTankParticleEffects.add(impactParticles);

    const start = performance.now();
    const ttlMs = 150;
    const tick = window.setInterval(() => {
      if (ribbon.isDisposed()) {
        window.clearInterval(tick);
        return;
      }
      const t = Math.min(1, (performance.now() - start) / ttlMs);
      ribbonMat.alpha = Math.max(0, 0.52 * (1 - t));
      if (t >= 1) {
        window.clearInterval(tick);
        ribbon.dispose();
        ribbonMat.dispose();
      }
    }, 16);

    window.setTimeout(() => {
      chainParticles.stop();
      impactParticles.stop();
      window.setTimeout(() => {
        chainParticles.dispose(false);
        impactParticles.dispose(false);
      }, 420);
      this.activeTankParticleEffects.delete(chainParticles);
      this.activeTankParticleEffects.delete(impactParticles);
    }, 130);
  }

  private startRogueUltimateGlitchParticles(): void {
    this.disposeRogueUltimateGlitchParticles();

    const particles = new ParticleSystem(`rogue_ult_glitch_fx_${Date.now()}`, 1100, this.scene);
    particles.particleTexture = this.getRogueFxParticleTexture();
    particles.layerMask = SCENE_LAYER;
    particles.emitter = this.playerController.getPosition().add(new Vector3(0, 0.09, 0));
    particles.minSize = 0.04;
    particles.maxSize = 0.15;
    particles.minLifeTime = 0.18;
    particles.maxLifeTime = 0.46;
    particles.emitRate = 1250;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    particles.color1 = new Color4(0.3, 1.0, 0.66, 0.92);
    particles.color2 = new Color4(0.08, 0.72, 0.31, 0.78);
    particles.colorDead = new Color4(0.03, 0.2, 0.09, 0);
    particles.gravity = new Vector3(0, 0, 0);
    particles.updateSpeed = 0.016;
    particles.minEmitPower = 1.3;
    particles.maxEmitPower = 2.7;

    particles.startPositionFunction = (
      _worldMatrix,
      positionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const center = this.playerController.getPosition();
      const angle = Math.random() * Math.PI * 2;
      const ringRadius = this.rogueUltimateZoneRadius * (0.18 + (Math.random() * 0.85));
      positionToUpdate.x = center.x + (Math.cos(angle) * ringRadius);
      positionToUpdate.y = center.y + 0.06 + (Math.random() * 0.2);
      positionToUpdate.z = center.z + (Math.sin(angle) * ringRadius);
    };

    particles.startDirectionFunction = (
      _worldMatrix,
      directionToUpdate: Vector3,
      _particle,
      _isLocal,
    ) => {
      const angle = Math.random() * Math.PI * 2;
      directionToUpdate.x = Math.cos(angle) * (1.0 + (Math.random() * 1.6));
      directionToUpdate.y = 0.2 + (Math.random() * 0.3);
      directionToUpdate.z = Math.sin(angle) * (1.0 + (Math.random() * 1.6));
    };

    particles.start();
    this.rogueUltimateGlitchParticles = particles;
    this.activeTankParticleEffects.add(particles);
  }

  private disposeRogueUltimateGlitchParticles(): void {
    if (!this.rogueUltimateGlitchParticles) return;
    this.rogueUltimateGlitchParticles.stop();
    this.rogueUltimateGlitchParticles.dispose(false);
    this.activeTankParticleEffects.delete(this.rogueUltimateGlitchParticles);
    this.rogueUltimateGlitchParticles = null;
  }

  private getMageFxParticleTexture(): DynamicTexture {
    if (this.mageFxParticleTexture) {
      return this.mageFxParticleTexture;
    }

    const texture = new DynamicTexture('mage_fx_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.38, 'rgba(128,239,255,0.96)');
    gradient.addColorStop(0.72, 'rgba(124,92,255,0.9)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.mageFxParticleTexture = texture;
    return texture;
  }

  private disposeMageFxParticleTexture(): void {
    if (this.mageFxParticleTexture) {
      this.mageFxParticleTexture.dispose();
      this.mageFxParticleTexture = null;
    }
  }

  private getRogueFxParticleTexture(): DynamicTexture {
    if (this.rogueFxParticleTexture) {
      return this.rogueFxParticleTexture;
    }

    const texture = new DynamicTexture('rogue_fx_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(210,255,220,1)');
    gradient.addColorStop(0.35, 'rgba(88,255,162,0.96)');
    gradient.addColorStop(0.72, 'rgba(22,188,98,0.86)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.update();
    this.rogueFxParticleTexture = texture;
    return texture;
  }

  private disposeRogueFxParticleTexture(): void {
    if (this.rogueFxParticleTexture) {
      this.rogueFxParticleTexture.dispose();
      this.rogueFxParticleTexture = null;
    }
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
