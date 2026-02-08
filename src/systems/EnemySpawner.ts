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

  constructor(
    private scene: Scene,
    private roomManager: RoomManager
  ) {
    this.eventBus = EventBus.getInstance();
    this.configLoader = ConfigLoader.getInstance();
  }

  spawnEnemiesForRoom(roomId: string): void {
    const room = this.configLoader.getRoom(roomId);
    const enemyConfig = this.configLoader.getEnemies();

    if (!room || !enemyConfig) {
      console.error('Missing room or enemy config!');
      return;
    }

    // Spawn enemy at each room spawn point (includes enemyType)
    const spawnPoints = Array.isArray((room as any).spawnPoints)
      ? (room as any).spawnPoints
      : [];
    for (const spawnPoint of spawnPoints) {
      const enemyType = spawnPoint.enemyType || 'zombie_basic';
      const enemyTypeConfig = enemyConfig[enemyType];
      if (!enemyTypeConfig) continue;

      const spawnPos = new Vector3(
        spawnPoint.x * 1.0 + 0.5,
        1.0,
        spawnPoint.y * 1.0 + 0.5
      );

      const enemy = new EnemyController(this.scene, enemyType, spawnPos, enemyTypeConfig);
      this.enemies.push(enemy);
    }
  }

  getEnemies(): EnemyController[] {
    return this.enemies.filter(e => e.isActive());
  }

  update(deltaTime: number, playerPosition: any): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      if (!enemy.isActive()) {
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(deltaTime, playerPosition);
    }
  }

  dispose(): void {
    this.enemies.forEach(e => e.dispose());
    this.enemies = [];
  }
}
