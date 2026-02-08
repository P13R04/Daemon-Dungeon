/**
 * Attack Payloads - Defines what happens on hit
 */

import { Entity } from '../../entities/Entity';
import { Health } from '../../components/Health';

export interface IPayload {
  apply(target: Entity, source?: Entity): void;
}

export class DamagePayload implements IPayload {
  private damage: number;

  constructor(damage: number) {
    this.damage = damage;
  }

  apply(target: Entity, source?: Entity): void {
    const health = target.getComponent<Health>('health');
    if (health) {
      health.takeDamage(this.damage);
    }
  }
}

export class HealPayload implements IPayload {
  private healAmount: number;

  constructor(healAmount: number) {
    this.healAmount = healAmount;
  }

  apply(target: Entity, source?: Entity): void {
    const health = target.getComponent<Health>('health');
    if (health) {
      health.heal(this.healAmount);
    }
  }
}

export class KnockbackPayload implements IPayload {
  private force: number;

  constructor(force: number) {
    this.force = force;
  }

  apply(target: Entity, source?: Entity): void {
    // TODO: Apply knockback force to target
  }
}
