export type AvatarSequenceMode = 'pingpong' | 'loop';

export interface DaemonAnimationPhaseState {
  emotion: string;
  frameSequence: string[];
  frameInterval: number;
}

/** Scheduled glitch overlay: temporarily switch to error frames */
interface GlitchFrameEvent {
  /** Time offset in seconds from voiceline start */
  triggerTime: number;
  /** Duration of the glitch frame override in seconds */
  duration: number;
  fired: boolean;
}

/** Phases for the crash→bsod→reboot→init→loading sequence */
const CRASH_SEQUENCE_PHASES: Array<{ emotion: string; frames: string[]; duration: number; interval: number }> = [
  { emotion: 'error', frames: ['error_01.png','error_02.png','error_03.png','error_04.png'], duration: 1.2, interval: 0.1 },
  { emotion: 'bsod', frames: ['bsod_01.png','bsod_01.png','bsod_01.png','bsod_02.png','bsod_03.png','bsod_04.png','bsod_03.png','bsod_04.png'], duration: 2.0, interval: 0.22 },
  { emotion: 'reboot', frames: ['reboot_01.png','reboot_02.png','reboot_03.png','reboot_04.png'], duration: 1.2, interval: 0.18 },
  { emotion: 'init', frames: ['init_01.png','init_02.png','init_03.png','init_04.png'], duration: 1.0, interval: 0.16 },
  { emotion: 'loading', frames: ['loading_01.png','loading_02.png'], duration: 1.5, interval: 0.2 },
];

export class DaemonAvatarController {
  private avatarFrameTimer: number = 0;
  private avatarFrameIndex: number = 0;
  private avatarFrameDirection: number = 1;
  private avatarFrameInterval: number = 0.12;
  private avatarSequenceMode: AvatarSequenceMode = 'pingpong';
  private daemonAvatarSequence: string[] = [];

  private animationPhases: DaemonAnimationPhaseState[] = [];
  private currentPhaseIndex: number = 0;
  private currentPhaseFrameCount: number = 0;

  private voicelineStartTime: number = 0;
  private voicelineAudioDuration: number = 0;

  // ─── Glitch frame overlay ──────────────────────────────────────
  private glitchEvents: GlitchFrameEvent[] = [];
  private isGlitching: boolean = false;
  private glitchEndTime: number = 0;
  private savedSequence: string[] = [];
  private savedInterval: number = 0.16;
  private savedMode: AvatarSequenceMode = 'pingpong';
  private readonly GLITCH_FRAMES = ['error_01.png','error_02.png','error_03.png','error_04.png'];
  private readonly GLITCH_FRAME_INTERVAL = 0.08;
  private readonly GLITCH_DURATION = 0.4; // seconds

  // ─── Crash sequence ────────────────────────────────────────────
  private crashActive: boolean = false;
  private crashPhaseIndex: number = 0;
  private crashPhaseElapsed: number = 0;
  private crashRecoveryEmotion: string = 'supérieur';
  private crashRecoveryInterval: number = 0.16;
  private crashCallback: (() => void) | null = null;

  setLoopSequence(sequence: string[], frameInterval: number): void {
    this.daemonAvatarSequence = sequence.slice();
    this.avatarSequenceMode = 'loop';
    this.avatarFrameIndex = 0;
    this.avatarFrameDirection = 1;
    this.avatarFrameInterval = frameInterval;
    this.avatarFrameTimer = 0;
    this.clearPhases();
  }

  setPingPongSequence(sequence: string[], frameInterval: number): void {
    this.daemonAvatarSequence = sequence.slice();
    this.avatarSequenceMode = 'pingpong';
    this.avatarFrameIndex = 0;
    this.avatarFrameDirection = 1;
    this.avatarFrameInterval = frameInterval;
    this.avatarFrameTimer = 0;
    this.clearPhases();
  }

  setPhases(phases: DaemonAnimationPhaseState[], audioDuration: number): void {
    this.animationPhases = phases;
    this.currentPhaseIndex = 0;
    this.currentPhaseFrameCount = 0;
    this.avatarFrameIndex = 0;
    this.avatarFrameDirection = 1;
    this.avatarFrameTimer = 0;
    this.avatarFrameInterval = phases.length > 0 ? phases[0].frameInterval : 0.18;
    this.voicelineAudioDuration = Math.max(0, audioDuration);
    this.voicelineStartTime = 0;

    if (phases.length > 0) {
      this.daemonAvatarSequence = phases[0].frameSequence.slice();
      this.avatarSequenceMode = 'loop';
    }
  }

  ensureVoicelineClockStarted(nowSeconds: number): void {
    if (this.voicelineStartTime === 0 && this.voicelineAudioDuration > 0) {
      this.voicelineStartTime = nowSeconds;
    }
  }

  hasAudioDuration(): boolean {
    return this.voicelineAudioDuration > 0;
  }

  hasVoicelineElapsed(nowSeconds: number): boolean {
    if (this.voicelineAudioDuration <= 0 || this.voicelineStartTime <= 0) return false;
    // If crash is active, don't end the voiceline yet
    if (this.crashActive) return false;
    return (nowSeconds - this.voicelineStartTime) >= this.voicelineAudioDuration;
  }

  clearVoicelineState(): void {
    this.clearPhases();
    this.voicelineStartTime = 0;
    this.voicelineAudioDuration = 0;
    this.glitchEvents = [];
    this.isGlitching = false;
    this.crashActive = false;
    this.crashCallback = null;
  }

  // ─── Glitch frame scheduling ───────────────────────────────────

  /** Schedule brief error frame overlays at specific timestamps (from synthesis glitch events) */
  scheduleGlitchFrames(timestamps: number[], glitchDuration?: number): void {
    const dur = glitchDuration ?? this.GLITCH_DURATION;
    this.glitchEvents = timestamps.map(t => ({ triggerTime: t, duration: dur, fired: false }));
  }

  /** Whether we're currently showing glitch error frames */
  isInGlitchFrames(): boolean {
    return this.isGlitching;
  }

  // ─── Crash sequence ────────────────────────────────────────────

  /** Start the full crash→bsod→reboot→init→loading sequence. Calls onComplete when done. */
  startCrashSequence(recoveryEmotion: string, recoveryInterval: number, onComplete?: () => void): void {
    this.crashActive = true;
    this.crashPhaseIndex = 0;
    this.crashPhaseElapsed = 0;
    this.crashRecoveryEmotion = recoveryEmotion;
    this.crashRecoveryInterval = recoveryInterval;
    this.crashCallback = onComplete ?? null;
    // Immediately apply first crash phase frames
    const first = CRASH_SEQUENCE_PHASES[0];
    this.daemonAvatarSequence = first.frames.slice();
    this.avatarSequenceMode = 'loop';
    this.avatarFrameInterval = first.interval;
    this.avatarFrameIndex = 0;
    this.avatarFrameTimer = 0;
  }

  isCrashActive(): boolean {
    return this.crashActive;
  }

  /** Get list of all frame filenames used in crash sequence (for preloading) */
  getCrashSequenceFrames(): string[] {
    const frames = new Set<string>();
    for (const phase of CRASH_SEQUENCE_PHASES) {
      phase.frames.forEach(f => frames.add(f));
    }
    return Array.from(frames);
  }

  // ─── Tick ──────────────────────────────────────────────────────

  tick(deltaTime: number): boolean {
    const nowSeconds = Date.now() / 1000;

    // Handle crash sequence
    if (this.crashActive) {
      return this.tickCrash(deltaTime);
    }

    // Handle glitch frame overlays
    if (this.isGlitching) {
      if (nowSeconds >= this.glitchEndTime) {
        // Restore previous animation
        this.isGlitching = false;
        this.daemonAvatarSequence = this.savedSequence;
        this.avatarFrameInterval = this.savedInterval;
        this.avatarSequenceMode = this.savedMode;
        this.avatarFrameIndex = 0;
        this.avatarFrameTimer = 0;
        return true;
      }
    } else if (this.voicelineStartTime > 0) {
      // Check if any glitch event should fire
      const elapsed = nowSeconds - this.voicelineStartTime;
      for (const ev of this.glitchEvents) {
        if (!ev.fired && elapsed >= ev.triggerTime && elapsed < ev.triggerTime + ev.duration + 0.5) {
          ev.fired = true;
          this.savedSequence = this.daemonAvatarSequence.slice();
          this.savedInterval = this.avatarFrameInterval;
          this.savedMode = this.avatarSequenceMode;
          this.isGlitching = true;
          this.glitchEndTime = nowSeconds + ev.duration;
          this.daemonAvatarSequence = this.GLITCH_FRAMES.slice();
          this.avatarSequenceMode = 'loop';
          this.avatarFrameInterval = this.GLITCH_FRAME_INTERVAL;
          this.avatarFrameIndex = 0;
          this.avatarFrameTimer = 0;
          return true;
        }
      }
    }

    // Normal tick
    this.avatarFrameTimer += deltaTime;
    if (this.avatarFrameTimer < this.avatarFrameInterval) {
      return false;
    }

    this.avatarFrameTimer = 0;

    if (this.animationPhases.length > 0) {
      this.advancePhaseFrame();
      return true;
    }

    if (!this.daemonAvatarSequence.length) return false;
    if (this.daemonAvatarSequence.length === 1) {
      this.avatarFrameIndex = 0;
      return true;
    }

    if (this.avatarSequenceMode === 'loop') {
      this.avatarFrameIndex = (this.avatarFrameIndex + 1) % this.daemonAvatarSequence.length;
    } else {
      const nextIndex = this.avatarFrameIndex + this.avatarFrameDirection;
      if (nextIndex >= this.daemonAvatarSequence.length || nextIndex < 0) {
        this.avatarFrameDirection *= -1;
        this.avatarFrameIndex += this.avatarFrameDirection;
      } else {
        this.avatarFrameIndex = nextIndex;
      }
    }

    return true;
  }

  getCurrentFrame(): string | null {
    if (this.animationPhases.length > 0 && this.currentPhaseIndex < this.animationPhases.length) {
      const phase = this.animationPhases[this.currentPhaseIndex];
      if (!phase || phase.frameSequence.length === 0) return null;
      return phase.frameSequence[this.avatarFrameIndex] ?? null;
    }

    if (!this.daemonAvatarSequence.length) return null;
    return this.daemonAvatarSequence[this.avatarFrameIndex] ?? null;
  }

  private clearPhases(): void {
    this.animationPhases = [];
    this.currentPhaseIndex = 0;
    this.currentPhaseFrameCount = 0;
  }

  private advancePhaseFrame(): void {
    if (this.currentPhaseIndex >= this.animationPhases.length) return;

    const phase = this.animationPhases[this.currentPhaseIndex];
    if (!phase || phase.frameSequence.length === 0) return;

    this.avatarFrameIndex = this.currentPhaseFrameCount % phase.frameSequence.length;
    this.currentPhaseFrameCount++;

    if (this.currentPhaseFrameCount >= phase.frameSequence.length) {
      if (this.currentPhaseIndex === this.animationPhases.length - 1 && this.voicelineAudioDuration > 0) {
        this.currentPhaseFrameCount = 0;
      } else {
        this.currentPhaseIndex++;
        this.currentPhaseFrameCount = 0;

        if (this.currentPhaseIndex < this.animationPhases.length) {
          this.avatarFrameInterval = this.animationPhases[this.currentPhaseIndex].frameInterval;
        }
      }
    }
  }

  private tickCrash(deltaTime: number): boolean {
    if (this.crashPhaseIndex >= CRASH_SEQUENCE_PHASES.length) {
      // Crash sequence complete
      this.crashActive = false;
      if (this.crashCallback) {
        this.crashCallback();
        this.crashCallback = null;
      }
      return true;
    }

    this.crashPhaseElapsed += deltaTime;
    const phase = CRASH_SEQUENCE_PHASES[this.crashPhaseIndex];

    // Advance frame within current crash phase
    this.avatarFrameTimer += deltaTime;
    if (this.avatarFrameTimer >= phase.interval) {
      this.avatarFrameTimer = 0;
      this.avatarFrameIndex = (this.avatarFrameIndex + 1) % phase.frames.length;
    }

    // Check if this phase is done
    if (this.crashPhaseElapsed >= phase.duration) {
      this.crashPhaseIndex++;
      this.crashPhaseElapsed = 0;
      this.avatarFrameIndex = 0;
      this.avatarFrameTimer = 0;

      if (this.crashPhaseIndex < CRASH_SEQUENCE_PHASES.length) {
        const nextPhase = CRASH_SEQUENCE_PHASES[this.crashPhaseIndex];
        this.daemonAvatarSequence = nextPhase.frames.slice();
        this.avatarFrameInterval = nextPhase.interval;
      }
    }

    return true;
  }
}
