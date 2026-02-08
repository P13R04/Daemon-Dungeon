/**
 * Health - HP management component
 */

import { IComponent } from '../entities/Entity';
import { EventBus, GameEvents } from '../core/EventBus';

export class Health implements IComponent {
  private currentHP: number;
  private maxHP: number;
  private eventBus: EventBus;
  private entityId: string;

  constructor(maxHP: number, entityId: string) {
    this.maxHP = maxHP;
    this.currentHP = maxHP;
    this.entityId = entityId;
    this.eventBus = EventBus.getInstance();
  }

  takeDamage(amount: number): void {
    this.currentHP = Math.max(0, this.currentHP - amount);
    
    this.eventBus.emit(GameEvents.ENEMY_DAMAGED, {
      entityId: this.entityId,
      damage: amount,
      currentHP: this.currentHP,
      maxHP: this.maxHP
    });

    if (this.currentHP <= 0) {
      this.die();
    }
  }

  heal(amount: number): void {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }

  setMaxHP(newMax: number, healToFull: boolean = false): void {
    this.maxHP = Math.max(1, newMax);
    if (healToFull) {
      this.currentHP = this.maxHP;
    } else {
      this.currentHP = Math.min(this.currentHP, this.maxHP);
    }
  }

  private die(): void {
    this.eventBus.emit(GameEvents.ENEMY_DIED, {
      entityId: this.entityId
    });
  }

  getCurrentHP(): number {
    return this.currentHP;
  }

  getMaxHP(): number {
    return this.maxHP;
  }

  getHPPercentage(): number {
    return this.currentHP / this.maxHP;
  }

  update(deltaTime: number): void {
    // Health component is passive
  }

  destroy(): void {
    // Cleanup if needed
  }
}
