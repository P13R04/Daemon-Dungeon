/**
 * Attack - Attack capabilities component
 */

import { IComponent } from '../entities/Entity';

export interface AttackPattern {
  type: 'projectile' | 'raycast' | 'melee' | 'aoe';
  // Pattern-specific data
}

export interface AttackPayload {
  damage: number;
  // Additional payload data (heal, knockback, etc.)
}

export interface AttackModifier {
  type: 'stun' | 'dot' | 'pierce' | 'bounce' | 'slow';
  // Modifier-specific data
}

export class Attack implements IComponent {
  private pattern: AttackPattern;
  private payload: AttackPayload;
  private modifiers: AttackModifier[] = [];
  private fireRate: number;
  private timeSinceLastAttack: number = 0;

  constructor(pattern: AttackPattern, payload: AttackPayload, fireRate: number) {
    this.pattern = pattern;
    this.payload = payload;
    this.fireRate = fireRate;
  }

  canAttack(): boolean {
    return this.timeSinceLastAttack >= this.fireRate;
  }

  performAttack(): void {
    if (!this.canAttack()) return;
    
    // TODO: Execute attack based on pattern, payload, and modifiers
    this.timeSinceLastAttack = 0;
  }

  addModifier(modifier: AttackModifier): void {
    this.modifiers.push(modifier);
  }

  removeModifier(type: string): void {
    this.modifiers = this.modifiers.filter(m => m.type !== type);
  }

  update(deltaTime: number): void {
    this.timeSinceLastAttack += deltaTime;
  }

  destroy(): void {
    // Cleanup
  }
}
