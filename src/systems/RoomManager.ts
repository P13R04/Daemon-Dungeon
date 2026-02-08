/**
 * RoomManager - Manages room creation, loading, and tiles
 */

import { Scene, Mesh, Vector3, StandardMaterial, Color3 } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { ConfigLoader } from '../utils/ConfigLoader';

export interface RoomConfig {
  id: string;
  name: string;
  layout: string[];
  spawnPoints: Array<{ x: number; y: number; enemyType: string }>;
  playerSpawnPoint: { x: number; y: number };
  obstacles: Array<{ x: number; y: number; width: number; height: number; type: string; damage?: number }>;
}

export class RoomManager {
  private scene: Scene;
  private currentRoom: RoomConfig | null = null;
  private roomMeshes: Map<string, Mesh> = new Map();
  private tileSize: number = 1.0;
  private configLoader: ConfigLoader;
  private hazardZones: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }> = [];

  constructor(scene: Scene, tileSize: number = 1.0) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.configLoader = ConfigLoader.getInstance();
  }

  loadRoom(roomId: string): RoomConfig | null {
    const roomsData = this.configLoader.getRooms();
    if (!roomsData || !Array.isArray(roomsData)) {
      console.error('No rooms data loaded');
      return null;
    }

    const roomConfig = roomsData.find((r: any) => r.id === roomId) as RoomConfig | undefined;
    if (!roomConfig) {
      console.error(`Room ${roomId} not found`);
      return null;
    }

    this.currentRoom = roomConfig;
    this.createRoomGeometry(roomConfig);
    return roomConfig;
  }

  private createRoomGeometry(config: RoomConfig): void {
    // Clear previous room meshes
    this.roomMeshes.forEach(mesh => mesh.dispose());
    this.roomMeshes.clear();
    this.hazardZones = [];

    const layout = config.layout;
    const height = layout.length;
    const width = layout[0].length;

    // Create floor tiles and walls based on layout
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = layout[y][x];
        const position = new Vector3(x * this.tileSize, 0, y * this.tileSize);

        if (char === '#') {
          // Wall
          const wall = VisualPlaceholder.createFloorTile(this.scene, `wall_${x}_${y}`, true);
          wall.position = position.add(new Vector3(0, 0.5, 0));
          wall.scaling = new Vector3(1, 2, 1);
          this.roomMeshes.set(`wall_${x}_${y}`, wall);
        } else if (char === '.' || char === 'S' || char === 'E' || char === 'M' || char === 'R' || char === 'O') {
          // Floor
          const floor = VisualPlaceholder.createFloorTile(this.scene, `floor_${x}_${y}`, false);
          floor.position = position;
          this.roomMeshes.set(`floor_${x}_${y}`, floor);
        }
      }
    }

    // Create obstacles and hazards
    config.obstacles.forEach((obstacle, i) => {
      const width = Math.max(1, obstacle.width || 1);
      const height = Math.max(1, obstacle.height || 1);

      const position = new Vector3(
        obstacle.x * this.tileSize + (width * this.tileSize) / 2,
        0.4,
        obstacle.y * this.tileSize + (height * this.tileSize) / 2
      );

      const mesh = VisualPlaceholder.createFloorTile(this.scene, `obstacle_${i}`, obstacle.type !== 'hazard');
      mesh.position = position;
      mesh.scaling = new Vector3(width * this.tileSize, obstacle.type === 'hazard' ? 0.2 : 1, height * this.tileSize);

      if (obstacle.type === 'hazard') {
        const mat = new StandardMaterial(`hazard_${i}_mat`, this.scene);
        mat.diffuseColor = new Color3(1.0, 0.2, 0.2);
        mat.emissiveColor = new Color3(0.6, 0.1, 0.1);
        mat.alpha = 0.9;
        mesh.material = mat;

        this.hazardZones.push({
          minX: obstacle.x * this.tileSize,
          maxX: obstacle.x * this.tileSize + width * this.tileSize,
          minZ: obstacle.y * this.tileSize,
          maxZ: obstacle.y * this.tileSize + height * this.tileSize,
          damage: obstacle.damage ?? 5,
        });
      }

      this.roomMeshes.set(`obstacle_${i}`, mesh);
    });
  }

  getCurrentRoom(): RoomConfig | null {
    return this.currentRoom;
  }

  getPlayerSpawnPoint(roomId?: string): Vector3 | null {
    const room = roomId ? (this.configLoader.getRooms() as any[]).find(r => r.id === roomId) : this.currentRoom;
    if (!room) return null;

    const spawn = room.playerSpawnPoint;
    return new Vector3(
      spawn.x * this.tileSize + this.tileSize / 2,
      0.5,
      spawn.y * this.tileSize + this.tileSize / 2
    );
  }

  getSpawnPoints(roomId?: string): Vector3[] {
    const room = roomId ? (this.configLoader.getRooms() as any[]).find((r: any) => r.id === roomId) : this.currentRoom;
    if (!room) {
      return [];
    }

    const points = room.spawnPoints.map((point: any) => {
      const pos = new Vector3(
        point.x * this.tileSize + this.tileSize / 2,
        1.0,
        point.y * this.tileSize + this.tileSize / 2
      );
      return pos;
    });
    return points;
  }

  getEnemySpawnPoints(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    return this.currentRoom.spawnPoints.map(point => ({
      position: new Vector3(
        point.x * this.tileSize + this.tileSize / 2,
        0.5,
        point.y * this.tileSize + this.tileSize / 2
      ),
      enemyType: point.enemyType,
    }));
  }

  isWalkable(x: number, z: number): boolean {
    if (!this.currentRoom) return false;

    const tileX = Math.floor(x / this.tileSize);
    const tileZ = Math.floor(z / this.tileSize);

    if (tileZ < 0 || tileZ >= this.currentRoom.layout.length) return false;
    if (tileX < 0 || tileX >= this.currentRoom.layout[0].length) return false;

    const char = this.currentRoom.layout[tileZ][tileX];
    return char !== '#';
  }

  getRoomBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!this.currentRoom) return null;

    const width = this.currentRoom.layout[0].length;
    const height = this.currentRoom.layout.length;

    return {
      minX: 0,
      maxX: width * this.tileSize,
      minZ: 0,
      maxZ: height * this.tileSize,
    };
  }

  getHazardZones(): Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }> {
    return this.hazardZones;
  }

  dispose(): void {
    this.roomMeshes.forEach(mesh => mesh.dispose());
    this.roomMeshes.clear();
  }
}
