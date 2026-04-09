/**
 * ConfigLoader - Loads and manages game configurations
 */

import type { EnemiesConfig, GameplayConfig, PlayerConfig, RoomConfig, RoomsConfig } from '../types/config';

export class ConfigLoader {
  private static instance: ConfigLoader;

  private playerConfig: PlayerConfig | null = null;
  private enemiesConfig: EnemiesConfig | null = null;
  private gameplayConfig: GameplayConfig | null = null;
  private roomsConfig: RoomsConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  async loadAllConfigs(): Promise<void> {
    try {
      this.playerConfig = await this.loadJSON<PlayerConfig>('/src/data/config/player.json');
      this.enemiesConfig = await this.loadJSON<EnemiesConfig>('/src/data/config/enemies.json');
      this.gameplayConfig = await this.loadJSON<GameplayConfig>('/src/data/config/gameplay.json');

      const roomModules = import.meta.glob('../data/rooms/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const loadedRooms = Object.values(roomModules)
        .map((module) => (module as { default?: RoomConfig }).default ?? (module as RoomConfig))
        .filter((room): room is RoomConfig => Boolean(room && typeof room.id === 'string'));

      if (loadedRooms.length > 0) {
        this.roomsConfig = loadedRooms.sort((a, b) => a.id.localeCompare(b.id));
      } else {
        this.roomsConfig = await this.loadJSON<RoomsConfig>('/src/data/config/rooms.json');
      }

      console.log('All configs loaded successfully');
    } catch (error) {
      console.error('Failed to load configs:', error);
      throw error;
    }
  }

  private async loadJSON<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  getPlayerConfig(): PlayerConfig | null {
    return this.playerConfig;
  }

  getEnemiesConfig(): EnemiesConfig | null {
    return this.enemiesConfig;
  }

  getGameplayConfig(): GameplayConfig | null {
    return this.gameplayConfig;
  }

  getRoom(roomId: string): RoomConfig | null {
    if (!this.roomsConfig || !Array.isArray(this.roomsConfig)) {
      console.error('Rooms config not loaded or not an array:', this.roomsConfig);
      return null;
    }
    const room = this.roomsConfig.find((r) => r.id === roomId);
    if (!room) {
      console.error('Room not found:', roomId, 'Available rooms:', this.roomsConfig.map((r) => r.id));
    }
    return room || null;
  }

  getRoomsConfig(): RoomsConfig | null {
    return this.roomsConfig;
  }

  updatePlayerConfig(config: PlayerConfig): void {
    this.playerConfig = config;
  }

  updateGameplayConfig(config: GameplayConfig): void {
    this.gameplayConfig = config;
  }

  updateDebugConfig(key: keyof NonNullable<GameplayConfig['debug']>, value: boolean): void {
    if (!this.gameplayConfig) return;
    if (this.gameplayConfig.debug && key in this.gameplayConfig.debug) {
      this.gameplayConfig.debug[key] = value;
    }
    if (this.gameplayConfig.debugConfig && key in this.gameplayConfig.debugConfig) {
      this.gameplayConfig.debugConfig[key] = value;
    }
  }
}
