import { EventBus, GameEvents } from './EventBus';

export type GameStartRequestedPayload = { classId?: 'mage' | 'firewall' | 'rogue' | 'cat', mode?: 'normal' | 'tutorial' };
export type DevRoomLoadRequestedPayload = { roomId?: string };
export type DevTileLoadRequestedPayload = { roomId?: string };
export type BonusSelectedPayload = { bonusId?: string };
export type BonusPaidPickRequestedPayload = { bonusId?: string; cost?: number };
export type BonusRerollRequestedPayload = { cost?: number };
export type ShopPurchaseRequestedPayload = { itemId?: string; cost?: number };
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
  onBonusPaidPickRequested(data: BonusPaidPickRequestedPayload): void;
  onBonusRerollRequested(data: BonusRerollRequestedPayload): void;
  onShopPurchaseRequested(data: ShopPurchaseRequestedPayload): void;
  onPlayerDied(payload?: { reason?: string }): void;
  onEnemySpawned(data: EnemySpawnedPayload): void;
  onEnemyDied(data: EnemyDiedPayload): void;
  onAttackPerformed(data: AttackPerformedPayload): void;
  onPlayerDamaged(): void;
  onRoomEntered(): void;
  onEnemyDamaged(): void;
  onTutorialStartRequested(data: GameStartRequestedPayload): void;
  onTutorialPhaseCompleted(data?: { phaseId?: string }): void;
  onTutorialEndRequested(): void;
  onPlayerUltimateRefillRequested(): void;
  onMainMenuRequested(): void;
  onClassSelectRequested(): void;
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

    onEvent<[BonusPaidPickRequestedPayload]>(GameEvents.BONUS_PAID_PICK_REQUESTED, (data) => {
      this.callbacks.onBonusPaidPickRequested(data);
    });

    onEvent<[BonusRerollRequestedPayload]>(GameEvents.BONUS_REROLL_REQUESTED, (data) => {
      this.callbacks.onBonusRerollRequested(data);
    });

    onEvent<[ShopPurchaseRequestedPayload]>(GameEvents.SHOP_PURCHASE_REQUESTED, (data) => {
      this.callbacks.onShopPurchaseRequested(data);
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

    onEvent<[GameStartRequestedPayload]>(GameEvents.TUTORIAL_START_REQUESTED, (data) => {
      if (this.callbacks.onTutorialStartRequested) this.callbacks.onTutorialStartRequested(data);
    });

    onEvent<[{ phaseId?: string }]>(GameEvents.TUTORIAL_PHASE_COMPLETED, (data) => {
      if (this.callbacks.onTutorialPhaseCompleted) this.callbacks.onTutorialPhaseCompleted(data);
    });

    onEvent(GameEvents.TUTORIAL_END_REQUESTED, () => {
      if (this.callbacks.onTutorialEndRequested) this.callbacks.onTutorialEndRequested();
    });

    onEvent(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED, () => {
      if (this.callbacks.onPlayerUltimateRefillRequested) this.callbacks.onPlayerUltimateRefillRequested();
    });

    onEvent(GameEvents.MAIN_MENU_REQUESTED, () => {
      if (this.callbacks.onMainMenuRequested) this.callbacks.onMainMenuRequested();
    });

    onEvent(GameEvents.CLASS_SELECT_REQUESTED, () => {
      if (this.callbacks.onClassSelectRequested) this.callbacks.onClassSelectRequested();
    });

    return unsubscribers;
  }
}
