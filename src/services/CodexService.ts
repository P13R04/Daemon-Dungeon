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

interface CodexSnapshot {
  version: 1;
  encounteredEnemies: string[];
  discoveredBonuses: string[];
  unlockedEntries: string[];
  achievements: Record<string, { progress: number; unlocked: boolean }>;
  run: {
    active: boolean;
    tookDamage: boolean;
    bonusesCollected: number;
  };
  stats: {
    totalEnemyKills: number;
    highestRoomReached: number;
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
    tookDamage: false,
    bonusesCollected: 0,
  };
  private stats: CodexSnapshot['stats'] = {
    totalEnemyKills: 0,
    highestRoomReached: 0,
  };
  private devUnlockCodexEntries: boolean = false;
  private syncAdapter?: CodexSyncAdapter;

  constructor(syncAdapter?: CodexSyncAdapter) {
    this.syncAdapter = syncAdapter;
    this.eventBus = EventBus.getInstance();
    this.loadLocalSnapshot();
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
    if (this.devUnlockCodexEntries) {
      return true;
    }
    return this.unlockedEntries.has(entryId);
  }

  isEnemyUnlocked(enemyTypeId: string): boolean {
    return this.devUnlockCodexEntries || this.encounteredEnemies.has(enemyTypeId);
  }

  isBonusUnlocked(bonusId: string): boolean {
    return this.devUnlockCodexEntries || this.discoveredBonuses.has(bonusId);
  }

  setDevUnlockCodexEntries(enabled: boolean): void {
    this.devUnlockCodexEntries = enabled;
    this.saveLocalSnapshot();
  }

  getDevUnlockCodexEntries(): boolean {
    return this.devUnlockCodexEntries;
  }

  async markEnemyEncountered(enemyTypeId: string): Promise<void> {
    if (!enemyTypeId || this.encounteredEnemies.has(enemyTypeId)) {
      return;
    }

    this.encounteredEnemies.add(enemyTypeId);
    await this.unlockEntry(`enemy:${enemyTypeId}`, 'enemy');
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

  getAchievementsProgress(): AchievementProgress[] {
    return Array.from(this.achievementDefinitions.values()).map((definition) => {
      const state = this.achievementState.get(definition.id) ?? { progress: 0, unlocked: false };
      return {
        ...definition,
        progress: Math.min(state.progress, definition.target),
        unlocked: state.unlocked,
      };
    });
  }

  startRunTracking(): void {
    this.runState = {
      active: true,
      tookDamage: false,
      bonusesCollected: 0,
    };
    this.saveLocalSnapshot();
  }

  endRunTracking(): void {
    this.runState.active = false;
    this.saveLocalSnapshot();
  }

  recordEnemyKilled(): void {
    this.stats.totalEnemyKills += 1;
    this.bumpAchievement('zombie_slayer', 1);
    this.saveLocalSnapshot();
  }

  recordRoomReached(roomNumber: number): void {
    this.stats.highestRoomReached = Math.max(this.stats.highestRoomReached, roomNumber);

    if (roomNumber >= 10) {
      this.completeAchievement('room_10');
      if (!this.runState.tookDamage) {
        this.completeAchievement('no_damage');
      }
    }

    this.saveLocalSnapshot();
  }

  recordBonusCollected(): void {
    if (!this.runState.active) {
      return;
    }

    this.runState.bonusesCollected += 1;
    if (this.runState.bonusesCollected >= 20) {
      this.completeAchievement('perfect_build');
    }

    this.saveLocalSnapshot();
  }

  recordPlayerDamaged(): void {
    if (!this.runState.active) {
      return;
    }

    this.runState.tookDamage = true;
    this.saveLocalSnapshot();
  }

  private bumpAchievement(id: string, delta: number): void {
    const definition = this.achievementDefinitions.get(id);
    if (!definition) return;

    const state = this.achievementState.get(id) ?? { progress: 0, unlocked: false };
    if (state.unlocked) return;

    const nextProgress = Math.min(definition.target, state.progress + delta);
    this.achievementState.set(id, { progress: nextProgress, unlocked: nextProgress >= definition.target });

    if (nextProgress >= definition.target) {
      this.eventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, { achievementId: id });
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
    this.eventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, { achievementId: id });
  }

  private reconcileAchievementState(): void {
    this.setAchievementProgress('zombie_slayer', Math.max(0, this.stats.totalEnemyKills));

    if (this.stats.highestRoomReached >= 10) {
      this.completeAchievement('room_10');
    }

    if (this.stats.highestRoomReached >= 10 && !this.runState.tookDamage && this.runState.active) {
      this.completeAchievement('no_damage');
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
    try {
      const snapshot: CodexSnapshot = {
        version: 1,
        encounteredEnemies: [...this.encounteredEnemies],
        discoveredBonuses: [...this.discoveredBonuses],
        unlockedEntries: [...this.unlockedEntries],
        achievements: Array.from(this.achievementState.entries()).reduce<Record<string, { progress: number; unlocked: boolean }>>((acc, [id, state]) => {
          acc[id] = state;
          return acc;
        }, {}),
        run: this.runState,
        stats: this.stats,
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
      if (!parsed || parsed.version !== 1) {
        return;
      }

      this.encounteredEnemies = new Set(parsed.encounteredEnemies ?? []);
      this.discoveredBonuses = new Set(parsed.discoveredBonuses ?? []);
      this.unlockedEntries = new Set(parsed.unlockedEntries ?? []);
      this.runState = parsed.run ?? this.runState;
      this.stats = parsed.stats ?? this.stats;
      this.devUnlockCodexEntries = parsed.dev?.unlockCodexEntries ?? false;

      const achievementEntries = Object.entries(parsed.achievements ?? {});
      for (const [id, state] of achievementEntries) {
        this.achievementState.set(id, {
          progress: Number.isFinite(state.progress) ? state.progress : 0,
          unlocked: !!state.unlocked,
        });
      }
    } catch (error) {
      console.warn('Failed to load codex snapshot:', error);
    }
  }

  private async syncSnapshotToAdapter(): Promise<void> {
    if (!this.syncAdapter?.saveSnapshot) {
      return;
    }

    try {
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
