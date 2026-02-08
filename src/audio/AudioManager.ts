/**
 * AudioManager - Manages sound effects and spatial audio
 */

import { Scene, Sound, Vector3 } from '@babylonjs/core';

export class AudioManager {
  private scene: Scene;
  private sounds: Map<string, Sound> = new Map();
  private masterVolume: number = 1.0;
  private sfxVolume: number = 1.0;

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

  dispose(): void {
    this.sounds.forEach(sound => sound.dispose());
    this.sounds.clear();
  }
}
