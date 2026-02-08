/**
 * EnemyController - Controls a single enemy
 */

import { Scene, Mesh, Vector3 } from '@babylonjs/core';
import { VisualPlaceholder } from '../utils/VisualPlaceholder';
import { Health } from '../components/Health';
import { EventBus, GameEvents } from '../core/EventBus';
import { Time } from '../core/Time';
import { MathUtils } from '../utils/Math';
import { ConfigLoader } from '../utils/ConfigLoader';

export class EnemyController {
  private mesh!: Mesh;
  private health!: Health;
  private eventBus: EventBus;
  private time: Time;
  private scene: Scene;
  private id: string;
  
  private config: any;
  private position: Vector3 = Vector3.Zero();
  private velocity: Vector3 = Vector3.Zero();
  
  private speed: number = 0;
  private damage: number = 0;
  private attackRange: number = 0;
  private attackCooldown: number = 0;
  private dots: Array<{ remaining: number; dps: number }> = [];
  
  private target: Vector3 | null = null;
  private isAlive: boolean = true;

  constructor(scene: Scene, typeId: string, position: Vector3, config: any) {
    this.scene = scene;
    this.config = config;
    this.position = position.clone();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.id = `enemy_${typeId}_${Date.now()}_${Math.random()}`;

    // Initialize from config
    this.speed = config.baseStats?.speed || 2.5;
    this.damage = config.baseStats?.damage || 8;
    this.attackRange = config.baseStats?.attackRange || 1.5;

    this.initialize();
  }

  private initialize(): void {
    // Create visual
    this.mesh = VisualPlaceholder.createEnemyPlaceholder(this.scene, this.id);
    this.mesh.position = this.position.clone();
    // Ensure enemy is at correct height
    this.mesh.position.y = 1.0;
    
    console.log('Enemy initialized:', this.id, 'at position:', this.mesh.position);
    console.log('Enemy mesh visible:', this.mesh.isVisible, 'enabled:', this.mesh.isEnabled());

    // Setup health
    const maxHP = this.config.baseStats?.hp || 40;
    this.health = new Health(maxHP, this.id);

    // Setup attack stats (config is already the zombie_basic object)
    this.speed = this.config.baseStats.speed;
    this.damage = this.config.baseStats.damage;
    this.attackRange = this.config.baseStats.attackRange;
    this.attackCooldown = 0;

    this.eventBus.emit(GameEvents.ENEMY_SPAWNED, {
      entityId: this.id,
      maxHP: maxHP,
    });
  }

  update(deltaTime: number, playerPosition: Vector3): void {
    if (!this.isAlive || !this.mesh) return;

    // Check if enemies are frozen via debug flag
    const configLoader = ConfigLoader.getInstance();
    const gameplayConfig = configLoader.getGameplay();
    if (gameplayConfig?.debugConfig?.freezeEnemies) {
      return; // Don't update if frozen
    }

    // Apply DOTs
    if (this.dots.length > 0) {
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        const dmg = dot.dps * deltaTime;
        if (dmg > 0) {
          this.takeDamage(dmg);
        }
        dot.remaining -= deltaTime;
        if (dot.remaining <= 0) {
          this.dots.splice(i, 1);
        }
      }
    }

    this.target = playerPosition;

    // Update movement towards player
    this.updateMovement(deltaTime);
    
    this.position = this.position.add(this.velocity.scale(deltaTime));
    this.mesh.position = this.position;

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    // Check if in attack range
    const distance = Vector3.Distance(this.position, playerPosition);
    if (distance <= this.attackRange && this.attackCooldown <= 0) {
      this.attackPlayer();
    }
  }

  private updateMovement(deltaTime: number): void {
    if (!this.target) {
      this.velocity = Vector3.Zero();
      return;
    }

    const direction = this.target.subtract(this.position);
    const distance = direction.length();

    if (distance > this.attackRange) {
      this.velocity = direction.normalize().scale(this.speed);
    } else {
      this.velocity = Vector3.Zero();
    }
  }

  private attackPlayer(): void {
    this.eventBus.emit(GameEvents.ATTACK_PERFORMED, {
      attacker: this.id,
      type: 'melee',
      damage: this.damage,
    });

    this.attackCooldown = this.config.baseStats.attackCooldown;
  }

  takeDamage(amount: number): void {
    this.health.takeDamage(amount);

    this.eventBus.emit(GameEvents.ENEMY_DAMAGED, {
      entityId: this.id,
      damage: amount,
      position: this.position.clone(),
    });

    if (this.health.getCurrentHP() <= 0) {
      this.die();
    }
  }

  private die(): void {
    this.isAlive = false;
    if (this.mesh) {
      this.mesh.dispose();
    }
    this.eventBus.emit(GameEvents.ENEMY_DIED, {
      entityId: this.id,
      position: this.position.clone(),
    });
  }

  getPosition(): Vector3 {
    return this.position.clone();
  }

  setPosition(position: Vector3): void {
    this.position = position.clone();
    this.position.y = 1.0;
    if (this.mesh) {
      this.mesh.position = this.position;
    }
  }

  getRadius(): number {
    return 0.35;
  }

  applyDot(totalDamage: number, duration: number): void {
    if (duration <= 0) return;
    const dps = totalDamage / duration;
    this.dots.push({ remaining: duration, dps });
  }

  getHealth(): Health {
    return this.health;
  }

  getMesh(): Mesh {
    return this.mesh;
  }

  isActive(): boolean {
    return this.isAlive;
  }

  getId(): string {
    return this.id;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}
