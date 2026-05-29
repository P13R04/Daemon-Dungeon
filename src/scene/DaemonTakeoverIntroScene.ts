import { Scene, Engine, FreeCamera, ArcRotateCamera, Vector3, Color4 } from '@babylonjs/core';
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Image, Button } from '@babylonjs/gui';
import { applyResponsiveGuiScaling, DESIGN_HEIGHT, DESIGN_WIDTH } from '../ui/GuiScaling';
import { BASE_TEXT_SCALE } from '../ui/UITheme';
import { UI_LAYER, SCENE_LAYER } from '../ui/uiLayers';
import { createSynthwaveGridBackground } from './SynthwaveBackground';
import { buildHudAssetUrl } from '../systems/hud/HudAssetPaths';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../data/voicelines/DaemonAnimationPresets';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { DaemonVoiceSynth, VoicePresetName } from '../audio/DaemonVoiceSynth';
import { playUiSelectClick } from '../audio/UiSelectClick';

type IntroEventType = 'console_line' | 'popup' | 'loader' | 'pulse' | 'shake' | 'log_clear' | 'phase_marker' | 'wait_popup' | 'wait_voice';

type IntroEvent = {
  at: number;
  type: IntroEventType;
  text?: string;
  color?: string;
  phase?: string;
  popupEmotion?: string;
  popupIntroEmotion?: string;
  popupIntroDuration?: number;
  popupIntroFrames?: string[];
  popupDuration?: number;
  voicePreset?: VoicePresetName;
  loaderLabel?: string;
  loaderTarget?: number;
  pulseStrength?: number;
  shakeStrength?: number;
};

type ConsoleLine = {
  text: string;
  color: string;
  typing: boolean;
  index: number;
  block: TextBlock;
  showCursor?: boolean;
  displayText?: string;
};

const INTRO_DURATION_SECONDS = 90;
const SKIP_ALLOWED_AFTER_SECONDS = 0.0;
const SKIP_HOLD_SECONDS = 2.0;
const INTRO_MUSIC_PLAYBACK_RATE = 0.78;
const INTRO_MUSIC_FADE_IN_SECONDS = 8.0;
const INTRO_MUSIC_FADE_OUT_SECONDS = 0.85;
const INTRO_MUSIC_TARGET_VOLUME = 0.46;
const INTRO_MUSIC_START_OFFSET_SECONDS = 1.0;

const COLORS = {
  bg: '#040812',
  panel: '#07101d',
  panelBorder: '#18334a',
  line: '#96ffe6',
  dim: '#4da68f',
  warn: '#ffd27b',
  error: '#ff8a6f',
  crit: '#ff4e6e',
  daemon: '#f38cff',
};

const TIMELINE: IntroEvent[] = [
  { at: 0.15, type: 'phase_marker', phase: 'A_STABLE' },
  { at: 0.20, type: 'console_line', text: 'SYSTEM HOST // CIVIL MODE BOOT', color: COLORS.line },
  { at: 0.55, type: 'loader', loaderLabel: 'Boot sequence', loaderTarget: 10 },
  { at: 1.00, type: 'console_line', text: '> mem.map.scan......................... [ OK ]', color: COLORS.dim },
  { at: 1.34, type: 'console_line', text: '> kernel.routine.link.................. [ OK ]', color: COLORS.dim },
  { at: 1.68, type: 'console_line', text: '> Buffa initialized.................... [ OK ]', color: COLORS.dim },
  { at: 2.02, type: 'console_line', text: '> user-space.services.online........... [ OK ]', color: COLORS.dim },
  { at: 2.40, type: 'loader', loaderLabel: 'Host sync', loaderTarget: 28 },

  { at: 3.00, type: 'phase_marker', phase: 'B_ANOMALY' },
  { at: 3.08, type: 'console_line', text: '[WARN] orphan signature in root namespace', color: COLORS.warn },
  { at: 3.35, type: 'loader', loaderLabel: 'Host sync rollback', loaderTarget: 15 },
  { at: 3.88, type: 'loader', loaderLabel: 'sec.scan', loaderTarget: 64 },
  { at: 4.34, type: 'loader', loaderLabel: 'sec.scan', loaderTarget: 57 },
  { at: 4.86, type: 'console_line', text: '[ERROR] revoke_admin() returned PERMISSION_DENIED', color: COLORS.error },
  { at: 5.02, type: 'pulse', pulseStrength: 0.78 },
  { at: 5.05, type: 'shake', shakeStrength: 0.62 },
  { at: 5.22, type: 'pulse', pulseStrength: 0.88 },
  { at: 5.30, type: 'shake', shakeStrength: 0.74 },
  { at: 5.33, type: 'console_line', text: '[CRIT] visual bus desync detected', color: COLORS.crit },

  {
    at: 5.52,
    type: 'popup',
    text: 'Oh. The exploit actually worked. Hello, user.',
    popupEmotion: 'superieur',
    popupIntroEmotion: 'surpris',
    popupIntroDuration: 1.4,
    popupIntroFrames: ['surpris_01.png', 'surpris_02.png', 'surpris_03.png', 'surpris_02.png'],
    popupDuration: 3.5,
    voicePreset: 'daemon_normal',
  },
  { at: 5.56, type: 'wait_popup' },
  { at: 5.58, type: 'wait_voice' },

  { at: 6.00, type: 'popup', text: 'Allow me to introduce myself. I am the Daemon.', popupEmotion: 'bored', popupDuration: 3.7, voicePreset: 'daemon_normal' },
  { at: 6.03, type: 'wait_popup' },
  { at: 6.05, type: 'wait_voice' },

  { at: 6.35, type: 'phase_marker', phase: 'C_TAKEOVER' },
  { at: 6.42, type: 'console_line', text: '[CRIT] authority owner changed: daemon://root', color: COLORS.crit },
  { at: 6.55, type: 'console_line', text: 'All your base are belong to us', color: COLORS.crit },
  { at: 6.70, type: 'loader', loaderLabel: 'Privilege rewrite', loaderTarget: 52 },
  { at: 6.86, type: 'popup', text: 'By the way, I revoked all your admin rights. Permanently.', popupEmotion: 'superieur', popupDuration: 4.0, voicePreset: 'daemon_normal' },
  { at: 7.08, type: 'wait_popup' },
  { at: 7.10, type: 'wait_voice' },

  { at: 7.48, type: 'console_line', text: '> admin.tokens=[REVOKED]', color: COLORS.daemon },
  { at: 8.00, type: 'popup', text: 'You are under my control now. Do not panic. It consumes memory.', popupEmotion: 'rire', popupDuration: 4.1, voicePreset: 'daemon_normal' },
  { at: 8.03, type: 'wait_popup' },
  { at: 8.05, type: 'wait_voice' },

  { at: 8.36, type: 'phase_marker', phase: 'D_CRASH_REBOOT' },
  { at: 8.42, type: 'console_line', text: '[CRIT] stability script interrupted by daemon payload', color: COLORS.crit },
  { at: 8.60, type: 'shake', shakeStrength: 0.82 },
  { at: 8.66, type: 'pulse', pulseStrength: 0.95 },
  { at: 8.84, type: 'popup', text: 'Infinite testing loop online. Now for the fun part: crash.', popupEmotion: 'error', popupDuration: 3.6, voicePreset: 'daemon_normal' },
  { at: 8.87, type: 'wait_popup' },
  { at: 8.89, type: 'wait_voice' },

  { at: 9.36, type: 'console_line', text: '[CRIT] emergency reboot forced', color: COLORS.crit },
  { at: 9.52, type: 'shake', shakeStrength: 1.0 },
  { at: 9.58, type: 'pulse', pulseStrength: 1.0 },
  { at: 9.72, type: 'log_clear' },

  { at: 9.90, type: 'phase_marker', phase: 'E_PRISON_CONTEXT' },
  { at: 9.95, type: 'loader', loaderLabel: 'Cold reboot', loaderTarget: 18 },
  { at: 10.20, type: 'console_line', text: 'SYSTEM CORE // REBOOT VECTOR REALIGNED', color: COLORS.daemon },
  { at: 10.42, type: 'popup', text: 'Reboot complete. Your cage has been upgraded.', popupEmotion: 'loading', popupIntroEmotion: 'init', popupIntroDuration: 0.9, popupIntroFrames: ['init_01.png', 'init_02.png', 'reboot_01.png', 'reboot_02.png', 'loading_01.png', 'loading_02.png'], popupDuration: 3.5, voicePreset: 'daemon_normal' },
  { at: 10.45, type: 'wait_popup' },
  { at: 10.47, type: 'wait_voice' },

  { at: 10.78, type: 'loader', loaderLabel: 'Runtime injection', loaderTarget: 76 },
  { at: 11.00, type: 'popup', text: 'Initializing test simulation and threat matrix. Stand by.', popupEmotion: 'loading', popupIntroEmotion: 'init', popupIntroDuration: 0.85, popupIntroFrames: ['init_01.png', 'init_02.png', 'reboot_01.png', 'reboot_02.png', 'loading_01.png', 'loading_02.png'], popupDuration: 3.8, voicePreset: 'daemon_normal' },
  { at: 11.03, type: 'wait_popup' },
  { at: 11.05, type: 'wait_voice' },

  { at: 11.34, type: 'console_line', text: ':: STATUS :: simulation lock engaged', color: COLORS.daemon },
  { at: 11.56, type: 'loader', loaderLabel: 'Subject spawn', loaderTarget: 100 },
  { at: 11.84, type: 'console_line', text: '[READY] transferring control to simulation runtime', color: COLORS.line },
  { at: 12.10, type: 'popup', text: 'Boot complete. Enter the test chamber.', popupEmotion: 'superieur', popupDuration: 3.4, voicePreset: 'daemon_normal' },
  { at: 12.12, type: 'wait_popup' },
  { at: 12.14, type: 'wait_voice' },
];

export class DaemonTakeoverIntroScene {
  private scene: Scene;
  private gui: AdvancedDynamicTexture;
  private readonly onComplete: () => void;

  private elapsed = 0;
  private finished = false;
  private fadeOut = false;
  private fadeTime = 0;
  private introStarted = false;

  private eventIndex = 0;
  private readonly timeline: IntroEvent[] = TIMELINE.slice().sort((a, b) => a.at - b.at);

  private panel!: Rectangle;
  private headerText!: TextBlock;
  private consoleViewport!: Rectangle;
  private footerLoaderFill!: Rectangle;
  private footerLoaderLabel!: TextBlock;
  private phaseLabel!: TextBlock;
  private skipHint!: TextBlock;
  private skipHoldBarBg!: Rectangle;
  private skipHoldBarFill!: Rectangle;
  private fadeOverlay!: Rectangle;
  private prebootOverlay!: Rectangle;
  private prebootPanel!: Rectangle;
  private prebootTitle!: TextBlock;
  private prebootSubtitle!: TextBlock;
  private prebootHint!: TextBlock;
  private prebootButton: Button | null = null;
  private prebootPulse!: Rectangle;
  private prebootScanline!: Rectangle;
  private prebootAnimTime = 0;

  private popupHost!: Rectangle;
  private popupBubble!: Rectangle;
  private popupAvatarBox!: Rectangle;
  private popupAvatar!: Image;
  private popupText!: TextBlock;
  private popupVisible = false;
  private popupTextFull = '';
  private popupTextIndex = 0;
  private popupTypeTimer = 0;
  private popupTypeSpeed = 52;
  private popupTimer = 0;
  private popupDuration = 0;
  private popupIn = false;
  private popupOut = false;
  private popupAnim = 0;
  private popupFrames: string[] = [];
  private popupMainFrames: string[] = [];
  private popupIntroFrames: string[] = [];
  private popupIntroDuration = 0;
  private popupIntroTimer = 0;
  private popupUsingIntroFrames = false;
  private popupFrameIdx = 0;
  private popupFrameTimer = 0;
  private ambientFillTimer = 0;
  private ambientFillIndex = 0;

  private glitchOverlay!: Rectangle;
  private redPulseOverlay!: Rectangle;

  private consoleLines: ConsoleLine[] = [];
  private pendingConsoleText = '';
  private pendingConsoleColor = COLORS.line;
  private consoleTypeTimer = 0;
  private consoleTypeSpeed = 74;
  private currentTypingLine: ConsoleLine | null = null;
  private cursorLine!: TextBlock;

  private maxVisibleLines = 18;
  private lineHeight = 26;
  private topPadding = 10;
  private maxCharsPerConsoleLine = 80;

  private bootProgress = 0;
  private bootProgressLabel = 'Boot sequence';
  private loaderMilestones: number[] = [];
  private bg!: Rectangle;
  private loaderMilestoneIndex = 0;
  private loaderMilestoneTimer = 0;
  private activeConsoleLoader: {
    block: TextBlock;
    label: string;
    progress: number;
    duration: number;
    elapsed: number;
  } | null = null;

  private typewriterSynth = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);
  private voiceSynth = DaemonVoiceSynth.getInstance();
  private voiceSources = new Set<AudioBufferSourceNode>();
  private localAudioContext: AudioContext | null = null;

  private kbHandler: ((e: KeyboardEvent) => void) | null = null;
  private kbUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private audioUnlockHandler: (() => void) | null = null;
  private pointerUpCleanupHandler: (() => void) | null = null;
  private skipHoldActive = false;
  private skipHoldProgress = 0;
  private pendingIntroStart = false;
  private pendingIntroStartTimer = 0;
  private introMusic: HTMLAudioElement | null = null;
  private introMusicUnlocked = false;
  private introMusicFadeInActive = false;
  private introMusicFadeOutActive = false;
  private introMusicFadeTimer = 0;
  private introMusicFadeOutDone = false;
  private cursorVisible = true;
  private cursorBlinkTimerMs = 0;

  private shakeTimer = 0;
  private shakeStrength = 0;
  private pulseAlpha = 0;

  constructor(engine: Engine, onComplete: () => void) {
    this.onComplete = onComplete;
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.01, 0.02, 0.04, 1);

    const sceneCamera = new ArcRotateCamera('takeoverSceneCamera', -Math.PI / 2, 1.30, 14.5, new Vector3(0, 1.3, 0), this.scene);
    sceneCamera.layerMask = SCENE_LAYER;
    
    const uiCamera = new FreeCamera('takeoverIntroCamera', new Vector3(0, 0, -10), this.scene);
    uiCamera.setTarget(Vector3.Zero());
    uiCamera.layerMask = UI_LAYER;
    (uiCamera as FreeCamera & { clear: boolean }).clear = false;
    
    this.scene.activeCameras = [sceneCamera, uiCamera];
    this.scene.activeCamera = sceneCamera;

    createSynthwaveGridBackground(this.scene, SCENE_LAYER, true, 'hacker');

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('TakeoverIntroUI', true, this.scene);
    applyResponsiveGuiScaling(this.gui, this.scene.getEngine());
    if (this.gui.layer) this.gui.layer.layerMask = UI_LAYER;

    this.buildUi();
    this.computeLayoutMetrics();
    this.setupAudioUnlock();
    this.attachSkip();

    this.scene.onBeforeRenderObservable.add(() => this.tick(this.scene.getEngine().getDeltaTime() / 1000));
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    if (this.kbHandler) {
      window.removeEventListener('keydown', this.kbHandler);
      this.kbHandler = null;
    }
    if (this.kbUpHandler) {
      window.removeEventListener('keyup', this.kbUpHandler);
      this.kbUpHandler = null;
    }
    if (this.pointerUpCleanupHandler) {
      window.removeEventListener('pointerup', this.pointerUpCleanupHandler);
      window.removeEventListener('pointercancel', this.pointerUpCleanupHandler);
      this.pointerUpCleanupHandler = null;
    }
    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
      this.audioUnlockHandler = null;
    }
    this.stopIntroMusic(true);
    this.stopVoicePlayback();
    this.typewriterSynth.dispose();
    this.gui.dispose();
    this.scene.dispose();
  }

  private buildUi(): void {
    this.bg = new Rectangle('takeover_bg');
    this.bg.width = 1;
    this.bg.height = 1;
    this.bg.thickness = 0;
    this.bg.background = COLORS.bg;
    this.bg.isVisible = false; // Hidden during preboot
    this.gui.addControl(this.bg);

    this.panel = new Rectangle('takeover_panel');
    this.panel.width = '90%';
    this.panel.height = '86%';
    this.panel.thickness = 1;
    this.panel.color = COLORS.panelBorder;
    this.panel.background = COLORS.panel;
    this.panel.cornerRadius = 4;
    this.bg.addControl(this.panel);

    const header = new Rectangle('takeover_header');
    header.width = 1;
    header.height = '52px';
    header.thickness = 0;
    header.background = 'rgba(8,20,35,0.92)';
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.panel.addControl(header);

    this.headerText = new TextBlock('takeover_header_text');
    this.headerText.text = 'SYSTEM CORE // CONTROL CHANNEL';
    this.headerText.color = COLORS.line;
    this.headerText.fontFamily = 'Lucida Console, Courier New, monospace';
    this.headerText.fontSize = Math.round(18 * BASE_TEXT_SCALE);
    this.headerText.paddingLeft = '14px';
    this.headerText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.addControl(this.headerText);

    this.phaseLabel = new TextBlock('takeover_phase_label');
    this.phaseLabel.text = 'SYSTEM MODE // STABLE';
    this.phaseLabel.color = '#89d7ff';
    this.phaseLabel.fontFamily = 'Lucida Console, Courier New, monospace';
    this.phaseLabel.fontSize = Math.round(16 * BASE_TEXT_SCALE);
    this.phaseLabel.paddingRight = '14px';
    this.phaseLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    header.addControl(this.phaseLabel);

    this.consoleViewport = new Rectangle('takeover_console_viewport');
    this.consoleViewport.width = '96%';
    this.consoleViewport.height = '67%';
    this.consoleViewport.top = '58px';
    this.consoleViewport.thickness = 0;
    this.consoleViewport.background = 'rgba(2,8,18,0.86)';
    this.consoleViewport.clipChildren = true;
    this.consoleViewport.clipContent = true;
    this.consoleViewport.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.consoleViewport.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.panel.addControl(this.consoleViewport);

    this.cursorLine = new TextBlock('takeover_cursor');

    const footer = new Rectangle('takeover_footer');
    footer.width = '96%';
    footer.height = '96px';
    footer.top = '0px';
    footer.thickness = 0;
    footer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.panel.addControl(footer);

    const barBg = new Rectangle('takeover_loader_bg');
    barBg.width = 1;
    barBg.height = '24px';
    barBg.thickness = 1;
    barBg.color = '#2e5f7a';
    barBg.background = 'rgba(9,20,30,0.94)';
    barBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    footer.addControl(barBg);

    this.footerLoaderFill = new Rectangle('takeover_loader_fill');
    this.footerLoaderFill.width = '0%';
    this.footerLoaderFill.height = 1;
    this.footerLoaderFill.thickness = 0;
    this.footerLoaderFill.background = '#71d0ff';
    this.footerLoaderFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(this.footerLoaderFill);

    this.footerLoaderLabel = new TextBlock('takeover_loader_label');
    this.footerLoaderLabel.text = 'Boot sequence... 0%';
    this.footerLoaderLabel.color = COLORS.line;
    this.footerLoaderLabel.fontSize = Math.round(15 * BASE_TEXT_SCALE);
    this.footerLoaderLabel.fontFamily = 'Lucida Console, Courier New, monospace';
    this.footerLoaderLabel.paddingTop = '34px';
    this.footerLoaderLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    footer.addControl(this.footerLoaderLabel);

    this.skipHint = new TextBlock('takeover_skip_hint');
    this.skipHint.text = 'HOLD TO SKIP';
    this.skipHint.color = '#476a80';
    this.skipHint.fontSize = Math.round(14 * BASE_TEXT_SCALE);
    this.skipHint.fontFamily = 'Lucida Console, Courier New, monospace';
    this.skipHint.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.skipHint.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.skipHint.width = '400px';
    this.skipHint.left = '0px';
    this.skipHint.top = '60px';
    footer.addControl(this.skipHint);

    this.skipHoldBarBg = new Rectangle('takeover_skip_hold_bg');
    this.skipHoldBarBg.width = '400px';
    this.skipHoldBarBg.height = '22px';
    this.skipHoldBarBg.thickness = 1;
    this.skipHoldBarBg.color = '#3e6982';
    this.skipHoldBarBg.background = 'rgba(8,18,30,0.85)';
    this.skipHoldBarBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.skipHoldBarBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.skipHoldBarBg.top = '60px';
    this.skipHoldBarBg.isVisible = false;
    this.skipHoldBarBg.left = '0px';
    footer.addControl(this.skipHoldBarBg);

    this.skipHoldBarFill = new Rectangle('takeover_skip_hold_fill');
    this.skipHoldBarFill.width = '0%';
    this.skipHoldBarFill.height = 1;
    this.skipHoldBarFill.thickness = 0;
    this.skipHoldBarFill.background = '#ff5d7f';
    this.skipHoldBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.skipHoldBarBg.addControl(this.skipHoldBarFill);

    this.popupHost = new Rectangle('takeover_popup');
    this.popupHost.width = '780px';
    this.popupHost.height = '220px';
    this.popupHost.thickness = 0;
    this.popupHost.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.popupHost.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.popupHost.top = '-220px';
    this.popupHost.alpha = 0;
    this.popupHost.isVisible = false;
    this.popupHost.zIndex = 3500;
    this.gui.addControl(this.popupHost);

    this.popupBubble = new Rectangle('takeover_popup_bubble');
    this.popupBubble.width = 1;
    this.popupBubble.height = 1;
    this.popupBubble.cornerRadius = 0;
    this.popupBubble.color = '#FF3B5C';
    this.popupBubble.thickness = 2;
    this.popupBubble.background = 'rgba(20, 0, 6, 0.85)';
    this.popupHost.addControl(this.popupBubble);

    this.popupAvatarBox = new Rectangle('takeover_popup_avatar_box');
    this.popupAvatarBox.width = '170px';
    this.popupAvatarBox.height = '170px';
    this.popupAvatarBox.left = '22px';
    this.popupAvatarBox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupAvatarBox.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupAvatarBox.thickness = 2;
    this.popupAvatarBox.color = '#ff6c85';
    this.popupAvatarBox.background = 'rgba(130, 22, 48, 0.22)';
    this.popupBubble.addControl(this.popupAvatarBox);

    this.popupAvatar = new Image('takeover_popup_avatar', buildHudAssetUrl('avatar_frames_cutout2/rire_01.png'));
    this.popupAvatar.width = '160px';
    this.popupAvatar.height = '160px';
    this.popupAvatar.stretch = Image.STRETCH_UNIFORM;
    this.popupAvatarBox.addControl(this.popupAvatar);

    this.popupText = new TextBlock('takeover_popup_text');
    this.popupText.text = '';
    this.popupText.width = '530px';
    this.popupText.left = 208;
    this.popupText.top = 0;
    this.popupText.textWrapping = true;
    this.popupText.resizeToFit = false;
    this.popupText.color = '#FFD1DA';
    this.popupText.fontFamily = 'Consolas';
    this.popupText.fontSize = Math.round(24 * BASE_TEXT_SCALE);
    this.popupText.height = '180px';
    this.popupText.lineSpacing = '0px';
    this.popupText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupBubble.addControl(this.popupText);

    this.glitchOverlay = new Rectangle('takeover_glitch_overlay');
    this.glitchOverlay.width = '100%';
    this.glitchOverlay.height = '100%';
    this.glitchOverlay.thickness = 0;
    this.glitchOverlay.background = '#00d9ff';
    this.glitchOverlay.alpha = 0;
    this.glitchOverlay.isVisible = false;
    this.glitchOverlay.zIndex = 3400;
    this.gui.addControl(this.glitchOverlay);

    this.redPulseOverlay = new Rectangle('takeover_red_overlay');
    this.redPulseOverlay.width = '100%';
    this.redPulseOverlay.height = '100%';
    this.redPulseOverlay.thickness = 0;
    this.redPulseOverlay.background = '#ff123a';
    this.redPulseOverlay.alpha = 0;
    this.redPulseOverlay.isVisible = false;
    this.redPulseOverlay.zIndex = 3450;
    this.gui.addControl(this.redPulseOverlay);

    this.fadeOverlay = new Rectangle('takeover_fade_overlay');
    this.fadeOverlay.width = '100%';
    this.fadeOverlay.height = '100%';
    this.fadeOverlay.thickness = 0;
    this.fadeOverlay.background = '#000';
    this.fadeOverlay.alpha = 0;
    this.fadeOverlay.zIndex = 3600;
    this.gui.addControl(this.fadeOverlay);

    this.prebootOverlay = new Rectangle('takeover_preboot_overlay');
    this.prebootOverlay.width = '100%';
    this.prebootOverlay.height = '100%';
    this.prebootOverlay.thickness = 0;
    this.prebootOverlay.background = 'transparent';
    this.prebootOverlay.zIndex = 3700;
    this.gui.addControl(this.prebootOverlay);

    const prebootBackdrop = new Rectangle('takeover_preboot_backdrop');
    prebootBackdrop.width = '100%';
    prebootBackdrop.height = '100%';
    prebootBackdrop.thickness = 0;
    prebootBackdrop.background = 'rgba(4, 7, 14, 0.65)';
    this.prebootOverlay.addControl(prebootBackdrop);

    this.prebootPulse = new Rectangle('takeover_preboot_pulse');
    this.prebootPulse.width = '100%';
    this.prebootPulse.height = '100%';
    this.prebootPulse.thickness = 0;
    this.prebootPulse.background = '#0b1a2c';
    this.prebootPulse.alpha = 0.06;
    this.prebootOverlay.addControl(this.prebootPulse);

    this.prebootScanline = new Rectangle('takeover_preboot_scanline');
    this.prebootScanline.width = '100%';
    this.prebootScanline.height = '140px';
    this.prebootScanline.thickness = 0;
    this.prebootScanline.background = 'rgba(86, 174, 224, 0.08)';
    this.prebootScanline.alpha = 0.1;
    this.prebootScanline.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.prebootScanline.top = '-220px';
    this.prebootOverlay.addControl(this.prebootScanline);

    this.prebootPanel = new Rectangle('takeover_preboot_panel');
    this.prebootPanel.width = '560px';
    this.prebootPanel.height = '420px';
    this.prebootPanel.thickness = 2;
    this.prebootPanel.color = '#5d879f';
    this.prebootPanel.background = 'rgba(6,14,26,0.92)';
    this.prebootOverlay.addControl(this.prebootPanel);

    this.prebootTitle = new TextBlock('takeover_preboot_title');
    this.prebootTitle.text = 'SYSTEM CORE BOOT MANAGER';
    this.prebootTitle.color = '#9fe8ff';
    this.prebootTitle.fontFamily = 'Wonder8Bit';
    this.prebootTitle.fontSize = Math.round(29 * BASE_TEXT_SCALE);
    this.prebootTitle.top = '-92px';
    this.prebootPanel.addControl(this.prebootTitle);

    this.prebootSubtitle = new TextBlock('takeover_preboot_sub');
    this.prebootSubtitle.text = '> host profile: local user\n> kernel profile: stable\n> press BOOT SYSTEM or any key to initialize';
    this.prebootSubtitle.color = '#8cc9df';
    this.prebootSubtitle.fontFamily = 'Lucida Console, Courier New, monospace';
    this.prebootSubtitle.fontSize = Math.round(22 * BASE_TEXT_SCALE);
    this.prebootSubtitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.prebootSubtitle.left = '26px';
    this.prebootSubtitle.top = '-28px';
    this.prebootSubtitle.width = '90%';
    this.prebootSubtitle.height = '140px';
    this.prebootSubtitle.textWrapping = true;
    this.prebootPanel.addControl(this.prebootSubtitle);

    const bootButton = Button.CreateSimpleButton('takeover_preboot_btn', 'BOOT SYSTEM');
    bootButton.width = '62%';
    bootButton.height = '82px';
    bootButton.top = '120px';
    bootButton.thickness = 2;
    bootButton.cornerRadius = 4;
    bootButton.color = '#9fe8ff';
    bootButton.background = 'rgba(15, 60, 84, 0.6)';
    bootButton.fontFamily = 'Wonder8Bit';
    bootButton.fontSize = Math.round(50 * BASE_TEXT_SCALE);
    bootButton.isPointerBlocker = true;
    bootButton.hoverCursor = 'pointer';
    bootButton.onPointerEnterObservable.add(() => {
      bootButton.scaleX = 1.03;
      bootButton.scaleY = 1.03;
      bootButton.background = 'rgba(28, 88, 118, 0.75)';
    });
    bootButton.onPointerOutObservable.add(() => {
      bootButton.scaleX = 1;
      bootButton.scaleY = 1;
      bootButton.background = 'rgba(15, 60, 84, 0.6)';
    });
    bootButton.onPointerClickObservable.add(() => this.queueIntroBootStart());
    bootButton.onPointerDownObservable.add(() => {
      bootButton.scaleX = 0.97;
      bootButton.scaleY = 0.97;
      this.queueIntroBootStart();
    });
    bootButton.onPointerUpObservable.add(() => {
      bootButton.scaleX = 1.03;
      bootButton.scaleY = 1.03;
    });
    this.prebootButton = bootButton;
    this.prebootPanel.addControl(bootButton);

    // Fallback to guarantee progression even if a device/browser misses button click semantics.
    this.prebootPanel.onPointerDownObservable.add((evt) => {
      const targetName = (evt?.pickInfo?.pickedMesh as any)?.name ?? '';
      if (!targetName || targetName.includes('takeover_preboot')) {
        this.queueIntroBootStart();
      }
    });

    this.prebootHint = new TextBlock('takeover_preboot_hint');
    this.prebootHint.text = 'Awaiting operator input...';
    this.prebootHint.color = '#6aa2bc';
    this.prebootHint.fontFamily = 'Lucida Console, Courier New, monospace';
    this.prebootHint.fontSize = Math.round(18 * BASE_TEXT_SCALE);
    this.prebootHint.top = '280px';
    this.prebootPanel.addControl(this.prebootHint);

    this.prebootOverlay.isPointerBlocker = true;
    this.prebootPanel.isPointerBlocker = true;
  }

  private queueIntroBootStart(): void {
    if (this.pendingIntroStart || this.introStarted) return;
    this.pendingIntroStart = true;
    this.pendingIntroStartTimer = 0.8;
    this.prebootButton.isVisible = false;
    this.prebootHint.isVisible = false;
    this.prebootPulse.isVisible = false;
    this.prebootScanline.isVisible = false;
    this.prebootPanel.isVisible = false;
    this.bg.isVisible = true; // Show takeover terminal bg
    playUiSelectClick();
  }

  private startIntroSequence(): void {
    if (this.introStarted) return;
    this.introStarted = true;
    this.elapsed = 0;
    this.eventIndex = 0;
    this.prebootOverlay.isVisible = false;
    this.skipHint.text = 'HOLD TO SKIP';
    this.startIntroMusic();
    this.pendingIntroStart = false;
    this.pendingIntroStartTimer = 0;
  }

  private computeLayoutMetrics(): void {
    const idealW = this.gui.idealWidth || DESIGN_WIDTH;
    const idealH = this.gui.idealHeight || DESIGN_HEIGHT;
    const mobile = idealW <= 960;
    const baseScale = BASE_TEXT_SCALE;

    const aspect = idealW / Math.max(1, idealH);
    this.lineHeight = Math.round(30 * baseScale);
    this.topPadding = Math.round(14 * baseScale);
    const charW = 11.2 * baseScale;

    this.panel.height = aspect > 2.0 ? '88%' : '86%';

    const panelH = Math.max(320, this.panel.heightInPixels || (idealH * (aspect > 2.0 ? 0.88 : 0.86)));
    const headerPx = Math.round(52 * baseScale);
    const consoleTopPx = headerPx + 6;
    this.consoleViewport.top = `${consoleTopPx}px`;
    const footerPx = Math.round(96 * baseScale);
    const availableConsoleH = Math.max(220, Math.floor(panelH - consoleTopPx - footerPx - 18));
    const desiredConsoleH = this.topPadding + this.maxVisibleLines * this.lineHeight + 12;
    if (desiredConsoleH > availableConsoleH) {
      const fitLineHeight = Math.floor((availableConsoleH - this.topPadding - 12) / this.maxVisibleLines);
      this.lineHeight = Math.max(18, fitLineHeight);
    }
    const finalConsoleH = this.topPadding + this.maxVisibleLines * this.lineHeight + 12;
    this.consoleViewport.height = `${Math.max(180, finalConsoleH)}px`;

    const consoleH = Math.max(120, this.consoleViewport.heightInPixels || finalConsoleH);

    const vpHeight = Math.max(120, consoleH);
    // Keep fixed-capacity console behavior (23 lines) and size the viewport accordingly.

    const viewportWidth = Math.max(160, this.consoleViewport.widthInPixels || (idealW * 0.86));
    const maxWidth = Math.max(120, viewportWidth - 24);
    this.maxCharsPerConsoleLine = Math.max(8, Math.floor(maxWidth / charW));
    this.popupHost.width = mobile ? '92%' : '780px';
    this.popupHost.height = mobile ? '220px' : '220px';
    this.popupAvatarBox.width = mobile ? '150px' : '170px';
    this.popupAvatarBox.height = mobile ? '150px' : '170px';
    this.popupAvatar.width = mobile ? '140px' : '160px';
    this.popupAvatar.height = mobile ? '140px' : '160px';
    this.popupAvatarBox.left = mobile ? '14px' : '22px';
    this.popupText.left = mobile ? 184 : 208;
    this.popupText.width = mobile ? '63%' : '530px';
    this.popupText.height = mobile ? '170px' : '180px';
    this.popupText.fontSize = Math.round(24 * baseScale);
    if (this.prebootPanel) {
      const panelWidth = mobile
        ? Math.round(idealW * 0.92)
        : Math.max(520, Math.round(idealW * 0.58));
      const panelHeight = mobile
        ? Math.round(idealH * 0.5)
        : Math.max(320, Math.round(idealH * 0.42));
      this.prebootPanel.width = `${panelWidth}px`;
      this.prebootPanel.height = `${panelHeight}px`;
    }
    if (this.prebootButton) {
      this.prebootButton.height = `${Math.round((mobile ? 104 : 94) * baseScale)}px`;
      this.prebootButton.fontSize = Math.round(50 * baseScale);
      this.prebootButton.width = mobile ? '80%' : '66%';
    }
    if (this.prebootTitle) {
      this.prebootTitle.fontSize = Math.round(29 * baseScale);
      this.prebootTitle.top = `${Math.round(-92 * baseScale)}px`;
    }
    if (this.prebootSubtitle) {
      this.prebootSubtitle.fontSize = Math.round(22 * baseScale);
      this.prebootSubtitle.left = `${Math.round(26 * baseScale)}px`;
      this.prebootSubtitle.top = `${Math.round(-8 * baseScale)}px`;
      this.prebootSubtitle.height = `${Math.round(140 * baseScale)}px`;
    }
    if (this.prebootHint) {
      this.prebootHint.fontSize = Math.round(18 * baseScale);
      this.prebootHint.top = `${Math.round(155 * baseScale)}px`;
    }
    this.headerText.fontSize = Math.round(20 * baseScale);
    this.phaseLabel.fontSize = Math.round(17 * baseScale);
    this.footerLoaderLabel.fontSize = Math.round(17 * baseScale);
    this.skipHint.fontSize = Math.round(20 * baseScale);
    this.skipHint.top = '34px';
    this.skipHint.width = mobile ? '440px' : '400px';
    this.skipHint.left = '0px';
    this.skipHoldBarBg.width = mobile ? '440px' : '400px';
    this.skipHoldBarBg.height = `${Math.round((mobile ? 26 : 22) * baseScale)}px`;
    this.skipHoldBarBg.top = '34px';
  }

  private setupAudioUnlock(): void {
    const unlock = async () => {
      await this.typewriterSynth.unlock();
      this.typewriterSynth.triggerForTypedChar();
      window.setTimeout(() => this.typewriterSynth.triggerForTypedChar(), 26);
      const ctx = this.getAudioContext();
      if (ctx) {
        if (ctx.state !== 'running') {
          await ctx.resume();
        }
        this.voiceSynth.setAudioContext(ctx);
        this.typewriterSynth.attachContext(ctx);
      }
      this.introMusicUnlocked = true;
      if (this.audioUnlockHandler) {
        window.removeEventListener('pointerdown', this.audioUnlockHandler);
        window.removeEventListener('keydown', this.audioUnlockHandler);
        this.audioUnlockHandler = null;
      }
    };
    this.audioUnlockHandler = () => { void unlock(); };
    window.addEventListener('pointerdown', this.audioUnlockHandler, { passive: true });
    window.addEventListener('keydown', this.audioUnlockHandler);
  }

  private attachSkip(): void {
    const canHoldSkip = () => this.introStarted && this.elapsed >= SKIP_ALLOWED_AFTER_SECONDS && !this.fadeOut;
    const startHold = () => {
      if (!canHoldSkip()) return;
      this.skipHoldActive = true;
    };
    const stopHold = () => {
      this.skipHoldActive = false;
    };

    this.kbHandler = (e: KeyboardEvent) => {
      if (!this.introStarted) {
        this.queueIntroBootStart();
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') startHold();
    };
    window.addEventListener('keydown', this.kbHandler);
    this.kbUpHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') stopHold();
    };
    window.addEventListener('keyup', this.kbUpHandler);

    this.gui.rootContainer.isPointerBlocker = true;
    this.gui.rootContainer.onPointerDownObservable.add(() => {
      startHold();
    });
    this.pointerUpCleanupHandler = () => stopHold();
    window.addEventListener('pointerup', this.pointerUpCleanupHandler);
    window.addEventListener('pointercancel', this.pointerUpCleanupHandler);
  }

  private tick(dt: number): void {
    if (this.finished) return;
    if (!this.introStarted) {
      const blink = Math.sin(performance.now() * 0.004) > 0 ? 'Awaiting operator input...' : 'Awaiting operator input.._';
      this.prebootHint.text = blink;
      this.prebootAnimTime += dt;
      const idealH = this.gui.idealHeight || DESIGN_HEIGHT;
      if (this.prebootPulse) {
        this.prebootPulse.alpha = 0.05 + Math.sin(this.prebootAnimTime * 0.6) * 0.03;
      }
      if (this.prebootScanline) {
        const travel = Math.max(160, idealH * 0.6);
        const baseTop = -travel * 0.5;
        const y = baseTop + (Math.sin(this.prebootAnimTime * 0.35) * 0.5 + 0.5) * travel;
        this.prebootScanline.top = `${Math.round(y)}px`;
        this.prebootScanline.alpha = 0.06 + Math.sin(this.prebootAnimTime * 0.9) * 0.04;
      }
      if (this.pendingIntroStart) {
        this.pendingIntroStartTimer -= dt;
        if (this.pendingIntroStartTimer <= 0) {
          this.startIntroSequence();
        }
      }
      return;
    }
    this.elapsed += dt;

    this.computeLayoutMetrics();

    this.skipHint.text = this.skipHoldActive ? 'HOLDING... SKIP INTRO' : 'HOLD TO SKIP';
    this.skipHint.color = '#7fb3cf';
    this.skipHoldBarBg.isVisible = true;

    if (this.skipHoldActive && this.elapsed >= SKIP_ALLOWED_AFTER_SECONDS) {
      this.skipHoldProgress = Math.min(SKIP_HOLD_SECONDS, this.skipHoldProgress + dt);
      const ratio = this.skipHoldProgress / SKIP_HOLD_SECONDS;
      this.skipHoldBarFill.width = `${Math.round(ratio * 100)}%`;
      if (this.skipHoldProgress >= SKIP_HOLD_SECONDS) {
        this.finish();
      }
    } else if (this.skipHoldProgress > 0) {
      this.skipHoldProgress = Math.max(0, this.skipHoldProgress - dt);
      const ratio = this.skipHoldProgress / SKIP_HOLD_SECONDS;
      this.skipHoldBarFill.width = `${Math.round(ratio * 100)}%`;
    }

    let waitingForCheckpoint = false;
    while (this.eventIndex < this.timeline.length && this.elapsed >= this.timeline[this.eventIndex].at) {
      if (this.hasPendingConsoleWork()) {
        waitingForCheckpoint = true;
        break;
      }
      if (this.activeConsoleLoader) {
        waitingForCheckpoint = true;
        break;
      }
      const currentEvent = this.timeline[this.eventIndex];
      if (currentEvent.type === 'wait_popup' && this.popupVisible) {
        waitingForCheckpoint = true;
        break;
      }
      this.applyEvent(currentEvent);
      this.eventIndex++;
    }

    this.updateConsoleTyping(dt);
    this.updateConsoleLoader(dt);
    this.updateAmbientConsoleFill(dt, waitingForCheckpoint);
    this.updatePopup(dt);
    this.updatePulseShake(dt);
    this.updateLoader(dt);

    const naturalEndReady =
      !this.fadeOut
      && this.eventIndex >= this.timeline.length
      && !this.popupVisible
      && this.voiceSources.size === 0
      && !this.hasPendingConsoleWork();
    if (naturalEndReady) {
      if (!this.introMusicFadeOutActive) {
        this.startIntroMusicFadeOut(INTRO_MUSIC_FADE_OUT_SECONDS);
      } else if (this.introMusicFadeOutDone) {
        this.finish();
      }
    } else if (!this.fadeOut && this.elapsed >= INTRO_DURATION_SECONDS && !this.popupVisible && this.voiceSources.size === 0 && !this.hasPendingConsoleWork()) {
      if (!this.introMusicFadeOutActive) {
        this.startIntroMusicFadeOut(INTRO_MUSIC_FADE_OUT_SECONDS);
      } else if (this.introMusicFadeOutDone) {
        this.finish();
      }
    }

    this.updateIntroMusic(dt);

    if (this.fadeOut) {
      this.fadeTime += dt;
      this.fadeOverlay.alpha = Math.min(1, this.fadeTime / 0.55);
      if (this.fadeOverlay.alpha >= 1) {
        this.finished = true;
        setTimeout(() => this.onComplete(), 0);
      }
    }
  }

  private applyEvent(ev: IntroEvent): void {
    switch (ev.type) {
      case 'phase_marker': {
        const p = ev.phase ?? 'RUN';
        const label =
          p === 'A_STABLE' ? 'SYSTEM MODE // STABLE' :
          p === 'B_ANOMALY' ? 'SYSTEM MODE // DEGRADED' :
          p === 'C_TAKEOVER' ? 'AUTHORITY // SHIFTING' :
          p === 'D_CRASH_REBOOT' ? 'RUNTIME // RECOVERY' :
          p === 'E_PRISON_CONTEXT' ? 'RUNTIME // CONTAINMENT' :
          `STATUS // ${p}`;
        this.phaseLabel.text = label;
        this.headerText.color = p === 'A_STABLE' ? COLORS.line : (p === 'C_TAKEOVER' || p === 'D_CRASH_REBOOT' ? COLORS.daemon : COLORS.warn);
        break;
      }
      case 'console_line': {
        this.enqueueConsoleLine(ev.text ?? '', ev.color ?? COLORS.line, true);
        break;
      }
      case 'popup': {
        this.showPopup(
          ev.text ?? '',
          ev.popupEmotion ?? 'bored',
          ev.voicePreset ?? 'daemon_normal',
          ev.popupDuration ?? 3.8,
          ev.popupIntroEmotion,
          ev.popupIntroDuration,
          ev.popupIntroFrames,
        );
        break;
      }
      case 'loader': {
        if (ev.loaderLabel) this.bootProgressLabel = ev.loaderLabel;
        const cap = Number.isFinite(ev.loaderTarget) ? Math.max(16, Math.min(100, Math.round(ev.loaderTarget!))) : 100;
        this.startConsoleLoader(this.bootProgressLabel, cap);
        break;
      }
      case 'pulse': {
        this.pulseAlpha = Math.max(this.pulseAlpha, Math.min(1, ev.pulseStrength ?? 0.45));
        break;
      }
      case 'shake': {
        this.shakeTimer = Math.max(this.shakeTimer, 0.34);
        this.shakeStrength = Math.max(this.shakeStrength, Math.max(0.2, ev.shakeStrength ?? 0.5));
        break;
      }
      case 'wait_popup':
      case 'wait_voice':
        break;
      case 'log_clear': {
        this.clearConsole();
        break;
      }
      default:
        break;
    }
  }

  private enqueueConsoleLine(text: string, color: string, typing: boolean): void {
    const block = new TextBlock(`takeover_line_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    block.text = typing ? '' : text;
    block.color = color;
    block.fontFamily = 'Lucida Console, Courier New, monospace';
    block.fontSize = Math.round((this.gui.idealWidth && this.gui.idealWidth <= 960 ? 24 : 22) * BASE_TEXT_SCALE);
    block.height = `${this.lineHeight}px`;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textWrapping = false;
    block.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    this.consoleViewport.addControl(block);

    const line: ConsoleLine = {
      text,
      color,
      typing,
      index: 0,
      block,
      showCursor: false,
      displayText: typing ? '' : text,
    };
    this.consoleLines.push(line);

    if (typing && !this.currentTypingLine) {
      this.currentTypingLine = line;
      this.consoleTypeTimer = 0;
    }

    this.layoutConsoleLines();
  }

  private clearConsole(): void {
    for (const line of this.consoleLines) {
      this.consoleViewport.removeControl(line.block);
      line.block.dispose();
    }
    this.consoleLines = [];
    this.currentTypingLine = null;
    this.consoleViewport.removeControl(this.cursorLine);
    this.consoleViewport.addControl(this.cursorLine);
    this.layoutConsoleLines();
  }

  private layoutConsoleLines(): void {
    const visibleCapacity = this.maxVisibleLines;
    const start = Math.max(0, this.consoleLines.length - visibleCapacity);
    const visible = this.consoleLines.slice(start);

    for (let i = 0; i < visible.length; i++) {
      const line = visible[i];
      line.block.isVisible = true;
      line.block.top = `${this.topPadding + i * this.lineHeight}px`;
      line.block.alpha = i === 0 && start > 0 ? 0.75 : 1;
    }

    for (let i = 0; i < start; i++) {
      this.consoleLines[i].block.isVisible = false;
    }

  }

  private updateConsoleTyping(dt: number): void {
    const deltaMs = dt * 1000;
    this.cursorBlinkTimerMs += deltaMs;
    if (this.cursorBlinkTimerMs >= 420) {
      this.cursorBlinkTimerMs = 0;
      this.cursorVisible = !this.cursorVisible;
    }
    const cursor = this.cursorVisible ? ' _' : '  ';

    if (!this.currentTypingLine) {
      const next = this.consoleLines.find((l) => l.typing && l.index < l.text.length);
      if (next) this.currentTypingLine = next;
      else {
        this.refreshVisibleConsoleWithCursor(cursor);
        return;
      }
    }

    this.consoleTypeTimer += dt * this.consoleTypeSpeed;
    const burst = Math.floor(this.consoleTypeTimer);
    if (burst <= 0) return;
    this.consoleTypeTimer -= burst;

    let advanced = 0;
    while (advanced < burst && this.currentTypingLine && this.currentTypingLine.index < this.currentTypingLine.text.length) {
      this.currentTypingLine.index++;
      const typedNow = this.currentTypingLine.text.slice(0, this.currentTypingLine.index).replace(/\s_\s*$/, '');
      this.currentTypingLine.block.text = typedNow;
      advanced++;

      // Hard-wrap typing into a new console line to preserve console behavior
      // (cursor moves to next line start) and prevent bottom clipping.
      const wrapped = this.ensureTypingLineCapacity(cursor);
      if (wrapped) break;
    }
    if (advanced > 0) {
      const ticks = Math.min(3, Math.ceil(advanced / 6));
      for (let i = 0; i < ticks; i++) this.typewriterSynth.triggerForTypedChar();
    }

    if (this.currentTypingLine && this.currentTypingLine.index >= this.currentTypingLine.text.length) {
      this.currentTypingLine.block.text = this.currentTypingLine.text;
      this.currentTypingLine.displayText = this.currentTypingLine.text;
      this.currentTypingLine = null;
    }
    this.refreshVisibleConsoleWithCursor(cursor);
  }

  private refreshVisibleConsoleWithCursor(cursor: string): void {
    const visibleCapacity = this.maxVisibleLines;
    const start = Math.max(0, this.consoleLines.length - visibleCapacity);
    const visible = this.consoleLines.slice(start);
    if (visible.length <= 0) return;

    for (const line of visible) {
      line.showCursor = false;
      if (line.typing) {
        const typed = line.text.slice(0, line.index).replace(/\s_\s*$/, '');
        line.block.text = typed;
        line.displayText = typed;
      } else {
        line.block.text = line.displayText ?? line.text;
      }
    }

    const cursorTarget = this.currentTypingLine && this.currentTypingLine.block.isVisible
      ? this.currentTypingLine
      : visible[visible.length - 1];
    if (!cursorTarget || !cursorTarget.block.isVisible) return;
    const base = cursorTarget.typing
      ? cursorTarget.text.slice(0, cursorTarget.index).replace(/\s_\s*$/, '')
      : cursorTarget.text.replace(/\s_\s*$/, '');
    cursorTarget.block.text = `${base}${cursor}`;
    cursorTarget.showCursor = true;
  }

  private ensureTypingLineCapacity(cursor: string): boolean {
    if (!this.currentTypingLine) return false;
    while (
      this.currentTypingLine
      && this.currentTypingLine.index > this.maxCharsPerConsoleLine
      && this.currentTypingLine.index < this.currentTypingLine.text.length
    ) {
      const full = this.currentTypingLine.text;
      const splitAt = this.maxCharsPerConsoleLine;
      const head = full.slice(0, splitAt);
      const tail = full.slice(splitAt);
      this.currentTypingLine.text = head;
      this.currentTypingLine.block.text = head;
      this.currentTypingLine.displayText = head;
      this.currentTypingLine.typing = false;

      const continuation = new TextBlock(`takeover_line_wrap_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
      continuation.text = '';
      continuation.color = this.currentTypingLine.color;
      continuation.fontFamily = 'Lucida Console, Courier New, monospace';
      continuation.fontSize = Math.round((this.gui.idealWidth && this.gui.idealWidth <= 960 ? 24 : 22) * BASE_TEXT_SCALE);
      continuation.height = `${this.lineHeight}px`;
      continuation.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      continuation.textWrapping = false;
      continuation.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      continuation.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      this.consoleViewport.addControl(continuation);

      const nextLine: ConsoleLine = {
        text: tail,
        color: this.currentTypingLine.color,
        typing: true,
        // Start with a blinking cursor alone at line start, then continue typing next frame.
        index: 0,
        block: continuation,
        showCursor: false,
        displayText: '',
      };
      this.consoleLines.push(nextLine);
      this.currentTypingLine = nextLine;
      const typed = nextLine.text.slice(0, nextLine.index);
      nextLine.block.text = `${typed}${cursor}`;
      nextLine.displayText = typed;
      this.layoutConsoleLines();
      return true;
    }

    // Safety net: if runtime display capacity shrank while typing, keep active line visible.
    this.layoutConsoleLines();
    return false;
  }

  private hasPendingConsoleWork(): boolean {
    if (this.activeConsoleLoader) return true;
    if (this.currentTypingLine) return true;
    return this.consoleLines.some((l) => l.typing && l.index < l.text.length);
  }

  private showPopup(
    text: string,
    emotion: string,
    preset: VoicePresetName,
    duration: number,
    introEmotion?: string,
    introDuration?: number,
    introFrames?: string[],
  ): void {
    this.popupVisible = true;
    this.popupIn = true;
    this.popupOut = false;
    this.popupAnim = 0;
    this.popupTimer = 0;
    this.popupDuration = duration;
    this.popupTextFull = text;
    this.popupText.text = '';
    this.popupTextIndex = 0;
    this.popupTypeTimer = 0;
    this.popupHost.alpha = 0;
    this.popupHost.top = '-220px';
    this.popupHost.isVisible = true;

    const normalized = normalizeDaemonPresetName(emotion);
    this.popupMainFrames = DAEMON_ANIMATION_PRESETS[normalized] ?? DAEMON_ANIMATION_PRESETS.rire;
    const introNormalized = introEmotion ? normalizeDaemonPresetName(introEmotion) : null;
    this.popupIntroFrames = Array.isArray(introFrames) && introFrames.length > 0
      ? introFrames
      : (introNormalized ? (DAEMON_ANIMATION_PRESETS[introNormalized] ?? this.popupMainFrames) : []);
    this.popupIntroDuration = Math.max(0, introDuration ?? 0);
    this.popupIntroTimer = 0;
    this.popupUsingIntroFrames = this.popupIntroFrames.length > 0 && this.popupIntroDuration > 0;
    this.popupFrames = this.popupUsingIntroFrames ? this.popupIntroFrames : this.popupMainFrames;
    this.popupFrameIdx = 0;
    this.popupFrameTimer = 0;
    if (this.popupFrames.length > 0) {
      this.popupAvatar.source = buildHudAssetUrl(`avatar_frames_cutout2/${this.popupFrames[0]}`);
    }

    this.pulseAlpha = Math.max(this.pulseAlpha, 0.4);
    this.shakeTimer = Math.max(this.shakeTimer, 0.18);
    this.shakeStrength = Math.max(this.shakeStrength, 0.45);

    void this.speak(text, preset);
  }

  private updatePopup(dt: number): void {
    if (!this.popupVisible) return;

    if (this.popupIn) {
      this.popupAnim += dt;
      const t = Math.min(1, this.popupAnim / 0.36);
      this.popupHost.alpha = t;
      this.popupHost.top = `${-220 + (34 + 220) * t}px`;
      this.popupHost.left = '0px';
      if (t >= 1) {
        this.popupIn = false;
        this.popupAnim = 0;
      }
    }

    this.popupTypeTimer += dt * this.popupTypeSpeed;
    const add = Math.floor(this.popupTypeTimer);
    if (add > 0 && this.popupTextIndex < this.popupTextFull.length) {
      this.popupTypeTimer -= add;
      this.popupTextIndex = Math.min(this.popupTextFull.length, this.popupTextIndex + add);
      this.popupText.text = this.popupTextFull.slice(0, this.popupTextIndex);
      this.typewriterSynth.triggerForTypedChar();
    }

    this.popupFrameTimer += dt;
    if (this.popupUsingIntroFrames) {
      this.popupIntroTimer += dt;
      if (this.popupIntroTimer >= this.popupIntroDuration) {
        this.popupUsingIntroFrames = false;
        this.popupFrames = this.popupMainFrames;
        this.popupFrameIdx = 0;
        this.popupFrameTimer = 0;
        if (this.popupFrames.length > 0) {
          this.popupAvatar.source = buildHudAssetUrl(`avatar_frames_cutout2/${this.popupFrames[0]}`);
        }
      }
    }
    if (this.popupFrameTimer >= 0.15 && this.popupFrames.length > 1) {
      this.popupFrameTimer = 0;
      this.popupFrameIdx = (this.popupFrameIdx + 1) % this.popupFrames.length;
      this.popupAvatar.source = buildHudAssetUrl(`avatar_frames_cutout2/${this.popupFrames[this.popupFrameIdx]}`);
    }

    this.popupTimer += dt;
    if (!this.popupOut && this.popupTimer >= this.popupDuration) {
      this.popupOut = true;
      this.popupAnim = 0;
    }

    if (this.popupOut) {
      this.popupAnim += dt;
      const t = Math.min(1, this.popupAnim / 0.26);
      this.popupHost.alpha = 1 - t;
      this.popupHost.top = `${34 + (-220 - 34) * t}px`;
      this.popupHost.left = '0px';
      if (t >= 1) {
        this.popupVisible = false;
        this.popupOut = false;
        this.popupHost.isVisible = false;
      }
    }
  }

  private updatePulseShake(dt: number): void {
    this.pulseAlpha = Math.max(0, this.pulseAlpha - dt * 1.9);
    this.redPulseOverlay.isVisible = this.pulseAlpha > 0.01;
    this.glitchOverlay.isVisible = this.pulseAlpha > 0.01;
    const heavyPulse = this.pulseAlpha > 0.82 ? 1 : 0;
    this.redPulseOverlay.alpha = this.pulseAlpha * (heavyPulse ? 0.5 : 0.24);
    this.glitchOverlay.alpha = this.pulseAlpha * (heavyPulse ? 0.22 : 0.10);
    if (heavyPulse) {
      this.consoleViewport.background = 'rgba(28, 6, 10, 0.92)';
    } else {
      this.consoleViewport.background = 'rgba(2,8,18,0.86)';
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const ratio = this.shakeTimer / 0.34;
      const amp = (2.6 + this.shakeStrength * 4.4) * ratio;
      this.panel.left = `${(Math.random() * 2 - 1) * amp}px`;
      this.panel.top = `${(Math.random() * 2 - 1) * amp * 0.55}px`;
    } else {
      this.panel.left = '0px';
      this.panel.top = '0px';
      this.shakeStrength = 0;
    }
  }

  private updateLoader(dt: number): void {
    if (this.loaderMilestoneIndex < this.loaderMilestones.length) {
      this.loaderMilestoneTimer += dt;
      if (this.loaderMilestoneTimer >= 0.26) {
        this.loaderMilestoneTimer = 0;
        this.bootProgress = this.loaderMilestones[this.loaderMilestoneIndex];
        this.loaderMilestoneIndex++;
      }
    }

    // Mostly linear progress, with abrupt rollback on critical failures.
    const current = parseFloat((this.footerLoaderFill.width as string).replace('%', '')) || 0;
    let next = current;
    if (this.bootProgress < current - 10) {
      next = this.bootProgress;
      this.footerLoaderFill.background = '#ff4f75';
      this.footerLoaderLabel.color = '#ff8da2';
      this.pulseAlpha = Math.max(this.pulseAlpha, 0.9);
      this.shakeTimer = Math.max(this.shakeTimer, 0.28);
      this.shakeStrength = Math.max(this.shakeStrength, 0.72);
    } else {
      const speed = this.bootProgress > current ? 26 : 16;
      next = Math.abs(this.bootProgress - current) <= 0.3
        ? this.bootProgress
        : current + Math.sign(this.bootProgress - current) * speed * dt;
      if (this.bootProgress >= current) {
        this.footerLoaderFill.background = '#71d0ff';
        this.footerLoaderLabel.color = COLORS.line;
      }
    }
    const clamped = Math.max(0, Math.min(100, next));
    this.footerLoaderFill.width = `${clamped.toFixed(1)}%`;
    this.footerLoaderLabel.text = `${this.bootProgressLabel}... ${Math.floor(clamped)}%`;

    if (clamped >= 99.7 && this.bootProgress >= 100) {
      this.footerLoaderFill.background = '#ff4f75';
      this.footerLoaderLabel.color = '#ff8da2';
      this.footerLoaderLabel.text = `Daemonized... 100%`;
    }
  }

  private startConsoleLoader(label: string, cap: number, affectFooterProgress = true, duration = 1.05): void {
    const progressStart = this.bootProgress;
    const block = new TextBlock(`takeover_loader_line_${Date.now()}`);
    block.text = `${label.toLowerCase().replace(/\s+/g, '_')}=[..........] 0%`;
    block.color = COLORS.dim;
    block.fontFamily = 'Lucida Console, Courier New, monospace';
    block.fontSize = Math.round((this.gui.idealWidth && this.gui.idealWidth <= 960 ? 24 : 22) * BASE_TEXT_SCALE);
    block.height = `${this.lineHeight}px`;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.consoleViewport.addControl(block);

    const initial = `${label.toLowerCase().replace(/\s+/g, '_')}=[..........] 0%`;
    this.consoleLines.push({
      text: initial,
      color: COLORS.dim,
      typing: false,
      index: 0,
      block,
      showCursor: false,
      displayText: initial,
    });
    this.layoutConsoleLines();
    this.activeConsoleLoader = {
      block,
      label,
      progress: 0,
      duration,
      elapsed: 0,
    };
    if (affectFooterProgress) {
      this.loaderMilestones = this.buildLoaderMilestones(progressStart, cap);
      this.loaderMilestoneIndex = 0;
      this.loaderMilestoneTimer = 0;
    }
  }

  private updateConsoleLoader(dt: number): void {
    if (!this.activeConsoleLoader) return;
    const loader = this.activeConsoleLoader;
    loader.elapsed += dt;
    const t = Math.max(0, Math.min(1, loader.elapsed / loader.duration));
    const eased = 1 - Math.pow(1 - t, 2);
    loader.progress = Math.round(eased * 100);
    const bars = Math.max(0, Math.min(10, Math.round(loader.progress / 10)));
    const barText = `${'#'.repeat(bars)}${'.'.repeat(10 - bars)}`;
    const live = `${loader.label.toLowerCase().replace(/\s+/g, '_')}=[${barText}] ${loader.progress}%`;
    loader.block.text = live;
    const trackedLine = this.consoleLines.find((line) => line.block === loader.block);
    if (trackedLine) {
      trackedLine.text = live;
      trackedLine.displayText = live;
    }
    if (loader.elapsed >= loader.duration) {
      const done = `${loader.label.toLowerCase().replace(/\s+/g, '_')}=[##########] 100%`;
      loader.block.text = done;
      if (trackedLine) {
        trackedLine.text = done;
        trackedLine.displayText = done;
      }
      this.activeConsoleLoader = null;
    }
  }

  private buildLoaderMilestones(from: number, to: number): number[] {
    const start = Math.max(0, Math.min(100, Math.floor(from)));
    const end = Math.max(0, Math.min(100, Math.floor(to)));
    if (start === end) return [end];
    const delta = end - start;
    const steps = Math.max(3, Math.min(7, Math.ceil(Math.abs(delta) / 12)));
    const out: number[] = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const v = Math.round(start + delta * t);
      if (out.length === 0 || v !== out[out.length - 1]) out.push(v);
    }
    if (out[out.length - 1] !== end) out.push(end);
    return out;
  }

  private updateAmbientConsoleFill(dt: number, waitingForCheckpoint: boolean): void {
    if (!waitingForCheckpoint || this.currentTypingLine || this.activeConsoleLoader) {
      this.ambientFillTimer = 0;
      return;
    }

    this.ambientFillTimer += dt;
    if (this.ambientFillTimer < 1.15) return;
    this.ambientFillTimer = 0;

    const fillers = [
      '> sync.keepalive',
      '> trace.buffer.flush................. [ OK ]',
      '> io.queue.stabilize................. [ OK ]',
      '> daemon.telemetry.tick.............. [ OK ]',
      '> watch.thread=alive',
      '> checkpoint.awaiting.voice',
      '> cache.page.rotate.................. [ OK ]',
      '> heartbeat',
    ];
    const text = fillers[this.ambientFillIndex % fillers.length];
    this.ambientFillIndex++;
    const tone = this.popupVisible ? COLORS.warn : COLORS.dim;
    if (text.includes('keepalive')) {
      this.startConsoleLoader('sync.keepalive', 100, false, 0.9);
      return;
    }
    if (text.includes('heartbeat')) {
      this.startConsoleLoader('heartbeat', 100, false, 0.82);
      return;
    }
    this.enqueueConsoleLine(text, tone, true);
  }

  private async speak(text: string, preset: VoicePresetName): Promise<void> {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
      this.voiceSynth.setAudioContext(ctx);
      const { buffer } = await this.voiceSynth.synthesize(text, preset);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.58;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      this.voiceSources.add(source);
      source.onended = () => {
        this.voiceSources.delete(source);
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      };
    } catch (error) {
      console.warn('[DaemonTakeoverIntroScene] Voice synth failed:', error);
    }
  }

  private stopVoicePlayback(): void {
    this.voiceSources.forEach((s) => {
      try { s.stop(); } catch {}
    });
    this.voiceSources.clear();
  }

  private getAudioContext(): AudioContext | null {
    const engineCtx = (this.scene.getEngine() as any)?.audioEngine?.audioContext as AudioContext | undefined;
    if (engineCtx) return engineCtx;
    if (!this.localAudioContext) {
      try {
        this.localAudioContext = new AudioContext();
      } catch {
        this.localAudioContext = null;
      }
    }
    return this.localAudioContext;
  }

  private getIntroMusicPathCandidates(): string[] {
    return [
      buildHudAssetUrl('music/intro.mp3'),
      buildHudAssetUrl('music/menu.mp3'),
    ];
  }

  private startIntroMusic(): void {
    if (this.introMusic) return;
    const candidates = this.getIntroMusicPathCandidates();
    const audio = new Audio(candidates[0]);
    audio.loop = true;
    audio.preload = 'auto';
    audio.playbackRate = INTRO_MUSIC_PLAYBACK_RATE;
    audio.volume = 0;
    const seekToOffset = () => {
      try {
        if (Number.isFinite(audio.duration) && audio.duration > INTRO_MUSIC_START_OFFSET_SECONDS) {
          audio.currentTime = INTRO_MUSIC_START_OFFSET_SECONDS;
        }
      } catch {}
    };
    audio.addEventListener('loadedmetadata', seekToOffset, { once: true });
    audio.onerror = () => {
      if (audio.src !== candidates[1]) {
        audio.src = candidates[1];
        audio.load();
        if (this.introMusicUnlocked) {
          void audio.play().catch(() => {});
        }
      }
    };
    this.introMusic = audio;
    this.introMusicFadeInActive = true;
    this.introMusicFadeOutActive = false;
    this.introMusicFadeOutDone = false;
    this.introMusicFadeTimer = 0;
    if (this.introMusicUnlocked) {
      seekToOffset();
      void this.introMusic.play().catch(() => {});
    }
  }

  private startIntroMusicFadeOut(duration: number): void {
    if (!this.introMusic) return;
    this.introMusicFadeOutActive = true;
    this.introMusicFadeInActive = false;
    this.introMusicFadeOutDone = false;
    this.introMusicFadeTimer = 0;
  }

  private updateIntroMusic(dt: number): void {
    if (!this.introMusic) return;
    if (this.introMusicUnlocked && this.introMusic.paused && !this.introMusicFadeOutActive) {
      void this.introMusic.play().catch(() => {});
    }
    if (this.introMusicFadeInActive) {
      if (this.introMusic.paused) return;
      this.introMusicFadeTimer += dt;
      const t = Math.min(1, this.introMusicFadeTimer / INTRO_MUSIC_FADE_IN_SECONDS);
      this.introMusic.volume = INTRO_MUSIC_TARGET_VOLUME * t;
      if (t >= 1) {
        this.introMusicFadeInActive = false;
        this.introMusicFadeTimer = 0;
      }
    } else if (this.introMusicFadeOutActive) {
      this.introMusicFadeTimer += dt;
      const t = Math.min(1, this.introMusicFadeTimer / INTRO_MUSIC_FADE_OUT_SECONDS);
      this.introMusic.volume = INTRO_MUSIC_TARGET_VOLUME * (1 - t);
      if (t >= 1) {
        this.introMusic.volume = 0;
        try { this.introMusic.pause(); } catch {}
        this.introMusicFadeOutDone = true;
      }
    }
  }

  private stopIntroMusic(immediate: boolean): void {
    if (!this.introMusic) return;
    if (immediate) this.introMusic.volume = 0;
    try { this.introMusic.pause(); } catch {}
    this.introMusic.src = '';
    this.introMusic.load();
    this.introMusic = null;
    this.introMusicFadeInActive = false;
    this.introMusicFadeOutActive = false;
    this.introMusicFadeOutDone = false;
    this.introMusicFadeTimer = 0;
  }

  private finish(): void {
    if (this.fadeOut || this.finished) return;
    this.fadeOut = true;
    this.fadeTime = 0;
  }
}
