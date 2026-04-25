import { EventBus, GameEvents } from '../core/EventBus';

export interface RoomEnteredEventPayload {
  roomId: string;
  roomName: string;
  roomType: string;
}

export interface DaemonTauntEventPayload {
  text: string;
  emotion: string;
  [key: string]: unknown;
}

export class GameEventCoordinator {
  constructor(private readonly eventBus: EventBus = EventBus.getInstance()) {}

  emitGameStartRequested(classId: 'mage' | 'firewall' | 'rogue' | 'cat'): void {
    this.eventBus.emit(GameEvents.GAME_START_REQUESTED, { classId });
  }

  emitTutorialStartRequested(classId: 'mage' | 'firewall' | 'rogue' | 'cat'): void {
    this.eventBus.emit(GameEvents.TUTORIAL_START_REQUESTED, { classId, mode: 'tutorial' });
  }

  emitRoomCleared(roomId: string): void {
    this.eventBus.emit(GameEvents.ROOM_CLEARED, { roomId });
  }

  emitDaemonTaunt(payload: DaemonTauntEventPayload): void {
    this.eventBus.emit(GameEvents.DAEMON_TAUNT, payload);
  }

  emitRoomEntered(payload: RoomEnteredEventPayload): void {
    this.eventBus.emit(GameEvents.ROOM_ENTERED, payload);
  }

  emitPlayerDied(reason: string): void {
    this.eventBus.emit(GameEvents.PLAYER_DIED, { reason });
  }
}
