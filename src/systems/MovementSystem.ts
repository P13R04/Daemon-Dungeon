/**
 * MovementSystem - Processes all entity movement
 */

import { Entity } from '../entities/Entity';
import { Movement } from '../components/Movement';

export class MovementSystem {
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
    for (const entity of this.entities) {
      const movement = entity.getComponent<Movement>('movement');
      if (movement) {
        movement.update(deltaTime);
      }
    }
  }
}
