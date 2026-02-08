/**
 * EntityFactory - Creates entities with proper component composition
 */

import { Scene } from '@babylonjs/core';
import { Entity } from './Entity';

export class EntityFactory {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  createPlayer(classConfig: any): Entity {
    // TODO: Create player entity with class-specific components
    const player = new Entity('player');
    
    // Add components based on config
    // player.addComponent('transform', new Transform());
    // player.addComponent('health', new Health(classConfig.hp));
    // player.addComponent('movement', new Movement(classConfig.speed));
    // player.addComponent('attack', new Attack(classConfig.primary));
    
    return player;
  }

  createEnemy(enemyConfig: any, roomNumber: number): Entity {
    // TODO: Create enemy with scaled stats
    const enemy = new Entity(`enemy_${Date.now()}`);
    
    // Apply scaling based on room number
    // const scaledHP = enemyConfig.baseHP * getScaling(roomNumber);
    
    return enemy;
  }

  createProjectile(attackData: any): Entity {
    // TODO: Create projectile entity from attack pattern
    const projectile = new Entity(`projectile_${Date.now()}`);
    
    return projectile;
  }
}
