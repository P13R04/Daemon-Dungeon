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
import { BASE_TEXT_SCALE, UITheme } from '../ui/UITheme';
import { DaemonGlitchFx } from '../ui/DaemonGlitchFx';
import { createMenuMatrixBackground } from './MenuMatrixBackground';
import { applyResponsiveGuiScaling, computeLayoutScale, DESIGN_HEIGHT, DESIGN_WIDTH } from '../ui/GuiScaling';
import { AudioManager } from '../audio/AudioManager';
import { playUiSelectClick } from '../audio/UiSelectClick';
import { DAEMON_FOUR_FRAME_PRESET_NAMES, getDaemonAnimationPreset } from '../data/voicelines/DaemonAnimationPresets';

type AudioChannel = keyof AudioSettings;
type BeatPulseSampler = (deltaSeconds: number) => number;

const FILTER_OPTIONS: ColorVisionFilter[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'highContrast'];

const scaleBase = (value: number): number => Math.round(value * BASE_TEXT_SCALE);

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
  private menuBeatSampler: BeatPulseSampler | null = null;
  private menuBeatCooldown = 0;
  private menuBeatWarmup = 1.3;
  private menuBeatChainDungeon = false;
  private menuBeatTargets: Control[] = [];
  private menuBeatDaemonTarget: Control | null = null;
  private menuBeatDungeonTarget: Control | null = null;
  private titlePart1: TextBlock | null = null;
  private titlePart2: TextBlock | null = null;
  private titlePart1Container: Rectangle | null = null;
  private titlePart2Container: Rectangle | null = null;
  private titlePart1OverlayLetters: TextBlock[] = [];
  private titlePart2OverlayLetters: TextBlock[] = [];
  private layoutsCalculated = false;
  private daemonPixelShift = 11;
  private dungeonPixelShift = 0;
  private overlayFontSize = 72;
  private menuBeatFx = new Map<Control, {
    timer: number;
    duration: number;
    jitterSeed: number;
    baseScaleX: number;
    baseScaleY: number;
    baseRotation: number;
    baseColor?: string;
    baseBg?: string;
  }>();
  private menuBeatObserver: any = null;
  private daemonAvatarFrames: Image[] = [];
  private daemonAvatarPresetName: string = 'rire';
  private daemonAvatarFrameTime: number = 0;
  private daemonAvatarFrameIndex: number = 0;
  private daemonAvatarIsPressed = false;
  private daemonCascadeTriggeredThisCycle = false;
  private daemonCascadePopTimer = 0;

  private settingsSnapshot: GameSettings = GameSettingsStore.get();
  private unsubscribeSettings: (() => void) | null = null;
  private isRefreshingUi: boolean = false;

  private keybindButtons: Partial<Record<KeybindingAction, Button>> = {};
  private audioSliders: Partial<Record<AudioChannel, Slider>> = {};
  private audioValueTexts: Partial<Record<AudioChannel, TextBlock>> = {};
  private keyboardOnlyCheckbox: Checkbox | null = null;
  private autoAimCheckbox: Checkbox | null = null;
  private awaitingRebind: KeybindingAction | null = null;
  private readonly eventBus: EventBus = EventBus.getInstance();
  private audioManager: AudioManager | null = null;
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
    private onBenchmarkRequested: () => void = () => {},
    beatSampler?: BeatPulseSampler
  ) {
    this.scene = new Scene(engine);
    this.menuBeatSampler = beatSampler ?? null;
    this.scene.clearColor = Color4.FromHexString(UITheme.colors.bgVoid);
    this.audioManager = new AudioManager(this.scene);
    void this.preloadUISounds();

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
    if (this.settingsBuilder) {
      // Re-create settings overlay if layout changes
    }
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
    if (this.settingsBuilder) {
      this.settingsBuilder.dispose();
      this.settingsBuilder = null;
    }
    if (this.resizeObserver) {
      this.engine.onResizeObservable.remove(this.resizeObserver);
      this.resizeObserver = null;
    }
    if (this.menuBeatObserver) {
      this.scene.onBeforeRenderObservable.remove(this.menuBeatObserver);
      this.menuBeatObserver = null;
    }
    window.removeEventListener('keydown', this.keyCaptureHandler, true);
    this.glitchFx.dispose();
    this.audioManager?.stopAllSounds();
    this.audioManager?.dispose();
    this.audioManager = null;
    this.gui.dispose();
    this.scene.dispose();
  }

  private async preloadUISounds(): Promise<void> {
    if (!this.audioManager) return;
    const uiSounds = [
      { id: 'sfx_ui_select1', path: 'sfx/ui/select1.mp3' },
      { id: 'sfx_ui_deselect', path: 'sfx/ui/deselect.mp3' },
      { id: 'sfx_ui_start_game', path: 'sfx/ui/start_game.mp3' },
      { id: 'sfx_ui_next_room', path: 'sfx/ui/next_room.mp3' },
    ];
    for (const sound of uiSounds) {
      try {
        await this.audioManager.loadSound(sound.id, buildHudAssetUrl(sound.path), { autoplay: false });
      } catch (err) {
        console.warn(`[MainMenu] Failed to load ${sound.id}:`, err);
      }
    }
  }

  private playUISound(soundId: string, volume: number = 0.8): void {
    if (!this.audioManager) return;
    try {
      this.audioManager.playSound(soundId, volume);
    } catch (err) {
      console.warn(`[MainMenu] Error playing sound ${soundId}:`, err);
    }
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
    title.fontFamily = 'Arcade8Bit';
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
    description.fontFamily = 'Arcade8Bit';
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
    achievementIconText.fontFamily = 'Arcade8Bit';
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

  private calculateTitleOverlayLayouts(): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = "72px Wonder8Bit";

    // DAEMON (Right-aligned in 500px container)
    const daemonWord = 'DAEMON';
    const totalW1 = ctx.measureText(daemonWord).width;
    const startX1 = 500 - totalW1;

    for (let i = 0; i < daemonWord.length; i++) {
      const letter = this.titlePart1OverlayLetters[i];
      if (letter) {
        const wBefore = ctx.measureText(daemonWord.substring(0, i)).width;
        const wWithChar = ctx.measureText(daemonWord.substring(0, i + 1)).width;
        const charW = wWithChar - wBefore;

        letter.width = `${charW}px`;
        letter.left = `${startX1 + wBefore + this.daemonPixelShift}px`;
      }
    }

    // DUNGEON (Left-aligned in 500px container)
    const dungeonWord = 'DUNGEON';
    const startX2 = 0;

    for (let i = 0; i < dungeonWord.length; i++) {
      const letter = this.titlePart2OverlayLetters[i];
      if (letter) {
        const wBefore = ctx.measureText(dungeonWord.substring(0, i)).width;
        const wWithChar = ctx.measureText(dungeonWord.substring(0, i + 1)).width;
        const charW = wWithChar - wBefore;

        letter.width = `${charW}px`;
        letter.left = `${startX2 + wBefore + this.dungeonPixelShift}px`;
      }
    }
  }



  private createMainButtons(): void {
    const panelHeight = Math.round(Math.min(720, Math.max(560, this.layoutHeight * 0.78)));
    const titleTopVal = Math.round(this.layoutHeight * 0.225 + panelHeight * 0.25);

    const titleContainer = new Rectangle('titleContainer');
    titleContainer.thickness = 0;
    titleContainer.width = '1200px';
    titleContainer.height = '180px';
    titleContainer.top = `-${titleTopVal}px`;
    titleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    titleContainer.clipChildren = false;
    this.mainLayoutContainer.addControl(titleContainer);

    const titlePart1Container = new Rectangle('titlePart1Container');
    titlePart1Container.width = '500px';
    titlePart1Container.height = '180px';
    titlePart1Container.thickness = 0;
    titlePart1Container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titlePart1Container.clipChildren = false;
    titleContainer.addControl(titlePart1Container);
    this.titlePart1Container = titlePart1Container;

    const titlePart1 = UIFactory.createText('menuTitle1', 'DAEMON', 72, UITheme.colors.textHighlight);
    titlePart1.fontFamily = 'Wonder8Bit';
    titlePart1.textWrapping = false;
    titlePart1.width = '500px';
    titlePart1.height = '180px';
    titlePart1.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titlePart1.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titlePart1.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    titlePart1Container.addControl(titlePart1);
    this.titlePart1 = titlePart1;
    this.menuBeatTargets.push(titlePart1Container);
    this.menuBeatDaemonTarget = titlePart1Container;

    // Create separate letter overlays for DAEMON (to be positioned precisely on layout calculation)
    const daemonWord = 'DAEMON';
    for (let i = 0; i < daemonWord.length; i++) {
      const letter = UIFactory.createText(`menuTitle1_overlay_${i}`, daemonWord[i], this.overlayFontSize, '#B800FF');
      letter.fontFamily = 'Wonder8Bit';
      letter.textWrapping = false;
      letter.height = '180px';
      letter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      letter.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      letter.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      letter.isVisible = false;
      titlePart1Container.addControl(letter);
      this.titlePart1OverlayLetters.push(letter);
    }

    const daemonFrames: Image[] = [];
    for (let i = 1; i <= 4; i++) {
      const frame = new Image(`daemonAvatar${i}`, buildHudAssetUrl(`avatar_frames_cutout2/rire_0${i}.png`));
      frame.width = '150px';
      frame.height = '150px';
      frame.stretch = Image.STRETCH_UNIFORM;
      frame.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      frame.isVisible = (i === 1);
      titleContainer.addControl(frame);
      daemonFrames.push(frame);
    }
    this.daemonAvatarFrames = daemonFrames;

    const avatarHitbox = Button.CreateSimpleButton('daemonAvatarHitbox', '');
    avatarHitbox.width = '174px';
    avatarHitbox.height = '174px';
    avatarHitbox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    avatarHitbox.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    avatarHitbox.thickness = 0;
    avatarHitbox.background = 'rgba(0,0,0,0)';
    avatarHitbox.zIndex = 40;
    avatarHitbox.onPointerDownObservable.add(() => {
      this.daemonAvatarIsPressed = true;
      this.playUISound('sfx_ui_deselect', 0.24);
      for (const f of this.daemonAvatarFrames) {
        f.scaleX = 1.16;
        f.scaleY = 1.16;
      }
    });
    avatarHitbox.onPointerUpObservable.add(() => {
      if (!this.daemonAvatarIsPressed) return;
      this.daemonAvatarIsPressed = false;
      for (const f of this.daemonAvatarFrames) {
        f.scaleX = 1;
        f.scaleY = 1;
      }
      this.rotateDaemonAvatarPreset();
    });
    avatarHitbox.onPointerOutObservable.add(() => {
      if (!this.daemonAvatarIsPressed) return;
      this.daemonAvatarIsPressed = false;
      for (const f of this.daemonAvatarFrames) {
        f.scaleX = 1;
        f.scaleY = 1;
      }
    });
    titleContainer.addControl(avatarHitbox);

    const titlePart2Container = new Rectangle('titlePart2Container');
    titlePart2Container.width = '500px';
    titlePart2Container.height = '180px';
    titlePart2Container.thickness = 0;
    titlePart2Container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titlePart2Container.clipChildren = false;
    titleContainer.addControl(titlePart2Container);
    this.titlePart2Container = titlePart2Container;

    const titlePart2 = UIFactory.createText('menuTitle2', 'DUNGEON', 72, UITheme.colors.textHighlight);
    titlePart2.fontFamily = 'Wonder8Bit';
    titlePart2.textWrapping = false;
    titlePart2.width = '500px';
    titlePart2.height = '180px';
    titlePart2.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titlePart2.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titlePart2.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    titlePart2Container.addControl(titlePart2);
    this.titlePart2 = titlePart2;
    this.menuBeatTargets.push(titlePart2Container);
    this.menuBeatDungeonTarget = titlePart2Container;

    // Create separate letter overlays for DUNGEON (to be positioned precisely on layout calculation)
    const dungeonWord = 'DUNGEON';
    for (let i = 0; i < dungeonWord.length; i++) {
      const letter = UIFactory.createText(`menuTitle2_overlay_${i}`, dungeonWord[i], this.overlayFontSize, '#B800FF');
      letter.fontFamily = 'Wonder8Bit';
      letter.textWrapping = false;
      letter.height = '180px';
      letter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      letter.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      letter.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      letter.isVisible = false;
      titlePart2Container.addControl(letter);
      this.titlePart2OverlayLetters.push(letter);
    }

    // Title flicker animation — slow oscillation between highlight colors + letter-by-letter violet cascade
    this.scene.onBeforeRenderObservable.add(() => {
      this.titleFlickerTime += this.scene.getEngine().getDeltaTime();
      const t = this.titleFlickerTime;

      // Daemon avatar animation from active emotion preset.
      const presetFrames = getDaemonAnimationPreset(this.daemonAvatarPresetName) ?? getDaemonAnimationPreset('rire') ?? [];
      this.daemonAvatarFrameTime += this.scene.getEngine().getDeltaTime();
      if (this.daemonAvatarFrameTime >= 105) {
        this.daemonAvatarFrameTime = 0;
        this.daemonAvatarFrameIndex = (this.daemonAvatarFrameIndex + 1) % Math.max(1, presetFrames.length);
      }
      for (let i = 0; i < daemonFrames.length; i++) {
        if (i < presetFrames.length) {
          daemonFrames[i].source = buildHudAssetUrl(`avatar_frames_cutout2/${presetFrames[i]}`);
          daemonFrames[i].isVisible = (i === this.daemonAvatarFrameIndex);
        } else {
          daemonFrames[i].isVisible = false;
        }
      }

      // Compute layouts once the font is loaded to ensure accurate measurements
      if (!this.layoutsCalculated && document.fonts.check("72px Wonder8Bit")) {
        this.calculateTitleOverlayLayouts();
        this.layoutsCalculated = true;
      }

      // Slow pulse: White -> Electric Cyan, period ~6s
      const phase = (t * 0.001) % (Math.PI * 2);
      const pulse = Math.sin(phase);
      const baseColor = pulse > 0 ? '#FFFFFF' : '#00E5FF';

      // Cascade of violet letters: runs every 5 seconds, divided into 14 steps (120ms each)
      // Steps 0-5: DAEMON letters
      // Step 6: Daemon Avatar Pop & Emotion Change (middle of the cascade)
      // Steps 7-13: DUNGEON letters
      const cascadePeriod = 5000;
      const stepDuration = 120;
      const totalSteps = 14;
      const totalCascadeDuration = totalSteps * stepDuration; // 14 * 120 = 1680ms
      const cycleTime = t % cascadePeriod;
      const activeStepIndex = cycleTime < totalCascadeDuration
        ? Math.floor(cycleTime / stepDuration)
        : -1;

      // Update DAEMON overlay letters visibility (steps 0-5)
      for (let i = 0; i < this.titlePart1OverlayLetters.length; i++) {
        const overlay = this.titlePart1OverlayLetters[i];
        if (overlay) {
          overlay.isVisible = (activeStepIndex === i);
        }
      }

      // Update DUNGEON overlay letters visibility (steps 7-13, shifted by 7)
      for (let i = 0; i < this.titlePart2OverlayLetters.length; i++) {
        const overlay = this.titlePart2OverlayLetters[i];
        if (overlay) {
          overlay.isVisible = (activeStepIndex === i + 7);
        }
      }

      // Trigger daemon popup at step 6
      if (activeStepIndex === 6) {
        if (!this.daemonCascadeTriggeredThisCycle) {
          this.daemonCascadeTriggeredThisCycle = true;
          this.daemonCascadePopTimer = 300; // pop duration in ms
          this.rotateDaemonAvatarPreset();
        }
      } else {
        this.daemonCascadeTriggeredThisCycle = false;
      }

      // Update daemon popup scale
      if (this.daemonCascadePopTimer > 0) {
        this.daemonCascadePopTimer = Math.max(0, this.daemonCascadePopTimer - this.scene.getEngine().getDeltaTime());
        const scaleVal = this.daemonCascadePopTimer > 0 ? 1.16 : 1;
        for (const f of this.daemonAvatarFrames) {
          f.scaleX = scaleVal;
          f.scaleY = scaleVal;
        }
      } else if (!this.daemonAvatarIsPressed) {
        for (const f of this.daemonAvatarFrames) {
          f.scaleX = 1;
          f.scaleY = 1;
        }
      }

      // Occasional fast flicker — 1-2 frames, ~every 8s
      let colorPart1 = baseColor;
      let colorPart2 = baseColor;
      if (Math.random() < 0.0004) {
        colorPart1 = '#CC00FF';
        colorPart2 = '#CC00FF';
      }

      // Apply colors to the text blocks (considering active beat fx)
      const fx1 = this.menuBeatFx.get(titlePart1Container);
      if (fx1) {
        fx1.baseColor = colorPart1;
      } else {
        titlePart1.color = colorPart1;
      }

      const fx2 = this.menuBeatFx.get(titlePart2Container);
      if (fx2) {
        fx2.baseColor = colorPart2;
      } else {
        titlePart2.color = colorPart2;
      }
    });

    const panelWidth = Math.round(Math.min(760, Math.max(560, this.layoutWidth * 0.58)));
    const buttonStep = Math.round((panelHeight / 7) * 0.9);
    this.menuButtonWidth = Math.round(panelWidth * 0.62);
    this.menuButtonHeight = Math.round(Math.max(62, panelHeight * 0.105));
    this.menuButtonFontSize = this.isMobileLayout ? 22 : 23;

    const panel = UIFactory.createPanel('menuPanel', panelWidth, panelHeight);
    panel.top = `${Math.round(this.layoutHeight * 0.05)}px`;
    this.mainLayoutContainer.addControl(panel);
    this.menuPanel = panel;

    const topOffsets = [-3, -2, -1, 0, 1, 2, 3].map((mult) => Math.round(mult * buttonStep));

    const playBtn = this.makeActionButton('menuPlay', 'START RUN', topOffsets[0], () => {
      this.hidePanels();
      this.onPlayRequested();
    });
    if (playBtn.textBlock) playBtn.textBlock.color = '#FFFFFF';
    panel.addControl(playBtn);
    this.menuBeatTargets.push(playBtn);

    const tutorialBtn = this.makeActionButton('menuTutorial', 'TUTORIAL', topOffsets[1], () => {
      this.hidePanels();
      this.onTutorialRequested();
    });
    if (tutorialBtn.textBlock) tutorialBtn.textBlock.color = '#FFFFFF';
    panel.addControl(tutorialBtn);
    this.menuBeatTargets.push(tutorialBtn);

    const codexBtn = this.makeActionButton('menuCodex', 'CODEX', topOffsets[2], () => {
      this.hidePanels();
      this.onCodexRequested();
    });
    panel.addControl(codexBtn);
    this.menuBeatTargets.push(codexBtn);

    const achievementsBtn = this.makeActionButton('menuAchievements', 'ACHIEVEMENTS', topOffsets[3], () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.ACHIEVEMENTS_OPEN_REQUESTED);
    });
    panel.addControl(achievementsBtn);
    this.menuBeatTargets.push(achievementsBtn);

    const highscoresBtn = this.makeActionButton('menuHighscores', 'HIGHSCORES', topOffsets[4], () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.HIGHSCORES_OPEN_REQUESTED);
    });
    panel.addControl(highscoresBtn);
    this.menuBeatTargets.push(highscoresBtn);

    const settingsBtn = this.makeActionButton('menuSettings', 'SETTINGS', topOffsets[5], () => {
      this.openSettingsOverlay();
    });
    panel.addControl(settingsBtn);
    this.menuBeatTargets.push(settingsBtn);

    const creditsBtn = this.makeActionButton('menuCredits', 'CREDITS', topOffsets[6], () => {
      this.hidePanels();
      this.eventBus.emit(GameEvents.CREDITS_OPEN_REQUESTED);
    });
    panel.addControl(creditsBtn);
    this.menuBeatTargets.push(creditsBtn);

    this.menuHint = null;
    this.installMenuMusicReactiveFx();
  }

  private installMenuMusicReactiveFx(): void {
    if (!this.menuBeatSampler || this.menuBeatObserver) return;
    this.menuBeatObserver = this.scene.onBeforeRenderObservable.add(() => {
      const dt = Math.max(0.001, this.engine.getDeltaTime() / 1000);
      const pulse = this.menuBeatSampler ? this.menuBeatSampler(dt) : 0;
      if (this.menuBeatWarmup > 0) {
        this.menuBeatWarmup = Math.max(0, this.menuBeatWarmup - dt);
      }
      if (this.menuBeatCooldown > 0) {
        this.menuBeatCooldown = Math.max(0, this.menuBeatCooldown - dt);
      }

      if (pulse > 0.2 && this.menuBeatWarmup <= 0 && this.menuBeatCooldown <= 0 && this.menuBeatTargets.length > 0) {
        if (this.menuBeatChainDungeon) {
          if (this.titlePart2Container) {
            this.triggerMenuBeatFx(this.titlePart2Container, pulse);
          }
          this.menuBeatChainDungeon = false;
          this.menuBeatCooldown = 0.04 + Math.random() * 0.045;
          this.updateMenuBeatFx(dt);
          return;
        }
        // Sparse random trigger: not every beat, and only one element at a time.
        const triggerChance = 0.56 + Math.min(0.34, pulse * 0.35);
        if (Math.random() < triggerChance) {
          const idx = Math.floor(Math.random() * this.menuBeatTargets.length);
          const target = this.menuBeatTargets[idx];
          
          if (target === this.titlePart1Container) {
            // Trigger DAEMON word beat, and queue DUNGEON word beat next
            if (this.titlePart1Container) {
              this.triggerMenuBeatFx(this.titlePart1Container, pulse);
            }
            this.menuBeatChainDungeon = true;
          } else {
            // Trigger regular button beat
            this.triggerMenuBeatFx(target, pulse);
          }
          this.menuBeatCooldown = 0.07 + Math.random() * 0.1;
        }
      }

      this.updateMenuBeatFx(dt);
    });
  }

  private triggerMenuBeatFx(target: Control, pulse: number): void {
    const prev = this.menuBeatFx.get(target);
    if (prev) {
      this.restoreMenuBeatTarget(target, prev);
      this.menuBeatFx.delete(target);
    }
    const fx = {
      timer: 0,
      duration: 0.14 + Math.min(0.2, pulse * 0.2) + (Math.random() * 0.08),
      jitterSeed: Math.random() * 1000,
      baseScaleX: target.scaleX || 1,
      baseScaleY: target.scaleY || 1,
      baseRotation: Number.isFinite(target.rotation) ? target.rotation : 0,
      baseColor: undefined as string | undefined,
      baseBg: undefined as string | undefined,
    };
    if (target === this.titlePart1Container || target === this.titlePart2Container) {
      const textBlock = target === this.titlePart1Container ? this.titlePart1 : this.titlePart2;
      fx.baseColor = textBlock ? textBlock.color : undefined;
    } else if (target instanceof TextBlock) {
      fx.baseColor = target.color;
    } else if (target instanceof Button) {
      fx.baseColor = target.color;
      fx.baseBg = target.background;
    }
    this.menuBeatFx.set(target, fx);
  }

  private updateMenuBeatFx(deltaSeconds: number): void {
    if (this.menuBeatFx.size <= 0) return;
    const now = performance.now() * 0.001;
    const finished: Control[] = [];
    for (const [target, fx] of this.menuBeatFx) {
      fx.timer += deltaSeconds;
      const t = Math.min(1, fx.timer / Math.max(0.001, fx.duration));
      const hit = 1 - t;
      const easeOut = hit * hit;
      const scaleBoost = 1 + (0.07 * easeOut);
      const rotJitter = Math.sin((now * 95) + fx.jitterSeed) * (0.012 + 0.016 * easeOut);
      target.scaleX = fx.baseScaleX * scaleBoost;
      target.scaleY = fx.baseScaleY * (1 + (0.05 * easeOut));
      target.rotation = fx.baseRotation + rotJitter;

      if (target instanceof TextBlock) {
        target.color = easeOut > 0.42
          ? '#FF5D75'
          : easeOut > 0.16
            ? '#FF92B2'
            : (fx.baseColor || UITheme.colors.textHighlight);
      } else if (target === this.titlePart1Container || target === this.titlePart2Container) {
        const textBlock = target === this.titlePart1Container ? this.titlePart1 : this.titlePart2;
        if (textBlock) {
          textBlock.color = easeOut > 0.42
            ? '#FF5D75'
            : easeOut > 0.16
              ? '#FF92B2'
              : (fx.baseColor || UITheme.colors.textHighlight);
        }
      } else if (target instanceof Button) {
        target.color = easeOut > 0.2 ? '#FF6C86' : (fx.baseColor || UITheme.colors.borderBright);
        target.background = easeOut > 0.18
          ? 'rgba(72, 14, 24, 0.96)'
          : (fx.baseBg || UITheme.colors.buttonBg);
        target.thickness = easeOut > 0.14 ? 2 : 1;
      }

      if (t >= 1) {
        finished.push(target);
      }
    }

    for (const target of finished) {
      const fx = this.menuBeatFx.get(target);
      if (!fx) continue;
      this.restoreMenuBeatTarget(target, fx);
      this.menuBeatFx.delete(target);
    }
  }

  private restoreMenuBeatTarget(target: Control, fx: {
    baseScaleX: number;
    baseScaleY: number;
    baseRotation: number;
    baseColor?: string;
    baseBg?: string;
  }): void {
    target.scaleX = fx.baseScaleX;
    target.scaleY = fx.baseScaleY;
    target.rotation = fx.baseRotation;
    if (target === this.titlePart1Container || target === this.titlePart2Container) {
      const textBlock = target === this.titlePart1Container ? this.titlePart1 : this.titlePart2;
      if (textBlock) {
        textBlock.color = fx.baseColor || UITheme.colors.textHighlight;
      }
    } else if (target instanceof TextBlock) {
      target.color = fx.baseColor || target.color;
    } else if (target instanceof Button) {
      target.color = fx.baseColor || target.color;
      target.background = fx.baseBg || target.background;
      target.thickness = 1;
    }
  }


  private createSettingsOverlay(): void {
    import('../ui/SettingsMenuBuilder').then(({ SettingsMenuBuilder }) => {
      if (!this.settingsBuilder) {
        this.settingsBuilder = new SettingsMenuBuilder(
          () => this.closeSettingsOverlay(),
          () => this.codexService.resetProgress(),
          () => {} // benchmark not fully available from main menu
        );
      }
      if (this.settingsOverlay) {
        this.settingsOverlay.dispose();
      }
      this.settingsOverlay = this.settingsBuilder.createSettingsOverlay(this.gui);
    });
  }
  private rotateDaemonAvatarPreset(): void {
    const candidates = DAEMON_FOUR_FRAME_PRESET_NAMES.filter((n) => n !== this.daemonAvatarPresetName);
    if (candidates.length <= 0) return;
    this.daemonAvatarPresetName = candidates[Math.floor(Math.random() * candidates.length)];
    this.daemonAvatarFrameIndex = 0;
    this.daemonAvatarFrameTime = 0;
  }

  private openSettingsOverlay(): void {
    if (!this.settingsOverlay) {
      this.createSettingsOverlay();
    }
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
