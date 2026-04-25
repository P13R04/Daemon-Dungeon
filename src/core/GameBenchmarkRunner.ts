import { EventBus, GameEvents } from './EventBus';

export interface BenchmarkScenarioConfig {
  warmupSeconds: number;
  transitionCount: number;
  settleSeconds: number;
  transitionStartTimeoutSeconds: number;
  resourceSampleIntervalSeconds: number;
  maxDurationSeconds: number;
  spikeCaptureThresholdMs: number;
  maxSpikeDiagnostics: number;
}

export interface BenchmarkFrameStats {
  sampleCount: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface BenchmarkTransitionStats {
  count: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface BenchmarkResourceStats {
  maxMeshes: number;
  maxMaterials: number;
  maxTextures: number;
  maxActiveEnemies: number;
  maxPendingSpawns: number;
  maxPreparedEnemies: number;
  maxSuppressedActivations: number;
  maxUsedHeapMB: number | null;
}

export interface BenchmarkFrameProfileSection {
  name: string;
  ms: number;
}

export interface BenchmarkFrameProfile {
  totalMs: number;
  sections: BenchmarkFrameProfileSection[];
}

export interface BenchmarkSpikeDiagnostic {
  frameMs: number;
  elapsedMs: number;
  profiledTotalMs: number | null;
  unprofiledGapMs: number | null;
  profiledCoverageRatio: number | null;
  stallCategory?: 'profiled' | 'external-unprofiled' | 'mixed';
  benchmarkPhase: string;
  roomIndex: number;
  roomId: string | null;
  gameState: string;
  roomCleared: boolean;
  cameraMoving: boolean;
  activeEnemies: number;
  pendingSpawns: number;
  preparedEnemies: number;
  suppressedActivations: number;
  activeProjectiles: number;
  activeUltimateZones: number;
  loadedRooms: number;
  loadedFloors: number;
  meshes: number;
  materials: number;
  textures: number;
  usedHeapMB: number | null;
  frameProfile: BenchmarkFrameProfile | null;
}

export interface BenchmarkSpikeCategoryBreakdown {
  totalCaptured: number;
  profiledCount: number;
  mixedCount: number;
  externalUnprofiledCount: number;
  profiledFrameStats: BenchmarkFrameStats;
  mixedFrameStats: BenchmarkFrameStats;
  externalUnprofiledFrameStats: BenchmarkFrameStats;
}

export interface BenchmarkReport {
  status: 'completed' | 'aborted';
  reason?: string;
  startedAtIso: string;
  elapsedMs: number;
  scenario: BenchmarkScenarioConfig;
  transitionsCompleted: number;
  frameStats: BenchmarkFrameStats;
  transitionStats: BenchmarkTransitionStats;
  postTransitionSpikeStats: BenchmarkFrameStats;
  spikeDiagnostics: BenchmarkSpikeDiagnostic[];
  spikeCategoryBreakdown: BenchmarkSpikeCategoryBreakdown;
  resourceStats: BenchmarkResourceStats;
}

export interface BenchmarkRunResult {
  copiedToClipboard: boolean;
  report: BenchmarkReport;
  reportText: string;
}

export interface BenchmarkRuntimeHooks {
  isReadyForTransition(): boolean;
  requestNextRoomTransition(): void;
  getCurrentRoomIndex(): number;
  keepBenchmarkSafe(): void;
  sampleSceneStats(): { meshes: number; materials: number; textures: number };
  sampleEnemyStats(): {
    active: number;
    pendingSpawns: number;
    preparedEnemies: number;
    suppressedActivations: number;
  };
  sampleSpikeDiagnostic(frameMs: number, elapsedMs: number): BenchmarkSpikeDiagnostic | null;
  copyToClipboard(text: string): Promise<boolean>;
  onFinished(result: BenchmarkRunResult): void;
}

type BenchmarkPhase =
  | 'idle'
  | 'warmup'
  | 'request-transition'
  | 'await-transition-start'
  | 'await-transition-end'
  | 'settle'
  | 'finishing'
  | 'finished';

const DEFAULT_SCENARIO: BenchmarkScenarioConfig = {
  warmupSeconds: 2.0,
  transitionCount: 8,
  settleSeconds: 1.2,
  transitionStartTimeoutSeconds: 2.5,
  resourceSampleIntervalSeconds: 0.25,
  maxDurationSeconds: 30,
  spikeCaptureThresholdMs: 45,
  maxSpikeDiagnostics: 12,
};

const EXTERNAL_STALL_COVERAGE_THRESHOLD = 0.2;
const PROFILED_STALL_COVERAGE_THRESHOLD = 0.8;

export class GameBenchmarkRunner {
  private phase: BenchmarkPhase = 'idle';
  private scenario: BenchmarkScenarioConfig = { ...DEFAULT_SCENARIO };
  private unsubscribers: Array<() => void> = [];

  private startedAtMs: number = 0;
  private startedAtIso: string = '';

  private warmupRemainingSeconds: number = 0;
  private settleRemainingSeconds: number = 0;
  private transitionStartTimeoutRemainingSeconds: number = 0;
  private transitionStartAtMs: number | null = null;
  private pendingTransitionFromRoomIndex: number | null = null;

  private transitionsCompleted: number = 0;
  private currentSettlePeakMs: number = 0;

  private frameSamplesMs: number[] = [];
  private transitionDurationsMs: number[] = [];
  private postTransitionSpikeSamplesMs: number[] = [];
  private spikeDiagnostics: BenchmarkSpikeDiagnostic[] = [];

  private resourceSampleAccumulatorSeconds: number = 0;
  private maxMeshes: number = 0;
  private maxMaterials: number = 0;
  private maxTextures: number = 0;
  private maxActiveEnemies: number = 0;
  private maxPendingSpawns: number = 0;
  private maxPreparedEnemies: number = 0;
  private maxSuppressedActivations: number = 0;
  private maxUsedHeapMB: number | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly hooks: BenchmarkRuntimeHooks,
  ) {}

  start(config?: Partial<BenchmarkScenarioConfig>): void {
    this.stop();

    this.scenario = {
      ...DEFAULT_SCENARIO,
      ...(config ?? {}),
    };

    this.phase = 'warmup';
    this.startedAtMs = this.now();
    this.startedAtIso = new Date().toISOString();

    this.warmupRemainingSeconds = this.scenario.warmupSeconds;
    this.settleRemainingSeconds = 0;
    this.transitionStartTimeoutRemainingSeconds = 0;
    this.transitionStartAtMs = null;
    this.pendingTransitionFromRoomIndex = null;

    this.transitionsCompleted = 0;
    this.currentSettlePeakMs = 0;

    this.frameSamplesMs = [];
    this.transitionDurationsMs = [];
    this.postTransitionSpikeSamplesMs = [];
    this.spikeDiagnostics = [];

    this.resourceSampleAccumulatorSeconds = 0;
    this.maxMeshes = 0;
    this.maxMaterials = 0;
    this.maxTextures = 0;
    this.maxActiveEnemies = 0;
    this.maxPendingSpawns = 0;
    this.maxPreparedEnemies = 0;
    this.maxSuppressedActivations = 0;
    this.maxUsedHeapMB = null;

    this.bindEvents();
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.phase = 'idle';
  }

  abort(reason: string): void {
    if (this.phase === 'idle' || this.phase === 'finished' || this.phase === 'finishing') {
      return;
    }
    this.phase = 'finishing';
    void this.finish('aborted', reason);
  }

  update(deltaTimeSeconds: number, rawFrameMs: number): void {
    if (this.phase === 'idle' || this.phase === 'finished' || this.phase === 'finishing') {
      return;
    }

    const elapsedMs = Math.max(0, this.now() - this.startedAtMs);
    if (elapsedMs >= this.scenario.maxDurationSeconds * 1000) {
      this.phase = 'finishing';
      void this.finish('completed', 'time_budget_reached');
      return;
    }

    const clampedFrameMs = Number.isFinite(rawFrameMs) && rawFrameMs > 0
      ? rawFrameMs
      : 0;
    this.frameSamplesMs.push(clampedFrameMs);
    this.captureSpikeDiagnostic(clampedFrameMs, elapsedMs);

    this.sampleResources(deltaTimeSeconds);
    this.hooks.keepBenchmarkSafe();

    if (this.phase === 'settle') {
      this.currentSettlePeakMs = Math.max(this.currentSettlePeakMs, clampedFrameMs);
    }

    if (this.phase === 'warmup') {
      this.updateWarmup(deltaTimeSeconds);
      return;
    }

    if (this.phase === 'request-transition') {
      this.updateTransitionRequest();
      return;
    }

    if (this.phase === 'await-transition-start') {
      this.tryCompleteTransitionFromRoomIndexChange();
      this.transitionStartTimeoutRemainingSeconds -= deltaTimeSeconds;
      if (this.transitionStartTimeoutRemainingSeconds <= 0) {
        this.phase = 'request-transition';
      }
      return;
    }

    if (this.phase === 'await-transition-end') {
      this.tryCompleteTransitionFromRoomIndexChange();
      return;
    }

    if (this.phase === 'settle') {
      this.settleRemainingSeconds -= deltaTimeSeconds;
      if (this.settleRemainingSeconds <= 0) {
        this.postTransitionSpikeSamplesMs.push(this.currentSettlePeakMs);
        this.currentSettlePeakMs = 0;

        if (this.transitionsCompleted >= this.scenario.transitionCount) {
          this.phase = 'finishing';
          void this.finish('completed');
        } else {
          this.phase = 'request-transition';
        }
      }
    }
  }

  private updateWarmup(deltaTimeSeconds: number): void {
    if (!this.hooks.isReadyForTransition()) {
      this.warmupRemainingSeconds = this.scenario.warmupSeconds;
      return;
    }

    this.warmupRemainingSeconds -= deltaTimeSeconds;
    if (this.warmupRemainingSeconds <= 0) {
      this.phase = 'request-transition';
    }
  }

  private updateTransitionRequest(): void {
    if (!this.hooks.isReadyForTransition()) {
      return;
    }

    this.pendingTransitionFromRoomIndex = this.hooks.getCurrentRoomIndex();
    this.hooks.requestNextRoomTransition();
    this.phase = 'await-transition-start';
    this.transitionStartTimeoutRemainingSeconds = this.scenario.transitionStartTimeoutSeconds;
  }

  private bindEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on(GameEvents.ROOM_TRANSITION_START, () => {
        this.onTransitionStart();
      }),
    );
    this.unsubscribers.push(
      this.eventBus.on(GameEvents.ROOM_TRANSITION_END, () => {
        this.onTransitionEnd();
      }),
    );
  }

  private onTransitionStart(): void {
    if (this.phase !== 'await-transition-start' && this.phase !== 'request-transition') {
      return;
    }

    this.transitionStartAtMs = this.now();
    this.phase = 'await-transition-end';
  }

  private onTransitionEnd(): void {
    if (this.phase !== 'await-transition-end') {
      return;
    }

    const now = this.now();
    const duration = this.transitionStartAtMs == null ? 0 : Math.max(0, now - this.transitionStartAtMs);
    this.pendingTransitionFromRoomIndex = null;
    this.transitionDurationsMs.push(duration);
    this.transitionStartAtMs = null;
    this.transitionsCompleted += 1;

    this.currentSettlePeakMs = 0;
    this.settleRemainingSeconds = this.scenario.settleSeconds;
    this.phase = this.scenario.settleSeconds > 0 ? 'settle' : 'request-transition';

    if (this.scenario.settleSeconds <= 0) {
      this.postTransitionSpikeSamplesMs.push(0);
      if (this.transitionsCompleted >= this.scenario.transitionCount) {
        this.phase = 'finishing';
        void this.finish('completed');
      }
    }
  }

  private tryCompleteTransitionFromRoomIndexChange(): void {
    const previousRoomIndex = this.pendingTransitionFromRoomIndex;
    if (previousRoomIndex == null) {
      return;
    }

    const currentRoomIndex = this.hooks.getCurrentRoomIndex();
    if (currentRoomIndex === previousRoomIndex) {
      return;
    }

    const now = this.now();
    const duration = this.transitionStartAtMs == null ? 0 : Math.max(0, now - this.transitionStartAtMs);
    this.pendingTransitionFromRoomIndex = null;
    this.transitionStartAtMs = null;
    this.transitionDurationsMs.push(duration);
    this.transitionsCompleted += 1;

    this.currentSettlePeakMs = 0;
    this.settleRemainingSeconds = this.scenario.settleSeconds;
    this.phase = this.scenario.settleSeconds > 0 ? 'settle' : 'request-transition';

    if (this.scenario.settleSeconds <= 0) {
      this.postTransitionSpikeSamplesMs.push(0);
      if (this.transitionsCompleted >= this.scenario.transitionCount) {
        this.phase = 'finishing';
        void this.finish('completed');
      }
    }
  }

  private sampleResources(deltaTimeSeconds: number): void {
    this.resourceSampleAccumulatorSeconds += deltaTimeSeconds;
    if (this.resourceSampleAccumulatorSeconds < this.scenario.resourceSampleIntervalSeconds) {
      return;
    }
    this.resourceSampleAccumulatorSeconds = 0;

    const sceneStats = this.hooks.sampleSceneStats();
    this.maxMeshes = Math.max(this.maxMeshes, sceneStats.meshes);
    this.maxMaterials = Math.max(this.maxMaterials, sceneStats.materials);
    this.maxTextures = Math.max(this.maxTextures, sceneStats.textures);

    const enemyStats = this.hooks.sampleEnemyStats();
    this.maxActiveEnemies = Math.max(this.maxActiveEnemies, enemyStats.active);
    this.maxPendingSpawns = Math.max(this.maxPendingSpawns, enemyStats.pendingSpawns);
    this.maxPreparedEnemies = Math.max(this.maxPreparedEnemies, enemyStats.preparedEnemies);
    this.maxSuppressedActivations = Math.max(this.maxSuppressedActivations, enemyStats.suppressedActivations);

    const memory = this.readHeapUsageMB();
    if (memory != null) {
      this.maxUsedHeapMB = this.maxUsedHeapMB == null ? memory : Math.max(this.maxUsedHeapMB, memory);
    }
  }

  private async finish(status: 'completed' | 'aborted', reason?: string): Promise<void> {
    const endedAtMs = this.now();
    const topSpikeDiagnostics = this.spikeDiagnostics
      .slice()
      .sort((a, b) => b.frameMs - a.frameMs)
      .slice(0, this.scenario.maxSpikeDiagnostics);

    const report: BenchmarkReport = {
      status,
      reason,
      startedAtIso: this.startedAtIso,
      elapsedMs: this.round(Math.max(0, endedAtMs - this.startedAtMs), 2),
      scenario: this.scenario,
      transitionsCompleted: this.transitionsCompleted,
      frameStats: this.computeStats(this.frameSamplesMs),
      transitionStats: this.computeTransitionStats(this.transitionDurationsMs),
      postTransitionSpikeStats: this.computeStats(this.postTransitionSpikeSamplesMs),
      spikeDiagnostics: topSpikeDiagnostics,
      spikeCategoryBreakdown: this.computeSpikeCategoryBreakdown(topSpikeDiagnostics),
      resourceStats: {
        maxMeshes: this.maxMeshes,
        maxMaterials: this.maxMaterials,
        maxTextures: this.maxTextures,
        maxActiveEnemies: this.maxActiveEnemies,
        maxPendingSpawns: this.maxPendingSpawns,
        maxPreparedEnemies: this.maxPreparedEnemies,
        maxSuppressedActivations: this.maxSuppressedActivations,
        maxUsedHeapMB: this.maxUsedHeapMB == null ? null : this.round(this.maxUsedHeapMB, 2),
      },
    };

    this.stop();
    this.phase = 'finished';

    const reportText = JSON.stringify(report, null, 2);
    const copiedToClipboard = await this.hooks.copyToClipboard(reportText);

    this.hooks.onFinished({
      copiedToClipboard,
      report,
      reportText,
    });
  }

  private captureSpikeDiagnostic(frameMs: number, elapsedMs: number): void {
    if (frameMs < this.scenario.spikeCaptureThresholdMs) {
      return;
    }

    const diagnostic = this.hooks.sampleSpikeDiagnostic(frameMs, elapsedMs);
    if (!diagnostic) {
      return;
    }

    this.spikeDiagnostics.push({
      ...diagnostic,
      stallCategory: this.classifySpikeStall(diagnostic),
    });
    if (this.spikeDiagnostics.length > Math.max(1, this.scenario.maxSpikeDiagnostics * 2)) {
      this.spikeDiagnostics.sort((a, b) => b.frameMs - a.frameMs);
      this.spikeDiagnostics.length = this.scenario.maxSpikeDiagnostics;
    }
  }

  private classifySpikeStall(diagnostic: BenchmarkSpikeDiagnostic): 'profiled' | 'external-unprofiled' | 'mixed' {
    const coverage = diagnostic.profiledCoverageRatio;
    if (coverage == null) {
      return 'mixed';
    }
    if (coverage <= EXTERNAL_STALL_COVERAGE_THRESHOLD) {
      return 'external-unprofiled';
    }
    if (coverage >= PROFILED_STALL_COVERAGE_THRESHOLD) {
      return 'profiled';
    }
    return 'mixed';
  }

  private computeSpikeCategoryBreakdown(spikes: BenchmarkSpikeDiagnostic[]): BenchmarkSpikeCategoryBreakdown {
    const profiled = spikes.filter((spike) => spike.stallCategory === 'profiled').map((spike) => spike.frameMs);
    const mixed = spikes.filter((spike) => spike.stallCategory === 'mixed').map((spike) => spike.frameMs);
    const external = spikes.filter((spike) => spike.stallCategory === 'external-unprofiled').map((spike) => spike.frameMs);

    return {
      totalCaptured: spikes.length,
      profiledCount: profiled.length,
      mixedCount: mixed.length,
      externalUnprofiledCount: external.length,
      profiledFrameStats: this.computeStats(profiled),
      mixedFrameStats: this.computeStats(mixed),
      externalUnprofiledFrameStats: this.computeStats(external),
    };
  }

  private computeTransitionStats(samples: number[]): BenchmarkTransitionStats {
    const frameStats = this.computeStats(samples);
    return {
      count: samples.length,
      averageMs: frameStats.averageMs,
      p50Ms: frameStats.p50Ms,
      p95Ms: frameStats.p95Ms,
      maxMs: frameStats.maxMs,
    };
  }

  private computeStats(samples: number[]): BenchmarkFrameStats {
    if (samples.length === 0) {
      return {
        sampleCount: 0,
        averageMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = samples.reduce((acc, value) => acc + value, 0);
    const average = sum / samples.length;

    return {
      sampleCount: samples.length,
      averageMs: this.round(average, 2),
      p50Ms: this.round(this.percentile(sorted, 50), 2),
      p95Ms: this.round(this.percentile(sorted, 95), 2),
      p99Ms: this.round(this.percentile(sorted, 99), 2),
      maxMs: this.round(sorted[sorted.length - 1], 2),
    };
  }

  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }

    const normalized = Math.max(0, Math.min(100, percentile));
    const index = (normalized / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
      return sortedValues[lower];
    }

    const fraction = index - lower;
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
  }

  private readHeapUsageMB(): number | null {
    if (typeof performance === 'undefined') {
      return null;
    }

    const withMemory = performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
      };
    };

    const used = withMemory.memory?.usedJSHeapSize;
    if (!Number.isFinite(used)) {
      return null;
    }

    return (used as number) / (1024 * 1024);
  }

  private round(value: number, decimals: number): number {
    const scale = Math.pow(10, Math.max(0, decimals));
    return Math.round(value * scale) / scale;
  }

  private now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }
}
