/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Engine, Vector3, TransformNode, AbstractMesh, Sound } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Image, StackPanel } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';
import { VoicelineConfig, AnimationPhase, getVoiceline } from '../data/voicelines/VoicelineDefinitions';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../data/voicelines/DaemonAnimationPresets';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { DaemonVoiceSynth } from '../audio/DaemonVoiceSynth';
import { GameSettingsStore, formatInputKeyLabel } from '../settings/GameSettings';
import { buildHudAssetUrl, getHudAssetBaseUrl } from './hud/HudAssetPaths';
import { DaemonAvatarController, type DaemonAnimationPhaseState } from './hud/DaemonAvatarController';
import { getPauseAtDisplayIndex, stripPauseMarkers } from './hud/DaemonTextUtils';
import type { BonusSelectionUiState } from './BonusSystemManager';
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
  private statusPanel: Rectangle | StackPanel | null = null;
  private secondaryStatusText: TextBlock | null = null;
  private secondaryResourceBarFill: Rectangle | null = null;
  private itemStatusText: TextBlock | null = null;
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
  private daemonTypingSpeed: number = 220;
  private daemonTypingDelay: number = 0.01; // Delay before typing starts
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
  private activeVoicelineAudios: Set<Sound | AudioBufferSourceNode> = new Set();
  
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
  private lastVoicelineTime: number = 0;
  private readonly VOICELINE_GLOBAL_COOLDOWN: number = 2.5; // Increased minimum gap
  private lastHazardVoicelineTime: number = 0;
  private readonly HAZARD_COOLDOWN: number = 20.0; // Increased hazard cooldown
  private lastDamageTauntTime: number = 0;
  private readonly DAMAGE_TAUNT_COOLDOWN: number = 15.0; // Cooldown for general damage taunts
  private avatarImageCache: Map<string, HTMLImageElement> = new Map();
  private avatarPreloadPromise: Promise<void> | null = null;
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
    if (this.enemyGui) {
      this.enemyGui.renderAtIdealSize = false;
      this.enemyGui.renderScale = 1;
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
    const current = data?.health?.current ?? (data as any)?.currentHealth ?? 0;
    const max = data?.health?.max ?? (data as any)?.maxHealth ?? 100;
    this.updateHealthDisplay(current, max);

    // Probability and cooldown based taunt on damage
    const now = Date.now() / 1000;
    const canTauntDamage = (now - this.lastDamageTauntTime > this.DAMAGE_TAUNT_COOLDOWN) && 
                          (now - this.lastHazardVoicelineTime > this.HAZARD_COOLDOWN);
                          
    if (data.damage && data.damage > 0 && Math.random() < 0.08 && !this.daemonVisible && canTauntDamage) {
      this.addLogMessage('INTEGRITY BREACH DETECTED.');
      this.lastDamageTauntTime = now;
      const taunt = this.getRandomTaunt('damage');
      this.eventBus.emit(GameEvents.DAEMON_TAUNT, {
        text: taunt.text,
        emotion: taunt.emotion
      });
    }
  }

  private async handleRoomClearedEvent(): Promise<void> {
    this.addLogMessage('ROOM STATUS: CLEAR.');
    const taunt = this.getRandomTaunt('clear');
    this.eventBus.emit(GameEvents.DAEMON_TAUNT, {
      text: taunt.text,
      emotion: taunt.emotion
    });
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

  private async handleWaveUpdate(data: any): Promise<void> {
    const roomType = typeof data?.roomType === 'string' ? data.roomType.toLowerCase() : 'normal';
    if (roomType === 'boss') {
      const roomName = typeof data?.roomName === 'string' ? data.roomName : 'Unknown Chamber';
      this.triggerBossRoomAlert(roomName);
    }
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
    this.topBar.height = '80px';
    this.topBar.thickness = 0;
    this.topBar.background = 'rgba(0, 0, 0, 0.45)';
    this.topBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.guiClean.addControl(this.topBar);

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
    this.waveText.topInPixels = 32;
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
    this.currencyText.topInPixels = 54;
    this.currencyText.width = '220px';
    this.currencyText.height = '22px';
    this.currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.currencyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.currencyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.currencyText.left = '-20px';
    this.topBar.addControl(this.currencyText);

    // Score Display (Top Right)
    this.scoreText = new TextBlock('score_text');
    this.scoreText.text = 'SCORE: 00000000';
    this.scoreText.fontSize = 18;
    this.scoreText.fontFamily = fontFamily;
    this.scoreText.color = '#7CFFEA';
    this.scoreText.left = '-20px';
    this.scoreText.width = '240px';
    this.scoreText.height = '40px';
    this.scoreText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.scoreText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.scoreText.topInPixels = 8;
    this.topBar.addControl(this.scoreText);

    // Combo Container
    this.comboContainer = new Rectangle('combo_container');
    this.comboContainer.width = '140px';
    this.comboContainer.height = '60px';
    this.comboContainer.left = -20;
    this.comboContainer.top = 85;
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
    this.logPanel.width = '36%';
    this.logPanel.height = '150px';
    this.logPanel.thickness = 1;
    this.logPanel.color = '#2EF9C3';
    this.logPanel.background = 'rgba(0, 0, 0, 0.35)';
    this.logPanel.left = 16;
    this.logPanel.top = -16;
    this.logPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.logPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.guiClean.addControl(this.logPanel);

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
    this.guiClean.addControl(this.statusPanel);

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

    this.gameOverScreen = this.createGameOverScreenPlaceholder();
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

  private createGameOverScreenPlaceholder(): Rectangle {
    const container = new Rectangle('gameover_screen');
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.85)';
    container.isVisible = false;
    container.isPointerBlocker = true;
    this.guiClean.addControl(container);
    return container;
  }

  public showGameOverScreen(stats: { score: number; highScore: number; roomReached: number; isNewHighScore: boolean }): void {
    if (!this.gameOverScreen) return;
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
    title.top = '-220px';
    title.shadowBlur = 10;
    title.shadowColor = '#FF0000';
    container.addControl(title);

    // Score Info
    const scoreLabel = new TextBlock('go_score_label');
    scoreLabel.text = 'FINAL SCORE';
    scoreLabel.color = '#9FEFE1';
    scoreLabel.fontSize = 18;
    scoreLabel.fontFamily = fontFamily;
    scoreLabel.top = '-140px';
    container.addControl(scoreLabel);

    const scoreValue = new TextBlock('go_score_value');
    scoreValue.text = stats.score.toLocaleString('en-US').padStart(8, '0');
    scoreValue.color = '#FFFFFF';
    scoreValue.fontSize = 42;
    scoreValue.fontFamily = fontFamily;
    scoreValue.top = '-90px';
    container.addControl(scoreValue);

    if (stats.isNewHighScore) {
      const newRecord = new TextBlock('go_new_record');
      newRecord.text = '!!! NEW HIGH SCORE !!!';
      newRecord.color = '#FFD782';
      newRecord.fontSize = 20;
      newRecord.fontFamily = fontFamily;
      newRecord.top = '-50px';
      container.addControl(newRecord);
    } else {
      const best = new TextBlock('go_best');
      best.text = `BEST: ${stats.highScore.toLocaleString('en-US').padStart(8, '0')}`;
      best.color = '#647D7D';
      best.fontSize = 16;
      best.fontFamily = fontFamily;
      best.top = '-50px';
      container.addControl(best);
    }

    // Room Info
    const roomInfo = new TextBlock('go_room');
    roomInfo.text = `REACHED SECTOR: ${stats.roomReached}`;
    roomInfo.color = '#7CFFEA';
    roomInfo.fontSize = 22;
    roomInfo.fontFamily = fontFamily;
    roomInfo.top = '10px';
    container.addControl(roomInfo);

    // Buttons
    const buttonPanel = new StackPanel('go_buttons');
    buttonPanel.width = '240px';
    buttonPanel.top = '140px';
    container.addControl(buttonPanel);

    const createButton = (text: string, color: string, onClick: () => void) => {
      const btn = Button.CreateSimpleButton(`go_btn_${text}`, text);
      btn.height = '42px';
      btn.width = '240px';
      btn.color = color;
      btn.background = 'rgba(20, 30, 35, 0.8)';
      btn.thickness = 1;
      btn.cornerRadius = 4;
      btn.fontSize = 16;
      btn.fontFamily = fontFamily;
      btn.paddingTop = '8px';
      btn.onPointerUpObservable.add(() => onClick());
      buttonPanel.addControl(btn);
      return btn;
    };

    createButton('RETRY RUN', '#B8FFE6', () => {
      this.eventBus.emit(GameEvents.GAME_RESTART_REQUESTED);
    });

    createButton('CHANGE CLASS', '#9FEFE1', () => {
      this.hideOverlays();
      this.eventBus.emit(GameEvents.CLASS_SELECT_REQUESTED);
    });

    createButton('MAIN MENU', '#647D7D', () => {
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

    this.enemyGui?.addControl(container);
    this.enemyGui?.addControl(label);

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
    const processedMessage = this.replaceKeyPlaceholders(voiceline.message);
    this.daemonFullText = processedMessage;
    this.daemonDisplayText = stripPauseMarkers(processedMessage);
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
    
    const processedMessage = this.replaceKeyPlaceholders(message);
    this.daemonFullText = processedMessage;
    this.daemonDisplayText = stripPauseMarkers(processedMessage);
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

    // Synthesis and sync
    try {
      const { buffer, duration } = await this.daemonVoiceSynth.synthesize(processedMessage, 'cold_dual');
      this.playDaemonVoiceline(buffer);
      this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval, duration);
    } catch (e) {
      console.warn('Daemon synthesis failed:', e);
      this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval);
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
    gain.gain.value = 0.8 * this.uiVolumeMultiplier;

    source.connect(gain);
    gain.connect(ctx.destination);
    
    source.start(ctx.currentTime + 0.1);
    this.activeVoicelineAudios.add(source);
    source.onended = () => {
      this.activeVoicelineAudios.delete(source);
      source.disconnect();
      gain.disconnect();
    };
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
      artworkImg.source = buildHudAssetUrl(`bonuses/${card.id}.png`);
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
    if (this.enemyGui) {
      this.enemyGui.dispose();
      this.enemyGui = null as any;
    }
    this.enemyHealthBars.clear();

    // Clear event bus listeners to avoid echos on scene restart
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
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
      if ((audio as any).setVolume) {
        (audio as any).setVolume(this.voicelineVolumeMultiplier);
      } else if (audio instanceof AudioBufferSourceNode) {
        // Handle AudioBufferSourceNode volume if it has an associated gain node. 
        // For now, doing nothing is fine if there is no setVolume method.
      }
    }
  }
}
