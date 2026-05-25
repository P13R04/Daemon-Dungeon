/**
 * ScalingSystem - Applies difficulty scaling to enemy stats
 */

export interface ScalingCurve {
  baseValue: number;
  perRoomMultiplier: number;
  perRoomAdditive?: number;
}

export interface ScalingConfig {
  hp: ScalingCurve;
  damage: ScalingCurve;
  speed: ScalingCurve;
}

export class ScalingSystem {
  private config: ScalingConfig;

  constructor(config: ScalingConfig) {
    this.config = config;
  }

  getScaledValue(baseValue: number, curve: ScalingCurve, roomNumber: number): number {
    let scaled = baseValue * Math.pow(curve.perRoomMultiplier, roomNumber - 1);
    
    if (curve.perRoomAdditive) {
      scaled += curve.perRoomAdditive * (roomNumber - 1);
    }
    
    return scaled;
  }

  getScaledHP(baseHP: number, roomNumber: number): number {
    return this.getScaledValue(baseHP, this.config.hp, roomNumber);
  }

  getScaledDamage(baseDamage: number, roomNumber: number): number {
    return this.getScaledValue(baseDamage, this.config.damage, roomNumber);
  }

  getScaledSpeed(baseSpeed: number, roomNumber: number): number {
    return this.getScaledValue(baseSpeed, this.config.speed, roomNumber);
  }
}
