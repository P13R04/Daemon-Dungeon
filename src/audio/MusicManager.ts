import { Engine, Scene, Sound } from '@babylonjs/core';

export class MusicManager {
  private scene: Scene;
  private currentTrack?: Sound;
  private tracks: Map<string, Sound> = new Map();
  private musicVolume: number = 0.35;
  private masterVolume: number = 1.0;
  private lpfVolumeMultiplier: number = 1.0;
  
  private filterNode?: BiquadFilterNode;
  private isLowPassEnabled: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  loadTrack(name: string, path: string): Promise<Sound> {
    console.log(`[MusicManager] Loading track: ${name} from ${path}`);
    return new Promise((resolve, reject) => {
      const sound = new Sound(
        name,
        path,
        this.scene,
        () => {
          console.log(`[MusicManager] Track loaded: ${name}`);
          this.ensureFilterInitialized();
          if (this.filterNode) {
            this.connectTrackToFilter(sound);
          }
          resolve(sound);
        },
        {
          loop: true,
          autoplay: false,
          streaming: false,
        }
      );
      this.tracks.set(name, sound);
    });
  }

  playTrack(name: string, fadeInDuration: number = 0): void {
    const track = this.tracks.get(name);
    if (!track) {
      console.warn(`[MusicManager] Track not found: ${name}`);
      return;
    }

    const context = Engine.audioEngine?.audioContext;
    if (context && context.state === 'suspended') {
      console.log('[MusicManager] Resuming audio context');
      void context.resume();
    }

    if (this.currentTrack && this.currentTrack !== track) {
      this.stopCurrentTrack(fadeInDuration);
    }

    const wasAlreadyPlaying = track.isPlaying;
    this.currentTrack = track;
    
    console.log(`[MusicManager] Playing track: ${name}, wasAlreadyPlaying: ${wasAlreadyPlaying}, musicVol: ${this.musicVolume}, masterVol: ${this.masterVolume}`);

    this.ensureFilterInitialized();
    if (this.filterNode) {
      this.connectTrackToFilter(track);
    }

    if (!wasAlreadyPlaying) {
      if (fadeInDuration > 0) {
        track.setVolume(0);
        track.play();
        this.fadeIn(track, fadeInDuration);
      } else {
        this.updateTrackVolume(track);
        track.play();
      }
    } else {
      this.updateTrackVolume(track);
    }
  }

  private connectTrackToFilter(track: Sound): void {
    if (!this.filterNode) return;
    const trackAny = track as any;
    try {
      console.log('[MusicManager] Connecting track to filter node');
      if (typeof trackAny.connectToSoundTrackAudioNode === 'function') {
        trackAny.connectToSoundTrackAudioNode(this.filterNode);
      } else if (typeof trackAny.connectToAudioNode === 'function') {
        trackAny.connectToAudioNode(this.filterNode);
      }
    } catch (e) {
      console.warn('[MusicManager] Failed to connect track to filter:', e);
    }
  }

  private ensureFilterInitialized(): void {
    const context = Engine.audioEngine?.audioContext;
    
    if (context && !this.filterNode) {
      console.log('[MusicManager] Creating filter node');
      this.filterNode = context.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = this.isLowPassEnabled ? 800 : 22050;
      
      // Connect filter directly to destination to eliminate masterGain issues
      console.log('[MusicManager] Connecting filter to destination');
      this.filterNode.connect(context.destination);
    }
  }

  public setLowPass(enabled: boolean, duration: number = 0.4): void {
    this.isLowPassEnabled = enabled;
    const context = Engine.audioEngine?.audioContext;
    if (!context) return;

    this.ensureFilterInitialized();
    
    if (this.filterNode) {
      const targetFreq = enabled ? 800 : 22050;
      const targetVolMult = enabled ? 0.45 : 1.0;
      
      console.log(`[MusicManager] Transitioning LPF: enabled=${enabled}, targetFreq=${targetFreq}, targetVolMult=${targetVolMult}`);
      
      this.filterNode.frequency.cancelScheduledValues(context.currentTime);
      this.filterNode.frequency.setTargetAtTime(targetFreq, context.currentTime, duration / 3);
      
      this.animateLpfVolume(targetVolMult, duration);
    }
  }

  private animateLpfVolume(targetMultiplier: number, duration: number): void {
    const startMultiplier = this.lpfVolumeMultiplier;
    const startTime = performance.now();
    
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      this.lpfVolumeMultiplier = startMultiplier + (targetMultiplier - startMultiplier) * progress;
      
      if (this.currentTrack) {
        this.updateTrackVolume(this.currentTrack);
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  private updateTrackVolume(track: Sound): void {
    const vol = this.musicVolume * this.masterVolume * this.lpfVolumeMultiplier;
    console.log(`[MusicManager] Setting track volume to: ${vol}`);
    track.setVolume(vol);
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
    const targetVolume = this.musicVolume * this.masterVolume * this.lpfVolumeMultiplier;
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      sound.setVolume(progress * targetVolume);
      if (progress < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  private fadeOut(sound: Sound, duration: number): void {
    const startVolume = sound.getVolume();
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      sound.setVolume(startVolume * (1 - progress));
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        sound.stop();
      }
    };
    animate();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentTrack) this.updateTrackVolume(this.currentTrack);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.currentTrack) this.updateTrackVolume(this.currentTrack);
  }

  pause(): void {
    if (this.currentTrack) this.currentTrack.pause();
  }

  stop(): void {
    if (this.currentTrack) this.currentTrack.stop();
  }

  resume(): void {
    if (this.currentTrack) this.currentTrack.play();
  }

  dispose(): void {
    this.tracks.forEach(track => track.dispose());
    this.tracks.clear();
    this.currentTrack = undefined;
  }
}
