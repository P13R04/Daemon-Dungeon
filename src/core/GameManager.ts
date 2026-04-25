/**
 * GameManager - Central orchestrator for the entire game
 * Manages game state, systems, and core loops
 */

import { Scene, Engine, Vector3, ArcRotateCamera, Color3, Mesh, MeshBuilder, ShaderMaterial, Effect } from '@babylonjs/core';
import { SceneBootstrap } from '../scene/SceneBootstrap';
import { StateMachine, GameState } from './StateMachine';
import { EventBus, GameEvents } from './EventBus';
import {
  AttackPerformedPayload,
  BonusRerollRequestedPayload,
  BonusSelectedPayload,
  DevRoomLoadRequestedPayload,
  DevTileLoadRequestedPayload,
  EnemyDiedPayload,
  EnemySpawnedPayload,
  GameEventBindings,
  GameStartRequestedPayload,
} from './GameEventBindings';
import { RunEconomyManager } from './RunEconomyManager';
import { Time } from './Time';
import { ConfigLoader } from '../utils/ConfigLoader';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../gameplay/PlayerController';
import { EnemySpawner } from '../systems/EnemySpawner';
import { EnemyController } from '../gameplay/EnemyController';
import { RoomManager } from '../systems/RoomManager';
import { ProjectileManager } from '../gameplay/ProjectileManager';
import { UltimateManager } from '../gameplay/UltimateManager';
import { HUDManager } from '../systems/HUDManager';
import { DevConsole } from '../systems/DevConsole';
import { PostProcessManager } from '../scene/PostProcess';
import { TileFloorManager } from '../systems/TileFloorManager';
import { RoomLayoutParser, RoomLayout, TileMappingLayout } from '../systems/RoomLayoutParser';
import { ProceduralDungeonTheme } from '../systems/ProceduralDungeonTheme';
import { ProceduralReliefTheme } from '../systems/ProceduralReliefTheme';
import type { ProceduralReliefQuality } from '../systems/ProceduralReliefTheme';
import { RoomTransitionManager } from '../systems/RoomTransitionManager';
import { BonusSystemManager } from '../systems/BonusSystemManager';
import { GameEventCoordinator } from '../systems/GameEventCoordinator';
import { UltimateSystemManager } from '../systems/UltimateSystemManager';
import type { RoomConfig as LoadedRoomConfig } from '../types/config';
import { ClassSelectScene } from '../scene/ClassSelectScene';
import { MainMenuScene } from '../scene/MainMenuScene';
import { CodexScene } from '../scene/CodexScene';
import { BootSequenceScene } from '../scene/BootSequenceScene';
import { AchievementDefinition, CodexService } from '../services/CodexService';
import { getMergedAchievementDefinitions } from '../data/achievements/loadAchievementDefinitions';
import { GameSettings, GameSettingsStore } from '../settings/GameSettings';
import { GameCombatActionManager } from './GameCombatActionManager';
import { GameRuntimeOrchestrator, createRuntimeFrameProfiler, type GameRuntimeFrameContext, type RuntimeFrameProfileSnapshot } from './GameRuntimeOrchestrator';
import { GameWorldCollisionHazardManager } from './GameWorldCollisionHazardManager';
import { GamePlayerVoidRecoveryManager } from './GamePlayerVoidRecoveryManager';
import { GameRoomStreamingManager, type RoomPreloadOptions } from './GameRoomStreamingManager';
import { GameDaemonTestManager } from './GameDaemonTestManager';
import { GameEconomyFlowManager } from './GameEconomyFlowManager';
import { GameBenchmarkRunner, type BenchmarkRunResult, type BenchmarkSpikeDiagnostic } from './GameBenchmarkRunner';
import { GameTutorialManager } from './GameTutorialManager';
import { BONUS_TUNING } from '../data/bonuses/bonusTuning';

type TextureRenderMode = 'classic' | 'proceduralRelief';
type RuntimeGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';
type SceneWithMainCamera = Scene & { mainCamera?: ArcRotateCamera };
type AchievementSourceEntry = {
  name?: string;
  description?: string;
  type?: string;
  target?: number;
};

export class GameManager {
  private static instance: GameManager;
  
  private engine!: Engine;
  private canvas!: HTMLCanvasElement;
  private scene!: Scene;
  private stateMachine: StateMachine;
  private eventBus: EventBus;
  private time: Time;
  private configLoader: ConfigLoader;
  
  private inputManager!: InputManager;
  private playerController!: PlayerController;
  private enemySpawner!: EnemySpawner;
  private roomManager!: RoomManager;
  private projectileManager!: ProjectileManager;
  private ultimateManager!: UltimateManager;
  private hudManager!: HUDManager;
  private devConsole!: DevConsole;
  private postProcessManager!: PostProcessManager;
  private tileFloorManager!: TileFloorManager;
  private bootScene?: BootSequenceScene;
  private mainMenuScene?: MainMenuScene;
  private classSelectScene?: ClassSelectScene;
  private codexScene?: CodexScene;
  private codexService: CodexService;
  private audioUnlockHandler: (() => void) | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private roomTransitionManager: RoomTransitionManager;
  private bonusSystemManager: BonusSystemManager;
  private eventCoordinator: GameEventCoordinator;
  private ultimateSystemManager: UltimateSystemManager;
  private combatActionManager: GameCombatActionManager | null = null;
  private worldCollisionHazardManager: GameWorldCollisionHazardManager | null = null;
  private playerVoidRecoveryManager: GamePlayerVoidRecoveryManager | null = null;
  private roomStreamingManager: GameRoomStreamingManager | null = null;
  private daemonTestManager: GameDaemonTestManager | null = null;
  private economyFlowManager: GameEconomyFlowManager | null = null;
  private tutorialManager: GameTutorialManager;
  private readonly runtimeOrchestrator = new GameRuntimeOrchestrator();
  
  private isRunning: boolean = false;
  private gameplayInitialized: boolean = false;
  private gameplayStartInProgress: boolean = false;
  private isTutorialRun: boolean = false;
  private eventListenersBound: boolean = false;
  private eventBusUnsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private selectedClassId: 'mage' | 'firewall' | 'rogue' | 'cat' = 'mage';
  private tilesEnabled: boolean = true;
  private textureRenderMode: TextureRenderMode = 'proceduralRelief';
  private roomLayoutCache: Map<string, RoomLayout> = new Map();
  private proceduralPrewarmPromise: Promise<void> | null = null;
  private proceduralWarmCacheReady: boolean = false;
  private pendingProceduralPrewarmRoomIds: string[] = [];
  private proceduralPrewarmTimer: number | null = null;
  private postTransitionMaintenanceTimer: number | null = null;
  private deferredRoomEnteredEventTimer: number | null = null;
  private gameState: RuntimeGameState = 'menu';
  private roomOrder: string[] = [];
  private currentRoomIndex: number = 0;
  private roomCleared: boolean = false;
  private roomSpacing: number = 26; // Expanded room gap further to open transition space
  private cameraMove: { from: Vector3; to: Vector3; t: number; duration: number; nextIndex: number } | null = null;
  private transitionFogPlanes: Mesh[] = [];
  private transitionFogMaterials: ShaderMaterial[] = [];
  private transitionFogTopPlanes: Mesh[] = [];
  private transitionFogTopMaterials: ShaderMaterial[] = [];
  private transitionFogDirectionSign: number = 1;
  private fogCurtainLayerCount: number = 1;
  private fogCurtainOffset: number = 2.4;
  private fogCurtainAlpha: number = 0.82;
  private fogCurtainEdgeSoftness: number = 0.1;
  private fogCurtainVerticalOffset: number = -1.35;
  private fogCurtainHeight: number = 24.8;
  private fogCurtainDepthDistance: number = 5.8;
  private fogCurtainWidthPadding: number = 24;
  private fogCurtainLayerWidthStep: number = 2.1;
  private fogCurtainLayerHeightStep: number = 0.18;
  private fogCurtainTransitionFollowStrength: number = 0.68;
  private fogCurtainTransitionCameraLeadPadding: number = 0.15;
  private fogCurtainRoomStandoffDistance: number = 2.8;
  private fogCurtainNextRoomEntranceMargin: number = 0.9;
  private fogCurtainNearMaxOffsetBias: number = 0.18;
  private fogCurtainEnemyRevealDistance: number = 1.7;
  private fogCurtainEnemyHiddenVisibility: number = 0.0;
  private fogCurtainTopMaskDepthScale: number = 1.35;
  private fogCurtainIdleDownloadScanSpeed: number = 0.45;
  private primedTransitionRoomKey: string | null = null;
  private backgroundPreparationAccumulator: number = 0;
  private backgroundPreparationIntervalSeconds: number = 0.2;
  private cameraAlpha: number = 0;
  private cameraBeta: number = 0;
  private cameraRadius: number = 0;
  private readonly runEconomy = new RunEconomyManager();
  private roomElapsedSeconds: number = 0;
  private lightweightTextureMode: boolean = GameSettingsStore.get().graphics.lightweightTexturesMode;
  private progressiveEnemySpawning: boolean = GameSettingsStore.get().graphics.progressiveEnemySpawning;
  private enemySpawnBatchSize: number = GameSettingsStore.get().graphics.enemySpawnBatchSize;
  private roomPreloadAheadCount: number = Math.max(1, Math.min(8, Math.round(GameSettingsStore.get().graphics.roomPreloadAheadCount || 2)));
  private benchmarkRunner: GameBenchmarkRunner | null = null;
  private benchmarkReportOverlay: HTMLDivElement | null = null;
  private benchmarkPreparationLastPumpMs: number = 0;
  private lastBenchmarkFrameProfile: RuntimeFrameProfileSnapshot | null = null;
  private lastBenchmarkLoopProfile: RuntimeFrameProfileSnapshot | null = null;

  private constructor() {
    this.stateMachine = new StateMachine();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.codexService = new CodexService();
    this.eventCoordinator = new GameEventCoordinator(this.eventBus);
    this.tutorialManager = new GameTutorialManager();
    // tutorialManager.initialize will be called in setupGame when roomManager is available
    this.ultimateSystemManager = new UltimateSystemManager({
      getPlayerController: () => this.playerController,
      onTankZoneStarted: (radius) => this.combatActionManager?.ensureTankUltimateZoneVisual(radius),
      onTankZoneUpdated: (deltaTime) => this.combatActionManager?.updateTankUltimateZoneVisual(deltaTime),
      onTankZoneDisposed: () => this.combatActionManager?.disposeTankUltimateZoneVisual(),
      onRogueZoneStarted: (radius) => this.combatActionManager?.startRogueUltimateVisual(radius),
      onRogueZoneUpdated: (deltaTime) => this.combatActionManager?.updateRogueUltimateVisual(deltaTime),
      onRogueTeleport: (from, to, target) => this.combatActionManager?.notifyRogueUltimateTeleport(from, to, target),
      onRogueZoneDisposed: () => this.combatActionManager?.disposeRogueUltimateVisual(),
    });
    this.roomTransitionManager = new RoomTransitionManager({
      isGameplayInitialized: () => this.gameplayInitialized,
      getRoomOrder: () => this.roomOrder,
      setRoomOrder: (roomOrder) => {
        this.roomOrder = roomOrder;
      },
      getCurrentRoomIndex: () => this.currentRoomIndex,
      setCurrentRoomIndex: (index) => {
        this.currentRoomIndex = index;
      },
      setRoomCleared: (value) => {
        this.roomCleared = value;
      },
      hideOverlays: () => {
        this.hudManager?.hideOverlays();
      },
      setGameState: (state) => {
        this.transitionGameState(state);
      },
      preloadRoomsAround: (preloadIndex, activeIndex, forceRebuild, options) => {
        this.preloadRoomsAround(preloadIndex, activeIndex, forceRebuild, options);
      },
      prepareRoomForTransition: (index) => {
        this.prepareRoomForTransition(index);
      },
      updateRoomTransitionPreparation: (alpha, nextIndex) => {
        this.updateRoomTransitionPreparation(alpha, nextIndex);
      },
      finishRoomTransition: (nextIndex) => {
        this.finishRoomTransition(nextIndex);
      },
      loadRoomByIndex: (index, options) => {
        this.loadRoomByIndex(index, options);
      },
      getRoomBoundsForInstance: (instanceKey) => this.roomManager.getRoomBoundsForInstance(instanceKey),
      getCameraTarget: () => {
        const camera = (this.scene as SceneWithMainCamera)?.mainCamera ?? this.scene?.activeCamera;
        return camera && camera instanceof ArcRotateCamera ? camera.getTarget() : null;
      },
      setCameraMove: (move) => {
        this.cameraMove = move;
      },
    });
    this.bonusSystemManager = new BonusSystemManager({
      isGameplayInitialized: () => this.gameplayInitialized,
      getGameState: () => this.gameState,
      setGameState: (state) => {
        this.transitionGameState(state);
      },
      getSelectedClassId: () => (this.selectedClassId === 'cat' ? 'rogue' : this.selectedClassId),
      getCurrency: () => this.runEconomy.getCurrency(),
      trySpendCurrency: (cost) => this.trySpendCurrency(cost),
      getPlayerHealth: () => {
        if (!this.gameplayInitialized) return null;
        const health = this.playerController.getHealth();
        return {
          current: health.getCurrentHP(),
          max: health.getMaxHP(),
        };
      },
      healPlayerToFull: () => {
        if (!this.gameplayInitialized) return;
        this.playerController.healToFull();
      },
      showBonusChoices: (choices, currency, rerollCost, selectionState) => {
        this.hudManager.showBonusChoices(choices, currency, rerollCost, selectionState);
      },
      applyBonus: (bonusId) => {
        this.applyBonus(bonusId);
      },
      startRoomTransition: (nextIndex) => {
        this.startRoomTransition(nextIndex);
      },
      getCurrentRoomIndex: () => this.currentRoomIndex,
      getRoomOrderLength: () => this.roomOrder.length,
      markBonusDiscovered: (bonusId) => {
        void this.codexService.markBonusDiscovered(bonusId);
      },
      recordBonusCollected: () => {
        this.codexService.recordBonusCollected();
      },
    });

    const achievementData = getMergedAchievementDefinitions();
    const definitions: AchievementDefinition[] = Object.entries(achievementData as Record<string, AchievementSourceEntry>).map(([id, value]) => ({
      id,
      name: value?.name ?? id,
      description: value?.description ?? 'No description available.',
      type: value?.type === 'incremental' ? 'incremental' : 'oneTime',
      target: Number.isFinite(value?.target) ? Number(value.target) : 1,
    }));
    this.codexService.initializeAchievements(definitions);
    this.registerStates();
  }

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    GameSettingsStore.applyRuntimeEffects(this.canvas);
    this.applyGraphicsSettings(GameSettingsStore.get());
    this.unsubscribeSettings = GameSettingsStore.subscribe((settings) => {
      this.applyGraphicsSettings(settings);
    });

    // Initialize Babylon.js engine
    this.engine = new Engine(canvas, true);
    this.setupGlobalAudioUnlock();

    // Load configurations
    await this.configLoader.loadAllConfigs();

    const gameplayDebug = this.configLoader.getGameplayConfig()?.debug;
    this.codexService.setDevUnlockCodexEntries(!!gameplayDebug?.enabled);

    // Setup event listeners
    this.setupEventListeners();

    if (BootSequenceScene.shouldPlay()) {
      await this.openBootSequenceScene();
    } else {
      await this.openMainMenuScene();
    }

    // Start in menu scene
    this.transitionGameState('menu');

    // Start game loop
    this.startGameLoop();

    this.isRunning = true;
  }

  private setupGlobalAudioUnlock(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    // Hide Babylon's default unmute button and handle unlock ourselves.
    audioEngine.useCustomUnlockedButton = true;

    const tryUnlock = () => {
      try {
        audioEngine.unlock();
      } catch {
        // Ignore and retry on next gesture.
      }

      const context = (audioEngine as { audioContext?: AudioContext } | undefined)?.audioContext;
      if (context && context.state !== 'running') {
        void context.resume().catch(() => {
          // Ignore and retry on next gesture.
        });
      }

      const unlocked = audioEngine.unlocked || context?.state === 'running';
      if (unlocked && this.audioUnlockHandler) {
        window.removeEventListener('pointerdown', this.audioUnlockHandler);
        window.removeEventListener('keydown', this.audioUnlockHandler);
        window.removeEventListener('touchstart', this.audioUnlockHandler);
        this.audioUnlockHandler = null;
      }
    };

    this.audioUnlockHandler = tryUnlock;
    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock);
    window.addEventListener('touchstart', tryUnlock, { passive: true });
  }

  private async openBootSequenceScene(): Promise<void> {
    this.bootScene = new BootSequenceScene(this.engine, () => {
      if (this.bootScene) {
        this.bootScene.dispose();
        this.bootScene = undefined;
      }
      void this.openMainMenuScene();
    });
    this.scene = this.bootScene.getScene();
  }

  private disposeFrontendScenes(): void {
    if (this.bootScene) {
      this.bootScene.dispose();
      this.bootScene = undefined;
    }
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }
    if (this.codexScene) {
      this.codexScene.dispose();
      this.codexScene = undefined;
    }
  }

  private async openMainMenuScene(): Promise<void> {
    this.stopBenchmarkRunner();
    this.disposeBenchmarkReportOverlay();
    
    // Dispose gameplay if returning to menu to ensure clean state for replays
    if (this.gameplayInitialized) {
      if (this.playerController) this.playerController.dispose();
      if (this.enemySpawner) this.enemySpawner.dispose();
      if (this.hudManager) this.hudManager.dispose();
      if (this.inputManager) this.inputManager.dispose();
      if (this.tutorialManager) this.tutorialManager.dispose();
      if (this.projectileManager) this.projectileManager.dispose();
      if (this.ultimateManager) this.ultimateManager.dispose();
      if (this.worldCollisionHazardManager) this.worldCollisionHazardManager.dispose?.();
      if (this.playerVoidRecoveryManager) this.playerVoidRecoveryManager.dispose?.();
      
      if (this.scene && this.scene !== this.mainMenuScene?.getScene()) {
        this.scene.dispose();
      }
      this.gameplayInitialized = false;
    }

    this.disposeFrontendScenes();

    this.mainMenuScene = new MainMenuScene(this.engine, () => {
      void this.openClassSelectScene(false);
    }, () => {
      void this.openCodexScene();
    }, () => {
      void this.openClassSelectScene(true);
    }, () => {
      void this.startBenchmarkFromMenu();
    });
    this.scene = this.mainMenuScene.getScene();
  }

  private async openCodexScene(): Promise<void> {
    this.disposeFrontendScenes();

    try {
      this.codexScene = new CodexScene(
        this.engine,
        this.codexService,
        this.configLoader.getEnemiesConfig() ?? {},
        () => {
          void this.openMainMenuScene();
        }
      );
      this.scene = this.codexScene.getScene();
      this.transitionGameState('menu');
    } catch (error) {
      console.error('[GameManager] Failed to open Codex scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openClassSelectScene(isTutorial: boolean = false): Promise<void> {
    this.disposeFrontendScenes();

    const classSelectPostFx = this.configLoader.getGameplayConfig()?.postProcessing;
    this.classSelectScene = new ClassSelectScene(this.engine, (classId) => {
      if (isTutorial) {
        this.eventCoordinator.emitTutorialStartRequested(classId);
      } else {
        this.eventCoordinator.emitGameStartRequested(classId);
      }
    }, () => {
      void this.openMainMenuScene();
    }, classSelectPostFx);
    this.scene = this.classSelectScene.getScene();
  }

  private async initializeGameplayScene(): Promise<void> {
    if (this.gameplayInitialized) return;

    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    }

    this.scene = await SceneBootstrap.createScene(this.engine, this.canvas);

    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (!camera) throw new Error('Main camera not found in scene');

    this.cameraAlpha = camera.alpha;
    this.cameraBeta = camera.beta;
    this.cameraRadius = camera.radius;

    const gameplayConfig = this.configLoader.getGameplayConfig();
    this.postProcessManager = new PostProcessManager(this.scene, this.engine);
    this.postProcessManager.setupPipeline(camera, gameplayConfig?.postProcessing ?? undefined);

    this.roomManager = new RoomManager(this.scene, 1.2);
    this.inputManager = new InputManager(this.canvas, this.scene);
    this.projectileManager = new ProjectileManager(this.scene);
    this.ultimateManager = new UltimateManager(this.scene);
    this.hudManager = new HUDManager(this.scene);
    this.tileFloorManager = new TileFloorManager(this.scene, 1.2);
    if (this.textureRenderMode === 'proceduralRelief') {
      ProceduralReliefTheme.setLightweightMode(this.lightweightTextureMode);
      ProceduralReliefTheme.setQuality(this.lightweightTextureMode ? 'low' : 'medium');
      ProceduralReliefTheme.prewarm(this.scene);
    }
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.tileFloorManager.setRenderProfile(this.getRenderProfileForRoom(''));
    this.devConsole = new DevConsole(this.scene, this);

    this.inputManager.attachMouseListeners();

    const rooms = this.configLoader.getRoomsConfig();
    const playableRooms = Array.isArray(rooms)
      ? rooms.filter((room: LoadedRoomConfig) => this.shouldIncludeInRunOrder(room))
      : [];
    this.roomOrder = playableRooms.map((r: LoadedRoomConfig) => r.id);
    if (this.roomOrder.length === 0) {
      this.roomOrder = ['room_test_dummies'];
    }

    if (Array.isArray(rooms)) {
      this.roomLayoutCache.clear();
      for (const room of rooms) {
        if (!room?.id) continue;
        const layout = this.buildRoomLayoutForTiles(room);
        if (layout) {
          this.roomLayoutCache.set(room.id, layout);
        }
      }
    }

    const playerConfig = this.configLoader.getPlayerConfig();
    this.playerController = new PlayerController(this.scene, this.inputManager, playerConfig!, this.selectedClassId);
    this.enemySpawner = new EnemySpawner(this.scene, this.roomManager);
    this.enemySpawner.setSpawnSmoothingConfig({
      enabled: this.progressiveEnemySpawning,
      batchSize: this.enemySpawnBatchSize,
    });
    this.combatActionManager = new GameCombatActionManager(this.scene, this.playerController, this.projectileManager);
    this.worldCollisionHazardManager = new GameWorldCollisionHazardManager(
      this.playerController,
      this.roomManager,
      this.tileFloorManager,
      this.configLoader,
    );
    this.playerVoidRecoveryManager = new GamePlayerVoidRecoveryManager(
      this.scene,
      this.playerController,
      this.roomManager,
      (reason) => this.eventCoordinator.emitPlayerDied(reason),
    );
    this.daemonTestManager = new GameDaemonTestManager((payload) => this.eventCoordinator.emitDaemonTaunt(payload));
    this.economyFlowManager = new GameEconomyFlowManager(
      this.configLoader,
      this.runEconomy,
      this.bonusSystemManager,
      this.hudManager,
      this.playerController,
      this.inputManager,
    );
    this.roomStreamingManager = new GameRoomStreamingManager({
      roomManager: this.roomManager,
      tileFloorManager: this.tileFloorManager,
      isGameplayInitialized: () => this.gameplayInitialized,
      isTilesEnabled: () => this.tilesEnabled,
      getRoomOrder: () => this.roomOrder,
      getRoomSpacing: () => this.roomSpacing,
      getRenderProfileForRoom: (roomId) => this.getRenderProfileForRoom(roomId),
      preloadTileFloorInstance: (roomId, instanceKey, origin) => this.preloadTileFloorInstance(roomId, instanceKey, origin),
      setCurrentRoomInstance: (roomKey) => {
        this.roomManager.setCurrentRoom(roomKey);
        if (this.tilesEnabled) {
          this.tileFloorManager.setCurrentRoomInstance(roomKey);
        }
      },
      focusCameraOnRoomBounds: (roomKey) => this.focusCameraOnRoomBounds(roomKey),
    });
    this.devConsole.setPlayer(this.playerController);

    this.gameplayInitialized = true;
    this.tutorialManager.initialize({
      getRoomCenter: () => this.roomManager.getCurrentRoomCenter(),
      getRoomIndex: () => this.currentRoomIndex
    });

    if (this.textureRenderMode === 'proceduralRelief') {
      await this.prewarmAllProceduralLayoutsAsync(!this.lightweightTextureMode);
    }

    // Prebuild current + adjacent room geometry and tile floors upfront.
    this.preloadRoomsAround(0, 0, true);
  }

  private async waitForNextPaint(frames: number = 1): Promise<void> {
    const safeFrames = Math.max(1, Math.floor(frames));
    for (let i = 0; i < safeFrames; i++) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
  }

  private async waitForMs(ms: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
  }

  private setupEventListeners(): void {
    if (this.eventListenersBound) return;
    this.eventListenersBound = true;
    const bindings = new GameEventBindings(this.eventBus, {
      onGameStartRequested: (data) => {
        this.tryUnlockAudioNow();
        const classId = data?.classId as ('mage' | 'firewall' | 'rogue' | 'cat' | undefined);
        if (classId) {
          this.selectedClassId = classId;
        }
        this.isTutorialRun = data?.mode === 'tutorial';
        this.codexService.startRunTracking();
        void this.startNewGame();
      },
      onGameRestartRequested: () => {
        this.tryUnlockAudioNow();
        this.codexService.startRunTracking();
        this.isTutorialRun = false;
        void this.startNewGame();
      },
      onCodexOpenRequested: () => {
        void this.openCodexScene();
      },
      onRoomNextRequested: () => {
        if (!this.gameplayInitialized) return;
        this.loadNextRoom();
      },
      onDevRoomLoadRequested: (data) => {
        if (!this.gameplayInitialized) return;
        const roomId = data?.roomId;
        if (roomId) {
          this.loadIsolatedRoom(roomId);
          this.loadTilesForRoom(roomId);
        }
      },
      onDevTileToggleRequested: () => {
        if (!this.gameplayInitialized) return;
        this.setTilesEnabled(!this.tilesEnabled);
        if (this.tilesEnabled && this.roomOrder[this.currentRoomIndex]) {
          this.loadTilesForRoom(this.roomOrder[this.currentRoomIndex]);
        }
        console.log(`Tiles ${this.tilesEnabled ? 'enabled' : 'disabled'}`);
      },
      onDevTileLoadRequested: (data) => {
        if (!this.gameplayInitialized) return;
        const roomId = data?.roomId;
        if (roomId) {
          this.loadTilesForRoom(roomId);
        }
      },
      onBonusSelected: (data) => {
        if (!this.gameplayInitialized) return;
        const bonusId = data?.bonusId;
        if (bonusId) {
          this.bonusSystemManager.handleBonusSelected(bonusId);
        }
      },
      onBonusPaidPickRequested: (data) => {
        if (!this.gameplayInitialized) return;
        if (this.gameState !== 'bonus') return;
        const bonusId = typeof data?.bonusId === 'string' ? data.bonusId : '';
        const requestedCost = Number.isFinite(data?.cost) ? Number(data?.cost) : Number.NaN;
        this.bonusSystemManager.handlePaidRareBonusRequested(bonusId, requestedCost);
      },
      onBonusRerollRequested: (data) => {
        if (!this.gameplayInitialized) return;
        if (this.gameState !== 'bonus') return;
        const requestedCost = Number.isFinite(data?.cost) ? Number(data.cost) : 40;
        this.bonusSystemManager.handleBonusRerollRequested(requestedCost);
      },
      onShopPurchaseRequested: (data) => {
        if (!this.gameplayInitialized) return;
        if (this.gameState !== 'bonus') return;
        const itemId = typeof data?.itemId === 'string' ? data.itemId : '';
        const requestedCost = Number.isFinite(data?.cost) ? Number(data?.cost) : Number.NaN;
        this.bonusSystemManager.handleShopPurchaseRequested(itemId, requestedCost);
      },
      onPlayerDied: (payload) => {
        if (!this.gameplayInitialized) return;
        if (this.playerVoidRecoveryManager?.isFalling() && payload?.reason !== 'void_fall') return;
        if (this.isTutorialRun) {
          this.playerController.heal(9999);
          const spawnPoint = this.roomManager.getPlayerSpawnPoint(this.roomOrder[this.currentRoomIndex]) || Vector3.Zero();
          this.playerController.setPosition(spawnPoint);
          this.eventBus.emit(GameEvents.DAEMON_TAUNT, {
            voicelineId: 'tutorial_hazard'
          });
          return;
        }
        this.codexService.endRunTracking();
        this.transitionGameState('gameover');
        this.hudManager.showGameOverScreen();
      },
      onEnemySpawned: (data) => {
        const enemyType = data?.enemyType;
        if (typeof enemyType === 'string' && enemyType.length > 0) {
          void this.codexService.markEnemyEncountered(enemyType);
        }
      },
      onEnemyDied: (data) => {
        this.codexService.recordEnemyKilled();
        const reward = this.computeEnemyKillReward(data?.enemyType);
        if (reward > 0) {
          this.addCurrency(reward);
        }
      },
      onAttackPerformed: (data) => {
        this.handleAttackPerformedEvent(data);
      },
      onPlayerDamaged: () => {
        this.codexService.recordPlayerDamaged();
        this.resetDaemonIdleTimer();
      },
      onRoomEntered: () => {
        console.log(`[GameManager] Room entered callback, index: ${this.currentRoomIndex}`);
        this.codexService.recordRoomReached(this.currentRoomIndex + 1);
      },
      onEnemyDamaged: () => {
        this.resetDaemonIdleTimer();
      },
      onTutorialStartRequested: (data) => {
        this.tryUnlockAudioNow();
        const classId = data?.classId as ('mage' | 'firewall' | 'rogue' | 'cat' | undefined);
        if (classId) {
          this.selectedClassId = classId;
        }
        this.isTutorialRun = true;
        
        // Re-create tutorial manager to ensure fresh state and listeners
        if (this.tutorialManager) {
          this.tutorialManager.dispose();
        }
        this.tutorialManager = new GameTutorialManager();
        this.tutorialManager.startTutorial(this.selectedClassId as any || 'mage');
        this.tutorialManager.initialize({
          getRoomCenter: () => this.roomManager.getRoomCenterWorld(),
          getRoomIndex: () => this.currentRoomIndex
        });

        this.codexService.startRunTracking();
        void this.startNewGame();
      },
      onTutorialPhaseCompleted: (data) => {
        if (!this.gameplayInitialized || !this.isTutorialRun) return;
        if (data?.phaseId === 'shop_start') {
          this.enemySpawner.dispose();
          if (data?.gold) {
            this.runEconomy.addCurrency(data.gold);
            this.hudManager.updateCurrency(this.runEconomy.getCurrency());
          }
          this.roomCleared = true;
          this.roomManager.setDoorActive(true);
        }
      },
      onTutorialEndRequested: () => {
        if (!this.gameplayInitialized || !this.isTutorialRun) return;
        this.isTutorialRun = false;
        void this.openMainMenuScene();
      },
      onPlayerUltimateRefillRequested: () => {
        this.playerController?.refillUltimate();
      },
    });

    this.eventBusUnsubscribers = bindings.bind();
  }

  private applyGraphicsSettings(settings: GameSettings): void {
    const nextLightweight = !!settings.graphics.lightweightTexturesMode;
    const nextProgressiveSpawning = !!settings.graphics.progressiveEnemySpawning;
    const nextSpawnBatchSize = Math.max(1, Math.min(12, Math.round(settings.graphics.enemySpawnBatchSize || 2)));
    const nextRoomPreloadAhead = Math.max(1, Math.min(8, Math.round(settings.graphics.roomPreloadAheadCount || 2)));

    const lightweightChanged = this.lightweightTextureMode !== nextLightweight;
    const spawnConfigChanged =
      this.progressiveEnemySpawning !== nextProgressiveSpawning
      || this.enemySpawnBatchSize !== nextSpawnBatchSize;
    const preloadWindowChanged = this.roomPreloadAheadCount !== nextRoomPreloadAhead;

    this.lightweightTextureMode = nextLightweight;
    this.progressiveEnemySpawning = nextProgressiveSpawning;
    this.enemySpawnBatchSize = nextSpawnBatchSize;
    this.roomPreloadAheadCount = nextRoomPreloadAhead;

    ProceduralReliefTheme.setLightweightMode(this.lightweightTextureMode);
    if (this.lightweightTextureMode && ProceduralReliefTheme.getQuality() !== 'low') {
      ProceduralReliefTheme.setQuality('low');
    } else if (!this.lightweightTextureMode && ProceduralReliefTheme.getQuality() === 'low') {
      ProceduralReliefTheme.setQuality('medium');
    }

    if (this.gameplayInitialized && this.enemySpawner && spawnConfigChanged) {
      this.enemySpawner.setSpawnSmoothingConfig({
        enabled: this.progressiveEnemySpawning,
        batchSize: this.enemySpawnBatchSize,
      });
    }

    if (!this.gameplayInitialized) return;
    if (preloadWindowChanged) {
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: this.roomPreloadAheadCount,
        allowUnload: true,
      });
    }
    if (this.textureRenderMode !== 'proceduralRelief') return;
    if (!lightweightChanged) return;

    this.proceduralWarmCacheReady = false;
    this.pendingProceduralPrewarmRoomIds = [];
    if (this.proceduralPrewarmTimer !== null) {
      window.clearTimeout(this.proceduralPrewarmTimer);
      this.proceduralPrewarmTimer = null;
    }

    const currentRoomId = this.roomOrder[this.currentRoomIndex] ?? '';
    this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
    if (this.tilesEnabled && currentRoomId) {
      void this.loadTilesForRoom(currentRoomId);
    }
  }

  private tryUnlockAudioNow(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    try {
      audioEngine.unlock();
    } catch {
      // Ignore; global gesture listeners keep retrying.
    }

    const context = (audioEngine as { audioContext?: AudioContext } | undefined)?.audioContext;
    if (context && context.state !== 'running') {
      void context.resume().catch(() => {
        // Ignore and let next gesture retry.
      });
    }
  }

  private handleAttackPerformedEvent(data: AttackPerformedPayload): void {
    if (!this.gameplayInitialized) return;
    if (this.gameState !== 'playing') return;

    if (data?.type === 'melee' && data?.attacker) {
      const rawDamage = data.damage || 0;
      const finalDamage = this.resolveIncomingMeleeDamage(rawDamage, data.attacker);
      if (finalDamage > 0) {
        this.playerController.applyDamage(finalDamage);
      }
    }

    if (data?.attacker === 'player') {
      this.tryTriggerDaemonTestOnFire();
    }
    this.resetDaemonIdleTimer();
  }

  private resolveIncomingMeleeDamage(rawDamage: number, attackerId: string): number {
    if (attackerId === 'player') {
      return rawDamage;
    }

    if (this.playerController.isCatGodModeActive()) {
      const enemies = this.enemySpawner?.getEnemies?.() ?? [];
      const attackerEnemy = enemies.find((enemy: EnemyController) => enemy.getId?.() === attackerId);
      if (attackerEnemy) {
        const contactDamage = this.playerController.getCatContactDamage();
        if (contactDamage > 0) {
          attackerEnemy.takeDamage(contactDamage);
        }
      }
      return 0;
    }

    if (this.playerController.getClassId() !== 'firewall') {
      return rawDamage;
    }

    const enemies = this.enemySpawner?.getEnemies?.() ?? [];
    const attackerEnemy = enemies.find((enemy: EnemyController) => enemy.getId?.() === attackerId);
    if (!attackerEnemy) {
      return rawDamage;
    }

    const attackerPos = attackerEnemy.getPosition();
    const thornsRatio = this.playerController.getFirewallThornsDamageRatio();
    if (thornsRatio > 0) {
      attackerEnemy.takeDamage(rawDamage * thornsRatio);
    }

    if (!this.playerController.canBlockMeleeFrom(attackerPos)) {
      return rawDamage;
    }

    const blockRatio = this.playerController.getTankMeleeBlockRatio();
    const finalDamage = Math.max(0, rawDamage * (1 - blockRatio));
    const riposteRatio = this.playerController.getTankRiposteMeleeRatio();
    if (riposteRatio > 0) {
      attackerEnemy.takeDamage(rawDamage * riposteRatio);
    }

    return finalDamage;
  }

  private registerStates(): void {
    const noopState = {
      enter: () => {},
      update: (_deltaTime: number) => {
        void _deltaTime;
      },
      exit: () => {},
    };

    this.stateMachine.registerState(GameState.BOOT, noopState);
    this.stateMachine.registerState(GameState.MAIN_MENU, noopState);
    this.stateMachine.registerState(GameState.CHARACTER_SELECT, noopState);
    this.stateMachine.registerState(GameState.GAMEPLAY_LOOP, noopState);
    this.stateMachine.registerState(GameState.PAUSE, noopState);
    this.stateMachine.registerState(GameState.GAME_OVER, noopState);
  }

  private mapRuntimeStateToStateMachine(state: RuntimeGameState): GameState {
    switch (state) {
      case 'menu':
        return GameState.MAIN_MENU;
      case 'playing':
        return GameState.GAMEPLAY_LOOP;
      case 'roomclear':
      case 'bonus':
      case 'transition':
        return GameState.PAUSE;
      case 'gameover':
        return GameState.GAME_OVER;
      default:
        return GameState.MAIN_MENU;
    }
  }

  private transitionGameState(nextState: RuntimeGameState): void {
    if (this.gameState === nextState) return;
    this.gameState = nextState;
    this.stateMachine.transition(this.mapRuntimeStateToStateMachine(nextState));
    this.updateFogCurtain();
  }

  private startGameLoop(): void {
    let lastTime = performance.now();

    this.engine.runRenderLoop(() => {
      const loopProfiler = this.benchmarkRunner ? createRuntimeFrameProfiler() : null;
      const currentTime = performance.now();
      const rawFrameMs = Math.max(0, currentTime - lastTime);
      const deltaTime = Math.min(rawFrameMs / 1000, 0.016); // Cap at 60fps for gameplay simulation
      lastTime = currentTime;

      const allowDeferredRoomLoads =
        !this.gameplayInitialized ||
        this.gameState === 'roomclear' ||
        this.gameState === 'bonus';
      const activeCombatPressure =
        this.gameplayInitialized &&
        this.gameState === 'playing' &&
        (
          (this.enemySpawner?.getEnemies()?.length ?? 0) > 0 ||
          (this.enemySpawner?.getPendingSpawnCount?.() ?? 0) > 0 ||
          (this.projectileManager?.getActiveProjectiles?.().length ?? 0) > 0 ||
          (this.ultimateManager?.getActiveZones?.().length ?? 0) > 0
        );
      const allowDeferredStreamingMaintenance = !activeCombatPressure;
      const loadedRoomCount = this.roomManager?.getLoadedRoomKeys?.().length ?? 0;
      const loadedFloorCount = this.tilesEnabled
        ? (this.tileFloorManager?.getLoadedRoomKeys?.().length ?? 0)
        : 0;
      const hasCriticalStreamingOverhang = loadedRoomCount > 3 || loadedFloorCount > 4;
      const isSafeStreamingState =
        this.gameState === 'roomclear' ||
        this.gameState === 'bonus' ||
        this.gameState === 'transition';
      const allowDeferredUnloads =
        !this.gameplayInitialized ||
        isSafeStreamingState ||
        (this.gameState === 'playing' && hasCriticalStreamingOverhang && !activeCombatPressure);
      const deferredStreamingBudgetMs =
        !this.gameplayInitialized
          ? 1.2
          : this.gameState === 'roomclear' || this.gameState === 'bonus'
            ? 1.2
            : this.gameState === 'playing'
              ? 0.55
              : 0.8;

      this.time.update(deltaTime);
      loopProfiler?.mark('timeUpdate');

      if (this.classSelectScene && this.scene === this.classSelectScene.getScene()) {
        this.classSelectScene.update(deltaTime);
        loopProfiler?.mark('classSelectUpdate');
      }

      this.updateCameraTransition(deltaTime);
      loopProfiler?.mark('cameraTransitionUpdate');
      this.updateFogCurtain();
      loopProfiler?.mark('fogCurtainUpdate');

      let shouldSkipRender = false;

      if (this.gameplayInitialized && this.gameState === 'playing') {
        shouldSkipRender = this.updatePlayingFrame(deltaTime);
        loopProfiler?.mark('playingUpdate');
      } else if (this.gameplayInitialized) {
        this.updateNonPlayingFrame(deltaTime);
        loopProfiler?.mark('nonPlayingUpdate');
      }

      if (this.benchmarkRunner) {
        this.roomStreamingManager?.pumpDeferredWork(deferredStreamingBudgetMs, {
          allowRoomLoads: allowDeferredRoomLoads,
          allowTilePreloads: allowDeferredStreamingMaintenance,
          allowUnloads: allowDeferredUnloads,
        });
        loopProfiler?.mark('roomStreamingDeferred');
        this.benchmarkRunner.update(deltaTime, rawFrameMs);
        loopProfiler?.mark('benchmarkUpdate');
        if (this.gameState === 'gameover') {
          const runner = this.benchmarkRunner;
          this.benchmarkRunner = null;
          runner.abort('player_died');
          loopProfiler?.mark('benchmarkAbort');
        }
      }

      if (!this.benchmarkRunner) {
        this.roomStreamingManager?.pumpDeferredWork(deferredStreamingBudgetMs, {
          allowRoomLoads: allowDeferredRoomLoads,
          allowTilePreloads: allowDeferredStreamingMaintenance,
          allowUnloads: allowDeferredUnloads,
        });
      }

      if (shouldSkipRender) {
        this.lastBenchmarkLoopProfile = loopProfiler ? loopProfiler.finish() : null;
        return;
      }

      // Render scene
      this.scene.render();
      loopProfiler?.mark('sceneRender');

      this.lastBenchmarkLoopProfile = loopProfiler ? loopProfiler.finish() : null;
    });
  }

  private updateCameraTransition(deltaTime: number): void {
    if (!this.gameplayInitialized || !this.cameraMove) return;

    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
    if (!camera || !(camera instanceof ArcRotateCamera)) return;

    this.cameraMove.t += deltaTime;
    const alpha = Math.min(1, this.cameraMove.t / this.cameraMove.duration);
    this.roomTransitionManager.updateTransitionProgress(alpha, this.cameraMove.nextIndex);
    const target = Vector3.Lerp(this.cameraMove.from, this.cameraMove.to, alpha);
    camera.setTarget(target);
    camera.alpha = this.cameraAlpha;
    camera.beta = this.cameraBeta;
    camera.radius = this.cameraRadius;
    if (alpha >= 1) {
      const nextIndex = this.cameraMove.nextIndex;
      this.cameraMove = null;
      this.roomTransitionManager.finishTransition(nextIndex);
    }
  }

  private updatePlayingFrame(deltaTime: number): boolean {
    this.pumpBackgroundRoomPreparation(deltaTime);
    this.pumpPrimedRoomPreparation();
    this.roomElapsedSeconds += deltaTime;
    const profiler = this.benchmarkRunner ? createRuntimeFrameProfiler() : null;
    const shouldSkipRender = this.runtimeOrchestrator.updatePlayingFrame(this.createRuntimeFrameContext(), deltaTime, profiler);
    this.lastBenchmarkFrameProfile = profiler ? profiler.finish() : null;
    return shouldSkipRender;
  }

  private updateNonPlayingFrame(deltaTime: number): void {
    this.runtimeOrchestrator.updateNonPlayingFrame(this.createRuntimeFrameContext(), deltaTime);
    if (!this.benchmarkRunner) {
      this.lastBenchmarkFrameProfile = null;
    }
  }

  private sampleBenchmarkSpikeDiagnostic(frameMs: number, elapsedMs: number): BenchmarkSpikeDiagnostic | null {
    if (!this.gameplayInitialized) {
      return null;
    }

    const frameProfile = this.lastBenchmarkLoopProfile ?? this.lastBenchmarkFrameProfile;
    const profiledTotalMs = frameProfile?.totalMs ?? null;
    const unprofiledGapMs = profiledTotalMs == null ? null : Math.max(0, frameMs - profiledTotalMs);
    const profiledCoverageRatio = profiledTotalMs == null || frameMs <= 0
      ? null
      : Math.max(0, Math.min(1, profiledTotalMs / frameMs));

    return {
      frameMs,
      elapsedMs,
      profiledTotalMs,
      unprofiledGapMs,
      profiledCoverageRatio,
      benchmarkPhase: 'running',
      roomIndex: this.currentRoomIndex,
      roomId: this.roomOrder[this.currentRoomIndex] ?? null,
      gameState: this.gameState,
      roomCleared: this.roomCleared,
      cameraMoving: this.cameraMove != null,
      activeEnemies: this.enemySpawner?.getEnemies()?.length ?? 0,
      pendingSpawns: this.enemySpawner?.getPendingSpawnCount?.() ?? 0,
      preparedEnemies: this.enemySpawner?.getPreparedTransitionEnemyCount?.() ?? 0,
      suppressedActivations: this.enemySpawner?.getSuppressedActivationQueueCount?.() ?? 0,
      activeProjectiles: this.projectileManager?.getActiveProjectiles?.().length ?? 0,
      activeUltimateZones: this.ultimateManager?.getActiveZones?.().length ?? 0,
      loadedRooms: this.roomManager?.getLoadedRoomKeys?.().length ?? 0,
      loadedFloors: this.tileFloorManager?.getLoadedRoomKeys?.().length ?? 0,
      meshes: this.scene?.meshes?.length ?? 0,
      materials: this.scene?.materials?.length ?? 0,
      textures: this.scene?.textures?.length ?? 0,
      usedHeapMB: this.getUsedHeapMemoryMB(),
      frameProfile,
    };
  }

  private getUsedHeapMemoryMB(): number | null {
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

  private createRuntimeFrameContext(): GameRuntimeFrameContext {
    return {
      playerController: this.playerController,
      enemySpawner: this.enemySpawner,
      roomManager: this.roomManager,
      projectileManager: this.projectileManager,
      ultimateSystemManager: this.ultimateSystemManager,
      ultimateManager: this.ultimateManager,
      hudManager: this.hudManager,
      tileFloorManager: this.tileFloorManager,
      tilesEnabled: this.tilesEnabled,
      roomOrder: this.roomOrder,
      currentRoomIndex: this.currentRoomIndex,
      gameState: this.gameState,
      roomCleared: this.roomCleared,
      isTutorialRun: this.isTutorialRun,
      getCurrency: () => this.runEconomy.getCurrency(),
      getConsumableStatusLabel: () => this.getConsumableStatusLabel(),
      applyPassiveIncome: (frameDelta) => this.applyPassiveIncome(frameDelta),
      updateConsumablesFromInput: () => this.updateConsumablesFromInput(),
      detectAndStartPlayerVoidFall: () => this.detectAndStartPlayerVoidFall(),
      updatePlayerVoidFall: (frameDelta) => this.updatePlayerVoidFall(frameDelta),
      applySecondaryEnemySlow: (enemies, center, radius, speedMultiplier) => this.applySecondaryEnemySlow(enemies, center, radius, speedMultiplier),
      resolveEntityCollisions: (enemies, frameDelta) => this.resolveEntityCollisions(enemies, frameDelta),
      applyHazardDamage: (frameDelta) => this.applyHazardDamage(frameDelta),
      updateDaemonIdleTest: (frameDelta, enemyCount) => this.updateDaemonIdleTest(frameDelta, enemyCount),
      resolveSecondaryBurst: (burst, enemies) => this.resolveSecondaryBurst(burst, enemies),
      resolveMageReactiveBurst: (burst, enemies) => this.resolveMageReactiveBurst(burst, enemies),
      resolveTankSweep: (sweep, enemies) => this.resolveTankSweep(sweep, enemies),
      resolveTankShieldBash: (bash, enemies) => this.resolveTankShieldBash(bash, enemies),
      resolveRogueStrike: (strike, enemies) => this.resolveRogueStrike(strike, enemies),
      resolveRogueDashTrailSegment: (segment) => this.resolveRogueDashTrailSegment(segment),
      resolveRogueDashAttack: (dash, enemies) => this.resolveRogueDashAttack(dash, enemies),
      setRoomCleared: (value) => {
        this.roomCleared = value;
      },
      onRoomCleared: (roomId) => {
        this.eventCoordinator.emitRoomCleared(roomId);
        this.primeTransitionRoomPreparation();
      },
      openBonusChoices: () => {
        this.bonusSystemManager.openBonusChoices();
      },
      renderScene: () => {
        this.scene.render();
      },
    };
  }

  stop(): void {
    this.isRunning = false;
    this.engine.stopRenderLoop();
    this.dispose();
  }

  private updateDaemonIdleTest(deltaTime: number, enemyCount: number): void {
    this.daemonTestManager?.updateIdle(
      deltaTime,
      enemyCount,
      this.gameState,
      this.roomManager.getCurrentRoom()?.id,
      this.hudManager.isDaemonMessageActive(),
      this.isDaemonTestEnabled(),
    );
  }

  private resetDaemonIdleTimer(): void {
    this.daemonTestManager?.resetIdleTimer();
  }

  private isDaemonTestEnabled(): boolean {
    const gameplayConfig = this.configLoader.getGameplayConfig();
    return !!gameplayConfig?.debugConfig?.daemonVoicelineTest;
  }

  private triggerDaemonTestVoiceline(): void {
    this.daemonTestManager?.tryTriggerOnFire(
      this.roomManager.getCurrentRoom()?.id,
      this.isDaemonTestEnabled(),
      this.hudManager.isDaemonMessageActive(),
    );
  }

  private tryTriggerDaemonTestOnFire(): void {
    this.triggerDaemonTestVoiceline();
  }

  private dispose(): void {
    this.disposeRuntimeHooks();
    this.disposeGameplaySystems();
    this.disposeScenesAndEngine();
  }

  private disposeRuntimeHooks(): void {
    this.stopBenchmarkRunner();
    this.disposeBenchmarkReportOverlay();

    this.eventBusUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.eventBusUnsubscribers = [];

    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }

    if (this.proceduralPrewarmTimer !== null) {
      window.clearTimeout(this.proceduralPrewarmTimer);
      this.proceduralPrewarmTimer = null;
    }
    if (this.postTransitionMaintenanceTimer !== null) {
      window.clearTimeout(this.postTransitionMaintenanceTimer);
      this.postTransitionMaintenanceTimer = null;
    }
    if (this.deferredRoomEnteredEventTimer !== null) {
      window.clearTimeout(this.deferredRoomEnteredEventTimer);
      this.deferredRoomEnteredEventTimer = null;
    }
    this.roomStreamingManager?.clearDeferredRoomLoadQueue();
    this.roomStreamingManager?.clearDeferredTilePreloadQueue();
    this.roomStreamingManager?.clearDeferredUnloadQueue();
    this.pendingProceduralPrewarmRoomIds = [];
    this.proceduralPrewarmPromise = null;

    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
      window.removeEventListener('touchstart', this.audioUnlockHandler);
      this.audioUnlockHandler = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private disposeGameplaySystems(): void {
    this.projectileManager?.dispose();
    this.ultimateManager?.dispose();
    this.ultimateSystemManager?.reset();
    this.combatActionManager?.dispose();
    this.combatActionManager = null;
    this.playerVoidRecoveryManager?.reset();
    this.playerVoidRecoveryManager = null;
    this.daemonTestManager = null;
    this.economyFlowManager = null;
    this.roomStreamingManager = null;
    this.worldCollisionHazardManager = null;
    this.hudManager?.dispose();
    this.devConsole?.dispose();
    this.playerController?.dispose();
    this.enemySpawner?.dispose();
    this.roomManager?.dispose();
  }

  private disposeScenesAndEngine(): void {
    if (this.mainMenuScene) {
      this.mainMenuScene.dispose();
      this.mainMenuScene = undefined;
    }
    if (this.classSelectScene) {
      this.classSelectScene.dispose();
      this.classSelectScene = undefined;
    } else {
      this.scene?.dispose();
    }
    this.engine?.dispose();
  }

  private resolveEntityCollisions(enemies: EnemyController[], deltaTime: number): void {
    this.worldCollisionHazardManager?.resolveEntityCollisions(enemies, deltaTime);
  }

  private applyHazardDamage(deltaTime: number): void {
    this.worldCollisionHazardManager?.applyHazardDamage(
      deltaTime,
      this.playerVoidRecoveryManager?.isFalling() ?? false,
      this.tilesEnabled,
    );
  }

  private applySecondaryEnemySlow(enemies: EnemyController[], center: Vector3, radius: number, speedMultiplier: number): void {
    const clamped = Math.max(0.05, Math.min(1, speedMultiplier));
    for (const enemy of enemies) {
      const current = enemy.getPosition();
      if (Vector3.Distance(current, center) > radius) continue;
      const previous = enemy.getPreviousPosition?.() ?? current;
      const slowed = Vector3.Lerp(previous, current, clamped);
      enemy.setPosition(slowed);
    }
  }

  private resolveSecondaryBurst(
    burst: {
      position: Vector3;
      radius: number;
      baseDamage: number;
      damagePerEnemy: number;
      damagePerProjectile: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveSecondaryBurst(burst, enemies);
  }

  private resolveMageReactiveBurst(
    burst: {
      position: Vector3;
      radius: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveMageReactiveBurst(burst, enemies);
  }


  private resolveTankSweep(
    sweep: {
      origin: Vector3;
      direction: Vector3;
      swingDirection: 'left' | 'right';
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveTankSweep(sweep, enemies);
  }

  private resolveTankShieldBash(
    bash: {
      origin: Vector3;
      direction: Vector3;
      radius: number;
      damage: number;
      knockback: number;
      stunDuration: number;
      groupDistance: number;
      groupWidth: number;
      pullStrength: number;
      forwardPush: number;
      isFinisher: boolean;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveTankShieldBash(bash, enemies);
  }

  private ensureTankUltimateZoneVisual(radius: number): void {
    this.combatActionManager?.ensureTankUltimateZoneVisual(radius);
  }

  private updateTankUltimateZoneVisual(deltaTime: number): void {
    this.combatActionManager?.updateTankUltimateZoneVisual(deltaTime);
  }

  private disposeTankUltimateZoneVisual(): void {
    this.combatActionManager?.disposeTankUltimateZoneVisual();
  }

  private resolveRogueStrike(
    strike: {
      origin: Vector3;
      direction: Vector3;
      range: number;
      coneAngleDeg: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveRogueStrike(strike, enemies);
  }

  private resolveRogueDashAttack(
    dash: {
      from: Vector3;
      to: Vector3;
      radius: number;
      damage: number;
      knockback: number;
    },
    enemies: EnemyController[]
  ): void {
    this.combatActionManager?.resolveRogueDashAttack(dash, enemies);
  }

  private resolveRogueDashTrailSegment(
    segment: {
      from: Vector3;
      to: Vector3;
      radius: number;
    }
  ): void {
    this.combatActionManager?.resolveRogueDashTrailSegment(segment);
  }

  private async startNewGame(): Promise<void> {
    if (this.gameplayStartInProgress) return;
    this.disposeBenchmarkReportOverlay();
    this.stopBenchmarkRunner();
    this.gameplayStartInProgress = true;
    try {
      this.setLoadingOverlay(true, 'INITIALIZING RUN...', '0%');
      await this.waitForNextPaint(2);

      if (!this.gameplayInitialized) {
        await this.initializeGameplayScene();
      }

      this.setLoadingOverlay(true, 'PRELOADING DUNGEON CELLS...', '78%');
      await this.waitForNextPaint(1);

      this.prepareRunStateForStart();
      this.transitionGameState('transition');
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false);
      this.loadRoomByIndex(this.currentRoomIndex);
      this.setLoadingOverlay(true, 'HANDSHAKE WITH DAEMON CORE...', '100%');
      await this.waitForNextPaint(1);
      await this.waitForMs(1000);
      this.transitionGameState('playing');
      this.setLoadingOverlay(false);
    } finally {
      this.gameplayStartInProgress = false;
      this.setLoadingOverlay(false);
    }
  }

  private async startBenchmarkFromMenu(): Promise<void> {
    if (this.gameplayStartInProgress) {
      return;
    }

    this.disposeBenchmarkReportOverlay();
    this.stopBenchmarkRunner();

    this.selectedClassId = 'mage';
    this.codexService.startRunTracking();
    await this.startNewGame();
    this.startBenchmarkRun();
  }

  private startBenchmarkRun(): void {
    if (!this.gameplayInitialized) {
      return;
    }

    this.stopBenchmarkRunner();
    this.playerController.setBenchmarkInvulnerable(true);

    this.benchmarkRunner = new GameBenchmarkRunner(this.eventBus, {
      isReadyForTransition: () => {
        return this.gameplayInitialized && this.gameState === 'playing' && this.cameraMove == null;
      },
      requestNextRoomTransition: () => {
        this.loadNextRoom();
      },
      getCurrentRoomIndex: () => {
        return this.currentRoomIndex;
      },
      keepBenchmarkSafe: () => {
        if (!this.gameplayInitialized || this.gameState !== 'playing') {
          return;
        }
        this.playerController.healToFull();
      },
      sampleSceneStats: () => {
        return {
          meshes: this.scene?.meshes?.length ?? 0,
          materials: this.scene?.materials?.length ?? 0,
          textures: this.scene?.textures?.length ?? 0,
        };
      },
      sampleEnemyStats: () => {
        return {
          active: this.enemySpawner?.getEnemies()?.length ?? 0,
          pendingSpawns: this.enemySpawner?.getPendingSpawnCount?.() ?? 0,
          preparedEnemies: this.enemySpawner?.getPreparedTransitionEnemyCount?.() ?? 0,
          suppressedActivations: this.enemySpawner?.getSuppressedActivationQueueCount?.() ?? 0,
        };
      },
      sampleSpikeDiagnostic: (frameMs, elapsedMs) => this.sampleBenchmarkSpikeDiagnostic(frameMs, elapsedMs),
      copyToClipboard: async (text: string) => {
        return this.copyTextToClipboard(text);
      },
      onFinished: (result: BenchmarkRunResult) => {
        this.playerController.setBenchmarkInvulnerable(false);
        this.benchmarkRunner = null;
        this.showBenchmarkReportOverlay(result);
      },
    });

    this.benchmarkRunner.start({
      warmupSeconds: 1,
      transitionCount: 5,
      settleSeconds: 0.6,
      transitionStartTimeoutSeconds: 2.5,
      resourceSampleIntervalSeconds: 0.25,
      maxDurationSeconds: 30,
      spikeCaptureThresholdMs: 45,
      maxSpikeDiagnostics: 12,
    });
  }

  private stopBenchmarkRunner(): void {
    this.playerController?.setBenchmarkInvulnerable(false);
    this.benchmarkPreparationLastPumpMs = 0;
    if (!this.benchmarkRunner) {
      return;
    }
    this.benchmarkRunner.stop();
    this.benchmarkRunner = null;
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback handled below.
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  private showBenchmarkReportOverlay(result: BenchmarkRunResult): void {
    this.disposeBenchmarkReportOverlay();

    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'rgba(2, 8, 12, 0.86)';
    backdrop.style.zIndex = '9999';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.padding = '24px';

    const panel = document.createElement('div');
    panel.style.width = 'min(920px, 96vw)';
    panel.style.maxHeight = '90vh';
    panel.style.background = 'rgba(8, 18, 24, 0.96)';
    panel.style.border = '1px solid #2ef9c3';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 18px 48px rgba(0,0,0,0.55)';
    panel.style.padding = '18px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '12px';

    const title = document.createElement('h2');
    title.textContent = 'Automated Benchmark Report';
    title.style.margin = '0';
    title.style.fontFamily = 'Consolas, monospace';
    title.style.fontSize = '24px';
    title.style.color = '#7cffea';

    const summary = document.createElement('pre');
    summary.textContent = this.formatBenchmarkSummary(result);
    summary.style.margin = '0';
    summary.style.padding = '10px 12px';
    summary.style.border = '1px solid #285148';
    summary.style.borderRadius = '6px';
    summary.style.background = 'rgba(7, 17, 21, 0.95)';
    summary.style.color = '#cffff1';
    summary.style.whiteSpace = 'pre-wrap';
    summary.style.fontFamily = 'Consolas, monospace';
    summary.style.fontSize = '13px';

    const reportPre = document.createElement('pre');
    reportPre.textContent = result.reportText;
    reportPre.style.margin = '0';
    reportPre.style.flex = '1';
    reportPre.style.minHeight = '220px';
    reportPre.style.maxHeight = '56vh';
    reportPre.style.overflow = 'auto';
    reportPre.style.padding = '10px 12px';
    reportPre.style.border = '1px solid #285148';
    reportPre.style.borderRadius = '6px';
    reportPre.style.background = 'rgba(4, 11, 14, 0.98)';
    reportPre.style.color = '#9fe8da';
    reportPre.style.whiteSpace = 'pre';
    reportPre.style.fontFamily = 'Consolas, monospace';
    reportPre.style.fontSize = '12px';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'space-between';
    actions.style.gap = '10px';

    const leftActions = document.createElement('div');
    leftActions.style.display = 'flex';
    leftActions.style.gap = '10px';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = result.copiedToClipboard ? 'Copied to Clipboard' : 'Copy to Clipboard';
    copyBtn.style.padding = '8px 12px';
    copyBtn.style.border = '1px solid #2ef9c3';
    copyBtn.style.background = 'rgba(16, 45, 42, 0.95)';
    copyBtn.style.color = '#dffff3';
    copyBtn.style.borderRadius = '6px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => {
      void this.copyTextToClipboard(result.reportText).then((copied) => {
        copyBtn.textContent = copied ? 'Copied to Clipboard' : 'Copy Failed';
      });
    };

    const rerunBtn = document.createElement('button');
    rerunBtn.textContent = 'Run Benchmark Again';
    rerunBtn.style.padding = '8px 12px';
    rerunBtn.style.border = '1px solid #2ef9c3';
    rerunBtn.style.background = 'rgba(13, 33, 39, 0.95)';
    rerunBtn.style.color = '#dffff3';
    rerunBtn.style.borderRadius = '6px';
    rerunBtn.style.cursor = 'pointer';
    rerunBtn.onclick = () => {
      this.disposeBenchmarkReportOverlay();
      void this.startBenchmarkFromMenu();
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.padding = '8px 12px';
    closeBtn.style.border = '1px solid #44616a';
    closeBtn.style.background = 'rgba(16, 22, 28, 0.95)';
    closeBtn.style.color = '#c5d8df';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => {
      this.disposeBenchmarkReportOverlay();
    };

    leftActions.appendChild(copyBtn);
    leftActions.appendChild(rerunBtn);
    actions.appendChild(leftActions);
    actions.appendChild(closeBtn);

    panel.appendChild(title);
    panel.appendChild(summary);
    panel.appendChild(reportPre);
    panel.appendChild(actions);
    backdrop.appendChild(panel);

    this.benchmarkReportOverlay = backdrop;
    document.body.appendChild(backdrop);
  }

  private formatBenchmarkSummary(result: BenchmarkRunResult): string {
    const report = result.report;
    const frame = report.frameStats;
    const transition = report.transitionStats;
    const post = report.postTransitionSpikeStats;
    const resources = report.resourceStats;
    const spikes = report.spikeDiagnostics ?? [];
    const spikeCategoryBreakdown = report.spikeCategoryBreakdown;
    const heapLabel = resources.maxUsedHeapMB == null ? 'n/a' : `${resources.maxUsedHeapMB.toFixed(2)} MB`;
    const prioritizedSpikes = spikes.length > 0
      ? spikes
          .slice()
          .sort((a, b) => {
            const priority = (value: NonNullable<typeof spikes[number]['stallCategory']>) => {
              if (value === 'profiled') return 0;
              if (value === 'mixed') return 1;
              return 2;
            };
            const aPriority = priority(a.stallCategory ?? 'mixed');
            const bPriority = priority(b.stallCategory ?? 'mixed');
            if (aPriority !== bPriority) {
              return aPriority - bPriority;
            }
            return b.frameMs - a.frameMs;
          })
      : [];
    const spikeLines = prioritizedSpikes.length > 0
      ? prioritizedSpikes.slice(0, 3).map((spike, index) => this.formatSpikeDiagnosticLine(index + 1, spike))
      : ['Spike diagnostics captured: none over threshold.'];

    const categorySummary = spikeCategoryBreakdown
      ? `Spike categories: profiled=${spikeCategoryBreakdown.profiledCount}, mixed=${spikeCategoryBreakdown.mixedCount}, external-unprofiled=${spikeCategoryBreakdown.externalUnprofiledCount}`
      : 'Spike categories: n/a';

    const externalSummary = spikeCategoryBreakdown
      ? `External-unprofiled spikes max/p95: ${spikeCategoryBreakdown.externalUnprofiledFrameStats.maxMs.toFixed(2)} / ${spikeCategoryBreakdown.externalUnprofiledFrameStats.p95Ms.toFixed(2)} ms`
      : 'External-unprofiled spikes max/p95: n/a';

    return [
      `Status: ${report.status.toUpperCase()}${report.reason ? ` (${report.reason})` : ''}`,
      `Elapsed: ${report.elapsedMs.toFixed(2)} ms`,
      `Transitions: ${report.transitionsCompleted}/${report.scenario.transitionCount}`,
      `Frame ms avg/p95/p99/max: ${frame.averageMs.toFixed(2)} / ${frame.p95Ms.toFixed(2)} / ${frame.p99Ms.toFixed(2)} / ${frame.maxMs.toFixed(2)}`,
      `Transition ms avg/p95/max: ${transition.averageMs.toFixed(2)} / ${transition.p95Ms.toFixed(2)} / ${transition.maxMs.toFixed(2)}`,
      `Post-transition spike ms avg/p95/max: ${post.averageMs.toFixed(2)} / ${post.p95Ms.toFixed(2)} / ${post.maxMs.toFixed(2)}`,
      `Max resources: meshes=${resources.maxMeshes}, materials=${resources.maxMaterials}, textures=${resources.maxTextures}, heap=${heapLabel}`,
      `Enemy load peaks: active=${resources.maxActiveEnemies}, pendingSpawns=${resources.maxPendingSpawns}, prepared=${resources.maxPreparedEnemies}, activationQueue=${resources.maxSuppressedActivations}`,
      categorySummary,
      externalSummary,
      `Spike diagnostics captured: ${spikes.length}`,
      ...spikeLines,
      result.copiedToClipboard
        ? 'Full JSON report copied to clipboard automatically.'
        : 'Auto-copy failed. Use the Copy button to export the JSON report.',
    ].join('\n');
  }

  private formatSpikeDiagnosticLine(rank: number, spike: NonNullable<BenchmarkRunResult['report']['spikeDiagnostics']>[number]): string {
    const profile = spike.frameProfile;
    const profileSummary = profile && profile.sections.length > 0
      ? profile.sections
          .slice()
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 3)
          .map((section) => `${section.name}=${section.ms.toFixed(1)}ms`)
          .join(', ')
      : 'no profile';
    const gapSummary = spike.unprofiledGapMs == null
      ? 'gap=n/a'
      : `gap=${spike.unprofiledGapMs.toFixed(1)}ms`;
    const coverageSummary = spike.profiledCoverageRatio == null
      ? 'coverage=n/a'
      : `coverage=${(spike.profiledCoverageRatio * 100).toFixed(1)}%`;
    const categorySummary = `stall=${spike.stallCategory ?? 'mixed'}`;

    return `Spike #${rank}: ${spike.frameMs.toFixed(2)} ms @ ${spike.roomId ?? 'unknown'} (idx ${spike.roomIndex}) state=${spike.gameState} enemies=${spike.activeEnemies} projectiles=${spike.activeProjectiles} ultZones=${spike.activeUltimateZones} rooms=${spike.loadedRooms} floors=${spike.loadedFloors} ${gapSummary} ${coverageSummary} ${categorySummary} | ${profileSummary}`;
  }

  private disposeBenchmarkReportOverlay(): void {
    if (!this.benchmarkReportOverlay) {
      return;
    }
    this.benchmarkReportOverlay.remove();
    this.benchmarkReportOverlay = null;
  }

  private generateProceduralRunOrder(): string[] {
    const rooms = this.configLoader.getRoomsConfig();
    const playableRooms = Array.isArray(rooms)
      ? rooms.filter((room: LoadedRoomConfig) => this.shouldIncludeInRunOrder(room))
      : [];
    let order = playableRooms.map((r: LoadedRoomConfig) => r.id);
    if (order.length === 0) {
      order = ['room_test_dummies'];
    }
    return order;
  }

  private prepareRunStateForStart(): void {
    if (this.isTutorialRun) {
      this.roomOrder = ['room_tutorial_base', 'room_tutorial_base'];
    } else {
      this.roomOrder = this.generateProceduralRunOrder();
    }
    this.currentRoomIndex = 0;
    this.roomCleared = false;
    this.primedTransitionRoomKey = null;
    this.backgroundPreparationAccumulator = 0;
    this.ultimateSystemManager.reset();
    this.bonusSystemManager.resetRun();
    this.runEconomy.resetRun();
    this.roomElapsedSeconds = 0;
    this.resetPlayerVoidFallState();
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);
    this.hudManager.hideOverlays();
    this.hudManager.updateCurrency(this.runEconomy.getCurrency());
    this.hudManager.updateItemStatus(this.getConsumableStatusLabel());
  }

  private loadNextRoom(): void {
    this.roomTransitionManager.loadNextRoom();
  }

  private loadIsolatedRoom(roomId: string): void {
    this.roomTransitionManager.loadIsolatedRoom(roomId);
  }

  private loadRoomByIndex(index: number, options?: { preferPreparedEnemies?: boolean }): void {
    if (!this.gameplayInitialized) return;
    const roomId = this.roomOrder[index];
    const instanceKey = `${roomId}::${index}`;
    this.roomManager.setCurrentRoom(instanceKey);
    this.roomManager.setDoorActive(false);
    this.roomCleared = false;
    this.roomElapsedSeconds = 0;
    this.resetPlayerVoidFallState();
    this.ultimateSystemManager.reset();
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);

    const roomBounds = this.roomManager.getRoomBounds();
    if (roomBounds) {
      const centerX = (roomBounds.minX + roomBounds.maxX) / 2;
      const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2;
      const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
      if (camera && camera instanceof ArcRotateCamera) {
        const newTarget = new Vector3(centerX, 0.5, centerZ);
        camera.setTarget(newTarget);
        camera.alpha = this.cameraAlpha;
        camera.beta = this.cameraBeta;
        camera.radius = this.cameraRadius;
      }
    }

    const spawnPoint = this.roomManager.getPlayerSpawnPoint(roomId) || Vector3.Zero();
    this.playerController.setPosition(spawnPoint);
    this.playerController.healToFull();
    this.playerController.resetFocusFire();

    this.projectileManager.resetForRoomTransition();
    this.ultimateManager.resetForRoomTransition();

    this.enemySpawner.setSpawnSmoothingConfig({
      enabled: this.progressiveEnemySpawning,
      batchSize: this.enemySpawnBatchSize,
    });
    this.enemySpawner.setDifficultyLevel(index);

    const preparedActivated = options?.preferPreparedEnemies === true
      ? this.enemySpawner.activatePreparedTransitionRoom(instanceKey)
      : false;

    if (!preparedActivated) {
      this.enemySpawner.dispose();
      this.enemySpawner.prewarmRoomEnemyData(roomId, index, { prewarmHeavyAssets: false });
      if (!this.isTutorialRun) {
        this.enemySpawner.spawnEnemiesForRoom(roomId);
      }
    }

    if (this.tilesEnabled) {
      const currentFloorKey = `${roomId}::${index}`;
      this.tileFloorManager.setCurrentRoomInstance(currentFloorKey);
      if (!this.tileFloorManager.hasRoomInstance(currentFloorKey)) {
        this.loadTilesForRoom(roomId);
      }
    }

    const currentRoomConfig = this.roomManager.getCurrentRoom();
    this.emitRoomEnteredDeferred(index, roomId, {
      roomName: currentRoomConfig?.name ?? roomId,
      roomType: currentRoomConfig?.roomType ?? 'normal',
    });
  }

  private emitRoomEnteredDeferred(
    roomIndex: number,
    roomId: string,
    payload: { roomName: string; roomType: string }
  ): void {
    if (this.deferredRoomEnteredEventTimer !== null) {
      window.clearTimeout(this.deferredRoomEnteredEventTimer);
      this.deferredRoomEnteredEventTimer = null;
    }

    this.deferredRoomEnteredEventTimer = window.setTimeout(() => {
      this.deferredRoomEnteredEventTimer = null;
      if (!this.gameplayInitialized || this.currentRoomIndex !== roomIndex) {
        return;
      }

      console.log(`[GameManager] Emitting ROOM_ENTERED: index=${roomIndex}, roomId=${roomId}`);
      this.eventCoordinator.emitRoomEntered({
        roomId,
        roomName: payload.roomName,
        roomType: payload.roomType,
      });
    }, 250);
  }

  private preloadRoomsAround(
    preloadIndex: number,
    activeIndex: number,
    forceRebuild: boolean = false,
    options?: RoomPreloadOptions
  ): void {
    this.roomStreamingManager?.preloadRoomsAround(preloadIndex, activeIndex, forceRebuild, options);
    this.prewarmEnemyDataAround(preloadIndex, options);
  }

  private prewarmEnemyDataAround(preloadIndex: number, options?: RoomPreloadOptions): void {
    if (!this.gameplayInitialized) return;
    if (!this.enemySpawner) return;
    if (this.roomOrder.length === 0) return;

    const backwardRange = Math.max(0, options?.backwardRange ?? 1);
    const forwardRange = Math.max(0, options?.forwardRange ?? 1);
    const heavyAssetWindowActive = this.gameState === 'transition' || this.gameState === 'playing';

    for (let idx = preloadIndex - backwardRange; idx <= preloadIndex + forwardRange; idx++) {
      if (idx < 0 || idx >= this.roomOrder.length) continue;
      const roomId = this.roomOrder[idx];
      if (!roomId) continue;

      // Keep heavy model prewarm constrained to the immediate forward room.
      const prewarmHeavyAssets = heavyAssetWindowActive && idx === preloadIndex;
      this.enemySpawner.prewarmRoomEnemyData(roomId, idx, { prewarmHeavyAssets });
    }
  }

  private focusCameraOnRoomBounds(roomKey: string): void {
    const bounds = this.roomManager.getRoomBoundsForInstance(roomKey);
    if (!bounds) return;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
    if (!camera || !(camera instanceof ArcRotateCamera)) return;

    camera.setTarget(new Vector3(centerX, 0.5, centerZ));
    camera.alpha = this.cameraAlpha;
    camera.beta = this.cameraBeta;
    camera.radius = this.cameraRadius;
  }

  private startRoomTransition(nextIndex: number): void {
    this.roomTransitionManager.startRoomTransition(nextIndex);
  }

  private prepareRoomForTransition(nextIndex: number): void {
    const roomId = this.roomOrder[nextIndex];
    if (!roomId) {
      return;
    }

    const roomKey = `${roomId}::${nextIndex}`;
    this.eventBus.emit(GameEvents.ROOM_TRANSITION_START);

    if (!this.enemySpawner.hasTransitionPreparationForRoom(roomKey)) {
      if (!this.isTutorialRun) {
        this.enemySpawner.beginTransitionRoomPreparation(roomId, roomKey, nextIndex);
      }
      this.primedTransitionRoomKey = roomKey;
    }

    this.enemySpawner.pumpTransitionRoomPreparation(1);
  }

  private updateRoomTransitionPreparation(alpha: number, nextIndex: number): void {
    const roomId = this.roomOrder[nextIndex];
    if (!roomId) {
      return;
    }

    const roomKey = `${roomId}::${nextIndex}`;
    if (this.enemySpawner.hasTransitionPreparationPending(roomKey)) {
      void alpha;
      this.enemySpawner.pumpTransitionRoomPreparation(1);
    }
  }

  private finishRoomTransition(nextIndex: number): void {
    this.currentRoomIndex = nextIndex;
    this.loadRoomByIndex(nextIndex, { preferPreparedEnemies: true });
    this.primedTransitionRoomKey = null;
    this.transitionGameState('playing');
    this.deferPostTransitionRoomMaintenance(nextIndex);
    this.eventBus.emit(GameEvents.ROOM_TRANSITION_END);
  }

  private deferPostTransitionRoomMaintenance(roomIndex: number): void {
    if (this.postTransitionMaintenanceTimer !== null) {
      window.clearTimeout(this.postTransitionMaintenanceTimer);
      this.postTransitionMaintenanceTimer = null;
    }

    this.postTransitionMaintenanceTimer = window.setTimeout(() => {
      this.postTransitionMaintenanceTimer = null;

      if (!this.gameplayInitialized || this.gameState !== 'playing' || this.currentRoomIndex !== roomIndex) {
        return;
      }

      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: this.roomPreloadAheadCount,
        allowUnload: true,
        deferFarTilePreloads: true,
      });
    }, 0);
  }

  private shouldShowFogCurtain(): boolean {
    if (!this.gameplayInitialized || this.roomOrder.length === 0) {
      return false;
    }

    return this.gameState === 'playing'
      || this.gameState === 'roomclear'
      || this.gameState === 'bonus'
      || this.gameState === 'transition';
  }

  private hideFogCurtain(): void {
    if (!this.scene) {
      return;
    }

    for (const plane of [...this.transitionFogPlanes, ...this.transitionFogTopPlanes]) {
      if (!plane || plane.isDisposed()) {
        continue;
      }
      plane.isVisible = false;
    }

    for (const material of [...this.transitionFogMaterials, ...this.transitionFogTopMaterials]) {
      if (!material) {
        continue;
      }
      material.setFloat('uOpacity', 0);
      material.alpha = 0;
    }

    if (this.gameplayInitialized) {
      this.enemySpawner.setFogMask(null);
    }
  }

  private updateFogCurtain(): void {
    if (!this.scene) {
      return;
    }

    if (!this.shouldShowFogCurtain()) {
      this.hideFogCurtain();
      return;
    }

    this.ensureTransitionFogPlane();

    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    this.transitionFogDirectionSign = this.resolveTransitionFogDirection(nextIndex);
    this.updateFogCurtainPlacement(this.fogCurtainOffset, this.fogCurtainAlpha);
  }

  private updateFogCurtainPlacement(forwardOffset: number, opacity: number): void {
    if (!this.scene || this.transitionFogPlanes.length === 0 || this.transitionFogMaterials.length === 0) {
      return;
    }

    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
    if (!camera || !(camera instanceof ArcRotateCamera)) {
      return;
    }

    const target = camera.getTarget();
    const currentRoomId = this.roomOrder[this.currentRoomIndex];
    const currentRoomKey = currentRoomId ? `${currentRoomId}::${this.currentRoomIndex}` : null;
    const currentBounds = currentRoomKey ? this.roomManager.getRoomBoundsForInstance(currentRoomKey) : null;
    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    const nextRoomId = this.roomOrder[nextIndex];
    const nextRoomKey = nextRoomId ? `${nextRoomId}::${nextIndex}` : null;
    const nextBounds = nextRoomKey ? this.roomManager.getRoomBoundsForInstance(nextRoomKey) : null;

    let centerX = target.x;
    let currentCenterX = target.x;
    let nextCenterX = target.x;
    let currentBoundaryZ = target.z;
    let nextBoundaryZ = target.z + (this.transitionFogDirectionSign >= 0 ? this.fogCurtainDepthDistance : -this.fogCurtainDepthDistance);
    let currentHalfDepth = 4;
    let nextHalfDepth = 4;
    let currentRoomWidth = 64;
    let nextRoomWidth = 64;
    const depthDistance = this.fogCurtainDepthDistance;
    const direction = this.transitionFogDirectionSign >= 0 ? 1 : -1;
    let transitionEaseAlpha = 0;
    const now = ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now()) * 0.001;
    let downloadProgress = 0;

    if (currentBounds) {
      currentBoundaryZ = this.transitionFogDirectionSign >= 0 ? currentBounds.maxZ : currentBounds.minZ;
      currentCenterX = (currentBounds.minX + currentBounds.maxX) * 0.5;
      currentRoomWidth = Math.max(14, (currentBounds.maxX - currentBounds.minX) + this.fogCurtainWidthPadding);
      currentHalfDepth = Math.max(2, (currentBounds.maxZ - currentBounds.minZ) * 0.5);
      centerX = currentCenterX;
    }

    if (nextBounds) {
      nextCenterX = (nextBounds.minX + nextBounds.maxX) * 0.5;
      nextBoundaryZ = this.transitionFogDirectionSign >= 0 ? nextBounds.maxZ : nextBounds.minZ;
      nextHalfDepth = Math.max(2, (nextBounds.maxZ - nextBounds.minZ) * 0.5);
      centerX = (currentCenterX + nextCenterX) * 0.5;
      nextRoomWidth = Math.max(14, (nextBounds.maxX - nextBounds.minX) + this.fogCurtainWidthPadding + 4);
    }

    let adjustedForwardOffset = forwardOffset + this.fogCurtainRoomStandoffDistance;
    if (nextBounds) {
      const nextEntranceZ = direction >= 0 ? nextBounds.minZ : nextBounds.maxZ;
      const distanceToNextEntrance = (nextEntranceZ - currentBoundaryZ) * direction;
      if (Number.isFinite(distanceToNextEntrance)) {
        const maxAllowedOffset = Math.max(0.65, distanceToNextEntrance - this.fogCurtainNextRoomEntranceMargin);
        const nearMaxOffset = Math.max(0.65, maxAllowedOffset - this.fogCurtainNearMaxOffsetBias);
        adjustedForwardOffset = Math.max(adjustedForwardOffset, nearMaxOffset);
        adjustedForwardOffset = Math.min(adjustedForwardOffset, maxAllowedOffset);
      }
    }

    const currentLeadZ = currentBoundaryZ + (direction * adjustedForwardOffset);
    const nextLeadZ = nextBoundaryZ + (direction * forwardOffset);
    let leadPlaneZ = currentLeadZ;

    if (this.cameraMove && nextBounds) {
      const alpha = Math.min(1, this.cameraMove.t / this.cameraMove.duration);
      transitionEaseAlpha = alpha * alpha * (3 - 2 * alpha);

      const interpolatedLeadZ = currentLeadZ + ((nextLeadZ - currentLeadZ) * transitionEaseAlpha);
      const transitionHalfDepth = currentHalfDepth + ((nextHalfDepth - currentHalfDepth) * transitionEaseAlpha);
      const cameraDrivenLeadZ = target.z + (direction * (transitionHalfDepth + this.fogCurtainTransitionCameraLeadPadding));
      const minLeadZ = Math.min(currentLeadZ, nextLeadZ);
      const maxLeadZ = Math.max(currentLeadZ, nextLeadZ);
      const clampedCameraLeadZ = Math.max(minLeadZ, Math.min(maxLeadZ, cameraDrivenLeadZ));

      leadPlaneZ = interpolatedLeadZ + ((clampedCameraLeadZ - interpolatedLeadZ) * this.fogCurtainTransitionFollowStrength);
      centerX = currentCenterX + ((nextCenterX - currentCenterX) * transitionEaseAlpha);
      currentRoomWidth = currentRoomWidth + ((nextRoomWidth - currentRoomWidth) * transitionEaseAlpha);
      nextRoomWidth = currentRoomWidth;
      downloadProgress = transitionEaseAlpha;
    } else {
      const idleScan = (Math.sin(now * this.fogCurtainIdleDownloadScanSpeed) * 0.5) + 0.5;
      downloadProgress = 0.08 + (idleScan * 0.14);
    }

    const cameraCoverageWidth = Math.max(22, camera.radius * 2.2);
    const curtainWidth = Math.max(currentRoomWidth, nextRoomWidth, cameraCoverageWidth + this.fogCurtainWidthPadding);
    const layerCount = Math.max(1, this.fogCurtainLayerCount);
    const topMaskBaseLength = Math.max(6.4, depthDistance + (nextHalfDepth * this.fogCurtainTopMaskDepthScale));

    for (let i = 0; i < layerCount; i++) {
      const plane = this.transitionFogPlanes[i];
      const material = this.transitionFogMaterials[i];
      if (!plane || plane.isDisposed() || !material) {
        continue;
      }

      const layerDepth = layerCount <= 1 ? 0 : i / (layerCount - 1);
      const layerZ = leadPlaneZ + (direction * (layerDepth * depthDistance));
      const inversion = 1.0 - layerDepth;
      const layerWidth = curtainWidth + (inversion * this.fogCurtainLayerWidthStep * layerCount);
      const layerHeight = this.fogCurtainHeight + (inversion * this.fogCurtainLayerHeightStep * layerCount);
      const layerOpacity = layerCount <= 1
        ? Math.max(0, Math.min(1, opacity * 0.98))
        : Math.max(0, Math.min(1, opacity * (0.62 + (layerDepth * 0.28))));
      const raggedAmount = i === 0 ? 1.0 : i === 1 ? 0.35 : 0.0;

      plane.position.set(centerX, this.fogCurtainVerticalOffset + (layerDepth * 0.12), layerZ);
      plane.scaling.set(layerWidth, layerHeight, 1);
      plane.rotation.set(0, direction < 0 ? Math.PI : 0, 0);
      plane.isVisible = true;

      material.alpha = 1;
      material.setFloat('uTime', now + (layerDepth * 4.7));
      material.setFloat('uOpacity', layerOpacity);
      material.setFloat('uDirection', direction);
      material.setFloat('uEdgeSoftness', this.fogCurtainEdgeSoftness + (layerDepth * 0.04));
      material.setFloat('uLayerDepth', layerDepth);
      material.setFloat('uIsSimple', i >= 2 ? 1.0 : 0.0);
      material.setFloat('uRaggedAmount', raggedAmount);
      material.setFloat('uPlaneMode', 0);
      material.setFloat('uDownloadProgress', downloadProgress);

      const topPlane = this.transitionFogTopPlanes[i];
      const topMaterial = this.transitionFogTopMaterials[i];
      if (topPlane && !topPlane.isDisposed() && topMaterial) {
        const topLength = topMaskBaseLength + (inversion * 1.25);
        const topZ = layerZ + (direction * topLength * 0.5);
        const topY = this.fogCurtainVerticalOffset + (layerDepth * 0.12) + (layerHeight * 0.5);
        const topOpacity = Math.max(0, Math.min(1, layerOpacity * (layerCount <= 1 ? 0.97 : (0.88 + (inversion * 0.08)))));

        topPlane.position.set(centerX, topY, topZ);
        topPlane.scaling.set(layerWidth, topLength, 1);
        topPlane.rotation.set(Math.PI / 2, direction < 0 ? Math.PI : 0, 0);
        topPlane.isVisible = true;

        topMaterial.alpha = 1;
        topMaterial.setFloat('uTime', now + (layerDepth * 4.7));
        topMaterial.setFloat('uOpacity', topOpacity);
        topMaterial.setFloat('uDirection', direction);
        topMaterial.setFloat('uEdgeSoftness', this.fogCurtainEdgeSoftness + (layerDepth * 0.04));
        topMaterial.setFloat('uLayerDepth', layerDepth);
        topMaterial.setFloat('uIsSimple', i >= 2 ? 1.0 : 0.0);
        topMaterial.setFloat('uRaggedAmount', raggedAmount * 0.45);
        topMaterial.setFloat('uPlaneMode', 1);
        topMaterial.setFloat('uDownloadProgress', downloadProgress);
      }
    }

    // Pass fog mask boundary to EnemySpawner for enemy revelation
    // The mask is at the leading edge (closest to the camera/player side).
    const transitionRevealDistance = this.fogCurtainEnemyRevealDistance * (1.0 - (transitionEaseAlpha * 0.42));
    this.enemySpawner.setFogMask({
      z: leadPlaneZ,
      direction,
      revealDistance: Math.max(0.35, transitionRevealDistance),
      hiddenVisibility: this.fogCurtainEnemyHiddenVisibility,
    });

    for (let i = layerCount; i < this.transitionFogPlanes.length; i++) {
      const plane = this.transitionFogPlanes[i];
      const material = this.transitionFogMaterials[i];
      if (plane && !plane.isDisposed()) {
        plane.isVisible = false;
      }
      if (material) {
        material.setFloat('uOpacity', 0);
        material.alpha = 0;
      }

      const topPlane = this.transitionFogTopPlanes[i];
      const topMaterial = this.transitionFogTopMaterials[i];
      if (topPlane && !topPlane.isDisposed()) {
        topPlane.isVisible = false;
      }
      if (topMaterial) {
        topMaterial.setFloat('uOpacity', 0);
        topMaterial.alpha = 0;
      }
    }
  }

  private primeTransitionRoomPreparation(): void {
    if (!this.gameplayInitialized || this.roomOrder.length === 0) {
      return;
    }
    if (!this.roomCleared || this.gameState !== 'playing') {
      return;
    }

    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    const roomId = this.roomOrder[nextIndex];
    if (!roomId) {
      return;
    }

    const roomKey = `${roomId}::${nextIndex}`;
    if (this.primedTransitionRoomKey === roomKey && this.enemySpawner.hasTransitionPreparationForRoom(roomKey)) {
      return;
    }

    this.preloadRoomsAround(nextIndex, this.currentRoomIndex, false, {
      backwardRange: 1,
      forwardRange: this.roomPreloadAheadCount,
      allowUnload: false,
      deferFarTilePreloads: true,
    });

      if (!this.isTutorialRun) {
        this.enemySpawner.beginTransitionRoomPreparation(roomId, roomKey, nextIndex);
      }
    this.primedTransitionRoomKey = roomKey;
    this.enemySpawner.pumpTransitionRoomPreparation(1);
  }

  private pumpPrimedRoomPreparation(): void {
    if (!this.gameplayInitialized || !this.roomCleared || this.gameState !== 'playing') {
      return;
    }
    if (!this.primedTransitionRoomKey) {
      return;
    }
    if (!this.enemySpawner.hasTransitionPreparationPending(this.primedTransitionRoomKey)) {
      return;
    }

    this.enemySpawner.pumpTransitionRoomPreparation(1);
  }

  private pumpBackgroundRoomPreparation(deltaTime: number): void {
    if (!this.gameplayInitialized || this.gameState !== 'playing' || this.roomOrder.length === 0) {
      this.backgroundPreparationAccumulator = 0;
      return;
    }
    if (this.roomCleared || this.cameraMove) {
      this.backgroundPreparationAccumulator = 0;
      return;
    }
    if (this.roomElapsedSeconds < 2.0) {
      return;
    }
    if (this.enemySpawner.hasPendingSpawns()) {
      return;
    }
    if ((this.enemySpawner.getEnemies()?.length ?? 0) > 0) {
      this.backgroundPreparationAccumulator = 0;
      return;
    }

    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    const roomId = this.roomOrder[nextIndex];
    if (!roomId) {
      return;
    }

    const roomKey = `${roomId}::${nextIndex}`;
    if (!this.enemySpawner.hasTransitionPreparationForRoom(roomKey)) {
      this.preloadRoomsAround(nextIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: this.roomPreloadAheadCount,
        allowUnload: false,
        deferFarTilePreloads: true,
      });
      this.enemySpawner.beginTransitionRoomPreparation(roomId, roomKey, nextIndex);
    }

    if (!this.enemySpawner.hasTransitionPreparationPending(roomKey)) {
      this.backgroundPreparationAccumulator = 0;
      return;
    }

    this.backgroundPreparationAccumulator += deltaTime;
    if (this.backgroundPreparationAccumulator < this.backgroundPreparationIntervalSeconds) {
      return;
    }

    this.backgroundPreparationAccumulator = 0;
    this.enemySpawner.pumpTransitionRoomPreparation(1);
  }

  private pumpBenchmarkNextRoomPreparation(): void {
    if (!this.gameplayInitialized || this.gameState !== 'playing' || this.roomOrder.length === 0) {
      this.benchmarkPreparationLastPumpMs = 0;
      return;
    }
    if (this.cameraMove || this.enemySpawner.hasPendingSpawns()) {
      return;
    }

    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    const roomId = this.roomOrder[nextIndex];
    if (!roomId) {
      return;
    }

    const roomKey = `${roomId}::${nextIndex}`;
    if (!this.enemySpawner.hasTransitionPreparationForRoom(roomKey)) {
      this.preloadRoomsAround(nextIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: this.roomPreloadAheadCount,
        allowUnload: false,
        deferFarTilePreloads: true,
      });
      this.enemySpawner.beginTransitionRoomPreparation(roomId, roomKey, nextIndex);
    }

    if (!this.enemySpawner.hasTransitionPreparationPending(roomKey)) {
      return;
    }

    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const pumpIntervalMs = 33;
    if (this.benchmarkPreparationLastPumpMs > 0 && now - this.benchmarkPreparationLastPumpMs < pumpIntervalMs) {
      return;
    }

    this.benchmarkPreparationLastPumpMs = now;
    this.enemySpawner.pumpTransitionRoomPreparation(3);
  }

  private resolveTransitionFogDirection(nextIndex: number): number {
    const nextRoomId = this.roomOrder[nextIndex];
    if (!nextRoomId) {
      return 1;
    }

    const nextKey = `${nextRoomId}::${nextIndex}`;
    const nextBounds = this.roomManager.getRoomBoundsForInstance(nextKey);
    if (!nextBounds) {
      return 1;
    }

    const nextCenterZ = (nextBounds.minZ + nextBounds.maxZ) * 0.5;
    const camera = (this.scene as SceneWithMainCamera).mainCamera ?? this.scene.activeCamera;
    if (camera && camera instanceof ArcRotateCamera) {
      const currentZ = camera.getTarget().z;
      return nextCenterZ >= currentZ ? 1 : -1;
    }
    return 1;
  }

  private ensureTransitionFogPlane(): void {
    if (!this.scene) {
      return;
    }

    if (!Effect.ShadersStore.transitionFogVertexShader || !Effect.ShadersStore.transitionFogFragmentShader) {
      Effect.ShadersStore.transitionFogVertexShader = `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 worldViewProjection;
        varying vec2 vUV;

        void main(void) {
          vUV = uv;
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `;

      Effect.ShadersStore.transitionFogFragmentShader = `
        precision highp float;

        varying vec2 vUV;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uDirection;
        uniform float uEdgeSoftness;
        uniform float uLayerDepth;
        uniform float uIsSimple;
        uniform float uRaggedAmount;
        uniform float uPlaneMode;
        uniform float uDownloadProgress;

        float hash12(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);

          float a = hash12(i);
          float b = hash12(i + vec2(1.0, 0.0));
          float c = hash12(i + vec2(0.0, 1.0));
          float d = hash12(i + vec2(1.0, 1.0));

          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += amplitude * noise2(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }

        void main(void) {
          vec2 uv = vUV;
          float topMode = clamp(uPlaneMode, 0.0, 1.0);
          float mirroredX = abs((uv.x - 0.5) * 2.0);
          float ragged = clamp(uRaggedAmount, 0.0, 1.0);

          float contourNoise = fbm(vec2((uv.x * 7.6) + (uTime * 0.22), (uv.y * 5.2) - (uTime * 0.16)));
          float contourShift = (contourNoise - 0.5) * (0.18 * ragged);

          float frontMask = smoothstep(0.01 + (contourShift * 0.25), 0.09 + contourShift, uv.y)
            * (1.0 - smoothstep(0.88 + contourShift, 1.0, uv.y));
          float topMask = 1.0 - smoothstep(0.96, 1.0, uv.y);
          float verticalMask = mix(frontMask, topMask, topMode);

          float sideSoftness = clamp(uEdgeSoftness + (uLayerDepth * 0.05), 0.06, 0.42);
          float sideFade = 1.0 - smoothstep(1.0 - sideSoftness, 1.0, mirroredX);

          float columns = mix(88.0, 52.0, uLayerDepth);
          float col = floor(uv.x * columns);
          float colSeed = hash12(vec2(col, 13.7 + (uLayerDepth * 37.0)));
          float speed = mix(0.36, 0.92, colSeed);

          float trailPos = fract(uv.y + (uTime * speed) + (colSeed * 9.0));
          float trail = exp(-trailPos * (6.1 + (colSeed * 8.0)));

          float glyphRow = floor((uv.y * 112.0) + (uTime * speed * 11.0));
          float glyphNoise = hash12(vec2(col * 1.13, glyphRow));
          float glyph = step(0.32, glyphNoise);
          float primaryRain = trail * glyph;

          float secondaryRain = 0.0;
          if (uIsSimple < 0.5) {
            float col2 = floor(uv.x * (columns * 0.62));
            float seed2 = hash12(vec2(col2, 81.9 + (uLayerDepth * 11.0)));
            float speed2 = mix(0.22, 0.58, seed2);
            float trail2 = exp(-fract(uv.y + (uTime * speed2) + (seed2 * 6.3)) * 8.3);
            float glyph2 = step(0.4, hash12(vec2(col2 * 0.91, floor((uv.y * 92.0) + (uTime * speed2 * 8.0)))));
            secondaryRain = trail2 * glyph2;
          }

          float rainIntensity = mix(1.35, 0.52, topMode);
          float rainMix = clamp((primaryRain * 1.2) + (secondaryRain * 0.9), 0.0, 1.0) * rainIntensity;

          float corruptionNoise = fbm(vec2((uv.x * 9.0) + (uTime * 0.18), (uv.y * 7.0) - (uTime * 0.11)));
          float corruptionGate = mix(0.89, 0.94, topMode);
          float corruption = step(corruptionGate + (uLayerDepth * 0.05), corruptionNoise) * (0.52 - (topMode * 0.18));

          float download = clamp(uDownloadProgress, 0.0, 1.0);
          float downloadY = 1.0 - download;
          float downloadBand = exp(-abs(uv.y - downloadY) * (16.0 - (topMode * 4.0)));
          float scanBand = exp(-abs(uv.y - downloadY) * 4.0);
          float scanNearBand = exp(-abs(uv.y - (downloadY + 0.08)) * 3.6);
          float bottomVoidFade = 1.0 - smoothstep(0.0, 0.32, uv.y);
          float pulse = 0.65 + (0.35 * sin((uTime * 8.0) + (col * 0.27)));

          vec3 baseDark = mix(vec3(0.003, 0.004, 0.007), vec3(0.003, 0.004, 0.007), topMode);
          vec3 rainBlue = mix(vec3(0.12, 0.42, 0.88), vec3(0.09, 0.34, 0.68), topMode);
          vec3 brightBlue = vec3(0.42, 0.78, 1.0);
          vec3 corruptionBlue = vec3(0.05, 0.13, 0.30);

          vec3 color = baseDark;
          color += rainBlue * rainMix * (0.72 + (0.42 * pulse));
          color += brightBlue * rainMix * downloadBand * 0.86;
          color += vec3(0.14, 0.42, 0.92) * scanBand * (0.22 + (0.44 * downloadBand));
          color += vec3(0.22, 0.62, 1.0) * scanNearBand * (0.32 + (0.56 * downloadBand));
          color = mix(color, vec3(0.0, 0.0, 0.0), clamp(bottomVoidFade * 0.98, 0.0, 1.0));
          color = mix(color, corruptionBlue, corruption);

          float coverage = mix(1.0, 1.22, topMode);
          float alpha = uOpacity * sideFade * verticalMask * coverage;
          alpha *= 0.92 + (rainMix * 0.28) + (downloadBand * 0.18) + (scanBand * 0.1);
          alpha *= 1.0 + (bottomVoidFade * 0.2);
          alpha = clamp(alpha, 0.0, 1.0);

          gl_FragColor = vec4(color, alpha);
        }
      `;
    }

    const layerCount = Math.max(1, this.fogCurtainLayerCount);
    for (let i = 0; i < layerCount; i++) {
      let plane = this.transitionFogPlanes[i];
      if (!plane || plane.isDisposed()) {
        plane = MeshBuilder.CreatePlane(`transition_fog_plane_${i}`, {
          width: 1,
          height: 1,
        }, this.scene);
        plane.isPickable = false;
        plane.position.set(0, this.fogCurtainVerticalOffset, 0);
        plane.scaling.set(64, this.fogCurtainHeight, 1);
        this.transitionFogPlanes[i] = plane;
      }

      let material = this.transitionFogMaterials[i];
      if (!material || material.getScene() !== this.scene) {
        material = new ShaderMaterial(
          `transition_fog_mat_${i}`,
          this.scene,
          {
            vertex: 'transitionFog',
            fragment: 'transitionFog',
          },
          {
            attributes: ['position', 'uv'],
            uniforms: ['worldViewProjection', 'uTime', 'uOpacity', 'uDirection', 'uEdgeSoftness', 'uLayerDepth', 'uIsSimple', 'uRaggedAmount', 'uPlaneMode', 'uDownloadProgress'],
            needAlphaBlending: true,
            needAlphaTesting: false,
          }
        );
        material.backFaceCulling = false;
        material.alpha = 1;
        material.setFloat('uTime', 0);
        material.setFloat('uOpacity', this.fogCurtainAlpha);
        material.setFloat('uDirection', 1);
        material.setFloat('uEdgeSoftness', this.fogCurtainEdgeSoftness);
        material.setFloat('uLayerDepth', layerCount <= 1 ? 0 : i / (layerCount - 1));
        material.setFloat('uIsSimple', i >= 2 ? 1.0 : 0.0);
        material.setFloat('uRaggedAmount', i === 0 ? 1.0 : 0.0);
        material.setFloat('uPlaneMode', 0);
        material.setFloat('uDownloadProgress', 0);
        this.transitionFogMaterials[i] = material;
      }

      plane.material = material;
      plane.isVisible = true;

      let topPlane = this.transitionFogTopPlanes[i];
      if (!topPlane || topPlane.isDisposed()) {
        topPlane = MeshBuilder.CreatePlane(`transition_fog_top_plane_${i}`, {
          width: 1,
          height: 1,
        }, this.scene);
        topPlane.isPickable = false;
        this.transitionFogTopPlanes[i] = topPlane;
      }

      let topMaterial = this.transitionFogTopMaterials[i];
      if (!topMaterial || topMaterial.getScene() !== this.scene) {
        topMaterial = new ShaderMaterial(
          `transition_fog_top_mat_${i}`,
          this.scene,
          {
            vertex: 'transitionFog',
            fragment: 'transitionFog',
          },
          {
            attributes: ['position', 'uv'],
            uniforms: ['worldViewProjection', 'uTime', 'uOpacity', 'uDirection', 'uEdgeSoftness', 'uLayerDepth', 'uIsSimple', 'uRaggedAmount', 'uPlaneMode', 'uDownloadProgress'],
            needAlphaBlending: true,
            needAlphaTesting: false,
          }
        );
        topMaterial.backFaceCulling = false;
        topMaterial.alpha = 1;
        topMaterial.setFloat('uTime', 0);
        topMaterial.setFloat('uOpacity', this.fogCurtainAlpha);
        topMaterial.setFloat('uDirection', 1);
        topMaterial.setFloat('uEdgeSoftness', this.fogCurtainEdgeSoftness);
        topMaterial.setFloat('uLayerDepth', layerCount <= 1 ? 0 : i / (layerCount - 1));
        topMaterial.setFloat('uIsSimple', i >= 2 ? 1.0 : 0.0);
        topMaterial.setFloat('uRaggedAmount', i === 0 ? 0.5 : 0.0);
        topMaterial.setFloat('uPlaneMode', 1);
        topMaterial.setFloat('uDownloadProgress', 0);
        this.transitionFogTopMaterials[i] = topMaterial;
      }

      topPlane.material = topMaterial;
      topPlane.isVisible = true;
    }

    for (let i = layerCount; i < this.transitionFogPlanes.length; i++) {
      const plane = this.transitionFogPlanes[i];
      const material = this.transitionFogMaterials[i];
      if (plane && !plane.isDisposed()) {
        plane.isVisible = false;
      }
      if (material) {
        material.setFloat('uOpacity', 0);
        material.alpha = 0;
      }

      const topPlane = this.transitionFogTopPlanes[i];
      const topMaterial = this.transitionFogTopMaterials[i];
      if (topPlane && !topPlane.isDisposed()) {
        topPlane.isVisible = false;
      }
      if (topMaterial) {
        topMaterial.setFloat('uOpacity', 0);
        topMaterial.alpha = 0;
      }
    }
  }

  private applyBonus(bonusId: string): void {
    switch (bonusId) {
      case 'bonus_hp':
        this.playerController.applyMaxHpMultiplier(BONUS_TUNING.general.maxHpMultiplier);
        break;
      case 'bonus_ms':
        this.playerController.applyMoveSpeedMultiplier(BONUS_TUNING.general.moveSpeedMultiplier);
        break;
      case 'bonus_poison':
        this.playerController.enablePoisonBonus(BONUS_TUNING.general.poisonPercent, BONUS_TUNING.general.poisonDurationSeconds);
        break;
      case 'bonus_fire_rate':
        this.playerController.applyFireRateMultiplier(BONUS_TUNING.general.fireRateMultiplier);
        break;
      case 'bonus_dodge_roll':
        this.playerController.applyDodgeRollBonus();
        break;
      case 'bonus_crit_engine':
        this.playerController.applyCritEngineBonus();
        break;
      case 'bonus_ulti_charge':
        this.playerController.applyUltimateChargeBonus();
        break;
      case 'bonus_ulti_duration':
        this.playerController.applyUltimateDurationBonus();
        break;
      case 'bonus_stance_efficiency':
        this.playerController.applyStanceEfficiencyBonus();
        break;
      case 'meta_offer_slot':
      case 'meta_bounty_index':
      case 'meta_background_miner':
      case 'meta_lucky_compile':
      case 'meta_double_pick':
      case 'meta_discount_patch':
        // Meta bonuses are handled dynamically by BonusPoolSystem getters.
        break;
      case 'mage_pierce_patch':
        this.playerController.applyMagePierceBonus();
        break;
      case 'mage_multishot_arc':
        this.playerController.applyMageMultishotArcBonus();
        break;
      case 'mage_dual_burst':
        this.playerController.applyMageDualBurstBonus();
        break;
      case 'mage_bounce_kernel':
        this.playerController.applyMageBounceKernelBonus();
        break;
      case 'mage_reactive_aoe':
        this.playerController.applyMageReactiveAoEBonus();
        break;
      case 'mage_impact_aoe':
        this.playerController.applyMageImpactAoEBonus();
        break;
      case 'mage_autolock_patch':
        this.playerController.enableMageAutolockBonus();
        break;
      case 'firewall_deflect_matrix':
        this.playerController.applyFirewallDeflectBonus();
        break;
      case 'firewall_stun_driver':
        this.playerController.applyFirewallStunBonus();
        break;
      case 'firewall_thorns_driver':
        this.playerController.applyFirewallThornsBonus();
        break;
      case 'firewall_bash_range':
        this.playerController.applyFirewallBashRangeBonus();
        break;
      case 'firewall_damage_reduction':
        this.playerController.applyFirewallDamageReductionBonus();
        break;
      case 'rogue_stealth_zone':
        this.playerController.applyRogueStealthZoneBonus();
        break;
      case 'rogue_lifesteal_script':
        this.playerController.applyRogueLifestealBonus();
        break;
      case 'rogue_whitehat_chain':
        this.playerController.applyRogueWhitehatChainBonus();
        break;
      case 'rogue_range_patch':
        this.playerController.applyRogueRangePatchBonus();
        break;
      case 'rogue_backdoor':
        this.playerController.applyRogueBackdoorBonus();
        break;
      default:
        // Placeholder class-dependent bonuses are intentionally no-op for now.
        break;
    }
  }

  private computeEnemyKillReward(enemyType?: string): number {
    return this.economyFlowManager?.computeEnemyKillReward(enemyType, this.roomElapsedSeconds) ?? 1;
  }

  private addCurrency(amount: number): void {
    this.economyFlowManager?.addCurrency(amount);
  }

  private addCurrencyFraction(amount: number): void {
    this.economyFlowManager?.addCurrencyFraction(amount);
  }

  private applyPassiveIncome(deltaTime: number): void {
    this.economyFlowManager?.applyPassiveIncome(deltaTime);
  }

  private trySpendCurrency(cost: number): boolean {
    return this.economyFlowManager?.trySpendCurrency(cost) ?? false;
  }

  private updateConsumablesFromInput(): void {
    this.economyFlowManager?.updateConsumablesFromInput();
  }

  private getConsumableStatusLabel(): string {
    if (this.economyFlowManager) {
      return this.economyFlowManager.getConsumableStatusLabel();
    }

    const damage = this.playerController?.getDamageBoostState?.();
    const shield = this.playerController?.getDamageReductionState?.();
    return this.runEconomy.getConsumableStatusLabel(
      { active: !!damage?.active, remaining: damage?.remaining ?? 0 },
      { active: !!shield?.active, remaining: shield?.remaining ?? 0 },
    );
  }

  getScene(): Scene {
    return this.scene;
  }

  getEngine(): Engine {
    return this.engine;
  }

  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  getPlayerController(): PlayerController {
    return this.playerController;
  }

  getEnemySpawner(): EnemySpawner {
    return this.enemySpawner;
  }

  getProjectileManager(): ProjectileManager {
    return this.projectileManager;
  }

  private resetPlayerVoidFallState(): void {
    this.playerVoidRecoveryManager?.reset();
  }

  private detectAndStartPlayerVoidFall(): void {
    this.playerVoidRecoveryManager?.detectAndStart(this.roomOrder, this.currentRoomIndex);
  }

  private updatePlayerVoidFall(deltaTime: number): boolean {
    return this.playerVoidRecoveryManager?.update(deltaTime) ?? false;
  }

  private async loadTilesForRoom(roomId: string): Promise<void> {
    const profile = this.getRenderProfileForRoom(roomId);

    const layout = this.getOrBuildRoomLayout(roomId);
    if (!layout) {
      console.warn(`Room ${roomId} has no layout array`);
      return;
    }

    const activeKey = `${roomId}::${this.currentRoomIndex}`;
    const origin = this.roomManager.getCurrentRoomOrigin();
    this.tileFloorManager.loadRoomFloorInstance(activeKey, layout, origin, profile);
    this.tileFloorManager.setCurrentRoomInstance(activeKey);
    console.log(`✓ Tiles loaded for room ${roomId} (${layout.layout.length} rows)`);
  }

  private preloadTileFloorInstance(roomId: string, instanceKey: string, origin: Vector3): void {
    const layout = this.getOrBuildRoomLayout(roomId);
    if (!layout) return;
    const profile = this.getRenderProfileForRoom(roomId);
    this.tileFloorManager.loadRoomFloorInstance(instanceKey, layout, origin, profile);
  }

  private buildRoomLayoutForTiles(room: LoadedRoomConfig): RoomLayout | null {
    if (!room?.layout || !Array.isArray(room.layout)) return null;

    const layoutWidth = room.layout.reduce((max: number, row: string) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      return Math.max(max, rowData.length);
    }, 0);

    const layoutHeight = room.layout.length;
    const shouldTreatVoidAsWall = layoutWidth <= 16 && layoutHeight <= 12;

    const normalizedLayout = room.layout.map((row: string) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      const padded = rowData.padEnd(layoutWidth, '#').replace(/O/g, '#');
      return shouldTreatVoidAsWall ? padded.replace(/V/g, '#') : padded;
    });

    const obstacles = Array.isArray(room.obstacles)
      ? room.obstacles.flatMap((ob: { x: number; y?: number; z?: number; width: number; height: number; type: string }) => {
          if (ob.type === 'hazard') return [];
          const obstacleZ = Number.isFinite(ob?.y)
            ? ob.y
            : (Number.isFinite(ob?.z) ? ob.z : undefined);
          if (!Number.isFinite(ob?.x) || !Number.isFinite(obstacleZ)) return [];
          const obstacleZValue = Number(obstacleZ);
          const width = Math.max(1, ob.width || 1);
          const height = Math.max(1, ob.height || 1);
          const tiles = [] as Array<{ x: number; z: number; type: string }>;
          for (let dx = 0; dx < width; dx++) {
            for (let dz = 0; dz < height; dz++) {
              tiles.push({ x: ob.x + dx, z: obstacleZValue + dz, type: 'wall' });
            }
          }
          return tiles;
        })
      : [];

    return {
      layout: normalizedLayout,
      obstacles,
    };
  }

  private shouldIncludeInRunOrder(room: LoadedRoomConfig): boolean {
    if (!room?.id || !Array.isArray(room.layout)) return false;

    const layoutWidth = room.layout.reduce((max: number, row: string) => {
      const rowData = typeof row === 'string' ? row : String(row ?? '');
      return Math.max(max, rowData.length);
    }, 0);
    const layoutHeight = room.layout.length;
    const tileBudget = layoutWidth * layoutHeight;

    // Keep oversized test/stress rooms available for isolated loading, but out of normal wave loop.
    if (/^room_test_/i.test(room.id) && tileBudget > 220) {
      return false;
    }

    return true;
  }

  private getOrBuildRoomLayout(roomId: string): RoomLayout | null {
    const cached = this.roomLayoutCache.get(roomId);
    if (cached) return cached;

    const room = this.configLoader.getRoom(roomId);
    if (!room) {
      console.warn(`Room ${roomId} not found in config`);
      return null;
    }

    const layout = this.buildRoomLayoutForTiles(room);
    if (layout) {
      this.roomLayoutCache.set(roomId, layout);
    }
    return layout;
  }

  private setLoadingOverlay(visible: boolean, label?: string, progress?: string): void {
    const loading = document.getElementById('loading');
    if (!loading) return;
    loading.classList.toggle('hidden', !visible);

    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
    if (canvas) {
      canvas.style.visibility = visible ? 'hidden' : 'visible';
    }

    if (label) {
      const labelEl = document.getElementById('loadingLabel');
      if (labelEl) {
        labelEl.textContent = label;
      } else {
        const title = loading.querySelector('p');
        if (title) title.textContent = label;
      }
    }

    if (progress) {
      const progressEl = document.getElementById('loadingProgress');
      if (progressEl) progressEl.textContent = progress;

      const fillEl = document.getElementById('loadingBarFill');
      if (fillEl) {
        const numeric = Number.parseInt(progress.replace('%', ''), 10);
        if (Number.isFinite(numeric)) {
          const clamped = Math.max(0, Math.min(100, numeric));
          (fillEl as HTMLDivElement).style.width = `${clamped}%`;
        }
      }
    }
  }

  private async prewarmAllProceduralLayoutsAsync(showOverlay: boolean): Promise<void> {
    if (!this.gameplayInitialized) return;
    if (this.textureRenderMode !== 'proceduralRelief') return;
    if (this.proceduralWarmCacheReady) {
      if (showOverlay) {
        this.setLoadingOverlay(true, 'OPTIMIZING DUNGEON...', '100%');
        await this.waitForNextPaint(1);
        this.setLoadingOverlay(false);
      }
      return;
    }
    if (this.proceduralPrewarmPromise) {
      await this.proceduralPrewarmPromise;
      return;
    }

    const roomIds = this.roomOrder.length > 0
      ? this.roomOrder
      : Array.from(this.roomLayoutCache.keys());

    this.proceduralPrewarmPromise = (async () => {
      const shouldShowOverlay = showOverlay && !this.lightweightTextureMode;
      if (shouldShowOverlay) {
        this.setLoadingOverlay(true, 'OPTIMIZING DUNGEON...', '0%');
      }

      try {
        const maxRooms = this.lightweightTextureMode ? Math.min(roomIds.length, 4) : roomIds.length;
        const total = Math.max(1, maxRooms);
        for (let i = 0; i < maxRooms; i++) {
          const roomId = roomIds[i];
          const layout = this.getOrBuildRoomLayout(roomId);
          if (layout) {
            this.tileFloorManager.prewarmRoomLayout(layout);
          }

          if (shouldShowOverlay) {
            const pct = Math.floor(((i + 1) / total) * 100);
            this.setLoadingOverlay(true, 'OPTIMIZING DUNGEON...', `${pct}%`);
          }

          // Yield to the browser between rooms to avoid long main-thread stalls.
          await this.waitForNextPaint(1);
        }
        this.proceduralWarmCacheReady = true;
      } finally {
        this.pendingProceduralPrewarmRoomIds = [];
        if (this.proceduralPrewarmTimer !== null) {
          window.clearTimeout(this.proceduralPrewarmTimer);
          this.proceduralPrewarmTimer = null;
        }
        if (shouldShowOverlay) {
          this.setLoadingOverlay(false);
        }
        this.proceduralPrewarmPromise = null;
      }
    })();

    await this.proceduralPrewarmPromise;
  }

  private runProceduralPrewarmQueue(): void {
    // Keep compatibility with existing callers.
    void this.prewarmAllProceduralLayoutsAsync(false);
  }

  private loadTilesForLayout(layout: RoomLayout, origin: Vector3): void {
    const profile = this.getRenderProfileForRoom('');
    this.tileFloorManager.loadRoomFloor(layout, origin, profile);
  }

  private getRenderProfileForRoom(roomId: string): 'classic' | 'neoDungeonTest' | 'proceduralRelief' {
    if (this.textureRenderMode === 'proceduralRelief') {
      return 'proceduralRelief';
    }
    return ProceduralDungeonTheme.isNeoTestRoom(roomId) ? 'neoDungeonTest' : 'classic';
  }

  public getTextureRenderMode(): TextureRenderMode {
    return this.textureRenderMode;
  }

  public getProceduralQuality(): ProceduralReliefQuality {
    return ProceduralReliefTheme.getQuality();
  }

  public setProceduralQuality(quality: ProceduralReliefQuality): void {
    const effectiveQuality = this.lightweightTextureMode ? 'low' : quality;
    ProceduralReliefTheme.setQuality(effectiveQuality);
    this.proceduralWarmCacheReady = false;
    if (!this.gameplayInitialized || this.textureRenderMode !== 'proceduralRelief') return;

    const rooms = this.configLoader.getRoomsConfig();
    if (Array.isArray(rooms)) {
      void this.prewarmAllProceduralLayoutsAsync(false);
    }

    const currentRoomId = this.roomOrder[this.currentRoomIndex] ?? '';
    if (currentRoomId) {
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
      if (this.tilesEnabled) {
        this.loadTilesForRoom(currentRoomId);
      }
    }
  }

  public setTextureRenderMode(mode: TextureRenderMode): void {
    if (this.textureRenderMode === mode) return;
    this.textureRenderMode = mode;

    if (!this.gameplayInitialized) return;

    if (mode === 'proceduralRelief') {
      ProceduralReliefTheme.setLightweightMode(this.lightweightTextureMode);
      ProceduralReliefTheme.setQuality(this.lightweightTextureMode ? 'low' : 'medium');
      this.proceduralWarmCacheReady = false;
      ProceduralReliefTheme.prewarm(this.scene);
      void this.prewarmAllProceduralLayoutsAsync(!this.lightweightTextureMode);
    } else {
      this.proceduralWarmCacheReady = false;
      this.pendingProceduralPrewarmRoomIds = [];
      if (this.proceduralPrewarmTimer !== null) {
        window.clearTimeout(this.proceduralPrewarmTimer);
        this.proceduralPrewarmTimer = null;
      }
    }

    const currentRoomId = this.roomOrder[this.currentRoomIndex] ?? '';
    const profile = this.getRenderProfileForRoom(currentRoomId);
    this.tileFloorManager.setRenderProfile(profile);
    this.roomManager.setRenderProfile(profile);

    if (currentRoomId) {
      // Refresh current/preloaded room geometry so walls and pillars switch materials immediately.
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
      if (this.tilesEnabled) {
        this.loadTilesForRoom(currentRoomId);
      }
    }
  }

  public loadRoomFromTileMappingJson(jsonPayload: string): void {
    if (!this.gameplayInitialized) return;

    let mapping: TileMappingLayout | null = null;
    try {
      mapping = JSON.parse(jsonPayload) as TileMappingLayout;
    } catch (error) {
      console.warn('Invalid JSON payload for tile mapping', error);
      return;
    }

    if (!mapping || !Array.isArray(mapping.tiles) || !Number.isFinite(mapping.width) || !Number.isFinite(mapping.height)) {
      console.warn('Tile mapping JSON missing width/height/tiles');
      return;
    }

    const layout = RoomLayoutParser.fromTileMapping(mapping);
    const roomId = `room_custom_${Date.now()}`;

    const obstacles = (layout.obstacles ?? []).map(ob => ({
      x: ob.x,
      y: ob.z,
      width: 1,
      height: 1,
      type: ob.type ?? 'pillar',
    }));

    const fallbackSpawn = this.findFirstFloorSpawn(layout.layout) ?? { x: 1, y: 1 };
    const roomConfig = {
      id: roomId,
      name: 'Custom Tile Room',
      roomType: 'normal',
      layout: layout.layout as string[],
      spawnPoints: [],
      playerSpawnPoint: fallbackSpawn,
      obstacles,
    };

    this.cameraMove = null;
    this.roomOrder = [roomId];
    this.currentRoomIndex = 0;
    this.roomCleared = true;
    this.roomElapsedSeconds = 0;
    this.hudManager.hideOverlays();
    this.transitionGameState('playing');

    this.roomManager.clearAllRooms();
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.roomManager.setRenderProfile(this.getRenderProfileForRoom(roomId));
    const origin = new Vector3(0, 0, 0);
    const instanceKey = `${roomId}::0`;
    this.roomManager.loadRoomFromConfig(roomConfig, instanceKey, origin, true);
    this.roomManager.setDoorActive(false);

    const spawnPoint = this.roomManager.getPlayerSpawnPoint(roomId) || Vector3.Zero();
    this.playerController.setPosition(spawnPoint);
    this.playerController.healToFull();
    this.playerController.resetFocusFire();

    this.projectileManager.dispose();
    this.ultimateManager.dispose();
    this.enemySpawner.dispose();

    if (this.tilesEnabled) {
      this.loadTilesForLayout(layout, origin);
    }

    this.eventCoordinator.emitRoomEntered({
      roomId,
      roomName: roomConfig.name,
      roomType: roomConfig.roomType ?? 'normal',
    });
  }

  private findFirstFloorSpawn(layout: Array<string | string[]>): { x: number; y: number } | null {
    for (let z = 0; z < layout.length; z++) {
      const row = layout[z];
      const rowData = typeof row === 'string' ? row : row.join('');
      for (let x = 0; x < rowData.length; x++) {
        const cell = rowData[x];
        if (cell !== '#' && cell !== 'V') {
          return { x, y: z };
        }
      }
    }
    return null;
  }

  public canMoveToTile(x: number, z: number): boolean {
    return this.tileFloorManager.isWalkable(x, z);
  }

  public getTileAt(x: number, z: number) {
    return this.tileFloorManager.getTileAt(x, z);
  }

  public getTileStatistics() {
    return this.tileFloorManager.getStatistics();
  }

  public getHUDManager(): HUDManager {
    return this.hudManager;
  }

  public isUsingTiles(): boolean {
    return this.tilesEnabled;
  }

  public setTilesEnabled(enabled: boolean): void {
    if (this.tilesEnabled === enabled) return;
    this.tilesEnabled = enabled;
    this.roomManager.setFloorRenderingEnabled(!enabled);

    if (!this.gameplayInitialized) {
      if (!enabled) {
        this.roomStreamingManager?.clearDeferredRoomLoadQueue();
        this.roomStreamingManager?.clearDeferredTilePreloadQueue();
        this.tileFloorManager.clearAllRoomInstances();
      }
      return;
    }

    if (!enabled) {
      this.roomStreamingManager?.clearDeferredRoomLoadQueue();
      this.roomStreamingManager?.clearDeferredTilePreloadQueue();
      this.tileFloorManager.clearAllRoomInstances();
    }

    // Rebuild current/preloaded room geometry so floor/walls always match tile mode.
    this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
    const currentRoomId = this.roomOrder[this.currentRoomIndex];
    if (enabled && currentRoomId) {
      void this.loadTilesForRoom(currentRoomId);
    }
  }

  // Camera parameters for dev console
  public getCameraAlpha(): number {
    return this.cameraAlpha;
  }

  public getCameraBeta(): number {
    return this.cameraBeta;
  }

  public getCameraRadius(): number {
    return this.cameraRadius;
  }

  public setCameraAlpha(alpha: number): void {
    this.cameraAlpha = alpha;
    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.alpha = alpha;
    }
  }

  public setCameraBeta(beta: number): void {
    this.cameraBeta = beta;
    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.beta = beta;
    }
  }

  public setCameraRadius(radius: number): void {
    this.cameraRadius = radius;
    const camera = (this.scene as SceneWithMainCamera).mainCamera as ArcRotateCamera;
    if (camera) {
      camera.radius = radius;
    }
  }

  // Player and enemy height controls
  public setPlayerHeightOffset(offset: number): void {
    if (this.playerController?.animationController) {
      this.playerController.animationController.setHeightOffset(offset);
    }
  }

  public getPlayerHeightOffset(): number {
    if (this.playerController?.animationController) {
      return this.playerController.animationController.getHeightOffset();
    }
    return 0;
  }

  public setEnemyHeightOffset(offset: number): void {
    EnemyController.setGlobalHeightOffset(offset);
    // Update existing enemies (mesh is now public)
    const enemies = this.enemySpawner?.getEnemies() || [];
    for (const enemy of enemies) {
      if (enemy.mesh) {
        enemy.mesh.position.y = 1.0 + offset;
      }
    }
  }

  public getEnemyHeightOffset(): number {
    return EnemyController.getGlobalHeightOffset();
  }

  // Walls visibility control
  public setWallsVisible(visible: boolean): void {
    this.roomManager.setWallsVisible(visible);
  }

  public areWallsVisible(): boolean {
    return this.roomManager.areWallsVisible();
  }
}
