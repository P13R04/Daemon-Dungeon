/**
 * RoomLayoutParser - Converts ASCII layout to tile grid
 */

import { TileData, TileType } from './TileSystem';

export interface RoomLayout {
  layout: Array<string | string[]>;
  spawnPoints?: Array<{ x: number; z: number; [key: string]: any }>;
  obstacles?: Array<{ x: number; z: number; type: string }>;
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
  static parseLayout(roomLayout: RoomLayout | any): TileData[] {
    const tiles: TileData[] = [];
    
    // Handle both direct layout (string[]) and roomLayout object
    let layoutData = roomLayout;
    if (roomLayout && roomLayout.layout) {
      layoutData = roomLayout.layout;
    }
    
    if (!layoutData) {
      throw new Error('Invalid layout: layout data is missing');
    }

    const layout = layoutData as Array<string | string[]>;

    for (let z = 0; z < layout.length; z++) {
      const row = layout[z];
      if (!row) continue;

      const rowData = typeof row === 'string' ? row : row.join('');

      for (let x = 0; x < rowData.length; x++) {
        const cell = rowData[x];
        const tileData = this.cellToTile(cell, x, z);

        if (tileData) {
          tiles.push(tileData);
        }
      }
    }

    // Add obstacles as pillar tiles
    if (roomLayout.obstacles) {
      for (const obstacle of roomLayout.obstacles) {
        const key = `${obstacle.x},${obstacle.z}`;
        // Remove existing tile if present
        const existingIndex = tiles.findIndex(
          t => `${t.x},${t.z}` === key
        );
        if (existingIndex !== -1) {
          tiles.splice(existingIndex, 1);
        }

        // Add pillar tile
        tiles.push({
          type: 'pillar',
          x: obstacle.x,
          z: obstacle.z,
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
        type = 'floor'; // Obstacles are added separately
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

    for (let z = 0; z < mapping.height; z++) {
      const row = mapping.tiles[z] || [];
      let rowStr = '';
      for (let x = 0; x < mapping.width; x++) {
        const cell = row[x] ?? 'void';
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
  static getSpawnPoints(roomLayout: RoomLayout): Array<{ x: number; z: number; [key: string]: any }> {
    const spawnPoints: Array<{ x: number; z: number; [key: string]: any }> = [];
    const layout = roomLayout.layout;

    // Extract from layout grid
    for (let z = 0; z < layout.length; z++) {
      const row = layout[z];
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        if (['M', 'R', 'S', 'E'].includes(cell)) {
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
