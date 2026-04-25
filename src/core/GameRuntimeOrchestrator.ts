import { Vector3 } from '@babylonjs/core';
import { EnemyController } from '../gameplay/EnemyController';
import { EnemySpawner } from '../systems/EnemySpawner';
import { HUDManager } from '../systems/HUDManager';
import { PlayerController } from '../gameplay/PlayerController';
import { ProjectileManager } from '../gameplay/ProjectileManager';
import { RoomManager } from '../systems/RoomManager';
import { TileFloorManager } from '../systems/TileFloorManager';
import { UltimateManager } from '../gameplay/UltimateManager';
import { UltimateSystemManager } from '../systems/UltimateSystemManager';

export type RuntimeFrameGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';

export interface RuntimeFrameProfileSection {
  name: string;
  ms: number;
}

export interface RuntimeFrameProfileSnapshot {
  totalMs: number;
  sections: RuntimeFrameProfileSection[];
}

export interface RuntimeFrameProfiler {
  mark(name: string): void;
  finish(): RuntimeFrameProfileSnapshot;
}

export type GameRuntimeFrameContext = {
  playerController: PlayerController;
  enemySpawner: EnemySpawner;
  roomManager: RoomManager;
  projectileManager: ProjectileManager;
  ultimateSystemManager: UltimateSystemManager;
  ultimateManager: UltimateManager;
  hudManager: HUDManager;
  tileFloorManager: TileFloorManager;
  tilesEnabled: boolean;
  roomOrder: string[];
  currentRoomIndex: number;
  gameState: RuntimeFrameGameState;
  roomCleared: boolean;
  isTutorialRun: boolean;
  getCurrency: () => number;
  getConsumableStatusLabel: () => string;
  applyPassiveIncome: (deltaTime: number) => void;
  updateConsumablesFromInput: () => void;
  detectAndStartPlayerVoidFall: () => void;
  updatePlayerVoidFall: (deltaTime: number) => boolean;
  applySecondaryEnemySlow: (enemies: EnemyController[], center: Vector3, radius: number, speedMultiplier: number) => void;
  resolveEntityCollisions: (enemies: EnemyController[], deltaTime: number) => void;
  applyHazardDamage: (deltaTime: number) => void;
  updateDaemonIdleTest: (deltaTime: number, enemyCount: number) => void;
  resolveSecondaryBurst: (burst: NonNullable<ReturnType<PlayerController['consumePendingSecondaryBurst']>>, enemies: EnemyController[]) => void;
  resolveMageReactiveBurst: (burst: NonNullable<ReturnType<PlayerController['consumePendingMageReactiveBurst']>>, enemies: EnemyController[]) => void;
  resolveTankSweep: (sweep: NonNullable<ReturnType<PlayerController['consumePendingTankSweep']>>, enemies: EnemyController[]) => void;
  resolveTankShieldBash: (bash: NonNullable<ReturnType<PlayerController['consumePendingTankShieldBash']>>, enemies: EnemyController[]) => void;
  resolveRogueStrike: (strike: NonNullable<ReturnType<PlayerController['consumePendingRogueStrike']>>, enemies: EnemyController[]) => void;
  resolveRogueDashTrailSegment: (segment: {
    from: Vector3;
    to: Vector3;
    radius: number;
  }) => void;
  resolveRogueDashAttack: (dash: NonNullable<ReturnType<PlayerController['consumePendingRogueDashAttack']>>, enemies: EnemyController[]) => void;
  setRoomCleared: (value: boolean) => void;
  onRoomCleared: (roomId: string) => void;
  openBonusChoices: () => void;
  renderScene: () => void;
};

export function createRuntimeFrameProfiler(): RuntimeFrameProfiler {
  const sections: RuntimeFrameProfileSection[] = [];
  const startAt = performance.now();
  let lastMark = startAt;

  return {
    mark(name: string): void {
      const now = performance.now();
      sections.push({ name, ms: now - lastMark });
      lastMark = now;
    },
    finish(): RuntimeFrameProfileSnapshot {
      const now = performance.now();
      return {
        totalMs: now - startAt,
        sections: [...sections],
      };
    },
  };
}

export class GameRuntimeOrchestrator {
  updatePlayingFrame(
    context: GameRuntimeFrameContext,
    deltaTime: number,
    profiler?: RuntimeFrameProfiler | null,
  ): boolean {
    const enemies = context.enemySpawner.getEnemies();
    const hasPendingSpawns = context.enemySpawner.hasPendingSpawns();
    const frameProfiler = profiler ?? null;

    context.applyPassiveIncome(deltaTime);
    frameProfiler?.mark('applyPassiveIncome');

    context.updateConsumablesFromInput();
    frameProfiler?.mark('updateConsumables');

    context.playerController.setGameplayActive(true);
    context.playerController.setEnemiesPresent(enemies.length > 0 || hasPendingSpawns);
    context.playerController.update(deltaTime);
    frameProfiler?.mark('playerUpdate');

    context.detectAndStartPlayerVoidFall();
    const playerFalling = context.updatePlayerVoidFall(deltaTime);
    if (playerFalling) {
      if (context.tilesEnabled) {
        context.tileFloorManager.update(deltaTime);
      }
      this.updateHudFrame(context, deltaTime);
      frameProfiler?.mark('hudUpdate');
      context.renderScene();
      return true;
    }

    const secondaryActive = context.playerController.isSecondaryActive();
    const secondaryRadius = context.playerController.getSecondaryZoneRadius();
    const secondarySlow = context.playerController.getSecondarySlowMultiplier();
    const playerPosForSecondary = context.playerController.getPosition();
    const isMageSecondary = context.playerController.getClassId() === 'mage' && secondaryActive;
    const rogueStealthRange =
      (context.playerController.getClassId() === 'rogue' || context.playerController.getClassId() === 'cat') &&
      context.playerController.isSecondaryActive()
        ? context.playerController.getRogueStealthRadius()
        : undefined;

    context.projectileManager.setHostileProjectileSlowZone(
      isMageSecondary
        ? { center: playerPosForSecondary, radius: secondaryRadius, multiplier: secondarySlow }
        : null
    );
    frameProfiler?.mark('setProjectileSlowZone');

    context.enemySpawner.update(
      deltaTime,
      context.playerController.getPosition(),
      context.roomManager,
      context.playerController.getVelocity(),
      rogueStealthRange
    );
    frameProfiler?.mark('enemySpawnerUpdate');

    if (isMageSecondary) {
      context.applySecondaryEnemySlow(enemies, playerPosForSecondary, secondaryRadius, secondarySlow);
      frameProfiler?.mark('applySecondaryEnemySlow');
    }

    context.roomManager.updateDynamicHazards(deltaTime);
    frameProfiler?.mark('roomHazardsUpdate');

    const tankShieldBash = context.playerController.consumePendingTankShieldBash();
    if (tankShieldBash) {
      context.resolveTankShieldBash(tankShieldBash, enemies);
    }
    frameProfiler?.mark('tankShieldBash');

    context.resolveEntityCollisions(enemies, deltaTime);
    frameProfiler?.mark('resolveEntityCollisions');

    if (context.tilesEnabled) {
      context.tileFloorManager.update(deltaTime);
    }
    frameProfiler?.mark('tileFloorUpdate');

    context.applyHazardDamage(deltaTime);
    frameProfiler?.mark('applyHazardDamage');
    context.projectileManager.update(deltaTime, enemies, context.playerController, context.roomManager);
    frameProfiler?.mark('projectileUpdate');

    this.resolvePendingPlayerActions(context, enemies);
    frameProfiler?.mark('resolvePendingPlayerActions');
    context.ultimateSystemManager.update(deltaTime, enemies);
    frameProfiler?.mark('ultimateSystemUpdate');
    context.ultimateManager.update(deltaTime, enemies, context.playerController);
    frameProfiler?.mark('ultimateManagerUpdate');
    this.updateHudFrame(context, deltaTime);
    frameProfiler?.mark('hudUpdate');
    context.updateDaemonIdleTest(deltaTime, enemies.length);
    frameProfiler?.mark('daemonIdleUpdate');
    this.updateEnemyHealthBars(context, enemies);
    frameProfiler?.mark('enemyHealthBarUpdate');
    this.checkRoomCompletionAndBonusDoor(context, enemies, hasPendingSpawns);
    frameProfiler?.mark('checkRoomCompletion');
    return false;
  }

  updateNonPlayingFrame(context: GameRuntimeFrameContext, deltaTime: number): void {
    context.playerController.setGameplayActive(false);
    context.projectileManager.setHostileProjectileSlowZone(null);
    this.updateHudFrame(context, deltaTime);
  }

  private resolvePendingPlayerActions(context: GameRuntimeFrameContext, enemies: EnemyController[]): void {
    const secondaryBurst = context.playerController.consumePendingSecondaryBurst();
    if (secondaryBurst) {
      context.resolveSecondaryBurst(secondaryBurst, enemies);
    }

    const mageReactiveBurst = context.playerController.consumePendingMageReactiveBurst();
    if (mageReactiveBurst) {
      context.resolveMageReactiveBurst(mageReactiveBurst, enemies);
    }

    const tankSweep = context.playerController.consumePendingTankSweep();
    if (tankSweep) {
      context.resolveTankSweep(tankSweep, enemies);
    }

    const tankUltimate = context.playerController.consumePendingTankUltimate();
    if (tankUltimate) {
      context.ultimateSystemManager.startTankUltimate(tankUltimate, enemies);
    }

    const rogueStrike = context.playerController.consumePendingRogueStrike();
    if (rogueStrike) {
      context.resolveRogueStrike(rogueStrike, enemies);
    }

    const rogueDashTrailSegments = context.playerController.consumePendingRogueDashTrailSegments();
    for (const segment of rogueDashTrailSegments) {
      context.resolveRogueDashTrailSegment(segment);
    }

    const rogueDashAttack = context.playerController.consumePendingRogueDashAttack();
    if (rogueDashAttack) {
      context.resolveRogueDashAttack(rogueDashAttack, enemies);
    }

    const rogueUltimate = context.playerController.consumePendingRogueUltimate();
    if (rogueUltimate) {
      context.ultimateSystemManager.startRogueUltimate(rogueUltimate);
    }
  }

  private updateHudFrame(context: GameRuntimeFrameContext, deltaTime: number): void {
    context.hudManager.update(deltaTime);
    context.hudManager.updateSecondaryResource(
      context.playerController.getSecondaryResourceCurrent(),
      context.playerController.getSecondaryResourceMax(),
      context.playerController.isSecondaryActive(),
      context.playerController.getSecondaryActivationThreshold()
    );
    context.hudManager.updateCurrency(context.getCurrency());
    context.hudManager.updateItemStatus(context.getConsumableStatusLabel());
  }

  private updateEnemyHealthBars(context: GameRuntimeFrameContext, enemies: EnemyController[]): void {
    for (const enemy of enemies) {
      const health = enemy.getHealth();
      if (health) {
        context.hudManager.updateEnemyHealthBar(enemy.getId(), health.getCurrentHP(), health.getMaxHP());
      }
    }
  }

  private checkRoomCompletionAndBonusDoor(
    context: GameRuntimeFrameContext,
    enemies: EnemyController[],
    hasPendingSpawns: boolean,
  ): void {
    let roomCleared = context.roomCleared;

    if (!roomCleared && enemies.length === 0 && !hasPendingSpawns) {
      if (!context.isTutorialRun) {
        roomCleared = true;
        context.setRoomCleared(true);
        context.roomManager.setDoorActive(true);
        context.onRoomCleared(context.roomOrder[context.currentRoomIndex]);
      }
    }

    if (!roomCleared || context.gameState !== 'playing') return;

    const doorPos = context.roomManager.getDoorPosition();
    if (!doorPos) return;

    const playerPos = context.playerController.getPosition();
    if (Vector3.Distance(playerPos, doorPos) < 1.2) {
      context.openBonusChoices();
    }
  }
}
