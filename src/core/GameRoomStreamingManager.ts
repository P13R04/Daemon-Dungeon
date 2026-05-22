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
  private nextHeavyWorkAllowedAtMs = 0;
  private readonly minHeavyWorkCooldownMs = 10;
  private readonly maxHeavyWorkCooldownMs = 48;
  private lastActiveIndex = 0;
  private readonly maxLoadedRoomInstances = 5;
  private readonly maxLoadedFloorInstances = 5;

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

    const now = start;
    if (now < this.nextHeavyWorkAllowedAtMs) {
      return;
    }

    // Execute at most one heavy streaming op per frame. This prevents
    // multi-hundred-ms stalls from chaining load/unload/preload in a single tick.
    let didWork = false;
    const opStart = now;

    if (allowUnloads) {
      didWork = this.flushDeferredUnloadQueueBatch();
    }
    if (!didWork && allowRoomLoads && this.elapsedSince(start) < budget) {
      didWork = this.flushDeferredRoomLoadQueueBatch();
    }
    if (!didWork && allowTilePreloads && this.elapsedSince(start) < budget) {
      didWork = this.flushDeferredTilePreloadQueueBatch();
    }

    if (didWork) {
      const opCostMs = Math.max(0, this.elapsedSince(opStart));
      const adaptiveCooldownMs = Math.max(
        this.minHeavyWorkCooldownMs,
        Math.min(this.maxHeavyWorkCooldownMs, opCostMs * 0.4),
      );
      this.nextHeavyWorkAllowedAtMs = now + adaptiveCooldownMs;
    }
  }

  preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean = false,
    options?: RoomPreloadOptions
  ): void {
    if (!this.context.isGameplayInitialized()) return;
    this.lastActiveIndex = activeIndex;
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
      this.clearDeferredRoomLoadQueue();
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
    } else {
      this.queueOverBudgetUnloads(desiredKeys);
    }

    const roomOrder = this.context.getRoomOrder();
    const currentRoomId = roomOrder[activeIndex];
    const currentKey = `${currentRoomId}::${activeIndex}`;
    this.context.setCurrentRoomInstance(currentKey);
    this.applyVisibleInstanceWindow(activeIndex, preloadIndex);
    this.context.focusCameraOnRoomBounds(currentKey);
  }

  clearDeferredTilePreloadQueue(): void {
    this.deferredTilePreloadQueue = [];
  }

  clearDeferredRoomLoadQueue(): void {
    this.deferredRoomLoadQueue = [];
  }

  clearDeferredUnloadQueue(): void {
    // Drop queued unload intents only; avoid forcing synchronous unload bursts here.
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
        const shouldBuildPhysicsNow = idx === activeIndex;
        this.context.roomManager.loadRoomInstance(roomId, instanceKey, origin, shouldBuildPhysicsNow);
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

  private flushDeferredRoomLoadQueueBatch(): boolean {
    if (!this.context.isGameplayInitialized() || this.deferredRoomLoadQueue.length === 0) {
      return false;
    }

    const entry = this.deferredRoomLoadQueue.shift();
    if (!entry) return false;
    if (this.context.roomManager.hasRoomInstance(entry.instanceKey)) return false;
    this.context.roomManager.setRenderProfile(this.context.getRenderProfileForRoom(entry.roomId));
    this.context.roomManager.loadRoomInstance(entry.roomId, entry.instanceKey, entry.origin, false);
    return true;
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

  private queueOverBudgetUnloads(desiredKeys: Set<string>): void {
    const roomKeys = this.context.roomManager.getLoadedRoomKeys();
    const floorKeys = this.context.isTilesEnabled() ? this.context.tileFloorManager.getLoadedRoomKeys() : [];
    if (roomKeys.length <= this.maxLoadedRoomInstances && floorKeys.length <= this.maxLoadedFloorInstances) {
      return;
    }

    const byDistanceDesc = (a: string, b: string): number => {
      return this.getInstanceDistanceFromActive(b) - this.getInstanceDistanceFromActive(a);
    };

    const roomCandidates = roomKeys
      .filter((key) => !desiredKeys.has(key))
      .sort(byDistanceDesc);
    const floorCandidates = floorKeys
      .filter((key) => !desiredKeys.has(key))
      .sort(byDistanceDesc);

    let roomOver = Math.max(0, roomKeys.length - this.maxLoadedRoomInstances);
    for (let i = 0; i < roomCandidates.length && roomOver > 0; i += 1, roomOver -= 1) {
      const key = roomCandidates[i];
      if (!this.deferredUnloadQueue.includes(key)) {
        this.deferredUnloadQueue.push(key);
      }
    }

    let floorOver = Math.max(0, floorKeys.length - this.maxLoadedFloorInstances);
    for (let i = 0; i < floorCandidates.length && floorOver > 0; i += 1, floorOver -= 1) {
      const key = floorCandidates[i];
      if (!this.deferredUnloadQueue.includes(key)) {
        this.deferredUnloadQueue.push(key);
      }
    }
  }

  private getInstanceDistanceFromActive(instanceKey: string): number {
    const splitIdx = instanceKey.lastIndexOf('::');
    if (splitIdx < 0) return Number.MAX_SAFE_INTEGER;
    const idx = Number.parseInt(instanceKey.substring(splitIdx + 2), 10);
    if (!Number.isFinite(idx)) return Number.MAX_SAFE_INTEGER;
    return Math.abs(idx - this.lastActiveIndex);
  }

  private applyVisibleInstanceWindow(activeIndex: number, preloadIndex: number): void {
    const roomOrder = this.context.getRoomOrder();
    const visibleIndices = new Set<number>();
    visibleIndices.add(activeIndex);
    visibleIndices.add(preloadIndex);
    visibleIndices.add(activeIndex - 1);
    visibleIndices.add(preloadIndex + 1);

    const visibleKeys = new Set<string>();
    for (const idx of visibleIndices) {
      if (idx < 0 || idx >= roomOrder.length) continue;
      const roomId = roomOrder[idx];
      if (!roomId) continue;
      visibleKeys.add(`${roomId}::${idx}`);
    }

    this.context.roomManager.setVisibleRoomInstanceKeys(visibleKeys);
    if (this.context.isTilesEnabled()) {
      this.context.tileFloorManager.setVisibleRoomInstanceKeys(visibleKeys);
    }
  }

  private flushDeferredUnloadQueueBatch(): boolean {
    if (!this.context.isGameplayInitialized() || this.deferredUnloadQueue.length === 0) {
      return false;
    }

    const loadedKey = this.deferredUnloadQueue.shift();
    if (!loadedKey) return false;

    const hasRoomInstance = this.context.roomManager.hasRoomInstance(loadedKey);
    const hasFloorInstance = this.context.isTilesEnabled() && this.context.tileFloorManager.hasRoomInstance(loadedKey);

    // Split room and floor unload across different frames to avoid double heavy unloads in one frame.
    if (hasRoomInstance) {
      this.context.roomManager.unloadRoomInstance(loadedKey);
      if (hasFloorInstance && !this.deferredUnloadQueue.includes(loadedKey)) {
        this.deferredUnloadQueue.unshift(loadedKey);
      }
      return true;
    }

    if (hasFloorInstance) {
      this.context.tileFloorManager.unloadRoomFloorInstance(loadedKey);
      return true;
    }
    return false;
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

  private flushDeferredTilePreloadQueueBatch(): boolean {
    if (!this.context.isGameplayInitialized() || !this.context.isTilesEnabled() || this.deferredTilePreloadQueue.length === 0) {
      return false;
    }

    const entry = this.deferredTilePreloadQueue.shift();
    if (!entry) return false;
    if (!this.context.roomManager.hasRoomInstance(entry.instanceKey)) return false;
    this.context.preloadTileFloorInstance(entry.roomId, entry.instanceKey, entry.origin);
    return true;
  }

  private elapsedSince(startMs: number): number {
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    return now - startMs;
  }

  getDeferredQueueStats(): {
    roomLoads: number;
    tilePreloads: number;
    unloads: number;
  } {
    return {
      roomLoads: this.deferredRoomLoadQueue.length,
      tilePreloads: this.deferredTilePreloadQueue.length,
      unloads: this.deferredUnloadQueue.length,
    };
  }
}
