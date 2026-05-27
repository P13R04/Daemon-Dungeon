import { Color4, Engine, FreeCamera, Scene, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, Button, Control, Image, Rectangle, TextBlock } from '@babylonjs/gui';
import { DaemonVoiceSynth, VOICE_PRESETS } from '../audio/DaemonVoiceSynth';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../data/voicelines/DaemonAnimationPresets';
import { createMenuMatrixBackground } from './MenuMatrixBackground';
import { UI_LAYER } from '../ui/uiLayers';
import { applyResponsiveGuiScaling } from '../ui/GuiScaling';
import { buildHudAssetUrl } from '../systems/hud/HudAssetPaths';

type VoicePresetName = keyof typeof VOICE_PRESETS;

type CreditsLine = {
  text: string;
  color?: string;
  typingSpeed?: number;
  hold?: number;
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
  private lineSpacing = 30;
  private readonly consoleTopPadding = 14;
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

  private titleAnimTimer = 0;
  private titleFrameIndex = 0;
  private readonly titleFrames = ['rire_01.png', 'rire_02.png', 'rire_03.png', 'rire_04.png'];
  private activeLineAnimatedFrames: string[] | null = null;
  private activeLineAnimatedFrameInterval = 0.12;
  private activeLineAnimatedFrameTimer = 0;
  private activeLineAnimatedFrameIndex = 0;
  private activeLineAnimatedFinished = false;

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

    const subtitle = new TextBlock('creditsSubtitle', 'SYSTEM READY // CREDITS CONSOLE');
    subtitle.color = '#E0B4FF';
    subtitle.fontFamily = 'Arcade8Bit';
    subtitle.fontSize = 19;
    subtitle.top = '-240px';
    subtitle.height = '34px';
    subtitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    subtitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(subtitle);

    this.consoleBody = new Rectangle('creditsConsoleBody');
    this.consoleBody.width = '92%';
    this.consoleBody.height = '68%';
    this.consoleBody.top = '90px';
    this.consoleBody.cornerRadius = 0;
    this.consoleBody.thickness = 2;
    this.consoleBody.color = '#4EFFC8';
    this.consoleBody.background = '#020706EE';
    this.consoleBody.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.consoleBody.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    root.addControl(this.consoleBody);

    const consoleHeader = new TextBlock('creditsConsoleHeader', 'daemon_console --follow --credits --noisy=false');
    consoleHeader.height = '34px';
    consoleHeader.top = '-8px';
    consoleHeader.color = '#B7A0FF';
    consoleHeader.fontFamily = 'Arcade8Bit';
    consoleHeader.fontSize = 15;
    this.consoleBody.addControl(consoleHeader);

    this.consoleViewport = new Rectangle('creditsConsoleViewport');
    this.consoleViewport.width = '94%';
    this.consoleViewport.height = '82%';
    this.consoleViewport.top = '16px';
    this.consoleViewport.thickness = 0;
    this.consoleViewport.clipChildren = true;
    this.consoleViewport.background = '#010403CC';
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
      fade.background = '#020706';
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
    fadeBottom.background = '#020706';
    fadeBottom.alpha = 0.95;
    fadeBottom.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.consoleViewport.addControl(fadeBottom);

    this.popupHost = new Rectangle('daemonPopupHost');
    this.popupHost.width = '780px';
    this.popupHost.height = '220px';
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
    avatarBox.width = '160px';
    avatarBox.height = '160px';
    avatarBox.left = '24px';
    avatarBox.thickness = 1;
    avatarBox.color = '#FF7A8F';
    avatarBox.background = 'rgba(90, 0, 12, 0.6)';
    avatarBox.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    avatarBox.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupBubble.addControl(avatarBox);

    this.popupAvatar = new Image('daemonPopupAvatar', this.avatarFrameSrc('init_01.png'));
    this.popupAvatar.width = '160px';
    this.popupAvatar.height = '160px';
    this.popupAvatar.stretch = Image.STRETCH_UNIFORM;
    avatarBox.addControl(this.popupAvatar);

    this.popupText = new TextBlock('daemonPopupText', '');
    // Mirror HUD daemon popup layout exactly.
    this.popupText.width = '530px';
    this.popupText.left = 208;
    this.popupText.top = 0;
    this.popupText.textWrapping = true;
    this.popupText.resizeToFit = false;
    this.popupText.color = '#FFD1DA';
    this.popupText.fontFamily = 'Arcade8Bit';
    this.popupText.fontSize = 24;
    this.popupText.height = '180px';
    this.popupText.textWrapping = true;
    this.popupText.lineSpacing = '0px';
    this.popupText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.popupText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.popupBubble.addControl(this.popupText);

    const backButton = Button.CreateSimpleButton('creditsBackButton', 'BACK');
    backButton.width = '188px';
    backButton.height = '58px';
    backButton.cornerRadius = 12;
    backButton.color = '#F9E8FF';
    backButton.background = '#3C0E59';
    backButton.thickness = 2;
    backButton.fontSize = 22;
    backButton.fontFamily = 'Orbitron, Cinzel, serif';
    backButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    backButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    backButton.bottom = '18px';
    backButton.onPointerClickObservable.add(() => this.onBack());
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
      { text: '> boot credits://session.qldl', color: '#D9BCFF', typingSpeed: 58, hold: 0.35 },
      { text: '> loading daemon log stream... [OK]', color: '#D9BCFF', typingSpeed: 58, hold: 0.25 },
      { text: '> mounting gratitude volume...', color: '#B9FFDA', typingSpeed: 54, hold: 0.2 },
      {
        text: '> [####................] 22%',
        color: '#8CF6D2',
        typingSpeed: 60,
        hold: 1.0,
        animatedFrames: [
          '> [####................] 22%',
          '> [########............] 41%',
          '> [############........] 63%',
          '> [################....] 84%',
          '> [####################] 100%',
        ],
        animatedFrameInterval: 0.17,
      },
      {
        text: '> stream channel open',
        color: '#B6E7FF',
        popup: {
          text: 'You wanted receipts. Fine. I will allow this sentimentality.',
          emotion: 'superieur',
          preset: 'daemon_normal',
          duration: 3.4,
        },
      },
      { text: '', hold: 0.15 },
      { text: 'TEAM :: QLDL', color: '#F4CCFF', typingSpeed: 48 },
      { text: ' - Pierre "P13R04" Constantin', color: '#EEDBFF' },
      { text: ' - Baptiste "Toste13f" Giacchero', color: '#EEDBFF' },
      { text: ' - Vlad "Rolling2k" Vasiliev', color: '#EEDBFF' },
      { text: '', hold: 0.2 },
      { text: 'SPECIAL THANKS :: Michel Buffa', color: '#FFE5FA' },
      { text: '', hold: 0.25 },
      {
        text: '> rendering commit trail...',
        color: '#CDA8FF',
        popup: {
          text: 'Three humans, one unstable simulation, zero fear of production.',
          emotion: 'rire',
          preset: 'daemon_normal',
          duration: 3.6,
        },
      },
      { text: 'build modules:', color: '#CDA8FF' },
      { text: ' - combat loops, classes, stance tech', color: '#DCC2FF' },
      { text: ' - procedural rooms and transitions', color: '#DCC2FF' },
      { text: ' - daemon voicelines, shaders, UI distortion', color: '#DCC2FF' },
      { text: ' - achievements, codex, progression rituals', color: '#DCC2FF' },
      { text: '', hold: 0.25 },
      { text: 'anomalies detected:', color: '#FFBFE8' },
      { text: ' - at least 1,472 reckless over-optimizations', color: '#FFD8F0' },
      { text: ' - a suspicious amount of pink glow in production', color: '#FFD8F0' },
      { text: ' - 0 regrets logged by Team QLDL', color: '#FFD8F0' },
      { text: '', hold: 0.25 },
      {
        text: '> optional protocol pending...',
        color: '#9FE7FF',
        popup: {
          text: 'No interaction required. Keep watching.',
          emotion: 'goofy',
          preset: 'daemon_normal',
          duration: 2.8,
        },
      },
      { text: '> protocol acknowledged :: observer mode', color: '#B8FFE6', typingSpeed: 62, hold: 0.2 },
      { text: '> no keyboard input required. this is intentional.', color: '#9FE7FF', typingSpeed: 56, hold: 0.35 },
      { text: '', hold: 0.25 },
      { text: 'THANKS STREAM (placeholder, to be expanded):', color: '#FFE7FA' },
      { text: ' - friends who tested cursed builds at 2AM', color: '#F3DBFF' },
      { text: ' - players sending clips, bugs, and chaos', color: '#F3DBFF' },
      { text: ' - everyone sharing feedback without mercy', color: '#F3DBFF' },
      { text: ' - everyone who survived the daemon commentary', color: '#F3DBFF' },
      { text: ' - and you', color: '#FFFFFF', typingSpeed: 40, hold: 0.8 },
      {
        text: '> credits stream complete',
        color: '#C5AEFF',
        popup: {
          text: 'Archive complete. Leave before I start being kind.',
          emotion: 'blase',
          preset: 'daemon_normal',
          duration: 2.8,
        },
      },
      { text: '> end_of_stream', color: '#C5AEFF', typingSpeed: 64, hold: 999 },
    ];
  }

  private update(deltaSeconds: number): void {
    this.updateTitleAnimation(deltaSeconds);
    this.updateConsoleFlow(deltaSeconds);
    this.updatePopup(deltaSeconds);
  }

  private updateConsoleFlow(deltaSeconds: number): void {
    if (this.pendingStartLine) {
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
        this.currentLineBlock.text = this.currentLineText.slice(0, this.currentLineTyped);
        this.daemonTypewriterSynth.triggerForTypedChar();
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
        this.currentLineBlock.text = this.activeLineAnimatedFrames[this.activeLineAnimatedFrameIndex];
      }
    }

    this.currentLineHold -= deltaSeconds;
    if (this.currentLineHold > 0) return;

    this.currentLineBlock = null;
    this.interLineTimer = 0.12;
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
    block.fontSize = 22;
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
    this.currentLineTypingSpeed = line.typingSpeed ?? 50;
    this.currentLineHold = line.hold ?? 0.4;
    this.typingAccumulator = 0;
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
    if (idealWidth < 900) return 24;
    if (idealWidth < 1280) return 25;
    return 27;
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

    void this.speakPopup(text, preset);
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
      }
    }
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

  private async speakPopup(text: string, preset: VoicePresetName): Promise<void> {
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
        this.voiceSources.delete(source);
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // ignore disconnect errors from ended source
        }
      };
    } catch (error) {
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
