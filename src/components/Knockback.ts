/**
 * Knockback - Shared knockback handler with damping
 */

import { Vector3 } from '@babylonjs/core';

export class Knockback {
  private velocity: Vector3 = Vector3.Zero();
  private damping: number;

  constructor(damping: number = 10) {
    this.damping = damping;
  }

  setDamping(damping: number): void {
    this.damping = damping;
  }

  apply(force: Vector3): void {
    if (!force || force.lengthSquared() === 0) return;
    this.velocity = this.velocity.add(force);
  }

  update(deltaTime: number): Vector3 {
    if (this.velocity.lengthSquared() <= 0.0001) {
      this.velocity = Vector3.Zero();
      return Vector3.Zero();
    }

    const displacement = this.velocity.scale(deltaTime);
    const decay = Math.max(0, 1 - this.damping * deltaTime);
    this.velocity = this.velocity.scale(decay);
    return displacement;
  }

  reset(): void {
    this.velocity = Vector3.Zero();
  }
}
