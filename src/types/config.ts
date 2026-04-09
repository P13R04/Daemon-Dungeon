export type PlayerClassId = 'mage' | 'firewall' | 'rogue';

export interface PlayerClassBaseStats {
  hp: number;
  speed: number;
  damage: number;
  fireRate: number;
}

export interface PlayerLegacyHealthConfig {
  max: number;
  [key: string]: unknown;
}

export interface PlayerLegacyAttackConfig {
  damage: number;
  fireRate: number;
  [key: string]: unknown;
}

export interface PlayerMagePassiveConfig {
  fireRateBonus?: number;
  maxBonus?: number;
  [key: string]: unknown;
}

export interface PlayerMageSecondaryConfig {
  resourceMax?: number;
  activationThreshold?: number;
  drainPerSecond?: number;
  regenPerSecond?: number;
  burstCost?: number;
  zoneRadius?: number;
  slowMultiplier?: number;
  burstBaseDamage?: number;
  burstDamagePerEnemy?: number;
  burstDamagePerProjectile?: number;
  burstKnockback?: number;
  [key: string]: unknown;
}

export interface PlayerMageUltimateConfig {
  cooldown?: number;
  chargeTime?: number;
  radius?: number;
  damage?: number;
  dotDuration?: number;
  dotTickRate?: number;
  healPerTick?: number;
  areaSize?: number;
  [key: string]: unknown;
}

export interface PlayerFirewallAttackConfig {
  range?: number;
  coneAngleDeg?: number;
  damage?: number;
  knockback?: number;
  [key: string]: unknown;
}

export interface PlayerFirewallShieldConfig {
  frontalAngleDeg?: number;
  projectileReflectMultiplier?: number;
  meleeBlockRatio?: number;
  resourceMax?: number;
  activationThreshold?: number;
  drainPerSecond?: number;
  regenPerSecond?: number;
  [key: string]: unknown;
}

export interface PlayerFirewallShieldBashConfig {
  damage?: number;
  dashSpeed?: number;
  dashDuration?: number;
  hitRadius?: number;
  knockback?: number;
  stunDuration?: number;
  groupDistance?: number;
  groupWidth?: number;
  pullStrength?: number;
  forwardPush?: number;
  cooldown?: number;
  cost?: number;
  [key: string]: unknown;
}

export interface PlayerFirewallPassiveConfig {
  riposteMeleeRatio?: number;
  [key: string]: unknown;
}

export interface PlayerFirewallUltimateConfig {
  cooldown?: number;
  chargeTime?: number;
  radius?: number;
  damage?: number;
  stunDuration?: number;
  knockbackStrength?: number;
  tickInterval?: number;
  duration?: number;
  pullStrength?: number;
  [key: string]: unknown;
}

export interface PlayerRogueAttackConfig {
  range?: number;
  coneAngleDeg?: number;
  damage?: number;
  knockback?: number;
  [key: string]: unknown;
}

export interface PlayerRogueStealthConfig {
  resourceMax?: number;
  activationThreshold?: number;
  drainPerSecond?: number;
  regenPerSecond?: number;
  zoneRadius?: number;
  [key: string]: unknown;
}

export interface PlayerRogueDashAttackConfig {
  cost?: number;
  dashSpeed?: number;
  dashDuration?: number;
  hitRadius?: number;
  damage?: number;
  knockback?: number;
  cooldown?: number;
  openingStrikeMultiplier?: number;
  openingStrikeWindow?: number;
  [key: string]: unknown;
}

export interface PlayerRoguePassiveConfig {
  critChance?: number;
  critMultiplier?: number;
  [key: string]: unknown;
}

export interface PlayerRogueUltimateConfig {
  cooldown?: number;
  chargeTime?: number;
  zoneRadius?: number;
  duration?: number;
  hitDamage?: number;
  teleportInterval?: number;
  teleportOffset?: number;
  [key: string]: unknown;
}

export interface PlayerClassConfig {
  name: string;
  description?: string;
  baseStats: PlayerClassBaseStats;
  attack?: Record<string, unknown>;
  passive?: Record<string, unknown>;
  ultimate?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MagePlayerClassConfig extends PlayerClassConfig {
  attack?: Record<string, unknown>;
  passive?: PlayerMagePassiveConfig;
  ultimate?: PlayerMageUltimateConfig;
  secondary?: PlayerMageSecondaryConfig;
}

export interface FirewallPlayerClassConfig extends PlayerClassConfig {
  attack?: PlayerFirewallAttackConfig;
  shield?: PlayerFirewallShieldConfig;
  shieldBash?: PlayerFirewallShieldBashConfig;
  passive?: PlayerFirewallPassiveConfig;
  ultimate?: PlayerFirewallUltimateConfig;
}

export interface RoguePlayerClassConfig extends PlayerClassConfig {
  attack?: PlayerRogueAttackConfig;
  stealth?: PlayerRogueStealthConfig;
  dashAttack?: PlayerRogueDashAttackConfig;
  passive?: PlayerRoguePassiveConfig;
  ultimate?: PlayerRogueUltimateConfig;
}

export interface PlayerConfig {
  mage: MagePlayerClassConfig;
  firewall: FirewallPlayerClassConfig;
  rogue: RoguePlayerClassConfig;
  health?: PlayerLegacyHealthConfig;
  attack?: PlayerLegacyAttackConfig;
  [key: string]: unknown;
}

export interface EnemyBaseStats {
  hp?: number;
  damage?: number;
  speed?: number;
  attackCooldown?: number;
  [key: string]: unknown;
}

export interface EnemyConfigEntry {
  baseStats?: EnemyBaseStats;
  [key: string]: unknown;
}

export type EnemiesConfig = Record<string, EnemyConfigEntry>;

export interface GameplayConfig {
  ui?: {
    showEnemyHealthBars: boolean;
    showDamageNumbers: boolean;
    showFPS?: boolean;
    showEnemyNames?: boolean;
  };
  uiConfig?: {
    showEnemyHealthBars: boolean;
    showDamageNumbers: boolean;
    showFPS?: boolean;
    showEnemyNames?: boolean;
  };
  debug?: {
    enabled: boolean;
    godMode: boolean;
    infiniteUltimate: boolean;
    freezeEnemies: boolean;
    showGrid?: boolean;
    daemonVoicelineTest?: boolean;
  };
  debugConfig?: {
    enabled?: boolean;
    godMode: boolean;
    infiniteUltimate: boolean;
    freezeEnemies: boolean;
    showGrid?: boolean;
    daemonVoicelineTest?: boolean;
  };
  camera?: {
    alpha: number;
    beta: number;
    radius: number;
    target: [number, number, number];
  };
  scaling?: {
    enabled: boolean;
    hpPerRoom: number;
    damagePerRoom: number;
    speedPerRoom: number;
  };
  tileHazards?: {
    poisonDps?: number;
    spikesDps?: number;
  };
  tankVisuals?: {
    height: number;
    lateral: number;
    depth: number;
    size: number;
  };
  postProcessing?: {
    enabled: boolean;
    pixelScale: number;
    glowIntensity: number;
    chromaticAmount: number;
    chromaticRadial: number;
    grainEnabled: boolean;
    grainIntensity: number;
    grainAnimated: boolean;
    crtLinesEnabled: boolean;
    crtLineIntensity: number;
    vignetteEnabled: boolean;
    vignetteWeight: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RoomConfig {
  id: string;
  name: string;
  roomType?: string;
  layout: string[];
  spawnPoints: Array<{ x: number; y?: number; z?: number; enemyType?: string }>;
  playerSpawnPoint?: { x: number; y: number };
  obstacles: Array<{ x: number; y?: number; z?: number; width: number; height: number; type: string; damage?: number }>;
  [key: string]: unknown;
}

export type RoomsConfig = RoomConfig[];
