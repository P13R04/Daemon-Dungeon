import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { EnemyRuntimeConfig } from './EnemyControllerTypes';
import type { BeamSegment } from './EnemyCombatTypes';
import { disposeMeshesAndMaterials } from './EnemyVisualUtils';
import type { RoomManager } from '../../systems/RoomManager';

type LaserBossState = 'cooldown' | 'windup' | 'casting';
type LaserBossPattern = 'none' | 'rotating' | 'grid';

export interface LaserPatternUpdateContext {
  deltaTime: number;
  bossCenter: Vector3;
  playerPosition: Vector3;
  playerVelocity: Vector3;
  roomManager: RoomManager;
  isVisionBlockedAt: (position: Vector3, roomManager: RoomManager) => boolean;
  onRotateToward: (direction: Vector3, deltaTime: number, speed: number) => void;
  onAttackPlayerWithDamage: (damage: number) => void;
}

export class EnemyLaserPatternSubsystem {
  private laserBossCooldown: number = 2.2;
  private laserBossWindup: number = 0.6;
  private laserBossRotateDuration: number = 4.2;
  private laserBossGridDuration: number = 3.2;
  private laserBossDamage: number = 20;
  private laserBossTickInterval: number = 0.25;
  private laserBossBeamWidth: number = 0.3;
  private laserBossGridSpacing: number = 2.0;
  private laserBossState: LaserBossState = 'cooldown';
  private laserBossPattern: LaserBossPattern = 'none';
  private laserBossStateTimer: number = 1.8;
  private laserBossContactCooldown: number = 0.12;
  private laserBossContactTimer: number = 0;
  private laserBossAngle: number = 0;
  private laserBossSegments: BeamSegment[] = [];
  private laserBossVisuals: Mesh[] = [];

  constructor(private readonly scene: Scene, private readonly enemyId: string) {}

  configure(behaviorConfig?: EnemyRuntimeConfig['behaviorConfig']): void {
    if (!behaviorConfig) return;

    this.laserBossCooldown = behaviorConfig.laserCooldown ?? this.laserBossCooldown;
    this.laserBossWindup = behaviorConfig.laserWindup ?? this.laserBossWindup;
    this.laserBossRotateDuration = behaviorConfig.laserRotateDuration ?? this.laserBossRotateDuration;
    this.laserBossGridDuration = behaviorConfig.laserGridDuration ?? this.laserBossGridDuration;
    this.laserBossDamage = behaviorConfig.laserDamage ?? this.laserBossDamage;
    this.laserBossTickInterval = behaviorConfig.laserTickInterval ?? this.laserBossTickInterval;
    this.laserBossBeamWidth = behaviorConfig.laserWidth ?? this.laserBossBeamWidth;
    this.laserBossGridSpacing = behaviorConfig.laserGridSpacing ?? this.laserBossGridSpacing;
  }

  update(context: LaserPatternUpdateContext): void {
    const {
      deltaTime,
      bossCenter,
      playerPosition,
      playerVelocity,
      roomManager,
      isVisionBlockedAt,
      onRotateToward,
      onAttackPlayerWithDamage,
    } = context;

    this.laserBossContactTimer = Math.max(0, this.laserBossContactTimer - deltaTime);
    this.laserBossStateTimer -= deltaTime;

    if (this.laserBossState === 'cooldown') {
      if (this.laserBossStateTimer <= 0) {
        this.laserBossPattern = Math.random() < 0.5 ? 'rotating' : 'grid';
        this.laserBossState = 'windup';
        this.laserBossStateTimer = this.laserBossWindup;
        if (this.laserBossPattern === 'grid') {
          const baseAngle = Math.random() * Math.PI;
          this.laserBossSegments = this.generateGridSegments(roomManager, baseAngle, this.laserBossGridSpacing, isVisionBlockedAt);
          this.updateLaserVisualMeshes(this.laserBossSegments, new Color3(1.0, 0.24, 0.18), 0.28);
        } else {
          this.clearVisuals();
        }
      }
      return;
    }

    if (this.laserBossState === 'windup') {
      if (this.laserBossStateTimer <= 0) {
        this.startLaserPattern(bossCenter, roomManager, isVisionBlockedAt);
      }
      return;
    }

    if (this.laserBossState !== 'casting') return;

    if (this.laserBossPattern === 'rotating') {
      const duration = Math.max(0.3, this.laserBossRotateDuration);
      const angularSpeed = (Math.PI * 2) / duration;
      this.laserBossAngle += angularSpeed * deltaTime;
      const direction = new Vector3(Math.cos(this.laserBossAngle), 0, Math.sin(this.laserBossAngle));
      const end = this.computeBeamEndAtFirstWall(bossCenter, direction, roomManager, isVisionBlockedAt);
      this.laserBossSegments = [{ start: bossCenter.clone(), end }];
      this.updateLaserVisualMeshes(this.laserBossSegments, new Color3(1.0, 0.2, 0.2));
      onRotateToward(direction, deltaTime, 8);
    }

    const previousPlayerPosition = playerPosition.subtract(playerVelocity.scale(deltaTime));
    const touchesLaser = this.isPlayerSweptHitByAnyLaserSegment(
      previousPlayerPosition,
      playerPosition,
      this.laserBossSegments,
      this.laserBossBeamWidth
    );
    if (touchesLaser && this.laserBossContactTimer <= 0) {
      onAttackPlayerWithDamage(this.laserBossDamage);
      this.laserBossContactTimer = this.laserBossContactCooldown;
    }

    if (this.laserBossStateTimer <= 0) {
      this.clearVisuals();
      this.laserBossSegments = [];
      this.laserBossPattern = 'none';
      this.laserBossState = 'cooldown';
      this.laserBossStateTimer = this.laserBossCooldown;
    }
  }

  dispose(): void {
    this.clearVisuals();
  }

  private startLaserPattern(
    bossCenter: Vector3,
    roomManager: RoomManager,
    isVisionBlockedAt: (position: Vector3, roomManager: RoomManager) => boolean
  ): void {
    this.laserBossState = 'casting';
    this.laserBossContactTimer = 0;
    this.clearVisuals();

    if (this.laserBossPattern === 'rotating') {
      this.laserBossStateTimer = this.laserBossRotateDuration;
      this.laserBossAngle = Math.random() * Math.PI * 2;
      const direction = new Vector3(Math.cos(this.laserBossAngle), 0, Math.sin(this.laserBossAngle));
      const end = this.computeBeamEndAtFirstWall(bossCenter, direction, roomManager, isVisionBlockedAt);
      this.laserBossSegments = [{ start: bossCenter.clone(), end }];
      this.updateLaserVisualMeshes(this.laserBossSegments, new Color3(1.0, 0.2, 0.2));
      return;
    }

    this.laserBossStateTimer = this.laserBossGridDuration;
    this.updateLaserVisualMeshes(this.laserBossSegments, new Color3(1.0, 0.28, 0.22));
  }

  private computeBeamEndAtFirstWall(
    origin: Vector3,
    direction: Vector3,
    roomManager: RoomManager,
    isVisionBlockedAt: (position: Vector3, roomManager: RoomManager) => boolean
  ): Vector3 {
    const maxDistance = 40;
    const step = 0.06;
    let lastWalkable = origin.clone();

    for (let d = step; d <= maxDistance; d += step) {
      const sample = origin.add(direction.scale(d));
      if (isVisionBlockedAt(sample, roomManager)) {
        return lastWalkable;
      }
      lastWalkable = sample;
    }

    return lastWalkable;
  }

  private generateGridSegments(
    roomManager: RoomManager,
    angle: number,
    spacing: number,
    isVisionBlockedAt: (position: Vector3, roomManager: RoomManager) => boolean
  ): BeamSegment[] {
    const bounds = roomManager.getRoomBounds();
    if (!bounds) return [];

    const normalA = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const normalB = new Vector3(-normalA.z, 0, normalA.x);

    const segments: BeamSegment[] = [];
    segments.push(...this.generateLineFamily(bounds, normalA, spacing, roomManager, isVisionBlockedAt));
    segments.push(...this.generateLineFamily(bounds, normalB, spacing, roomManager, isVisionBlockedAt));
    return segments;
  }

  private generateLineFamily(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    normal: Vector3,
    spacing: number,
    roomManager: RoomManager,
    isVisionBlockedAt: (position: Vector3, roomManager: RoomManager) => boolean
  ): BeamSegment[] {
    const corners = [
      new Vector3(bounds.minX, 0, bounds.minZ),
      new Vector3(bounds.maxX, 0, bounds.minZ),
      new Vector3(bounds.maxX, 0, bounds.maxZ),
      new Vector3(bounds.minX, 0, bounds.maxZ),
    ];

    let minProj = Number.POSITIVE_INFINITY;
    let maxProj = Number.NEGATIVE_INFINITY;
    for (const corner of corners) {
      const projection = corner.x * normal.x + corner.z * normal.z;
      minProj = Math.min(minProj, projection);
      maxProj = Math.max(maxProj, projection);
    }

    const step = Math.max(0.8, spacing);
    const segments: BeamSegment[] = [];
    for (let c = minProj - step; c <= maxProj + step; c += step) {
      const clipped = this.clipInfiniteLineToRoom(bounds, normal, c);
      if (clipped) {
        const clippedSegments = this.splitSegmentByWalls(clipped, roomManager, isVisionBlockedAt);
        segments.push(...clippedSegments);
      }
    }
    return segments;
  }

  private splitSegmentByWalls(
    segment: BeamSegment,
    roomManager: RoomManager,
    isVisionBlockedAt: (position: Vector3, roomManager: RoomManager) => boolean
  ): BeamSegment[] {
    const parts: BeamSegment[] = [];
    const delta = segment.end.subtract(segment.start);
    const length = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    if (length <= 0.05) return parts;

    const step = 0.08;
    const steps = Math.max(2, Math.ceil(length / step));
    let openStart: Vector3 | null = null;
    let previousSample = segment.start.clone();

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sample = segment.start.add(delta.scale(t));
      const walkable = !isVisionBlockedAt(sample, roomManager);

      if (walkable && !openStart) {
        openStart = sample.clone();
      }

      if ((!walkable || i === steps) && openStart) {
        const endPoint = walkable && i === steps ? sample.clone() : previousSample.clone();
        if (Vector3.DistanceSquared(openStart, endPoint) > 0.04) {
          parts.push({ start: openStart.clone(), end: endPoint });
        }
        openStart = null;
      }

      previousSample = sample;
    }

    return parts;
  }

  private clipInfiniteLineToRoom(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    normal: Vector3,
    c: number
  ): BeamSegment | null {
    const epsilon = 1e-6;
    const points: Vector3[] = [];

    const tryAddPoint = (x: number, z: number) => {
      if (x < bounds.minX - 1e-4 || x > bounds.maxX + 1e-4 || z < bounds.minZ - 1e-4 || z > bounds.maxZ + 1e-4) {
        return;
      }
      for (const point of points) {
        if (Math.abs(point.x - x) < 1e-4 && Math.abs(point.z - z) < 1e-4) {
          return;
        }
      }
      points.push(new Vector3(x, 0.06, z));
    };

    if (Math.abs(normal.z) > epsilon) {
      tryAddPoint(bounds.minX, (c - normal.x * bounds.minX) / normal.z);
      tryAddPoint(bounds.maxX, (c - normal.x * bounds.maxX) / normal.z);
    }

    if (Math.abs(normal.x) > epsilon) {
      tryAddPoint((c - normal.z * bounds.minZ) / normal.x, bounds.minZ);
      tryAddPoint((c - normal.z * bounds.maxZ) / normal.x, bounds.maxZ);
    }

    if (points.length < 2) {
      return null;
    }

    let bestA = points[0];
    let bestB = points[1];
    let bestDist = Vector3.DistanceSquared(bestA, bestB);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = Vector3.DistanceSquared(points[i], points[j]);
        if (dist > bestDist) {
          bestDist = dist;
          bestA = points[i];
          bestB = points[j];
        }
      }
    }

    if (bestDist <= 0.02) return null;
    return { start: bestA, end: bestB };
  }

  private updateLaserVisualMeshes(segments: BeamSegment[], color: Color3, alpha: number = 0.88): void {
    this.clearVisuals();
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const delta = segment.end.subtract(segment.start);
      const length = delta.length();
      if (length <= 0.05) continue;

      const beam = MeshBuilder.CreateBox(`laser_${this.enemyId}_${Date.now()}_${i}`, {
        width: this.laserBossBeamWidth,
        height: 0.14,
        depth: 1,
      }, this.scene);

      const material = new StandardMaterial(`laser_mat_${this.enemyId}_${Date.now()}_${i}`, this.scene);
      material.diffuseColor = color.scale(0.55);
      material.emissiveColor = color;
      material.alpha = alpha;
      beam.material = material;

      beam.position = segment.start.add(segment.end).scale(0.5);
      beam.position.y = 0.1;
      beam.scaling = new Vector3(1, 1, length);
      beam.rotation.y = Math.atan2(delta.x, delta.z);
      beam.isPickable = false;
      this.laserBossVisuals.push(beam);
    }
  }

  private isPlayerSweptHitByAnyLaserSegment(
    previousPlayerPosition: Vector3,
    playerPosition: Vector3,
    segments: BeamSegment[],
    width: number
  ): boolean {
    for (const segment of segments) {
      const distance = this.distanceBetweenSegments2D(previousPlayerPosition, playerPosition, segment.start, segment.end);
      if (distance <= width * 0.5) {
        return true;
      }
    }
    return false;
  }

  private distanceBetweenSegments2D(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3): number {
    const sampleCount = 10;
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const sample = a0.add(a1.subtract(a0).scale(t));
      minDistance = Math.min(minDistance, this.distancePointToSegment2D(sample, b0, b1));
    }
    return minDistance;
  }

  private distancePointToSegment2D(point: Vector3, start: Vector3, end: Vector3): number {
    const ax = start.x;
    const az = start.z;
    const bx = end.x;
    const bz = end.z;
    const px = point.x;
    const pz = point.z;

    const abx = bx - ax;
    const abz = bz - az;
    const abLenSq = abx * abx + abz * abz;
    if (abLenSq <= 1e-8) {
      return Math.sqrt((px - ax) * (px - ax) + (pz - az) * (pz - az));
    }

    const apx = px - ax;
    const apz = pz - az;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
    const closestX = ax + abx * t;
    const closestZ = az + abz * t;
    const dx = px - closestX;
    const dz = pz - closestZ;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private clearVisuals(): void {
    disposeMeshesAndMaterials(this.laserBossVisuals);
    this.laserBossVisuals = [];
  }
}
