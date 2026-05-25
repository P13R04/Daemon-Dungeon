/**
 * DaemonVoicelineManager — Central orchestrator that listens to game events
 * and decides when/which voiceline to fire, applying cooldowns, probability
 * gates, weighted random selection, and class-aware filtering.
 */

import { EventBus, GameEvents } from './EventBus';
import type { VoicelineConfig, VoicelineTrigger } from '../data/voicelines/VoicelineDefinitions';
import { queryVoicelines, pickWeightedRandom, VOICELINE_DB } from '../data/voicelines/VoicelineDatabase';

// ─── Configuration ─────────────────────────────────────────────────

/** Base chance to attempt a voiceline when its trigger fires */
const TRIGGER_CHANCE: Partial<Record<VoicelineTrigger, number>> = {
  player_damaged:        0.40,
  player_damaged_zombie: 0.50,
  player_damaged_jumper: 0.50,
  player_damaged_bull:   0.50,
  player_damaged_caster: 0.50,
  player_damaged_pong:   0.60,
  player_damaged_pattern:0.60,
  player_damaged_hazard: 0.60,
  player_died:           1.00,
  player_idle:           0.50,
  player_low_hp:         0.50,
  player_ult_used:       0.30,
  enemy_killed:          0.20,
  enemy_killed_zombie:   0.25,
  room_entered:          1.00,
  room_cleared:          0.60,
  room_milestone:        0.90,
  boss_entered:          0.95,
  game_start:            1.00,
  game_over:             1.00,
  ambient:               1.00,
  multi_damage_streak:   0.80,
  bonus_selected:        0.25,
  dev_test:              1.00,
  crash_recovery:        1.00,
};

/** Per-trigger cooldown in seconds */
const TRIGGER_COOLDOWN: Partial<Record<VoicelineTrigger, number>> = {
  player_damaged:        10,
  player_damaged_zombie: 20,
  player_damaged_jumper: 20,
  player_damaged_bull:   20,
  player_damaged_caster: 20,
  player_damaged_pong:   20,
  player_damaged_pattern:20,
  player_damaged_hazard: 15,
  player_died:           0,
  player_idle:           25,
  player_low_hp:         45,
  player_ult_used:       20,
  enemy_killed:          30,
  enemy_killed_zombie:   30,
  room_entered:          5,
  room_cleared:          5,
  room_milestone:        0,
  boss_entered:          0,
  game_start:            0,
  game_over:             0,
  ambient:               45,
  multi_damage_streak:   30,
  bonus_selected:        30,
};

const GLOBAL_COOLDOWN_MIN = 5;
const GLOBAL_COOLDOWN_MAX = 8;
const RECENT_BUFFER_SIZE = 6;
const DAMAGE_STREAK_THRESHOLD = 3;
const DAMAGE_STREAK_WINDOW = 5; // seconds
const LOW_HP_THRESHOLD = 0.25;
const IDLE_THRESHOLD = 8; // seconds
const AMBIENT_INTERVAL_MIN = 50; // seconds
const AMBIENT_INTERVAL_MAX = 100;
const CRASH_CHANCE = 0.05; // 5% chance per eligible voiceline
const CRASH_COOLDOWN = 180; // seconds between crashes

// ─── Manager ───────────────────────────────────────────────────────

export class DaemonVoicelineManager {
  private eventBus: EventBus;
  private unsubscribers: Array<() => void> = [];

  // State
  private lastGlobalFireTime = 0;
  private lastTriggerFireTime: Map<string, number> = new Map();
  private recentIds: string[] = [];
  private playerClass: 'mage' | 'firewall' | 'rogue' = 'mage';
  private currentRoom = 0;
  private isDaemonActive = false;
  private isRunActive = false;

  // Damage streak tracking
  private damageTimestamps: number[] = [];

  // Low HP tracking
  private lowHpFired = false;
  private lastKnownHpRatio = 1;

  // Idle tracking
  private idleTimer = 0;
  private roomCleared = false;

  // Ambient timer
  private ambientTimer = 0;
  private nextAmbientInterval = 0;

  // Crash tracking
  private lastCrashTime = 0;
  
  // Variety tracking
  private lastTriggerType: VoicelineTrigger | null = null;
  private roomFiredTriggers: Set<VoicelineTrigger> = new Set();

  // Tutorial mode — silences all automatic/reactive triggers
  private tutorialMode: boolean = false;

  // Delayed room entry trigger
  private roomEntryDelayTimer = 0;
  private isRoomEntryPending = false;
  private pendingRoomType: string = '';

  // Callback: the manager emits this to request a voiceline play
  private onVoicelineSelected: ((voiceline: VoicelineConfig, forceCrash: boolean) => void) | null = null;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus ?? EventBus.getInstance();
    this.resetAmbientTimer();
  }

  /** Set the callback that fires when a voiceline is selected */
  setOnVoicelineSelected(cb: (voiceline: VoicelineConfig, forceCrash: boolean) => void): void {
    this.onVoicelineSelected = cb;
  }

  /** Called by GameManager when class is chosen */
  setPlayerClass(classId: 'mage' | 'firewall' | 'rogue'): void {
    this.playerClass = classId;
  }

  /** Enable/disable tutorial mode (silences all non-scripted voicelines) */
  setTutorialMode(active: boolean): void {
    this.tutorialMode = active;
    if (active) {
      // Reset all timers so nothing fires as soon as tutorial ends
      this.ambientTimer = 0;
      this.resetAmbientTimer();
      this.idleTimer = 0;
      this.isRoomEntryPending = false;
      this.damageTimestamps = [];
      this.lowHpFired = false;
    }
  }

  /** Called by GameManager when room changes */
  setCurrentRoom(roomNumber: number): void {
    this.currentRoom = roomNumber;
  }

  /** Called by HUDManager when daemon popup is showing */
  setDaemonActive(active: boolean): void {
    this.isDaemonActive = active;
  }

  /** Subscribe to EventBus events */
  bind(): void {
    const on = <T extends unknown[]>(event: string, cb: (...args: T) => void) => {
      this.unsubscribers.push(this.eventBus.on(event, cb));
    };

    on(GameEvents.GAME_START_REQUESTED, () => {
      if (this.tutorialMode) return; // Tutorial uses its own scripted intro
      this.resetState();
      this.isRunActive = true;
      this.tryFire('game_start');
    });

    on(GameEvents.PLAYER_DAMAGED, (data: any) => {
      if (!this.isRunActive || this.tutorialMode) return;
      const now = this.now();
      this.damageTimestamps.push(now);
      // Clean old timestamps
      this.damageTimestamps = this.damageTimestamps.filter(t => now - t < DAMAGE_STREAK_WINDOW);

      // Low HP check
      const hp = data?.health;
      if (hp && typeof hp.current === 'number' && typeof hp.max === 'number') {
        this.lastKnownHpRatio = hp.current / hp.max;
        if (this.lastKnownHpRatio <= LOW_HP_THRESHOLD && !this.lowHpFired) {
          this.lowHpFired = true;
          this.tryFire('player_low_hp');
          return; // Don't stack with damage voiceline
        }
      }
      // Reset low HP flag on heal
      if (this.lastKnownHpRatio > LOW_HP_THRESHOLD) {
        this.lowHpFired = false;
      }

      // Damage streak
      if (this.damageTimestamps.length >= DAMAGE_STREAK_THRESHOLD) {
        if (this.tryFire('multi_damage_streak')) return;
      }

      // Type-specific damage
      const enemyType = (data?.enemyType ?? data?.sourceType ?? '').toLowerCase();
      const specificTrigger = `player_damaged_${enemyType}` as VoicelineTrigger;
      if (TRIGGER_CHANCE[specificTrigger] !== undefined) {
        if (this.tryFire(specificTrigger)) return;
      }

      // Generic damage
      this.tryFire('player_damaged');
    });

    on(GameEvents.PLAYER_DIED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.tryFire('player_died');
      this.isRunActive = false;
    });

    on(GameEvents.ENEMY_DIED, (data: any) => {
      if (!this.isRunActive || this.tutorialMode) return;
      const enemyType = (data?.enemyType ?? '').toLowerCase();
      if (enemyType === 'zombie') {
        if (this.tryFire('enemy_killed_zombie')) return;
      }
      this.tryFire('enemy_killed');
    });

    on(GameEvents.ROOM_ENTERED, (data: any) => {
      if (this.tutorialMode) return; // Silence in tutorial
      this.isRunActive = true;
      this.roomCleared = false;
      this.idleTimer = 0;
      this.roomFiredTriggers.clear();
      this.isRoomEntryPending = true;
      this.roomEntryDelayTimer = 2.5;
      this.pendingRoomType = (data?.roomType ?? '').toLowerCase();
    });

    on(GameEvents.ROOM_CLEARED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.roomCleared = true;
      this.idleTimer = 0;
      this.tryFire('room_cleared');
    });

    on(GameEvents.PLAYER_ULTIMATE_USED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.tryFire('player_ult_used');
    });

    on(GameEvents.BONUS_SELECTED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.tryFire('bonus_selected');
    });
  }

  /** Called each frame by GameManager */
  update(deltaTime: number, playerIsMoving: boolean): void {
    if (!this.isRunActive || this.isDaemonActive) return;
    if (this.tutorialMode) return; // Silence everything during tutorial

    // Idle detection
    if (this.roomCleared && !playerIsMoving) {
      this.idleTimer += deltaTime;
      if (this.idleTimer >= IDLE_THRESHOLD) {
        this.idleTimer = 0;
        this.tryFire('player_idle');
      }
    } else {
      this.idleTimer = 0;
    }

    // Ambient timer
    this.ambientTimer += deltaTime;
    if (this.ambientTimer >= this.nextAmbientInterval) {
      this.ambientTimer = 0;
      this.resetAmbientTimer();
      this.tryFire('ambient');
    }

    // Room entry delay
    if (this.isRoomEntryPending) {
      this.roomEntryDelayTimer -= deltaTime;
      if (this.roomEntryDelayTimer <= 0) {
        this.isRoomEntryPending = false;
        this.processRoomEntryTrigger();
      }
    }
  }

  private processRoomEntryTrigger(): void {
    if (this.pendingRoomType === 'boss') {
      if (this.tryFire('boss_entered')) return;
    }

    // Room milestones
    if (this.currentRoom > 0 && this.currentRoom % 5 === 0) {
      if (this.tryFire('room_milestone')) return;
    }

    this.tryFire('room_entered');
  }

  /** Force-fire a specific trigger (for dev console) */
  forceTrigger(trigger: VoicelineTrigger): void {
    const candidates = queryVoicelines(trigger, this.playerClass, this.currentRoom);
    const pick = pickWeightedRandom(candidates, []);
    if (pick) {
      const forceCrash = trigger === 'dev_test' && pick.canCrash === true;
      this.pushRecent(pick.id);
      this.onVoicelineSelected?.(pick, forceCrash);
    }
  }

  /** Force a specific voiceline by ID (for dev console) */
  forceVoicelineById(id: string): void {
    const vl = VOICELINE_DB.find(v => v.id === id);
    if (vl) {
      this.pushRecent(vl.id);
      this.onVoicelineSelected?.(vl, vl.canCrash === true);
    }
  }

  dispose(): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }

  // ─── Internal ──────────────────────────────────────────────────

  private tryFire(trigger: VoicelineTrigger): boolean {
    if (this.isDaemonActive) return false;
    if (this.tutorialMode) return false; // Block all automatic fires during tutorial

    const now = this.now();

    // Global cooldown (skip for player_died / game_start)
    if (trigger !== 'player_died' && trigger !== 'game_start' && trigger !== 'game_over') {
      const globalCd = GLOBAL_COOLDOWN_MIN + Math.random() * (GLOBAL_COOLDOWN_MAX - GLOBAL_COOLDOWN_MIN);
      if (now - this.lastGlobalFireTime < globalCd) return false;
    }

    // Per-trigger cooldown
    const triggerCd = TRIGGER_COOLDOWN[trigger] ?? 15;
    const lastFire = this.lastTriggerFireTime.get(trigger) ?? 0;
    if (triggerCd > 0 && now - lastFire < triggerCd) return false;

    // Variety Filter: avoid repeating same trigger type in short succession
    // but ONLY if it's not a rare/important event
    if (trigger === this.lastTriggerType && !['room_entered', 'game_start', 'boss_entered', 'room_milestone'].includes(trigger)) {
      if (Math.random() > 0.3) return false; // 70% chance to skip if repeated consecutively
    }

    // Probability gate
    const chance = TRIGGER_CHANCE[trigger] ?? 0.1;
    if (Math.random() > chance) return false;

    // Query candidates
    const candidates = queryVoicelines(trigger, this.playerClass, this.currentRoom);
    if (candidates.length === 0) return false;

    // Pick voiceline
    const pick = pickWeightedRandom(candidates, this.recentIds);
    if (!pick) return false;

    // Determine crash
    let forceCrash = false;
    if (pick.canCrash && now - this.lastCrashTime > CRASH_COOLDOWN) {
      if (Math.random() < CRASH_CHANCE) {
        forceCrash = true;
        this.lastCrashTime = now;
      }
    }

    // Record and fire
    this.lastGlobalFireTime = now;
    this.lastTriggerFireTime.set(trigger, now);
    this.lastTriggerType = trigger;
    this.roomFiredTriggers.add(trigger);
    this.pushRecent(pick.id);

    this.onVoicelineSelected?.(pick, forceCrash);
    return true;
  }

  private pushRecent(id: string): void {
    this.recentIds.push(id);
    if (this.recentIds.length > RECENT_BUFFER_SIZE) {
      this.recentIds.shift();
    }
  }

  private resetState(): void {
    this.lastGlobalFireTime = 0;
    this.lastTriggerFireTime.clear();
    this.recentIds = [];
    this.currentRoom = 0;
    this.damageTimestamps = [];
    this.lowHpFired = false;
    this.lastKnownHpRatio = 1;
    this.idleTimer = 0;
    this.roomCleared = false;
    this.ambientTimer = 0;
    this.resetAmbientTimer();
  }

  private resetAmbientTimer(): void {
    this.nextAmbientInterval = AMBIENT_INTERVAL_MIN + Math.random() * (AMBIENT_INTERVAL_MAX - AMBIENT_INTERVAL_MIN);
  }

  private now(): number {
    return Date.now() / 1000;
  }
}
