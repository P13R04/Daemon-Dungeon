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

  private autoAimCheckbox: Checkbox | null = null;
  private colorFilterButton: Button | null = null;
  private catGodModeCheckbox: Checkbox | null = null;
  private lightweightTexturesCheckbox: Checkbox | null = null;
  private progressiveSpawnCheckbox: Checkbox | null = null;
  private wallOcclusionCheckbox: Checkbox | null = null;
  private devModeCheckbox: Checkbox | null = null;
  private roomPreloadAheadSlider: Slider | null = null;
  private roomPreloadAheadValueText: TextBlock | null = null;
  private resetProgressConfirmOverlay: Rectangle | null = null;
  private isMobileLayout: boolean = false;
  private menuButtonHeight: number = 70;
  private menuButtonFontSize: number = 21;

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
    const idealWidth = gui?.idealWidth || 1920;
    const idealHeight = gui?.idealHeight || 1080;
    this.isMobileLayout = idealWidth <= 960;
    this.menuButtonHeight = this.isMobileLayout ? 88 : 78;
    this.menuButtonFontSize = this.isMobileLayout ? 27 : 24;

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

    const windowPanel = UIFactory.createPanel('settingsWindow', Math.round(idealWidth * 0.9), Math.round(idealHeight * 0.92));
    overlay.addControl(windowPanel);

    const title = new TextBlock('settingsTitle');
    title.text = 'SETTINGS CONSOLE';
    title.color = UITheme.colors.textHighlight;
    title.fontSize = this.isMobileLayout ? 50 : 42;
    title.fontFamily = 'Wonder8Bit';
    title.top = '-350px';
    windowPanel.addControl(title);

    const actionRow = new Rectangle('settingsActionRow');
    actionRow.width = `${Math.round(idealWidth * 0.85)}px`;
    actionRow.height = `${this.menuButtonHeight + 6}px`;
    actionRow.thickness = 0;
    actionRow.top = `-${Math.round(idealHeight * 0.35)}px`;
    actionRow.isPointerBlocker = true;
    actionRow.zIndex = 120;
    windowPanel.addControl(actionRow);

      const closeBtn = Button.CreateSimpleButton('settingsCloseButton', 'BACK');
    closeBtn.width = `${this.isMobileLayout ? 220 : 200}px`;
    closeBtn.height = `${this.menuButtonHeight}px`;
    closeBtn.color = UITheme.colors.textNormal;
    closeBtn.cornerRadius = 4;
      closeBtn.background = UITheme.colors.buttonBg;
    closeBtn.thickness = 1;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    closeBtn.left = '0px';
    closeBtn.isPointerBlocker = true;
    closeBtn.isHitTestVisible = true;
    closeBtn.zIndex = 130;
    if (closeBtn.textBlock) closeBtn.textBlock.fontSize = this.menuButtonFontSize;
    if (closeBtn.textBlock) closeBtn.textBlock.fontFamily = 'Wonder8Bit';
    this.bindButtonAction(closeBtn, () => {
      this.awaitingRebind = null;
      this.onClose();
    });
    actionRow.addControl(closeBtn);

      const resetBtn = Button.CreateSimpleButton('settingsResetButton', 'RESET DEFAULTS');
    resetBtn.width = `${this.isMobileLayout ? 300 : 260}px`;
    resetBtn.height = `${this.menuButtonHeight}px`;
    resetBtn.color = UITheme.colors.textNormal;
    resetBtn.cornerRadius = 4;
      resetBtn.background = UITheme.colors.buttonBg;
    resetBtn.thickness = 1;
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    resetBtn.left = '0px';
    resetBtn.isPointerBlocker = true;
    resetBtn.isHitTestVisible = true;
    resetBtn.zIndex = 130;
    if (resetBtn.textBlock) resetBtn.textBlock.fontSize = this.menuButtonFontSize;
    if (resetBtn.textBlock) resetBtn.textBlock.fontFamily = 'Wonder8Bit';
    this.bindButtonAction(resetBtn, () => {
      this.awaitingRebind = null;
      GameSettingsStore.resetToDefaults();
    });
    actionRow.addControl(resetBtn);

    const scroll = UIFactory.createScrollViewer('settingsScroll');
    scroll.width = `${Math.round(idealWidth * 0.85)}px`;
    scroll.height = `${Math.round(idealHeight * 0.66)}px`;
    scroll.top = `${Math.round(idealHeight * 0.06)}px`;
    windowPanel.addControl(scroll);

    const content = new StackPanel('settingsStack');
    content.isVertical = true;
    content.spacing = this.isMobileLayout ? 14 : 12;
    content.width = 1;
    scroll.addControl(content);

    this.addAudioSection(content);
    if (!this.isMobileLayout) {
      this.addControlsSection(content);
    }
    this.addPerformanceSection(content);
    this.addAccessibilitySection(content);
    this.createResetProgressConfirmOverlay(overlay);
    
    this.refreshSettingsUi();
    
    return overlay;
  }

  private addControlsSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('CONTROLS'));

    for (const descriptor of ACTION_LABELS) {
      parent.addControl(this.makeKeybindRow(descriptor.action, descriptor.label));
    }

    parent.addControl(this.makeToggleRow(
      'Auto-Aim & Auto-Fire',
      '',
      (checkbox) => {
        this.autoAimCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateControls({ autoAimTowardMovement: !!isChecked });
        });
      }
    ));

    if (!import.meta.env.PROD) {
      parent.addControl(this.makeActionRow(
        'Automated Benchmark',
        '',
        'RUN BENCHMARK',
        () => {
          this.awaitingRebind = null;
          this.onBenchmarkRequested();
        }
      ));
    }
  }

  private addPerformanceSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('PERFORMANCE'));

    parent.addControl(this.makeToggleRow(
      'Lightweight Procedural Texture Mode',
      '',
      (checkbox) => {
        this.lightweightTexturesCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateGraphics({ lightweightTexturesMode: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeToggleRow(
      'Progressive Enemy Spawning (anti-lag)',
      '',
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
      '',
      (checkbox) => {
        this.wallOcclusionCheckbox = checkbox;
        checkbox.onIsCheckedChangedObservable.add((isChecked) => {
          if (this.isRefreshingUi) return;
          GameSettingsStore.updateGraphics({ wallOcclusionTransparency: !!isChecked });
        });
      }
    ));

    parent.addControl(this.makeGraphicsNumberSliderRow(
      'Room Preload Ahead',
      '',
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
  }

  private addAudioSection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('AUDIO'));

    parent.addControl(this.makeAudioSliderRow('master', 'Master Volume'));
    parent.addControl(this.makeAudioSliderRow('music', 'Music Volume'));
    parent.addControl(this.makeAudioSliderRow('sfx', 'SFX Volume'));
    parent.addControl(this.makeAudioSliderRow('ui', 'UI Volume'));
    parent.addControl(this.makeAudioSliderRow('voice', 'Voice Volume'));
  }

  private addAccessibilitySection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('ACCESSIBILITY'));

    const row = new Rectangle('accessibilityFilterRow');
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '90px' : '84px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = UITheme.colors.borderDim;
    row.background = UITheme.colors.buttonBg;

    const label = new TextBlock('accessibilityFilterLabel');
    label.text = 'Color Vision Filter';
    label.color = UITheme.colors.textNormal;
    label.fontSize = this.isMobileLayout ? 24 : 22;
    label.fontFamily = 'Arcade8Bit';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const button = Button.CreateSimpleButton('accessibilityFilterButton', 'NONE');
    button.width = this.isMobileLayout ? '320px' : '300px';
    button.height = `${this.menuButtonHeight}px`;
    button.color = UITheme.colors.textNormal;
    button.cornerRadius = 4;
      button.background = UITheme.colors.buttonBg;
    button.thickness = 1;
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    button.left = '-16px';
    if (button.textBlock) button.textBlock.fontSize = this.menuButtonFontSize;
    this.bindButtonAction(button, () => {
      const current = this.settingsSnapshot.accessibility.colorFilter;
      const currentIndex = FILTER_OPTIONS.indexOf(current);
      const nextFilter = FILTER_OPTIONS[(currentIndex + 1 + FILTER_OPTIONS.length) % FILTER_OPTIONS.length];
      GameSettingsStore.updateAccessibility({ colorFilter: nextFilter });
    });
    row.addControl(button);
    this.colorFilterButton = button;

    parent.addControl(row);

    parent.addControl(this.makeToggleRow(
      'Enable CAT Easter Egg (God Mode)',
      '',
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
        '',
        (checkbox) => {
          this.devModeCheckbox = checkbox;
          checkbox.onIsCheckedChangedObservable.add((isChecked) => {
            if (this.isRefreshingUi) return;
            GameSettingsStore.updateAccessibility({ devModeEnabled: !!isChecked });
          });
        }
      ));
    }

    // RESET PROGRESSION — at the very bottom of settings
    const resetProgressBtn = Button.CreateSimpleButton('settingsResetProgressButton', 'RESET PROGRESSION');
    resetProgressBtn.width = `${this.isMobileLayout ? 480 : 420}px`;
    resetProgressBtn.height = `${this.menuButtonHeight}px`;
    resetProgressBtn.color = UITheme.colors.danger;
    resetProgressBtn.cornerRadius = 4;
    resetProgressBtn.background = 'rgba(92, 18, 28, 0.96)';
    resetProgressBtn.thickness = 1;
    resetProgressBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    resetProgressBtn.top = '8px';
    resetProgressBtn.isPointerBlocker = true;
    resetProgressBtn.isHitTestVisible = true;
    if (resetProgressBtn.textBlock) {
      resetProgressBtn.textBlock.fontSize = this.menuButtonFontSize;
      resetProgressBtn.textBlock.fontFamily = 'Wonder8Bit';
      resetProgressBtn.textBlock.color = '#FFFFFF';
    }
    this.bindButtonAction(resetProgressBtn, () => {
      this.awaitingRebind = null;
      this.showResetProgressConfirmOverlay();
    });
    parent.addControl(resetProgressBtn);
  }

  private createResetProgressConfirmOverlay(parent: Rectangle): void {
    const overlay = new Rectangle('settingsResetProgressConfirmOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'rgba(0, 0, 0, 0.75)';
    overlay.isPointerBlocker = true;
    overlay.isVisible = false;
    overlay.zIndex = 2600;
    parent.addControl(overlay);
    this.resetProgressConfirmOverlay = overlay;

    const panel = new Rectangle('settingsResetProgressConfirmPanel');
    panel.width = '680px';
    panel.height = '300px';
    panel.cornerRadius = 6;
    panel.thickness = 1;
    panel.color = '#8A3434';
    panel.background = 'rgba(22, 10, 10, 0.96)';
    panel.isPointerBlocker = true;
    overlay.addControl(panel);

    const title = new TextBlock('settingsResetProgressConfirmTitle');
    title.text = 'RESET PROGRESSION';
    title.color = '#FFE5E5';
    title.fontSize = 32;
    title.fontFamily = 'Wonder8Bit';
    title.top = '-104px';
    panel.addControl(title);

    const body = new TextBlock('settingsResetProgressConfirmBody');
    body.text = 'This will reset codex, achievements, settings, and tutorial completion.\nThe game will restart as a first launch.';
    body.color = '#FFD0D0';
    body.fontSize = 18;
    body.fontFamily = 'Wonder8Bit';
    body.width = '600px';
    body.height = '110px';
    body.textWrapping = true;
    body.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    body.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    body.top = '-12px';
    panel.addControl(body);

    const buttons = new StackPanel('settingsResetProgressConfirmButtons');
    buttons.isVertical = false;
    buttons.spacing = 16;
    buttons.top = '104px';
    panel.addControl(buttons);

    const cancel = Button.CreateSimpleButton('settingsResetProgressConfirmCancel', 'CANCEL');
    cancel.width = '220px';
    cancel.height = '48px';
    cancel.color = '#DDFCF3';
    cancel.background = UITheme.colors.buttonBg;
    cancel.thickness = 1;
    cancel.cornerRadius = 4;
    if (cancel.textBlock) cancel.textBlock.fontSize = 18;
    this.bindButtonAction(cancel, () => this.hideResetProgressConfirmOverlay());
    buttons.addControl(cancel);

    const confirm = Button.CreateSimpleButton('settingsResetProgressConfirmApply', 'RESET & RESTART');
    confirm.width = '220px';
    confirm.height = '48px';
    confirm.color = UITheme.colors.danger;
    confirm.background = 'rgba(92, 18, 28, 0.96)';
    confirm.thickness = 1;
    confirm.cornerRadius = 4;
    if (confirm.textBlock) {
      confirm.textBlock.fontSize = 18;
      confirm.textBlock.color = '#FFFFFF';
    }
    this.bindButtonAction(confirm, () => {
      this.hideResetProgressConfirmOverlay();
      this.onResetProgress();
    });
    buttons.addControl(confirm);
  }

  private showResetProgressConfirmOverlay(): void {
    if (this.resetProgressConfirmOverlay) {
      this.resetProgressConfirmOverlay.isVisible = true;
    }
  }

  private hideResetProgressConfirmOverlay(): void {
    if (this.resetProgressConfirmOverlay) {
      this.resetProgressConfirmOverlay.isVisible = false;
    }
  }

  private makeSectionHeader(text: string): Rectangle {
    const row = new Rectangle(`sectionHeader_${text.replace(/\s+/g, '_')}`);
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '64px' : '58px';
    row.thickness = 0;
    row.background = UITheme.colors.buttonBg;

    const title = new TextBlock(`sectionHeaderText_${text.replace(/\s+/g, '_')}`);
    title.text = text;
    title.color = UITheme.colors.textHighlight;
    title.fontSize = this.isMobileLayout ? 30 : 28;
    title.fontFamily = 'Wonder8Bit';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = '10px';
    row.addControl(title);
    return row;
  }

  private makeSectionSubText(text: string): TextBlock {
    const info = new TextBlock(`sectionInfo_${text.replace(/\s+/g, '_').slice(0, 18)}`);
    info.text = text;
    info.color = UITheme.colors.textDim;
    info.fontSize = 14;
    info.fontFamily = 'Arcade8Bit';
    info.height = '28px';
    info.width = '1100px';
    info.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    info.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return info;
  }

  private makeKeybindRow(action: KeybindingAction, labelText: string): Rectangle {
    const row = new Rectangle(`keybindRow_${action}`);
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '94px' : '86px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = UITheme.colors.borderDim;
    row.background = UITheme.colors.buttonBg;

    const label = new TextBlock(`keybindLabel_${action}`);
    label.text = labelText;
    label.color = UITheme.colors.textNormal;
    label.fontSize = this.isMobileLayout ? 24 : 22;
    label.fontFamily = 'Arcade8Bit';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const keyButton = Button.CreateSimpleButton(`keybindButton_${action}`, '...');
    keyButton.width = this.isMobileLayout ? '300px' : '280px';
    keyButton.height = `${this.menuButtonHeight}px`;
    keyButton.color = UITheme.colors.textNormal;
    keyButton.cornerRadius = 4;
    keyButton.background = UITheme.colors.buttonBg;
    keyButton.thickness = 1;
    keyButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    keyButton.left = '-16px';
    if (keyButton.textBlock) keyButton.textBlock.fontSize = this.menuButtonFontSize;
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
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '94px' : '86px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = UITheme.colors.borderDim;
    row.background = UITheme.colors.buttonBg;

    const titleText = new TextBlock(`toggleTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = UITheme.colors.textNormal;
    titleText.fontSize = this.isMobileLayout ? 24 : 22;
    titleText.fontFamily = 'Arcade8Bit';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '0px';
    row.addControl(titleText);

    if (details.trim().length > 0) {
      const detailText = new TextBlock(`toggleDetails_${title.replace(/\s+/g, '_')}`);
      detailText.text = details;
      detailText.color = UITheme.colors.textDim;
      detailText.fontSize = this.isMobileLayout ? 15 : 14;
      detailText.fontFamily = 'Arcade8Bit';
      detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.paddingLeft = '14px';
      detailText.top = '18px';
      row.addControl(detailText);
    }

    const checkbox = new Checkbox();
    checkbox.width = this.isMobileLayout ? '40px' : '36px';
    checkbox.height = this.isMobileLayout ? '40px' : '36px';
    checkbox.color = UITheme.colors.borderBright;
    checkbox.background = 'rgba(0,0,0,0.5)';
    checkbox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    checkbox.left = '-28px';
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
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '104px' : '96px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = UITheme.colors.borderDim;
    row.background = UITheme.colors.buttonBg;

    const titleText = new TextBlock(`sliderTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = UITheme.colors.textNormal;
    titleText.fontSize = this.isMobileLayout ? 24 : 22;
    titleText.fontFamily = 'Arcade8Bit';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '0px';
    row.addControl(titleText);

    if (details.trim().length > 0) {
      const detailText = new TextBlock(`sliderDetails_${title.replace(/\s+/g, '_')}`);
      detailText.text = details;
      detailText.color = UITheme.colors.textDim;
      detailText.fontSize = this.isMobileLayout ? 15 : 14;
      detailText.fontFamily = 'Arcade8Bit';
      detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.paddingLeft = '14px';
      detailText.top = '18px';
      row.addControl(detailText);
    }

    const valueText = new TextBlock(`sliderValueText_${title.replace(/\s+/g, '_')}`);
    valueText.text = '';
    valueText.color = UITheme.colors.textHighlight;
    valueText.fontSize = this.isMobileLayout ? 20 : 18;
    valueText.fontFamily = 'Arcade8Bit';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.paddingRight = '20px';
    valueText.top = '0px';
    row.addControl(valueText);

    const slider = new Slider();
    slider.minimum = min;
    slider.maximum = max;
    slider.step = 1;
    slider.width = this.isMobileLayout ? '92%' : '94%';
    slider.height = '20px';
    slider.color = UITheme.colors.borderBright;
    slider.background = 'rgba(0,0,0,0.5)';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    slider.top = details.trim().length > 0 ? '28px' : '22px';
    row.addControl(slider);

    onReady(slider, valueText);
    return row;
  }

  private makeAudioSliderRow(channel: AudioChannel, labelText: string): Rectangle {
    const row = new Rectangle(`audioRow_${channel}`);
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '90px' : '84px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = UITheme.colors.borderDim;
    row.background = UITheme.colors.buttonBg;

    const label = new TextBlock(`audioLabel_${channel}`);
    label.text = labelText;
    label.color = UITheme.colors.textNormal;
    label.fontSize = this.isMobileLayout ? 24 : 22;
    label.fontFamily = 'Arcade8Bit';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const valueText = new TextBlock(`audioValue_${channel}`);
    valueText.text = '100%';
    valueText.color = UITheme.colors.textHighlight;
    valueText.fontSize = this.isMobileLayout ? 20 : 18;
    valueText.fontFamily = 'Arcade8Bit';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.paddingRight = this.isMobileLayout ? '64%' : '66%';
    row.addControl(valueText);
    this.audioValueTexts[channel] = valueText;

    const slider = new Slider();
    slider.minimum = 0;
    slider.maximum = 100;
    slider.width = this.isMobileLayout ? '62%' : '64%';
    slider.height = '20px';
    slider.color = UITheme.colors.borderBright;
    slider.background = 'rgba(0,0,0,0.5)';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    slider.left = '-16px';

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
    row.width = this.isMobileLayout ? '96%' : '97%';
    row.height = this.isMobileLayout ? '94px' : '86px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = UITheme.colors.borderDim;
    row.background = UITheme.colors.buttonBg;

    const titleText = new TextBlock(`actionTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#FFE7B8';
    titleText.fontSize = this.isMobileLayout ? 24 : 22;
    titleText.fontFamily = 'Arcade8Bit';
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '0px';
    row.addControl(titleText);

    if (details.trim().length > 0) {
      const detailText = new TextBlock(`actionDetails_${title.replace(/\s+/g, '_')}`);
      detailText.text = details;
      detailText.color = UITheme.colors.textDim;
      detailText.fontSize = this.isMobileLayout ? 15 : 14;
      detailText.fontFamily = 'Arcade8Bit';
      detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      detailText.paddingLeft = '14px';
      detailText.top = '18px';
      row.addControl(detailText);
    }

    const actionBtn = Button.CreateSimpleButton(`actionBtn_${title.replace(/\s+/g, '_')}`, buttonText);
    actionBtn.width = this.isMobileLayout ? '300px' : '280px';
    actionBtn.height = `${this.menuButtonHeight}px`;
    actionBtn.color = '#FFE7B8';
    actionBtn.cornerRadius = 4;
    actionBtn.background = UITheme.colors.buttonBg;
    actionBtn.thickness = 1;
    actionBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    actionBtn.left = '-16px';
    if (actionBtn.textBlock) actionBtn.textBlock.fontSize = this.menuButtonFontSize;
    this.bindButtonAction(actionBtn, action);
    row.addControl(actionBtn);

    return row;
  }

  private bindButtonAction(button: Button, action: () => void): void {
    const baseBackground = button.background;
    button.onPointerEnterObservable.add(() => {
      button.background = UITheme.colors.hoverBg;
    });
    button.onPointerOutObservable.add(() => {
      button.background = baseBackground;
    });
    button.onPointerDownObservable.add(() => {
      button.background = 'rgba(70, 120, 255, 0.24)';
    });
    button.onPointerUpObservable.add(() => {
      button.background = UITheme.colors.hoverBg;
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
        tb.color = UITheme.colors.textNormal;
      }
    }


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
