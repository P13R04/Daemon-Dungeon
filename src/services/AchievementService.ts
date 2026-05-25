/**
 * AchievementService - Track and unlock achievements
 */

import { ApiClient } from './ApiClient';
import { EventBus, GameEvents } from '../core/EventBus';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
}

export class AchievementService {
  private apiClient: ApiClient;
  private eventBus: EventBus;
  private achievements: Map<string, Achievement> = new Map();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.eventBus = EventBus.getInstance();
    this.loadLocalAchievements();
  }

  async updateProgress(achievementId: string, progress: number): Promise<void> {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return;

    achievement.progress = Math.min(progress, achievement.target);

    if (achievement.progress >= achievement.target && !achievement.completed) {
      achievement.completed = true;
      this.eventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, { achievementId });
    } else {
      this.eventBus.emit(GameEvents.ACHIEVEMENT_PROGRESS, { achievementId, progress: achievement.progress });
    }

    this.saveLocalAchievements();

    // Sync to backend (debounced)
    this.syncToBackend(achievementId);
  }

  async incrementProgress(achievementId: string, amount: number = 1): Promise<void> {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return;

    await this.updateProgress(achievementId, achievement.progress + amount);
  }

  private syncTimer?: number;
  private syncToBackend(achievementId: string): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = window.setTimeout(async () => {
      const achievement = this.achievements.get(achievementId);
      if (!achievement) return;

      try {
        await this.apiClient.post('/achievements/progress', {
          achievementId,
          progress: achievement.progress,
          completed: achievement.completed,
        });
      } catch (error) {
        console.warn('Failed to sync achievement to backend:', error);
      }
    }, 5000);
  }

  async fetchAchievements(): Promise<Achievement[]> {
    try {
      const data = await this.apiClient.get<Achievement[]>('/achievements');
      data.forEach(achievement => {
        this.achievements.set(achievement.id, achievement);
      });
      return data;
    } catch (error) {
      console.warn('Failed to fetch achievements from backend:', error);
      return [...this.achievements.values()];
    }
  }

  getAchievement(id: string): Achievement | undefined {
    return this.achievements.get(id);
  }

  private saveLocalAchievements(): void {
    const data = [...this.achievements.values()];
    localStorage.setItem('achievements', JSON.stringify(data));
  }

  private loadLocalAchievements(): void {
    const data = localStorage.getItem('achievements');
    if (data) {
      const achievements: Achievement[] = JSON.parse(data);
      achievements.forEach(achievement => {
        this.achievements.set(achievement.id, achievement);
      });
    }
  }
}
