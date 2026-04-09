export type AvatarSequenceMode = 'pingpong' | 'loop';

export interface DaemonAnimationPhaseState {
  emotion: string;
  frameSequence: string[];
  frameInterval: number;
}

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
    return (nowSeconds - this.voicelineStartTime) >= this.voicelineAudioDuration;
  }

  clearVoicelineState(): void {
    this.clearPhases();
    this.voicelineStartTime = 0;
    this.voicelineAudioDuration = 0;
  }

  tick(deltaTime: number): boolean {
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
}
