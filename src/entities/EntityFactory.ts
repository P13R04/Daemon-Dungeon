/**
 * EntityFactory - Creates entities with proper component composition
 */

import { Scene } from '@babylonjs/core';
import { Entity } from './Entity';
import type { EnemyConfigEntry, PlayerClassConfig } from '../types/config';

interface ProjectileAttackData {
  damage?: number;
  speed?: number;
  range?: number;
  type?: string;
  [key: string]: unknown;
}

export class EntityFactory {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  createPlayer(classConfig: PlayerClassConfig): Entity {
    void classConfig;
    // TODO: Create player entity with class-specific components
    const player = new Entity('player');

    // Add components based on config
    // player.addComponent('transform', new Transform());
    // player.addComponent('health', new Health(classConfig.hp));
    // player.addComponent('movement', new Movement(classConfig.speed));
    // player.addComponent('attack', new Attack(classConfig.primary));

    return player;
  }

  createEnemy(enemyConfig: EnemyConfigEntry, roomNumber: number): Entity {
    void enemyConfig;
    void roomNumber;
    // TODO: Create enemy with scaled stats
    const enemy = new Entity(`enemy_${Date.now()}`);

    // Apply scaling based on room number
    // const scaledHP = enemyConfig.baseHP * getScaling(roomNumber);

    return enemy;
  }

  createProjectile(attackData: ProjectileAttackData): Entity {
    void attackData;
    // TODO: Create projectile entity from attack pattern
    const projectile = new Entity(`projectile_${Date.now()}`);

    return projectile;
  }
}
