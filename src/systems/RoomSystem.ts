/**
 * RoomSystem - Manages room loading, transitions, and state
 */

import { Scene } from '@babylonjs/core';
import { EventBus, GameEvents } from '../core/EventBus';

export interface RoomData {
  id: string;
  layout: string[][]; // ASCII grid
  spawnPoints: any[];
  obstacles: any[];
}

export class RoomSystem {
  private scene: Scene;
  private eventBus: EventBus;
  private currentRoomNumber: number = 0;
  private activeRoom?: RoomData;
  private loadedRooms: Map<number, any> = new Map(); // Room meshes/data

  constructor(scene: Scene) {
    this.scene = scene;
    this.eventBus = EventBus.getInstance();
  }

  loadRoom(roomNumber: number): void {
    // TODO: Load room data from JSON
    // TODO: Generate room geometry from layout
    // TODO: Place obstacles
    
    this.currentRoomNumber = roomNumber;
    this.eventBus.emit(GameEvents.ROOM_ENTERED, { roomNumber });
  }

  transitionToNextRoom(): void {
    this.eventBus.emit(GameEvents.ROOM_TRANSITION_START);
    
    // TODO: Camera pan animation
    // TODO: Unload old rooms
    // TODO: Load next rooms
    
    this.loadRoom(this.currentRoomNumber + 1);
    
    this.eventBus.emit(GameEvents.ROOM_TRANSITION_END);
  }

  getCurrentRoomNumber(): number {
    return this.currentRoomNumber;
  }

  update(deltaTime: number): void {
    // Room system may handle fog of war updates
  }
}
