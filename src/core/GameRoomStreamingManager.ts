import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { RoomManager } from '../systems/RoomManager';
import { TileFloorManager } from '../systems/TileFloorManager';

export type RoomPreloadOptions = {
  backwardRange?: number;
  forwardRange?: number;
  allowUnload?: boolean;
  deferFarTilePreloads?: boolean;
};

type DeferredTilePreloadEntry = {
  roomId: string;
  instanceKey: string;
  origin: Vector3;
};

export type GameRoomStreamingContext = {
  roomManager: RoomManager;
  tileFloorManager: TileFloorManager;
  isGameplayInitialized: () => boolean;
  isTilesEnabled: () => boolean;
  getRoomOrder: () => string[];
  getRoomSpacing: () => number;
  getRenderProfileForRoom: (roomId: string) => 'classic' | 'neoDungeonTest' | 'proceduralRelief';
  preloadTileFloorInstance: (roomId: string, instanceKey: string, origin: Vector3) => void;
  setCurrentRoomInstance: (roomKey: string) => void;
  focusCameraOnRoomBounds: (roomKey: string) => void;
};

export class GameRoomStreamingManager {
  private deferredTilePreloadQueue: DeferredTilePreloadEntry[] = [];
  private deferredTilePreloadTimer: number | null = null;

  constructor(private readonly context: GameRoomStreamingContext) {}

  preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean = false,
    options?: RoomPreloadOptions
  ): void {
    if (!this.context.isGameplayInitialized()) return;
    const backwardRange = Math.max(0, options?.backwardRange ?? 1);
    const forwardRange = Math.max(0, options?.forwardRange ?? 2);
    const allowUnload = options?.allowUnload ?? true;
    const deferFarTilePreloads = options?.deferFarTilePreloads ?? !forceRebuild;

    if (forceRebuild) {
      this.context.roomManager.clearAllRooms();
      if (this.context.isTilesEnabled()) {
        this.context.tileFloorManager.clearAllRoomInstances();
      }
      this.clearDeferredTilePreloadQueue();
    }

    const indices = this.collectPreloadIndices(preloadIndex, backwardRange, forwardRange);

    const desiredKeys = new Set<string>();
    for (const idx of indices) {
      this.preloadRoomInstanceAtIndex(idx, activeIndex, desiredKeys, deferFarTilePreloads);
    }

    if (allowUnload) {
      this.unloadNonDesiredRoomInstances(desiredKeys);
    }

    if (this.context.isTilesEnabled() && this.deferredTilePreloadQueue.length > 0) {
      this.scheduleDeferredTilePreloadFlush(0);
    }

    const roomOrder = this.context.getRoomOrder();
    const currentRoomId = roomOrder[activeIndex];
    const currentKey = `${currentRoomId}::${activeIndex}`;
    this.context.setCurrentRoomInstance(currentKey);
    this.context.focusCameraOnRoomBounds(currentKey);
  }

  clearDeferredTilePreloadQueue(): void {
    if (this.deferredTilePreloadTimer !== null) {
      window.clearTimeout(this.deferredTilePreloadTimer);
      this.deferredTilePreloadTimer = null;
    }
    this.deferredTilePreloadQueue = [];
  }

  private collectPreloadIndices(preloadIndex: number, backwardRange: number, forwardRange: number): number[] {
    const indices: number[] = [];
    for (let idx = preloadIndex - backwardRange; idx <= preloadIndex + forwardRange; idx++) {
      indices.push(idx);
    }
    return indices;
  }

  private preloadRoomInstanceAtIndex(
    idx: number,
    activeIndex: number,
    desiredKeys: Set<string>,
    deferFarTilePreloads: boolean
  ): void {
    const roomOrder = this.context.getRoomOrder();
    if (idx < 0 || idx >= roomOrder.length) return;

    const roomId = roomOrder[idx];
    const origin = new Vector3(0, 0, idx * this.context.getRoomSpacing());
    const instanceKey = `${roomId}::${idx}`;
    desiredKeys.add(instanceKey);

    if (!this.context.roomManager.hasRoomInstance(instanceKey)) {
      this.context.roomManager.setRenderProfile(this.context.getRenderProfileForRoom(roomId));
      this.context.roomManager.loadRoomInstance(roomId, instanceKey, origin);
    }

    if (!this.context.isTilesEnabled()) return;

    const shouldDeferTilePreload = deferFarTilePreloads && Math.abs(idx - activeIndex) > 1;
    if (shouldDeferTilePreload) {
      this.enqueueDeferredTilePreload(roomId, instanceKey, origin);
      return;
    }

    this.context.preloadTileFloorInstance(roomId, instanceKey, origin);
  }

  private unloadNonDesiredRoomInstances(desiredKeys: Set<string>): void {
    for (const loadedKey of this.context.roomManager.getLoadedRoomKeys()) {
      if (!desiredKeys.has(loadedKey)) {
        this.context.roomManager.unloadRoomInstance(loadedKey);
      }
    }

    if (!this.context.isTilesEnabled()) {
      this.clearDeferredTilePreloadQueue();
      return;
    }

    for (const loadedFloorKey of this.context.tileFloorManager.getLoadedRoomKeys()) {
      if (!desiredKeys.has(loadedFloorKey)) {
        this.context.tileFloorManager.unloadRoomFloorInstance(loadedFloorKey);
      }
    }

    this.deferredTilePreloadQueue = this.deferredTilePreloadQueue.filter((entry) => desiredKeys.has(entry.instanceKey));
  }

  private enqueueDeferredTilePreload(roomId: string, instanceKey: string, origin: Vector3): void {
    const alreadyQueued = this.deferredTilePreloadQueue.some((entry) => entry.instanceKey === instanceKey);
    if (alreadyQueued) return;

    this.deferredTilePreloadQueue.push({
      roomId,
      instanceKey,
      origin: origin.clone(),
    });
  }

  private scheduleDeferredTilePreloadFlush(delayMs: number): void {
    if (this.deferredTilePreloadTimer !== null) return;
    this.deferredTilePreloadTimer = window.setTimeout(() => {
      this.deferredTilePreloadTimer = null;
      this.flushDeferredTilePreloadQueueBatch();
    }, Math.max(0, delayMs));
  }

  private flushDeferredTilePreloadQueueBatch(): void {
    if (!this.context.isGameplayInitialized() || !this.context.isTilesEnabled()) {
      this.clearDeferredTilePreloadQueue();
      return;
    }

    const batchSize = 1;
    for (let i = 0; i < batchSize && this.deferredTilePreloadQueue.length > 0; i++) {
      const entry = this.deferredTilePreloadQueue.shift();
      if (!entry) break;
      if (!this.context.roomManager.hasRoomInstance(entry.instanceKey)) continue;
      this.context.preloadTileFloorInstance(entry.roomId, entry.instanceKey, entry.origin);
    }

    if (this.deferredTilePreloadQueue.length > 0) {
      this.scheduleDeferredTilePreloadFlush(16);
    }
  }
}
