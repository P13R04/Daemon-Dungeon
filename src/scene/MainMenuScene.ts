import { Scene, Engine, FreeCamera, Vector3, Color4 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Button,
  Checkbox,
  Control,
  Rectangle,
  ScrollViewer,
  Slider,
  StackPanel,
  TextBlock,
} from '@babylonjs/gui';
import { UI_LAYER } from '../ui/uiLayers';
import {
  AudioSettings,
  ColorVisionFilter,
  formatInputKeyLabel,
  GameSettings,
  GameSettingsStore,
  KeybindingAction,
  normalizeInputKey,
} from '../settings/GameSettings';

type AudioChannel = keyof AudioSettings;

const ACTION_LABELS: Array<{ action: KeybindingAction; label: string }> = [
  { action: 'moveUp', label: 'Move Forward' },
  { action: 'moveDown', label: 'Move Backward' },
  { action: 'moveLeft', label: 'Move Left' },
  { action: 'moveRight', label: 'Move Right' },
  { action: 'shoot', label: 'Shoot / Primary' },
  { action: 'posture', label: 'Posture / Secondary' },
  { action: 'ultimate', label: 'Ultimate' },
  { action: 'item1', label: 'Item Slot 1' },
  { action: 'item2', label: 'Item Slot 2' },
];

const FILTER_OPTIONS: ColorVisionFilter[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'highContrast'];

export class MainMenuScene {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private menuPanel: Rectangle | null = null;
  private menuHint: TextBlock | null = null;
  private settingsOverlay: Rectangle | null = null;

  private settingsSnapshot: GameSettings = GameSettingsStore.get();
  private unsubscribeSettings: (() => void) | null = null;
  private isRefreshingUi: boolean = false;

  private keybindButtons: Partial<Record<KeybindingAction, Button>> = {};
  private audioSliders: Partial<Record<AudioChannel, Slider>> = {};
  private audioValueTexts: Partial<Record<AudioChannel, TextBlock>> = {};
  private keyboardOnlyCheckbox: Checkbox | null = null;
  private autoAimCheckbox: Checkbox | null = null;
  private colorFilterButton: Button | null = null;
  private catGodModeCheckbox: Checkbox | null = null;
  private lightweightTexturesCheckbox: Checkbox | null = null;
  private progressiveSpawnCheckbox: Checkbox | null = null;
  private roomPreloadAheadSlider: Slider | null = null;
  private roomPreloadAheadValueText: TextBlock | null = null;
  private captureHintText: TextBlock | null = null;

  private awaitingRebind: KeybindingAction | null = null;

  private readonly keyCaptureHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (this.awaitingRebind) {
        this.awaitingRebind = null;
        this.refreshSettingsUi();
      } else if (this.settingsOverlay?.isVisible) {
        this.closeSettingsOverlay();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!this.awaitingRebind) return;

    const key = normalizeInputKey(event.key);
    if (!key) return;

    GameSettingsStore.setKeybinding(this.awaitingRebind, key);
    this.awaitingRebind = null;
    this.refreshSettingsUi();
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(
    private engine: Engine,
    private onPlayRequested: () => void,
    private onCodexRequested: () => void,
    private onTutorialRequested: () => void,
    private onBenchmarkRequested: () => void = () => {}
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.01, 0.01, 0.02, 1);

    const camera = new FreeCamera('mainMenuCamera', new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    this.scene.activeCamera = camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('MainMenuUI', true, this.scene);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    this.createMainButtons();
    this.createSettingsOverlay();
    this.refreshSettingsUi();

    this.unsubscribeSettings = GameSettingsStore.subscribe((settings) => {
      this.settingsSnapshot = settings;
      this.refreshSettingsUi();
    });

    window.addEventListener('keydown', this.keyCaptureHandler, true);
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }
    window.removeEventListener('keydown', this.keyCaptureHandler, true);
    this.gui.dispose();
    this.scene.dispose();
  }

  private createMainButtons(): void {
    const title = new TextBlock('menuTitle');
    title.text = 'DAEMON DUNGEON';
    title.color = '#7CFFEA';
    title.fontSize = 56;
    title.fontFamily = 'Consolas';
    title.top = '-34%';
    this.gui.addControl(title);

    const subtitle = new TextBlock('menuSubtitle');
    subtitle.text = 'SYSTEM READY // MAIN CONSOLE';
    subtitle.color = '#9FEFE1';
    subtitle.fontSize = 16;
    subtitle.fontFamily = 'Consolas';
    subtitle.top = '-27%';
    this.gui.addControl(subtitle);

    const panel = new Rectangle('menuPanel');
    panel.width = '460px';
    panel.height = '300px';
    panel.thickness = 1;
    panel.cornerRadius = 8;
    panel.color = '#2EF9C3';
    panel.background = 'rgba(0,0,0,0.45)';
    panel.isPointerBlocker = true;
    panel.top = '-2%';
    this.gui.addControl(panel);
    this.menuPanel = panel;

    const playBtn = this.makeActionButton('menuPlay', 'PLAY', -104, () => {
      this.hidePanels();
      this.onPlayRequested();
    });
    panel.addControl(playBtn);

    const tutorialBtn = this.makeActionButton('menuTutorial', 'TUTORIAL', -40, () => {
      this.hidePanels();
      this.onTutorialRequested();
    });
    panel.addControl(tutorialBtn);

    const codexBtn = this.makeActionButton('menuCodex', 'CODEX', 24, () => {
      this.hidePanels();
      this.onCodexRequested();
    });
    panel.addControl(codexBtn);

    const settingsBtn = this.makeActionButton('menuSettings', 'SETTINGS', 88, () => {
      this.openSettingsOverlay();
    });
    panel.addControl(settingsBtn);

    const hint = new TextBlock('menuHint');
    hint.text = 'SETTINGS: GRAPHICS / KEYBINDS / AUDIO / ACCESSIBILITY';
    hint.color = '#7C9C98';
    hint.fontSize = 12;
    hint.fontFamily = 'Consolas';
    hint.top = '130px';
    hint.isHitTestVisible = false;
    panel.addControl(hint);
    this.menuHint = hint;
  }

  private createSettingsOverlay(): void {
    const overlay = new Rectangle('settingsOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'rgba(0, 0, 0, 0.72)';
    overlay.isPointerBlocker = true;
    overlay.isVisible = false;
    this.gui.addControl(overlay);
    this.settingsOverlay = overlay;

    const windowPanel = new Rectangle('settingsWindow');
    windowPanel.width = '900px';
    windowPanel.height = '660px';
    windowPanel.thickness = 2;
    windowPanel.cornerRadius = 8;
    windowPanel.color = '#2EF9C3';
    windowPanel.background = 'rgba(5,12,16,0.92)';
    overlay.addControl(windowPanel);

    const title = new TextBlock('settingsTitle');
    title.text = 'SETTINGS CONSOLE';
    title.color = '#7CFFEA';
    title.fontSize = 34;
    title.fontFamily = 'Consolas';
    title.top = '-292px';
    windowPanel.addControl(title);

    const subtitle = new TextBlock('settingsSubtitle');
    subtitle.text = 'TUNE GRAPHICS, CONTROLS, AUDIO, ACCESSIBILITY // ESC TO CANCEL A REBIND';
    subtitle.color = '#9FEFE1';
    subtitle.fontSize = 12;
    subtitle.fontFamily = 'Consolas';
    subtitle.top = '-262px';
    windowPanel.addControl(subtitle);

    const actionRow = new Rectangle('settingsActionRow');
    actionRow.width = '860px';
    actionRow.height = '44px';
    actionRow.thickness = 0;
    actionRow.top = '-225px';
    actionRow.isPointerBlocker = true;
    actionRow.zIndex = 120;
    windowPanel.addControl(actionRow);

    const resetBtn = Button.CreateSimpleButton('settingsResetButton', 'RESET DEFAULTS');
    resetBtn.width = '180px';
    resetBtn.height = '34px';
    resetBtn.color = '#C2FFE2';
    resetBtn.cornerRadius = 4;
    resetBtn.background = 'rgba(22,48,44,0.95)';
    resetBtn.thickness = 1;
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    resetBtn.left = '0px';
    resetBtn.isPointerBlocker = true;
    resetBtn.isHitTestVisible = true;
    resetBtn.zIndex = 130;
    this.bindButtonAction(resetBtn, () => {
      this.awaitingRebind = null;
      GameSettingsStore.resetToDefaults();
    });
    actionRow.addControl(resetBtn);

    const closeBtn = Button.CreateSimpleButton('settingsCloseButton', 'RETURN TO MAIN MENU');
    closeBtn.width = '220px';
    closeBtn.height = '34px';
    closeBtn.color = '#D2FFF2';
    closeBtn.cornerRadius = 4;
    closeBtn.background = 'rgba(20,38,45,0.95)';
    closeBtn.thickness = 1;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = '0px';
    closeBtn.isPointerBlocker = true;
    closeBtn.isHitTestVisible = true;
    closeBtn.zIndex = 130;
    this.bindButtonAction(closeBtn, () => {
      this.awaitingRebind = null;
      this.closeSettingsOverlay();
    });
    actionRow.addControl(closeBtn);

    this.captureHintText = new TextBlock('settingsCaptureHint');
    this.captureHintText.text = 'Click a key field to capture input';
    this.captureHintText.color = '#8CC6BD';
    this.captureHintText.fontFamily = 'Consolas';
    this.captureHintText.fontSize = 12;
    this.captureHintText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.captureHintText.top = '-185px';
    windowPanel.addControl(this.captureHintText);

    const scroll = new ScrollViewer('settingsScroll');
    scroll.width = '860px';
    scroll.height = '470px';
    scroll.thickness = 1;
    scroll.color = '#2C5950';
    scroll.background = 'rgba(5, 16, 20, 0.85)';
    scroll.top = '52px';
    scroll.barColor = '#51E6BE';
    scroll.barSize = 8;
    scroll.wheelPrecision = 0.03;
    windowPanel.addControl(scroll);

    const content = new StackPanel('settingsStack');
    content.isVertical = true;
    content.spacing = 8;
    content.width = 1;
    scroll.addControl(content);

    this.addGraphicsSection(content);
    this.addControlsSection(content);
    this.addAudioSection(content);
    this.addAccessibilitySection(content);
  }

  private addGraphicsSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('GRAPHICS // PERFORMANCE'));
    parent.addControl(this.makeSectionSubText('Use lightweight procedural textures and progressive enemy spawn to reduce loading stalls.'));

    parent.addControl(this.makeToggleRow(
      'Lightweight Procedural Texture Mode',
      'Uses lighter procedural texture generation and reduced relief density (recommended for smooth room transitions).',
      (checkbox) => {
        this.lightweightTexturesCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateGraphics({ lightweightTexturesMode: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeToggleRow(
      'Progressive Enemy Spawning',
      'Spawns enemies in small batches over frames to avoid spikes in rooms with many enemies.',
      (checkbox) => {
        this.progressiveSpawnCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateGraphics({ progressiveEnemySpawning: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeGraphicsNumberSliderRow(
      'Room Preload Ahead Window',
      'How many next rooms are preloaded asynchronously ahead of the current room (higher = more anticipation, potentially more memory).',
      1,
      8,
      (slider, valueText) => {
        this.roomPreloadAheadSlider = slider;
        this.roomPreloadAheadValueText = valueText;
        slider.onValueChangedObservable.add((value) => {
          if (this.isRefreshingUi) return;
          const nextValue = Math.max(1, Math.min(8, Math.round(value)));
          valueText.text = `${nextValue} rooms`;
          GameSettingsStore.updateGraphics({ roomPreloadAheadCount: nextValue });
        });
      },
    ));

    parent.addControl(this.makeActionRow(
      'Automated Benchmark Mode',
      'Runs a repeatable autoplay benchmark (player + enemies + transitions), then copies full metrics to clipboard.',
      'RUN BENCHMARK',
      () => {
        this.awaitingRebind = null;
        this.hidePanels();
        this.onBenchmarkRequested();
      }
    ));
  }

  private addControlsSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('CONTROLS // KEYBINDINGS'));
    parent.addControl(this.makeSectionSubText('Remap movement, shoot/posture, ultimate and consumables.'));

    for (const descriptor of ACTION_LABELS) {
      parent.addControl(this.makeKeybindRow(descriptor.action, descriptor.label));
    }

    parent.addControl(this.makeToggleRow(
      'Keyboard-Only Mode',
      'Ignore mouse buttons during gameplay (for keyboard-only sessions).',
      (checkbox) => {
        this.keyboardOnlyCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateControls({ keyboardOnlyMode: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeToggleRow(
      'Auto Aim On Movement (8 directions)',
      'Aim follows last movement direction (snapped to 8 directions) in keyboard-only mode.',
      (checkbox) => {
        this.autoAimCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateControls({ autoAimTowardMovement: !!isChecked });
        });
      }
    ));
  }

  private addAudioSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('AUDIO'));
    parent.addControl(this.makeSectionSubText('Master affects all channels. Music/SFX/UI/Voice are independent mix controls.'));

    parent.addControl(this.makeAudioSliderRow('master', 'Master Volume'));
    parent.addControl(this.makeAudioSliderRow('music', 'Music Volume'));
    parent.addControl(this.makeAudioSliderRow('sfx', 'SFX Volume'));
    parent.addControl(this.makeAudioSliderRow('ui', 'UI Volume'));
    parent.addControl(this.makeAudioSliderRow('voice', 'Voice Volume'));
  }

  private addAccessibilitySection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('ACCESSIBILITY'));
    parent.addControl(this.makeSectionSubText('Color filters are applied to the game canvas in real-time.'));

    const row = new Rectangle('accessibilityFilterRow');
    row.width = '820px';
    row.height = '56px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const label = new TextBlock('accessibilityFilterLabel');
    label.text = 'Color Vision Filter';
    label.color = '#B9F9E8';
    label.fontSize = 16;
    label.fontFamily = 'Consolas';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const button = Button.CreateSimpleButton('accessibilityFilterButton', 'NONE');
    button.width = '250px';
    button.height = '34px';
    button.color = '#DAFFF3';
    button.cornerRadius = 4;
    button.background = 'rgba(22,48,44,0.95)';
    button.thickness = 1;
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    button.left = '-10px';
    this.bindButtonAction(button, () => {
      const current = this.settingsSnapshot.accessibility.colorFilter;
      const currentIndex = FILTER_OPTIONS.indexOf(current);
      const nextFilter = FILTER_OPTIONS[(currentIndex + 1 + FILTER_OPTIONS.length) % FILTER_OPTIONS.length];
      GameSettingsStore.updateAccessibility({ colorFilter: nextFilter });
    });
    row.addControl(button);
    this.colorFilterButton = button;

    parent.addControl(row);

    parent.addControl(this.makeSectionSubText('Cycle options: NONE -> PROTANOPIA -> DEUTERANOPIA -> TRITANOPIA -> HIGH CONTRAST.'));

    parent.addControl(this.makeToggleRow(
      'Enable CAT Easter Egg (God Mode)',
      'Adds CAT class to selection. CAT takes no damage and deals massive contact retaliation damage.',
      (checkbox) => {
        this.catGodModeCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateAccessibility({ catGodModeEnabled: !!isChecked });
        });
      }
    ));
  }

  private makeSectionHeader(text: string): Rectangle {
    const row = new Rectangle(`sectionHeader_${text.replace(/\s+/g, '_')}`);
    row.width = '820px';
    row.height = '42px';
    row.thickness = 0;
    row.background = 'rgba(10, 30, 35, 0.6)';

    const title = new TextBlock(`sectionHeaderText_${text.replace(/\s+/g, '_')}`);
    title.text = text;
    title.color = '#7CFFEA';
    title.fontSize = 20;
    title.fontFamily = 'Consolas';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = '10px';
    row.addControl(title);

    return row;
  }

  private makeSectionSubText(text: string): TextBlock {
    const info = new TextBlock(`sectionInfo_${text.replace(/\s+/g, '_').slice(0, 18)}`);
    info.text = text;
    info.color = '#8EC8BD';
    info.fontSize = 12;
    info.fontFamily = 'Consolas';
    info.height = '22px';
    info.width = '820px';
    info.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    info.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return info;
  }

  private makeKeybindRow(action: KeybindingAction, labelText: string): Rectangle {
    const row = new Rectangle(`keybindRow_${action}`);
    row.width = '820px';
    row.height = '48px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const label = new TextBlock(`keybindLabel_${action}`);
    label.text = labelText;
    label.color = '#B9F9E8';
    label.fontSize = 15;
    label.fontFamily = 'Consolas';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const keyButton = Button.CreateSimpleButton(`keybindButton_${action}`, '...');
    keyButton.width = '220px';
    keyButton.height = '32px';
    keyButton.color = '#E3FFF7';
    keyButton.cornerRadius = 4;
    keyButton.background = 'rgba(22,48,44,0.95)';
    keyButton.thickness = 1;
    keyButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    keyButton.left = '-10px';
    this.bindButtonAction(keyButton, () => {
      this.awaitingRebind = this.awaitingRebind === action ? null : action;
      this.refreshSettingsUi();
    });
    row.addControl(keyButton);
    this.keybindButtons[action] = keyButton;

    return row;
  }

  private makeToggleRow(
    title: string,
    details: string,
    onReady: (checkbox: Checkbox) => void
  ): Rectangle {
    const row = new Rectangle(`toggleRow_${title.replace(/\s+/g, '_')}`);
    row.width = '820px';
    row.height = '70px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`toggleTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 15;
    titleText.fontFamily = 'Consolas';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-12px';
    row.addControl(titleText);

    const detailText = new TextBlock(`toggleDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 11;
    detailText.fontFamily = 'Consolas';
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '16px';
    row.addControl(detailText);

    const checkbox = new Checkbox(`toggleCheckbox_${title.replace(/\s+/g, '_')}`);
    checkbox.width = '24px';
    checkbox.height = '24px';
    checkbox.color = '#B9F9E8';
    checkbox.background = '#122D2B';
    checkbox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    checkbox.left = '-18px';
    row.addControl(checkbox);
    onReady(checkbox);

    return row;
  }

  private makeActionRow(
    title: string,
    details: string,
    buttonLabel: string,
    onAction: () => void,
  ): Rectangle {
    const row = new Rectangle(`actionRow_${title.replace(/\s+/g, '_')}`);
    row.width = '820px';
    row.height = '78px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`actionTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 15;
    titleText.fontFamily = 'Consolas';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-16px';
    row.addControl(titleText);

    const detailText = new TextBlock(`actionDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 11;
    detailText.fontFamily = 'Consolas';
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '16px';
    row.addControl(detailText);

    const actionButton = Button.CreateSimpleButton(`actionButton_${title.replace(/\s+/g, '_')}`, buttonLabel);
    actionButton.width = '220px';
    actionButton.height = '36px';
    actionButton.color = '#E3FFF7';
    actionButton.cornerRadius = 4;
    actionButton.background = 'rgba(22,48,44,0.95)';
    actionButton.thickness = 1;
    actionButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    actionButton.left = '-10px';
    this.bindButtonAction(actionButton, onAction);
    row.addControl(actionButton);

    return row;
  }

  private makeAudioSliderRow(channel: AudioChannel, labelText: string): Rectangle {
    const row = new Rectangle(`audioRow_${channel}`);
    row.width = '820px';
    row.height = '62px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const label = new TextBlock(`audioLabel_${channel}`);
    label.text = labelText;
    label.color = '#B9F9E8';
    label.fontSize = 15;
    label.fontFamily = 'Consolas';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    label.top = '-14px';
    row.addControl(label);

    const slider = new Slider(`audioSlider_${channel}`);
    slider.minimum = 0;
    slider.maximum = 100;
    slider.height = '14px';
    slider.width = '520px';
    slider.color = '#52EDC5';
    slider.background = '#153A36';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    slider.left = '12px';
    slider.top = '14px';
    slider.onValueChangedObservable.add((value) => {
      if (this.isRefreshingUi) return;
      const normalized = Math.round(value) / 100;
      GameSettingsStore.updateAudio({ [channel]: normalized } as Partial<AudioSettings>);
    });
    row.addControl(slider);

    const valueText = new TextBlock(`audioValue_${channel}`);
    valueText.text = '100%';
    valueText.color = '#DFFEF6';
    valueText.fontSize = 14;
    valueText.fontFamily = 'Consolas';
    valueText.width = '80px';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.left = '-12px';
    valueText.top = '14px';
    row.addControl(valueText);

    this.audioSliders[channel] = slider;
    this.audioValueTexts[channel] = valueText;

    return row;
  }

  private makeGraphicsNumberSliderRow(
    title: string,
    details: string,
    min: number,
    max: number,
    onReady: (slider: Slider, valueText: TextBlock) => void,
  ): Rectangle {
    const row = new Rectangle(`graphicsNumberRow_${title.replace(/\s+/g, '_')}`);
    row.width = '820px';
    row.height = '82px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`graphicsNumberTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 15;
    titleText.fontFamily = 'Consolas';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-20px';
    row.addControl(titleText);

    const detailText = new TextBlock(`graphicsNumberDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 11;
    detailText.fontFamily = 'Consolas';
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '2px';
    row.addControl(detailText);

    const slider = new Slider(`graphicsNumberSlider_${title.replace(/\s+/g, '_')}`);
    slider.minimum = min;
    slider.maximum = max;
    slider.height = '14px';
    slider.width = '520px';
    slider.color = '#52EDC5';
    slider.background = '#153A36';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    slider.left = '12px';
    slider.top = '26px';
    row.addControl(slider);

    const valueText = new TextBlock(`graphicsNumberValue_${title.replace(/\s+/g, '_')}`);
    valueText.text = `${min}`;
    valueText.color = '#DFFEF6';
    valueText.fontSize = 14;
    valueText.fontFamily = 'Consolas';
    valueText.width = '120px';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.left = '-12px';
    valueText.top = '26px';
    row.addControl(valueText);

    onReady(slider, valueText);
    return row;
  }

  private refreshSettingsUi(): void {
    this.isRefreshingUi = true;

    for (const descriptor of ACTION_LABELS) {
      const button = this.keybindButtons[descriptor.action];
      if (!button) continue;

      if (this.awaitingRebind === descriptor.action) {
        button.textBlock!.text = 'PRESS A KEY...';
        button.background = 'rgba(90, 44, 14, 0.95)';
      } else {
        const binding = this.settingsSnapshot.controls.keybindings[descriptor.action];
        button.textBlock!.text = formatInputKeyLabel(binding);
        button.background = 'rgba(22,48,44,0.95)';
      }
    }

    if (this.captureHintText) {
      this.captureHintText.text = this.awaitingRebind
        ? `Capturing input for ${this.getActionDisplayName(this.awaitingRebind)}... (ESC to cancel)`
        : 'Click a key field to capture input';
      this.captureHintText.color = this.awaitingRebind ? '#FFD092' : '#8CC6BD';
    }

    if (this.keyboardOnlyCheckbox) {
      this.keyboardOnlyCheckbox.isChecked = this.settingsSnapshot.controls.keyboardOnlyMode;
    }

    if (this.autoAimCheckbox) {
      this.autoAimCheckbox.isChecked = this.settingsSnapshot.controls.autoAimTowardMovement;
    }

    if (this.lightweightTexturesCheckbox) {
      this.lightweightTexturesCheckbox.isChecked = this.settingsSnapshot.graphics.lightweightTexturesMode;
    }

    if (this.progressiveSpawnCheckbox) {
      this.progressiveSpawnCheckbox.isChecked = this.settingsSnapshot.graphics.progressiveEnemySpawning;
    }

    if (this.roomPreloadAheadSlider) {
      const nextValue = Math.max(1, Math.min(8, Math.round(this.settingsSnapshot.graphics.roomPreloadAheadCount ?? 2)));
      this.roomPreloadAheadSlider.value = nextValue;
      if (this.roomPreloadAheadValueText) {
        this.roomPreloadAheadValueText.text = `${nextValue} rooms`;
      }
    }

    const channels: AudioChannel[] = ['master', 'music', 'sfx', 'ui', 'voice'];
    for (const channel of channels) {
      const slider = this.audioSliders[channel];
      const valueText = this.audioValueTexts[channel];
      const percent = Math.round((this.settingsSnapshot.audio[channel] ?? 0) * 100);
      if (slider) slider.value = percent;
      if (valueText) valueText.text = `${percent}%`;
    }

    if (this.colorFilterButton?.textBlock) {
      this.colorFilterButton.textBlock.text = this.getFilterLabel(this.settingsSnapshot.accessibility.colorFilter);
    }

    if (this.catGodModeCheckbox) {
      this.catGodModeCheckbox.isChecked = this.settingsSnapshot.accessibility.catGodModeEnabled;
    }

    if (this.menuHint) {
      if (this.settingsSnapshot.controls.keyboardOnlyMode) {
        this.menuHint.text = 'KEYBOARD MODE ACTIVE // AUTO-AIM AVAILABLE IN SETTINGS';
      } else if (this.settingsSnapshot.graphics.lightweightTexturesMode) {
        this.menuHint.text = 'PERFORMANCE MODE ACTIVE // LIGHTWEIGHT TEXTURES ENABLED';
      } else {
        this.menuHint.text = 'SETTINGS: GRAPHICS / KEYBINDS / AUDIO / ACCESSIBILITY';
      }
    }

    this.isRefreshingUi = false;
  }

  private getActionDisplayName(action: KeybindingAction): string {
    const descriptor = ACTION_LABELS.find((item) => item.action === action);
    return descriptor?.label ?? action;
  }

  private getFilterLabel(filter: ColorVisionFilter): string {
    if (filter === 'protanopia') return 'PROTANOPIA';
    if (filter === 'deuteranopia') return 'DEUTERANOPIA';
    if (filter === 'tritanopia') return 'TRITANOPIA';
    if (filter === 'highContrast') return 'HIGH CONTRAST';
    return 'NONE';
  }

  private makeActionButton(id: string, label: string, top: number, onClick: () => void): Button {
    const button = Button.CreateSimpleButton(id, label);
    button.width = '220px';
    button.height = '46px';
    button.top = `${top}px`;
    button.color = '#FFFFFF';
    button.cornerRadius = 6;
    button.background = '#1D3B3A';
    button.thickness = 2;
    button.zIndex = 50;
    button.isEnabled = true;
    button.isHitTestVisible = true;
    button.isPointerBlocker = true;
    button.hoverCursor = 'pointer';
    button.onPointerEnterObservable.add(() => {
      button.background = '#2A5A57';
    });
    button.onPointerOutObservable.add(() => {
      button.background = '#1D3B3A';
    });
    this.bindButtonAction(button, onClick);
    return button;
  }

  private bindButtonAction(button: Button, onAction: () => void): void {
    button.isPointerBlocker = true;
    button.isHitTestVisible = true;
    button.hoverCursor = 'pointer';
    button.onPointerUpObservable.add(onAction);
  }

  private openSettingsOverlay(): void {
    if (this.settingsOverlay) {
      this.settingsOverlay.isVisible = true;
    }
    if (this.menuPanel) {
      this.menuPanel.isVisible = false;
    }
  }

  private closeSettingsOverlay(): void {
    if (this.settingsOverlay) {
      this.settingsOverlay.isVisible = false;
    }
    if (this.menuPanel) {
      this.menuPanel.isVisible = true;
    }
  }

  private hidePanels(): void {
    if (this.settingsOverlay) {
      this.settingsOverlay.isVisible = false;
    }
    if (this.menuPanel) {
      this.menuPanel.isVisible = false;
    }
  }
}
