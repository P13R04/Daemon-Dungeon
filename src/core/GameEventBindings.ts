import { EventBus, GameEvents } from './EventBus';

export type GameStartRequestedPayload = { classId?: 'mage' | 'firewall' | 'rogue' };
export type DevRoomLoadRequestedPayload = { roomId?: string };
export type DevTileLoadRequestedPayload = { roomId?: string };
export type BonusSelectedPayload = { bonusId?: string };
export type BonusRerollRequestedPayload = { cost?: number };
export type EnemySpawnedPayload = { enemyType?: string };
export type EnemyDiedPayload = { enemyType?: string };
export type AttackPerformedPayload = { type?: string; attacker?: string; damage?: number };

export interface GameEventBindingsCallbacks {
  onGameStartRequested(data: GameStartRequestedPayload): void;
  onGameRestartRequested(): void;
  onCodexOpenRequested(): void;
  onRoomNextRequested(): void;
  onDevRoomLoadRequested(data: DevRoomLoadRequestedPayload): void;
  onDevTileToggleRequested(): void;
  onDevTileLoadRequested(data: DevTileLoadRequestedPayload): void;
  onBonusSelected(data: BonusSelectedPayload): void;
  onBonusRerollRequested(data: BonusRerollRequestedPayload): void;
  onPlayerDied(payload?: { reason?: string }): void;
  onEnemySpawned(data: EnemySpawnedPayload): void;
  onEnemyDied(data: EnemyDiedPayload): void;
  onAttackPerformed(data: AttackPerformedPayload): void;
  onPlayerDamaged(): void;
  onRoomEntered(): void;
  onEnemyDamaged(): void;
}

export class GameEventBindings {
  constructor(
    private readonly eventBus: EventBus,
    private readonly callbacks: GameEventBindingsCallbacks
  ) {}

  bind(): Array<() => void> {
    const unsubscribers: Array<() => void> = [];
    const onEvent = <T extends unknown[]>(event: string, callback: (...args: T) => void) => {
      unsubscribers.push(this.eventBus.on(event, callback));
    };

    onEvent<[GameStartRequestedPayload]>(GameEvents.GAME_START_REQUESTED, (data) => {
      this.callbacks.onGameStartRequested(data);
    });

    onEvent(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.callbacks.onGameRestartRequested();
    });

    onEvent(GameEvents.CODEX_OPEN_REQUESTED, () => {
      this.callbacks.onCodexOpenRequested();
    });

    onEvent(GameEvents.ROOM_NEXT_REQUESTED, () => {
      this.callbacks.onRoomNextRequested();
    });

    onEvent<[DevRoomLoadRequestedPayload]>(GameEvents.DEV_ROOM_LOAD_REQUESTED, (data) => {
      this.callbacks.onDevRoomLoadRequested(data);
    });

    onEvent(GameEvents.DEV_TILE_TOGGLE_REQUESTED, () => {
      this.callbacks.onDevTileToggleRequested();
    });

    onEvent<[DevTileLoadRequestedPayload]>(GameEvents.DEV_TILE_LOAD_REQUESTED, (data) => {
      this.callbacks.onDevTileLoadRequested(data);
    });

    onEvent<[BonusSelectedPayload]>(GameEvents.BONUS_SELECTED, (data) => {
      this.callbacks.onBonusSelected(data);
    });

    onEvent<[BonusRerollRequestedPayload]>(GameEvents.BONUS_REROLL_REQUESTED, (data) => {
      this.callbacks.onBonusRerollRequested(data);
    });

    onEvent(GameEvents.PLAYER_DIED, (payload?: { reason?: string }) => {
      this.callbacks.onPlayerDied(payload);
    });

    onEvent<[EnemySpawnedPayload]>(GameEvents.ENEMY_SPAWNED, (data) => {
      this.callbacks.onEnemySpawned(data);
    });

    onEvent<[EnemyDiedPayload]>(GameEvents.ENEMY_DIED, (data) => {
      this.callbacks.onEnemyDied(data);
    });

    onEvent<[AttackPerformedPayload]>(GameEvents.ATTACK_PERFORMED, (data) => {
      this.callbacks.onAttackPerformed(data);
    });

    onEvent(GameEvents.PLAYER_DAMAGED, () => {
      this.callbacks.onPlayerDamaged();
    });

    onEvent(GameEvents.ROOM_ENTERED, () => {
      this.callbacks.onRoomEntered();
    });

    onEvent(GameEvents.ENEMY_DAMAGED, () => {
      this.callbacks.onEnemyDamaged();
    });

    return unsubscribers;
  }
}
