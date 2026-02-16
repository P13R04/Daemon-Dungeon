/**
 * TileSystemTest - Utilities pour tester et valider le système de tiles
 */

import { TileSystem, TileData, TileType } from './TileSystem';
import { RoomLayoutParser, RoomLayout } from './RoomLayoutParser';
import { TileFloorManager } from './TileFloorManager';

export class TileSystemTest {
  /**
   * Valider que toutes les textures référencées existent
   */
  static validateTextureReferences(): { valid: boolean; missing: string[] } {
    const textureMap: { [key: string]: TileType[] } = {
      'assets/tiles_test/floor_base.png': ['floor'],
      'assets/tiles_test/floor_var1.png': ['floor'],
      'assets/tiles_test/floor_var2.png': ['floor'],
      
      // Circuit borders
      'assets/tiles_test/circuit_border_side.png': ['floor'],
      'assets/tiles_test/circuit_border_side_opposite.png': ['floor'],
      'assets/tiles_test/circuit_border_corner.png': ['floor'],
      'assets/tiles_test/circuit_border_corner_reversed.png': ['floor'],
      'assets/tiles_test/circuit_border_corner_reversed_opposite.png': ['floor'],
      'assets/tiles_test/circuit_border_corner_opposite_reversed.png': ['floor'],
      'assets/tiles_test/circuit_border_side_and_reversed.png': ['floor'],
      'assets/tiles_test/circuit_border_side_and_reversed2.png': ['floor'],
      'assets/tiles_test/circuit_border_side_and_reversed_alt.png': ['floor'],
      'assets/tiles_test/circuit_border_side3.png': ['floor'],
      'assets/tiles_test/circuit_border_side4.png': ['floor'],
      
      // Poison transitions
      'assets/tiles_test/poison_base.png': ['poison'],
      'assets/tiles_test/poison_transition_side.png': ['poison'],
      'assets/tiles_test/poison_transition_side_opposite.png': ['poison'],
      'assets/tiles_test/poison_transition_corner.png': ['poison'],
      'assets/tiles_test/poison_transition_corner_reversed.png': ['poison'],
      'assets/tiles_test/poison_transition_corner_reversed_opposite.png': ['poison'],
      'assets/tiles_test/poison_transition_side3.png': ['poison'],
      'assets/tiles_test/poison_alone.png': ['poison'],
      
      // Void transitions
      'assets/tiles_test/vide_base.png': ['void'],
      'assets/tiles_test/vide_transition_side.png': ['void'],
      'assets/tiles_test/vide_transition_side_opposite.png': ['void'],
      'assets/tiles_test/vide_transition_corner.png': ['void'],
      'assets/tiles_test/vide_transition_corner_reversed.png': ['void'],
      'assets/tiles_test/vide_transition_corner_reversed_opposite.png': ['void'],
      'assets/tiles_test/vide_transition_side3.png': ['void'],
      'assets/tiles_test/vide_alone.png': ['void'],
      
      // Others
      'assets/tiles_test/spikes.png': ['spikes'],
      'assets/tiles_test/floor_surrounded_poison.png': ['poison'],
      'assets/tiles_test/floor_surrounded_void.png': ['void'],
    };

    const missing: string[] = [];
    for (const texturePath of Object.keys(textureMap)) {
      // TODO: Vérifier si la texture existe via fetch ou XMLHttpRequest
      // Pour maintenant, juste enregistrer que nous testons
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Générer un rapport de validation de layout
   */
  static validateLayout(layout: RoomLayout): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
      width: number;
      height: number;
      tileCount: number;
      wallCount: number;
      floorCount: number;
      obstacleCount: number;
    };
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const layoutGrid = layout.layout;

    // Vérifier dimensions
    if (layoutGrid.length === 0) {
      errors.push('Layout vide');
      return { valid: false, errors, warnings, stats: { width: 0, height: 0, tileCount: 0, wallCount: 0, floorCount: 0, obstacleCount: 0 } };
    }

    const height = layoutGrid.length;
    const width = layoutGrid[0].length;

    // Vérifier rectangularité
    for (let i = 0; i < layoutGrid.length; i++) {
      if (layoutGrid[i].length !== width) {
        errors.push(`Ligne ${i} : longueur ${layoutGrid[i].length} !== ${width}`);
      }
    }

    // Compter tiles
    let wallCount = 0;
    let floorCount = 0;
    let poisonCount = 0;
    let voidCount = 0;

    for (const row of layoutGrid) {
      for (const cell of row) {
        switch (cell) {
          case '#':
            wallCount++;
            break;
          case '.':
          case 'M':
          case 'R':
          case 'S':
          case 'E':
            floorCount++;
            break;
          case 'P':
            poisonCount++;
            break;
          case 'V':
            voidCount++;
            break;
          case 'O':
            // Passthrough, compté comme obstacle
            break;
          default:
            warnings.push(`Caractère inconnu: '${cell}' à ${width}x${height}`);
        }
      }
    }

    // Vérifier qu'il y a au moins du sol
    if (floorCount === 0) {
      warnings.push('Aucun sol (.) dans le layout');
    }

    // Vérifier obstacles
    let obstacleCount = 0;
    if (layout.obstacles) {
      for (const obs of layout.obstacles) {
        if (obs.x < 0 || obs.x >= width || obs.z < 0 || obs.z >= height) {
          errors.push(`Obstacle hors limites: (${obs.x}, ${obs.z}) vs (${width}x${height})`);
        }
        obstacleCount++;
      }
    }

    const tileCount = wallCount + floorCount + poisonCount + voidCount;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        width,
        height,
        tileCount,
        wallCount,
        floorCount: floorCount + obstacleCount,
        obstacleCount,
      },
    };
  }

  /**
   * Générer un résumé des adjacences pour debug
   */
  static analyzeAdjacencies(
    tiles: TileData[],
    maxExamples: number = 5
  ): {
    summary: {
      totalTiles: number;
      tilesWithAdjacencies: number;
      edgeTiles: number;
    };
    examples: Array<{
      tile: TileData;
      description: string;
    }>;
  } {
    const tilesMap = new Map<string, TileData>();
    for (const tile of tiles) {
      tilesMap.set(`${tile.x},${tile.z}`, tile);
    }

    let tilesWithAdjacencies = 0;
    let edgeTiles = 0;
    const examples: Array<{ tile: TileData; description: string }> = [];

    for (const tile of tiles) {
      const adj = {
        n: tilesMap.get(`${tile.x},${tile.z - 1}`),
        s: tilesMap.get(`${tile.x},${tile.z + 1}`),
        e: tilesMap.get(`${tile.x + 1},${tile.z}`),
        w: tilesMap.get(`${tile.x - 1},${tile.z}`),
      };

      const adjCount = Object.values(adj).filter(a => a !== undefined).length;

      if (adjCount > 0) tilesWithAdjacencies++;
      if (adjCount < 4) edgeTiles++;

      // Enregistrer des exemples
      if (examples.length < maxExamples && (tile.type === 'wall' || adjCount > 0)) {
        examples.push({
          tile,
          description: `Type: ${tile.type}, Adjacencies: N=${!!adj.n} S=${!!adj.s} E=${!!adj.e} W=${!!adj.w}`,
        });
      }
    }

    return {
      summary: {
        totalTiles: tiles.length,
        tilesWithAdjacencies,
        edgeTiles,
      },
      examples,
    };
  }

  /**
   * Générer une carte ASCII des types de tiles
   */
  static generateAsciiMap(tiles: TileData[]): string {
    if (tiles.length === 0) return '(empty)';

    // Trouver les limites
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    for (const tile of tiles) {
      minX = Math.min(minX, tile.x);
      maxX = Math.max(maxX, tile.x);
      minZ = Math.min(minZ, tile.z);
      maxZ = Math.max(maxZ, tile.z);
    }

    // Créer une grille
    const grid: string[][] = [];
    for (let z = minZ; z <= maxZ; z++) {
      grid[z] = [];
      for (let x = minX; x <= maxX; x++) {
        grid[z][x] = '.';
      }
    }

    // Remplir avec les types
    const typeMap: { [key in TileType]: string } = {
      floor: '.',
      wall: '#',
      pillar: 'O',
      poison: 'P',
      void: 'V',
      spikes: '^',
    };

    for (const tile of tiles) {
      grid[tile.z][tile.x] = typeMap[tile.type] || '?';
    }

    // Convertir en string
    return grid.map(row => row.join('')).join('\n');
  }

  /**
   * Générer un rapport de performance
   */
  static analyzePerformance(
    floorManager: TileFloorManager,
    roomLayout: RoomLayout
  ): {
    tileCount: number;
    estimatedMemory: number;
    textureMemory: number;
    meshMemory: number;
    recommendations: string[];
  } {
    const stats = floorManager.getStatistics();
    const tileCount = stats.totalTiles;

    // Estimation mémoire (approximative)
    const tileMemory = tileCount * 48; // ~48 bytes par TileData
    const textureMemoryPerTexture = 5000; // ~5KB par texture PNG
    const textureMemory = stats.textureCount * textureMemoryPerTexture;
    const meshMemoryPerMesh = 1024; // ~1KB par mesh Ground
    const meshMemory = stats.meshCount * meshMemoryPerMesh;

    const totalMemory = tileMemory + textureMemory + meshMemory;

    const recommendations: string[] = [];

    if (tileCount > 500) {
      recommendations.push('⚠️ Plus de 500 tiles - envisager un système de chunking');
    }

    if (stats.textureCount > 50) {
      recommendations.push('⚠️ Plus de 50 textures actives - envisager l\'atlasing');
    }

    if (totalMemory > 50 * 1024 * 1024) {
      recommendations.push('⚠️ Plus de 50MB de mémoire - optimiser les textures');
    }

    return {
      tileCount,
      estimatedMemory: totalMemory,
      textureMemory,
      meshMemory,
      recommendations,
    };
  }
}
