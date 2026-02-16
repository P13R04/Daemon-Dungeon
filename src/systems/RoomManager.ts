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
  private roomMeshes: Map<string, Mesh[]> = new Map();
  private tileSize: number = 1.0;
  private configLoader: ConfigLoader;
  private hazardZones: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }> = [];
  private hazardZonesByRoom: Map<string, Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }>> = new Map();
  private roomOrigins: Map<string, Vector3> = new Map();
  private roomDoors: Map<string, Mesh> = new Map();
  private currentRoomKey: string | null = null;
  private obstacleBounds: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  private obstacleBoundsByRoom: Map<string, Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>> = new Map();
  private floorRenderingEnabled: boolean = true;

  constructor(scene: Scene, tileSize: number = 1.0) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.configLoader = ConfigLoader.getInstance();
  }

  loadRoom(roomId: string): RoomConfig | null {
    this.clearAllRooms();
    const instanceKey = `${roomId}::0`;
    const roomConfig = this.loadRoomInstance(roomId, instanceKey, new Vector3(0, 0, 0));
    if (roomConfig) {
      this.setCurrentRoom(instanceKey);
    }
    return roomConfig;
  }

  loadRoomFromConfig(roomConfig: RoomConfig, instanceKey: string, origin: Vector3, setCurrent: boolean = true): RoomConfig {
    this.roomOrigins.set(instanceKey, origin.clone());
    this.createRoomGeometry(roomConfig, instanceKey, origin.clone());
    if (setCurrent) {
      this.currentRoomKey = instanceKey;
      this.currentRoom = roomConfig;
      this.hazardZones = this.hazardZonesByRoom.get(instanceKey) || [];
      this.obstacleBounds = this.obstacleBoundsByRoom.get(instanceKey) || [];
    }
    return roomConfig;
  }

  loadRoomInstance(roomId: string, instanceKey: string, origin: Vector3): RoomConfig | null {
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

    this.roomOrigins.set(instanceKey, origin.clone());
    this.createRoomGeometry(roomConfig, instanceKey, origin.clone());
    return roomConfig;
  }

  setCurrentRoom(instanceKey: string): void {
    this.currentRoomKey = instanceKey;
    const roomId = instanceKey.split('::')[0];
    const roomsData = this.configLoader.getRooms();
    if (Array.isArray(roomsData)) {
      this.currentRoom = roomsData.find((r: any) => r.id === roomId) as RoomConfig | null;
    }
    this.hazardZones = this.hazardZonesByRoom.get(instanceKey) || [];
    this.obstacleBounds = this.obstacleBoundsByRoom.get(instanceKey) || [];
  }

  getCurrentRoomOrigin(): Vector3 {
    if (!this.currentRoomKey) return new Vector3(0, 0, 0);
    return this.roomOrigins.get(this.currentRoomKey) ?? new Vector3(0, 0, 0);
  }

  setFloorRenderingEnabled(enabled: boolean): void {
    this.floorRenderingEnabled = enabled;
  }

  private createRoomGeometry(config: RoomConfig, instanceKey: string, origin: Vector3): void {
    // Clear previous instance meshes
    const prevMeshes = this.roomMeshes.get(instanceKey);
    if (prevMeshes) {
      prevMeshes.forEach(mesh => mesh.dispose());
    }
    this.roomMeshes.set(instanceKey, []);

    this.hazardZonesByRoom.set(instanceKey, []);
    this.obstacleBoundsByRoom.set(instanceKey, []);

    const layout = config.layout;
    const height = layout.length;
    const width = layout[0].length;

    // Create floor tiles and walls based on layout
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = layout[y][x];
        const position = new Vector3(
          origin.x + x * this.tileSize,
          0,
          origin.z + y * this.tileSize
        );

        if (char === '#') {
          // Wall
          const wall = VisualPlaceholder.createFloorTile(this.scene, `wall_${x}_${y}`, true);
          wall.position = position.add(new Vector3(0, 0.5, 0));
          wall.scaling = new Vector3(1, 2, 1);
          this.roomMeshes.get(instanceKey)!.push(wall);
        } else if (this.floorRenderingEnabled && (char === '.' || char === 'S' || char === 'E' || char === 'M' || char === 'R' || char === 'O' || char === 'P' || char === 'V' || char === '^')) {
          const floor = VisualPlaceholder.createFloorTile(this.scene, `floor_${x}_${y}`, false);
          floor.position = position;
          this.roomMeshes.get(instanceKey)!.push(floor);
        }
      }
    }

    // Door at bottom center of room
    const doorX = origin.x + Math.floor(width / 2) * this.tileSize + this.tileSize / 2;
    const doorZ = origin.z + (height - 2) * this.tileSize + this.tileSize / 2;
    const door = VisualPlaceholder.createFloorTile(this.scene, `door_${instanceKey}`, true);
    door.position = new Vector3(doorX, 0.6, doorZ);
    door.scaling = new Vector3(0.8, 1.2, 0.4);
    const doorMat = new StandardMaterial(`door_${instanceKey}_mat`, this.scene);
    doorMat.diffuseColor = new Color3(0.2, 0.6, 1.0);
    doorMat.emissiveColor = new Color3(0.1, 0.3, 0.6);
    door.material = doorMat;
    door.isVisible = false;
    this.roomDoors.set(instanceKey, door);
    this.roomMeshes.get(instanceKey)!.push(door);

    // Create obstacles and hazards
    config.obstacles.forEach((obstacle, i) => {
      const width = Math.max(1, obstacle.width || 1);
      const height = Math.max(1, obstacle.height || 1);

      const position = new Vector3(
        origin.x + obstacle.x * this.tileSize + (width * this.tileSize) / 2,
        0.4,
        origin.z + obstacle.y * this.tileSize + (height * this.tileSize) / 2
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

        this.hazardZonesByRoom.get(instanceKey)!.push({
          minX: origin.x + obstacle.x * this.tileSize,
          maxX: origin.x + obstacle.x * this.tileSize + width * this.tileSize,
          minZ: origin.z + obstacle.y * this.tileSize,
          maxZ: origin.z + obstacle.y * this.tileSize + height * this.tileSize,
          damage: obstacle.damage ?? 5,
        });
      } else {
        this.obstacleBoundsByRoom.get(instanceKey)!.push({
          minX: origin.x + obstacle.x * this.tileSize,
          maxX: origin.x + obstacle.x * this.tileSize + width * this.tileSize,
          minZ: origin.z + obstacle.y * this.tileSize,
          maxZ: origin.z + obstacle.y * this.tileSize + height * this.tileSize,
        });
      }

      this.roomMeshes.get(instanceKey)!.push(mesh);
    });
  }

  getCurrentRoom(): RoomConfig | null {
    return this.currentRoom;
  }

  getPlayerSpawnPoint(roomId?: string): Vector3 | null {
    const room = roomId ? (this.configLoader.getRooms() as any[]).find(r => r.id === roomId) : this.currentRoom;
    if (!room) return null;

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);

    const spawn = room.playerSpawnPoint;
    return new Vector3(
      (origin?.x ?? 0) + spawn.x * this.tileSize + this.tileSize / 2,
      0.5,
      (origin?.z ?? 0) + spawn.y * this.tileSize + this.tileSize / 2
    );
  }

  getSpawnPoints(roomId?: string): Vector3[] {
    const room = roomId ? (this.configLoader.getRooms() as any[]).find((r: any) => r.id === roomId) : this.currentRoom;
    if (!room) {
      return [];
    }

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);

    const points = room.spawnPoints.map((point: any) => {
      const pos = new Vector3(
        (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
        1.0,
        (origin?.z ?? 0) + point.y * this.tileSize + this.tileSize / 2
      );
      return pos;
    });
    return points;
  }

  getSpawnPointsWithType(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    return this.currentRoom.spawnPoints.map(point => ({
      position: new Vector3(
        (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
        1.0,
        (origin?.z ?? 0) + point.y * this.tileSize + this.tileSize / 2
      ),
      enemyType: point.enemyType,
    }));
  }

  getEnemySpawnPoints(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);

    return this.currentRoom.spawnPoints.map(point => ({
      position: new Vector3(
        (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
        0.5,
        (origin?.z ?? 0) + point.y * this.tileSize + this.tileSize / 2
      ),
      enemyType: point.enemyType,
    }));
  }

  isWalkable(x: number, z: number): boolean {
    if (!this.currentRoom) return false;

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const localX = x - (origin?.x ?? 0);
    const localZ = z - (origin?.z ?? 0);

    const tileX = Math.floor(localX / this.tileSize);
    const tileZ = Math.floor(localZ / this.tileSize);

    if (tileZ < 0 || tileZ >= this.currentRoom.layout.length) return false;
    if (tileX < 0 || tileX >= this.currentRoom.layout[0].length) return false;

    const char = this.currentRoom.layout[tileZ][tileX];
    return char !== '#' && char !== 'V';
  }

  getRoomBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!this.currentRoom) return null;

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);

    const width = this.currentRoom.layout[0].length;
    const height = this.currentRoom.layout.length;

    return {
      minX: (origin?.x ?? 0),
      maxX: (origin?.x ?? 0) + width * this.tileSize,
      minZ: (origin?.z ?? 0),
      maxZ: (origin?.z ?? 0) + height * this.tileSize,
    };
  }

  getRoomBoundsForInstance(instanceKey: string): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    const roomId = instanceKey.split('::')[0];
    const roomsData = this.configLoader.getRooms();
    if (!Array.isArray(roomsData)) return null;
    const room = roomsData.find((r: any) => r.id === roomId) as RoomConfig | undefined;
    if (!room) return null;

    const origin = this.roomOrigins.get(instanceKey) ?? new Vector3(0, 0, 0);
    const width = room.layout[0].length;
    const height = room.layout.length;

    return {
      minX: origin.x,
      maxX: origin.x + width * this.tileSize,
      minZ: origin.z,
      maxZ: origin.z + height * this.tileSize,
    };
  }

  getHazardZones(): Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }> {
    return this.hazardZones;
  }

  getObstacleBounds(): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
    return this.obstacleBounds;
  }

  setDoorActive(active: boolean): void {
    if (!this.currentRoomKey) return;
    const door = this.roomDoors.get(this.currentRoomKey);
    if (door) {
      door.isVisible = active;
    }
  }

  getDoorPosition(): Vector3 | null {
    if (!this.currentRoomKey) return null;
    const door = this.roomDoors.get(this.currentRoomKey);
    return door ? door.position.clone() : null;
  }

  clearAllRooms(): void {
    for (const meshes of this.roomMeshes.values()) {
      meshes.forEach(mesh => mesh.dispose());
    }
    this.roomMeshes.clear();
    this.roomOrigins.clear();
    this.roomDoors.clear();
    this.hazardZones = [];
    this.hazardZonesByRoom.clear();
    this.obstacleBounds = [];
    this.obstacleBoundsByRoom.clear();
  }

  dispose(): void {
    this.clearAllRooms();
  }
}
