/**
 * AIController - AI behavior component
 */

import { IComponent } from '../entities/Entity';

export enum AIBehaviorType {
  IDLE = 'idle',
  CHASE = 'chase',
  ATTACK = 'attack',
  FLEE = 'flee',
  PATROL = 'patrol'
}

export class AIController implements IComponent {
  private currentBehavior: AIBehaviorType = AIBehaviorType.IDLE;
  private target?: any; // Target entity (usually player)

  constructor() {}

  setBehavior(behavior: AIBehaviorType): void {
    this.currentBehavior = behavior;
  }

  setTarget(target: any): void {
    this.target = target;
  }

  update(deltaTime: number): void {
    // TODO: Execute current behavior
    switch (this.currentBehavior) {
      case AIBehaviorType.CHASE:
        this.chase();
        break;
      case AIBehaviorType.ATTACK:
        this.attack();
        break;
      // etc...
    }
  }

  private chase(): void {
    // TODO: Move towards target
  }

  private attack(): void {
    // TODO: Execute attack
  }

  destroy(): void {
    // Cleanup
  }
}
