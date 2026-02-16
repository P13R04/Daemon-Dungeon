/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Vector3, TransformNode, AbstractMesh } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Image } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';
import { SCENE_LAYER, UI_LAYER } from '../ui/uiLayers';

interface DamageNumber {
  text: TextBlock;
  value: number;
  position: Vector3;
  timeElapsed: number;
  duration: number;
  anchor: TransformNode;
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
  private logPanel: Rectangle | null = null;
  private logLines: TextBlock[] = [];
  private logMessages: string[] = [];
  private statusPanel: Rectangle | null = null;
  private secondaryStatusText: TextBlock | null = null;
  private itemStatusText: TextBlock | null = null;
  private daemonContainer: Rectangle | null = null;
  private daemonAvatarImage: Image | null = null;
  private daemonMessageText: TextBlock | null = null;
  private daemonTypingIndex: number = 0;
  private daemonTypingTimer: number = 0;
  private daemonTypingSpeed: number = 55;
  private daemonFullText: string = '';
  private daemonHoldTimer: number = 0;
  private daemonHoldDuration: number = 3.5;
  private daemonVisible: boolean = false;
  private avatarFrameTimer: number = 0;
  private avatarFrameIndex: number = 0;
  private avatarFrameDirection: number = 1;
  private avatarFrameInterval: number = 0.12;
  private avatarSequenceMode: 'pingpong' | 'loop' = 'pingpong';
  private daemonAvatarEmotion: string = 'init';
  private daemonAvatarSequence: string[] = [];
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
  private avatarImageCache: Map<string, HTMLImageElement> = new Map();
  private avatarPreloadPromise: Promise<void> | null = null;
  private readonly daemonAvatarSets: Record<string, string[]> = {
    'blasé': ['blasé_01.png', 'blasé_02.png'],
    'bored': ['bored_01.png', 'bored_02.png', 'bored_03.png', 'bored_04.png'],
    'bsod': ['bsod_01.png', 'bsod_02.png', 'bsod_03.png', 'bsod_04.png'],
    'censored': ['censored_01.png', 'censored_02.png', 'censored_03.png', 'censored_04.png'],
    'censuré': ['censuré_01.png', 'censuré_02.png', 'censuré_03.png', 'censuré_04.png'],
    'choqué': ['choqué_01.png', 'choqué_02.png'],
    'error': ['error_01.png', 'error_02.png', 'error_03.png', 'error_04.png'],
    'goofy': ['goofy_01.png', 'goofy_02.png', 'goofy_03.png'],
    'happy': ['happy_01.png', 'happy_02.png', 'happy_03.png', 'happy_04.png'],
    'init': ['init_01.png', 'init_02.png', 'init_03.png', 'init_04.png'],
    'loading': ['loading_01.png', 'loading_02.png'],
    'override': ['override_01.png', 'override_02.png', 'override_03.png', 'override_04.png'],
    'reboot': ['reboot_01.png', 'reboot_02.png', 'reboot_03.png', 'reboot_04.png'],
    'rire': ['rire_01.png', 'rire_02.png', 'rire_03.png', 'rire_04.png'],
    'supérieur': ['supérieur_01.png', 'supérieur_02.png', 'supérieur_03.png', 'supérieur_04.png'],
    'surpris': ['surpris_01.png', 'surpris_02.png', 'surpris_03.png', 'surpris_04.png'],
    'énervé': ['énervé_01.png', 'énervé_02.png', 'énervé_03.png', 'énervé_04.png'],
  };

  constructor(private scene: Scene) {
    this.eventBus = EventBus.getInstance();
    
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
      if (!data || !data.position) return;
      if (this.showDamageNumbers) {
        const enemyId = data?.entityId ?? data?.enemyId ?? 'unknown';
        this.addDamageNumber(data.position, data.damage, enemyId);
      }
    });

    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data) => {
      const enemyId = data?.enemyId ?? data?.entityId;
      if (!enemyId) return;
      this.createEnemyHealthBar(enemyId, data?.enemyName, data?.mesh);
    });

    this.eventBus.on(GameEvents.ENEMY_DIED, (data) => {
      const enemyId = data?.enemyId ?? data?.entityId;
      if (!enemyId) return;
      this.removeEnemyHealthBar(enemyId);
      this.addLogMessage('ENEMY UNIT DEL...');
    });

    this.eventBus.on(GameEvents.PLAYER_DAMAGED, async (data) => {
      this.updateHealthDisplay(data.health.current, data.health.max);
      if (data?.damage && data.damage > 0) {
        this.addLogMessage('INTEGRITY BREACH DETECTED.');
        const taunt = this.getRandomTaunt('damage');
        await this.showDaemonMessage(taunt.text, taunt.emotion);
      }
    });

    this.eventBus.on(GameEvents.ROOM_CLEARED, async () => {
      this.addLogMessage('ROOM STATUS: CLEAR.');
      const taunt = this.getRandomTaunt('clear');
      await this.showDaemonMessage(taunt.text, taunt.emotion);
    });

    this.eventBus.on(GameEvents.ROOM_ENTERED, () => {
      this.waveNumber += 1;
      this.updateWaveText(this.waveNumber);
      this.addLogMessage(`WAVE ${this.waveNumber.toString().padStart(2, '0')} INIT.`);
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

    this.eventBus.on(GameEvents.DAEMON_TAUNT, async (data) => {
      const message = typeof data?.text === 'string' ? data.text : String(data ?? '...');
      const emotion = typeof data?.emotion === 'string' ? data.emotion : undefined;
      const sequence = Array.isArray(data?.sequence) ? data.sequence : undefined;
      const frameInterval = typeof data?.frameInterval === 'number' ? data.frameInterval : undefined;
      const holdDuration = typeof data?.holdDuration === 'number' ? data.holdDuration : undefined;
      const preload = data?.preload !== false; // Preload by default
      await this.showDaemonMessage(message, emotion, { sequence, frameInterval, holdDuration, preload });
    });

    this.eventBus.on(GameEvents.PLAYER_ULTIMATE_READY, (data) => {
      if (this.playerUltDisplay) {
        const percentage = Math.floor(data.charge * 100);
        this.playerUltDisplay.text = `ULTI: ${percentage}%`;
        this.playerUltDisplay.color = data.charge >= 1.0 ? '#00FF00' : '#FFFF00';
      }
    });

    this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data) => {
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
    });

    this.eventBus.on(GameEvents.DEV_ROOM_LOAD_REQUESTED, () => {
      this.clearEnemyHealthBars();
    });
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
    this.secondaryStatusText.text = 'SEC: N/A';
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

    this.itemStatusText = new TextBlock('item_status');
    this.itemStatusText.text = 'ITEM: NONE';
    this.itemStatusText.fontSize = 14;
    this.itemStatusText.fontFamily = fontFamily;
    this.itemStatusText.color = '#B8FFE6';
    this.itemStatusText.left = 10;
    this.itemStatusText.top = 64;
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
    this.daemonContainer.top = 80;
    this.daemonContainer.isVisible = false;
    this.guiClean.addControl(this.daemonContainer);

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
    this.daemonAvatarSequence = this.getAvatarFrames('init');

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
  }

  private createOverlays(): void {
    this.startScreen = this.createMainMenuOverlay();
    this.startScreen.isVisible = false;

    this.classSelectScreen = this.createClassSelectOverlay();
    this.classSelectScreen.isVisible = false;

    this.codexScreen = this.createCodexOverlay();
    this.codexScreen.isVisible = false;

    this.settingsScreen = this.createSettingsOverlay();
    this.settingsScreen.isVisible = false;

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
    playBtn.onPointerUpObservable.add(() => {
      this.showClassSelectMenu();
    });
    panel.addControl(playBtn);

    const codexBtn = Button.CreateSimpleButton('main_menu_codex', 'CODEX');
    codexBtn.width = '220px';
    codexBtn.height = '40px';
    codexBtn.color = '#B8FFE6';
    codexBtn.cornerRadius = 6;
    codexBtn.background = 'rgba(20,30,35,0.85)';
    codexBtn.thickness = 1;
    codexBtn.top = '-10px';
    codexBtn.onPointerUpObservable.add(() => {
      this.showCodexMenu();
    });
    panel.addControl(codexBtn);

    const settingsBtn = Button.CreateSimpleButton('main_menu_settings', 'SETTINGS');
    settingsBtn.width = '220px';
    settingsBtn.height = '40px';
    settingsBtn.color = '#B8FFE6';
    settingsBtn.cornerRadius = 6;
    settingsBtn.background = 'rgba(20,30,35,0.85)';
    settingsBtn.thickness = 1;
    settingsBtn.top = '40px';
    settingsBtn.onPointerUpObservable.add(() => {
      this.showSettingsMenu();
    });
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
    this.daemonTypingIndex = 0;
    this.daemonTypingTimer = 0;
    this.daemonHoldTimer = 0;
    this.daemonHoldDuration = options?.holdDuration ?? 3.5;
    this.daemonMessageText.text = '';
    this.daemonVisible = true;
    this.daemonContainer.isVisible = true;
    this.setDaemonAvatarAnimation(message, emotion, options?.sequence, options?.frameInterval);
  }

  private updateDaemonPopup(deltaTime: number): void {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    if (!this.daemonVisible) return;

    this.avatarFrameTimer += deltaTime;
    if (this.avatarFrameTimer >= this.avatarFrameInterval) {
      this.avatarFrameTimer = 0;
      this.advanceDaemonAvatarFrame();
    }

    if (this.daemonTypingIndex < this.daemonFullText.length) {
      this.daemonTypingTimer += deltaTime;
      const interval = 1 / this.daemonTypingSpeed;
      while (this.daemonTypingTimer >= interval && this.daemonTypingIndex < this.daemonFullText.length) {
        this.daemonTypingTimer -= interval;
        this.daemonTypingIndex += 1;
        this.daemonMessageText.text = this.daemonFullText.slice(0, this.daemonTypingIndex);
      }
      return;
    }

    this.daemonHoldTimer += deltaTime;
    if (this.daemonHoldTimer >= this.daemonHoldDuration) {
      this.daemonVisible = false;
      this.daemonContainer.isVisible = false;
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

  private setDaemonAvatarAnimation(
    message: string,
    preferredEmotion?: string,
    customSequence?: string[],
    frameInterval?: number
  ): void {
    if (customSequence && customSequence.length > 0) {
      this.daemonAvatarSequence = customSequence.slice();
      this.avatarSequenceMode = 'loop';
      this.avatarFrameIndex = 0;
      this.avatarFrameDirection = 1;
      this.avatarFrameInterval = frameInterval ?? 0.18;
      this.updateDaemonAvatarImage();
      return;
    }

    const emotion = this.resolveDaemonEmotion(message, preferredEmotion);
    this.daemonAvatarEmotion = emotion;
    this.daemonAvatarSequence = this.buildAvatarSequence(emotion, message);
    this.avatarSequenceMode = 'pingpong';
    this.avatarFrameIndex = 0;
    this.avatarFrameDirection = 1;
    this.avatarFrameInterval = frameInterval ?? this.computeAvatarInterval(message, emotion);
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
    const lowered = emotion.toLowerCase();
    const aliases: Record<string, string> = {
      blase: 'blasé',
      censure: 'censuré',
      choque: 'choqué',
      enerve: 'énervé',
      superieur: 'supérieur',
    };
    return aliases[lowered] ?? lowered;
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

  private advanceDaemonAvatarFrame(): void {
    if (!this.daemonAvatarSequence.length) return;
    if (this.daemonAvatarSequence.length === 1) {
      this.avatarFrameIndex = 0;
      this.updateDaemonAvatarImage();
      return;
    }

    if (this.avatarSequenceMode === 'loop') {
      this.avatarFrameIndex = (this.avatarFrameIndex + 1) % this.daemonAvatarSequence.length;
    } else {
      const nextIndex = this.avatarFrameIndex + this.avatarFrameDirection;
      if (nextIndex >= this.daemonAvatarSequence.length || nextIndex < 0) {
        this.avatarFrameDirection *= -1;
        this.avatarFrameIndex += this.avatarFrameDirection;
      } else {
        this.avatarFrameIndex = nextIndex;
      }
    }
    this.updateDaemonAvatarImage();
  }

  private updateDaemonAvatarImage(): void {
    if (!this.daemonAvatarImage || !this.daemonAvatarSequence.length) return;
    const fileName = this.daemonAvatarSequence[this.avatarFrameIndex];
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
    const baseUrl = (import.meta as any).env?.BASE_URL ?? '/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
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

  showBonusChoices(choices: Array<{ id: string; label: string }>): void {
    if (!this.bonusScreen) return;
    this.bonusScreen.isVisible = true;
    this.hideMenuScreens();
    this.setHudVisible(false);

    // Clear previous buttons
    this.bonusButtons.forEach(btn => btn.dispose());
    this.bonusButtons = [];

    let startY = -20;
    for (const choice of choices) {
      const btn = Button.CreateSimpleButton(`bonus_${choice.id}`, choice.label);
      btn.width = '320px';
      btn.height = '45px';
      btn.color = '#FFFFFF';
      btn.cornerRadius = 6;
      btn.background = '#1E1E1E';
      btn.thickness = 2;
      btn.top = `${startY}px`;
      btn.onPointerUpObservable.add(() => {
        this.eventBus.emit(GameEvents.BONUS_SELECTED, { bonusId: choice.id });
      });
      this.bonusScreen.addControl(btn);
      this.bonusButtons.push(btn);
      startY += 60;
    }
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
}
