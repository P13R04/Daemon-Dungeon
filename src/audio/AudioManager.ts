/**
 * AudioManager - Manages sound effects and spatial audio
 */

import { Engine, Scene, Sound, Vector3 } from '@babylonjs/core';

interface AudioEngineLike {
  audioContext?: AudioContext;
  unlocked?: boolean;
}

export class AudioManager {
  private scene: Scene;
  private sounds: Map<string, Sound> = new Map();
  private masterVolume: number = 0.5;
  private sfxVolume: number = 0.5;
  private isMuted: boolean = false;
  private activeBeepClones: Sound[] = [];
  private activeSFXClones: Sound[] = [];
  private fadeTimers: Map<string, number> = new Map();
  private lastSoundPlayAtMs: Map<string, number> = new Map();
  private defaultSoundCooldownMs: number = 50;
  private soundCooldownOverridesMs: Map<string, number> = new Map();
  private readonly MAX_CONCURRENT_BEEPS = 10;
  private readonly MAX_CONCURRENT_CLONES = 30;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  loadSound(name: string, path: string, options?: ConstructorParameters<typeof Sound>[4]): Promise<Sound> {
    return new Promise((resolve, reject) => {
      const sound = new Sound(
        name,
        path,
        this.scene,
        () => resolve(sound),
        options
      );
      this.sounds.set(name, sound);
    });
  }

  playSound(name: string, volume?: number, options?: { pitchVariance?: number; allowOverlap?: boolean }): void {
    if (!this.canPlayNow(name)) return;
    const sound = this.sounds.get(name);
    if (!sound) return;
    
    const effectiveVolume = (volume ?? 1.0) * this.sfxVolume * this.masterVolume;
    const playbackRate = 1.0 + (options?.pitchVariance ? (Math.random() * 2 - 1) * options.pitchVariance : 0);

    if (options?.allowOverlap) {
      this.playClone(sound, effectiveVolume, playbackRate);
    } else {
      sound.setVolume(effectiveVolume);
      sound.setPlaybackRate(playbackRate);
      sound.play();
    }
  }

  playSoundAt(name: string, position: Vector3, volume?: number, options?: { pitchVariance?: number; allowOverlap?: boolean }): void {
    if (!this.canPlayNow(name)) return;
    const sound = this.sounds.get(name);
    if (!sound) return;

    const effectiveVolume = (volume ?? 1.0) * this.sfxVolume * this.masterVolume;
    const playbackRate = 1.0 + (options?.pitchVariance ? (Math.random() * 2 - 1) * options.pitchVariance : 0);

    if (options?.allowOverlap) {
      this.playClone(sound, effectiveVolume, playbackRate, position);
    } else {
      sound.setVolume(effectiveVolume);
      sound.setPlaybackRate(playbackRate);
      sound.setPosition(position);
      sound.play();
    }
  }

  private playClone(baseSound: Sound, volume: number, playbackRate: number, position?: Vector3): void {
    if (!baseSound.isReady() || this.activeSFXClones.length >= this.MAX_CONCURRENT_CLONES) return;
    try {
      const cloned = baseSound.clone();
      if (!cloned) return;
      this.activeSFXClones.push(cloned);
      const onEnd = () => {
        const idx = this.activeSFXClones.indexOf(cloned);
        if (idx > -1) this.activeSFXClones.splice(idx, 1);
        try {
          cloned.onEndedObservable.removeCallback(onEnd);
          cloned.dispose();
        } catch (e) {}
      };
      cloned.onEndedObservable.add(onEnd);
      cloned.setPlaybackRate(playbackRate);
      cloned.setVolume(Math.max(0, volume));
      if (position) cloned.setPosition(position);
      cloned.play();
    } catch (e) {}
  }

  stopSound(name: string): void {
    const sound = this.sounds.get(name);
    if (sound) {
      sound.stop();
    }
  }

  fadeOutAndStopSound(name: string, durationMs: number = 300): void {
    const sound = this.sounds.get(name);
    if (!sound) return;
    const existing = this.fadeTimers.get(name);
    if (existing != null) {
      window.clearInterval(existing);
      this.fadeTimers.delete(name);
    }

    const startVolume = this.isMuted ? 0 : this.sfxVolume * this.masterVolume;
    if (durationMs <= 0 || startVolume <= 0) {
      sound.stop();
      return;
    }

    const startTime = Date.now();
    const stepMs = 16;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      sound.setVolume(startVolume * (1 - t));
      if (t >= 1) {
        window.clearInterval(timer);
        this.fadeTimers.delete(name);
        sound.stop();
        sound.setVolume(startVolume);
      }
    }, stepMs);
    this.fadeTimers.set(name, timer);
  }

  stopAllSounds(except: string[] = []): void {
    const whitelist = new Set(except);
    this.sounds.forEach((sound, name) => {
      if (!whitelist.has(name)) {
        sound.stop();
      }
    });
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  setSFXVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  private updateAllVolumes(): void {
    const effectiveVolume = this.isMuted ? 0 : this.sfxVolume * this.masterVolume;
    this.sounds.forEach(sound => {
      sound.setVolume(effectiveVolume);
    });
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.updateAllVolumes();
  }

  setDefaultSoundCooldownMs(ms: number): void {
    this.defaultSoundCooldownMs = Math.max(0, Math.min(120, Math.round(ms)));
  }

  setSoundCooldownMs(name: string, ms: number): void {
    this.soundCooldownOverridesMs.set(name, Math.max(0, Math.min(500, Math.round(ms))));
  }

  /**
   * Play a beep effect with randomized pitch — for terminal typewriter effects.
   * Uses 'beep' sound, which must be pre-loaded.
   */
  playBeep(volume?: number): void {
    const sound = this.sounds.get('beep');
    if (!sound) return;

    const audioEngine = Engine.audioEngine as AudioEngineLike | undefined;
    const context = audioEngine?.audioContext;
    if (audioEngine && !(audioEngine.unlocked || context?.state === 'running')) {
      return;
    }

    // Limit concurrent beeps: don't start a new one if already at max
    if (this.activeBeepClones.length >= this.MAX_CONCURRENT_BEEPS) {
      return;
    }

    if (!sound.isReady()) return;

    // Clone sound to allow immediate replaying (Babylon limitation)
    try {
      const clonedBeep = sound.clone();
      if (!clonedBeep) return;

      this.activeBeepClones.push(clonedBeep);
      // Auto-remove from list when it finishes
      const onEnd = () => {
        const idx = this.activeBeepClones.indexOf(clonedBeep);
        if (idx > -1) {
          this.activeBeepClones.splice(idx, 1);
        }
        try {
          clonedBeep.onEndedObservable.removeCallback(onEnd);
          clonedBeep.dispose();
        } catch (e) {
          // ignore
        }
      };
      clonedBeep.onEndedObservable.add(onEnd);

      const effectiveVol = (volume ?? 0.4) * (0.75 + Math.random() * 0.5);
      clonedBeep.setPlaybackRate(0.8 + Math.random() * 0.55);
      clonedBeep.setVolume(Math.max(0, effectiveVol));
      clonedBeep.play();
    } catch (e) {
      // ignore errors
    }
  }

  dispose(): void {
    this.fadeTimers.forEach((timerId) => window.clearInterval(timerId));
    this.fadeTimers.clear();
    this.lastSoundPlayAtMs.clear();
    this.soundCooldownOverridesMs.clear();
    this.activeSFXClones.forEach(c => c.dispose());
    this.activeSFXClones = [];
    this.activeBeepClones.forEach(c => c.dispose());
    this.activeBeepClones = [];
    this.sounds.forEach(sound => sound.dispose());
    this.sounds.clear();
  }

  private canPlayNow(name: string): boolean {
    const now = Date.now();
    const cooldown = this.soundCooldownOverridesMs.get(name) ?? this.defaultSoundCooldownMs;
    if (cooldown <= 0) {
      this.lastSoundPlayAtMs.set(name, now);
      return true;
    }
    const last = this.lastSoundPlayAtMs.get(name) ?? 0;
    if (now - last < cooldown) {
      return false;
    }
    this.lastSoundPlayAtMs.set(name, now);
    return true;
  }
}
