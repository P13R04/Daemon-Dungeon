/**
 * AI Behaviors - Modular behavior implementations
 */

import { Vector3 } from '@babylonjs/core';
import { Entity } from '../../entities/Entity';

export interface IBehavior {
  execute(entity: Entity, target?: Entity, deltaTime?: number): void;
}

export class ChaseBehavior implements IBehavior {
  private speed: number;

  constructor(speed: number) {
    this.speed = speed;
  }

  execute(entity: Entity, target?: Entity, deltaTime: number = 0): void {
    if (!target) return;
    
    // TODO: Calculate direction to target
    // TODO: Move entity towards target
  }
}

export class AttackBehavior implements IBehavior {
  private attackRange: number;

  constructor(attackRange: number) {
    this.attackRange = attackRange;
  }

  execute(entity: Entity, target?: Entity): void {
    if (!target) return;
    
    // TODO: Check if in range
    // TODO: Execute attack
  }
}

export class FleeBehavior implements IBehavior {
  private fleeDistance: number;

  constructor(fleeDistance: number) {
    this.fleeDistance = fleeDistance;
  }

  execute(entity: Entity, target?: Entity, deltaTime: number = 0): void {
    if (!target) return;
    
    // TODO: Move away from target
  }
}

export class PatrolBehavior implements IBehavior {
  private waypoints: Vector3[];
  private currentWaypointIndex: number = 0;

  constructor(waypoints: Vector3[]) {
    this.waypoints = waypoints;
  }

  execute(entity: Entity, target?: Entity, deltaTime: number = 0): void {
    // TODO: Move to next waypoint
    // TODO: Cycle through waypoints
  }
}
