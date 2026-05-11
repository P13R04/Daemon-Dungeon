import {
  Button,
  Checkbox,
  Control,
  Rectangle,
  ScrollViewer,
  Slider,
  StackPanel,
  TextBlock,
} from '@babylonjs/gui';
import {
  AudioSettings,
  ColorVisionFilter,
  GameSettings,
  GameSettingsStore,
  KeybindingAction, formatInputKeyLabel,
  normalizeInputKey,
} from '../settings/GameSettings';
import { UITheme } from './UITheme';
import { UIFactory } from './UIFactory';

type AudioChannel = keyof AudioSettings;

const ACTION_LABELS: Array<{ action: KeybindingAction; label: string }> = [
  { action: 'moveUp', label: 'Move Forward' },
  { action: 'moveDown', label: 'Move Backward' },
  { action: 'moveLeft', label: 'Move Left' },
  { action: 'moveRight', label: 'Move Right' },
  { action: 'shoot', label: 'Shoot / Primary' },
  { action: 'posture', label: 'Posture / Secondary' },
  { action: 'ultimate', label: 'Ultimate' },
];

const FILTER_OPTIONS: ColorVisionFilter[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'highContrast'];

export class SettingsMenuBuilder {
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
  private wallOcclusionCheckbox: Checkbox | null = null;
  private devModeCheckbox: Checkbox | null = null;
  private roomPreloadAheadSlider: Slider | null = null;
  private roomPreloadAheadValueText: TextBlock | null = null;

  public awaitingRebind: KeybindingAction | null = null;

  constructor(
    private onClose: () => void,
    private onResetProgress: () => void,
    private onBenchmarkRequested: () => void
  ) {
    this.keyCaptureHandler = this.keyCaptureHandler.bind(this);
    this.unsubscribeSettings = GameSettingsStore.subscribe((settings) => {
      this.settingsSnapshot = settings;
      this.refreshSettingsUi();
    });
  }

  public dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }
    window.removeEventListener('keydown', this.keyCaptureHandler, true);
  }

  public createSettingsOverlay(gui: any): Rectangle {
    const overlay = new Rectangle('settingsOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'rgba(0, 0, 0, 0.75)';
    overlay.isPointerBlocker = true;
    overlay.isVisible = false;
    overlay.zIndex = 2000;
    gui.addControl(overlay);
    this.settingsOverlay = overlay;

    const windowPanel = UIFactory.createPanel('settingsWindow', 900, 660);
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

    const resetProgressBtn = Button.CreateSimpleButton('settingsResetProgressButton', 'RESET CODEX PROGRESSION');
    resetProgressBtn.width = '250px';
    resetProgressBtn.height = '34px';
    resetProgressBtn.color = '#FFE5E5';
    resetProgressBtn.cornerRadius = 4;
    resetProgressBtn.background = 'rgba(72,20,20,0.95)';
    resetProgressBtn.thickness = 1;
    resetProgressBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    resetProgressBtn.left = '0px';
    resetProgressBtn.isPointerBlocker = true;
    resetProgressBtn.isHitTestVisible = true;
    resetProgressBtn.zIndex = 130;
    this.bindButtonAction(resetProgressBtn, () => {
      this.awaitingRebind = null;
      this.onResetProgress();
    });
    actionRow.addControl(resetProgressBtn);

    const closeBtn = Button.CreateSimpleButton('settingsCloseButton', 'CLOSE SETTINGS');
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
      this.onClose();
    });
    actionRow.addControl(closeBtn);

    const captureHintText = UIFactory.createText('settingsCaptureHint', 'Click a key field to capture input', 12, UITheme.colors.textDim);
    captureHintText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    captureHintText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    captureHintText.top = '-185px';
    windowPanel.addControl(captureHintText);

    const scroll = UIFactory.createScrollViewer('settingsScroll');
    scroll.width = '860px';
    scroll.height = '470px';
    scroll.top = '52px';
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
    
    this.refreshSettingsUi();
    
    return overlay;
  }

  private addGraphicsSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('GRAPHICS // PERFORMANCE'));
    parent.addControl(this.makeSectionSubText('Use lightweight procedural textures and progressive enemy spawn to reduce loading stalls.'));

    parent.addControl(this.makeToggleRow(
      'Lightweight Procedural Texture Mode',
      'Uses lighter procedural texture generation and reduced relief density.',
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
      'Spawns enemies in small batches over frames to avoid spikes.',
      (checkbox) => {
        this.progressiveSpawnCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateGraphics({ progressiveEnemySpawning: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeToggleRow(
      'Wall Occlusion Transparency',
      'Renders walls partially transparent when they hide the player.',
      (checkbox) => {
        this.wallOcclusionCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateGraphics({ wallOcclusionTransparency: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeGraphicsNumberSliderRow(
      'Room Preload Ahead Window',
      'How many next rooms are preloaded asynchronously ahead of the current room.',
      1, 8,
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
      'Runs a repeatable autoplay benchmark, then copies full metrics to clipboard.',
      'RUN BENCHMARK',
      () => {
        this.awaitingRebind = null;
        this.onBenchmarkRequested();
      }
    ));
  }

  private addControlsSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('CONTROLS // KEYBINDINGS'));
    parent.addControl(this.makeSectionSubText('Remap movement, shoot/posture and ultimate abilities.'));

    for (const descriptor of ACTION_LABELS) {
      parent.addControl(this.makeKeybindRow(descriptor.action, descriptor.label));
    }

    parent.addControl(this.makeToggleRow(
      'Keyboard-Only Mode',
      'Ignore mouse buttons during gameplay.',
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
      'Aim follows last movement direction in keyboard-only mode.',
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
    parent.addControl(this.makeSectionSubText('Master affects all channels. Music/SFX/UI/Voice are independent.'));

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
      'Adds CAT class to selection.',
      (checkbox) => {
        this.catGodModeCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateAccessibility({ catGodModeEnabled: !!isChecked });
        });
      }
    ));

    if (!import.meta.env.PROD) {
      parent.addControl(this.makeToggleRow(
        'Enable Developer Mode (Local Only)',
        'Shows development tools, cheats, and metrics.',
        (checkbox) => {
          this.devModeCheckbox = checkbox;
          checkbox.onIsCheckedChangedObservable.add((isChecked) => {
            if (this.isRefreshingUi) return;
            GameSettingsStore.updateAccessibility({ devModeEnabled: !!isChecked });
          });
        }
      ));
    }
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
      if (this.awaitingRebind === action) {
        this.awaitingRebind = null;
        window.removeEventListener('keydown', this.keyCaptureHandler, true);
      } else {
        const wasAwaiting = !!this.awaitingRebind;
        this.awaitingRebind = action;
        if (!wasAwaiting) {
          window.addEventListener('keydown', this.keyCaptureHandler, true);
        }
      }
      this.refreshSettingsUi();
    });
    row.addControl(keyButton);
    this.keybindButtons[action] = keyButton;
    return row;
  }

  private makeToggleRow(title: string, details: string, onReady: (checkbox: Checkbox) => void): Rectangle {
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
    detailText.top = '12px';
    row.addControl(detailText);

    const checkbox = new Checkbox();
    checkbox.width = '30px';
    checkbox.height = '30px';
    checkbox.color = '#7CFFEA';
    checkbox.background = 'rgba(0,0,0,0.5)';
    checkbox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    checkbox.left = '-20px';
    row.addControl(checkbox);

    onReady(checkbox);
    return row;
  }

  private makeGraphicsNumberSliderRow(
    title: string,
    details: string,
    min: number,
    max: number,
    onReady: (slider: Slider, valueText: TextBlock) => void
  ): Rectangle {
    const row = new Rectangle(`sliderRow_${title.replace(/\s+/g, '_')}`);
    row.width = '820px';
    row.height = '80px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`sliderTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 15;
    titleText.fontFamily = 'Consolas';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-20px';
    row.addControl(titleText);

    const detailText = new TextBlock(`sliderDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 11;
    detailText.fontFamily = 'Consolas';
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '0px';
    row.addControl(detailText);

    const valueText = new TextBlock(`sliderValueText_${title.replace(/\s+/g, '_')}`);
    valueText.text = '';
    valueText.color = '#7CFFEA';
    valueText.fontSize = 14;
    valueText.fontFamily = 'Consolas';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.paddingRight = '20px';
    valueText.top = '-20px';
    row.addControl(valueText);

    const slider = new Slider();
    slider.minimum = min;
    slider.maximum = max;
    slider.step = 1;
    slider.width = '780px';
    slider.height = '20px';
    slider.color = '#7CFFEA';
    slider.background = 'rgba(0,0,0,0.5)';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    slider.top = '22px';
    row.addControl(slider);

    onReady(slider, valueText);
    return row;
  }

  private makeAudioSliderRow(channel: AudioChannel, labelText: string): Rectangle {
    const row = new Rectangle(`audioRow_${channel}`);
    row.width = '820px';
    row.height = '48px';
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
    row.addControl(label);

    const valueText = new TextBlock(`audioValue_${channel}`);
    valueText.text = '100%';
    valueText.color = '#7CFFEA';
    valueText.fontSize = 14;
    valueText.fontFamily = 'Consolas';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.paddingRight = '280px';
    row.addControl(valueText);
    this.audioValueTexts[channel] = valueText;

    const slider = new Slider();
    slider.minimum = 0;
    slider.maximum = 100;
    slider.width = '240px';
    slider.height = '20px';
    slider.color = '#7CFFEA';
    slider.background = 'rgba(0,0,0,0.5)';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    slider.left = '-20px';

    slider.onValueChangedObservable.add((value) => {
      if (this.isRefreshingUi) return;
      const normalized = Math.max(0, Math.min(1, value / 100));
      GameSettingsStore.updateAudio({ [channel]: normalized } as Partial<AudioSettings>);
    });

    row.addControl(slider);
    this.audioSliders[channel] = slider;

    return row;
  }

  private makeActionRow(title: string, details: string, buttonText: string, action: () => void): Rectangle {
    const row = new Rectangle(`actionRow_${title.replace(/\s+/g, '_')}`);
    row.width = '820px';
    row.height = '70px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`actionTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#FFD782';
    titleText.fontSize = 15;
    titleText.fontFamily = 'Consolas';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-12px';
    row.addControl(titleText);

    const detailText = new TextBlock(`actionDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 11;
    detailText.fontFamily = 'Consolas';
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '12px';
    row.addControl(detailText);

    const actionBtn = Button.CreateSimpleButton(`actionBtn_${title.replace(/\s+/g, '_')}`, buttonText);
    actionBtn.width = '200px';
    actionBtn.height = '34px';
    actionBtn.color = '#FFD782';
    actionBtn.cornerRadius = 4;
    actionBtn.background = 'rgba(48,40,22,0.95)';
    actionBtn.thickness = 1;
    actionBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    actionBtn.left = '-14px';
    this.bindButtonAction(actionBtn, action);
    row.addControl(actionBtn);

    return row;
  }

  private bindButtonAction(button: Button, action: () => void): void {
    button.onPointerEnterObservable.add(() => {
      button.background = 'rgba(40,78,74,0.95)';
    });
    button.onPointerOutObservable.add(() => {
      button.background = 'rgba(22,48,44,0.95)';
    });
    button.onPointerDownObservable.add(() => {
      button.background = 'rgba(100,180,160,0.95)';
    });
    button.onPointerUpObservable.add(() => {
      button.background = 'rgba(40,78,74,0.95)';
      action();
    });
  }

  public refreshSettingsUi(): void {
    this.isRefreshingUi = true;

    for (const action of Object.keys(this.keybindButtons) as KeybindingAction[]) {
      const btn = this.keybindButtons[action];
      if (!btn || !btn.children || !btn.children[0]) continue;
      const tb = btn.children[0] as TextBlock;

      if (this.awaitingRebind === action) {
        tb.text = '[ PRESS ANY KEY ]';
        tb.color = '#FFD782';
      } else {
        const key = this.settingsSnapshot.controls.keybindings[action] || 'UNBOUND';
        tb.text = formatInputKeyLabel(key);
        tb.color = '#E3FFF7';
      }
    }

    if (this.keyboardOnlyCheckbox) this.keyboardOnlyCheckbox.isChecked = !!this.settingsSnapshot.controls.keyboardOnlyMode;
    if (this.autoAimCheckbox) this.autoAimCheckbox.isChecked = !!this.settingsSnapshot.controls.autoAimTowardMovement;

    if (this.lightweightTexturesCheckbox) this.lightweightTexturesCheckbox.isChecked = !!this.settingsSnapshot.graphics.lightweightTexturesMode;
    if (this.progressiveSpawnCheckbox) this.progressiveSpawnCheckbox.isChecked = !!this.settingsSnapshot.graphics.progressiveEnemySpawning;
    if (this.wallOcclusionCheckbox) this.wallOcclusionCheckbox.isChecked = !!this.settingsSnapshot.graphics.wallOcclusionTransparency;

    if (this.roomPreloadAheadSlider) {
      const v = this.settingsSnapshot.graphics.roomPreloadAheadCount ?? 2;
      this.roomPreloadAheadSlider.value = v;
      if (this.roomPreloadAheadValueText) {
        this.roomPreloadAheadValueText.text = `${v} rooms`;
      }
    }

    if (this.catGodModeCheckbox) this.catGodModeCheckbox.isChecked = !!this.settingsSnapshot.accessibility.catGodModeEnabled;
    if (this.devModeCheckbox) this.devModeCheckbox.isChecked = !!this.settingsSnapshot.accessibility.devModeEnabled;

    if (this.colorFilterButton && this.colorFilterButton.children[0]) {
      const tb = this.colorFilterButton.children[0] as TextBlock;
      tb.text = this.settingsSnapshot.accessibility.colorFilter.toUpperCase();
    }

    for (const ch of Object.keys(this.audioSliders) as AudioChannel[]) {
      const slider = this.audioSliders[ch];
      const textBlock = this.audioValueTexts[ch];
      if (!slider || !textBlock) continue;
      const val = this.settingsSnapshot.audio[ch];
      const pct = Math.round(val * 100);
      slider.value = pct;
      textBlock.text = `${pct}%`;
    }

    this.isRefreshingUi = false;
  }

  private keyCaptureHandler(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.awaitingRebind) {
        this.awaitingRebind = null;
        this.refreshSettingsUi();
        event.preventDefault();
        event.stopPropagation();
      }
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
  }
}
