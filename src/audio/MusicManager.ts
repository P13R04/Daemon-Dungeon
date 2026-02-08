/**
 * MusicManager - Manages background music and transitions
 */

import { Scene, Sound } from '@babylonjs/core';

export class MusicManager {
  private scene: Scene;
  private currentTrack?: Sound;
  private tracks: Map<string, Sound> = new Map();
  private musicVolume: number = 0.7;
  private masterVolume: number = 1.0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  loadTrack(name: string, path: string): Promise<Sound> {
    return new Promise((resolve, reject) => {
      const sound = new Sound(
        name,
        path,
        this.scene,
        () => resolve(sound),
        {
          loop: true,
          autoplay: false,
        }
      );
      this.tracks.set(name, sound);
    });
  }

  playTrack(name: string, fadeInDuration: number = 0): void {
    const track = this.tracks.get(name);
    if (!track) return;

    if (this.currentTrack) {
      this.stopCurrentTrack(fadeInDuration);
    }

    this.currentTrack = track;
    
    if (fadeInDuration > 0) {
      track.setVolume(0);
      track.play();
      this.fadeIn(track, fadeInDuration);
    } else {
      track.setVolume(this.musicVolume * this.masterVolume);
      track.play();
    }
  }

  private stopCurrentTrack(fadeOutDuration: number = 0): void {
    if (!this.currentTrack) return;

    if (fadeOutDuration > 0) {
      this.fadeOut(this.currentTrack, fadeOutDuration);
    } else {
      this.currentTrack.stop();
    }
  }

  private fadeIn(sound: Sound, duration: number): void {
    // TODO: Implement fade in animation
  }

  private fadeOut(sound: Sound, duration: number): void {
    // TODO: Implement fade out animation
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentTrack) {
      this.currentTrack.setVolume(this.musicVolume * this.masterVolume);
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.currentTrack) {
      this.currentTrack.setVolume(this.musicVolume * this.masterVolume);
    }
  }

  pause(): void {
    if (this.currentTrack) {
      this.currentTrack.pause();
    }
  }

  resume(): void {
    if (this.currentTrack) {
      this.currentTrack.play();
    }
  }

  dispose(): void {
    this.tracks.forEach(track => track.dispose());
    this.tracks.clear();
  }
}
