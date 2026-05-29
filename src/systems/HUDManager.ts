/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Engine, Vector3, Vector2, TransformNode, AbstractMesh, Sound, PointerEventTypes } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Image, StackPanel, Checkbox, Ellipse } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';
import { SettingsMenuBuilder } from '../ui/SettingsMenuBuilder';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { UITheme } from '../ui/UITheme';
import { VoicelineConfig, AnimationPhase, getVoiceline } from '../data/voicelines/VoicelineDefinitions';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../data/voicelines/DaemonAnimationPresets';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { DaemonVoiceSynth } from '../audio/DaemonVoiceSynth';
import { GameSettingsStore, formatInputKeyLabel } from '../settings/GameSettings';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../gameplay/PlayerController';
import { buildHudAssetUrl, getHudAssetBaseUrl, preloadHudAsset, getCachedHudAsset } from './hud/HudAssetPaths';
import { DaemonAvatarController, type DaemonAnimationPhaseState } from './hud/DaemonAvatarController';
import { getSpecialMarkerAtDisplayIndex, stripAllSpecialMarkers } from './hud/DaemonTextUtils';
import { BONUS_CODEX_ENTRIES } from '../data/codex/bonuses';
import { getMergedAchievementDefinitions } from '../data/achievements/loadAchievementDefinitions';
import type { BonusSelectionUiState } from './BonusSystemManager';
import { applyResponsiveGuiScaling } from '../ui/GuiScaling';
import { getAdaptivePreloadConcurrency, loadImageWithRetry, mapWithConcurrency } from '../utils/AssetLoadReliability';
import { DaemonGlitchFx } from '../ui/DaemonGlitchFx';
import type {
  AudioEngineLike,
  DamageNumber,
  DaemonTauntPayload,
  EnemyEventPayload,
  PlayerDamagedPayload,
  PlayerUltReadyPayload,
  RoomEnteredPayload,
  UiOptionChangedPayload,
} from './hud/HudTypes';

export interface HudBonusChoice {
  id: string;
  title: string;
  description?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic';
  stackLabel?: string;
}

export class HUDManager {
  private guiClean: AdvancedDynamicTexture;
  private guiFx: AdvancedDynamicTexture;
  private enemyGui: AdvancedDynamicTexture;
  private inputManager: InputManager | null = null;
  private player: PlayerController | null = null;
  private mobileControls: Control[] = [];
  private mobileAttackBtn: Button | null = null;
  private mobileStanceBtn: Button | null = null;
  private mobileUltBtn: Button | null = null;
  private mobilePointerObserver: any = null;
  private resetMobileJoystick: (() => void) | null = null;
  private wasStanceActive: boolean = false;
  private mobileAttackHoldBlocked: boolean = false;
  private eventBus: EventBus;
  private damageNumbers: DamageNumber[] = [];
  private damageNumberCooldowns: Map<string, { lastTime: number; pending: number; lastPosition: Vector3 }> = new Map();
  private damageNumberCooldown: number = 0.5;
  private enemyHealthBars: Map<string, {
    container: Rectangle;
    bar: Rectangle;
    label: TextBlock;
    mesh: AbstractMesh | null;
    anchor: TransformNode | null;
    anchorObserver: any;
  }> = new Map();
  private pendingEnemyHealthBars: Array<EnemyEventPayload & { enemyId: string }> = [];
  private playerHealthDisplay: TextBlock | null = null;
  private playerUltDisplay: TextBlock | null = null;
  private topBar: Rectangle | null = null;
  private statsPanel: Rectangle | null = null;
  private pauseButton: Button | null = null;
  private healthPanel: Rectangle | null = null;
  private healthBarFill: Rectangle | null = null;
  private healthBarContainer: Rectangle | null = null;
  private integrityLabel: TextBlock | null = null;
  private healthValueText: TextBlock | null = null;
  private integrityDamagePulseTimer: number = 0;
  private readonly integrityDamagePulseDuration: number = 0.34;
  private waveText: TextBlock | null = null;
  private currencyText: TextBlock | null = null;
  private logPanel: Rectangle | null = null;
  private logLines: TextBlock[] = [];
  private logMessages: string[] = [];
  private currentTypingLength: number = 0;
  private typingTimer: number = 0;
  private cursorBlinkTimer: number = 0;
  private showCursor: boolean = true;
  private scheduledLogs: Array<{ message: string; delay: number }> = [];
  private scheduledLogTimer: number = 0;
  private randomGlitchTimer: number = 25;
  private achievementToastContainer: Rectangle | null = null;
  private achievementToastGlowOuter: Rectangle | null = null;
  private achievementToastGlowInner: Rectangle | null = null;
  private achievementToastGlowShimmerA: Rectangle | null = null;
  private achievementToastAccentTop: Rectangle | null = null;
  private achievementToastAccentSide: Rectangle | null = null;
  private achievementToastInnerCircleA: Ellipse | null = null;
  private achievementToastInnerCircleB: Ellipse | null = null;
  private achievementToastTitle: TextBlock | null = null;
  private achievementToastDescription: TextBlock | null = null;
  private achievementIconPlaceholder: Rectangle | null = null;
  private achievementIconText: TextBlock | null = null;
  private achievementToastArtwork: Image | null = null;
  private achievementToastTimer: number = 0;
  private readonly achievementToastDuration: number = 4.0;
  private achievementToastPulseTime: number = 0;
  private achievementToastBaseLeft: number = 16;
  private achievementToastBaseTop: number = 88;
  private achievementTitleBaseText: string = '';
  private achievementTitleMarqueeEnabled: boolean = false;
  private achievementTitleMarqueeIndex: number = 0;
  private achievementTitleMarqueeTimer: number = 0;
  private achievementTitleMarqueeWindowChars: number = 0;
  private achievementTitleMarqueeHold: number = 0;
  public static achievementToastQueue: Array<{ id: string; name: string; description: string }> = [];
  public static achievementToastActive: boolean = false;
  public static currentAchievement: { id: string; name: string; description: string } | null = null;
  private statusPanel: Rectangle | StackPanel | null = null;
  private secondaryStatusText: TextBlock | null = null;
  private secondaryResourceBarFill: Rectangle | null = null;
  private secondaryThresholdMarker: Rectangle | null = null;
  private secondaryActionMarker: Rectangle | null = null;
  private itemStatusText: TextBlock | null = null;
  private playerUltBarFill: Rectangle | null = null;
  private ultBarContainer: Rectangle | null = null;
  private secondaryBarContainer: Rectangle | null = null;
  private ultTime: number = 0;
  private stanceTime: number = 0;
  private lastUltCharge: number = 0;
  private lastUltActive: boolean = false;
  private lastStanceRatio: number = 1.0;
  private lastStanceActive: boolean = false;
  private lastStanceThresholdRatio: number = 0.5;
  private secondaryBlockedFeedbackTimer: number = 0;
  private secondaryBlockedFeedbackMessage: string | null = null;
  private secondaryBlockedFeedbackReason: 'stance' | 'secondary' | null = null;
  private daemonContainer: Rectangle | null = null;
  private daemonGlitchOverlay: Rectangle | null = null;
  private daemonPopupFlashOverlay: Rectangle | null = null;
  private daemonAvatarImage: Image | null = null;
  private daemonAvatarFrameHost: Rectangle | null = null;
  private daemonAvatarFrameControls: Map<string, Image> = new Map();
  private daemonAvatarCurrentFrame: string | null = null;
  private readonly smoothDaemonAvatarMode: boolean = true;
  private daemonMessageText: TextBlock | null = null;
  private daemonTypewriterSynth: SciFiTypewriterSynth;
  private daemonVoiceSynth: DaemonVoiceSynth;
  private uiVolumeMultiplier: number = GameSettingsStore.getEffectiveVolume('ui');
  private voicelineVolumeMultiplier: number = GameSettingsStore.getEffectiveVolume('voice');
  private unsubscribeSettings: (() => void) | null = null;
  private daemonAudioUnlockHandler: (() => void) | null = null;
  private daemonTypingIndex: number = 0;
  private daemonTypingTimer: number = 0;
  private daemonTypingSpeed: number = 65;
  private daemonTypingDelay: number = 0.01; // Delay before typing starts
  private daemonTypingDelayTimer: number = 0;
  private daemonPauseEndTime: number = 0; // For mid-text pauses
  private isTypingGlitched: boolean = false;
  private typingGlitchEndIndex: number = 0;
  private readonly GLITCH_CHARS = '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ!@#$%^&*()_+-=[]{}|;:,.<>?';
  private daemonFullText: string = '';
  private daemonDisplayText: string = ''; // Text without pause markers
  private daemonHoldTimer: number = 0;
  private daemonHoldDuration: number = 3.5;
  private daemonVisible: boolean = false;
  private allowDaemonDuringOverlays: boolean = false;
  private daemonGlitchTimer: number = 0;
  private daemonGlitchDuration: number = 0;
  private daemonFlashTimer: number = 0;
  private daemonFlashDuration: number = 0;
  private daemonFlashPeakAlpha: number = 0;
  private daemonBaseTop: number = 80;
  private daemonBaseLeft: number = 0;
  private daemonAvatarController: DaemonAvatarController = new DaemonAvatarController();
  private activeVoicelineAudios: Set<Sound | AudioBufferSourceNode> = new Set();
  private voicelineGainNode: GainNode | null = null;
  private isVoicelineMuted: boolean = false;
  
  private daemonMessageQueue: Array<{
    message: string,
    emotion?: string,
    options?: {
      sequence?: string[]; frameInterval?: number; holdDuration?: number; preload?: boolean;
      voicePreset?: string; canGlitchFrames?: boolean; canCrash?: boolean;
    }
  }> = [];
  
  private waveNumber: number = 0;
  private isEnabled: boolean = true;
  private showDamageNumbers: boolean = true;
  private showEnemyHealthBars: boolean = true;
  private showEnemyNames: boolean = true;
  private autoAimLabel: TextBlock | null = null;
  private startScreen: Rectangle | null = null;
  private classSelectScreen: Rectangle | null = null;
  private codexScreen: Rectangle | null = null;
  private settingsScreen: Rectangle | null = null;
  private pauseScreen: Rectangle | null = null;
  private pauseExitButton: Button | null = null;
  private pauseSkipButton: Button | null = null;
  private pauseTutorialMode: boolean = false;
  private pauseTutorialClassId: 'mage' | 'firewall' | 'rogue' | 'cat' | null = null;
  private settingsMenuBuilder: SettingsMenuBuilder | null = null;
  private gameOverScreen: Rectangle | null = null;
  private roomClearScreen: Rectangle | null = null;
  private bonusScreen: Rectangle | null = null;
  private bonusButtons: Button[] = [];
  private bonusDynamicControls: Control[] = [];
  private bonusDynamicRoot: Rectangle | null = null;
  private bonusRerollButton: Button | null = null;
  private bonusCardPool: Map<string, {
    button: Button;
    title: TextBlock;
    modeText: TextBlock;
    rarityText: TextBlock;
    artworkGlow: Rectangle;
    energyWaveA: Rectangle;
    energyWaveB: Rectangle;
    energyHalo: Rectangle;
    artworkFrame: Rectangle;
    artworkImg: Image;
    description: TextBlock;
    stackText: TextBlock;
    selectedTag: TextBlock;
    lockText: TextBlock;
  }> = new Map();
  private bonusSubtitle: TextBlock | null = null;
  private bonusHoverPopup: Rectangle | null = null;
  private bonusHoverPopupText: TextBlock | null = null;
  private bonusHoverPopupVisible: boolean = false;
  private bonusCreditsPanel: Rectangle | null = null;
  private bonusCreditsText: TextBlock | null = null;
  private bonusFullHealButton: Button | null = null;
  private bonusCardClickState: Array<{ id: string; isPaid: boolean; cost?: number } | null> = [];
  private bonusCurrentRerollCost: number = 0;
  private bonusCurrentFullHealCost: number = 0;
  private bonusInsufficientFlashOverlay: Rectangle | null = null;
  private bonusInsufficientFlashTimer: number = 0;
  private readonly bonusInsufficientFlashDuration: number = 0.3;
  private bonusCreditsPulseTimer: number = 0;
  private readonly bonusCreditsPulseDuration: number = 0.65;
  private activeBonusCardFx: Array<{
    id: string;
    idSeed: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic';
    isPaid: boolean;
    affordable: boolean;
    selected: boolean;
    button: Button;
    artworkGlow: Rectangle;
    energyWaveA: Rectangle;
    energyWaveB: Rectangle;
    energyHalo: Rectangle;
    auraShellA: Rectangle;
    auraShellB: Rectangle;
    auraShellC: Rectangle;
    title: TextBlock;
  }> = [];
  private bonusCardFxAccumulator: number = 0;
  private runBonusContainer: Rectangle | null = null;
  private runBonusIconsStack: StackPanel | null = null;
  private runBonusTooltip: Rectangle | null = null;
  private runBonusTooltipImg: Image | null = null;
  private runBonusTooltipTitle: TextBlock | null = null;
  private runBonusTooltipDesc: TextBlock | null = null;
  private runBonusTooltipTextStack: StackPanel | null = null;
  private runEquippedBonuses: Array<{ id: string; stacks: number }> = [];
  private runBonusLayoutWidth: number = 0;
  private bossAlertContainer: Rectangle | null = null;
  private bossAlertSubtitle: TextBlock | null = null;
  private bossAlertPulseOverlay: Rectangle | null = null;
  private bossAlertActive: boolean = false;
  private bossAlertElapsed: number = 0;
  private bossAlertDuration: number = 3.0;
  private bossAlertPulseCount: number = 3;
  private lastVoicelineTime: number = 0;
  private readonly VOICELINE_GLOBAL_COOLDOWN: number = 2.5; // Increased minimum gap
  private lastHazardVoicelineTime: number = 0;
  private readonly HAZARD_COOLDOWN: number = 20.0; // Increased hazard cooldown
  private lastDamageTauntTime: number = 0;
  private readonly DAMAGE_TAUNT_COOLDOWN: number = 15.0; // Cooldown for general damage taunts
  private avatarImageCache: Map<string, HTMLImageElement> = new Map();
  private avatarResolvedSrcCache: Map<string, string> = new Map();
  private avatarFrameLoadPromises: Map<string, Promise<void>> = new Map();
  private avatarPreloadPromise: Promise<void> | null = null;
  public readonly preloadPromise: Promise<void>;
  private readonly daemonAvatarSets: Record<string, string[]> = DAEMON_ANIMATION_PRESETS;
  private scoreText!: TextBlock;
  private comboText!: TextBlock;
  private comboMultiplierText!: TextBlock;
  private comboTimerFill!: Rectangle;
  private comboContainer!: Rectangle;
  private runUiBootstrapActive: boolean = false;
  private runUiBootstrapElapsed: number = 0;
  private runUiBootstrapStyleCache: Map<Control, { color?: string; background?: string }> = new Map();
  private unsubscribers: Array<() => void> = [];

  constructor(private scene: Scene) {
    this.eventBus = EventBus.getInstance();
    this.daemonTypewriterSynth = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);
    this.daemonVoiceSynth = DaemonVoiceSynth.getInstance();
    this.applyAudioSettingsFromStore();
    this.unsubscribeSettings = GameSettingsStore.subscribe(() => {
      this.applyAudioSettingsFromStore();
    });
    
    const bonusIds = BONUS_CODEX_ENTRIES.map(b => b.id);
    const achievementIds = Object.keys(getMergedAchievementDefinitions());

    this.preloadPromise = (async () => {
      try {
        await this.preloadAllAvatarFrames();
        await this.preloadBonusAndAchievementArtworks(bonusIds, achievementIds);
      } catch (err) {
        console.warn('Interface 2D preloading encountered warnings:', err);
      }
    })();

    // Create GUIs on main camera
    this.guiFx = AdvancedDynamicTexture.CreateFullscreenUI('HUD_FX', true, scene);
    if (this.guiFx.layer) {
      this.guiFx.layer.layerMask = SCENE_LAYER;
      this.guiFx.layer.renderingGroupId = 3;
    }
    this.guiFx.useInvalidateRectOptimization = false;
    this.guiFx.background = 'transparent';
    this.guiClean = AdvancedDynamicTexture.CreateFullscreenUI('HUD_CLEAN', true, scene);
    if (this.guiClean.layer) {
      this.guiClean.layer.layerMask = UI_LAYER;
      this.guiClean.layer.renderingGroupId = 4;
    }
    this.guiClean.useInvalidateRectOptimization = false;
    this.guiClean.background = 'transparent';
    this.enemyGui = AdvancedDynamicTexture.CreateFullscreenUI('EnemyHUD', true, scene);
    if (this.enemyGui.layer) {
      this.enemyGui.layer.layerMask = UI_LAYER;
      this.enemyGui.layer.renderingGroupId = 2;
    }
    this.enemyGui.useInvalidateRectOptimization = false;
    this.enemyGui.background = 'transparent';
    this.enemyGui.rootContainer.zIndex = 1200;
    
    this.setupEventListeners();
    this.createPlayerHUD();
    this.createOverlays();
    this.setupDaemonTypingAudioUnlock();
    this.applyGuiScaling();

    const engine = this.scene.getEngine();
    engine.onResizeObservable.add(() => {
      this.applyGuiScaling();
    });

    // Check if we have pending achievements from a previous scene
    if (HUDManager.achievementToastQueue.length > 0 && !HUDManager.achievementToastActive) {
      this.showNextAchievementToast();
    }
  }

  private applyGuiScaling(): void {
    applyResponsiveGuiScaling(this.guiFx,    this.scene.getEngine());
    applyResponsiveGuiScaling(this.guiClean, this.scene.getEngine());

    // Enemy bars stay in raw screen space for world-space projection alignment
    if (this.enemyGui) {
      this.enemyGui.renderAtIdealSize = false;
      this.enemyGui.renderScale = 1;
    }

    // Re-apply on every engine resize (handles orientation changes on mobile)
    if (!(this as any)._guiScaleResizeRegistered) {
      (this as any)._guiScaleResizeRegistered = true;
      this.scene.getEngine().onResizeObservable.add(() => {
        applyResponsiveGuiScaling(this.guiFx,    this.scene.getEngine());
        applyResponsiveGuiScaling(this.guiClean, this.scene.getEngine());
      });
    }
  }

  private setupEventListeners(): void {
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      this.handleEnemyDamagedEvent(data as EnemyEventPayload);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data: EnemyEventPayload) => {
      this.handleEnemySpawnedEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DIED, (data: EnemyEventPayload) => {
      this.handleEnemyDiedEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_DAMAGED, async (data: PlayerDamagedPayload) => {
      await this.handlePlayerDamagedEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_HEALTH_CHANGED, async (data: PlayerDamagedPayload) => {
      await this.handlePlayerDamagedEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_CLEARED, async () => {
      await this.handleRoomClearedEvent();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_ENTERED, (data: RoomEnteredPayload) => {
      this.handleRoomEnteredEvent(data);
      this.resetMobileInputState();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_TRANSITION_START, () => {
      this.clearEnemyHealthBars();
      this.resetMobileInputState();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.GAME_START_REQUESTED, () => {
      this.clearEnemyHealthBars();
      this.resetWaveCounter();
      this.resetMobileInputState();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.clearEnemyHealthBars();
      this.resetWaveCounter();
      this.resetMobileInputState();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.DAEMON_TAUNT, async (data: DaemonTauntPayload) => {
      await this.handleDaemonTauntEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_ULTIMATE_READY, (data: PlayerUltReadyPayload) => {
      this.handlePlayerUltimateReadyEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data: UiOptionChangedPayload) => {
      this.handleUiOptionChangedEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.DEV_ROOM_LOAD_REQUESTED, () => {
      this.clearEnemyHealthBars();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.SCORE_CHANGED, (data: any) => this.updateScore(data)));
    this.unsubscribers.push(this.eventBus.on(GameEvents.SCORE_COMBO_CHANGED, (data: any) => this.updateCombo(data)));
    this.unsubscribers.push(this.eventBus.on(GameEvents.HIGH_SCORE_BEATEN, () => this.handleHighScoreBeaten()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ACHIEVEMENT_UNLOCKED, (data: any) => {
      this.handleAchievementUnlockedEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_SECONDARY_BLOCKED, (data: any) => {
      const required = Number.isFinite(data?.requiredPct) ? Math.max(0, Math.round(data.requiredPct)) : 0;
      const current = Number.isFinite(data?.currentPct) ? Math.max(0, Math.round(data.currentPct)) : 0;
      const reason = data?.reason === 'secondary' ? 'secondary' : 'stance';
      this.secondaryBlockedFeedbackReason = reason;
      this.secondaryBlockedFeedbackMessage = reason === 'secondary'
        ? `SECONDARY FAILED: ${current}% / ${required}% REQUIRED`
        : `STANCE LOW: ${current}% / ${required}% REQUIRED`;
      this.secondaryBlockedFeedbackTimer = 0.9;
    }));
  }

  private handleEnemyDamagedEvent(enemyEvent: EnemyEventPayload): void {
    if (!enemyEvent || !enemyEvent.position || typeof enemyEvent.damage !== 'number') return;
    if (!this.showDamageNumbers) return;

    const enemyId = enemyEvent.entityId ?? enemyEvent.enemyId ?? 'unknown';
    this.addDamageNumber(enemyEvent.position, enemyEvent.damage, enemyId);
  }

  private handleEnemySpawnedEvent(data: EnemyEventPayload): void {
    const enemyId = data?.enemyId ?? data?.entityId;
    if (!enemyId) {
      console.warn('[HUDManager] Received ENEMY_SPAWNED without ID:', data);
      return;
    }

    // If we already have a valid mesh, build immediately.
    if (data?.mesh && !data.mesh.isDisposed()) {
      this.createEnemyHealthBar(enemyId, data.enemyName, data.mesh, data.healthBarOffset);
      return;
    }

    // Otherwise queue for next frames (mesh can become available just after spawn).
    this.pendingEnemyHealthBars.push({ ...data, enemyId });
  }

  public dispose(): void {
    if (HUDManager.currentAchievement) {
      HUDManager.achievementToastQueue.unshift(HUDManager.currentAchievement);
      HUDManager.currentAchievement = null;
      HUDManager.achievementToastActive = false;
    }
    
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }

    this.stopAllVoicelineAudio();
    if (this.daemonAudioUnlockHandler) {
      window.removeEventListener('pointerdown', this.daemonAudioUnlockHandler);
      window.removeEventListener('keydown', this.daemonAudioUnlockHandler);
      this.daemonAudioUnlockHandler = null;
    }
    
    if (this.daemonTypewriterSynth) {
      this.daemonTypewriterSynth.dispose();
    }

    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.clearEnemyHealthBars();
    if (this.mobilePointerObserver) {
      this.scene.onPointerObservable.remove(this.mobilePointerObserver);
      this.mobilePointerObserver = null;
    }
    
    if (this.enemyGui) {
      this.enemyGui.dispose();
      this.enemyGui = null as any;
    }
    if (this.guiFx) this.guiFx.dispose();
    if (this.guiClean) this.guiClean.dispose();
  }

  private handleEnemyDiedEvent(data: EnemyEventPayload): void {
    const enemyId = data?.enemyId ?? data?.entityId;
    if (!enemyId) return;
    this.pendingEnemyHealthBars = this.pendingEnemyHealthBars.filter((entry) => entry.enemyId !== enemyId);
    this.removeEnemyHealthBar(enemyId);
    
    const logs = [
      'CRITICAL: CORRUPTED SUBPROCESS TERMINATED.',
      'GARBAGE COLLECTOR: PURGED UNREGISTERED EXEC.',
      'DELETED: DAEMON THREAD SUSPENDED.',
      `DEALLOCATED MEMORY OX${Math.floor(Math.random() * 65536).toString(16).toUpperCase()}`,
      'THREAT RESOLVED: ISOLATED PROCESS QUARANTINED.',
      'HOST INTELLIGENCE: SECURITY LOG DISPOSED.'
    ];
    const chosen = logs[Math.floor(Math.random() * logs.length)];
    this.addLogMessage(chosen);
  }

  private async handlePlayerDamagedEvent(data: PlayerDamagedPayload): Promise<void> {
    const current = data?.health?.current ?? (data as any)?.currentHealth ?? 0;
    const max = data?.health?.max ?? (data as any)?.maxHealth ?? 100;
    const damage = data?.damage ?? 0;
    this.updateHealthDisplay(current, max);
    if (damage > 0) {
      this.triggerIntegrityDamagePulse();

      const logs = [
        'WARNING: SYSTEM BUFFER OVERFLOW DETECTED.',
        'INTEGRITY CRITICAL: HARDWARE THREAT ENCOUNTERED.',
        'IO INTERRUPT: PACKET COLLISION OCCURRED.',
        'HOST EXCEPTION: MEMORY DUMP SCHEDULED.',
        'CORE TEMPERATURE SPIKE: SHIELD INTEGRITY COMPROMISED.'
      ];
      if (Math.random() < 0.35) {
        const chosen = logs[Math.floor(Math.random() * logs.length)];
        this.addLogMessage(chosen);
      }
    }
  }

  private async handleRoomClearedEvent(): Promise<void> {
    const logs = [
      'SECTOR RESTORED: DAEMON OVERWRITE SUSPENDED.',
      'INTEGRITY SCAN: NO OUTSTANDING ERROR REPORTS.',
      'COMPRESSION SUCCESSFUL: SAVING SECTOR CHECKPOINT.',
      'HOST SECURITY: TEMPORARY SANDBOX ISOLATION SECURED.'
    ];
    const chosen = logs[Math.floor(Math.random() * logs.length)];
    this.addLogMessage(chosen);
  }

  private handleRoomEnteredEvent(data: RoomEnteredPayload): void {
    this.waveNumber += 1;
    this.updateWaveText(this.waveNumber);
    
    this.scheduledLogs = [
      { message: 'ESTABLISHING SANDBOX SYNC...', delay: 0.4 },
      { message: 'SYNCING... [██░░░░░░░░░░░░░░] 12%', delay: 0.5 },
      { message: 'SYNCING... [█████░░░░░░░░░░░] 31%', delay: 0.5 },
      { message: 'SYNCING... [████████░░░░░░░░] 50%', delay: 0.5 },
      { message: 'SYNCING... [████████████░░░░] 75%', delay: 0.5 },
      { message: 'SYNCING... [████████████████] 100%', delay: 0.5 },
      { message: `BOOT SEQUENCE: WAVE ${this.waveNumber.toString().padStart(2, '0')} INITIALIZED.`, delay: 0.4 }
    ];
    this.scheduledLogTimer = 0;

    const roomType = typeof data?.roomType === 'string' ? data.roomType.toLowerCase() : 'normal';
    if (roomType === 'boss') {
      const roomName = typeof data?.roomName === 'string' ? data.roomName : 'Unknown Chamber';
      this.triggerBossRoomAlert(roomName);
    }
  }

  private triggerRandomConsoleGlitchSequence(): void {
    const sequences = [
      [
        { message: 'CRITICAL: SEGMENTATION FAULT DETECTED.', delay: 0.4 },
        { message: 'CORE TERMINAL CORRUPTED. INITIATING REBOOT...', delay: 0.6 },
        { message: 'DUMPING CORE... [██░░░░░░░░░░░░░░] 12%', delay: 0.6 },
        { message: 'DUMPING CORE... [█████░░░░░░░░░░░] 31%', delay: 0.6 },
        { message: 'DUMPING CORE... [████████░░░░░░░░] 50%', delay: 0.6 },
        { message: 'DUMPING CORE... [████████████░░░░] 75%', delay: 0.6 },
        { message: 'DUMPING CORE... [████████████████] 100%', delay: 0.5 },
        { message: 'STACK CORRUPTION CLEAR... STATUS: OK', delay: 0.6 },
        { message: 'CLEANING CONSOLE...', delay: 0.6 },
        { message: '__CLEAR_ACTION__', delay: 0.4 },
        { message: 'DIAGNOSTIC CONSOLE REBOOTING...', delay: 0.4 },
        { message: 'RECONNECTING INTERRUPTS...', delay: 0.5 },
        { message: 'DIAGNOSTIC SHELL v4.0.1 - ONLINE.', delay: 0.6 }
      ],
      [
        { message: 'WARNING: KERNEL MEMORY OVERLOAD.', delay: 0.4 },
        { message: 'RUNNING HOST GC (GARBAGE COLLECTOR)...', delay: 0.6 },
        { message: 'GC: RECLAIMED OXF482 MEMORY BLOCKS.', delay: 0.6 },
        { message: 'DIAGNOSTICS: STABLE.', delay: 0.5 }
      ],
      [
        { message: 'INITIATING SUBJECT DIAGNOSTIC SCAN...', delay: 0.4 },
        { message: 'SCANNING... [██░░░░░░░░░░░░░░] 12%', delay: 0.6 },
        { message: 'SCANNING... [█████░░░░░░░░░░░] 31%', delay: 0.6 },
        { message: 'SCANNING... [████████░░░░░░░░] 50%', delay: 0.6 },
        { message: 'SCANNING... [████████████░░░░] 75%', delay: 0.6 },
        { message: 'SCANNING... [████████████████] 100%', delay: 0.5 },
        { message: 'RESULT: DAEMON INTEGRITY THREAT DETECTED.', delay: 0.6 }
      ]
    ];

    const chosen = sequences[Math.floor(Math.random() * sequences.length)];
    this.scheduledLogs.push(...chosen);
  }

  private async handleWaveUpdate(data: any): Promise<void> {
    const roomType = typeof data?.roomType === 'string' ? data.roomType.toLowerCase() : 'normal';
    if (roomType === 'boss') {
      const roomName = typeof data?.roomName === 'string' ? data.roomName : 'Unknown Chamber';
      this.triggerBossRoomAlert(roomName);
    }
  }

  private handlePlayerUltimateReadyEvent(data: PlayerUltReadyPayload): void {
    this.lastUltCharge = data.charge;
    this.lastUltActive = !!data.active;

    if (!this.playerUltDisplay || !this.playerUltBarFill) return;
    const percentage = Math.max(0, Math.min(100, Math.floor(data.charge * 100)));
    this.playerUltBarFill.width = `${percentage}%`;

    if (this.lastUltActive) {
      this.playerUltDisplay.text = `ULTI: ${percentage}% [ACTIVE]`;
      this.playerUltDisplay.color = '#E040FF'; // Neon purple for active duration
      this.playerUltBarFill.background = '#E040FF';
      if (this.ultBarContainer) {
        this.ultBarContainer.color = '#E040FF';
      }
    } else if (data.charge >= 1.0) {
      this.playerUltDisplay.text = `ULTI: 100% [READY]`;
      this.playerUltDisplay.color = '#00FF99'; // Bright matrix green
      this.playerUltBarFill.background = '#00FF99';
      if (this.ultBarContainer) {
        this.ultBarContainer.color = '#00FF99';
      }
    } else {
      this.playerUltDisplay.text = `ULTI: ${percentage}%`;
      this.playerUltDisplay.color = '#FFFF00'; // Cyber yellow charging
      this.playerUltBarFill.background = '#FFFF00';
      if (this.ultBarContainer) {
        this.ultBarContainer.color = '#FFFF00';
        this.ultBarContainer.thickness = 1;
      }
    }
  }

  private handleUiOptionChangedEvent(data: UiOptionChangedPayload): void {
    if (data?.option === 'showDamageNumbers') {
      this.showDamageNumbers = !!data.value;
      if (!this.showDamageNumbers) {
        this.clearDamageNumbers();
      }
    }
    if (data?.option === 'showEnemyHealthBars') {
      this.showEnemyHealthBars = !!data.value;
      this.updateEnemyHealthBarsVisibility();
    }
    if (data?.option === 'showEnemyNames') {
      this.showEnemyNames = !!data.value;
      this.updateEnemyHealthBarsVisibility();
    }
    if (data?.option === 'postProcessingEnabled' || data?.option === 'postProcessingPixelScale') {
      this.applyGuiScaling();
    }
  }

  private createPlayerHUD(): void {
    const fontFamily = 'Arcade8Bit';
    const idealWidth = this.guiClean.idealWidth || 1920;
    const isCompactHud = idealWidth <= 960;
    const baseMenuButtonHeight = isCompactHud ? 84 : 76;
    const baseMenuFontSize = isCompactHud ? 26 : 23;
    const statsPanelWidth = isCompactHud ? 374 : 348;
    const statsPanelHeight = isCompactHud ? 156 : 146;
    const statsLabelFont = isCompactHud ? 24 : 21;
    const statsCreditsFont = isCompactHud ? 22 : 19;

    // Top bar (transparent container for layout)
    this.topBar = new Rectangle('hud_top_bar');
    this.topBar.width = 1;
    // Keep a generous top HUD lane to prevent clipping of child panels on different DPIs/scales.
    this.topBar.height = '210px';
    this.topBar.thickness = 0;
    this.topBar.background = 'transparent';
    this.topBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.topBar.zIndex = 1600;
    this.guiClean.addControl(this.topBar);

    // Stats Console (Top Right Container)
    const statsContainer = new Rectangle('hud_stats_container');
    statsContainer.width = `${statsPanelWidth}px`;
    statsContainer.height = `${statsPanelHeight}px`;
    statsContainer.thickness = 1;
    statsContainer.color = '#3B685C';
    statsContainer.background = 'rgba(10, 18, 22, 0.75)';
    statsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    statsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    statsContainer.left = -24;
    statsContainer.top = 24;
    statsContainer.cornerRadius = 4;
    this.topBar.addControl(statsContainer);
    this.statsPanel = statsContainer;

    this.scoreText = new TextBlock('score_text');
    this.scoreText.text = 'SCORE: 00000000';
    this.scoreText.fontSize = statsLabelFont;
    this.scoreText.fontFamily = fontFamily;
    this.scoreText.color = '#7CFFEA';
    this.scoreText.left = 16;
    this.scoreText.top = isCompactHud ? 14 : 12;
    this.scoreText.width = `${statsPanelWidth - 32}px`;
    this.scoreText.height = '34px';
    this.scoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.scoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsContainer.addControl(this.scoreText);

    this.waveText = new TextBlock('wave_text');
    this.waveText.text = 'WAVE: 00';
    this.waveText.fontSize = statsLabelFont;
    this.waveText.fontFamily = fontFamily;
    this.waveText.color = '#7CFFEA';
    this.waveText.left = 16;
    this.waveText.top = isCompactHud ? 58 : 54;
    this.waveText.width = `${statsPanelWidth - 32}px`;
    this.waveText.height = '34px';
    this.waveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.waveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.waveText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsContainer.addControl(this.waveText);

    this.currencyText = new TextBlock('currency_text');
    this.currencyText.text = 'CREDITS: 000';
    this.currencyText.fontSize = statsCreditsFont;
    this.currencyText.fontFamily = fontFamily;
    this.currencyText.color = '#FFD782';
    this.currencyText.left = 16;
    this.currencyText.top = isCompactHud ? 103 : 98;
    this.currencyText.width = `${statsPanelWidth - 32}px`;
    this.currencyText.height = '34px';
    this.currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.currencyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.currencyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsContainer.addControl(this.currencyText);

    // Combo Container (integrated in score panel, bottom-right)
    this.comboContainer = new Rectangle('combo_container');
    this.comboContainer.width = isCompactHud ? '156px' : '146px';
    this.comboContainer.height = isCompactHud ? '60px' : '56px';
    this.comboContainer.left = isCompactHud ? 208 : 192;
    this.comboContainer.top = isCompactHud ? 92 : 84;
    this.comboContainer.thickness = 0;
    this.comboContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.comboContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.comboContainer.isVisible = false;
    statsContainer.addControl(this.comboContainer);

    this.comboText = new TextBlock('combo_text');
    this.comboText.text = 'COMBO X0';
    this.comboText.fontSize = isCompactHud ? 18 : 17;
    this.comboText.fontFamily = fontFamily;
    this.comboText.color = '#FFD782';
    this.comboText.top = '-8px';
    this.comboText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.comboContainer.addControl(this.comboText);

    this.comboMultiplierText = new TextBlock('combo_multiplier_text');
    this.comboMultiplierText.text = '1.0X';
    this.comboMultiplierText.fontSize = isCompactHud ? 28 : 25;
    this.comboMultiplierText.fontFamily = fontFamily;
    this.comboMultiplierText.color = '#FFFFFF';
    this.comboMultiplierText.top = '11px';
    this.comboMultiplierText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.comboContainer.addControl(this.comboMultiplierText);

    // Bottom-left command feed
    this.logPanel = new Rectangle('log_panel');
    this.logPanel.width = '420px';
    this.logPanel.height = '180px';
    this.logPanel.thickness = 1;
    this.logPanel.color = '#2EF9C3';
    this.logPanel.background = 'rgba(4, 10, 8, 0.88)';
    this.logPanel.left = 24;
    this.logPanel.top = -24;
    this.logPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.logPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.logPanel.zIndex = 1600;
    this.guiClean.addControl(this.logPanel);

    const logHeader = new TextBlock('log_header');
    logHeader.text = ' SYSTEM MONITOR // DIAGNOSTIC FEED';
    logHeader.fontSize = isCompactHud ? 13 : 12;
    logHeader.fontFamily = fontFamily;
    logHeader.color = '#2EF9C3';
    logHeader.height = '16px';
    logHeader.top = '6px';
    logHeader.left = 10;
    logHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    logHeader.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    logHeader.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.logPanel.addControl(logHeader);

    const logsStack = new Rectangle('log_stack_container');
    logsStack.width = 1;
    logsStack.height = 1;
    logsStack.thickness = 0;
    this.logPanel.addControl(logsStack);

    for (let i = 0; i < 6; i++) {
      const line = new TextBlock(`log_line_${i}`);
      line.text = '';
      line.fontSize = isCompactHud ? 14 : 13;
      line.fontFamily = fontFamily;
      line.color = '#B8FFE6';
      line.height = '20px';
      line.top = `${28 + i * 21}px`;
      line.left = 10;
      line.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      line.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      line.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      logsStack.addControl(line);
      this.logLines.push(line);
    }

    // Pause Button (Standalone Top Left)
    const pauseGlyph = '';
    const pauseBtn = Button.CreateSimpleButton('pause_btn', pauseGlyph);
    pauseBtn.width = `${baseMenuButtonHeight}px`;
    pauseBtn.height = `${baseMenuButtonHeight}px`;
    pauseBtn.color = UITheme.colors.textNormal;
    pauseBtn.background = UITheme.colors.buttonBg;
    pauseBtn.thickness = 2;
    pauseBtn.left = isCompactHud ? 28 : 24;
    pauseBtn.top = isCompactHud ? 28 : 24;
    pauseBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    pauseBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    pauseBtn.zIndex = 1700;
    pauseBtn.fontFamily = 'Courier New';
    if (pauseBtn.textBlock) {
      pauseBtn.textBlock.isVisible = false;
      pauseBtn.textBlock.text = '';
    }

    const pauseIconLayer = new Rectangle('pause_icon_layer');
    pauseIconLayer.width = 1;
    pauseIconLayer.height = 1;
    pauseIconLayer.thickness = 0;
    pauseIconLayer.background = 'transparent';
    pauseIconLayer.isHitTestVisible = false;
    pauseIconLayer.isPointerBlocker = false;
    pauseBtn.addControl(pauseIconLayer);

    const makeBar = (name: string, leftOffsetPx: number) => {
      const bar = new Rectangle(name);
      bar.width = `${Math.max(10, Math.round(baseMenuButtonHeight * 0.12))}px`;
      bar.height = `${Math.round(baseMenuButtonHeight * 0.36)}px`;
      bar.cornerRadius = 2;
      bar.thickness = 0;
      bar.background = '#FFFFFF';
      bar.isHitTestVisible = false;
      bar.isPointerBlocker = false;
      bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      bar.left = `${leftOffsetPx}px`;
      return bar;
    };
    const pauseBarGap = Math.max(3, Math.round(baseMenuButtonHeight * 0.035));
    const pauseBarOffset = Math.max(7, Math.round(baseMenuButtonHeight * 0.1));
    pauseIconLayer.addControl(makeBar('pause_bar_left', -(pauseBarOffset + pauseBarGap)));
    pauseIconLayer.addControl(makeBar('pause_bar_right', pauseBarOffset + pauseBarGap));
    DaemonGlitchFx.injectWithOptions(
      pauseBtn,
      'PAUSE',
      () => this.eventBus.emit(GameEvents.UI_PAUSE_TOGGLE),
      { clickDelayMs: 150, enableHoverGlitch: false }
    );
    this.guiClean.addControl(pauseBtn);
    this.pauseButton = pauseBtn;

    this.runBonusContainer = new Rectangle('run_bonus_container');
    this.runBonusContainer.width = '520px';
    this.runBonusContainer.height = '220px';
    this.runBonusContainer.thickness = 0;
    this.runBonusContainer.background = 'rgba(0,0,0,0)';
    this.runBonusContainer.left = 98;
    this.runBonusContainer.top = 20;
    this.runBonusContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.runBonusContainer.isPointerBlocker = false;
    this.runBonusContainer.clipChildren = false;
    this.runBonusContainer.zIndex = 1700;
    this.guiClean.addControl(this.runBonusContainer);

    this.runBonusIconsStack = new StackPanel('run_bonus_icons_stack');
    this.runBonusIconsStack.isVertical = true;
    this.runBonusIconsStack.height = '54px';
    this.runBonusIconsStack.spacing = 8;
    this.runBonusIconsStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusIconsStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.runBonusIconsStack.isPointerBlocker = false;
    this.runBonusIconsStack.clipChildren = false;
    this.runBonusContainer.addControl(this.runBonusIconsStack);

    this.runBonusTooltip = new Rectangle('run_bonus_tooltip');
    this.runBonusTooltip.width = '300px';
    this.runBonusTooltip.height = '86px';
    this.runBonusTooltip.top = '60px';
    this.runBonusTooltip.thickness = 1;
    this.runBonusTooltip.color = '#3B685C';
    this.runBonusTooltip.background = 'rgba(10, 18, 22, 0.96)';
    this.runBonusTooltip.cornerRadius = 6;
    this.runBonusTooltip.isVisible = false;
    this.runBonusTooltip.isPointerBlocker = false;
    this.runBonusTooltip.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusTooltip.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.runBonusContainer.addControl(this.runBonusTooltip);

    this.runBonusTooltipImg = new Image('run_bonus_tooltip_img', '');
    this.runBonusTooltipImg.width = '42px';
    this.runBonusTooltipImg.height = '42px';
    this.runBonusTooltipImg.left = '10px';
    this.runBonusTooltipImg.top = '-16px';
    this.runBonusTooltipImg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusTooltipImg.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.runBonusTooltipImg.isHitTestVisible = false;
    this.runBonusTooltip.addControl(this.runBonusTooltipImg);

    const tooltipTextStack = new StackPanel('run_bonus_tooltip_text');
    tooltipTextStack.isVertical = true;
    tooltipTextStack.left = '60px';
    tooltipTextStack.width = '230px';
    tooltipTextStack.height = '76px';
    tooltipTextStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tooltipTextStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    tooltipTextStack.spacing = 3;
    tooltipTextStack.isHitTestVisible = false;
    this.runBonusTooltip.addControl(tooltipTextStack);
    this.runBonusTooltipTextStack = tooltipTextStack;

    this.runBonusTooltipTitle = new TextBlock('run_bonus_tooltip_title', '');
    this.runBonusTooltipTitle.fontFamily = fontFamily;
    this.runBonusTooltipTitle.fontSize = 13;
    this.runBonusTooltipTitle.color = '#7CFFEA';
    this.runBonusTooltipTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusTooltipTitle.height = '20px';
    tooltipTextStack.addControl(this.runBonusTooltipTitle);

    this.runBonusTooltipDesc = new TextBlock('run_bonus_tooltip_desc', '');
    this.runBonusTooltipDesc.fontFamily = fontFamily;
    this.runBonusTooltipDesc.fontSize = 11;
    this.runBonusTooltipDesc.color = '#CFFCF3';
    this.runBonusTooltipDesc.textWrapping = true;
    this.runBonusTooltipDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusTooltipDesc.height = '52px';
    tooltipTextStack.addControl(this.runBonusTooltipDesc);

    this.refreshRunBonusIcons();

    // Bottom-center Integrity/Health Bar
    const healthPanel = new Rectangle('hud_health_panel');
    healthPanel.width = '520px';
    healthPanel.height = '105px';
    healthPanel.thickness = 0;
    healthPanel.background = 'transparent';
    healthPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    healthPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    healthPanel.left = 0;
    healthPanel.top = -24;
    healthPanel.zIndex = 1600;
    this.guiClean.addControl(healthPanel);
    this.healthPanel = healthPanel;

    const integrityLabel = new TextBlock('integrity_label');
    integrityLabel.text = 'INTEGRITY';
    integrityLabel.fontSize = isCompactHud ? 24 : 22;
    integrityLabel.fontFamily = 'Wonder8Bit';
    integrityLabel.color = '#7CFFEA';
    integrityLabel.width = '300px';
    integrityLabel.height = '28px';
    integrityLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    integrityLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    integrityLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    integrityLabel.top = '0px';
    healthPanel.addControl(integrityLabel);
    this.integrityLabel = integrityLabel;

    const healthBarContainer = new Rectangle('health_bar_container');
    healthBarContainer.width = '420px';
    healthBarContainer.height = '30px';
    healthBarContainer.thickness = 1;
    healthBarContainer.color = '#7CFFEA';
    healthBarContainer.background = 'rgba(10, 30, 35, 0.7)';
    healthBarContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    healthBarContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    healthBarContainer.left = 0;
    healthBarContainer.top = '2px';
    healthPanel.addControl(healthBarContainer);
    this.healthBarContainer = healthBarContainer;

    this.healthBarFill = new Rectangle('health_bar_fill');
    this.healthBarFill.width = '100%';
    this.healthBarFill.height = '100%';
    this.healthBarFill.thickness = 0;
    this.healthBarFill.background = '#00FFD1';
    this.healthBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthBarContainer.addControl(this.healthBarFill);

    this.healthValueText = new TextBlock('health_value');
    this.healthValueText.text = '100/100';
    this.healthValueText.fontSize = isCompactHud ? 22 : 19;
    this.healthValueText.fontFamily = fontFamily;
    this.healthValueText.color = '#CFFCF3';
    this.healthValueText.width = '200px';
    this.healthValueText.height = '26px';
    this.healthValueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.healthValueText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.healthValueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.healthValueText.left = 0;
    this.healthValueText.top = '0px';
    healthPanel.addControl(this.healthValueText);
    this.playerHealthDisplay = this.healthValueText;

    // Bottom-right status panel (stacked resource bars)
    this.statusPanel = new Rectangle('status_panel');
    this.statusPanel.width = '420px';
    this.statusPanel.height = '180px';
    this.statusPanel.thickness = 1;
    this.statusPanel.color = '#2EF9C3';
    this.statusPanel.background = 'rgba(0, 0, 0, 0.55)';
    this.statusPanel.left = -24;
    this.statusPanel.top = -24;
    this.statusPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.statusPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.statusPanel.zIndex = 1600;
    this.guiClean.addControl(this.statusPanel);

    this.playerUltDisplay = new TextBlock('ultimate_status');
    this.playerUltDisplay.text = 'ULTI: 0%';
    this.playerUltDisplay.fontSize = isCompactHud ? 19 : 17;
    this.playerUltDisplay.fontFamily = fontFamily;
    this.playerUltDisplay.color = '#FFFF00';
    this.playerUltDisplay.left = 16;
    this.playerUltDisplay.top = 16;
    this.playerUltDisplay.width = '380px';
    this.playerUltDisplay.height = '24px';
    this.playerUltDisplay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.playerUltDisplay.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.playerUltDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusPanel.addControl(this.playerUltDisplay);

    const ultBarContainer = new Rectangle('ultimate_bar_container');
    ultBarContainer.width = '388px';
    ultBarContainer.height = '24px';
    ultBarContainer.thickness = 1;
    ultBarContainer.color = '#FFFF00';
    ultBarContainer.background = 'rgba(30, 30, 10, 0.7)';
    ultBarContainer.left = 16;
    ultBarContainer.top = 42;
    ultBarContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    ultBarContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.statusPanel.addControl(ultBarContainer);
    this.ultBarContainer = ultBarContainer;

    this.playerUltBarFill = new Rectangle('ultimate_bar_fill');
    this.playerUltBarFill.width = '0%';
    this.playerUltBarFill.height = '100%';
    this.playerUltBarFill.thickness = 0;
    this.playerUltBarFill.background = '#FFFF00';
    this.playerUltBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    ultBarContainer.addControl(this.playerUltBarFill);

    this.secondaryStatusText = new TextBlock('secondary_status');
    this.secondaryStatusText.text = 'STANCE: 100% [READY]';
    this.secondaryStatusText.fontSize = isCompactHud ? 19 : 17;
    this.secondaryStatusText.fontFamily = fontFamily;
    this.secondaryStatusText.color = '#B8FFE6';
    this.secondaryStatusText.left = 16;
    this.secondaryStatusText.top = 88;
    this.secondaryStatusText.width = '380px';
    this.secondaryStatusText.height = '24px';
    this.secondaryStatusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.secondaryStatusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.secondaryStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusPanel.addControl(this.secondaryStatusText);

    const secondaryBarContainer = new Rectangle('secondary_resource_container');
    secondaryBarContainer.width = '388px';
    secondaryBarContainer.height = '24px';
    secondaryBarContainer.thickness = 1;
    secondaryBarContainer.color = '#7CFFEA';
    secondaryBarContainer.background = 'rgba(10, 30, 35, 0.7)';
    secondaryBarContainer.left = 16;
    secondaryBarContainer.top = 114;
    secondaryBarContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    secondaryBarContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.statusPanel.addControl(secondaryBarContainer);
    this.secondaryBarContainer = secondaryBarContainer;

    this.secondaryResourceBarFill = new Rectangle('secondary_resource_fill');
    this.secondaryResourceBarFill.width = '100%';
    this.secondaryResourceBarFill.height = '100%';
    this.secondaryResourceBarFill.thickness = 0;
    this.secondaryResourceBarFill.background = '#66CCFF';
    this.secondaryResourceBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    secondaryBarContainer.addControl(this.secondaryResourceBarFill);

    const secondaryThresholdMarker = new Rectangle('secondary_threshold_marker');
    secondaryThresholdMarker.width = '3px';
    secondaryThresholdMarker.height = '100%';
    secondaryThresholdMarker.thickness = 0;
    secondaryThresholdMarker.background = '#FFD782';
    secondaryThresholdMarker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    secondaryThresholdMarker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    secondaryThresholdMarker.left = '50%';
    secondaryBarContainer.addControl(secondaryThresholdMarker);
    this.secondaryThresholdMarker = secondaryThresholdMarker;

    const secondaryActionMarker = new Rectangle('secondary_action_marker');
    secondaryActionMarker.width = '3px';
    secondaryActionMarker.height = '100%';
    secondaryActionMarker.thickness = 0;
    secondaryActionMarker.background = '#FF4A66';
    secondaryActionMarker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    secondaryActionMarker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    secondaryActionMarker.left = '50%';
    secondaryBarContainer.addControl(secondaryActionMarker);
    this.secondaryActionMarker = secondaryActionMarker;

    // Keep itemStatusText hidden / dummy to preserve compatibility
    this.itemStatusText = new TextBlock('item_status');
    this.itemStatusText.text = 'ITEM: NONE';
    this.itemStatusText.isVisible = false;

    // Auto-aim indicator (keyboard-only mode badge)
    this.autoAimLabel = new TextBlock('auto_aim_indicator');
    this.autoAimLabel.text = '⊙ AUTO-AIM';
    this.autoAimLabel.fontSize = isCompactHud ? 15 : 14;
    this.autoAimLabel.fontFamily = fontFamily;
    this.autoAimLabel.color = '#7CFFEA';
    this.autoAimLabel.left = 16;
    this.autoAimLabel.top = 148;
    this.autoAimLabel.width = '240px';
    this.autoAimLabel.height = '20px';
    this.autoAimLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.autoAimLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.autoAimLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.autoAimLabel.isVisible = false;
    this.statusPanel.addControl(this.autoAimLabel);

    this.achievementToastContainer = new Rectangle('achievement_toast');
    this.achievementToastContainer.width = '560px';
    this.achievementToastContainer.height = '148px';
    this.achievementToastContainer.thickness = 3;
    this.achievementToastContainer.color = '#7CFFEA';
    this.achievementToastContainer.background = 'rgba(6, 18, 24, 0.94)';
    this.achievementToastContainer.left = this.achievementToastBaseLeft;
    this.achievementToastContainer.top = this.achievementToastBaseTop;
    this.achievementToastContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastContainer.isVisible = false;
    this.achievementToastContainer.isPointerBlocker = false;
    this.achievementToastContainer.zIndex = 9000;
    this.guiClean.addControl(this.achievementToastContainer);

    this.achievementToastGlowOuter = new Rectangle('achievement_toast_glow_outer');
    this.achievementToastGlowOuter.width = '580px';
    this.achievementToastGlowOuter.height = '168px';
    this.achievementToastGlowOuter.thickness = 6;
    this.achievementToastGlowOuter.color = '#42D8FF';
    this.achievementToastGlowOuter.background = 'rgba(0, 0, 0, 0)';
    this.achievementToastGlowOuter.left = this.achievementToastBaseLeft;
    this.achievementToastGlowOuter.top = this.achievementToastBaseTop;
    this.achievementToastGlowOuter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastGlowOuter.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastGlowOuter.isVisible = false;
    this.achievementToastGlowOuter.isPointerBlocker = false;
    this.achievementToastGlowOuter.alpha = 0.45;
    this.achievementToastGlowOuter.zIndex = 8988;
    this.guiClean.addControl(this.achievementToastGlowOuter);

    this.achievementToastGlowInner = new Rectangle('achievement_toast_glow_inner');
    this.achievementToastGlowInner.width = '564px';
    this.achievementToastGlowInner.height = '152px';
    this.achievementToastGlowInner.thickness = 2;
    this.achievementToastGlowInner.color = '#80FFF2';
    this.achievementToastGlowInner.background = 'rgba(0,0,0,0)';
    this.achievementToastGlowInner.left = this.achievementToastBaseLeft;
    this.achievementToastGlowInner.top = this.achievementToastBaseTop;
    this.achievementToastGlowInner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastGlowInner.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastGlowInner.isVisible = false;
    this.achievementToastGlowInner.isPointerBlocker = false;
    this.achievementToastGlowInner.alpha = 0.55;
    this.achievementToastGlowInner.zIndex = 8990;
    this.guiClean.addControl(this.achievementToastGlowInner);

    this.achievementToastGlowShimmerA = new Rectangle('achievement_toast_glow_shimmer_a');
    this.achievementToastGlowShimmerA.width = '604px';
    this.achievementToastGlowShimmerA.height = '188px';
    this.achievementToastGlowShimmerA.thickness = 10;
    this.achievementToastGlowShimmerA.color = '#FBA3FF';
    this.achievementToastGlowShimmerA.background = 'rgba(0,0,0,0)';
    this.achievementToastGlowShimmerA.left = this.achievementToastBaseLeft - 22;
    this.achievementToastGlowShimmerA.top = this.achievementToastBaseTop - 22;
    this.achievementToastGlowShimmerA.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastGlowShimmerA.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastGlowShimmerA.isVisible = false;
    this.achievementToastGlowShimmerA.isPointerBlocker = false;
    this.achievementToastGlowShimmerA.alpha = 0.14;
    this.achievementToastGlowShimmerA.zIndex = 8986;
    this.guiClean.addControl(this.achievementToastGlowShimmerA);

    this.achievementToastAccentTop = new Rectangle('achievement_toast_accent_top');
    this.achievementToastAccentTop.width = '560px';
    this.achievementToastAccentTop.height = '6px';
    this.achievementToastAccentTop.thickness = 0;
    this.achievementToastAccentTop.background = '#FFD36A';
    this.achievementToastAccentTop.left = this.achievementToastBaseLeft;
    this.achievementToastAccentTop.top = this.achievementToastBaseTop - 3;
    this.achievementToastAccentTop.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastAccentTop.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastAccentTop.isVisible = false;
    this.achievementToastAccentTop.isPointerBlocker = false;
    this.achievementToastAccentTop.alpha = 0.82;
    this.achievementToastAccentTop.zIndex = 8996;
    this.guiClean.addControl(this.achievementToastAccentTop);

    this.achievementToastAccentSide = new Rectangle('achievement_toast_accent_side');
    this.achievementToastAccentSide.width = '7px';
    this.achievementToastAccentSide.height = '148px';
    this.achievementToastAccentSide.thickness = 0;
    this.achievementToastAccentSide.background = '#73F9FF';
    this.achievementToastAccentSide.left = this.achievementToastBaseLeft - 4;
    this.achievementToastAccentSide.top = this.achievementToastBaseTop;
    this.achievementToastAccentSide.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastAccentSide.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastAccentSide.isVisible = false;
    this.achievementToastAccentSide.isPointerBlocker = false;
    this.achievementToastAccentSide.alpha = 0.74;
    this.achievementToastAccentSide.zIndex = 8996;
    this.guiClean.addControl(this.achievementToastAccentSide);

    this.achievementToastInnerCircleA = new Ellipse('achievement_toast_inner_circle_a');
    this.achievementToastInnerCircleA.width = '280px';
    this.achievementToastInnerCircleA.height = '280px';
    this.achievementToastInnerCircleA.left = '240px';
    this.achievementToastInnerCircleA.top = '-78px';
    this.achievementToastInnerCircleA.thickness = 2;
    this.achievementToastInnerCircleA.color = '#FF9ECD';
    this.achievementToastInnerCircleA.background = 'rgba(255,215,245,0.09)';
    this.achievementToastInnerCircleA.alpha = 0.24;
    this.achievementToastInnerCircleA.isPointerBlocker = false;
    this.achievementToastContainer.addControl(this.achievementToastInnerCircleA);

    this.achievementToastInnerCircleB = new Ellipse('achievement_toast_inner_circle_b');
    this.achievementToastInnerCircleB.width = '196px';
    this.achievementToastInnerCircleB.height = '196px';
    this.achievementToastInnerCircleB.left = '318px';
    this.achievementToastInnerCircleB.top = '-36px';
    this.achievementToastInnerCircleB.thickness = 1;
    this.achievementToastInnerCircleB.color = '#82D5FF';
    this.achievementToastInnerCircleB.background = 'rgba(196,229,255,0.07)';
    this.achievementToastInnerCircleB.alpha = 0.22;
    this.achievementToastInnerCircleB.isPointerBlocker = false;
    this.achievementToastContainer.addControl(this.achievementToastInnerCircleB);

    this.achievementIconPlaceholder = new Rectangle('achievement_toast_icon');
    this.achievementIconPlaceholder.width = '106px';
    this.achievementIconPlaceholder.height = '106px';
    this.achievementIconPlaceholder.thickness = 2;
    this.achievementIconPlaceholder.color = '#5FFFE0';
    this.achievementIconPlaceholder.background = 'rgba(18, 44, 51, 0.9)';
    this.achievementIconPlaceholder.left = 18;
    this.achievementIconPlaceholder.top = 20;
    this.achievementIconPlaceholder.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementIconPlaceholder.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastContainer.addControl(this.achievementIconPlaceholder);

    this.achievementIconText = new TextBlock('achievement_toast_icon_text');
    this.achievementIconText.text = '?';
    this.achievementIconText.fontFamily = fontFamily;
    this.achievementIconText.fontSize = 36;
    this.achievementIconText.color = '#B8FFE6';
    this.achievementIconPlaceholder.addControl(this.achievementIconText);

    // Artwork will be dynamically instantiated in showNextAchievementToast

    this.achievementToastTitle = new TextBlock('achievement_toast_title');
    this.achievementToastTitle.text = 'ACHIEVEMENT UNLOCKED';
    this.achievementToastTitle.fontSize = 27;
    this.achievementToastTitle.fontFamily = fontFamily;
    this.achievementToastTitle.color = '#7CFFEA';
    this.achievementToastTitle.left = 140;
    this.achievementToastTitle.top = 16;
    this.achievementToastTitle.width = '402px';
    this.achievementToastTitle.height = '44px';
    this.achievementToastTitle.textWrapping = true;
    this.achievementToastTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastContainer.addControl(this.achievementToastTitle);

    this.achievementToastDescription = new TextBlock('achievement_toast_desc');
    this.achievementToastDescription.text = '';
    this.achievementToastDescription.fontSize = 20;
    this.achievementToastDescription.fontFamily = fontFamily;
    this.achievementToastDescription.color = '#CFFCF3';
    this.achievementToastDescription.left = 140;
    this.achievementToastDescription.top = 66;
    this.achievementToastDescription.width = '402px';
    this.achievementToastDescription.height = '70px';
    this.achievementToastDescription.textWrapping = true;
    this.achievementToastDescription.lineSpacing = '5px';
    this.achievementToastDescription.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastDescription.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastDescription.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastContainer.addControl(this.achievementToastDescription);
    this.applyAchievementToastLayout();

    // Daemon popup
    this.daemonContainer = new Rectangle('daemon_container');
    this.daemonContainer.width = '780px';
    this.daemonContainer.height = '220px';
    this.daemonContainer.thickness = 2;
    this.daemonContainer.color = '#FF3B5C';
    this.daemonContainer.background = 'rgba(20, 0, 6, 0.85)';
    this.daemonContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.daemonContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.daemonContainer.top = this.daemonBaseTop;
    this.daemonContainer.left = this.daemonBaseLeft;
    this.daemonContainer.isVisible = false;
    this.daemonContainer.zIndex = 5000; // Always on top of ALL overlays (bonus screen, shop, etc.)
    this.guiClean.addControl(this.daemonContainer);

    this.daemonGlitchOverlay = new Rectangle('daemon_glitch_overlay');
    this.daemonGlitchOverlay.width = '780px';
    this.daemonGlitchOverlay.height = '220px';
    this.daemonGlitchOverlay.thickness = 1;
    this.daemonGlitchOverlay.color = '#FF5E73';
    this.daemonGlitchOverlay.background = 'rgba(120, 0, 16, 0.16)';
    this.daemonGlitchOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.daemonGlitchOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.daemonGlitchOverlay.top = this.daemonBaseTop;
    this.daemonGlitchOverlay.left = this.daemonBaseLeft;
    this.daemonGlitchOverlay.alpha = 0;
    this.daemonGlitchOverlay.isVisible = false;
    this.daemonGlitchOverlay.isPointerBlocker = false;
    this.guiFx.addControl(this.daemonGlitchOverlay);

    const avatarBox = new Rectangle('daemon_avatar');
    avatarBox.width = '160px';
    avatarBox.height = '160px';
    avatarBox.left = 24;
    avatarBox.top = 0;
    avatarBox.thickness = 1;
    avatarBox.color = '#FF7A8F';
    avatarBox.background = 'rgba(90, 0, 12, 0.6)';
    avatarBox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    avatarBox.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.daemonContainer.addControl(avatarBox);
    this.daemonAvatarFrameHost = avatarBox;

    const initialFrame = this.getAvatarFrameSrc('init_01.png');
    console.log(`[HUDManager] Initializing with detected base URL: ${getHudAssetBaseUrl()}`);
    this.daemonAvatarImage = new Image('daemon_avatar_image', initialFrame);
    this.daemonAvatarImage.width = '160px';
    this.daemonAvatarImage.height = '160px';
    this.daemonAvatarImage.stretch = Image.STRETCH_UNIFORM;
    avatarBox.addControl(this.daemonAvatarImage);
    this.daemonAvatarController.setPingPongSequence(this.getAvatarFrames('init'), 0.12);

    this.daemonMessageText = new TextBlock('daemon_message');
    this.daemonMessageText.text = '';
    this.daemonMessageText.fontSize = 24;
    this.daemonMessageText.fontFamily = 'Consolas';
    this.daemonMessageText.color = '#FFD1DA';
    this.daemonMessageText.left = 208;
    this.daemonMessageText.top = 0;
    this.daemonMessageText.width = '530px';
    this.daemonMessageText.height = '180px';
    this.daemonMessageText.textWrapping = true;
    this.daemonMessageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.daemonMessageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.daemonMessageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.daemonContainer.addControl(this.daemonMessageText);

    this.bossAlertPulseOverlay = new Rectangle('boss_alert_pulse_overlay');
    this.bossAlertPulseOverlay.width = 1;
    this.bossAlertPulseOverlay.height = 1;
    this.bossAlertPulseOverlay.thickness = 0;
    this.bossAlertPulseOverlay.background = '#FF1C32';
    this.bossAlertPulseOverlay.alpha = 0;
    this.bossAlertPulseOverlay.isVisible = false;
    this.bossAlertPulseOverlay.isPointerBlocker = false;
    this.bossAlertPulseOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.bossAlertPulseOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiFx.addControl(this.bossAlertPulseOverlay);

    this.daemonPopupFlashOverlay = new Rectangle('daemon_popup_flash_overlay');
    this.daemonPopupFlashOverlay.width = 1;
    this.daemonPopupFlashOverlay.height = 1;
    this.daemonPopupFlashOverlay.thickness = 0;
    this.daemonPopupFlashOverlay.background = '#FF2A3B';
    this.daemonPopupFlashOverlay.alpha = 0;
    this.daemonPopupFlashOverlay.isVisible = false;
    this.daemonPopupFlashOverlay.isPointerBlocker = false;
    this.daemonPopupFlashOverlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.daemonPopupFlashOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiFx.addControl(this.daemonPopupFlashOverlay);

    this.bossAlertContainer = new Rectangle('boss_alert_container');
    this.bossAlertContainer.width = '540px';
    this.bossAlertContainer.height = '140px';
    this.bossAlertContainer.thickness = 2;
    this.bossAlertContainer.color = '#FF5366';
    this.bossAlertContainer.background = 'rgba(25, 0, 0, 0.7)';
    this.bossAlertContainer.top = 120;
    this.bossAlertContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.bossAlertContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.bossAlertContainer.isVisible = false;
    this.bossAlertContainer.isPointerBlocker = false;
    this.guiFx.addControl(this.bossAlertContainer);

    const bossTitle = new TextBlock('boss_alert_title');
    bossTitle.text = 'BOSS ROOM';
    bossTitle.fontSize = 44;
    bossTitle.fontFamily = fontFamily;
    bossTitle.color = '#FFBBC2';
    bossTitle.top = -26;
    bossTitle.height = '60px';
    this.bossAlertContainer.addControl(bossTitle);

    this.bossAlertSubtitle = new TextBlock('boss_alert_subtitle');
    this.bossAlertSubtitle.text = '';
    this.bossAlertSubtitle.fontSize = 23;
    this.bossAlertSubtitle.fontFamily = fontFamily;
    this.bossAlertSubtitle.color = '#FFDDE1';
    this.bossAlertSubtitle.top = 22;
    this.bossAlertSubtitle.height = '50px';
    this.bossAlertContainer.addControl(this.bossAlertSubtitle);
  }

  private createOverlays(): void {
    // Main menu / class select / codex / settings are handled by dedicated scenes.
    // Keep HUD overlays disabled here to avoid duplicated UI stacks and pointer conflicts.
    this.startScreen = null;
    this.classSelectScreen = null;
    this.codexScreen = null;
    
    this.settingsMenuBuilder = new SettingsMenuBuilder(
      () => this.showPauseMenu(),
      () => this.eventBus.emit(GameEvents.CODEX_PROGRESS_RESET_REQUESTED),
      () => {}
    );
    this.settingsScreen = this.settingsMenuBuilder.createSettingsOverlay(this.guiClean);

    this.pauseScreen = this.createPauseOverlay();
    this.pauseScreen.isVisible = false;

    this.gameOverScreen = this.createGameOverScreenPlaceholder();
    this.gameOverScreen.isVisible = false;

    this.roomClearScreen = this.createOverlay('ROOM CLEARED', 'NEXT ROOM', () => {
      this.eventBus.emit(GameEvents.ROOM_NEXT_REQUESTED);
    });
    this.roomClearScreen.isVisible = false;

    this.bonusScreen = this.createOverlay('CHOOSE BONUS', '', () => {});
    this.bonusScreen.zIndex = 1400;
    this.bonusScreen.isVisible = false;
  }

  private createPauseOverlay(): Rectangle {
    const idealWidth = this.guiClean.idealWidth || 1920;
    const isCompactHud = idealWidth <= 960;
    const baseMenuButtonHeight = isCompactHud ? 84 : 76;
    const baseMenuFontSize = isCompactHud ? 26 : 23;

    const container = new Rectangle('pause_overlay');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.85)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.zIndex = 2000;
    this.guiClean.addControl(container);

    const title = new TextBlock('pause_title');
    title.text = 'SYSTEM PAUSED';
    title.color = '#7CFFEA';
    title.fontSize = isCompactHud ? 52 : 46;
    title.fontFamily = 'Wonder8Bit';
    title.top = '-180px';
    container.addControl(title);

    const buttonPanel = new StackPanel('pause_buttons');
    buttonPanel.width = `${isCompactHud ? 470 : 410}px`;
    buttonPanel.top = '40px';
    buttonPanel.spacing = 16;
    container.addControl(buttonPanel);

    const createButton = (text: string, color: string, onClick: () => void) => {
      const btn = Button.CreateSimpleButton(`pause_btn_${text}`, text);
      btn.height = `${baseMenuButtonHeight}px`;
      btn.width = `${isCompactHud ? 470 : 410}px`;
      btn.color = color;
      btn.background = UITheme.colors.buttonBg;
      btn.thickness = 1;
      btn.cornerRadius = 4;
      btn.fontSize = baseMenuFontSize;
      btn.fontFamily = 'Wonder8Bit';
      DaemonGlitchFx.injectWithOptions(
        btn,
        text,
        () => onClick(),
        { clickDelayMs: 170, enableHoverGlitch: false }
      );
      buttonPanel.addControl(btn);
      return btn;
    };

    createButton('RESUME', UITheme.colors.textNormal, () => {
      this.eventBus.emit(GameEvents.UI_PAUSE_TOGGLE);
    });

    createButton('OPTIONS', UITheme.colors.textNormal, () => {
      this.showSettingsMenu();
    });

    this.pauseSkipButton = createButton('SKIP TUTORIAL', UITheme.colors.textNormal, () => {
      this.eventBus.emit(GameEvents.TUTORIAL_SKIP_REQUESTED);
    });
    this.pauseSkipButton.isVisible = false;

    this.pauseExitButton = createButton('MAIN MENU', UITheme.colors.textNormal, () => {
      this.eventBus.emit(GameEvents.MAIN_MENU_REQUESTED);
    });

    return container;
  }

  private hideMenuScreens(): void {
    if (this.startScreen) this.startScreen.isVisible = false;
    if (this.classSelectScreen) this.classSelectScreen.isVisible = false;
    if (this.codexScreen) this.codexScreen.isVisible = false;
    if (this.settingsScreen) this.settingsScreen.isVisible = false;
    if (this.pauseScreen) this.pauseScreen.isVisible = false;
  }

  public showPauseMenu(): void {
    this.hideMenuScreens();
    if (this.pauseScreen) this.pauseScreen.isVisible = true;
    if (this.enemyGui) this.enemyGui.rootContainer.isVisible = false;
    this.stopAllVoicelineAudio();
  }

  public hidePauseMenu(): void {
    if (this.pauseScreen) this.pauseScreen.isVisible = false;
    if (this.enemyGui) this.enemyGui.rootContainer.isVisible = true;
  }

  public setPauseTutorialMode(active: boolean, tutorialClassId?: 'mage' | 'firewall' | 'rogue' | 'cat'): void {
    this.pauseTutorialMode = active;
    this.pauseTutorialClassId = active ? (tutorialClassId ?? this.pauseTutorialClassId ?? null) : null;
    const classKey = this.pauseTutorialClassId === 'cat' ? 'rogue' : this.pauseTutorialClassId;
    const dualTutorialButtons = active && (classKey === 'firewall' || classKey === 'rogue');

    if (this.pauseSkipButton) {
      this.pauseSkipButton.isVisible = dualTutorialButtons;
    }
    if (this.pauseExitButton?.textBlock) {
      this.pauseExitButton.textBlock.text = active && !dualTutorialButtons ? 'SKIP TUTORIAL' : 'MAIN MENU';
    }
  }

  /** Show or hide the auto-aim badge in the HUD status panel. */
  public setAutoAimIndicator(active: boolean): void {
    if (this.autoAimLabel) {
      this.autoAimLabel.isVisible = active;
    }
  }

  /**
   * Shows a 3-2-1-GO countdown overlay before gameplay starts.
   * The callback fires once "GO!" has faded out.
   */
  public showCountdown(onComplete: () => void): void {
    const overlay = new Rectangle('countdown_overlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'transparent';
    overlay.isPointerBlocker = false;
    overlay.zIndex = 1500;
    this.guiClean.addControl(overlay);

    const label = new TextBlock('countdown_label');
    label.text = '3';
    label.color = '#7CFFEA';
    label.fontSize = 140;
    label.fontFamily = 'Arcade8Bit';
    label.shadowBlur = 30;
    label.shadowColor = '#00FFCC';
    label.scaleX = 1.0;
    label.scaleY = 1.0;
    label.alpha = 1.0;
    overlay.addControl(label);

    const steps = ['3', '2', '1', 'GO!'];
    const colors = ['#7CFFEA', '#FFD782', '#FF6B8A', '#FFFFFF'];
    let step = 0;

    const engine = this.scene.getEngine();
    let elapsed = 0;
    const STEP_DURATION = 900; // ms per number
    const GO_DURATION = 600;   // ms for GO!
    let observer: any = null;

    const advance = () => {
      step++;
      elapsed = 0;

      if (step >= steps.length) {
        // Remove overlay and fire callback
        this.guiClean.removeControl(overlay);
        overlay.dispose();
        onComplete();
        if (observer) {
          this.scene.onBeforeRenderObservable.remove(observer);
        }
        return;
      }

      label.text = steps[step];
      label.color = colors[step];
      label.shadowColor = colors[step];
      label.scaleX = 1.4;
      label.scaleY = 1.4;
      label.alpha = 1.0;
    };

    observer = this.scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime();
      elapsed += dt;
      const duration = step < steps.length - 1 ? STEP_DURATION : GO_DURATION;
      const t = Math.min(elapsed / duration, 1);

      // Scale animation: pop in then settle
      const scale = step < steps.length - 1
        ? 1.4 - 0.4 * t           // shrink from 1.4 → 1.0
        : 1.0 + 0.15 * Math.sin(Math.PI * t); // GO! pulse
      label.scaleX = scale;
      label.scaleY = scale;

      // Fade out toward end of each step
      if (t > 0.75) {
        label.alpha = 1 - (t - 0.75) / 0.25;
      } else {
        label.alpha = 1.0;
      }

      if (elapsed >= duration) {
        advance();
      }
    });
  }

  public handleEscapeKey(): void {
    if (this.settingsScreen && this.settingsScreen.isVisible) {
      this.showPauseMenu();
    } else if (this.pauseScreen && this.pauseScreen.isVisible) {
      this.eventBus.emit(GameEvents.UI_PAUSE_TOGGLE);
    }
  }

  private showMainMenu(): void {
    this.hideMenuScreens();
    if (this.startScreen) this.startScreen.isVisible = true;
  }

  private showClassSelectMenu(): void {
    this.hideMenuScreens();
    if (this.classSelectScreen) this.classSelectScreen.isVisible = true;
  }

  private showCodexMenu(): void {
    this.hideMenuScreens();
    if (this.codexScreen) this.codexScreen.isVisible = true;
  }

  private showSettingsMenu(): void {
    this.hideMenuScreens();
    if (this.settingsScreen) this.settingsScreen.isVisible = true;
    if (this.settingsMenuBuilder) this.settingsMenuBuilder.refreshSettingsUi();
  }

  private emitUiClickSound(): void {
    this.eventBus.emit(GameEvents.UI_SOUND_SELECT);
  }

  private createOverlay(titleText: string, buttonText: string, onClick: () => void): Rectangle {
    const container = new Rectangle(`${titleText}_overlay`);
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.6)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiClean.addControl(container);

    const title = new TextBlock(`${titleText}_title`);
    title.text = titleText;
    title.color = '#FFFFFF';
    title.fontSize = 38;
    title.fontFamily = 'Arcade8Bit';
    title.top = '-60px';
    container.addControl(title);

    if (buttonText) {
      const btn = Button.CreateSimpleButton(`${titleText}_btn`, buttonText);
      btn.width = '200px';
      btn.height = '50px';
      btn.color = '#FFFFFF';
      btn.cornerRadius = 6;
      btn.background = '#2A2A2A';
      btn.thickness = 2;
      btn.onPointerUpObservable.add(() => {
        this.emitUiClickSound();
        onClick();
      });
      container.addControl(btn);
    }

    return container;
  }

  private createGameOverScreenPlaceholder(): Rectangle {
    const container = new Rectangle('gameover_screen');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(10, 18, 22, 0.95)';
    container.isVisible = false;
    container.isPointerBlocker = true;
    container.zIndex = 50;
    this.guiClean.addControl(container);
    return container;
  }

  public showGameOverScreen(stats: { score: number; highScore: number; roomReached: number; isNewHighScore: boolean; bonuses: { id: string; stacks: number }[] }): void {
    if (!this.gameOverScreen) return;

    // Hide gameplay HUD elements & enemies HUD, keeping only Daemon popup container
    if (this.playerHealthDisplay) this.playerHealthDisplay.isVisible = false;
    if (this.healthPanel) this.healthPanel.isVisible = false;
    if (this.playerUltDisplay) this.playerUltDisplay.isVisible = false;
    if (this.topBar) this.topBar.isVisible = false;
    if (this.logPanel) this.logPanel.isVisible = false;
    if (this.statusPanel) this.statusPanel.isVisible = false;
    if (this.enemyGui) this.enemyGui.rootContainer.isVisible = false;

    this.gameOverScreen.isVisible = true;
    this.gameOverScreen.clearControls();
    
    const container = this.gameOverScreen;
    const fontFamily = 'Arcade8Bit';

    // Title
    const title = new TextBlock('go_title');
    title.text = 'SYSTEM FAILURE';
    title.color = '#FF3B5C';
    title.fontSize = 52;
    title.fontFamily = fontFamily;
    title.top = '-280px';
    title.shadowBlur = 10;
    title.shadowColor = '#FF0000';
    container.addControl(title);

    // Score Info
    const scoreLabel = new TextBlock('go_score_label');
    scoreLabel.text = 'FINAL SCORE';
    scoreLabel.color = '#9FEFE1';
    scoreLabel.fontSize = 18;
    scoreLabel.fontFamily = fontFamily;
    scoreLabel.top = '-200px';
    container.addControl(scoreLabel);

    const scoreValue = new TextBlock('go_score_value');
    scoreValue.text = stats.score.toLocaleString('en-US').padStart(8, '0');
    scoreValue.color = '#FFFFFF';
    scoreValue.fontSize = 48;
    scoreValue.fontFamily = fontFamily;
    scoreValue.top = '-150px';
    container.addControl(scoreValue);

    if (stats.isNewHighScore) {
      const newRecord = new TextBlock('go_new_record');
      newRecord.text = '!!! NEW HIGH SCORE !!!';
      newRecord.color = '#FFD782';
      newRecord.fontSize = 20;
      newRecord.fontFamily = fontFamily;
      newRecord.top = '-100px';
      container.addControl(newRecord);
    } else {
      const best = new TextBlock('go_best');
      best.text = `BEST: ${stats.highScore.toLocaleString('en-US').padStart(8, '0')}`;
      best.color = '#647D7D';
      best.fontSize = 16;
      best.fontFamily = fontFamily;
      best.top = '-100px';
      container.addControl(best);
    }

    // Room Info
    const roomInfo = new TextBlock('go_room');
    roomInfo.text = `REACHED SECTOR: ${stats.roomReached}`;
    roomInfo.color = '#7CFFEA';
    roomInfo.fontSize = 22;
    roomInfo.fontFamily = fontFamily;
    roomInfo.top = '-40px';
    container.addControl(roomInfo);

    // Upgrades container
    const numRows = Math.ceil((stats.bonuses ? stats.bonuses.length : 0) / 7) || 1;
    const bonusContainerHeight = 80 + numRows * 82;

    const bonusContainer = new Rectangle('go_bonuses');
    bonusContainer.width = '820px';
    bonusContainer.height = `${bonusContainerHeight}px`;
    bonusContainer.top = `${40 + bonusContainerHeight / 2}px`;
    bonusContainer.thickness = 1;
    bonusContainer.color = '#3B685C';
    bonusContainer.background = 'rgba(20, 30, 35, 0.4)';
    container.addControl(bonusContainer);

    const bonusLabel = new TextBlock('go_bonus_label', 'EQUIPPED MODULES');
    bonusLabel.fontFamily = fontFamily;
    bonusLabel.fontSize = 20;
    bonusLabel.color = '#7CFFEA';
    bonusLabel.top = `${-(bonusContainerHeight / 2) + 25}px`;
    bonusContainer.addControl(bonusLabel);

    const bonusStackRows = new StackPanel('go_bonus_stack_rows');
    bonusStackRows.isVertical = true;
    bonusStackRows.spacing = 14;
    bonusStackRows.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bonusStackRows.top = '24px';
    bonusContainer.addControl(bonusStackRows);

    // Detached Details Panel for Tooltips at the bottom center of the screen
    const goDetailsPanel = new Rectangle('go_details_panel');
    goDetailsPanel.width = '900px';
    goDetailsPanel.height = '130px';
    goDetailsPanel.top = `${135 + bonusContainerHeight}px`;
    goDetailsPanel.thickness = 2;
    goDetailsPanel.color = '#3B685C';
    goDetailsPanel.background = 'rgba(10, 18, 22, 0.95)';
    goDetailsPanel.cornerRadius = 6;
    goDetailsPanel.isHitTestVisible = false;
    goDetailsPanel.isPointerBlocker = false;
    container.addControl(goDetailsPanel);

    const goDetailsImg = new Image('go_details_img', '');
    goDetailsImg.width = '90px';
    goDetailsImg.height = '90px';
    goDetailsImg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    goDetailsImg.left = '20px';
    goDetailsImg.isVisible = false;
    goDetailsImg.isHitTestVisible = false;
    goDetailsPanel.addControl(goDetailsImg);

    const goTextStack = new StackPanel('go_details_text_stack');
    goTextStack.isVertical = true;
    goTextStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    goTextStack.left = '130px';
    goTextStack.width = '640px';
    goTextStack.spacing = 6;
    goTextStack.isHitTestVisible = false;
    goDetailsPanel.addControl(goTextStack);

    const goDetailsTitle = new TextBlock('go_details_title', '> MODULE METRICS');
    goDetailsTitle.fontFamily = fontFamily;
    goDetailsTitle.fontSize = 16;
    goDetailsTitle.color = '#7CFFEA';
    goDetailsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    goDetailsTitle.height = '24px';
    goDetailsTitle.isHitTestVisible = false;
    goTextStack.addControl(goDetailsTitle);

    const goDetailsDesc = new TextBlock('go_details_desc', 'Hover an equipped module to read system diagnostics.');
    goDetailsDesc.fontFamily = fontFamily;
    goDetailsDesc.fontSize = 13;
    goDetailsDesc.color = '#647D7D';
    goDetailsDesc.textWrapping = true;
    goDetailsDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    goDetailsDesc.height = '70px';
    goDetailsDesc.isHitTestVisible = false;
    goTextStack.addControl(goDetailsDesc);

    if (stats.bonuses && stats.bonuses.length > 0) {
      let currentRowStack: StackPanel | null = null;
      for (let i = 0; i < stats.bonuses.length; i++) {
        const bonus = stats.bonuses[i];
        if (i % 7 === 0) {
          currentRowStack = new StackPanel(`go_bonus_row_stack_${Math.floor(i / 7)}`);
          currentRowStack.isVertical = false;
          currentRowStack.spacing = 14;
          currentRowStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
          currentRowStack.height = '66px';
          bonusStackRows.addControl(currentRowStack);
        }

        const box = new Rectangle(`go_bonus_box_${bonus.id}`);
        box.width = '64px';
        box.height = '64px';
        box.thickness = 1;
        box.color = '#3B685C';
        box.background = 'rgba(10, 18, 22, 0.85)';
        box.isPointerBlocker = true;
        box.isHitTestVisible = true;
        box.hoverCursor = 'pointer';
        
        const img = new Image(`go_bonus_img_${bonus.id}`, buildHudAssetUrl(`bonuses/${bonus.id}.png`));
        img.width = '48px';
        img.height = '48px';
        img.isHitTestVisible = false;
        box.addControl(img);

        if (bonus.stacks > 1) {
          const badge = new Rectangle(`go_bonus_badge_${bonus.id}`);
          badge.width = '20px';
          badge.height = '16px';
          badge.thickness = 0;
          badge.background = '#FF3B5C';
          badge.cornerRadius = 2;
          badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          badge.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
          badge.left = '4px';
          badge.top = '4px';
          badge.isHitTestVisible = false;

          const badgeText = new TextBlock(`go_bonus_badge_text_${bonus.id}`, `x${bonus.stacks}`);
          badgeText.fontFamily = fontFamily;
          badgeText.fontSize = 10;
          badgeText.color = '#FFFFFF';
          badgeText.isHitTestVisible = false;
          badge.addControl(badgeText);
          box.addControl(badge);
        }

        const def = BONUS_CODEX_ENTRIES.find(d => d.id === bonus.id) || {
          name: bonus.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: 'Custom system upgrade module loaded during execution.',
          effect: 'Standard performance parameters apply.'
        };
        box.onPointerEnterObservable.add(() => {
          goDetailsImg.source = buildHudAssetUrl(`bonuses/${bonus.id}.png`);
          goDetailsImg.isVisible = true;
          goDetailsTitle.text = `${def.name.toUpperCase()} (x${bonus.stacks})`;
          goDetailsDesc.text = `${def.description}\nEffect: ${def.effect}`;
        });
        box.onPointerOutObservable.add(() => {
          goDetailsImg.isVisible = false;
          goDetailsTitle.text = '> MODULE METRICS';
          goDetailsDesc.text = 'Hover an equipped module to read system diagnostics.';
        });

        if (currentRowStack) {
          currentRowStack.addControl(box);
        }
      }
    } else {
      const noBonusText = new TextBlock('go_no_bonus', 'NO UPGRADES EQUIPPED');
      noBonusText.fontFamily = fontFamily;
      noBonusText.fontSize = 15;
      noBonusText.color = '#647D7D';
      noBonusText.isHitTestVisible = false;
      bonusStackRows.addControl(noBonusText);
    }

    // Buttons
    const buttonPanel = new StackPanel('go_buttons');
    buttonPanel.width = '340px';
    buttonPanel.top = `${240 + bonusContainerHeight}px`;
    container.addControl(buttonPanel);

    const createButton = (text: string, color: string, onClick: () => void) => {
      const btn = Button.CreateSimpleButton(`go_btn_${text}`, text);
      btn.height = '60px';
      btn.width = '340px';
      btn.color = color;
      btn.background = 'rgba(20, 30, 35, 0.8)';
      btn.thickness = 1;
      btn.cornerRadius = 4;
      btn.fontSize = 22;
      btn.fontFamily = fontFamily;
      btn.paddingTop = '10px';
      btn.onPointerUpObservable.add(() => {
        this.emitUiClickSound();
        onClick();
      });
      buttonPanel.addControl(btn);
      return btn;
    };

    createButton('MAIN MENU', UITheme.colors.textNormal, () => {
      this.hideOverlays();
      this.eventBus.emit(GameEvents.MAIN_MENU_REQUESTED);
    });
  }

  private updateScore(data: any): void {
    if (this.scoreText) {
      this.scoreText.text = `SCORE: ${Math.round(data.score).toString().padStart(8, '0')}`;
    }
  }

  private updateCombo(data: any): void {
    if (!this.comboContainer) return;
    
    if (data.combo > 1) {
      this.comboContainer.isVisible = true;
      this.comboText.text = `COMBO X${data.combo}`;
      this.comboMultiplierText.text = `${data.multiplier.toFixed(1)}X`;
      
      // Pulse effect
      this.comboMultiplierText.scaleX = 1.3;
      this.comboMultiplierText.scaleY = 1.3;
      setTimeout(() => {
        this.comboMultiplierText.scaleX = 1.0;
        this.comboMultiplierText.scaleY = 1.0;
      }, 100);
    } else {
      this.comboContainer.isVisible = false;
    }
  }

  private handleHighScoreBeaten(): void {
    // Show a small notification or visual effect on the score
    if (this.scoreText) {
      this.scoreText.color = '#FFD782';
      setTimeout(() => {
        this.scoreText.color = '#7CFFEA';
      }, 2000);
    }
  }

  private createEnemyHealthBar(enemyId: string, enemyName?: string, mesh?: AbstractMesh, healthBarOffset?: number): void {
    const existing = this.enemyHealthBars.get(enemyId);
    if (existing) {
      if (existing.anchorObserver && existing.mesh && !existing.mesh.isDisposed()) {
        existing.mesh.getScene().onBeforeRenderObservable.remove(existing.anchorObserver);
      }
      if (existing.anchor && !existing.anchor.isDisposed()) {
        existing.anchor.dispose();
      }
      existing.container.dispose();
      existing.label.dispose();
      this.enemyHealthBars.delete(enemyId);
    }

    const container = new Rectangle(`healthbar_container_${enemyId}`);
    container.width = '80px';
    container.height = '12px';
    container.background = 'rgba(0, 0, 0, 0.8)';
    container.thickness = 2;
    container.zIndex = 12;

    const bar = new Rectangle(`healthbar_${enemyId}`);
    bar.width = '100%';
    bar.height = '100%';
    bar.background = '#00FF00';
    bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bar.left = 0;
    container.addControl(bar);

    const label = new TextBlock(`healthbar_label_${enemyId}`);
    label.text = enemyName ?? 'E';
    label.fontSize = 10;
    label.color = '#FFFFFF';
    label.width = '80px';
    label.height = '20px';
      label.fontFamily = 'Arcade8Bit';
    label.zIndex = 13;

    // Keep enemy HP UI in clean HUD layer (above postprocess), but beneath gameplay popups/HUD overlays.
    this.guiClean?.addControl(container);
    this.guiClean?.addControl(label);

    let anchor: TransformNode | null = null;
    let anchorObserver: any = null;
    if (mesh) {
      anchor = new TransformNode(`health_anchor_${enemyId}`, mesh.getScene());
      anchorObserver = mesh.getScene().onBeforeRenderObservable.add(() => {
        if (mesh.isDisposed()) {
          anchor.dispose();
          mesh.getScene().onBeforeRenderObservable.remove(anchorObserver);
        } else {
          anchor.position.copyFrom(mesh.position);
        }
      });
      container.linkWithMesh(anchor as any);
      container.linkOffsetY = healthBarOffset ?? -60;
      label.linkWithMesh(anchor as any);
      label.linkOffsetY = (healthBarOffset ?? -60) - 20;
    }

    this.enemyHealthBars.set(enemyId, { container, bar, label, mesh: mesh ?? null, anchor, anchorObserver });
    this.updateEnemyHealthBarsVisibility();
  }

  private removeEnemyHealthBar(enemyId: string): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      if (bar.anchorObserver && bar.mesh && !bar.mesh.isDisposed()) {
        bar.mesh.getScene().onBeforeRenderObservable.remove(bar.anchorObserver);
      }
      if (bar.anchor && !bar.anchor.isDisposed()) {
        bar.anchor.dispose();
      }
      bar.container.dispose();
      bar.label.dispose();
      this.enemyHealthBars.delete(enemyId);
    }
    this.pendingEnemyHealthBars = this.pendingEnemyHealthBars.filter((entry) => entry.enemyId !== enemyId);
  }

  private pruneOrphanEnemyHealthBars(): void {
    for (const [enemyId, bar] of this.enemyHealthBars.entries()) {
      if (bar.mesh && bar.mesh.isDisposed()) {
        this.removeEnemyHealthBar(enemyId);
      }
    }
  }

  private addDamageNumber(position: Vector3, damage: number, sourceId: string = 'unknown'): void {
    const now = performance.now() / 1000;
    const existing = this.damageNumberCooldowns.get(sourceId);
    if (existing) {
      existing.pending += Math.max(0, damage);
      existing.lastPosition = position.clone();
      if (now - existing.lastTime < this.damageNumberCooldown) {
        return;
      }
    }

    const pending = existing?.pending ?? Math.max(0, damage);
    const basePosition = existing?.lastPosition ?? position.clone();
    this.damageNumberCooldowns.set(sourceId, { lastTime: now, pending: 0, lastPosition: basePosition.clone() });

    const text = new TextBlock(`dmg_${Date.now()}`);
    text.text = Math.max(1, Math.ceil(pending)).toString();
    text.color = '#FFFFFF';
    text.fontSize = 18;
    text.outlineColor = '#000000';
    text.outlineWidth = 2;
      text.fontFamily = 'Arcade8Bit';
    text.alpha = 1.0;
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.enemyGui?.addControl(text);

    const jitter = new Vector3(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.35
    );

    const anchor = new TransformNode(`dmg_anchor_${Date.now()}`, this.scene);
    anchor.position = basePosition.clone();
    text.linkWithMesh(anchor);
    text.linkOffsetY = -20;

    this.damageNumbers.push({
      text,
      value: damage,
      position: basePosition.add(jitter),
      timeElapsed: 0,
      duration: 1.5,
      anchor,
    });
  }

  updateEnemyHealthBar(enemyId: string, health: number, maxHealth: number): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      const percentage = (health / maxHealth) * 100;
      bar.bar.width = `${percentage}%`;
      
      if (percentage > 50) {
        bar.bar.background = '#00FF00';
      } else if (percentage > 25) {
        bar.bar.background = '#FFFF00';
      } else {
        bar.bar.background = '#FF0000';
      }
    }
  }

  private updateEnemyHealthBarsVisibility(): void {
    for (const bar of this.enemyHealthBars.values()) {
      bar.container.isVisible = this.showEnemyHealthBars;
      bar.label.isVisible = this.showEnemyHealthBars && this.showEnemyNames;
    }
  }

  update(deltaTime: number): void {
    this.updateMobileControlsState(deltaTime);
    this.updateRunUiBootstrap(deltaTime);
    this.updateDaemonPopup(deltaTime);
    this.updateBossRoomAlert(deltaTime);
    this.updateAchievementToast(deltaTime);
    this.updateIntegrityDamagePulse(deltaTime);
    this.updateBonusInsufficientFlash(deltaTime);
    this.updateBonusCreditsPulse(deltaTime);
    this.updateBonusHoverPopupPosition();
    this.updateRunBonusLayout();
    this.updateBonusCardJuice(deltaTime);
    this.pruneOrphanEnemyHealthBars();

    // Process scheduled logs in the queue
    if (this.scheduledLogs.length > 0) {
      this.scheduledLogTimer += deltaTime;
      if (this.scheduledLogTimer >= this.scheduledLogs[0].delay) {
        this.scheduledLogTimer = 0;
        const entry = this.scheduledLogs.shift();
        if (entry) {
          if (entry.message === '__CLEAR__') {
            this.logMessages = [];
            this.refreshLogLines();
          } else {
            this.addLogMessage(entry.message);
          }
        }
      }
    }

    // Periodically trigger a random diagnostic console glitch sequence
    if (this.scheduledLogs.length === 0) {
      this.randomGlitchTimer -= deltaTime;
      if (this.randomGlitchTimer <= 0) {
        this.triggerRandomConsoleGlitchSequence();
        this.randomGlitchTimer = 25 + Math.random() * 25; // 25-50 seconds cooldown
      }
    }

    // Process typing animation for command log feed
    if (this.logMessages.length > 0) {
      const newestMsg = this.logMessages[this.logMessages.length - 1];
      if (this.currentTypingLength < newestMsg.length) {
        this.typingTimer += deltaTime;
        if (this.typingTimer >= 0.025) {
          const chars = Math.floor(this.typingTimer / 0.025);
          this.typingTimer %= 0.025;
          this.currentTypingLength = Math.min(newestMsg.length, this.currentTypingLength + chars);
          this.refreshLogLines();
        }
      }
    }

    // Process cursor blinking
    this.cursorBlinkTimer += deltaTime;
    if (this.cursorBlinkTimer >= 0.25) {
      this.cursorBlinkTimer %= 0.25;
      this.showCursor = !this.showCursor;
      this.refreshLogLines();
    }

    // Update timers for animations
    this.ultTime += deltaTime;
    this.stanceTime += deltaTime;

    // Process ultimate bar animations/pulsing
    if (this.ultBarContainer && this.playerUltDisplay) {
      if (this.lastUltActive) {
        // Rapid active flash
        const activeFlash = Math.abs(Math.sin(this.ultTime * 10));
        this.ultBarContainer.color = activeFlash > 0.5 ? '#E040FF' : '#FF00A0';
        this.ultBarContainer.thickness = 2;
        // Text pulse
        this.playerUltDisplay.color = activeFlash > 0.5 ? '#E040FF' : '#FF99FF';
      } else if (this.lastUltCharge >= 1.0) {
        // Ready status pulse glow
        const readyPulse = Math.abs(Math.sin(this.ultTime * 5));
        this.ultBarContainer.thickness = 1 + readyPulse * 2;
        this.ultBarContainer.color = readyPulse > 0.5 ? '#00FF99' : '#00FFD1';
        this.playerUltDisplay.color = readyPulse > 0.5 ? '#00FF99' : '#CFFCF3';
      }
    }

    // Process stance bar animations/pulsing
    if (this.secondaryBarContainer && this.secondaryStatusText) {
      if (this.lastStanceActive) {
        this.secondaryBarContainer.thickness = 1;
        this.secondaryBarContainer.color = '#66CCFF';
      } else if (this.lastStanceRatio >= 1.0) {
        // Solid cyan
        this.secondaryBarContainer.thickness = 2;
        this.secondaryBarContainer.color = '#00FFD1';
      } else if (this.lastStanceRatio <= 0.0) {
        // Flashing border warnings for fully consumed stance
        const flashWarning = Math.abs(Math.sin(this.stanceTime * 12));
        this.secondaryBarContainer.thickness = 2;
        this.secondaryBarContainer.color = flashWarning > 0.5 ? '#FF4A66' : '#FFCC66';
        this.secondaryStatusText.color = flashWarning > 0.5 ? '#FF4A66' : '#FFCC66';
      } else if (this.lastStanceRatio >= this.lastStanceThresholdRatio) {
        // Burst ready micro-pulse
        const burstPulse = Math.abs(Math.sin(this.stanceTime * 6));
        this.secondaryBarContainer.thickness = 1 + burstPulse * 1.5;
        this.secondaryBarContainer.color = burstPulse > 0.5 ? '#7CFFEA' : '#00FFD1';
      } else {
        // Standard recharge
        this.secondaryBarContainer.thickness = 1;
        this.secondaryBarContainer.color = '#FFCC66';
      }
    }
    this.updateSecondaryBlockedFeedback(deltaTime);

    // Process pending health bars
    if (this.pendingEnemyHealthBars.length > 0) {
      const batch = this.pendingEnemyHealthBars.splice(0, 10);
      for (const data of batch) {
        this.createEnemyHealthBar(data.enemyId, data.enemyName, data.mesh, data.healthBarOffset);
      }
    }

    // Update damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dmg = this.damageNumbers[i];
      dmg.timeElapsed += deltaTime;

      if (dmg.timeElapsed >= dmg.duration) {
        dmg.text.dispose();
        dmg.anchor.dispose();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      const worldPos = dmg.position.add(new Vector3(0, 0.6 + dmg.timeElapsed * 0.6, 0));
      dmg.anchor.position.copyFrom(worldPos);
      dmg.text.alpha = 1.0 - dmg.timeElapsed / dmg.duration;
    }
  }

  public triggerRunUiBootstrapSequence(enabled: boolean): void {
    this.runUiBootstrapActive = enabled;
    this.runUiBootstrapElapsed = 0;
    if (!enabled) {
      this.setHudBootstrapProgress(1);
      this.restoreHudBootstrapVisuals();
      return;
    }
    this.setHudBootstrapProgress(0);
  }

  private updateRunUiBootstrap(deltaTime: number): void {
    if (!this.runUiBootstrapActive) return;
    this.runUiBootstrapElapsed += Math.max(0, deltaTime);
    const progress = Math.min(1, this.runUiBootstrapElapsed / 1.7);
    this.setHudBootstrapProgress(progress);
    if (progress >= 1) {
      this.runUiBootstrapActive = false;
      this.restoreHudBootstrapVisuals();
    }
  }

  private setHudBootstrapProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const glitchEnvelope = p < 0.64 ? (1 - (p / 0.64)) : 0;
    const glitchPulseA = Math.sin(this.runUiBootstrapElapsed * 71.0);
    const glitchPulseB = Math.sin(this.runUiBootstrapElapsed * 49.0 + 1.7);
    const glitchPulse = Math.max(0, (glitchPulseA * 0.76 + glitchPulseB * 0.42));
    const glitchIntensity = glitchEnvelope * glitchPulse;

    const panelReveal = (
      control: Control | null | undefined,
      start: number,
      end: number
    ) => {
      if (!control) return;
      const span = Math.max(0.001, end - start);
      const local = Math.max(0, Math.min(1, (p - start) / span));
      const eased = local * local * (3 - 2 * local);
      const flicker = 1 - (0.42 * glitchIntensity * Math.max(0, Math.sin(this.runUiBootstrapElapsed * 112 + start * 7)));
      control.alpha = eased * flicker;
      control.isVisible = eased > 0.001;
      const jitterAmp = 0.08 * glitchIntensity;
      const jitterX = Math.sin(this.runUiBootstrapElapsed * (24 + start * 11)) * jitterAmp;
      const jitterY = Math.cos(this.runUiBootstrapElapsed * (29 + end * 9)) * jitterAmp;
      control.scaleX = 1 + jitterX;
      control.scaleY = 1 + jitterY;

      this.applyHudBootstrapGlitchVisual(control, glitchIntensity);
    };

    panelReveal(this.healthPanel, 0.0, 0.26);
    panelReveal(this.logPanel, 0.12, 0.46);
    panelReveal(this.statusPanel as Control | null, 0.26, 0.62);
    panelReveal(this.statsPanel, 0.44, 0.82);
    panelReveal(this.runBonusContainer, 0.62, 0.98);
    panelReveal(this.comboContainer, 0.62, 0.98);

    if (this.pauseButton) {
      this.pauseButton.alpha = 1;
      this.pauseButton.isVisible = true;
      this.pauseButton.isEnabled = true;
      this.pauseButton.isHitTestVisible = true;
      this.pauseButton.scaleX = 1 + (0.02 * glitchIntensity * Math.sin(this.runUiBootstrapElapsed * 31));
      this.pauseButton.scaleY = 1 + (0.02 * glitchIntensity * Math.cos(this.runUiBootstrapElapsed * 28));
      this.applyHudBootstrapGlitchVisual(this.pauseButton, glitchIntensity * 0.8);
    }
  }

  private applyHudBootstrapGlitchVisual(control: Control, glitchIntensity: number): void {
    const withStyle = control as Control & { color?: string; background?: string };
    if (!this.runUiBootstrapStyleCache.has(control)) {
      this.runUiBootstrapStyleCache.set(control, {
        color: withStyle.color,
        background: withStyle.background,
      });
    }
    const cached = this.runUiBootstrapStyleCache.get(control);
    if (!cached) return;

    if (glitchIntensity <= 0.001) {
      withStyle.color = cached.color;
      withStyle.background = cached.background;
      return;
    }

    const redFlash = Math.max(0, Math.sin(this.runUiBootstrapElapsed * 66));
    const flashWeight = glitchIntensity * redFlash;
    if (withStyle.color !== undefined) {
      withStyle.color = flashWeight > 0.16 ? '#FF2F55' : (cached.color ?? withStyle.color);
    }
    if (withStyle.background !== undefined && cached.background) {
      withStyle.background = flashWeight > 0.14
        ? 'rgba(82, 6, 18, 0.88)'
        : cached.background;
    }
  }

  private restoreHudBootstrapVisuals(): void {
    for (const [control, cached] of this.runUiBootstrapStyleCache.entries()) {
      const withStyle = control as Control & { color?: string; background?: string };
      if (withStyle.color !== undefined) withStyle.color = cached.color;
      if (withStyle.background !== undefined) withStyle.background = cached.background;
      control.scaleX = 1;
      control.scaleY = 1;
      control.alpha = Math.max(control.alpha, 1);
    }
    this.runUiBootstrapStyleCache.clear();
  }

  private triggerIntegrityDamagePulse(): void {
    this.integrityDamagePulseTimer = this.integrityDamagePulseDuration;
    this.applyIntegrityDamagePulse();
  }

  private updateIntegrityDamagePulse(deltaTime: number): void {
    if (this.integrityDamagePulseTimer <= 0) return;
    this.integrityDamagePulseTimer = Math.max(0, this.integrityDamagePulseTimer - Math.max(0, deltaTime));
    this.applyIntegrityDamagePulse();
  }

  private applyIntegrityDamagePulse(): void {
    const ratio = this.integrityDamagePulseDuration > 0
      ? Math.max(0, Math.min(1, this.integrityDamagePulseTimer / this.integrityDamagePulseDuration))
      : 0;
    const pulse = ratio > 0 ? Math.sin((1 - ratio) * Math.PI) : 0;
    const intensity = ratio * (0.7 + (0.3 * pulse));

    if (this.integrityLabel) {
      this.integrityLabel.color = intensity > 0.01 ? '#FF8EA0' : '#7CFFEA';
    }
    if (this.healthBarContainer) {
      this.healthBarContainer.thickness = intensity > 0.01 ? 2 : 1;
      this.healthBarContainer.color = intensity > 0.01 ? '#FF4A66' : '#7CFFEA';
      this.healthBarContainer.scaleX = 1 + (0.06 * intensity);
      this.healthBarContainer.scaleY = 1 + (0.08 * intensity);
      this.healthBarContainer.background = intensity > 0.01
        ? 'rgba(75, 8, 16, 0.92)'
        : 'rgba(10, 30, 35, 0.7)';
    }
  }

  private clearDamageNumbers(): void {
    this.damageNumbers.forEach(dmg => {
      dmg.text.dispose();
      dmg.anchor.dispose();
    });
    this.damageNumbers = [];
  }

  private updateHealthDisplay(current: number, max: number): void {
    const roundedCurrent = Math.round(current);
    const roundedMax = Math.round(max);
    if (this.playerHealthDisplay) {
      this.playerHealthDisplay.text = `${roundedCurrent}/${roundedMax}`;
    }
    if (this.healthBarFill) {
      const percentage = Math.max(0, Math.min(1, roundedMax > 0 ? roundedCurrent / roundedMax : 0));
      this.healthBarFill.width = `${Math.floor(percentage * 100)}%`;
      if (percentage > 0.6) {
        this.healthBarFill.background = '#00FFD1';
      } else if (percentage > 0.3) {
        this.healthBarFill.background = '#FFD24A';
      } else {
        this.healthBarFill.background = '#FF4A66';
      }
    }
  }

  updateSecondaryResource(current: number, max: number, active: boolean, activationThreshold: number, secondaryActionCost: number): void {
    const clampedMax = Math.max(1, max);
    const clampedCurrent = Math.max(0, Math.min(clampedMax, current));
    const ratio = clampedCurrent / clampedMax;
    const thresholdRatio = Math.max(0, Math.min(1, activationThreshold / clampedMax));
    const secondaryActionRatio = Math.max(0, Math.min(1, secondaryActionCost / clampedMax));
    const percentage = Math.round(ratio * 100);

    this.lastStanceRatio = ratio;
    this.lastStanceActive = active;
    this.lastStanceThresholdRatio = thresholdRatio;

    if (!this.secondaryStatusText || !this.secondaryResourceBarFill) return;

    this.secondaryResourceBarFill.width = `${Math.floor(ratio * 100)}%`;
    if (this.secondaryThresholdMarker) {
      this.secondaryThresholdMarker.left = `${Math.floor(thresholdRatio * 100)}%`;
      this.secondaryThresholdMarker.width = '3px';
      this.secondaryThresholdMarker.alpha = 0.78;
      this.secondaryThresholdMarker.background = '#FFD782';
    }
    if (this.secondaryActionMarker) {
      this.secondaryActionMarker.left = `${Math.floor(secondaryActionRatio * 100)}%`;
      this.secondaryActionMarker.width = '3px';
      this.secondaryActionMarker.alpha = 0.88;
      this.secondaryActionMarker.background = '#FF4A66';
    }

    if (active) {
      this.secondaryStatusText.text = `STANCE: ${percentage}% [ACTIVE | STANCE ${Math.round(thresholdRatio * 100)}% | SKILL ${Math.round(secondaryActionRatio * 100)}%]`;
      this.secondaryStatusText.color = '#66CCFF'; // Active stance blue
      this.secondaryResourceBarFill.background = '#66CCFF';
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.color = '#66CCFF';
      }
    } else if (ratio >= 1.0) {
      this.secondaryStatusText.text = `STANCE: 100% [READY]`;
      this.secondaryStatusText.color = '#00FFD1'; // Solid matrix cyan
      this.secondaryResourceBarFill.background = '#00FFD1';
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.color = '#00FFD1';
      }
    } else if (ratio >= thresholdRatio) {
      this.secondaryStatusText.text = `STANCE: ${percentage}% [READY | STANCE ${Math.round(thresholdRatio * 100)}% | SKILL ${Math.round(secondaryActionRatio * 100)}%]`;
      this.secondaryStatusText.color = '#7CFFEA'; // Ready bright cyan
      this.secondaryResourceBarFill.background = '#7CFFEA';
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.color = '#7CFFEA';
      }
    } else if (ratio <= 0.0) {
      this.secondaryStatusText.text = `STANCE: 0% [RECHARGE | STANCE ${Math.round(thresholdRatio * 100)}% | SKILL ${Math.round(secondaryActionRatio * 100)}%]`;
      this.secondaryStatusText.color = '#FFCC66'; // Warning orange
      this.secondaryResourceBarFill.background = '#FFCC66';
    } else {
      this.secondaryStatusText.text = `STANCE: ${percentage}% [RECHARGE | STANCE ${Math.round(thresholdRatio * 100)}% | SKILL ${Math.round(secondaryActionRatio * 100)}%]`;
      this.secondaryStatusText.color = '#FFCC66';
      this.secondaryResourceBarFill.background = '#FFCC66';
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.color = '#FFCC66';
      }
    }

    // Failure overlay pass (must run after normal state, so it cannot be overwritten).
    if (this.secondaryBlockedFeedbackTimer > 0 && this.secondaryStatusText) {
      const progress = 1 - (this.secondaryBlockedFeedbackTimer / 0.9);
      const hardFlash = Math.sin(progress * 40) > 0;
      const flash = hardFlash ? '#FF1E4D' : '#FFAA66';
      this.secondaryStatusText.text = this.secondaryBlockedFeedbackMessage ?? this.secondaryStatusText.text;
      this.secondaryStatusText.color = flash;
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.thickness = 4;
        this.secondaryBarContainer.color = flash;
        this.secondaryBarContainer.background = hardFlash ? 'rgba(72, 4, 20, 0.94)' : 'rgba(62, 20, 6, 0.9)';
      }
      if (this.secondaryResourceBarFill) {
        this.secondaryResourceBarFill.background = flash;
      }
      const markerPulse = 1.2 + (Math.max(0, Math.sin(progress * 24)) * 1.5);
      if (this.secondaryThresholdMarker) {
        this.secondaryThresholdMarker.background = '#FF6A52';
        this.secondaryThresholdMarker.width = `${Math.round(4 * markerPulse)}px`;
        this.secondaryThresholdMarker.alpha = 1;
      }
      if (this.secondaryActionMarker) {
        this.secondaryActionMarker.background = this.secondaryBlockedFeedbackReason === 'secondary' ? '#FF1448' : '#FF7E58';
        this.secondaryActionMarker.width = `${Math.round(4 * (markerPulse + 0.45))}px`;
        this.secondaryActionMarker.alpha = 1;
      }
    }
  }

  updateCurrency(value: number): void {
    if (!this.currencyText) return;
    const safeValue = Math.max(0, Math.floor(value));
    this.currencyText.text = `CREDITS: ${safeValue.toString().padStart(3, '0')}`;
  }

  updateItemStatus(text: string): void {
    if (!this.itemStatusText) return;
    this.itemStatusText.text = `ITEM: ${text}`;
  }

  private updateWaveText(waveNumber: number): void {
    if (this.waveText) {
      this.waveText.text = `WAVE: ${waveNumber.toString().padStart(2, '0')}`;
    }
  }

  private resetWaveCounter(): void {
    this.waveNumber = 0;
    this.updateWaveText(this.waveNumber);
    this.logMessages = [];
    this.refreshLogLines();
  }

  private addLogMessage(message: string): void {
    if (message.includes('[') && message.includes(']')) {
      const prefix = message.split('[')[0].trim();
      const lastIndex = this.logMessages.length - 1;
      if (lastIndex >= 0) {
        const lastMsg = this.logMessages[lastIndex];
        if (lastMsg.includes('[') && lastMsg.includes(']') && lastMsg.includes(prefix)) {
          this.logMessages[lastIndex] = `> ${message}`;
          this.currentTypingLength = `> ${message}`.length;
          this.typingTimer = 0;
          this.refreshLogLines();
          return;
        }
      }
    }

    this.logMessages.push(`> ${message}`);
    if (this.logMessages.length > 6) {
      this.logMessages.shift();
    }
    this.currentTypingLength = 0;
    this.typingTimer = 0;
    this.refreshLogLines();
  }

  private refreshLogLines(): void {
    const fadeColors = [
      'rgba(46, 249, 195, 1.0)',   // Newest
      'rgba(46, 249, 195, 0.76)',
      'rgba(46, 249, 195, 0.58)',
      'rgba(46, 249, 195, 0.42)',
      'rgba(46, 249, 195, 0.28)',
      'rgba(46, 249, 195, 0.16)'   // Oldest
    ];

    const L = this.logMessages.length;
    for (let i = 0; i < this.logLines.length; i++) {
      const msgIndex = i - (6 - L);
      if (msgIndex >= 0 && msgIndex < L) {
        const msg = this.logMessages[msgIndex];
        const age = (L - 1) - msgIndex;
        if (msgIndex === L - 1) {
          const visible = msg.slice(0, this.currentTypingLength);
          this.logLines[i].text = visible + (this.showCursor ? '▮' : ' ');
        } else {
          this.logLines[i].text = msg;
        }
        this.logLines[i].color = fadeColors[Math.min(5, age)];
      } else {
        this.logLines[i].text = '';
      }
    }
  }

  private handleAchievementUnlockedEvent(data: { achievementId?: string; name?: string; description?: string }): void {
    const id = typeof data?.achievementId === 'string' ? data.achievementId : 'achievement';
    const name = typeof data?.name === 'string' && data.name.trim().length > 0
      ? data.name.trim()
      : id;
    const description = typeof data?.description === 'string' ? data.description.trim() : '';
 
    HUDManager.achievementToastQueue.push({ id, name, description });
    this.addLogMessage(`ACHIEVEMENT UNLOCKED: ${name.toUpperCase()}`);
 
    if (!HUDManager.achievementToastActive) {
      this.showNextAchievementToast();
    }
  }
 
  private showNextAchievementToast(): void {
    if (HUDManager.currentAchievement) return;

    HUDManager.currentAchievement = HUDManager.achievementToastQueue.shift() || null;
    if (!HUDManager.currentAchievement) {
      HUDManager.achievementToastActive = false;
      return;
    }

    if (!this.achievementToastContainer) {
      // If HUD is not ready, put it back and wait
      HUDManager.achievementToastQueue.unshift(HUDManager.currentAchievement);
      HUDManager.currentAchievement = null;
      return;
    }
 
    if (this.achievementToastTitle) {
      this.achievementTitleBaseText = `UNLOCKED: ${HUDManager.currentAchievement.name}`;
      this.achievementToastTitle.text = this.achievementTitleBaseText;
    }
 
    if (this.achievementToastDescription) {
      this.achievementToastDescription.text = HUDManager.currentAchievement.description || `ID: ${HUDManager.currentAchievement.id}`;
    }

    if (this.achievementIconPlaceholder && HUDManager.currentAchievement) {
      if (this.achievementToastArtwork) {
        this.achievementToastArtwork.dispose();
      }
      this.achievementToastArtwork = new Image('achievement_toast_artwork');
      const cachedImg = getCachedHudAsset(`achievements/${HUDManager.currentAchievement.id}.png`);
      if (cachedImg) {
        this.achievementToastArtwork.domImage = cachedImg;
      } else {
        this.achievementToastArtwork.source = buildHudAssetUrl(`achievements/${HUDManager.currentAchievement.id}.png`);
      }
      this.achievementToastArtwork.width = this.achievementIconPlaceholder.width;
      this.achievementToastArtwork.height = this.achievementIconPlaceholder.height;
      this.achievementToastArtwork.stretch = Image.STRETCH_UNIFORM;
      this.achievementIconPlaceholder.addControl(this.achievementToastArtwork);
    }

    const accentColor = this.getEpicToastColor(0);
    if (this.achievementToastContainer) this.achievementToastContainer.color = accentColor;
    if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.color = accentColor;
    if (this.achievementToastGlowInner) this.achievementToastGlowInner.color = accentColor;
    if (this.achievementToastAccentTop) this.achievementToastAccentTop.background = accentColor;
    if (this.achievementToastAccentSide) this.achievementToastAccentSide.background = accentColor;
    this.achievementToastPulseTime = 0;
    this.achievementTitleMarqueeEnabled = false;
    this.achievementTitleMarqueeIndex = 0;
    this.achievementTitleMarqueeTimer = 0;
    this.achievementTitleMarqueeWindowChars = 0;
    this.achievementTitleMarqueeHold = 0.6;
    this.applyAchievementToastLayout();

    HUDManager.achievementToastActive = true;
    this.achievementToastTimer = this.achievementToastDuration;
    this.achievementToastContainer.alpha = 1;
    this.achievementToastContainer.isVisible = true;
    if (this.achievementToastGlowOuter) {
      this.achievementToastGlowOuter.alpha = 0.45;
      this.achievementToastGlowOuter.isVisible = true;
    }
    if (this.achievementToastGlowInner) {
      this.achievementToastGlowInner.alpha = 0.55;
      this.achievementToastGlowInner.isVisible = true;
    }
    if (this.achievementToastGlowShimmerA) {
      this.achievementToastGlowShimmerA.alpha = 0.15;
      this.achievementToastGlowShimmerA.isVisible = true;
    }
    if (this.achievementToastAccentTop) {
      this.achievementToastAccentTop.alpha = 0.82;
      this.achievementToastAccentTop.isVisible = true;
    }
    if (this.achievementToastAccentSide) {
      this.achievementToastAccentSide.alpha = 0.74;
      this.achievementToastAccentSide.isVisible = true;
    }
  }
 
  private updateAchievementToast(deltaTime: number): void {
    if (!HUDManager.achievementToastActive) {
      if (HUDManager.achievementToastQueue.length > 0) {
        this.showNextAchievementToast();
      }
      return;
    }

    if (!this.achievementToastContainer?.isVisible) {
      // Something hidden the container, but it should be active? 
      // Force it back or reset active state
      if (this.achievementToastTimer > 0) {
        this.achievementToastContainer!.isVisible = true;
      } else {
        HUDManager.achievementToastActive = false;
      }
      return;
    }
 
    this.achievementToastTimer -= deltaTime;
    this.achievementToastPulseTime += Math.max(0, deltaTime);
    const pulse = 0.5 + (Math.sin(this.achievementToastPulseTime * 8.6) * 0.5);
    const shouldShake = this.achievementToastPulseTime < 1.0;
    const jitterX = shouldShake ? Math.sin(this.achievementToastPulseTime * 10.5) * 0.25 : 0;
    const jitterY = shouldShake ? Math.cos(this.achievementToastPulseTime * 8.8) * 0.2 : 0;
    const epicColor = this.getEpicToastColor(this.achievementToastPulseTime * 0.9);
    this.applyAchievementToastLayout(jitterX, jitterY);
    // Marquee disabled: title stays static with controlled 2-line wrapping.
    this.achievementToastContainer.color = epicColor;
    if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.color = epicColor;
    if (this.achievementToastGlowInner) this.achievementToastGlowInner.color = epicColor;
    if (this.achievementToastAccentTop) this.achievementToastAccentTop.background = epicColor;
    if (this.achievementToastAccentSide) this.achievementToastAccentSide.background = epicColor;
    if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.alpha = 0.38 + pulse * 0.34;
    if (this.achievementToastGlowInner) this.achievementToastGlowInner.alpha = 0.47 + pulse * 0.28;
    if (this.achievementToastGlowShimmerA) this.achievementToastGlowShimmerA.alpha = 0.12 + pulse * 0.12;
    if (this.achievementToastAccentTop) this.achievementToastAccentTop.alpha = 0.55 + pulse * 0.26;
    if (this.achievementToastAccentSide) this.achievementToastAccentSide.alpha = 0.50 + pulse * 0.24;
    if (this.achievementToastInnerCircleA) {
      this.achievementToastInnerCircleA.alpha = 0.20 + pulse * 0.10;
      this.achievementToastInnerCircleA.color = this.getEpicToastColor(this.achievementToastPulseTime * 0.55 + 0.4);
    }
    if (this.achievementToastInnerCircleB) {
      this.achievementToastInnerCircleB.alpha = 0.17 + pulse * 0.08;
      this.achievementToastInnerCircleB.color = this.getEpicToastColor(this.achievementToastPulseTime * 0.55 + 1.2);
    }
    
    // Fade out during last 0.4 seconds
    if (this.achievementToastTimer < 0.4) {
      const fade = Math.max(0, this.achievementToastTimer / 0.4);
      this.achievementToastContainer.alpha = fade;
      if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.alpha *= fade;
      if (this.achievementToastGlowInner) this.achievementToastGlowInner.alpha *= fade;
      if (this.achievementToastGlowShimmerA) this.achievementToastGlowShimmerA.alpha *= fade;
      if (this.achievementToastAccentTop) this.achievementToastAccentTop.alpha *= fade;
      if (this.achievementToastAccentSide) this.achievementToastAccentSide.alpha *= fade;
      if (this.achievementToastInnerCircleA) this.achievementToastInnerCircleA.alpha *= fade;
      if (this.achievementToastInnerCircleB) this.achievementToastInnerCircleB.alpha *= fade;
    }

    if (this.achievementToastTimer <= 0) {
      this.achievementToastContainer.isVisible = false;
      this.achievementToastContainer.alpha = 1.0; // Reset for next time
      this.applyAchievementToastLayout();
      if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.isVisible = false;
      if (this.achievementToastGlowInner) this.achievementToastGlowInner.isVisible = false;
      if (this.achievementToastGlowShimmerA) this.achievementToastGlowShimmerA.isVisible = false;
      if (this.achievementToastAccentTop) this.achievementToastAccentTop.isVisible = false;
      if (this.achievementToastAccentSide) this.achievementToastAccentSide.isVisible = false;
      HUDManager.achievementToastActive = false;
      HUDManager.currentAchievement = null;
      
      if (HUDManager.achievementToastQueue.length > 0) {
        this.showNextAchievementToast();
      }
    }
  }

  private applyAchievementToastLayout(jitterX: number = 0, jitterY: number = 0): void {
    if (!this.achievementToastContainer) return;

    const renderW = this.scene?.getEngine?.().getRenderWidth?.(true) ?? 1920;
    const isCompact = renderW <= 900;
    const width = isCompact ? Math.round(Math.min(500, Math.max(310, renderW * 0.9))) : 500;
    const height = isCompact ? Math.round(Math.max(134, width * 0.34)) : 140;
    const iconSize = isCompact ? 82 : 92;
    const margin = isCompact ? 12 : 18;
    const textLeft = margin + iconSize + (isCompact ? 12 : 16);
    const textWidth = Math.max(170, width - textLeft - margin);
    const pauseBottom = (() => {
      if (!this.pauseButton) return 0;
      const toNumber = (value: unknown): number => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };
      return toNumber(this.pauseButton.top) + toNumber(this.pauseButton.height);
    })();
    const top = Math.max(isCompact ? 90 : 104, pauseBottom + (isCompact ? 10 : 14));
    const left = isCompact ? 10 : 16;
    let titleSize = this.computeAchievementToastTitleSize(
      HUDManager.currentAchievement?.name ?? '',
      isCompact
    );
    const descSize = this.computeAchievementToastDescriptionSize(
      this.achievementToastDescription?.text ?? '',
      isCompact
    );

    this.achievementToastBaseLeft = left;
    this.achievementToastBaseTop = top;
    const titleTop = isCompact ? 14 : 16;
    const titleLineHeight = Math.max(16, Math.round(titleSize * 1.06));
    const titleHeightPx = Math.max(isCompact ? 52 : 50, Math.min(2 * titleLineHeight + 10, isCompact ? 64 : 66));
    const descTop = titleTop + titleHeightPx + (isCompact ? 2 : 4);
    const descHeightPx = Math.max(42, height - descTop - 10);

    this.achievementToastContainer.width = `${width}px`;
    this.achievementToastContainer.height = `${height}px`;
    this.achievementToastContainer.left = left + jitterX;
    this.achievementToastContainer.top = top + jitterY;

    if (this.achievementIconPlaceholder) {
      this.achievementIconPlaceholder.width = `${iconSize}px`;
      this.achievementIconPlaceholder.height = `${iconSize}px`;
      this.achievementIconPlaceholder.left = margin;
      this.achievementIconPlaceholder.top = Math.round((height - iconSize) * 0.5);
    }
    if (this.achievementToastTitle) {
      this.achievementToastTitle.left = textLeft;
      this.achievementToastTitle.top = titleTop;
      this.achievementToastTitle.width = `${textWidth}px`;
      this.achievementToastTitle.height = `${titleHeightPx}px`;
      this.achievementToastTitle.fontSize = titleSize;
      this.achievementToastTitle.paddingTop = '2px';
      this.achievementToastTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      this.achievementToastTitle.textWrapping = true;
      this.achievementToastTitle.lineSpacing = '2px';
    }
    this.configureAchievementTitleMarquee(textWidth, titleSize);
    if (this.achievementToastDescription) {
      this.achievementToastDescription.left = textLeft;
      this.achievementToastDescription.top = descTop;
      this.achievementToastDescription.width = `${textWidth}px`;
      this.achievementToastDescription.height = `${descHeightPx}px`;
      this.achievementToastDescription.fontSize = descSize;
    }
    if (this.achievementToastArtwork && this.achievementIconPlaceholder) {
      this.achievementToastArtwork.width = this.achievementIconPlaceholder.width;
      this.achievementToastArtwork.height = this.achievementIconPlaceholder.height;
    }

    if (this.achievementToastGlowOuter) {
      this.achievementToastGlowOuter.width = `${width + 20}px`;
      this.achievementToastGlowOuter.height = `${height + 20}px`;
      this.achievementToastGlowOuter.left = left - 10 + jitterX;
      this.achievementToastGlowOuter.top = top - 10 + jitterY;
    }
    if (this.achievementToastGlowInner) {
      this.achievementToastGlowInner.width = `${width + 4}px`;
      this.achievementToastGlowInner.height = `${height + 4}px`;
      this.achievementToastGlowInner.left = left - 2 + jitterX;
      this.achievementToastGlowInner.top = top - 2 + jitterY;
    }
    if (this.achievementToastGlowShimmerA) {
      this.achievementToastGlowShimmerA.width = `${width + 34}px`;
      this.achievementToastGlowShimmerA.height = `${height + 34}px`;
      this.achievementToastGlowShimmerA.left = left - 17 + jitterX;
      this.achievementToastGlowShimmerA.top = top - 17 + jitterY;
      this.achievementToastGlowShimmerA.color = this.getEpicToastColor(this.achievementToastPulseTime * 0.95 + 0.7);
    }
    if (this.achievementToastAccentTop) {
      this.achievementToastAccentTop.width = `${width}px`;
      this.achievementToastAccentTop.left = left + jitterX;
      this.achievementToastAccentTop.top = top - 3 + jitterY;
    }
    if (this.achievementToastAccentSide) {
      this.achievementToastAccentSide.height = `${height}px`;
      this.achievementToastAccentSide.left = left - 4 + jitterX;
      this.achievementToastAccentSide.top = top + jitterY;
    }
    if (this.achievementToastInnerCircleA) {
      const leftSweep = (this.achievementToastPulseTime * 24) % 96;
      const driftX = Math.sin(this.achievementToastPulseTime * 0.9) * 7;
      const driftY = Math.cos(this.achievementToastPulseTime * 0.7) * 5;
      const circleSize = Math.round(height * 1.95);
      this.achievementToastInnerCircleA.width = `${circleSize}px`;
      this.achievementToastInnerCircleA.height = `${circleSize}px`;
      this.achievementToastInnerCircleA.left = `${Math.round(width * 0.44 - leftSweep + driftX)}px`;
      this.achievementToastInnerCircleA.top = `${Math.round(-height * 0.52 + driftY)}px`;
    }
    if (this.achievementToastInnerCircleB) {
      const leftSweep = (this.achievementToastPulseTime * 28) % 112;
      const driftX = Math.cos(this.achievementToastPulseTime * 0.76) * 6;
      const driftY = Math.sin(this.achievementToastPulseTime * 0.88) * 4;
      const circleSize = Math.round(height * 1.38);
      this.achievementToastInnerCircleB.width = `${circleSize}px`;
      this.achievementToastInnerCircleB.height = `${circleSize}px`;
      this.achievementToastInnerCircleB.left = `${Math.round(width * 0.6 - leftSweep + driftX)}px`;
      this.achievementToastInnerCircleB.top = `${Math.round(-height * 0.22 + driftY)}px`;
    }
  }

  private configureAchievementTitleMarquee(textWidthPx: number, fontSize: number): void {
    if (!this.achievementToastTitle) return;
    const content = (this.achievementTitleBaseText || '').trim();
    if (!content) {
      this.achievementTitleMarqueeEnabled = false;
      this.achievementToastTitle.text = '';
      return;
    }

    // Disabled by design: use 2-line static wrapping instead of marquee.
    void textWidthPx;
    void fontSize;
    this.achievementTitleMarqueeEnabled = false;
    this.achievementTitleMarqueeIndex = 0;
    this.achievementTitleMarqueeTimer = 0;
    this.achievementTitleMarqueeWindowChars = 0;
    this.achievementToastTitle.text = content;
  }

  private estimateAchievementTitleWidthPx(text: string, fontSize: number): number {
    if (!text) return 0;
    const base = fontSize * 0.6;
    let width = 0;
    for (const char of text) {
      if (char === ' ') width += base * 0.4;
      else if ('ilI|.,:;!'.includes(char)) width += base * 0.42;
      else if ('mwMW@#%&'.includes(char)) width += base * 1.22;
      else width += base;
    }
    return width;
  }

  private updateAchievementTitleMarquee(deltaTime: number): void {
    if (!this.achievementTitleMarqueeEnabled || !this.achievementToastTitle) return;
    const content = (this.achievementTitleBaseText || '').trim();
    if (!content) return;

    if (this.achievementTitleMarqueeHold > 0) {
      this.achievementTitleMarqueeHold = Math.max(0, this.achievementTitleMarqueeHold - deltaTime);
      return;
    }

    this.achievementTitleMarqueeTimer += Math.max(0, deltaTime);
    const stepSeconds = 0.12;
    if (this.achievementTitleMarqueeTimer < stepSeconds) return;
    this.achievementTitleMarqueeTimer = 0;

    const maxStart = Math.max(0, content.length - Math.max(1, this.achievementTitleMarqueeWindowChars));
    if (this.achievementTitleMarqueeIndex < maxStart) {
      this.achievementTitleMarqueeIndex += 1;
    } else {
      // Reached the end: freeze on final segment, no restart loop.
      this.achievementTitleMarqueeEnabled = false;
    }
    this.renderAchievementTitleMarqueeWindow();
  }

  private renderAchievementTitleMarqueeWindow(): void {
    if (!this.achievementToastTitle) return;
    const content = (this.achievementTitleBaseText || '').trim();
    const windowChars = Math.max(8, this.achievementTitleMarqueeWindowChars || 8);

    if (!this.achievementTitleMarqueeEnabled || content.length <= windowChars) {
      this.achievementToastTitle.text = content;
      return;
    }

    const start = this.achievementTitleMarqueeIndex;
    const segment = content.slice(start, start + windowChars);
    this.achievementToastTitle.text = segment;
  }

  private computeAchievementToastTitleSize(title: string, isCompact: boolean): number {
    const len = (title || '').trim().length;
    const base = isCompact ? 20 : 23;
    if (len > 70) return base - 7;
    if (len > 58) return base - 6;
    if (len > 50) return base - 5;
    if (len > 46) return base - 4;
    if (len > 34) return base - 2;
    return base;
  }

  private computeAchievementToastDescriptionSize(description: string, isCompact: boolean): number {
    const len = (description || '').trim().length;
    const base = isCompact ? 16 : 18;
    if (len > 125) return base - 3;
    if (len > 92) return base - 2;
    if (len > 66) return base - 1;
    return base;
  }

  private getEpicToastColor(phase: number): string {
    const colors = ['#FF7BCF', '#FF9AB0', '#B98BFF', '#72C9FF', '#FF7BCF'];
    const wrapped = ((phase % (colors.length - 1)) + (colors.length - 1)) % (colors.length - 1);
    const idx = Math.floor(wrapped);
    const t = wrapped - idx;
    return this.lerpHexColor(colors[idx], colors[idx + 1], t);
  }

  private lerpHexColor(a: string, b: string, t: number): string {
    const parse = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
    const ar = parse(a, 1), ag = parse(a, 3), ab = parse(a, 5);
    const br = parse(b, 1), bg = parse(b, 3), bb = parse(b, 5);
    const rr = Math.round(ar + (br - ar) * t).toString(16).padStart(2, '0');
    const rg = Math.round(ag + (bg - ag) * t).toString(16).padStart(2, '0');
    const rb = Math.round(ab + (bb - ab) * t).toString(16).padStart(2, '0');
    return `#${rr}${rg}${rb}`;
  }

  private getRarityVisual(rarity: 'common' | 'uncommon' | 'rare' | 'epic'): {
    border: string;
    glow: string;
    glowAlpha: number;
    thickness: number;
  } {
    if (rarity === 'uncommon') {
      return { border: '#58E4A3', glow: '#1E8C5B', glowAlpha: 0.38, thickness: 3 };
    }
    if (rarity === 'rare') {
      return { border: '#57B9FF', glow: '#1A5D90', glowAlpha: 0.46, thickness: 4 };
    }
    if (rarity === 'epic') {
      return { border: '#FF8FCC', glow: '#8C2A62', glowAlpha: 0.55, thickness: 5 };
    }
    return { border: '#C0C8D3', glow: '#4B5666', glowAlpha: 0.28, thickness: 2 };
  }

  private formatCompactStackLabel(rawLabel: string): string {
    const upper = (rawLabel || '').toUpperCase();
    if (upper.includes('UNIQUE')) return 'UNIQUE';
    const limited = upper.match(/(\d+)\s*\/\s*(\d+)/);
    if (limited) return `${limited[1]}/${limited[2]}`;
    if (upper.includes('+')) {
      const current = upper.match(/(\d+)\s*\+/);
      return `${current?.[1] ?? '0'}/∞`;
    }
    return 'UNIQUE';
  }

  /**
   * Play a complete voiceline with multiple animation phases
   * @param voiceline The voiceline configuration containing message and animation phases
   */
  public async playVoiceline(voiceline: VoicelineConfig): Promise<void> {
    if (!this.daemonContainer || !this.daemonMessageText) return;

    // Prepare all frames from all phases for preloading
    const allFrames = new Set<string>();
    const phases: DaemonAnimationPhaseState[] = [];

    for (const phase of voiceline.animationSequence) {
      const normalizedEmotion = this.normalizeEmotionKey(phase.emotion);
      const emotionFrames = this.daemonAvatarSets[normalizedEmotion];
      if (!emotionFrames) {
        console.warn(`Unknown emotion: ${phase.emotion}`);
        continue;
      }

      const fullSequence = this.buildPhaseFrameSequence(emotionFrames, phase);

      emotionFrames.forEach(frame => allFrames.add(frame));
      phases.push({
        emotion: normalizedEmotion,
        frameSequence: fullSequence,
        frameInterval: phase.frameInterval ?? 0.18,
      });
    }

    // Preload all frames
    await this.preloadAvatarFrames(Array.from(allFrames));

    // Set up voiceline messaging
    const processedMessage = this.replaceKeyPlaceholders(voiceline.message);
    this.daemonFullText = processedMessage;
    this.daemonDisplayText = stripAllSpecialMarkers(processedMessage);
    this.daemonTypingIndex = 0;
    this.daemonTypingTimer = 0;
    this.daemonTypingDelayTimer = 0;
    this.daemonHoldTimer = 0;
    this.daemonPauseEndTime = 0;
    this.daemonHoldDuration = voiceline.holdDuration ?? 3.5;
    this.daemonTypingSpeed = voiceline.typingSpeed ?? 120;
    this.daemonMessageText.text = '';
    this.daemonVisible = true;
    this.daemonContainer.isVisible = true;
    this.primeDaemonTypingAudio();
    this.startDaemonPopupGlitch(1.05);

    this.daemonAvatarController.setPhases(phases, voiceline.audioDuration ?? 0);
    
    // Synthesis or play audio if provided
    if (voiceline.audioPath) {
      this.playVoicelineAudio(voiceline.audioPath);
    } else {
      // Procedural synthesis fallback
      void (async () => {
        try {
          const { buffer, duration } = await this.daemonVoiceSynth.synthesize(processedMessage, 'cold_dual');
          this.playDaemonVoiceline(buffer);
          // Sync animations if not already set by setPhases correctly
          // For now setPhases handles it but we might want to adjust duration
        } catch (e) {
          console.warn('[HUDManager] Daemon taunt synthesis failed:', e);
        }
      })();
    }

    this.updateDaemonAvatarImage();
  }

  private playVoicelineAudio(audioPath: string): void {
    try {
      const fullPath = buildHudAssetUrl(audioPath);

      const soundInstance = new Sound(
        'voiceline_audio',
        fullPath,
        this.scene,
        () => {
          // Preloaded successfully - play it
          try {
            soundInstance.play();
          } catch (err) {
            console.warn('Error playing voiceline audio:', err);
          }
        },
        {
          volume: this.voicelineVolumeMultiplier,
          autoplay: false,
          loop: false,
          spatialSound: false,
        }
      );

      this.activeVoicelineAudios.add(soundInstance);
      soundInstance.onEndedObservable.add(() => {
        this.activeVoicelineAudios.delete(soundInstance);
        soundInstance.dispose();
      });
    } catch (error) {
      console.warn(`Failed to play voiceline audio: ${audioPath}`, error);
    }
  }

  private async handleDaemonTauntEvent(data: DaemonTauntPayload): Promise<void> {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    
    const now = Date.now() / 1000;
    const isHazard = data?.voicelineId === 'tutorial_hazard' || (data?.text?.toLowerCase().includes('fragile'));
    
    // Global cooldown to prevent overlap/echo
    if (now - this.lastVoicelineTime < this.VOICELINE_GLOBAL_COOLDOWN) {
      return;
    }
    
    // Specific cooldown for hazard taunts (poison, void falls)
    if (isHazard && (now - this.lastHazardVoicelineTime < this.HAZARD_COOLDOWN)) {
      return;
    }

    if (isHazard) this.lastHazardVoicelineTime = now;
    this.lastVoicelineTime = now;

    console.log(`[HUDManager] handleDaemonTauntEvent: voicelineId=${data?.voicelineId}, text=${data?.text}`);
    
    if (data?.voicelineId) {
      const voiceline = getVoiceline(data.voicelineId);
      if (!voiceline) {
        console.warn(`[HUDManager] Voiceline not found: ${data.voicelineId}`);
        return;
      }
      await this.playVoiceline(voiceline);
    } else {
      const message = typeof data?.text === 'string' ? data.text : String(data ?? '...');
      this.showDaemonMessage(message, data?.emotion as string, { 
        holdDuration: data?.holdDuration as number,
        sequence: data?.sequence as string[],
        frameInterval: data?.frameInterval as number,
        preload: data?.preload !== false
      });
    }
  }

  public async showDaemonMessage(
    message: string,
    emotion?: string,
    options?: {
      sequence?: string[]; frameInterval?: number; holdDuration?: number; preload?: boolean;
      voicePreset?: string; canGlitchFrames?: boolean; canCrash?: boolean;
    }
  ): Promise<void> {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    
    if (this.daemonVisible) {
      this.daemonMessageQueue.push({ message, emotion, options });
      return;
    }
    
    await this.processDaemonMessage(message, emotion, options);
  }

  private async processDaemonMessage(
    message: string,
    emotion?: string,
    options?: {
      sequence?: string[]; frameInterval?: number; holdDuration?: number; preload?: boolean;
      voicePreset?: string; canGlitchFrames?: boolean; canCrash?: boolean;
    }
  ): Promise<void> {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    
    // Preload frames if requested
    if (options?.preload !== false && options?.sequence && options.sequence.length > 0) {
      await this.preloadAvatarFrames(options.sequence);
    }
    // Preload crash frames if crash is possible
    if (options?.canCrash) {
      await this.preloadAvatarFrames(this.daemonAvatarController.getCrashSequenceFrames());
    }
    
    const processedMessage = this.replaceKeyPlaceholders(message);
    this.daemonFullText = processedMessage;
    this.daemonDisplayText = stripAllSpecialMarkers(processedMessage);
    this.daemonTypingIndex = 0;
    this.daemonTypingTimer = 0;
    this.daemonTypingDelayTimer = 0;
    this.daemonHoldTimer = 0;
    this.daemonPauseEndTime = 0;
    this.daemonHoldDuration = options?.holdDuration ?? 3.5;
    this.daemonMessageText.text = '';
    this.daemonVisible = true;
    this.daemonContainer.isVisible = true;
    this.primeDaemonTypingAudio();
    if (!this.smoothDaemonAvatarMode) {
      this.startDaemonPopupGlitch(0.85);
    } else {
      this.resetDaemonPopupGlitch();
    }

    // Select synthesis preset
    const presetName = (options?.voicePreset ?? 'daemon_normal') as any;

    // Synthesis and sync
    try {
      const { buffer, duration, glitchTimestamps } = await this.daemonVoiceSynth.synthesize(processedMessage, presetName);
      this.playDaemonVoiceline(buffer);
      this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval, duration);
      
      // Schedule glitch frame overlays if allowed
      const allowFrameGlitch = this.smoothDaemonAvatarMode
        ? options?.canGlitchFrames === true
        : options?.canGlitchFrames !== false;
      if (allowFrameGlitch && glitchTimestamps.length > 0) {
        this.daemonAvatarController.scheduleGlitchFrames(glitchTimestamps);
      }

      // Handle crash+reboot sequence
      if (options?.canCrash) {
        this.scheduleCrashSequence(duration, emotion ?? 'superieur');
      }
    } catch (e) {
      console.warn('Daemon synthesis failed:', e);
      this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval);
    }
  }

  /** Schedule a crash+reboot sequence at a random point during the voiceline */
  private scheduleCrashSequence(audioDuration: number, recoveryEmotion: string): void {
    // Crash happens 40-70% through the voiceline
    const crashDelay = audioDuration * (0.4 + Math.random() * 0.3);
    setTimeout(() => {
      if (!this.daemonVisible) return;
      // Stop voice audio abruptly
      this.stopAllVoicelineAudio();
      // Garble the text
      if (this.daemonMessageText) {
        const garbled = this.daemonDisplayText.split('').map(c => Math.random() < 0.5 ? String.fromCharCode(33 + Math.random() * 93) : c).join('');
        this.daemonMessageText.text = garbled;
      }
      // Start crash animation
      this.daemonAvatarController.startCrashSequence(recoveryEmotion, 0.16, () => {
        // Crash complete — play recovery voiceline
        this.crashRecoveryVoiceline();
      });
    }, crashDelay * 1000);
  }

  /** After crash+reboot completes, play a recovery voiceline */
  private async crashRecoveryVoiceline(): Promise<void> {
    // Import crash recovery voicelines dynamically to avoid circular deps
    const { queryVoicelines, pickWeightedRandom } = await import('../data/voicelines/VoicelineDatabase');
    const recoveryLines = queryVoicelines('crash_recovery');
    const pick = pickWeightedRandom(recoveryLines, []);
    if (pick) {
      // Play the recovery line without crash possibility
      await this.showDaemonMessage(pick.message, pick.animationSequence[0]?.emotion, {
        holdDuration: pick.holdDuration,
        voicePreset: 'daemon_normal',
        canGlitchFrames: false,
        canCrash: false,
      });
    }
  }

  private playDaemonVoiceline(buffer: AudioBuffer): void {
    const audioEngine = this.getAudioEngine();
    if (!audioEngine) return;
    const ctx = (audioEngine as AudioEngineLike).audioContext;
    if (!ctx) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = ctx.createGain();
    gain.gain.value = 1.1 * this.uiVolumeMultiplier;

    source.connect(gain);
    
    if (!this.voicelineGainNode) {
      this.voicelineGainNode = ctx.createGain();
      this.voicelineGainNode.connect(ctx.destination);
    }
    this.voicelineGainNode.gain.value = this.isVoicelineMuted ? 0 : 1.0;
    
    gain.connect(this.voicelineGainNode);
    
    (source as any).associatedGainNode = gain;

    source.start(ctx.currentTime + 0.1);
    this.activeVoicelineAudios.add(source);
    source.onended = () => {
      this.activeVoicelineAudios.delete(source);
      try {
        source.disconnect();
      } catch (e) {}
      try {
        gain.disconnect();
      } catch (e) {}
    };
  }

  public setVoicelinesMuted(muted: boolean): void {
    this.isVoicelineMuted = muted;
    if (this.voicelineGainNode) {
      this.voicelineGainNode.gain.value = muted ? 0 : 1.0;
    }
    if (muted) {
      this.stopAllVoicelineAudio();
    }
  }

  private updateDaemonPopup(deltaTime: number): void {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    if (!this.daemonVisible) {
      this.resetDaemonPopupGlitch();
      return;
    }

    this.updateDaemonPopupGlitch(deltaTime);
    const nowSeconds = Date.now() / 1000;

    this.daemonAvatarController.ensureVoicelineClockStarted(nowSeconds);
    if (this.daemonAvatarController.tick(deltaTime)) {
      this.updateDaemonAvatarImage();
    }

    // Wait for typing delay before starting text display
    if (this.daemonTypingDelayTimer < this.daemonTypingDelay) {
      this.daemonTypingDelayTimer += deltaTime;
      return;
    }

    // Check if we're in a pause
    if (this.daemonPauseEndTime > 0 && nowSeconds < this.daemonPauseEndTime) {
      return; // Still paused
    }
    this.daemonPauseEndTime = 0; // Resume typing

    if (this.daemonTypingIndex < this.daemonDisplayText.length) {
      this.daemonTypingTimer += deltaTime;
      const interval = 1 / this.daemonTypingSpeed;
      while (this.daemonTypingTimer >= interval && this.daemonTypingIndex < this.daemonDisplayText.length) {
        this.daemonTypingTimer -= interval;
        
        // Check for special markers
        const marker = getSpecialMarkerAtDisplayIndex(this.daemonFullText, this.daemonTypingIndex);
        if (marker) {
          if (marker.type === 'pause') {
            this.daemonPauseEndTime = nowSeconds + marker.duration;
            this.daemonTypingIndex += marker.markerLength;
            return;
          } else if (marker.type === 'crash') {
            // Trigger mid-typing crash
            this.stopAllVoicelineAudio();
            this.daemonTypingIndex += marker.markerLength;
            this.scheduleCrashSequence(0.5, 'superieur'); // Mini-crash
            return;
          } else if (marker.type === 'glitch') {
            this.isTypingGlitched = true;
            this.typingGlitchEndIndex = this.daemonTypingIndex + marker.length;
            this.daemonTypingIndex += marker.markerLength;
            // Don't return, continue typing with glitch
          }
        }
        
        this.daemonTypingIndex += 1;
        
        // Final text assembly
        let displayedText = this.daemonDisplayText.slice(0, this.daemonTypingIndex);
        if (this.isTypingGlitched) {
          // Garble the last few characters
          const textArr = displayedText.split('');
          const glitchStart = Math.max(0, this.daemonTypingIndex - 5);
          for (let g = glitchStart; g < this.daemonTypingIndex; g++) {
            if (Math.random() < 0.7) {
              textArr[g] = this.GLITCH_CHARS[Math.floor(Math.random() * this.GLITCH_CHARS.length)];
            }
          }
          displayedText = textArr.join('');
          
          if (this.daemonTypingIndex >= this.typingGlitchEndIndex) {
            this.isTypingGlitched = false;
          }
        }

        this.daemonMessageText.text = displayedText;
        this.daemonTypewriterSynth.triggerForTypedChar();
      }
      return;
    }

    // Check if we should hide the popup
    let shouldHide = false;
    
    if (this.daemonAvatarController.hasAudioDuration()) {
      shouldHide = this.daemonAvatarController.hasVoicelineElapsed(nowSeconds);
    } else {
      // For regular taunts, use hold duration
      this.daemonHoldTimer += deltaTime;
      shouldHide = this.daemonHoldTimer >= this.daemonHoldDuration;
    }

    if (shouldHide) {
      this.daemonVisible = false;
      this.daemonContainer.isVisible = false;
      this.resetDaemonPopupGlitch();
      
      this.stopAllVoicelineAudio();
      
      this.daemonAvatarController.clearVoicelineState();
      
      if (this.daemonMessageQueue.length > 0) {
        const nextMsg = this.daemonMessageQueue.shift()!;
        void this.processDaemonMessage(nextMsg.message, nextMsg.emotion, nextMsg.options);
      }
    }
  }

  private primeDaemonTypingAudio(): void {
    const audioEngine = this.getAudioEngine();
    if (!audioEngine) return;

    const ctx = (audioEngine as AudioEngineLike).audioContext;
    if (!ctx) return;

    audioEngine.useCustomUnlockedButton = true;
    this.daemonTypewriterSynth.attachContext(ctx);
    this.daemonVoiceSynth.setAudioContext(ctx);
  }

  private stopAllVoicelineAudio(): void {
    if (this.activeVoicelineAudios.size === 0) return;
    
    this.activeVoicelineAudios.forEach(sound => {
      try {
        if (sound) {
          // Both Sound and AudioBufferSourceNode have stop()
          if (typeof (sound as any).stop === 'function') {
            (sound as any).stop();
          }
          // Babylon Sound has dispose()
          if (typeof (sound as any).dispose === 'function') {
            (sound as any).dispose();
          }
          // Disconnect associated GainNode first if present
          if ((sound as any).associatedGainNode) {
            try {
              (sound as any).associatedGainNode.disconnect();
            } catch (e) {}
          }
          // WebAudio nodes have disconnect()
          if (typeof (sound as any).disconnect === 'function') {
            (sound as any).disconnect();
          }
        }
      } catch (e) {
        // Ignore disposal errors for already cleaned up nodes
      }
    });
    this.activeVoicelineAudios.clear();
  }

  private replaceKeyPlaceholders(text: string): string {
    if (!text) return '';
    const settings = GameSettingsStore.get();
    const keybindings = settings.controls.keybindings;
    return text.replace(/\{key:(\w+)\}/g, (match, key) => {
      const binding = keybindings[key as keyof typeof keybindings];
      return binding ? formatInputKeyLabel(binding) : match;
    });
  }

  private setupDaemonTypingAudioUnlock(): void {
    const audioEngine = this.getAudioEngine();
    if (!audioEngine) return;

    audioEngine.useCustomUnlockedButton = true;

    const existingContext = (audioEngine as AudioEngineLike).audioContext;
    if (audioEngine.unlocked || existingContext?.state === 'running') {
      this.daemonTypewriterSynth.attachContext(existingContext);
      return;
    }

    const tryUnlock = () => {
      try {
        if (typeof audioEngine.unlock === 'function') {
          audioEngine.unlock();
        }
      } catch {
        // Ignore unlock errors and retry on next user gesture.
      }
      void this.daemonTypewriterSynth.unlock();
      this.daemonTypewriterSynth.attachContext((audioEngine as AudioEngineLike).audioContext);
      if (audioEngine.unlocked && this.daemonAudioUnlockHandler) {
        window.removeEventListener('pointerdown', this.daemonAudioUnlockHandler);
        window.removeEventListener('keydown', this.daemonAudioUnlockHandler);
        this.daemonAudioUnlockHandler = null;
      }
    };

    this.daemonAudioUnlockHandler = tryUnlock;
    window.addEventListener('pointerdown', tryUnlock);
    window.addEventListener('keydown', tryUnlock);
  }

  private getAudioEngine(): AudioEngineLike | undefined {
    return (this.scene.getEngine() as { audioEngine?: AudioEngineLike }).audioEngine ?? (Engine as { audioEngine?: AudioEngineLike }).audioEngine;
  }

  private startDaemonPopupGlitch(strength: number): void {
    this.daemonGlitchDuration = 0.08 + Math.min(0.12, strength * 0.05);
    this.daemonGlitchTimer = this.daemonGlitchDuration;
    this.daemonFlashDuration = 0.1 + Math.min(0.08, strength * 0.04);
    this.daemonFlashTimer = this.daemonFlashDuration;
    this.daemonFlashPeakAlpha = Math.min(0.11, 0.06 + strength * 0.025);

    if (this.daemonGlitchOverlay) {
      this.daemonGlitchOverlay.isVisible = true;
      this.daemonGlitchOverlay.alpha = 0.2;
    }
    if (this.daemonPopupFlashOverlay) {
      this.daemonPopupFlashOverlay.isVisible = true;
      this.daemonPopupFlashOverlay.alpha = this.daemonFlashPeakAlpha;
    }
  }

  private updateDaemonPopupGlitch(deltaTime: number): void {
    if (this.daemonGlitchTimer <= 0 || this.daemonGlitchDuration <= 0) {
      this.resetDaemonPopupGlitch();
      return;
    }

    this.daemonGlitchTimer = Math.max(0, this.daemonGlitchTimer - deltaTime);
    const progress = 1 - this.daemonGlitchTimer / this.daemonGlitchDuration;
    const decay = 1 - progress;
    const jitterX = (Math.random() * 2 - 1) * 5 * decay;
    const jitterY = (Math.random() * 2 - 1) * 2 * decay;

    if (this.daemonContainer) {
      this.daemonContainer.left = this.daemonBaseLeft + jitterX;
      this.daemonContainer.top = this.daemonBaseTop + jitterY;
      this.daemonContainer.alpha = 0.9 + 0.1 * decay;
      this.daemonContainer.color = decay > 0.35 ? '#FF506D' : '#FF3B5C';
    }

    if (this.daemonGlitchOverlay) {
      this.daemonGlitchOverlay.left = this.daemonBaseLeft - jitterX * 0.65;
      this.daemonGlitchOverlay.top = this.daemonBaseTop - jitterY * 0.35;
      this.daemonGlitchOverlay.alpha = 0.2 * decay;
      this.daemonGlitchOverlay.isVisible = this.daemonGlitchOverlay.alpha > 0.01;
    }

    if (this.daemonFlashTimer > 0 && this.daemonFlashDuration > 0) {
      this.daemonFlashTimer = Math.max(0, this.daemonFlashTimer - deltaTime);
      const flashDecay = this.daemonFlashTimer / this.daemonFlashDuration;
      if (this.daemonPopupFlashOverlay) {
        this.daemonPopupFlashOverlay.isVisible = true;
        this.daemonPopupFlashOverlay.alpha = this.daemonFlashPeakAlpha * flashDecay * flashDecay;
      }
    } else if (this.daemonPopupFlashOverlay) {
      this.daemonPopupFlashOverlay.alpha = 0;
      this.daemonPopupFlashOverlay.isVisible = false;
    }
  }

  private resetDaemonPopupGlitch(): void {
    this.daemonGlitchTimer = 0;
    this.daemonGlitchDuration = 0;
    this.daemonFlashTimer = 0;
    this.daemonFlashDuration = 0;
    this.daemonFlashPeakAlpha = 0;

    if (this.daemonContainer) {
      this.daemonContainer.left = this.daemonBaseLeft;
      this.daemonContainer.top = this.daemonBaseTop;
      this.daemonContainer.alpha = 1;
      this.daemonContainer.color = '#FF3B5C';
    }

    if (this.daemonGlitchOverlay) {
      this.daemonGlitchOverlay.alpha = 0;
      this.daemonGlitchOverlay.left = this.daemonBaseLeft;
      this.daemonGlitchOverlay.top = this.daemonBaseTop;
      this.daemonGlitchOverlay.isVisible = false;
    }

    if (this.daemonPopupFlashOverlay) {
      this.daemonPopupFlashOverlay.alpha = 0;
      this.daemonPopupFlashOverlay.isVisible = false;
    }
  }

  /** @deprecated Replaced by DaemonVoicelineManager */
  private getRandomTaunt(_type: 'damage' | 'clear'): { text: string; emotion: string } {
    return { text: 'System nominal.', emotion: 'blase' };
  }

  /** Expose daemon visibility state for external managers */
  public isDaemonMessageActive(): boolean {
    return this.daemonVisible;
  }
  private triggerBossRoomAlert(roomName: string): void {
    this.addLogMessage('WARNING: BOSS CHAMBER DETECTED.');
    this.bossAlertActive = true;
    this.bossAlertElapsed = 0;

    if (this.bossAlertSubtitle) {
      this.bossAlertSubtitle.text = roomName.toUpperCase();
    }
    if (this.bossAlertContainer) {
      this.bossAlertContainer.alpha = 1;
      this.bossAlertContainer.isVisible = true;
    }
    if (this.bossAlertPulseOverlay) {
      this.bossAlertPulseOverlay.alpha = 0;
      this.bossAlertPulseOverlay.isVisible = true;
    }
  }

  private updateBossRoomAlert(deltaTime: number): void {
    if (!this.bossAlertActive) return;

    this.bossAlertElapsed += deltaTime;
    const t = Math.min(1, this.bossAlertElapsed / this.bossAlertDuration);
    const pulse = Math.max(0, Math.sin(t * Math.PI * this.bossAlertPulseCount));
    const decay = 1 - t * 0.6;

    if (this.bossAlertPulseOverlay) {
      this.bossAlertPulseOverlay.alpha = 0.16 * pulse * decay;
    }

    if (this.bossAlertContainer) {
      this.bossAlertContainer.alpha = t < 0.75 ? 1 : (1 - t) / 0.25;
    }

    if (t >= 1) {
      this.bossAlertActive = false;
      if (this.bossAlertContainer) {
        this.bossAlertContainer.isVisible = false;
        this.bossAlertContainer.alpha = 1;
      }
      if (this.bossAlertPulseOverlay) {
        this.bossAlertPulseOverlay.isVisible = false;
        this.bossAlertPulseOverlay.alpha = 0;
      }
    }
  }

  private setDaemonAvatarAnimation(
    message: string,
    preferredEmotion?: string,
    customSequence?: string[],
    frameInterval?: number,
    audioDuration: number = 0
  ): void {
    if (customSequence && customSequence.length > 0) {
      this.daemonAvatarController.setLoopSequence(customSequence, frameInterval ?? 0.18);
      this.updateDaemonAvatarImage();
      return;
    }

    const emotion = this.resolveDaemonEmotion(message, preferredEmotion);
    const sequence = this.buildAvatarSequence(emotion, message);
    this.daemonAvatarController.setPingPongSequence(sequence, frameInterval ?? this.computeAvatarInterval(message, emotion));
    
    // Explicitly set audio duration if provided to sync animation loops
    if (audioDuration > 0) {
      this.daemonAvatarController.setPhases([], audioDuration);
      // Re-apply sequence because setPhases clears it
      this.daemonAvatarController.setPingPongSequence(sequence, frameInterval ?? this.computeAvatarInterval(message, emotion));
    }
    
    this.updateDaemonAvatarImage();
  }

  private resolveDaemonEmotion(message: string, preferred?: string): string {
    if (preferred) {
      const normalized = this.normalizeEmotionKey(preferred);
      if (this.daemonAvatarSets[normalized]) return normalized;
    }

    const lowered = message.toLowerCase();
    if (lowered.includes('error') || lowered.includes('failed')) return 'error';
    if (lowered.includes('bsod') || lowered.includes('crash')) return 'bsod';
    if (lowered.includes('override') || lowered.includes('root')) return 'override';
    if (lowered.includes('lol') || lowered.includes('haha')) return 'rire';
    if (lowered.includes('wait') || lowered.includes('loading')) return 'loading';
    if (lowered.includes('shock') || lowered.includes('?!') || lowered.includes('!?')) return 'surpris';

    const fallback = ['superieur', 'happy', 'bored', 'goofy'];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  private normalizeEmotionKey(emotion: string): string {
    return normalizeDaemonPresetName(emotion);
  }

  private buildAvatarSequence(emotion: string, message: string): string[] {
    const primary = this.getAvatarFrames(emotion);
    const secondary = this.getSecondaryEmotion(emotion, message);
    if (!secondary) return primary;

    const secondaryFrames = this.getAvatarFrames(secondary);
    const maxLen = Math.max(primary.length, secondaryFrames.length);
    const mixed: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      mixed.push(primary[i % primary.length]);
      mixed.push(secondaryFrames[i % secondaryFrames.length]);
    }
    return mixed;
  }

  private getSecondaryEmotion(primary: string, message: string): string | null {
    const lowered = message.toLowerCase();
    // Keep most emotions pure for stable, readable tutorial delivery.
    if (primary === 'rire' || primary === 'surpris' || primary === 'superieur') return null;
    if (primary === 'enerve') {
      // Only blend anger with error on explicit post-crash line.
      if (lowered.includes('made me crash')) return 'error';
      return null;
    }
    return null;
  }

  private computeAvatarInterval(message: string, emotion: string): number {
    const length = message.length;
    let interval = 0.08;
    if (length <= 20) interval = 0.06;
    if (length >= 80) interval = 0.12;
    if (message.includes('!') || message.includes('?')) interval = 0.05;
    if (emotion === 'rire' || emotion === 'goofy') interval = 0.07;
    if (emotion === 'bsod' || emotion === 'error') interval = 0.08;
    return interval;
  }

  private getAvatarFrames(emotion: string): string[] {
    return this.daemonAvatarSets[emotion] ?? this.daemonAvatarSets['init'];
  }

  private buildPhaseFrameSequence(emotionFrames: string[], phase: AnimationPhase): string[] {
    const mode = phase.playbackMode ?? 'forward';
    let baseSequence: string[] = [];

    if (mode === 'custom') {
      const order = (phase.frameOrder ?? [])
        .map(index => Math.floor(index))
        .filter(index => index >= 1 && index <= emotionFrames.length);

      if (order.length === 0) {
        baseSequence = emotionFrames.slice();
      } else {
        baseSequence = order.map(index => emotionFrames[index - 1]);
      }
    } else if (mode === 'pingpong') {
      if (emotionFrames.length <= 1) {
        baseSequence = emotionFrames.slice();
      } else {
        const reverseWithoutEnds = emotionFrames.slice(1, -1).reverse();
        baseSequence = [...emotionFrames, ...reverseWithoutEnds];
      }
    } else {
      baseSequence = emotionFrames.slice();
    }

    const safeCycles = Math.max(1, Math.floor(phase.cycles));
    const fullSequence: string[] = [];
    for (let i = 0; i < safeCycles; i++) {
      fullSequence.push(...baseSequence);
    }
    return fullSequence;
  }

  private updateDaemonAvatarImage(): void {
    if (!this.daemonAvatarFrameHost) return;
    const fileName = this.daemonAvatarController.getCurrentFrame();
    if (!fileName) return;
    if (this.daemonAvatarCurrentFrame === fileName) return;

    const currentControl = this.getOrCreateDaemonAvatarFrameControl(fileName);
    if (currentControl) {
      if (this.daemonAvatarCurrentFrame) {
        const prev = this.daemonAvatarFrameControls.get(this.daemonAvatarCurrentFrame);
        if (prev) prev.isVisible = false;
      } else if (this.daemonAvatarImage) {
        this.daemonAvatarImage.isVisible = false;
      }
      currentControl.isVisible = true;
      this.daemonAvatarCurrentFrame = fileName;
      return;
    }

    // Keep the previous frame visible until the next one is fully loaded,
    // to avoid one-frame black flashes on cache misses.
    void this.loadAvatarFrame(fileName).then(() => {
      if (!this.daemonAvatarFrameHost) return;
      const current = this.daemonAvatarController.getCurrentFrame();
      if (current !== fileName) return;
      const nextControl = this.getOrCreateDaemonAvatarFrameControl(fileName);
      if (!nextControl) return;
      if (this.daemonAvatarCurrentFrame) {
        const prev = this.daemonAvatarFrameControls.get(this.daemonAvatarCurrentFrame);
        if (prev) prev.isVisible = false;
      } else if (this.daemonAvatarImage) {
        this.daemonAvatarImage.isVisible = false;
      }
      nextControl.isVisible = true;
      this.daemonAvatarCurrentFrame = fileName;
    });
  }

  private getOrCreateDaemonAvatarFrameControl(fileName: string): Image | null {
    const existing = this.daemonAvatarFrameControls.get(fileName);
    if (existing) return existing;
    if (!this.daemonAvatarFrameHost) return null;

    const resolvedSrc = this.avatarResolvedSrcCache.get(fileName);
    const cached = this.avatarImageCache.get(fileName);
    if (!resolvedSrc || !cached || !cached.complete) return null;

    const frameImage = new Image(`daemon_avatar_frame_${fileName}`, resolvedSrc);
    frameImage.width = '160px';
    frameImage.height = '160px';
    frameImage.stretch = Image.STRETCH_UNIFORM;
    frameImage.isVisible = false;
    this.daemonAvatarFrameHost.addControl(frameImage);
    this.daemonAvatarFrameControls.set(fileName, frameImage);
    return frameImage;
  }

  private getAvatarFrameSrc(fileName: string, normalization: 'NFC' | 'NFD' = 'NFC'): string {
    const normalizedBase = getHudAssetBaseUrl();
    const normalizedFileName = fileName.normalize(normalization);
    const encodedFileName = encodeURIComponent(normalizedFileName);
    return `${normalizedBase}avatar_frames_cutout2/${encodedFileName}`;
  }

  /**
   * Preload specific avatar frames into cache
   * @param frames Array of filenames to preload
   */
  private preloadAvatarFrames(frames: string[]): Promise<void> {
    const tasks = frames.map((fileName) => async () => {
      if (this.avatarImageCache.has(fileName)) return;
      await this.loadAvatarFrame(fileName);
    });
    const concurrency = getAdaptivePreloadConcurrency(4);
    return mapWithConcurrency(tasks, concurrency).then(() => {});
  }

  /**
   * Load a single avatar frame with fallback for Unicode normalization issues
   * @param fileName The frame filename to load
   */
  private loadAvatarFrame(fileName: string): Promise<void> {
    const existingPromise = this.avatarFrameLoadPromises.get(fileName);
    if (existingPromise) {
      return existingPromise;
    }

    const loadPromise = new Promise<void>((resolve) => {
      const srcNFD = this.getAvatarFrameSrc(fileName, 'NFD');
      const srcNFC = this.getAvatarFrameSrc(fileName, 'NFC');
      void loadImageWithRetry([srcNFD, srcNFC], 2).then((loaded) => {
        if (!loaded) {
          console.warn(`Failed to preload avatar frame: ${fileName}`);
          console.warn(`  Tried NFD: ${srcNFD}`);
          console.warn(`  Tried NFC: ${srcNFC}`);
          resolve();
          return;
        }
        this.avatarImageCache.set(fileName, loaded.image);
        this.avatarResolvedSrcCache.set(fileName, loaded.resolvedUrl);
        this.getOrCreateDaemonAvatarFrameControl(fileName);
        resolve();
      });
    });
    this.avatarFrameLoadPromises.set(fileName, loadPromise);
    loadPromise.finally(() => {
      this.avatarFrameLoadPromises.delete(fileName);
    });
    return loadPromise;
  }

  /**
   * Preload all avatar emotion sets for instant playback
   * Called during initialization
   */
  public async preloadAllAvatarFrames(): Promise<void> {
    if (this.avatarPreloadPromise) {
      return this.avatarPreloadPromise;
    }

    const allFrames = new Set<string>();
    for (const emotionFrames of Object.values(this.daemonAvatarSets)) {
      emotionFrames.forEach(frame => allFrames.add(frame));
    }

    console.log(`Preloading ${allFrames.size} avatar frames...`);
    this.avatarPreloadPromise = this.preloadAvatarFrames(Array.from(allFrames));
    
    try {
      await this.avatarPreloadPromise;
      console.log(`✓ Avatar frames preloaded (${this.avatarImageCache.size} images cached)`);
    } catch (err) {
      console.warn('Some avatar frames failed to preload:', err);
    }

    return this.avatarPreloadPromise;
  }

  public async preloadBonusAndAchievementArtworks(bonusIds: string[], achievementIds: string[]): Promise<void> {
    const tasks: Array<() => Promise<void | HTMLImageElement | null>> = [];
    bonusIds.forEach((id) => tasks.push(() => preloadHudAsset(`bonuses/${id}.png`)));
    achievementIds.forEach((id) => tasks.push(() => preloadHudAsset(`achievements/${id}.png`)));
    const concurrency = getAdaptivePreloadConcurrency(5);
    await mapWithConcurrency(tasks, concurrency);
    console.log(`✓ Bonus and achievement artworks preloaded.`);
  }

  toggleDisplay(enabled: boolean): void {
    this.isEnabled = enabled;
    this.guiFx.rootContainer.isVisible = enabled;
    this.guiClean.rootContainer.isVisible = enabled;
  }

  showStartScreen(): void {
    this.showMainMenu();
    this.setHudVisible(false);
  }



  showRoomClearScreen(): void {
    if (this.roomClearScreen) this.roomClearScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);
  }

  showBonusChoices(
    choices: HudBonusChoice[],
    currency: number,
    rerollCost: number,
    selectionState?: BonusSelectionUiState,
  ): void {
    if (!this.bonusScreen) return;
    const wasBonusHidden = !this.bonusScreen.isVisible;
    this.allowDaemonDuringOverlays = true;
    this.bonusScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);
    if (this.pauseButton) this.pauseButton.isVisible = true;
    if (this.healthPanel) this.healthPanel.isVisible = true;
    if (this.playerHealthDisplay) this.playerHealthDisplay.isVisible = true;
    if (this.topBar) this.topBar.isVisible = false;
    if (this.statusPanel) this.statusPanel.isVisible = false;
    if (this.runBonusContainer) this.runBonusContainer.isVisible = false;
    if (this.comboContainer) this.comboContainer.isVisible = false;
    if (this.logPanel) this.logPanel.isVisible = false;
    this.ensureBonusUiPool();
    if (!this.bonusDynamicRoot || !this.bonusRerollButton || !this.bonusFullHealButton) {
      console.warn('[HUDManager] Bonus UI pool incomplete, aborting showBonusChoices safely.');
      return;
    }

    const freePicksRemaining = Math.max(0, Math.floor(selectionState?.freePicksRemaining ?? 1));
    const paidRareChoice = selectionState?.paidRareChoice ?? null;
    const paidRareCost = Math.max(1, Math.floor(selectionState?.paidRareCost ?? (rerollCost * 5)));
    const paidRarePurchased = !!selectionState?.paidRarePurchased;
    const selectedBonusIds = new Set(selectionState?.selectedBonusIds ?? []);
    const rerollEnabled = selectionState?.rerollEnabled ?? true;
    const hideRerollButton = !!selectionState?.hideRerollButton;
    const fullHealCost = Math.max(1, Math.floor(selectionState?.fullHealCost ?? (rerollCost * 3)));
    const hideFullHealButton = !!selectionState?.hideFullHealButton;
    const forceFullHealClickable = !!selectionState?.forceFullHealClickable;
    const playerHealthCurrent = Math.max(0, Math.floor(selectionState?.playerHealthCurrent ?? 0));
    const playerHealthMax = Math.max(playerHealthCurrent, Math.floor(selectionState?.playerHealthMax ?? playerHealthCurrent));
    const missingHealth = Math.max(0, playerHealthMax - playerHealthCurrent);

    for (const child of this.bonusScreen.children) {
      if (child.name === 'CHOOSE BONUS_title') {
        child.isVisible = true;
        if (child instanceof TextBlock) {
          child.top = '-350px';
        }
      }
    }

    const dynamicRoot = this.bonusDynamicRoot!;
    if (this.bonusCreditsText) {
      this.bonusCreditsText.text = `CREDITS: ${String(Math.max(0, Math.floor(currency))).padStart(3, '0')}`;
    }
    if (wasBonusHidden) {
      this.bonusCreditsPulseTimer = this.bonusCreditsPulseDuration;
    }
    this.bonusButtons = [];
    this.bonusDynamicControls = [];
    this.bonusCardClickState = [];
    this.activeBonusCardFx = [];
    for (const ctrl of this.bonusCardPool.values()) {
      ctrl.button.isVisible = false;
      ctrl.button.isEnabled = false;
    }
    if (this.bonusSubtitle) {
      this.bonusSubtitle.text = freePicksRemaining > 1 ? `PICK ${freePicksRemaining} FREE BONUSES` : 'PICK 1 FREE BONUS';
      this.bonusSubtitle.isVisible = true;
    }
    this.hideBonusHoverPopup();

    const paidOfferVisible = !!paidRareChoice;
    const cards: Array<{
      id: string;
      title: string;
      description: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic';
      stackLabel: string;
      isPaid: boolean;
      isSelected: boolean;
      isEnabled: boolean;
      isAffordable?: boolean;
      cost?: number;
      footerLabel: string;
    }> = choices.map((choice) => ({
      id: choice.id,
      title: choice.title,
      description: choice.description ?? '',
      rarity: choice.rarity ?? 'common',
      stackLabel: choice.stackLabel ?? '',
      isPaid: false,
      isSelected: selectedBonusIds.has(choice.id),
      isEnabled: !selectedBonusIds.has(choice.id),
      footerLabel: 'FREE',
    }));

    if (paidOfferVisible && paidRareChoice) {
      const paidAlreadyObtained = selectedBonusIds.has(paidRareChoice.id) || paidRarePurchased;
      const paidEnabled = !paidAlreadyObtained;
      const paidAffordable = currency >= paidRareCost;
      cards.push({
        id: paidRareChoice.id,
        title: paidRareChoice.title,
        description: paidRareChoice.description ?? '',
        rarity: paidRareChoice.rarity ?? 'rare',
        stackLabel: paidRareChoice.stackLabel ?? '',
        isPaid: true,
        isSelected: paidAlreadyObtained,
        isEnabled: paidEnabled,
        isAffordable: paidAffordable,
        cost: paidRareCost,
        footerLabel: paidAffordable ? `${paidRareCost} CREDITS` : `${paidRareCost} CREDITS`,
      });
    }

    const totalCards = Math.max(1, cards.length);
    const viewportWidth = this.scene.getEngine().getRenderWidth(true);
    const maxLayoutWidth = Math.max(980, Math.min(1860, Math.floor(viewportWidth * 0.9)));
    const gap = totalCards >= 6 ? 14 : totalCards >= 5 ? 16 : totalCards >= 4 ? 20 : 24;
    const cardWidth = Math.max(220, Math.min(300, Math.floor((maxLayoutWidth - ((totalCards - 1) * gap)) / totalCards)));
    const cardScale = cardWidth / 300;
    const cardHeight = Math.max(320, Math.floor(cardWidth * 1.38));
    const totalWidth = (totalCards * cardWidth) + ((totalCards - 1) * gap);
    const startLeft = -Math.floor(totalWidth / 2) + Math.floor(cardWidth / 2);
    const cardTop = totalCards >= 5 ? -26 : -10;
    const titleFontSize = Math.max(18, Math.floor(24 * cardScale));
    const labelFontSize = Math.max(13, Math.floor(16 * cardScale));
    const descriptionFontSize = Math.max(12, Math.floor(15 * cardScale));
    const stackFontSize = Math.max(14, Math.floor(17 * cardScale));
    const artworkGlowSize = Math.floor(180 * cardScale);
    const artworkFrameSize = Math.floor(170 * cardScale);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const poolKey = `${card.id}:${card.isPaid ? 'paid' : 'free'}`;
      const uiCard = this.getOrCreateBonusCard(poolKey);
      const rarityTitleStyle = this.getRarityVisual(card.rarity);
      const rarityStyle = card.isPaid
        ? { border: '#F3C872', glow: '#8D5E17', glowAlpha: 0.55, thickness: 4 }
        : rarityTitleStyle;
      const leftPx = startLeft + (i * (cardWidth + gap));
      const btn = uiCard.button;
      btn.width = `${cardWidth}px`;
      btn.height = `${cardHeight}px`;
      btn.color = rarityStyle.border;
      if (card.isPaid) {
        btn.background = (card.isAffordable ?? true) ? 'rgba(41, 29, 14, 0.94)' : 'rgba(52, 25, 24, 0.92)';
      } else if (card.isSelected) {
        btn.background = 'rgba(45, 49, 57, 0.9)';
      } else {
        btn.background = 'rgba(14, 17, 22, 0.92)';
      }
      btn.thickness = rarityStyle.thickness;
      btn.alpha = card.isSelected ? 0.58 : (card.isEnabled ? 1 : 0.74);
      btn.left = `${leftPx}px`;
      btn.top = `${cardTop}px`;
      btn.isEnabled = card.isEnabled;
      btn.isVisible = true;
      btn.onPointerEnterObservable.clear();
      btn.onPointerOutObservable.clear();
      this.bonusCardClickState[i] = { id: card.id, isPaid: card.isPaid, cost: card.cost };
      if (btn.parent !== dynamicRoot) {
        if (btn.parent) {
          (btn.parent as any).removeControl?.(btn);
        }
        dynamicRoot.addControl(btn);
      }
      this.bonusButtons.push(btn);
      uiCard.title.text = card.title;
      uiCard.title.color = rarityTitleStyle.border;
      uiCard.title.fontSize = titleFontSize;
      uiCard.title.top = `${Math.round(-154 * cardScale)}px`;
      uiCard.modeText.text = '';
      uiCard.modeText.isVisible = false;
      uiCard.modeText.color = card.isSelected ? '#B7C0CD' : (card.isPaid ? '#FFD782' : '#9EF3C4');
      uiCard.modeText.fontSize = labelFontSize;
      uiCard.modeText.top = `${Math.round(-142 * cardScale)}px`;
      uiCard.rarityText.text = '';
      uiCard.rarityText.isVisible = false;
      uiCard.artworkGlow.width = `${artworkGlowSize}px`;
      uiCard.artworkGlow.height = `${artworkGlowSize}px`;
      uiCard.artworkGlow.background = rarityStyle.glow;
      uiCard.artworkGlow.alpha = Math.max(0.1, rarityStyle.glowAlpha * 0.65);
      uiCard.artworkGlow.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.energyHalo.width = `${Math.floor(artworkFrameSize * 1.26)}px`;
      uiCard.energyHalo.height = `${Math.floor(artworkFrameSize * 1.26)}px`;
      uiCard.energyHalo.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.energyWaveA.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.energyWaveB.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.auraShellA.width = `${Math.floor(artworkFrameSize * 1.15)}px`;
      uiCard.auraShellA.height = `${Math.floor(artworkFrameSize * 1.08)}px`;
      uiCard.auraShellA.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.auraShellB.width = `${Math.floor(artworkFrameSize * 1.22)}px`;
      uiCard.auraShellB.height = `${Math.floor(artworkFrameSize * 1.16)}px`;
      uiCard.auraShellB.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.auraShellC.width = `${Math.floor(artworkFrameSize * 1.28)}px`;
      uiCard.auraShellC.height = `${Math.floor(artworkFrameSize * 1.24)}px`;
      uiCard.auraShellC.top = `${Math.round(-6 * cardScale)}px`;
      uiCard.artworkFrame.width = `${artworkFrameSize}px`;
      uiCard.artworkFrame.height = `${artworkFrameSize}px`;
      uiCard.artworkFrame.thickness = rarityStyle.thickness;
      uiCard.artworkFrame.color = rarityStyle.border;
      uiCard.artworkFrame.top = `${Math.round(-6 * cardScale)}px`;
      const cachedBonusImg = getCachedHudAsset(`bonuses/${card.id}.png`);
      if (cachedBonusImg) {
        uiCard.artworkImg.domImage = cachedBonusImg;
      } else {
        uiCard.artworkImg.source = buildHudAssetUrl(`bonuses/${card.id}.png`);
      }
      uiCard.artworkImg.width = `${artworkFrameSize}px`;
      uiCard.artworkImg.height = `${artworkFrameSize}px`;
      uiCard.description.text = card.description;
      uiCard.description.fontSize = descriptionFontSize;
      uiCard.description.width = `${Math.max(170, cardWidth - 48)}px`;
      uiCard.description.height = `${Math.max(72, Math.floor(84 * cardScale))}px`;
      uiCard.description.top = `${Math.round(114 * cardScale)}px`;
      const compactStack = this.formatCompactStackLabel(card.stackLabel);
      const bottomMeta = `${card.footerLabel}  •  ${compactStack}`;
      uiCard.stackText.text = bottomMeta;
      uiCard.stackText.color = card.isPaid
        ? ((card.isAffordable ?? true) ? '#FFD782' : '#FF9A9A')
        : '#BDEED8';
      uiCard.stackText.fontSize = stackFontSize;
      uiCard.stackText.top = `${Math.round(186 * cardScale)}px`;
      uiCard.selectedTag.isVisible = card.isSelected;
      uiCard.selectedTag.fontSize = Math.max(12, Math.floor(14 * cardScale));
      uiCard.selectedTag.top = `${Math.round(190 * cardScale)}px`;
      uiCard.lockText.isVisible = false;
      uiCard.lockText.fontSize = Math.max(12, Math.floor(14 * cardScale));
      uiCard.lockText.top = `${Math.round(190 * cardScale)}px`;

      this.activeBonusCardFx.push({
        id: card.id,
        idSeed: Array.from(card.id).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 7),
        rarity: card.rarity,
        isPaid: card.isPaid,
        affordable: card.isAffordable ?? true,
        selected: card.isSelected,
        button: btn,
        artworkGlow: uiCard.artworkGlow,
        energyWaveA: uiCard.energyWaveA,
        energyWaveB: uiCard.energyWaveB,
        energyHalo: uiCard.energyHalo,
        auraShellA: uiCard.auraShellA,
        auraShellB: uiCard.auraShellB,
        auraShellC: uiCard.auraShellC,
        title: uiCard.title,
      });

      const showCardHover = () => {
        const credits = Math.max(0, Math.floor(currency));
        if (card.isPaid) {
          const cost = Math.max(0, Math.floor(card.cost ?? 0));
          if ((card.isAffordable ?? false)) {
            this.showBonusHoverPopup(`PAID PICK • ${credits}/${cost} CREDITS • FREE PICKS LEFT: ${freePicksRemaining}`, '#FFD782');
          } else {
            const missing = Math.max(0, cost - credits);
            this.showBonusHoverPopup(`PAID PICK • NEED ${missing} MORE CREDITS (${credits}/${cost})`, '#FF9A9A');
          }
          return;
        }
        const remainingAfter = Math.max(0, freePicksRemaining - 1);
        if (remainingAfter > 0) {
          this.showBonusHoverPopup(`FREE PICK • ${remainingAfter} FREE PICK${remainingAfter > 1 ? 'S' : ''} AFTER THIS`, '#AEEFE2');
        } else {
          this.showBonusHoverPopup('FREE PICK • THIS WILL START THE NEXT WAVE', '#8CFFC3');
        }
      };
      btn.onPointerEnterObservable.add(showCardHover);
      btn.onPointerOutObservable.add(() => {
        this.hideBonusHoverPopup();
      });
      btn.onPointerDownObservable.add(() => {
        // Mobile/touch fallback: hold briefly to read tooltip.
        showCardHover();
      });
      btn.onPointerUpObservable.add(() => {
        this.emitUiClickSound();
        this.hideBonusHoverPopup();
      });
    }

    const actionButtonsStacked = viewportWidth < 1300;
    const actionTop = Math.round((cardHeight / 2) + 52);
    const actionButtonWidth = actionButtonsStacked ? 380 : 300;
    const actionSecondRowTop = actionTop + 60;

    const rerollButton = this.bonusRerollButton!;
    this.bonusCurrentRerollCost = rerollCost;
    if (rerollButton.textBlock) {
      rerollButton.textBlock.text = `REROLL  -  ${rerollCost} CREDITS`;
    }
    rerollButton.width = `${actionButtonWidth}px`;
    rerollButton.height = '52px';
    rerollButton.top = `${actionTop}px`;
    rerollButton.left = actionButtonsStacked ? '0px' : '-178px';
    const rerollButtonEnabled = rerollEnabled;
    const rerollAffordable = currency >= rerollCost;
    rerollButton.background = rerollButtonEnabled ? (rerollAffordable ? '#2F3D55' : '#3B2020') : '#2A2A2A';
    rerollButton.isEnabled = rerollButtonEnabled;
    rerollButton.isVisible = !hideRerollButton;
    rerollButton.onPointerEnterObservable.clear();
    rerollButton.onPointerOutObservable.clear();
    const showRerollHover = () => {
      if (!rerollButtonEnabled) {
        this.showBonusHoverPopup('REROLL DISABLED UNTIL YOU RESOLVE CURRENT PICKS', '#9AA6B8');
        return;
      }
      if (rerollAffordable) {
        this.showBonusHoverPopup(`${currency}/${rerollCost} CREDITS`, '#A9C9FF');
      } else {
        this.showBonusHoverPopup(`NEED ${Math.max(0, rerollCost - currency)} MORE CREDITS`, '#FF9A9A');
      }
    };
    rerollButton.onPointerEnterObservable.add(showRerollHover);
    rerollButton.onPointerOutObservable.add(() => {
      this.hideBonusHoverPopup();
    });
    rerollButton.onPointerDownObservable.add(() => {
      showRerollHover();
    });
    rerollButton.onPointerUpObservable.add(() => {
      this.emitUiClickSound();
      this.hideBonusHoverPopup();
    });

    const fullHealEnabled = missingHealth > 0 || forceFullHealClickable;
    const fullHealAffordable = currency >= fullHealCost;
    const fullHealLabel = missingHealth > 0
      ? `FULL HEAL  -  ${fullHealCost} CREDITS`
      : 'FULL HEAL  -  HP FULL';
    const fullHealButton = this.bonusFullHealButton!;
    this.bonusCurrentFullHealCost = fullHealCost;
    if (fullHealButton.textBlock) {
      fullHealButton.textBlock.text = fullHealLabel;
    }
    fullHealButton.width = `${actionButtonWidth}px`;
    fullHealButton.height = '52px';
    fullHealButton.top = `${actionButtonsStacked ? actionSecondRowTop : actionTop}px`;
    fullHealButton.left = actionButtonsStacked ? '0px' : '178px';
    fullHealButton.background = fullHealEnabled ? (fullHealAffordable ? '#2E4A3A' : '#3B2020') : '#2A2A2A';
    fullHealButton.isEnabled = fullHealEnabled;
    fullHealButton.isVisible = !hideFullHealButton;
    fullHealButton.onPointerEnterObservable.clear();
    fullHealButton.onPointerOutObservable.clear();
    const showFullHealHover = () => {
      if (!fullHealEnabled) {
        this.showBonusHoverPopup('ALREADY AT MAX INTEGRITY', '#9AA6B8');
        return;
      }
      if (fullHealAffordable) {
        this.showBonusHoverPopup(`${currency}/${fullHealCost} CREDITS`, '#A9FFC7');
      } else {
        this.showBonusHoverPopup(`NEED ${Math.max(0, fullHealCost - currency)} MORE CREDITS`, '#FF9A9A');
      }
    };
    fullHealButton.onPointerEnterObservable.add(showFullHealHover);
    fullHealButton.onPointerOutObservable.add(() => {
      this.hideBonusHoverPopup();
    });
    fullHealButton.onPointerDownObservable.add(() => {
      showFullHealHover();
    });
    fullHealButton.onPointerUpObservable.add(() => {
      this.emitUiClickSound();
      this.hideBonusHoverPopup();
    });
  }

  private ensureBonusUiPool(): void {
    if (!this.bonusScreen) return;
    if (this.bonusDynamicRoot) {
      this.ensureBonusActionControls(this.bonusDynamicRoot);
      return;
    }

    const dynamicRoot = new Rectangle('bonus_dynamic_root');
    dynamicRoot.width = 1;
    dynamicRoot.height = 1;
    dynamicRoot.thickness = 0;
    dynamicRoot.background = 'rgba(0,0,0,0)';
    dynamicRoot.isPointerBlocker = false;
    dynamicRoot.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    dynamicRoot.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.bonusScreen.addControl(dynamicRoot);
    this.bonusDynamicRoot = dynamicRoot;

    this.bonusSubtitle = new TextBlock('bonus_shop_subtitle');
    this.bonusSubtitle.color = '#FFD782';
    this.bonusSubtitle.fontSize = 20;
    this.bonusSubtitle.fontFamily = 'Arcade8Bit';
    this.bonusSubtitle.top = '-292px';
    this.bonusSubtitle.height = '30px';
    dynamicRoot.addControl(this.bonusSubtitle);

    this.bonusCreditsPanel = new Rectangle('bonus_credits_panel');
    this.bonusCreditsPanel.width = '300px';
    this.bonusCreditsPanel.height = '84px';
    this.bonusCreditsPanel.thickness = 1;
    this.bonusCreditsPanel.cornerRadius = 5;
    this.bonusCreditsPanel.color = '#2EF9C3';
    this.bonusCreditsPanel.background = 'rgba(0, 0, 0, 0.55)';
    this.bonusCreditsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.bonusCreditsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.bonusCreditsPanel.left = '-28px';
    this.bonusCreditsPanel.top = '28px';
    dynamicRoot.addControl(this.bonusCreditsPanel);

    this.bonusCreditsText = new TextBlock('bonus_credits_text');
    this.bonusCreditsText.text = 'CREDITS: 000';
    this.bonusCreditsText.fontSize = 34;
    this.bonusCreditsText.fontFamily = 'Arcade8Bit';
    this.bonusCreditsText.color = '#FFD782';
    this.bonusCreditsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.bonusCreditsText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.bonusCreditsPanel.addControl(this.bonusCreditsText);

    this.ensureBonusActionControls(dynamicRoot);

    this.bonusHoverPopup = new Rectangle('bonus_hover_popup');
    this.bonusHoverPopup.width = '640px';
    this.bonusHoverPopup.height = '56px';
    this.bonusHoverPopup.thickness = 1;
    this.bonusHoverPopup.cornerRadius = 4;
    this.bonusHoverPopup.color = '#2EF9C3';
    this.bonusHoverPopup.background = 'rgba(0, 0, 0, 0.86)';
    this.bonusHoverPopup.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.bonusHoverPopup.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.bonusHoverPopup.isPointerBlocker = false;
    this.bonusHoverPopup.isVisible = false;
    this.bonusHoverPopup.zIndex = 1810;
    dynamicRoot.addControl(this.bonusHoverPopup);

    this.bonusHoverPopupText = new TextBlock('bonus_hover_popup_text');
    this.bonusHoverPopupText.fontSize = 18;
    this.bonusHoverPopupText.fontFamily = 'Arcade8Bit';
    this.bonusHoverPopupText.color = '#AEEFE2';
    this.bonusHoverPopupText.textWrapping = false;
    this.bonusHoverPopupText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.bonusHoverPopupText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.bonusHoverPopup.addControl(this.bonusHoverPopupText);

    const insufficientOverlay = new Rectangle('bonus_insufficient_overlay');
    insufficientOverlay.width = 1;
    insufficientOverlay.height = 1;
    insufficientOverlay.thickness = 0;
    insufficientOverlay.background = '#FF2A3B';
    insufficientOverlay.alpha = 0;
    insufficientOverlay.isVisible = false;
    insufficientOverlay.isPointerBlocker = false;
    dynamicRoot.addControl(insufficientOverlay);
    this.bonusInsufficientFlashOverlay = insufficientOverlay;
  }

  private ensureBonusActionControls(dynamicRoot: Rectangle): void {
    if (!this.bonusRerollButton) {
      const rerollButton = Button.CreateSimpleButton('bonus_reroll', 'REROLL');
      rerollButton.cornerRadius = 8;
      rerollButton.thickness = 2;
      rerollButton.color = '#FFFFFF';
      rerollButton.fontFamily = 'Arcade8Bit';
      rerollButton.onPointerUpObservable.add(() => {
        this.emitUiClickSound();
        this.eventBus.emit(GameEvents.BONUS_REROLL_REQUESTED, { cost: this.bonusCurrentRerollCost });
      });
      dynamicRoot.addControl(rerollButton);
      this.bonusRerollButton = rerollButton;
    } else if (this.bonusRerollButton.parent !== dynamicRoot) {
      this.bonusRerollButton.parent?.removeControl?.(this.bonusRerollButton);
      dynamicRoot.addControl(this.bonusRerollButton);
    }

    if (!this.bonusFullHealButton) {
      const fullHealButton = Button.CreateSimpleButton('bonus_full_heal', 'FULL HEAL');
      fullHealButton.cornerRadius = 8;
      fullHealButton.thickness = 2;
      fullHealButton.color = '#FFFFFF';
      fullHealButton.fontFamily = 'Arcade8Bit';
      fullHealButton.onPointerUpObservable.add(() => {
        this.emitUiClickSound();
        this.eventBus.emit(GameEvents.SHOP_PURCHASE_REQUESTED, {
          itemId: 'full_heal',
          cost: this.bonusCurrentFullHealCost,
        });
      });
      dynamicRoot.addControl(fullHealButton);
      this.bonusFullHealButton = fullHealButton;
    } else if (this.bonusFullHealButton.parent !== dynamicRoot) {
      this.bonusFullHealButton.parent?.removeControl?.(this.bonusFullHealButton);
      dynamicRoot.addControl(this.bonusFullHealButton);
    }
  }

  public triggerBonusInsufficientFundsFx(): void {
    this.bonusInsufficientFlashTimer = this.bonusInsufficientFlashDuration;
    if (this.bonusInsufficientFlashOverlay) {
      this.bonusInsufficientFlashOverlay.isVisible = true;
      this.bonusInsufficientFlashOverlay.alpha = 0.18;
    }
  }

  private updateBonusInsufficientFlash(deltaTime: number): void {
    if (!this.bonusInsufficientFlashOverlay) return;
    if (this.bonusInsufficientFlashTimer <= 0) {
      if (this.bonusInsufficientFlashOverlay.isVisible || this.bonusInsufficientFlashOverlay.alpha > 0) {
        this.bonusInsufficientFlashOverlay.alpha = 0;
        this.bonusInsufficientFlashOverlay.isVisible = false;
      }
      return;
    }

    this.bonusInsufficientFlashTimer = Math.max(0, this.bonusInsufficientFlashTimer - deltaTime);
    const ratio = this.bonusInsufficientFlashTimer / this.bonusInsufficientFlashDuration;
    this.bonusInsufficientFlashOverlay.alpha = 0.04 + (0.2 * ratio);
    this.bonusInsufficientFlashOverlay.isVisible = true;
  }

  private updateBonusCreditsPulse(deltaTime: number): void {
    if (!this.bonusCreditsPanel || !this.bonusCreditsText || !this.bonusScreen?.isVisible) return;
    if (this.bonusCreditsPulseTimer <= 0) {
      this.bonusCreditsPanel.scaleX = 1;
      this.bonusCreditsPanel.scaleY = 1;
      this.bonusCreditsText.scaleX = 1;
      this.bonusCreditsText.scaleY = 1;
      return;
    }

    this.bonusCreditsPulseTimer = Math.max(0, this.bonusCreditsPulseTimer - deltaTime);
    const t = 1 - (this.bonusCreditsPulseTimer / this.bonusCreditsPulseDuration);
    const grow = t < 0.45
      ? 1 + (0.17 * (t / 0.45))
      : 1.17 - (0.17 * ((t - 0.45) / 0.55));
    this.bonusCreditsPanel.scaleX = grow;
    this.bonusCreditsPanel.scaleY = grow;
    this.bonusCreditsText.scaleX = 1 + ((grow - 1) * 0.85);
    this.bonusCreditsText.scaleY = this.bonusCreditsText.scaleX;
  }

  private showBonusHoverPopup(text: string, color: string): void {
    if (!this.bonusHoverPopup || !this.bonusHoverPopupText || !this.bonusScreen?.isVisible) return;
    const fontSize = Number(this.bonusHoverPopupText.fontSize) || 18;
    const approxCharWidth = fontSize * 0.62;
    const horizontalPadding = Math.max(28, Math.round(fontSize * 1.5));
    const minWidth = 360;
    const maxWidth = 980;
    const dynamicWidth = Math.round((text.length * approxCharWidth) + (horizontalPadding * 2));
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, dynamicWidth));
    this.bonusHoverPopup.width = `${clampedWidth}px`;
    this.bonusHoverPopupText.text = text;
    this.bonusHoverPopupText.color = color;
    this.bonusHoverPopup.isVisible = true;
    this.bonusHoverPopupVisible = true;
    this.updateBonusHoverPopupPosition();
  }

  private hideBonusHoverPopup(): void {
    this.bonusHoverPopupVisible = false;
    if (this.bonusHoverPopup) this.bonusHoverPopup.isVisible = false;
  }

  private updateBonusHoverPopupPosition(): void {
    if (!this.bonusHoverPopup || !this.bonusHoverPopupVisible || !this.bonusScreen?.isVisible) return;
    const renderWidth = Math.max(1, this.scene.getEngine().getRenderWidth(true));
    const renderHeight = Math.max(1, this.scene.getEngine().getRenderHeight(true));
    const guiWidth = this.guiClean.idealWidth || renderWidth;
    const guiHeight = this.guiClean.idealHeight || renderHeight;

    const pointerX = this.scene.pointerX;
    const pointerY = this.scene.pointerY;

    // Precise 1:1 pointer mapping in GUI space (no smoothing, no offsets).
    const guiX = (pointerX / renderWidth) * guiWidth;
    const guiY = (pointerY / renderHeight) * guiHeight;
    const popupWidth = this.bonusHoverPopup.widthInPixels || 640;
    const popupHeight = this.bonusHoverPopup.heightInPixels || 56;
    const topMargin = popupHeight;
    const left = guiX - (popupWidth / 3);
    const top = guiY - popupHeight - topMargin;
    this.bonusHoverPopup.left = `${left}px`;
    this.bonusHoverPopup.top = `${top}px`;
  }

  private getOrCreateBonusCard(poolKey: string): {
    button: Button;
    title: TextBlock;
    modeText: TextBlock;
    rarityText: TextBlock;
    artworkGlow: Rectangle;
    energyWaveA: Rectangle;
    energyWaveB: Rectangle;
    energyHalo: Rectangle;
    auraShellA: Rectangle;
    auraShellB: Rectangle;
    auraShellC: Rectangle;
    artworkFrame: Rectangle;
    artworkImg: Image;
    description: TextBlock;
    stackText: TextBlock;
    selectedTag: TextBlock;
    lockText: TextBlock;
  } {
    const cached = this.bonusCardPool.get(poolKey);
    if (cached) return cached;

    const btn = Button.CreateSimpleButton(`bonus_${poolKey}`, '');
    btn.cornerRadius = 14;
    btn.onPointerUpObservable.add(() => {
      this.emitUiClickSound();
      const index = this.bonusButtons.indexOf(btn);
      const state = index >= 0 ? this.bonusCardClickState[index] : null;
      if (!state) return;
      if (state.isPaid) {
        this.eventBus.emit(GameEvents.BONUS_PAID_PICK_REQUESTED, {
          bonusId: state.id,
          cost: state.cost,
        });
        return;
      }
      this.eventBus.emit(GameEvents.BONUS_SELECTED, { bonusId: state.id });
    });

    const title = new TextBlock(`bonus_title_${poolKey}`);
    title.color = '#F7FBFF';
    title.fontFamily = 'Arcade8Bit';
    title.height = '30px';
    btn.addControl(title);

    const modeText = new TextBlock(`bonus_mode_${poolKey}`);
    modeText.fontFamily = 'Arcade8Bit';
    modeText.height = '20px';
    btn.addControl(modeText);

    const rarityText = new TextBlock(`bonus_rarity_${poolKey}`);
    rarityText.fontFamily = 'Arcade8Bit';
    rarityText.height = '24px';
    btn.addControl(rarityText);

    const artworkGlow = new Rectangle(`bonus_art_glow_${poolKey}`);
    artworkGlow.thickness = 0;
    btn.addControl(artworkGlow);

    const energyHalo = new Rectangle(`bonus_energy_halo_${poolKey}`);
    energyHalo.width = '100%';
    energyHalo.height = '100%';
    energyHalo.thickness = 0;
    energyHalo.background = '#7CFFEA';
    energyHalo.alpha = 0;
    energyHalo.isHitTestVisible = false;
    btn.addControl(energyHalo);

    const energyWaveA = new Rectangle(`bonus_energy_wave_a_${poolKey}`);
    energyWaveA.width = '36px';
    energyWaveA.height = '180%';
    energyWaveA.thickness = 0;
    energyWaveA.background = '#7CFFEA';
    energyWaveA.alpha = 0;
    energyWaveA.rotation = 0.35;
    energyWaveA.isHitTestVisible = false;
    btn.addControl(energyWaveA);

    const energyWaveB = new Rectangle(`bonus_energy_wave_b_${poolKey}`);
    energyWaveB.width = '22px';
    energyWaveB.height = '165%';
    energyWaveB.thickness = 0;
    energyWaveB.background = '#7CFFEA';
    energyWaveB.alpha = 0;
    energyWaveB.rotation = -0.32;
    energyWaveB.isHitTestVisible = false;
    btn.addControl(energyWaveB);

    const auraShellA = new Rectangle(`bonus_aura_shell_a_${poolKey}`);
    auraShellA.thickness = 0;
    auraShellA.background = '#72FFD1';
    auraShellA.alpha = 0;
    auraShellA.cornerRadius = 48;
    auraShellA.isHitTestVisible = false;
    btn.addControl(auraShellA);

    const auraShellB = new Rectangle(`bonus_aura_shell_b_${poolKey}`);
    auraShellB.thickness = 0;
    auraShellB.background = '#5DB8FF';
    auraShellB.alpha = 0;
    auraShellB.cornerRadius = 42;
    auraShellB.isHitTestVisible = false;
    btn.addControl(auraShellB);

    const auraShellC = new Rectangle(`bonus_aura_shell_c_${poolKey}`);
    auraShellC.thickness = 0;
    auraShellC.background = '#D67BFF';
    auraShellC.alpha = 0;
    auraShellC.cornerRadius = 54;
    auraShellC.isHitTestVisible = false;
    btn.addControl(auraShellC);

    const artworkFrame = new Rectangle(`bonus_art_frame_${poolKey}`);
    artworkFrame.background = 'rgba(10, 12, 16, 0.9)';
    btn.addControl(artworkFrame);

    const artworkImg = new Image(`bonus_art_img_${poolKey}`);
    artworkImg.stretch = Image.STRETCH_UNIFORM;
    artworkFrame.addControl(artworkImg);

    const description = new TextBlock(`bonus_desc_${poolKey}`);
    description.color = '#DDE6EF';
    description.fontFamily = 'Arcade8Bit';
    description.textWrapping = true;
    btn.addControl(description);

    const stackText = new TextBlock(`bonus_stack_${poolKey}`);
    stackText.fontFamily = 'Arcade8Bit';
    stackText.height = '18px';
    btn.addControl(stackText);

    const selectedTag = new TextBlock(`bonus_selected_${poolKey}`);
    selectedTag.text = 'OBTAINED';
    selectedTag.color = '#D8DFEA';
    selectedTag.fontFamily = 'Arcade8Bit';
    selectedTag.height = '22px';
    selectedTag.isVisible = false;
    btn.addControl(selectedTag);

    const lockText = new TextBlock(`bonus_locked_${poolKey}`);
    lockText.text = '';
    lockText.color = '#FF9A9A';
    lockText.fontFamily = 'Arcade8Bit';
    lockText.height = '22px';
    lockText.isVisible = false;
    btn.addControl(lockText);

    const card = { button: btn, title, modeText, rarityText, artworkGlow, energyWaveA, energyWaveB, energyHalo, auraShellA, auraShellB, auraShellC, artworkFrame, artworkImg, description, stackText, selectedTag, lockText };
    this.bonusCardPool.set(poolKey, card);
    return card;
  }

  hideOverlays(): void {
    this.allowDaemonDuringOverlays = false;
    this.hideBonusHoverPopup();
    this.forceHideOverlays();
    this.setHudVisible(true);
  }

  public setRunEquippedBonuses(bonuses: Array<{ id: string; stacks: number }>): void {
    const normalized = (bonuses ?? [])
      .filter((b) => !!b && typeof b.id === 'string' && b.id.length > 0)
      .map((b) => ({ id: b.id, stacks: Math.max(1, Math.floor(b.stacks || 1)) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    this.runEquippedBonuses = normalized;
    this.refreshRunBonusIcons();
  }

  private updateRunBonusLayout(): void {
    if (!this.runBonusContainer) return;
    const width = this.scene.getEngine().getRenderWidth(true);
    if (Math.abs(width - this.runBonusLayoutWidth) < 2) return;
    this.runBonusLayoutWidth = width;
    this.refreshRunBonusIcons();
  }

  private refreshRunBonusIcons(): void {
    if (!this.runBonusContainer || !this.runBonusIconsStack || !this.runBonusTooltip || !this.runBonusTooltipImg || !this.runBonusTooltipTitle || !this.runBonusTooltipDesc || !this.runBonusTooltipTextStack) return;

    const width = this.scene.getEngine().getRenderWidth(true);
    const compact = width < 1200;
    const iconSize = compact ? 48 : 56;
    const tooltipWidth = compact ? 420 : 520;
    const tooltipHeight = compact ? 144 : 168;
    const maxPerRow = 10;
    const rowGap = compact ? 6 : 8;
    const colGap = compact ? 6 : 8;
    const containerWidth = compact ? 560 : 660;

    this.runBonusContainer.width = `${containerWidth}px`;
    this.runBonusIconsStack.height = '0px';
    this.runBonusIconsStack.width = `${containerWidth}px`;
    this.runBonusIconsStack.spacing = rowGap;
    this.runBonusIconsStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.runBonusIconsStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.runBonusTooltip.width = `${tooltipWidth}px`;
    this.runBonusTooltip.height = `${tooltipHeight}px`;
    this.runBonusTooltipImg.width = `${compact ? 44 : 50}px`;
    this.runBonusTooltipImg.height = `${compact ? 44 : 50}px`;
    this.runBonusTooltipTextStack.width = `${Math.max(230, tooltipWidth - (compact ? 84 : 92))}px`;
    this.runBonusTooltipTextStack.height = `${tooltipHeight - 22}px`;
    this.runBonusTooltipTitle.fontSize = compact ? 13 : 15;
    this.runBonusTooltipDesc.fontSize = compact ? 12 : 13;
    this.runBonusTooltipDesc.height = `${compact ? 106 : 126}px`;

    const oldIconControls = [...this.runBonusIconsStack.children];
    this.runBonusIconsStack.clearControls();
    for (const ctrl of oldIconControls) {
      ctrl.dispose();
    }
    this.runBonusTooltip.isVisible = false;

    const visibleBonuses = this.runEquippedBonuses;
    const rowCount = Math.max(1, Math.ceil(visibleBonuses.length / maxPerRow));
    const rowsHeight = (rowCount * iconSize) + ((rowCount - 1) * rowGap) + 4;
    const tooltipTop = rowsHeight + 12;
    this.runBonusTooltip.top = `${tooltipTop}px`;
    this.runBonusContainer.height = `${tooltipTop + tooltipHeight + 16}px`;
    this.runBonusIconsStack.height = `${rowsHeight}px`;

    const rowStacks: StackPanel[] = [];
    for (let row = 0; row < rowCount; row++) {
      const rowStack = new StackPanel(`run_bonus_icons_row_${row}`);
      rowStack.isVertical = false;
      rowStack.spacing = colGap;
      rowStack.height = `${iconSize}px`;
      rowStack.width = `${containerWidth}px`;
      rowStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      rowStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      rowStack.isPointerBlocker = false;
      this.runBonusIconsStack.addControl(rowStack);
      rowStacks.push(rowStack);
    }

    visibleBonuses.forEach((bonus, index) => {
      const box = new Rectangle(`run_bonus_box_${bonus.id}_${index}`);
      box.width = `${iconSize}px`;
      box.height = `${iconSize}px`;
      box.thickness = 1;
      box.color = '#3B685C';
      box.background = 'rgba(10, 18, 22, 0.9)';
      box.cornerRadius = 4;
      box.isPointerBlocker = true;
      box.hoverCursor = 'pointer';

      const img = new Image(`run_bonus_img_${bonus.id}_${index}`, buildHudAssetUrl(`bonuses/${bonus.id}.png`));
      img.width = `${Math.floor(iconSize * 0.72)}px`;
      img.height = `${Math.floor(iconSize * 0.72)}px`;
      img.isHitTestVisible = false;
      box.addControl(img);

      if (bonus.stacks > 1) {
        const badge = new Rectangle(`run_bonus_badge_${bonus.id}_${index}`);
        badge.width = compact ? '17px' : '19px';
        badge.height = compact ? '14px' : '16px';
        badge.thickness = 0;
        badge.background = '#FF3B5C';
        badge.cornerRadius = 2;
        badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        badge.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        badge.left = '4px';
        badge.top = '4px';
        badge.isHitTestVisible = false;

        const badgeText = new TextBlock(`run_bonus_badge_text_${bonus.id}_${index}`, `x${bonus.stacks}`);
        badgeText.fontFamily = 'Arcade8Bit';
        badgeText.fontSize = compact ? 9 : 10;
        badgeText.color = '#FFFFFF';
        badgeText.isHitTestVisible = false;
        badge.addControl(badgeText);
        box.addControl(badge);
      }

      const def = BONUS_CODEX_ENTRIES.find((d) => d.id === bonus.id) || {
        name: bonus.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: 'Custom system upgrade module loaded during execution.',
        effect: 'Standard performance parameters apply.',
      };

      box.onPointerEnterObservable.add(() => {
        if (!this.runBonusTooltip || !this.runBonusTooltipImg || !this.runBonusTooltipTitle || !this.runBonusTooltipDesc) return;
        this.runBonusTooltipImg.source = buildHudAssetUrl(`bonuses/${bonus.id}.png`);
        this.runBonusTooltipTitle.text = `${def.name.toUpperCase()}${bonus.stacks > 1 ? ` (x${bonus.stacks})` : ''}`;
        this.runBonusTooltipDesc.text = `${def.description}\nEffect: ${def.effect}`;
        const col = index % maxPerRow;
        const slotLeft = col * (iconSize + colGap);
        const maxLeft = Math.max(0, (this.runBonusContainer!.widthInPixels || containerWidth) - tooltipWidth);
        const clampedLeft = Math.max(0, Math.min(slotLeft, maxLeft));
        this.runBonusTooltip.left = `${clampedLeft}px`;
        this.runBonusTooltip.isVisible = true;
      });
      box.onPointerOutObservable.add(() => {
        if (this.runBonusTooltip) this.runBonusTooltip.isVisible = false;
      });

      const rowIndex = Math.floor(index / maxPerRow);
      rowStacks[Math.min(rowStacks.length - 1, rowIndex)]?.addControl(box);
    });
  }

  private updateBonusCardJuice(deltaTime: number): void {
    if (!this.bonusScreen?.isVisible || this.activeBonusCardFx.length === 0) return;
    this.bonusCardFxAccumulator += Math.max(0, deltaTime);
    if (this.bonusCardFxAccumulator < (1 / 30)) return;
    this.bonusCardFxAccumulator = 0;
    const t = performance.now() / 1000;
    void deltaTime;
    for (const card of this.activeBonusCardFx) {
      if (!card.button.isVisible || card.selected) continue;

      const base =
        card.rarity === 'epic' ? 0.5
        : card.rarity === 'rare' ? 0.36
        : card.rarity === 'uncommon' ? 0.2
        : 0.14;
      const amp =
        card.rarity === 'epic' ? 0.42
        : card.rarity === 'rare' ? 0.28
        : card.rarity === 'uncommon' ? 0.13
        : 0.1;
      const speed =
        card.rarity === 'epic' ? 7.8
        : card.rarity === 'rare' ? 4.2
        : card.rarity === 'uncommon' ? 4.8
        : 3.9;
      const pulse = base + (Math.max(0, Math.sin((t * speed) + card.button.leftInPixels * 0.01)) * amp);
      const idHash = card.idSeed;
      const dirSignA = (idHash & 1) === 0 ? 1 : -1;
      const dirSignB = (idHash & 2) === 0 ? 1 : -1;
      const phaseA = (idHash % 17) * 0.37;
      const phaseB = (idHash % 29) * 0.23;

      const palette =
        card.rarity === 'epic'
          ? { a: '#FFE8FF', b: '#FF8DE5', c: '#A66BFF' }
          : card.rarity === 'rare'
            ? { a: '#2D7BFF', b: '#44B4FF', c: '#8ED8FF' }
            : card.rarity === 'uncommon'
              ? { a: '#A9FFD4', b: '#74F3BE', c: '#BDF9E1' }
              : { a: '#86C8FF', b: '#86C8FF', c: '#86C8FF' };

      // Common stays almost static by design (no flashy animation).
      const chaoticA = 0.5 + 0.5 * Math.sin((t * (speed * 0.81)) + phaseA + Math.sin((t + phaseB) * 1.7));
      const chaoticB = 0.5 + 0.5 * Math.sin((t * (speed * 1.13)) + 1.9 + phaseB + Math.sin((t + phaseA) * 2.3));
      const chaoticC = 0.5 + 0.5 * Math.sin((t * (speed * 1.57)) + 3.6 + phaseA + Math.sin((t + phaseB) * 1.1));
      const colorMixAB = chaoticA < 0.33 ? palette.a : (chaoticA < 0.66 ? palette.b : palette.c);
      const colorMixBC = chaoticB < 0.33 ? palette.b : (chaoticB < 0.66 ? palette.c : palette.a);
      const colorMixCA = chaoticC < 0.33 ? palette.c : (chaoticC < 0.66 ? palette.a : palette.b);

      card.energyWaveA.background = colorMixAB;
      card.energyWaveB.background = colorMixBC;
      card.energyHalo.background = colorMixCA;
      card.auraShellA.background = colorMixAB;
      card.auraShellB.background = colorMixBC;
      card.auraShellC.background = colorMixCA;

      const waveTravelMultiplier =
        card.rarity === 'epic' ? 52
        : card.rarity === 'rare' ? 30
        : 18;
      const waveTravel = ((((t + phaseA) * (speed * waveTravelMultiplier) * dirSignA) % 460) + 460) % 460 - 230;
      const waveTravelB = ((((t + 0.38 + phaseB) * (speed * (waveTravelMultiplier * 0.79)) * dirSignB) % 460) + 460) % 460 - 230;
      card.energyWaveA.left = waveTravel;
      card.energyWaveB.left = waveTravelB;

      const haloBase =
        card.rarity === 'epic' ? 0.22
        : card.rarity === 'rare' ? 0.16
        : card.rarity === 'uncommon' ? 0.11
        : 0.05;
      const haloPulse = haloBase + (Math.max(0, Math.sin((t * (speed * 0.7)) + 0.7)) * haloBase * 1.35);
      const chaosScale =
        card.rarity === 'epic' ? 1.45
        : card.rarity === 'rare' ? 1.18
        : card.rarity === 'uncommon' ? 0.8
        : 0.45;
      const shellJitter = Math.sin((t + phaseA) * (speed * 0.8)) * (6 * chaosScale);
      const shellJitterB = Math.sin((t + phaseB) * (speed * 1.23) + 1.4) * (5 * chaosScale);
      const shellJitterC = Math.sin((t + phaseA) * (speed * 1.61) + 2.2) * (7 * chaosScale);
      card.auraShellA.left = shellJitter;
      card.auraShellA.top = card.artworkGlow.topInPixels + shellJitterB * 0.3;
      card.auraShellA.rotation = 0.12 + Math.sin(t * (speed * 0.56)) * 0.2;
      card.auraShellB.left = shellJitterB;
      card.auraShellB.top = card.artworkGlow.topInPixels + shellJitterC * 0.25;
      card.auraShellB.rotation = -0.16 + Math.sin(t * (speed * 0.71)) * 0.24;
      card.auraShellC.left = shellJitterC * 0.7;
      card.auraShellC.top = card.artworkGlow.topInPixels + shellJitter * 0.2;
      card.auraShellC.rotation = 0.08 + Math.sin(t * (speed * 0.93)) * 0.3;

      if (card.rarity === 'common') {
        card.artworkGlow.alpha = card.isPaid ? (card.affordable ? 0.22 : 0.12) : 0.16;
        card.energyWaveA.alpha = 0;
        card.energyWaveB.alpha = 0;
        card.energyHalo.alpha = 0.04;
        card.auraShellA.alpha = 0;
        card.auraShellB.alpha = 0;
        card.auraShellC.alpha = 0;
        card.button.thickness = card.isPaid ? 3 : 2;
      } else if (card.rarity === 'uncommon') {
        // No horizontal bars for uncommon: visual tier starts at rare.
        card.artworkGlow.alpha = Math.min(0.68, pulse + 0.02);
        card.energyWaveA.alpha = 0;
        card.energyWaveB.alpha = 0;
        card.energyHalo.alpha = Math.min(0.22, haloPulse * 0.42);
        card.auraShellA.alpha = Math.min(0.18, haloPulse * 0.5);
        card.auraShellB.alpha = Math.min(0.13, haloPulse * 0.42);
        card.auraShellC.alpha = Math.min(0.1, haloPulse * 0.35);
      } else if (card.isPaid) {
        if (card.affordable) {
          card.artworkGlow.alpha = Math.min(0.98, pulse + 0.26);
          card.energyWaveA.alpha = Math.min(0.72, haloPulse + 0.22);
          card.energyWaveB.alpha = Math.min(0.56, haloPulse * 0.94);
          card.energyHalo.alpha = Math.min(0.34, haloPulse * 0.52);
          card.auraShellA.alpha = Math.min(0.42, haloPulse * 0.88);
          card.auraShellB.alpha = Math.min(0.34, haloPulse * 0.7);
          card.auraShellC.alpha = Math.min(0.28, haloPulse * 0.62);
          card.button.thickness = 4;
        } else {
          card.artworkGlow.alpha = Math.min(0.46, base * 0.65);
          card.energyWaveA.alpha = 0.08;
          card.energyWaveB.alpha = 0.06;
          card.energyHalo.alpha = 0.05;
          card.auraShellA.alpha = 0.06;
          card.auraShellB.alpha = 0.05;
          card.auraShellC.alpha = 0.04;
          card.button.thickness = 3;
        }
      } else {
        if (card.rarity === 'epic') {
          const rainbowPhase = (t * 1.45) + phaseA;
          const rainbowColors = ['#FFFFFF', '#FF9AF2', '#B985FF', '#7FD1FF', '#FFFFFF'];
          const rainbowIndex = Math.floor((((Math.sin(rainbowPhase) + 1) * 0.5) * rainbowColors.length)) % rainbowColors.length;
          card.energyHalo.background = rainbowColors[rainbowIndex];
          card.auraShellA.background = rainbowColors[(rainbowIndex + 1) % rainbowColors.length];
          card.auraShellB.background = '#FFFFFF';
          card.auraShellC.background = rainbowColors[(rainbowIndex + 2) % rainbowColors.length];
        }
        const isEpic = card.rarity === 'epic';
        card.artworkGlow.alpha = Math.min(isEpic ? 1 : 0.9, pulse + (isEpic ? 0.2 : 0.1));
        card.energyWaveA.alpha = Math.min(isEpic ? 0.72 : 0.5, haloPulse + (isEpic ? 0.24 : 0.05));
        card.energyWaveB.alpha = Math.min(isEpic ? 0.56 : 0.38, haloPulse * 0.85 + (isEpic ? 0.18 : 0.02));
        card.energyHalo.alpha = Math.min(isEpic ? 0.44 : 0.26, haloPulse * 0.47 + (isEpic ? 0.18 : 0.04));
        card.auraShellA.alpha = Math.min(isEpic ? 0.52 : 0.34, haloPulse * (isEpic ? 1.08 : 0.78));
        card.auraShellB.alpha = Math.min(isEpic ? 0.42 : 0.26, haloPulse * (isEpic ? 0.95 : 0.64));
        card.auraShellC.alpha = Math.min(isEpic ? 0.34 : 0.2, haloPulse * (isEpic ? 0.84 : 0.56));
      }

      const titlePulse = 0.86 + (Math.max(0, Math.sin((t * (speed * 0.85)) + 1.2)) * 0.14);
      card.title.alpha = Math.min(1, titlePulse + (card.rarity === 'epic' ? 0.06 : 0));
    }
  }

  public pushSystemLog(message: string): void {
    if (typeof message !== 'string' || message.trim().length === 0) return;
    this.addLogMessage(message.trim());
  }

  async showCinematicBanner(titleText: string, subtitleText: string, durationMs: number = 900): Promise<void> {
    const overlay = new Rectangle(`cinematic_banner_${Date.now()}`);
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'rgba(0,0,0,0.0)';
    overlay.isPointerBlocker = false;
    overlay.zIndex = 2600;
    this.guiClean.addControl(overlay);

    const title = new TextBlock(`${overlay.name}_title`);
    title.text = titleText;
    title.color = '#A7FFF2';
    title.fontSize = 48;
    title.fontFamily = 'Arcade8Bit';
    title.top = '-24px';
    title.alpha = 0;
    overlay.addControl(title);

    const subtitle = new TextBlock(`${overlay.name}_subtitle`);
    subtitle.text = subtitleText;
    subtitle.color = '#E6FFFB';
    subtitle.fontSize = 20;
    subtitle.fontFamily = 'Arcade8Bit';
    subtitle.top = '34px';
    subtitle.alpha = 0;
    overlay.addControl(subtitle);

    const fadeIn = Math.max(160, Math.floor(durationMs * 0.22));
    const hold = Math.max(180, Math.floor(durationMs * 0.43));
    const fadeOut = Math.max(180, durationMs - fadeIn - hold);

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const dt = this.scene.getEngine().getDeltaTime();
        elapsed += dt;
        let alpha = 0;
        if (elapsed <= fadeIn) {
          alpha = Math.max(0, Math.min(1, elapsed / fadeIn));
        } else if (elapsed <= fadeIn + hold) {
          alpha = 1;
        } else {
          const outT = (elapsed - fadeIn - hold) / fadeOut;
          alpha = Math.max(0, 1 - outT);
        }

        title.alpha = alpha;
        subtitle.alpha = alpha * 0.95;
        title.scaleX = 1 + ((1 - alpha) * 0.14);
        title.scaleY = title.scaleX;

        if (elapsed >= durationMs) {
          this.scene.onBeforeRenderObservable.remove(obs);
          overlay.dispose();
          resolve();
        }
      });
    });
  }

  private setHudVisible(visible: boolean): void {
    if (visible) {
      this.allowDaemonDuringOverlays = false;
      this.forceHideOverlays();
    }
    if (this.playerHealthDisplay) this.playerHealthDisplay.isVisible = visible;
    if (this.playerUltDisplay) this.playerUltDisplay.isVisible = visible;
    if (this.topBar) this.topBar.isVisible = visible;
    if (this.logPanel) this.logPanel.isVisible = visible;
    if (this.statusPanel) this.statusPanel.isVisible = visible;
    const daemonShouldShow = this.daemonVisible && (visible || this.allowDaemonDuringOverlays);
    if (this.daemonContainer) this.daemonContainer.isVisible = daemonShouldShow;
    if (!daemonShouldShow) {
      if (this.daemonGlitchOverlay) this.daemonGlitchOverlay.isVisible = false;
      if (this.daemonPopupFlashOverlay) this.daemonPopupFlashOverlay.isVisible = false;
    }
  }

  private forceHideOverlays(): void {
    if (this.startScreen) this.startScreen.isVisible = false;
    if (this.classSelectScreen) this.classSelectScreen.isVisible = false;
    if (this.codexScreen) this.codexScreen.isVisible = false;
    if (this.settingsScreen) this.settingsScreen.isVisible = false;
    if (this.gameOverScreen) this.gameOverScreen.isVisible = false;
    if (this.roomClearScreen) this.roomClearScreen.isVisible = false;
    if (this.bonusScreen) this.bonusScreen.isVisible = false;
    if (this.pauseScreen) this.pauseScreen.isVisible = false;
  }


  private clearEnemyHealthBars(): void {
    for (const bar of this.enemyHealthBars.values()) {
      bar.container.dispose();
      bar.label.dispose();
    }
    this.enemyHealthBars.clear();
    this.pendingEnemyHealthBars = [];
  }

  private applyAudioSettingsFromStore(): void {
    this.uiVolumeMultiplier = GameSettingsStore.getEffectiveVolume('ui');
    this.voicelineVolumeMultiplier = GameSettingsStore.getEffectiveVolume('voice');
    this.daemonTypewriterSynth.setVolumeMultiplier(this.uiVolumeMultiplier);

    for (const audio of this.activeVoicelineAudios) {
      if ((audio as any).setVolume) {
        (audio as any).setVolume(this.voicelineVolumeMultiplier);
      } else if (audio instanceof AudioBufferSourceNode) {
        // Handle AudioBufferSourceNode volume if it has an associated gain node. 
        // For now, doing nothing is fine if there is no setVolume method.
      }
    }
  }

  public setInputManager(inputManager: InputManager): void {
    this.inputManager = inputManager;
    this.initializeMobileControlsIfNeeded();
  }

  public setPlayer(player: PlayerController): void {
    this.player = player;
  }

  private initializeMobileControlsIfNeeded(): void {
    if (!this.inputManager) return;

    // Detect mobile device or developer query parameter override
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasMobileQuery = typeof window !== 'undefined' && window.location && window.location.search.includes('mobile=true');

    if (isMobileDevice || hasMobileQuery || this.inputManager.isMobileMode()) {
      this.inputManager.setMobileMode(true);
      this.setMobileControlsVisible(true);
    }
  }

  public setMobileControlsVisible(visible: boolean): void {
    if (visible) {
      if (this.mobileControls.length === 0) {
        this.createMobileControls();
      }
      for (const ctrl of this.mobileControls) {
        ctrl.isVisible = true;
      }
    } else {
      for (const ctrl of this.mobileControls) {
        ctrl.isVisible = false;
      }
    }
  }

  private createMobileControls(): void {
    const fontFamily = 'Arcade8Bit';
    const idealWidth = this.guiClean.idealWidth || 1920;
    const idealHeight = this.guiClean.idealHeight || 1080;
    const isMobileLayout = idealWidth <= 960;
    const controlScale = isMobileLayout ? 1.44 : 1.16;
    const leftMargin = Math.round(Math.max(48, idealWidth * 0.045));
    const bottomMargin = Math.round(Math.max(52, idealHeight * 0.075));
    const extraSafeLift = Math.round(Math.max(54, idealHeight * 0.085));
    const logPanelHeight = this.logPanel?.heightInPixels ?? 180;
    const statusPanelHeight = (this.statusPanel as Rectangle | null)?.heightInPixels ?? 180;
    const bottomSafe = Math.round(Math.max(logPanelHeight, statusPanelHeight) + bottomMargin + extraSafeLift);
    const joystickBoost = 1.4;
    const joystickSize = Math.round(194 * controlScale * joystickBoost);
    const joystickBgSize = Math.round(132 * controlScale * joystickBoost);
    const joystickThumbSize = Math.round(56 * controlScale * joystickBoost);
    const attackSize = Math.round(140 * controlScale);
    const stanceSize = Math.round(116 * controlScale);
    const ultSize = Math.round(126 * controlScale);
    const buttonGap = Math.round(attackSize * 0.28);

    // 1. LEFT JOYSTICK (Movement - Snapped to 8 Directions)
    const leftJoystickContainer = new Rectangle('left_joystick_container');
    leftJoystickContainer.width = `${joystickSize}px`;
    leftJoystickContainer.height = `${joystickSize}px`;
    leftJoystickContainer.thickness = 0;
    leftJoystickContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    leftJoystickContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    leftJoystickContainer.left = `${leftMargin}px`;
    const joystickLowerOffset = 24;
    leftJoystickContainer.top = `-${Math.max(0, bottomSafe - joystickLowerOffset)}px`;
    this.guiClean.addControl(leftJoystickContainer);
    this.mobileControls.push(leftJoystickContainer);

    const joystickBg = new Rectangle('left_joystick_bg');
    joystickBg.width = `${joystickBgSize}px`;
    joystickBg.height = `${joystickBgSize}px`;
    joystickBg.cornerRadius = Math.round(joystickBgSize / 2);
    joystickBg.thickness = 3;
    joystickBg.color = '#2EF9C3';
    joystickBg.background = 'rgba(4, 10, 8, 0.4)';
    leftJoystickContainer.addControl(joystickBg);

    const joystickThumb = new Rectangle('left_joystick_thumb');
    joystickThumb.width = `${joystickThumbSize}px`;
    joystickThumb.height = `${joystickThumbSize}px`;
    joystickThumb.cornerRadius = Math.round(joystickThumbSize / 2);
    joystickThumb.thickness = 0;
    joystickThumb.background = '#2EF9C3';
    leftJoystickContainer.addControl(joystickThumb);

    // 2. ACTION BUTTONS (Attack, Stance & Ultimate) — bigger for comfortable touch targets
    const attackBtn = Button.CreateSimpleButton('mobile_attack_btn', 'ATTACK');
    attackBtn.width = `${attackSize}px`;
    attackBtn.height = `${attackSize}px`;
    attackBtn.color = '#FFD782';
    attackBtn.background = 'rgba(20, 15, 10, 0.75)';
    attackBtn.thickness = 3;
    attackBtn.cornerRadius = Math.round(attackSize / 2);
    attackBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    attackBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    attackBtn.left = `-${leftMargin}px`;
    const rightButtonsLowerOffset = 20;
    attackBtn.top = `-${Math.max(0, bottomSafe - rightButtonsLowerOffset)}px`;
    if (attackBtn.textBlock) {
      attackBtn.textBlock.fontSize = isMobileLayout ? 24 : 20;
      attackBtn.textBlock.fontFamily = fontFamily;
      attackBtn.textBlock.fontWeight = 'bold';
    }
    this.guiClean.addControl(attackBtn);
    this.mobileControls.push(attackBtn);
    this.mobileAttackBtn = attackBtn;

    const stanceBtn = Button.CreateSimpleButton('mobile_stance_btn', 'STANCE');
    stanceBtn.width = `${stanceSize}px`;
    stanceBtn.height = `${stanceSize}px`;
    stanceBtn.color = '#7CFFEA';
    stanceBtn.background = 'rgba(10, 30, 35, 0.75)';
    stanceBtn.thickness = 3;
    stanceBtn.cornerRadius = Math.round(stanceSize / 2);
    stanceBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    stanceBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    stanceBtn.left = `-${leftMargin + attackSize + buttonGap}px`;
    stanceBtn.top = `-${Math.max(0, bottomSafe - rightButtonsLowerOffset)}px`;
    if (stanceBtn.textBlock) {
      stanceBtn.textBlock.fontSize = isMobileLayout ? 22 : 18;
      stanceBtn.textBlock.fontFamily = fontFamily;
      stanceBtn.textBlock.fontWeight = 'bold';
    }
    this.guiClean.addControl(stanceBtn);
    this.mobileControls.push(stanceBtn);
    this.mobileStanceBtn = stanceBtn;

    const ultBtn = Button.CreateSimpleButton('mobile_ult_btn', 'ULT');
    ultBtn.width = `${ultSize}px`;
    ultBtn.height = `${ultSize}px`;
    ultBtn.color = '#FFFF00';
    ultBtn.background = 'rgba(35, 35, 10, 0.75)';
    ultBtn.thickness = 3;
    ultBtn.cornerRadius = Math.round(ultSize / 2);
    ultBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    ultBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    ultBtn.left = `-${leftMargin + Math.round(attackSize * 0.45)}px`;
    ultBtn.top = `-${Math.max(0, bottomSafe - rightButtonsLowerOffset) + attackSize + buttonGap}px`;
    if (ultBtn.textBlock) {
      ultBtn.textBlock.fontSize = isMobileLayout ? 23 : 19;
      ultBtn.textBlock.fontFamily = fontFamily;
      ultBtn.textBlock.fontWeight = 'bold';
    }
    this.guiClean.addControl(ultBtn);
    this.mobileControls.push(ultBtn);
    this.mobileUltBtn = ultBtn;

    // ── Joystick drag logic ──────────────────────────────────────────────────
    // Uses scene.onPointerObservable (global) so the thumb tracks correctly even
    // when the finger moves outside the joystick container bounds.
    //
    // DPR / hardware-scaling fix:
    //   Touch events deliver CSS pixels (clientX/Y).
    //   Babylon GUI internal coordinates are in render pixels.
    //   canvas.width / rect.width gives the CSS→render scale factor.

    let isDraggingLeft = false;
    let leftPointerId = -1;
    const maxRadius = joystickBgSize / 2;
    const joystickCenterX = leftMargin + joystickSize / 2;
    const joystickCenterY = idealHeight - Math.max(0, bottomSafe - joystickLowerOffset) - joystickSize / 2;

    const getIdealPointerCoords = (pointerX: number, pointerY: number, result: Vector2): void => {
      const engine = this.scene.getEngine();
      const canvas = engine.getRenderingCanvas();
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / (rect.width  || 1);
      const sy = canvas.height / (rect.height || 1);
      
      // pointerX/Y are already relative to canvas, in CSS pixels.
      const renderX = pointerX * sx;
      const renderY = pointerY * sy;

      const idealW = this.guiClean.idealWidth || 1920;
      const idealH = this.guiClean.idealHeight || 1080;
      const scaleX = canvas.width / idealW;
      const scaleY = canvas.height / idealH;
      const guiScale = Math.min(scaleX, scaleY);
      const offsetX = (canvas.width - idealW * guiScale) / 2;
      const offsetY = (canvas.height - idealH * guiScale) / 2;

      result.x = (renderX - offsetX) / guiScale;
      result.y = (renderY - offsetY) / guiScale;
    };

    const toJoystickLocal = (pointerX: number, pointerY: number, result: Vector2): void => {
      getIdealPointerCoords(pointerX, pointerY, result);
      result.x -= joystickCenterX;
      result.y -= joystickCenterY;
    };

    const applyJoystickInput = (localX: number, localY: number) => {
      let dx = localX;
      let dy = localY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
      }
      joystickThumb.left = `${dx}px`;
      joystickThumb.top  = `${dy}px`;

      if (distance > 4) {
        const ndx = dx / maxRadius;
        const ndy = -dy / maxRadius; // Invert Y: screen-down = 3D-backward
        const rawVec = new Vector3(ndx, 0, ndy);
        if (rawVec.length() > 0.15) {
          const angle        = Math.atan2(rawVec.x, rawVec.z);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const quantized    = new Vector3(Math.sin(snappedAngle), 0, Math.cos(snappedAngle)).normalize();
          if (this.inputManager) this.inputManager.setJoystickMoveVector(quantized);
        } else {
          if (this.inputManager) this.inputManager.setJoystickMoveVector(Vector3.Zero());
        }
      } else {
        if (this.inputManager) this.inputManager.setJoystickMoveVector(Vector3.Zero());
      }
    };

    const resetLeftJoystick = () => {
      joystickThumb.left = '0px';
      joystickThumb.top  = '0px';
      isDraggingLeft = false;
      leftPointerId  = -1;
      if (this.inputManager) this.inputManager.setJoystickMoveVector(Vector3.Zero());
    };
    this.resetMobileJoystick = resetLeftJoystick;

    const joystickHalfSize = joystickSize / 2;
    const isInsideJoystick = (pointerX: number, pointerY: number): boolean => {
      const coords = new Vector2();
      getIdealPointerCoords(pointerX, pointerY, coords);
      const dx = coords.x - joystickCenterX;
      const dy = coords.y - joystickCenterY;
      return Math.abs(dx) <= joystickHalfSize && Math.abs(dy) <= joystickHalfSize;
    };

    // Global scene observer — supports multi-touch, works outside container bounds
    const jsLocal = new Vector2();
    this.mobilePointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      const event = pointerInfo.event as PointerEvent;
      if (!event) return;

      // Ignore if mobile controls are hidden (e.g. desktop mode)
      if (!this.inputManager || !this.inputManager.isMobileMode()) return;

      const pid = (event as any).pointerId ?? (event as any).identifier ?? 0;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (!isDraggingLeft && isInsideJoystick(this.scene.pointerX, this.scene.pointerY)) {
            isDraggingLeft = true;
            leftPointerId  = pid;
            toJoystickLocal(this.scene.pointerX, this.scene.pointerY, jsLocal);
            applyJoystickInput(jsLocal.x, jsLocal.y);
          }
          break;

        case PointerEventTypes.POINTERMOVE:
          if (isDraggingLeft && pid === leftPointerId) {
            toJoystickLocal(this.scene.pointerX, this.scene.pointerY, jsLocal);
            applyJoystickInput(jsLocal.x, jsLocal.y);
          }
          break;

        case PointerEventTypes.POINTERUP:
          if (isDraggingLeft && pid === leftPointerId) resetLeftJoystick();
          break;
      }
    });

    // Attack action button observables
    attackBtn.onPointerDownObservable.add(() => {
      if (this.mobileAttackHoldBlocked) return;
      this.inputManager!.setJoystickAimActive(true);
    });
    attackBtn.onPointerUpObservable.add(() => {
      this.emitUiClickSound();
      this.inputManager!.setJoystickAimActive(false);
      this.mobileAttackHoldBlocked = false;
    });

    // Stance click-toggle button observables
    stanceBtn.onPointerDownObservable.add(() => {
      if (!this.player) return;
      const isStanceActive = this.player.isSecondaryActive();
      if (isStanceActive) {
        this.inputManager!.setMobileStancePressed(false);
      } else {
        const currentResource = this.player.getSecondaryResourceCurrent();
        const threshold       = this.player.getSecondaryActivationThreshold();
        if (currentResource >= threshold) {
          this.inputManager!.setMobileStancePressed(true);
        }
      }
    });

    // Ultimate button observables
    ultBtn.onPointerDownObservable.add(() => {
      this.inputManager!.setMobileUltPressed(true);
      ultBtn.background = 'rgba(255, 255, 0, 0.4)';
    });
    ultBtn.onPointerUpObservable.add(() => {
      this.emitUiClickSound();
      this.inputManager!.setMobileUltPressed(false);
      ultBtn.background = 'rgba(35, 35, 10, 0.75)';
    });
  }


  private updateMobileControlsState(deltaTime: number): void {
    if (!this.inputManager || !this.player) return;

    const mobileMode = this.inputManager.isMobileMode();

    if (!mobileMode) {
      this.setMobileControlsVisible(false);
      return;
    }

    this.setMobileControlsVisible(true);

    const isStanceActive = this.player.isSecondaryActive();
    const classId = this.player.getClassId();

    // Stance transition check: block attack hold if active when transitioning
    if (isStanceActive && !this.wasStanceActive) {
      if (this.inputManager.isJoystickAimActive()) {
        this.mobileAttackHoldBlocked = true;
        this.inputManager.setJoystickAimActive(false);
      }
    }

    // Enforce hold suppression if blocked
    if (this.mobileAttackHoldBlocked) {
      this.inputManager.setJoystickAimActive(false);
    }

    // Dynamic Attack Button label and visual feedback updates
    if (this.mobileAttackBtn) {
      if (isStanceActive) {
        if (classId === 'mage') {
          this.mobileAttackBtn.textBlock!.text = 'BOOM';
          this.mobileAttackBtn.color = '#66CCFF';
          if (!this.mobileAttackHoldBlocked) {
            this.mobileAttackBtn.background = 'rgba(10, 30, 45, 0.85)';
          } else {
            this.mobileAttackBtn.background = 'rgba(15, 15, 15, 0.6)';
          }
        } else {
          this.mobileAttackBtn.textBlock!.text = 'DASH';
          this.mobileAttackBtn.color = '#FF9900';
          if (!this.mobileAttackHoldBlocked) {
            this.mobileAttackBtn.background = 'rgba(45, 25, 10, 0.85)';
          } else {
            this.mobileAttackBtn.background = 'rgba(15, 15, 15, 0.6)';
          }
        }
      } else {
        this.mobileAttackBtn.textBlock!.text = 'ATTACK';
        this.mobileAttackBtn.color = '#FFD782';
        this.mobileAttackBtn.background = this.inputManager.isJoystickAimActive()
          ? 'rgba(255, 215, 130, 0.4)'
          : 'rgba(20, 15, 10, 0.75)';
      }
    }

    // Dynamic Stance Button visual feedback updates
    if (this.mobileStanceBtn) {
      const currentResource = this.player.getSecondaryResourceCurrent();
      const threshold = this.player.getSecondaryActivationThreshold();
      const hasEnoughResource = currentResource >= threshold;

      if (isStanceActive) {
        this.mobileStanceBtn.background = 'rgba(46, 249, 195, 0.7)';
        this.mobileStanceBtn.color = '#040A08';
      } else {
        if (hasEnoughResource) {
          this.mobileStanceBtn.background = 'rgba(10, 30, 35, 0.75)';
          this.mobileStanceBtn.color = '#7CFFEA';
        } else {
          this.mobileStanceBtn.background = 'rgba(20, 20, 20, 0.4)';
          this.mobileStanceBtn.color = '#445550';
        }
      }
    }

    // Sync inputManager state and clear block if stance exits
    if (!isStanceActive) {
      this.inputManager.setMobileStancePressed(false);
      this.mobileAttackHoldBlocked = false;
    }

    this.wasStanceActive = isStanceActive;
  }

  private updateSecondaryBlockedFeedback(deltaTime: number): void {
    if (this.secondaryBlockedFeedbackTimer <= 0) return;
    this.secondaryBlockedFeedbackTimer = Math.max(0, this.secondaryBlockedFeedbackTimer - deltaTime);
  }

  private resetMobileInputState(): void {
    if (!this.inputManager || !this.inputManager.isMobileMode()) return;
    this.resetMobileJoystick?.();
    this.inputManager.setJoystickAimActive(false);
    this.inputManager.setMobileStancePressed(false);
    this.inputManager.setMobileUltPressed(false);
    this.mobileAttackHoldBlocked = false;
    this.wasStanceActive = false;
  }
}
