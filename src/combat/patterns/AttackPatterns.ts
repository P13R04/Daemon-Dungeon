/**
 * Attack Patterns - Defines different attack execution patterns
 */

import { Vector3 } from '@babylonjs/core';

export interface AttackPayload {
  [key: string]: unknown;
}

export interface IAttackPattern {
  execute(source: Vector3, target: Vector3, data: AttackPayload): void;
}

export class ProjectilePattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: AttackPayload): void {
    void source;
    void target;
    void data;
    // TODO: Spawn projectile entity
    // Calculate direction and velocity
    // Apply pattern-specific modifiers (homing, arc, etc.)
  }
}

export class RaycastPattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: AttackPayload): void {
    void source;
    void target;
    void data;
    // TODO: Perform raycast
    // Check for hits
    // Apply damage to first hit
  }
}

export class MeleePattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: AttackPayload): void {
    void source;
    void target;
    void data;
    // TODO: Check range
    // Apply damage in melee range
    // Trigger melee animation
  }
}

export class AoEPattern implements IAttackPattern {
  execute(source: Vector3, target: Vector3, data: AttackPayload): void {
    void source;
    void target;
    void data;
    // TODO: Find all entities in radius
    // Apply damage to all
    // Spawn VFX
  }
}
