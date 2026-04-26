import { EventBus, GameEvents } from '../core/EventBus';

export interface ScorePayload {
  score: number;
  delta: number;
  reason: string;
}

export interface ComboPayload {
  combo: number;
  multiplier: number;
}

export class ScoreManager {
  private eventBus: EventBus;
  private currentScore: number = 0;
  private highScore: number = 0;
  private comboCount: number = 0;
  private comboMultiplier: number = 1.0;
  private lastKillTime: number = 0;
  private comboDuration: number = 3.5; // Seconds before combo resets
  
  private roomStartTime: number = 0;
  private roomDamageTaken: number = 0;
  private totalEnemiesKilled: number = 0;
  private highScoreBeaten: boolean = false;

  private unsubscribers: Array<() => void> = [];

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.loadHighScore();
    this.setupListeners();
  }

  private setupListeners(): void {
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DIED, (data: any) => this.handleEnemyDied(data)));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_DAMAGED, () => this.handlePlayerDamaged()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_ENTERED, () => this.handleRoomEntered()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_CLEARED, () => this.handleRoomCleared()));
  }

  public dispose(): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }

  private loadHighScore(): void {
    const saved = localStorage.getItem('daemon_dungeon_highscore');
    if (saved) {
      this.highScore = parseInt(saved, 10) || 0;
    }
  }

  private saveHighScore(): void {
    localStorage.setItem('daemon_dungeon_highscore', this.highScore.toString());
  }

  private handleEnemyDied(data: any): void {
    const now = Date.now() / 1000;
    
    // Update combo
    if (now - this.lastKillTime < this.comboDuration) {
      this.comboCount++;
      // Multiplier grows: 1.0, 1.1, 1.2, ..., up to 4.0
      this.comboMultiplier = Math.min(4.0, 1.0 + (this.comboCount * 0.1));
    } else {
      this.comboCount = 1;
      this.comboMultiplier = 1.0;
    }
    
    this.lastKillTime = now;
    this.totalEnemiesKilled++;

    // Base points for enemy
    let basePoints = data?.scoreValue || 100;
    
    // Fallback based on type if no explicit scoreValue
    if (!data?.scoreValue && data?.enemyType) {
      const type = data.enemyType;
      if (type.includes('boss')) basePoints = 2500;
      else if (type.includes('sentinel') || type.includes('bull')) basePoints = 250;
      else if (type.includes('strategist') || type.includes('jumper')) basePoints = 200;
    }

    const points = Math.round(basePoints * this.comboMultiplier);
    
    this.addScore(points, 'Enemy Defeated');
    this.eventBus.emit(GameEvents.SCORE_COMBO_CHANGED, { 
      combo: this.comboCount, 
      multiplier: this.comboMultiplier 
    } as ComboPayload);
  }

  private handlePlayerDamaged(): void {
    // Getting hit resets combo and adds to room damage counter
    this.comboCount = 0;
    this.comboMultiplier = 1.0;
    this.roomDamageTaken++;
    
    this.eventBus.emit(GameEvents.SCORE_COMBO_CHANGED, { 
      combo: this.comboCount, 
      multiplier: this.comboMultiplier 
    } as ComboPayload);
  }

  private handleRoomEntered(): void {
    this.roomStartTime = Date.now() / 1000;
    this.roomDamageTaken = 0;
  }

  private handleRoomCleared(): void {
    const now = Date.now() / 1000;
    const timeTaken = now - this.roomStartTime;
    
    // Base room clear bonus: 500 * (1 + roomIndex * 0.2)
    // We'd need the room index here. For now let's use a flat 500
    let bonus = 500;
    
    // Speed bonus: if cleared in under 30 seconds
    if (timeTaken < 30) {
      const speedBonus = Math.round((30 - timeTaken) * 50);
      this.addScore(speedBonus, 'Speed Bonus');
    }

    // No-hit bonus
    if (this.roomDamageTaken === 0) {
      this.addScore(1000, 'Perfect Room');
    }
    
    this.addScore(bonus, 'Room Cleared');
  }

  private addScore(points: number, reason: string): void {
    if (points <= 0) return;
    
    this.currentScore += points;
    
    if (this.currentScore > this.highScore) {
      const previouslyBeaten = this.highScoreBeaten;
      this.highScore = this.currentScore;
      this.highScoreBeaten = true;
      this.saveHighScore();
      
      if (!previouslyBeaten) {
        this.eventBus.emit(GameEvents.HIGH_SCORE_BEATEN, { highScore: this.highScore });
      }
    }

    this.eventBus.emit(GameEvents.SCORE_CHANGED, {
      score: this.currentScore,
      delta: points,
      reason: reason
    } as ScorePayload);
  }

  public getScore(): number {
    return this.currentScore;
  }

  public getHighScore(): number {
    return this.highScore;
  }

  public reset(): void {
    this.currentScore = 0;
    this.comboCount = 0;
    this.comboMultiplier = 1.0;
    this.highScoreBeaten = false;
    this.totalEnemiesKilled = 0;
  }
}
