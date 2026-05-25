/**
 * TileFloorManager - Integrates TileSystem with room generation
 * Manages the floor rendering for each room
 */

import { Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { TileSystem, TileData, TileRenderProfile } from './TileSystem';
import { RoomLayoutParser, RoomLayout } from './RoomLayoutParser';

interface FloorInstance {
  key: string;
  tileSystem: TileSystem;
  parent: TransformNode;
  tiles: Map<string, TileData>;
  origin: Vector3;
  profile: TileRenderProfile;
}

export class TileFloorManager {
  private scene: Scene;
  private roomParent: TransformNode;
  private floorInstances: Map<string, FloorInstance> = new Map();
  private activeInstanceKey: string | null = null;
  private tileSize: number = 1;
  private renderProfile: TileRenderProfile = 'classic';

  constructor(scene: Scene, tileSize: number = 1) {
    this.scene = scene;
    this.tileSize = tileSize;

    // Create a parent node for room tiles
    this.roomParent = new TransformNode('floor_tiles', scene);
  }

  setRenderProfile(profile: TileRenderProfile): void {
    this.renderProfile = profile;
    for (const instance of this.floorInstances.values()) {
      instance.tileSystem.setRenderProfile(profile);
    }
  }

  update(deltaTime: number): void {
    const active = this.getActiveInstance();
    if (!active) return;
    active.tileSystem.update(deltaTime);
  }

  prewarmRoomLayout(roomLayout: RoomLayout): void {
    const tiles = RoomLayoutParser.parseLayout(roomLayout);
    const prewarmSystem = new TileSystem(this.scene, this.tileSize);
    prewarmSystem.setRenderProfile(this.renderProfile);
    prewarmSystem.prewarmProceduralMaterials(tiles);
    prewarmSystem.dispose();
  }

  hasRoomInstance(instanceKey: string): boolean {
    return this.floorInstances.has(instanceKey);
  }

  getLoadedRoomKeys(): string[] {
    return Array.from(this.floorInstances.keys());
  }

  setCurrentRoomInstance(instanceKey: string): void {
    if (!this.floorInstances.has(instanceKey)) return;
    this.activeInstanceKey = instanceKey;
  }

  loadRoomFloorInstance(
    instanceKey: string,
    roomLayout: RoomLayout,
    origin: Vector3 = Vector3.Zero(),
    profile: TileRenderProfile = this.renderProfile,
  ): void {
    const existing = this.floorInstances.get(instanceKey);
    if (existing) {
      const sameOrigin = existing.origin.equalsWithEpsilon(origin, 0.0001);
      const sameProfile = existing.profile === profile;
      if (sameOrigin && sameProfile) {
        return;
      }
      this.unloadRoomFloorInstance(instanceKey);
    }

    const tileSystem = new TileSystem(this.scene, this.tileSize);
    tileSystem.setRenderProfile(profile);
    tileSystem.setOrigin(origin);

    const parent = new TransformNode(`floor_tiles_${instanceKey}`, this.scene);
    parent.parent = this.roomParent;
    parent.position.set(0, 0, 0);

    const tiles = RoomLayoutParser.parseLayout(roomLayout);
    const tileMap = new Map<string, TileData>();

    for (const tile of tiles) {
      tileSystem.registerTile(tile);
      const key = `${tile.x},${tile.z}`;
      tileMap.set(key, tile);
    }

    for (const tile of tiles) {
      const mesh = tileSystem.createTileMesh(tile);
      if (mesh) {
        mesh.parent = parent;
      }
    }

    this.floorInstances.set(instanceKey, {
      key: instanceKey,
      tileSystem,
      parent,
      tiles: tileMap,
      origin: origin.clone(),
      profile,
    });

    if (!this.activeInstanceKey) {
      this.activeInstanceKey = instanceKey;
    }
  }

  unloadRoomFloorInstance(instanceKey: string): void {
    const instance = this.floorInstances.get(instanceKey);
    if (!instance) return;

    instance.tileSystem.dispose();
    instance.parent.dispose();
    this.floorInstances.delete(instanceKey);

    if (this.activeInstanceKey === instanceKey) {
      this.activeInstanceKey = this.floorInstances.size > 0
        ? this.floorInstances.keys().next().value ?? null
        : null;
    }
  }

  clearAllRoomInstances(): void {
    const keys = Array.from(this.floorInstances.keys());
    for (const key of keys) {
      this.unloadRoomFloorInstance(key);
    }
    this.activeInstanceKey = null;
  }

  private getActiveInstance(): FloorInstance | null {
    if (!this.activeInstanceKey) return null;
    return this.floorInstances.get(this.activeInstanceKey) ?? null;
  }

  /**
   * Load and render a room's floor using tiles
   */
  loadRoomFloor(
    roomLayout: RoomLayout,
    origin: Vector3 = Vector3.Zero(),
    profile: TileRenderProfile = this.renderProfile,
  ): void {
    const key = '__single_room__';
    this.clearAllRoomInstances();
    this.loadRoomFloorInstance(key, roomLayout, origin, profile);
    this.setCurrentRoomInstance(key);
  }

  /**
   * Clear all floor tiles
   */
  clearFloor(): void {
    this.clearAllRoomInstances();
  }

  /**
   * Update tiles around a specific location (e.g., after an obstacle is removed)
   */
  updateRegion(centerX: number, centerZ: number, radius: number = 2): void {
    const active = this.getActiveInstance();
    if (!active) return;
    active.tileSystem.rebuildRegion(centerX, centerZ, radius);
  }

  /**
   * Get tile at specific coordinates
   */
  getTileAt(x: number, z: number): TileData | undefined {
    const active = this.getActiveInstance();
    if (!active) return undefined;
    const key = `${x},${z}`;
    return active.tiles.get(key);
  }

  getTileAtWorld(x: number, z: number): TileData | undefined {
    const active = this.getActiveInstance();
    if (!active) return undefined;
    const localX = x - active.origin.x;
    const localZ = z - active.origin.z;
    const tileX = Math.floor(localX / this.tileSize);
    const tileZ = Math.floor(localZ / this.tileSize);
    return this.getTileAt(tileX, tileZ);
  }

  /**
   * Check if a tile position is walkable
   */
  isWalkable(x: number, z: number): boolean {
    const tile = this.getTileAt(x, z);
    if (!tile) return false;
    return tile.type !== 'wall' && tile.type !== 'pillar' && tile.type !== 'void';
  }

  isWalkableWorld(x: number, z: number): boolean {
    const tile = this.getTileAtWorld(x, z);
    if (!tile) return false;
    return tile.type !== 'wall' && tile.type !== 'pillar' && tile.type !== 'void';
  }

  isSpikeActiveAtWorld(x: number, z: number): boolean {
    const tile = this.getTileAtWorld(x, z);
    if (!tile || tile.type !== 'spikes') return false;
    const active = this.getActiveInstance();
    if (!active) return false;
    return active.tileSystem.areSpikesActive();
  }

  /**
   * Get statistics about the floor
   */
  getStatistics() {
    const active = this.getActiveInstance();
    const stats = active?.tileSystem.getStats() ?? { textureCount: 0, meshCount: 0 };
    return {
      totalTiles: active?.tiles.size ?? 0,
      textureCount: stats.textureCount,
      meshCount: stats.meshCount,
    };
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.clearAllRoomInstances();
    this.roomParent.dispose();
  }
}
