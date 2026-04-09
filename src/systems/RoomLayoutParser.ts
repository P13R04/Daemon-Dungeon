/**
 * RoomLayoutParser - Converts ASCII layout to tile grid
 */

import { TileData, TileType } from './TileSystem';

export interface RoomSpawnPoint {
  x: number;
  z: number;
  type?: string;
  [key: string]: unknown;
}

export interface RoomObstacle {
  x: number;
  z: number;
  y?: number;
  type: string;
  [key: string]: unknown;
}

export interface RoomLayout {
  layout: Array<string | string[]>;
  spawnPoints?: RoomSpawnPoint[];
  obstacles?: RoomObstacle[];
}

export interface TileMappingLayout {
  width: number;
  height: number;
  tiles: string[][];
}

export class RoomLayoutParser {
  /**
   * Parse ASCII room layout into tile grid
   * 
   * ASCII Legend:
   * '#' = wall
   * '.' = floor (will use floor_base, floor_var1, floor_var2 mixed)
   * 'P' = poison
   * 'V' = void
   * 'O' = obstacle/pillar
   * 'M', 'R', 'S' etc = spawn points (will be floor)
   */
  static parseLayout(roomLayout: RoomLayout | Array<string | string[]>): TileData[] {
    const tiles: TileData[] = [];

    const layoutData = Array.isArray(roomLayout) ? roomLayout : roomLayout.layout;
    if (!layoutData) {
      throw new Error('Invalid layout: layout data is missing');
    }

    const layout = layoutData as Array<string | string[]>;
    const layoutWidth = layout.reduce((max, row) => {
      if (!row) return max;
      const rowData = typeof row === 'string' ? row : row.join('');
      return Math.max(max, rowData.length);
    }, 0);

    for (let y = 0; y < layout.length; y++) {
      const row = layout[y];
      if (!row) continue;

      const rowData = typeof row === 'string' ? row : row.join('');

      for (let x = 0; x < layoutWidth; x++) {
        // Missing cells are treated as walls to avoid holes in malformed rows.
        const cell = rowData[x] ?? '#';
        // Invert Z axis: first line (y=0) should have largest Z (far/top), last line should have smallest Z (near/bottom)
        const z = layout.length - 1 - y;
        const tileData = this.cellToTile(cell, x, z);

        if (tileData) {
          tiles.push(tileData);
        }
      }
    }

    // Add obstacles as pillar tiles
    if (!Array.isArray(roomLayout) && roomLayout.obstacles) {
      for (const obstacle of roomLayout.obstacles) {
        const obstacleZ = Number.isFinite(obstacle.z)
          ? obstacle.z
          : (Number.isFinite(obstacle.y) ? obstacle.y : undefined);
        if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacleZ)) {
          continue;
        }

        const key = `${obstacle.x},${obstacleZ}`;
        // Remove existing tile if present
        const existingIndex = tiles.findIndex(
          t => `${t.x},${t.z}` === key
        );
        if (existingIndex !== -1) {
          tiles.splice(existingIndex, 1);
        }

        // Obstacles are rendered as walls for consistent room readability.
        tiles.push({
          type: 'wall',
          x: obstacle.x,
          z: obstacleZ as number,
        });
      }
    }

    return tiles;
  }

  /**
   * Convert a single cell character to a tile
   */
  private static cellToTile(cell: string, x: number, z: number): TileData | null {
    let type: TileType | null = null;

    switch (cell) {
      case '#':
        type = 'wall';
        break;
      case '.':
        type = 'floor';
        break;
      case 'P':
        type = 'poison';
        break;
      case 'V':
        type = 'void';
        break;
      case '^':
        type = 'spikes';
        break;
      case 'O':
        type = 'wall';
        break;
      case 'M':
      case 'R':
      case 'S':
      case 'E':
        type = 'floor';
        break;
      default:
        type = 'floor';
        break;
    }

    if (!type) return null;

    return { type, x, z };
  }

  /**
   * Randomly select a floor variant for variety
   */
  static fromTileMapping(mapping: TileMappingLayout): RoomLayout {
    const layout: string[] = [];
    const obstacles: Array<{ x: number; z: number; type: string }> = [];

    for (let y = 0; y < mapping.height; y++) {
      const row = mapping.tiles[y] || [];
      let rowStr = '';
      for (let x = 0; x < mapping.width; x++) {
        const cell = row[x] ?? 'void';
        // Invert Z axis to match camera view
        const z = mapping.height - 1 - y;
        
        switch (cell) {
          case 'wall':
            rowStr += '#';
            break;
          case 'poison':
            rowStr += 'P';
            break;
          case 'void':
            rowStr += 'V';
            break;
          case 'spikes':
            rowStr += '^';
            break;
          case 'pillar':
            rowStr += '.';
            obstacles.push({ x, z, type: 'pillar' });
            break;
          case 'floor':
          default:
            rowStr += '.';
            break;
        }
      }
      layout.push(rowStr);
    }

    return { layout, obstacles, spawnPoints: [] };
  }

  /**
   * Get spawn points from room layout
   */
  static getSpawnPoints(roomLayout: RoomLayout): RoomSpawnPoint[] {
    const spawnPoints: RoomSpawnPoint[] = [];
    const layout = roomLayout.layout;

    // Extract from layout grid
    for (let y = 0; y < layout.length; y++) {
      const row = layout[y];
      const rowData = typeof row === 'string' ? row : row.join('');
      for (let x = 0; x < rowData.length; x++) {
        const cell = rowData[x];
        if (['M', 'R', 'S', 'E'].includes(cell)) {
          // Invert Z axis to match camera view
          const z = layout.length - 1 - y;
          spawnPoints.push({
            x,
            z,
            type: this.cellToSpawnType(cell),
          });
        }
      }
    }

    // Add from explicit spawn points in data
    if (roomLayout.spawnPoints) {
      spawnPoints.push(...roomLayout.spawnPoints);
    }

    return spawnPoints;
  }

  /**
   * Map cell character to spawn type
   */
  private static cellToSpawnType(cell: string): string {
    const map: { [key: string]: string } = {
      'M': 'melee',
      'R': 'ranged',
      'S': 'special',
      'E': 'elite',
    };
    return map[cell] || 'melee';
  }
}
