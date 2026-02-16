/**
 * TileSystem - Advanced tile rendering with automatic adjacency-based rotation
 * 
 * Features:
 * - Automatic texture selection based on tile type and neighbors
 * - Rotation calculation based on adjacency patterns
 * - Priority system: Walls > Poison > Void > Floor
 * - Supports: floor_base, floor_var1, floor_var2, poison, void, walls (3D only)
 */

import { Scene, StandardMaterial, Texture, Mesh, MeshBuilder, Vector3 } from '@babylonjs/core';

export type TileType =
  | 'floor'
  | 'wall'
  | 'pillar'
  | 'poison'
  | 'void'
  | 'spikes';

export interface TileData {
  type: TileType;
  x: number;
  z: number;
  adjacentTo?: {
    north?: boolean;
    south?: boolean;
    east?: boolean;
    west?: boolean;
  };
}

interface TileRenderData {
  texturePath: string | null;
  rotationDegrees: number;
}

interface TextureCache {
  [key: string]: Texture;
}

export class TileSystem {
  private scene: Scene;
  private tileSize: number = 1;
  private textureCache: TextureCache = {};
  private tileMeshes: Map<string, Mesh> = new Map();
  private tileGrid: Map<string, TileData> = new Map();
  private origin: Vector3 = Vector3.Zero();
  private readonly textureBasePath: string = '/tiles_test';
  private readonly rotationOffsetDegrees: number = 0;

  constructor(scene: Scene, tileSize: number = 1) {
    this.scene = scene;
    this.tileSize = tileSize;
  }

  private getTileKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  registerTile(tileData: TileData): void {
    const key = this.getTileKey(tileData.x, tileData.z);
    this.tileGrid.set(key, tileData);
  }

  setOrigin(origin: Vector3): void {
    this.origin = origin.clone();
  }

  private getAdjacencies(x: number, z: number, grid: Map<string, TileData>) {
    return {
      n: grid.get(this.getTileKey(x, z + 1)) || null, // Swap north/south to match editor orientation
      s: grid.get(this.getTileKey(x, z - 1)) || null,
      e: grid.get(this.getTileKey(x + 1, z)) || null,
      w: grid.get(this.getTileKey(x - 1, z)) || null,
      ne: grid.get(this.getTileKey(x + 1, z + 1)) || null,
      nw: grid.get(this.getTileKey(x - 1, z + 1)) || null,
      se: grid.get(this.getTileKey(x + 1, z - 1)) || null,
      sw: grid.get(this.getTileKey(x - 1, z - 1)) || null,
    };
  }

  private isBlockingType(type: TileType | null): boolean {
    return type === 'wall' || type === 'pillar';
  }

  private isMatch(type: TileType | null, matchType: TileType): boolean {
    if (!type) return false;
    if (matchType === 'wall') {
      return type === 'wall' || type === 'pillar';
    }
    return type === matchType;
  }

  private maskFrom(neighbors: ReturnType<typeof this.getAdjacencies>, matchType: TileType): number {
    let mask = 0;
    if (this.isMatch(neighbors.n?.type ?? null, matchType)) mask |= 1;
    if (this.isMatch(neighbors.e?.type ?? null, matchType)) mask |= 2;
    if (this.isMatch(neighbors.s?.type ?? null, matchType)) mask |= 4;
    if (this.isMatch(neighbors.w?.type ?? null, matchType)) mask |= 8;
    return mask;
  }

  private diagMaskFrom(neighbors: ReturnType<typeof this.getAdjacencies>, matchType: TileType): number {
    let mask = 0;
    if (this.isMatch(neighbors.nw?.type ?? null, matchType)) mask |= 1;
    if (this.isMatch(neighbors.ne?.type ?? null, matchType)) mask |= 2;
    if (this.isMatch(neighbors.se?.type ?? null, matchType)) mask |= 4;
    if (this.isMatch(neighbors.sw?.type ?? null, matchType)) mask |= 8;
    return mask;
  }

  private countBits(mask: number): number {
    return mask.toString(2).split('0').join('').length;
  }

  private rotationFromMask(mask: number): number {
    switch (mask) {
      case 1: return 90;
      case 2: return 180;
      case 4: return 270;
      case 8: return 0;
      default: return 0;
    }
  }

  private rotationFromCornerMask(mask: number): number {
    switch (mask) {
      case 1 | 8: return 0;
      case 1 | 2: return 90;
      case 2 | 4: return 180;
      case 4 | 8: return 270;
      default: return 0;
    }
  }

  private rotationFromMissing(mask: number): number {
    switch (mask) {
      case 1 | 2 | 8: return 0;
      case 1 | 2 | 4: return 90;
      case 2 | 4 | 8: return 180;
      case 1 | 4 | 8: return 270;
      default: return 0;
    }
  }

  private rotationFromDiagMask(mask: number): number {
    switch (mask) {
      case 1: return 0;
      case 2: return 90;
      case 4: return 180;
      case 8: return 270;
      default: return 0;
    }
  }

  private rotationFromDiagCornerMask(mask: number): number {
    switch (mask) {
      case 1 | 2: return 0;
      case 2 | 4: return 90;
      case 4 | 8: return 180;
      case 8 | 1: return 270;
      default: return 0;
    }
  }

  private rotationFromDiagMissing(mask: number): number {
    switch (mask) {
      case 1 | 2 | 4: return 0;
      case 2 | 4 | 8: return 90;
      case 1 | 4 | 8: return 180;
      case 1 | 2 | 8: return 270;
      default: return 0;
    }
  }

  private rotateDiagMask(mask: number, degreesCW: number): number {
    const steps = ((degreesCW % 360) + 360) % 360;
    if (steps === 0) return mask;
    if (steps === 90) {
      return ((mask & 1) ? 2 : 0) | ((mask & 2) ? 4 : 0) | ((mask & 4) ? 8 : 0) | ((mask & 8) ? 1 : 0);
    }
    if (steps === 180) {
      return ((mask & 1) ? 4 : 0) | ((mask & 2) ? 8 : 0) | ((mask & 4) ? 1 : 0) | ((mask & 8) ? 2 : 0);
    }
    if (steps === 270) {
      return ((mask & 1) ? 8 : 0) | ((mask & 2) ? 1 : 0) | ((mask & 4) ? 2 : 0) | ((mask & 8) ? 4 : 0);
    }
    return mask;
  }

  private oppositeRotation(mask: number): number {
    if (mask === (2 | 8)) return 0;
    if (mask === (1 | 4)) return 90;
    return 0;
  }

  private solveCircuitBorderForFloor(neighbors: ReturnType<typeof this.getAdjacencies>): TileRenderData | null {
    const mask = this.maskFrom(neighbors, 'wall');
    const diagMask = this.diagMaskFrom(neighbors, 'wall');
    const count = this.countBits(mask);
    const diagCount = this.countBits(diagMask);

    if (count === 4) {
      return { texturePath: 'circuit_border_side4.png', rotationDegrees: 0 };
    }

    if (count === 3) {
      return { texturePath: 'circuit_border_side3.png', rotationDegrees: this.rotationFromMissing(mask) };
    }

    if (count === 2) {
      const isOpposite = mask === (1 | 4) || mask === (2 | 8);
      if (isOpposite) {
        return { texturePath: 'circuit_border_side_opposite.png', rotationDegrees: this.oppositeRotation(mask) };
      }

      const rotation = this.rotationFromCornerMask(mask);
      const oppositeDiag =
        (mask === (1 | 8) && (diagMask & 4)) ||
        (mask === (1 | 2) && (diagMask & 8)) ||
        (mask === (2 | 4) && (diagMask & 1)) ||
        (mask === (4 | 8) && (diagMask & 2));

      if (oppositeDiag) {
        return { texturePath: 'circuit_border_corner_opposite_reversed.png', rotationDegrees: rotation };
      }

      return { texturePath: 'circuit_border_corner.png', rotationDegrees: rotation };
    }

    if (count === 1) {
      const rotation = this.rotationFromMask(mask);
      const rotatedDiagMask = this.rotateDiagMask(diagMask, (360 - rotation) % 360);
      const relevantDiagMask = rotatedDiagMask & (2 | 4);
      const diagCountLocal = this.countBits(relevantDiagMask);

      if (diagCountLocal === 2) {
        return { texturePath: 'circuit_border_side_and_reversed2.png', rotationDegrees: rotation };
      }
      if (diagCountLocal === 1) {
        const texture = (relevantDiagMask & 2)
          ? 'circuit_border_side_and_reversed.png'
          : 'circuit_border_side_and_reversed_alt.png';
        return { texturePath: texture, rotationDegrees: rotation };
      }

      return { texturePath: 'circuit_border_side.png', rotationDegrees: rotation };
    }

    if (count === 0) {
      if (diagCount === 0) {
        return null;
      }
      if (diagCount === 1) {
        const rotation = this.rotationFromCornerMask(
          diagMask === 1 ? (1 | 8) :
          diagMask === 2 ? (1 | 2) :
          diagMask === 4 ? (2 | 4) :
          (4 | 8)
        );
        return { texturePath: 'circuit_border_corner_reversed.png', rotationDegrees: rotation };
      }
      if (diagCount === 2) {
        const isOpposite = diagMask === (1 | 4) || diagMask === (2 | 8);
        if (isOpposite) {
          return { texturePath: 'circuit_border_corner_reversed_opposite.png', rotationDegrees: diagMask === (1 | 4) ? 0 : 90 };
        }
        return { texturePath: 'circuit_border_corner_reversed2.png', rotationDegrees: this.rotationFromDiagCornerMask(diagMask) };
      }
      if (diagCount === 3) {
        return { texturePath: 'circuit_border_corner_reversed3.png', rotationDegrees: this.rotationFromDiagMissing(diagMask) };
      }
      if (diagCount === 4) {
        return { texturePath: 'circuit_border_corner_reversed4.png', rotationDegrees: 0 };
      }
    }

    return null;
  }

  private solveTransitionFromMask(prefix: string, mask: number): TileRenderData | null {
    const count = this.countBits(mask);

    if (count === 4) {
      return { texturePath: `${prefix}_side4.png`, rotationDegrees: 0 };
    }

    if (count === 3) {
      return { texturePath: `${prefix}_side3.png`, rotationDegrees: this.rotationFromMissing(mask) };
    }

    if (count === 2) {
      const isOpposite = mask === (1 | 4) || mask === (2 | 8);
      if (isOpposite) {
        return { texturePath: `${prefix}_side_opposite.png`, rotationDegrees: this.oppositeRotation(mask) };
      }
      return { texturePath: `${prefix}_corner.png`, rotationDegrees: this.rotationFromCornerMask(mask) };
    }

    if (count === 1) {
      return { texturePath: `${prefix}_side.png`, rotationDegrees: this.rotationFromMask(mask) };
    }

    return null;
  }

  private solveHazard(type: 'poison' | 'void', neighbors: ReturnType<typeof this.getAdjacencies>): TileRenderData {
    const base = type === 'poison' ? 'poison' : 'vide';
    const otherType = type === 'poison' ? 'void' : 'poison';
    const otherMask = this.maskFrom(neighbors, otherType);
    const otherDiagMask = this.diagMaskFrom(neighbors, otherType);
    const floorMask = this.maskFrom(neighbors, 'floor') | otherMask;
    const floorDiagMask = this.diagMaskFrom(neighbors, 'floor') | otherDiagMask;
    const floorCount = this.countBits(floorMask);
    const sameMask = this.maskFrom(neighbors, type);
    const sameCount = this.countBits(sameMask);
    const floorDiagCount = this.countBits(floorDiagMask);

    if (sameCount === 4) {
      if (floorDiagCount === 1) {
        return {
          texturePath: `${base}_transition_corner_reversed.png`,
          rotationDegrees: this.rotationFromDiagMask(floorDiagMask),
        };
      }
      if (floorDiagCount === 2) {
        const isOpposite = floorDiagMask === (1 | 4) || floorDiagMask === (2 | 8);
        if (isOpposite) {
          return {
            texturePath: `${base}_transition_corner_reversed_opposite.png`,
            rotationDegrees: floorDiagMask === (1 | 4) ? 0 : 90,
          };
        }
        return {
          texturePath: `${base}_transition_corner_reversed2.png`,
          rotationDegrees: this.rotationFromDiagCornerMask(floorDiagMask),
        };
      }
      if (floorDiagCount === 3) {
        return {
          texturePath: `${base}_transition_corner_reversed3.png`,
          rotationDegrees: this.rotationFromDiagMissing(floorDiagMask),
        };
      }
      if (floorDiagCount === 4) {
        return { texturePath: `${base}_transition_corner_reversed4.png`, rotationDegrees: 0 };
      }
      return { texturePath: `${base}_base.png`, rotationDegrees: 0 };
    }

    if (sameCount === 0) {
      return { texturePath: `${base}_alone.png`, rotationDegrees: 0 };
    }

    if (floorCount === 1 && sameCount === 3) {
      const rotation = this.rotationFromMask(floorMask);
      const rotatedDiagMask = this.rotateDiagMask(floorDiagMask, (360 - rotation) % 360);
      const relevantDiagMask = rotatedDiagMask & (2 | 4);
      const diagCount = this.countBits(relevantDiagMask);
      if (diagCount === 2) {
        return { texturePath: `${base}_transition_side_and_reversed2.png`, rotationDegrees: rotation };
      }
      if (diagCount === 1) {
        const texture = (relevantDiagMask & 2)
          ? `${base}_transition_side_and_reversed.png`
          : `${base}_transition_side_and_reversed_alt.png`;
        return { texturePath: texture, rotationDegrees: rotation };
      }
    }

    if (floorCount === 2 && floorMask !== (1 | 4) && floorMask !== (2 | 8)) {
      const oppositeDiagIsFloor =
        (floorMask === (1 | 8) && (floorDiagMask & 4)) ||
        (floorMask === (1 | 2) && (floorDiagMask & 8)) ||
        (floorMask === (2 | 4) && (floorDiagMask & 1)) ||
        (floorMask === (4 | 8) && (floorDiagMask & 2));

      if (oppositeDiagIsFloor) {
        return {
          texturePath: `${base}_transition_corner_opposite_reversed.png`,
          rotationDegrees: this.rotationFromCornerMask(floorMask),
        };
      }
    }

    const transitionResult = this.solveTransitionFromMask(`${base}_transition`, floorMask);
    if (transitionResult) return transitionResult;

    return { texturePath: `${base}_base.png`, rotationDegrees: 0 };
  }

  private solveFloor(neighbors: ReturnType<typeof this.getAdjacencies>): TileRenderData {
    const hasWall =
      this.isBlockingType(neighbors.n?.type ?? null) ||
      this.isBlockingType(neighbors.s?.type ?? null) ||
      this.isBlockingType(neighbors.e?.type ?? null) ||
      this.isBlockingType(neighbors.w?.type ?? null) ||
      this.isBlockingType(neighbors.ne?.type ?? null) ||
      this.isBlockingType(neighbors.nw?.type ?? null) ||
      this.isBlockingType(neighbors.se?.type ?? null) ||
      this.isBlockingType(neighbors.sw?.type ?? null);

    if (hasWall) {
      const circuit = this.solveCircuitBorderForFloor(neighbors);
      if (circuit) return circuit;
    }

    const rand = Math.random();
    if (rand < 0.05) {
      return { texturePath: 'floor_var1.png', rotationDegrees: 0 };
    }
    if (rand < 0.10) {
      return { texturePath: 'floor_var2.png', rotationDegrees: 0 };
    }
    return { texturePath: 'floor_base.png', rotationDegrees: 0 };
  }

  private solveTile(type: TileType, neighbors: ReturnType<typeof this.getAdjacencies>): TileRenderData {
    if (type === 'spikes') {
      return { texturePath: 'spikes.png', rotationDegrees: 0 };
    }

    if (type === 'wall' || type === 'pillar') {
      return { texturePath: null, rotationDegrees: 0 };
    }

    if (type === 'poison' || type === 'void') {
      return this.solveHazard(type, neighbors);
    }

    if (type === 'floor') {
      return this.solveFloor(neighbors);
    }

    return { texturePath: 'floor_base.png', rotationDegrees: 0 };
  }

  private getTileRenderData(tile: TileData, adjacencies: ReturnType<typeof this.getAdjacencies>): TileRenderData {
    return this.solveTile(tile.type, adjacencies);
  }

  private resolveTexturePath(textureName: string | null): string | null {
    if (!textureName) return null;
    return `${this.textureBasePath}/${textureName}`;
  }

  private getTexture(path: string): Texture {
    if (!this.textureCache[path]) {
      const texture = new Texture(path, this.scene, undefined, true);
      texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
      texture.uScale = 1;
      texture.vScale = 1;
      this.textureCache[path] = texture;
    }
    return this.textureCache[path];
  }

  createTileMesh(tile: TileData): Mesh | null {
    const key = this.getTileKey(tile.x, tile.z);
    
    if (this.tileMeshes.has(key)) {
      return this.tileMeshes.get(key)!;
    }

    if (tile.type === 'wall' || tile.type === 'pillar') {
      return null;
    }

    const tileMesh = MeshBuilder.CreateGround('tile_' + key, {
      width: this.tileSize,
      height: this.tileSize,
    }, this.scene);

    tileMesh.position = new Vector3(
      this.origin.x + tile.x * this.tileSize,
      this.origin.y,
      this.origin.z + tile.z * this.tileSize
    );

    const renderData = this.getTileRenderData(tile, this.getAdjacencies(tile.x, tile.z, this.tileGrid));

    const resolvedPath = this.resolveTexturePath(renderData.texturePath);
    if (resolvedPath) {
      const material = new StandardMaterial('tile_mat_' + key, this.scene);
      material.diffuseTexture = this.getTexture(resolvedPath);
      material.emissiveColor.set(0, 0, 0);
      tileMesh.material = material;
    }

    const rotationRadians = ((renderData.rotationDegrees + this.rotationOffsetDegrees) * Math.PI) / 180;
    tileMesh.rotation = new Vector3(0, rotationRadians, 0);

    this.tileMeshes.set(key, tileMesh);
    return tileMesh;
  }

  updateTile(x: number, z: number): void {
    const key = this.getTileKey(x, z);
    const tile = this.tileGrid.get(key);
    const mesh = this.tileMeshes.get(key);

    if (!tile || !mesh || !mesh.material) return;

    const renderData = this.getTileRenderData(tile, this.getAdjacencies(x, z, this.tileGrid));
    const resolvedPath = this.resolveTexturePath(renderData.texturePath);
    if (!resolvedPath) return;
    
    (mesh.material as StandardMaterial).diffuseTexture = this.getTexture(resolvedPath);
    
    const rotationRadians = ((renderData.rotationDegrees + this.rotationOffsetDegrees) * Math.PI) / 180;
    mesh.rotation = new Vector3(0, rotationRadians, 0);
  }

  rebuildRegion(centerX: number, centerZ: number, radius: number = 2): void {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        this.updateTile(x, z);
      }
    }
  }

  clearTiles(): void {
    this.tileMeshes.forEach(mesh => {
      if (mesh) mesh.dispose();
    });
    this.tileMeshes.clear();
    this.tileGrid.clear();
  }

  dispose(): void {
    this.clearTiles();
    Object.values(this.textureCache).forEach(texture => texture.dispose());
    this.textureCache = {};
  }

  getStats(): { tileCount: number; textureCount: number; meshCount: number } {
    return {
      tileCount: this.tileGrid.size,
      textureCount: Object.keys(this.textureCache).length,
      meshCount: this.tileMeshes.size,
    };
  }
}
