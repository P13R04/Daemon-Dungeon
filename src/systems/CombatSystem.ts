/**
 * CombatSystem - Processes attacks, collisions, and damage
 */

import { Entity } from '../entities/Entity';
import { Attack } from '../components/Attack';
import { Health } from '../components/Health';

export class CombatSystem {
  private entities: Entity[] = [];

  addEntity(entity: Entity): void {
    this.entities.push(entity);
  }

  removeEntity(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index > -1) {
      this.entities.splice(index, 1);
    }
  }

  update(deltaTime: number): void {
    // Update attack cooldowns
    for (const entity of this.entities) {
      const attack = entity.getComponent<Attack>('attack');
      if (attack) {
        attack.update(deltaTime);
      }
    }

    // TODO: Check collisions and apply damage
    this.checkProjectileCollisions();
  }

  private checkProjectileCollisions(): void {
    // TODO: Implement collision detection between projectiles and entities
  }

  applyDamage(target: Entity, amount: number): void {
    const health = target.getComponent<Health>('health');
    if (health) {
      health.takeDamage(amount);
    }
  }
}
