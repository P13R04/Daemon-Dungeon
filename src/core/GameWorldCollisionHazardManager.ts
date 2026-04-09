import { Vector3 } from '@babylonjs/core';
import { ConfigLoader } from '../utils/ConfigLoader';
import { EnemyController } from '../gameplay/EnemyController';
import { PlayerController } from '../gameplay/PlayerController';
import { RoomManager } from '../systems/RoomManager';
import { TileFloorManager } from '../systems/TileFloorManager';

export class GameWorldCollisionHazardManager {
  constructor(
    private readonly playerController: PlayerController,
    private readonly roomManager: RoomManager,
    private readonly tileFloorManager: TileFloorManager,
    private readonly configLoader: ConfigLoader,
  ) {}

  resolveEntityCollisions(enemies: EnemyController[], deltaTime: number): void {
    const playerRadius = 0.35;
    let playerPos = this.playerController.getPosition();

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      const delta = enemyPos.subtract(playerPos);
      const distance = delta.length();
      const minDistance = playerRadius + enemy.getRadius();

      if (distance > 0 && distance < minDistance) {
        const knockback = enemy.handleContactHit?.(playerPos);
        if (knockback) {
          this.playerController.applyKnockback(knockback);
        }
        const push = delta.normalize().scale(minDistance - distance);
        const isPong = enemy.getBehavior?.() === 'pong';

        if (isPong) {
          playerPos = playerPos.subtract(push);
        } else {
          const half = push.scale(0.5);
          playerPos = playerPos.subtract(half);
          enemy.setPosition(enemyPos.add(half));
        }
      }
    }

    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i];
        const b = enemies[j];
        const posA = a.getPosition();
        const posB = b.getPosition();
        const delta = posB.subtract(posA);
        const distance = delta.length();
        const minDistance = a.getRadius() + b.getRadius();

        if (distance > 0 && distance < minDistance) {
          const push = delta.normalize().scale((minDistance - distance) / 2);
          a.setPosition(posA.subtract(push));
          b.setPosition(posB.add(push));
        }
      }
    }

    playerPos = this.roomManager.resolvePlayerAgainstPushables(
      playerPos,
      playerRadius,
      this.playerController.getVelocity(),
      deltaTime,
    );

    const obstacles = this.roomManager.getObstacleBounds();
    for (const ob of obstacles) {
      playerPos = this.resolveCircleAabb(playerPos, playerRadius, ob);
    }

    for (const enemy of enemies) {
      let enemyPos = enemy.getPosition();
      const radius = enemy.getRadius();
      for (const ob of obstacles) {
        enemyPos = this.resolveCircleAabb(enemyPos, radius, ob);
      }
      enemy.setPosition(enemyPos);
    }

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();
      if (!this.roomManager.isWalkable(enemyPos.x, enemyPos.z)) {
        const prevPos = enemy.getPreviousPosition?.() ?? enemyPos;
        enemy.setPosition(prevPos);
        if (enemy.onWallCollision) {
          enemy.onWallCollision();
        }
      }
    }

    const bounds = this.roomManager.getRoomBounds();
    if (bounds) {
      const minX = bounds.minX + 1.5;
      const maxX = bounds.maxX - 1.5;
      const minZ = bounds.minZ + 1.5;
      const maxZ = bounds.maxZ - 1.5;
      playerPos.x = Math.max(minX, Math.min(maxX, playerPos.x));
      playerPos.z = Math.max(minZ, Math.min(maxZ, playerPos.z));
      playerPos.y = 1.0;
    }

    this.playerController.setPosition(playerPos);
  }

  applyHazardDamage(deltaTime: number, skipForVoidFall: boolean, tilesEnabled: boolean): void {
    if (skipForVoidFall) {
      return;
    }

    const zones = this.roomManager.getHazardZones();
    const playerPos = this.playerController.getPosition();

    for (const zone of zones) {
      const inside =
        playerPos.x >= zone.minX &&
        playerPos.x <= zone.maxX &&
        playerPos.z >= zone.minZ &&
        playerPos.z <= zone.maxZ;

      if (inside) {
        const damage = zone.damage * deltaTime;
        this.playerController.applyDamage(damage);
      }
    }

    for (const hazard of this.roomManager.getCurrentMobileHazards()) {
      const dx = playerPos.x - hazard.position.x;
      const dz = playerPos.z - hazard.position.z;
      const contactRadius = hazard.radius + 0.35;
      if ((dx * dx + dz * dz) <= (contactRadius * contactRadius)) {
        this.playerController.applyDamage(hazard.damagePerSecond * deltaTime);
      }
    }

    if (!tilesEnabled) {
      return;
    }

    const gameplayConfig = this.configLoader.getGameplayConfig();
    const tileHazards = gameplayConfig?.tileHazards ?? {};
    const poisonDps = tileHazards.poisonDps ?? 0;
    const spikesDps = tileHazards.spikesDps ?? 0;

    const tile = this.tileFloorManager.getTileAtWorld(playerPos.x, playerPos.z);
    if (tile?.type === 'poison' && poisonDps > 0) {
      this.playerController.applyDamage(poisonDps * deltaTime);
    }
    if (tile?.type === 'spikes' && spikesDps > 0 && this.tileFloorManager.isSpikeActiveAtWorld(playerPos.x, playerPos.z)) {
      this.playerController.applyDamage(spikesDps * deltaTime);
    }
  }

  private resolveCircleAabb(
    pos: Vector3,
    radius: number,
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): Vector3 {
    const clampedX = Math.max(box.minX, Math.min(box.maxX, pos.x));
    const clampedZ = Math.max(box.minZ, Math.min(box.maxZ, pos.z));
    const dx = pos.x - clampedX;
    const dz = pos.z - clampedZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius || distSq === 0) {
      return pos;
    }

    const dist = Math.sqrt(distSq);
    const push = (radius - dist) + 0.001;
    const nx = dx / dist;
    const nz = dz / dist;

    return new Vector3(pos.x + nx * push, pos.y, pos.z + nz * push);
  }
}
