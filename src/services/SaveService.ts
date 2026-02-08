/**
 * SaveService - Save and load run state
 */

import { ApiClient } from './ApiClient';

export interface RunSaveData {
  class: string;
  roomNumber: number;
  playerState: any;
  seed?: string;
  timestamp: number;
}

export class SaveService {
  private apiClient: ApiClient;
  private localSave?: RunSaveData;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  async saveRun(data: RunSaveData): Promise<void> {
    // Save locally first
    this.localSave = data;
    localStorage.setItem('runSave', JSON.stringify(data));

    // Then sync to backend if authenticated
    try {
      await this.apiClient.post('/save', data);
    } catch (error) {
      console.warn('Failed to sync save to backend:', error);
    }
  }

  async loadRun(): Promise<RunSaveData | null> {
    // Try to load from backend first
    try {
      const data = await this.apiClient.get<RunSaveData>('/save');
      this.localSave = data;
      return data;
    } catch (error) {
      console.warn('Failed to load save from backend:', error);
    }
    
    // Fallback to local storage
    const localData = localStorage.getItem('runSave');
    if (localData) {
      const parsed: RunSaveData = JSON.parse(localData);
      this.localSave = parsed;
      return parsed;
    }

    return null;
  }

  async deleteRun(): Promise<void> {
    this.localSave = undefined;
    localStorage.removeItem('runSave');

    try {
      await this.apiClient.delete('/save');
    } catch (error) {
      console.warn('Failed to delete save from backend:', error);
    }
  }

  hasLocalSave(): boolean {
    return !!localStorage.getItem('runSave');
  }
}
