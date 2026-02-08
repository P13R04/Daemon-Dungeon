/**
 * SpawnSystem - Manages enemy spawning based on room data
 */

import { Scene } from '@babylonjs/core';
import { Entity } from '../entities/Entity';
import { EntityFactory } from '../entities/EntityFactory';

export interface SpawnPoint {
  x: number;
  z: number;
  enemyType: string;
}

export class SpawnSystem {
  private scene: Scene;
  private entityFactory: EntityFactory;
  private spawnedEntities: Entity[] = [];

  constructor(scene: Scene, entityFactory: EntityFactory) {
    this.scene = scene;
    this.entityFactory = entityFactory;
  }

  spawnEnemiesForRoom(spawnPoints: SpawnPoint[], roomNumber: number): Entity[] {
    const enemies: Entity[] = [];
    
    for (const point of spawnPoints) {
      // TODO: Load enemy config and create entity
      // const config = loadEnemyConfig(point.enemyType);
      // const enemy = this.entityFactory.createEnemy(config, roomNumber);
      // Position enemy at spawn point
      // enemies.push(enemy);
    }
    
    this.spawnedEntities.push(...enemies);
    return enemies;
  }

  clearSpawnedEntities(): void {
    for (const entity of this.spawnedEntities) {
      entity.destroy();
    }
    this.spawnedEntities = [];
  }

  update(deltaTime: number): void {
    // Spawn system may be passive or handle wave-based spawning
  }
}
