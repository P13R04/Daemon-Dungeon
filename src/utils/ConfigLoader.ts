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
  private facileRoomsConfig: RoomsConfig | null = null;
  private intermediaireRoomsConfig: RoomsConfig | null = null;
  private difficileRoomsConfig: RoomsConfig | null = null;
  private extremeRoomsConfig: RoomsConfig | null = null;
  private bossRoomsConfig: RoomsConfig | null = null;
  private aiRoomsConfig: RoomsConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  async loadAllConfigs(): Promise<void> {
    try {
      this.playerConfig = await this.loadJSON<PlayerConfig>('data/config/player.json');
      this.enemiesConfig = await this.loadJSON<EnemiesConfig>('data/config/enemies.json');
      this.gameplayConfig = await this.loadJSON<GameplayConfig>('data/config/gameplay.json');

      const facileRoomModules = import.meta.glob('../data/rooms/facile/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const intermediaireRoomModules = import.meta.glob('../data/rooms/intermediaire/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const difficileRoomModules = import.meta.glob('../data/rooms/difficile/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const extremeRoomModules = import.meta.glob('../data/rooms/Extreme/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const bossRoomModules = import.meta.glob('../data/rooms/boss/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      // Eager glob load for dynamically generated AI rooms (updated with difficile rooms and extreme horde rooms)
      const aiRoomModules = import.meta.glob('../data/rooms/ai_rooms/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const legacyRootRoomModules = import.meta.glob('../data/rooms/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;
      const legacyOldTestRoomModules = import.meta.glob('../data/rooms/old_test_rooms/room_*.json', { eager: true }) as Record<
        string,
        { default?: RoomConfig } | RoomConfig
      >;

      const loadedFacileRooms = this.normalizeRoomModules(facileRoomModules);
      const loadedIntermediaireRooms = this.normalizeRoomModules(intermediaireRoomModules);
      const loadedDifficileRooms = this.normalizeRoomModules(difficileRoomModules);
      const loadedExtremeRooms = this.normalizeRoomModules(extremeRoomModules);
      const loadedBossRooms = this.normalizeRoomModules(bossRoomModules);
      const loadedAiRooms = this.normalizeRoomModules(aiRoomModules);
      const loadedLegacyRootRooms = this.normalizeRoomModules(legacyRootRoomModules);
      const loadedLegacyOldTestRooms = this.normalizeRoomModules(legacyOldTestRoomModules);

      this.facileRoomsConfig = loadedFacileRooms;
      this.intermediaireRoomsConfig = loadedIntermediaireRooms;
      this.difficileRoomsConfig = loadedDifficileRooms;
      this.extremeRoomsConfig = loadedExtremeRooms;
      this.bossRoomsConfig = loadedBossRooms;
      this.aiRoomsConfig = loadedAiRooms;

      const combinedRooms = [
        ...loadedFacileRooms,
        ...loadedIntermediaireRooms,
        ...loadedDifficileRooms,
        ...loadedExtremeRooms,
        ...loadedBossRooms,
        ...loadedAiRooms,
        ...loadedLegacyRootRooms,
        ...loadedLegacyOldTestRooms,
      ].sort((a, b) => a.id.localeCompare(b.id));

      this.roomsConfig = combinedRooms.length > 0 ? combinedRooms : await this.loadJSON<RoomsConfig>('data/config/rooms.json');

      console.log('All configs loaded successfully');
    } catch (error) {
      console.error('Failed to load configs:', error);
      throw error;
    }
  }

  private async loadJSON<T>(path: string): Promise<T> {
    const isDev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
    const url = isDev ? `${path}?t=${Date.now()}` : path;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          cache: isDev ? 'no-store' : 'default',
        });
        if (!response.ok) {
          throw new Error(`Failed to load ${path}: ${response.status}`);
        }
        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 120 * (attempt + 1)));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to load ${path}`);
  }

  private normalizeRoomModules(modules: Record<string, { default?: RoomConfig } | RoomConfig>): RoomsConfig {
    return Object.values(modules)
      .map((module) => (module as { default?: RoomConfig }).default ?? (module as RoomConfig))
      .filter((room): room is RoomConfig => Boolean(room && typeof room.id === 'string'))
      .sort((a, b) => a.id.localeCompare(b.id));
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

  getFacileRoomsConfig(): RoomsConfig | null {
    return this.facileRoomsConfig;
  }

  getIntermediaireRoomsConfig(): RoomsConfig | null {
    return this.intermediaireRoomsConfig;
  }

  getDifficileRoomsConfig(): RoomsConfig | null {
    return this.difficileRoomsConfig;
  }

  getExtremeRoomsConfig(): RoomsConfig | null {
    return this.extremeRoomsConfig;
  }

  getBossRoomsConfig(): RoomsConfig | null {
    return this.bossRoomsConfig;
  }

  getAiRoomsConfig(): RoomsConfig | null {
    return this.aiRoomsConfig;
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
