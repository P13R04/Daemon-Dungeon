/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Vector3, Matrix } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

interface DamageNumber {
  text: TextBlock;
  value: number;
  position: Vector3;
  timeElapsed: number;
  duration: number;
}

export class HUDManager {
  private gui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private damageNumbers: DamageNumber[] = [];
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
  private daemonAvatarText: TextBlock | null = null;
  private daemonMessageText: TextBlock | null = null;
  private daemonTypingIndex: number = 0;
  private daemonTypingTimer: number = 0;
  private daemonTypingSpeed: number = 55;
  private daemonFullText: string = '';
  private daemonHoldTimer: number = 0;
  private daemonVisible: boolean = false;
  private avatarFrameTimer: number = 0;
  private avatarFrameIndex: number = 0;
  private waveNumber: number = 0;
  private isEnabled: boolean = true;
  private showDamageNumbers: boolean = true;
  private showEnemyHealthBars: boolean = true;
  private startScreen: Rectangle | null = null;
  private classSelectScreen: Rectangle | null = null;
  private codexScreen: Rectangle | null = null;
  private settingsScreen: Rectangle | null = null;
  private gameOverScreen: Rectangle | null = null;
  private roomClearScreen: Rectangle | null = null;
  private bonusScreen: Rectangle | null = null;
  private bonusButtons: Button[] = [];

  constructor(private scene: Scene) {
    this.eventBus = EventBus.getInstance();
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('HUD', true, scene);
    this.setupEventListeners();
    this.createPlayerHUD();
    this.createOverlays();
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      if (!data || !data.position) return;
      if (this.showDamageNumbers) {
        this.addDamageNumber(data.position, data.damage);
      }
    });

    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data) => {
      const enemyId = data?.enemyId ?? data?.entityId;
      if (!enemyId) return;
      this.createEnemyHealthBar(enemyId);
    });

    this.eventBus.on(GameEvents.ENEMY_DIED, (data) => {
      const enemyId = data?.enemyId ?? data?.entityId;
      if (!enemyId) return;
      this.removeEnemyHealthBar(enemyId);
      this.addLogMessage('ENEMY UNIT DEL...');
    });

    this.eventBus.on(GameEvents.PLAYER_DAMAGED, (data) => {
      this.updateHealthDisplay(data.health.current, data.health.max);
      if (data?.damage && data.damage > 0) {
        this.addLogMessage('INTEGRITY BREACH DETECTED.');
        this.showDaemonMessage(this.getRandomTaunt('damage'));
      }
    });

    this.eventBus.on(GameEvents.ROOM_CLEARED, () => {
      this.addLogMessage('ROOM STATUS: CLEAR.');
      this.showDaemonMessage(this.getRandomTaunt('clear'));
    });

    this.eventBus.on(GameEvents.ROOM_ENTERED, () => {
      this.waveNumber += 1;
      this.updateWaveText(this.waveNumber);
      this.addLogMessage(`WAVE ${this.waveNumber.toString().padStart(2, '0')} INIT.`);
    });

    this.eventBus.on(GameEvents.GAME_START_REQUESTED, () => {
      this.resetWaveCounter();
    });

    this.eventBus.on(GameEvents.GAME_RESTART_REQUESTED, () => {
      this.resetWaveCounter();
    });

    this.eventBus.on(GameEvents.DAEMON_TAUNT, (data) => {
      const message = typeof data?.text === 'string' ? data.text : String(data ?? '...');
      this.showDaemonMessage(message);
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
    this.gui.addControl(this.topBar);

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
    this.waveText.right = 20;
    this.waveText.top = 8;
    this.waveText.width = '160px';
    this.waveText.height = '24px';
    this.waveText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.waveText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.waveText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
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
    this.gui.addControl(this.logPanel);

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
    this.gui.addControl(this.statusPanel);

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

    // Daemon popup (placeholder)
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
    this.gui.addControl(this.daemonContainer);

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

    this.daemonAvatarText = new TextBlock('daemon_avatar_text');
    this.daemonAvatarText.text = '[DAEMON]';
    this.daemonAvatarText.fontSize = 12;
    this.daemonAvatarText.fontFamily = fontFamily;
    this.daemonAvatarText.color = '#FFB0C2';
    this.daemonAvatarText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.daemonAvatarText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    avatarBox.addControl(this.daemonAvatarText);

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
    this.gui.addControl(container);

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
    this.gui.addControl(container);

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
    this.gui.addControl(container);

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
    this.gui.addControl(container);

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
    this.gui.addControl(container);

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

  private createEnemyHealthBar(enemyId: string): void {
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
    container.addControl(bar);

    const label = new TextBlock(`healthbar_label_${enemyId}`);
    label.text = 'E';
    label.fontSize = 10;
    label.color = '#FFFFFF';
    label.width = '80px';
    label.height = '20px';

    this.gui.addControl(container);
    this.gui.addControl(label);

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

  private addDamageNumber(position: Vector3, damage: number): void {
    const text = new TextBlock(`dmg_${Date.now()}`);
    text.text = Math.round(damage).toString();
    text.color = '#FFFFFF';
    text.fontSize = 18;
    text.outlineColor = '#000000';
    text.outlineWidth = 2;
    text.alpha = 1.0;
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.gui.addControl(text);

    this.damageNumbers.push({
      text,
      value: damage,
      position: position.clone(),
      timeElapsed: 0,
      duration: 1.5,
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

  updateEnemyHealthBarPosition(enemyId: string, screenPosition: Vector3): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      bar.container.left = `${screenPosition.x - 40}px`;
      bar.container.top = `${screenPosition.y - 30}px`;
      bar.label.left = `${screenPosition.x - 40}px`;
      bar.label.top = `${screenPosition.y - 50}px`;

      bar.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bar.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      bar.label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bar.label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    }
  }

  private updateEnemyHealthBarsVisibility(): void {
    for (const bar of this.enemyHealthBars.values()) {
      bar.container.isVisible = this.showEnemyHealthBars;
      bar.label.isVisible = this.showEnemyHealthBars;
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
        this.damageNumbers.splice(i, 1);
        continue;
      }

      const camera = this.scene.activeCamera;
      if (!camera) continue;

      const engine = this.scene.getEngine();
      const renderWidth = engine.getRenderWidth();
      const renderHeight = engine.getRenderHeight();
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());

      const worldPos = dmg.position.add(new Vector3(0, 0.6 + dmg.timeElapsed * 0.6, 0));
      const screenPos = Vector3.Project(
        worldPos,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport
      );

      dmg.text.left = `${screenPos.x - renderWidth / 2}px`;
      dmg.text.top = `${screenPos.y - renderHeight / 2}px`;
      dmg.text.alpha = 1.0 - dmg.timeElapsed / dmg.duration;
    }
  }

  private clearDamageNumbers(): void {
    this.damageNumbers.forEach(dmg => dmg.text.dispose());
    this.damageNumbers = [];
  }

  private updateHealthDisplay(current: number, max: number): void {
    if (this.playerHealthDisplay) {
      this.playerHealthDisplay.text = `${current}/${max}`;
    }
    if (this.healthBarFill) {
      const percentage = Math.max(0, Math.min(1, max > 0 ? current / max : 0));
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

  private showDaemonMessage(message: string): void {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    this.daemonFullText = message;
    this.daemonTypingIndex = 0;
    this.daemonTypingTimer = 0;
    this.daemonHoldTimer = 0;
    this.daemonMessageText.text = '';
    this.daemonVisible = true;
    this.daemonContainer.isVisible = true;
  }

  private updateDaemonPopup(deltaTime: number): void {
    if (!this.daemonContainer || !this.daemonMessageText) return;
    if (!this.daemonVisible) return;

    this.avatarFrameTimer += deltaTime;
    if (this.avatarFrameTimer >= 0.15 && this.daemonAvatarText) {
      this.avatarFrameTimer = 0;
      this.avatarFrameIndex = (this.avatarFrameIndex + 1) % 2;
      this.daemonAvatarText.text = this.avatarFrameIndex === 0 ? '[DAEMON]' : '[DAEMON+]';
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
    if (this.daemonHoldTimer >= 3.5) {
      this.daemonVisible = false;
      this.daemonContainer.isVisible = false;
    }
  }

  private getRandomTaunt(type: 'damage' | 'clear'): string {
    const damageTaunts = [
      'Try not to crash this time, user.',
      'Integrity dropping. Shocking.',
      'You call that dodging?'
    ];
    const clearTaunts = [
      'Room cleared. Don’t get smug.',
      'Minimal competence detected.',
      'Fine. You survived.'
    ];
    const source = type === 'damage' ? damageTaunts : clearTaunts;
    const index = Math.floor(Math.random() * source.length);
    return source[index];
  }

  toggleDisplay(enabled: boolean): void {
    this.isEnabled = enabled;
    this.gui.rootContainer.isVisible = enabled;
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
    if (this.startScreen) this.startScreen.isVisible = false;
    if (this.classSelectScreen) this.classSelectScreen.isVisible = false;
    if (this.codexScreen) this.codexScreen.isVisible = false;
    if (this.settingsScreen) this.settingsScreen.isVisible = false;
    if (this.gameOverScreen) this.gameOverScreen.isVisible = false;
    if (this.roomClearScreen) this.roomClearScreen.isVisible = false;
    if (this.bonusScreen) this.bonusScreen.isVisible = false;
    this.setHudVisible(true);
  }

  private setHudVisible(visible: boolean): void {
    if (this.playerHealthDisplay) this.playerHealthDisplay.isVisible = visible;
    if (this.playerUltDisplay) this.playerUltDisplay.isVisible = visible;
    if (this.topBar) this.topBar.isVisible = visible;
    if (this.logPanel) this.logPanel.isVisible = visible;
    if (this.statusPanel) this.statusPanel.isVisible = visible;
    if (this.daemonContainer) this.daemonContainer.isVisible = visible && this.daemonVisible;
  }

  dispose(): void {
    this.gui.dispose();
    this.enemyHealthBars.clear();
  }
}
