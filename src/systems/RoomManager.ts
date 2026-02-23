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
  private wallsVisible: boolean = true; // Toggle for walls/pillars visibility

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
        // Invert Y to Z to match tile system (layout[0] = far/top = max Z)
        const z = height - 1 - y;
        const position = new Vector3(
          origin.x + x * this.tileSize,
          0,
          origin.z + z * this.tileSize
        );

        if (char === '#') {
          // Wall - centered on tile, scaled to fill entire tile
          const wall = VisualPlaceholder.createFloorTile(this.scene, `wall_${x}_${y}`, true);
          wall.position = position.add(new Vector3(this.tileSize / 2, 1.0, this.tileSize / 2)); // Center on tile, height 1.0
          wall.scaling = new Vector3(this.tileSize, 2, this.tileSize); // Scale to fill tile, height 2
          wall.isVisible = this.wallsVisible; // Respect visibility setting
          this.roomMeshes.get(instanceKey)!.push(wall);
          
          // Add hitbox for wall collision
          this.obstacleBoundsByRoom.get(instanceKey)!.push({
            minX: origin.x + x * this.tileSize,
            maxX: origin.x + (x + 1) * this.tileSize,
            minZ: origin.z + z * this.tileSize,
            maxZ: origin.z + (z + 1) * this.tileSize,
          });
        } else if (this.floorRenderingEnabled && (char === '.' || char === 'S' || char === 'E' || char === 'M' || char === 'R' || char === 'O' || char === 'P' || char === 'V' || char === '^')) {
          const floor = VisualPlaceholder.createFloorTile(this.scene, `floor_${x}_${y}`, false);
          floor.position = position.add(new Vector3(this.tileSize / 2, 0, this.tileSize / 2)); // Center floor on tile
          floor.scaling = new Vector3(this.tileSize, 1, this.tileSize); // Scale to fill tile
          this.roomMeshes.get(instanceKey)!.push(floor);
        }
      }
    }

    // Door at top center of room (large Z = far/top after Z inversion)
    const doorX = origin.x + Math.floor(width / 2) * this.tileSize + this.tileSize / 2;
    const doorZ = origin.z + (height - 2) * this.tileSize + this.tileSize / 2;  // Near max Z (far/top)
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

    // Create obstacles (pillars only - hazards are now handled by poison/spike tiles)
    const layoutHeight = config.layout.length;
    config.obstacles.forEach((obstacle, i) => {
      // Skip hazard type obstacles - use poison tiles (P) in layout instead
      if (obstacle.type === 'hazard') {
        return;
      }

      const width = Math.max(1, obstacle.width || 1);
      const height = Math.max(1, obstacle.height || 1);
      
      // Note: obstacle.y is already inverted in rooms.json to match Z-axis inversion

      const position = new Vector3(
        origin.x + obstacle.x * this.tileSize + (width * this.tileSize) / 2,
        0.4,
        origin.z + obstacle.y * this.tileSize + (height * this.tileSize) / 2
      );

      const mesh = VisualPlaceholder.createFloorTile(this.scene, `obstacle_${i}`, true);
      mesh.position = position;
      mesh.scaling = new Vector3(width * this.tileSize, 1, height * this.tileSize);

      // Add collision bounds for solid obstacles
      this.obstacleBoundsByRoom.get(instanceKey)!.push({
        minX: origin.x + obstacle.x * this.tileSize,
        maxX: origin.x + obstacle.x * this.tileSize + width * this.tileSize,
        minZ: origin.z + obstacle.y * this.tileSize,
        maxZ: origin.z + obstacle.y * this.tileSize + height * this.tileSize,
      });

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

    // Auto-calculate spawn point: at bottom of room (small Z = near/bottom), centered horizontally
    const layout = room.layout;
    const width = layout[0].length;
    const height = layout.length;
    const spawnX = Math.floor(width / 2); // Center horizontally
    const spawnZ = 1; // Small Z = near/bottom (opposite of door which is at height-2)

    return new Vector3(
      (origin?.x ?? 0) + spawnX * this.tileSize + this.tileSize / 2,
      0.5,
      (origin?.z ?? 0) + spawnZ * this.tileSize + this.tileSize / 2
    );
  }

  getSpawnPoints(roomId?: string): Vector3[] {
    const room = roomId ? (this.configLoader.getRooms() as any[]).find((r: any) => r.id === roomId) : this.currentRoom;
    if (!room) {
      return [];
    }

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = room.layout.length;

    const points = room.spawnPoints.map((point: any) => {
      // Invert Y coordinate to match Z axis inversion
      const invertedY = layoutHeight - 1 - point.y;
      const pos = new Vector3(
        (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
        1.0,
        (origin?.z ?? 0) + invertedY * this.tileSize + this.tileSize / 2
      );
      return pos;
    });
    return points;
  }

  getSpawnPointsWithType(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = this.currentRoom.layout.length;
    
    return this.currentRoom.spawnPoints.map(point => ({
      position: new Vector3(
        (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
        1.0,
        (origin?.z ?? 0) + (layoutHeight - 1 - point.y) * this.tileSize + this.tileSize / 2
      ),
      enemyType: point.enemyType,
    }));
  }

  getEnemySpawnPoints(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = this.currentRoom.layout.length;

    return this.currentRoom.spawnPoints.map(point => ({
      position: new Vector3(
        (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
        0.5,
        (origin?.z ?? 0) + (layoutHeight - 1 - point.y) * this.tileSize + this.tileSize / 2
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

  public setWallsVisible(visible: boolean): void {
    this.wallsVisible = visible;
    // Update all existing walls
    for (const meshes of this.roomMeshes.values()) {
      for (const mesh of meshes) {
        if (mesh.name.includes('wall_')) {
          mesh.isVisible = visible;
        }
      }
    }
  }

  public areWallsVisible(): boolean {
    return this.wallsVisible;
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
