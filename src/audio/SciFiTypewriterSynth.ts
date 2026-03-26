export interface SciFiTypewriterSynthOptions {
  intervalMs?: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  baseGain: number;
  pitchHz: number;
  waveform: OscillatorType;
  durationMs: number;
  intervalJitterMs: number;
}

export type SciFiTypewriterPreset = 'oldschool_fast' | 'oldschool_arcade' | 'oldschool_crt';

export const SCI_FI_TYPEWRITER_PRESETS: Record<SciFiTypewriterPreset, Partial<SciFiTypewriterSynthOptions>> = {
  // Fast, regular, square-wave terminal typing (recommended default)
  oldschool_fast: {
    intervalMs: 56,
    minIntervalMs: 50,
    maxIntervalMs: 120,
    baseGain: 0.038,
    pitchHz: 1280,
    waveform: 'square',
    durationMs: 24,
    intervalJitterMs: 0,
  },
  // Slightly higher pitch, arcade-like but still regular
  oldschool_arcade: {
    intervalMs: 74,
    minIntervalMs: 64,
    maxIntervalMs: 150,
    baseGain: 0.04,
    pitchHz: 1450,
    waveform: 'square',
    durationMs: 24,
    intervalJitterMs: 0,
  },
  // Darker and a bit longer click, CRT terminal flavor
  oldschool_crt: {
    intervalMs: 82,
    minIntervalMs: 70,
    maxIntervalMs: 170,
    baseGain: 0.042,
    pitchHz: 1120,
    waveform: 'square',
    durationMs: 34,
    intervalJitterMs: 0,
  },
};

const DEFAULT_OPTIONS: SciFiTypewriterSynthOptions = {
  intervalMs: undefined,
  minIntervalMs: 75,
  maxIntervalMs: 230,
  baseGain: 0.05,
  pitchHz: 1260,
  waveform: 'square',
  durationMs: 42,
  intervalJitterMs: 0,
};

/**
 * Lightweight procedural synth for terminal typing / glitch beeps.
 * Queue one event per typed character and call update(dtMs) every frame.
 */
export class SciFiTypewriterSynth {
  private readonly options: SciFiTypewriterSynthOptions;
  private audioContext: AudioContext | null = null;
  private internalContext: AudioContext | null = null;
  private minGapMs = 0;
  private nextAllowedTimeMs = 0;

  constructor(options?: Partial<SciFiTypewriterSynthOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.minGapMs = this.computeNextGapMs();
  }

  attachContext(context: AudioContext | null | undefined): void {
    if (!context) return;

    // Keep a known-running context when an external suspended context is provided.
    if (this.audioContext && this.audioContext.state === 'running' && context.state !== 'running') {
      return;
    }

    this.audioContext = context;
  }

  async unlock(): Promise<void> {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!this.internalContext && Ctor) {
      this.internalContext = new Ctor();
    }
    if (!this.audioContext) {
      this.audioContext = this.internalContext;
    }
    if (!this.audioContext && !this.internalContext) return;

    if (this.internalContext && this.internalContext.state !== 'running') {
      try {
        await this.internalContext.resume();
      } catch {
        // Browser may still reject resume without user gesture; retry later.
      }
    }

    if (this.audioContext && this.audioContext.state !== 'running') {
      try {
        await this.audioContext.resume();
      } catch {
        // Browser may still reject resume without user gesture; retry later.
      }
    }

    if (
      this.internalContext &&
      this.internalContext.state === 'running' &&
      (!this.audioContext || this.audioContext.state !== 'running')
    ) {
      this.audioContext = this.internalContext;
    }
  }

  triggerForTypedChar(): void {
    let ctx = this.audioContext;
    if (!ctx || ctx.state !== 'running') {
      if (this.internalContext && this.internalContext.state === 'running') {
        ctx = this.internalContext;
        this.audioContext = ctx;
      }
    }
    if (!ctx || ctx.state !== 'running') return;

    const nowMs = ctx.currentTime * 1000;
    if (nowMs < this.nextAllowedTimeMs) return;

    this.triggerBeep();
    this.minGapMs = this.computeNextGapMs();
    this.nextAllowedTimeMs = nowMs + this.minGapMs;
  }

  dispose(): void {
    this.nextAllowedTimeMs = 0;
  }

  private computeNextGapMs(): number {
    if (typeof this.options.intervalMs === 'number') {
      const jitter = this.options.intervalJitterMs > 0
        ? (Math.random() * 2 - 1) * this.options.intervalJitterMs
        : 0;
      return Math.max(this.options.minIntervalMs, this.options.intervalMs + jitter);
    }

    const base = (this.options.minIntervalMs + this.options.maxIntervalMs) * 0.5;
    const jitter = this.options.intervalJitterMs > 0
      ? (Math.random() * 2 - 1) * this.options.intervalJitterMs
      : 0;
    return Math.max(this.options.minIntervalMs, Math.min(this.options.maxIntervalMs, base + jitter));
  }

  private triggerBeep(): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = this.options.durationMs / 1000;

    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = this.options.pitchHz * 1.25;
    filter.Q.value = 5;

    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(this.options.baseGain, now + 0.0015);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const oscA = ctx.createOscillator();
    oscA.type = this.options.waveform;
    oscA.frequency.setValueAtTime(this.options.pitchHz, now);

    oscA.connect(master);
    master.connect(filter);
    filter.connect(ctx.destination);

    oscA.start(now);
    oscA.stop(now + duration);

    oscA.onended = () => {
      oscA.disconnect();
      master.disconnect();
      filter.disconnect();
    };
  }
}
