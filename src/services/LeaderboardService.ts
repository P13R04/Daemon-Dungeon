/**
 * LeaderboardService - Fetch and submit leaderboard data
 */

import { ApiClient } from './ApiClient';

export interface ScoreSubmission {
  class: string;
  score: number;
  roomsCleared: number;
  timeSurvived: number;
  buildSummary: any;
}

export interface LeaderboardFilter {
  period?: 'daily' | 'weekly' | 'alltime';
  class?: string;
}

export class LeaderboardService {
  private apiClient: ApiClient;
  private cache: Map<string, any> = new Map();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  async fetchLeaderboard(filter: LeaderboardFilter = {}): Promise<any[]> {
    const cacheKey = JSON.stringify(filter);
    
    try {
      const params = new URLSearchParams(filter as any).toString();
      const data = await this.apiClient.get<any[]>(`/leaderboard?${params}`);
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
