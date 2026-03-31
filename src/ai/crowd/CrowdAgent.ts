/**
 * CrowdAgent - Crowd avoidance for multiple entities
 */

import { Vector3 } from '@babylonjs/core';

export class CrowdAgent {
  private position: Vector3;
  private velocity: Vector3;
  private radius: number;
  private maxSpeed: number = 3.5;
  private separationWeight: number = 1.35;
  private alignmentWeight: number = 0.45;
  private cohesionWeight: number = 0.35;

  constructor(position: Vector3, radius: number) {
    this.position = position;
    this.velocity = Vector3.Zero();
    this.radius = radius;
  }

  update(deltaTime: number, neighbors: CrowdAgent[]): void {
    if (neighbors.length === 0) {
      this.position.addInPlace(this.velocity.scale(deltaTime));
      return;
    }

    let separation = Vector3.Zero();
    let alignment = Vector3.Zero();
    let cohesion = Vector3.Zero();
    let cohesionCenter = Vector3.Zero();
    let count = 0;

    for (const neighbor of neighbors) {
      if (neighbor === this) continue;
      const delta = this.position.subtract(neighbor.position);
      delta.y = 0;
      const distSq = delta.lengthSquared();
      if (distSq <= 0.0001) continue;

      const range = this.radius + neighbor.radius;
      if (distSq > range * range * 9) continue;

      const dist = Math.sqrt(distSq);
      const away = delta.scale(1 / dist);
      const pressure = Math.max(0, (range * 1.5 - dist) / Math.max(0.0001, range * 1.5));
      separation = separation.add(away.scale(pressure));
      alignment = alignment.add(neighbor.velocity);
      cohesionCenter = cohesionCenter.add(neighbor.position);
      count++;
    }

    if (count > 0) {
      separation = separation.scale(1 / count).scale(this.separationWeight);
      alignment = alignment.scale(1 / count).scale(this.alignmentWeight);
      const cohesionTarget = cohesionCenter.scale(1 / count);
      const cohesionDir = cohesionTarget.subtract(this.position);
      cohesionDir.y = 0;
      if (cohesionDir.lengthSquared() > 0.0001) {
        cohesion = cohesionDir.normalize().scale(this.cohesionWeight);
      }
    }

    const steering = separation.add(alignment).add(cohesion);
    this.velocity.addInPlace(steering.scale(deltaTime * 4));

    this.velocity.y = 0;
    const speed = this.velocity.length();
    if (speed > this.maxSpeed) {
      this.velocity = this.velocity.normalize().scale(this.maxSpeed);
    }

    this.position.addInPlace(this.velocity.scale(deltaTime));
  }

  getPosition(): Vector3 {
    return this.position;
  }

  setVelocity(velocity: Vector3): void {
    this.velocity = velocity.clone();
  }

  setMaxSpeed(maxSpeed: number): void {
    this.maxSpeed = Math.max(0.1, maxSpeed);
  }

  setWeights(separation: number, alignment: number, cohesion: number): void {
    this.separationWeight = Math.max(0, separation);
    this.alignmentWeight = Math.max(0, alignment);
    this.cohesionWeight = Math.max(0, cohesion);
  }
}
