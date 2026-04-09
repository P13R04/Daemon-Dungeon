/**
 * RoomManager - Manages room creation, loading, and tiles
 */

import { Scene, Mesh, AbstractMesh, Vector3, StandardMaterial, Color3, TransformNode, MeshBuilder } from '@babylonjs/core';
import { PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core/Physics/v2';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { ConfigLoader } from '../utils/ConfigLoader';
import { ProceduralDungeonTheme } from './ProceduralDungeonTheme';
import { ProceduralReliefTheme } from './ProceduralReliefTheme';
import { Pathfinding } from '../ai/pathfinding/AStar';

const N = 1;
const E = 2;
const S = 4;
const W = 8;

export interface RoomConfig {
  id: string;
  name: string;
  roomType?: string;
  layout: string[];
  spawnPoints: Array<{ x: number; y?: number; z?: number; enemyType?: string }>;
  playerSpawnPoint?: { x: number; y: number };
  obstacles: Array<{ x: number; y?: number; z?: number; width: number; height: number; type: string; damage?: number }>;
  pushables?: Array<{ x: number; y: number; size?: number }>;
  mobileHazards?: Array<{
    type: 'spinning_blade';
    startX: number;
    startY: number;
    endX?: number;
    endY?: number;
    speed?: number;
    radius?: number;
    damagePerSecond?: number;
    spinSpeed?: number;
  }>;
}

export interface NavigationCapabilities {
  canFly?: boolean;
  avoidVoid?: boolean;
  canFallIntoVoid?: boolean;
}

type PushableCrate = {
  mesh: Mesh;
  halfSize: number;
};

type MobileHazard = {
  mesh: Mesh;
  start: Vector3;
  end: Vector3;
  direction: 1 | -1;
  speed: number;
  radius: number;
  damagePerSecond: number;
  spinSpeed: number;
  spinAngle: number;
};

export type RoomTileType = 'floor' | 'wall' | 'void' | 'out';

function isRoomConfig(value: unknown): value is RoomConfig {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<RoomConfig>;
  return (
    typeof maybe.id === 'string'
    && Array.isArray(maybe.layout)
    && Array.isArray(maybe.spawnPoints)
    && Array.isArray(maybe.obstacles)
  );
}

export class RoomManager {
  private scene: Scene;
  private currentRoom: RoomConfig | null = null;
  private roomMeshes: Map<string, AbstractMesh[]> = new Map();
  private roomReliefRoots: Map<string, TransformNode[]> = new Map();
  private tileSize: number = 1.0;
  private configLoader: ConfigLoader;
  private hazardZones: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }> = [];
  private hazardZonesByRoom: Map<string, Array<{ minX: number; maxX: number; minZ: number; maxZ: number; damage: number }>> = new Map();
  private roomOrigins: Map<string, Vector3> = new Map();
  private roomDoors: Map<string, Mesh> = new Map();
  private roomPhysicsAggregates: Map<string, PhysicsAggregate[]> = new Map();
  private currentRoomKey: string | null = null;
  private obstacleBounds: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  private obstacleBoundsByRoom: Map<string, Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>> = new Map();
  private pushableCratesByRoom: Map<string, PushableCrate[]> = new Map();
  private mobileHazardsByRoom: Map<string, MobileHazard[]> = new Map();
  private floorRenderingEnabled: boolean = true;
  private wallsVisible: boolean = true; // Toggle for walls/pillars visibility
  private renderProfile: 'classic' | 'neoDungeonTest' | 'proceduralRelief' = 'classic';
  private themedMaterials: StandardMaterial[] = [];

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
    const roomsData = this.configLoader.getRoomsConfig();
    if (!roomsData || !Array.isArray(roomsData)) {
      console.error('No rooms data loaded');
      return null;
    }

    const roomConfig = roomsData.find((r: RoomConfig) => r.id === roomId);
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
    const roomsData = this.configLoader.getRoomsConfig();
    if (Array.isArray(roomsData)) {
      this.currentRoom = (roomsData as RoomConfig[]).find((r) => r.id === roomId) ?? null;
    }
    this.hazardZones = this.hazardZonesByRoom.get(instanceKey) || [];
    this.obstacleBounds = this.obstacleBoundsByRoom.get(instanceKey) || [];
  }

  getLoadedRoomKeys(): string[] {
    return Array.from(this.roomMeshes.keys());
  }

  hasRoomInstance(instanceKey: string): boolean {
    return this.roomMeshes.has(instanceKey);
  }

  unloadRoomInstance(instanceKey: string): void {
    this.disposePhysicsForInstance(instanceKey);

    const meshes = this.roomMeshes.get(instanceKey);
    if (meshes) {
      meshes.forEach((mesh) => mesh.dispose());
      this.roomMeshes.delete(instanceKey);
    }

    const roots = this.roomReliefRoots.get(instanceKey);
    if (roots) {
      roots.forEach((root) => root.dispose(false, true));
      this.roomReliefRoots.delete(instanceKey);
    }

    this.hazardZonesByRoom.delete(instanceKey);
    this.obstacleBoundsByRoom.delete(instanceKey);
    this.pushableCratesByRoom.delete(instanceKey);
    const hazards = this.mobileHazardsByRoom.get(instanceKey);
    if (hazards) {
      hazards.forEach((hazard) => hazard.mesh.dispose());
      this.mobileHazardsByRoom.delete(instanceKey);
    }
    this.roomOrigins.delete(instanceKey);
    this.roomDoors.delete(instanceKey);

    if (this.currentRoomKey === instanceKey) {
      this.currentRoomKey = null;
      this.currentRoom = null;
      this.hazardZones = [];
      this.obstacleBounds = [];
    }
  }

  getCurrentRoomOrigin(): Vector3 {
    if (!this.currentRoomKey) return new Vector3(0, 0, 0);
    return this.roomOrigins.get(this.currentRoomKey) ?? new Vector3(0, 0, 0);
  }

  setFloorRenderingEnabled(enabled: boolean): void {
    this.floorRenderingEnabled = enabled;
  }

  setRenderProfile(profile: 'classic' | 'neoDungeonTest' | 'proceduralRelief'): void {
    this.renderProfile = profile;
  }

  private createRoomGeometry(config: RoomConfig, instanceKey: string, origin: Vector3): void {
    // Clear previous instance meshes
    const prevMeshes = this.roomMeshes.get(instanceKey);
    if (prevMeshes) {
      prevMeshes.forEach(mesh => mesh.dispose());
    }
    const prevReliefRoots = this.roomReliefRoots.get(instanceKey);
    if (prevReliefRoots) {
      prevReliefRoots.forEach((root) => root.dispose(false, true));
    }
    this.roomMeshes.set(instanceKey, []);
    this.roomReliefRoots.set(instanceKey, []);
    const reliefContainer = new TransformNode(`relief_${instanceKey}`, this.scene);
    this.roomReliefRoots.get(instanceKey)!.push(reliefContainer);

    this.hazardZonesByRoom.set(instanceKey, []);
    this.obstacleBoundsByRoom.set(instanceKey, []);
    this.pushableCratesByRoom.set(instanceKey, []);
    this.mobileHazardsByRoom.set(instanceKey, []);

    const layout = config.layout;
    const height = layout.length;
    const width = layout.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
    const treatVoidAsWall = width <= 16 && height <= 12;
    const useReliefTheme = this.renderProfile === 'proceduralRelief';
    const useNeoTheme = this.renderProfile === 'proceduralRelief'
      || (this.renderProfile === 'neoDungeonTest' && ProceduralDungeonTheme.isNeoTestRoom(config.id));
    const wallThemeMaterial = useNeoTheme
      ? ProceduralDungeonTheme.createWallOrPillarMaterial(this.scene, `${instanceKey}_wall`, 'wall')
      : null;
    if (wallThemeMaterial) this.themedMaterials.push(wallThemeMaterial);

    // Create floor tiles and walls based on layout
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const row = layout[y] ?? '';
        // Missing cells are treated as walls to avoid geometry holes.
        const char = row[x] ?? '#';
        // Invert Y to Z to match tile system (layout[0] = far/top = max Z)
        const z = height - 1 - y;
        const position = new Vector3(
          origin.x + x * this.tileSize,
          0,
          origin.z + z * this.tileSize
        );

        if (char === '#' || char === 'O' || (treatVoidAsWall && char === 'V')) {
          if (useReliefTheme) {
            const wallNeighborMask = this.getMaskFromLayout(layout, x, y, '#');
            const wallRoot = ProceduralReliefTheme.createReliefWallBlock({
              scene: this.scene,
              name: `w_${instanceKey}_${x}_${z}`,
              x: origin.x + x * this.tileSize + this.tileSize / 2,
              y: this.tileSize * 0.85,
              z: origin.z + z * this.tileSize + this.tileSize / 2,
              baseSize: this.tileSize,
              heightScale: 1.65,
              seedX: x,
              seedZ: z,
              parent: reliefContainer,
              wallNeighborMask,
            });
            for (const child of wallRoot.getChildMeshes(false)) {
              child.isVisible = this.wallsVisible;
              child.metadata = { ...(child.metadata ?? {}), isRoomWall: true };
              this.roomMeshes.get(instanceKey)!.push(child);
            }
          } else {
            // Wall - centered on tile, scaled to fill entire tile
            const wall = VisualPlaceholder.createFloorTile(this.scene, `wall_${x}_${y}`, true);
            wall.position = position.add(new Vector3(this.tileSize / 2, 1.0, this.tileSize / 2));
            wall.scaling = new Vector3(this.tileSize, 2, this.tileSize);
            wall.isVisible = this.wallsVisible;
            if (wallThemeMaterial) {
              wall.material = wallThemeMaterial;
            }
            this.roomMeshes.get(instanceKey)!.push(wall);
          }
          
          // Add hitbox for wall collision
          this.obstacleBoundsByRoom.get(instanceKey)!.push({
            minX: origin.x + x * this.tileSize,
            maxX: origin.x + (x + 1) * this.tileSize,
            minZ: origin.z + z * this.tileSize,
            maxZ: origin.z + (z + 1) * this.tileSize,
          });
        } else if (this.floorRenderingEnabled && (char === '.' || char === 'S' || char === 'E' || char === 'M' || char === 'R' || char === 'P' || char === '^' || (!treatVoidAsWall && char === 'V'))) {
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

    // Create obstacles - simplified to full-height walls only (no more small pillars)
    const layoutHeight = config.layout.length;
    config.obstacles.forEach((obstacle, i) => {
      // Skip hazard type obstacles - use poison tiles (P) in layout instead
      if (obstacle.type === 'hazard') {
        return;
      }

      const width = Math.max(1, obstacle.width || 1);
      const height = Math.max(1, obstacle.height || 1);
      
      const obstacleZ = Number.isFinite(obstacle.y)
        ? obstacle.y
        : (Number.isFinite(obstacle.z) ? obstacle.z : undefined);
      if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacleZ)) {
        return;
      }
      const obstacleZValue = Number(obstacleZ);

      const position = new Vector3(
        origin.x + obstacle.x * this.tileSize + (width * this.tileSize) / 2,
        0.4,
        origin.z + obstacleZValue * this.tileSize + (height * this.tileSize) / 2
      );

      if (useReliefTheme) {
        for (let ox = 0; ox < width; ox++) {
          for (let oz = 0; oz < height; oz++) {
            const gx = obstacle.x + ox;
            const gz = obstacleZValue + oz;
            const reliefRoot = ProceduralReliefTheme.createReliefWallBlock({
              scene: this.scene,
              name: `o_${instanceKey}_${i}_${gx}_${gz}`,
              x: origin.x + gx * this.tileSize + this.tileSize / 2,
              y: this.tileSize * 1.28,
              z: origin.z + gz * this.tileSize + this.tileSize / 2,
              baseSize: this.tileSize * 1.0,
              heightScale: 2.4,
              seedX: gx + 0.17,
              seedZ: gz + 0.11,
              parent: reliefContainer,
            });
            for (const child of reliefRoot.getChildMeshes(false)) {
              child.isVisible = this.wallsVisible;
              child.metadata = { ...(child.metadata ?? {}), isRoomWall: true };
              this.roomMeshes.get(instanceKey)!.push(child);
            }
          }
        }
      } else {
        const mesh = VisualPlaceholder.createFloorTile(this.scene, `obstacle_${i}`, true);
        mesh.position = position;
        mesh.scaling = new Vector3(width * this.tileSize, 2.0, height * this.tileSize);
        if (wallThemeMaterial) {
          mesh.material = wallThemeMaterial;
        }
        mesh.isVisible = this.wallsVisible;
        mesh.metadata = { ...(mesh.metadata ?? {}), isRoomWall: true };
        this.roomMeshes.get(instanceKey)!.push(mesh);
      }

      // Add collision bounds for solid obstacles
      this.obstacleBoundsByRoom.get(instanceKey)!.push({
        minX: origin.x + obstacle.x * this.tileSize,
        maxX: origin.x + obstacle.x * this.tileSize + width * this.tileSize,
        minZ: origin.z + obstacleZValue * this.tileSize,
        maxZ: origin.z + obstacleZValue * this.tileSize + height * this.tileSize,
      });

    });

    const pushables = Array.isArray(config.pushables) ? config.pushables : [];
    const pushableList = this.pushableCratesByRoom.get(instanceKey)!;
    for (let i = 0; i < pushables.length; i++) {
      const pushable = pushables[i];
      if (!Number.isFinite(pushable?.x) || !Number.isFinite(pushable?.y)) continue;
      const sizeFactor = Math.max(0.45, Math.min(0.95, Number(pushable.size ?? 0.82)));
      const worldSize = this.tileSize * sizeFactor;
      const collisionInset = Math.min(0.04, worldSize * 0.08);
      const crate = MeshBuilder.CreateBox(`pushable_${instanceKey}_${i}`, {
        width: worldSize,
        height: worldSize,
        depth: worldSize,
      }, this.scene);
      crate.position = new Vector3(
        origin.x + pushable.x * this.tileSize + this.tileSize / 2,
        worldSize * 0.5,
        origin.z + pushable.y * this.tileSize + this.tileSize / 2,
      );
      crate.metadata = { ...(crate.metadata ?? {}), isRoomWall: true, isPushableCrate: true };

      const crateMat = new StandardMaterial(`pushable_${instanceKey}_${i}_mat`, this.scene);
      crateMat.diffuseColor = new Color3(0.58, 0.44, 0.24);
      crateMat.emissiveColor = new Color3(0.08, 0.06, 0.03);
      crate.material = crateMat;

      this.roomMeshes.get(instanceKey)!.push(crate);
      pushableList.push({
        mesh: crate,
        halfSize: Math.max(0.08, worldSize * 0.5 - collisionInset),
      });
    }

    const mobileHazards = Array.isArray(config.mobileHazards) ? config.mobileHazards : [];
    const hazardList = this.mobileHazardsByRoom.get(instanceKey)!;
    for (let i = 0; i < mobileHazards.length; i++) {
      const hazard = mobileHazards[i];
      if (!hazard) continue;
      if (hazard.type !== 'spinning_blade') continue;
      if (!Number.isFinite(hazard.startX) || !Number.isFinite(hazard.startY)) continue;
      const endX = (typeof hazard.endX === 'number' && Number.isFinite(hazard.endX)) ? hazard.endX : hazard.startX;
      const endY = (typeof hazard.endY === 'number' && Number.isFinite(hazard.endY)) ? hazard.endY : hazard.startY;

      const start = new Vector3(
        origin.x + hazard.startX * this.tileSize + this.tileSize / 2,
        0.38,
        origin.z + hazard.startY * this.tileSize + this.tileSize / 2,
      );
      const end = new Vector3(
        origin.x + endX * this.tileSize + this.tileSize / 2,
        0.38,
        origin.z + endY * this.tileSize + this.tileSize / 2,
      );

      const radius = Math.max(0.25, Number(hazard.radius ?? 0.62));
      const path = end.subtract(start);
      path.y = 0;
      const pathLength = path.length();
      const pathDirection = pathLength > 0.0001 ? path.scale(1 / pathLength) : new Vector3(1, 0, 0);
      const railNormal = new Vector3(-pathDirection.z, 0, pathDirection.x);

      const railLength = Math.max(0.45, pathLength + radius * 1.2);
      const railOffset = Math.max(0.08, radius * 0.62);
      const railWidth = Math.max(0.035, radius * 0.2);
      const railYaw = Math.atan2(pathDirection.z, pathDirection.x);
      const railCenter = start.add(end).scale(0.5);

      for (const side of [-1, 1] as const) {
        const rail = MeshBuilder.CreateBox(`blade_rail_${instanceKey}_${i}_${side}`, {
          width: railLength,
          height: 0.04,
          depth: railWidth,
        }, this.scene);
        rail.position = railCenter.add(railNormal.scale(railOffset * side));
        rail.position.y = 0.03;
        rail.rotation.y = railYaw;

        const railMat = new StandardMaterial(`blade_rail_${instanceKey}_${i}_${side}_mat`, this.scene);
        railMat.diffuseColor = new Color3(0.2, 0.23, 0.28);
        railMat.emissiveColor = new Color3(0.05, 0.07, 0.11);
        rail.material = railMat;
        this.roomMeshes.get(instanceKey)!.push(rail);
      }

      const blade = MeshBuilder.CreateCylinder(`blade_${instanceKey}_${i}`, {
        height: 0.12,
        diameter: radius * 2,
        tessellation: 24,
      }, this.scene);
      blade.position.copyFrom(start);
      blade.rotation.z = Math.PI * 0.5;
      blade.rotation.y = railYaw;

      const bladeRing = MeshBuilder.CreateTorus(`blade_ring_${instanceKey}_${i}`, {
        diameter: radius * 2.02,
        thickness: Math.max(0.05, radius * 0.2),
        tessellation: 24,
      }, this.scene);
      bladeRing.parent = blade;
      bladeRing.rotation.z = Math.PI * 0.5;

      const bladeHub = MeshBuilder.CreateCylinder(`blade_hub_${instanceKey}_${i}`, {
        height: 0.16,
        diameter: Math.max(0.12, radius * 0.55),
        tessellation: 16,
      }, this.scene);
      bladeHub.parent = blade;
      bladeHub.rotation.z = Math.PI * 0.5;

      const bladeMat = new StandardMaterial(`blade_${instanceKey}_${i}_mat`, this.scene);
      bladeMat.diffuseColor = new Color3(0.76, 0.78, 0.82);
      bladeMat.emissiveColor = new Color3(0.12, 0.15, 0.18);
      blade.material = bladeMat;
      bladeRing.material = bladeMat;

      const bladeHubMat = new StandardMaterial(`blade_hub_${instanceKey}_${i}_mat`, this.scene);
      bladeHubMat.diffuseColor = new Color3(0.2, 0.22, 0.26);
      bladeHubMat.emissiveColor = new Color3(0.05, 0.06, 0.08);
      bladeHub.material = bladeHubMat;

      this.roomMeshes.get(instanceKey)!.push(blade);
      this.roomMeshes.get(instanceKey)!.push(bladeRing);
      this.roomMeshes.get(instanceKey)!.push(bladeHub);
      hazardList.push({
        mesh: blade,
        start,
        end,
        direction: 1,
        speed: Math.max(0.2, Number(hazard.speed ?? 2.0)),
        radius,
        damagePerSecond: Math.max(0, Number(hazard.damagePerSecond ?? 22)),
        spinSpeed: Math.max(0.1, Number(hazard.spinSpeed ?? 9)),
        spinAngle: 0,
      });
    }

    this.buildPhysicsForInstance(instanceKey);
  }

  private buildPhysicsForInstance(instanceKey: string): void {
    this.disposePhysicsForInstance(instanceKey);

    if (!this.scene.isPhysicsEnabled()) {
      return;
    }

    const bounds = this.obstacleBoundsByRoom.get(instanceKey) ?? [];
    if (bounds.length === 0) {
      return;
    }

    const aggregates: PhysicsAggregate[] = [];
    const meshes = this.roomMeshes.get(instanceKey);

    for (let i = 0; i < bounds.length; i++) {
      const bound = bounds[i];
      const width = Math.max(0.01, bound.maxX - bound.minX);
      const depth = Math.max(0.01, bound.maxZ - bound.minZ);
      const collider = MeshBuilder.CreateBox(`room_phys_${instanceKey}_${i}`, {
        width,
        height: 2.3,
        depth,
      }, this.scene);

      collider.position = new Vector3(
        (bound.minX + bound.maxX) * 0.5,
        1.15,
        (bound.minZ + bound.maxZ) * 0.5,
      );
      collider.isVisible = false;
      collider.isPickable = false;
      collider.checkCollisions = false;

      const aggregate = new PhysicsAggregate(
        collider,
        PhysicsShapeType.BOX,
        {
          mass: 0,
          friction: 0.2,
          restitution: 0.95,
        },
        this.scene,
      );

      aggregates.push(aggregate);
      meshes?.push(collider);
    }

    this.roomPhysicsAggregates.set(instanceKey, aggregates);
  }

  private disposePhysicsForInstance(instanceKey: string): void {
    const aggregates = this.roomPhysicsAggregates.get(instanceKey);
    if (!aggregates) {
      return;
    }

    for (const aggregate of aggregates) {
      aggregate.dispose();
    }
    this.roomPhysicsAggregates.delete(instanceKey);
  }

  private getMaskFromLayout(layout: string[], x: number, y: number, wantedChar: string): number {
    let mask = 0;
    if (layout[y - 1]?.[x] === wantedChar) mask |= N;
    if (layout[y]?.[x + 1] === wantedChar) mask |= E;
    if (layout[y + 1]?.[x] === wantedChar) mask |= S;
    if (layout[y]?.[x - 1] === wantedChar) mask |= W;
    return mask;
  }

  getCurrentRoom(): RoomConfig | null {
    return this.currentRoom;
  }

  getPlayerSpawnPoint(roomId?: string): Vector3 | null {
    const roomsData = this.configLoader.getRoomsConfig();
    const roomList = Array.isArray(roomsData) ? roomsData.filter(isRoomConfig) : [];
    const room = roomId ? roomList.find((r) => r.id === roomId) : this.currentRoom;
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
    const roomsData = this.configLoader.getRoomsConfig();
    const roomList = Array.isArray(roomsData) ? roomsData.filter(isRoomConfig) : [];
    const room = roomId ? roomList.find((r) => r.id === roomId) : this.currentRoom;
    if (!room) {
      return [];
    }

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = room.layout.length;

    const points = room.spawnPoints
    .filter((point) => this.isValidSpawnPoint(point))
    .map((point) => this.mapSpawnPointToWorld(point, layoutHeight, origin, 1.0));
    return points;
  }

  getSpawnPointsWithType(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = this.currentRoom.layout.length;
    
    return this.currentRoom.spawnPoints
    .filter((point) => this.isValidSpawnPoint(point))
    .map((point) => {
      return ({
      position: this.mapSpawnPointToWorld(point, layoutHeight, origin, 1.0),
      enemyType: point.enemyType ?? 'zombie_basic',
    });
    });
  }

  getEnemySpawnPoints(): Array<{ position: Vector3; enemyType: string }> {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = this.currentRoom.layout.length;

    return this.currentRoom.spawnPoints
    .filter((point) => this.isValidSpawnPoint(point))
    .map((point) => {
      return ({
      position: this.mapSpawnPointToWorld(point, layoutHeight, origin, 0.5),
      enemyType: point.enemyType ?? 'zombie_basic',
    });
    });
  }

  private isValidSpawnPoint(point: RoomConfig['spawnPoints'][number]): boolean {
    return Number.isFinite(point.x) && (Number.isFinite(point.y) || Number.isFinite(point.z));
  }

  private mapSpawnPointToWorld(
    point: RoomConfig['spawnPoints'][number],
    layoutHeight: number,
    origin: Vector3 | undefined,
    yHeight: number
  ): Vector3 {
    const pointY = Number.isFinite(point.y) ? Number(point.y) : Number(point.z);
    const invertedY = layoutHeight - 1 - pointY;

    return new Vector3(
      (origin?.x ?? 0) + point.x * this.tileSize + this.tileSize / 2,
      yHeight,
      (origin?.z ?? 0) + invertedY * this.tileSize + this.tileSize / 2
    );
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

  getTileTypeAtWorld(x: number, z: number): RoomTileType {
    if (!this.currentRoom) return 'out';

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const localX = x - (origin?.x ?? 0);
    const localZ = z - (origin?.z ?? 0);
    const tileX = Math.floor(localX / this.tileSize);
    const tileZ = Math.floor(localZ / this.tileSize);

    const maxHeight = this.currentRoom.layout.length;
    const maxWidth = this.currentRoom.layout.reduce((acc, row) => Math.max(acc, row?.length ?? 0), 0);
    if (tileX < 0 || tileZ < 0 || tileX >= maxWidth || tileZ >= maxHeight) return 'out';

    const row = this.currentRoom.layout[tileZ] ?? '';
    const char = row[tileX] ?? '#';
    if (char === '#' || char === 'O') return 'wall';
    if (char === 'V') return 'void';
    return 'floor';
  }

  isWalkableFor(x: number, z: number, capabilities?: NavigationCapabilities): boolean {
    const canFly = capabilities?.canFly ?? false;
    const avoidVoid = capabilities?.avoidVoid ?? true;
    const canFallIntoVoid = capabilities?.canFallIntoVoid ?? false;

    const tileType = this.getTileTypeAtWorld(x, z);
    if (tileType === 'out') return false;
    if (tileType === 'wall') return false;
    if (tileType === 'void' && !canFly && avoidVoid && !canFallIntoVoid) return false;

    if (canFly) {
      return true;
    }

    for (const ob of this.getObstacleBounds()) {
      const inside = x >= ob.minX && x <= ob.maxX && z >= ob.minZ && z <= ob.maxZ;
      if (inside) return false;
    }

    return true;
  }

  findPath(start: Vector3, goal: Vector3, capabilities?: NavigationCapabilities): Vector3[] {
    if (!this.currentRoom) return [];

    const origin = this.currentRoomKey ? this.roomOrigins.get(this.currentRoomKey) : new Vector3(0, 0, 0);
    const layoutHeight = this.currentRoom.layout.length;
    const layoutWidth = this.currentRoom.layout.reduce((acc, row) => Math.max(acc, row?.length ?? 0), 0);

    if (layoutHeight <= 0 || layoutWidth <= 0) return [];

    const pathfinder = new Pathfinding(layoutWidth, layoutHeight);

    for (let z = 0; z < layoutHeight; z++) {
      const row = this.currentRoom.layout[z] ?? '';
      for (let x = 0; x < layoutWidth; x++) {
        const char = row[x] ?? '#';
        const isWall = char === '#' || char === 'O';
        const isVoid = char === 'V';
        const blockedByTile = isWall || (isVoid && !(capabilities?.canFly) && (capabilities?.avoidVoid ?? true) && !(capabilities?.canFallIntoVoid));
        pathfinder.setObstacle(x, z, blockedByTile);
      }
    }

    if (!(capabilities?.canFly)) {
      for (const obstacle of this.getObstacleBounds()) {
        const minX = Math.floor((obstacle.minX - (origin?.x ?? 0)) / this.tileSize);
        const maxX = Math.floor(((obstacle.maxX - (origin?.x ?? 0)) - 0.0001) / this.tileSize);
        const minZ = Math.floor((obstacle.minZ - (origin?.z ?? 0)) / this.tileSize);
        const maxZ = Math.floor(((obstacle.maxZ - (origin?.z ?? 0)) - 0.0001) / this.tileSize);

        for (let tz = minZ; tz <= maxZ; tz++) {
          for (let tx = minX; tx <= maxX; tx++) {
            pathfinder.setObstacle(tx, tz, true);
          }
        }
      }
    }

    const startX = Math.floor((start.x - (origin?.x ?? 0)) / this.tileSize);
    const startZ = Math.floor((start.z - (origin?.z ?? 0)) / this.tileSize);
    const goalX = Math.floor((goal.x - (origin?.x ?? 0)) / this.tileSize);
    const goalZ = Math.floor((goal.z - (origin?.z ?? 0)) / this.tileSize);

    const gridPath = pathfinder.findPathGrid(startX, startZ, goalX, goalZ);
    if (gridPath.length === 0) return [];

    return gridPath.map((node) => new Vector3(
      (origin?.x ?? 0) + node.x * this.tileSize + this.tileSize / 2,
      0,
      (origin?.z ?? 0) + node.z * this.tileSize + this.tileSize / 2,
    ));
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
    const roomsData = this.configLoader.getRoomsConfig();
    if (!Array.isArray(roomsData)) return null;
    const room = roomsData.filter(isRoomConfig).find((r) => r.id === roomId);
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
    const all = [...this.obstacleBounds];
    if (this.currentRoomKey) {
      const crates = this.pushableCratesByRoom.get(this.currentRoomKey) ?? [];
      for (const crate of crates) {
        all.push(this.getCrateBounds(crate));
      }
    }
    return all;
  }

  resolvePlayerAgainstPushables(
    playerPosition: Vector3,
    playerRadius: number,
    playerVelocity: Vector3,
    deltaTime: number,
  ): Vector3 {
    if (!this.currentRoomKey) return playerPosition;
    const crates = this.pushableCratesByRoom.get(this.currentRoomKey) ?? [];
    if (crates.length === 0) return playerPosition;

    const staticObstacles = this.obstacleBoundsByRoom.get(this.currentRoomKey) ?? [];
    let adjusted = playerPosition.clone();

    for (let i = 0; i < crates.length; i++) {
      const crate = crates[i];
      const bounds = this.getCrateBounds(crate);
      if (!this.circleIntersectsBounds(adjusted, playerRadius, bounds)) {
        continue;
      }

      let pushDir = new Vector3(playerVelocity.x, 0, playerVelocity.z);
      if (pushDir.lengthSquared() < 0.0001) {
        pushDir = crate.mesh.position.subtract(adjusted);
        pushDir.y = 0;
      }
      if (pushDir.lengthSquared() > 0.0001) {
        pushDir = pushDir.normalize();
      } else {
        pushDir = new Vector3(1, 0, 0);
      }

      const desiredPush = Math.min(0.22, Math.max(0.03, playerVelocity.length() * deltaTime * 0.85 + 0.03));
      const moved = this.tryMoveCrate(crate, pushDir.scale(desiredPush), crates, i, staticObstacles);

      const postBounds = moved ? this.getCrateBounds(crate) : bounds;
      adjusted = this.resolveCircleAabbLocal(adjusted, playerRadius, postBounds);
    }

    return adjusted;
  }

  updateDynamicHazards(deltaTime: number): void {
    if (!this.currentRoomKey) return;
    const hazards = this.mobileHazardsByRoom.get(this.currentRoomKey) ?? [];
    if (hazards.length === 0) return;

    for (const hazard of hazards) {
      const target = hazard.direction > 0 ? hazard.end : hazard.start;
      const delta = target.subtract(hazard.mesh.position);
      delta.y = 0;
      const distance = delta.length();
      const step = hazard.speed * Math.max(0, deltaTime);

      if (distance <= Math.max(0.001, step)) {
        hazard.mesh.position.copyFrom(target);
        hazard.direction = hazard.direction > 0 ? -1 : 1;
      } else {
        hazard.mesh.position.addInPlace(delta.scale(step / distance));
      }

      const travel = distance > 0.0001 ? delta.scale(1 / distance) : hazard.end.subtract(hazard.start).normalize();
      if (travel.lengthSquared() > 0.0001) {
        hazard.mesh.rotation.y = Math.atan2(travel.z, travel.x);
      }
      hazard.spinAngle += hazard.spinSpeed * deltaTime;
      hazard.mesh.rotation.x = hazard.spinAngle;
      hazard.mesh.rotation.z = Math.PI * 0.5;
    }
  }

  getCurrentMobileHazards(): Array<{ position: Vector3; radius: number; damagePerSecond: number }> {
    if (!this.currentRoomKey) return [];
    const hazards = this.mobileHazardsByRoom.get(this.currentRoomKey) ?? [];
    return hazards.map((hazard) => ({
      position: hazard.mesh.position.clone(),
      radius: hazard.radius,
      damagePerSecond: hazard.damagePerSecond,
    }));
  }

  getPhysicsBounceNormal(from: Vector3, to: Vector3): Vector3 | null {
    const physics = this.scene.getPhysicsEngine();
    if (!physics) {
      return null;
    }

    const hit = physics.raycast(from, to);
    if (!hit.hasHit) {
      return null;
    }

    const normal = hit.hitNormalWorld;
    if (!normal) {
      return null;
    }

    const flattened = new Vector3(normal.x, 0, normal.z);
    if (flattened.lengthSquared() <= 0.0001) {
      return null;
    }

    return flattened.normalize();
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
        const metadata = mesh.metadata as { isRoomWall?: boolean } | undefined;
        if (metadata?.isRoomWall === true) {
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
    for (const key of this.roomPhysicsAggregates.keys()) {
      this.disposePhysicsForInstance(key);
    }
    for (const meshes of this.roomMeshes.values()) {
      meshes.forEach(mesh => mesh.dispose());
    }
    this.roomMeshes.clear();
    for (const roots of this.roomReliefRoots.values()) {
      roots.forEach((root) => root.dispose(false, true));
    }
    this.roomReliefRoots.clear();
    this.roomOrigins.clear();
    this.roomDoors.clear();
    this.hazardZones = [];
    this.hazardZonesByRoom.clear();
    this.obstacleBounds = [];
    this.obstacleBoundsByRoom.clear();
    this.pushableCratesByRoom.clear();
    for (const hazards of this.mobileHazardsByRoom.values()) {
      hazards.forEach((hazard) => hazard.mesh.dispose());
    }
    this.mobileHazardsByRoom.clear();
    this.themedMaterials.forEach((material) => material.dispose());
    this.themedMaterials = [];
  }

  private getCrateBounds(crate: PushableCrate): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return {
      minX: crate.mesh.position.x - crate.halfSize,
      maxX: crate.mesh.position.x + crate.halfSize,
      minZ: crate.mesh.position.z - crate.halfSize,
      maxZ: crate.mesh.position.z + crate.halfSize,
    };
  }

  private circleIntersectsBounds(
    position: Vector3,
    radius: number,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  ): boolean {
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
    const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
    const dx = position.x - clampedX;
    const dz = position.z - clampedZ;
    return (dx * dx + dz * dz) < (radius * radius);
  }

  private resolveCircleAabbLocal(
    pos: Vector3,
    radius: number,
    box: { minX: number; maxX: number; minZ: number; maxZ: number },
  ): Vector3 {
    const clampedX = Math.max(box.minX, Math.min(box.maxX, pos.x));
    const clampedZ = Math.max(box.minZ, Math.min(box.maxZ, pos.z));
    const dx = pos.x - clampedX;
    const dz = pos.z - clampedZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius || distSq === 0) {
      return pos;
    }

    const dist = Math.sqrt(distSq);
    const push = (radius - dist) + 0.001;
    const nx = dx / dist;
    const nz = dz / dist;

    return new Vector3(pos.x + nx * push, pos.y, pos.z + nz * push);
  }

  private tryMoveCrate(
    crate: PushableCrate,
    delta: Vector3,
    crates: PushableCrate[],
    crateIndex: number,
    staticObstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  ): boolean {
    const candidateCenter = crate.mesh.position.add(new Vector3(delta.x, 0, delta.z));
    const candidate = {
      minX: candidateCenter.x - crate.halfSize,
      maxX: candidateCenter.x + crate.halfSize,
      minZ: candidateCenter.z - crate.halfSize,
      maxZ: candidateCenter.z + crate.halfSize,
    };

    const samples = [
      new Vector3(candidate.minX + 0.02, 0, candidate.minZ + 0.02),
      new Vector3(candidate.maxX - 0.02, 0, candidate.minZ + 0.02),
      new Vector3(candidate.maxX - 0.02, 0, candidate.maxZ - 0.02),
      new Vector3(candidate.minX + 0.02, 0, candidate.maxZ - 0.02),
      new Vector3((candidate.minX + candidate.maxX) * 0.5, 0, (candidate.minZ + candidate.maxZ) * 0.5),
    ];

    for (const sample of samples) {
      const tileType = this.getTileTypeAtWorld(sample.x, sample.z);
      if (tileType === 'wall' || tileType === 'void' || tileType === 'out') {
        return false;
      }
    }

    for (const obstacle of staticObstacles) {
      if (
        candidate.minX <= obstacle.maxX &&
        candidate.maxX >= obstacle.minX &&
        candidate.minZ <= obstacle.maxZ &&
        candidate.maxZ >= obstacle.minZ
      ) {
        return false;
      }
    }

    for (let i = 0; i < crates.length; i++) {
      if (i === crateIndex) continue;
      const other = this.getCrateBounds(crates[i]);
      if (
        candidate.minX <= other.maxX &&
        candidate.maxX >= other.minX &&
        candidate.minZ <= other.maxZ &&
        candidate.maxZ >= other.minZ
      ) {
        return false;
      }
    }

    crate.mesh.position.copyFrom(candidateCenter);
    return true;
  }

  dispose(): void {
    this.clearAllRooms();
  }
}
