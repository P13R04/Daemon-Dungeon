/**
 * Attack Patterns - Defines different attack execution patterns
 */

import { Vector3 } from '@babylonjs/core';

export interface IAttackPattern {
  execute(source: Vector3, target: Vector3, data: any): void;
}

export class ProjectilePattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: any): void {
    // TODO: Spawn projectile entity
    // Calculate direction and velocity
    // Apply pattern-specific modifiers (homing, arc, etc.)
  }
}

export class RaycastPattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: any): void {
    // TODO: Perform raycast
    // Check for hits
    // Apply damage to first hit
  }
}

export class MeleePattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: any): void {
    // TODO: Check range
    // Apply damage in melee range
    // Trigger melee animation
  }
}

export class AoEPattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: any): void {
    // TODO: Find all entities in radius
    // Apply damage to all
    // Spawn VFX
  }
}
