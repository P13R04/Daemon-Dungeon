import meSpeak from 'mespeak';
import meSpeakConfig from 'mespeak/src/mespeak_config.json';
import enVoice from 'mespeak/voices/en/en.json';
import enUsVoice from 'mespeak/voices/en/en-us.json';
import frVoice from 'mespeak/voices/fr.json';

export interface LayerPlan {
  text: string;
  voiceId: string;
  pitch: number;
  speed: number;
  amplitude: number;
  wordgap: number;
  gain: number;
  delaySeconds: number;
}

export interface GlitchPlan {
  eventCount: number;
  sliceSeconds: number;
  repeats: number;
  repeatGapSeconds: number;
  gain: number;
}

export interface SynthesisPlan {
  layers: LayerPlan[];
  glitch?: GlitchPlan;
}

interface GlitchEvent {
  startPos: number;
  sliceSeconds: number;
  repeats: number;
  gapSeconds: number;
}

const VOICE_DATA: Record<string, any> = {
  'en/en-us': enUsVoice,
  'en/en': enVoice,
  'fr': frVoice,
};

export const VOICE_PRESETS = {
  cold_dual: {
    synthesisMode: "dual-overlay",
    lowPitch: 20,
    highPitch: 70,
    lowSpeed: 170,
    highSpeed: 170,
    lowAmplitude: 118,
    highAmplitude: 96,
    overlayDelayMs: 18,
    chunkWordCount: 3,
    glitchChance: 0.35,
    glitchReplayWords: 2,
    wordGap: 1,
    reverbMix: 0.28,
    distortion: 0.18
  },
  cynic_switch: {
    synthesisMode: "alternate",
    lowPitch: 32,
    highPitch: 76,
    lowSpeed: 176,
    highSpeed: 176,
    lowAmplitude: 110,
    highAmplitude: 90,
    overlayDelayMs: 0,
    chunkWordCount: 2,
    glitchChance: 0.2,
    glitchReplayWords: 2,
    wordGap: 0,
    reverbMix: 0.22,
    distortion: 0.11
  },
  demon_glitch: {
    synthesisMode: "glitch-switch",
    lowPitch: 14,
    highPitch: 84,
    lowSpeed: 168,
    highSpeed: 168,
    lowAmplitude: 132,
    highAmplitude: 104,
    overlayDelayMs: 12,
    chunkWordCount: 2,
    glitchChance: 0.64,
    glitchReplayWords: 3,
    wordGap: 1,
    reverbMix: 0.34,
    distortion: 0.27
  },
  flat_operator: {
    synthesisMode: "single-low",
    lowPitch: 44,
    highPitch: 44,
    lowSpeed: 172,
    highSpeed: 172,
    lowAmplitude: 96,
    highAmplitude: 96,
    overlayDelayMs: 0,
    chunkWordCount: 4,
    glitchChance: 0,
    glitchReplayWords: 1,
    wordGap: 0,
    reverbMix: 0.12,
    distortion: 0.05
  }
};

export class DaemonVoiceSynth {
  private static instance: DaemonVoiceSynth;
  private loadedVoices: Set<string> = new Set();
  private audioContext: AudioContext | null = null;

  private constructor() {
    this.ensureConfigLoaded();
  }

  public static getInstance(): DaemonVoiceSynth {
    if (!DaemonVoiceSynth.instance) {
      DaemonVoiceSynth.instance = new DaemonVoiceSynth();
    }
    return DaemonVoiceSynth.instance;
  }

  public setAudioContext(context: AudioContext): void {
    this.audioContext = context;
  }

  private ensureConfigLoaded(): void {
    if (!meSpeak.isConfigLoaded()) {
      meSpeak.loadConfig(meSpeakConfig as Record<string, unknown>);
    }
  }

  private ensureVoiceLoaded(voiceId: string): void {
    if (this.loadedVoices.has(voiceId)) return;

    const voiceJson = VOICE_DATA[voiceId];
    if (!voiceJson) return;

    meSpeak.loadVoice(voiceJson as Record<string, unknown>);
    this.loadedVoices.add(voiceId);
  }

  public async synthesize(text: string, presetName: keyof typeof VOICE_PRESETS = 'cold_dual'): Promise<{ buffer: AudioBuffer; duration: number }> {
    if (!this.audioContext) {
      throw new Error('AudioContext not attached to DaemonVoiceSynth');
    }

    // Select preset
    const preset = VOICE_PRESETS[presetName] || VOICE_PRESETS.cold_dual;
    const glitchChance = preset.glitchChance;
    const glitchReplayWords = preset.glitchReplayWords;
    const wordGap = preset.wordGap + 0.18; // Slightly tighter word gap for snappiness

    const plan: SynthesisPlan = {
      layers: [
        {
          text,
          voiceId: 'en/en-us',
          pitch: preset.lowPitch,
          speed: preset.lowSpeed,
          amplitude: preset.lowAmplitude,
          wordgap: wordGap,
          gain: 0.85,
          delaySeconds: 0,
        },
        {
          text,
          voiceId: 'en/en',
          pitch: preset.highPitch,
          speed: preset.highSpeed,
          amplitude: preset.highAmplitude,
          wordgap: wordGap + 0.2,
          gain: 0.72,
          delaySeconds: preset.overlayDelayMs / 1000,
        }
      ]
    };


    const renderedLayers = await Promise.all(
      plan.layers.map(async (layer) => {
        this.ensureVoiceLoaded(layer.voiceId);
        const raw = meSpeak.speak(layer.text, {
          voice: layer.voiceId,
          pitch: layer.pitch,
          speed: layer.speed,
          amplitude: layer.amplitude,
          wordgap: layer.wordgap,
          rawdata: 'array',
        });

        const wavData = this.normalizeRawData(raw);
        return {
          layer,
          buffer: await this.audioContext!.decodeAudioData(wavData.slice(0))
        };
      })
    );

    const glitchMap: GlitchEvent[] = [];
    const duration = renderedLayers[0].buffer.duration;
    
    // Dynamic glitch params from lab logic
    const glitchSliceSeconds = Math.max(0.03, Math.min(0.22, 0.022 + glitchReplayWords * 0.028));
    const glitchEventCount = Math.max(1, Math.min(10, Math.round(glitchChance * 7 + (text.split(' ').length) / 20)));
    const glitchRepeats = Math.max(2, Math.min(6, 1 + Math.floor(glitchReplayWords)));
    const glitchGapSeconds = Math.max(0.012, glitchSliceSeconds * 0.4);

    const usableStart = 0.08;
    const usableEnd = duration - glitchSliceSeconds - 0.08;
    
    if (usableEnd > usableStart) {
      const events: GlitchEvent[] = [];
      for (let i = 0; i < glitchEventCount; i++) {
        // Higher base chance for "glitchy" feel
        if (Math.random() > 0.7) continue; 
        const eventStart = usableStart + Math.random() * (usableEnd - usableStart);
        events.push({
          startPos: eventStart,
          sliceSeconds: glitchSliceSeconds,
          repeats: glitchRepeats,
          gapSeconds: glitchGapSeconds
        });
      }
      events.sort((a, b) => a.startPos - b.startPos);
      let lastEnd = 0;
      for (const ev of events) {
        if (ev.startPos < lastEnd) continue;
        glitchMap.push(ev);
        lastEnd = ev.startPos + ev.sliceSeconds + (ev.repeats * ev.gapSeconds) + 0.02;
      }
    }

    // Combine layers into a single buffer
    const finalBuffer = this.mixLayers(renderedLayers, glitchMap);
    return { buffer: finalBuffer, duration: finalBuffer.duration };
  }

  private normalizeRawData(raw: any): ArrayBuffer {
    if (raw instanceof ArrayBuffer) return raw.slice(0);
    if (ArrayBuffer.isView(raw)) {
      const view = raw as ArrayBufferView;
      const copy = new Uint8Array(view.byteLength);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return copy.buffer;
    }
    if (Array.isArray(raw)) return new Uint8Array(raw).buffer;
    throw new Error('Unexpected meSpeak output format');
  }

  private mixLayers(
    layers: Array<{ layer: LayerPlan; buffer: AudioBuffer }>,
    glitchMap: GlitchEvent[]
  ): AudioBuffer {
    if (!this.audioContext) throw new Error('No AudioContext');

    const sampleRate = layers[0].buffer.sampleRate;
    
    const processedLayers = layers.map(l => l.buffer);

    const maxLen = processedLayers.reduce((max, b) => Math.max(max, b.length), 0);
    const mixed = this.audioContext.createBuffer(1, maxLen, sampleRate);
    const dst = mixed.getChannelData(0);

    processedLayers.forEach((buffer, idx) => {
      const src = buffer.getChannelData(0);
      const layer = layers[idx].layer;
      const gain = layer.gain;
      const delaySamples = Math.floor((layer.delaySeconds || 0) * sampleRate);
      
      for (let i = 0; i < src.length; i++) {
        if (i + delaySamples < dst.length) {
          dst[i + delaySamples] += src[i] * gain;
        }
      }
    });
    
    // Apply glitches to the final mix for a snappier, synchronized feel
    const glitchedBuffer = this.applyGlitchMapToBuffer(mixed, glitchMap);

    return glitchedBuffer;
  }

  private applyGlitchMapToBuffer(buffer: AudioBuffer, map: GlitchEvent[]): AudioBuffer {
    if (!this.audioContext || map.length === 0) return buffer;

    let addedDuration = 0;
    for (const ev of map) {
      addedDuration += ev.repeats * Math.max(ev.sliceSeconds, ev.gapSeconds);
    }

    const sampleRate = buffer.sampleRate;
    const oldLength = buffer.length;
    const newLength = oldLength + Math.ceil(addedDuration * sampleRate) + 100;
    const newBuffer = this.audioContext.createBuffer(buffer.numberOfChannels, newLength, sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const srcData = buffer.getChannelData(channel);
      const dstData = newBuffer.getChannelData(channel);

      let srcIdx = 0;
      let dstIdx = 0;
      let mapIdx = 0;

      while (srcIdx < oldLength && dstIdx < newLength) {
        if (mapIdx < map.length) {
          const ev = map[mapIdx];
          const evStartIdx = Math.floor(ev.startPos * sampleRate);
          const evSliceLen = Math.floor(ev.sliceSeconds * sampleRate);
          const evGapLen = Math.floor(ev.gapSeconds * sampleRate);

          if (srcIdx === evStartIdx) {
            // Write original slice
            for (let i = 0; i < evSliceLen && srcIdx < oldLength && dstIdx < newLength; i++) {
              dstData[dstIdx++] = srcData[srcIdx++];
            }

            // Write repeats
            for (let r = 0; r < ev.repeats; r++) {
              const decay = 1 - r / Math.max(1, ev.repeats + 1);
              const volume = 0.65 + decay * 0.35;
              for (let i = 0; i < evSliceLen && (evStartIdx + i) < oldLength && dstIdx < newLength; i++) {
                dstData[dstIdx++] = srcData[evStartIdx + i] * volume;
              }
              if (evGapLen > evSliceLen) {
                dstIdx += (evGapLen - evSliceLen);
              }
            }
            mapIdx++;
            continue;
          }
        }
        dstData[dstIdx++] = srcData[srcIdx++];
      }
    }

    return newBuffer;
  }
}
