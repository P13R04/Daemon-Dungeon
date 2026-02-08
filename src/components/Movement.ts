/**
 * Movement - Handles entity movement
 */

import { Vector3 } from '@babylonjs/core';
import { IComponent } from '../entities/Entity';
import { Transform } from './Transform';

export class Movement implements IComponent {
  private transform: Transform;
  private speed: number;
  private velocity: Vector3 = Vector3.Zero();

  constructor(transform: Transform, speed: number) {
    this.transform = transform;
    this.speed = speed;
  }

  setVelocity(direction: Vector3): void {
    this.velocity = direction.normalize().scale(this.speed);
  }

  update(deltaTime: number): void {
    if (this.velocity.length() > 0) {
      const movement = this.velocity.scale(deltaTime);
      this.transform.position.addInPlace(movement);
    }
  }

  stop(): void {
    this.velocity = Vector3.Zero();
  }

  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  destroy(): void {
    // Cleanup
  }
}
