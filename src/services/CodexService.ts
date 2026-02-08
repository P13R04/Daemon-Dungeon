/**
 * CodexService - Manage codex unlocks and progression
 */

import { ApiClient } from './ApiClient';
import { EventBus, GameEvents } from '../core/EventBus';

export interface CodexEntry {
  id: string;
  type: 'enemy' | 'item' | 'bonus' | 'class';
  name: string;
  description: string;
  unlocked: boolean;
}

export class CodexService {
  private apiClient: ApiClient;
  private eventBus: EventBus;
  private unlockedEntries: Set<string> = new Set();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.eventBus = EventBus.getInstance();
    this.loadLocalUnlocks();
  }

  async unlockEntry(entryId: string, entryType: string): Promise<void> {
    if (this.unlockedEntries.has(entryId)) return;

    this.unlockedEntries.add(entryId);
    this.saveLocalUnlocks();

    this.eventBus.emit(GameEvents.CODEX_ENTRY_UNLOCKED, { entryId, entryType });

    // Sync to backend
    try {
      await this.apiClient.post('/codex/unlock', { entryId, entryType });
    } catch (error) {
      console.warn('Failed to sync codex unlock to backend:', error);
    }
  }

  async fetchUnlockedEntries(): Promise<CodexEntry[]> {
    try {
      return await this.apiClient.get<CodexEntry[]>('/codex');
    } catch (error) {
      console.warn('Failed to fetch codex from backend:', error);
      return [];
    }
  }

  isUnlocked(entryId: string): boolean {
    return this.unlockedEntries.has(entryId);
  }

  private saveLocalUnlocks(): void {
    localStorage.setItem('codexUnlocks', JSON.stringify([...this.unlockedEntries]));
  }

  private loadLocalUnlocks(): void {
    const data = localStorage.getItem('codexUnlocks');
    if (data) {
      this.unlockedEntries = new Set(JSON.parse(data));
    }
  }
}
