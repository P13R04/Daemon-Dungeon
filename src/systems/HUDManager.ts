/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Engine, Vector3, Vector2, TransformNode, AbstractMesh, Sound, PointerEventTypes } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Image, StackPanel, Checkbox } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';
import { SettingsMenuBuilder } from '../ui/SettingsMenuBuilder';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
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
  private wasStanceActive: boolean = false;
  private mobileAttackHoldBlocked: boolean = false;
  private eventBus: EventBus;
  private damageNumbers: DamageNumber[] = [];
  private damageNumberCooldowns: Map<string, { lastTime: number; pending: number; lastPosition: Vector3 }> = new Map();
  private damageNumberCooldown: number = 0.5;
  private enemyHealthBars: Map<string, { container: Rectangle; bar: Rectangle; label: TextBlock }> = new Map();
  private pendingEnemyHealthBars: Array<EnemyEventPayload & { enemyId: string }> = [];
  private playerHealthDisplay: TextBlock | null = null;
  private playerUltDisplay: TextBlock | null = null;
  private topBar: Rectangle | null = null;
  private healthBarFill: Rectangle | null = null;
  private healthValueText: TextBlock | null = null;
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
  private achievementToastTitle: TextBlock | null = null;
  private achievementToastDescription: TextBlock | null = null;
  private achievementIconPlaceholder: Rectangle | null = null;
  private achievementIconText: TextBlock | null = null;
  private achievementToastArtwork: Image | null = null;
  private achievementToastTimer: number = 0;
  private readonly achievementToastDuration: number = 4.0;
  public static achievementToastQueue: Array<{ id: string; name: string; description: string }> = [];
  public static achievementToastActive: boolean = false;
  public static currentAchievement: { id: string; name: string; description: string } | null = null;
  private statusPanel: Rectangle | StackPanel | null = null;
  private secondaryStatusText: TextBlock | null = null;
  private secondaryResourceBarFill: Rectangle | null = null;
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
  private daemonContainer: Rectangle | null = null;
  private daemonGlitchOverlay: Rectangle | null = null;
  private daemonPopupFlashOverlay: Rectangle | null = null;
  private daemonAvatarImage: Image | null = null;
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
  private settingsMenuBuilder: SettingsMenuBuilder | null = null;
  private gameOverScreen: Rectangle | null = null;
  private roomClearScreen: Rectangle | null = null;
  private bonusScreen: Rectangle | null = null;
  private bonusButtons: Button[] = [];
  private bonusDynamicControls: Control[] = [];
  private bonusRerollButton: Button | null = null;
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
  private avatarPreloadPromise: Promise<void> | null = null;
  public readonly preloadPromise: Promise<void>;
  private readonly daemonAvatarSets: Record<string, string[]> = DAEMON_ANIMATION_PRESETS;
  private scoreText!: TextBlock;
  private comboText!: TextBlock;
  private comboMultiplierText!: TextBlock;
  private comboTimerFill!: Rectangle;
  private comboContainer!: Rectangle;
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
        await Promise.all([
          this.preloadAllAvatarFrames(),
          this.preloadBonusAndAchievementArtworks(bonusIds, achievementIds)
        ]);
      } catch (err) {
        console.warn('Interface 2D preloading encountered warnings:', err);
      }
    })();

    // Create GUIs on main camera
    this.guiFx = AdvancedDynamicTexture.CreateFullscreenUI('HUD_FX', true, scene);
    if (this.guiFx.layer) this.guiFx.layer.layerMask = SCENE_LAYER;
    this.guiFx.useInvalidateRectOptimization = false;
    this.guiFx.background = 'transparent';
    this.guiClean = AdvancedDynamicTexture.CreateFullscreenUI('HUD_CLEAN', true, scene);
    if (this.guiClean.layer) this.guiClean.layer.layerMask = UI_LAYER;
    this.guiClean.useInvalidateRectOptimization = false;
    this.guiClean.background = 'transparent';
    this.enemyGui = AdvancedDynamicTexture.CreateFullscreenUI('EnemyHUD', true, scene);
    if (this.enemyGui.layer) this.enemyGui.layer.layerMask = UI_LAYER;
    this.enemyGui.useInvalidateRectOptimization = false;
    this.enemyGui.background = 'transparent';
    
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
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_CLEARED, async () => {
      await this.handleRoomClearedEvent();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_ENTERED, (data: RoomEnteredPayload) => {
      this.handleRoomEnteredEvent(data);
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_TRANSITION_START, () => {
      this.clearEnemyHealthBars();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.GAME_START_REQUESTED, () => {
      this.clearEnemyHealthBars();
      this.resetWaveCounter();
    }));
    this.unsubscribers.push(this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.clearEnemyHealthBars();
      this.resetWaveCounter();
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
    
    // Queue for creation on the next update to ensure mesh and scene state are ready
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
    this.updateHealthDisplay(current, max);
    
    if (Math.random() < 0.35) {
      const logs = [
        'WARNING: SYSTEM BUFFER OVERFLOW DETECTED.',
        'INTEGRITY CRITICAL: HARDWARE THREAT ENCOUNTERED.',
        'IO INTERRUPT: PACKET COLLISION OCCURRED.',
        'HOST EXCEPTION: MEMORY DUMP SCHEDULED.',
        'CORE TEMPERATURE SPIKE: SHIELD INTEGRITY COMPROMISED.'
      ];
      const chosen = logs[Math.floor(Math.random() * logs.length)];
      this.addLogMessage(chosen);
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
    const fontFamily = 'Consolas';

    // Top bar (transparent container for layout)
    this.topBar = new Rectangle('hud_top_bar');
    this.topBar.width = 1;
    this.topBar.height = '140px';
    this.topBar.thickness = 0;
    this.topBar.background = 'transparent';
    this.topBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.guiClean.addControl(this.topBar);

    // Stats Console (Top Right Container)
    const statsContainer = new Rectangle('hud_stats_container');
    statsContainer.width = '320px';
    statsContainer.height = '130px';
    statsContainer.thickness = 1;
    statsContainer.color = '#3B685C';
    statsContainer.background = 'rgba(10, 18, 22, 0.75)';
    statsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    statsContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    statsContainer.left = -24;
    statsContainer.top = 24;
    statsContainer.cornerRadius = 4;
    this.topBar.addControl(statsContainer);

    this.scoreText = new TextBlock('score_text');
    this.scoreText.text = 'SCORE: 00000000';
    this.scoreText.fontSize = 18;
    this.scoreText.fontFamily = fontFamily;
    this.scoreText.color = '#7CFFEA';
    this.scoreText.left = 16;
    this.scoreText.top = 12;
    this.scoreText.width = '288px';
    this.scoreText.height = '28px';
    this.scoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.scoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsContainer.addControl(this.scoreText);

    this.waveText = new TextBlock('wave_text');
    this.waveText.text = 'WAVE: 00';
    this.waveText.fontSize = 18;
    this.waveText.fontFamily = fontFamily;
    this.waveText.color = '#7CFFEA';
    this.waveText.left = 16;
    this.waveText.top = 48;
    this.waveText.width = '288px';
    this.waveText.height = '28px';
    this.waveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.waveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.waveText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsContainer.addControl(this.waveText);

    this.currencyText = new TextBlock('currency_text');
    this.currencyText.text = 'CREDITS: 000';
    this.currencyText.fontSize = 16;
    this.currencyText.fontFamily = fontFamily;
    this.currencyText.color = '#FFD782';
    this.currencyText.left = 16;
    this.currencyText.top = 84;
    this.currencyText.width = '288px';
    this.currencyText.height = '28px';
    this.currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.currencyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.currencyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statsContainer.addControl(this.currencyText);

    // Combo Container (placed directly below statsContainer)
    this.comboContainer = new Rectangle('combo_container');
    this.comboContainer.width = '140px';
    this.comboContainer.height = '60px';
    this.comboContainer.left = -24;
    this.comboContainer.top = 145;
    this.comboContainer.thickness = 0;
    this.comboContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.comboContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.comboContainer.isVisible = false;
    this.guiClean.addControl(this.comboContainer);

    this.comboText = new TextBlock('combo_text');
    this.comboText.text = 'COMBO X0';
    this.comboText.fontSize = 16;
    this.comboText.fontFamily = fontFamily;
    this.comboText.color = '#FFD782';
    this.comboText.top = '-10px';
    this.comboText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.comboContainer.addControl(this.comboText);

    this.comboMultiplierText = new TextBlock('combo_multiplier_text');
    this.comboMultiplierText.text = '1.0X';
    this.comboMultiplierText.fontSize = 24;
    this.comboMultiplierText.fontFamily = fontFamily;
    this.comboMultiplierText.color = '#FFFFFF';
    this.comboMultiplierText.top = '15px';
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
    this.guiClean.addControl(this.logPanel);

    const logHeader = new TextBlock('log_header');
    logHeader.text = ' SYSTEM MONITOR // DIAGNOSTIC FEED';
    logHeader.fontSize = 10;
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
      line.fontSize = 12;
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
    const pauseBtn = Button.CreateSimpleButton('pause_btn', '||');
    pauseBtn.width = '64px';
    pauseBtn.height = '64px';
    pauseBtn.color = '#7CFFEA';
    pauseBtn.background = 'rgba(10, 30, 35, 0.75)';
    pauseBtn.thickness = 1;
    pauseBtn.left = 24;
    pauseBtn.top = 24;
    pauseBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    pauseBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    if (pauseBtn.textBlock) {
      pauseBtn.textBlock.fontSize = 20;
      pauseBtn.textBlock.fontFamily = fontFamily;
    }
    pauseBtn.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.UI_PAUSE_TOGGLE);
    });
    this.guiClean.addControl(pauseBtn);

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
    this.guiClean.addControl(healthPanel);

    const integrityLabel = new TextBlock('integrity_label');
    integrityLabel.text = 'INTEGRITY';
    integrityLabel.fontSize = 18;
    integrityLabel.fontFamily = fontFamily;
    integrityLabel.color = '#7CFFEA';
    integrityLabel.width = '300px';
    integrityLabel.height = '28px';
    integrityLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    integrityLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    integrityLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    integrityLabel.top = '0px';
    healthPanel.addControl(integrityLabel);

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

    this.healthBarFill = new Rectangle('health_bar_fill');
    this.healthBarFill.width = '100%';
    this.healthBarFill.height = '100%';
    this.healthBarFill.thickness = 0;
    this.healthBarFill.background = '#00FFD1';
    this.healthBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthBarContainer.addControl(this.healthBarFill);

    this.healthValueText = new TextBlock('health_value');
    this.healthValueText.text = '100/100';
    this.healthValueText.fontSize = 16;
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
    this.guiClean.addControl(this.statusPanel);

    this.playerUltDisplay = new TextBlock('ultimate_status');
    this.playerUltDisplay.text = 'ULTI: 0%';
    this.playerUltDisplay.fontSize = 16;
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
    this.secondaryStatusText.fontSize = 16;
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

    // Keep itemStatusText hidden / dummy to preserve compatibility
    this.itemStatusText = new TextBlock('item_status');
    this.itemStatusText.text = 'ITEM: NONE';
    this.itemStatusText.isVisible = false;

    // Auto-aim indicator (keyboard-only mode badge)
    this.autoAimLabel = new TextBlock('auto_aim_indicator');
    this.autoAimLabel.text = '⊙ AUTO-AIM';
    this.autoAimLabel.fontSize = 13;
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
    this.achievementToastContainer.width = '460px';
    this.achievementToastContainer.height = '112px';
    this.achievementToastContainer.thickness = 2;
    this.achievementToastContainer.color = '#7CFFEA';
    this.achievementToastContainer.background = 'rgba(4, 24, 28, 0.92)';
    this.achievementToastContainer.left = 16;
    this.achievementToastContainer.top = 88;
    this.achievementToastContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastContainer.isVisible = false;
    this.achievementToastContainer.isPointerBlocker = false;
    this.achievementToastContainer.zIndex = 1000;
    this.guiClean.addControl(this.achievementToastContainer);

    this.achievementIconPlaceholder = new Rectangle('achievement_toast_icon');
    this.achievementIconPlaceholder.width = '80px';
    this.achievementIconPlaceholder.height = '80px';
    this.achievementIconPlaceholder.thickness = 1;
    this.achievementIconPlaceholder.color = '#5FFFE0';
    this.achievementIconPlaceholder.background = 'rgba(18, 44, 51, 0.9)';
    this.achievementIconPlaceholder.left = 14;
    this.achievementIconPlaceholder.top = 16;
    this.achievementIconPlaceholder.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementIconPlaceholder.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastContainer.addControl(this.achievementIconPlaceholder);

    this.achievementIconText = new TextBlock('achievement_toast_icon_text');
    this.achievementIconText.text = '?';
    this.achievementIconText.fontFamily = fontFamily;
    this.achievementIconText.fontSize = 30;
    this.achievementIconText.color = '#B8FFE6';
    this.achievementIconPlaceholder.addControl(this.achievementIconText);

    // Artwork will be dynamically instantiated in showNextAchievementToast

    this.achievementToastTitle = new TextBlock('achievement_toast_title');
    this.achievementToastTitle.text = 'ACHIEVEMENT UNLOCKED';
    this.achievementToastTitle.fontSize = 18;
    this.achievementToastTitle.fontFamily = fontFamily;
    this.achievementToastTitle.color = '#7CFFEA';
    this.achievementToastTitle.left = 106;
    this.achievementToastTitle.top = 14;
    this.achievementToastTitle.width = '340px';
    this.achievementToastTitle.height = '28px';
    this.achievementToastTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastContainer.addControl(this.achievementToastTitle);

    this.achievementToastDescription = new TextBlock('achievement_toast_desc');
    this.achievementToastDescription.text = '';
    this.achievementToastDescription.fontSize = 14;
    this.achievementToastDescription.fontFamily = fontFamily;
    this.achievementToastDescription.color = '#CFFCF3';
    this.achievementToastDescription.left = 106;
    this.achievementToastDescription.top = 46;
    this.achievementToastDescription.width = '340px';
    this.achievementToastDescription.height = '54px';
    this.achievementToastDescription.textWrapping = true;
    this.achievementToastDescription.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastDescription.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastDescription.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastContainer.addControl(this.achievementToastDescription);

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
    this.daemonContainer.zIndex = 100;
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
    this.daemonMessageText.fontFamily = fontFamily;
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
    this.bonusScreen.isVisible = false;
  }

  private createPauseOverlay(): Rectangle {
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
    title.fontSize = 42;
    title.fontFamily = 'Consolas';
    title.top = '-180px';
    container.addControl(title);

    const buttonPanel = new StackPanel('pause_buttons');
    buttonPanel.width = '340px';
    buttonPanel.top = '40px';
    buttonPanel.spacing = 16;
    container.addControl(buttonPanel);

    const createButton = (text: string, color: string, onClick: () => void) => {
      const btn = Button.CreateSimpleButton(`pause_btn_${text}`, text);
      btn.height = '60px';
      btn.width = '340px';
      btn.color = color;
      btn.background = 'rgba(20, 30, 35, 0.8)';
      btn.thickness = 1;
      btn.cornerRadius = 4;
      btn.fontSize = 22;
      btn.fontFamily = 'Consolas';
      btn.onPointerUpObservable.add(() => onClick());
      buttonPanel.addControl(btn);
      return btn;
    };

    createButton('RESUME', '#B8FFE6', () => {
      this.eventBus.emit(GameEvents.UI_PAUSE_TOGGLE);
    });

    createButton('OPTIONS', '#9FEFE1', () => {
      this.showSettingsMenu();
    });

    createButton('MAIN MENU', '#9FEFE1', () => {
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
    label.fontFamily = 'Consolas';
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
    title.fontFamily = 'Arial';
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
      btn.onPointerUpObservable.add(() => onClick());
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
    if (this.playerUltDisplay) this.playerUltDisplay.isVisible = false;
    if (this.topBar) this.topBar.isVisible = false;
    if (this.logPanel) this.logPanel.isVisible = false;
    if (this.statusPanel) this.statusPanel.isVisible = false;
    if (this.enemyGui) this.enemyGui.rootContainer.isVisible = false;

    this.gameOverScreen.isVisible = true;
    this.gameOverScreen.clearControls();
    
    const container = this.gameOverScreen;
    const fontFamily = 'Consolas, monospace';

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
    scoreValue.fontSize = 42;
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
    const numRows = Math.ceil((stats.bonuses ? stats.bonuses.length : 0) / 8) || 1;
    const bonusContainerHeight = 60 + numRows * 64;

    const bonusContainer = new Rectangle('go_bonuses');
    bonusContainer.width = '640px';
    bonusContainer.height = `${bonusContainerHeight}px`;
    bonusContainer.top = `${40 + bonusContainerHeight / 2}px`;
    bonusContainer.thickness = 1;
    bonusContainer.color = '#3B685C';
    bonusContainer.background = 'rgba(20, 30, 35, 0.4)';
    container.addControl(bonusContainer);

    const bonusLabel = new TextBlock('go_bonus_label', 'EQUIPPED MODULES');
    bonusLabel.fontFamily = fontFamily;
    bonusLabel.fontSize = 14;
    bonusLabel.color = '#7CFFEA';
    bonusLabel.top = `${-(bonusContainerHeight / 2) + 25}px`;
    bonusContainer.addControl(bonusLabel);

    const bonusStackRows = new StackPanel('go_bonus_stack_rows');
    bonusStackRows.isVertical = true;
    bonusStackRows.spacing = 10;
    bonusStackRows.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bonusStackRows.top = '15px';
    bonusContainer.addControl(bonusStackRows);

    // Detached Details Panel for Tooltips at the bottom center of the screen
    const goDetailsPanel = new Rectangle('go_details_panel');
    goDetailsPanel.width = '800px';
    goDetailsPanel.height = '130px';
    goDetailsPanel.top = `${125 + bonusContainerHeight}px`;
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
        if (i % 8 === 0) {
          currentRowStack = new StackPanel(`go_bonus_row_stack_${Math.floor(i / 8)}`);
          currentRowStack.isVertical = false;
          currentRowStack.spacing = 12;
          currentRowStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
          currentRowStack.height = '52px';
          bonusStackRows.addControl(currentRowStack);
        }

        const box = new Rectangle(`go_bonus_box_${bonus.id}`);
        box.width = '52px';
        box.height = '52px';
        box.thickness = 1;
        box.color = '#3B685C';
        box.background = 'rgba(10, 18, 22, 0.85)';
        box.isPointerBlocker = true;
        box.isHitTestVisible = true;
        box.hoverCursor = 'pointer';
        
        const img = new Image(`go_bonus_img_${bonus.id}`, buildHudAssetUrl(`bonuses/${bonus.id}.png`));
        img.width = '38px';
        img.height = '38px';
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
      btn.onPointerUpObservable.add(() => onClick());
      buttonPanel.addControl(btn);
      return btn;
    };

    createButton('MAIN MENU', '#9FEFE1', () => {
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
      existing.container.dispose();
      existing.label.dispose();
      this.enemyHealthBars.delete(enemyId);
    }

    const container = new Rectangle(`healthbar_container_${enemyId}`);
    container.width = '80px';
    container.height = '12px';
    container.background = 'rgba(0, 0, 0, 0.8)';
    container.thickness = 2;

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

    this.enemyGui?.addControl(container);
    this.enemyGui?.addControl(label);

    if (mesh) {
      container.linkWithMesh(mesh);
      container.linkOffsetY = healthBarOffset ?? -60;
      label.linkWithMesh(mesh);
      label.linkOffsetY = (healthBarOffset ?? -60) - 20;
    }

    this.enemyHealthBars.set(enemyId, { container, bar, label });
    this.updateEnemyHealthBarsVisibility();
  }

  private removeEnemyHealthBar(enemyId: string): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      bar.container.dispose();
      bar.label.dispose();
      this.enemyHealthBars.delete(enemyId);
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
    this.updateDaemonPopup(deltaTime);
    this.updateBossRoomAlert(deltaTime);
    this.updateAchievementToast(deltaTime);

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

  updateSecondaryResource(current: number, max: number, active: boolean, activationThreshold: number): void {
    const clampedMax = Math.max(1, max);
    const clampedCurrent = Math.max(0, Math.min(clampedMax, current));
    const ratio = clampedCurrent / clampedMax;
    const thresholdRatio = Math.max(0, Math.min(1, activationThreshold / clampedMax));
    const percentage = Math.round(ratio * 100);

    this.lastStanceRatio = ratio;
    this.lastStanceActive = active;
    this.lastStanceThresholdRatio = thresholdRatio;

    if (!this.secondaryStatusText || !this.secondaryResourceBarFill) return;

    this.secondaryResourceBarFill.width = `${Math.floor(ratio * 100)}%`;

    if (active) {
      this.secondaryStatusText.text = `STANCE: ${percentage}% [ACTIVE]`;
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
      this.secondaryStatusText.text = `STANCE: ${percentage}% [BURST READY]`;
      this.secondaryStatusText.color = '#7CFFEA'; // Ready bright cyan
      this.secondaryResourceBarFill.background = '#7CFFEA';
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.color = '#7CFFEA';
      }
    } else if (ratio <= 0.0) {
      this.secondaryStatusText.text = `STANCE: 0% [RECHARGE]`;
      this.secondaryStatusText.color = '#FFCC66'; // Warning orange
      this.secondaryResourceBarFill.background = '#FFCC66';
    } else {
      this.secondaryStatusText.text = `STANCE: ${percentage}% [RECHARGE]`;
      this.secondaryStatusText.color = '#FFCC66';
      this.secondaryResourceBarFill.background = '#FFCC66';
      if (this.secondaryBarContainer) {
        this.secondaryBarContainer.color = '#FFCC66';
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
      this.achievementToastTitle.text = `UNLOCKED: ${HUDManager.currentAchievement.name}`;
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
      this.achievementToastArtwork.width = '80px';
      this.achievementToastArtwork.height = '80px';
      this.achievementToastArtwork.stretch = Image.STRETCH_UNIFORM;
      this.achievementIconPlaceholder.addControl(this.achievementToastArtwork);
    }

    HUDManager.achievementToastActive = true;
    this.achievementToastTimer = this.achievementToastDuration;
    this.achievementToastContainer.alpha = 1;
    this.achievementToastContainer.isVisible = true;
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
    
    // Fade out during last 0.4 seconds
    if (this.achievementToastTimer < 0.4) {
      this.achievementToastContainer.alpha = Math.max(0, this.achievementToastTimer / 0.4);
    }

    if (this.achievementToastTimer <= 0) {
      this.achievementToastContainer.isVisible = false;
      this.achievementToastContainer.alpha = 1.0; // Reset for next time
      HUDManager.achievementToastActive = false;
      HUDManager.currentAchievement = null;
      
      if (HUDManager.achievementToastQueue.length > 0) {
        this.showNextAchievementToast();
      }
    }
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
    this.startDaemonPopupGlitch(0.85);

    // Select synthesis preset
    const presetName = (options?.voicePreset ?? 'daemon_normal') as any;

    // Synthesis and sync
    try {
      const { buffer, duration, glitchTimestamps } = await this.daemonVoiceSynth.synthesize(processedMessage, presetName);
      this.playDaemonVoiceline(buffer);
      this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval, duration);
      
      // Schedule glitch frame overlays if allowed
      if (options?.canGlitchFrames !== false && glitchTimestamps.length > 0) {
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
    if (lowered.includes('!') || lowered.includes('?') || lowered.includes('...')) {
      if (primary !== 'bsod') return 'bsod';
      return 'error';
    }
    if (primary === 'rire') return 'goofy';
    if (primary === 'enerve') return 'error';
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
    if (!this.daemonAvatarImage) return;
    const fileName = this.daemonAvatarController.getCurrentFrame();
    if (!fileName) return;

    const src = this.getAvatarFrameSrc(fileName);

    // Use cached image if available for instant display
    const cached = this.avatarImageCache.get(fileName);
    if (cached && cached.complete) {
      this.daemonAvatarImage.source = src;
    } else {
      this.daemonAvatarImage.source = src;
    }
  }

  private getAvatarFrameSrc(fileName: string, normalization: 'NFC' | 'NFD' = 'NFC'): string {
    const normalizedBase = getHudAssetBaseUrl();
    const normalizedFileName = fileName.normalize(normalization);
    const encodedFileName = encodeURIComponent(normalizedFileName);
    return `${normalizedBase}avatar_frames_cutout2/${encodedFileName}?v=3`;
  }

  /**
   * Preload specific avatar frames into cache
   * @param frames Array of filenames to preload
   */
  private preloadAvatarFrames(frames: string[]): Promise<void> {
    const promises = frames.map(fileName => {
      // Skip if already cached
      if (this.avatarImageCache.has(fileName)) {
        return Promise.resolve();
      }

      return this.loadAvatarFrame(fileName);
    });

    return Promise.all(promises).then(() => {});
  }

  /**
   * Load a single avatar frame with fallback for Unicode normalization issues
   * @param fileName The frame filename to load
   */
  private loadAvatarFrame(fileName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const img = document.createElement('img') as HTMLImageElement;

      // Try NFD first (macOS filesystem format)
      const srcNFD = this.getAvatarFrameSrc(fileName, 'NFD');

      img.onload = () => {
        this.avatarImageCache.set(fileName, img);
        resolve();
      };

      img.onerror = () => {
        // NFD failed, try NFC (standard Unicode composition)
        const imgNFC = document.createElement('img') as HTMLImageElement;
        const srcNFC = this.getAvatarFrameSrc(fileName, 'NFC');

        imgNFC.onload = () => {
          this.avatarImageCache.set(fileName, imgNFC);
          resolve();
        };

        imgNFC.onerror = () => {
          console.warn(`Failed to preload avatar frame: ${fileName}`);
          console.warn(`  Tried NFD: ${srcNFD}`);
          console.warn(`  Tried NFC: ${srcNFC}`);
          resolve();
        };

        imgNFC.src = srcNFC;
      };

      img.src = srcNFD;
    });
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
    const promises: Promise<void | HTMLImageElement | null>[] = [];
    bonusIds.forEach(id => promises.push(preloadHudAsset(`bonuses/${id}.png`)));
    achievementIds.forEach(id => promises.push(preloadHudAsset(`achievements/${id}.png`)));
    await Promise.all(promises);
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
    this.bonusScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);
    if (this.topBar) this.topBar.isVisible = true;

    const freePicksRemaining = Math.max(0, Math.floor(selectionState?.freePicksRemaining ?? 1));
    const paidRareChoice = selectionState?.paidRareChoice ?? null;
    const paidRareCost = Math.max(1, Math.floor(selectionState?.paidRareCost ?? (rerollCost * 5)));
    const paidRarePurchased = !!selectionState?.paidRarePurchased;
    const selectedBonusIds = new Set(selectionState?.selectedBonusIds ?? []);
    const rerollEnabled = selectionState?.rerollEnabled ?? true;
    const fullHealCost = Math.max(1, Math.floor(selectionState?.fullHealCost ?? (rerollCost * 3)));
    const playerHealthCurrent = Math.max(0, Math.floor(selectionState?.playerHealthCurrent ?? 0));
    const playerHealthMax = Math.max(playerHealthCurrent, Math.floor(selectionState?.playerHealthMax ?? playerHealthCurrent));
    const missingHealth = Math.max(0, playerHealthMax - playerHealthCurrent);

    for (const child of this.bonusScreen.children) {
      if (child.name === 'CHOOSE BONUS_title') {
        child.isVisible = false;
      }
    }

    // Clear previous dynamic controls
    this.bonusButtons.forEach(btn => btn.dispose());
    this.bonusButtons = [];
    this.bonusDynamicControls.forEach(ctrl => ctrl.dispose());
    this.bonusDynamicControls = [];
    this.bonusRerollButton = null;

    const subtitle = new TextBlock('bonus_shop_subtitle');
    subtitle.text = freePicksRemaining > 1 ? `PICK ${freePicksRemaining} FREE BONUSES` : 'PICK 1 FREE BONUS';
    subtitle.color = '#FFD782';
    subtitle.fontSize = 20;
    subtitle.fontFamily = 'Consolas';
    subtitle.top = '-210px';
    subtitle.height = '30px';
    this.bonusScreen.addControl(subtitle);
    this.bonusDynamicControls.push(subtitle);

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
      cost?: number;
    }> = choices.map((choice) => ({
      id: choice.id,
      title: choice.title,
      description: choice.description ?? '',
      rarity: choice.rarity ?? 'common',
      stackLabel: choice.stackLabel ?? '',
      isPaid: false,
      isSelected: selectedBonusIds.has(choice.id),
      isEnabled: !selectedBonusIds.has(choice.id),
    }));

    if (paidOfferVisible && paidRareChoice) {
      const paidAlreadyObtained = selectedBonusIds.has(paidRareChoice.id) || paidRarePurchased;
      const paidEnabled = currency >= paidRareCost && !paidAlreadyObtained;
      cards.push({
        id: paidRareChoice.id,
        title: paidRareChoice.title,
        description: paidRareChoice.description ?? '',
        rarity: paidRareChoice.rarity ?? 'rare',
        stackLabel: paidRareChoice.stackLabel ?? '',
        isPaid: true,
        isSelected: paidAlreadyObtained,
        isEnabled: paidEnabled,
        cost: paidRareCost,
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
    const labelFontSize = Math.max(11, Math.floor(13 * cardScale));
    const rarityFontSize = Math.max(12, Math.floor(16 * cardScale));
    const descriptionFontSize = Math.max(12, Math.floor(15 * cardScale));
    const stackFontSize = Math.max(11, Math.floor(12 * cardScale));
    const artworkGlowSize = Math.floor(180 * cardScale);
    const artworkFrameSize = Math.floor(170 * cardScale);

    if (!paidOfferVisible) {
      const paidHint = new TextBlock('bonus_paid_hint');
      paidHint.text = paidRarePurchased
        ? 'EXTRA PAID CARD ALREADY PURCHASED'
        : 'NO PAID RARE CARD OFFER THIS ROOM';
      paidHint.color = paidRarePurchased ? '#80FFB0' : '#A3B0BF';
      paidHint.fontSize = 13;
      paidHint.fontFamily = 'Consolas';
      paidHint.top = '-184px';
      paidHint.height = '20px';
      this.bonusScreen.addControl(paidHint);
      this.bonusDynamicControls.push(paidHint);
    }

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const rarityStyle = card.isPaid
        ? { border: '#F3C872', glow: '#8D5E17', glowAlpha: 0.55, thickness: 4 }
        : this.getRarityVisual(card.rarity);
      const leftPx = startLeft + (i * (cardWidth + gap));

      const btn = Button.CreateSimpleButton(`bonus_${card.id}${card.isPaid ? '_paid' : ''}`, '');
      btn.width = `${cardWidth}px`;
      btn.height = `${cardHeight}px`;
      btn.color = rarityStyle.border;
      btn.cornerRadius = 14;
      if (card.isPaid) {
        btn.background = card.isEnabled ? 'rgba(41, 29, 14, 0.94)' : 'rgba(52, 25, 24, 0.92)';
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
      btn.onPointerUpObservable.add(() => {
        if (card.isPaid) {
          this.eventBus.emit(GameEvents.BONUS_PAID_PICK_REQUESTED, {
            bonusId: card.id,
            cost: card.cost,
          });
          return;
        }
        this.eventBus.emit(GameEvents.BONUS_SELECTED, { bonusId: card.id });
      });
      this.bonusScreen.addControl(btn);
      this.bonusButtons.push(btn);

      const title = new TextBlock(`bonus_title_${card.id}${card.isPaid ? '_paid' : ''}`);
      title.text = card.title;
      title.color = '#F7FBFF';
      title.fontFamily = 'Consolas';
      title.fontSize = titleFontSize;
      title.top = `${Math.round(-168 * cardScale)}px`;
      title.height = '30px';
      btn.addControl(title);

      const modeText = new TextBlock(`bonus_mode_${card.id}${card.isPaid ? '_paid' : ''}`);
      modeText.text = card.isSelected
        ? 'OBTAINED'
        : card.isPaid
          ? `PAID +1 BONUS${card.cost ? `  -  ${card.cost} CREDITS` : ''}`
          : 'FREE BONUS';
      modeText.color = card.isSelected ? '#B7C0CD' : (card.isPaid ? '#FFD782' : '#9EF3C4');
      modeText.fontFamily = 'Consolas';
      modeText.fontSize = labelFontSize;
      modeText.top = `${Math.round(-142 * cardScale)}px`;
      modeText.height = '20px';
      btn.addControl(modeText);

      const rarityText = new TextBlock(`bonus_rarity_${card.id}${card.isPaid ? '_paid' : ''}`);
      rarityText.text = card.rarity.toUpperCase();
      rarityText.color = rarityStyle.border;
      rarityText.fontFamily = 'Consolas';
      rarityText.fontSize = rarityFontSize;
      rarityText.top = `${Math.round(-118 * cardScale)}px`;
      rarityText.height = '24px';
      btn.addControl(rarityText);

      const artworkGlow = new Rectangle(`bonus_art_glow_${card.id}${card.isPaid ? '_paid' : ''}`);
      artworkGlow.width = `${artworkGlowSize}px`;
      artworkGlow.height = `${artworkGlowSize}px`;
      artworkGlow.thickness = 0;
      artworkGlow.background = rarityStyle.glow;
      artworkGlow.alpha = rarityStyle.glowAlpha;
      artworkGlow.top = `${Math.round(-6 * cardScale)}px`;
      btn.addControl(artworkGlow);

      const artworkFrame = new Rectangle(`bonus_art_frame_${card.id}${card.isPaid ? '_paid' : ''}`);
      artworkFrame.width = `${artworkFrameSize}px`;
      artworkFrame.height = `${artworkFrameSize}px`;
      artworkFrame.thickness = rarityStyle.thickness;
      artworkFrame.color = rarityStyle.border;
      artworkFrame.background = 'rgba(10, 12, 16, 0.9)';
      artworkFrame.top = `${Math.round(-6 * cardScale)}px`;
      btn.addControl(artworkFrame);

      const artworkImg = new Image(`bonus_art_img_${card.id}`);
      const cachedBonusImg = getCachedHudAsset(`bonuses/${card.id}.png`);
      if (cachedBonusImg) {
        artworkImg.domImage = cachedBonusImg;
      } else {
        artworkImg.source = buildHudAssetUrl(`bonuses/${card.id}.png`);
      }
      artworkImg.width = `${artworkFrameSize}px`;
      artworkImg.height = `${artworkFrameSize}px`;
      artworkImg.stretch = Image.STRETCH_UNIFORM;
      artworkFrame.addControl(artworkImg);

      const description = new TextBlock(`bonus_desc_${card.id}${card.isPaid ? '_paid' : ''}`);
      description.text = card.description;
      description.color = '#DDE6EF';
      description.fontFamily = 'Consolas';
      description.fontSize = descriptionFontSize;
      description.textWrapping = true;
      description.width = `${Math.max(170, cardWidth - 48)}px`;
      description.height = `${Math.max(72, Math.floor(86 * cardScale))}px`;
      description.top = `${Math.round(122 * cardScale)}px`;
      btn.addControl(description);

      const stackText = new TextBlock(`bonus_stack_${card.id}${card.isPaid ? '_paid' : ''}`);
      stackText.text = card.stackLabel;
      stackText.color = card.isPaid ? '#FFD782' : '#9FB3C6';
      stackText.fontFamily = 'Consolas';
      stackText.fontSize = stackFontSize;
      stackText.top = `${Math.round(176 * cardScale)}px`;
      stackText.height = '18px';
      btn.addControl(stackText);

      if (card.isSelected) {
        const selectedTag = new TextBlock(`bonus_selected_${card.id}`);
        selectedTag.text = 'OBTAINED';
        selectedTag.color = '#D8DFEA';
        selectedTag.fontFamily = 'Consolas';
        selectedTag.fontSize = Math.max(12, Math.floor(14 * cardScale));
        selectedTag.top = `${Math.round(190 * cardScale)}px`;
        selectedTag.height = '22px';
        btn.addControl(selectedTag);
      }

      if (card.isPaid && !card.isEnabled && !card.isSelected) {
        const lockText = new TextBlock(`bonus_locked_${card.id}`);
        lockText.text = 'TOO EXPENSIVE';
        lockText.color = '#FF9A9A';
        lockText.fontFamily = 'Consolas';
        lockText.fontSize = Math.max(12, Math.floor(14 * cardScale));
        lockText.top = `${Math.round(190 * cardScale)}px`;
        lockText.height = '22px';
        btn.addControl(lockText);
      }
    }

    const actionButtonsStacked = viewportWidth < 1300;
    const actionTop = Math.round((cardHeight / 2) + 52);
    const actionButtonWidth = actionButtonsStacked ? 380 : 300;
    const actionSecondRowTop = actionTop + 60;

    const rerollButton = Button.CreateSimpleButton('bonus_reroll', `REROLL  -  ${rerollCost} CREDITS`);
    rerollButton.width = `${actionButtonWidth}px`;
    rerollButton.height = '52px';
    rerollButton.cornerRadius = 8;
    rerollButton.thickness = 2;
    rerollButton.top = `${actionTop}px`;
    rerollButton.left = actionButtonsStacked ? '0px' : '-178px';
    rerollButton.color = '#FFFFFF';
    rerollButton.fontFamily = 'Consolas';
    const rerollButtonEnabled = rerollEnabled && currency >= rerollCost;
    rerollButton.background = rerollButtonEnabled ? '#2F3D55' : '#3B2020';
    rerollButton.isEnabled = rerollButtonEnabled;
    rerollButton.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.BONUS_REROLL_REQUESTED, { cost: rerollCost });
    });
    this.bonusScreen.addControl(rerollButton);
    this.bonusDynamicControls.push(rerollButton);
    this.bonusRerollButton = rerollButton;

    const fullHealEnabled = missingHealth > 0 && currency >= fullHealCost;
    const fullHealLabel = missingHealth > 0
      ? `FULL HEAL  -  ${fullHealCost} CREDITS  (${playerHealthCurrent}/${playerHealthMax})`
      : `FULL HEAL  -  HP FULL  (${playerHealthCurrent}/${playerHealthMax})`;
    const fullHealButton = Button.CreateSimpleButton('bonus_full_heal', fullHealLabel);
    fullHealButton.width = `${actionButtonWidth}px`;
    fullHealButton.height = '52px';
    fullHealButton.cornerRadius = 8;
    fullHealButton.thickness = 2;
    fullHealButton.top = `${actionButtonsStacked ? actionSecondRowTop : actionTop}px`;
    fullHealButton.left = actionButtonsStacked ? '0px' : '178px';
    fullHealButton.color = '#FFFFFF';
    fullHealButton.fontFamily = 'Consolas';
    fullHealButton.background = fullHealEnabled ? '#2E4A3A' : '#3B2020';
    fullHealButton.isEnabled = fullHealEnabled;
    fullHealButton.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.SHOP_PURCHASE_REQUESTED, {
        itemId: 'full_heal',
        cost: fullHealCost,
      });
    });
    this.bonusScreen.addControl(fullHealButton);
    this.bonusDynamicControls.push(fullHealButton);

    const paidChoiceCountLabel = new TextBlock('bonus_paid_choice_count_label');
    paidChoiceCountLabel.text = paidOfferVisible
      ? 'PAID CARD IS AN EXTRA PICK (+1), NOT A FREE CHOICE'
      : 'ONLY FREE CHOICES THIS ROOM';
    paidChoiceCountLabel.color = paidOfferVisible ? '#FFD782' : '#90A2B8';
    paidChoiceCountLabel.fontSize = 13;
    paidChoiceCountLabel.fontFamily = 'Consolas';
    paidChoiceCountLabel.top = `${actionButtonsStacked ? actionSecondRowTop + 56 : actionTop + 56}px`;
    paidChoiceCountLabel.height = '20px';
    this.bonusScreen.addControl(paidChoiceCountLabel);
    this.bonusDynamicControls.push(paidChoiceCountLabel);
  }

  hideOverlays(): void {
    this.forceHideOverlays();
    this.setHudVisible(true);
  }

  private setHudVisible(visible: boolean): void {
    if (visible) {
      this.forceHideOverlays();
    }
    if (this.playerHealthDisplay) this.playerHealthDisplay.isVisible = visible;
    if (this.playerUltDisplay) this.playerUltDisplay.isVisible = visible;
    if (this.topBar) this.topBar.isVisible = visible;
    if (this.logPanel) this.logPanel.isVisible = visible;
    if (this.statusPanel) this.statusPanel.isVisible = visible;
    if (this.daemonContainer) this.daemonContainer.isVisible = visible && this.daemonVisible;
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
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || ('ontouchstart' in window) 
      || (navigator.maxTouchPoints > 0);
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
    const fontFamily = 'Consolas';

    // 1. LEFT JOYSTICK (Movement - Snapped to 8 Directions)
    const leftJoystickContainer = new Rectangle('left_joystick_container');
    leftJoystickContainer.width = '180px';
    leftJoystickContainer.height = '180px';
    leftJoystickContainer.thickness = 0;
    leftJoystickContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    leftJoystickContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    leftJoystickContainer.left = '100px';
    leftJoystickContainer.top = '-100px';
    this.guiClean.addControl(leftJoystickContainer);
    this.mobileControls.push(leftJoystickContainer);

    const joystickBg = new Rectangle('left_joystick_bg');
    joystickBg.width = '120px';
    joystickBg.height = '120px';
    joystickBg.cornerRadius = 60;
    joystickBg.thickness = 3;
    joystickBg.color = '#2EF9C3';
    joystickBg.background = 'rgba(4, 10, 8, 0.4)';
    leftJoystickContainer.addControl(joystickBg);

    const joystickThumb = new Rectangle('left_joystick_thumb');
    joystickThumb.width = '50px';
    joystickThumb.height = '50px';
    joystickThumb.cornerRadius = 25;
    joystickThumb.thickness = 0;
    joystickThumb.background = '#2EF9C3';
    leftJoystickContainer.addControl(joystickThumb);

    // 2. ACTION BUTTONS (Attack, Stance & Ultimate) — bigger for comfortable touch targets
    const attackBtn = Button.CreateSimpleButton('mobile_attack_btn', 'ATTACK');
    attackBtn.width = '120px';
    attackBtn.height = '120px';
    attackBtn.color = '#FFD782';
    attackBtn.background = 'rgba(20, 15, 10, 0.75)';
    attackBtn.thickness = 3;
    attackBtn.cornerRadius = 60;
    attackBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    attackBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    attackBtn.left = '-80px';
    attackBtn.top = '-80px';
    if (attackBtn.textBlock) {
      attackBtn.textBlock.fontSize = 16;
      attackBtn.textBlock.fontFamily = fontFamily;
      attackBtn.textBlock.fontWeight = 'bold';
    }
    this.guiClean.addControl(attackBtn);
    this.mobileControls.push(attackBtn);
    this.mobileAttackBtn = attackBtn;

    const stanceBtn = Button.CreateSimpleButton('mobile_stance_btn', 'STANCE');
    stanceBtn.width = '96px';
    stanceBtn.height = '96px';
    stanceBtn.color = '#7CFFEA';
    stanceBtn.background = 'rgba(10, 30, 35, 0.75)';
    stanceBtn.thickness = 3;
    stanceBtn.cornerRadius = 48;
    stanceBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    stanceBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    stanceBtn.left = '-240px';
    stanceBtn.top = '-80px';
    if (stanceBtn.textBlock) {
      stanceBtn.textBlock.fontSize = 14;
      stanceBtn.textBlock.fontFamily = fontFamily;
      stanceBtn.textBlock.fontWeight = 'bold';
    }
    this.guiClean.addControl(stanceBtn);
    this.mobileControls.push(stanceBtn);
    this.mobileStanceBtn = stanceBtn;

    const ultBtn = Button.CreateSimpleButton('mobile_ult_btn', 'ULT');
    ultBtn.width = '108px';
    ultBtn.height = '108px';
    ultBtn.color = '#FFFF00';
    ultBtn.background = 'rgba(35, 35, 10, 0.75)';
    ultBtn.thickness = 3;
    ultBtn.cornerRadius = 54;
    ultBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    ultBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    ultBtn.left = '-170px';
    ultBtn.top = '-240px';
    if (ultBtn.textBlock) {
      ultBtn.textBlock.fontSize = 15;
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
    const maxRadius = 60;

    const toJoystickLocal = (clientX: number, clientY: number, result: Vector2): void => {
      const engine = this.scene.getEngine();
      const canvas = engine.getRenderingCanvas();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / (rect.width  || 1);
      const sy = canvas.height / (rect.height || 1);
      const renderX = (clientX - rect.left) * sx;
      const renderY = (clientY - rect.top)  * sy;
      // Maps render-pixel canvas coords → control local space (origin = centre).
      leftJoystickContainer.getLocalCoordinatesToRef(new Vector2(renderX, renderY), result);
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

    const isInsideJoystick = (clientX: number, clientY: number): boolean => {
      const engine = this.scene.getEngine();
      const canvas = engine.getRenderingCanvas();
      if (!canvas) return false;
      const rect  = canvas.getBoundingClientRect();
      const sx    = canvas.width  / (rect.width  || 1);
      const sy    = canvas.height / (rect.height || 1);
      const renderX = (clientX - rect.left) * sx;
      const renderY = (clientY - rect.top)  * sy;
      const local   = new Vector2();
      leftJoystickContainer.getLocalCoordinatesToRef(new Vector2(renderX, renderY), local);
      const hw = leftJoystickContainer.widthInPixels  / 2;
      const hh = leftJoystickContainer.heightInPixels / 2;
      return local.x >= -hw && local.x <= hw && local.y >= -hh && local.y <= hh;
    };

    // Global scene observer — supports multi-touch, works outside container bounds
    const jsLocal = new Vector2();
    this.scene.onPointerObservable.add((pointerInfo) => {
      const event = pointerInfo.event as PointerEvent;
      if (!event) return;

      // Ignore if mobile controls are hidden (e.g. desktop mode)
      if (!this.inputManager || !this.inputManager.isMobileMode()) return;

      const pid = (event as any).pointerId ?? 0;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (!isDraggingLeft && isInsideJoystick(event.clientX, event.clientY)) {
            isDraggingLeft = true;
            leftPointerId  = pid;
            toJoystickLocal(event.clientX, event.clientY, jsLocal);
            applyJoystickInput(jsLocal.x, jsLocal.y);
          }
          break;

        case PointerEventTypes.POINTERMOVE:
          if (isDraggingLeft && pid === leftPointerId) {
            toJoystickLocal(event.clientX, event.clientY, jsLocal);
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
}
