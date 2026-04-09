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
  resolveTankSweep: (sweep: NonNullable<ReturnType<PlayerController['consumePendingTankSweep']>>, enemies: EnemyController[]) => void;
  resolveTankShieldBash: (bash: NonNullable<ReturnType<PlayerController['consumePendingTankShieldBash']>>, enemies: EnemyController[]) => void;
  resolveRogueStrike: (strike: NonNullable<ReturnType<PlayerController['consumePendingRogueStrike']>>, enemies: EnemyController[]) => void;
  resolveRogueDashAttack: (dash: NonNullable<ReturnType<PlayerController['consumePendingRogueDashAttack']>>, enemies: EnemyController[]) => void;
  setRoomCleared: (value: boolean) => void;
  onRoomCleared: (roomId: string) => void;
  openBonusChoices: () => void;
  renderScene: () => void;
};

export class GameRuntimeOrchestrator {
  updatePlayingFrame(context: GameRuntimeFrameContext, deltaTime: number): boolean {
    const enemies = context.enemySpawner.getEnemies();
    context.applyPassiveIncome(deltaTime);
    context.updateConsumablesFromInput();
    context.playerController.setGameplayActive(true);
    context.playerController.setEnemiesPresent(enemies.length > 0);
    context.playerController.update(deltaTime);

    context.detectAndStartPlayerVoidFall();
    const playerFalling = context.updatePlayerVoidFall(deltaTime);
    if (playerFalling) {
      if (context.tilesEnabled) {
        context.tileFloorManager.update(deltaTime);
      }
      this.updateHudFrame(context, deltaTime);
      context.renderScene();
      return true;
    }

    const secondaryActive = context.playerController.isSecondaryActive();
    const secondaryRadius = context.playerController.getSecondaryZoneRadius();
    const secondarySlow = context.playerController.getSecondarySlowMultiplier();
    const playerPosForSecondary = context.playerController.getPosition();
    const isMageSecondary = context.playerController.getClassId() === 'mage' && secondaryActive;
    const rogueStealthRange =
      context.playerController.getClassId() === 'rogue' && context.playerController.isSecondaryActive()
        ? context.playerController.getRogueStealthRadius()
        : undefined;

    context.projectileManager.setHostileProjectileSlowZone(
      isMageSecondary
        ? { center: playerPosForSecondary, radius: secondaryRadius, multiplier: secondarySlow }
        : null
    );

    context.enemySpawner.update(
      deltaTime,
      context.playerController.getPosition(),
      context.roomManager,
      context.playerController.getVelocity(),
      rogueStealthRange
    );

    if (isMageSecondary) {
      context.applySecondaryEnemySlow(enemies, playerPosForSecondary, secondaryRadius, secondarySlow);
    }

    context.roomManager.updateDynamicHazards(deltaTime);

    const tankShieldBash = context.playerController.consumePendingTankShieldBash();
    if (tankShieldBash) {
      context.resolveTankShieldBash(tankShieldBash, enemies);
    }

    context.resolveEntityCollisions(enemies, deltaTime);

    if (context.tilesEnabled) {
      context.tileFloorManager.update(deltaTime);
    }

    context.applyHazardDamage(deltaTime);
    context.projectileManager.update(deltaTime, enemies, context.playerController, context.roomManager);

    this.resolvePendingPlayerActions(context, enemies);
    context.ultimateSystemManager.update(deltaTime, enemies);
    context.ultimateManager.update(deltaTime, enemies, context.playerController);
    this.updateHudFrame(context, deltaTime);
    context.updateDaemonIdleTest(deltaTime, enemies.length);
    this.updateEnemyHealthBars(context, enemies);
    this.checkRoomCompletionAndBonusDoor(context, enemies);
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

  private checkRoomCompletionAndBonusDoor(context: GameRuntimeFrameContext, enemies: EnemyController[]): void {
    let roomCleared = context.roomCleared;

    if (!roomCleared && enemies.length === 0) {
      roomCleared = true;
      context.setRoomCleared(true);
      context.roomManager.setDoorActive(true);
      context.onRoomCleared(context.roomOrder[context.currentRoomIndex]);
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
