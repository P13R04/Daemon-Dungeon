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
  RoomEnteredPayload,
} from './GameEventBindings';
import { RunEconomyManager } from './RunEconomyManager';
import { Time } from './Time';
import { ConfigLoader } from '../utils/ConfigLoader';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../gameplay/PlayerController';
import { EnemySpawner } from '../systems/EnemySpawner';
import { EnemyController } from '../gameplay/EnemyController';
import { EnemyLaserPatternSubsystem } from '../gameplay/enemy/EnemyLaserPatternSubsystem';
import { RoomManager } from '../systems/RoomManager';
import { ProjectileManager } from '../gameplay/ProjectileManager';
import { UltimateManager } from '../gameplay/UltimateManager';
import type { HUDManager } from '../systems/HUDManager';
import type { DevConsole } from '../systems/DevConsole';
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
import type { MainMenuScene } from '../scene/MainMenuScene';
import { BootSequenceScene } from '../scene/BootSequenceScene';
import { DaemonTakeoverIntroScene } from '../scene/DaemonTakeoverIntroScene';
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
import { ScoreManager } from '../systems/ScoreManager';
import { BONUS_TUNING } from '../data/bonuses/bonusTuning';
import { WallOcclusionManager } from '../systems/WallOcclusionManager';
import { MusicManager } from '../audio/MusicManager';
import { AudioManager } from '../audio/AudioManager';
import { DaemonVoiceSynth } from '../audio/DaemonVoiceSynth';
import type { DaemonVoicelineManager } from './DaemonVoicelineManager';


type TextureRenderMode = 'classic' | 'proceduralRelief';
type RuntimeGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';
type SceneWithMainCamera = Scene & { mainCamera?: ArcRotateCamera };
type FrontendSceneHandle = { getScene(): Scene; dispose(): void };
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
  private devConsole: DevConsole | null = null;
  private postProcessManager!: PostProcessManager;
  private tileFloorManager!: TileFloorManager;
  private bootScene?: BootSequenceScene;
  private takeoverIntroScene?: DaemonTakeoverIntroScene;
  private mainMenuScene?: MainMenuScene;
  private classSelectScene?: ClassSelectScene;
  private codexScene?: FrontendSceneHandle;
  private achievementsScene?: FrontendSceneHandle;
  private highscoresScene?: FrontendSceneHandle;
  private creditsScene?: FrontendSceneHandle;
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
  private daemonVoicelineManager: DaemonVoicelineManager | null = null;
  private economyFlowManager: GameEconomyFlowManager | null = null;
  private tutorialManager: GameTutorialManager;
  private scoreManager: ScoreManager;
  private readonly runtimeOrchestrator = new GameRuntimeOrchestrator();
  
  private isRunning: boolean = false;
  private gameplayInitialized: boolean = false;
  private gameplayStartInProgress: boolean = false;
  private isTutorialRun: boolean = false;
  private tutorialReplayRun: boolean = false;
  private pendingPostTutorialClass: 'mage' | 'firewall' | 'rogue' | 'cat' | null = null;
  private eventListenersBound: boolean = false;
  private eventBusUnsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private resizeListener: (() => void) | null = null;
  private selectedClassId: 'mage' | 'firewall' | 'rogue' | 'cat' = 'mage';
  private tilesEnabled: boolean = true;
  public isPaused: boolean = false;
  private isCountingDown: boolean = false;
  private textureRenderMode: TextureRenderMode = 'proceduralRelief';
  private roomLayoutCache: Map<string, RoomLayout> = new Map();
  private proceduralPrewarmPromise: Promise<void> | null = null;
  private proceduralWarmCacheReady: boolean = false;
  private pendingProceduralPrewarmRoomIds: string[] = [];
  private proceduralPrewarmTimer: number | null = null;
  private postTransitionMaintenanceTimer: number | null = null;
  private deferredRoomEnteredEventTimer: number | null = null;
  private transitionSequenceId: number = 0;
  private roomIntroSequencePendingIndex: number | null = null;
  private roomIntroSequenceRunning: boolean = false;
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
  private benchmarkRoomElapsedSeconds: number = 0;
  private benchmarkAutoplayState: 'fighting' | 'clearing' | 'running_to_door' | 'transitioning' = 'fighting';
  private benchmarkEnemyKillTimer: number = 0;
  private benchmarkDaemonTauntTimer: number = 0;
  private benchmarkDaemonTauntInterval: number = 14;
  private showBenchmarkReportOnFinish: boolean = false;
  private benchmarkReportOverlay: HTMLDivElement | null = null;
  private tutorialPopupAudioMuffleActive: boolean = false;
  private benchmarkPreparationLastPumpMs: number = 0;
  private interRoomPreloadPromise: Promise<void> | null = null;
  private interRoomPreloadTargetIndex: number | null = null;
  private interRoomPreloadPrimedRoomKey: string | null = null;
  private lastBenchmarkFrameProfile: RuntimeFrameProfileSnapshot | null = null;
  private lastBenchmarkLoopProfile: RuntimeFrameProfileSnapshot | null = null;
  private lastAttackerType: string | null = null;
  private wallOcclusionManager: WallOcclusionManager | null = null;
  private musicManager: MusicManager | null = null;
  private audioManager: AudioManager | null = null;
  private activeArtificierZoneIds: Set<number> = new Set();
  private activeArtificierProjectilesInFlight: number = 0;
  private activeSentryShooterProjectilesInFlight: number = 0;
  private lastArtificierZoneDamageSfxAtMs: number = 0;
  private aliveArtificierCount: number = 0;
  private fastCleanRoomAccumulator: number = 0;
  private fastCleanRoomLastIndex: number = -1;
  private gameplayFixedStepSeconds: number = 1 / 60;
  private gameplayStepAccumulator: number = 0;
  private gameplayMaxSubstepsPerFrame: number = 4;
  private playerDamageSfxLastAtMs: Map<'melee' | 'projectile' | 'dot', number> = new Map();
  private frontendMusicMode: 'menu' | 'codex' | null = null;


  private constructor() {
    this.stateMachine = new StateMachine();
    this.eventBus = EventBus.getInstance();
    this.time = Time.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.codexService = new CodexService();
    // this.economyFlowManager initialized later when dependencies ready
    this.tutorialManager = new GameTutorialManager();
    this.scoreManager = new ScoreManager();
    this.eventCoordinator = new GameEventCoordinator(this.eventBus);
    
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
        if (this.benchmarkRunner) {
          const available = choices.filter(c => !selectionState.selectedBonusIds.includes(c.id));
          if (available.length > 0) {
            setTimeout(() => {
              if (this.gameplayInitialized && this.gameState === 'bonus') {
                this.bonusSystemManager.handleBonusSelected(available[0].id);
              }
            }, 600);
          }
        }
      },
      applyBonus: (bonusId) => {
        this.applyBonus(bonusId);
        this.hudManager.setRunEquippedBonuses(this.bonusSystemManager.getActiveBonuses());
      },
      startRoomTransition: (nextIndex) => {
        void this.startRoomTransitionSequence(nextIndex);
      },
      getCurrentRoomIndex: () => this.currentRoomIndex,
      getRoomOrderLength: () => this.roomOrder.length,
      markBonusDiscovered: (bonusId) => {
        void this.codexService.markBonusDiscovered(bonusId);
      },
      recordBonusCollected: (bonusId) => {
        this.codexService.recordBonusCollected(bonusId);
      },
      onInsufficientShopFunds: () => {
        this.hudManager.triggerBonusInsufficientFundsFx();
      },
      onTutorialShopInteraction: (type) => {
        if (this.isTutorialRun) {
          this.eventBus.emit(GameEvents.TUTORIAL_SHOP_INTERACTED, { type });
        }
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
    this.applyAudioSettings(GameSettingsStore.get());
    this.unsubscribeSettings = GameSettingsStore.subscribe((settings) => {
      this.applyGraphicsSettings(settings);
      this.applyAudioSettings(settings);
      // Update auto-aim HUD badge
      const autoAimActive = !!settings.controls.autoAimTowardMovement;
      if (this.hudManager) this.hudManager.setAutoAimIndicator(autoAimActive);
    });

    // Initialize Babylon.js engine
    // NOTE: adaptToDeviceRatio is intentionally kept at default (false).
    // Enabling it would force the GPU to render at full DPR resolution
    // (e.g. 9× the pixels on an iPhone at DPR=3), causing severe lag.
    // GUI sharpness is handled separately via renderAtIdealSize=false.
    this.engine = new Engine(canvas, true);
    // Avoid Babylon offline manifest/indexedDB network side-effects inside itch iframe/CDN context.
    this.engine.enableOfflineSupport = false;

    // Setup resize handling with fallback for browsers lacking ResizeObserver.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.engine?.resize();
      });
      this.resizeObserver.observe(canvas as any);
    } else {
      this.resizeListener = () => this.engine?.resize();
      window.addEventListener('resize', this.resizeListener, { passive: true });
    }

    this.setupGlobalAudioUnlock();

    // Load configurations
    await this.configLoader.loadAllConfigs();

    const gameplayDebug = this.configLoader.getGameplayConfig()?.debug;
    this.codexService.setDevUnlockCodexEntries(!!gameplayDebug?.enabled);

    const rooms = this.configLoader.getRoomsConfig() ?? [];
    const runEnemyTypes = new Set<string>();
    for (const room of rooms) {
      if (!this.shouldIncludeInRunOrder(room)) continue;
      const spawnPoints = Array.isArray(room.spawnPoints) ? room.spawnPoints : [];
      for (const spawnPoint of spawnPoints) {
        const enemyType = typeof spawnPoint?.enemyType === 'string' ? spawnPoint.enemyType.trim() : '';
        if (!enemyType || enemyType.startsWith('tutorial_')) continue;
        runEnemyTypes.add(enemyType);
      }
    }
    this.codexService.configureRunEnemyCatalog([...runEnemyTypes]);
    this.reconcileTutorialPersistenceState();

    // Setup event listeners
    this.setupEventListeners();

    const introMode = this.configLoader.getGameplayConfig()?.intro?.mode ?? 'takeover';
    const mageTutorialCompleted = this.codexService.hasCompletedTutorialForClass('mage');
    if (introMode === 'off') {
      await this.openMainMenuScene();
    } else if (introMode === 'legacy') {
      if (BootSequenceScene.shouldPlay()) {
        await this.openBootSequenceScene();
      } else {
        await this.openMainMenuScene();
      }
    } else if (!mageTutorialCompleted) {
      await this.openTakeoverIntroScene();
    } else {
      await this.openMainMenuScene();
    }

    // Start in menu scene
    this.transitionGameState('menu');

    // Start game loop
    this.startGameLoop();

    this.isRunning = true;
  }

  private reconcileTutorialPersistenceState(): void {
    // Source-of-truth policy:
    // - Long-term progression lives in CodexService snapshot.
    // - Settings flag is kept in sync for legacy UI/flows.
    const codexMageDone = this.codexService.hasCompletedTutorialForClass('mage');
    const settingsMageDone = !!GameSettingsStore.get().accessibility.tutorialCompleted;

    // Legacy migration case: settings says done but codex was missing/older.
    if (settingsMageDone && !codexMageDone) {
      this.codexService.recordTutorialCompleted('mage');
    }

    // Keep settings aligned with codex for stable first-launch behavior.
    const effectiveMageDone = this.codexService.hasCompletedTutorialForClass('mage');
    if (effectiveMageDone !== settingsMageDone) {
      GameSettingsStore.updateAccessibility({ tutorialCompleted: effectiveMageDone });
    }
  }

  private setupEscapeListener(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.gameplayInitialized || this.gameState !== 'playing') return;
        
        if (!this.isPaused) {
          this.togglePause();
        } else if (this.hudManager) {
          this.hudManager.handleEscapeKey();
        }
      }
    });
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
      const mageTutorialCompleted = this.codexService.hasCompletedTutorialForClass('mage');
      if (!mageTutorialCompleted) {
        this.eventCoordinator.emitTutorialStartRequested('mage');
      } else {
        void this.openMainMenuScene();
      }
    });
    this.scene = this.bootScene.getScene();
  }

  private async openTakeoverIntroScene(): Promise<void> {
    this.takeoverIntroScene = new DaemonTakeoverIntroScene(this.engine, () => {
      if (this.takeoverIntroScene) {
        this.takeoverIntroScene.dispose();
        this.takeoverIntroScene = undefined;
      }
      // Keep first-launch flow active until mage tutorial is fully completed/skipped.
      // This prevents refreshes during first tutorial from dropping users into menu.
      const mageTutorialCompleted = this.codexService.hasCompletedTutorialForClass('mage');
      if (!mageTutorialCompleted) {
        this.eventCoordinator.emitTutorialStartRequested('mage');
      } else {
        void this.openMainMenuScene();
      }
    });
    this.scene = this.takeoverIntroScene.getScene();
  }

  private disposeFrontendScenes(): void {
    if (this.takeoverIntroScene) {
      this.takeoverIntroScene.dispose();
      this.takeoverIntroScene = undefined;
    }
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
    if (this.achievementsScene) {
      this.achievementsScene.dispose();
      this.achievementsScene = undefined;
    }
    if (this.highscoresScene) {
      this.highscoresScene.dispose();
      this.highscoresScene = undefined;
    }
    if (this.creditsScene) {
      this.creditsScene.dispose();
      this.creditsScene = undefined;
    }
  }

  private async openMainMenuScene(): Promise<void> {
    this.stopBenchmarkRunner();
    this.disposeBenchmarkReportOverlay();
    
    // Dispose gameplay if returning to menu to ensure clean state for replays
    if (this.gameplayInitialized) {
      this.disposeGameplay();
    }

    this.disposeFrontendScenes();
    const { MainMenuScene } = await import('../scene/MainMenuScene');
    this.mainMenuScene = new MainMenuScene(this.engine, () => {
      void this.openClassSelectScene(false);
    }, () => {
      void this.openCodexScene();
    }, () => {
      void this.openClassSelectScene(true);
    }, () => {
      void this.startBenchmarkFromMenu();
    }, (deltaSeconds: number) => this.musicManager?.sampleBeatPulse(deltaSeconds) ?? 0);
    this.scene = this.mainMenuScene.getScene();
    void this.playFrontendMusic('menu');
    void ClassSelectScene.prewarmCoreClassAssets(this.engine).catch((error) => {
      console.warn('[GameManager] Class asset prewarm failed in menu background:', error);
    });
  }

  private shouldLaunchShortClassTutorial(classId: 'mage' | 'firewall' | 'rogue' | 'cat'): boolean {
    const classKey = classId === 'cat' ? 'rogue' : classId;
    if (classKey === 'mage') return false;
    return !this.codexService.hasCompletedTutorialForClass(classId);
  }

  private async openCodexScene(): Promise<void> {
    this.disposeFrontendScenes();
    this.codexService.recordCodexOpened();

    try {
      const { CodexScene } = await import('../scene/CodexScene');
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
      void this.playFrontendMusic('codex');
    } catch (error) {
      console.error('[GameManager] Failed to open Codex scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openAchievementsScene(): Promise<void> {
    this.disposeFrontendScenes();
    try {
      const { AchievementsScene } = await import('../scene/AchievementsScene');
      this.achievementsScene = new AchievementsScene(
        this.engine,
        this.codexService,
        () => {
          void this.openMainMenuScene();
        }
      );
      this.scene = this.achievementsScene.getScene();
      this.transitionGameState('menu');
      void this.playFrontendMusic('codex');
    } catch (error) {
      console.error('[GameManager] Failed to open Achievements scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openHighscoresScene(): Promise<void> {
    this.disposeFrontendScenes();
    try {
      const { HighscoresScene } = await import('../scene/HighscoresScene');
      this.highscoresScene = new HighscoresScene(
        this.engine,
        this.codexService,
        () => {
          void this.openMainMenuScene();
        }
      );
      this.scene = this.highscoresScene.getScene();
      this.transitionGameState('menu');
      void this.playFrontendMusic('codex');
    } catch (error) {
      console.error('[GameManager] Failed to open Highscores scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openCreditsScene(): Promise<void> {
    this.disposeFrontendScenes();
    try {
      const { CreditsScene } = await import('../scene/CreditsScene');
      this.creditsScene = new CreditsScene(
        this.engine,
        () => {
          void this.openMainMenuScene();
        }
      );
      this.scene = this.creditsScene.getScene();
      this.transitionGameState('menu');
      void this.playFrontendMusic('menu');
    } catch (error) {
      console.error('[GameManager] Failed to open Credits scene:', error);
      await this.openMainMenuScene();
    }
  }

  private async openClassSelectScene(isTutorial: boolean = false): Promise<void> {
    try {
      this.setLoadingOverlay(true, 'PREPARING CLASS SIMULATION...', '0%');
      await this.waitForNextPaint(1);
      this.setLoadingOverlay(true, 'PRELOADING PLAYER MODELS...', '60%');
      await this.waitForNextPaint(1);
      await this.awaitPromiseWithTimeout(ClassSelectScene.prewarmCoreClassAssets(this.engine), 8000);
      this.setLoadingOverlay(true, 'FINALIZING PREVIEW...', '100%');
      await this.waitForNextPaint(1);

      if (this.gameplayInitialized) {
        this.disposeGameplay();
      }
      this.disposeFrontendScenes();

      const classSelectPostFx = this.configLoader.getGameplayConfig()?.postProcessing;
      this.classSelectScene = new ClassSelectScene(this.engine, (classId, mode, options) => {
        if (options?.skipShortTutorial) {
          this.codexService.recordTutorialCompleted(classId);
        }
        if (isTutorial || mode === 'tutorial') {
          this.eventCoordinator.emitTutorialStartRequested(classId, isTutorial ? 'tutorial_menu' : 'main_run');
        } else {
          this.eventCoordinator.emitGameStartRequested(classId);
        }
      }, () => {
        void this.openMainMenuScene();
      }, classSelectPostFx, (classId) => {
        if (isTutorial) return false;
        return this.shouldLaunchShortClassTutorial(classId);
      });
      this.scene = this.classSelectScene.getScene();
      void this.playFrontendMusic('codex');
      await this.awaitPromiseWithTimeout(this.classSelectScene.waitUntilVisuallyReady(), 2200);
    } finally {
      this.setLoadingOverlay(false);
    }
  }

  private ensureMusicManagerForScene(scene: Scene): MusicManager {
    if (!this.musicManager || this.musicManager.getScene() !== scene) {
      this.musicManager?.dispose();
      this.musicManager = new MusicManager(scene);
      const settings = GameSettingsStore.get();
      this.musicManager.setMusicVolume(settings.audio.music);
      this.musicManager.setMasterVolume(settings.audio.master);
    }
    return this.musicManager;
  }

  private async playFrontendMusic(mode: 'menu' | 'codex'): Promise<void> {
    try {
      const manager = this.ensureMusicManagerForScene(this.scene);
      const trackName = mode === 'menu' ? 'menu' : 'codex';
      const trackPath = mode === 'menu' ? 'music/menu.mp3' : 'music/codex.mp3';
      if (!manager.hasTrack(trackName)) {
        await manager.loadTrack(trackName, trackPath);
      }
      manager.playTrack(trackName, {
        fadeInDuration: mode === 'menu' ? 8 : 1.2,
        startAt: mode === 'menu' ? 45 : 0,
        restart: this.frontendMusicMode !== mode,
      });
      manager.setLowPass(false, 0.25);
      this.frontendMusicMode = mode;
    } catch (error) {
      console.warn('[GameManager] Failed to play frontend music:', error);
    }
  }

  private async awaitPromiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
    let timeoutId: number | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), Math.max(0, timeoutMs));
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private disposeGameplay(): void {
    this.projectileManager?.dispose();
    this.ultimateManager?.dispose();
    this.ultimateSystemManager?.reset();
    this.combatActionManager?.dispose();
    this.combatActionManager = null;
    this.playerVoidRecoveryManager?.dispose?.();
    this.playerVoidRecoveryManager = null;
    this.economyFlowManager?.dispose?.();
    this.economyFlowManager = null;
    this.roomStreamingManager?.dispose?.();
    this.roomStreamingManager = null;
    this.worldCollisionHazardManager?.dispose?.();
    this.worldCollisionHazardManager = null;
    this.hudManager?.dispose();
    this.devConsole?.dispose();
    this.devConsole = null;
    this.playerController?.dispose();
    this.enemySpawner?.dispose();
    this.roomManager?.dispose();
    this.tileFloorManager?.dispose();
    this.daemonVoicelineManager?.dispose();
    this.postProcessManager?.dispose();
    this.inputManager?.dispose();
    this.tutorialManager?.dispose();
    this.bonusSystemManager?.resetRun();

    if (this.wallOcclusionManager) { this.wallOcclusionManager.dispose(); this.wallOcclusionManager = null; }
    if (this.musicManager) { this.musicManager.dispose(); this.musicManager = null; }
    if (this.audioManager) { this.audioManager.dispose(); this.audioManager = null; }

    this.transitionFogPlanes.forEach(p => p.dispose());
    this.transitionFogPlanes = [];
    this.transitionFogMaterials.forEach(m => m.dispose());
    this.transitionFogMaterials = [];
    this.transitionFogTopPlanes.forEach(p => p.dispose());
    this.transitionFogTopPlanes = [];
    this.transitionFogTopMaterials.forEach(m => m.dispose());
    this.transitionFogTopMaterials = [];

    if (this.scene && this.scene !== this.mainMenuScene?.getScene() && this.scene !== this.classSelectScene?.getScene()) {
      this.scene.dispose();
    }
    this.gameplayInitialized = false;

    // Clear static model/texture caches to prevent VRAM accumulation and scene reuse crashes
    EnemyController.clearModelCache();
    EnemyLaserPatternSubsystem.clearCache();
    ProceduralReliefTheme.disposeAllCaches();
    DaemonVoiceSynth.getInstance().clearCache();
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

    if (this.hudManager) {
      this.hudManager.dispose();
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
    const { HUDManager } = await import('../systems/HUDManager');
    this.hudManager = new HUDManager(this.scene);
    this.hudManager.setInputManager(this.inputManager);
    this.hudManager.setPauseTutorialMode(this.isTutorialRun, this.selectedClassId);
    this.musicManager = new MusicManager(this.scene);
    this.frontendMusicMode = null;
    this.audioManager = new AudioManager(this.scene);
    void this.musicManager.loadTrack('bgm', 'music/bgm.mp3').then(() => {
      if (this.isTutorialRun || this.gameState === 'playing' || this.gameState === 'bonus' || this.gameState === 'roomclear') {
        // Tutorial runs should start the gameplay music immediately after scene load.
        this.musicManager?.playTrack('bgm', 1.5);
      }
    });
    void this.preloadMonsterSounds();
    void this.preloadUISounds();
    this.bindMonsterSoundEvents();
    this.bindUISoundEvents();

    this.tileFloorManager = new TileFloorManager(this.scene, 1.2);
    if (this.textureRenderMode === 'proceduralRelief') {
      ProceduralReliefTheme.setLightweightMode(this.lightweightTextureMode);
      ProceduralReliefTheme.setQuality(this.lightweightTextureMode ? 'low' : 'medium');
      ProceduralReliefTheme.prewarm(this.scene);
    }
    this.roomManager.setFloorRenderingEnabled(!this.tilesEnabled);
    this.tileFloorManager.setRenderProfile(this.getRenderProfileForRoom(''));
    void this.updateDevConsoleVisibility();
    
    // Subscribe to settings changes for dev mode
    GameSettingsStore.subscribe((settings) => {
      void this.updateDevConsoleVisibility();
      
      // Update other settings that might have changed
      if (this.enemySpawner) {
        this.enemySpawner.setSpawnSmoothingConfig({ batchSize: settings.graphics.enemySpawnBatchSize });
      }
    });

    this.inputManager.attachMouseListeners();

    const rooms = this.configLoader.getRoomsConfig();
    if (this.isTutorialRun) {
      if (this.selectedClassId === 'mage') {
        if (this.tutorialReplayRun) {
          this.roomOrder = ['room_tutorial_02'];
        } else {
          this.roomOrder = [
            'room_tutorial_01',
            'room_tutorial_02',
            'room_tutorial_03'
          ];
        }
      } else {
        this.roomOrder = ['room_tutorial_02'];
      }
    } else {
      this.roomOrder = this.generateRunRoomOrder(45); // 5 floors of 9 rooms (8 normal + 1 boss)
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
    this.hudManager.setPlayer(this.playerController);
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
    
    const { DaemonVoicelineManager } = await import('./DaemonVoicelineManager');
    this.daemonVoicelineManager = new DaemonVoicelineManager(this.eventBus, () => this.runEconomy.getCurrency());
    this.daemonVoicelineManager.setPlayerClass(this.selectedClassId === 'cat' ? 'rogue' : this.selectedClassId as any);
    this.daemonVoicelineManager.setOnVoicelineSelected((vl, forceCrash) => {
      if (this.isTutorialRun) return; // Tutorial uses only scripted lines
      this.hudManager.showDaemonMessage(vl.message, vl.animationSequence[0]?.emotion, {
        holdDuration: vl.holdDuration,
        voicePreset: vl.voicePreset,
        canGlitchFrames: vl.canGlitchFrames,
        canCrash: forceCrash,
      });
    });
    this.daemonVoicelineManager.bind();

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
    if (this.devConsole) {
      this.devConsole.setPlayer(this.playerController);
    }

    this.wallOcclusionManager = new WallOcclusionManager(
      GameSettingsStore.get().graphics.wallOcclusionTransparency,
    );

    this.gameplayInitialized = true;
    this.tutorialManager.initialize({
      getRoomCenter: () => this.roomManager.getCurrentRoomCenter(),
      getRoomIndex: () => this.currentRoomIndex,
      getPlayerSpawnPoint: () => this.roomManager.getPlayerSpawnPoint(this.roomOrder[this.currentRoomIndex]) || null,
      getDoorPosition: () => this.roomManager.getDoorPosition(),
      mapPointToWorld: (x: number, z: number, yHeight: number = 0.5) => this.roomManager.mapPointToWorld({ x, z }, yHeight),
      getActiveEnemyCount: () => this.enemySpawner?.getEnemies()?.length ?? 0,
      revealTutorialFreeChoice: () => this.bonusSystemManager.revealTutorialFreeChoice(),
      setTutorialPopupAudioMuffle: (enabled: boolean) => this.setTutorialPopupAudioMuffle(enabled),
      hudManager: this.hudManager,
      scene: this.scene,
      playerController: this.playerController
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
    this.setupEscapeListener();
    const bindings = new GameEventBindings(this.eventBus, {
      onGameStartRequested: (data) => {
        this.tryUnlockAudioNow();
        const classId = data?.classId as ('mage' | 'firewall' | 'rogue' | 'cat' | undefined);
        if (classId) {
          this.selectedClassId = classId;
        }
        this.isTutorialRun = data?.mode === 'tutorial';
        this.tutorialReplayRun = this.isTutorialRun && !!this.codexService.hasCompletedTutorialForClass(this.selectedClassId);
        this.hudManager?.setPauseTutorialMode(this.isTutorialRun, this.selectedClassId);
        this.codexService.startRunTracking(this.selectedClassId);
        void this.startNewGame();
      },
      onGameRestartRequested: () => {
        this.tryUnlockAudioNow();
        this.codexService.startRunTracking(this.selectedClassId);
        this.isTutorialRun = false;
        this.tutorialReplayRun = false;
        this.hudManager?.setPauseTutorialMode(false);
        void this.startNewGame();
      },
      onCodexOpenRequested: () => {
        void this.openCodexScene();
      },
      onAchievementsOpenRequested: () => {
        void this.openAchievementsScene();
      },
      onHighscoresOpenRequested: () => {
        void this.openHighscoresScene();
      },
      onCreditsOpenRequested: () => {
        void this.openCreditsScene();
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
          return;
        }
        const finalScore = this.scoreManager.getScore();
        const highScore = this.scoreManager.getHighScore();
        const roomReached = this.currentRoomIndex + 1;

        // Record death in CodexService
        const deathReason = payload?.reason ?? 'unknown';
        const attackerType = payload?.enemyType ?? this.lastAttackerType ?? undefined;
        this.codexService.recordPlayerDied(deathReason, attackerType);

        // Get run bonuses
        const activeBonuses = this.bonusSystemManager.getActiveBonuses();
        
        // Record run highscore and statistics history
        this.codexService.recordCompletedRun(
          finalScore,
          this.selectedClassId,
          roomReached,
          activeBonuses
        );

        this.codexService.endRunTracking();
        this.eventBus.emit(GameEvents.UI_SOUND_GAME_OVER);
        this.transitionGameState('gameover');
        this.hudManager.showGameOverScreen({
          score: finalScore,
          highScore: highScore,
          roomReached: roomReached,
          isNewHighScore: finalScore >= highScore && finalScore > 0,
          bonuses: activeBonuses
        });
      },
      onEnemySpawned: (data) => {
        const enemyType = data?.enemyType;
        if (typeof enemyType === 'string' && enemyType.length > 0) {
          void this.codexService.markEnemyEncountered(enemyType);
        }
      },
      onEnemyDied: (data) => {
        this.codexService.recordEnemyKilled(data?.enemyType);
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
      onRoomEntered: (_data: RoomEnteredPayload) => {
        console.log(`[GameManager] Room entered callback, index: ${this.currentRoomIndex}`);
        this.codexService.recordRoomReached(this.currentRoomIndex + 1);
        this.daemonVoicelineManager?.setCurrentRoom(this.currentRoomIndex);
        this.recalculatePlayerStats();
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
        const classKey = this.selectedClassId === 'cat' ? 'rogue' : this.selectedClassId;
        const tutorialSource = data?.source ?? 'main_run';
        const classTutorialAlreadyCompleted = this.codexService.hasCompletedTutorialForClass(this.selectedClassId);
        this.pendingPostTutorialClass =
          tutorialSource === 'main_run' && (classKey === 'firewall' || classKey === 'rogue') && !classTutorialAlreadyCompleted
            ? this.selectedClassId
            : null;
        this.isTutorialRun = true;
        this.tutorialReplayRun = !!this.codexService.hasCompletedTutorialForClass(this.selectedClassId);
        
        // Re-create tutorial manager to ensure fresh state and listeners
        if (this.tutorialManager) {
          this.tutorialManager.dispose();
        }
        this.tutorialManager = new GameTutorialManager();
        this.tutorialManager.startTutorial(this.selectedClassId as any || 'mage', { replay: this.tutorialReplayRun });
        this.tutorialManager.initialize({
          getRoomCenter: () => this.roomManager.getCurrentRoomCenter(),
          getRoomIndex: () => this.currentRoomIndex,
          getPlayerSpawnPoint: () => this.roomManager.getPlayerSpawnPoint(this.roomOrder[this.currentRoomIndex]) || null,
          getDoorPosition: () => this.roomManager.getDoorPosition(),
          mapPointToWorld: (x: number, z: number, yHeight: number = 0.5) => this.roomManager.mapPointToWorld({ x, z }, yHeight),
          getActiveEnemyCount: () => this.enemySpawner?.getEnemies()?.length ?? 0,
          revealTutorialFreeChoice: () => this.bonusSystemManager.revealTutorialFreeChoice(),
          setTutorialPopupAudioMuffle: (enabled: boolean) => this.setTutorialPopupAudioMuffle(enabled),
          hudManager: this.hudManager,
          scene: this.scene,
          playerController: this.playerController
        });
        this.daemonVoicelineManager?.setTutorialMode(true);
        this.hudManager?.setPauseTutorialMode(true, this.selectedClassId);

        this.codexService.startRunTracking(this.selectedClassId);
        void this.startNewGame();
      },
      onTutorialPhaseCompleted: (data) => {
        if (!this.gameplayInitialized || !this.isTutorialRun) return;
        if (data?.phaseId === 'unlock_door') {
          this.roomCleared = true;
          this.roomManager.setDoorActive(true);
        }
      },
      onTutorialEndRequested: () => {
        if (!this.gameplayInitialized || !this.isTutorialRun) return;
        this.tutorialManager?.stopTutorial();
        const classToFinalize = this.selectedClassId;
        const hadPendingRunStart = this.pendingPostTutorialClass && this.pendingPostTutorialClass === this.selectedClassId;
        this.codexService.recordTutorialCompleted(this.selectedClassId);
        if (this.selectedClassId === 'mage') {
          GameSettingsStore.updateAccessibility({ tutorialCompleted: true });
        }
        this.codexService.endRunTracking();
        this.isTutorialRun = false;
        this.tutorialReplayRun = false;
        this.daemonVoicelineManager?.setTutorialMode(false);
        this.hudManager?.setPauseTutorialMode(false);
        if (hadPendingRunStart) {
          this.pendingPostTutorialClass = null;
          void (async () => {
            await this.playTutorialExitFx();
            this.codexService.startRunTracking(classToFinalize);
            await this.startNewGame();
          })();
          return;
        }
        void (async () => {
          await this.playTutorialExitFx();
          await this.openMainMenuScene();
        })();
      },
      onTutorialSkipRequested: () => {
        if (!this.gameplayInitialized || !this.isTutorialRun) return;
        this.tutorialManager?.stopTutorial();
        this.isPaused = false;
        this.hudManager?.hidePauseMenu();
        this.hudManager?.setVoicelinesMuted(false);
        const classKey = this.selectedClassId === 'cat' ? 'rogue' : this.selectedClassId;
        if (classKey === 'firewall' || classKey === 'rogue') {
          const shouldStartRunAfterSkip = this.pendingPostTutorialClass === this.selectedClassId;
          if (shouldStartRunAfterSkip) {
            this.codexService.recordTutorialCompleted(this.selectedClassId);
          }
          this.codexService.endRunTracking();
          this.isTutorialRun = false;
          this.tutorialReplayRun = false;
          this.pendingPostTutorialClass = null;
          this.daemonVoicelineManager?.setTutorialMode(false);
          this.hudManager?.setPauseTutorialMode(false);
          if (shouldStartRunAfterSkip) {
            this.codexService.startRunTracking(this.selectedClassId);
            void this.startNewGame();
          } else {
            void this.openMainMenuScene();
          }
          return;
        }
        // Mage keeps legacy behavior: skip returns to main menu.
        this.codexService.recordTutorialCompleted(this.selectedClassId);
        GameSettingsStore.updateAccessibility({ tutorialCompleted: true });
        this.isPaused = false;
        this.pendingPostTutorialClass = null;
        this.codexService.endRunTracking();
        this.tutorialReplayRun = false;
        this.daemonVoicelineManager?.setTutorialMode(false);
        this.hudManager?.setPauseTutorialMode(false);
        void this.openMainMenuScene();
      },
      onPlayerUltimateRefillRequested: () => {
        this.playerController?.refillUltimate();
      },
      onMainMenuRequested: () => {
        this.isPaused = false;
        const classKey = this.selectedClassId === 'cat' ? 'rogue' : this.selectedClassId;
        if (this.isTutorialRun) {
          this.tutorialManager?.stopTutorial();
          // Mage skip button is wired through MAIN_MENU_REQUESTED in pause overlay.
          if (classKey === 'mage') {
            this.codexService.recordTutorialCompleted(this.selectedClassId);
            GameSettingsStore.updateAccessibility({ tutorialCompleted: true });
          }
        }
        this.pendingPostTutorialClass = null;
        this.tutorialReplayRun = false;
        this.codexService.endRunTracking();
        this.hudManager?.setPauseTutorialMode(false);
        void this.openMainMenuScene();
      },
      onClassSelectRequested: () => {
        this.pendingPostTutorialClass = null;
        this.codexService.endRunTracking();
        this.hudManager?.setPauseTutorialMode(false);
        void this.openClassSelectScene(false);
      },
      onCodexProgressResetRequested: () => {
        this.codexService.resetProgression();
        GameSettingsStore.resetToDefaults();
        GameSettingsStore.updateAccessibility({ tutorialCompleted: false });
        try {
          localStorage.removeItem('achievements');
          localStorage.removeItem('runSave');
          localStorage.removeItem('daemon_dungeon_highscore');
        } catch {
          // ignore storage cleanup failures
        }
        try { sessionStorage.removeItem('daemonBootShown'); } catch { /* ignore */ }
        window.location.reload();
      },
      onPauseToggleRequested: () => {
        this.togglePause();
      },
    });

    this.eventBusUnsubscribers = bindings.bind();
  }

  private applyAudioSettings(settings: GameSettings): void {
    if (this.musicManager) {
      this.musicManager.setMusicVolume(settings.audio.music);
      this.musicManager.setMasterVolume(settings.audio.master);
    }
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

    // Apply wall occlusion setting immediately if gameplay is active.
    if (this.wallOcclusionManager) {
      this.wallOcclusionManager.setEnabled(!!settings.graphics.wallOcclusionTransparency);
    }

    if (!this.gameplayInitialized) return;
    if (preloadWindowChanged) {
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: this.getEffectivePreloadForwardRange(this.roomPreloadAheadCount),
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

  private async preloadMonsterSounds(): Promise<void> {
    if (!this.audioManager) return;
    const monsterSounds = [
      { id: 'sfx_bull_charge1', path: 'sfx/monsters/bull/bull_charge1.mp3' },
      { id: 'sfx_bull_dash1', path: 'sfx/monsters/bull/bull_dash1.mp3' },
      { id: 'sfx_bull_collision1', path: 'sfx/monsters/bull/bull_oncollision1.mp3' },
      { id: 'sfx_bull_dmgtaken', path: 'sfx/monsters/bull/bull_dmgtaken.mp3' },
      { id: 'sfx_jumper_jump1', path: 'sfx/monsters/jumper/jumper_jump1.mp3' },
      { id: 'sfx_jumper_land1', path: 'sfx/monsters/jumper/jumper_land1.mp3' },
      { id: 'sfx_jumper_dmg_taken1', path: 'sfx/monsters/jumper/jumper_dmg_taken1.mp3' },
      { id: 'sfx_jumper_onhit1', path: 'sfx/monsters/jumper/jumper_onhit1.mp3' },
      { id: 'sfx_pong_flying_close1', path: 'sfx/monsters/pong/flying_close1.mp3' },
      { id: 'sfx_pong_wall_bounce1', path: 'sfx/monsters/pong/wall_bounce1.mp3' },
      { id: 'sfx_pong_onhit', path: 'sfx/monsters/pong/pong_onhit.mp3' },
      { id: 'sfx_pong_damagedealt', path: 'sfx/monsters/pong/pong_damagedealt.mp3' },
      { id: 'sfx_pong_ondeath', path: 'sfx/monsters/pong/pong_ondeath.mp3' },
      { id: 'sfx_zombie_damage_taken1', path: 'sfx/monsters/zombie/damage_taken1.mp3' },
      { id: 'sfx_zombie_death_sound1', path: 'sfx/monsters/zombie/death_sound1.mp3' },
      { id: 'sfx_zombie_onhit1', path: 'sfx/monsters/zombie/on_hit1.mp3' },
      { id: 'sfx_zombie_onhit2', path: 'sfx/monsters/zombie/on_hit2.mp3' },
      { id: 'sfx_zombie_onhit3', path: 'sfx/monsters/zombie/on_hit3.mp3' },
      { id: 'sfx_artificier_shot_split1', path: 'sfx/monsters/sentries/artificier/shot_split1.mp3' },
      { id: 'sfx_artificier_splash_zone_hum1', path: 'sfx/monsters/sentries/artificier/splash_zone_hum1.mp3' },
      { id: 'sfx_artificier_splash_zone_hum2', path: 'sfx/monsters/sentries/artificier/splash_zone_hum2.mp3' },
      { id: 'sfx_artificier_zone_dmg', path: 'sfx/monsters/sentries/artificier/artificer_zone_dmg.mp3' },
      { id: 'sfx_healer_heal_beam1', path: 'sfx/monsters/sentries/healer/heal_beam1.mp3' },
      { id: 'sfx_healer_heal_beam2', path: 'sfx/monsters/sentries/healer/heal_beam2.mp3' },
      { id: 'sfx_rocket_sentry_launched1', path: 'sfx/monsters/sentries/rocket_sentry/rocket_launched1.mp3' },
      { id: 'sfx_rocket_sentry_explode', path: 'sfx/monsters/sentries/rocket_sentry/rocket_explode.mp3' },
      { id: 'sfx_necromancer_spawn', path: 'sfx/monsters/sentries/necromancer/necromancer_spawn.mp3' },
      { id: 'sfx_sentry_projectile_flying1', path: 'sfx/monsters/sentries/projectile_flying1.mp3' },
      { id: 'sfx_sentry_shots_fired1', path: 'sfx/monsters/sentries/shots_fired1.mp3' },
      { id: 'sfx_sentry_onhit_sntry', path: 'sfx/monsters/sentries/onhit_sntry.mp3' },
      { id: 'sfx_sentry_damage_taken', path: 'sfx/monsters/sentries/sentry_damage_taken.mp3' },
      { id: 'sfx_sentry_ondeath', path: 'sfx/monsters/sentries/sentry_ondeath.mp3' },
      { id: 'sfx_player_cast1', path: 'sfx/attack/floraphonic-fireball-whoosh-1-179125.mp3' },
      { id: 'sfx_player_cast2', path: 'sfx/attack/freesound_community-8-bit-fireball-81148.mp3' },
    ];
    await Promise.all(
      monsterSounds.map((sound) =>
        this.audioManager!.loadSound(sound.id, sound.path, { autoplay: false }).catch(() => null),
      ),
    );
  }

  private async preloadUISounds(): Promise<void> {
    if (!this.audioManager) return;
    const uiSounds = [
      { id: 'sfx_ui_select1', path: 'sfx/ui/select1.mp3' },
      { id: 'sfx_ui_deselect', path: 'sfx/ui/deselect.mp3' },
      { id: 'sfx_ui_start_game', path: 'sfx/ui/start_game.mp3' },
      { id: 'sfx_ui_next_room', path: 'sfx/ui/next_room.mp3' },
      { id: 'sfx_ui_game_over', path: 'sfx/ui/game_over1.mp3' },
    ];
    await Promise.all(
      uiSounds.map((sound) =>
        this.audioManager!.loadSound(sound.id, sound.path, { autoplay: false }).catch(() => null),
      ),
    );
  }

  private bindUISoundEvents(): void {
    if (!this.audioManager) return;
    this.audioManager.setDefaultSoundCooldownMs(24);
    this.audioManager.setSoundCooldownMs('sfx_zombie_onhit1', 70);
    this.audioManager.setSoundCooldownMs('sfx_zombie_onhit2', 70);
    this.audioManager.setSoundCooldownMs('sfx_zombie_onhit3', 70);
    this.audioManager.setSoundCooldownMs('sfx_sentry_onhit_sntry', 55);
    this.audioManager.setSoundCooldownMs('sfx_zombie_damage_taken1', 55);
    this.audioManager.setSoundCooldownMs('sfx_jumper_dmg_taken1', 55);
    this.audioManager.setSoundCooldownMs('sfx_bull_dmgtaken', 55);
    this.audioManager.setSoundCooldownMs('sfx_pong_onhit', 45);
    this.audioManager.setSoundCooldownMs('sfx_artificier_zone_dmg', 120);
    this.audioManager.setSoundCooldownMs('sfx_player_cast1', 45);
    this.audioManager.setSoundCooldownMs('sfx_player_cast2', 45);
    this.eventBus.on(GameEvents.UI_SOUND_SELECT, () => this.audioManager?.playSound('sfx_ui_select1', 0.8));
    this.eventBus.on(GameEvents.UI_SOUND_DESELECT, () => this.audioManager?.playSound('sfx_ui_deselect', 0.8));
    this.eventBus.on(GameEvents.UI_SOUND_START_GAME, () => this.audioManager?.playSound('sfx_ui_start_game', 0.8));
    this.eventBus.on(GameEvents.UI_SOUND_NEXT_ROOM, () => this.audioManager?.playSound('sfx_ui_next_room', 0.8));
    this.eventBus.on(GameEvents.UI_SOUND_GAME_OVER, () => this.audioManager?.playSound('sfx_ui_game_over', 0.9));
  }

  private bindMonsterSoundEvents(): void {
    if (!this.audioManager) return;

    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data: any) => {
      if (!this.audioManager) return;
      if (data?.sfxSuppressed === true) return;
      const enemyType = data?.enemyType as string;
      if (!enemyType) return;
      const soundMap: Record<string, string> = {
        zombie: 'sfx_zombie_damage_taken1',
        zombie_basic: 'sfx_zombie_damage_taken1',
        zombie_fast: 'sfx_zombie_damage_taken1',
        zombie_basic_void: 'sfx_zombie_damage_taken1',
        fuyard: 'sfx_zombie_damage_taken1',
        strategist: 'sfx_zombie_damage_taken1',
        spike_strategist: 'sfx_zombie_damage_taken1',
        spike_strategist_boss: 'sfx_zombie_damage_taken1',
        jumper: 'sfx_jumper_dmg_taken1',
        jumper_boss: 'sfx_jumper_dmg_taken1',
        bull: 'sfx_bull_dmgtaken',
        bull_boss: 'sfx_bull_dmgtaken',
        pong: 'sfx_pong_onhit',
        pong_boss: 'sfx_pong_onhit',
        turret: 'sfx_sentry_damage_taken',
        shooter: 'sfx_sentry_damage_taken',
        sentinel: 'sfx_sentry_damage_taken',
        prefire_sentinel: 'sfx_sentry_damage_taken',
        healer: 'sfx_sentry_damage_taken',
        artificer: 'sfx_sentry_damage_taken',
        artificier: 'sfx_sentry_damage_taken',
        rocket_sentry: 'sfx_sentry_damage_taken',
        swarm_coordinator: 'sfx_sentry_damage_taken',
        necromancer_boss: 'sfx_sentry_damage_taken',
        necromancer: 'sfx_sentry_damage_taken',
        laser_patterns: 'sfx_sentry_damage_taken',
        laser_pattern_boss: 'sfx_sentry_damage_taken',
        mage_missile: 'sfx_sentry_damage_taken',
        bullet_hell: 'sfx_sentry_damage_taken',
      };
      const sound = soundMap[enemyType];
      if (sound) this.audioManager.playSoundAt(sound, data?.position ?? Vector3.Zero(), 0.7);
    });

    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data: any) => {
      const enemyType = data?.enemyType as string | undefined;
      if (enemyType === 'artificer' || enemyType === 'artificier') this.aliveArtificierCount += 1;
    });
    this.eventBus.on(GameEvents.ENEMY_DIED, (data: any) => {
      const enemyType = data?.enemyType as string | undefined;
      if (enemyType === 'artificer' || enemyType === 'artificier') {
        this.aliveArtificierCount = Math.max(0, this.aliveArtificierCount - 1);
        if (this.aliveArtificierCount === 0) {
          this.activeArtificierZoneIds.clear();
          this.activeArtificierProjectilesInFlight = 0;
          this.audioManager?.stopSound('sfx_artificier_splash_zone_hum1');
          this.audioManager?.stopSound('sfx_sentry_projectile_flying1');
        }
      }

      const soundMap: Record<string, string> = {
        zombie: 'sfx_zombie_death_sound1',
        zombie_basic: 'sfx_zombie_death_sound1',
        zombie_fast: 'sfx_zombie_death_sound1',
        zombie_basic_void: 'sfx_zombie_death_sound1',
        fuyard: 'sfx_zombie_death_sound1',
        strategist: 'sfx_zombie_death_sound1',
        spike_strategist: 'sfx_zombie_death_sound1',
        spike_strategist_boss: 'sfx_zombie_death_sound1',
        bull: 'sfx_bull_dash1',
        bull_boss: 'sfx_bull_dash1',
        jumper: 'sfx_jumper_dmg_taken1',
        jumper_boss: 'sfx_jumper_dmg_taken1',
        pong: 'sfx_pong_ondeath',
        pong_boss: 'sfx_pong_ondeath',
        turret: 'sfx_sentry_ondeath',
        shooter: 'sfx_sentry_ondeath',
        sentinel: 'sfx_sentry_ondeath',
        prefire_sentinel: 'sfx_sentry_ondeath',
        healer: 'sfx_sentry_ondeath',
        artificer: 'sfx_sentry_ondeath',
        artificier: 'sfx_sentry_ondeath',
        rocket_sentry: 'sfx_sentry_ondeath',
        swarm_coordinator: 'sfx_sentry_ondeath',
        necromancer_boss: 'sfx_sentry_ondeath',
        necromancer: 'sfx_sentry_ondeath',
        laser_patterns: 'sfx_sentry_ondeath',
        laser_pattern_boss: 'sfx_sentry_ondeath',
        mage_missile: 'sfx_sentry_ondeath',
        bullet_hell: 'sfx_sentry_ondeath',
      };
      const deathSound = soundMap[enemyType ?? ''];
      if (deathSound) {
        this.audioManager?.playSoundAt(deathSound, data?.position ?? Vector3.Zero(), 0.8);
      }
    });

    this.eventBus.on(GameEvents.ENEMY_BULL_AUDIO_CUE, (data: any) => {
      const cue = data?.cue as string | undefined;
      const position = data?.position || Vector3.Zero();
      const sound = cue === 'aim' ? 'sfx_bull_charge1' : cue === 'dash' ? 'sfx_bull_dash1' : cue === 'collision' ? 'sfx_bull_collision1' : '';
      if (sound) this.audioManager?.playSoundAt(sound, position, 0.8);
    });
    this.eventBus.on(GameEvents.ENEMY_JUMPER_AUDIO_CUE, (data: any) => {
      const cue = data?.cue as string | undefined;
      const position = data?.position || Vector3.Zero();
      const sound = cue === 'jump' ? 'sfx_jumper_jump1' : cue === 'land' ? 'sfx_jumper_land1' : '';
      if (sound) this.audioManager?.playSoundAt(sound, position, 0.8);
    });
    this.eventBus.on(GameEvents.ENEMY_PONG_AUDIO_CUE, (data: any) => {
      const cue = data?.cue as string | undefined;
      const position = data?.position || Vector3.Zero();
      const sound = cue === 'bounce' ? 'sfx_pong_wall_bounce1' : cue === 'flyby' ? 'sfx_pong_flying_close1' : '';
      if (sound) this.audioManager?.playSoundAt(sound, position, 0.8);
    });
    this.eventBus.on(GameEvents.ENEMY_PONG_CORNER_HIT, () => {
      this.codexService.completeAchievement('pong_corner_hit');
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_SPLIT_IMPACT, (data: any) => {
      this.audioManager?.playSoundAt('sfx_artificier_shot_split1', data?.position ?? Vector3.Zero(), 0.85);
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_SHOT_FIRED, (data: any) => {
      this.audioManager?.playSoundAt('sfx_sentry_shots_fired1', data?.position ?? Vector3.Zero(), 0.85);
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_PROJECTILE_FLIGHT_STARTED, (data: any) => {
      this.activeArtificierProjectilesInFlight += 1;
      if (this.activeArtificierProjectilesInFlight === 1) {
        this.audioManager?.playSoundAt('sfx_sentry_projectile_flying1', data?.position ?? Vector3.Zero(), 0.5);
      }
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_PROJECTILE_FLIGHT_ENDED, () => {
      this.activeArtificierProjectilesInFlight = Math.max(0, this.activeArtificierProjectilesInFlight - 1);
      if (this.activeArtificierProjectilesInFlight === 0) {
        this.audioManager?.fadeOutAndStopSound('sfx_sentry_projectile_flying1', 120);
      }
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_DOT_ZONE_STARTED, (data: any) => {
      const zoneId = data?.zoneId as number | undefined;
      if (typeof zoneId === 'number') this.activeArtificierZoneIds.add(zoneId);
      if (this.activeArtificierZoneIds.size === 1) {
        this.audioManager?.playSoundAt('sfx_artificier_splash_zone_hum1', data?.position ?? Vector3.Zero(), 0.55);
      }
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_DOT_ZONE_ENDED, (data: any) => {
      const zoneId = data?.zoneId as number | undefined;
      if (typeof zoneId === 'number') this.activeArtificierZoneIds.delete(zoneId);
      else this.activeArtificierZoneIds.clear();
      if (this.activeArtificierZoneIds.size === 0) this.audioManager?.stopSound('sfx_artificier_splash_zone_hum1');
    });
    this.eventBus.on(GameEvents.ENEMY_ARTIFICIER_ZONE_DAMAGE_TICK, (data: any) => {
      const now = Date.now();
      if (now - this.lastArtificierZoneDamageSfxAtMs < 180) return;
      this.lastArtificierZoneDamageSfxAtMs = now;
      this.audioManager?.playSoundAt('sfx_artificier_zone_dmg', data?.position ?? Vector3.Zero(), 0.65);
    });
    this.eventBus.on(GameEvents.ENEMY_HEALER_HEAL_CAST, (data: any) => {
      const position = data?.targetPosition || data?.casterPosition || Vector3.Zero();
      this.audioManager?.playSoundAt('sfx_healer_heal_beam1', position, 0.8);
    });
    this.eventBus.on(GameEvents.ENEMY_ROCKET_SENTRY_FIRED, (data: any) => {
      this.audioManager?.playSoundAt('sfx_rocket_sentry_launched1', data?.position ?? Vector3.Zero(), 0.85);
    });
    this.eventBus.on(GameEvents.ENEMY_ROCKET_SENTRY_IMPACT, (data: any) => {
      this.audioManager?.playSoundAt('sfx_rocket_sentry_explode', data?.position ?? Vector3.Zero(), 0.9);
    });
    this.eventBus.on(GameEvents.ENEMY_SENTRY_SHOOTER_FIRED, (data: any) => {
      this.audioManager?.playSoundAt('sfx_sentry_shots_fired1', data?.position ?? Vector3.Zero(), 0.8);
    });
    this.eventBus.on(GameEvents.ENEMY_SENTRY_SHOOTER_PROJECTILE_FLIGHT_STARTED, (data: any) => {
      this.activeSentryShooterProjectilesInFlight += 1;
      if (this.activeSentryShooterProjectilesInFlight === 1) {
        this.audioManager?.playSoundAt('sfx_sentry_projectile_flying1', data?.position ?? Vector3.Zero(), 0.45);
      }
    });
    this.eventBus.on(GameEvents.ENEMY_SENTRY_SHOOTER_PROJECTILE_FLIGHT_ENDED, () => {
      this.activeSentryShooterProjectilesInFlight = Math.max(0, this.activeSentryShooterProjectilesInFlight - 1);
      if (this.activeSentryShooterProjectilesInFlight === 0) {
        this.audioManager?.fadeOutAndStopSound('sfx_sentry_projectile_flying1', 120);
      }
    });
    this.eventBus.on(GameEvents.ENEMY_SENTRY_SHOOTER_ONHIT_PLAYER, (data: any) => {
      this.audioManager?.playSoundAt('sfx_sentry_onhit_sntry', data?.position ?? Vector3.Zero(), 0.8);
    });
    this.eventBus.on(GameEvents.ENEMY_NECROMANCER_SUMMON, (data: any) => {
      this.audioManager?.playSoundAt('sfx_necromancer_spawn', data?.position ?? Vector3.Zero(), 0.8);
    });
    this.eventBus.on(GameEvents.PROJECTILE_HIT, (data: any) => {
      if (!this.audioManager) return;
      if (data?.target !== 'player') return;
      const projectileType = data?.projectile?.data?.projectileType as string | undefined;
      const position = data?.projectile?.data?.position ?? this.playerController?.getPosition?.() ?? Vector3.Zero();
      if (projectileType === 'rocket_sentry') {
        this.tryPlayPlayerDamageSfx('projectile', 'sfx_rocket_sentry_explode', position, 0.9);
        return;
      }
      if (projectileType && ['sentinel', 'prefire_sentinel', 'swarm_coordinator', 'turret', 'necromancer', 'bullet_hell'].includes(projectileType)) {
        this.tryPlayPlayerDamageSfx('projectile', 'sfx_sentry_onhit_sntry', position, 0.8);
      }
    });
  }

  private handleAttackPerformedEvent(data: AttackPerformedPayload): void {
    if (!this.gameplayInitialized) return;
    if (this.gameState !== 'playing') return;

    if (data?.type === 'melee' && data?.attacker) {
      const rawDamage = data.damage || 0;
      const attackerType = data.attackerType as string;
      if (data.attackerType) {
        this.lastAttackerType = data.attackerType;
      }
      if (attackerType && this.audioManager && data.attacker !== 'player') {
        this.playMonsterAttackSound(attackerType);
      }
      const finalDamage = this.resolveIncomingMeleeDamage(rawDamage, data.attacker);
      if (finalDamage > 0) {
        this.playerController.applyDamage(finalDamage);
        if (attackerType && this.audioManager && attackerType.includes('pong')) {
          this.tryPlayPlayerDamageSfx('melee', 'sfx_pong_damagedealt', this.playerController?.getPosition?.() || Vector3.Zero(), 0.75);
        }
      }
    }

    if (data?.attacker === 'player' && this.audioManager) {
      const type = String(data?.type ?? '');
      const playerPos = this.playerController?.getPosition?.() || Vector3.Zero();
      if (type === 'projectile') {
        const castSound = Math.random() < 0.5 ? 'sfx_player_cast1' : 'sfx_player_cast2';
        this.audioManager.playSoundAt(castSound, playerPos, 0.72);
      } else if (type === 'secondary_burst') {
        this.audioManager.playSoundAt('sfx_player_cast1', playerPos, 0.8);
      } else if (type === 'ultimate') {
        this.audioManager.playSoundAt('sfx_player_cast2', playerPos, 0.95);
      } else if (type === 'melee' || type === 'tank_sweep' || type === 'tank_shield_bash') {
        this.audioManager.playSoundAt('sfx_player_cast1', playerPos, 0.65);
      }
    }

    if (data?.attacker === 'player') {
      // Legacy trigger removed - now handled in DaemonVoicelineManager
    } else if (data?.type === 'melee' && data?.attackerType && this.audioManager) {
      const attackerType = data.attackerType as string;
      if (attackerType.includes('pong')) {
        const estimatedDamage = Number(data?.damage ?? 0);
        if (estimatedDamage > 0 && !this.playerController.isCatGodModeActive()) {
          this.tryPlayPlayerDamageSfx('melee', 'sfx_pong_damagedealt', this.playerController?.getPosition?.() || Vector3.Zero(), 0.75);
        }
      }
    }
    this.resetDaemonIdleTimer();
  }

  private tryPlayPlayerDamageSfx(
    channel: 'melee' | 'projectile' | 'dot',
    soundId: string,
    position: Vector3,
    volume: number,
  ): void {
    if (!this.audioManager) return;
    const now = Date.now();
    const cooldownMs =
      channel === 'melee' ? 140 :
      channel === 'projectile' ? 120 :
      180;
    const lastAt = this.playerDamageSfxLastAtMs.get(channel) ?? 0;
    if (now - lastAt < cooldownMs) return;
    this.playerDamageSfxLastAtMs.set(channel, now);
    this.audioManager.playSoundAt(soundId, position, volume);
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

  private playMonsterAttackSound(attackerType: string): void {
    if (!this.audioManager) return;
    const soundMap: Record<string, string[]> = {
      zombie: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      zombie_basic: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      zombie_fast: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      zombie_basic_void: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      fuyard: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      strategist: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      spike_strategist: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      spike_strategist_boss: ['sfx_zombie_onhit1', 'sfx_zombie_onhit2', 'sfx_zombie_onhit3'],
      bull: ['sfx_bull_collision1'],
      bull_boss: ['sfx_bull_collision1'],
      jumper: ['sfx_jumper_onhit1'],
      jumper_boss: ['sfx_jumper_onhit1'],
      pong: ['sfx_pong_onhit'],
      pong_boss: ['sfx_pong_onhit'],
      turret: ['sfx_sentry_onhit_sntry'],
      shooter: ['sfx_sentry_onhit_sntry'],
      sentinel: ['sfx_sentry_onhit_sntry'],
      prefire_sentinel: ['sfx_sentry_onhit_sntry'],
      swarm_coordinator: ['sfx_sentry_onhit_sntry'],
      necromancer: ['sfx_sentry_onhit_sntry'],
      necromancer_boss: ['sfx_sentry_onhit_sntry'],
      bullet_hell: ['sfx_sentry_onhit_sntry'],
      laser_pattern_boss: ['sfx_sentry_onhit_sntry'],
    };
    const sounds =
      soundMap[attackerType]
      || (attackerType?.includes('pong') ? ['sfx_pong_onhit'] : [])
      || (
        ['sentinel', 'prefire_sentinel', 'swarm_coordinator', 'turret', 'necromancer', 'bullet_hell'].includes(attackerType)
          ? ['sfx_sentry_onhit_sntry']
          : []
      );
    if (sounds.length <= 0) return;
    const randomSound = sounds[Math.floor(Math.random() * sounds.length)];
    this.audioManager.playSoundAt(randomSound, this.playerController?.getPosition?.() || Vector3.Zero(), 0.8);
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
    const prevState = this.gameState;
    this.gameState = nextState;
    this.stateMachine.transition(this.mapRuntimeStateToStateMachine(nextState));
    this.updateFogCurtain();
    this.updateAudioState(nextState, prevState);
  }

  private updateAudioState(nextState: RuntimeGameState, prevState: RuntimeGameState): void {
    if (!this.musicManager) return;
    const keepMuffledForTutorialPopup = this.tutorialPopupAudioMuffleActive;

    switch (nextState) {
      case 'playing':
        // Ensure music is playing and exit the muffled state
        this.musicManager.playTrack('bgm', { fadeInDuration: 0.8, restart: prevState === 'menu' || prevState === 'gameover' });
        this.musicManager.setLowPass(keepMuffledForTutorialPopup, 0.45);
        break;
      case 'bonus':
      case 'roomclear':
      case 'transition':
        // Muffle the audio for the selection/transition phase
        this.musicManager.setLowPass(true, 0.35);
        break;
      case 'menu':
      case 'gameover':
        this.musicManager.stop();
        break;
    }
  }

  private setTutorialPopupAudioMuffle(enabled: boolean): void {
    this.tutorialPopupAudioMuffleActive = enabled;
    if (!this.musicManager) return;

    if (enabled) {
      this.musicManager.setLowPass(true, 0.2);
      return;
    }

    const shouldStayMuffledByState =
      this.gameState === 'bonus'
      || this.gameState === 'roomclear'
      || this.gameState === 'transition';
    this.musicManager.setLowPass(shouldStayMuffledByState, 0.25);
  }


  private startGameLoop(): void {
    let lastTime = performance.now();

    this.engine.runRenderLoop(() => {
      const loopProfiler = this.benchmarkRunner ? createRuntimeFrameProfiler() : null;
      const currentTime = performance.now();
      const rawFrameMs = Math.max(0, currentTime - lastTime);
      // Clamp catastrophic stalls but preserve enough real delta for fixed-step catch-up.
      const frameDeltaSeconds = Math.min(rawFrameMs / 1000, 0.2);
      lastTime = currentTime;

      // Sync UI camera with main camera for correct HUD projection on UI_LAYER
      if (this.gameplayInitialized && this.scene) {
        const sc = this.scene as any;
        if (sc.mainCamera && sc.uiCamera) {
          sc.uiCamera.position.copyFrom(sc.mainCamera.position);
          sc.uiCamera.setTarget(sc.mainCamera.target);
        }
      }

      const activeCombatPressure =
        this.gameplayInitialized &&
        this.gameState === 'playing' &&
        (
          (this.enemySpawner?.getEnemies()?.length ?? 0) > 0 ||
          (this.enemySpawner?.getPendingSpawnCount?.() ?? 0) > 0 ||
          (this.projectileManager?.getActiveProjectiles?.().length ?? 0) > 0 ||
          (this.ultimateManager?.getActiveZones?.().length ?? 0) > 0
        );
      const allowDeferredRoomLoads =
        !this.gameplayInitialized ||
        this.gameState === 'transition';
      const allowDeferredStreamingMaintenance =
        this.gameState === 'transition' ||
        (!activeCombatPressure && this.gameState === 'roomclear');
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
          : this.gameState === 'transition'
            ? 1.8
            : this.gameState === 'roomclear' || this.gameState === 'bonus'
              ? 0.45
              : this.gameState === 'playing'
                ? 0.35
              : 0.8;

      if (!this.isPaused) {
        this.time.update(frameDeltaSeconds);
      }
      loopProfiler?.mark('timeUpdate');

      if (this.classSelectScene && this.scene === this.classSelectScene.getScene()) {
        this.classSelectScene.update(frameDeltaSeconds);
        loopProfiler?.mark('classSelectUpdate');
      }

      this.updateCameraTransition(frameDeltaSeconds);
      loopProfiler?.mark('cameraTransitionUpdate');
      this.updateFogCurtain();
      loopProfiler?.mark('fogCurtainUpdate');

      let shouldSkipRender = false;

      if (this.gameplayInitialized && this.gameState === 'playing') {
        // Escape logic moved to global listener for better reliability and focus handling
      }

      if (this.gameplayInitialized && this.gameState === 'playing') {
        if (this.isPaused || this.isCountingDown) {
          shouldSkipRender = this.updatePlayingFrame(0);
        } else {
          this.gameplayStepAccumulator += frameDeltaSeconds;
          const fixedDt = this.gameplayFixedStepSeconds;
          const maxSteps = this.gameplayMaxSubstepsPerFrame;
          let steps = 0;
          while (this.gameplayStepAccumulator >= fixedDt && steps < maxSteps) {
            const playerIsMoving = this.playerController?.getIsMoving() ?? false;
            this.daemonVoicelineManager?.update(fixedDt, playerIsMoving);
            this.daemonVoicelineManager?.setDaemonActive(this.hudManager.isDaemonMessageActive());
            shouldSkipRender = this.updatePlayingFrame(fixedDt) || shouldSkipRender;
            this.gameplayStepAccumulator -= fixedDt;
            steps++;
          }
          // If we can't keep up, drop extra sim backlog to avoid spiral-of-death stalls.
          if (steps >= maxSteps && this.gameplayStepAccumulator > fixedDt * 2) {
            this.gameplayStepAccumulator = fixedDt * 2;
          }
        }
        loopProfiler?.mark('playingUpdate');
      } else if (this.gameplayInitialized) {
        this.gameplayStepAccumulator = 0;
        this.updateNonPlayingFrame(frameDeltaSeconds);
        loopProfiler?.mark('nonPlayingUpdate');
      }

      if (this.benchmarkRunner) {
        this.roomStreamingManager?.pumpDeferredWork(deferredStreamingBudgetMs, {
          allowRoomLoads: allowDeferredRoomLoads,
          allowTilePreloads: allowDeferredStreamingMaintenance,
          allowUnloads: allowDeferredUnloads,
        });
        loopProfiler?.mark('roomStreamingDeferred');
        
        this.updateAutoplayBenchmark(frameDeltaSeconds);

        this.benchmarkRunner.update(frameDeltaSeconds, rawFrameMs);
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
    this.applyDebugCheatTick(deltaTime);
    this.pumpBackgroundRoomPreparation(deltaTime);
    this.pumpPrimedRoomPreparation();
    this.roomElapsedSeconds += deltaTime;
    const profiler = this.benchmarkRunner ? createRuntimeFrameProfiler() : null;
    const shouldSkipRender = this.runtimeOrchestrator.updatePlayingFrame(this.createRuntimeFrameContext(), deltaTime, profiler);
    const moveSpeed = this.playerController?.getMoveSpeed?.() ?? 0;
    const fireRate = this.playerController?.getCurrentFireRate?.() ?? 0;
    const attackSpeed = fireRate > 0 ? 1 / fireRate : 0;
    this.codexService.recordCombatSnapshot(moveSpeed, attackSpeed);
    this.lastBenchmarkFrameProfile = profiler ? profiler.finish() : null;

    // Wall occlusion transparency — update after player update to get fresh position.
    if (this.wallOcclusionManager?.isEnabled()) {
      const camera = (this.scene as any)?.mainCamera ?? this.scene?.activeCamera;
      if (camera) {
        const wallMeshes = this.roomManager.getCurrentRoomWallMeshes();
        const playerPos = this.playerController.getPosition();
        this.wallOcclusionManager.update(deltaTime, wallMeshes, playerPos, camera.globalPosition);
      }
    }

    return shouldSkipRender;
  }

  private applyDebugCheatTick(deltaTime: number): void {
    const debugConfig = this.configLoader.getGameplayConfig()?.debugConfig;
    if (!debugConfig || !this.gameplayInitialized) return;

    if (debugConfig.infiniteCredits) {
      const currency = this.runEconomy.getCurrency();
      if (currency < 999999) {
        this.runEconomy.addCurrency(999999 - currency);
        this.hudManager.updateCurrency(this.runEconomy.getCurrency());
      }
    }

    if (!debugConfig.fastCleanRoom || this.gameState !== 'playing' || this.roomCleared) {
      this.fastCleanRoomAccumulator = 0;
      this.fastCleanRoomLastIndex = this.currentRoomIndex;
      return;
    }

    if (this.fastCleanRoomLastIndex !== this.currentRoomIndex) {
      this.fastCleanRoomAccumulator = 0;
      this.fastCleanRoomLastIndex = this.currentRoomIndex;
    }

    const enemies = this.enemySpawner.getEnemies();
    const hasActiveEnemies = enemies.length > 0;
    const aiReady =
      hasActiveEnemies
      && !this.enemySpawner.hasPendingSpawns()
      && this.enemySpawner.getSuppressedActivationQueueCount() === 0
      && !this.enemySpawner.hasAnyEnemyMaterializing();

    if (!aiReady) {
      this.fastCleanRoomAccumulator = 0;
      return;
    }

    this.fastCleanRoomAccumulator += Math.max(0, deltaTime);
    if (this.fastCleanRoomAccumulator < 3) {
      return;
    }
    this.fastCleanRoomAccumulator = 0;

    for (const enemy of enemies) {
      if (enemy.isActive()) {
        enemy.takeDamage(1000000);
      }
    }

    if (this.gameState === 'playing') {
      this.roomCleared = true;
      this.roomManager.setDoorActive(true);
      void this.startDoorToBonusSequence();
    }
  }

  private updateNonPlayingFrame(deltaTime: number): void {
    if (this.isPaused) {
      return;
    }
    this.pumpInterRoomPreloadWork();
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

    const projectileStats = this.projectileManager?.getRuntimeLoadStats?.();
    const streamingStats = this.roomStreamingManager?.getDeferredQueueStats?.();
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
      projectileDeferredDisposals: projectileStats?.deferredMeshDisposals ?? 0,
      projectileDelayedExplosions: projectileStats?.delayedExplosions ?? 0,
      projectileAoeZones: projectileStats?.activeAoeZones ?? 0,
      projectileSplitTravels: projectileStats?.activeSplitTravels ?? 0,
      projectileParticleEffects: projectileStats?.particleEffects ?? 0,
      enemyDeferredDisposals: this.enemySpawner?.getDeferredDisposalQueueCount?.() ?? 0,
      streamingDeferredRoomLoads: streamingStats?.roomLoads ?? 0,
      streamingDeferredTilePreloads: streamingStats?.tilePreloads ?? 0,
      streamingDeferredUnloads: streamingStats?.unloads ?? 0,
      loadedRooms: this.roomManager?.getLoadedRoomKeys?.().length ?? 0,
      loadedFloors: this.tileFloorManager?.getLoadedRoomKeys?.().length ?? 0,
      meshes: this.scene?.meshes?.length ?? 0,
      materials: this.scene?.materials?.length ?? 0,
      textures: this.scene?.textures?.length ?? 0,
      usedHeapMB: this.getUsedHeapMemoryMB(),
      frameProfile,
    };
  }

  private updateAutoplayBenchmark(deltaTime: number): void {
    if (!this.gameplayInitialized || this.gameState !== 'playing') {
      return;
    }

    this.benchmarkRoomElapsedSeconds += deltaTime;
    const elapsed = this.benchmarkRoomElapsedSeconds;

    // Force player autoplay mode
    this.playerController.setAutoPlayMode(true);

    this.benchmarkDaemonTauntTimer += deltaTime;
    if (this.benchmarkDaemonTauntTimer >= this.benchmarkDaemonTauntInterval) {
      this.benchmarkDaemonTauntTimer = 0;
      this.benchmarkDaemonTauntInterval = 12 + (Math.random() * 6);
      this.daemonVoicelineManager?.forceTrigger('ambient');
    }

    const enemies = this.enemySpawner.getEnemies().filter(e => e.isActive());
    const playerPos = this.playerController.getPosition();
    const roomOrigin = this.roomManager.getPlayerSpawnPoint(this.roomOrder[this.currentRoomIndex]) || Vector3.Zero();

    // 1. Target & Aim
    let targetEnemy: any = null;
    let minDistance = Infinity;
    for (const enemy of enemies) {
      const dist = Vector3.Distance(playerPos, enemy.getPosition());
      if (dist < minDistance) {
        minDistance = dist;
        targetEnemy = enemy;
      }
    }

    let aimDir = new Vector3(0, 0, 1);
    if (targetEnemy) {
      aimDir = targetEnemy.getPosition().subtract(playerPos).normalize();
      aimDir.y = 0;
    }
    this.playerController.simulateAim(aimDir);

    // 2. Scripted Attacks (Mage style)
    let slot1Held = false;
    let slot1Pressed = false;
    let slot2Held = false;
    let isSpaceHeld = false;

    if (this.benchmarkAutoplayState === 'fighting') {
      // Shoot primary attack
      slot1Held = true;

      // Periodically trigger stance (hold slot 2) and trigger burst (slot 1 pressed)
      const secCycle = Math.floor(elapsed) % 4;
      if (secCycle === 2) {
        slot2Held = true;
        if ((elapsed * 10) % 10 < 2) {
          slot1Pressed = true;
        }
      }

      // Cast Ultimate when ready
      if (this.playerController.getUltChargePercentage() >= 1.0) {
        isSpaceHeld = true;
      }

      // Live and dynamic orbital movement around origin
      const moveTarget = roomOrigin.add(new Vector3(
        2.5 * Math.sin(elapsed * 1.8),
        0,
        2.5 * Math.cos(elapsed * 1.8)
      ));
      const moveDir = moveTarget.subtract(playerPos);
      if (moveDir.length() > 0.3) {
        this.playerController.simulateMove(moveDir.normalize(), deltaTime);
      } else {
        this.playerController.simulateMove(Vector3.Zero(), deltaTime);
      }

      // Progressive Damage / Killing enemies to wow the spectator
      this.benchmarkEnemyKillTimer += deltaTime;
      if (this.benchmarkEnemyKillTimer >= 0.8) {
        this.benchmarkEnemyKillTimer = 0;
        if (enemies.length > 0) {
          const randEnemy = enemies[Math.floor(Math.random() * enemies.length)];
          randEnemy.takeDamage(randEnemy.getHealth().getMaxHP() * 0.35);
        }
      }

      // Speed up if all enemies are already dead
      if (enemies.length === 0 && !this.enemySpawner.hasPendingSpawns()) {
        this.benchmarkAutoplayState = 'running_to_door';
        if (this.benchmarkRoomElapsedSeconds < 5.2) {
          this.benchmarkRoomElapsedSeconds = 5.2;
        }
      }

      // Clear the rest of the room at 5.0s (base duration is 7s)
      if (elapsed >= 5.0) {
        this.benchmarkAutoplayState = 'clearing';
      }
    }

    if (this.benchmarkAutoplayState === 'clearing') {
      enemies.forEach(enemy => {
        if (enemy.isActive()) {
          enemy.takeDamage(100000);
        }
      });
      this.benchmarkAutoplayState = 'running_to_door';
    }

    if (this.benchmarkAutoplayState === 'running_to_door') {
      const doorPos = this.roomManager.getDoorPosition();
      if (doorPos) {
        const toDoor = doorPos.subtract(playerPos);
        toDoor.y = 0;
        if (toDoor.length() > 0.8) {
          this.playerController.simulateMove(toDoor.normalize(), deltaTime);
        } else {
          this.playerController.simulateMove(Vector3.Zero(), deltaTime);
        }
      }

      // Force choices menu if we didn't touch or reach the sensor by 6.5s
      if (elapsed >= 6.5 && this.gameState === 'playing') {
        this.playerController.simulateMove(Vector3.Zero(), deltaTime);
        this.roomCleared = true;
        this.bonusSystemManager.openBonusChoices();
      }
    }

    // Apply simulated attack values
    this.playerController.simulateAttack(slot1Held, slot1Pressed, slot2Held, isSpaceHeld, deltaTime);
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
      detectAndStartPlayerVoidFall: () => this.detectAndStartPlayerVoidFall(),
      updatePlayerVoidFall: (frameDelta) => this.updatePlayerVoidFall(frameDelta),
      runTransitionVisualTick: (frameDelta) => {
        this.enemySpawner.updateSuppressedVisuals(
          frameDelta,
          this.playerController.getPosition(),
          this.roomManager,
          this.playerController.getVelocity(),
        );
      },
      applySecondaryEnemySlow: (enemies, center, radius, speedMultiplier) => this.applySecondaryEnemySlow(enemies, center, radius, speedMultiplier),
      resolveEntityCollisions: (enemies, frameDelta) => this.resolveEntityCollisions(enemies, frameDelta),
      applyHazardDamage: (frameDelta) => this.applyHazardDamage(frameDelta),
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
      },
      openBonusChoices: () => {
        void this.startDoorToBonusSequence();
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

  private resetDaemonIdleTimer(): void {
    // Legacy call removed - now handled in DaemonVoicelineManager.update
  }

  private isDaemonTestEnabled(): boolean {
    const gameplayConfig = this.configLoader.getGameplayConfig();
    return !!gameplayConfig?.debugConfig?.daemonVoicelineTest;
  }

  private dispose(): void {
    this.disposeRuntimeHooks();
    this.disposeGameplay();
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
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
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
      const inZone = Vector3.Distance(current, center) <= radius && enemy.isSlowable();

      if (enemy.getBehavior() === 'scripted_rail') {
        enemy.setRailSlowMultiplier(inZone ? clamped : 1, 0.12);
        continue;
      }

      if (!inZone) continue;
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

  private async playTutorialExitFx(): Promise<void> {
    if (!this.gameplayInitialized) return;
    const sequenceId = ++this.transitionSequenceId;
    this.transitionGameState('transition');
    this.hudManager.hideOverlays();
    this.playerController.setInputSuppressed(true);
    await this.waitForMs(140);
    if (!this.isSequenceCurrent(sequenceId)) return;
    await this.animatePlayerRelocationFx({
      fromVisibility: this.playerController.getRenderVisibility(),
      toVisibility: 0,
      fromYOffset: this.playerController.getExternalVerticalOffset(),
      toYOffset: 0.7,
      durationMs: 560,
    }, sequenceId);
  }

  private async startNewGame(): Promise<void> {
    if (this.gameplayStartInProgress) return;
    // Invalidate any pending async transition/bonus sequence from a previous state.
    this.resetTransientRunFlowState();
    this.disposeBenchmarkReportOverlay();
    this.stopBenchmarkRunner();
    this.gameplayStartInProgress = true;
    try {
      this.setLoadingOverlay(true, 'INITIALIZING RUN...', '0%');
      await this.waitForNextPaint(2);

      if (!this.gameplayInitialized) {
        await this.initializeGameplayScene();
      }

      if (this.hudManager && this.hudManager.preloadPromise) {
        this.setLoadingOverlay(true, 'PRELOADING 2D INTERFACE ASSETS...', '50%');
        await this.waitForNextPaint(1);
        await this.awaitPromiseWithTimeout(this.hudManager.preloadPromise, 1500);
      }

      this.setLoadingOverlay(true, 'PRELOADING DUNGEON CELLS...', '78%');
      await this.waitForNextPaint(1);

      this.prepareRunStateForStart();
      if (this.roomOrder.length === 0) {
        console.warn('[GameManager] Empty room order at run start, applying fallback room.');
        this.roomOrder = ['room_test_dummies'];
        this.currentRoomIndex = 0;
      }
      this.transitionGameState('transition');
      this.preloadRoomsAround(this.currentRoomIndex, this.currentRoomIndex, true);
      this.setLoadingOverlay(true, 'PRELOADING ENEMY MODEL CONTAINERS...', '90%');
      await this.waitForNextPaint(1);
      await this.awaitPromiseWithTimeout(this.enemySpawner.prewarmCoreEnemyModelsForRun(), 2200);
      this.loadRoomByIndex(this.currentRoomIndex);
      this.setLoadingOverlay(true, 'HANDSHAKE WITH DAEMON CORE...', '100%');
      await this.waitForNextPaint(1);
      await this.waitForMs(1000);
      this.enemySpawner.pauseSuppressedActivationQueue(true);
      this.enemySpawner.stageAllActiveEnemiesAsSuppressed();
      void this.runRoomIntroSequence(this.currentRoomIndex);
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

    // Force benchmark onto the normal pooled run pipeline.
    this.isTutorialRun = false;
    this.selectedClassId = 'mage';
    this.codexService.startRunTracking(this.selectedClassId);
    await this.startNewGame();
    this.startBenchmarkRun();
  }

  private startBenchmarkRun(): void {
    if (!this.gameplayInitialized) {
      return;
    }

    this.stopBenchmarkRunner();
    this.playerController.setBenchmarkInvulnerable(true);
    this.playerController.setAutoPlayMode(true);

    this.benchmarkRoomElapsedSeconds = 0;
    this.benchmarkAutoplayState = 'fighting';
    this.benchmarkEnemyKillTimer = 0;
    this.benchmarkDaemonTauntTimer = 0;
    this.benchmarkDaemonTauntInterval = 12 + (Math.random() * 6);

    this.benchmarkRunner = new GameBenchmarkRunner(this.eventBus, {
      isReadyForTransition: () => {
        return this.gameplayInitialized
          && this.gameState === 'playing'
          && this.roomCleared
          && !this.cameraMove;
      },
      requestNextRoomTransition: () => {
        // Autoplay path naturally reaches the door and drives transition.
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
          deferredDisposals: this.enemySpawner?.getDeferredDisposalQueueCount?.() ?? 0,
        };
      },
      sampleQueueStats: () => {
        const projectileStats = this.projectileManager?.getRuntimeLoadStats?.();
        const streamingStats = this.roomStreamingManager?.getDeferredQueueStats?.();
        return {
          projectileDeferredDisposals: projectileStats?.deferredMeshDisposals ?? 0,
          projectileDelayedExplosions: projectileStats?.delayedExplosions ?? 0,
          projectileAoeZones: projectileStats?.activeAoeZones ?? 0,
          projectileSplitTravels: projectileStats?.activeSplitTravels ?? 0,
          projectileParticleEffects: projectileStats?.particleEffects ?? 0,
          streamingDeferredRoomLoads: streamingStats?.roomLoads ?? 0,
          streamingDeferredTilePreloads: streamingStats?.tilePreloads ?? 0,
          streamingDeferredUnloads: streamingStats?.unloads ?? 0,
        };
      },
      sampleSpikeDiagnostic: (frameMs, elapsedMs) => this.sampleBenchmarkSpikeDiagnostic(frameMs, elapsedMs),
      copyToClipboard: async (text: string) => {
        return this.copyTextToClipboard(text);
      },
      onFinished: (result: BenchmarkRunResult) => {
        this.playerController.setBenchmarkInvulnerable(false);
        this.playerController.setAutoPlayMode(false);
        this.benchmarkRunner = null;
        if (this.showBenchmarkReportOnFinish) {
          this.showBenchmarkReportOverlay(result);
        } else {
          console.log("[Benchmark] Automated run complete! Summary details:");
          console.log(this.formatBenchmarkSummary(result));
        }
      },
    });

    this.benchmarkRunner.start({
      warmupSeconds: 1,
      transitionCount: 9,
      settleSeconds: 0.6,
      transitionStartTimeoutSeconds: 2.5,
      resourceSampleIntervalSeconds: 0.25,
      maxDurationSeconds: 480,
      spikeCaptureThresholdMs: 45,
      maxSpikeDiagnostics: 12,
    });
  }

  private stopBenchmarkRunner(): void {
    this.playerController?.setBenchmarkInvulnerable(false);
    this.playerController?.setAutoPlayMode(false);
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
    title.style.fontFamily = 'Arcade8Bit';
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
    summary.style.fontFamily = 'Arcade8Bit';
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
    reportPre.style.fontFamily = 'Arcade8Bit';
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
      `Enemy load peaks: active=${resources.maxActiveEnemies}, pendingSpawns=${resources.maxPendingSpawns}, prepared=${resources.maxPreparedEnemies}, activationQueue=${resources.maxSuppressedActivations}, deferredDisposals=${resources.maxEnemyDeferredDisposals}`,
      `Projectile queues: deferredDisposals=${resources.maxProjectileDeferredDisposals}, delayedExplosions=${resources.maxProjectileDelayedExplosions}, aoeZones=${resources.maxProjectileAoeZones}, splitTravels=${resources.maxProjectileSplitTravels}, particleFx=${resources.maxProjectileParticleEffects}`,
      `Streaming queues: roomLoads=${resources.maxStreamingDeferredRoomLoads}, tilePreloads=${resources.maxStreamingDeferredTilePreloads}, unloads=${resources.maxStreamingDeferredUnloads}`,
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

    return `Spike #${rank}: ${spike.frameMs.toFixed(2)} ms @ ${spike.roomId ?? 'unknown'} (idx ${spike.roomIndex}) state=${spike.gameState} enemies=${spike.activeEnemies} projectiles=${spike.activeProjectiles} ultZones=${spike.activeUltimateZones} pDefQ=${spike.projectileDeferredDisposals} pAoe=${spike.projectileAoeZones} pSplit=${spike.projectileSplitTravels} pExp=${spike.projectileDelayedExplosions} pFx=${spike.projectileParticleEffects} eDefQ=${spike.enemyDeferredDisposals} sRoomQ=${spike.streamingDeferredRoomLoads} sTileQ=${spike.streamingDeferredTilePreloads} sUnloadQ=${spike.streamingDeferredUnloads} rooms=${spike.loadedRooms} floors=${spike.loadedFloors} ${gapSummary} ${coverageSummary} ${categorySummary} | ${profileSummary}`;
  }

  private disposeBenchmarkReportOverlay(): void {
    if (!this.benchmarkReportOverlay) {
      return;
    }
    this.benchmarkReportOverlay.remove();
    this.benchmarkReportOverlay = null;
  }

  private generateProceduralRunOrder(): string[] {
    return this.generateRunRoomOrder(45); // 5 floors of 9 rooms (8 normal + 1 boss)
  }

  private prepareRunStateForStart(): void {
    if (this.isTutorialRun) {
      if (this.selectedClassId === 'mage') {
        if (this.tutorialReplayRun) {
          this.roomOrder = ['room_tutorial_02'];
        } else {
          this.roomOrder = [
            'room_tutorial_01',
            'room_tutorial_02',
            'room_tutorial_03'
          ];
        }
      } else {
        this.roomOrder = ['room_tutorial_02'];
      }
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
    this.scoreManager.reset();
    if (this.playerController) {
      this.playerController.resetBonuses();
      this.playerController.healToFull();
      this.playerController.setInputSuppressed(false);
      this.playerController.setMovementLocked(false);
    }
    this.roomElapsedSeconds = 0;
    this.resetPlayerVoidFallState();
    this.playerController.setRogueUltimateActive(false);
    this.playerController.setTankUltimateActive(false);
    this.hudManager.hideOverlays();
    this.hudManager.updateCurrency(this.runEconomy.getCurrency());
    this.hudManager.updateItemStatus(this.getConsumableStatusLabel());
    this.hudManager.setRunEquippedBonuses([]);
  }

  private resetTransientRunFlowState(): void {
    // Cancel all pending async flow paths from previous gameplay/menu/debug actions.
    this.transitionSequenceId++;
    this.roomIntroSequenceRunning = false;
    this.roomIntroSequencePendingIndex = null;
    this.interRoomPreloadPromise = null;
    this.interRoomPreloadTargetIndex = null;
    this.interRoomPreloadPrimedRoomKey = null;
    this.primedTransitionRoomKey = null;
    this.backgroundPreparationAccumulator = 0;
    this.benchmarkPreparationLastPumpMs = 0;
    this.gameplayStepAccumulator = 0;
    if (this.deferredRoomEnteredEventTimer !== null) {
      window.clearTimeout(this.deferredRoomEnteredEventTimer);
      this.deferredRoomEnteredEventTimer = null;
    }

    // If the previous flow left the player/enemy orchestration half-transitioned,
    // force a neutral baseline before bootstrapping a new run.
    this.enemySpawner?.pauseSuppressedActivationQueue(false);
    this.enemySpawner?.releaseAllSuppressedEnemyAI();
    this.playerController?.setInputSuppressed(false);
    this.playerController?.setMovementLocked(false);
    this.playerController?.setRenderVisibility(1);
    this.playerController?.setExternalVerticalOffset(0);
  }

  private generateRunRoomOrder(targetLength: number): string[] {
    const order: string[] = [];
    
    const facile = this.configLoader.getFacileRoomsConfig()?.map(r => r.id) || [];
    const inter = this.configLoader.getIntermediaireRoomsConfig()?.map(r => r.id) || [];
    const hard = this.configLoader.getDifficileRoomsConfig()?.map(r => r.id) || [];
    const extreme = this.configLoader.getExtremeRoomsConfig()?.map(r => r.id) || [];
    const bosses = this.configLoader.getBossRoomsConfig()?.map(r => r.id) || [];

    const allRooms = this.configLoader.getRoomsConfig()?.map(r => r.id) || ['room_test_dummies'];
    const safePick = (arr: string[]) => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : allRooms[Math.floor(Math.random() * allRooms.length)];

    let lastPicked = '';

    for (let i = 0; i < targetLength; i++) {
      if ((i + 1) % 9 === 0) {
        order.push(safePick(bosses));
        continue;
      }

      const floorIndex = Math.floor(i / 9);
      let pFacile = 0, pInter = 0, pHard = 0, pExtreme = 0;

      switch (floorIndex) {
        case 0:
          pFacile = 1.0;
          break;
        case 1:
          pFacile = 0.8; pInter = 0.2;
          break;
        case 2:
          pFacile = 0.2; pInter = 0.6; pHard = 0.2;
          break;
        case 3:
          pHard = 0.5; pExtreme = 0.5;
          break;
        default:
          pExtreme = 1.0;
          break;
      }

      const roll = Math.random();
      let pickedPool: string[] = [];
      
      if (roll < pFacile) pickedPool = facile;
      else if (roll < pFacile + pInter) pickedPool = inter;
      else if (roll < pFacile + pInter + pHard) pickedPool = hard;
      else pickedPool = extreme;

      if (pickedPool.length === 0) pickedPool = facile.length > 0 ? facile : allRooms;

      let pick = safePick(pickedPool);
      if (pick === lastPicked && pickedPool.length > 1) {
        let retries = 5;
        while (pick === lastPicked && retries > 0) {
          pick = safePick(pickedPool);
          retries--;
        }
      }

      order.push(pick);
      lastPicked = pick;
    }

    return order;
  }

  private recalculatePlayerStats(): void {
    if (!this.playerController || !this.bonusSystemManager) return;
    
    // Set scaling multiplier (+3% per room) only in standard runs.
    const roomScalingMultiplier = this.isTutorialRun ? 1 : (1 + this.currentRoomIndex * 0.03);
    this.playerController.setRoomScalingMultiplier(roomScalingMultiplier);
    
    // Reset bonuses back to base while preserving ultimate progression between rooms.
    this.playerController.resetBonuses(true);
    
    // Reapply all active bonuses to restore max HP and damage multipliers
    const activeBonuses = this.bonusSystemManager.getActiveBonuses();
    activeBonuses.forEach(bonus => {
      for (let i = 0; i < bonus.stacks; i++) {
        this.applyBonus(bonus.id);
      }
    });
    this.hudManager.setRunEquippedBonuses(activeBonuses);
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
    if (!roomId) {
      console.error(`[GameManager] Missing roomId for index ${index}. Aborting room load.`);
      this.transitionGameState('playing');
      this.playerController.setInputSuppressed(false);
      this.playerController.setMovementLocked(false);
      return;
    }
    const instanceKey = `${roomId}::${index}`;
    this.roomManager.setCurrentRoom(instanceKey);
    this.roomManager.setDoorActive(false);
    this.roomCleared = false;
    this.roomElapsedSeconds = 0;
    this.benchmarkRoomElapsedSeconds = 0;
    this.benchmarkAutoplayState = 'fighting';
    this.benchmarkEnemyKillTimer = 0;
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
      this.enemySpawner.clearForRoomTransition();
      this.enemySpawner.prewarmRoomEnemyData(roomId, index, { prewarmHeavyAssets: false });
      this.enemySpawner.spawnEnemiesForRoom(roomId, { deferInitialSpawns: this.gameState === 'transition' });
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

  private getEffectivePreloadForwardRange(requestedRange: number): number {
    const clampedRequested = Math.max(0, Math.round(requestedRange));
    // Keep benchmark representative while avoiding runaway memory/mesh growth.
    if (this.benchmarkRunner) {
      return Math.min(1, clampedRequested);
    }
    return clampedRequested;
  }

  private prewarmEnemyDataAround(preloadIndex: number, options?: RoomPreloadOptions): void {
    if (!this.gameplayInitialized) return;
    if (!this.enemySpawner) return;
    if (this.roomOrder.length === 0) return;

    const backwardRange = Math.max(0, options?.backwardRange ?? 1);
    const forwardRange = this.getEffectivePreloadForwardRange(options?.forwardRange ?? 1);
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

  private async startDoorToBonusSequence(): Promise<void> {
    if (!this.gameplayInitialized) return;
    if (this.gameState !== 'playing') return;
    const sequenceId = ++this.transitionSequenceId;
    this.transitionGameState('transition');
    this.hudManager.hideOverlays();
    this.hudManager.pushSystemLog('DOOR HANDSHAKE ACCEPTED. TRANSFER PIPELINE OPEN.');
    this.playerController.setInputSuppressed(true);
    await this.waitForMs(180);
    if (!this.isSequenceCurrent(sequenceId)) return;

    await this.animatePlayerRelocationFx({
      fromVisibility: this.playerController.getRenderVisibility(),
      toVisibility: 0,
      fromYOffset: this.playerController.getExternalVerticalOffset(),
      toYOffset: 0.55,
      durationMs: 520,
    }, sequenceId);
    if (!this.isSequenceCurrent(sequenceId)) return;

    if (this.isTutorialRun && this.currentRoomIndex === 0) {
      this.bonusSystemManager.forceNextChoices(['bonus_ms'], 'mage_autolock_patch');
      this.bonusSystemManager.enableTutorialShopScriptedFlow();
      this.eventBus.emit(GameEvents.TUTORIAL_SHOP_OPENED);
    }
    this.bonusSystemManager.openBonusChoices();
    this.eventBus.emit(GameEvents.UI_SOUND_NEXT_ROOM);

    // Shift heavy inter-room prep work into bonus phase (UI-open) instead of
    // doing it right before opening the menu in gameplay state.
    // Defer slightly so the UI can animate in smoothly without stuttering!
    const nextIndex = (this.currentRoomIndex + 1) % this.roomOrder.length;
    setTimeout(() => {
      this.beginInterRoomPreload(nextIndex);
    }, 600);
  }

  private async startRoomTransitionSequence(nextIndex: number): Promise<void> {
    if (!this.gameplayInitialized) return;
    this.hudManager.setBonusLoadingState(true);
    await this.waitForInterRoomPreload(nextIndex);
    if (!this.gameplayInitialized) return;
    const sequenceId = ++this.transitionSequenceId;
    this.roomIntroSequencePendingIndex = nextIndex;
    this.eventBus.emit(GameEvents.UI_SOUND_NEXT_ROOM);
    this.roomTransitionManager.startRoomTransition(nextIndex);
    if (!this.isSequenceCurrent(sequenceId)) return;
  }

  private beginInterRoomPreload(nextIndex: number): void {
    if (!this.gameplayInitialized || this.roomOrder.length === 0) {
      return;
    }
    if (this.interRoomPreloadTargetIndex === nextIndex && this.interRoomPreloadPromise) {
      return;
    }

    this.interRoomPreloadTargetIndex = nextIndex;
    this.interRoomPreloadPromise = this.runInterRoomPreload(nextIndex);
  }

  private async waitForInterRoomPreload(nextIndex: number): Promise<void> {
    if (!this.gameplayInitialized) {
      return;
    }
    if (this.interRoomPreloadTargetIndex !== nextIndex || !this.interRoomPreloadPromise) {
      this.beginInterRoomPreload(nextIndex);
    }
    const pending = this.interRoomPreloadPromise;
    if (!pending) {
      return;
    }
    try {
      await pending;
    } finally {
      if (this.interRoomPreloadPromise === pending) {
        this.interRoomPreloadPromise = null;
        this.interRoomPreloadTargetIndex = null;
      }
    }
  }

  private async runInterRoomPreload(nextIndex: number): Promise<void> {
    const roomId = this.roomOrder[nextIndex];
    if (!roomId) {
      return;
    }
    const roomKey = `${roomId}::${nextIndex}`;
    // Heavy prep work is intentionally pumped from the main frame loop in
    // non-playing states to avoid long async tasks outside profiler sections.
    if (this.interRoomPreloadPrimedRoomKey !== roomKey) {
      this.interRoomPreloadPrimedRoomKey = null;
    }

    const start = performance.now();
    const timeoutMs = 2400;
    while (this.gameplayInitialized) {
      const queueStats = this.roomStreamingManager?.getDeferredQueueStats?.();
      const queuesSettled =
        (queueStats?.roomLoads ?? 0) === 0 &&
        (queueStats?.tilePreloads ?? 0) === 0;
      const enemyPrepSettled = !this.enemySpawner.hasTransitionPreparationPending(roomKey);
      if (queuesSettled && enemyPrepSettled) {
        break;
      }
      if (performance.now() - start >= timeoutMs) {
        break;
      }
      await this.waitForNextPaint(1);
    }
  }

  private pumpInterRoomPreloadWork(): void {
    if (!this.gameplayInitialized || this.interRoomPreloadTargetIndex == null || this.roomOrder.length === 0) {
      return;
    }

    const targetIndex = this.interRoomPreloadTargetIndex;
    const roomId = this.roomOrder[targetIndex];
    if (!roomId) {
      return;
    }

    const roomKey = `${roomId}::${targetIndex}`;
    if (this.interRoomPreloadPrimedRoomKey !== roomKey) {
      this.preloadRoomsAround(targetIndex, this.currentRoomIndex, false, {
        backwardRange: 1,
        forwardRange: this.getEffectivePreloadForwardRange(this.roomPreloadAheadCount),
        allowUnload: false,
        deferFarTilePreloads: true,
      });

      if (!this.isTutorialRun && !this.enemySpawner.hasTransitionPreparationForRoom(roomKey)) {
        this.enemySpawner.beginTransitionRoomPreparation(roomId, roomKey, targetIndex);
      }

      this.interRoomPreloadPrimedRoomKey = roomKey;
    }

    if (this.enemySpawner.hasTransitionPreparationPending(roomKey)) {
      this.enemySpawner.pumpTransitionRoomPreparation(2);
    }
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
      this.enemySpawner.pumpTransitionRoomPreparation(3);
    }
  }

  private finishRoomTransition(nextIndex: number): void {
    // Reset wall occlusion state between rooms to avoid stale visibility values.
    this.wallOcclusionManager?.reset();
    this.currentRoomIndex = nextIndex;
    this.loadRoomByIndex(nextIndex, { preferPreparedEnemies: true });
    this.primedTransitionRoomKey = null;
    this.transitionGameState('transition');
    this.enemySpawner.pauseSuppressedActivationQueue(true);
    this.enemySpawner.stageAllActiveEnemiesAsSuppressed();
    this.roomIntroSequencePendingIndex = nextIndex;
    void this.runRoomIntroSequence(nextIndex);
    this.deferPostTransitionRoomMaintenance(nextIndex);
    this.eventBus.emit(GameEvents.ROOM_TRANSITION_END);
  }

  private async runRoomIntroSequence(roomIndex: number): Promise<void> {
    if (this.roomIntroSequenceRunning) {
      // Preempt stale intro flow and restart from current state.
      this.transitionSequenceId++;
      this.roomIntroSequenceRunning = false;
    }
    this.roomIntroSequenceRunning = true;
    const sequenceId = ++this.transitionSequenceId;
    try {
      this.hudManager.pushSystemLog('ROOM STREAM READY. RE-INJECTING HOST PROCESS.');
      const shouldRunHudBootstrap = roomIndex === 0;
      this.hudManager.triggerRunUiBootstrapSequence(shouldRunHudBootstrap);

      const spawnPoint = this.roomManager.getPlayerSpawnPoint(this.roomOrder[roomIndex]) || Vector3.Zero();
      this.playerController.setPosition(spawnPoint);
      this.playerController.setRenderVisibility(0);
      this.playerController.setExternalVerticalOffset(0.85);
      this.playerController.setInputSuppressed(true);
      this.playerController.resetFacingDirection();

      await this.animatePlayerRelocationFx({
        fromVisibility: 0,
        toVisibility: 1,
        fromYOffset: 0.85,
        toYOffset: 0,
        durationMs: 760,
      }, sequenceId);
      if (!this.isSequenceCurrent(sequenceId) || !this.gameplayInitialized || this.currentRoomIndex !== roomIndex) return;

      // Ensure EVERY enemy of the room exists before reveal/countdown orchestration.
      this.enemySpawner.materializePendingSpawnsAsSuppressed();
      this.enemySpawner.stageAllActiveEnemiesAsSuppressed();
      this.enemySpawner.configureSuppressedActivation({ intervalSeconds: 0.12, batchSize: 1 });
      const needsCountdownGate = !this.isTutorialRun && roomIndex === 0;
      this.enemySpawner.pauseSuppressedActivationQueue(true);
      this.enemySpawner.revealSuppressedEnemiesWithoutAIRelease();
      this.hudManager.pushSystemLog('THREAT PROCESSES MATERIALIZING. AI LOCK MAINTAINED.');
      await this.waitForEnemyRevealReady(sequenceId, roomIndex, 2200);
      if (!this.isSequenceCurrent(sequenceId) || !this.gameplayInitialized || this.currentRoomIndex !== roomIndex) return;

      if (needsCountdownGate && this.hudManager) {
        // Start gameplay BGM before the 3-2-1 countdown so audio kicks in
        // immediately at run launch, not only after countdown completes.
        if (this.musicManager) {
          this.musicManager.playTrack('bgm', { fadeInDuration: 0.8, restart: false });
          this.musicManager.setLowPass(false, 0.25);
        }
        this.isCountingDown = true;
        await new Promise<void>((resolve) => {
          this.hudManager.showCountdown(() => {
            this.isCountingDown = false;
            resolve();
          });
        });
      }
      this.enemySpawner.releaseAllSuppressedEnemyAI();
      this.enemySpawner.pauseSuppressedActivationQueue(false);

      if (!this.isSequenceCurrent(sequenceId) || !this.gameplayInitialized || this.currentRoomIndex !== roomIndex) return;
      this.transitionGameState('playing');
      this.playerController.setExternalVerticalOffset(0);
      this.playerController.setRenderVisibility(1);
      this.playerController.setInputSuppressed(false);
      this.hudManager.pushSystemLog('ROOM ONLINE. ENEMY AI UNLOCKED. COMBAT LOOP RESUMED.');
      this.roomIntroSequencePendingIndex = null;
    } finally {
      this.roomIntroSequenceRunning = false;
    }
  }

  private isSequenceCurrent(sequenceId: number): boolean {
    return this.transitionSequenceId === sequenceId;
  }

  private async animatePlayerRelocationFx(
    config: {
      fromVisibility: number;
      toVisibility: number;
      fromYOffset: number;
      toYOffset: number;
      durationMs: number;
    },
    sequenceId: number,
  ): Promise<void> {
    const durationMs = Math.max(1, Math.floor(config.durationMs));
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        if (!this.isSequenceCurrent(sequenceId) || !this.gameplayInitialized) {
          this.playerController.setTransitionOverlay(0);
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
          return;
        }
        const now = performance.now();
        const t = Math.max(0, Math.min(1, (now - start) / durationMs));
        const ease = t * t * (3 - 2 * t);
        const vis = config.fromVisibility + ((config.toVisibility - config.fromVisibility) * ease);
        const yOffset = config.fromYOffset + ((config.toYOffset - config.fromYOffset) * ease);
        const bluePhase = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
        this.playerController.setTransitionOverlay(0.88 * bluePhase, new Color3(0.38, 0.95, 1.0));
        this.playerController.setRenderVisibility(vis);
        this.playerController.setExternalVerticalOffset(yOffset);
        if (t >= 1) {
          this.playerController.setTransitionOverlay(0);
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  private async waitForEnemyRevealReady(
    sequenceId: number,
    roomIndex: number,
    timeoutMs: number,
  ): Promise<void> {
    const start = performance.now();
    while (true) {
      if (!this.isSequenceCurrent(sequenceId) || !this.gameplayInitialized || this.currentRoomIndex !== roomIndex) {
        return;
      }
      const noneMaterializing = !this.enemySpawner.hasAnyEnemyMaterializing();
      const noPendingSpawns = this.enemySpawner.getPendingSpawnCount() === 0;
      const hasEnemies = this.enemySpawner.getActiveEnemyCount() > 0;
      if (hasEnemies && noPendingSpawns && noneMaterializing) {
        return;
      }
      if ((performance.now() - start) >= timeoutMs) {
        return;
      }
      await this.waitForNextPaint(1);
    }
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
        forwardRange: this.getEffectivePreloadForwardRange(this.roomPreloadAheadCount),
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

    for (const plane of this.transitionFogPlanes) {
      if (!plane || plane.isDisposed()) {
        continue;
      }
      plane.isVisible = false;
    }
    for (const plane of this.transitionFogTopPlanes) {
      if (!plane || plane.isDisposed()) {
        continue;
      }
      plane.isVisible = false;
    }

    for (const material of this.transitionFogMaterials) {
      if (!material) {
        continue;
      }
      material.setFloat('uOpacity', 0);
      material.alpha = 0;
    }
    for (const material of this.transitionFogTopMaterials) {
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

    // Clamp nextIndex to the last room instead of wrapping to 0, so the curtain
    // keeps scrolling beyond the penultimate room rather than freezing.
    const nextIndex = Math.min(this.currentRoomIndex + 1, this.roomOrder.length - 1);
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
    const nextIndex = Math.min(this.currentRoomIndex + 1, this.roomOrder.length - 1);
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
      forwardRange: this.getEffectivePreloadForwardRange(this.roomPreloadAheadCount),
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
        forwardRange: this.getEffectivePreloadForwardRange(this.roomPreloadAheadCount),
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
        forwardRange: this.getEffectivePreloadForwardRange(this.roomPreloadAheadCount),
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

  public getDaemonVoicelineManager(): DaemonVoicelineManager {
    if (!this.daemonVoicelineManager) {
      throw new Error('DaemonVoicelineManager not initialized');
    }
    return this.daemonVoicelineManager;
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
  public togglePause(): void {
    if (this.gameState !== 'playing' && this.gameState !== 'bonus' && this.gameState !== 'transition' && this.gameState !== 'roomclear') return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.hudManager.showPauseMenu();
      if (this.musicManager) this.musicManager.setLowPass(true);
      if (this.hudManager) this.hudManager.setVoicelinesMuted(true);
    } else {
      this.hudManager.hidePauseMenu();
      if (this.musicManager) {
        const shouldStayMuffled =
          this.gameState === 'bonus'
          || this.gameState === 'roomclear'
          || this.gameState === 'transition';
        this.musicManager.setLowPass(shouldStayMuffled);
      }
      if (this.hudManager) this.hudManager.setVoicelinesMuted(false);
    }
  }


  private async updateDevConsoleVisibility(): Promise<void> {
    const settings = GameSettingsStore.get();
    const shouldBeVisible = settings.accessibility.devModeEnabled;

    if (shouldBeVisible && !this.devConsole) {
      const { DevConsole } = await import('../systems/DevConsole');
      this.devConsole = new DevConsole(this.scene, this);
      if (this.playerController) {
        this.devConsole.setPlayer(this.playerController);
      }
    } else if (!shouldBeVisible && this.devConsole) {
      this.devConsole.dispose();
      this.devConsole = null;
    }
  }
}
