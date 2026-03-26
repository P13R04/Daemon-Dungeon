export type BonusCategory =
  | 'class-dependent'
  | 'rarity-common'
  | 'meta-bonus'
  | 'stackable'
  | 'offensive'
  | 'defensive';

export interface BonusCodexEntry {
  id: string;
  name: string;
  description: string;
  effect: string;
  characteristics: string;
  categories: BonusCategory[];
  iconText: string;
}

export const BONUS_CODEX_ENTRIES: BonusCodexEntry[] = [
  {
    id: 'bonus_hp',
    name: 'Integrity Overclock',
    description: 'Reinforces your process shell and expands maximum integrity.',
    effect: '+10% max HP instantly and future heals scale with the new cap.',
    characteristics: 'Defensive, persistent for the whole run.',
    categories: ['defensive', 'meta-bonus', 'rarity-common'],
    iconText: 'HP+',
  },
  {
    id: 'bonus_ms',
    name: 'Vector Drift',
    description: 'Optimizes movement vectors for faster repositioning.',
    effect: '+10% movement speed.',
    characteristics: 'Mobility bonus, persistent for the whole run.',
    categories: ['meta-bonus', 'rarity-common'],
    iconText: 'SPD',
  },
  {
    id: 'bonus_poison',
    name: 'Toxic Injection',
    description: 'Your attacks inject corrosive traces in enemy kernels.',
    effect: 'Adds poison DoT equal to 20% of hit damage over 2 seconds.',
    characteristics: 'Offensive status effect, scales with your damage.',
    categories: ['offensive', 'stackable', 'rarity-common'],
    iconText: 'DOT',
  },
  {
    id: 'damage_boost',
    name: 'Damage Overflow',
    description: 'Temporarily raises attack throughput.',
    effect: '+10% outgoing damage.',
    characteristics: 'General offensive stat modifier.',
    categories: ['offensive', 'stackable', 'rarity-common'],
    iconText: 'DMG',
  },
  {
    id: 'fire_rate',
    name: 'Clock Speed Up',
    description: 'Accelerates action execution rate.',
    effect: '+15% fire rate.',
    characteristics: 'Sustained DPS increase, stacks with class passives.',
    categories: ['offensive', 'stackable', 'class-dependent'],
    iconText: 'ROF',
  },
  {
    id: 'piercing_shot',
    name: 'Pierce Protocol',
    description: 'Rewrites projectile behavior to bypass one target.',
    effect: 'Projectiles pierce 1 enemy before despawning.',
    characteristics: 'High value on lineups, synergizes with ranged classes.',
    categories: ['offensive', 'class-dependent', 'rarity-common'],
    iconText: 'PRC',
  },
  {
    id: 'burn',
    name: 'Memory Burn',
    description: 'Injects thermal corruption on hit.',
    effect: 'Applies burn DoT: 5 damage per tick for 3 seconds.',
    characteristics: 'Damage over time profile, non-stackable core effect.',
    categories: ['offensive', 'rarity-common'],
    iconText: 'BRN',
  },
];
