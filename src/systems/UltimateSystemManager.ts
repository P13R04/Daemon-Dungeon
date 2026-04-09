import { Vector3 } from '@babylonjs/core';
import { EnemyController } from '../gameplay/EnemyController';
import { PlayerController } from '../gameplay/PlayerController';

interface RogueUltimateState {
  remaining: number;
  zoneRadius: number;
  hitDamage: number;
  teleportInterval: number;
  teleportOffset: number;
  timer: number;
  targetedEnemyIds: Set<string>;
}

interface TankUltimateState {
  remaining: number;
  radius: number;
  damage: number;
  stunDuration: number;
  knockbackStrength: number;
  tickInterval: number;
  tickTimer: number;
}

export interface TankUltimatePayload {
  position: Vector3;
  radius: number;
  damage: number;
  stunDuration: number;
  knockbackStrength: number;
  tickInterval: number;
  duration: number;
}

export interface RogueUltimatePayload {
  duration: number;
  zoneRadius: number;
  hitDamage: number;
  teleportInterval: number;
  teleportOffset: number;
}

export interface UltimateSystemCallbacks {
  getPlayerController(): PlayerController;
  onTankZoneStarted(radius: number): void;
  onTankZoneUpdated(deltaTime: number): void;
  onTankZoneDisposed(): void;
}

export class UltimateSystemManager {
  private rogueUltimateState: RogueUltimateState | null = null;
  private tankUltimateState: TankUltimateState | null = null;

  constructor(private readonly callbacks: UltimateSystemCallbacks) {}

  startTankUltimate(payload: TankUltimatePayload, enemies: EnemyController[]): void {
    const player = this.callbacks.getPlayerController();
    player.setTankUltimateActive(true);
    this.tankUltimateState = {
      remaining: payload.duration,
      radius: payload.radius,
      damage: payload.damage,
      stunDuration: payload.stunDuration,
      knockbackStrength: payload.knockbackStrength,
      tickInterval: payload.tickInterval,
      tickTimer: 0,
    };

    this.callbacks.onTankZoneStarted(payload.radius);
    this.applyTankUltimatePulse(enemies);
  }

  startRogueUltimate(payload: RogueUltimatePayload): void {
    const player = this.callbacks.getPlayerController();
    player.setRogueUltimateActive(true);
    this.rogueUltimateState = {
      remaining: payload.duration,
      zoneRadius: payload.zoneRadius,
      hitDamage: payload.hitDamage,
      teleportInterval: payload.teleportInterval,
      teleportOffset: payload.teleportOffset,
      timer: 0,
      targetedEnemyIds: new Set<string>(),
    };
  }

  update(deltaTime: number, enemies: EnemyController[]): void {
    this.updateRogueUltimate(deltaTime, enemies);
    this.updateTankUltimate(deltaTime, enemies);
  }

  reset(): void {
    const player = this.callbacks.getPlayerController();
    player.setRogueUltimateActive(false);
    player.setTankUltimateActive(false);
    this.rogueUltimateState = null;
    this.tankUltimateState = null;
    this.callbacks.onTankZoneDisposed();
  }

  private applyTankUltimatePulse(enemies: EnemyController[]): void {
    if (!this.tankUltimateState) return;

    const player = this.callbacks.getPlayerController();
    const center = player.getPosition();
    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const toEnemy = enemyPos.subtract(center);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      if (distance > this.tankUltimateState.radius) continue;

      enemy.takeDamage(this.tankUltimateState.damage);
      enemy.applyStun?.(this.tankUltimateState.stunDuration);

      const outward = toEnemy.lengthSquared() > 0.0001
        ? toEnemy.normalize()
        : new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      enemy.applyExternalKnockback(outward.scale(this.tankUltimateState.knockbackStrength));
    }
  }

  private updateRogueUltimate(deltaTime: number, enemies: EnemyController[]): void {
    if (!this.rogueUltimateState) return;

    const player = this.callbacks.getPlayerController();
    if (player.getClassId() !== 'rogue') {
      player.setRogueUltimateActive(false);
      this.rogueUltimateState = null;
      return;
    }

    this.rogueUltimateState.remaining -= deltaTime;
    this.rogueUltimateState.timer -= deltaTime;
    if (this.rogueUltimateState.remaining <= 0) {
      player.setRogueUltimateActive(false);
      this.rogueUltimateState = null;
      return;
    }
    if (this.rogueUltimateState.timer > 0) return;

    const playerPos = player.getPosition();
    const inZone = enemies.filter((enemy) => Vector3.Distance(enemy.getPosition(), playerPos) <= this.rogueUltimateState!.zoneRadius);
    if (inZone.length === 0) return;

    const untargeted = inZone.filter((enemy) => !this.rogueUltimateState!.targetedEnemyIds.has(enemy.getId()));
    const candidates = untargeted.length > 0 ? untargeted : inZone;
    if (untargeted.length === 0) {
      this.rogueUltimateState.targetedEnemyIds.clear();
    }

    let target = candidates[0];
    let bestDistance = Vector3.Distance(playerPos, target.getPosition());
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const distance = Vector3.Distance(playerPos, candidate.getPosition());
      if (distance < bestDistance) {
        bestDistance = distance;
        target = candidate;
      }
    }

    const targetPos = target.getPosition();
    const toTarget = targetPos.subtract(playerPos);
    toTarget.y = 0;
    const teleportDir = toTarget.lengthSquared() > 0.0001 ? toTarget.normalize() : new Vector3(1, 0, 0);
    const newPlayerPos = targetPos.subtract(teleportDir.scale(this.rogueUltimateState.teleportOffset));
    newPlayerPos.y = 1.0;
    player.setPosition(newPlayerPos);

    target.takeDamage(player.computeRogueHitDamage(this.rogueUltimateState.hitDamage));
    this.rogueUltimateState.targetedEnemyIds.add(target.getId());
    this.rogueUltimateState.timer = this.rogueUltimateState.teleportInterval;
  }

  private updateTankUltimate(deltaTime: number, enemies: EnemyController[]): void {
    if (!this.tankUltimateState) return;

    const player = this.callbacks.getPlayerController();
    if (player.getClassId() !== 'firewall') {
      player.setTankUltimateActive(false);
      this.tankUltimateState = null;
      this.callbacks.onTankZoneDisposed();
      return;
    }

    this.callbacks.onTankZoneUpdated(deltaTime);

    this.tankUltimateState.tickTimer -= deltaTime;
    if (this.tankUltimateState.tickTimer <= 0) {
      this.applyTankUltimatePulse(enemies);
      this.tankUltimateState.tickTimer = this.tankUltimateState.tickInterval;
    }

    this.tankUltimateState.remaining -= deltaTime;
    if (this.tankUltimateState.remaining <= 0) {
      player.setTankUltimateActive(false);
      player.animationController.playUltimateEnd();
      this.tankUltimateState = null;
      this.callbacks.onTankZoneDisposed();
    }
  }
}
