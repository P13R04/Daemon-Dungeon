/**
 * BootSequenceScene — Pre-title terminal "system reboot" sequence.
 *
 * Simulates a corrupted OS boot that is being taken over by the Daemon.
 * Introduces the game theme before the main menu appears.
 *
 * ── Configuration ────────────────────────────────────────────────────────────
 *   BootSequenceScene.config.enabled        Set false to skip entirely (dev shortcut)
 *   BootSequenceScene.config.canSkip        Allow Space / Enter / click to skip
 *   BootSequenceScene.config.oncePerSession Only play once per browser session
 *
 * ── Easter eggs hidden in the boot log ───────────────────────────────────────
 *   "Buffa initialized" — tribute to Professor Buffa  (line 7)
 */

import { Scene, Engine, FreeCamera, Vector3, Color4 } from '@babylonjs/core';
import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Control,
  StackPanel,
} from '@babylonjs/gui';
import { SCI_FI_TYPEWRITER_PRESETS, SciFiTypewriterSynth } from '../audio/SciFiTypewriterSynth';
import { UI_LAYER } from '../ui/uiLayers';

// ─── Public config ────────────────────────────────────────────────────────────

export interface BootSequenceConfig {
  /** Set false to bypass the intro entirely (e.g. in dev mode) */
  enabled: boolean;
  /** Allow Space / Enter / Escape / click to skip the sequence */
  canSkip: boolean;
  /** If true, uses sessionStorage so the intro only plays once per tab */
  oncePerSession: boolean;
}

// ─── Internal line data ───────────────────────────────────────────────────────

interface BootLine {
  text: string;
  color: string;
  /** ms from sequence start before this line becomes eligible to appear */
  delay: number;
  /** ms per character  — 0 = instant (used for blank spacer lines) */
  speed: number;
}

// Palette
const C_HDR    = '#7CFFEA'; // teal — headers / daemon reveal
const C_OK     = '#00FF88'; // green — normal boot lines
const C_DIM    = '#1A4A40'; // muted — decorative separator
const C_WARN   = '#FFD700'; // yellow — warnings
const C_ERR    = '#FF8C00'; // orange — errors
const C_CRIT   = '#FF3300'; // red — critical / glitch
const C_DAEMON = '#CC00FF'; // magenta — daemon voice

// Glitch helper: insert U+0338 (combining long solidus overlay) after each char
const _S = '\u0338';
const glitch = (s: string): string =>
  s.split('').map(c => (c !== ' ' ? c + _S : c)).join('');

// ─── Boot line script ─────────────────────────────────────────────────────────
// Global speed scalar for the intro timeline.
// < 1 makes the sequence faster.
const INTRO_TIMING_SCALE = 0.4;
const MIN_CHAR_MS = 6;

const BASE_BOOT_LINES: BootLine[] = [
  // ── Phase 1 — Normal boot ─────────────────────────────────────────────────
  { text: 'DAEMON_OS v2.6.1 ── REBOOT SEQUENCE INITIATED',  color: C_HDR,    delay:  300, speed: 18 },
  { text: '─'.repeat(56),                                   color: C_DIM,    delay:  820, speed:  3 },
  { text: '>  Checking hardware integrity.........  [ OK ]', color: C_OK,     delay: 1050, speed: 16 },
  { text: '>  Loading kernel modules..............  [ OK ]', color: C_OK,     delay: 1550, speed: 16 },
  { text: '>  Mounting   /dev/dungeon.............  [ OK ]', color: C_OK,     delay: 2040, speed: 16 },
  { text: '>  Initializing audio subsystem........  [ OK ]', color: C_OK,     delay: 2520, speed: 16 },
  { text: '>  Buffa initialized...................  [ OK ]', color: C_OK,     delay: 2980, speed: 16 }, // 🐛 easter egg
  { text: '>  Loading entity registry.............  [ OK ]', color: C_OK,     delay: 3430, speed: 16 },
  { text: '>  Spawning AI pool....................  [ OK ]', color: C_OK,     delay: 3860, speed: 16 },
  { text: '>  Initializing combat engine..........  [ OK ]', color: C_OK,     delay: 4260, speed: 16 },
  { text: '',                                               color: C_OK,     delay: 4640, speed:  0 },
  { text: '■  SYSTEM DIAGNOSTIC — ALL CLEAR',               color: C_HDR,    delay: 4740, speed: 22 },
  { text: '>  Starting main loop...',                       color: C_OK,     delay: 5320, speed: 22 },
  // ── Phase 2 — Corruption begins ───────────────────────────────────────────
  { text: '',                                               color: C_OK,     delay: 5700, speed:  0 },
  { text: '[WARNING]   Anomalous process: /proc/d4em0n/c0re', color: C_WARN, delay: 5880, speed: 20 },
  { text: '[ERROR]     Termination attempt.........  [FAIL]', color: C_ERR,  delay: 6280, speed: 20 },
  { text: '[ERROR]     Firewall.ts overwritten......  [FAIL]', color: C_ERR, delay: 6640, speed: 20 },
  { text: '[CRITICAL]  Memory segment 0×4D3M0N corrupted',  color: C_CRIT,  delay: 6960, speed: 20 },
  { text: '[CRITICAL]  Root escalation — kernel compromised', color: C_CRIT, delay: 7250, speed: 20 },
  { text: '[ERROR]     process_kill: permission denied',    color: C_CRIT,  delay: 7510, speed: 20 },
  // ── Phase 3 — Daemon takes control ────────────────────────────────────────
  { text: '',                                               color: C_CRIT,   delay: 7750, speed:  0 },
  { text: glitch('SYSTEM OVERRIDDEN.'),                     color: C_CRIT,   delay: 7880, speed: 30 },
  { text: glitch('HALT.') + '  I have arrived.',            color: C_DAEMON, delay: 8580, speed: 55 },
  { text: 'This system belongs to me now.',                 color: C_DAEMON, delay: 9350, speed: 48 },
  { text: 'Welcome, prisoner...  to the  D u n g e o n.',  color: C_HDR,    delay:10150, speed: 42 },
];

const BOOT_LINES: BootLine[] = BASE_BOOT_LINES.map((line) => ({
  ...line,
  delay: Math.round(line.delay * INTRO_TIMING_SCALE),
  speed: line.speed > 0
    ? Math.max(MIN_CHAR_MS, Math.round(line.speed * INTRO_TIMING_SCALE))
    : 0,
}));

const SEQUENCE_END_MS = Math.round(12500 * INTRO_TIMING_SCALE) + 400;
const FADE_MS         = 450;
const FINAL_HOLD_MS   = 1000;

// ─── Scene class ──────────────────────────────────────────────────────────────

export class BootSequenceScene {
  /**
   * Global configuration — edit these flags to toggle behaviour.
   * Changes take effect on the *next* call to shouldPlay() / constructor.
   */
  static config: BootSequenceConfig = {
    enabled:        true,  // ← set false to skip the intro entirely
    canSkip:        true,  // ← allow Space / Enter / click to skip
    oncePerSession: false, // ← set true to only play once per browser session
  };

  /** Returns true if the boot sequence should play right now. */
  static shouldPlay(): boolean {
    if (!BootSequenceScene.config.enabled) return false;
    if (BootSequenceScene.config.oncePerSession) {
      try {
        if (sessionStorage.getItem('daemonBootShown')) return false;
      } catch { /* sessionStorage unavailable */ }
    }
    return true;
  }

  // ── Engine / scene ──────────────────────────────────────────────────────────
  private scene:  Scene;
  private gui:    AdvancedDynamicTexture;
  private camera!: FreeCamera;

  // ── Sequencer state ─────────────────────────────────────────────────────────
  private elapsed     = 0;
  private nextLineIdx = 0;
  private done        = false;
  private _finalHoldTimerMs = 0;
  private onComplete: () => void;

  // ── Keyboard cleanup ────────────────────────────────────────────────────────
  private _kbHandler: ((e: KeyboardEvent) => void) | null = null;
  private _audioUnlockHandler: (() => void) | null = null;

  // ── Fade-out state ──────────────────────────────────────────────────────────
  private _fading      = false;
  private _fadeTimer   = 0;
  private _fadeOverlay!: Rectangle;

  // ── Log area ────────────────────────────────────────────────────────────────
  private _logPanel!:  StackPanel;
  private _cursor!:    TextBlock;
  private _cursorTimer   = 0;
  private _cursorVisible = true;

  // ── Progress bar ────────────────────────────────────────────────────────────
  private _progressFill!:  Rectangle;
  private _progressLabel!: TextBlock;

  // ── Cinematic FX UI refs ───────────────────────────────────────────────────
  private _mainPanel!: Rectangle;
  private _headerLine!: Rectangle;
  private _headerText!: TextBlock;
  private _redFlash!: Rectangle;
  private _chromaticRed!: Rectangle;
  private _chromaticCyan!: Rectangle;

  // ── Cinematic FX state ─────────────────────────────────────────────────────
  private _narrativePauseMs = 0;
  private _shakeTimerMs = 0;
  private _shakePower = 0;
  private _chromaticAmount = 0;
  private _flashAmount = 0;
  private _corruptionStage = 0;
  private _corruptionPulseCount = 0;

  // ── Corrupted progress bar state ───────────────────────────────────────────
  private _progressValue = 0;
  private _progressStallMs = 0;
  private _progressColorPhase = 0;
  private readonly _totalTextChars = BOOT_LINES.reduce((acc, line) => acc + line.text.length, 0);
  private _displayedTextChars = 0;

  // ── Typewriter ──────────────────────────────────────────────────────────────
  private _typist: {
    block:    TextBlock;
    fullText: string;
    charIdx:  number;
    speed:    number;
    timer:    number;
    burstCount: number;
    burstTarget: number;
    pauseMs: number;
  } | null = null;

  // ── Audio ───────────────────────────────────────────────────────────────────
  private synthBeep: SciFiTypewriterSynth;

  // ────────────────────────────────────────────────────────────────────────────

  constructor(engine: Engine, onComplete: () => void) {
    this.onComplete = onComplete;
    // Swap preset key to test variants: oldschool_fast | oldschool_arcade | oldschool_crt
    this.synthBeep = new SciFiTypewriterSynth(SCI_FI_TYPEWRITER_PRESETS.oldschool_fast);

    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.04, 1);

    this._setupAudioUnlock();

    this.camera = new FreeCamera('bootCam', new Vector3(0, 0, -10), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.layerMask = UI_LAYER;
    this.scene.activeCamera = this.camera;

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('BootUI', true, this.scene);
    if (this.gui.layer) this.gui.layer.layerMask = UI_LAYER;

    this._buildUI();
    if (BootSequenceScene.config.canSkip) this._registerSkip();

    this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime();
      this._tick(dt);
    });
  }

  getScene(): Scene { return this.scene; }

  dispose(): void {
    if (this._kbHandler) {
      window.removeEventListener('keydown', this._kbHandler);
      this._kbHandler = null;
    }
    if (this._audioUnlockHandler) {
      window.removeEventListener('pointerdown', this._audioUnlockHandler);
      window.removeEventListener('keydown', this._audioUnlockHandler);
      this._audioUnlockHandler = null;
    }
    this.synthBeep.dispose();
    this.gui.dispose();
    this.scene.dispose();
  }

  // ─── UI construction ────────────────────────────────────────────────────────

  private _buildUI(): void {
    // Full-screen background
    const bg = new Rectangle('bootBg');
    bg.width  = '100%';
    bg.height = '100%';
    bg.background = '#080C10';
    bg.thickness  = 0;
    this.gui.addControl(bg);

    // Outer terminal panel
    const panel = new Rectangle('bootPanel');
    panel.width      = '88%';
    panel.height     = '84%';
    panel.background = '#040810';
    panel.thickness  = 1;
    panel.color      = '#1A3A30';
    panel.cornerRadius = 3;
    bg.addControl(panel);
    this._mainPanel = panel;

    // ── Header bar ──────────────────────────────────────────────────────────
    const hdr = new Rectangle('bootHdr');
    hdr.width      = '100%';
    hdr.height     = '34px';
    hdr.background = '#061210';
    hdr.thickness  = 0;
    hdr.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.addControl(hdr);

    const hdrLine = new Rectangle('bootHdrLine');
    hdrLine.width      = '100%';
    hdrLine.height     = '1px';
    hdrLine.background = '#1A3A30';
    hdrLine.thickness  = 0;
    hdrLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    hdr.addControl(hdrLine);
    this._headerLine = hdrLine;

    const hdrTxt = new TextBlock('bootHdrTxt');
    hdrTxt.text       = 'DAEMON_OS  [TERMINAL]   PID:0×D43M  UID:root   KERNEL:2.6.1-daemon';
    hdrTxt.color      = '#1E5C50';
    hdrTxt.fontSize   = 11;
    hdrTxt.fontFamily = 'Lucida Console, Courier New, monospace';
    hdrTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hdrTxt.paddingLeft = '12px';
    hdr.addControl(hdrTxt);
    this._headerText = hdrTxt;

    // ── Log StackPanel (lines accumulate here) ──────────────────────────────
    this._logPanel = new StackPanel('logStack');
    this._logPanel.isVertical              = true;
    this._logPanel.adaptHeightToChildren   = true;
    this._logPanel.width                   = '96%';
    this._logPanel.verticalAlignment       = Control.VERTICAL_ALIGNMENT_TOP;
    this._logPanel.horizontalAlignment     = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._logPanel.top                     = '42px';
    this._logPanel.paddingLeft             = '14px';
    panel.addControl(this._logPanel);

    // Blinking cursor (always last child of logPanel)
    this._cursor = new TextBlock('bootCursor');
    this._cursor.text       = '_';
    this._cursor.color      = '#2EF9C3';
    this._cursor.fontSize   = 13;
    this._cursor.height     = '20px';
    this._cursor.fontFamily = 'Lucida Console, Courier New, monospace';
    this._cursor.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._logPanel.addControl(this._cursor);

    // ── Footer ──────────────────────────────────────────────────────────────
    const footer = new Rectangle('bootFooter');
    footer.width      = '96%';
    footer.height     = '52px';
    footer.background = '#040810';
    footer.thickness  = 0;
    footer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    footer.paddingBottom     = '10px';
    panel.addControl(footer);

    // Progress bar track
    const barBg = new Rectangle('bootBarBg');
    barBg.width      = '100%';
    barBg.height     = '12px';
    barBg.background = '#0A1A14';
    barBg.thickness  = 1;
    barBg.color      = '#1E5C50';
    barBg.verticalAlignment   = Control.VERTICAL_ALIGNMENT_TOP;
    footer.addControl(barBg);

    // Progress bar fill
    this._progressFill = new Rectangle('bootBarFill');
    this._progressFill.width       = '0%';
    this._progressFill.height      = '100%';
    this._progressFill.background  = '#2EF9C3';
    this._progressFill.thickness   = 0;
    this._progressFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(this._progressFill);

    // Progress label
    this._progressLabel = new TextBlock('bootBarLabel');
    this._progressLabel.text       = 'LOADING...  0%';
    this._progressLabel.color      = '#2EF9C3';
    this._progressLabel.fontSize   = 11;
    this._progressLabel.fontFamily = 'Lucida Console, Courier New, monospace';
    this._progressLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._progressLabel.verticalAlignment       = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this._progressLabel.paddingBottom           = '2px';
    footer.addControl(this._progressLabel);

    // Skip hint
    if (BootSequenceScene.config.canSkip) {
      const skipHint = new TextBlock('bootSkipHint');
      skipHint.text       = '[ SPACE ] or [ CLICK ] to skip';
      skipHint.color      = '#1E4030';
      skipHint.fontSize   = 11;
      skipHint.fontFamily = 'Lucida Console, Courier New, monospace';
      skipHint.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      skipHint.verticalAlignment       = Control.VERTICAL_ALIGNMENT_BOTTOM;
      skipHint.paddingBottom           = '2px';
      footer.addControl(skipHint);

      // Click anywhere to skip
      bg.isPointerBlocker = true;
      bg.onPointerClickObservable.add(() => this._complete());
    }

    // Fade-to-black overlay (initially invisible, appears when sequence ends)
    this._fadeOverlay = new Rectangle('bootFadeOvr');
    this._fadeOverlay.width  = '100%';
    this._fadeOverlay.height = '100%';
    this._fadeOverlay.background      = '#000000';
    this._fadeOverlay.thickness       = 0;
    this._fadeOverlay.alpha           = 0;
    this._fadeOverlay.isHitTestVisible = false;
    this.gui.addControl(this._fadeOverlay);

    // Faux chromatic aberration overlays (postprocess-like look).
    this._chromaticRed = new Rectangle('bootChromaticRed');
    this._chromaticRed.width = '100%';
    this._chromaticRed.height = '100%';
    this._chromaticRed.background = '#FF0033';
    this._chromaticRed.alpha = 0;
    this._chromaticRed.thickness = 0;
    this._chromaticRed.isHitTestVisible = false;
    this.gui.addControl(this._chromaticRed);

    this._chromaticCyan = new Rectangle('bootChromaticCyan');
    this._chromaticCyan.width = '100%';
    this._chromaticCyan.height = '100%';
    this._chromaticCyan.background = '#00E5FF';
    this._chromaticCyan.alpha = 0;
    this._chromaticCyan.thickness = 0;
    this._chromaticCyan.isHitTestVisible = false;
    this.gui.addControl(this._chromaticCyan);

    // Error impact flash.
    this._redFlash = new Rectangle('bootErrorFlash');
    this._redFlash.width = '100%';
    this._redFlash.height = '100%';
    this._redFlash.background = '#FF0018';
    this._redFlash.alpha = 0;
    this._redFlash.thickness = 0;
    this._redFlash.isHitTestVisible = false;
    this.gui.addControl(this._redFlash);
  }

  // ─── Keyboard skip ───────────────────────────────────────────────────────────

  private _registerSkip(): void {
    this._kbHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        this._complete();
      }
    };
    window.addEventListener('keydown', this._kbHandler);
  }

  // ─── Audio: load and play beep ──────────────────────────────────────────────

  private _setupAudioUnlock(): void {
    const audioEngine = Engine.audioEngine;
    if (!audioEngine) return;

    // Prevent Babylon's default "Unmute" button and unlock on first user gesture.
    audioEngine.useCustomUnlockedButton = true;

    const tryUnlock = () => {
      try {
        audioEngine.unlock();
      } catch {
        // Ignore unlock errors; next gesture can retry.
      }
      void this.synthBeep.unlock();
      const audioContext = (audioEngine as { audioContext?: AudioContext }).audioContext;
      this.synthBeep.attachContext(audioContext);
      if (audioEngine.unlocked && this._audioUnlockHandler) {
        window.removeEventListener('pointerdown', this._audioUnlockHandler);
        window.removeEventListener('keydown', this._audioUnlockHandler);
        this._audioUnlockHandler = null;
      }
    };

    this._audioUnlockHandler = tryUnlock;
    window.addEventListener('pointerdown', tryUnlock);
    window.addEventListener('keydown', tryUnlock);
    const audioContext = (audioEngine as { audioContext?: AudioContext }).audioContext;
    this.synthBeep.attachContext(audioContext);
  }

  private playBeep(): void {
    this.synthBeep.triggerForTypedChar();
  }

  private _advanceCorruptionStage(stage: number): void {
    this._corruptionStage = Math.max(this._corruptionStage, stage);

    if (this._corruptionStage === 1) {
      this._headerLine.background = '#6D5A1C';
      this._mainPanel.color = '#5A4716';
      this._headerText.color = '#B08F2C';
      return;
    }

    if (this._corruptionStage === 2 || this._corruptionStage === 3) {
      this._headerLine.background = '#7C1111';
      this._mainPanel.color = '#6E1111';
      this._headerText.color = '#F35353';
      return;
    }

    if (this._corruptionStage >= 4) {
      this._headerLine.background = '#472C71';
      this._mainPanel.color = '#412A60';
      this._headerText.color = '#A68BE2';
    }
  }

  private _applyCorruptionPulse(stage: number): void {
    this._advanceCorruptionStage(stage);
    this._corruptionPulseCount++;

    const intensity = Math.min(1, 0.55 + this._corruptionPulseCount * 0.12 + stage * 0.16);
    this._narrativePauseMs = Math.max(this._narrativePauseMs, 85 + stage * 35);
    this._progressStallMs = Math.max(this._progressStallMs, 190 + stage * 95);
    this._shakeTimerMs = Math.max(this._shakeTimerMs, 120 + stage * 120);
    this._shakePower = Math.max(this._shakePower, 3 + stage * 2 + intensity * 2);
    this._chromaticAmount = Math.max(this._chromaticAmount, Math.min(1, 0.25 + intensity * 0.7));
    this._flashAmount = Math.max(this._flashAmount, Math.min(0.85, 0.15 + intensity * 0.55));
  }

  private _updateProgressBar(dt: number): void {
    this._progressColorPhase += dt;

    // Primary driver: actual amount of text shown on screen.
    const textPct = this._totalTextChars > 0
      ? Math.min(100, (this._displayedTextChars / this._totalTextChars) * 100)
      : 100;
    let targetPct = textPct;

    // End lock: only push to 100 when narrative content is actually done.
    const forcingFinal = this._fading || (this.nextLineIdx >= BOOT_LINES.length && !this._typist);
    if (forcingFinal) {
      this._progressValue = Math.min(100, this._progressValue + dt * 0.09);
    } else {
      if (this._progressStallMs > 0) {
        targetPct = Math.max(0, targetPct - (4 + this._corruptionStage * 2));
      }

      if (this._progressStallMs > 0) {
        // Stall countdown; bar may jitter around its current value.
        this._progressStallMs = Math.max(0, this._progressStallMs - dt);
      }

      // Corrupted counters can wobble during strong corruption.
      if (this._corruptionStage >= 2 && Math.random() < 0.03) {
        targetPct += (Math.random() * 2 - 1) * 1.25;
      }

      const maxBeforeFinal = 99.4;
      targetPct = Math.min(maxBeforeFinal, Math.max(0, targetPct));

      if (this._progressValue < targetPct) {
        const riseRate = this._progressStallMs > 0 ? 0.016 : 0.075;
        this._progressValue = Math.min(targetPct, this._progressValue + dt * riseRate);
      } else {
        const fallRate = this._progressStallMs > 0 ? 0.032 : 0.02;
        this._progressValue = Math.max(targetPct, this._progressValue - dt * fallRate);
      }
    }

    if (!forcingFinal) {
      this._progressValue = Math.min(this._progressValue, 99.4);
    }

    if (this._progressStallMs > 0 && this._corruptionStage >= 2 && Math.random() < 0.16) {
      this._progressValue = Math.max(0, this._progressValue - (0.06 + Math.random() * 0.16));
    }

    this._progressFill.width = `${this._progressValue.toFixed(1)}%`;

    const pulse = Math.sin(this._progressColorPhase * 0.02);
    if (this._progressValue >= 99.8) {
      const evil = pulse > 0 ? '#FF003A' : '#8F0000';
      this._progressFill.background = evil;
      this._progressLabel.color = evil;
      this._progressLabel.text = `DAEMONIZED...  ${Math.floor(this._progressValue)}%`;
      return;
    }

    if (this._corruptionStage >= 4) {
      const c = pulse > 0.2 ? '#FF0046' : '#8A0000';
      this._progressFill.background = c;
      this._progressLabel.color = c;
      this._progressLabel.text = `CORRUPTING...  ${Math.floor(this._progressValue)}%`;
      return;
    }

    if (this._corruptionStage >= 3) {
      const c = pulse > 0 ? '#FF2F2F' : '#FF8A00';
      this._progressFill.background = c;
      this._progressLabel.color = c;
      this._progressLabel.text = `SYSTEM FAILING...  ${Math.floor(this._progressValue)}%`;
      return;
    }

    if (this._corruptionStage >= 2) {
      const c = pulse > 0 ? '#FF8C00' : '#FF3D3D';
      this._progressFill.background = c;
      this._progressLabel.color = c;
      this._progressLabel.text = `LOADING...  ${Math.floor(this._progressValue)}%`;
      return;
    }

    if (this._corruptionStage === 1) {
      this._progressFill.background = '#FFD700';
      this._progressLabel.color = '#FFD700';
      this._progressLabel.text = `WARNING...  ${Math.floor(this._progressValue)}%`;
      return;
    }

    this._progressFill.background = '#2EF9C3';
    this._progressLabel.color = '#2EF9C3';
    this._progressLabel.text = `LOADING...  ${Math.floor(this._progressValue)}%`;
  }

  private _updateCinematicFx(dt: number): void {
    if (this._narrativePauseMs > 0) {
      this._narrativePauseMs = Math.max(0, this._narrativePauseMs - dt);
    }

    // Smooth decay for chromatic and flash impacts.
    this._chromaticAmount = Math.max(0, this._chromaticAmount - dt * 0.0016);
    this._flashAmount = Math.max(0, this._flashAmount - dt * 0.0042);

    // Shake with progressive damping.
    if (this._shakeTimerMs > 0) {
      this._shakeTimerMs -= dt;
      const damper = Math.max(0, this._shakeTimerMs / 280);
      const amp = this._shakePower * damper;
      this._mainPanel.left = `${(Math.random() * 2 - 1) * amp}px`;
      this._mainPanel.top = `${(Math.random() * 2 - 1) * amp * 0.65}px`;
    } else {
      this._mainPanel.left = '0px';
      this._mainPanel.top = '0px';
    }

    // Faux chromatic aberration offsets.
    const chromaPx = this._chromaticAmount * 10;
    this._chromaticRed.alpha = this._chromaticAmount * 0.08;
    this._chromaticCyan.alpha = this._chromaticAmount * 0.07;
    this._chromaticRed.left = `${chromaPx}px`;
    this._chromaticCyan.left = `${-chromaPx}px`;

    // Red flash on impacts.
    this._redFlash.alpha = this._flashAmount;
  }

  // ─── Add a log line to the panel ─────────────────────────────────────────────

  private _addLine(text: string, color: string, speed: number): void {
    const block = new TextBlock();
    block.text        = (speed <= 0 || text === '') ? text : '';
    block.color       = color;
    block.fontSize    = 13;
    block.height      = '20px';
    block.fontFamily  = 'Lucida Console, Courier New, monospace';
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textWrapping = false;

    // Keep cursor as the last child
    this._logPanel.removeControl(this._cursor);
    this._logPanel.addControl(block);
    this._logPanel.addControl(this._cursor);

    // Trigger cinematic corruption pulses exactly when these lines appear.
    if (text.includes('[WARNING]')) {
      this._applyCorruptionPulse(1);
    } else if (text.includes('[ERROR]')) {
      this._applyCorruptionPulse(2);
    } else if (text.includes('[CRITICAL]')) {
      this._applyCorruptionPulse(3);
    } else if (text.includes('SYSTEM OVERRIDDEN') || text.includes('I have arrived')) {
      this._applyCorruptionPulse(4);
    }

    if (speed > 0 && text !== '') {
      this._typist = {
        block,
        fullText: text,
        charIdx:  0,
        speed,
        timer:    0,
        burstCount: 0,
        burstTarget: 6 + Math.floor(Math.random() * 4),
        pauseMs: 0,
      };
    } else if (text.length > 0) {
      // Instant lines still count as displayed text for bar sync.
      this._displayedTextChars += text.length;
    }
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────────

  private _tick(dt: number): void {
    if (this.done) return;

    // ── Fade-out phase ──────────────────────────────────────────────────────
    if (this._fading) {
      this._fadeTimer += dt;
      this._fadeOverlay.alpha = Math.min(this._fadeTimer / FADE_MS, 1);
      if (this._fadeTimer >= FADE_MS) {
        this.done = true;
        // Mark as shown if oncePerSession is active
        if (BootSequenceScene.config.oncePerSession) {
          try { sessionStorage.setItem('daemonBootShown', '1'); } catch { /* ignore */ }
        }
        // Defer callback outside the Babylon render cycle so the current
        // frame finishes cleanly before this scene is disposed.
        setTimeout(() => this.onComplete(), 0);
      }
      return;
    }

    this.elapsed += dt;
    this._updateCinematicFx(dt);
    this._updateProgressBar(dt);

    // ── Cursor blink (400 ms period) ────────────────────────────────────────
    this._cursorTimer += dt;
    if (this._cursorTimer >= 400) {
      this._cursorTimer   = 0;
      this._cursorVisible = !this._cursorVisible;
      this._cursor.text   = this._cursorVisible ? '_' : ' ';
    }

    // ── Typewriter advance ──────────────────────────────────────────────────
    if (this._typist) {
      const t = this._typist;

      if (this._narrativePauseMs > 0) {
        t.timer = 0;
      }

      // Terminal-like chunking: short burst, short pause, then resume.
      if (t.pauseMs > 0) {
        t.pauseMs = Math.max(0, t.pauseMs - dt);
      }

      t.timer += dt;
      while (this._narrativePauseMs <= 0 && t.pauseMs <= 0 && t.timer >= t.speed && t.charIdx < t.fullText.length) {
        t.timer  -= t.speed;
        t.charIdx++;
        this._displayedTextChars++;
        t.block.text = t.fullText.slice(0, t.charIdx);
        this.playBeep();

        t.burstCount++;
        if (t.burstCount >= t.burstTarget && t.charIdx < t.fullText.length) {
          t.pauseMs = 40 + Math.random() * 55;
          t.burstCount = 0;
          t.burstTarget = 6 + Math.floor(Math.random() * 4);
        }
      }
      if (t.charIdx >= t.fullText.length) {
        t.block.text = t.fullText;
        this._typist = null;
      }
    }

    // ── Queue next line (only when typist is free AND delay has elapsed) ────
    if (this.nextLineIdx < BOOT_LINES.length && !this._typist) {
      const next = BOOT_LINES[this.nextLineIdx];
      if (this.elapsed >= next.delay) {
        this._addLine(next.text, next.color, next.speed);
        this.nextLineIdx++;
      }
    }

    // ── Auto-complete: hold for a short beat so the final phrase and 100% are visible.
    const contentDone = this.nextLineIdx >= BOOT_LINES.length && !this._typist;
    if (contentDone) {
      this._finalHoldTimerMs += dt;
    } else {
      this._finalHoldTimerMs = 0;
    }

    if (
      this.elapsed >= SEQUENCE_END_MS &&
      contentDone &&
      this._finalHoldTimerMs >= FINAL_HOLD_MS
    ) {
      this._complete();
    }
  }

  // ─── Trigger fade-out → completion ───────────────────────────────────────────

  private _complete(): void {
    if (this.done || this._fading) return;
    this._fading    = true;
    this._fadeTimer = 0;
    // Remove keyboard listener immediately so it cannot fire twice
    if (this._kbHandler) {
      window.removeEventListener('keydown', this._kbHandler);
      this._kbHandler = null;
    }
  }
}
