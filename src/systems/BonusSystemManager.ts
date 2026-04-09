import { BonusChoice, BonusPoolSystem } from './BonusPoolSystem';

export type BonusSystemGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';

export interface BonusSystemCallbacks {
  isGameplayInitialized(): boolean;
  getGameState(): BonusSystemGameState;
  setGameState(state: BonusSystemGameState): void;
  getSelectedClassId(): 'mage' | 'firewall' | 'rogue';
  getCurrency(): number;
  trySpendCurrency(cost: number): boolean;
  showBonusChoices(choices: BonusChoice[], currency: number, rerollCost: number): void;
  applyBonus(bonusId: string): void;
  startRoomTransition(nextIndex: number): void;
  getCurrentRoomIndex(): number;
  getRoomOrderLength(): number;
  markBonusDiscovered(bonusId: string): void;
  recordBonusCollected(): void;
}

export class BonusSystemManager {
  private readonly bonusPool: BonusPoolSystem = new BonusPoolSystem();
  private currentBonusChoices: BonusChoice[] = [];
  private readonly bonusRerollCost: number = 40;

  constructor(private readonly callbacks: BonusSystemCallbacks) {}

  resetRun(): void {
    this.bonusPool.resetRun();
    this.currentBonusChoices = [];
  }

  openBonusChoices(): void {
    if (!this.callbacks.isGameplayInitialized()) return;

    this.callbacks.setGameState('bonus');
    this.currentBonusChoices = this.rollChoices();
    this.callbacks.showBonusChoices(this.currentBonusChoices, this.callbacks.getCurrency(), this.bonusRerollCost);
  }

  handleBonusSelected(bonusId: string): void {
    if (!this.callbacks.isGameplayInitialized()) return;

    const applied = this.bonusPool.applyBonus(bonusId);
    if (!applied.applied) {
      this.callbacks.showBonusChoices(this.currentBonusChoices, this.callbacks.getCurrency(), this.bonusRerollCost);
      return;
    }

    this.callbacks.markBonusDiscovered(bonusId);
    this.callbacks.recordBonusCollected();
    this.callbacks.applyBonus(bonusId);

    const roomCount = this.callbacks.getRoomOrderLength();
    if (roomCount <= 0) return;

    const nextIndex = (this.callbacks.getCurrentRoomIndex() + 1) % roomCount;
    this.callbacks.startRoomTransition(nextIndex);
  }

  handleBonusRerollRequested(cost: number): void {
    if (!this.callbacks.isGameplayInitialized()) return;
    if (this.callbacks.getGameState() !== 'bonus') return;

    const requestedCost = Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : this.bonusRerollCost;
    if (!this.callbacks.trySpendCurrency(requestedCost)) {
      this.callbacks.showBonusChoices(this.currentBonusChoices, this.callbacks.getCurrency(), this.bonusRerollCost);
      return;
    }

    this.currentBonusChoices = this.rollChoices();
    this.callbacks.showBonusChoices(this.currentBonusChoices, this.callbacks.getCurrency(), this.bonusRerollCost);
  }

  getCurrencyMultiplier(): number {
    return this.bonusPool.getCurrencyMultiplier();
  }

  getPassiveIncomePerSecond(): number {
    return this.bonusPool.getPassiveIncomePerSecond();
  }

  private rollChoices(): BonusChoice[] {
    return this.bonusPool.rollChoices(this.callbacks.getSelectedClassId(), this.bonusPool.getOfferCount());
  }
}