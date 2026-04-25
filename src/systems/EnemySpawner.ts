/**
 * EnemySpawner - Manages enemy spawning from room data
 */

import { Scene, Vector3 } from '@babylonjs/core';
import { EnemyController } from '../gameplay/EnemyController';
import { ConfigLoader } from '../utils/ConfigLoader';
import { RoomManager } from './RoomManager';
import { EventBus, GameEvents } from '../core/EventBus';
import type { EnemyRuntimeConfig } from '../gameplay/enemy/EnemyControllerTypes';

interface EnemySpawnRequestPayload {
  typeId?: string;
  position?: Vector3;
}

type EnemyPrewarmOptions = {
  prewarmHeavyAssets?: boolean;
};

type SpawnEnemyNowOptions = {
  difficultyLevelOverride?: number;
  suppressSpawnEvent?: boolean;
  suppressAI?: boolean;
  suppressRender?: boolean;
  targetCollection?: EnemyController[];
};

type FogMask = {
  z: number;
  direction: number;
  revealDistance: number;
  hiddenVisibility: number;
};

export class EnemySpawner {
  private enemies: EnemyController[] = [];
  private eventBus: EventBus;
  private configLoader: ConfigLoader;
  private difficultyLevel: number = 0;
  private pendingRoomSpawnQueue: Array<{ typeId: string; position: Vector3 }> = [];
  private progressiveSpawningEnabled: boolean = true;
  private spawnBatchSize: number = 2;
  private scaledEnemyConfigCache: Map<string, EnemyRuntimeConfig> = new Map();
  private prewarmedRoomDifficultyKeys: Set<string> = new Set();
  private heavyAssetPrewarmedRoomDifficultyKeys: Set<string> = new Set();
  private heavyAssetPrewarmQueue: Set<string> = new Set();
  private heavyAssetPrewarmTimer: number | null = null;
  private transitionPreparationRoomKey: string | null = null;
  private transitionPreparationQueue: Array<{ typeId: string; position: Vector3; difficultyLevel: number }> = [];
  private transitionPreparedEnemies: EnemyController[] = [];
  private deferredEnemyDisposalQueue: EnemyController[] = [];
  private suppressedAIActivationQueue: EnemyController[] = [];
  private orphanBullCleanupAccumulator: number = 0;
  private orphanBullCleanupIntervalSeconds: number = 1.0;
  private fogMask: FogMask | null = null;

  constructor(
    private scene: Scene,
    private roomManager: RoomManager
  ) {
    this.eventBus = EventBus.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.eventBus.on(GameEvents.ENEMY_SPAWN_REQUESTED, (data: EnemySpawnRequestPayload) => {
      const typeId = data?.typeId;
      const position = data?.position;
      console.log(`[EnemySpawner] ENEMY_SPAWN_REQUESTED: typeId=${typeId}, pos=${position}`);
      if (!typeId || !position) return;
      this.spawnEnemyAt(typeId, position);
    });
  }

  setFogMask(mask: FogMask | null): void {
    this.fogMask = mask;
    this.applyFogMaskToCollection(this.enemies);
    this.applyFogMaskToCollection(this.transitionPreparedEnemies);
    this.applyFogMaskToCollection(this.suppressedAIActivationQueue);
  }

  private applyFogMaskToCollection(collection: EnemyController[]): void {
    for (const enemy of collection) {
      if (!enemy || !enemy.isActive()) {
        continue;
      }
      enemy.setFogMask(this.fogMask);
    }
  }

  setSpawnSmoothingConfig(config: { enabled?: boolean; batchSize?: number }): void {
    if (typeof config.enabled === 'boolean') {
      this.progressiveSpawningEnabled = config.enabled;
    }
    if (typeof config.batchSize === 'number' && Number.isFinite(config.batchSize)) {
      const rounded = Math.round(config.batchSize);
      this.spawnBatchSize = Math.max(1, Math.min(12, rounded));
    }
  }

  prewarmRoomEnemyData(roomId: string, difficultyLevel: number, options?: EnemyPrewarmOptions): void {
    const room = this.configLoader.getRoom(roomId);
    if (!room || !Array.isArray(room.spawnPoints)) {
      return;
    }

    const prewarmHeavyAssets = options?.prewarmHeavyAssets === true;

    const roomDifficultyKey = `${roomId}::${difficultyLevel}`;
    const shouldPrewarmConfig = !this.prewarmedRoomDifficultyKeys.has(roomDifficultyKey);
    const shouldPrewarmHeavyAssets = prewarmHeavyAssets && !this.heavyAssetPrewarmedRoomDifficultyKeys.has(roomDifficultyKey);

    if (!shouldPrewarmConfig && !shouldPrewarmHeavyAssets) {
      return;
    }

    if (shouldPrewarmConfig) {
      this.prewarmedRoomDifficultyKeys.add(roomDifficultyKey);
    }
    if (shouldPrewarmHeavyAssets) {
      this.heavyAssetPrewarmedRoomDifficultyKeys.add(roomDifficultyKey);
    }

    const uniqueEnemyTypes = new Set<string>();
    for (const spawnPoint of room.spawnPoints) {
      const enemyType = spawnPoint?.enemyType || 'zombie_basic';
      uniqueEnemyTypes.add(enemyType);
    }

    for (const enemyType of uniqueEnemyTypes) {
      const config = this.getScaledEnemyConfig(enemyType, difficultyLevel);
      if (!shouldPrewarmHeavyAssets) {
        continue;
      }
      if (config?.behavior === 'bull') {
        this.heavyAssetPrewarmQueue.add('bull');
      }
    }

    if (shouldPrewarmHeavyAssets && this.heavyAssetPrewarmQueue.size > 0) {
      this.scheduleHeavyAssetPrewarm(0);
    }
  }

  beginTransitionRoomPreparation(roomId: string, roomKey: string, difficultyLevel: number): void {
    this.clearTransitionPreparation(true);

    this.prewarmRoomEnemyData(roomId, difficultyLevel, { prewarmHeavyAssets: true });
    this.transitionPreparationRoomKey = roomKey;
    this.transitionPreparedEnemies = [];
    this.transitionPreparationQueue = [];

    const spawnPoints = this.roomManager.getSpawnPointsWithTypeForInstance(roomKey);
    for (const spawnPoint of spawnPoints) {
      this.transitionPreparationQueue.push({
        typeId: spawnPoint.enemyType || 'zombie_basic',
        position: spawnPoint.position.clone(),
        difficultyLevel,
      });
    }
  }

  hasTransitionPreparationPending(roomKey?: string): boolean {
    if (roomKey && this.transitionPreparationRoomKey !== roomKey) {
      return false;
    }
    return this.transitionPreparationQueue.length > 0;
  }

  hasTransitionPreparationForRoom(roomKey: string): boolean {
    if (this.transitionPreparationRoomKey !== roomKey) {
      return false;
    }
    return this.transitionPreparationQueue.length > 0 || this.transitionPreparedEnemies.length > 0;
  }

  pumpTransitionRoomPreparation(batchSize: number = 2): void {
    if (this.transitionPreparationQueue.length === 0) {
      return;
    }

    const count = Math.max(1, Math.min(10, Math.round(batchSize)));
    const frameStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameBudgetMs = 0.9;

    for (let i = 0; i < count && this.transitionPreparationQueue.length > 0; i++) {
      const request = this.transitionPreparationQueue.shift();
      if (!request) {
        break;
      }

      this.spawnEnemyNow(request.typeId, request.position, {
        difficultyLevelOverride: request.difficultyLevel,
        suppressSpawnEvent: true,
        suppressAI: true,
        suppressRender: false,
        targetCollection: this.transitionPreparedEnemies,
      });

      if (i + 1 < count) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (now - frameStart >= frameBudgetMs) {
          break;
        }
      }
    }
  }

  activatePreparedTransitionRoom(roomKey: string): boolean {
    if (this.transitionPreparationRoomKey !== roomKey) {
      this.clearTransitionPreparation(true);
      return false;
    }

    for (const enemy of this.enemies) {
      enemy.deactivateForTransition();
      this.deferredEnemyDisposalQueue.push(enemy);
    }
    this.enemies = [];

    // Keep remaining spawn requests progressive to avoid an end-of-transition spike.
    if (this.transitionPreparationQueue.length > 0) {
      this.pendingRoomSpawnQueue = this.transitionPreparationQueue.map((request) => ({
        typeId: request.typeId,
        position: request.position,
      }));
    } else {
      this.pendingRoomSpawnQueue = [];
    }

    this.enemies = this.transitionPreparedEnemies;
    this.transitionPreparedEnemies = [];
    this.transitionPreparationRoomKey = null;
    this.transitionPreparationQueue = [];

    this.suppressedAIActivationQueue = this.suppressedAIActivationQueue.filter((enemy) => enemy.isActive());
    this.suppressedAIActivationQueue.push(...this.enemies);

    return true;
  }

  clearTransitionPreparation(disposePreparedEnemies: boolean): void {
    if (disposePreparedEnemies) {
      this.transitionPreparedEnemies.forEach((enemy) => enemy.dispose());
    }
    this.transitionPreparedEnemies = [];
    this.transitionPreparationQueue = [];
    this.transitionPreparationRoomKey = null;
  }

  private flushSuppressedAIActivationQueue(maxPerFrame: number = 1): void {
    if (this.suppressedAIActivationQueue.length === 0) {
      return;
    }

    const count = Math.max(1, Math.min(10, Math.round(maxPerFrame)));
    const adaptiveCount = this.suppressedAIActivationQueue.length > 5
      ? Math.min(count, 1)
      : count;

    const frameStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameBudgetMs = 0.35;

    for (let i = 0; i < adaptiveCount && this.suppressedAIActivationQueue.length > 0; i++) {
      const enemy = this.suppressedAIActivationQueue.shift();
      if (!enemy || !enemy.isActive()) {
        continue;
      }

      enemy.setAISuppressed(false);
      enemy.setRenderSuppressed(false);
      enemy.revealSpawnEventIfSuppressed();

      if (i + 1 < adaptiveCount) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (now - frameStart >= frameBudgetMs) {
          break;
        }
      }
    }
  }

  spawnEnemiesForRoom(roomId: string): void {
    const room = this.configLoader.getRoom(roomId);
    if (!room) {
      console.error('Missing room or enemy config!');
      return;
    }

    this.pendingRoomSpawnQueue = [];

    // Spawn enemy at each room spawn point (includes enemyType)
    const spawnPoints = this.roomManager.getSpawnPointsWithType();
    const requests: Array<{ typeId: string; position: Vector3 }> = [];
    for (const spawnPoint of spawnPoints) {
      const enemyType = spawnPoint.enemyType || 'zombie_basic';
      requests.push({
        typeId: enemyType,
        position: spawnPoint.position.clone(),
      });
    }

    if (!this.progressiveSpawningEnabled) {
      for (const request of requests) {
        this.spawnEnemyNow(request.typeId, request.position);
      }
      return;
    }

    this.pendingRoomSpawnQueue.push(...requests);
    this.flushPendingRoomSpawns(this.spawnBatchSize);
  }

  hasPendingSpawns(): boolean {
    return this.pendingRoomSpawnQueue.length > 0;
  }

  getPendingSpawnCount(): number {
    return this.pendingRoomSpawnQueue.length;
  }

  getTransitionPreparationPendingCount(): number {
    return this.transitionPreparationQueue.length;
  }

  getPreparedTransitionEnemyCount(): number {
    return this.transitionPreparedEnemies.length;
  }

  getSuppressedActivationQueueCount(): number {
    return this.suppressedAIActivationQueue.length;
  }

  private flushPendingRoomSpawns(batchSize: number): void {
    if (this.pendingRoomSpawnQueue.length === 0) return;

    const count = Math.max(1, Math.min(12, Math.round(batchSize)));
    const adaptiveCount = this.pendingRoomSpawnQueue.length > 8
      ? Math.min(count, 1)
      : count;

    const frameStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameBudgetMs = this.pendingRoomSpawnQueue.length > 8 ? 0.8 : 1.6;

    for (let i = 0; i < adaptiveCount && this.pendingRoomSpawnQueue.length > 0; i++) {
      const request = this.pendingRoomSpawnQueue.shift();
      if (!request) break;
      this.spawnEnemyNow(request.typeId, request.position);

      if (i + 1 < adaptiveCount) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (now - frameStart >= frameBudgetMs) {
          break;
        }
      }
    }
  }

  private spawnEnemyAt(typeId: string, position: Vector3): void {
    console.log(`[EnemySpawner] Spawning ${typeId} at ${position.toString()}`);
    this.spawnEnemyNow(typeId, position);
  }

  private spawnEnemyNow(typeId: string, position: Vector3, options?: SpawnEnemyNowOptions): void {
    const scaledConfig = this.getScaledEnemyConfig(typeId, options?.difficultyLevelOverride);
    if (!scaledConfig) return;

    const enemy = new EnemyController(this.scene, typeId, position, scaledConfig, {
      suppressSpawnEvent: options?.suppressSpawnEvent,
      suppressAI: options?.suppressAI,
      suppressRender: options?.suppressRender,
    });

    const targetCollection = options?.targetCollection ?? this.enemies;
    targetCollection.push(enemy);

    if (this.fogMask) {
      enemy.setFogMask(this.fogMask);
    }
  }

  private getScaledEnemyConfig(typeId: string, difficultyLevelOverride?: number): EnemyRuntimeConfig | null {
    const level = Math.max(0, difficultyLevelOverride ?? this.difficultyLevel);
    const cacheKey = `${typeId}::${level}`;
    const cached = this.scaledEnemyConfigCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const enemyConfig = this.configLoader.getEnemiesConfig();
    if (!enemyConfig) return null;

    const enemyTypeConfig = enemyConfig[typeId];
    if (!enemyTypeConfig) return null;

    const gameplayConfig = this.configLoader.getGameplayConfig();
    const scaling = gameplayConfig?.scaling;

    const hpMultiplier = scaling?.enabled ? Math.pow(scaling.hpPerRoom ?? 1, level) : 1;
    const dmgMultiplier = scaling?.enabled ? Math.pow(scaling.damagePerRoom ?? 1, level) : 1;

    const scaledConfig = {
      ...enemyTypeConfig,
      baseStats: {
        ...enemyTypeConfig.baseStats,
        hp: Math.round((enemyTypeConfig.baseStats?.hp ?? 40) * hpMultiplier),
        damage: Math.round((enemyTypeConfig.baseStats?.damage ?? 8) * dmgMultiplier),
      },
    };

    const resolvedConfig = scaledConfig as EnemyRuntimeConfig;
    this.scaledEnemyConfigCache.set(cacheKey, resolvedConfig);
    return resolvedConfig;
  }

  private scheduleHeavyAssetPrewarm(delayMs: number): void {
    if (this.heavyAssetPrewarmTimer !== null) {
      return;
    }

    this.heavyAssetPrewarmTimer = window.setTimeout(() => {
      this.heavyAssetPrewarmTimer = null;
      this.flushHeavyAssetPrewarmBatch();
    }, Math.max(0, delayMs));
  }

  private flushHeavyAssetPrewarmBatch(): void {
    if (this.heavyAssetPrewarmQueue.size === 0) {
      return;
    }

    const [assetKey] = Array.from(this.heavyAssetPrewarmQueue);
    if (!assetKey) {
      return;
    }
    this.heavyAssetPrewarmQueue.delete(assetKey);

    if (assetKey === 'bull') {
      EnemyController.prewarmBullModel(this.scene);
    }

    if (this.heavyAssetPrewarmQueue.size > 0) {
      this.scheduleHeavyAssetPrewarm(24);
    }
  }

  setDifficultyLevel(level: number): void {
    this.difficultyLevel = level;
  }

  getEnemies(): EnemyController[] {
    return this.enemies.filter(e => e.isActive());
  }

  update(
    deltaTime: number,
    playerPosition: Vector3,
    roomManager?: RoomManager,
    playerVelocity?: Vector3,
    detectionRange?: number
  ): void {
    if (this.progressiveSpawningEnabled) {
      this.flushPendingRoomSpawns(this.spawnBatchSize);
    }

    const gameplayConfig = this.configLoader.getGameplayConfig();
    const freezeEnemies = gameplayConfig?.debugConfig?.freezeEnemies === true;
    const detectionRangeSq = detectionRange == null ? null : detectionRange * detectionRange;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      if (!enemy.isActive()) {
        this.enemies.splice(i, 1);
        continue;
      }

      const enemyPos = enemy.getPositionRef();
      const dx = enemyPos.x - playerPosition.x;
      const dz = enemyPos.z - playerPosition.z;
      const distanceSq = (dx * dx) + (dz * dz);
      const detected = detectionRangeSq == null || distanceSq <= detectionRangeSq;

      enemy.update(
        deltaTime,
        playerPosition,
        this.enemies,
        roomManager,
        playerVelocity ?? new Vector3(0, 0, 0),
        detected,
        freezeEnemies,
      );

      enemy.setFogMask(this.fogMask);
    }

    this.applyFogMaskToCollection(this.transitionPreparedEnemies);
    this.applyFogMaskToCollection(this.suppressedAIActivationQueue);

    this.flushSuppressedAIActivationQueue(1);
    this.processDeferredEnemyDisposals(1);

    this.orphanBullCleanupAccumulator += deltaTime;
    if (this.orphanBullCleanupAccumulator >= this.orphanBullCleanupIntervalSeconds) {
      this.orphanBullCleanupAccumulator = 0;
      this.cleanupOrphanBullVisuals();
    }
  }

  private cleanupOrphanBullVisuals(): void {
    const activeEnemyIds = new Set<string>();

    for (const enemy of this.enemies) {
      if (enemy.isActive()) {
        activeEnemyIds.add(enemy.getId());
      }
    }

    for (const enemy of this.transitionPreparedEnemies) {
      if (enemy.isActive()) {
        activeEnemyIds.add(enemy.getId());
      }
    }

    for (const enemy of this.suppressedAIActivationQueue) {
      if (enemy.isActive()) {
        activeEnemyIds.add(enemy.getId());
      }
    }

    EnemyController.cleanupOrphanBullVisuals(this.scene, activeEnemyIds);
  }

  private processDeferredEnemyDisposals(batchSize: number = 1): void {
    if (this.deferredEnemyDisposalQueue.length === 0) {
      return;
    }

    const count = Math.max(1, Math.min(6, Math.round(batchSize)));
    const frameStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameBudgetMs = 0.75;

    for (let i = 0; i < count && this.deferredEnemyDisposalQueue.length > 0; i++) {
      const enemy = this.deferredEnemyDisposalQueue.shift();
      if (!enemy) {
        break;
      }
      enemy.dispose();

      if (i + 1 < count) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (now - frameStart >= frameBudgetMs) {
          break;
        }
      }
    }
  }

  dispose(): void {
    this.enemies.forEach(e => e.dispose());
    this.enemies = [];
    this.pendingRoomSpawnQueue = [];
    this.suppressedAIActivationQueue = [];
    this.deferredEnemyDisposalQueue = [];
    this.orphanBullCleanupAccumulator = 0;
    this.clearTransitionPreparation(true);
    this.heavyAssetPrewarmQueue.clear();
    if (this.heavyAssetPrewarmTimer !== null) {
      window.clearTimeout(this.heavyAssetPrewarmTimer);
      this.heavyAssetPrewarmTimer = null;
    }
  }
}
