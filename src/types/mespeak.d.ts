declare module 'mespeak' {
  export interface SpeakOptions {
    amplitude?: number;
    pitch?: number;
    speed?: number;
    voice?: string;
    wordgap?: number;
    volume?: number;
    rawdata?: string | boolean;
  }

  export interface MeSpeak {
    speak(text: string, options?: SpeakOptions): unknown;
    loadConfig(configOrUrl: object | string, callback?: () => void): void;
    loadVoice(voiceOrUrl: object | string, callback?: (success: boolean, message: string) => void): void;
    setDefaultVoice(voiceId: string): void;
    isConfigLoaded(): boolean;
    isVoiceLoaded(voiceId?: string): boolean;
  }

  const meSpeak: MeSpeak;
  export default meSpeak;
}
