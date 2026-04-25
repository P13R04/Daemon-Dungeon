import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { RoomManager } from '../systems/RoomManager';
import { TileFloorManager } from '../systems/TileFloorManager';

export type RoomPreloadOptions = {
  backwardRange?: number;
  forwardRange?: number;
  allowUnload?: boolean;
  deferFarTilePreloads?: boolean;
  deferFarRoomPreloads?: boolean;
};

type DeferredTilePreloadEntry = {
  roomId: string;
  instanceKey: string;
  origin: Vector3;
};

type DeferredRoomLoadEntry = {
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

export type DeferredStreamingPumpOptions = {
  allowRoomLoads?: boolean;
  allowTilePreloads?: boolean;
  allowUnloads?: boolean;
};

export class GameRoomStreamingManager {
  private deferredTilePreloadQueue: DeferredTilePreloadEntry[] = [];
  private deferredRoomLoadQueue: DeferredRoomLoadEntry[] = [];
  private deferredUnloadQueue: string[] = [];

  constructor(private readonly context: GameRoomStreamingContext) {}

  pumpDeferredWork(maxBudgetMs: number = 1.2, options?: DeferredStreamingPumpOptions): void {
    if (!this.context.isGameplayInitialized()) {
      this.clearDeferredRoomLoadQueue();
      this.clearDeferredTilePreloadQueue();
      this.clearDeferredUnloadQueue();
      return;
    }

    const allowRoomLoads = options?.allowRoomLoads ?? true;
    const allowTilePreloads = options?.allowTilePreloads ?? true;
    const allowUnloads = options?.allowUnloads ?? true;

    const budget = Math.max(0.2, maxBudgetMs);
    const start = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

    if (allowRoomLoads) {
      this.flushDeferredRoomLoadQueueBatch();
      if (this.elapsedSince(start) >= budget) {
        return;
      }
    }

    if (allowTilePreloads) {
      this.flushDeferredTilePreloadQueueBatch();
      if (this.elapsedSince(start) >= budget) {
        return;
      }
    }

    if (allowUnloads) {
      this.flushDeferredUnloadQueueBatch();
    }
  }

  preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean = false,
    options?: RoomPreloadOptions
  ): void {
    if (!this.context.isGameplayInitialized()) return;
    const backwardRange = Math.max(0, options?.backwardRange ?? 1);
    const forwardRange = Math.max(0, options?.forwardRange ?? 1);
    const allowUnload = options?.allowUnload ?? true;
    const deferFarTilePreloads = options?.deferFarTilePreloads ?? !forceRebuild;
    const deferFarRoomPreloads = options?.deferFarRoomPreloads ?? !forceRebuild;

    if (forceRebuild) {
      this.context.roomManager.clearAllRooms();
      if (this.context.isTilesEnabled()) {
        this.context.tileFloorManager.clearAllRoomInstances();
      }
      this.clearDeferredTilePreloadQueue();
      this.clearDeferredUnloadQueue();
    }

    const indices = this.collectPreloadIndices(preloadIndex, backwardRange, forwardRange);

    const desiredKeys = new Set<string>();
    for (const idx of indices) {
      this.preloadRoomInstanceAtIndex(idx, activeIndex, desiredKeys, deferFarRoomPreloads, deferFarTilePreloads);
    }

    if (allowUnload) {
      this.queueUnloadNonDesiredRoomInstances(desiredKeys);
    }

    const roomOrder = this.context.getRoomOrder();
    const currentRoomId = roomOrder[activeIndex];
    const currentKey = `${currentRoomId}::${activeIndex}`;
    this.context.setCurrentRoomInstance(currentKey);
    this.context.focusCameraOnRoomBounds(currentKey);
  }

  clearDeferredTilePreloadQueue(): void {
    this.deferredTilePreloadQueue = [];
  }

  clearDeferredRoomLoadQueue(): void {
    this.deferredRoomLoadQueue = [];
  }

  clearDeferredUnloadQueue(): void {
    this.deferredUnloadQueue = [];
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
    deferFarRoomPreloads: boolean,
    deferFarTilePreloads: boolean
  ): void {
    const roomOrder = this.context.getRoomOrder();
    if (idx < 0 || idx >= roomOrder.length) return;

    const roomId = roomOrder[idx];
    const origin = new Vector3(0, 0, idx * this.context.getRoomSpacing());
    const instanceKey = `${roomId}::${idx}`;
    desiredKeys.add(instanceKey);

    if (!this.context.roomManager.hasRoomInstance(instanceKey)) {
      const shouldDeferRoomLoad = deferFarRoomPreloads && Math.abs(idx - activeIndex) > 1;
      if (shouldDeferRoomLoad) {
        this.enqueueDeferredRoomLoad(roomId, instanceKey, origin);
      } else {
        this.context.roomManager.setRenderProfile(this.context.getRenderProfileForRoom(roomId));
        this.context.roomManager.loadRoomInstance(roomId, instanceKey, origin);
      }
    }

    if (!this.context.isTilesEnabled()) return;

    const shouldDeferTilePreload = deferFarTilePreloads && Math.abs(idx - activeIndex) > 1;
    if (shouldDeferTilePreload) {
      this.enqueueDeferredTilePreload(roomId, instanceKey, origin);
      return;
    }

    this.context.preloadTileFloorInstance(roomId, instanceKey, origin);
  }

  private enqueueDeferredRoomLoad(roomId: string, instanceKey: string, origin: Vector3): void {
    const alreadyQueued = this.deferredRoomLoadQueue.some((entry) => entry.instanceKey === instanceKey);
    if (alreadyQueued) return;

    this.deferredRoomLoadQueue.push({
      roomId,
      instanceKey,
      origin: origin.clone(),
    });
  }

  private flushDeferredRoomLoadQueueBatch(): void {
    if (!this.context.isGameplayInitialized() || this.deferredRoomLoadQueue.length === 0) {
      return;
    }

    const entry = this.deferredRoomLoadQueue.shift();
    if (!entry) return;
    if (this.context.roomManager.hasRoomInstance(entry.instanceKey)) return;
    this.context.roomManager.setRenderProfile(this.context.getRenderProfileForRoom(entry.roomId));
    this.context.roomManager.loadRoomInstance(entry.roomId, entry.instanceKey, entry.origin);
  }

  private queueUnloadNonDesiredRoomInstances(desiredKeys: Set<string>): void {
    this.clearDeferredUnloadQueue();
    const unloadKeys = new Set<string>();

    for (const loadedKey of this.context.roomManager.getLoadedRoomKeys()) {
      if (!desiredKeys.has(loadedKey)) {
        unloadKeys.add(loadedKey);
      }
    }

    if (this.context.isTilesEnabled()) {
      for (const loadedFloorKey of this.context.tileFloorManager.getLoadedRoomKeys()) {
        if (!desiredKeys.has(loadedFloorKey)) {
          unloadKeys.add(loadedFloorKey);
        }
      }
    }

    this.deferredUnloadQueue = [...unloadKeys];

    this.deferredTilePreloadQueue = this.deferredTilePreloadQueue.filter((entry) => desiredKeys.has(entry.instanceKey));

  }

  private flushDeferredUnloadQueueBatch(): void {
    if (!this.context.isGameplayInitialized() || this.deferredUnloadQueue.length === 0) {
      return;
    }

    const loadedKey = this.deferredUnloadQueue.shift();
    if (!loadedKey) return;

    const hasRoomInstance = this.context.roomManager.hasRoomInstance(loadedKey);
    const hasFloorInstance = this.context.isTilesEnabled() && this.context.tileFloorManager.hasRoomInstance(loadedKey);

    // Split room and floor unload across different frames to avoid double heavy unloads in one frame.
    if (hasRoomInstance) {
      this.context.roomManager.unloadRoomInstance(loadedKey);
      if (hasFloorInstance && !this.deferredUnloadQueue.includes(loadedKey)) {
        this.deferredUnloadQueue.unshift(loadedKey);
      }
      return;
    }

    if (hasFloorInstance) {
      this.context.tileFloorManager.unloadRoomFloorInstance(loadedKey);
    }
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

  private flushDeferredTilePreloadQueueBatch(): void {
    if (!this.context.isGameplayInitialized() || !this.context.isTilesEnabled() || this.deferredTilePreloadQueue.length === 0) {
      return;
    }

    const entry = this.deferredTilePreloadQueue.shift();
    if (!entry) return;
    if (!this.context.roomManager.hasRoomInstance(entry.instanceKey)) return;
    this.context.preloadTileFloorInstance(entry.roomId, entry.instanceKey, entry.origin);
  }

  private elapsedSince(startMs: number): number {
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    return now - startMs;
  }
}
