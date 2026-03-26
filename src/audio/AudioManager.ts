/**
 * AudioManager - Manages sound effects and spatial audio
 */

import { Engine, Scene, Sound, Vector3 } from '@babylonjs/core';

export class AudioManager {
  private scene: Scene;
  private sounds: Map<string, Sound> = new Map();
  private masterVolume: number = 1.0;
  private sfxVolume: number = 1.0;
  private activeBeepClones: Sound[] = [];
  private readonly MAX_CONCURRENT_BEEPS = 3;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  loadSound(name: string, path: string, options?: any): Promise<Sound> {
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

  playSound(name: string, volume?: number): void {
    const sound = this.sounds.get(name);
    if (sound) {
      sound.setVolume((volume ?? 1.0) * this.sfxVolume * this.masterVolume);
      sound.play();
    }
  }

  playSoundAt(name: string, position: Vector3, volume?: number): void {
    const sound = this.sounds.get(name);
    if (sound) {
      sound.setVolume((volume ?? 1.0) * this.sfxVolume * this.masterVolume);
      sound.setPosition(position);
      sound.play();
    }
  }

  stopSound(name: string): void {
    const sound = this.sounds.get(name);
    if (sound) {
      sound.stop();
    }
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
    this.sounds.forEach(sound => {
      sound.setVolume(this.sfxVolume * this.masterVolume);
    });
  }

  /**
   * Play a beep effect with randomized pitch — for terminal typewriter effects.
   * Uses 'beep' sound, which must be pre-loaded.
   */
  playBeep(volume?: number): void {
    const sound = this.sounds.get('beep');
    if (!sound) return;

    const audioEngine = Engine.audioEngine;
    const context = (audioEngine as any)?.audioContext as AudioContext | undefined;
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
    this.sounds.forEach(sound => sound.dispose());
    this.sounds.clear();
  }
}
