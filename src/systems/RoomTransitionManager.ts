import { Vector3 } from '@babylonjs/core';

export type RoomTransitionGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CameraMoveState {
  from: Vector3;
  to: Vector3;
  t: number;
  duration: number;
  nextIndex: number;
}

export interface RoomTransitionCallbacks {
  isGameplayInitialized(): boolean;
  getRoomOrder(): string[];
  setRoomOrder(roomOrder: string[]): void;
  getCurrentRoomIndex(): number;
  setCurrentRoomIndex(index: number): void;
  setRoomCleared(value: boolean): void;
  hideOverlays(): void;
  setGameState(state: RoomTransitionGameState): void;
  preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean,
    options?: {
      backwardRange?: number;
      forwardRange?: number;
      allowUnload?: boolean;
    }
  ): void;
  loadRoomByIndex(index: number): void;
  getRoomBoundsForInstance(instanceKey: string): RoomBounds | null;
  getCameraTarget(): Vector3 | null;
  setCameraMove(move: CameraMoveState | null): void;
}

export class RoomTransitionManager {
  constructor(private readonly callbacks: RoomTransitionCallbacks) {}

  loadNextRoom(): void {
    if (!this.callbacks.isGameplayInitialized()) return;
    const roomOrder = this.callbacks.getRoomOrder();
    if (roomOrder.length === 0) return;

    const nextIndex = (this.callbacks.getCurrentRoomIndex() + 1) % roomOrder.length;
    this.callbacks.setRoomCleared(false);
    this.callbacks.hideOverlays();
    this.startRoomTransition(nextIndex);
  }

  loadIsolatedRoom(roomId: string): void {
    if (!this.callbacks.isGameplayInitialized()) return;

    this.callbacks.setRoomOrder([roomId]);
    this.callbacks.setCurrentRoomIndex(0);
    this.callbacks.setRoomCleared(false);
    this.callbacks.setCameraMove(null);
    this.callbacks.hideOverlays();
    this.callbacks.setGameState('playing');
    this.callbacks.preloadRoomsAround(0, 0, true);
    this.callbacks.loadRoomByIndex(0);
  }

  startRoomTransition(nextIndex: number): void {
    if (!this.callbacks.isGameplayInitialized()) return;

    this.callbacks.hideOverlays();
    this.callbacks.setGameState('transition');

    const currentRoomIndex = this.callbacks.getCurrentRoomIndex();
    this.callbacks.preloadRoomsAround(nextIndex, currentRoomIndex, false, {
      backwardRange: 2,
      forwardRange: 2,
      allowUnload: false,
    });

    const roomOrder = this.callbacks.getRoomOrder();
    const nextRoomId = roomOrder[nextIndex];
    if (!nextRoomId) {
      this.completeImmediateTransition(nextIndex);
      return;
    }

    const nextKey = `${nextRoomId}::${nextIndex}`;
    const roomBounds = this.callbacks.getRoomBoundsForInstance(nextKey);
    if (!roomBounds) {
      this.completeImmediateTransition(nextIndex);
      return;
    }

    const target = new Vector3(
      (roomBounds.minX + roomBounds.maxX) / 2,
      0.5,
      (roomBounds.minZ + roomBounds.maxZ) / 2
    );

    const cameraTarget = this.callbacks.getCameraTarget();
    if (cameraTarget) {
      this.callbacks.setCameraMove({
        from: cameraTarget.clone(),
        to: target,
        t: 0,
        duration: 0.6,
        nextIndex,
      });
      return;
    }

    this.completeImmediateTransition(nextIndex);
  }

  private completeImmediateTransition(nextIndex: number): void {
    this.callbacks.setCurrentRoomIndex(nextIndex);
    this.callbacks.loadRoomByIndex(nextIndex);
    this.callbacks.preloadRoomsAround(this.callbacks.getCurrentRoomIndex(), this.callbacks.getCurrentRoomIndex(), false, {
      backwardRange: 1,
      forwardRange: 2,
      allowUnload: true,
    });
    this.callbacks.setGameState('playing');
  }
}