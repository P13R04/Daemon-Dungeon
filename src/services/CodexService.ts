/**
 * CodexService - Manage codex unlocks and progression
 */

import { EventBus, GameEvents } from '../core/EventBus';

export interface CodexEntry {
  id: string;
  type: 'enemy' | 'item' | 'bonus' | 'class' | 'achievement';
  name: string;
  description: string;
  unlocked: boolean;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  type: 'incremental' | 'oneTime';
  target: number;
  icon?: string;
}

export interface AchievementProgress extends AchievementDefinition {
  progress: number;
  unlocked: boolean;
}

export interface RunRecord {
  id: string;
  timestamp: number;
  score: number;
  classId: string;
  roomReached: number;
  bonuses: { id: string; stacks: number }[];
}

interface CodexSnapshot {
  version: 1 | 2;
  encounteredEnemies: string[];
  discoveredBonuses: string[];
  unlockedEntries: string[];
  achievements: Record<string, { progress: number; unlocked: boolean }>;
  run: {
    active: boolean;
    classId: string;
    currentRoom: number;
    roomDamaged: boolean;
    noDamageRoomStreak: number;
    tookDamage: boolean;
    bonusesCollected: number;
    uniqueBonusesSelected: string[];
  };
  stats: {
    totalEnemyKills: number;
    highestRoomReached: number;
    runsStarted: number;
    bossesKilled: number;
    highestScore: number;
    codexOpenCount: number;
    settingsOpenCount: number;
    tutorialCompletedByClass: string[];
    classHighestRoom: Record<string, number>;
    uniqueBonusesSelectedLifetime: string[];
    runHistory: RunRecord[];
    introTakeoverCompleted: boolean;
  };
  catalog?: {
    runEnemyTypes: string[];
  };
  dev: {
    unlockCodexEntries: boolean;
  };
}

export interface CodexSyncAdapter {
  saveSnapshot?(snapshot: CodexSnapshot): Promise<void>;
  loadSnapshot?(): Promise<CodexSnapshot | null>;
}

export class CodexService {
  private eventBus: EventBus;
  private readonly storageKey: string = 'daemonDungeon.codex.v1';
  private unlockedEntries: Set<string> = new Set();
  private encounteredEnemies: Set<string> = new Set();
  private discoveredBonuses: Set<string> = new Set();
  private achievementDefinitions: Map<string, AchievementDefinition> = new Map();
  private achievementState: Map<string, { progress: number; unlocked: boolean }> = new Map();
  private runState: CodexSnapshot['run'] = {
    active: false,
    classId: 'mage',
    currentRoom: 0,
    roomDamaged: false,
    noDamageRoomStreak: 0,
    tookDamage: false,
    bonusesCollected: 0,
    uniqueBonusesSelected: [],
  };
  private stats: CodexSnapshot['stats'] = {
    totalEnemyKills: 0,
    highestRoomReached: 0,
    runsStarted: 0,
    bossesKilled: 0,
    highestScore: 0,
    codexOpenCount: 0,
    settingsOpenCount: 0,
    tutorialCompletedByClass: [],
    classHighestRoom: {},
    uniqueBonusesSelectedLifetime: [],
    runHistory: [],
    introTakeoverCompleted: false,
  };
  private catalogState: { runEnemyTypes: string[] } = {
    runEnemyTypes: [],
  };
  private devUnlockCodexEntries: boolean = false;
  private isDevUnlockActive(): boolean {
    return !import.meta.env.PROD && this.devUnlockCodexEntries;
  }
  private syncAdapter?: CodexSyncAdapter;
  private snapshotSaveTimer: number | null = null;
  private snapshotDirty: boolean = false;

  constructor(syncAdapter?: CodexSyncAdapter) {
    this.syncAdapter = syncAdapter;
    this.eventBus = EventBus.getInstance();
    this.loadLocalSnapshot();

    this.eventBus.on(GameEvents.SCORE_CHANGED, (data?: { score?: number }) => {
      const score = Number(data?.score);
      if (Number.isFinite(score) && score > 0) {
        this.recordScore(score);
      }
    });

    this.eventBus.on(GameEvents.UI_SETTINGS_OPENED, () => {
      this.recordSettingsOpened();
    });
  }

  configureRunEnemyCatalog(enemyTypes: string[]): void {
    const unique = new Set<string>();
    for (const enemyType of enemyTypes) {
      if (typeof enemyType !== 'string') continue;
      const id = enemyType.trim();
      if (!id) continue;
      if (id.startsWith('tutorial_')) continue;
      unique.add(id);
    }

    this.catalogState.runEnemyTypes = [...unique].sort();
    this.reconcileAchievementState();
    this.saveLocalSnapshot();
  }

  async unlockEntry(entryId: string, entryType: string): Promise<void> {
    if (this.unlockedEntries.has(entryId)) return;

    this.unlockedEntries.add(entryId);
    this.saveLocalSnapshot();

    this.eventBus.emit(GameEvents.CODEX_ENTRY_UNLOCKED, { entryId, entryType });

    await this.syncSnapshotToAdapter();
  }

  async fetchUnlockedEntries(): Promise<CodexEntry[]> {
    return [];
  }

  isUnlocked(entryId: string): boolean {
    if (this.isDevUnlockActive()) {
      return true;
    }
    return this.unlockedEntries.has(entryId);
  }

  isEnemyUnlocked(enemyTypeId: string): boolean {
    return this.isDevUnlockActive() || this.encounteredEnemies.has(enemyTypeId);
  }

  isBonusUnlocked(bonusId: string): boolean {
    return this.isDevUnlockActive() || this.discoveredBonuses.has(bonusId);
  }

  setDevUnlockCodexEntries(enabled: boolean): void {
    this.devUnlockCodexEntries = !import.meta.env.PROD && enabled;
    this.saveLocalSnapshot();
  }

  getDevUnlockCodexEntries(): boolean {
    return !import.meta.env.PROD && this.devUnlockCodexEntries;
  }

  async markEnemyEncountered(enemyTypeId: string): Promise<void> {
    if (!enemyTypeId || this.encounteredEnemies.has(enemyTypeId)) {
      return;
    }

    this.encounteredEnemies.add(enemyTypeId);
    await this.unlockEntry(`enemy:${enemyTypeId}`, 'enemy');

    if (enemyTypeId === 'sentinel') {
      this.completeAchievement('encounter_sentinel');
    }

    if (
      this.catalogState.runEnemyTypes.length > 0 &&
      this.catalogState.runEnemyTypes.every((enemyType) => this.encounteredEnemies.has(enemyType))
    ) {
      this.completeAchievement('scan_complete');
    }

    this.saveLocalSnapshot();
  }

  async markBonusDiscovered(bonusId: string): Promise<void> {
    if (!bonusId || this.discoveredBonuses.has(bonusId)) {
      return;
    }

    this.discoveredBonuses.add(bonusId);
    await this.unlockEntry(`bonus:${bonusId}`, 'bonus');
    this.saveLocalSnapshot();
  }

  initializeAchievements(definitions: AchievementDefinition[]): void {
    for (const definition of definitions) {
      this.achievementDefinitions.set(definition.id, definition);
      if (!this.achievementState.has(definition.id)) {
        this.achievementState.set(definition.id, { progress: 0, unlocked: false });
      }
    }

    this.reconcileAchievementState();
    this.saveLocalSnapshot();
  }

  resetProgression(): void {
    this.unlockedEntries.clear();
    this.encounteredEnemies.clear();
    this.discoveredBonuses.clear();

    this.runState = {
      active: false,
      classId: 'mage',
      currentRoom: 0,
      roomDamaged: false,
      noDamageRoomStreak: 0,
      tookDamage: false,
      bonusesCollected: 0,
      uniqueBonusesSelected: [],
    };

    this.stats = {
      totalEnemyKills: 0,
      highestRoomReached: 0,
      runsStarted: 0,
      bossesKilled: 0,
      highestScore: 0,
      codexOpenCount: 0,
      settingsOpenCount: 0,
      tutorialCompletedByClass: [],
      classHighestRoom: {},
      uniqueBonusesSelectedLifetime: [],
      runHistory: [],
      introTakeoverCompleted: false,
    };

    this.achievementState.clear();
    for (const definition of this.achievementDefinitions.values()) {
      this.achievementState.set(definition.id, { progress: 0, unlocked: false });
    }

    // Persist reset state immediately so a following page reload cannot restore stale progression.
    if (this.snapshotSaveTimer !== null) {
      window.clearTimeout(this.snapshotSaveTimer);
      this.snapshotSaveTimer = null;
    }
    this.snapshotDirty = false;
    this.flushLocalSnapshotSave();
  }

  getAchievementsProgress(): AchievementProgress[] {
    const devUnlocked = this.isDevUnlockActive();
    return Array.from(this.achievementDefinitions.values()).map((definition) => {
      const state = this.achievementState.get(definition.id) ?? { progress: 0, unlocked: false };
      return {
        ...definition,
        progress: devUnlocked ? definition.target : Math.min(state.progress, definition.target),
        unlocked: devUnlocked ? true : state.unlocked,
      };
    });
  }

  startRunTracking(classId: 'mage' | 'firewall' | 'rogue' | 'cat' = 'mage'): void {
    this.stats.runsStarted += 1;
    this.bumpAchievement('run_boot_10', 1);

    this.runState = {
      active: true,
      classId,
      currentRoom: 0,
      roomDamaged: false,
      noDamageRoomStreak: 0,
      tookDamage: false,
      bonusesCollected: 0,
      uniqueBonusesSelected: [],
    };
    this.saveLocalSnapshot();
  }

  endRunTracking(): void {
    this.runState.active = false;
    this.saveLocalSnapshot();
  }

  recordEnemyKilled(enemyTypeId?: string): void {
    this.stats.totalEnemyKills += 1;
    this.bumpAchievement('daemon_slayer_10', 1);
    this.bumpAchievement('daemon_slayer_100', 1);

    if (typeof enemyTypeId === 'string' && enemyTypeId.includes('boss')) {
      this.stats.bossesKilled += 1;
      this.completeAchievement('boss_killer');
      this.bumpAchievement('boss_hunter', 1);
    }

    this.saveLocalSnapshot();
  }

  recordRoomReached(roomNumber: number): void {
    if (this.runState.active && roomNumber > 1) {
      if (!this.runState.roomDamaged) {
        this.runState.noDamageRoomStreak += 1;
      } else {
        this.runState.noDamageRoomStreak = 0;
      }

      if (this.runState.noDamageRoomStreak >= 5) {
        this.completeAchievement('ghost_shell_5');
      }
      if (this.runState.noDamageRoomStreak >= 10) {
        this.completeAchievement('ghost_shell_10');
      }
    }

    this.runState.currentRoom = Math.max(this.runState.currentRoom, roomNumber);
    this.runState.roomDamaged = false;
    this.stats.highestRoomReached = Math.max(this.stats.highestRoomReached, roomNumber);
    this.stats.classHighestRoom[this.runState.classId] = Math.max(
      this.stats.classHighestRoom[this.runState.classId] ?? 0,
      roomNumber,
    );

    if (roomNumber >= 10) {
      this.completeAchievement('room_10');
      this.completeAchievement(`room_10_${this.runState.classId}`);
    }

    if (roomNumber >= 20) {
      this.completeAchievement('room_20');
    }

    if (
      (this.stats.classHighestRoom.mage ?? 0) >= 10 &&
      (this.stats.classHighestRoom.firewall ?? 0) >= 10 &&
      (this.stats.classHighestRoom.rogue ?? 0) >= 10
    ) {
      this.completeAchievement('room_10_trinity');
    }

    if (roomNumber >= 10 && !this.runState.tookDamage) {
      this.completeAchievement('no_damage');
    }

    this.saveLocalSnapshot();
  }

  recordBonusCollected(bonusId?: string): void {
    if (!this.runState.active) {
      return;
    }

    this.runState.bonusesCollected += 1;

    if (typeof bonusId === 'string' && bonusId.trim().length > 0) {
      const id = bonusId.trim();
      if (!this.runState.uniqueBonusesSelected.includes(id)) {
        this.runState.uniqueBonusesSelected.push(id);
      }
      if (!this.stats.uniqueBonusesSelectedLifetime.includes(id)) {
        this.stats.uniqueBonusesSelectedLifetime.push(id);
      }
    }

    if (this.runState.bonusesCollected >= 20) {
      this.completeAchievement('perfect_build');
    }

    const uniqueSelectedCount = this.stats.uniqueBonusesSelectedLifetime.length;
    if (uniqueSelectedCount >= 10) this.completeAchievement('bonus_sampler_10');
    if (uniqueSelectedCount >= 20) this.completeAchievement('bonus_sampler_20');
    if (uniqueSelectedCount >= 30) this.completeAchievement('bonus_sampler_30');

    this.saveLocalSnapshot();
  }

  recordPlayerDamaged(): void {
    if (!this.runState.active) {
      return;
    }

    this.runState.tookDamage = true;
    this.runState.roomDamaged = true;
    this.saveLocalSnapshot();
  }

  recordPlayerDied(reason?: string, attackerType?: string): void {
    if (!this.runState.active) {
      return;
    }

    // Death by void
    if (reason === 'void_fall') {
      this.completeAchievement('death_void');
      if (this.runState.classId === 'mage') {
        this.completeAchievement('death_mage_void');
      }
    }

    // Death by poison
    if (reason === 'poison') {
      this.completeAchievement('death_poison');
    }

    // Killed by Boss
    if (attackerType && attackerType.includes('boss')) {
      this.completeAchievement('death_boss');
    }

    // Killed by Sentinel
    if (attackerType === 'sentinel') {
      this.completeAchievement('death_sentinel');
    }

    // Death by Spikes/Traps
    if (reason === 'hazard' || reason === 'spike') {
      this.completeAchievement('death_spike');
      this.completeAchievement('death_trap');
    }

    // Quick death (Room 1)
    if (this.runState.currentRoom <= 1) {
      this.completeAchievement('death_quick');
    }

    // Class specific death logic
    if (this.runState.classId === 'firewall' && reason === 'damage') {
      // Assuming 'damage' is the general reason for being killed by enemies/attacks
      this.completeAchievement('death_tank_overload');
    }
    if (this.runState.classId === 'rogue' || this.runState.classId === 'cat') {
      this.completeAchievement('death_rogue_caught');
    }

    this.runState.active = false;
    this.saveLocalSnapshot();
  }

  recordScore(score: number): void {
    if (!Number.isFinite(score)) return;
    this.stats.highestScore = Math.max(this.stats.highestScore, Math.floor(score));

    if (this.stats.highestScore >= 5000) {
      this.completeAchievement('stack_overflow_5000');
    }
    if (this.stats.highestScore >= 15000) {
      this.completeAchievement('stack_overflow_15000');
    }

    this.saveLocalSnapshot();
  }

  recordCompletedRun(score: number, classId: string, roomReached: number, bonuses: { id: string; stacks: number }[]): void {
    const record: RunRecord = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      score: Math.floor(score),
      classId,
      roomReached,
      bonuses: [...bonuses],
    };

    if (!Array.isArray(this.stats.runHistory)) {
      this.stats.runHistory = [];
    }

    this.stats.runHistory.push(record);
    
    // Sort by score descending and keep only the top 15 runs
    this.stats.runHistory.sort((a, b) => b.score - a.score);
    if (this.stats.runHistory.length > 15) {
      this.stats.runHistory.length = 15;
    }

    this.saveLocalSnapshot();
  }

  recordCombatSnapshot(moveSpeed: number, attackSpeed: number, activeBonuses: { id: string; stacks: number }[] = []): void {
    const msStacks = activeBonuses.find(b => b.id === 'bonus_ms')?.stacks || 0;
    const asStacks = activeBonuses.find(b => b.id === 'bonus_fire_rate')?.stacks || 0;

    if (Number.isFinite(moveSpeed) && moveSpeed >= 1.5 && msStacks >= 3) {
      this.completeAchievement('move_speed_1_5');
    }
    if (Number.isFinite(attackSpeed) && attackSpeed >= 1.5 && asStacks >= 3) {
      this.completeAchievement('overclocked');
    }
  }

  recordCodexOpened(): void {
    this.stats.codexOpenCount += 1;
    this.completeAchievement('open_codex');
    this.saveLocalSnapshot();
  }

  recordSettingsOpened(): void {
    this.stats.settingsOpenCount += 1;
    this.completeAchievement('dont_fix_it');
    this.saveLocalSnapshot();
  }

  recordTutorialCompleted(classId: 'mage' | 'firewall' | 'rogue' | 'cat'): void {
    const classKey = classId === 'cat' ? 'rogue' : classId;
    if (!this.stats.tutorialCompletedByClass.includes(classKey)) {
      this.stats.tutorialCompletedByClass.push(classKey);
    }

    this.completeAchievement(`tutorial_${classKey}`);

    if (
      this.stats.tutorialCompletedByClass.includes('mage') &&
      this.stats.tutorialCompletedByClass.includes('firewall') &&
      this.stats.tutorialCompletedByClass.includes('rogue')
    ) {
      this.completeAchievement('tutorial_trinity');
    }

    this.saveLocalSnapshot();
  }

  hasCompletedTutorialForClass(classId: 'mage' | 'firewall' | 'rogue' | 'cat'): boolean {
    const classKey = classId === 'cat' ? 'rogue' : classId;
    return this.stats.tutorialCompletedByClass.includes(classKey);
  }

  recordIntroTakeoverCompleted(): void {
    if (this.stats.introTakeoverCompleted) return;
    this.stats.introTakeoverCompleted = true;
    this.saveLocalSnapshot();
  }

  hasCompletedIntroTakeover(): boolean {
    return !!this.stats.introTakeoverCompleted;
  }

  private bumpAchievement(id: string, delta: number): void {
    const definition = this.achievementDefinitions.get(id);
    if (!definition) return;

    const state = this.achievementState.get(id) ?? { progress: 0, unlocked: false };
    if (state.unlocked) return;

    const nextProgress = Math.min(definition.target, state.progress + delta);
    this.achievementState.set(id, { progress: nextProgress, unlocked: nextProgress >= definition.target });

    if (nextProgress >= definition.target) {
      this.eventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, {
        achievementId: id,
        name: definition.name,
        description: definition.description,
      });
    } else {
      this.eventBus.emit(GameEvents.ACHIEVEMENT_PROGRESS, { achievementId: id, progress: nextProgress });
    }
  }

  private completeAchievement(id: string): void {
    const definition = this.achievementDefinitions.get(id);
    if (!definition) return;

    const state = this.achievementState.get(id) ?? { progress: 0, unlocked: false };
    if (state.unlocked) return;

    this.achievementState.set(id, { progress: definition.target, unlocked: true });
    this.eventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, {
      achievementId: id,
      name: definition.name,
      description: definition.description,
    });
  }

  private reconcileAchievementState(): void {
    this.setAchievementProgress('daemon_slayer_10', Math.max(0, this.stats.totalEnemyKills));
    this.setAchievementProgress('daemon_slayer_100', Math.max(0, this.stats.totalEnemyKills));
    this.setAchievementProgress('boss_hunter', Math.max(0, this.stats.bossesKilled));
    this.setAchievementProgress('run_boot_10', Math.max(0, this.stats.runsStarted));

    if (this.stats.highestRoomReached >= 10) this.completeAchievement('room_10');
    if (this.stats.highestRoomReached >= 20) this.completeAchievement('room_20');

    if ((this.stats.classHighestRoom.mage ?? 0) >= 10) this.completeAchievement('room_10_mage');
    if ((this.stats.classHighestRoom.firewall ?? 0) >= 10) this.completeAchievement('room_10_firewall');
    if ((this.stats.classHighestRoom.rogue ?? 0) >= 10) this.completeAchievement('room_10_rogue');

    if (
      (this.stats.classHighestRoom.mage ?? 0) >= 10 &&
      (this.stats.classHighestRoom.firewall ?? 0) >= 10 &&
      (this.stats.classHighestRoom.rogue ?? 0) >= 10
    ) {
      this.completeAchievement('room_10_trinity');
    }

    if (this.stats.highestScore >= 5000) this.completeAchievement('stack_overflow_5000');
    if (this.stats.highestScore >= 15000) this.completeAchievement('stack_overflow_15000');
    if (this.stats.codexOpenCount > 0) this.completeAchievement('open_codex');
    if (this.stats.settingsOpenCount > 0) this.completeAchievement('dont_fix_it');

    if (this.stats.tutorialCompletedByClass.includes('mage')) this.completeAchievement('tutorial_mage');
    if (this.stats.tutorialCompletedByClass.includes('firewall')) this.completeAchievement('tutorial_firewall');
    if (this.stats.tutorialCompletedByClass.includes('rogue')) this.completeAchievement('tutorial_rogue');
    if (
      this.stats.tutorialCompletedByClass.includes('mage') &&
      this.stats.tutorialCompletedByClass.includes('firewall') &&
      this.stats.tutorialCompletedByClass.includes('rogue')
    ) {
      this.completeAchievement('tutorial_trinity');
    }

    if (this.encounteredEnemies.has('sentinel')) this.completeAchievement('encounter_sentinel');

    const uniqueSelectedCount = this.stats.uniqueBonusesSelectedLifetime.length;
    if (uniqueSelectedCount >= 10) this.completeAchievement('bonus_sampler_10');
    if (uniqueSelectedCount >= 20) this.completeAchievement('bonus_sampler_20');
    if (uniqueSelectedCount >= 30) this.completeAchievement('bonus_sampler_30');

    if (
      this.catalogState.runEnemyTypes.length > 0 &&
      this.catalogState.runEnemyTypes.every((enemyType) => this.encounteredEnemies.has(enemyType))
    ) {
      this.completeAchievement('scan_complete');
    }
  }

  private setAchievementProgress(id: string, progress: number): void {
    const definition = this.achievementDefinitions.get(id);
    if (!definition) return;

    const clamped = Math.min(definition.target, Math.max(0, progress));
    const unlocked = clamped >= definition.target;
    this.achievementState.set(id, { progress: clamped, unlocked });
  }

  private saveLocalSnapshot(): void {
    this.snapshotDirty = true;
    if (this.snapshotSaveTimer !== null) {
      return;
    }
    this.snapshotSaveTimer = window.setTimeout(() => {
      this.snapshotSaveTimer = null;
      if (!this.snapshotDirty) return;
      this.snapshotDirty = false;
      this.flushLocalSnapshotSave();
    }, 250);
  }

  private flushLocalSnapshotSave(): void {
    try {
      const snapshot: CodexSnapshot = {
        version: 2,
        encounteredEnemies: [...this.encounteredEnemies],
        discoveredBonuses: [...this.discoveredBonuses],
        unlockedEntries: [...this.unlockedEntries],
        achievements: Array.from(this.achievementState.entries()).reduce<Record<string, { progress: number; unlocked: boolean }>>((acc, [id, state]) => {
          acc[id] = state;
          return acc;
        }, {}),
        run: this.runState,
        stats: this.stats,
        catalog: this.catalogState,
        dev: {
          unlockCodexEntries: this.devUnlockCodexEntries,
        },
      };

      localStorage.setItem(this.storageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Failed to save codex snapshot:', error);
    }
  }

  private loadLocalSnapshot(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) {
        return;
      }

      const parsed = JSON.parse(data) as CodexSnapshot;
      if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) {
        return;
      }

      this.encounteredEnemies = new Set(parsed.encounteredEnemies ?? []);
      this.discoveredBonuses = new Set(parsed.discoveredBonuses ?? []);
      this.unlockedEntries = new Set(parsed.unlockedEntries ?? []);
      this.runState = {
        ...this.runState,
        ...(parsed.run ?? {}),
      };
      this.stats = {
        ...this.stats,
        ...(parsed.stats ?? {}),
      };
      this.catalogState = {
        runEnemyTypes: parsed.catalog?.runEnemyTypes ?? [],
      };
      this.devUnlockCodexEntries = parsed.dev?.unlockCodexEntries ?? false;

      const achievementEntries = Object.entries(parsed.achievements ?? {});
      for (const [id, state] of achievementEntries) {
        this.achievementState.set(id, {
          progress: Number.isFinite(state.progress) ? state.progress : 0,
          unlocked: !!state.unlocked,
        });
      }

      if (!Array.isArray(this.runState.uniqueBonusesSelected)) {
        this.runState.uniqueBonusesSelected = [];
      }
      if (!Array.isArray(this.stats.tutorialCompletedByClass)) {
        this.stats.tutorialCompletedByClass = [];
      }
      if (!this.stats.classHighestRoom || typeof this.stats.classHighestRoom !== 'object') {
        this.stats.classHighestRoom = {};
      }
      if (!Array.isArray(this.stats.uniqueBonusesSelectedLifetime)) {
        this.stats.uniqueBonusesSelectedLifetime = [];
      }
      if (!Array.isArray(this.stats.runHistory)) {
        this.stats.runHistory = [];
      }
      this.stats.introTakeoverCompleted = !!this.stats.introTakeoverCompleted;
      if (!Array.isArray(this.catalogState.runEnemyTypes)) {
        this.catalogState.runEnemyTypes = [];
      }

      this.reconcileAchievementState();
    } catch (error) {
      console.warn('Failed to load codex snapshot:', error);
    }
  }

  private async syncSnapshotToAdapter(): Promise<void> {
    if (!this.syncAdapter?.saveSnapshot) {
      return;
    }

    try {
      if (this.snapshotDirty) {
        if (this.snapshotSaveTimer !== null) {
          window.clearTimeout(this.snapshotSaveTimer);
          this.snapshotSaveTimer = null;
        }
        this.snapshotDirty = false;
        this.flushLocalSnapshotSave();
      }
      const data = localStorage.getItem(this.storageKey);
      if (!data) {
        return;
      }
      await this.syncAdapter.saveSnapshot(JSON.parse(data) as CodexSnapshot);
    } catch (error) {
      console.warn('Failed to sync codex snapshot to adapter:', error);
    }
  }
}
