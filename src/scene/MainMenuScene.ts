import { Scene, Engine, FreeCamera, Vector3, Color4 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Button,
  Checkbox,
  Control,
  Rectangle,
  Ellipse,
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
import { createMenuMatrixBackground } from './MenuMatrixBackground';
import { applyResponsiveGuiScaling, computeLayoutScale, DESIGN_HEIGHT, DESIGN_WIDTH } from '../ui/GuiScaling';

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
  private layoutWidth = 1280;
  private layoutHeight = 720;
  private isMobileLayout = false;
  private menuButtonWidth = 320;
  private menuButtonHeight = 56;
  private menuButtonFontSize = 18;

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
  private resetProgressConfirmOverlay: Rectangle | null = null;

  private awaitingRebind: KeybindingAction | null = null;
  private readonly eventBus: EventBus = EventBus.getInstance();
  private achievementToast: Rectangle | null = null;
  private achievementToastGlowOuter: Rectangle | null = null;
  private achievementToastGlowInner: Rectangle | null = null;
  private achievementToastGlowShimmerA: Rectangle | null = null;
  private achievementToastAccentTop: Rectangle | null = null;
  private achievementToastAccentSide: Rectangle | null = null;
  private achievementToastInnerCircleA: Ellipse | null = null;
  private achievementToastInnerCircleB: Ellipse | null = null;
  private achievementToastInnerCircleABaseLeft: number = 0;
  private achievementToastInnerCircleABaseTop: number = 0;
  private achievementToastInnerCircleBBaseLeft: number = 0;
  private achievementToastInnerCircleBBaseTop: number = 0;
  private achievementToastTitle: TextBlock | null = null;
  private achievementToastDescription: TextBlock | null = null;
  private achievementToastTimer: number = 0;
  private achievementToastPulseTime: number = 0;
  private achievementTitleBaseText: string = '';
  private achievementTitleMarqueeEnabled: boolean = false;
  private achievementTitleMarqueeIndex: number = 0;
  private achievementTitleMarqueeTimer: number = 0;
  private achievementTitleMarqueeWindowChars: number = 0;
  private achievementTitleMarqueeHold: number = 0;
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

    createMenuMatrixBackground(this.scene);

    const camera = new FreeCamera('mainMenuCamera', new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    this.scene.activeCamera = camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('MainMenuUI', true, this.scene);
    applyResponsiveGuiScaling(this.gui, this.engine);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    const idealWidth = this.gui.idealWidth || DESIGN_WIDTH;
    const idealHeight = this.gui.idealHeight || DESIGN_HEIGHT;
    this.isMobileLayout = idealWidth <= 960;
    this.layoutWidth = Math.round(idealWidth);
    this.layoutHeight = Math.round(idealHeight);

    this.mainLayoutContainer = new Rectangle('mainLayout');
    this.mainLayoutContainer.width = 1;
    this.mainLayoutContainer.height = 1;
    this.mainLayoutContainer.thickness = 0;
    this.mainLayoutContainer.background = 'transparent';
    this.mainLayoutContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.mainLayoutContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.gui.addControl(this.mainLayoutContainer);

    const updateScale = () => {
      this.mainLayoutContainer.scaleX = 1;
      this.mainLayoutContainer.scaleY = 1;
    };
    this.resizeObserver = this.engine.onResizeObservable.add(updateScale);
    // Re-apply GUI scale settings on orientation/size change
    this.engine.onResizeObservable.add(() => applyResponsiveGuiScaling(this.gui, this.engine));
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
    const compact = this.isMobileLayout || this.layoutWidth < 980;
    const width = compact ? 420 : 500;
    const height = compact ? 122 : 132;
    const icon = compact ? 82 : 92;
    const titleFont = compact ? 20 : 23;
    const descFont = compact ? 16 : 18;
    const textLeft = compact ? 112 : 124;
    const textWidth = compact ? 294 : 360;

    const toast = new Rectangle('menuAchievementToast');
    toast.width = `${width}px`;
    toast.height = `${height}px`;
    toast.thickness = 3;
    toast.color = '#FF84CA';
    toast.background = 'rgba(8, 14, 24, 0.94)';
    toast.left = 16;
    toast.top = 22;
    toast.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toast.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    toast.isPointerBlocker = false;
    toast.isVisible = false;
    toast.zIndex = 9000;
    this.mainLayoutContainer.addControl(toast);
    this.achievementToast = toast;

    this.achievementToastGlowOuter = new Rectangle('menuAchievementToastGlowOuter');
    this.achievementToastGlowOuter.width = `${width + 20}px`;
    this.achievementToastGlowOuter.height = `${height + 20}px`;
    this.achievementToastGlowOuter.thickness = 6;
    this.achievementToastGlowOuter.color = '#FF84CA';
    this.achievementToastGlowOuter.background = 'rgba(0,0,0,0)';
    this.achievementToastGlowOuter.left = 6;
    this.achievementToastGlowOuter.top = 12;
    this.achievementToastGlowOuter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastGlowOuter.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastGlowOuter.isVisible = false;
    this.achievementToastGlowOuter.isPointerBlocker = false;
    this.achievementToastGlowOuter.alpha = 0.4;
    this.achievementToastGlowOuter.zIndex = 8988;
    this.mainLayoutContainer.addControl(this.achievementToastGlowOuter);

    this.achievementToastGlowInner = new Rectangle('menuAchievementToastGlowInner');
    this.achievementToastGlowInner.width = `${width + 4}px`;
    this.achievementToastGlowInner.height = `${height + 4}px`;
    this.achievementToastGlowInner.thickness = 2;
    this.achievementToastGlowInner.color = '#FF9AB0';
    this.achievementToastGlowInner.background = 'rgba(0,0,0,0)';
    this.achievementToastGlowInner.left = 14;
    this.achievementToastGlowInner.top = 20;
    this.achievementToastGlowInner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastGlowInner.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastGlowInner.isVisible = false;
    this.achievementToastGlowInner.isPointerBlocker = false;
    this.achievementToastGlowInner.alpha = 0.5;
    this.achievementToastGlowInner.zIndex = 8990;
    this.mainLayoutContainer.addControl(this.achievementToastGlowInner);

    this.achievementToastGlowShimmerA = new Rectangle('menuAchievementToastGlowShimmerA');
    this.achievementToastGlowShimmerA.width = `${width + 34}px`;
    this.achievementToastGlowShimmerA.height = `${height + 34}px`;
    this.achievementToastGlowShimmerA.thickness = 10;
    this.achievementToastGlowShimmerA.color = '#FBA3FF';
    this.achievementToastGlowShimmerA.background = 'rgba(0,0,0,0)';
    this.achievementToastGlowShimmerA.left = -1;
    this.achievementToastGlowShimmerA.top = 5;
    this.achievementToastGlowShimmerA.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastGlowShimmerA.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastGlowShimmerA.isVisible = false;
    this.achievementToastGlowShimmerA.isPointerBlocker = false;
    this.achievementToastGlowShimmerA.alpha = 0.12;
    this.achievementToastGlowShimmerA.zIndex = 8986;
    this.mainLayoutContainer.addControl(this.achievementToastGlowShimmerA);

    this.achievementToastAccentTop = new Rectangle('menuAchievementToastAccentTop');
    this.achievementToastAccentTop.width = `${width}px`;
    this.achievementToastAccentTop.height = '5px';
    this.achievementToastAccentTop.thickness = 0;
    this.achievementToastAccentTop.background = '#FF84CA';
    this.achievementToastAccentTop.left = 16;
    this.achievementToastAccentTop.top = 19;
    this.achievementToastAccentTop.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastAccentTop.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastAccentTop.isVisible = false;
    this.achievementToastAccentTop.isPointerBlocker = false;
    this.achievementToastAccentTop.alpha = 0.8;
    this.achievementToastAccentTop.zIndex = 8996;
    this.mainLayoutContainer.addControl(this.achievementToastAccentTop);

    this.achievementToastAccentSide = new Rectangle('menuAchievementToastAccentSide');
    this.achievementToastAccentSide.width = '6px';
    this.achievementToastAccentSide.height = `${height}px`;
    this.achievementToastAccentSide.thickness = 0;
    this.achievementToastAccentSide.background = '#B98BFF';
    this.achievementToastAccentSide.left = 12;
    this.achievementToastAccentSide.top = 22;
    this.achievementToastAccentSide.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementToastAccentSide.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.achievementToastAccentSide.isVisible = false;
    this.achievementToastAccentSide.isPointerBlocker = false;
    this.achievementToastAccentSide.alpha = 0.74;
    this.achievementToastAccentSide.zIndex = 8996;
    this.mainLayoutContainer.addControl(this.achievementToastAccentSide);

    this.achievementToastInnerCircleA = new Ellipse('menuAchievementToastInnerCircleA');
    this.achievementToastInnerCircleA.width = `${Math.round(height * 2)}px`;
    this.achievementToastInnerCircleA.height = `${Math.round(height * 2)}px`;
    this.achievementToastInnerCircleABaseLeft = Math.round(width * 0.46);
    this.achievementToastInnerCircleABaseTop = Math.round(-height * 0.52);
    this.achievementToastInnerCircleA.left = `${this.achievementToastInnerCircleABaseLeft}px`;
    this.achievementToastInnerCircleA.top = `${this.achievementToastInnerCircleABaseTop}px`;
    this.achievementToastInnerCircleA.thickness = 2;
    this.achievementToastInnerCircleA.color = '#FF9ECD';
    this.achievementToastInnerCircleA.background = 'rgba(255,215,245,0.09)';
    this.achievementToastInnerCircleA.alpha = 0.22;
    this.achievementToastInnerCircleA.isPointerBlocker = false;
    toast.addControl(this.achievementToastInnerCircleA);

    this.achievementToastInnerCircleB = new Ellipse('menuAchievementToastInnerCircleB');
    this.achievementToastInnerCircleB.width = `${Math.round(height * 1.4)}px`;
    this.achievementToastInnerCircleB.height = `${Math.round(height * 1.4)}px`;
    this.achievementToastInnerCircleBBaseLeft = Math.round(width * 0.62);
    this.achievementToastInnerCircleBBaseTop = Math.round(-height * 0.24);
    this.achievementToastInnerCircleB.left = `${this.achievementToastInnerCircleBBaseLeft}px`;
    this.achievementToastInnerCircleB.top = `${this.achievementToastInnerCircleBBaseTop}px`;
    this.achievementToastInnerCircleB.thickness = 1;
    this.achievementToastInnerCircleB.color = '#82D5FF';
    this.achievementToastInnerCircleB.background = 'rgba(196,229,255,0.07)';
    this.achievementToastInnerCircleB.alpha = 0.2;
    this.achievementToastInnerCircleB.isPointerBlocker = false;
    toast.addControl(this.achievementToastInnerCircleB);

    const title = new TextBlock('menuAchievementToastTitle');
    title.text = 'ACHIEVEMENT UNLOCKED';
    title.color = '#7CFFEA';
    title.fontFamily = 'Consolas';
    title.fontSize = titleFont;
    title.left = textLeft;
    title.top = 14;
    title.width = `${textWidth}px`;
    title.height = compact ? '56px' : '54px';
    title.textWrapping = true;
    title.lineSpacing = '2px';
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toast.addControl(title);
    this.achievementToastTitle = title;

    const description = new TextBlock('menuAchievementToastDescription');
    description.text = '';
    description.color = '#CFFCF3';
    description.fontFamily = 'Consolas';
    description.fontSize = descFont;
    description.left = textLeft;
    description.top = 55;
    description.width = `${textWidth}px`;
    description.height = '64px';
    description.textWrapping = true;
    description.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    description.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    description.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    toast.addControl(description);
    this.achievementToastDescription = description;

    this.achievementIconPlaceholder = new Rectangle('menuAchievementToastIcon');
    this.achievementIconPlaceholder.width = `${icon}px`;
    this.achievementIconPlaceholder.height = `${icon}px`;
    this.achievementIconPlaceholder.thickness = 2;
    this.achievementIconPlaceholder.color = '#5FFFE0';
    this.achievementIconPlaceholder.background = 'rgba(18, 44, 51, 0.9)';
    this.achievementIconPlaceholder.left = 18;
    this.achievementIconPlaceholder.top = 20;
    this.achievementIconPlaceholder.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.achievementIconPlaceholder.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    toast.addControl(this.achievementIconPlaceholder);

    const achievementIconText = new TextBlock('menuAchievementToastIconText');
    achievementIconText.text = '?';
    achievementIconText.fontFamily = 'Consolas';
    achievementIconText.fontSize = 32;
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
      this.achievementTitleBaseText = `UNLOCKED: ${HUDManager.currentAchievement.name}`;
      this.achievementToastTitle.text = this.achievementTitleBaseText;
      const fontSize = this.computeAchievementToastTitleSize(HUDManager.currentAchievement.name);
      this.achievementToastTitle.fontSize = fontSize;
      this.configureAchievementTitleMarquee(fontSize);
    }
    if (this.achievementToastDescription) {
      this.achievementToastDescription.text = HUDManager.currentAchievement.description;
      this.achievementToastDescription.fontSize = this.computeAchievementToastDescriptionSize(HUDManager.currentAchievement.description);
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
      this.achievementToastArtwork.width = this.achievementIconPlaceholder.width;
      this.achievementToastArtwork.height = this.achievementIconPlaceholder.height;
      this.achievementToastArtwork.stretch = Image.STRETCH_UNIFORM;
      this.achievementIconPlaceholder.addControl(this.achievementToastArtwork);
    }

    HUDManager.achievementToastActive = true;
    this.achievementToastTimer = 4;
    this.achievementToastPulseTime = 0;
    this.achievementTitleMarqueeEnabled = false;
    this.achievementTitleMarqueeIndex = 0;
    this.achievementTitleMarqueeTimer = 0;
    this.achievementTitleMarqueeWindowChars = 0;
    this.achievementTitleMarqueeHold = 0.5;
    this.achievementToast.alpha = 1;
    this.achievementToast.isVisible = true;
    if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.isVisible = true;
    if (this.achievementToastGlowInner) this.achievementToastGlowInner.isVisible = true;
    if (this.achievementToastGlowShimmerA) this.achievementToastGlowShimmerA.isVisible = true;
    if (this.achievementToastAccentTop) this.achievementToastAccentTop.isVisible = true;
    if (this.achievementToastAccentSide) this.achievementToastAccentSide.isVisible = true;
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
    this.achievementToastPulseTime += Math.max(0, deltaTime);
    // Marquee disabled: static wrapped title for better reliability.
    const pulse = 0.5 + Math.sin(this.achievementToastPulseTime * 8) * 0.5;
    const shouldShake = this.achievementToastPulseTime < 1.0;
    const jitterX = shouldShake ? Math.sin(this.achievementToastPulseTime * 10.5) * 0.22 : 0;
    const jitterY = shouldShake ? Math.cos(this.achievementToastPulseTime * 8.6) * 0.18 : 0;
    const color = this.getEpicToastColor(this.achievementToastPulseTime * 0.9);
    this.achievementToast.color = color;
    this.achievementToast.left = 16 + jitterX;
    this.achievementToast.top = 22 + jitterY;
    if (this.achievementToastGlowOuter) {
      this.achievementToastGlowOuter.color = color;
      this.achievementToastGlowOuter.left = 6 + jitterX;
      this.achievementToastGlowOuter.top = 12 + jitterY;
      this.achievementToastGlowOuter.alpha = 0.36 + pulse * 0.3;
    }
    if (this.achievementToastGlowInner) {
      this.achievementToastGlowInner.color = color;
      this.achievementToastGlowInner.left = 14 + jitterX;
      this.achievementToastGlowInner.top = 20 + jitterY;
      this.achievementToastGlowInner.alpha = 0.45 + pulse * 0.24;
    }
    if (this.achievementToastGlowShimmerA) {
      this.achievementToastGlowShimmerA.color = this.getEpicToastColor(this.achievementToastPulseTime * 0.95 + 0.7);
      this.achievementToastGlowShimmerA.left = -1 + jitterX;
      this.achievementToastGlowShimmerA.top = 5 + jitterY;
      this.achievementToastGlowShimmerA.alpha = 0.12 + pulse * 0.12;
    }
    if (this.achievementToastAccentTop) {
      this.achievementToastAccentTop.background = color;
      this.achievementToastAccentTop.left = 16 + jitterX;
      this.achievementToastAccentTop.top = 19 + jitterY;
      this.achievementToastAccentTop.alpha = 0.54 + pulse * 0.24;
    }
    if (this.achievementToastAccentSide) {
      this.achievementToastAccentSide.background = color;
      this.achievementToastAccentSide.left = 12 + jitterX;
      this.achievementToastAccentSide.top = 22 + jitterY;
      this.achievementToastAccentSide.alpha = 0.48 + pulse * 0.22;
    }
    if (this.achievementToastInnerCircleA) {
      this.achievementToastInnerCircleA.alpha = 0.20 + pulse * 0.10;
      this.achievementToastInnerCircleA.color = this.getEpicToastColor(this.achievementToastPulseTime * 0.55 + 0.4);
      const leftSweep = (this.achievementToastPulseTime * 24) % 96;
      this.achievementToastInnerCircleA.left = `${this.achievementToastInnerCircleABaseLeft - leftSweep + Math.sin(this.achievementToastPulseTime * 0.9) * 7}px`;
      this.achievementToastInnerCircleA.top = `${this.achievementToastInnerCircleABaseTop + Math.cos(this.achievementToastPulseTime * 0.7) * 5}px`;
    }
    if (this.achievementToastInnerCircleB) {
      this.achievementToastInnerCircleB.alpha = 0.17 + pulse * 0.08;
      this.achievementToastInnerCircleB.color = this.getEpicToastColor(this.achievementToastPulseTime * 0.55 + 1.2);
      const leftSweep = (this.achievementToastPulseTime * 28) % 112;
      this.achievementToastInnerCircleB.left = `${this.achievementToastInnerCircleBBaseLeft - leftSweep + Math.cos(this.achievementToastPulseTime * 0.76) * 6}px`;
      this.achievementToastInnerCircleB.top = `${this.achievementToastInnerCircleBBaseTop + Math.sin(this.achievementToastPulseTime * 0.88) * 4}px`;
    }
    if (this.achievementToastTimer <= 0) {
      this.achievementToast.isVisible = false;
      this.achievementToast.alpha = 1;
      if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.isVisible = false;
      if (this.achievementToastGlowInner) this.achievementToastGlowInner.isVisible = false;
      if (this.achievementToastGlowShimmerA) this.achievementToastGlowShimmerA.isVisible = false;
      if (this.achievementToastAccentTop) this.achievementToastAccentTop.isVisible = false;
      if (this.achievementToastAccentSide) this.achievementToastAccentSide.isVisible = false;
      HUDManager.achievementToastActive = false;
      HUDManager.currentAchievement = null;
      if (HUDManager.achievementToastQueue.length > 0) {
        this.showNextAchievementToast();
      }
      return;
    }

    if (this.achievementToastTimer < 0.35) {
      const fade = Math.max(0, this.achievementToastTimer / 0.35);
      this.achievementToast.alpha = fade;
      if (this.achievementToastGlowOuter) this.achievementToastGlowOuter.alpha *= fade;
      if (this.achievementToastGlowInner) this.achievementToastGlowInner.alpha *= fade;
      if (this.achievementToastGlowShimmerA) this.achievementToastGlowShimmerA.alpha *= fade;
      if (this.achievementToastAccentTop) this.achievementToastAccentTop.alpha *= fade;
      if (this.achievementToastAccentSide) this.achievementToastAccentSide.alpha *= fade;
      if (this.achievementToastInnerCircleA) this.achievementToastInnerCircleA.alpha *= fade;
      if (this.achievementToastInnerCircleB) this.achievementToastInnerCircleB.alpha *= fade;
    }
  }

  private computeAchievementToastTitleSize(title: string): number {
    const len = (title || '').trim().length;
    const base = this.isMobileLayout || this.layoutWidth < 980 ? 20 : 23;
    if (len > 70) return base - 7;
    if (len > 58) return base - 6;
    if (len > 50) return base - 5;
    if (len > 46) return base - 4;
    if (len > 34) return base - 2;
    return base;
  }

  private computeAchievementToastDescriptionSize(description: string): number {
    const len = (description || '').trim().length;
    const base = this.isMobileLayout || this.layoutWidth < 980 ? 16 : 18;
    if (len > 125) return base - 3;
    if (len > 92) return base - 2;
    if (len > 66) return base - 1;
    return base;
  }

  private configureAchievementTitleMarquee(fontSize: number): void {
    if (!this.achievementToastTitle || !this.achievementToast) return;
    const text = (this.achievementTitleBaseText || '').trim();
    if (!text) {
      this.achievementTitleMarqueeEnabled = false;
      this.achievementToastTitle.text = '';
      return;
    }

    // Disabled by design: use static wrapping instead of marquee.
    void fontSize;
    this.achievementTitleMarqueeEnabled = false;
    this.achievementTitleMarqueeIndex = 0;
    this.achievementTitleMarqueeTimer = 0;
    this.achievementTitleMarqueeWindowChars = 0;
    this.achievementToastTitle.text = text;
  }

  private estimateAchievementTitleWidthPx(text: string, fontSize: number): number {
    if (!text) return 0;
    const base = fontSize * 0.6;
    let width = 0;
    for (const char of text) {
      if (char === ' ') width += base * 0.4;
      else if ('ilI|.,:;!'.includes(char)) width += base * 0.42;
      else if ('mwMW@#%&'.includes(char)) width += base * 1.22;
      else width += base;
    }
    return width;
  }

  private updateAchievementTitleMarquee(deltaTime: number): void {
    if (!this.achievementTitleMarqueeEnabled || !this.achievementToastTitle) return;
    const text = (this.achievementTitleBaseText || '').trim();
    if (!text) return;

    if (this.achievementTitleMarqueeHold > 0) {
      this.achievementTitleMarqueeHold = Math.max(0, this.achievementTitleMarqueeHold - deltaTime);
      return;
    }

    this.achievementTitleMarqueeTimer += Math.max(0, deltaTime);
    const stepSeconds = 0.12;
    if (this.achievementTitleMarqueeTimer < stepSeconds) return;
    this.achievementTitleMarqueeTimer = 0;

    const maxStart = Math.max(0, text.length - Math.max(1, this.achievementTitleMarqueeWindowChars));
    if (this.achievementTitleMarqueeIndex < maxStart) {
      this.achievementTitleMarqueeIndex += 1;
    } else {
      this.achievementTitleMarqueeEnabled = false;
    }
    this.renderAchievementTitleMarqueeWindow();
  }

  private renderAchievementTitleMarqueeWindow(): void {
    if (!this.achievementToastTitle) return;
    const text = (this.achievementTitleBaseText || '').trim();
    const windowChars = Math.max(8, this.achievementTitleMarqueeWindowChars || 8);
    if (!this.achievementTitleMarqueeEnabled || text.length <= windowChars) {
      this.achievementToastTitle.text = text;
      return;
    }

    const start = this.achievementTitleMarqueeIndex;
    const segment = text.slice(start, start + windowChars);
    this.achievementToastTitle.text = segment;
  }

  private getEpicToastColor(phase: number): string {
    const colors = ['#FF7BCF', '#FF9AB0', '#B98BFF', '#72C9FF', '#FF7BCF'];
    const wrapped = ((phase % (colors.length - 1)) + (colors.length - 1)) % (colors.length - 1);
    const idx = Math.floor(wrapped);
    const t = wrapped - idx;
    return this.lerpHexColor(colors[idx], colors[idx + 1], t);
  }

  private lerpHexColor(a: string, b: string, t: number): string {
    const parse = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
    const ar = parse(a, 1), ag = parse(a, 3), ab = parse(a, 5);
    const br = parse(b, 1), bg = parse(b, 3), bb = parse(b, 5);
    const rr = Math.round(ar + (br - ar) * t).toString(16).padStart(2, '0');
    const rg = Math.round(ag + (bg - ag) * t).toString(16).padStart(2, '0');
    const rb = Math.round(ab + (bb - ab) * t).toString(16).padStart(2, '0');
    return `#${rr}${rg}${rb}`;
  }

  private createMainButtons(): void {
    const titleContainer = new Rectangle('titleContainer');
    titleContainer.thickness = 0;
    titleContainer.width = '1200px';
    titleContainer.height = '120px';
    titleContainer.top = `-${Math.round(this.layoutHeight * 0.44)}px`;
    titleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.mainLayoutContainer.addControl(titleContainer);

    const titlePart1 = UIFactory.createText('menuTitle1', 'DAEMON', 72, UITheme.colors.textHighlight);
    titlePart1.fontFamily = 'Wonder8Bit';
    titlePart1.textWrapping = false;
    titlePart1.width = '500px';
    titlePart1.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titlePart1.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titleContainer.addControl(titlePart1);

    const daemonFrames: Image[] = [];
    for (let i = 1; i <= 4; i++) {
      const frame = new Image(`daemonAvatar${i}`, buildHudAssetUrl(`avatar_frames_cutout2/rire_0${i}.png`));
      frame.width = '100px';
      frame.height = '100px';
      frame.stretch = Image.STRETCH_UNIFORM;
      frame.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      frame.isVisible = (i === 1);
      titleContainer.addControl(frame);
      daemonFrames.push(frame);
    }

    const titlePart2 = UIFactory.createText('menuTitle2', 'DUNGEON', 72, UITheme.colors.textHighlight);
    titlePart2.fontFamily = 'Wonder8Bit';
    titlePart2.textWrapping = false;
    titlePart2.width = '500px';
    titlePart2.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titlePart2.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleContainer.addControl(titlePart2);

    // Title flicker animation — slow oscillation between highlight colors
    this.scene.onBeforeRenderObservable.add(() => {
      this.titleFlickerTime += this.scene.getEngine().getDeltaTime();
      const t = this.titleFlickerTime;

      // Daemon laugh animation (~10 fps)
      const currentFrame = Math.floor(t / 100) % 4;
      for (let i = 0; i < 4; i++) {
        daemonFrames[i].isVisible = (i === currentFrame);
      }

      // Slow pulse: green -> cyan -> white, very subtle, period ~6s
      const phase = (t * 0.001) % (Math.PI * 2);
      const pulse = Math.sin(phase);
      let newColor = '';
      if (pulse > 0.7) {
        newColor = '#FFFFFF';
      } else if (pulse > 0.2) {
        newColor = UITheme.colors.borderBright; // cyan
      } else {
        newColor = UITheme.colors.textHighlight; // green
      }
      // Occasional fast flicker — 1-2 frames, ~every 8s
      if (Math.random() < 0.0004) {
        newColor = '#CC00FF'; // daemon magenta flash
      }
      titlePart1.color = newColor;
      titlePart2.color = newColor;
    });

    const subtitle = UIFactory.createText('menuSubtitle', 'SYSTEM READY // MAIN CONSOLE', 20, UITheme.colors.borderBright);
    subtitle.top = `-${Math.round(this.layoutHeight * 0.36)}px`;
    subtitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.mainLayoutContainer.addControl(subtitle);

    const panelWidth = Math.round(Math.min(760, Math.max(560, this.layoutWidth * 0.58)));
    const panelHeight = Math.round(Math.min(720, Math.max(560, this.layoutHeight * 0.78)));
    const buttonStep = Math.round((panelHeight / 7) * 0.9);
    this.menuButtonWidth = Math.round(panelWidth * 0.62);
    this.menuButtonHeight = Math.round(Math.max(56, panelHeight * 0.1));
    this.menuButtonFontSize = this.isMobileLayout ? 20 : 21;

    const panel = UIFactory.createPanel('menuPanel', panelWidth, panelHeight);
    panel.top = `${Math.round(this.layoutHeight * 0.05)}px`;
    this.mainLayoutContainer.addControl(panel);
    this.menuPanel = panel;

    const topOffsets = [-3, -2, -1, 0, 1, 2, 3].map((mult) => Math.round(mult * buttonStep));

    const playBtn = this.makeActionButton('menuPlay', 'START RUN', topOffsets[0], () => {
      this.hidePanels();
      this.onPlayRequested();
    });
    panel.addControl(playBtn);

    const tutorialBtn = this.makeActionButton('menuTutorial', 'TUTORIAL', topOffsets[1], () => {
      this.hidePanels();
      this.onTutorialRequested();
    });
    panel.addControl(tutorialBtn);

    const codexBtn = this.makeActionButton('menuCodex', 'CODEX', topOffsets[2], () => {
      this.hidePanels();
      this.onCodexRequested();
    });
    panel.addControl(codexBtn);

    const achievementsBtn = this.makeActionButton('menuAchievements', 'ACHIEVEMENTS', topOffsets[3], () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.ACHIEVEMENTS_OPEN_REQUESTED);
    });
    panel.addControl(achievementsBtn);

    const highscoresBtn = this.makeActionButton('menuHighscores', 'HIGHSCORES', topOffsets[4], () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.HIGHSCORES_OPEN_REQUESTED);
    });
    panel.addControl(highscoresBtn);

    const settingsBtn = this.makeActionButton('menuSettings', 'SETTINGS', topOffsets[5], () => {
      this.openSettingsOverlay();
    });
    panel.addControl(settingsBtn);

    const creditsBtn = this.makeActionButton('menuCredits', 'CREDITS', topOffsets[6], () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.CREDITS_OPEN_REQUESTED);
    });
    panel.addControl(creditsBtn);

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

    const windowWidth = Math.round(this.layoutWidth * 0.9);
    const windowHeight = Math.round(this.layoutHeight * 0.92);
    const windowPanel = UIFactory.createPanel('settingsWindow', windowWidth, windowHeight);
    overlay.addControl(windowPanel);

    const title = new TextBlock('settingsTitle');
    title.text = 'SETTINGS CONSOLE';
    title.color = '#7CFFEA';
    title.fontSize = 34;
    title.fontFamily = UITheme.fonts.primary;
    title.top = `-${Math.round(windowHeight * 0.45)}px`;
    windowPanel.addControl(title);



    const actionRow = new Rectangle('settingsActionRow');
    actionRow.width = `${Math.round(windowWidth - 40)}px`;
    actionRow.height = '44px';
    actionRow.thickness = 0;
    actionRow.top = `-${Math.round(windowHeight * 0.37)}px`;
    actionRow.isPointerBlocker = true;
    actionRow.zIndex = 120;
    windowPanel.addControl(actionRow);

    const closeBtn = Button.CreateSimpleButton('settingsCloseButton', 'BACK');
    closeBtn.width = '160px';
    closeBtn.height = '38px';
    closeBtn.color = '#D2FFF2';
    closeBtn.cornerRadius = 4;
    closeBtn.background = 'rgba(20,38,45,0.95)';
    closeBtn.thickness = 1;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    closeBtn.left = '0px';
    closeBtn.isPointerBlocker = true;
    closeBtn.isHitTestVisible = true;
    closeBtn.zIndex = 130;
    if (closeBtn.textBlock) closeBtn.textBlock.fontSize = 18;
    this.bindButtonAction(closeBtn, () => {
      this.awaitingRebind = null;
      this.closeSettingsOverlay();
    });
    actionRow.addControl(closeBtn);

    const resetBtn = Button.CreateSimpleButton('settingsResetButton', 'RESET DEFAULTS');
    resetBtn.width = '220px';
    resetBtn.height = '38px';
    resetBtn.color = '#C2FFE2';
    resetBtn.cornerRadius = 4;
    resetBtn.background = 'rgba(22,48,44,0.95)';
    resetBtn.thickness = 1;
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    resetBtn.left = '0px';
    resetBtn.isPointerBlocker = true;
    resetBtn.isHitTestVisible = true;
    resetBtn.zIndex = 130;
    if (resetBtn.textBlock) resetBtn.textBlock.fontSize = 18;
    this.bindButtonAction(resetBtn, () => {
      this.awaitingRebind = null;
      GameSettingsStore.resetToDefaults();
    });
    actionRow.addControl(resetBtn);

    this.captureHintText = UIFactory.createText('settingsCaptureHint', '', 12, UITheme.colors.textDim);
    this.captureHintText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.captureHintText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.captureHintText.top = `-${Math.round(windowHeight * 0.31)}px`;
    windowPanel.addControl(this.captureHintText);

    const scroll = UIFactory.createScrollViewer('settingsScroll');
    scroll.width = `${Math.round(windowWidth - 40)}px`;
    scroll.height = `${Math.round(windowHeight * 0.76)}px`;
    scroll.top = `${Math.round(windowHeight * 0.07)}px`;
    windowPanel.addControl(scroll);

    const content = new StackPanel('settingsStack');
    content.isVertical = true;
    content.spacing = 8;
    content.width = 1;
    scroll.addControl(content);

    this.addGameplaySection(content);
    this.addAudioSection(content);
    this.addAccessibilitySection(content);
    this.createResetProgressConfirmOverlay(overlay);
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
    row.width = '1020px';
    row.height = '68px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const label = new TextBlock('accessibilityFilterLabel');
    label.text = 'Color Vision Filter';
    label.color = '#B9F9E8';
    label.fontSize = 18;
    label.fontFamily = UITheme.fonts.primary;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const button = Button.CreateSimpleButton('accessibilityFilterButton', 'NONE');
    button.width = '280px';
    button.height = '38px';
    button.color = '#DAFFF3';
    button.cornerRadius = 4;
    button.background = 'rgba(22,48,44,0.95)';
    button.thickness = 1;
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    button.left = '-10px';
    if (button.textBlock) button.textBlock.fontSize = 16;
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

    // RESET PROGRESSION — at the very bottom of settings
    const resetProgressBtn = Button.CreateSimpleButton('settingsResetProgressButton', 'RESET PROGRESSION');
    resetProgressBtn.width = '340px';
    resetProgressBtn.height = '38px';
    resetProgressBtn.color = '#FFE5E5';
    resetProgressBtn.cornerRadius = 4;
    resetProgressBtn.background = 'rgba(72,20,20,0.95)';
    resetProgressBtn.thickness = 1;
    resetProgressBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    resetProgressBtn.top = '8px';
    resetProgressBtn.isPointerBlocker = true;
    resetProgressBtn.isHitTestVisible = true;
    if (resetProgressBtn.textBlock) resetProgressBtn.textBlock.fontSize = 16;
    this.bindButtonAction(resetProgressBtn, () => {
      this.awaitingRebind = null;
      this.showResetProgressConfirmOverlay();
    });
    parent.addControl(resetProgressBtn);
  }

  private createResetProgressConfirmOverlay(parent: Rectangle): void {
    const overlay = new Rectangle('menuResetProgressConfirmOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.thickness = 0;
    overlay.background = 'rgba(0, 0, 0, 0.75)';
    overlay.isPointerBlocker = true;
    overlay.isVisible = false;
    overlay.zIndex = 2600;
    parent.addControl(overlay);
    this.resetProgressConfirmOverlay = overlay;

    const panel = new Rectangle('menuResetProgressConfirmPanel');
    panel.width = '680px';
    panel.height = '300px';
    panel.cornerRadius = 6;
    panel.thickness = 1;
    panel.color = '#8A3434';
    panel.background = 'rgba(22, 10, 10, 0.96)';
    panel.isPointerBlocker = true;
    overlay.addControl(panel);

    const title = new TextBlock('menuResetProgressConfirmTitle');
    title.text = 'RESET PROGRESSION';
    title.color = '#FFE5E5';
    title.fontSize = 32;
    title.fontFamily = 'Consolas';
    title.top = '-104px';
    panel.addControl(title);

    const body = new TextBlock('menuResetProgressConfirmBody');
    body.text = 'This will reset codex, achievements, settings, and tutorial completion.\nThe game will restart as a first launch.';
    body.color = '#FFD0D0';
    body.fontSize = 18;
    body.fontFamily = 'Consolas';
    body.width = '600px';
    body.height = '110px';
    body.textWrapping = true;
    body.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    body.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    body.top = '-12px';
    panel.addControl(body);

    const buttons = new StackPanel('menuResetProgressConfirmButtons');
    buttons.isVertical = false;
    buttons.spacing = 16;
    buttons.top = '104px';
    panel.addControl(buttons);

    const cancel = Button.CreateSimpleButton('menuResetProgressConfirmCancel', 'CANCEL');
    cancel.width = '220px';
    cancel.height = '48px';
    cancel.color = '#DDFCF3';
    cancel.background = 'rgba(22,48,44,0.95)';
    cancel.thickness = 1;
    cancel.cornerRadius = 4;
    if (cancel.textBlock) cancel.textBlock.fontSize = 18;
    this.bindButtonAction(cancel, () => this.hideResetProgressConfirmOverlay());
    buttons.addControl(cancel);

    const confirm = Button.CreateSimpleButton('menuResetProgressConfirmApply', 'RESET & RESTART');
    confirm.width = '220px';
    confirm.height = '48px';
    confirm.color = '#FFE5E5';
    confirm.background = 'rgba(110,28,28,0.98)';
    confirm.thickness = 1;
    confirm.cornerRadius = 4;
    if (confirm.textBlock) confirm.textBlock.fontSize = 18;
    this.bindButtonAction(confirm, () => {
      this.hideResetProgressConfirmOverlay();
      this.eventBus.emit(GameEvents.CODEX_PROGRESS_RESET_REQUESTED);
    });
    buttons.addControl(confirm);
  }

  private showResetProgressConfirmOverlay(): void {
    if (this.resetProgressConfirmOverlay) this.resetProgressConfirmOverlay.isVisible = true;
  }

  private hideResetProgressConfirmOverlay(): void {
    if (this.resetProgressConfirmOverlay) this.resetProgressConfirmOverlay.isVisible = false;
  }

  private makeSectionHeader(text: string): Rectangle {
    const row = new Rectangle(`sectionHeader_${text.replace(/\s+/g, '_')}`);
    row.width = '1020px';
    row.height = '52px';
    row.thickness = 0;
    row.background = 'rgba(10, 30, 35, 0.6)';

    const title = new TextBlock(`sectionHeaderText_${text.replace(/\s+/g, '_')}`);
    title.text = text;
    title.color = '#7CFFEA';
    title.fontSize = 24;
    title.fontFamily = UITheme.fonts.primary;
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
    info.fontSize = 14;
    info.fontFamily = UITheme.fonts.primary;
    info.height = '28px';
    info.width = '1020px';
    info.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    info.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return info;
  }

  private makeKeybindRow(action: KeybindingAction, labelText: string): Rectangle {
    const row = new Rectangle(`keybindRow_${action}`);
    row.width = '1020px';
    row.height = '60px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const label = new TextBlock(`keybindLabel_${action}`);
    label.text = labelText;
    label.color = '#B9F9E8';
    label.fontSize = 18;
    label.fontFamily = UITheme.fonts.primary;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    row.addControl(label);

    const keyButton = Button.CreateSimpleButton(`keybindButton_${action}`, '...');
    keyButton.width = '260px';
    keyButton.height = '38px';
    keyButton.color = '#E3FFF7';
    keyButton.cornerRadius = 4;
    keyButton.background = 'rgba(22,48,44,0.95)';
    keyButton.thickness = 1;
    keyButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    keyButton.left = '-10px';
    if (keyButton.textBlock) keyButton.textBlock.fontSize = 18;
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
    row.width = '1020px';
    row.height = '84px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`toggleTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 18;
    titleText.fontFamily = UITheme.fonts.primary;
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-14px';
    row.addControl(titleText);

    const detailText = new TextBlock(`toggleDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 13;
    detailText.fontFamily = UITheme.fonts.primary;
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '16px';
    row.addControl(detailText);

    const checkbox = new Checkbox(`toggleCheckbox_${title.replace(/\s+/g, '_')}`);
    checkbox.width = '36px';
    checkbox.height = '36px';
    checkbox.color = '#B9F9E8';
    checkbox.background = '#122D2B';
    checkbox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    checkbox.left = '-24px';
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
    row.width = '1020px';
    row.height = '84px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`actionTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 18;
    titleText.fontFamily = UITheme.fonts.primary;
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-14px';
    row.addControl(titleText);

    const detailText = new TextBlock(`actionDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 13;
    detailText.fontFamily = UITheme.fonts.primary;
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '16px';
    row.addControl(detailText);

    const actionButton = Button.CreateSimpleButton(`actionButton_${title.replace(/\s+/g, '_')}`, buttonLabel);
    actionButton.width = '240px';
    actionButton.height = '38px';
    actionButton.color = '#E3FFF7';
    actionButton.cornerRadius = 4;
    actionButton.background = 'rgba(22,48,44,0.95)';
    actionButton.thickness = 1;
    actionButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    actionButton.left = '-10px';
    if (actionButton.textBlock) actionButton.textBlock.fontSize = 16;
    this.bindButtonAction(actionButton, onAction);
    row.addControl(actionButton);

    return row;
  }

  private makeAudioSliderRow(channel: AudioChannel, labelText: string): Rectangle {
    const row = new Rectangle(`audioRow_${channel}`);
    row.width = '1020px';
    row.height = '68px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const label = new TextBlock(`audioLabel_${channel}`);
    label.text = labelText;
    label.color = '#B9F9E8';
    label.fontSize = 18;
    label.fontFamily = UITheme.fonts.primary;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.paddingLeft = '14px';
    label.top = '-16px';
    row.addControl(label);

    const slider = UIFactory.createSlider(`audioSlider_${channel}`, 0, 100, 100);
    slider.width = '640px';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    slider.left = '12px';
    slider.top = '18px';
    slider.onValueChangedObservable.add((value) => {
      if (this.isRefreshingUi) return;
      const normalized = Math.round(value) / 100;
      GameSettingsStore.updateAudio({ [channel]: normalized } as Partial<AudioSettings>);
    });
    row.addControl(slider);

    const valueText = new TextBlock(`audioValue_${channel}`);
    valueText.text = '100%';
    valueText.color = '#DFFEF6';
    valueText.fontSize = 16;
    valueText.fontFamily = UITheme.fonts.primary;
    valueText.width = '80px';
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    valueText.left = '-12px';
    valueText.top = '18px';
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
    row.width = '1020px';
    row.height = '100px';
    row.thickness = 1;
    row.cornerRadius = 4;
    row.color = '#285148';
    row.background = 'rgba(8, 19, 24, 0.9)';

    const titleText = new TextBlock(`graphicsNumberTitle_${title.replace(/\s+/g, '_')}`);
    titleText.text = title;
    titleText.color = '#B9F9E8';
    titleText.fontSize = 18;
    titleText.fontFamily = UITheme.fonts.primary;
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = '14px';
    titleText.top = '-24px';
    row.addControl(titleText);

    const detailText = new TextBlock(`graphicsNumberDetails_${title.replace(/\s+/g, '_')}`);
    detailText.text = details;
    detailText.color = '#86B9AE';
    detailText.fontSize = 13;
    detailText.fontFamily = UITheme.fonts.primary;
    detailText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    detailText.paddingLeft = '14px';
    detailText.top = '2px';
    row.addControl(detailText);

    const slider = UIFactory.createSlider(`graphicsNumberSlider_${title.replace(/\s+/g, '_')}`, min, max, min);
    slider.width = '640px';
    slider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    slider.left = '12px';
    slider.top = '30px';
    row.addControl(slider);

    const valueText = new TextBlock(`graphicsNumberValue_${title.replace(/\s+/g, '_')}`);
    valueText.text = `${min}`;
    valueText.color = '#DFFEF6';
    valueText.fontSize = 14;
    valueText.fontFamily = UITheme.fonts.primary;
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
    const button = UIFactory.createTerminalButton(id, label, `${this.menuButtonWidth}px`, `${this.menuButtonHeight}px`);
    button.top = `${top}px`;
    if (button.textBlock) {
      button.textBlock.fontSize = this.menuButtonFontSize;
    }
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
