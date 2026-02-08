/**
 * Attack Modifiers - Modify attack behavior or add effects
 */

import { Entity } from '../../entities/Entity';

export interface IModifier {
  modify(data: any): any;
  onHit?(target: Entity): void;
}

export class StunModifier implements IModifier {
  private duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }

  modify(data: any): any {
    return data;
  }

  onHit(target: Entity): void {
    // TODO: Apply stun status effect
  }
}

export class DotModifier implements IModifier {
  private damagePerTick: number;
  private duration: number;

  constructor(damagePerTick: number, duration: number) {
    this.damagePerTick = damagePerTick;
    this.duration = duration;
  }

  modify(data: any): any {
    return data;
  }

  onHit(target: Entity): void {
    // TODO: Apply DoT status effect
  }
}

export class PierceModifier implements IModifier {
  private pierceCount: number;

  constructor(pierceCount: number) {
    this.pierceCount = pierceCount;
  }

  modify(data: any): any {
    // Modify projectile to pierce through enemies
    return { ...data, pierce: this.pierceCount };
  }
}

export class BounceModifier implements IModifier {
  private bounceCount: number;
  private bounceRange: number;

  constructor(bounceCount: number, bounceRange: number) {
    this.bounceCount = bounceCount;
    this.bounceRange = bounceRange;
  }

  modify(data: any): any {
    // Modify projectile to bounce to nearby enemies
    return { ...data, bounce: this.bounceCount, bounceRange: this.bounceRange };
  }
}
