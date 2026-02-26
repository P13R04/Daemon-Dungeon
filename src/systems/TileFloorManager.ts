/**
 * TileFloorManager - Integrates TileSystem with room generation
 * Manages the floor rendering for each room
 */

import { Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { TileSystem, TileData } from './TileSystem';
import { RoomLayoutParser, RoomLayout } from './RoomLayoutParser';

export class TileFloorManager {
  private scene: Scene;
  private tileSystem: TileSystem;
  private roomParent: TransformNode;
  private currentRoomTiles: Map<string, TileData> = new Map();
  private tileOrigin: Vector3 = Vector3.Zero();
  private tileSize: number = 1;

  constructor(scene: Scene, tileSize: number = 1) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.tileSystem = new TileSystem(scene, tileSize);
    
    // Create a parent node for room tiles
    this.roomParent = new TransformNode('floor_tiles', scene);
  }

  update(deltaTime: number): void {
    this.tileSystem.update(deltaTime);
  }

  /**
   * Load and render a room's floor using tiles
   */
  loadRoomFloor(roomLayout: RoomLayout, origin: Vector3 = Vector3.Zero()): void {
    // Clear previous tiles
    this.clearFloor();

    this.tileOrigin = origin.clone();
    this.tileSystem.setOrigin(this.tileOrigin);

    // Parse layout into tiles
    const tiles = RoomLayoutParser.parseLayout(roomLayout);

    // Register all tiles with the tile system
    for (const tile of tiles) {
      this.tileSystem.registerTile(tile);
      const key = `${tile.x},${tile.z}`;
      this.currentRoomTiles.set(key, tile);
    }

    // Create mesh for each tile
    for (const tile of tiles) {
      const mesh = this.tileSystem.createTileMesh(tile);
      if (mesh) {
        mesh.parent = this.roomParent;
      }
    }
  }

  /**
   * Clear all floor tiles
   */
  clearFloor(): void {
    this.tileSystem.clearTiles();
    this.currentRoomTiles.clear();
  }

  /**
   * Update tiles around a specific location (e.g., after an obstacle is removed)
   */
  updateRegion(centerX: number, centerZ: number, radius: number = 2): void {
    this.tileSystem.rebuildRegion(centerX, centerZ, radius);
  }

  /**
   * Get tile at specific coordinates
   */
  getTileAt(x: number, z: number): TileData | undefined {
    const key = `${x},${z}`;
    return this.currentRoomTiles.get(key);
  }

  getTileAtWorld(x: number, z: number): TileData | undefined {
    const localX = x - this.tileOrigin.x;
    const localZ = z - this.tileOrigin.z;
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
    return this.tileSystem.areSpikesActive();
  }

  /**
   * Get statistics about the floor
   */
  getStatistics() {
    const stats = this.tileSystem.getStats();
    return {
      totalTiles: this.currentRoomTiles.size,
      textureCount: stats.textureCount,
      meshCount: stats.meshCount,
    };
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.clearFloor();
    this.tileSystem.dispose();
    this.roomParent.dispose();
  }
}
