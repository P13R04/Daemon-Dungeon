import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { EnemyRuntimeConfig } from './EnemyControllerTypes';
import type { ZoneBounds } from './EnemyCombatTypes';
import { disposeMeshesAndMaterials } from './EnemyVisualUtils';
import type { RoomManager } from '../../systems/RoomManager';

type SpikeCastState = 'idle' | 'warning' | 'active';

export interface SpikeCastUpdateContext {
  deltaTime: number;
  playerPosition: Vector3;
  roomManager: RoomManager;
  onAttackPlayerWithDamage: (damage: number) => void;
}

export class EnemySpikeCastSubsystem {
  private spikeCastCooldown: number = 4.0;
  private spikeCastWarningDuration: number = 0.8;
  private spikeCastActiveDuration: number = 1.2;
  private spikeCastDamage: number = 22;
  private spikeCastTickInterval: number = 0.45;
  private spikeCastTimer: number = 0;
  private spikeCastState: SpikeCastState = 'idle';
  private spikeCastStateTimer: number = 0;
  private spikeCastTickTimer: number = 0;
  private spikeZoneBounds: ZoneBounds | null = null;
  private spikeZoneVisuals: Mesh[] = [];

  constructor(private readonly scene: Scene) {}

  configure(behaviorConfig?: EnemyRuntimeConfig['behaviorConfig']): void {
    if (!behaviorConfig) return;

    this.spikeCastCooldown = behaviorConfig.spikeCastCooldown ?? this.spikeCastCooldown;
    this.spikeCastWarningDuration = behaviorConfig.spikeWarningDuration ?? this.spikeCastWarningDuration;
    this.spikeCastActiveDuration = behaviorConfig.spikeActiveDuration ?? this.spikeCastActiveDuration;
    this.spikeCastDamage = behaviorConfig.spikeDamage ?? this.spikeCastDamage;
    this.spikeCastTickInterval = behaviorConfig.spikeTickInterval ?? this.spikeCastTickInterval;
  }

  update(context: SpikeCastUpdateContext): void {
    const { deltaTime, playerPosition, roomManager, onAttackPlayerWithDamage } = context;

    if (this.spikeCastState === 'idle') {
      this.spikeCastTimer -= deltaTime;
      if (this.spikeCastTimer <= 0) {
        const zone = this.computeRandomThirdZone(roomManager);
        if (!zone) {
          this.spikeCastTimer = this.spikeCastCooldown;
          return;
        }
        this.spikeZoneBounds = zone;
        this.spikeCastState = 'warning';
        this.spikeCastStateTimer = this.spikeCastWarningDuration;
        this.spawnSpikeZoneWarningVisuals(zone);
      }
      return;
    }

    this.spikeCastStateTimer -= deltaTime;

    if (this.spikeCastState === 'warning') {
      if (this.spikeCastStateTimer <= 0) {
        this.spikeCastState = 'active';
        this.spikeCastStateTimer = this.spikeCastActiveDuration;
        this.spikeCastTickTimer = 0;
        this.spawnSpikeZoneActiveVisuals();
      }
      return;
    }

    if (this.spikeCastState === 'active') {
      this.spikeCastTickTimer -= deltaTime;
      if (this.spikeCastTickTimer <= 0) {
        if (this.spikeZoneBounds && this.isPointInsideZone(playerPosition, this.spikeZoneBounds)) {
          onAttackPlayerWithDamage(this.spikeCastDamage);
        }
        this.spikeCastTickTimer = this.spikeCastTickInterval;
      }

      if (this.spikeCastStateTimer <= 0) {
        this.clearVisuals();
        this.spikeZoneBounds = null;
        this.spikeCastState = 'idle';
        this.spikeCastTimer = this.spikeCastCooldown;
      }
    }
  }

  dispose(): void {
    this.clearVisuals();
  }

  private computeRandomThirdZone(roomManager: RoomManager): ZoneBounds | null {
    const bounds = roomManager.getRoomBounds();
    if (!bounds) return null;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxZ - bounds.minZ;
    if (width <= 0.001 || height <= 0.001) return null;

    const vertical = Math.random() < 0.5;
    const tier = Math.floor(Math.random() * 3);

    if (vertical) {
      const third = width / 3;
      const minX = bounds.minX + tier * third;
      return {
        minX,
        maxX: minX + third,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      };
    }

    const third = height / 3;
    const minZ = bounds.minZ + tier * third;
    return {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ,
      maxZ: minZ + third,
    };
  }

  private spawnSpikeZoneWarningVisuals(zone: ZoneBounds): void {
    this.clearVisuals();
    const width = Math.max(0.15, zone.maxX - zone.minX);
    const depth = Math.max(0.15, zone.maxZ - zone.minZ);

    const warningMesh = MeshBuilder.CreateGround(`spike_warning_${Date.now()}`, {
      width,
      height: depth,
    }, this.scene);
    warningMesh.position = new Vector3((zone.minX + zone.maxX) * 0.5, 0.05, (zone.minZ + zone.maxZ) * 0.5);

    const warningMat = new StandardMaterial(`spike_warning_mat_${Date.now()}`, this.scene);
    warningMat.diffuseColor = new Color3(1.0, 0.1, 0.1);
    warningMat.emissiveColor = new Color3(0.6, 0.0, 0.0);
    warningMat.alpha = 0.28;
    warningMesh.material = warningMat;

    this.spikeZoneVisuals.push(warningMesh);
  }

  private spawnSpikeZoneActiveVisuals(): void {
    if (!this.spikeZoneBounds) return;

    const zone = this.spikeZoneBounds;
    this.clearVisuals();
    const width = Math.max(0.15, zone.maxX - zone.minX);
    const depth = Math.max(0.15, zone.maxZ - zone.minZ);

    const zoneMesh = MeshBuilder.CreateGround(`spike_active_${Date.now()}`, {
      width,
      height: depth,
    }, this.scene);
    zoneMesh.position = new Vector3((zone.minX + zone.maxX) * 0.5, 0.06, (zone.minZ + zone.maxZ) * 0.5);

    const zoneMat = new StandardMaterial(`spike_active_mat_${Date.now()}`, this.scene);
    zoneMat.diffuseColor = new Color3(0.95, 0.0, 0.0);
    zoneMat.emissiveColor = new Color3(0.75, 0.05, 0.05);
    zoneMat.alpha = 0.42;
    zoneMesh.material = zoneMat;
    this.spikeZoneVisuals.push(zoneMesh);

    const area = width * depth;
    const desiredSpikes = 70;
    const spacing = Math.min(1.2, Math.max(0.6, Math.sqrt(area / desiredSpikes)));
    const baseSize = Math.min(0.45, spacing * 0.6);
    const spikeHeight = 0.9;

    for (let x = zone.minX + spacing * 0.5; x < zone.maxX; x += spacing) {
      for (let z = zone.minZ + spacing * 0.5; z < zone.maxZ; z += spacing) {
        const spike = MeshBuilder.CreateCylinder(`spike_${Date.now()}_${x}_${z}`, {
          height: spikeHeight,
          diameterTop: 0,
          diameterBottom: baseSize,
          tessellation: 4,
        }, this.scene);
        spike.position = new Vector3(x, 0.06 + spikeHeight * 0.5, z);
        spike.rotation.y = Math.random() * Math.PI;

        const spikeMat = new StandardMaterial(`spike_mat_${Date.now()}`, this.scene);
        spikeMat.diffuseColor = new Color3(0.42, 0.02, 0.02);
        spikeMat.emissiveColor = new Color3(0.22, 0.0, 0.0);
        spikeMat.alpha = 0.95;
        spike.material = spikeMat;
        this.spikeZoneVisuals.push(spike);
      }
    }
  }

  private isPointInsideZone(point: Vector3, zone: ZoneBounds): boolean {
    return point.x >= zone.minX && point.x <= zone.maxX && point.z >= zone.minZ && point.z <= zone.maxZ;
  }

  private clearVisuals(): void {
    disposeMeshesAndMaterials(this.spikeZoneVisuals);
    this.spikeZoneVisuals = [];
  }
}
