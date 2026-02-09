/**
 * EventBus - Global event dispatcher for decoupled communication
 * Use this to emit and listen to game events without tight coupling
 */

type EventCallback = (...args: any[]) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, EventCallback[]> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   * @param event - Event name
   * @param callback - Callback to execute when event is emitted
   * @returns Unsubscribe function
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(...args));
    }
  }

  /**
   * Clear all listeners for an event or all events
   */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// Common game events (extend as needed)
export const GameEvents = {
  // Player events
  PLAYER_HEALTH_CHANGED: 'player:healthChanged',
  PLAYER_DAMAGED: 'player:damaged',
  PLAYER_HEALED: 'player:healed',
  PLAYER_DIED: 'player:died',
  PLAYER_ULTIMATE_READY: 'player:ultReady',
  PLAYER_ULTIMATE_USED: 'player:ultUsed',
  
  // Enemy events
  ENEMY_SPAWNED: 'enemy:spawned',
  ENEMY_DAMAGED: 'enemy:damaged',
  ENEMY_DIED: 'enemy:died',
  ENEMY_ALL_CLEARED: 'enemy:allCleared',
  ENEMY_SPAWN_REQUESTED: 'enemy:spawnRequested',
  
  // Room events
  ROOM_ENTERED: 'room:entered',
  ROOM_CLEARED: 'room:cleared',
  ROOM_TRANSITION_START: 'room:transitionStart',
  ROOM_TRANSITION_END: 'room:transitionEnd',
  
  // Bonus events
  BONUS_OFFERED: 'bonus:offered',
  BONUS_SELECTED: 'bonus:selected',
  
  // Combat events
  ATTACK_PERFORMED: 'combat:attackPerformed',
  PROJECTILE_SPAWNED: 'combat:projectileSpawned',
  PROJECTILE_HIT: 'combat:projectileHit',
  
  // Narrative events
  DAEMON_TAUNT: 'daemon:taunt',

  // Game flow events
  GAME_START_REQUESTED: 'game:startRequested',
  GAME_RESTART_REQUESTED: 'game:restartRequested',
  ROOM_NEXT_REQUESTED: 'room:nextRequested',
  
  // UI events
  UI_PAUSE_TOGGLE: 'ui:pauseToggle',
  UI_DEV_CONSOLE_TOGGLE: 'ui:devConsoleToggle',
  UI_OPTION_CHANGED: 'ui:optionChanged',
  DEBUG_FLAG_CHANGED: 'debug:flagChanged',
  DEV_ROOM_LOAD_REQUESTED: 'dev:roomLoadRequested',
  
  // Codex/Achievement events
  CODEX_ENTRY_UNLOCKED: 'codex:entryUnlocked',
  ACHIEVEMENT_UNLOCKED: 'achievement:unlocked',
  ACHIEVEMENT_PROGRESS: 'achievement:progress',
};
