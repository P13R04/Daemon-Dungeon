/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Engine, Vector3, TransformNode, AbstractMesh, Sound } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Image } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { VoicelineConfig, AnimationPhase } from '../data/voicelines/VoicelineDefinitions';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../data/voicelines/DaemonAnimationPresets';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { GameSettingsStore } from '../settings/GameSettings';
import { buildHudAssetUrl, getHudAssetBaseUrl } from './hud/HudAssetPaths';
import { DaemonAvatarController, type DaemonAnimationPhaseState } from './hud/DaemonAvatarController';
import { getPauseAtDisplayIndex, stripPauseMarkers } from './hud/DaemonTextUtils';
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
  private eventBus: EventBus;
  private damageNumbers: DamageNumber[] = [];
  private damageNumberCooldowns: Map<string, { lastTime: number; pending: number; lastPosition: Vector3 }> = new Map();
  private damageNumberCooldown: number = 0.5;
  private enemyHealthBars: Map<string, { container: Rectangle; bar: Rectangle; label: TextBlock }> = new Map();
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
  private statusPanel: Rectangle | null = null;
  private secondaryStatusText: TextBlock | null = null;
  private secondaryResourceBarFill: Rectangle | null = null;
  private itemStatusText: TextBlock | null = null;
  private daemonContainer: Rectangle | null = null;
  private daemonGlitchOverlay: Rectangle | null = null;
  private daemonPopupFlashOverlay: Rectangle | null = null;
  private daemonAvatarImage: Image | null = null;
  private daemonMessageText: TextBlock | null = null;
  private daemonTypewriterSynth: SciFiTypewriterSynth;
  private uiVolumeMultiplier: number = GameSettingsStore.getEffectiveVolume('ui');
  private voicelineVolumeMultiplier: number = GameSettingsStore.getEffectiveVolume('voice');
  private unsubscribeSettings: (() => void) | null = null;
  private daemonAudioUnlockHandler: (() => void) | null = null;
  private daemonTypingIndex: number = 0;
  private daemonTypingTimer: number = 0;
  private daemonTypingSpeed: number = 55;
  private daemonTypingDelay: number = 0.8; // Delay before typing starts
  private daemonTypingDelayTimer: number = 0;
  private daemonPauseEndTime: number = 0; // For mid-text pauses
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
  private activeVoicelineAudios: Set<Sound> = new Set();
  
  private waveNumber: number = 0;
  private isEnabled: boolean = true;
  private showDamageNumbers: boolean = true;
  private showEnemyHealthBars: boolean = true;
  private showEnemyNames: boolean = true;
  private startScreen: Rectangle | null = null;
  private classSelectScreen: Rectangle | null = null;
  private codexScreen: Rectangle | null = null;
  private settingsScreen: Rectangle | null = null;
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
  private avatarImageCache: Map<string, HTMLImageElement> = new Map();
  private avatarPreloadPromise: Promise<void> | null = null;
  private readonly daemonAvatarSets: Record<string, string[]> = DAEMON_ANIMATION_PRESETS;

  constructor(private scene: Scene) {
    this.eventBus = EventBus.getInstance();
    this.daemonTypewriterSynth = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);
    this.applyAudioSettingsFromStore();
    this.unsubscribeSettings = GameSettingsStore.subscribe(() => {
      this.applyAudioSettingsFromStore();
    });
    
    // Preload all avatar frames in background
    this.preloadAllAvatarFrames().catch(err => {
      console.warn('Avatar frames preload failed:', err);
    });
    
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
    if (this.enemyGui.layer) this.enemyGui.layer.layerMask = SCENE_LAYER;
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
  }

  private applyGuiScaling(): void {
    const engine = this.scene.getEngine();
    const scaling = engine.getHardwareScalingLevel();
    this.guiFx.renderAtIdealSize = true;
    this.guiFx.idealWidth = engine.getRenderWidth(true) * scaling;
    this.guiFx.idealHeight = engine.getRenderHeight(true) * scaling;
    this.guiFx.renderScale = 1;

    this.guiClean.renderAtIdealSize = true;
    this.guiClean.idealWidth = engine.getRenderWidth(true) * scaling;
    this.guiClean.idealHeight = engine.getRenderHeight(true) * scaling;
    this.guiClean.renderScale = 1;

    // Enemy bars must stay in raw screen space for projection alignment
    this.enemyGui.renderAtIdealSize = false;
    this.enemyGui.renderScale = 1;
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      this.handleEnemyDamagedEvent(data as EnemyEventPayload);
    });

    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data: EnemyEventPayload) => {
      this.handleEnemySpawnedEvent(data);
    });

    this.eventBus.on(GameEvents.ENEMY_DIED, (data: EnemyEventPayload) => {
      this.handleEnemyDiedEvent(data);
    });

    this.eventBus.on(GameEvents.PLAYER_DAMAGED, async (data: PlayerDamagedPayload) => {
      await this.handlePlayerDamagedEvent(data);
    });

    this.eventBus.on(GameEvents.ROOM_CLEARED, async () => {
      await this.handleRoomClearedEvent();
    });

    this.eventBus.on(GameEvents.ROOM_ENTERED, (data: RoomEnteredPayload) => {
      this.handleRoomEnteredEvent(data);
    });

    this.eventBus.on(GameEvents.ROOM_TRANSITION_START, () => {
      this.clearEnemyHealthBars();
    });

    this.eventBus.on(GameEvents.GAME_START_REQUESTED, () => {
      this.clearEnemyHealthBars();
      this.resetWaveCounter();
    });

    this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.clearEnemyHealthBars();
      this.resetWaveCounter();
    });

    this.eventBus.on(GameEvents.DAEMON_TAUNT, async (data: DaemonTauntPayload) => {
      await this.handleDaemonTauntEvent(data);
    });

    this.eventBus.on(GameEvents.PLAYER_ULTIMATE_READY, (data: PlayerUltReadyPayload) => {
      this.handlePlayerUltimateReadyEvent(data);
    });

    this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data: UiOptionChangedPayload) => {
      this.handleUiOptionChangedEvent(data);
    });

    this.eventBus.on(GameEvents.DEV_ROOM_LOAD_REQUESTED, () => {
      this.clearEnemyHealthBars();
    });
  }

  private handleEnemyDamagedEvent(enemyEvent: EnemyEventPayload): void {
    if (!enemyEvent || !enemyEvent.position || typeof enemyEvent.damage !== 'number') return;
    if (!this.showDamageNumbers) return;

    const enemyId = enemyEvent.entityId ?? enemyEvent.enemyId ?? 'unknown';
    this.addDamageNumber(enemyEvent.position, enemyEvent.damage, enemyId);
  }

  private handleEnemySpawnedEvent(data: EnemyEventPayload): void {
    const enemyId = data?.enemyId ?? data?.entityId;
    if (!enemyId) return;
    this.createEnemyHealthBar(enemyId, data?.enemyName, data?.mesh);
  }

  private handleEnemyDiedEvent(data: EnemyEventPayload): void {
    const enemyId = data?.enemyId ?? data?.entityId;
    if (!enemyId) return;
    this.removeEnemyHealthBar(enemyId);
    this.addLogMessage('ENEMY UNIT DEL...');
  }

  private async handlePlayerDamagedEvent(data: PlayerDamagedPayload): Promise<void> {
    if (!data?.health) return;
    this.updateHealthDisplay(data.health.current, data.health.max);
    if (data.damage && data.damage > 0) {
      this.addLogMessage('INTEGRITY BREACH DETECTED.');
      const taunt = this.getRandomTaunt('damage');
      await this.showDaemonMessage(taunt.text, taunt.emotion);
    }
  }

  private async handleRoomClearedEvent(): Promise<void> {
    this.addLogMessage('ROOM STATUS: CLEAR.');
    const taunt = this.getRandomTaunt('clear');
    await this.showDaemonMessage(taunt.text, taunt.emotion);
  }

  private handleRoomEnteredEvent(data: RoomEnteredPayload): void {
    this.waveNumber += 1;
    this.updateWaveText(this.waveNumber);
    this.addLogMessage(`WAVE ${this.waveNumber.toString().padStart(2, '0')} INIT.`);

    const roomType = typeof data?.roomType === 'string' ? data.roomType.toLowerCase() : 'normal';
    if (roomType === 'boss') {
      const roomName = typeof data?.roomName === 'string' ? data.roomName : 'Unknown Chamber';
      this.triggerBossRoomAlert(roomName);
    }
  }

  private async handleDaemonTauntEvent(data: DaemonTauntPayload): Promise<void> {
    const message = typeof data?.text === 'string' ? data.text : String(data ?? '...');
    const emotion = typeof data?.emotion === 'string' ? data.emotion : undefined;
    const sequence = Array.isArray(data?.sequence) ? data.sequence : undefined;
    const frameInterval = typeof data?.frameInterval === 'number' ? data.frameInterval : undefined;
    const holdDuration = typeof data?.holdDuration === 'number' ? data.holdDuration : undefined;
    const preload = data?.preload !== false;
    await this.showDaemonMessage(message, emotion, { sequence, frameInterval, holdDuration, preload });
  }

  private handlePlayerUltimateReadyEvent(data: PlayerUltReadyPayload): void {
    if (!this.playerUltDisplay) return;
    const percentage = Math.floor(data.charge * 100);
    this.playerUltDisplay.text = `ULTI: ${percentage}%`;
    this.playerUltDisplay.color = data.charge >= 1.0 ? '#00FF00' : '#FFFF00';
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

    // Top bar
    this.topBar = new Rectangle('hud_top_bar');
    this.topBar.width = 1;
    this.topBar.height = '60px';
    this.topBar.thickness = 0;
    this.topBar.background = 'rgba(0, 0, 0, 0.45)';
    this.topBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.guiFx.addControl(this.topBar);

    const integrityLabel = new TextBlock('integrity_label');
    integrityLabel.text = 'INTEGRITY:';
    integrityLabel.fontSize = 16;
    integrityLabel.fontFamily = fontFamily;
    integrityLabel.color = '#7CFFEA';
    integrityLabel.left = 16;
    integrityLabel.top = 8;
    integrityLabel.width = '120px';
    integrityLabel.height = '24px';
    integrityLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    integrityLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    integrityLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.topBar.addControl(integrityLabel);

    const healthBarContainer = new Rectangle('health_bar_container');
    healthBarContainer.width = '220px';
    healthBarContainer.height = '16px';
    healthBarContainer.thickness = 1;
    healthBarContainer.color = '#7CFFEA';
    healthBarContainer.background = 'rgba(10, 30, 35, 0.7)';
    healthBarContainer.left = 140;
    healthBarContainer.top = 10;
    healthBarContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthBarContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.topBar.addControl(healthBarContainer);

    this.healthBarFill = new Rectangle('health_bar_fill');
    this.healthBarFill.width = '100%';
    this.healthBarFill.height = '100%';
    this.healthBarFill.thickness = 0;
    this.healthBarFill.background = '#00FFD1';
    this.healthBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.healthBarFill.left = 0;
    healthBarContainer.addControl(this.healthBarFill);

    this.healthValueText = new TextBlock('health_value');
    this.healthValueText.text = '100/100';
    this.healthValueText.fontSize = 14;
    this.healthValueText.fontFamily = fontFamily;
    this.healthValueText.color = '#CFFCF3';
    this.healthValueText.left = 370;
    this.healthValueText.top = 8;
    this.healthValueText.width = '120px';
    this.healthValueText.height = '24px';
    this.healthValueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.healthValueText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.healthValueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.topBar.addControl(this.healthValueText);
    this.playerHealthDisplay = this.healthValueText;

    this.waveText = new TextBlock('wave_text');
    this.waveText.text = 'WAVE: 00';
    this.waveText.fontSize = 18;
    this.waveText.fontFamily = fontFamily;
    this.waveText.color = '#7CFFEA';
    this.waveText.topInPixels = 8;
    this.waveText.width = '160px';
    this.waveText.height = '24px';
    this.waveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.waveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.waveText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.waveText.left = '-20px'; // 20px from right border
    this.topBar.addControl(this.waveText);

    this.currencyText = new TextBlock('currency_text');
    this.currencyText.text = 'CREDITS: 000';
    this.currencyText.fontSize = 16;
    this.currencyText.fontFamily = fontFamily;
    this.currencyText.color = '#FFD782';
    this.currencyText.topInPixels = 32;
    this.currencyText.width = '220px';
    this.currencyText.height = '22px';
    this.currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.currencyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.currencyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.currencyText.left = '-20px';
    this.topBar.addControl(this.currencyText);

    // Bottom-left command feed
    this.logPanel = new Rectangle('log_panel');
    this.logPanel.width = '36%';
    this.logPanel.height = '150px';
    this.logPanel.thickness = 1;
    this.logPanel.color = '#2EF9C3';
    this.logPanel.background = 'rgba(0, 0, 0, 0.35)';
    this.logPanel.left = 16;
    this.logPanel.top = -16;
    this.logPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.logPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.guiFx.addControl(this.logPanel);

    const logsStack = new Rectangle('log_stack_container');
    logsStack.width = 1;
    logsStack.height = 1;
    logsStack.thickness = 0;
    this.logPanel.addControl(logsStack);

    for (let i = 0; i < 6; i++) {
      const line = new TextBlock(`log_line_${i}`);
      line.text = '';
      line.fontSize = 14;
      line.fontFamily = fontFamily;
      line.color = '#B8FFE6';
      line.height = '24px';
      line.top = `${8 + i * 22}px`;
      line.left = 10;
      line.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      line.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      line.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      logsStack.addControl(line);
      this.logLines.push(line);
    }

    // Bottom-right status
    this.statusPanel = new Rectangle('status_panel');
    this.statusPanel.width = '260px';
    this.statusPanel.height = '120px';
    this.statusPanel.thickness = 1;
    this.statusPanel.color = '#2EF9C3';
    this.statusPanel.background = 'rgba(0, 0, 0, 0.35)';
    this.statusPanel.left = -16;
    this.statusPanel.top = -16;
    this.statusPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.statusPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.guiFx.addControl(this.statusPanel);

    this.playerUltDisplay = new TextBlock('ultimate_status');
    this.playerUltDisplay.text = 'ULTI: 0%';
    this.playerUltDisplay.fontSize = 16;
    this.playerUltDisplay.fontFamily = fontFamily;
    this.playerUltDisplay.color = '#FFFF00';
    this.playerUltDisplay.left = 10;
    this.playerUltDisplay.top = 10;
    this.playerUltDisplay.width = '220px';
    this.playerUltDisplay.height = '24px';
    this.playerUltDisplay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.playerUltDisplay.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.playerUltDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusPanel.addControl(this.playerUltDisplay);

    this.secondaryStatusText = new TextBlock('secondary_status');
    this.secondaryStatusText.text = 'STANCE: 100%';
    this.secondaryStatusText.fontSize = 14;
    this.secondaryStatusText.fontFamily = fontFamily;
    this.secondaryStatusText.color = '#B8FFE6';
    this.secondaryStatusText.left = 10;
    this.secondaryStatusText.top = 40;
    this.secondaryStatusText.width = '220px';
    this.secondaryStatusText.height = '22px';
    this.secondaryStatusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.secondaryStatusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.secondaryStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusPanel.addControl(this.secondaryStatusText);

    const secondaryBarContainer = new Rectangle('secondary_resource_container');
    secondaryBarContainer.width = '220px';
    secondaryBarContainer.height = '12px';
    secondaryBarContainer.thickness = 1;
    secondaryBarContainer.color = '#7CFFEA';
    secondaryBarContainer.background = 'rgba(10, 30, 35, 0.7)';
    secondaryBarContainer.left = 10;
    secondaryBarContainer.top = 62;
    secondaryBarContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    secondaryBarContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.statusPanel.addControl(secondaryBarContainer);

    this.secondaryResourceBarFill = new Rectangle('secondary_resource_fill');
    this.secondaryResourceBarFill.width = '100%';
    this.secondaryResourceBarFill.height = '100%';
    this.secondaryResourceBarFill.thickness = 0;
    this.secondaryResourceBarFill.background = '#66CCFF';
    this.secondaryResourceBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    secondaryBarContainer.addControl(this.secondaryResourceBarFill);

    this.itemStatusText = new TextBlock('item_status');
    this.itemStatusText.text = 'ITEM: NONE';
    this.itemStatusText.fontSize = 14;
    this.itemStatusText.fontFamily = fontFamily;
    this.itemStatusText.color = '#B8FFE6';
    this.itemStatusText.left = 10;
    this.itemStatusText.top = 80;
    this.itemStatusText.width = '220px';
    this.itemStatusText.height = '22px';
    this.itemStatusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.itemStatusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.itemStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusPanel.addControl(this.itemStatusText);

    // Daemon popup
    this.daemonContainer = new Rectangle('daemon_container');
    this.daemonContainer.width = '460px';
    this.daemonContainer.height = '140px';
    this.daemonContainer.thickness = 2;
    this.daemonContainer.color = '#FF3B5C';
    this.daemonContainer.background = 'rgba(20, 0, 6, 0.8)';
    this.daemonContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.daemonContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.daemonContainer.top = this.daemonBaseTop;
    this.daemonContainer.left = this.daemonBaseLeft;
    this.daemonContainer.isVisible = false;
    this.guiClean.addControl(this.daemonContainer);

    this.daemonGlitchOverlay = new Rectangle('daemon_glitch_overlay');
    this.daemonGlitchOverlay.width = '460px';
    this.daemonGlitchOverlay.height = '140px';
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
    avatarBox.width = '90px';
    avatarBox.height = '90px';
    avatarBox.left = 10;
    avatarBox.top = 10;
    avatarBox.thickness = 1;
    avatarBox.color = '#FF7A8F';
    avatarBox.background = 'rgba(90, 0, 12, 0.6)';
    avatarBox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    avatarBox.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.daemonContainer.addControl(avatarBox);

    const initialFrame = this.getAvatarFrameSrc('init_01.png');
    this.daemonAvatarImage = new Image('daemon_avatar_image', initialFrame);
    this.daemonAvatarImage.width = '90px';
    this.daemonAvatarImage.height = '90px';
    this.daemonAvatarImage.stretch = Image.STRETCH_UNIFORM;
    avatarBox.addControl(this.daemonAvatarImage);
    this.daemonAvatarController.setPingPongSequence(this.getAvatarFrames('init'), 0.12);

    this.daemonMessageText = new TextBlock('daemon_message');
    this.daemonMessageText.text = '';
    this.daemonMessageText.fontSize = 16;
    this.daemonMessageText.fontFamily = fontFamily;
    this.daemonMessageText.color = '#FFD1DA';
    this.daemonMessageText.left = 120;
    this.daemonMessageText.top = 10;
    this.daemonMessageText.width = '320px';
    this.daemonMessageText.height = '120px';
    this.daemonMessageText.textWrapping = true;
    this.daemonMessageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.daemonMessageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
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
    this.settingsScreen = null;

    this.gameOverScreen = this.createOverlay('GAME OVER', 'RESTART', () => {
      this.eventBus.emit(GameEvents.GAME_RESTART_REQUESTED);
    });
    this.gameOverScreen.isVisible = false;

    this.roomClearScreen = this.createOverlay('ROOM CLEARED', 'NEXT ROOM', () => {
      this.eventBus.emit(GameEvents.ROOM_NEXT_REQUESTED);
    });
    this.roomClearScreen.isVisible = false;

    this.bonusScreen = this.createOverlay('CHOOSE BONUS', '', () => {});
    this.bonusScreen.isVisible = false;
  }

  private createMainMenuOverlay(): Rectangle {
    const container = new Rectangle('main_menu_overlay');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.75)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiClean.addControl(container);

    const title = new TextBlock('main_menu_title');
    title.text = 'DAEMON DUNGEON';
    title.color = '#7CFFEA';
    title.fontSize = 44;
    title.fontFamily = 'Consolas';
    title.top = '-220px';
    container.addControl(title);

    const subTitle = new TextBlock('main_menu_subtitle');
    subTitle.text = 'SYSTEM READY // MAIN CONSOLE';
    subTitle.color = '#9FEFE1';
    subTitle.fontSize = 16;
    subTitle.fontFamily = 'Consolas';
    subTitle.top = '-170px';
    container.addControl(subTitle);

    const panel = new Rectangle('main_menu_panel');
    panel.width = '460px';
    panel.height = '260px';
    panel.thickness = 1;
    panel.color = '#2EF9C3';
    panel.background = 'rgba(0,0,0,0.35)';
    panel.top = '-20px';
    container.addControl(panel);

    const playBtn = Button.CreateSimpleButton('main_menu_play', 'PLAY');
    playBtn.width = '220px';
    playBtn.height = '46px';
    playBtn.color = '#FFFFFF';
    playBtn.cornerRadius = 6;
    playBtn.background = '#1D3B3A';
    playBtn.thickness = 2;
    playBtn.top = '-70px';
    playBtn.hoverCursor = 'pointer';
    playBtn.onPointerEnterObservable.add(() => {
      playBtn.background = '#2A5A57';
    });
    playBtn.onPointerOutObservable.add(() => {
      playBtn.background = '#1D3B3A';
    });
    playBtn.onPointerUpObservable.add(() => {
      this.showClassSelectMenu();
    });
    panel.addControl(playBtn);

    const codexBtn = Button.CreateSimpleButton('main_menu_codex', 'CODEX');
    codexBtn.width = '220px';
    codexBtn.height = '46px';
    codexBtn.color = '#FFFFFF';
    codexBtn.cornerRadius = 6;
    codexBtn.background = '#1D3B3A';
    codexBtn.thickness = 2;
    codexBtn.top = '-10px';
    codexBtn.hoverCursor = 'pointer';
    codexBtn.onPointerEnterObservable.add(() => {
      codexBtn.background = '#2A5A57';
    });
    codexBtn.onPointerOutObservable.add(() => {
      codexBtn.background = '#1D3B3A';
    });
    codexBtn.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.CODEX_OPEN_REQUESTED);
    });
    panel.addControl(codexBtn);

    const settingsBtn = Button.CreateSimpleButton('main_menu_settings', 'SETTINGS');
    settingsBtn.width = '220px';
    settingsBtn.height = '40px';
    settingsBtn.color = '#6B8A87';
    settingsBtn.cornerRadius = 6;
    settingsBtn.background = 'rgba(20,30,35,0.45)';
    settingsBtn.thickness = 1;
    settingsBtn.top = '40px';
    settingsBtn.isEnabled = false;
    panel.addControl(settingsBtn);

    const hint = new TextBlock('main_menu_hint');
    hint.text = 'PLAY → CHOOSE CLASS';
    hint.color = '#7C9C98';
    hint.fontSize = 12;
    hint.fontFamily = 'Consolas';
    hint.top = '90px';
    panel.addControl(hint);

    return container;
  }

  private createClassSelectOverlay(): Rectangle {
    const container = new Rectangle('class_select_overlay');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.75)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiClean.addControl(container);

    const title = new TextBlock('class_select_title');
    title.text = 'SELECT CLASS';
    title.color = '#7CFFEA';
    title.fontSize = 34;
    title.fontFamily = 'Consolas';
    title.top = '-200px';
    container.addControl(title);

    const panel = new Rectangle('class_select_panel');
    panel.width = '560px';
    panel.height = '280px';
    panel.thickness = 1;
    panel.color = '#2EF9C3';
    panel.background = 'rgba(0,0,0,0.35)';
    panel.top = '-20px';
    container.addControl(panel);

    const mageBtn = Button.CreateSimpleButton('class_mage_btn', 'MAGE // READY');
    mageBtn.width = '260px';
    mageBtn.height = '48px';
    mageBtn.color = '#FFFFFF';
    mageBtn.cornerRadius = 6;
    mageBtn.background = '#1D3B3A';
    mageBtn.thickness = 2;
    mageBtn.top = '-60px';
    mageBtn.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.GAME_START_REQUESTED);
    });
    panel.addControl(mageBtn);

    const warriorBtn = Button.CreateSimpleButton('class_warrior_btn', 'WARRIOR // COMING SOON');
    warriorBtn.width = '260px';
    warriorBtn.height = '40px';
    warriorBtn.color = '#7C9C98';
    warriorBtn.cornerRadius = 6;
    warriorBtn.background = 'rgba(20,30,35,0.6)';
    warriorBtn.thickness = 1;
    warriorBtn.isEnabled = false;
    warriorBtn.top = '0px';
    panel.addControl(warriorBtn);

    const rogueBtn = Button.CreateSimpleButton('class_rogue_btn', 'ROGUE // COMING SOON');
    rogueBtn.width = '260px';
    rogueBtn.height = '40px';
    rogueBtn.color = '#7C9C98';
    rogueBtn.cornerRadius = 6;
    rogueBtn.background = 'rgba(20,30,35,0.6)';
    rogueBtn.thickness = 1;
    rogueBtn.isEnabled = false;
    rogueBtn.top = '50px';
    panel.addControl(rogueBtn);

    const backBtn = Button.CreateSimpleButton('class_select_back', 'BACK');
    backBtn.width = '140px';
    backBtn.height = '36px';
    backBtn.color = '#B8FFE6';
    backBtn.cornerRadius = 4;
    backBtn.background = 'rgba(20,30,35,0.85)';
    backBtn.thickness = 1;
    backBtn.top = '140px';
    backBtn.onPointerUpObservable.add(() => {
      this.showMainMenu();
    });
    panel.addControl(backBtn);

    return container;
  }

  private createCodexOverlay(): Rectangle {
    const container = new Rectangle('codex_overlay');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.75)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiClean.addControl(container);

    const title = new TextBlock('codex_title');
    title.text = 'CODEX DATABASE';
    title.color = '#7CFFEA';
    title.fontSize = 34;
    title.fontFamily = 'Consolas';
    title.top = '-200px';
    container.addControl(title);

    const body = new TextBlock('codex_body');
    body.text = 'ENEMIES / BONUSES / CLASSES\nLOCKED ENTRIES WILL APPEAR HERE.';
    body.color = '#9FEFE1';
    body.fontSize = 14;
    body.fontFamily = 'Consolas';
    body.textWrapping = true;
    body.width = '520px';
    body.height = '220px';
    body.top = '-40px';
    container.addControl(body);

    const backBtn = Button.CreateSimpleButton('codex_back', 'BACK');
    backBtn.width = '140px';
    backBtn.height = '36px';
    backBtn.color = '#B8FFE6';
    backBtn.cornerRadius = 4;
    backBtn.background = 'rgba(20,30,35,0.85)';
    backBtn.thickness = 1;
    backBtn.top = '140px';
    backBtn.onPointerUpObservable.add(() => {
      this.showMainMenu();
    });
    container.addControl(backBtn);

    return container;
  }

  private createSettingsOverlay(): Rectangle {
    const container = new Rectangle('settings_overlay');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.75)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiClean.addControl(container);

    const title = new TextBlock('settings_title');
    title.text = 'SETTINGS';
    title.color = '#7CFFEA';
    title.fontSize = 34;
    title.fontFamily = 'Consolas';
    title.top = '-200px';
    container.addControl(title);

    const body = new TextBlock('settings_body');
    body.text = 'AUDIO / KEYBINDS / ACCESSIBILITY\nPLACEHOLDERS — COMING SOON.';
    body.color = '#9FEFE1';
    body.fontSize = 14;
    body.fontFamily = 'Consolas';
    body.textWrapping = true;
    body.width = '520px';
    body.height = '220px';
    body.top = '-40px';
    container.addControl(body);

    const backBtn = Button.CreateSimpleButton('settings_back', 'BACK');
    backBtn.width = '140px';
    backBtn.height = '36px';
    backBtn.color = '#B8FFE6';
    backBtn.cornerRadius = 4;
    backBtn.background = 'rgba(20,30,35,0.85)';
    backBtn.thickness = 1;
    backBtn.top = '140px';
    backBtn.onPointerUpObservable.add(() => {
      this.showMainMenu();
    });
    container.addControl(backBtn);

    return container;
  }

  private hideMenuScreens(): void {
    if (this.startScreen) this.startScreen.isVisible = false;
    if (this.classSelectScreen) this.classSelectScreen.isVisible = false;
    if (this.codexScreen) this.codexScreen.isVisible = false;
    if (this.settingsScreen) this.settingsScreen.isVisible = false;
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

  private createEnemyHealthBar(enemyId: string, enemyName?: string, mesh?: AbstractMesh): void {
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

    this.enemyGui.addControl(container);
    this.enemyGui.addControl(label);

    if (mesh) {
      container.linkWithMesh(mesh);
      container.linkOffsetY = -60;
      label.linkWithMesh(mesh);
      label.linkOffsetY = -80;
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
    this.guiFx.addControl(text);

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
    this.updateDaemonPopup(deltaTime);
    this.updateBossRoomAlert(deltaTime);

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

    if (this.secondaryStatusText) {
      const state = active ? 'ACTIVE' : (ratio >= thresholdRatio ? 'READY' : 'RECHARGE');
      this.secondaryStatusText.text = `STANCE: ${percentage}% [${state}]`;
      this.secondaryStatusText.color = active ? '#66CCFF' : (ratio >= thresholdRatio ? '#B8FFE6' : '#FFCC66');
    }

    if (this.secondaryResourceBarFill) {
      this.secondaryResourceBarFill.width = `${Math.floor(ratio * 100)}%`;
      if (active) {
        this.secondaryResourceBarFill.background = '#66CCFF';
      } else if (ratio >= thresholdRatio) {
        this.secondaryResourceBarFill.background = '#7CFFEA';
      } else {
        this.secondaryResourceBarFill.background = '#FFCC66';
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
    this.logMessages.unshift(`> ${message}`);
    if (this.logMessages.length > 6) {
      this.logMessages.pop();
    }
    this.refreshLogLines();
  }

  private refreshLogLines(): void {
    for (let i = 0; i < this.logLines.length; i++) {
      this.logLines[i].text = this.logMessages[i] ?? '';
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
    this.daemonFullText = voiceline.message;
    this.daemonDisplayText = stripPauseMarkers(voiceline.message);
    this.daemonTypingIndex = 0;
    this.daemonTypingTimer = 0;
    this.daemonTypingDelayTimer = 0;
    this.daemonHoldTimer = 0;
    this.daemonPauseEndTime = 0;
    this.daemonHoldDuration = voiceline.holdDuration ?? 3.5;
    this.daemonTypingSpeed = voiceline.typingSpeed ?? 55;
    this.daemonMessageText.text = '';
    this.daemonVisible = true;
    this.daemonContainer.isVisible = true;
    this.primeDaemonTypingAudio();
    this.startDaemonPopupGlitch(1.05);

    this.daemonAvatarController.setPhases(phases, voiceline.audioDuration ?? 0);
    
    // Load and play audio if provided
    if (voiceline.audioPath) {
      this.playVoicelineAudio(voiceline.audioPath);
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

  private async showDaemonMessage(
    message: string,
    emotion?: string,
    options?: { sequence?: string[]; frameInterval?: number; holdDuration?: number; preload?: boolean }
  ): Promise<void> {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    
    // Preload frames if requested
    if (options?.preload !== false && options?.sequence && options.sequence.length > 0) {
      await this.preloadAvatarFrames(options.sequence);
    }
    
    this.daemonFullText = message;
    this.daemonDisplayText = stripPauseMarkers(message);
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
    this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval);
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
        
        // Check if we're about to hit a pause marker
        const pauseMatch = getPauseAtDisplayIndex(this.daemonFullText, this.daemonTypingIndex);
        if (pauseMatch) {
          // Start pause
          this.daemonPauseEndTime = nowSeconds + pauseMatch.duration;
          this.daemonTypingIndex += pauseMatch.markerLength;
          return; // Exit and wait for pause to end
        }
        
        this.daemonTypingIndex += 1;
        this.daemonMessageText.text = this.daemonDisplayText.slice(0, this.daemonTypingIndex);
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

    audioEngine.useCustomUnlockedButton = true;
    this.daemonTypewriterSynth.attachContext((audioEngine as AudioEngineLike).audioContext);
  }

  private stopAllVoicelineAudio(): void {
    for (const sound of this.activeVoicelineAudios) {
      try {
        sound.stop();
      } catch {
        // Ignore stop errors for already-ended sounds.
      }
      sound.dispose();
    }
    this.activeVoicelineAudios.clear();
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
    this.daemonGlitchDuration = 0.18 + Math.min(0.22, strength * 0.1);
    this.daemonGlitchTimer = this.daemonGlitchDuration;
    this.daemonFlashDuration = 0.2 + Math.min(0.12, strength * 0.06);
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

  private getRandomTaunt(type: 'damage' | 'clear'): { text: string; emotion: string } {
    const damageTaunts = [
      { text: 'Integrity dropping. Shocking.', emotion: 'énervé' },
      { text: 'You call that dodging?', emotion: 'error' },
      { text: 'Packet loss detected. That was you.', emotion: 'bsod' },
      { text: 'Try not to crash this time, user.', emotion: 'supérieur' },
      { text: 'I felt that through the firewall.', emotion: 'surpris' },
    ];
    const clearTaunts = [
      { text: 'Room cleared. Don’t get smug.', emotion: 'supérieur' },
      { text: 'Minimal competence detected.', emotion: 'blasé' },
      { text: 'Fine. You survived.', emotion: 'happy' },
      { text: 'CPU cool. Ego not so much.', emotion: 'rire' },
      { text: 'Cleanup complete. Try not to regress.', emotion: 'override' },
    ];
    const source = type === 'damage' ? damageTaunts : clearTaunts;
    const index = Math.floor(Math.random() * source.length);
    return source[index];
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
    frameInterval?: number
  ): void {
    if (customSequence && customSequence.length > 0) {
      this.daemonAvatarController.setLoopSequence(customSequence, frameInterval ?? 0.18);
      this.updateDaemonAvatarImage();
      return;
    }

    const emotion = this.resolveDaemonEmotion(message, preferredEmotion);
    const sequence = this.buildAvatarSequence(emotion, message);
    this.daemonAvatarController.setPingPongSequence(sequence, frameInterval ?? this.computeAvatarInterval(message, emotion));
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

    const fallback = ['supérieur', 'happy', 'bored', 'goofy'];
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
    if (primary === 'énervé') return 'error';
    return null;
  }

  private computeAvatarInterval(message: string, emotion: string): number {
    const length = message.length;
    let interval = 0.12;
    if (length <= 20) interval = 0.08;
    if (length >= 80) interval = 0.15;
    if (message.includes('!') || message.includes('?')) interval = 0.07;
    if (emotion === 'rire' || emotion === 'goofy') interval = 0.08;
    if (emotion === 'bsod' || emotion === 'error') interval = 0.1;
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

  private getAvatarFrameSrc(fileName: string, normalization: 'NFC' | 'NFD' = 'NFD'): string {
    const normalizedBase = getHudAssetBaseUrl();
    // Normalize to specified form and encode for URL
    // macOS uses NFD (decomposed) while JavaScript uses NFC (composed) by default
    const normalizedFileName = fileName.normalize(normalization);
    const encodedFileName = encodeURIComponent(normalizedFileName);
    return `${normalizedBase}avatar_frames_cutout2/${encodedFileName}`;
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

  toggleDisplay(enabled: boolean): void {
    this.isEnabled = enabled;
    this.guiFx.rootContainer.isVisible = enabled;
    this.guiClean.rootContainer.isVisible = enabled;
  }

  isDaemonMessageActive(): boolean {
    return this.daemonVisible;
  }

  showStartScreen(): void {
    this.showMainMenu();
    this.setHudVisible(false);
  }

  showGameOverScreen(): void {
    if (this.gameOverScreen) this.gameOverScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);
  }

  showRoomClearScreen(): void {
    if (this.roomClearScreen) this.roomClearScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);
  }

  showBonusChoices(choices: HudBonusChoice[], currency: number, rerollCost: number): void {
    if (!this.bonusScreen) return;
    this.bonusScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);
    if (this.topBar) this.topBar.isVisible = true;

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
    subtitle.text = 'PICK 1 BONUS';
    subtitle.color = '#FFD782';
    subtitle.fontSize = 20;
    subtitle.fontFamily = 'Consolas';
    subtitle.top = '-210px';
    subtitle.height = '30px';
    this.bonusScreen.addControl(subtitle);
    this.bonusDynamicControls.push(subtitle);

    const cardWidth = 300;
    const cardHeight = 420;
    const gap = 24;
    const safeCount = Math.max(1, choices.length);
    const totalWidth = (safeCount * cardWidth) + ((safeCount - 1) * gap);
    const startLeft = -Math.floor(totalWidth / 2) + Math.floor(cardWidth / 2);

    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const rarity = choice.rarity ?? 'common';
      const rarityStyle = this.getRarityVisual(rarity);
      const leftPx = startLeft + (i * (cardWidth + gap));

      const btn = Button.CreateSimpleButton(`bonus_${choice.id}`, '');
      btn.width = `${cardWidth}px`;
      btn.height = `${cardHeight}px`;
      btn.color = rarityStyle.border;
      btn.cornerRadius = 14;
      btn.background = 'rgba(14, 17, 22, 0.92)';
      btn.thickness = rarityStyle.thickness;
      btn.left = `${leftPx}px`;
      btn.top = '-10px';
      btn.onPointerUpObservable.add(() => {
        this.eventBus.emit(GameEvents.BONUS_SELECTED, { bonusId: choice.id });
      });
      this.bonusScreen.addControl(btn);
      this.bonusButtons.push(btn);

      const title = new TextBlock(`bonus_title_${choice.id}`);
      title.text = choice.title;
      title.color = '#F7FBFF';
      title.fontFamily = 'Consolas';
      title.fontSize = 24;
      title.top = '-168px';
      title.height = '30px';
      btn.addControl(title);

      const rarityText = new TextBlock(`bonus_rarity_${choice.id}`);
      rarityText.text = rarity.toUpperCase();
      rarityText.color = rarityStyle.border;
      rarityText.fontFamily = 'Consolas';
      rarityText.fontSize = 16;
      rarityText.top = '-138px';
      rarityText.height = '24px';
      btn.addControl(rarityText);

      const artworkGlow = new Rectangle(`bonus_art_glow_${choice.id}`);
      artworkGlow.width = '180px';
      artworkGlow.height = '180px';
      artworkGlow.thickness = 0;
      artworkGlow.background = rarityStyle.glow;
      artworkGlow.alpha = rarityStyle.glowAlpha;
      artworkGlow.top = '-6px';
      btn.addControl(artworkGlow);

      const artworkFrame = new Rectangle(`bonus_art_frame_${choice.id}`);
      artworkFrame.width = '170px';
      artworkFrame.height = '170px';
      artworkFrame.thickness = rarityStyle.thickness;
      artworkFrame.color = rarityStyle.border;
      artworkFrame.background = 'rgba(10, 12, 16, 0.9)';
      artworkFrame.top = '-6px';
      btn.addControl(artworkFrame);

      const artworkText = new TextBlock(`bonus_art_text_${choice.id}`);
      artworkText.text = 'ARTWORK';
      artworkText.color = '#B8C9D9';
      artworkText.fontFamily = 'Consolas';
      artworkText.fontSize = 15;
      artworkFrame.addControl(artworkText);

      const description = new TextBlock(`bonus_desc_${choice.id}`);
      description.text = choice.description ?? '';
      description.color = '#DDE6EF';
      description.fontFamily = 'Consolas';
      description.fontSize = 15;
      description.textWrapping = true;
      description.width = '250px';
      description.height = '76px';
      description.top = '122px';
      btn.addControl(description);

      const stackText = new TextBlock(`bonus_stack_${choice.id}`);
      stackText.text = choice.stackLabel ?? '';
      stackText.color = '#9FB3C6';
      stackText.fontFamily = 'Consolas';
      stackText.fontSize = 12;
      stackText.top = '176px';
      stackText.height = '18px';
      btn.addControl(stackText);
    }

    const rerollButton = Button.CreateSimpleButton('bonus_reroll', `REROLL  -  ${rerollCost} CREDITS`);
    rerollButton.width = '280px';
    rerollButton.height = '52px';
    rerollButton.cornerRadius = 8;
    rerollButton.thickness = 2;
    rerollButton.top = '245px';
    rerollButton.color = '#FFFFFF';
    rerollButton.fontFamily = 'Consolas';
    rerollButton.background = currency >= rerollCost ? '#2F3D55' : '#3B2020';
    rerollButton.isEnabled = currency >= rerollCost;
    rerollButton.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.BONUS_REROLL_REQUESTED, { cost: rerollCost });
    });
    this.bonusScreen.addControl(rerollButton);
    this.bonusDynamicControls.push(rerollButton);
    this.bonusRerollButton = rerollButton;
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
  }

  dispose(): void {
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
    this.daemonTypewriterSynth.dispose();

    this.guiFx.dispose();
    this.guiClean.dispose();
    this.enemyGui.dispose();
    this.enemyHealthBars.clear();
  }

  private clearEnemyHealthBars(): void {
    for (const bar of this.enemyHealthBars.values()) {
      bar.container.dispose();
      bar.label.dispose();
    }
    this.enemyHealthBars.clear();
  }

  private applyAudioSettingsFromStore(): void {
    this.uiVolumeMultiplier = GameSettingsStore.getEffectiveVolume('ui');
    this.voicelineVolumeMultiplier = GameSettingsStore.getEffectiveVolume('voice');
    this.daemonTypewriterSynth.setVolumeMultiplier(this.uiVolumeMultiplier);

    for (const audio of this.activeVoicelineAudios) {
      audio.setVolume(this.voicelineVolumeMultiplier);
    }
  }
}
