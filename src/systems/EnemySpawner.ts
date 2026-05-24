/**
 * EnemySpawner - Manages enemy spawning from room data
 */

import { Scene, Vector3 } from '@babylonjs/core';
import { EnemyController } from '../gameplay/EnemyController';
import { ConfigLoader } from '../utils/ConfigLoader';
import { RoomManager } from './RoomManager';
import { EventBus, GameEvents } from '../core/EventBus';
import type { EnemyRuntimeConfig } from '../gameplay/enemy/EnemyControllerTypes';
import { getHudAssetBaseUrl } from './hud/HudAssetPaths';

interface EnemySpawnRequestPayload {
  typeId?: string;
  position?: Vector3;
  hpMultiplier?: number;
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
  private suppressActivationFlush: boolean = false;
  private activationFlushAccumulator: number = 0;
  private activationFlushInterval: number = 0.09;
  private activationFlushBatchSize: number = 1;
  private fogMask: FogMask | null = null;
  private orphanBullCleanupAccumulator: number = 0;
  private orphanCleanupEnemyIds: Set<string> = new Set();
  private unsubscriber: (() => void) | null = null;
  private readonly cacheDifficultyWindow: number = 8;

  constructor(
    private scene: Scene,
    private roomManager: RoomManager
  ) {
    this.eventBus = EventBus.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (this.unsubscriber) return;
    this.unsubscriber = this.eventBus.on(GameEvents.ENEMY_SPAWN_REQUESTED, (data: EnemySpawnRequestPayload) => {
      const typeId = data?.typeId;
      const position = data?.position;
      if (!typeId || !position) return;
      this.spawnEnemyAt(typeId, position, data?.hpMultiplier);
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

  async prewarmCoreEnemyModelsForRun(): Promise<void> {
    const normalizedBase = getHudAssetBaseUrl();
    const candidates: Array<{ rootUrl: string; fileName: string }> = [
      { rootUrl: `${normalizedBase}models/zombie/`, fileName: 'zombie.glb' },
      { rootUrl: `${normalizedBase}models/bull/`, fileName: 'bull.glb' },
      { rootUrl: `${normalizedBase}models/jumper/`, fileName: 'sauteur.glb' },
      { rootUrl: `${normalizedBase}models/caster/`, fileName: 'caster_socle.glb' },
      { rootUrl: `${normalizedBase}models/caster/`, fileName: 'caster_mobile.glb' },
      { rootUrl: `${normalizedBase}models/caster/`, fileName: 'missile.glb' },
      { rootUrl: `${normalizedBase}models/pong/`, fileName: 'pong.glb' },
      { rootUrl: `${normalizedBase}models/healer/`, fileName: 'tde_float_yellow.glb' },
      { rootUrl: `${normalizedBase}models/bullet_hell/`, fileName: 'tde_socle_bullet_hell(crying obsidian).glb' },
      { rootUrl: `${normalizedBase}models/mage_missile/`, fileName: 'tde_socle_red_n_white.glb' },
    ];

    await Promise.allSettled(
      candidates.map(async (entry) => {
        try {
          await EnemyController.getOrLoadModelContainer(this.scene, entry.rootUrl, entry.fileName);
        } catch (error) {
          console.warn('[EnemySpawner] model prewarm failed', entry.fileName, error);
        }
      })
    );
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
        suppressRender: true,
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

      enemy.beginSpawnRevealFromSuppressed(0.9);

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

  spawnEnemiesForRoom(roomId: string, options?: { deferInitialSpawns?: boolean }): void {
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

    const deferInitialSpawns = options?.deferInitialSpawns === true;
    if (!this.progressiveSpawningEnabled) {
      for (const request of requests) {
        this.spawnEnemyNow(request.typeId, request.position);
      }
      return;
    }

    this.pendingRoomSpawnQueue.push(...requests);
    if (!deferInitialSpawns) {
      this.flushPendingRoomSpawns(this.spawnBatchSize);
    }
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

  getDeferredDisposalQueueCount(): number {
    return this.deferredEnemyDisposalQueue.length;
  }

  getActiveEnemyCount(): number {
    return this.enemies.length;
  }

  hasAnyEnemyMaterializing(): boolean {
    for (const enemy of this.enemies) {
      if (enemy.isActive() && enemy.isSpawnMaterializing()) {
        return true;
      }
    }
    return false;
  }

  releaseAllSuppressedEnemyAI(): void {
    this.suppressedAIActivationQueue = this.suppressedAIActivationQueue.filter((enemy) => enemy.isActive());
    for (const enemy of this.suppressedAIActivationQueue) {
      enemy.releaseAIFromSuppressedState();
    }
    this.suppressedAIActivationQueue = [];
  }

  revealSuppressedEnemiesWithoutAIRelease(): void {
    this.suppressedAIActivationQueue = this.suppressedAIActivationQueue.filter((enemy) => enemy.isActive());
    for (const enemy of this.suppressedAIActivationQueue) {
      enemy.beginSpawnRevealFromSuppressed(0.9, false);
    }
  }

  materializePendingSpawnsAsSuppressed(): void {
    if (this.pendingRoomSpawnQueue.length === 0) return;
    while (this.pendingRoomSpawnQueue.length > 0) {
      const request = this.pendingRoomSpawnQueue.shift();
      if (!request) break;
      this.spawnEnemyNow(request.typeId, request.position, {
        suppressSpawnEvent: true,
        suppressAI: true,
        suppressRender: true,
      });
    }
    this.stageAllActiveEnemiesAsSuppressed();
  }

  pauseSuppressedActivationQueue(paused: boolean): void {
    this.suppressActivationFlush = paused;
    if (!paused) {
      this.activationFlushAccumulator = this.activationFlushInterval;
    }
  }

  configureSuppressedActivation(config?: { intervalSeconds?: number; batchSize?: number }): void {
    if (!config) return;
    if (typeof config.intervalSeconds === 'number' && Number.isFinite(config.intervalSeconds)) {
      this.activationFlushInterval = Math.max(0.01, Math.min(1.2, config.intervalSeconds));
    }
    if (typeof config.batchSize === 'number' && Number.isFinite(config.batchSize)) {
      this.activationFlushBatchSize = Math.max(1, Math.min(12, Math.round(config.batchSize)));
    }
  }

  stageAllActiveEnemiesAsSuppressed(): void {
    this.suppressedAIActivationQueue = this.suppressedAIActivationQueue.filter((enemy) => enemy.isActive());
    for (const enemy of this.enemies) {
      if (!enemy.isActive()) continue;
      enemy.setAISuppressed(true);
      enemy.setRenderSuppressed(true);
      if (!this.suppressedAIActivationQueue.includes(enemy)) {
        this.suppressedAIActivationQueue.push(enemy);
      }
    }
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

  private spawnEnemyAt(typeId: string, position: Vector3, hpMultiplier?: number): void {
    this.spawnEnemyNow(typeId, position, { hpMultiplier });
  }

  private spawnEnemyNow(typeId: string, position: Vector3, options?: SpawnEnemyNowOptions & { hpMultiplier?: number }): void {
    const scaledConfig = this.getScaledEnemyConfig(typeId, options?.difficultyLevelOverride);
    if (!scaledConfig) return;
    let enemyConfig = scaledConfig;
    if (typeof options?.hpMultiplier === 'number' && Number.isFinite(options.hpMultiplier) && options.hpMultiplier > 0) {
      const nextHp = Math.max(1, Math.round((scaledConfig.baseStats?.hp ?? 40) * options.hpMultiplier));
      enemyConfig = {
        ...scaledConfig,
        baseStats: {
          ...(scaledConfig.baseStats ?? {}),
          hp: nextHp,
        },
      };
    }

    const enemy = new EnemyController(this.scene, typeId, position, enemyConfig, {
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

    // Progressive difficulty curve (runner-style):
    //   Rooms  0–4  : very gentle ramp (~60% of normal per-room multiplier)
    //   Rooms  5–14 : standard ramp (full per-room multiplier)
    //   Rooms 15+   : accelerated ramp (1.5× per-room multiplier) for endless tension
    const computeRunnerMultiplier = (perRoom: number, lvl: number): number => {
      if (!scaling?.enabled || perRoom <= 1) return 1;
      const delta = perRoom - 1; // e.g. 0.15 for 1.15
      let acc = 1;
      for (let i = 0; i < lvl; i++) {
        let roomDelta: number;
        if (i < 5) {
          roomDelta = delta * 0.6;    // Early game: soft
        } else if (i < 15) {
          roomDelta = delta;           // Mid game: normal
        } else {
          roomDelta = delta * 1.5;    // Late game: escalation
        }
        acc *= (1 + roomDelta);
      }
      return acc;
    };

    const hpMultiplier   = scaling?.enabled ? computeRunnerMultiplier(scaling.hpPerRoom   ?? 1, level) : 1;
    const dmgMultiplier  = scaling?.enabled ? computeRunnerMultiplier(scaling.damagePerRoom ?? 1, level) : 1;

    const scaledConfig = {
      ...enemyTypeConfig,
      baseStats: {
        ...enemyTypeConfig.baseStats,
        hp:     Math.round((enemyTypeConfig.baseStats?.hp     ?? 40) * hpMultiplier),
        damage: Math.round((enemyTypeConfig.baseStats?.damage ??  8) * dmgMultiplier),
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
    this.pruneDifficultyBoundCaches(level);
  }

  private pruneDifficultyBoundCaches(currentLevel: number): void {
    const minLevelToKeep = Math.max(0, currentLevel - this.cacheDifficultyWindow);

    for (const key of this.scaledEnemyConfigCache.keys()) {
      const separatorIdx = key.lastIndexOf('::');
      if (separatorIdx < 0) continue;
      const levelPart = Number.parseInt(key.slice(separatorIdx + 2), 10);
      if (Number.isFinite(levelPart) && levelPart < minLevelToKeep) {
        this.scaledEnemyConfigCache.delete(key);
      }
    }

    const pruneSet = (set: Set<string>): void => {
      for (const key of set) {
        const separatorIdx = key.lastIndexOf('::');
        if (separatorIdx < 0) continue;
        const levelPart = Number.parseInt(key.slice(separatorIdx + 2), 10);
        if (Number.isFinite(levelPart) && levelPart < minLevelToKeep) {
          set.delete(key);
        }
      }
    };
    pruneSet(this.prewarmedRoomDifficultyKeys);
    pruneSet(this.heavyAssetPrewarmedRoomDifficultyKeys);
  }

  getEnemies(): EnemyController[] {
    return this.enemies.filter(e => e.isActive());
  }

  private static readonly _zeroVelocity = new Vector3(0, 0, 0);

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
    // Pre-resolve velocity once outside the loop to avoid per-enemy allocation.
    const resolvedVelocity = playerVelocity ?? EnemySpawner._zeroVelocity;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      if (!enemy.isActive()) {
        this.enemies.splice(i, 1);
        enemy.dispose();
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
        resolvedVelocity,
        detected,
        freezeEnemies,
      );
      // fogMask is applied via setFogMask() when it changes — no need to push it every frame.
    }

    // Only iterate transition/suppressed queues when a fog mask is actually active.
    if (this.fogMask) {
      this.applyFogMaskToCollection(this.transitionPreparedEnemies);
      this.applyFogMaskToCollection(this.suppressedAIActivationQueue);
    }

    if (!this.suppressActivationFlush) {
      this.activationFlushAccumulator += Math.max(0, deltaTime);
      if (this.activationFlushAccumulator >= this.activationFlushInterval) {
        this.activationFlushAccumulator = 0;
        this.flushSuppressedAIActivationQueue(this.activationFlushBatchSize);
      }
    }
    const deferredCount = this.deferredEnemyDisposalQueue.length;
    const adaptiveDisposeBatch = deferredCount > 24 ? 6 : deferredCount > 12 ? 4 : deferredCount > 6 ? 2 : 1;
    this.processDeferredEnemyDisposals(adaptiveDisposeBatch);

    this.orphanBullCleanupAccumulator += deltaTime;
    if (this.orphanBullCleanupAccumulator >= 0.75) {
      this.orphanBullCleanupAccumulator = 0;
      this.orphanCleanupEnemyIds.clear();
      const addIds = (collection: EnemyController[]): void => {
        for (const enemy of collection) {
          this.orphanCleanupEnemyIds.add(enemy.getId());
        }
      };
      addIds(this.enemies);
      addIds(this.transitionPreparedEnemies);
      addIds(this.suppressedAIActivationQueue);
      addIds(this.deferredEnemyDisposalQueue);
      EnemyController.cleanupOrphanBullVisuals(this.scene, this.orphanCleanupEnemyIds);
      EnemyController.cleanupOrphanJumperVisuals(this.scene, this.orphanCleanupEnemyIds);
      EnemyController.cleanupOrphanCasterVisuals(this.scene, this.orphanCleanupEnemyIds);
    }

  }

  updateSuppressedVisuals(
    deltaTime: number,
    playerPosition: Vector3,
    roomManager?: RoomManager,
    playerVelocity?: Vector3,
    detectionRange?: number
  ): void {
    const detectionRangeSq = detectionRange == null ? null : detectionRange * detectionRange;
    const resolvedVelocity = playerVelocity ?? EnemySpawner._zeroVelocity;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.isActive()) {
        this.enemies.splice(i, 1);
        enemy.dispose();
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
        resolvedVelocity,
        detected,
        true,
      );
    }

    if (this.fogMask) {
      this.applyFogMaskToCollection(this.transitionPreparedEnemies);
      this.applyFogMaskToCollection(this.suppressedAIActivationQueue);
    }
    const deferredCount = this.deferredEnemyDisposalQueue.length;
    const adaptiveDisposeBatch = deferredCount > 24 ? 6 : deferredCount > 12 ? 4 : deferredCount > 6 ? 2 : 1;
    this.processDeferredEnemyDisposals(adaptiveDisposeBatch);
  }

  private processDeferredEnemyDisposals(batchSize: number = 1): void {
    if (this.deferredEnemyDisposalQueue.length === 0) {
      return;
    }

    const count = Math.max(1, Math.min(6, Math.round(batchSize)));
    const frameStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameBudgetMs = this.deferredEnemyDisposalQueue.length > 12 ? 1.4 : 0.75;

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

  clearForRoomTransition(): void {
    this.enemies.forEach(e => e.dispose());
    this.enemies = [];
    this.pendingRoomSpawnQueue = [];
    this.suppressedAIActivationQueue.forEach(e => e.dispose());
    this.suppressedAIActivationQueue = [];
    this.suppressActivationFlush = false;
    this.activationFlushAccumulator = 0;
    this.deferredEnemyDisposalQueue.forEach(e => e.dispose());
    this.deferredEnemyDisposalQueue = [];
    this.orphanBullCleanupAccumulator = 0;
    this.clearTransitionPreparation(true);
    this.heavyAssetPrewarmQueue.clear();
    if (this.heavyAssetPrewarmTimer !== null) {
      window.clearTimeout(this.heavyAssetPrewarmTimer);
      this.heavyAssetPrewarmTimer = null;
    }
  }

  dispose(): void {
    if (this.unsubscriber) {
      this.unsubscriber();
      this.unsubscriber = null;
    }
    this.clearForRoomTransition();
  }
}
