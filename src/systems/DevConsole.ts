/**
 * DevConsole - Development tools for live parameter modification
 */

import { Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Slider, Checkbox, StackPanel, ScrollViewer } from '@babylonjs/gui';
import { ConfigLoader } from '../utils/ConfigLoader';
import { EventBus, GameEvents } from '../core/EventBus';
import { PlayerController } from '../gameplay/PlayerController';
import { UI_LAYER } from '../ui/uiLayers';
import { listAllVoicelineIds, getVoiceline } from '../data/voicelines/VoicelineDefinitions';

export class DevConsole {
  private gui: AdvancedDynamicTexture;
  private isVisible: boolean = true;
  private eventBus: EventBus;
  private configLoader: ConfigLoader;
  private player: PlayerController | null = null;
  private showLiveStats: boolean = false;
  private statsPanel: StackPanel | null = null;
  private dpsInstantText: TextBlock | null = null;
  private dpsTenSecText: TextBlock | null = null;
  private moveSpeedText: TextBlock | null = null;
  private velocityText: TextBlock | null = null;
  private fireRateText: TextBlock | null = null;
  private focusBonusText: TextBlock | null = null;
  private damageEvents: Array<{ t: number; dmg: number }> = [];
  private roomIds: string[] = [];
  private roomSelectIndex: number = 0;
  private roomSelectLabel: TextBlock | null = null;
  private voicelineIds: string[] = [];
  private voicelineSelectIndex: number = 0;
  private voicelineSelectLabel: TextBlock | null = null;
  private gameManager: any;

  constructor(private scene: Scene, gameManager: any) {
    this.gameManager = gameManager;
    this.eventBus = EventBus.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    
    // Initialize voiceline list
    this.voicelineIds = listAllVoicelineIds();
    if (this.voicelineIds.length === 0) {
      this.voicelineIds = ['error_404_skill_not_found'];
    }
    
    // Create GUI on main camera (standard fullscreen UI)
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('DevConsole', true, scene);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }
    this.gui.useInvalidateRectOptimization = false;
    
    this.createConsoleUI();
    this.setupLiveStats();
    this.applyGuiScaling();

    this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data) => {
      if (data?.option === 'postProcessingEnabled' || data?.option === 'postProcessingPixelScale') {
        this.applyGuiScaling();
      }
    });

    const engine = this.scene.getEngine();
    engine.onResizeObservable.add(() => {
      this.applyGuiScaling();
    });
  }

  private applyGuiScaling(): void {
    const engine = this.scene.getEngine();
    const scaling = engine.getHardwareScalingLevel();
    this.gui.renderAtIdealSize = true;
    this.gui.idealWidth = engine.getRenderWidth(true) * scaling;
    this.gui.idealHeight = engine.getRenderHeight(true) * scaling;
    this.gui.renderScale = 1;
  }

  setPlayer(player: PlayerController): void {
    this.player = player;
  }

  private createConsoleUI(): void {
    // Background panel
    const bgPanel = new Rectangle('devConsoleBackground');
    bgPanel.width = '520px';
    bgPanel.height = '85%';
    bgPanel.background = 'rgba(15, 15, 35, 0.98)';
    bgPanel.thickness = 3;
    bgPanel.cornerRadius = 8;
    bgPanel.color = '#00FF00';
    bgPanel.top = '120px';
    bgPanel.left = '10px';
    bgPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bgPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    bgPanel.zIndex = 1000;
    this.gui.addControl(bgPanel);

    const scroll = new ScrollViewer('devConsoleScroll');
    scroll.width = '100%';
    scroll.height = '100%';
    scroll.thickness = 0;
    scroll.background = 'transparent';
    scroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.barColor = '#00FF00';
    scroll.thumbLength = 0.2;
    scroll.barSize = 8;
    scroll.wheelPrecision = 0.5; // Improved scroll sensitivity (was 0.02)
    bgPanel.addControl(scroll);

    // Use StackPanel for proper vertical layout
    const panel = new StackPanel('devConsolePanel');
    panel.width = '480px';
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.top = '30px';
    scroll.addControl(panel);

    // Title
    const title = new TextBlock('devTitle');
    title.text = '>>> DEV CONSOLE <<<';
    title.fontSize = 20;
    title.fontWeight = 'bold';
    title.color = '#00FF00';
    title.height = '35px';
    panel.addControl(title);

    // Player Stats Section
    this.createPlayerStatsSection(panel);

    // Gameplay Options Section
    this.createGameplayOptionsSection(panel);

    // Post Processing Section
    this.createPostProcessingSection(panel);

    // Debug Flags Section
    this.createDebugFlagsSection(panel);

    // Room Testing Section
    this.createRoomTestingSection(panel);

    // Voiceline Testing Section
    this.createVoicelineTestingSection(panel);

    // Camera Section
    this.createCameraSection(panel);

    // Live Stats Section
    this.createLiveStatsSection(panel);

    // Toggle button
    const toggleBtn = new Button('devToggleBtn');
    toggleBtn.width = '60px';
    toggleBtn.height = '30px';
    toggleBtn.background = '#004400';
    toggleBtn.color = '#00FF00';
    toggleBtn.fontSize = 12;
    toggleBtn.left = 10;
    toggleBtn.top = 85;
    toggleBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    
    const toggleLabel = new TextBlock('devToggleLabel');
    toggleLabel.text = 'DEV';
    toggleLabel.color = '#00FF00';
    toggleBtn.addControl(toggleLabel);

    toggleBtn.onPointerUpObservable.add(() => {
      this.toggleConsole();
    });

    this.gui.addControl(toggleBtn);
  }

  private createPlayerStatsSection(parent: StackPanel): void {
    const playerConfig = this.configLoader.getPlayer();
    if (!playerConfig || !playerConfig.health || !playerConfig.attack) return;

    const sectionTitle = new TextBlock('playerStatsTitle');
    sectionTitle.text = '═══ PLAYER STATS ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#00FF00';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    // HP Slider
    const hpLabel = new TextBlock('hpLabel');
    hpLabel.text = `HP: ${playerConfig.health.max}`;
    hpLabel.fontSize = 13;
    hpLabel.fontWeight = 'bold';
    hpLabel.color = '#FFFFFF';
    hpLabel.height = '25px';
    parent.addControl(hpLabel);

    const hpSlider = new Slider('hpSlider');
    hpSlider.minimum = 10;
    hpSlider.maximum = 500;
    hpSlider.value = playerConfig.health.max;
    hpSlider.height = '25px';
    hpSlider.width = '440px';
    hpSlider.color = '#FF3333';
    hpSlider.background = '#444444';
    
    hpSlider.onValueChangedObservable.add((value: number) => {
      hpLabel.text = `HP: ${Math.floor(value)}`;
      playerConfig.health.max = Math.floor(value);
      this.configLoader.updatePlayerConfig(playerConfig);
    });
    parent.addControl(hpSlider);

    // Damage Slider
    const dmgLabel = new TextBlock('dmgLabel');
    dmgLabel.text = `Damage: ${playerConfig.attack.damage}`;
    dmgLabel.fontSize = 13;
    dmgLabel.fontWeight = 'bold';
    dmgLabel.color = '#FFFFFF';
    dmgLabel.height = '25px';
    parent.addControl(dmgLabel);

    const dmgSlider = new Slider('dmgSlider');
    dmgSlider.minimum = 1;
    dmgSlider.maximum = 100;
    dmgSlider.value = playerConfig.attack.damage;
    dmgSlider.height = '25px';
    dmgSlider.width = '440px';
    dmgSlider.color = '#FF9933';
    dmgSlider.background = '#444444';

    dmgSlider.onValueChangedObservable.add((value: number) => {
      dmgLabel.text = `Damage: ${Math.floor(value)}`;
      playerConfig.attack.damage = Math.floor(value);
      this.configLoader.updatePlayerConfig(playerConfig);
    });
    parent.addControl(dmgSlider);

    // Fire Rate Slider
    const frLabel = new TextBlock('frLabel');
    frLabel.text = `Fire Rate: ${playerConfig.attack.fireRate.toFixed(2)}`;
    frLabel.fontSize = 13;
    frLabel.fontWeight = 'bold';
    frLabel.color = '#FFFFFF';
    frLabel.height = '25px';
    parent.addControl(frLabel);

    const frSlider = new Slider('frSlider');
    frSlider.minimum = 0.05;
    frSlider.maximum = 1.0;
    frSlider.value = playerConfig.attack.fireRate;
    frSlider.height = '25px';
    frSlider.width = '440px';
    frSlider.color = '#00FF00';
    frSlider.background = '#444444';

    frSlider.onValueChangedObservable.add((value: number) => {
      frLabel.text = `Fire Rate: ${value.toFixed(2)}`;
      playerConfig.attack.fireRate = value;
      this.configLoader.updatePlayerConfig(playerConfig);
    });
    parent.addControl(frSlider);
  }

  private createGameplayOptionsSection(parent: StackPanel): void {
    const gameplayConfig = this.configLoader.getGameplay();
    if (!gameplayConfig || !gameplayConfig.uiConfig) return;

    const sectionTitle = new TextBlock('gameplayTitle');
    sectionTitle.text = '═══ GAMEPLAY OPTIONS ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#00FF00';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    // Show Enemy Health Bars
    const healthBarsContainer = new StackPanel('healthBarsContainer');
    healthBarsContainer.isVertical = false;
    healthBarsContainer.height = '30px';
    healthBarsContainer.width = '440px';
    healthBarsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    
    const healthBarsCheckbox = new Checkbox('showHealthBarsCheckbox');
    healthBarsCheckbox.isChecked = gameplayConfig.uiConfig.showEnemyHealthBars;
    healthBarsCheckbox.width = '25px';
    healthBarsCheckbox.height = '25px';

    const healthBarsLabel = new TextBlock('showHealthBarsLabel');
    healthBarsLabel.text = '  Show Health Bars';
    healthBarsLabel.fontSize = 13;
    healthBarsLabel.color = '#FFFFFF';
    healthBarsLabel.width = '400px';
    healthBarsLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    healthBarsCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      console.log('Health bars checkbox changed to:', isChecked);
      gameplayConfig.uiConfig.showEnemyHealthBars = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'showEnemyHealthBars', value: isChecked });
    });

    healthBarsContainer.addControl(healthBarsCheckbox);
    healthBarsContainer.addControl(healthBarsLabel);
    parent.addControl(healthBarsContainer);

    // Show Enemy Names
    const enemyNamesContainer = new StackPanel('enemyNamesContainer');
    enemyNamesContainer.isVertical = false;
    enemyNamesContainer.height = '30px';
    enemyNamesContainer.width = '440px';
    enemyNamesContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const enemyNamesCheckbox = new Checkbox('showEnemyNamesCheckbox');
    enemyNamesCheckbox.isChecked = gameplayConfig.uiConfig.showEnemyNames ?? true;
    enemyNamesCheckbox.width = '25px';
    enemyNamesCheckbox.height = '25px';

    const enemyNamesLabel = new TextBlock('showEnemyNamesLabel');
    enemyNamesLabel.text = '  Show Enemy Names';
    enemyNamesLabel.fontSize = 13;
    enemyNamesLabel.color = '#FFFFFF';
    enemyNamesLabel.width = '400px';
    enemyNamesLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    enemyNamesCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      gameplayConfig.uiConfig.showEnemyNames = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'showEnemyNames', value: isChecked });
    });

    enemyNamesContainer.addControl(enemyNamesCheckbox);
    enemyNamesContainer.addControl(enemyNamesLabel);
    parent.addControl(enemyNamesContainer);

    // Show Damage Numbers
    const damageNumbersContainer = new StackPanel('damageNumbersContainer');
    damageNumbersContainer.isVertical = false;
    damageNumbersContainer.height = '30px';
    damageNumbersContainer.width = '440px';
    damageNumbersContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    
    const damageNumbersCheckbox = new Checkbox('showDamageNumbersCheckbox');
    damageNumbersCheckbox.isChecked = gameplayConfig.uiConfig.showDamageNumbers;
    damageNumbersCheckbox.width = '25px';
    damageNumbersCheckbox.height = '25px';

    const damageNumbersLabel = new TextBlock('showDamageNumbersLabel');
    damageNumbersLabel.text = '  Show Damage Numbers';
    damageNumbersLabel.fontSize = 13;
    damageNumbersLabel.color = '#FFFFFF';
    damageNumbersLabel.width = '400px';
    damageNumbersLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    damageNumbersCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      gameplayConfig.uiConfig.showDamageNumbers = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'showDamageNumbers', value: isChecked });
    });

    damageNumbersContainer.addControl(damageNumbersCheckbox);
    damageNumbersContainer.addControl(damageNumbersLabel);
    parent.addControl(damageNumbersContainer);
  }

  private createPostProcessingSection(parent: StackPanel): void {
    const gameplayConfig = this.configLoader.getGameplay();
    if (!gameplayConfig) return;

    if (!gameplayConfig.postProcessing) {
      gameplayConfig.postProcessing = {
        enabled: true,
        pixelScale: 1.6,
        glowIntensity: 0.8,
        chromaticAmount: 30,
        chromaticRadial: 0.8,
        grainIntensity: 12,
        grainAnimated: true,
        vignetteEnabled: true,
        vignetteWeight: 4.0,
        vignetteColor: [0, 0, 0, 1],
      };
      this.configLoader.updateGameplayConfig(gameplayConfig);
    }

    const pp = gameplayConfig.postProcessing;

    const sectionTitle = new TextBlock('postProcessTitle');
    sectionTitle.text = '═══ POST PROCESSING ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#66FFCC';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    const ppEnableRow = new StackPanel('ppEnableRow');
    ppEnableRow.isVertical = false;
    ppEnableRow.height = '30px';
    ppEnableRow.width = '440px';
    ppEnableRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const ppEnableCheckbox = new Checkbox('ppEnableCheckbox');
    ppEnableCheckbox.isChecked = !!pp.enabled;
    ppEnableCheckbox.width = '25px';
    ppEnableCheckbox.height = '25px';

    const ppEnableLabel = new TextBlock('ppEnableLabel');
    ppEnableLabel.text = '  Enable Post FX';
    ppEnableLabel.fontSize = 13;
    ppEnableLabel.color = '#FFFFFF';
    ppEnableLabel.width = '400px';
    ppEnableLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    ppEnableCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      pp.enabled = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingEnabled', value: isChecked });
    });

    ppEnableRow.addControl(ppEnableCheckbox);
    ppEnableRow.addControl(ppEnableLabel);
    parent.addControl(ppEnableRow);

    this.createPostProcessSlider(parent, 'Pixel Scale', pp.pixelScale, 1, 3, 0.1, (value) => {
      pp.pixelScale = value;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingPixelScale', value });
    });

    this.createPostProcessSlider(parent, 'Glow Intensity', pp.glowIntensity, 0, 2, 0.05, (value) => {
      pp.glowIntensity = value;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingGlow', value });
    });

    this.createPostProcessSlider(parent, 'Chromatic Amount', pp.chromaticAmount, 0, 60, 1, (value) => {
      pp.chromaticAmount = value;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingChromatic', value });
    });

    this.createPostProcessSlider(parent, 'Chromatic Radial', pp.chromaticRadial, 0, 1, 0.05, (value) => {
      pp.chromaticRadial = value;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingChromaticRadial', value });
    });

    this.createPostProcessSlider(parent, 'Grain Intensity', pp.grainIntensity, 0, 30, 1, (value) => {
      pp.grainIntensity = value;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingGrain', value });
    });

    const grainAnimatedRow = new StackPanel('grainAnimatedRow');
    grainAnimatedRow.isVertical = false;
    grainAnimatedRow.height = '30px';
    grainAnimatedRow.width = '440px';
    grainAnimatedRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const grainAnimatedCheckbox = new Checkbox('grainAnimatedCheckbox');
    grainAnimatedCheckbox.isChecked = !!pp.grainAnimated;
    grainAnimatedCheckbox.width = '25px';
    grainAnimatedCheckbox.height = '25px';

    const grainAnimatedLabel = new TextBlock('grainAnimatedLabel');
    grainAnimatedLabel.text = '  Animated Grain';
    grainAnimatedLabel.fontSize = 13;
    grainAnimatedLabel.color = '#FFFFFF';
    grainAnimatedLabel.width = '400px';
    grainAnimatedLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    grainAnimatedCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      pp.grainAnimated = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingGrainAnimated', value: isChecked });
    });

    grainAnimatedRow.addControl(grainAnimatedCheckbox);
    grainAnimatedRow.addControl(grainAnimatedLabel);
    parent.addControl(grainAnimatedRow);

    const vignetteRow = new StackPanel('vignetteRow');
    vignetteRow.isVertical = false;
    vignetteRow.height = '30px';
    vignetteRow.width = '440px';
    vignetteRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const vignetteCheckbox = new Checkbox('vignetteCheckbox');
    vignetteCheckbox.isChecked = !!pp.vignetteEnabled;
    vignetteCheckbox.width = '25px';
    vignetteCheckbox.height = '25px';

    const vignetteLabel = new TextBlock('vignetteLabel');
    vignetteLabel.text = '  Vignette';
    vignetteLabel.fontSize = 13;
    vignetteLabel.color = '#FFFFFF';
    vignetteLabel.width = '400px';
    vignetteLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    vignetteCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      pp.vignetteEnabled = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingVignette', value: isChecked });
    });

    vignetteRow.addControl(vignetteCheckbox);
    vignetteRow.addControl(vignetteLabel);
    parent.addControl(vignetteRow);

    this.createPostProcessSlider(parent, 'Vignette Weight', pp.vignetteWeight, 0, 10, 0.5, (value) => {
      pp.vignetteWeight = value;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.UI_OPTION_CHANGED, { option: 'postProcessingVignetteWeight', value });
    });
  }

  private createPostProcessSlider(
    parent: StackPanel,
    label: string,
    initialValue: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void
  ): void {
    const labelBlock = new TextBlock(`pp_${label}_label`);
    labelBlock.text = `${label}: ${initialValue.toFixed(2)}`;
    labelBlock.fontSize = 13;
    labelBlock.fontWeight = 'bold';
    labelBlock.color = '#FFFFFF';
    labelBlock.height = '25px';
    parent.addControl(labelBlock);

    const slider = new Slider(`pp_${label}_slider`);
    slider.minimum = min;
    slider.maximum = max;
    slider.value = initialValue;
    slider.height = '25px';
    slider.width = '440px';
    slider.color = '#66FFCC';
    slider.background = '#444444';
    slider.onValueChangedObservable.add((value: number) => {
      const stepped = Math.round(value / step) * step;
      labelBlock.text = `${label}: ${stepped.toFixed(2)}`;
      onChange(stepped);
    });
    parent.addControl(slider);
  }

  private createLiveStatsSection(parent: StackPanel): void {
    const sectionTitle = new TextBlock('liveStatsTitle');
    sectionTitle.text = '═══ LIVE STATS ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#00BFFF';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    const toggleContainer = new StackPanel('liveStatsToggleContainer');
    toggleContainer.isVertical = false;
    toggleContainer.height = '30px';
    toggleContainer.width = '440px';
    toggleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const toggleCheckbox = new Checkbox('liveStatsCheckbox');
    toggleCheckbox.isChecked = this.showLiveStats;
    toggleCheckbox.width = '25px';
    toggleCheckbox.height = '25px';

    const toggleLabel = new TextBlock('liveStatsLabel');
    toggleLabel.text = '  Show Live Stats';
    toggleLabel.fontSize = 13;
    toggleLabel.color = '#FFFFFF';
    toggleLabel.width = '400px';
    toggleLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    toggleCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      this.showLiveStats = isChecked;
      if (this.statsPanel) {
        this.statsPanel.isVisible = isChecked;
      }
    });

    toggleContainer.addControl(toggleCheckbox);
    toggleContainer.addControl(toggleLabel);
    parent.addControl(toggleContainer);

    this.statsPanel = new StackPanel('liveStatsPanel');
    this.statsPanel.isVertical = true;
    this.statsPanel.width = '440px';
    this.statsPanel.isVisible = this.showLiveStats;
    parent.addControl(this.statsPanel);

    this.dpsInstantText = this.createStatLine('DPS (1s): 0');
    this.dpsTenSecText = this.createStatLine('DPS (10s): 0');
    this.moveSpeedText = this.createStatLine('Move Speed: 0');
    this.velocityText = this.createStatLine('Velocity: 0');
    this.fireRateText = this.createStatLine('Fire Rate: 0');
    this.focusBonusText = this.createStatLine('Focus Bonus: 1.00x');

    this.statsPanel.addControl(this.dpsInstantText);
    this.statsPanel.addControl(this.dpsTenSecText);
    this.statsPanel.addControl(this.moveSpeedText);
    this.statsPanel.addControl(this.velocityText);
    this.statsPanel.addControl(this.fireRateText);
    this.statsPanel.addControl(this.focusBonusText);
  }

  private createRoomTestingSection(parent: StackPanel): void {
    const rooms = this.configLoader.getRooms();
    this.roomIds = Array.isArray(rooms) ? rooms.map((r: any) => r.id) : [];
    if (this.roomIds.length === 0) {
      this.roomIds = ['room_test_dummies'];
    }

    const sectionTitle = new TextBlock('roomTestTitle');
    sectionTitle.text = '═══ ROOM TESTING ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#00FFAA';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    const selectorRow = new StackPanel('roomSelectorRow');
    selectorRow.isVertical = false;
    selectorRow.height = '34px';
    selectorRow.width = '440px';
    selectorRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const prevBtn = Button.CreateSimpleButton('roomPrevBtn', '<');
    prevBtn.width = '30px';
    prevBtn.height = '26px';
    prevBtn.color = '#00FFAA';
    prevBtn.background = '#1A1A2A';
    prevBtn.thickness = 1;
    prevBtn.onPointerUpObservable.add(() => {
      this.roomSelectIndex = (this.roomSelectIndex - 1 + this.roomIds.length) % this.roomIds.length;
      this.updateRoomLabel();
    });

    this.roomSelectLabel = new TextBlock('roomSelectLabel');
    this.roomSelectLabel.text = this.roomIds[this.roomSelectIndex];
    this.roomSelectLabel.fontSize = 13;
    this.roomSelectLabel.color = '#FFFFFF';
    this.roomSelectLabel.width = '320px';
    this.roomSelectLabel.height = '26px';
    this.roomSelectLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const nextBtn = Button.CreateSimpleButton('roomNextBtn', '>');
    nextBtn.width = '30px';
    nextBtn.height = '26px';
    nextBtn.color = '#00FFAA';
    nextBtn.background = '#1A1A2A';
    nextBtn.thickness = 1;
    nextBtn.onPointerUpObservable.add(() => {
      this.roomSelectIndex = (this.roomSelectIndex + 1) % this.roomIds.length;
      this.updateRoomLabel();
    });

    selectorRow.addControl(prevBtn);
    selectorRow.addControl(this.roomSelectLabel);
    selectorRow.addControl(nextBtn);
    parent.addControl(selectorRow);

    const loadBtn = Button.CreateSimpleButton('roomLoadBtn', 'LOAD ROOM');
    loadBtn.width = '200px';
    loadBtn.height = '30px';
    loadBtn.color = '#FFFFFF';
    loadBtn.background = '#004400';
    loadBtn.thickness = 1;
    loadBtn.top = '4px';
    loadBtn.onPointerUpObservable.add(() => {
      const roomId = this.roomIds[this.roomSelectIndex];
      this.eventBus.emit(GameEvents.DEV_ROOM_LOAD_REQUESTED, { roomId });
    });
    parent.addControl(loadBtn);

    // Add tile controls
    const tileSectionTitle = new TextBlock('tileSectionTitle');
    tileSectionTitle.text = '═══ TILE SYSTEM ═══';
    tileSectionTitle.fontSize = 15;
    tileSectionTitle.fontWeight = 'bold';
    tileSectionTitle.color = '#FFD700';
    tileSectionTitle.height = '34px';
    tileSectionTitle.paddingTop = 6;
    tileSectionTitle.paddingBottom = 6;
    parent.addControl(tileSectionTitle);

    const tileButtonRow = new StackPanel('tileButtonRow');
    tileButtonRow.isVertical = false;
    tileButtonRow.height = '34px';
    tileButtonRow.width = '440px';
    tileButtonRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const toggleTilesBtn = Button.CreateSimpleButton('toggleTilesBtn', 'TOGGLE TILES');
    toggleTilesBtn.width = '200px';
    toggleTilesBtn.height = '30px';
    toggleTilesBtn.color = '#FFFFFF';
    toggleTilesBtn.background = '#444400';
    toggleTilesBtn.thickness = 1;
    toggleTilesBtn.onPointerUpObservable.add(() => {
      this.eventBus.emit(GameEvents.DEV_TILE_TOGGLE_REQUESTED);
      toggleTilesBtn.background = this.gameManager.isUsingTiles() ? '#004400' : '#444400';
    });
    tileButtonRow.addControl(toggleTilesBtn);

    const loadTilesBtn = Button.CreateSimpleButton('loadTilesBtn', 'LOAD TILES');
    loadTilesBtn.width = '200px';
    loadTilesBtn.height = '30px';
    loadTilesBtn.color = '#FFFFFF';
    loadTilesBtn.background = '#004400';
    loadTilesBtn.thickness = 1;
    loadTilesBtn.onPointerUpObservable.add(() => {
      const roomId = this.roomIds[this.roomSelectIndex];
      this.eventBus.emit(GameEvents.DEV_TILE_LOAD_REQUESTED, { roomId });
      this.gameManager.setTilesEnabled(true);
    });
    tileButtonRow.addControl(loadTilesBtn);

    parent.addControl(tileButtonRow);

    const tileButtonRow2 = new StackPanel('tileButtonRow2');
    tileButtonRow2.isVertical = false;
    tileButtonRow2.height = '34px';
    tileButtonRow2.width = '440px';
    tileButtonRow2.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const loadTileJsonBtn = Button.CreateSimpleButton('loadTileJsonBtn', 'LOAD TILE JSON');
    loadTileJsonBtn.width = '200px';
    loadTileJsonBtn.height = '30px';
    loadTileJsonBtn.color = '#FFFFFF';
    loadTileJsonBtn.background = '#222244';
    loadTileJsonBtn.thickness = 1;
    loadTileJsonBtn.onPointerUpObservable.add(() => {
      const payload = window.prompt('Paste tile mapping JSON (tiles_mapping export)');
      if (!payload) return;
      this.gameManager.loadRoomFromTileMappingJson(payload);
      this.gameManager.setTilesEnabled(true);
    });
    tileButtonRow2.addControl(loadTileJsonBtn);

    parent.addControl(tileButtonRow2);

    const tileStatsLabel = new TextBlock('tileStatsLabel');
    tileStatsLabel.text = 'Tiles: Disabled';
    tileStatsLabel.fontSize = 12;
    tileStatsLabel.color = '#FFD700';
    tileStatsLabel.height = '20px';
    tileStatsLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    parent.addControl(tileStatsLabel);

    // Update tile stats regularly
    this.scene.onBeforeRenderObservable.add(() => {
      if (this.gameManager.isUsingTiles()) {
        const stats = this.gameManager.getTileStatistics();
        tileStatsLabel.text = `Tiles: Enabled (${stats.totalTiles} tiles)`;
      } else {
        tileStatsLabel.text = 'Tiles: Disabled';
      }
    });
  }

  private updateRoomLabel(): void {
    if (this.roomSelectLabel) {
      this.roomSelectLabel.text = this.roomIds[this.roomSelectIndex] ?? 'unknown';
    }
  }

  private createVoicelineTestingSection(parent: StackPanel): void {
    const sectionTitle = new TextBlock('voicelineTestTitle');
    sectionTitle.text = '═══ VOICELINE TESTING ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#FF00FF';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    const selectorRow = new StackPanel('voicelineSelectorRow');
    selectorRow.isVertical = false;
    selectorRow.height = '34px';
    selectorRow.width = '440px';
    selectorRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const prevBtn = Button.CreateSimpleButton('voicelinePrevBtn', '<');
    prevBtn.width = '30px';
    prevBtn.height = '26px';
    prevBtn.color = '#FF00FF';
    prevBtn.background = '#1A1A2A';
    prevBtn.thickness = 1;
    prevBtn.onPointerUpObservable.add(() => {
      this.voicelineSelectIndex = (this.voicelineSelectIndex - 1 + this.voicelineIds.length) % this.voicelineIds.length;
      this.updateVoicelineLabel();
    });

    this.voicelineSelectLabel = new TextBlock('voicelineSelectLabel');
    this.voicelineSelectLabel.text = this.voicelineIds[this.voicelineSelectIndex];
    this.voicelineSelectLabel.fontSize = 13;
    this.voicelineSelectLabel.color = '#FFFFFF';
    this.voicelineSelectLabel.width = '320px';
    this.voicelineSelectLabel.height = '26px';
    this.voicelineSelectLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const nextBtn = Button.CreateSimpleButton('voicelineNextBtn', '>');
    nextBtn.width = '30px';
    nextBtn.height = '26px';
    nextBtn.color = '#FF00FF';
    nextBtn.background = '#1A1A2A';
    nextBtn.thickness = 1;
    nextBtn.onPointerUpObservable.add(() => {
      this.voicelineSelectIndex = (this.voicelineSelectIndex + 1) % this.voicelineIds.length;
      this.updateVoicelineLabel();
    });

    selectorRow.addControl(prevBtn);
    selectorRow.addControl(this.voicelineSelectLabel);
    selectorRow.addControl(nextBtn);
    parent.addControl(selectorRow);

    const playBtn = Button.CreateSimpleButton('voicelinePlayBtn', 'PLAY VOICELINE');
    playBtn.width = '200px';
    playBtn.height = '30px';
    playBtn.color = '#FFFFFF';
    playBtn.background = '#440044';
    playBtn.thickness = 1;
    playBtn.top = '4px';
    playBtn.onPointerUpObservable.add(() => {
      const voicelineId = this.voicelineIds[this.voicelineSelectIndex];
      const voiceline = getVoiceline(voicelineId);
      if (voiceline && this.gameManager?.getHUDManager) {
        this.gameManager.getHUDManager().playVoiceline(voiceline);
      } else {
        console.warn(`Voiceline not found or HUD Manager not ready: ${voicelineId}`);
      }
    });
    parent.addControl(playBtn);
  }

  private updateVoicelineLabel(): void {
    if (this.voicelineSelectLabel) {
      this.voicelineSelectLabel.text = this.voicelineIds[this.voicelineSelectIndex] ?? 'unknown';
    }
  }

  private createCameraSection(parent: StackPanel): void {
    // Camera section title
    const sectionTitle = new TextBlock('cameraSectionTitle');
    sectionTitle.text = '═══ CAMERA ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#00AAFF';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    // Alpha (horizontal angle) slider
    const alphaLabel = new TextBlock('alphaLabel');
    alphaLabel.text = `Alpha: ${(this.gameManager.getCameraAlpha() * 180 / Math.PI).toFixed(1)}°`;
    alphaLabel.fontSize = 13;
    alphaLabel.fontWeight = 'bold';
    alphaLabel.color = '#FFFFFF';
    alphaLabel.height = '25px';
    parent.addControl(alphaLabel);

    const alphaSlider = new Slider('alphaSlider');
    alphaSlider.minimum = -Math.PI;
    alphaSlider.maximum = Math.PI;
    alphaSlider.value = this.gameManager.getCameraAlpha();
    alphaSlider.height = '25px';
    alphaSlider.width = '440px';
    alphaSlider.color = '#00AAFF';
    alphaSlider.background = '#444444';

    alphaSlider.onValueChangedObservable.add((value: number) => {
      alphaLabel.text = `Alpha: ${(value * 180 / Math.PI).toFixed(1)}°`;
      this.gameManager.setCameraAlpha(value);
    });
    parent.addControl(alphaSlider);

    // Beta (vertical angle) slider
    const betaLabel = new TextBlock('betaLabel');
    betaLabel.text = `Beta: ${(this.gameManager.getCameraBeta() * 180 / Math.PI).toFixed(1)}°`;
    betaLabel.fontSize = 13;
    betaLabel.fontWeight = 'bold';
    betaLabel.color = '#FFFFFF';
    betaLabel.height = '25px';
    parent.addControl(betaLabel);

    const betaSlider = new Slider('betaSlider');
    betaSlider.minimum = 0.1;  // Avoid looking straight down/up
    betaSlider.maximum = Math.PI - 0.1;
    betaSlider.value = this.gameManager.getCameraBeta();
    betaSlider.height = '25px';
    betaSlider.width = '440px';
    betaSlider.color = '#00AAFF';
    betaSlider.background = '#444444';

    betaSlider.onValueChangedObservable.add((value: number) => {
      betaLabel.text = `Beta: ${(value * 180 / Math.PI).toFixed(1)}°`;
      this.gameManager.setCameraBeta(value);
    });
    parent.addControl(betaSlider);

    // Radius (zoom) slider
    const radiusLabel = new TextBlock('radiusLabel');
    radiusLabel.text = `Radius: ${this.gameManager.getCameraRadius().toFixed(1)}`;
    radiusLabel.fontSize = 13;
    radiusLabel.fontWeight = 'bold';
    radiusLabel.color = '#FFFFFF';
    radiusLabel.height = '25px';
    parent.addControl(radiusLabel);

    const radiusSlider = new Slider('radiusSlider');
    radiusSlider.minimum = 10;
    radiusSlider.maximum = 50;
    radiusSlider.value = this.gameManager.getCameraRadius();
    radiusSlider.height = '25px';
    radiusSlider.width = '440px';
    radiusSlider.color = '#00AAFF';
    radiusSlider.background = '#444444';

    radiusSlider.onValueChangedObservable.add((value: number) => {
      radiusLabel.text = `Radius: ${value.toFixed(1)}`;
      this.gameManager.setCameraRadius(value);
    });
    parent.addControl(radiusSlider);

    // Player Height Offset slider
    const playerHeightLabel = new TextBlock('playerHeightLabel');
    playerHeightLabel.text = `Player Height: ${this.gameManager.getPlayerHeightOffset().toFixed(2)}`;
    playerHeightLabel.fontSize = 13;
    playerHeightLabel.fontWeight = 'bold';
    playerHeightLabel.color = '#FFFFFF';
    playerHeightLabel.height = '25px';
    parent.addControl(playerHeightLabel);

    const playerHeightSlider = new Slider('playerHeightSlider');
    playerHeightSlider.minimum = -2;
    playerHeightSlider.maximum = 2;
    playerHeightSlider.value = this.gameManager.getPlayerHeightOffset();
    playerHeightSlider.height = '25px';
    playerHeightSlider.width = '440px';
    playerHeightSlider.color = '#00AAFF';
    playerHeightSlider.background = '#444444';

    playerHeightSlider.onValueChangedObservable.add((value: number) => {
      playerHeightLabel.text = `Player Height: ${value.toFixed(2)}`;
      this.gameManager.setPlayerHeightOffset(value);
    });
    parent.addControl(playerHeightSlider);

    // Enemy Height Offset slider
    const enemyHeightLabel = new TextBlock('enemyHeightLabel');
    enemyHeightLabel.text = `Enemy Height: ${this.gameManager.getEnemyHeightOffset().toFixed(2)}`;
    enemyHeightLabel.fontSize = 13;
    enemyHeightLabel.fontWeight = 'bold';
    enemyHeightLabel.color = '#FFFFFF';
    enemyHeightLabel.height = '25px';
    parent.addControl(enemyHeightLabel);

    const enemyHeightSlider = new Slider('enemyHeightSlider');
    enemyHeightSlider.minimum = -2;
    enemyHeightSlider.maximum = 2;
    enemyHeightSlider.value = this.gameManager.getEnemyHeightOffset();
    enemyHeightSlider.height = '25px';
    enemyHeightSlider.width = '440px';
    enemyHeightSlider.color = '#FF8800';
    enemyHeightSlider.background = '#444444';

    enemyHeightSlider.onValueChangedObservable.add((value: number) => {
      enemyHeightLabel.text = `Enemy Height: ${value.toFixed(2)}`;
      this.gameManager.setEnemyHeightOffset(value);
    });
    parent.addControl(enemyHeightSlider);

    // Walls visibility toggle
    const wallsLabel = new TextBlock('wallsLabel');
    wallsLabel.text = 'Show Walls/Pillars';
    wallsLabel.fontSize = 13;
    wallsLabel.fontWeight = 'bold';
    wallsLabel.color = '#FFFFFF';
    wallsLabel.height = '25px';
    parent.addControl(wallsLabel);

    const wallsCheckbox = new Checkbox('wallsCheckbox');
    wallsCheckbox.width = '20px';
    wallsCheckbox.height = '20px';
    wallsCheckbox.isChecked = this.gameManager.areWallsVisible();
    wallsCheckbox.color = '#00AAFF';
    wallsCheckbox.background = '#444444';

    wallsCheckbox.onIsCheckedChangedObservable.add((value: boolean) => {
      this.gameManager.setWallsVisible(value);
    });
    parent.addControl(wallsCheckbox);
  }

  private createStatLine(text: string): TextBlock {
    const line = new TextBlock(`stat_${text}`);
    line.text = text;
    line.fontSize = 12;
    line.color = '#CCCCCC';
    line.height = '20px';
    line.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return line;
  }

  private setupLiveStats(): void {
    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      if (!data?.damage) return;
      const now = performance.now() / 1000;
      this.damageEvents.push({ t: now, dmg: data.damage });
    });

    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.showLiveStats || !this.player) return;

      const now = performance.now() / 1000;
      this.damageEvents = this.damageEvents.filter((e) => now - e.t <= 10);

      const dmg10 = this.damageEvents.reduce((sum, e) => sum + e.dmg, 0);
      const dmg1 = this.damageEvents.filter((e) => now - e.t <= 1).reduce((sum, e) => sum + e.dmg, 0);

      const dpsInstant = dmg1;
      const dps10 = dmg10 / 10;

      const moveSpeed = this.player.getMoveSpeed();
      const velocity = this.player.getVelocity().length();
      const fireRate = this.player.getCurrentFireRate();
      const focusBonus = this.player.getFocusFireBonusValue();

      if (this.dpsInstantText) this.dpsInstantText.text = `DPS (1s): ${dpsInstant.toFixed(1)}`;
      if (this.dpsTenSecText) this.dpsTenSecText.text = `DPS (10s): ${dps10.toFixed(1)}`;
      if (this.moveSpeedText) this.moveSpeedText.text = `Move Speed: ${moveSpeed.toFixed(2)}`;
      if (this.velocityText) this.velocityText.text = `Velocity: ${velocity.toFixed(2)}`;
      if (this.fireRateText) this.fireRateText.text = `Fire Rate: ${fireRate.toFixed(2)}`;
      if (this.focusBonusText) this.focusBonusText.text = `Focus Bonus: ${focusBonus.toFixed(2)}x`;
    });
  }

  private createDebugFlagsSection(parent: StackPanel): void {
    const gameplayConfig = this.configLoader.getGameplay();
    if (!gameplayConfig || !gameplayConfig.debugConfig) return;

    const sectionTitle = new TextBlock('debugTitle');
    sectionTitle.text = '═══ DEBUG FLAGS ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#FF9900';
    sectionTitle.height = '34px';
    sectionTitle.paddingTop = 6;
    sectionTitle.paddingBottom = 6;
    parent.addControl(sectionTitle);

    // God Mode
    const godModeContainer = new StackPanel('godModeContainer');
    godModeContainer.isVertical = false;
    godModeContainer.height = '30px';
    godModeContainer.width = '440px';
    godModeContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    
    const godModeCheckbox = new Checkbox('godModeCheckbox');
    godModeCheckbox.isChecked = gameplayConfig.debugConfig.godMode;
    godModeCheckbox.width = '25px';
    godModeCheckbox.height = '25px';

    const godModeLabel = new TextBlock('godModeLabel');
    godModeLabel.text = '  God Mode';
    godModeLabel.fontSize = 13;
    godModeLabel.color = '#FFFFFF';
    godModeLabel.width = '400px';
    godModeLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    godModeCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      gameplayConfig.debugConfig.godMode = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.DEBUG_FLAG_CHANGED, { flag: 'godMode', value: isChecked });
    });

    godModeContainer.addControl(godModeCheckbox);
    godModeContainer.addControl(godModeLabel);
    parent.addControl(godModeContainer);

    // Infinite Ultimate
    const infUltContainer = new StackPanel('infUltContainer');
    infUltContainer.isVertical = false;
    infUltContainer.height = '30px';
    infUltContainer.width = '440px';
    infUltContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    
    const infUltCheckbox = new Checkbox('infiniteUltCheckbox');
    infUltCheckbox.isChecked = gameplayConfig.debugConfig.infiniteUltimate;
    infUltCheckbox.width = '25px';
    infUltCheckbox.height = '25px';

    const infUltLabel = new TextBlock('infiniteUltLabel');
    infUltLabel.text = '  Infinite Ultimate';
    infUltLabel.fontSize = 13;
    infUltLabel.color = '#FFFFFF';
    infUltLabel.width = '400px';
    infUltLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    infUltCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      gameplayConfig.debugConfig.infiniteUltimate = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.DEBUG_FLAG_CHANGED, { flag: 'infiniteUltimate', value: isChecked });
    });

    infUltContainer.addControl(infUltCheckbox);
    infUltContainer.addControl(infUltLabel);
    parent.addControl(infUltContainer);

    // Freeze Enemies
    const freezeContainer = new StackPanel('freezeContainer');
    freezeContainer.isVertical = false;
    freezeContainer.height = '30px';
    freezeContainer.width = '440px';
    freezeContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    
    const freezeCheckbox = new Checkbox('freezeEnemiesCheckbox');
    freezeCheckbox.isChecked = gameplayConfig.debugConfig.freezeEnemies;
    freezeCheckbox.width = '25px';
    freezeCheckbox.height = '25px';

    const freezeLabel = new TextBlock('freezeEnemiesLabel');
    freezeLabel.text = '  Freeze Enemies';
    freezeLabel.fontSize = 13;
    freezeLabel.color = '#FFFFFF';
    freezeLabel.width = '400px';
    freezeLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    freezeCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      console.log('Freeze enemies checkbox changed to:', isChecked);
      gameplayConfig.debugConfig.freezeEnemies = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.DEBUG_FLAG_CHANGED, { flag: 'freezeEnemies', value: isChecked });
    });

    freezeContainer.addControl(freezeCheckbox);
    freezeContainer.addControl(freezeLabel);
    parent.addControl(freezeContainer);

    // Daemon voiceline test
    const daemonTestContainer = new StackPanel('daemonVoicelineContainer');
    daemonTestContainer.isVertical = false;
    daemonTestContainer.height = '30px';
    daemonTestContainer.width = '440px';
    daemonTestContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const daemonTestCheckbox = new Checkbox('daemonVoicelineCheckbox');
    daemonTestCheckbox.isChecked = gameplayConfig.debugConfig.daemonVoicelineTest;
    daemonTestCheckbox.width = '25px';
    daemonTestCheckbox.height = '25px';

    const daemonTestLabel = new TextBlock('daemonVoicelineLabel');
    daemonTestLabel.text = '  Daemon Voiceline Test';
    daemonTestLabel.fontSize = 13;
    daemonTestLabel.color = '#FFFFFF';
    daemonTestLabel.width = '400px';
    daemonTestLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    daemonTestCheckbox.onIsCheckedChangedObservable.add((isChecked) => {
      gameplayConfig.debugConfig.daemonVoicelineTest = isChecked;
      this.configLoader.updateGameplayConfig(gameplayConfig);
      this.eventBus.emit(GameEvents.DEBUG_FLAG_CHANGED, { flag: 'daemonVoicelineTest', value: isChecked });
    });

    daemonTestContainer.addControl(daemonTestCheckbox);
    daemonTestContainer.addControl(daemonTestLabel);
    parent.addControl(daemonTestContainer);
  }

  private toggleConsole(): void {
    this.isVisible = !this.isVisible;
    // Find background panel and toggle visibility
    const panel = this.gui.getControlByName('devConsoleBackground');
    if (panel) {
      panel.isVisible = this.isVisible;
    }
  }

  dispose(): void {
    this.gui.dispose();
  }
}
