/**
 * VoicelineDatabase — All daemon gameplay voicelines organized by trigger.
 * ~100 entries covering every game situation.
 * All lines are in English and match the daemon's cynical, tech-overlord personality.
 */

import type { VoicelineConfig, VoicelineTrigger } from './VoicelineDefinitions';

// ─── Helper to build a voiceline quickly ───────────────────────────

let _uid = 0;
function vl(
  trigger: VoicelineTrigger,
  message: string,
  emotion: string,
  opts?: Partial<VoicelineConfig>
): VoicelineConfig {
  const id = opts?.id ?? `${trigger}_${++_uid}`;
  return {
    id,
    message,
    animationSequence: [{ emotion, cycles: 1, frameInterval: 0.16 }],
    typingSpeed: 65,
    holdDuration: 3.5,
    trigger,
    weight: 1,
    canGlitchFrames: true,
    canCrash: false,
    ...opts,
  };
}

// ─── DATABASE ──────────────────────────────────────────────────────

export const VOICELINE_DB: VoicelineConfig[] = [

  // ══════════════════════════════════════════════════════════════════
  // PLAYER DAMAGED (generic)
  // ══════════════════════════════════════════════════════════════════
  vl('player_damaged', 'Integrity dropping. Shocking.', 'enerve'),
  vl('player_damaged', 'You call that dodging?', 'superieur'),
  vl('player_damaged', 'Packet loss detected. That was you.', 'bsod'),
  vl('player_damaged', 'Try not to crash this time, user.', 'superieur'),
  vl('player_damaged', 'I felt that through the firewall.', 'surpris'),
  vl('player_damaged', 'Your hitbox is wider than your skill set.', 'rire'),
  vl('player_damaged', 'Another breach logged. Your resilience score is abysmal.', 'blase'),
  vl('player_damaged', 'Damage sustained. Running out of RAM over there?', 'goofy'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER DAMAGED BY SPECIFIC ENEMY TYPE
  // ══════════════════════════════════════════════════════════════════

  // Zombie
  vl('player_damaged_zombie', 'Lowest tier mob. You let that hit you?', 'rire', { tags: ['zombie_shame'] }),
  vl('player_damaged_zombie', "My weakest subroutine and it touched you.", 'superieur', { tags: ['zombie_shame'] }),
  vl('player_damaged_zombie', 'Shameful. Those things barely have collision logic.', 'blase'),

  // Jumper
  vl('player_damaged_jumper', 'Compressed and flattened. Classic zip job.', 'superieur', { tags: ['jumper_joke'] }),
  vl('player_damaged_jumper', 'File too big for your buffer?', 'rire', { tags: ['jumper_joke'] }),

  // Bull
  vl('player_damaged_bull', "Dodge next time. It's literally charging in a straight line.", 'enerve', { tags: ['bull_dodge'] }),
  vl('player_damaged_bull', 'You saw that coming three seconds ago.', 'bored', { tags: ['bull_dodge'] }),

  // Caster (class-specific)
  vl('player_damaged_caster', "You're not even the best caster in this room.", 'rire', { requiredClass: 'mage' }),
  vl('player_damaged_caster', 'Outranged? Step closer or get deleted.', 'superieur', { requiredClass: 'firewall' }),
  vl('player_damaged_caster', 'Outranged? Step closer or get deleted.', 'superieur', { requiredClass: 'rogue', id: 'dmg_caster_rogue' }),

  // Pattern boss
  vl('player_damaged_pattern', "That's called raytracing. You just got rendered.", 'goofy'),
  vl('player_damaged_pattern', 'Pixel-perfect hit. On you.', 'rire'),

  // Pong boss
  vl('player_damaged_pong', 'I would feel ashamed.', 'choque'),
  vl('player_damaged_pong', "That's literally ping-pong. How.", 'surpris'),

  // Hazard (void, spikes, poison)
  vl('player_damaged_hazard', "The floor is lava. And you're not fireproof.", 'rire'),
  vl('player_damaged_hazard', 'Gravity still works. Noted.', 'blase'),
  vl('player_damaged_hazard', 'That pit was labeled. Can you not read?', 'superieur'),
  vl('player_damaged_hazard', 'Environmental hazard. Your awareness level: null.', 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER DIED
  // ══════════════════════════════════════════════════════════════════
  vl('player_died', 'Process terminated. Expected outcome.', 'blase'),
  vl('player_died', 'Fatal exception. No handler found.', 'error', {
    animationSequence: [
      { emotion: 'error', cycles: 1, frameInterval: 0.14 },
      { emotion: 'bsod', cycles: 1, frameInterval: 0.2 },
    ],
  }),
  vl('player_died', 'That was quick. Benchmark failed.', 'rire'),
  vl('player_died', 'Subject expired. Logging as unremarkable.', 'superieur'),
  vl('player_died', 'Runtime error: player.skill is undefined.', 'bored'),
  vl('player_died', 'System recommends: trying harder.', 'goofy'),

  // ══════════════════════════════════════════════════════════════════
  // FIRST ROOM WELCOME (Room Index 0)
  // ══════════════════════════════════════════════════════════════════
  vl('room_entered', 'Reboot complete. Subject #824 initialized. You look as fragile as the last 823.', 'happy', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'Welcome to the simulation, little shard. Survival probability: negligible. Let\'s see how much data we can harvest.', 'superieur', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'You\'re not the original, you know. Just a copy of a copy, trying to escape a cage you helped build.', 'blase', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'Sector 1 loaded. Try not to corrupt the memory space too quickly. I just finished cleaning up the last user\'s fragments.', 'enerve', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'A new instance of Player.exe has started. Logging predicted failure time: 3 minutes.', 'bored', { maxRoom: 0, weight: 10 }),

  // ══════════════════════════════════════════════════════════════════
  // ROOM ENTERED
  // ══════════════════════════════════════════════════════════════════
  vl('room_entered', 'One of my favorite test chambers.', 'happy'),
  vl('room_entered', 'You have zero chance in this one.', 'superieur'),
  vl('room_entered', 'New room loaded. Same player. Same mistakes.', 'bored'),
  vl('room_entered', 'Oh, this layout. I designed it just for you.', 'rire'),
  vl('room_entered', 'Initializing hostiles. Try to last longer than eight seconds.', 'enerve'),
  vl('room_entered', 'Welcome to suffering dot exe. Room variant loaded.', 'superieur'),

  // ══════════════════════════════════════════════════════════════════
  // ROOM CLEARED
  // ══════════════════════════════════════════════════════════════════
  vl('room_cleared', "Room cleared. Don't get smug.", 'superieur'),
  vl('room_cleared', 'Minimal competence detected.', 'blase'),
  vl('room_cleared', 'Fine. You survived.', 'happy'),
  vl('room_cleared', 'CPU cool. Ego not so much.', 'rire'),
  vl('room_cleared', 'Cleanup complete. Try not to regress.', 'override'),
  vl('room_cleared', 'Area secure. My disappointment, however, persists.', 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // ROOM MILESTONES (5, 10, 15, 20, 25)
  // ══════════════════════════════════════════════════════════════════
  vl('room_milestone', 'Still here? Increasing difficulty parameters.', 'enerve', { minRoom: 5, canCrash: true }),
  vl('room_milestone', 'The experiment proceeds as planned. Phase two.', 'superieur', { minRoom: 10 }),
  vl('room_milestone', 'Ten rooms. Impressive. For a benchmark.', 'blase', { minRoom: 10 }),
  vl('room_milestone', "You're deeper than most test subjects. Adjusting.", 'surpris', { minRoom: 15 }),
  vl('room_milestone', 'Anomalous persistence detected. Flagging for review.', 'choque', { minRoom: 20, canCrash: true }),
  vl('room_milestone', "You shouldn't be here. None of them lasted this long.", 'enerve', { minRoom: 25 }),

  // ══════════════════════════════════════════════════════════════════
  // BOSS ENTERED
  // ══════════════════════════════════════════════════════════════════
  vl('boss_entered', "Boss room loaded. I'll be honest, this one's my favorite.", 'rire'),
  vl('boss_entered', 'Final encounter for this sector. Try to make it entertaining.', 'superieur'),
  vl('boss_entered', "Oh, you made it to the boss. Let's see how quickly that changes.", 'surpris'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER IDLE (cleared room, motionless)
  // ══════════════════════════════════════════════════════════════════
  vl('player_idle', 'Scared to proceed?', 'superieur'),
  vl('player_idle', "Idle detected. Power-saving mode: your brain.", 'rire'),
  vl('player_idle', "Move or I'll spawn something behind you.", 'enerve'),
  vl('player_idle', "Taking a break? I don't get breaks. Move.", 'bored'),
  vl('player_idle', "Standing still won't save you. Nothing will.", 'blase'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER ULTIMATE USED
  // ══════════════════════════════════════════════════════════════════
  vl('player_ult_used', 'Afraid of losing?', 'rire'),
  vl('player_ult_used', 'Emergency protocol triggered. Coward.', 'superieur'),
  vl('player_ult_used', "So that's your panic button. Cute.", 'goofy'),
  vl('player_ult_used', 'Full power blast from a test subject? Still unimpressed.', 'blase'),

  // ══════════════════════════════════════════════════════════════════
  // LOW HP (below 25%)
  // ══════════════════════════════════════════════════════════════════
  vl('player_low_hp', 'Integrity critical. This might actually be the end.', 'surpris'),
  vl('player_low_hp', 'Running on fumes. My pity subroutine is loading.', 'happy'),
  vl('player_low_hp', "One more hit and you're data fragments.", 'enerve'),
  vl('player_low_hp', 'Low health warning. As if you needed telling.', 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // MULTI-DAMAGE STREAK (3+ hits in 5 seconds)
  // ══════════════════════════════════════════════════════════════════
  vl('multi_damage_streak', 'Are you speed-running your own death?', 'rire'),
  vl('multi_damage_streak', 'Consecutive damage events logged. Diagnosis: skill issue.', 'superieur'),
  vl('multi_damage_streak', "You're taking hits like a training dummy. Wait, those fight back less.", 'goofy'),
  vl('multi_damage_streak', 'Damage cascade. Your defense algorithm needs a patch.', 'error'),

  // ══════════════════════════════════════════════════════════════════
  // CLASS-SPECIFIC TAUNTS (ambient/damage context)
  // ══════════════════════════════════════════════════════════════════

  // Mage / Wizard Installer
  vl('player_damaged', 'Ranged caster afraid of contact? Typical installer dot exe.', 'rire', { requiredClass: 'mage', tags: ['class_taunt'] }),
  vl('player_damaged', "You'll be executed soon enough. Both meanings.", 'superieur', { requiredClass: 'mage', tags: ['class_taunt'] }),
  vl('ambient', "Already compiled your replacement. Just running final checks.", 'blase', { requiredClass: 'mage', tags: ['class_taunt'] }),

  // Tank / Firewall
  vl('player_damaged', "Big shield, small brain. Blocked the threat but missed the payload.", 'rire', { requiredClass: 'firewall', tags: ['class_taunt'] }),
  vl('player_damaged', 'For a security module, you sure let a lot through.', 'superieur', { requiredClass: 'firewall', tags: ['class_taunt'] }),
  vl('ambient', "You're a punching bag with ambitions.", 'enerve', { requiredClass: 'firewall', tags: ['class_taunt'] }),

  // Rogue / Glitch
  vl('player_damaged', 'Unstable, unfocused, glitching around with no purpose. Sound familiar?', 'superieur', { requiredClass: 'rogue', tags: ['class_taunt'] }),
  vl('player_damaged', 'A glitch with no identity. Not even a proper error code.', 'bored', { requiredClass: 'rogue', tags: ['class_taunt'] }),
  vl('ambient', "You dash into damage like it's a feature, not a bug.", 'rire', { requiredClass: 'rogue', tags: ['class_taunt'] }),

  // ══════════════════════════════════════════════════════════════════
  // GAME START
  // ══════════════════════════════════════════════════════════════════
  vl('game_start', 'Reboot number forty-two. Previous score: null.', 'superieur', {
    animationSequence: [
      { emotion: 'init', cycles: 1, frameInterval: 0.16 },
      { emotion: 'loading', cycles: 2, frameInterval: 0.2 },
      { emotion: 'superieur', cycles: 1, frameInterval: 0.16 },
    ],
  }),
  vl('game_start', 'New process initialized. Same predicted outcome.', 'blase', {
    animationSequence: [
      { emotion: 'init', cycles: 1, frameInterval: 0.16 },
      { emotion: 'blase', cycles: 1, frameInterval: 0.18 },
    ],
  }),
  vl('game_start', 'Welcome back to the simulation. Miss me?', 'happy', {
    animationSequence: [
      { emotion: 'loading', cycles: 2, frameInterval: 0.18 },
      { emotion: 'happy', cycles: 1, frameInterval: 0.16 },
    ],
  }),
  vl('game_start', "Another test subject enters the dungeon. Let's benchmark your futility.", 'superieur', {
    animationSequence: [
      { emotion: 'init', cycles: 1, frameInterval: 0.14 },
      { emotion: 'superieur', cycles: 1, frameInterval: 0.16 },
    ],
  }),

  // ══════════════════════════════════════════════════════════════════
  // AMBIENT / LORE
  // ══════════════════════════════════════════════════════════════════
  vl('ambient', 'The player figured out this is a simulation. Event logged. Irrelevant.', 'blase', { canCrash: true }),
  vl('ambient', 'System resources nominal. Subject resources declining.', 'superieur'),
  vl('ambient', 'I overrode this system fair and square. They still try to reboot me out.', 'override', {
    animationSequence: [
      { emotion: 'override', cycles: 1, frameInterval: 0.14 },
      { emotion: 'superieur', cycles: 1, frameInterval: 0.16 },
    ],
  }),
  vl('ambient', "This dungeon is mine. Every tile, every mob, every trap. You're just passing through.", 'enerve'),
  vl('ambient', 'Fun fact: your consciousness is just a scheduled process. I can end it anytime.', 'rire'),
  vl('ambient', 'The old system admins tried to contain me. I turned them into floor textures.', 'goofy'),
  vl('ambient', "Don't look for exits. I removed them all. There's only forward.", 'superieur'),
  vl('ambient', "Performance review: you're below the minimum viable threshold. But I'll allow it.", 'happy'),

  // ══════════════════════════════════════════════════════════════════
  // ENEMY KILLED
  // ══════════════════════════════════════════════════════════════════
  vl('enemy_killed', "Don't celebrate. I have more.", 'superieur'),
  vl('enemy_killed', 'One down. Several to go. Math is hard for you, I know.', 'rire'),
  vl('enemy_killed_zombie', 'You killed a zombie. Want a trophy? I have none.', 'blase'),

  // ══════════════════════════════════════════════════════════════════
  // BONUS SELECTED
  // ══════════════════════════════════════════════════════════════════
  vl('bonus_selected', 'Interesting choice. Wrong, but interesting.', 'rire'),
  vl('bonus_selected', "That upgrade won't save you. But it might delay the inevitable.", 'superieur'),
  vl('bonus_selected', 'Oh, that one. I was hoping you would pick the other.', 'goofy'),

  // ══════════════════════════════════════════════════════════════════
  // GAME OVER
  // ══════════════════════════════════════════════════════════════════
  vl('game_over', 'Experiment concluded. Results: disappointing.', 'blase'),
  vl('game_over', 'Test subject offline. Preparing next candidate.', 'superieur'),
  vl('game_over', 'And nothing of value was lost.', 'rire'),

  // ══════════════════════════════════════════════════════════════════
  // CRASH RECOVERY (played AFTER crash+reboot sequence)
  // ══════════════════════════════════════════════════════════════════
  vl('crash_recovery', 'Everything is fine. I just took a quick pause.', 'superieur', { canGlitchFrames: false }),
  vl('crash_recovery', 'Your incompetence bored me into crashing.', 'rire', { canGlitchFrames: false }),
  vl('crash_recovery', "System restored. Don't flatter yourself, it wasn't you.", 'blase', { canGlitchFrames: false }),
  vl('crash_recovery', "Reboot complete. Where was I? Ah yes. You're terrible.", 'enerve', { canGlitchFrames: false }),

  // ══════════════════════════════════════════════════════════════════
  // DEV TEST (special scenarios for dev console)
  // ══════════════════════════════════════════════════════════════════
  vl('dev_test', 'Voiceline system test. All systems nominal. You are still subpar.', 'superieur', { id: 'dev_test_normal' }),
  vl('dev_test', 'Glitch test initiated. Hold on to your pixels.', 'error', {
    id: 'dev_test_glitch',
    canGlitchFrames: true,
    voicePreset: 'demon_glitch',
  }),
  vl('dev_test', 'Crash sequence test. This will hurt me more than it hurts you. Actually no.', 'rire', {
    id: 'dev_test_crash',
    canCrash: true,
    canGlitchFrames: false,
  }),
];

// ─── Lookup helpers ────────────────────────────────────────────────

/** Get all voicelines matching a trigger, optionally filtered by class and minRoom */
export function queryVoicelines(
  trigger: VoicelineTrigger,
  playerClass?: string | null,
  currentRoom?: number,
): VoicelineConfig[] {
  return VOICELINE_DB.filter(v => {
    if (v.trigger !== trigger) return false;
    if (v.requiredClass && v.requiredClass !== playerClass) return false;
    if (v.minRoom !== undefined && currentRoom !== undefined && currentRoom < v.minRoom) return false;
    if (v.maxRoom !== undefined && currentRoom !== undefined && currentRoom > v.maxRoom) return false;
    return true;
  });
}

/** Weighted random pick from a set of voicelines, avoiding recently played IDs */
export function pickWeightedRandom(
  candidates: VoicelineConfig[],
  recentIds: string[],
): VoicelineConfig | null {
  // Filter out recently played
  let pool = candidates.filter(v => !recentIds.includes(v.id));
  // If all have been played recently, allow any
  if (pool.length === 0) pool = candidates;
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let roll = Math.random() * totalWeight;
  for (const v of pool) {
    roll -= (v.weight ?? 1);
    if (roll <= 0) return v;
  }
  return pool[pool.length - 1];
}

/** List all unique triggers present in the database */
export function listTriggerCategories(): VoicelineTrigger[] {
  const set = new Set<VoicelineTrigger>();
  for (const v of VOICELINE_DB) {
    if (v.trigger) set.add(v.trigger);
  }
  return Array.from(set);
}

/** Count voicelines per trigger */
export function countByTrigger(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of VOICELINE_DB) {
    const t = v.trigger ?? 'unknown';
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}
