/**
 * ConfigLoader - Loads and manages game configurations
 */

export interface PlayerConfig {
  health: { max: number; current?: number };
  movement: { speed: number };
  attack: { damage: number; fireRate: number; range: number; speed: number };
  passive?: { name: string; focusFireBonus: number; focusFireAccumulation: number };
  ultimate?: { name: string; chargeTime: number; radius: number; damage: number; duration: number };
  [key: string]: any;
}

export interface EnemyConfig {
  [key: string]: any;
}

export interface GameplayConfig {
  ui: {
    showEnemyHealthBars: boolean;
    showDamageNumbers: boolean;
    showFPS?: boolean;
  };
  debug: {
    enabled: boolean;
    godMode: boolean;
    infiniteUltimate: boolean;
    freezeEnemies: boolean;
    showGrid?: boolean;
  };
  camera?: {
    alpha: number;
    beta: number;
    radius: number;
    target: [number, number, number];
  };
  scaling?: {
    enabled: boolean;
    hpPerRoom: number;
    damagePerRoom: number;
    speedPerRoom: number;
  };
  [key: string]: any;
}

export interface RoomConfig {
  id: string;
  name: string;
  layout: string[];
  spawnPoints: { player: [number, number]; enemies: [number, number][] };
  [key: string]: any;
}

export class ConfigLoader {
  private static instance: ConfigLoader;

  private playerConfig: PlayerConfig | null = null;
  private enemiesConfig: any = null;
  private gameplayConfig: GameplayConfig | null = null;
  private roomsConfig: any = null;

  private constructor() {}

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  async loadAllConfigs(): Promise<void> {
    try {
      this.playerConfig = await this.loadJSON('/src/data/config/player.json');
      this.enemiesConfig = await this.loadJSON('/src/data/config/enemies.json');
      this.gameplayConfig = await this.loadJSON('/src/data/config/gameplay.json');
      this.roomsConfig = await this.loadJSON('/src/data/config/rooms.json');
      console.log('All configs loaded successfully');
    } catch (error) {
      console.error('Failed to load configs:', error);
      throw error;
    }
  }

  async loadConfigs(): Promise<void> {
    return this.loadAllConfigs();
  }

  private async loadJSON(path: string): Promise<any> {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  }

  getPlayer(): PlayerConfig | null {
    return this.playerConfig;
  }

  getPlayerConfig(): PlayerConfig | null {
    return this.playerConfig;
  }

  getEnemies(): any {
    return this.enemiesConfig;
  }

  getEnemiesConfig(): any {
    return this.enemiesConfig;
  }

  getGameplay(): GameplayConfig | null {
    return this.gameplayConfig;
  }

  getGameplayConfig(): GameplayConfig | null {
    return this.gameplayConfig;
  }

  getRoom(roomId: string): RoomConfig | null {
    if (!this.roomsConfig || !Array.isArray(this.roomsConfig)) {
      console.error('Rooms config not loaded or not an array:', this.roomsConfig);
      return null;
    }
    const room = this.roomsConfig.find((r: any) => r.id === roomId);
    if (!room) {
      console.error('Room not found:', roomId, 'Available rooms:', this.roomsConfig.map((r: any) => r.id));
    }
    return room || null;
  }

  getRooms(): any {
    return this.roomsConfig;
  }

  getRoomsConfig(): any {
    return this.roomsConfig;
  }

  updatePlayerConfig(config: PlayerConfig): void {
    this.playerConfig = config;
  }

  updateGameplayConfig(config: GameplayConfig): void {
    this.gameplayConfig = config;
  }

  updateDebugConfig(key: string, value: boolean): void {
    if (this.gameplayConfig && this.gameplayConfig.debug) {
      (this.gameplayConfig.debug as any)[key] = value;
    }
  }
}
