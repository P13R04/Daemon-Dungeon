/**
 * DevConsole - Development tools for live parameter modification
 */

import { Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button, Slider, Checkbox, StackPanel } from '@babylonjs/gui';
import { ConfigLoader } from '../utils/ConfigLoader';
import { EventBus, GameEvents } from '../core/EventBus';

export class DevConsole {
  private gui: AdvancedDynamicTexture;
  private isVisible: boolean = true;
  private eventBus: EventBus;
  private configLoader: ConfigLoader;

  constructor(private scene: Scene) {
    this.eventBus = EventBus.getInstance();
    this.configLoader = ConfigLoader.getInstance();
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('DevConsole', true, scene);
    this.createConsoleUI();
  }

  private createConsoleUI(): void {
    // Background panel
    const bgPanel = new Rectangle('devConsoleBackground');
    bgPanel.width = '520px';
    bgPanel.height = '780px';
    bgPanel.background = 'rgba(15, 15, 35, 0.98)';
    bgPanel.thickness = 3;
    bgPanel.cornerRadius = 8;
    bgPanel.color = '#00FF00';
    bgPanel.top = '10px';
    bgPanel.left = '-10px';
    bgPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    bgPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.gui.addControl(bgPanel);

    // Use StackPanel for proper vertical layout
    const panel = new StackPanel('devConsolePanel');
    panel.width = '480px';
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.top = '20px';
    bgPanel.addControl(panel);

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

    // Debug Flags Section
    this.createDebugFlagsSection(panel);

    // Toggle button
    const toggleBtn = new Button('devToggleBtn');
    toggleBtn.width = '60px';
    toggleBtn.height = '30px';
    toggleBtn.background = '#004400';
    toggleBtn.color = '#00FF00';
    toggleBtn.fontSize = 12;
    toggleBtn.left = -10;
    toggleBtn.top = 10;
    toggleBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
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
    sectionTitle.height = '28px';
    sectionTitle.paddingTop = 12;
    sectionTitle.paddingBottom = 8;
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
    sectionTitle.height = '28px';
    sectionTitle.paddingTop = 12;
    sectionTitle.paddingBottom = 8;
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

  private createDebugFlagsSection(parent: StackPanel): void {
    const gameplayConfig = this.configLoader.getGameplay();
    if (!gameplayConfig || !gameplayConfig.debugConfig) return;

    const sectionTitle = new TextBlock('debugTitle');
    sectionTitle.text = '═══ DEBUG FLAGS ═══';
    sectionTitle.fontSize = 15;
    sectionTitle.fontWeight = 'bold';
    sectionTitle.color = '#FF9900';
    sectionTitle.height = '28px';
    sectionTitle.paddingTop = 12;
    sectionTitle.paddingBottom = 8;
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
