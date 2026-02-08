/**
 * AISystem - Updates all AI-controlled entities
 */

import { Entity } from '../entities/Entity';
import { AIController } from '../components/AIController';

export class AISystem {
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
      const ai = entity.getComponent<AIController>('ai');
      if (ai) {
        ai.update(deltaTime);
      }
    }
  }
}
