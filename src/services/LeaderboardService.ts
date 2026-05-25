/**
 * LeaderboardService - Fetch and submit leaderboard data
 */

import { ApiClient } from './ApiClient';

export interface ScoreSubmission {
  class: string;
  score: number;
  roomsCleared: number;
  timeSurvived: number;
  buildSummary: Record<string, unknown>;
}

export interface LeaderboardFilter {
  period?: 'daily' | 'weekly' | 'alltime';
  class?: string;
}

export interface LeaderboardEntry {
  [key: string]: unknown;
}

export class LeaderboardService {
  private apiClient: ApiClient;
  private cache: Map<string, LeaderboardEntry[]> = new Map();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  async fetchLeaderboard(filter: LeaderboardFilter = {}): Promise<LeaderboardEntry[]> {
    const cacheKey = JSON.stringify(filter);
    
    try {
      const params = new URLSearchParams();
      if (filter.period) params.set('period', filter.period);
      if (filter.class) params.set('class', filter.class);
      const data = await this.apiClient.get<LeaderboardEntry[]>(`/leaderboard?${params.toString()}`);
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      return this.cache.get(cacheKey) || [];
    }
  }

  async submitScore(submission: ScoreSubmission): Promise<void> {
    try {
      await this.apiClient.post('/leaderboard/submit', submission);
      this.cache.clear(); // Invalidate cache
    } catch (error) {
      console.error('Failed to submit score:', error);
      throw error;
    }
  }
}
