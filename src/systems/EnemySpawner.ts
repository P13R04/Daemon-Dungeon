/**
 * EnemySpawner - Manages enemy spawning from room data
 */

import { Scene, Vector3 } from '@babylonjs/core';
import { EnemyController } from '../gameplay/EnemyController';
import { ConfigLoader } from '../utils/ConfigLoader';
import { RoomManager } from './RoomManager';
import { EventBus, GameEvents } from '../core/EventBus';

export class EnemySpawner {
  private enemies: EnemyController[] = [];
  private eventBus: EventBus;
  private configLoader: ConfigLoader;
  private difficultyLevel: number = 0;

  constructor(
    private scene: Scene,
    private roomManager: RoomManager
  ) {
    this.eventBus = EventBus.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.eventBus.on(GameEvents.ENEMY_SPAWN_REQUESTED, (data) => {
      const typeId = data?.typeId;
      const position = data?.position;
      if (!typeId || !position) return;
      this.spawnEnemyAt(typeId, position);
    });
  }

  spawnEnemiesForRoom(roomId: string): void {
    const room = this.configLoader.getRoom(roomId);
    const enemyConfig = this.configLoader.getEnemies();

    if (!room || !enemyConfig) {
      console.error('Missing room or enemy config!');
      return;
    }

    // Spawn enemy at each room spawn point (includes enemyType)
    const spawnPoints = this.roomManager.getSpawnPointsWithType();
    for (const spawnPoint of spawnPoints) {
      const enemyType = spawnPoint.enemyType || 'zombie_basic';
      const enemyTypeConfig = enemyConfig[enemyType];
      if (!enemyTypeConfig) continue;

      const gameplayConfig = this.configLoader.getGameplay();
      const scaling = gameplayConfig?.scaling;
      const level = Math.max(0, this.difficultyLevel);

      const hpMultiplier = scaling?.enabled ? Math.pow(scaling.hpPerRoom ?? 1, level) : 1;
      const dmgMultiplier = scaling?.enabled ? Math.pow(scaling.damagePerRoom ?? 1, level) : 1;

      const scaledConfig = {
        ...enemyTypeConfig,
        baseStats: {
          ...enemyTypeConfig.baseStats,
          hp: Math.round((enemyTypeConfig.baseStats?.hp ?? 40) * hpMultiplier),
          damage: Math.round((enemyTypeConfig.baseStats?.damage ?? 8) * dmgMultiplier),
        },
      };

      const enemy = new EnemyController(this.scene, enemyType, spawnPoint.position, scaledConfig);
      this.enemies.push(enemy);
    }
  }

  private spawnEnemyAt(typeId: string, position: Vector3): void {
    const enemyConfig = this.configLoader.getEnemies();
    if (!enemyConfig) return;

    const enemyTypeConfig = enemyConfig[typeId];
    if (!enemyTypeConfig) return;

    const gameplayConfig = this.configLoader.getGameplay();
    const scaling = gameplayConfig?.scaling;
    const level = Math.max(0, this.difficultyLevel);

    const hpMultiplier = scaling?.enabled ? Math.pow(scaling.hpPerRoom ?? 1, level) : 1;
    const dmgMultiplier = scaling?.enabled ? Math.pow(scaling.damagePerRoom ?? 1, level) : 1;

    const scaledConfig = {
      ...enemyTypeConfig,
      baseStats: {
        ...enemyTypeConfig.baseStats,
        hp: Math.round((enemyTypeConfig.baseStats?.hp ?? 40) * hpMultiplier),
        damage: Math.round((enemyTypeConfig.baseStats?.damage ?? 8) * dmgMultiplier),
      },
    };

    const enemy = new EnemyController(this.scene, typeId, position, scaledConfig);
    this.enemies.push(enemy);
  }

  setDifficultyLevel(level: number): void {
    this.difficultyLevel = level;
  }

  getEnemies(): EnemyController[] {
    return this.enemies.filter(e => e.isActive());
  }

  update(
    deltaTime: number,
    playerPosition: Vector3,
    roomManager?: RoomManager,
    playerVelocity?: Vector3,
    detectionRange?: number
  ): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      if (!enemy.isActive()) {
        this.enemies.splice(i, 1);
        continue;
      }

      const detected =
        detectionRange == null ||
        Vector3.Distance(enemy.getPosition(), playerPosition) <= detectionRange;

      enemy.update(
        deltaTime,
        playerPosition,
        this.enemies,
        roomManager,
        playerVelocity ?? new Vector3(0, 0, 0),
        detected
      );
    }
  }

  dispose(): void {
    this.enemies.forEach(e => e.dispose());
    this.enemies = [];
  }
}
