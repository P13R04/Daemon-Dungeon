/**
 * RoomManagerTileAdapter - Adapter pour intégrer le TileSystem au RoomManager existant
 * 
 * Ce fichier montre comment utiliser les deux systèmes ensemble
 * sans modifier le RoomManager existant
 */

import { RoomManager, RoomConfig } from './RoomManager';
import { TileFloorManager } from './TileFloorManager';
import { RoomLayoutParser, RoomLayout } from './RoomLayoutParser';

export class RoomManagerTileAdapter {
  private roomManager: RoomManager;
  private tileFloorManager: TileFloorManager;
  private roomLayoutMap: Map<string, RoomLayout> = new Map();

  constructor(roomManager: RoomManager, tileFloorManager: TileFloorManager) {
    this.roomManager = roomManager;
    this.tileFloorManager = tileFloorManager;
  }

  /**
   * Enregistrer un layout de salle (format tiles)
   * Avant de charger la salle avec RoomManager
   */
  registerRoomLayout(roomId: string, layout: RoomLayout): void {
    this.roomLayoutMap.set(roomId, layout);
  }

  /**
   * Wrapper autour de loadRoom qui charge aussi les tiles
   */
  loadRoomWithTiles(roomId: string): RoomConfig | null {
    // Charger la salle avec le RoomManager (géométrie existante)
    const config = this.roomManager.loadRoom(roomId);

    // Si on a un layout tiles pour cette salle, le charger aussi
    if (this.roomLayoutMap.has(roomId)) {
      const layout = this.roomLayoutMap.get(roomId)!;
      this.tileFloorManager.loadRoomFloor(layout);
      console.log(`Loaded tiles for room: ${roomId}`);
    } else {
      console.warn(`No tile layout registered for room: ${roomId}`);
    }

    return config;
  }

  /**
   * Alternative: Convertir directement un RoomConfig en RoomLayout
   * (pour les salles utilisant le format ASCII existant)
   */
  convertRoomConfigToLayout(config: RoomConfig): RoomLayout {
    // Si le RoomManager utilise déjà un format ASCII, on peut le convertir
    const layout: RoomLayout = {
      layout: config.layout.map(line => line.split('')),
      spawnPoints: config.spawnPoints.map(sp => ({
        x: sp.x,
        z: sp.y, // Note: y → z (2D)
        type: sp.enemyType,
      })),
      obstacles: config.obstacles.map(obs => ({
        x: Math.floor(obs.x),
        z: Math.floor(obs.y), // Note: y → z (2D)
        type: obs.type,
      })),
    };

    return layout;
  }

  /**
   * Mettre à jour les tiles après destruction d'obstacle
   * Coordonné avec le RoomManager
   */
  notifyObstacleDestroyed(x: number, z: number): void {
    // Notifier le TileSystem de regénérer les textures
    this.tileFloorManager.updateRegion(x, z, 2);
  }

  /**
   * Vérifier la marchabilité en utilisant les deux systèmes
   */
  canWalkAt(x: number, z: number): boolean {
    // D'abord vérifier les tiles
    if (!this.tileFloorManager.isWalkable(x, z)) {
      return false;
    }

    // Optionnel: vérifier aussi les obstacles du RoomManager
    // (si vous voulez garder la cohérence avec les deux systèmes)

    return true;
  }

  /**
   * Obtenir les infos complètes d'une position
   */
  getTileInfo(x: number, z: number) {
    const tile = this.tileFloorManager.getTileAt(x, z);
    const walkable = this.tileFloorManager.isWalkable(x, z);

    return {
      tile,
      walkable,
      x,
      z,
    };
  }

  /**
   * Nettoyer les deux systèmes
   */
  dispose(): void {
    this.tileFloorManager.dispose();
    this.roomLayoutMap.clear();
  }
}

/**
 * EXEMPLE D'UTILISATION
 * 
 * // Dans GameManager:
 * 
 * import { RoomManagerTileAdapter } from './systems/RoomManagerTileAdapter';
 * 
 * export class GameManager {
 *   private roomManager!: RoomManager;
 *   private tileFloorManager!: TileFloorManager;
 *   private tileAdapter!: RoomManagerTileAdapter;
 * 
 *   async initialize(canvas: HTMLCanvasElement) {
 *     // ... setup ...
 * 
 *     this.roomManager = new RoomManager(this.scene);
 *     this.tileFloorManager = new TileFloorManager(this.scene, 1);
 *     this.tileAdapter = new RoomManagerTileAdapter(this.roomManager, this.tileFloorManager);
 * 
 *     // Enregistrer les layouts tiles
 *     const tileLayouts = await import('./data/tile_layouts.json');
 *     for (const [roomId, layout] of Object.entries(tileLayouts)) {
 *       this.tileAdapter.registerRoomLayout(roomId, layout as RoomLayout);
 *     }
 *   }
 * 
 *   async loadRoom(roomId: string) {
 *     // Utiliser l'adapter au lieu de roomManager.loadRoom
 *     this.tileAdapter.loadRoomWithTiles(roomId);
 *   }
 * 
 *   canMoveToPosition(x: number, z: number): boolean {
 *     return this.tileAdapter.canWalkAt(x, z);
 *   }
 * }
 */
