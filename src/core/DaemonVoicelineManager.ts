/**
 * DaemonVoicelineManager — Director-style runtime narrator.
 *
 * This manager reacts to gameplay telemetry with pacing, priorities,
 * class-aware comments, contextual lines (first enemy seen, special rooms),
 * and a queued dispatch model for urgent reactions.
 */

import { EventBus, GameEvents } from './EventBus';
import type { VoicelineConfig, VoicelineTrigger } from '../data/voicelines/VoicelineDefinitions';
import { queryVoicelines, pickWeightedRandom, VOICELINE_DB } from '../data/voicelines/VoicelineDatabase';

type DirectorRequest = {
  trigger: VoicelineTrigger;
  context?: string;
  priority: number;
  createdAt: number;
  expiresAt: number;
  force?: boolean;
};

type PlayerClass = 'mage' | 'firewall' | 'rogue';

const TRIGGER_CHANCE: Partial<Record<VoicelineTrigger, number>> = {
  game_start: 1.0,
  room_entered: 0.92,
  room_special: 0.95,
  boss_entered: 0.98,
  room_milestone: 0.96,
  room_cleared: 0.66,
  player_idle: 0.72,
  ambient: 1.0,

  player_damaged: 0.5,
  player_damaged_zombie: 0.7,
  player_damaged_jumper: 0.72,
  player_damaged_bull: 0.72,
  player_damaged_caster: 0.74,
  player_damaged_pong: 0.78,
  player_damaged_pattern: 0.8,
  player_damaged_hazard: 0.8,
  multi_damage_streak: 0.9,
  player_low_hp: 0.94,
  player_died: 1.0,

  enemy_first_seen: 0.92,
  enemy_killed: 0.24,
  enemy_killed_zombie: 0.3,
  player_ult_used: 0.34,
  bonus_selected: 0.36,
  bonus_choice_critique: 0.58,
  credits_hoarder: 0.82,

  game_over: 1.0,
  dev_test: 1.0,
  crash_recovery: 1.0,
};

const TRIGGER_COOLDOWN: Partial<Record<VoicelineTrigger, number>> = {
  game_start: 0,
  room_entered: 6,
  room_special: 8,
  boss_entered: 0,
  room_milestone: 10,
  room_cleared: 7,
  player_idle: 22,
  ambient: 34,

  player_damaged: 9,
  player_damaged_zombie: 12,
  player_damaged_jumper: 12,
  player_damaged_bull: 12,
  player_damaged_caster: 12,
  player_damaged_pong: 14,
  player_damaged_pattern: 14,
  player_damaged_hazard: 14,
  multi_damage_streak: 20,
  player_low_hp: 28,
  player_died: 0,

  enemy_first_seen: 18,
  enemy_killed: 24,
  enemy_killed_zombie: 24,
  player_ult_used: 18,
  bonus_selected: 22,
  bonus_choice_critique: 12,
  credits_hoarder: 42,
};

const GLOBAL_COOLDOWN_BASE_MIN = 4.4;
const GLOBAL_COOLDOWN_BASE_MAX = 7.6;
const CRASH_CHANCE = 0.05;
const CRASH_COOLDOWN = 180;

const LOW_HP_THRESHOLD = 0.25;
const DAMAGE_STREAK_THRESHOLD = 3;
const DAMAGE_STREAK_WINDOW = 5;
const IDLE_THRESHOLD = 8;
const AMBIENT_INTERVAL_MIN = 36;
const AMBIENT_INTERVAL_MAX = 72;
const CREDITS_HOARDER_SOFT_THRESHOLD = 180;
const CREDITS_HOARDER_HARD_THRESHOLD = 300;
const CREDITS_HOARDER_MIN_HOLD_SECONDS = 14;

const RECENT_BUFFER_SIZE = 10;
const TAG_RECENT_COOLDOWN_SECONDS = 45;

const SPECIAL_ROOMS: Record<string, string> = {
  room_pong_boss: 'room_pong_boss',
  room_boss_jumper: 'room_boss_jumper',
  room_reverse_galaga: 'room_reverse_galaga',
  room_the_choosen_one: 'room_the_choosen_one',
};

export class DaemonVoicelineManager {
  private eventBus: EventBus;
  private readonly getCurrency: (() => number) | null;
  private unsubscribers: Array<() => void> = [];

  private onVoicelineSelected: ((voiceline: VoicelineConfig, forceCrash: boolean) => void) | null = null;

  private playerClass: PlayerClass = 'mage';
  private currentRoom = 0;
  private currentRoomId = '';
  private isRunActive = false;
  private isDaemonActive = false;
  private tutorialMode = false;

  private lastGlobalFireTime = 0;
  private lastTriggerFireTime: Map<string, number> = new Map();
  private lastTagFireTime: Map<string, number> = new Map();
  private recentIds: string[] = [];

  private queue: DirectorRequest[] = [];
  private maxQueueLength = 8;

  // director gauges (0..100)
  private pressure = 8;
  private dominance = 52;
  private boredom = 0;
  private volatility = 0;

  private roomCleared = false;
  private idleTimer = 0;
  private ambientTimer = 0;
  private nextAmbientInterval = 0;

  private damageTimestamps: number[] = [];
  private lowHpFired = false;
  private lastKnownHpRatio = 1;

  private seenEnemiesThisRun = new Set<string>();
  private seenRoomSpecialThisRun = new Set<string>();
  private pendingFirstSeenAfterRoomEntry = new Set<string>();

  private roomEntryDelayTimer = 0;
  private isRoomEntryPending = false;
  private pendingRoomType = '';

  private lastCrashTime = 0;
  private hoarderTimer = 0;
  private lastKnownCurrency = 0;

  constructor(eventBus?: EventBus, getCurrency?: () => number) {
    this.eventBus = eventBus ?? EventBus.getInstance();
    this.getCurrency = getCurrency ?? null;
    this.resetAmbientTimer();
  }

  setOnVoicelineSelected(cb: (voiceline: VoicelineConfig, forceCrash: boolean) => void): void {
    this.onVoicelineSelected = cb;
  }

  setPlayerClass(classId: PlayerClass): void {
    this.playerClass = classId;
  }

  setTutorialMode(active: boolean): void {
    this.tutorialMode = active;
    if (active) {
      this.queue = [];
      this.idleTimer = 0;
      this.ambientTimer = 0;
      this.isRoomEntryPending = false;
      this.damageTimestamps = [];
      this.lowHpFired = false;
    }
  }

  setCurrentRoom(roomNumber: number): void {
    this.currentRoom = roomNumber;
  }

  setDaemonActive(active: boolean): void {
    this.isDaemonActive = active;
  }

  bind(): void {
    const on = <T extends unknown[]>(event: string, cb: (...args: T) => void) => {
      this.unsubscribers.push(this.eventBus.on(event, cb));
    };

    on(GameEvents.GAME_START_REQUESTED, () => {
      if (this.tutorialMode) return;
      this.resetState();
      this.isRunActive = true;
      this.request({ trigger: 'game_start', priority: 100, force: true, expiresIn: 6 });
    });

    on(GameEvents.ROOM_ENTERED, (data: any) => {
      if (this.tutorialMode) return;
      this.isRunActive = true;
      this.roomCleared = false;
      this.idleTimer = 0;
      this.pendingRoomType = (data?.roomType ?? '').toLowerCase();
      this.currentRoomId = String(data?.roomId ?? '');
      this.isRoomEntryPending = true;
      this.roomEntryDelayTimer = 1.55;

      const specialContext = SPECIAL_ROOMS[this.currentRoomId];
      if (specialContext && !this.seenRoomSpecialThisRun.has(specialContext)) {
        this.seenRoomSpecialThisRun.add(specialContext);
        this.request({ trigger: 'room_special', context: specialContext, priority: 90, expiresIn: 20 });
      }
    });

    on(GameEvents.ENEMY_SPAWNED, (data: any) => {
      if (!this.isRunActive || this.tutorialMode) return;
      const enemyType = String(data?.enemyType ?? '').trim().toLowerCase();
      if (!enemyType) return;
      if (!this.seenEnemiesThisRun.has(enemyType)) {
        this.seenEnemiesThisRun.add(enemyType);
        if (this.isRoomEntryPending) {
          this.pendingFirstSeenAfterRoomEntry.add(enemyType);
        } else {
          this.request({ trigger: 'enemy_first_seen', context: enemyType, priority: 78, expiresIn: 16 });
        }
      }
    });

    on(GameEvents.PLAYER_DAMAGED, (data: any) => {
      if (!this.isRunActive || this.tutorialMode) return;
      const now = this.now();
      this.bumpPressure(14);
      this.bumpVolatility(10);
      this.bumpDominance(-6);
      this.boredom = 0;

      this.damageTimestamps.push(now);
      this.damageTimestamps = this.damageTimestamps.filter((t) => now - t < DAMAGE_STREAK_WINDOW);

      const hp = data?.health;
      if (hp && typeof hp.current === 'number' && typeof hp.max === 'number' && hp.max > 0) {
        this.lastKnownHpRatio = hp.current / hp.max;
        if (this.lastKnownHpRatio <= LOW_HP_THRESHOLD && !this.lowHpFired) {
          this.lowHpFired = true;
          this.request({ trigger: 'player_low_hp', priority: 96, expiresIn: 8 });
          return;
        }
      }
      if (this.lastKnownHpRatio > LOW_HP_THRESHOLD) this.lowHpFired = false;

      if (this.damageTimestamps.length >= DAMAGE_STREAK_THRESHOLD) {
        this.request({ trigger: 'multi_damage_streak', priority: 92, expiresIn: 8 });
      }

      const enemyType = String(data?.enemyType ?? data?.sourceType ?? '').trim().toLowerCase();
      const specificTrigger = `player_damaged_${enemyType}` as VoicelineTrigger;
      if (TRIGGER_CHANCE[specificTrigger] !== undefined) {
        this.request({ trigger: specificTrigger, context: enemyType, priority: 82, expiresIn: 8 });
      }
      this.request({ trigger: 'player_damaged', context: enemyType, priority: 74, expiresIn: 7 });
    });

    on(GameEvents.ENEMY_DIED, (data: any) => {
      if (!this.isRunActive || this.tutorialMode) return;
      const enemyType = String(data?.enemyType ?? '').trim().toLowerCase();
      this.bumpPressure(-3);
      this.bumpDominance(4);
      this.bumpVolatility(-2);
      this.boredom = 0;

      if (enemyType === 'zombie') {
        this.request({ trigger: 'enemy_killed_zombie', priority: 32, expiresIn: 10 });
      }
      this.request({ trigger: 'enemy_killed', priority: 24, expiresIn: 10 });
    });

    on(GameEvents.ROOM_CLEARED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.roomCleared = true;
      this.idleTimer = 0;
      this.bumpPressure(-10);
      this.bumpDominance(8);
      this.bumpVolatility(-8);
      this.request({ trigger: 'room_cleared', priority: 68, expiresIn: 9 });
    });

    on(GameEvents.PLAYER_ULTIMATE_USED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.bumpPressure(-5);
      this.bumpDominance(5);
      this.bumpVolatility(4);
      this.request({ trigger: 'player_ult_used', priority: 52, expiresIn: 10 });
    });

    on(GameEvents.BONUS_SELECTED, (data: any) => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.bumpDominance(3);
      this.request({ trigger: 'bonus_selected', priority: 30, expiresIn: 10 });
      const bonusId = String(data?.bonusId ?? '').trim().toLowerCase();
      if (bonusId) {
        this.request({ trigger: 'bonus_choice_critique', context: bonusId, priority: 52, expiresIn: 10 });
      } else {
        this.request({ trigger: 'bonus_choice_critique', priority: 50, expiresIn: 10 });
      }
      this.hoarderTimer = 0;
    });

    on(GameEvents.PLAYER_DIED, () => {
      if (!this.isRunActive || this.tutorialMode) return;
      this.request({ trigger: 'player_died', priority: 120, force: true, expiresIn: 12 });
      this.isRunActive = false;
    });
  }

  update(deltaTime: number, playerIsMoving: boolean): void {
    if (!this.isRunActive || this.tutorialMode) return;

    this.tickDirectorGauges(deltaTime, playerIsMoving);
    this.tickCreditsHoarder(deltaTime);

    if (this.isRoomEntryPending) {
      this.roomEntryDelayTimer -= deltaTime;
      if (this.roomEntryDelayTimer <= 0) {
        this.isRoomEntryPending = false;
        this.processRoomEntryTrigger();
      }
    }

    if (!this.isDaemonActive) {
      this.processQueue();
    }
  }

  private tickCreditsHoarder(deltaTime: number): void {
    if (!this.getCurrency) return;
    const currency = Math.max(0, Math.floor(this.getCurrency()));
    this.lastKnownCurrency = currency;

    if (currency >= CREDITS_HOARDER_SOFT_THRESHOLD) {
      const speed = currency >= CREDITS_HOARDER_HARD_THRESHOLD ? 1.6 : 1;
      this.hoarderTimer += deltaTime * speed;
    } else {
      this.hoarderTimer = Math.max(0, this.hoarderTimer - deltaTime * 2.2);
      return;
    }

    if (this.hoarderTimer >= CREDITS_HOARDER_MIN_HOLD_SECONDS) {
      const ctx = currency >= CREDITS_HOARDER_HARD_THRESHOLD ? 'hard' : 'soft';
      this.request({ trigger: 'credits_hoarder', context: ctx, priority: 66, expiresIn: 9 });
      this.hoarderTimer = 0;
    }
  }

  forceTrigger(trigger: VoicelineTrigger): void {
    const pick = this.pickForTrigger(trigger);
    if (!pick) return;
    const forceCrash = trigger === 'dev_test' && pick.canCrash === true;
    this.pushRecent(pick.id);
    this.onVoicelineSelected?.(pick, forceCrash);
  }

  forceVoicelineById(id: string): void {
    const vl = VOICELINE_DB.find((v) => v.id === id);
    if (!vl) return;
    this.pushRecent(vl.id);
    this.onVoicelineSelected?.(vl, vl.canCrash === true);
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.queue = [];
  }

  private processRoomEntryTrigger(): void {
    if (this.pendingRoomType === 'boss') {
      this.request({ trigger: 'boss_entered', priority: 98, expiresIn: 10 });
      this.flushPendingFirstSeen();
      return;
    }

    if (this.currentRoom > 0 && this.currentRoom % 5 === 0) {
      this.request({ trigger: 'room_milestone', priority: 86, expiresIn: 12 });
      this.flushPendingFirstSeen();
      return;
    }

    this.request({ trigger: 'room_entered', priority: this.currentRoom === 0 ? 95 : 62, expiresIn: 12 });
    this.flushPendingFirstSeen();
  }

  private flushPendingFirstSeen(): void {
    if (this.pendingFirstSeenAfterRoomEntry.size === 0) return;
    const first = Array.from(this.pendingFirstSeenAfterRoomEntry).slice(0, 2);
    this.pendingFirstSeenAfterRoomEntry.clear();
    for (const enemyType of first) {
      this.request({ trigger: 'enemy_first_seen', context: enemyType, priority: 72, expiresIn: 16 });
    }
  }

  private tickDirectorGauges(deltaTime: number, playerIsMoving: boolean): void {
    // natural relaxation
    this.volatility = Math.max(0, this.volatility - deltaTime * 3.2);
    this.pressure = Math.max(0, this.pressure - deltaTime * 1.1);
    this.dominance = this.clamp(this.dominance - deltaTime * 0.25, 0, 100);

    // idle pressure for narration pacing
    if (this.roomCleared && !playerIsMoving) {
      this.idleTimer += deltaTime;
      this.boredom = this.clamp(this.boredom + deltaTime * 8, 0, 100);
      if (this.idleTimer >= IDLE_THRESHOLD) {
        this.idleTimer = 0;
        this.request({ trigger: 'player_idle', priority: 58, expiresIn: 10 });
      }
    } else {
      this.idleTimer = 0;
      this.boredom = Math.max(0, this.boredom - deltaTime * 5);
    }

    this.ambientTimer += deltaTime;
    if (this.ambientTimer >= this.nextAmbientInterval) {
      this.ambientTimer = 0;
      this.resetAmbientTimer();
      this.request({ trigger: 'ambient', priority: 44, expiresIn: 16 });
    }
  }

  private request(params: {
    trigger: VoicelineTrigger;
    context?: string;
    priority: number;
    expiresIn: number;
    force?: boolean;
  }): void {
    const now = this.now();
    const req: DirectorRequest = {
      trigger: params.trigger,
      context: params.context,
      priority: params.priority,
      createdAt: now,
      expiresAt: now + Math.max(1, params.expiresIn),
      force: !!params.force,
    };

    if (this.tryFire(req)) return;

    // queue only meaningful requests
    if (req.priority >= 50 || req.force) {
      this.enqueue(req);
    }
  }

  private processQueue(): void {
    const now = this.now();
    this.queue = this.queue.filter((q) => q.expiresAt > now);
    if (this.queue.length === 0) return;

    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

    const next = this.queue[0];
    if (this.tryFire(next)) {
      this.queue.shift();
    }
  }

  private tryFire(req: DirectorRequest): boolean {
    if (this.tutorialMode) return false;
    if (this.isDaemonActive) return false;

    const now = this.now();
    if (req.expiresAt <= now) return false;

    if (!req.force) {
      const globalCd = this.computeGlobalCooldown();
      if (now - this.lastGlobalFireTime < globalCd) return false;

      const triggerCd = TRIGGER_COOLDOWN[req.trigger] ?? 14;
      const lastTrigger = this.lastTriggerFireTime.get(req.trigger) ?? 0;
      if (triggerCd > 0 && now - lastTrigger < triggerCd) return false;

      const chance = this.computeTriggerChance(req.trigger);
      if (Math.random() > chance) return false;
    }

    const pick = this.pickForTrigger(req.trigger, req.context);
    if (!pick) return false;

    if (!this.allowByTagCooldown(pick, now)) return false;

    let forceCrash = false;
    if (pick.canCrash && now - this.lastCrashTime > CRASH_COOLDOWN) {
      if (Math.random() < CRASH_CHANCE) {
        forceCrash = true;
        this.lastCrashTime = now;
      }
    }

    this.lastGlobalFireTime = now;
    this.lastTriggerFireTime.set(req.trigger, now);
    this.pushRecent(pick.id);
    this.recordTagFires(pick, now);
    this.onVoicelineSelected?.(pick, forceCrash);
    return true;
  }

  private pickForTrigger(trigger: VoicelineTrigger, context?: string): VoicelineConfig | null {
    let candidates = queryVoicelines(trigger, this.playerClass, this.currentRoom, context);

    // Fallback to generic trigger context if no exact context lines exist.
    if (candidates.length === 0 && context) {
      candidates = queryVoicelines(trigger, this.playerClass, this.currentRoom);
    }

    // Additional class director weighting: class lines are preferred but not exclusive.
    if (candidates.length > 1) {
      const classSpecific = candidates.filter((c) => c.requiredClass === this.playerClass);
      if (classSpecific.length > 0 && Math.random() < 0.36) {
        const pick = pickWeightedRandom(classSpecific, this.recentIds);
        if (pick) return pick;
      }
    }

    return pickWeightedRandom(candidates, this.recentIds);
  }

  private computeGlobalCooldown(): number {
    const pressureFactor = this.pressure / 100;
    const volatilityFactor = this.volatility / 100;
    const base = GLOBAL_COOLDOWN_BASE_MIN + Math.random() * (GLOBAL_COOLDOWN_BASE_MAX - GLOBAL_COOLDOWN_BASE_MIN);
    // high pressure / volatility = denser commentary
    return Math.max(2.3, base - pressureFactor * 1.6 - volatilityFactor * 1.1);
  }

  private computeTriggerChance(trigger: VoicelineTrigger): number {
    const base = TRIGGER_CHANCE[trigger] ?? 0.1;
    const pressure = this.pressure / 100;
    const boredom = this.boredom / 100;

    // ambient lines increase with boredom, damage lines with pressure
    if (trigger === 'ambient' || trigger === 'player_idle') {
      return this.clamp(base + boredom * 0.22, 0.05, 1);
    }
    if (trigger.startsWith('player_damaged') || trigger === 'multi_damage_streak' || trigger === 'player_low_hp') {
      return this.clamp(base + pressure * 0.2, 0.05, 1);
    }
    return this.clamp(base, 0.05, 1);
  }

  private allowByTagCooldown(vl: VoicelineConfig, now: number): boolean {
    const tags = vl.tags ?? [];
    for (const tag of tags) {
      const last = this.lastTagFireTime.get(tag) ?? 0;
      if (now - last < TAG_RECENT_COOLDOWN_SECONDS) return false;
    }
    return true;
  }

  private recordTagFires(vl: VoicelineConfig, now: number): void {
    for (const tag of vl.tags ?? []) {
      this.lastTagFireTime.set(tag, now);
    }
  }

  private enqueue(req: DirectorRequest): void {
    this.queue.push(req);
    if (this.queue.length > this.maxQueueLength) {
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.createdAt - a.createdAt;
      });
      this.queue = this.queue.slice(0, this.maxQueueLength);
    }
  }

  private bumpPressure(delta: number): void {
    this.pressure = this.clamp(this.pressure + delta, 0, 100);
  }

  private bumpDominance(delta: number): void {
    this.dominance = this.clamp(this.dominance + delta, 0, 100);
  }

  private bumpVolatility(delta: number): void {
    this.volatility = this.clamp(this.volatility + delta, 0, 100);
  }

  private resetState(): void {
    this.lastGlobalFireTime = 0;
    this.lastTriggerFireTime.clear();
    this.lastTagFireTime.clear();
    this.recentIds = [];
    this.queue = [];

    this.currentRoom = 0;
    this.currentRoomId = '';

    this.pressure = 8;
    this.dominance = 52;
    this.boredom = 0;
    this.volatility = 0;

    this.roomCleared = false;
    this.idleTimer = 0;
    this.ambientTimer = 0;
    this.resetAmbientTimer();

    this.damageTimestamps = [];
    this.lowHpFired = false;
    this.lastKnownHpRatio = 1;

    this.seenEnemiesThisRun.clear();
    this.seenRoomSpecialThisRun.clear();
    this.pendingFirstSeenAfterRoomEntry.clear();
    this.hoarderTimer = 0;
    this.lastKnownCurrency = 0;

    this.isRoomEntryPending = false;
    this.roomEntryDelayTimer = 0;
    this.pendingRoomType = '';
  }

  private resetAmbientTimer(): void {
    this.nextAmbientInterval = AMBIENT_INTERVAL_MIN + Math.random() * (AMBIENT_INTERVAL_MAX - AMBIENT_INTERVAL_MIN);
  }

  private pushRecent(id: string): void {
    this.recentIds.push(id);
    if (this.recentIds.length > RECENT_BUFFER_SIZE) this.recentIds.shift();
  }

  private now(): number {
    return Date.now() / 1000;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }
}
