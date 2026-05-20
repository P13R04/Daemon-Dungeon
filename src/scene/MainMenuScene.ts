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
  Image,
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
import { EventBus, GameEvents } from '../core/EventBus';
import { HUDManager } from '../systems/HUDManager';
import { buildHudAssetUrl, getCachedHudAsset } from '../systems/hud/HudAssetPaths';
import { UIFactory } from '../ui/UIFactory';
import { UITheme } from '../ui/UITheme';
import { DaemonGlitchFx } from '../ui/DaemonGlitchFx';

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

export class MainMenuScene {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private menuPanel: Rectangle | null = null;
  private menuHint: TextBlock | null = null;
  private glitchFx!: DaemonGlitchFx;
  private titleFlickerTime = 0;
  private settingsOverlay: Rectangle | null = null;
  private mainLayoutContainer!: Rectangle;
  private resizeObserver: any = null;

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
  private captureHintText: TextBlock | null = null;

  private awaitingRebind: KeybindingAction | null = null;
  private readonly eventBus: EventBus = EventBus.getInstance();
  private achievementToast: Rectangle | null = null;
  private achievementToastTitle: TextBlock | null = null;
  private achievementToastDescription: TextBlock | null = null;
  private achievementToastTimer: number = 0;
  private achievementToastObserver: any = null;
  private unsubscribeAchievementToast: (() => void) | null = null;
  private achievementIconPlaceholder: Rectangle | null = null;
  private achievementToastArtwork: Image | null = null;

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
    this.scene.clearColor = Color4.FromHexString(UITheme.colors.bgVoid);

    const camera = new FreeCamera('mainMenuCamera', new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    this.scene.activeCamera = camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('MainMenuUI', true, this.scene);
    this.gui.idealWidth = 1920;
    this.gui.idealHeight = 1080;
    this.gui.useSmallestIdeal = true;
    this.gui.renderAtIdealSize = true;
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    this.mainLayoutContainer = new Rectangle('mainLayout');
    this.mainLayoutContainer.width = '1920px';
    this.mainLayoutContainer.height = '1080px';
    this.mainLayoutContainer.thickness = 0;
    this.mainLayoutContainer.background = 'transparent';
    this.mainLayoutContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.mainLayoutContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.gui.addControl(this.mainLayoutContainer);

    const updateScale = () => {
      const size = this.gui.getSize();
      const scaleX = size.width / 1920;
      const scaleY = size.height / 1080;
      const scale = Math.min(1, scaleX, scaleY);
      this.mainLayoutContainer.scaleX = scale;
      this.mainLayoutContainer.scaleY = scale;
    };
    this.resizeObserver = this.engine.onResizeObservable.add(updateScale);
    updateScale();

    this.createMainButtons();
    this.createSettingsOverlay();
    this.glitchFx = new DaemonGlitchFx();
    this.createAchievementToast();
    this.refreshSettingsUi();

    this.unsubscribeAchievementToast = this.eventBus.on(GameEvents.ACHIEVEMENT_UNLOCKED, (data?: { name?: string; achievementId?: string; description?: string }) => {
      const id = data?.achievementId || 'unknown';
      const name = typeof data?.name === 'string' && data.name.trim().length > 0
        ? data.name.trim()
        : id;
      const description = typeof data?.description === 'string' ? data.description.trim() : '';
      
      HUDManager.achievementToastQueue.push({ id, name, description });
      
      if (!HUDManager.achievementToastActive) {
        this.showNextAchievementToast();
      }
    });

    this.achievementToastObserver = this.scene.onBeforeRenderObservable.add(() => {
      const deltaTime = this.engine.getDeltaTime() / 1000;
      this.updateAchievementToast(deltaTime);
    });

    // Resume displaying achievements if queue is not empty and no toast is active
    if (HUDManager.achievementToastQueue.length > 0 && !HUDManager.achievementToastActive) {
      this.showNextAchievementToast();
    }

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
    if (HUDManager.currentAchievement) {
      HUDManager.achievementToastQueue.unshift(HUDManager.currentAchievement);
      HUDManager.currentAchievement = null;
      HUDManager.achievementToastActive = false;
    }
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }
    if (this.unsubscribeAchievementToast) {
      this.unsubscribeAchievementToast();
      this.unsubscribeAchievementToast = null;
    }
    if (this.achievementToastObserver) {
      this.scene.onBeforeRenderObservable.remove(this.achievementToastObserver);
      this.achievementToastObserver = null;
    }
    if (this.achievementToastArtwork) {
      this.achievementToastArtwork.dispose();
      this.achievementToastArtwork = null;
    }
    if (this.resizeObserver) {
      this.engine.onResizeObservable.remove(this.resizeObserver);
      this.resizeObserver = null;
    }
    window.removeEventListener('keydown', this.keyCaptureHandler, true);
    this.glitchFx.dispose();
    this.gui.dispose();
    this.scene.dispose();
  }

  private createAchievementToast(): void {
    const toast = new Rectangle('menuAchievementToast');
    toast.width = '360px';
    toast.height = '88px';
    toast.thickness = 1;
    toast.color = '#7CFFEA';
    toast.background = 'rgba(4, 24, 28, 0.88)';
    toast.left = 16;
    toast.top = 20;
    toast.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toast.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    toast.isPointerBlocker = false;
    toast.isVisible = false;
    toast.zIndex = 1000;
    this.mainLayoutContainer.addControl(toast);
    this.achievementToast = toast;

    const title = new TextBlock('menuAchievementToastTitle');
    title.text = 'ACHIEVEMENT UNLOCKED';
    title.color = '#7CFFEA';
    title.fontFamily = 'Consolas';
    title.fontSize = 16;
    title.left = 88;
    title.top = 10;
    title.width = '260px';
    title.height = '24px';
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toast.addControl(title);
    this.achievementToastTitle = title;

    const description = new TextBlock('menuAchievementToastDescription');
    description.text = '';
    description.color = '#CFFCF3';
    description.fontFamily = 'Consolas';
    description.fontSize = 13;
    description.left = 88;
    description.top = 34;
    description.width = '260px';
    description.height = '40px';
    description.textWrapping = true;
    description.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    description.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    description.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toast.addControl(description);
    this.achievementToastDescription = description;

    this.achievementIconPlaceholder = new Rectangle('menuAchievementToastIcon');
    this.achievementIconPlaceholder.width = '64px';
    this.achievementIconPlaceholder.height = '64px';
    this.achievementIconPlaceholder.thickness = 1;
    this.achievementIconPlaceholder.color = '#5FFFE0';
    this.achievementIconPlaceholder.background = 'rgba(18, 44, 51, 0.9)';
    this.achievementIconPlaceholder.left = 12;
    this.achievementIconPlaceholder.top = 12;
    this.achievementIconPlaceholder.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementIconPlaceholder.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    toast.addControl(this.achievementIconPlaceholder);

    const achievementIconText = new TextBlock('menuAchievementToastIconText');
    achievementIconText.text = '?';
    achievementIconText.fontFamily = 'Consolas';
    achievementIconText.fontSize = 24;
    achievementIconText.color = '#B8FFE6';
    this.achievementIconPlaceholder.addControl(achievementIconText);
  }

  private showNextAchievementToast(): void {
    if (HUDManager.currentAchievement) return;

    HUDManager.currentAchievement = HUDManager.achievementToastQueue.shift() || null;
    if (!HUDManager.currentAchievement || !this.achievementToast) {
      HUDManager.achievementToastActive = false;
      return;
    }

    if (this.achievementToastTitle) {
      this.achievementToastTitle.text = `UNLOCKED: ${HUDManager.currentAchievement.name}`;
    }
    if (this.achievementToastDescription) {
      this.achievementToastDescription.text = HUDManager.currentAchievement.description;
    }

    if (this.achievementIconPlaceholder) {
      if (this.achievementToastArtwork) {
        this.achievementToastArtwork.dispose();
      }
      this.achievementToastArtwork = new Image('menuAchievementToastArtwork');
      const cachedImg = getCachedHudAsset(`achievements/${HUDManager.currentAchievement.id}.png`);
      if (cachedImg) {
        this.achievementToastArtwork.domImage = cachedImg;
      } else {
        this.achievementToastArtwork.source = buildHudAssetUrl(`achievements/${HUDManager.currentAchievement.id}.png`);
      }
      this.achievementToastArtwork.width = '64px';
      this.achievementToastArtwork.height = '64px';
      this.achievementToastArtwork.stretch = Image.STRETCH_UNIFORM;
      this.achievementIconPlaceholder.addControl(this.achievementToastArtwork);
    }

    HUDManager.achievementToastActive = true;
    this.achievementToastTimer = 4;
    this.achievementToast.alpha = 1;
    this.achievementToast.isVisible = true;
  }

  private updateAchievementToast(deltaTime: number): void {
    if (!HUDManager.achievementToastActive) {
      if (HUDManager.achievementToastQueue.length > 0) {
        this.showNextAchievementToast();
      }
      return;
    }

    if (!this.achievementToast?.isVisible) {
      if (this.achievementToastTimer > 0) {
        this.achievementToast!.isVisible = true;
      } else {
        HUDManager.achievementToastActive = false;
      }
      return;
    }

    this.achievementToastTimer -= deltaTime;
    if (this.achievementToastTimer <= 0) {
      this.achievementToast.isVisible = false;
      this.achievementToast.alpha = 1;
      HUDManager.achievementToastActive = false;
      HUDManager.currentAchievement = null;
      if (HUDManager.achievementToastQueue.length > 0) {
        this.showNextAchievementToast();
      }
      return;
    }

    if (this.achievementToastTimer < 0.35) {
      this.achievementToast.alpha = Math.max(0, this.achievementToastTimer / 0.35);
    }
  }

  private createMainButtons(): void {
    const title = UIFactory.createText('menuTitle', 'DAEMON DUNGEON', 56, UITheme.colors.textHighlight);
    title.fontFamily = UITheme.fonts.primary;
    title.top = '-34%';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.mainLayoutContainer.addControl(title);

    // Title flicker animation — slow oscillation between highlight colors
    this.scene.onBeforeRenderObservable.add(() => {
      this.titleFlickerTime += this.scene.getEngine().getDeltaTime();
      const t = this.titleFlickerTime;
      // Slow pulse: green → cyan → white, very subtle, period ~6s
      const phase = (t * 0.001) % (Math.PI * 2);
      const pulse = Math.sin(phase);
      if (pulse > 0.7) {
        title.color = '#FFFFFF';
      } else if (pulse > 0.2) {
        title.color = UITheme.colors.borderBright; // cyan
      } else {
        title.color = UITheme.colors.textHighlight; // green
      }
      // Occasional fast flicker — 1-2 frames, ~every 8s
      if (Math.random() < 0.0004) {
        title.color = '#CC00FF'; // daemon magenta flash
      }
    });

    const subtitle = UIFactory.createText('menuSubtitle', 'SYSTEM READY // MAIN CONSOLE', 16, UITheme.colors.borderBright);
    subtitle.top = '-27%';
    subtitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.mainLayoutContainer.addControl(subtitle);

    const panel = UIFactory.createPanel('menuPanel', 460, 480);
    panel.top = '-2%';
    this.mainLayoutContainer.addControl(panel);
    this.menuPanel = panel;

    const playBtn = this.makeActionButton('menuPlay', 'START RUN', -150, () => {
      this.hidePanels();
      this.onPlayRequested();
    });
    panel.addControl(playBtn);

    const tutorialBtn = this.makeActionButton('menuTutorial', 'TUTORIAL', -90, () => {
      this.hidePanels();
      this.onTutorialRequested();
    });
    panel.addControl(tutorialBtn);

    const codexBtn = this.makeActionButton('menuCodex', 'CODEX', -30, () => {
      this.hidePanels();
      this.onCodexRequested();
    });
    panel.addControl(codexBtn);

    const achievementsBtn = this.makeActionButton('menuAchievements', 'ACHIEVEMENTS', 30, () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.ACHIEVEMENTS_OPEN_REQUESTED);
    });
    panel.addControl(achievementsBtn);

    const highscoresBtn = this.makeActionButton('menuHighscores', 'HIGHSCORES', 90, () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.HIGHSCORES_OPEN_REQUESTED);
    });
    panel.addControl(highscoresBtn);

    const settingsBtn = this.makeActionButton('menuSettings', 'SETTINGS', 150, () => {
      this.openSettingsOverlay();
    });
    panel.addControl(settingsBtn);

    this.menuHint = null;
  }

  private createSettingsOverlay(): void {
    const overlay = new Rectangle('settingsOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'rgba(0, 0, 0, 0.75)';
    overlay.isPointerBlocker = true;
    overlay.isVisible = false;
    this.mainLayoutContainer.addControl(overlay);
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



    const actionRow = new Rectangle('settingsActionRow');
    actionRow.width = '860px';
    actionRow.height = '44px';
    actionRow.thickness = 0;
    actionRow.top = '-225px';
    actionRow.isPointerBlocker = true;
    actionRow.zIndex = 120;
    windowPanel.addControl(actionRow);

    const closeBtn = Button.CreateSimpleButton('settingsCloseButton', 'BACK');
    closeBtn.width = '120px';
    closeBtn.height = '34px';
    closeBtn.color = '#D2FFF2';
    closeBtn.cornerRadius = 4;
    closeBtn.background = 'rgba(20,38,45,0.95)';
    closeBtn.thickness = 1;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    closeBtn.left = '0px';
    closeBtn.isPointerBlocker = true;
    closeBtn.isHitTestVisible = true;
    closeBtn.zIndex = 130;
    this.bindButtonAction(closeBtn, () => {
      this.awaitingRebind = null;
      this.closeSettingsOverlay();
    });
    actionRow.addControl(closeBtn);

    const resetBtn = Button.CreateSimpleButton('settingsResetButton', 'RESET DEFAULTS');
    resetBtn.width = '180px';
    resetBtn.height = '34px';
    resetBtn.color = '#C2FFE2';
    resetBtn.cornerRadius = 4;
    resetBtn.background = 'rgba(22,48,44,0.95)';
    resetBtn.thickness = 1;
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    resetBtn.left = '0px';
    resetBtn.isPointerBlocker = true;
    resetBtn.isHitTestVisible = true;
    resetBtn.zIndex = 130;
    this.bindButtonAction(resetBtn, () => {
      this.awaitingRebind = null;
      GameSettingsStore.resetToDefaults();
    });
    actionRow.addControl(resetBtn);

    this.captureHintText = UIFactory.createText('settingsCaptureHint', '', 12, UITheme.colors.textDim);
    this.captureHintText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.captureHintText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.captureHintText.top = '-185px';
    windowPanel.addControl(this.captureHintText);

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

    this.addGameplaySection(content);
    this.addAudioSection(content);
    this.addAccessibilitySection(content);
  }

  private addGameplaySection(parent: StackPanel): void {
    parent.addControl(this.makeSectionHeader('GAMEPLAY'));

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
      'Walls become transparent when hiding the player.',
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
      'How many next rooms are preloaded ahead of the current room.',
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

    parent.addControl(this.makeSectionHeader('CONTROLS'));

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

    if (!import.meta.env.PROD) {
      parent.addControl(this.makeActionRow(
        'Automated Benchmark',
        'Runs a repeatable autoplay benchmark and copies full metrics to clipboard.',
        'RUN BENCHMARK',
        () => {
          this.awaitingRebind = null;
          this.hidePanels();
          this.onBenchmarkRequested();
        }
      ));
    }
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

    if (!import.meta.env.PROD) {
      parent.addControl(this.makeToggleRow(
        'Enable Developer Mode (Local Only)',
        'Shows development tools, cheats, and performance metrics.',
        (checkbox) => {
          this.devModeCheckbox = checkbox;
          checkbox.onIsCheckedChangedObservable.add((isChecked) => {
            if (this.isRefreshingUi) return;
            GameSettingsStore.updateAccessibility({ devModeEnabled: !!isChecked });
          });
        }
      ));
    }

    // RESET CODEX PROGRESSION — at the very bottom of settings
    const resetProgressBtn = Button.CreateSimpleButton('settingsResetProgressButton', 'RESET CODEX PROGRESSION');
    resetProgressBtn.width = '280px';
    resetProgressBtn.height = '34px';
    resetProgressBtn.color = '#FFE5E5';
    resetProgressBtn.cornerRadius = 4;
    resetProgressBtn.background = 'rgba(72,20,20,0.95)';
    resetProgressBtn.thickness = 1;
    resetProgressBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    resetProgressBtn.isPointerBlocker = true;
    resetProgressBtn.isHitTestVisible = true;
    this.bindButtonAction(resetProgressBtn, () => {
      this.awaitingRebind = null;
      this.eventBus.emit(GameEvents.CODEX_PROGRESS_RESET_REQUESTED);
    });
    parent.addControl(resetProgressBtn);
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

    const slider = UIFactory.createSlider(`audioSlider_${channel}`, 0, 100, 100);
    slider.width = '520px';
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

    const slider = UIFactory.createSlider(`graphicsNumberSlider_${title.replace(/\s+/g, '_')}`, min, max, min);
    slider.width = '520px';
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
        ? `Capturing: ${this.getActionDisplayName(this.awaitingRebind)}  (ESC to cancel)`
        : '';
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

    if (this.wallOcclusionCheckbox) {
      this.wallOcclusionCheckbox.isChecked = this.settingsSnapshot.graphics.wallOcclusionTransparency;
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

    if (this.devModeCheckbox) {
      this.devModeCheckbox.isChecked = this.settingsSnapshot.accessibility.devModeEnabled;
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
    const button = UIFactory.createTerminalButton(id, label, '220px', '46px');
    button.top = `${top}px`;
    button.zIndex = 50;
    button.isPointerBlocker = true;
    button.isHitTestVisible = true;
    button.hoverCursor = 'pointer';
    // Inject glitch effects: tear bar + ghost text + click flicker with 220ms delay
    DaemonGlitchFx.inject(button, label, onClick, 220);
    return button;
  }

  private bindButtonAction(button: Button, onAction: () => void): void {
    button.isPointerBlocker = true;
    button.isHitTestVisible = true;
    button.hoverCursor = 'pointer';
    button.onPointerClickObservable.add(onAction);
  }

  private openSettingsOverlay(): void {
    if (this.settingsOverlay) {
      this.settingsOverlay.isVisible = true;
    }
    if (this.menuPanel) {
      this.menuPanel.isVisible = false;
    }
    this.eventBus.emit(GameEvents.UI_SETTINGS_OPENED);
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
