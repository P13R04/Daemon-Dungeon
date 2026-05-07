/**
 * VoicelineDefinitions - Centralized configuration for daemon voicelines
 * 
 * Each voiceline defines:
 * - message: The text to display (character by character)
 * - animationSequence: Array of animation phases to play
 * - typingSpeed: How fast the text appears (characters per second)
 * - holdDuration: How long the message stays after typing is done
 *
 * Event-driven fields (optional, used by DaemonVoicelineManager):
 * - trigger: Which game event fires this voiceline
 * - weight: Selection priority (higher = more likely)
 * - requiredClass: Restrict to a specific player class
 * - canGlitchFrames / canCrash: Allow mid-voiceline visual FX
 */

/** All supported event trigger categories for voicelines */
export type VoicelineTrigger =
  | 'player_damaged'
  | 'player_damaged_zombie'
  | 'player_damaged_jumper'
  | 'player_damaged_bull'
  | 'player_damaged_caster'
  | 'player_damaged_pong'
  | 'player_damaged_pattern'
  | 'player_damaged_hazard'
  | 'player_died'
  | 'player_idle'
  | 'player_low_hp'
  | 'player_ult_used'
  | 'enemy_killed'
  | 'enemy_killed_zombie'
  | 'room_entered'
  | 'room_cleared'
  | 'room_milestone'
  | 'boss_entered'
  | 'game_start'
  | 'game_over'
  | 'ambient'
  | 'multi_damage_streak'
  | 'bonus_selected'
  | 'dev_test'
  | 'crash_recovery';

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
  /** Typing speed in characters per second (default: 65) */
  typingSpeed?: number;
  /** Hold duration in seconds after typing completes (default: 3.5) */
  holdDuration?: number;
  /** Optional audio file path (relative to public assets root) */
  audioPath?: string;
  /** Total duration for audio playback in seconds - animations loop on final phase until this time */
  audioDuration?: number;

  // ─── Event-driven fields (used by DaemonVoicelineManager) ────────

  /** Event trigger category */
  trigger?: VoicelineTrigger;
  /** Sub-trigger context (e.g. enemy type, room number) */
  triggerContext?: string;
  /** Priority weight for random selection (higher = more likely, default: 1) */
  weight?: number;
  /** Required player class (null/undefined = any class) */
  requiredClass?: 'mage' | 'firewall' | 'rogue' | null;
  /** Voice synthesis preset override (default: 'daemon_normal') */
  voicePreset?: string;
  /** Allow mid-voiceline glitch frames? (default: true) */
  canGlitchFrames?: boolean;
  /** Allow crash+reboot scenario? (default: false) */
  canCrash?: boolean;
  /** Minimum room number to trigger (for pacing) */
  minRoom?: number;
  /** Maximum room number to trigger (for early game/intro specific lines) */
  maxRoom?: number;
  /** Tags for deduplication across similar triggers */
  tags?: string[];
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

  // Tutorial Voicelines
  'tutorial_intro': {
    id: 'tutorial_intro',
    message: 'Welcome to the training grounds. Try not to embarrass yourself.',
    animationSequence: [{ emotion: 'init', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_basic_attack': {
    id: 'tutorial_basic_attack',
    message: "Here's a dummy. Hit it with [{key:shoot}] until it breaks. It's not that hard.",
    animationSequence: [{ emotion: 'bored', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_mage_mechanic': {
    id: 'tutorial_mage_mechanic',
    message: "Slow it down with your stance [{key:posture}], then blow it up with [{key:shoot}].",
    animationSequence: [{ emotion: 'init', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_tank_mechanic': {
    id: 'tutorial_tank_mechanic',
    message: "Block its projectiles with [{key:posture}], then smash it with your shield bash [{key:shoot}].",
    animationSequence: [{ emotion: 'init', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_rogue_mechanic': {
    id: 'tutorial_rogue_mechanic',
    message: "Go invisible out of range with [{key:posture}], then ambush it with a dash [{key:shoot}].",
    animationSequence: [{ emotion: 'init', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_ultimate': {
    id: 'tutorial_ultimate',
    message: "Now, let's see some real power. Use your ultimate [{key:ultimate}] on these.",
    animationSequence: [{ emotion: 'enerve', cycles: 1, frameInterval: 0.14 }],
    typingSpeed: 16,
    holdDuration: 4.0,
  },
  'tutorial_shop': {
    id: 'tutorial_shop',
    message: "Adequate performance. Now, step into the light for a reward.",
    animationSequence: [{ emotion: 'happy', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_playground': {
    id: 'tutorial_playground',
    message: "The training is over. This is your playground now. Destroy everything.",
    animationSequence: [{ emotion: 'rire', cycles: 1, frameInterval: 0.14 }],
    typingSpeed: 18,
    holdDuration: 5.0,
  },
  'tutorial_completed': {
    id: 'tutorial_completed',
    message: "Tutorial completed. Try not to die immediately.",
    animationSequence: [{ emotion: 'happy', cycles: 1, frameInterval: 0.18 }],
    typingSpeed: 14,
    holdDuration: 4.0,
  },
  'tutorial_hazard': {
    id: 'tutorial_hazard',
    message: "Watch your step. The void doesn't have a safety net, and my patience has limits.",
    animationSequence: [{ emotion: 'rire', cycles: 1, frameInterval: 0.14 }],
    typingSpeed: 16,
    holdDuration: 4.0,
  },
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
