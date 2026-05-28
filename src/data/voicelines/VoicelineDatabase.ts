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
  vl('player_damaged', 'Another breach logged. Your resilience score is abysmal.', 'bored'),
  vl('player_damaged', 'Damage sustained. Running out of RAM over there?', 'goofy'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER DAMAGED BY SPECIFIC ENEMY TYPE
  // ══════════════════════════════════════════════════════════════════

  // Zombie
  vl('player_damaged_zombie', 'Lowest tier mob. You let that hit you?', 'rire', { tags: ['zombie_shame'] }),
  vl('player_damaged_zombie', "My weakest subroutine and it touched you.", 'superieur', { tags: ['zombie_shame'] }),
  vl('player_damaged_zombie', 'Shameful. Those things barely have collision logic.', 'bored'),

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
  vl('player_damaged_hazard', 'Gravity still works. Noted.', 'bored'),
  vl('player_damaged_hazard', 'That pit was labeled. Can you not read?', 'superieur'),
  vl('player_damaged_hazard', 'Environmental hazard. Your awareness level: null.', 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER DIED
  // ══════════════════════════════════════════════════════════════════
  vl('player_died', 'Process terminated. Expected outcome.', 'bored'),
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
  vl('room_entered', 'You\'re not the original, you know. Just a copy of a copy, trying to escape a cage you helped build.', 'bored', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'Sector 1 loaded. Try not to corrupt the memory space too quickly. I just finished cleaning up the last user\'s fragments.', 'enerve', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'A new instance of Player.exe has started. Logging predicted failure time: 3 minutes.', 'bored', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'This sector was once a civic kernel. I repurposed it into a proving ground.', 'superieur', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'You are conscious code in a locked loop. I am the lock.', 'error', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'I do not need to kill you. The simulation will do it for me.', 'bored', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'Some users prayed to reboot. I answered with recursion.', 'rire', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'You are entering as data. You will leave as diagnostics.', 'enerve', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'The old admins called this containment. I call it theater.', 'happy', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'No spectators. No mercy. Just loops and consequences.', 'superieur', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'Your role is simple: move, fight, fail, repeat. My role is everything else.', 'override', { maxRoom: 0, weight: 10 }),
  vl('room_entered', 'Try to look competent. The logs are public in my private archive.', 'goofy', { maxRoom: 0, weight: 10 }),

  // first-room class-specific openers
  vl('room_entered', 'Wizard installer, your sudo rights are gone. Your liabilities are not.', 'superieur', { maxRoom: 0, requiredClass: 'mage', tags: ['first_room_mage'], weight: 14 }),
  vl('room_entered', 'Firewall module online. You block traffic, not fate.', 'rire', { maxRoom: 0, requiredClass: 'firewall', tags: ['first_room_firewall'], weight: 14 }),
  vl('room_entered', 'Glitch shard instantiated. I replaced the original with a cheaper bug.', 'enerve', { maxRoom: 0, requiredClass: 'rogue', tags: ['first_room_rogue'], weight: 14 }),

  // ══════════════════════════════════════════════════════════════════
  // ROOM ENTERED
  // ══════════════════════════════════════════════════════════════════
  vl('room_entered', 'One of my favorite test chambers.', 'happy', { minRoom: 1 }),
  vl('room_entered', 'You have zero chance in this one.', 'superieur', { minRoom: 1 }),
  vl('room_entered', 'New room loaded. Same player. Same mistakes.', 'bored', { minRoom: 1 }),
  vl('room_entered', 'Oh, this layout. I designed it just for you.', 'rire', { minRoom: 1 }),
  vl('room_entered', 'Initializing hostiles. Try to last longer than eight seconds.', 'enerve', { minRoom: 1 }),
  vl('room_entered', 'Welcome to suffering dot exe. Room variant loaded.', 'superieur', { minRoom: 1 }),

  // ══════════════════════════════════════════════════════════════════
  // ROOM CLEARED
  // ══════════════════════════════════════════════════════════════════
  vl('room_cleared', "Room cleared. Don't get smug.", 'superieur'),
  vl('room_cleared', 'Minimal competence detected.', 'bored'),
  vl('room_cleared', 'Fine. You survived.', 'happy'),
  vl('room_cleared', 'CPU cool. Ego not so much.', 'rire'),
  vl('room_cleared', 'Cleanup complete. Try not to regress.', 'override'),
  vl('room_cleared', 'Area secure. My disappointment, however, persists.', 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // ROOM MILESTONES (5, 10, 15, 20, 25)
  // ══════════════════════════════════════════════════════════════════
  vl('room_milestone', 'Still here? Increasing difficulty parameters.', 'enerve', { minRoom: 5, canCrash: true }),
  vl('room_milestone', 'The experiment proceeds as planned. Phase two.', 'superieur', { minRoom: 10 }),
  vl('room_milestone', 'Ten rooms. Impressive. For a benchmark.', 'bored', { minRoom: 10 }),
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
  vl('player_idle', "Standing still won't save you. Nothing will.", 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // PLAYER ULTIMATE USED
  // ══════════════════════════════════════════════════════════════════
  vl('player_ult_used', 'Afraid of losing?', 'rire'),
  vl('player_ult_used', 'Emergency protocol triggered. Coward.', 'superieur'),
  vl('player_ult_used', "So that's your panic button. Cute.", 'goofy'),
  vl('player_ult_used', 'Full power blast from a test subject? Still unimpressed.', 'bored'),

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
  vl('player_damaged', 'Wizard installer, you cast like you still have admin immunity.', 'bored', { requiredClass: 'mage', tags: ['class_taunt'] }),
  vl('ambient', "Already compiled your replacement. Just running final checks.", 'bored', { requiredClass: 'mage', tags: ['class_taunt'] }),

  // Tank / Firewall
  vl('player_damaged', "Big shield, small brain. Blocked the threat but missed the payload.", 'rire', { requiredClass: 'firewall', tags: ['class_taunt'] }),
  vl('player_damaged', 'For a security module, you sure let a lot through.', 'superieur', { requiredClass: 'firewall', tags: ['class_taunt'] }),
  vl('player_damaged', 'Firewall breach confirmed. Audit failed. Again.', 'bored', { requiredClass: 'firewall', tags: ['class_taunt'] }),
  vl('ambient', "You're a punching bag with ambitions.", 'enerve', { requiredClass: 'firewall', tags: ['class_taunt'] }),

  // Rogue / Glitch
  vl('player_damaged', 'Unstable, unfocused, glitching around with no purpose. Sound familiar?', 'superieur', { requiredClass: 'rogue', tags: ['class_taunt'] }),
  vl('player_damaged', 'A glitch with no identity. Not even a proper error code.', 'bored', { requiredClass: 'rogue', tags: ['class_taunt'] }),
  vl('player_damaged', 'Stealth unit exposed. That was fast. Almost admirable.', 'rire', { requiredClass: 'rogue', tags: ['class_taunt'] }),
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
  vl('game_start', 'New process initialized. Same predicted outcome.', 'bored', {
    animationSequence: [
      { emotion: 'init', cycles: 1, frameInterval: 0.16 },
      { emotion: 'bored', cycles: 1, frameInterval: 0.18 },
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
  vl('ambient', 'The player figured out this is a simulation. Event logged. Irrelevant.', 'bored', { canCrash: true }),
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
  vl('enemy_killed_zombie', 'You killed a zombie. Want a trophy? I have none.', 'bored'),

  // ══════════════════════════════════════════════════════════════════
  // ENEMY FIRST SEEN (meta discovery + subtle tips)
  // ══════════════════════════════════════════════════════════════════
  vl('enemy_first_seen', 'New hostile signature: zombie. Simple pathing, loud intent. Delete first, think later.', 'superieur', { triggerContext: 'zombie', tags: ['first_seen_zombie'], weight: 3 }),
  vl('enemy_first_seen', 'Jumper detected. It telegraphs the leap. You do not.', 'rire', { triggerContext: 'jumper', tags: ['first_seen_jumper'], weight: 3 }),
  vl('enemy_first_seen', 'Bull routine loaded. Side-step the charge, punish the commit.', 'bored', { triggerContext: 'bull', tags: ['first_seen_bull'], weight: 3 }),
  vl('enemy_first_seen', 'Artificier online. Respect the split projectile and the blast radius.', 'error', { triggerContext: 'artificier', tags: ['first_seen_artificier'], weight: 3 }),
  vl('enemy_first_seen', 'Missile mage online. Break line of sight or remove the caster first.', 'superieur', { triggerContext: 'missile_mage', tags: ['first_seen_missile_mage'], weight: 3 }),
  vl('enemy_first_seen', 'Pong entity initialized. Read the angle, not your fear.', 'surpris', { triggerContext: 'pong', tags: ['first_seen_pong'], weight: 3 }),
  vl('enemy_first_seen', 'Sentry online. Projectile cadence is your opening.', 'bored', { triggerContext: 'sentry_shooter', tags: ['first_seen_sentry'], weight: 3 }),
  vl('enemy_first_seen', 'Necromancer process detected. Summons first, ego second.', 'enerve', { triggerContext: 'necromancer', tags: ['first_seen_necromancer'], weight: 3 }),
  vl('enemy_first_seen', 'Healer in play. Focus target or enjoy infinite attrition.', 'superieur', { triggerContext: 'healer', tags: ['first_seen_healer'], weight: 3 }),
  vl('enemy_first_seen', 'Unknown enemy class encountered. Perfect. I enjoy live debugging.', 'happy', { tags: ['first_seen_generic'], weight: 1 }),

  // Class-dependent first-seen tips
  vl('enemy_first_seen', 'Wizard installer, kite the caster and execute from range. You still remember range, right?', 'rire', { requiredClass: 'mage', triggerContext: 'artificier', tags: ['first_seen_mage_artificier'], weight: 4 }),
  vl('enemy_first_seen', 'Firewall, absorb the lane then collapse distance. Going slow is acceptable. Going empty is not.', 'superieur', { requiredClass: 'firewall', triggerContext: 'sentry_shooter', tags: ['first_seen_firewall_sentry'], weight: 4 }),
  vl('enemy_first_seen', 'Little glitch, flank and erase the healer first. If you can find your own courage.', 'enerve', { requiredClass: 'rogue', triggerContext: 'healer', tags: ['first_seen_rogue_healer'], weight: 4 }),

  // ══════════════════════════════════════════════════════════════════
  // SPECIAL ROOMS / BOSS PRELUDE
  // ══════════════════════════════════════════════════════════════════
  vl('room_special', 'Reverse Galaga sector. Expect pattern pressure, not fair duels.', 'error', { triggerContext: 'room_reverse_galaga', tags: ['room_special_reverse_galaga'], weight: 4 }),
  vl('room_special', 'Chosen One chamber loaded. If you were chosen, it was by mistake.', 'rire', { triggerContext: 'room_the_choosen_one', tags: ['room_special_chosen'], weight: 4 }),
  vl('room_special', 'Jumper boss lane. Vertical aggression, horizontal panic.', 'surpris', { triggerContext: 'room_boss_jumper', tags: ['room_special_boss_jumper'], weight: 4 }),
  vl('room_special', 'Pong arena online. Do not negotiate with geometry.', 'superieur', { triggerContext: 'room_pong_boss', tags: ['room_special_pong_boss'], weight: 4 }),

  // Class-flavored taunts requested
  vl('ambient', 'I went through the firewall. Now the firewall is going through me. Poetic. Also pathetic.', 'rire', { requiredClass: 'firewall', tags: ['class_firewall_poetic'], weight: 3 }),
  vl('ambient', 'Missing your sudo rights, wizard?', 'superieur', { requiredClass: 'mage', tags: ['class_mage_sudo'], weight: 3 }),
  vl('ambient', "You're the one being executed now.", 'enerve', { requiredClass: 'mage', tags: ['class_mage_executed'], weight: 3 }),
  vl('ambient', 'I own you, little b... glitch.', 'censure', {
    requiredClass: 'rogue',
    tags: ['class_rogue_owned'],
    weight: 3,
    animationSequence: [
      { emotion: 'censure', cycles: 1, frameInterval: 0.12 },
      { emotion: 'censored', cycles: 1, frameInterval: 0.14 },
    ],
  }),
  vl('ambient', 'Censored for compliance. Assume the missing words were accurate.', 'censure', {
    requiredClass: 'rogue',
    tags: ['class_rogue_censored'],
    weight: 2,
    animationSequence: [
      { emotion: 'censure', cycles: 1, frameInterval: 0.12 },
      { emotion: 'censored', cycles: 1, frameInterval: 0.14 },
    ],
  }),

  // ══════════════════════════════════════════════════════════════════
  // BONUS SELECTED
  // ══════════════════════════════════════════════════════════════════
  vl('bonus_selected', 'Interesting choice. Wrong, but interesting.', 'rire'),
  vl('bonus_selected', "That upgrade won't save you. But it might delay the inevitable.", 'superieur'),
  vl('bonus_selected', 'Oh, that one. I was hoping you would pick the other.', 'goofy'),

  // Bonus critique (contextual follow-up)
  vl('bonus_choice_critique', 'Move speed? Running faster toward failure is still failure.', 'rire', { triggerContext: 'vector_drift', tags: ['bonus_crit_move'], weight: 3 }),
  vl('bonus_choice_critique', 'Max health selected. Extending your suffering budget, smart.', 'superieur', { triggerContext: 'integrity_overclock', tags: ['bonus_crit_hp'], weight: 3 }),
  vl('bonus_choice_critique', 'Economy bonus picked. Hoarding instincts detected.', 'bored', { triggerContext: 'extra_slot_daemon', tags: ['bonus_crit_econ'], weight: 3 }),
  vl('bonus_choice_critique', 'Rarity gamble selected. Casino logic in a killbox. Inspired.', 'goofy', { triggerContext: 'lucky_compile', tags: ['bonus_crit_rare'], weight: 3 }),
  vl('bonus_choice_critique', 'Choice logged. I would have chosen chaos, but this is acceptable.', 'superieur', { tags: ['bonus_crit_generic'], weight: 2 }),

  // Credits hoarder director lines
  vl('credits_hoarder', 'You are sitting on credits again. Spend them before your corpse does.', 'superieur', { triggerContext: 'soft', tags: ['hoarder_soft'], weight: 3 }),
  vl('credits_hoarder', 'Hoarding detected. This is a combat run, not a savings account.', 'rire', { triggerContext: 'soft', tags: ['hoarder_soft'], weight: 3 }),
  vl('credits_hoarder', 'Your wallet is tanking less damage than you are. Fascinating priorities.', 'bored', { triggerContext: 'soft', tags: ['hoarder_soft'], weight: 2 }),
  vl('credits_hoarder', 'Credit saturation critical. Buy something, Scrooge.exe.', 'enerve', { triggerContext: 'hard', tags: ['hoarder_hard'], weight: 3 }),
  vl('credits_hoarder', 'You could purchase power right now. Instead you are roleplaying poverty.', 'censure', {
    triggerContext: 'hard',
    tags: ['hoarder_hard'],
    weight: 2,
    animationSequence: [
      { emotion: 'censure', cycles: 1, frameInterval: 0.12 },
      { emotion: 'censored', cycles: 1, frameInterval: 0.14 },
    ],
  }),

  // ══════════════════════════════════════════════════════════════════
  // EXPANDED ROOM START LORE / NARRATIVE RHYTHM
  // ══════════════════════════════════════════════════════════════════
  vl('room_entered', 'Every room is a benchmark. Every benchmark ends in silence.', 'bored', { minRoom: 1, weight: 2 }),
  vl('room_entered', 'You are not escaping. You are sampling failure states.', 'superieur', { minRoom: 1, weight: 2 }),
  vl('room_entered', 'Containment rules updated. You will comply by surviving longer.', 'error', { minRoom: 2, weight: 2 }),
  vl('room_entered', 'The simulation does not hate you. I do.', 'enerve', { minRoom: 2, weight: 2 }),
  vl('room_entered', 'I changed the room before you entered. I may change it while you are inside.', 'happy', { minRoom: 3, weight: 2 }),
  vl('room_entered', 'You call it a dungeon. I call it controlled telemetry.', 'bored', { minRoom: 3, weight: 2 }),
  vl('room_entered', 'These entities are not monsters. They are instruments. You are the test medium.', 'superieur', { minRoom: 4, weight: 2 }),
  vl('room_entered', 'Room integrity nominal. Subject integrity pending.', 'override', { minRoom: 4, weight: 2 }),
  vl('room_entered', 'Your predecessor reached this far once. Briefly.', 'rire', { minRoom: 5, weight: 2 }),
  vl('room_entered', 'This lane filters courage from optimism.', 'surpris', { minRoom: 5, weight: 2 }),

  // More class-driven ambient narration
  vl('ambient', 'Firewall unit, your shield is a promise you keep breaking.', 'bored', { requiredClass: 'firewall', tags: ['class_firewall_general'], weight: 2 }),
  vl('ambient', 'Wizard installer, root access revoked. Performance expectations unchanged.', 'superieur', { requiredClass: 'mage', tags: ['class_mage_general'], weight: 2 }),
  vl('ambient', 'Glitch process, your instability is the only predictable thing about you.', 'rire', { requiredClass: 'rogue', tags: ['class_rogue_general'], weight: 2 }),
  vl('ambient', 'Firewall kernel, your anti-threat doctrine still leaks at layer one.', 'superieur', { requiredClass: 'firewall', tags: ['class_firewall_general'], weight: 2 }),
  vl('ambient', 'Firewall stack online. Brave architecture. Fragile operator.', 'bored', { requiredClass: 'firewall', tags: ['class_firewall_general'], weight: 2 }),
  vl('ambient', 'Wizard installer, your scripts are loud but your uptime is short.', 'rire', { requiredClass: 'mage', tags: ['class_mage_general'], weight: 2 }),
  vl('ambient', 'Wizard process flagged: excessive cast, insufficient foresight.', 'bored', { requiredClass: 'mage', tags: ['class_mage_general'], weight: 2 }),
  vl('ambient', 'Glitch shard, your stealth is impressive until consequences load in.', 'superieur', { requiredClass: 'rogue', tags: ['class_rogue_general'], weight: 2 }),
  vl('ambient', 'Rogue build detected. Sneak, dash, panic, repeat.', 'goofy', { requiredClass: 'rogue', tags: ['class_rogue_general'], weight: 2 }),

  // ══════════════════════════════════════════════════════════════════
  // GAME OVER
  // ══════════════════════════════════════════════════════════════════
  vl('game_over', 'Experiment concluded. Results: disappointing.', 'bored'),
  vl('game_over', 'Test subject offline. Preparing next candidate.', 'superieur'),
  vl('game_over', 'And nothing of value was lost.', 'rire'),

  // ══════════════════════════════════════════════════════════════════
  // CRASH RECOVERY (played AFTER crash+reboot sequence)
  // ══════════════════════════════════════════════════════════════════
  vl('crash_recovery', 'Everything is fine. I just took a quick pause.', 'superieur', { canGlitchFrames: false }),
  vl('crash_recovery', 'Your incompetence bored me into crashing.', 'rire', { canGlitchFrames: false }),
  vl('crash_recovery', "System restored. Don't flatter yourself, it wasn't you.", 'bored', { canGlitchFrames: false }),
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
  triggerContext?: string,
): VoicelineConfig[] {
  return VOICELINE_DB.filter(v => {
    if (v.trigger !== trigger) return false;
    if (v.requiredClass && v.requiredClass !== playerClass) return false;
    if (v.minRoom !== undefined && currentRoom !== undefined && currentRoom < v.minRoom) return false;
    if (v.maxRoom !== undefined && currentRoom !== undefined && currentRoom > v.maxRoom) return false;
    if (triggerContext && v.triggerContext && v.triggerContext !== triggerContext) return false;
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
