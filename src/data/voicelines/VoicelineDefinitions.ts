/**
 * VoicelineDefinitions - Centralized configuration for daemon voicelines
 * 
 * Each voiceline defines:
 * - message: The text to display (character by character)
 * - animationSequence: Array of animation phases to play
 * - typingSpeed: How fast the text appears (characters per second)
 * - holdDuration: How long the message stays after typing is done
 */

export interface AnimationPhase {
  /** Emotion/animation key from daemonAvatarSets */
  emotion: string;
  /** Number of times to repeat this animation */
  cycles: number;
  /** Optional frame interval for this phase (frame duration in seconds) */
  frameInterval?: number;
  /** Playback mode: forward (1-2-3-4), pingpong (1-2-3-4-3-2), custom (use frameOrder) */
  playbackMode?: 'forward' | 'pingpong' | 'custom';
  /** Custom frame order using 1-based indexes, e.g. [1,2,3,4,3,4] */
  frameOrder?: number[];
}

export interface VoicelineConfig {
  /** Unique identifier for the voiceline */
  id: string;
  /** Message text displayed character by character */
  message: string;
  /** Animation phases in sequence */
  animationSequence: AnimationPhase[];
  /** Typing speed in characters per second (default: 55) */
  typingSpeed?: number;
  /** Hold duration in seconds after typing completes (default: 3.5) */
  holdDuration?: number;
  /** Optional audio file path (relative to public assets root) */
  audioPath?: string;
  /** Total duration for audio playback in seconds - animations loop on final phase until this time */
  audioDuration?: number;
}

/**
 * Registry of all voicelines
 * Add new voicelines here for easy access
 */
export const VOICELINES: Record<string, VoicelineConfig> = {
  'error_404_skill_not_found': {
    id: 'error_404_skill_not_found',
    message: 'Error 404{pause:0.5}skill not found',
    animationSequence: [
      // First: error cycle (2 cycles for quicker transition to bored)
      {
        emotion: 'error',
        cycles: 2,
        frameInterval: 0.15,
      },
      // Then: bored animation (loops until audioDuration)
      {
        emotion: 'bored',
        cycles: 1,  // Will loop automatically
        frameInterval: 0.18,
      },
    ],
    typingSpeed: 8, // Very slow reading - text displays over ~3-4 seconds
    holdDuration: 4.0,
    audioPath: 'voicelines/skill_not_found.wav',
    audioDuration: 6.5,  // Popup stays for 6.5 seconds total, bored loops during this time
  },

  'test_surpris_pingpong': {
    id: 'test_surpris_pingpong',
    message: 'Ping en dents de scie détecté... système surpris.',
    animationSequence: [
      {
        emotion: 'surpris',
        cycles: 1,
        frameInterval: 0.14,
        playbackMode: 'pingpong',
      },
    ],
    typingSpeed: 9,
    holdDuration: 4.0,
    audioDuration: 6.5,
  },

  'test_rire_34_loop': {
    id: 'test_rire_34_loop',
    message: 'Analyse terminée... hahaha, je reste sur le pic de rire.',
    animationSequence: [
      {
        emotion: 'rire',
        cycles: 1,
        frameInterval: 0.14,
        playbackMode: 'custom',
        frameOrder: [1, 2, 3, 4],
      },
      {
        emotion: 'rire',
        cycles: 1,
        frameInterval: 0.14,
        playbackMode: 'custom',
        frameOrder: [3, 4],
      },
    ],
    typingSpeed: 9,
    holdDuration: 4.0,
    audioDuration: 6.5,
  },

  // Example: Add more voicelines here
  // 'example_voiceline': { ... }
};

/**
 * Helper to get a voiceline by ID
 */
export function getVoiceline(id: string): VoicelineConfig | undefined {
  return VOICELINES[id];
}

/**
 * Helper to list all available voiceline IDs
 */
export function listAllVoicelineIds(): string[] {
  return Object.keys(VOICELINES);
}
