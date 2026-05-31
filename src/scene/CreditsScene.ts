import { Color4, Engine, FreeCamera, Scene, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Image, Rectangle, TextBlock } from '@babylonjs/gui';
import { DaemonVoiceSynth, VOICE_PRESETS } from '../audio/DaemonVoiceSynth';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../data/voicelines/DaemonAnimationPresets';
import { createMenuMatrixBackground } from './MenuMatrixBackground';
import { UI_LAYER } from '../ui/uiLayers';
import { applyResponsiveGuiScaling } from '../ui/GuiScaling';
import { BASE_TEXT_SCALE } from '../ui/UITheme';
import { buildHudAssetUrl } from '../systems/hud/HudAssetPaths';
import { playUiSelectClick } from '../audio/UiSelectClick';

type VoicePresetName = keyof typeof VOICE_PRESETS;

type CreditsLine = {
  text: string;
  color?: string;
  typingSpeed?: number;
  hold?: number;
  monospaced?: boolean;
  popup?: {
    text: string;
    emotion: string;
    preset: VoicePresetName;
    duration?: number;
  };
  animatedFrames?: string[];
  animatedFrameInterval?: number;
};

type ConsoleLineControl = {
  block: TextBlock;
  y: number;
};

type PopupRequest = {
  text: string;
  emotion: string;
  preset: VoicePresetName;
  duration: number;
};

export class CreditsScene {
  private readonly scene: Scene;
  private readonly gui: AdvancedDynamicTexture;
  private readonly daemonVoiceSynth = DaemonVoiceSynth.getInstance();
  private readonly daemonTypewriterSynth = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);
  private readonly voiceSources = new Set<AudioBufferSourceNode>();
  private localAudioContext: AudioContext | null = null;

  private readonly lines: CreditsLine[];
  private readonly consoleLineControls: ConsoleLineControl[] = [];

  private readonly consoleBody: Rectangle;
  private readonly consoleViewport: Rectangle;
  private readonly popupHost: Rectangle;
  private readonly popupBubble: Rectangle;
  private readonly popupText: TextBlock;
  private readonly popupAvatar: Image;
  private readonly titleLeft: TextBlock;
  private readonly titleRight: TextBlock;
  private readonly titleAvatar: Image;

  private currentLineIndex = 0;
  private currentLineBlock: TextBlock | null = null;
  private currentLineText = '';
  private currentLineTyped = 0;
  private currentLineTypingSpeed = 52;
  private currentLineHold = 0.6;
  private typingAccumulator = 0;
  private interLineTimer = 0;
  private pendingStartLine = true;
  private pendingLineStartBlink = 0;
  private lineSpacing = Math.round(30 * BASE_TEXT_SCALE);
  private readonly consoleTopPadding = Math.round(14 * BASE_TEXT_SCALE);
  private spawnLineY = this.consoleTopPadding;
  private maxVisibleLines = 14;
  private consoleFilled = false;

  private popupTimer = 0;
  private popupDuration = 0;
  private popupVisible = false;
  private popupFrameTimer = 0;
  private popupFrameIndex = 0;
  private popupFrameList: string[] = [];
  private popupTypingText = '';
  private popupTypingIndex = 0;
  private popupTypingSpeed = 52;
  private popupTypingAccumulator = 0;
  private popupAnimatingIn = false;
  private popupAnimatingOut = false;
  private popupAnimTimer = 0;
  private popupYHidden = -260;
  private popupYShown = 18;
  private readonly popupQueue: PopupRequest[] = [];
  private sceneClock = 0;
  private popupSequenceStarted = false;
  private nextPopupAllowedAt = 0;
  private readonly popupGapAfterVoiceSeconds = 4.0;
  private activePopupVoiceId = 0;

  private titleAnimTimer = 0;
  private titleFrameIndex = 0;
  private readonly titleFrames = ['rire_01.png', 'rire_02.png', 'rire_03.png', 'rire_04.png'];
  private activeLineAnimatedFrames: string[] | null = null;
  private activeLineAnimatedFrameInterval = 0.12;
  private activeLineAnimatedFrameTimer = 0;
  private activeLineAnimatedFrameIndex = 0;
  private activeLineAnimatedFinished = false;
  private cursorBlinkTimer = 0;
  private cursorVisible = true;
  private readonly cursorChar = '_';

  private readonly updateObserver: ReturnType<Scene['onBeforeRenderObservable']['add']>;
  private readonly pointerObserver: ReturnType<Scene['onPointerObservable']['add']>;

  constructor(private readonly engine: Engine, private readonly onBack: () => void) {
    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromHexString('#05030DFF');
    createMenuMatrixBackground(this.scene);

    const camera = new FreeCamera('creditsCamera', new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    this.scene.activeCamera = camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('CreditsUI', true, this.scene);
    applyResponsiveGuiScaling(this.gui, this.engine);
    if (this.gui.layer) {
      this.gui.layer.layerMask = UI_LAYER;
    }

    const root = new Rectangle('creditsRoot');
    root.width = 1;
    root.height = 1;
    root.thickness = 0;
    root.background = 'transparent';
    this.gui.addControl(root);

    const titleContainer = new Rectangle('creditsTitleContainer');
    titleContainer.thickness = 0;
    titleContainer.width = '1200px';
    titleContainer.height = '140px';
    titleContainer.top = '-300px';
    titleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    titleContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(titleContainer);

    this.titleLeft = new TextBlock('creditsTitleLeft', 'DAEMON');
    this.titleLeft.fontFamily = 'Wonder8Bit';
    this.titleLeft.fontSize = 72;
    this.titleLeft.color = '#D8C9FF';
    this.titleLeft.width = '500px';
    this.titleLeft.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.titleLeft.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    titleContainer.addControl(this.titleLeft);

    this.titleAvatar = new Image('creditsTitleDaemon', this.avatarFrameSrc(this.titleFrames[0]));
    this.titleAvatar.width = '120px';
    this.titleAvatar.height = '120px';
    this.titleAvatar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.titleAvatar.stretch = Image.STRETCH_UNIFORM;
    titleContainer.addControl(this.titleAvatar);

    this.titleRight = new TextBlock('creditsTitleRight', 'DUNGEON');
    this.titleRight.fontFamily = 'Wonder8Bit';
    this.titleRight.fontSize = 72;
    this.titleRight.color = '#D8C9FF';
    this.titleRight.width = '500px';
    this.titleRight.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.titleRight.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleContainer.addControl(this.titleRight);

    const subtitle = new TextBlock('creditsSubtitle', 'SYSTEM CORE // CREDITS CHANNEL');
    subtitle.color = '#9EEBFF';
    subtitle.fontFamily = 'Arcade8Bit';
    subtitle.fontSize = Math.round(19 * BASE_TEXT_SCALE);
    subtitle.top = '-240px';
    subtitle.height = `${Math.round(34 * BASE_TEXT_SCALE)}px`;
    subtitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    subtitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(subtitle);

    this.consoleBody = new Rectangle('creditsConsoleBody');
    this.consoleBody.width = '92%';
    this.consoleBody.height = '70%';
    this.consoleBody.top = '84px';
    this.consoleBody.cornerRadius = 0;
    this.consoleBody.thickness = 2;
    this.consoleBody.color = '#1f3f57';
    this.consoleBody.background = '#060f1be8';
    this.consoleBody.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.consoleBody.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(this.consoleBody);

    const consoleHeaderLeft = new TextBlock('creditsConsoleHeaderLeft', 'CREDITS CONSOLE');
    consoleHeaderLeft.height = `${Math.round(40 * BASE_TEXT_SCALE)}px`;
    consoleHeaderLeft.top = '10px';
    consoleHeaderLeft.color = '#9EEBFF';
    consoleHeaderLeft.fontFamily = 'Arcade8Bit';
    consoleHeaderLeft.fontSize = Math.round(22 * BASE_TEXT_SCALE);
    consoleHeaderLeft.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    consoleHeaderLeft.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    consoleHeaderLeft.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    consoleHeaderLeft.width = '100%';
    consoleHeaderLeft.paddingLeft = '3%';
    this.consoleBody.addControl(consoleHeaderLeft);

    const consoleHeaderRight = new TextBlock('creditsConsoleHeaderRight', 'system_core://credits --archive --tone=bitter-sweet');
    consoleHeaderRight.height = `${Math.round(40 * BASE_TEXT_SCALE)}px`;
    consoleHeaderRight.top = '10px';
    consoleHeaderRight.color = '#8ccbf0';
    consoleHeaderRight.fontFamily = 'Arcade8Bit';
    consoleHeaderRight.fontSize = Math.round(18 * BASE_TEXT_SCALE);
    consoleHeaderRight.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    consoleHeaderRight.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    consoleHeaderRight.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    consoleHeaderRight.width = '100%';
    consoleHeaderRight.paddingRight = '3%';
    this.consoleBody.addControl(consoleHeaderRight);

    this.consoleViewport = new Rectangle('creditsConsoleViewport');
    this.consoleViewport.width = '94%';
    this.consoleViewport.height = '78%';
    this.consoleViewport.top = '40px';
    this.consoleViewport.thickness = 0;
    this.consoleViewport.clipChildren = true;
    this.consoleViewport.background = '#030a14d0';
    this.consoleViewport.cornerRadius = 0;
    this.consoleBody.addControl(this.consoleViewport);

    const topFadeLayers = [
      { h: 10, a: 0.34 },
      { h: 10, a: 0.22 },
      { h: 10, a: 0.14 },
      { h: 10, a: 0.08 },
    ];
    let fadeOffset = 0;
    topFadeLayers.forEach((layer, idx) => {
      const fade = new Rectangle(`creditsFadeTop_${idx}`);
      fade.width = 1;
      fade.height = `${layer.h}px`;
      fade.thickness = 0;
      fade.background = '#030a14';
      fade.alpha = layer.a;
      fade.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      fade.top = `${fadeOffset}px`;
      this.consoleViewport.addControl(fade);
      fadeOffset += layer.h;
    });

    const fadeBottom = new Rectangle('creditsFadeBottom');
    fadeBottom.width = 1;
    fadeBottom.height = '20px';
    fadeBottom.thickness = 0;
    fadeBottom.background = '#030a14';
    fadeBottom.alpha = 0.95;
    fadeBottom.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.consoleViewport.addControl(fadeBottom);

    this.popupHost = new Rectangle('daemonPopupHost');
    this.popupHost.width = '900px';
    this.popupHost.height = '280px';
    this.popupHost.thickness = 0;
    this.popupHost.top = `${this.popupYHidden}px`;
    this.popupHost.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.popupHost.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.popupHost.alpha = 0;
    root.addControl(this.popupHost);

    this.popupBubble = new Rectangle('daemonPopupBubble');
    this.popupBubble.width = 1;
    this.popupBubble.height = 1;
    this.popupBubble.cornerRadius = 0;
    this.popupBubble.color = '#FF3B5C';
    this.popupBubble.thickness = 2;
    this.popupBubble.background = 'rgba(20, 0, 6, 0.85)';
    this.popupHost.addControl(this.popupBubble);

    const avatarBox = new Rectangle('daemonPopupAvatarBox');
    avatarBox.width = '190px';
    avatarBox.height = '190px';
    avatarBox.left = '24px';
    avatarBox.thickness = 1;
    avatarBox.color = '#FF7A8F';
    avatarBox.background = 'rgba(90, 0, 12, 0.6)';
    avatarBox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    avatarBox.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupBubble.addControl(avatarBox);

    this.popupAvatar = new Image('daemonPopupAvatar', this.avatarFrameSrc('init_01.png'));
    this.popupAvatar.width = '180px';
    this.popupAvatar.height = '180px';
    this.popupAvatar.stretch = Image.STRETCH_UNIFORM;
    avatarBox.addControl(this.popupAvatar);

    this.popupText = new TextBlock('daemonPopupText', '');
    // Mirror HUD daemon popup layout exactly.
    this.popupText.width = '640px';
    this.popupText.left = 236;
    this.popupText.top = 0;
    this.popupText.textWrapping = true;
    this.popupText.resizeToFit = false;
    this.popupText.color = '#FFD1DA';
    this.popupText.fontFamily = 'Arcade8Bit';
    this.popupText.fontSize = Math.round(31 * BASE_TEXT_SCALE);
    this.popupText.height = '224px';
    this.popupText.textWrapping = true;
    this.popupText.lineSpacing = '2px';
    this.popupText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupBubble.addControl(this.popupText);

    const backButton = Button.CreateSimpleButton('creditsBackButton', 'BACK');
    backButton.width = '330px';
    backButton.height = '62px';
    backButton.cornerRadius = 8;
    backButton.color = '#9ef7ff';
    backButton.background = 'rgba(10, 30, 38, 0.94)';
    backButton.thickness = 2;
    backButton.fontSize = 30;
    backButton.fontFamily = 'Wonder8Bit';
    backButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    backButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    backButton.top = '84%';
    if (backButton.textBlock) backButton.textBlock.color = '#FFFFFF';
    backButton.onPointerClickObservable.add(() => {
      playUiSelectClick(0.8);
      this.onBack();
    });
    root.addControl(backButton);

    this.lines = this.buildCreditsLines();
    this.computeConsoleCapacity();
    this.primeAudio();

    this.updateObserver = this.scene.onBeforeRenderObservable.add(() => this.update(this.engine.getDeltaTime() / 1000));
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== 1) return;
      const maybeAudioContext = this.getAudioContext();
      if (maybeAudioContext && maybeAudioContext.state !== 'running') {
        void maybeAudioContext.resume();
      }
    });
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    if (this.updateObserver) this.scene.onBeforeRenderObservable.remove(this.updateObserver);
    if (this.pointerObserver) this.scene.onPointerObservable.remove(this.pointerObserver);
    this.stopVoicePlayback();
    this.daemonTypewriterSynth.dispose();
    this.gui.dispose();
    this.scene.dispose();
  }

  private buildCreditsLines(): CreditsLine[] {
    return [
      { text: '> boot credits://session.qldl', color: '#BFD8FF', typingSpeed: 60, hold: 0.22 },
      { text: '> mounting archive volume... [OK]', color: '#9ACBFF', typingSpeed: 58, hold: 0.16 },
      { text: '> loading production logs... [OK]', color: '#9ACBFF', typingSpeed: 58, hold: 0.16 },
      {
        text: '> credits_stream=[###.................] 014%',
        color: '#8EE8FF',
        typingSpeed: 62,
        hold: 0.95,
        animatedFrames: [
          '> credits_stream=[###.................] 014%',
          '> credits_stream=[######..............] 028%',
          '> credits_stream=[##########..........] 046%',
          '> credits_stream=[##############......] 068%',
          '> credits_stream=[##################..] 090%',
          '> credits_stream=[####################] 100%',
        ],
        animatedFrameInterval: 0.13,
      },
      {
        text: '> channel open // daemon observation enabled',
        color: '#A9F2DD',
        popup: {
          text: 'You wanted credits. Fine. I will allow controlled nostalgia.',
          emotion: 'superieur',
          preset: 'daemon_normal',
          duration: 3.2,
        },
      },
      { text: '> context: three humans entered an unstable simulation', color: '#D8C1FF', hold: 0.12 },
      { text: '> result: they shipped anyway', color: '#D8C1FF', hold: 0.12 },
      { text: '', hold: 0.1 },
      { text: 'TEAM :: QLDL', color: '#F0CCFF', typingSpeed: 50, hold: 0.1 },
      { text: '  Pierre "P13R04" Constantin', color: '#F1DEFF', hold: 0.06 },
      { text: '  Baptiste "Toste13f" Giacchero', color: '#F1DEFF', hold: 0.06 },
      { text: '  Vlad "Rolling2k" Vasiliev', color: '#F1DEFF', hold: 0.08 },
      { text: '  // collective alias: Team QLDL', color: '#D8C1FF', hold: 0.12 },
      { text: '', hold: 0.1 },
      { text: 'SPECIAL THANKS :: Michel Buffa', color: '#FFE2FC', hold: 0.2 },
      {
        text: '> parsing commit archaeology...',
        color: '#CFB0FF',
        popup: {
          text: 'Three humans. One haunted codebase. Still no rollback.',
          emotion: 'rire',
          preset: 'daemon_normal',
          duration: 3.1,
        },
      },
      {
        text: '> daemon.note :: gratitude packet detected',
        color: '#A5E8FF',
        popup: {
          text: 'Yes, this is me saying thank you. Do not get used to it.',
          emotion: 'bored',
          preset: 'daemon_normal',
          duration: 3.0,
        },
      },
      { text: 'core systems delivered:', color: '#D7BEFF' },
      { text: ' - class kits: wizard_installer / firewall / glitch', color: '#E8D8FF' },
      { text: ' - procedural sectors, boss rooms, runtime traps', color: '#E8D8FF' },
      { text: ' - daemon director AI and reactive voice taunts', color: '#E8D8FF' },
      { text: ' - codex, achievements, progression and replay variants', color: '#E8D8FF' },
      { text: '', hold: 0.1 },
      {
        text: '> daemon.audit :: module load quality acceptable',
        color: '#A5E8FF',
        popup: {
          text: 'Against all odds, your architecture stayed coherent. Mostly.',
          emotion: 'superieur',
          preset: 'daemon_normal',
          duration: 3.0,
        },
      },
      { text: 'incident report:', color: '#FFBBE5' },
      { text: ' - build survived forbidden commits and heroic bug hunts', color: '#FFD8F2' },
      { text: ' - at least one optimization happened at 03:17 AM', color: '#FFD8F2' },
      { text: ' - several crashes were promoted to features', color: '#FFD8F2' },
      { text: ' - quality assurance included panic, coffee, and faith', color: '#FFD8F2' },
      { text: '', hold: 0.1 },
      {
        text: '> hidden_reference.inject("All your base are belong to us")',
        color: '#ff7ea7',
        hold: 0.18,
      },
      { text: '> easter_egg.status=[DELIGHTFULLY_UNNECESSARY]', color: '#D8C1FF', hold: 0.16 },
      { text: '> sidequest.log :: cat.class still classified', color: '#D8C1FF', hold: 0.12 },
      { text: '', hold: 0.1 },
      {
        text: '> daemon note pending...',
        color: '#A5E8FF',
        popup: {
          text: 'I expected surrender. You kept adapting. Annoying. Impressive.',
          emotion: 'bored',
          preset: 'daemon_normal',
          duration: 3.4,
        },
      },
      { text: '> archiving test-subject milestones...', color: '#A5E8FF', typingSpeed: 62, hold: 0.12 },
      { text: '> no input required. this stream is deterministic.', color: '#A5E8FF', typingSpeed: 60, hold: 0.16 },
      { text: '', hold: 0.1 },
      {
        text: '> daemon.mood :: suspiciously sentimental',
        color: '#A5E8FF',
        popup: {
          text: "Do not misunderstand. This is not kindness. It's calibrated respect.",
          emotion: 'bored',
          preset: 'daemon_normal',
          duration: 3.2,
        },
      },
      { text: 'THANKS STREAM // live registry:', color: '#FFE7FA', hold: 0.12 },
      { text: ' - everyone who tested unstable versions and still came back', color: '#F3DBFF', hold: 0.06 },
      { text: ' - everyone who reported bugs with terrifying precision', color: '#F3DBFF', hold: 0.06 },
      { text: ' - everyone who shared clips, theories, and weird clears', color: '#F3DBFF', hold: 0.06 },
      { text: ' - everyone who kept pushing through failed runs', color: '#F3DBFF', hold: 0.06 },
      { text: ' - everyone who turned feedback into momentum', color: '#F3DBFF', hold: 0.08 },
      { text: ' - everyone who failed, retried, and got better anyway', color: '#F3DBFF', hold: 0.08 },
      { text: ' - and you', color: '#FFFFFF', typingSpeed: 42, hold: 0.52 },
      {
        text: '> daemon.observation :: perseverance signal detected',
        color: '#A5E8FF',
        popup: {
          text: 'You kept rerunning impossible rooms and called it progress. Correct.',
          emotion: 'superieur',
          preset: 'daemon_normal',
          duration: 3.0,
        },
      },
      {
        text: '> credits stream complete',
        color: '#CFB5FF',
        hold: 0.85,
      },
      { text: '> flushing sentiment buffer... [OK]', color: '#C7B0F2', hold: 0.45 },
      { text: '> sealing log archive... [OK]', color: '#C7B0F2', hold: 0.45 },
      { text: '> publishing final status packet...', color: '#C7B0F2', hold: 0.55 },
      {
        text: '> final_daemon_note: "I almost felt something. Almost."',
        color: '#FFB5CD',
        popup: {
          text: "I almost believed in hope for a second. Don't make this weird. You passed my tests. Barely. Keep going, little anomaly.",
          emotion: 'bored',
          preset: 'daemon_normal',
          duration: 4.4,
        },
        hold: 1.0,
      },
      {
        text: '> end_of_stream // return when your persistence compiles',
        color: '#CFB5FF',
        typingSpeed: 64,
        hold: 999,
      },
    ];
  }

  private update(deltaSeconds: number): void {
    this.sceneClock += deltaSeconds;
    this.updateTitleAnimation(deltaSeconds);
    this.updateConsoleFlow(deltaSeconds);
    this.updatePopup(deltaSeconds);
    this.processPopupQueue();
  }

  private updateConsoleFlow(deltaSeconds: number): void {
    this.cursorBlinkTimer += deltaSeconds;
    if (this.cursorBlinkTimer >= 0.42) {
      this.cursorBlinkTimer = 0;
      this.cursorVisible = !this.cursorVisible;
    }

    if (this.pendingStartLine) {
      if (this.pendingLineStartBlink > 0 && this.currentLineBlock) {
        this.pendingLineStartBlink -= deltaSeconds;
        this.renderCurrentLine('');
        return;
      }
      this.startNextLine();
      this.pendingStartLine = false;
      return;
    }

    if (!this.currentLineBlock) {
      this.interLineTimer -= deltaSeconds;
      if (this.interLineTimer <= 0) {
        this.pendingStartLine = true;
      }
      return;
    }

    if (this.currentLineTyped < this.currentLineText.length) {
      this.typingAccumulator += deltaSeconds * this.currentLineTypingSpeed;
      const nextChars = Math.floor(this.typingAccumulator);
      if (nextChars > 0) {
        this.typingAccumulator -= nextChars;
        this.currentLineTyped = Math.min(this.currentLineText.length, this.currentLineTyped + nextChars);
        this.renderCurrentLine(this.currentLineText.slice(0, this.currentLineTyped));
        this.daemonTypewriterSynth.triggerForTypedChar();
      }
      if (nextChars <= 0) {
        this.renderCurrentLine(this.currentLineText.slice(0, this.currentLineTyped));
      }
      return;
    }

    if (this.currentLineBlock && this.activeLineAnimatedFrames && this.activeLineAnimatedFrames.length > 1) {
      this.activeLineAnimatedFrameTimer += deltaSeconds;
      if (!this.activeLineAnimatedFinished && this.activeLineAnimatedFrameTimer >= this.activeLineAnimatedFrameInterval) {
        this.activeLineAnimatedFrameTimer = 0;
        if (this.activeLineAnimatedFrameIndex < this.activeLineAnimatedFrames.length - 1) {
          this.activeLineAnimatedFrameIndex += 1;
        } else {
          this.activeLineAnimatedFinished = true;
        }
        this.renderCurrentLine(this.activeLineAnimatedFrames[this.activeLineAnimatedFrameIndex]);
      }
    } else {
      this.renderCurrentLine(this.currentLineText);
    }

    this.currentLineHold -= deltaSeconds;
    if (this.currentLineHold > 0) return;

    if (this.currentLineBlock) {
      if (this.activeLineAnimatedFrames && this.activeLineAnimatedFrames.length > 1) {
        this.currentLineBlock.text = this.activeLineAnimatedFrames[this.activeLineAnimatedFrames.length - 1];
      } else {
        this.currentLineBlock.text = this.currentLineText;
      }
    }
    this.currentLineBlock = null;
    this.interLineTimer = 0.34;
    this.pendingLineStartBlink = 0.18;
  }

  private startNextLine(): void {
    if (this.currentLineIndex >= this.lines.length) return;
    const line = this.lines[this.currentLineIndex++];
    if (this.consoleFilled) {
      this.shiftConsoleByOneLine();
    }

    const currentCount = this.consoleLineControls.length;
    const lineY = this.consoleFilled
      ? this.spawnLineY
      : this.consoleTopPadding + (currentCount * this.lineSpacing);

    const block = new TextBlock(`creditsLine_${this.currentLineIndex}`, '');
    block.width = '94%';
    block.height = `${this.lineSpacing}px`;
    block.top = `${lineY}px`;
    block.left = '12px';
    block.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    block.fontFamily = 'Arcade8Bit';
    block.fontSize = Math.round(22 * BASE_TEXT_SCALE);
    block.color = line.color ?? '#E9E1FF';
    block.alpha = 1;
    this.consoleViewport.addControl(block);

    this.consoleLineControls.push({ block, y: lineY });
    if (this.consoleLineControls.length > this.maxVisibleLines) {
      const old = this.consoleLineControls.shift();
      old?.block.dispose();
      this.consoleFilled = true;
    } else if (this.consoleLineControls.length >= this.maxVisibleLines) {
      this.consoleFilled = true;
    }

    this.currentLineBlock = block;
    this.currentLineText = line.text;
    this.currentLineTyped = 0;
    this.currentLineTypingSpeed = line.typingSpeed ?? 42;
    this.currentLineHold = line.hold ?? 0.55;
    this.typingAccumulator = 0;
    this.cursorVisible = true;
    this.cursorBlinkTimer = 0;
    this.activeLineAnimatedFrames = line.animatedFrames ?? null;
    this.activeLineAnimatedFrameInterval = line.animatedFrameInterval ?? 0.15;
    this.activeLineAnimatedFrameTimer = 0;
    this.activeLineAnimatedFrameIndex = 0;
    this.activeLineAnimatedFinished = false;

    if (line.popup) {
      this.showPopup(line.popup.text, line.popup.emotion, line.popup.preset, line.popup.duration ?? 2.8);
    }

  }

  private shiftConsoleByOneLine(): void {
    for (const lineControl of this.consoleLineControls) {
      lineControl.y -= this.lineSpacing;
      lineControl.block.top = `${lineControl.y}px`;
      lineControl.block.alpha = lineControl.y < this.consoleTopPadding + 6 ? 0.45 : 1;
    }
  }

  private computeConsoleCapacity(): void {
    const idealHeight = this.gui.idealHeight || 720;
    const viewportHeightPx = idealHeight * 0.68 * 0.82;
    this.maxVisibleLines = Math.max(10, Math.floor((viewportHeightPx - this.consoleTopPadding - 12) / this.lineSpacing));
    this.spawnLineY = this.consoleTopPadding + ((this.maxVisibleLines - 1) * this.lineSpacing);
  }

  private computePopupFontSize(): number {
    const idealWidth = this.gui.idealWidth || 1280;
    if (idealWidth < 900) return Math.round(24 * BASE_TEXT_SCALE);
    if (idealWidth < 1280) return Math.round(25 * BASE_TEXT_SCALE);
    return Math.round(27 * BASE_TEXT_SCALE);
  }

  private computePopupTextLeft(): number {
    // Avatar starts at 24 and is 160px wide; keep a tight, HUD-like gap.
    const idealWidth = this.gui.idealWidth || 1280;
    if (idealWidth < 900) return 190;
    return 182;
  }

  private computePopupTextWidth(leftPx: number): number {
    const bubbleWidth = 780;
    const rightPadding = 24;
    return Math.max(420, bubbleWidth - leftPx - rightPadding);
  }

  private showPopup(text: string, emotion: string, preset: VoicePresetName, duration: number): void {
    if (this.popupVisible || this.popupAnimatingIn || this.popupAnimatingOut) {
      this.popupQueue.push({ text, emotion, preset, duration });
      return;
    }
    if (this.popupSequenceStarted && this.sceneClock < this.nextPopupAllowedAt) {
      this.popupQueue.push({ text, emotion, preset, duration });
      return;
    }
    this.popupSequenceStarted = true;

    this.popupText.text = '';
    this.popupTypingText = text;
    this.popupTypingIndex = 0;
    this.popupTypingSpeed = 52;
    this.popupTypingAccumulator = 0;
    this.popupDuration = duration;
    this.popupTimer = 0;
    this.popupVisible = true;
    this.popupAnimatingIn = true;
    this.popupAnimatingOut = false;
    this.popupAnimTimer = 0;
    this.popupHost.isVisible = true;
    this.popupHost.alpha = 0;
    this.popupHost.top = `${this.popupYHidden}px`;

    const normalized = normalizeDaemonPresetName(emotion);
    this.popupFrameList = DAEMON_ANIMATION_PRESETS[normalized] ?? DAEMON_ANIMATION_PRESETS.init;
    this.popupFrameIndex = 0;
    this.popupFrameTimer = 0;
    this.setPopupAvatarFrame(this.popupFrameList[0]);

    const voiceId = ++this.activePopupVoiceId;
    void this.speakPopup(text, preset, voiceId);
  }

  private updatePopup(deltaSeconds: number): void {
    if (!this.popupVisible) return;

    if (this.popupTypingIndex < this.popupTypingText.length) {
      this.popupTypingAccumulator += deltaSeconds * this.popupTypingSpeed;
      const nextChars = Math.floor(this.popupTypingAccumulator);
      if (nextChars > 0) {
        this.popupTypingAccumulator -= nextChars;
        this.popupTypingIndex = Math.min(this.popupTypingText.length, this.popupTypingIndex + nextChars);
        this.popupText.text = this.popupTypingText.slice(0, this.popupTypingIndex);
        this.daemonTypewriterSynth.triggerForTypedChar();
      }
    }

    this.popupFrameTimer += deltaSeconds;
    if (this.popupFrameList.length > 1 && this.popupFrameTimer >= 0.15) {
      this.popupFrameTimer = 0;
      this.popupFrameIndex = (this.popupFrameIndex + 1) % this.popupFrameList.length;
      this.setPopupAvatarFrame(this.popupFrameList[this.popupFrameIndex]);
    }

    if (this.popupAnimatingIn) {
      this.popupAnimTimer += deltaSeconds;
      const t = Math.min(1, this.popupAnimTimer / 0.35);
      this.popupHost.alpha = t;
      this.popupHost.top = `${this.popupYHidden + (this.popupYShown - this.popupYHidden) * t}px`;
      if (t >= 1) {
        this.popupAnimatingIn = false;
        this.popupAnimTimer = 0;
      }
      return;
    }

    this.popupTimer += deltaSeconds;
    if (!this.popupAnimatingOut && this.popupTimer >= this.popupDuration) {
      this.popupAnimatingOut = true;
      this.popupAnimTimer = 0;
    }

    if (this.popupAnimatingOut) {
      this.popupAnimTimer += deltaSeconds;
      const t = Math.min(1, this.popupAnimTimer / 0.28);
      this.popupHost.alpha = 1 - t;
      this.popupHost.top = `${this.popupYShown + (this.popupYHidden - this.popupYShown) * t}px`;
      if (t >= 1) {
        this.popupAnimatingOut = false;
        this.popupVisible = false;
        this.popupHost.isVisible = false;
        if (this.nextPopupAllowedAt <= this.sceneClock) {
          this.nextPopupAllowedAt = this.sceneClock + this.popupGapAfterVoiceSeconds;
        }
      }
    }
  }

  private processPopupQueue(): void {
    if (this.popupVisible || this.popupAnimatingIn || this.popupAnimatingOut) return;
    if (this.popupQueue.length === 0) return;
    if (this.sceneClock < this.nextPopupAllowedAt) return;
    const queued = this.popupQueue.shift();
    if (!queued) return;
    this.showPopup(queued.text, queued.emotion, queued.preset, queued.duration);
  }

  private renderCurrentLine(baseText: string): void {
    if (!this.currentLineBlock) return;
    const cursor = this.cursorVisible ? this.cursorChar : ' ';
    this.currentLineBlock.text = `${baseText}${cursor}`;
  }

  private updateTitleAnimation(deltaSeconds: number): void {
    this.titleAnimTimer += deltaSeconds;
    if (this.titleAnimTimer >= 0.16) {
      this.titleAnimTimer = 0;
      this.titleFrameIndex = (this.titleFrameIndex + 1) % this.titleFrames.length;
      this.titleAvatar.source = this.avatarFrameSrc(this.titleFrames[this.titleFrameIndex]);
    }
    const flicker = 0.84 + Math.sin(performance.now() * 0.006) * 0.12;
    this.titleLeft.alpha = flicker;
    this.titleRight.alpha = flicker;
  }

  private setPopupAvatarFrame(frameFileName: string): void {
    this.popupAvatar.source = this.avatarFrameSrc(frameFileName);
  }

  private avatarFrameSrc(frameFileName: string): string {
    return buildHudAssetUrl(`avatar_frames_cutout2/${encodeURIComponent(frameFileName.normalize('NFC'))}`);
  }

  private primeAudio(): void {
    const maybeAudioContext = this.getAudioContext();
    if (!maybeAudioContext) return;
    this.daemonVoiceSynth.setAudioContext(maybeAudioContext);
    this.daemonTypewriterSynth.attachContext(maybeAudioContext);
    if (maybeAudioContext.state !== 'running') {
      void maybeAudioContext.resume();
    }
  }

  private async speakPopup(text: string, preset: VoicePresetName, voiceId: number): Promise<void> {
    const audioContext = this.getAudioContext();
    if (!audioContext) return;
    try {
      if (audioContext.state !== 'running') {
        await audioContext.resume();
      }
      this.daemonVoiceSynth.setAudioContext(audioContext);
      const { buffer } = await this.daemonVoiceSynth.synthesize(text, preset);
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      gain.gain.value = 0.58;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(0);
      this.voiceSources.add(source);
      source.onended = () => {
        if (voiceId === this.activePopupVoiceId) {
          this.nextPopupAllowedAt = this.sceneClock + this.popupGapAfterVoiceSeconds;
        }
        this.voiceSources.delete(source);
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // ignore disconnect errors from ended source
        }
      };
    } catch (error) {
      if (voiceId === this.activePopupVoiceId) {
        this.nextPopupAllowedAt = this.sceneClock + this.popupGapAfterVoiceSeconds;
      }
      console.warn('[CreditsScene] Popup voice synthesis failed:', error);
    }
  }

  private stopVoicePlayback(): void {
    this.voiceSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // ignore if already stopped
      }
    });
    this.voiceSources.clear();
  }

  private getAudioContext(): AudioContext | null {
    const engineCtx = (this.engine as any)?.audioEngine?.audioContext as AudioContext | undefined;
    if (engineCtx) {
      return engineCtx;
    }
    if (!this.localAudioContext) {
      try {
        this.localAudioContext = new AudioContext();
      } catch {
        this.localAudioContext = null;
      }
    }
    return this.localAudioContext;
  }
}
