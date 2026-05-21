import { BonusChoice, BonusPoolSystem } from './BonusPoolSystem';
import { BONUS_TUNING } from '../data/bonuses/bonusTuning';

export type BonusSystemGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';

export interface BonusPlayerHealthSnapshot {
  current: number;
  max: number;
}

export interface BonusSelectionUiState {
  freePicksRemaining: number;
  paidRareChoice: BonusChoice | null;
  paidRareCost: number;
  paidRarePurchased: boolean;
  selectedBonusIds: string[];
  rerollEnabled: boolean;
  hideRerollButton?: boolean;
  fullHealCost: number;
  hideFullHealButton?: boolean;
  forceFullHealClickable?: boolean;
  playerHealthCurrent: number;
  playerHealthMax: number;
}

export interface BonusSystemCallbacks {
  isGameplayInitialized(): boolean;
  getGameState(): BonusSystemGameState;
  setGameState(state: BonusSystemGameState): void;
  getSelectedClassId(): 'mage' | 'firewall' | 'rogue';
  getCurrency(): number;
  trySpendCurrency(cost: number): boolean;
  getPlayerHealth(): BonusPlayerHealthSnapshot | null;
  healPlayerToFull(): void;
  showBonusChoices(choices: BonusChoice[], currency: number, rerollCost: number, selectionState: BonusSelectionUiState): void;
  applyBonus(bonusId: string): void;
  startRoomTransition(nextIndex: number): void;
  getCurrentRoomIndex(): number;
  getRoomOrderLength(): number;
  markBonusDiscovered(bonusId: string): void;
  recordBonusCollected(bonusId: string): void;
  onInsufficientShopFunds?: () => void;
  onTutorialShopInteraction?: (type: 'paid_rare' | 'reroll' | 'full_heal') => void;
}

export class BonusSystemManager {
  private readonly bonusPool: BonusPoolSystem = new BonusPoolSystem();
  private currentBonusChoices: BonusChoice[] = [];
  private currentPaidRareChoice: BonusChoice | null = null;
  private readonly selectedChoiceIds: Set<string> = new Set();
  private freePicksRemaining: number = 0;
  private paidRarePurchased: boolean = false;
  private readonly bonusRerollCost: number = BONUS_TUNING.selection.rerollCost;
  private forcedChoices: string[] | null = null;
  private forcedRareChoice: string | null = null;
  private tutorialShopScriptStep: 'inactive' | 'paid_only' | 'await_free_reveal' | 'free_only' = 'inactive';

  constructor(private readonly callbacks: BonusSystemCallbacks) {}

  forceNextChoices(choices: string[], rareChoice: string | null): void {
    this.forcedChoices = choices;
    this.forcedRareChoice = rareChoice;
  }

  enableTutorialShopScriptedFlow(): void {
    this.tutorialShopScriptStep = 'paid_only';
  }

  revealTutorialFreeChoice(): void {
    if (this.tutorialShopScriptStep !== 'await_free_reveal') return;
    this.tutorialShopScriptStep = 'free_only';
    this.showCurrentBonusChoices();
  }

  resetRun(): void {
    this.bonusPool.resetRun();
    this.currentBonusChoices = [];
    this.currentPaidRareChoice = null;
    this.selectedChoiceIds.clear();
    this.freePicksRemaining = 0;
    this.paidRarePurchased = false;
    this.tutorialShopScriptStep = 'inactive';
  }

  getActiveBonuses(): { id: string; stacks: number }[] {
    return this.bonusPool.getActiveBonuses();
  }

  openBonusChoices(): void {
    if (!this.callbacks.isGameplayInitialized()) return;

    this.callbacks.setGameState('bonus');
    this.freePicksRemaining = this.getFreePickCountForRoom(this.callbacks.getCurrentRoomIndex());
    this.paidRarePurchased = false;
    this.selectedChoiceIds.clear();
    
    if (this.forcedChoices) {
      this.currentBonusChoices = this.forcedChoices
        .map(id => this.bonusPool.getChoiceDef(id))
        .filter((c): c is BonusChoice => c !== null);
      this.currentPaidRareChoice = this.forcedRareChoice ? this.bonusPool.getChoiceDef(this.forcedRareChoice) : null;
      this.forcedChoices = null;
      this.forcedRareChoice = null;
    } else {
      this.currentBonusChoices = this.rollChoices();
      const excludeIds = new Set<string>();
      this.currentBonusChoices.forEach((choice) => excludeIds.add(choice.id));
      this.currentPaidRareChoice = this.rollPaidRareChoice(excludeIds);
    }
    
    this.showCurrentBonusChoices();
  }

  handleBonusSelected(bonusId: string): void {
    if (!this.callbacks.isGameplayInitialized()) return;
    if (this.callbacks.getGameState() !== 'bonus') return;
    if (this.freePicksRemaining <= 0) return;
    if (this.selectedChoiceIds.has(bonusId)) {
      this.showCurrentBonusChoices();
      return;
    }

    const isCurrentChoice = this.currentBonusChoices.some((choice) => choice.id === bonusId);
    if (!isCurrentChoice) {
      this.showCurrentBonusChoices();
      return;
    }

    const applied = this.bonusPool.applyBonus(bonusId);
    if (!applied.applied) {
      this.showCurrentBonusChoices();
      return;
    }

    this.callbacks.markBonusDiscovered(bonusId);
    this.callbacks.recordBonusCollected(bonusId);
    this.callbacks.applyBonus(bonusId);
    this.selectedChoiceIds.add(bonusId);

    this.freePicksRemaining = Math.max(0, this.freePicksRemaining - 1);
    if (this.tutorialShopScriptStep === 'free_only') {
      this.tutorialShopScriptStep = 'inactive';
    }
    if (this.freePicksRemaining > 0) {
      const hasSelectableChoice = this.currentBonusChoices.some(
        (choice) => !this.selectedChoiceIds.has(choice.id) && this.bonusPool.canApply(choice.id)
      );
      if (!hasSelectableChoice) {
        this.freePicksRemaining = 0;
        this.transitionToNextRoom();
        return;
      }
      this.showCurrentBonusChoices();
      return;
    }

    this.transitionToNextRoom();
  }

  handlePaidRareBonusRequested(bonusId: string, cost: number): void {
    if (!this.callbacks.isGameplayInitialized()) return;
    if (this.callbacks.getGameState() !== 'bonus') return;
    if (this.paidRarePurchased) {
      this.showCurrentBonusChoices();
      return;
    }

    const targetBonusId = bonusId || this.currentPaidRareChoice?.id;
    if (!targetBonusId || !this.bonusPool.canApply(targetBonusId)) {
      // Keep the same paid card once a multi-pick sequence has started so layout stays stable.
      if (this.selectedChoiceIds.size === 0) {
        this.currentPaidRareChoice = this.rollPaidRareChoice();
      }
      this.showCurrentBonusChoices();
      return;
    }

    const expectedCost = this.getPaidRareCost();
    const requestedCost = Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : expectedCost;
    if (!this.callbacks.trySpendCurrency(requestedCost)) {
      this.callbacks.onInsufficientShopFunds?.();
      if (this.callbacks.onTutorialShopInteraction) {
        this.callbacks.onTutorialShopInteraction('paid_rare');
      }
      if (this.tutorialShopScriptStep === 'paid_only') {
        this.tutorialShopScriptStep = 'await_free_reveal';
      }
      this.showCurrentBonusChoices();
      return;
    }

    const applied = this.bonusPool.applyBonus(targetBonusId);
    if (!applied.applied) {
      this.showCurrentBonusChoices();
      return;
    }

    this.callbacks.markBonusDiscovered(targetBonusId);
    this.callbacks.recordBonusCollected(targetBonusId);
    this.callbacks.applyBonus(targetBonusId);
    this.selectedChoiceIds.add(targetBonusId);

    this.paidRarePurchased = true;
    this.showCurrentBonusChoices();
  }

  handleBonusRerollRequested(cost: number): void {
    if (!this.callbacks.isGameplayInitialized()) return;
    if (this.callbacks.getGameState() !== 'bonus') return;
    if (!this.isRerollEnabled()) {
      this.showCurrentBonusChoices();
      return;
    }

    const requestedCost = Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : this.bonusRerollCost;
    if (!this.callbacks.trySpendCurrency(requestedCost)) {
      this.callbacks.onInsufficientShopFunds?.();
      if (this.callbacks.onTutorialShopInteraction) {
        this.callbacks.onTutorialShopInteraction('reroll');
      }
      this.showCurrentBonusChoices();
      return;
    }

    this.selectedChoiceIds.clear();
    this.currentBonusChoices = this.rollChoices();
    if (!this.paidRarePurchased) {
      const excludeIds = new Set<string>();
      this.currentBonusChoices.forEach((choice) => excludeIds.add(choice.id));
      this.currentPaidRareChoice = this.rollPaidRareChoice(excludeIds);
    }
    this.showCurrentBonusChoices();
  }

  handleShopPurchaseRequested(itemId: string, cost: number): void {
    if (!this.callbacks.isGameplayInitialized()) return;
    if (this.callbacks.getGameState() !== 'bonus') return;

    if (itemId === 'full_heal') {
      this.handleFullHealRequested(cost);
      return;
    }

    this.showCurrentBonusChoices();
  }

  getCurrencyMultiplier(): number {
    return this.bonusPool.getCurrencyMultiplier();
  }

  getPassiveIncomePerSecond(): number {
    return this.bonusPool.getPassiveIncomePerSecond();
  }

  getShopDiscountMultiplier(): number {
    return this.bonusPool.getShopDiscountMultiplier();
  }

  private rollChoices(excludeIds?: Set<string>): BonusChoice[] {
    return this.bonusPool.rollChoices(this.callbacks.getSelectedClassId(), this.bonusPool.getOfferCount(), excludeIds);
  }

  private rollPaidRareChoice(excludeIds?: Set<string>): BonusChoice | null {
    return this.bonusPool.rollRestrictedRareChoice(
      this.callbacks.getSelectedClassId(),
      BONUS_TUNING.selection.paidRareRestrictedPoolIds,
      excludeIds
    );
  }

  private getMetaDoublePickExtraPicks(roomIndex: number): number {
    const hasBonus = this.bonusPool.getStackCount('meta_double_pick') > 0;
    if (!hasBonus) return 0;
    if (BONUS_TUNING.meta.doublePickRoomInterval <= 0) return 0;

    const roomNumber = roomIndex + 1;
    return roomNumber % BONUS_TUNING.meta.doublePickRoomInterval === 0 ? 1 : 0;
  }

  private getFreePickCountForRoom(roomIndex: number): number {
    return 1 + this.getMetaDoublePickExtraPicks(roomIndex);
  }

  private getPaidRareCost(): number {
    const cost = this.bonusRerollCost * BONUS_TUNING.selection.paidRareCostRerollMultiplier;
    return Math.max(1, Math.floor(cost));
  }

  private getFullHealCost(): number {
    const cost = this.bonusRerollCost * BONUS_TUNING.selection.fullHealCostRerollMultiplier;
    return Math.max(1, Math.floor(cost));
  }

  private handleFullHealRequested(cost: number): void {
    const health = this.callbacks.getPlayerHealth();
    if (!health) {
      this.showCurrentBonusChoices();
      return;
    }

    const current = Math.max(0, Math.floor(health.current));
    const max = Math.max(0, Math.floor(health.max));
    const scriptedTutorialFreeShop = this.tutorialShopScriptStep === 'free_only';
    if (max <= 0) {
      this.showCurrentBonusChoices();
      return;
    }
    if (current >= max) {
      if (scriptedTutorialFreeShop) {
        this.callbacks.onInsufficientShopFunds?.();
        this.callbacks.onTutorialShopInteraction?.('full_heal');
      }
      this.showCurrentBonusChoices();
      return;
    }

    // Removed isFullHealEnabled check
    const requestedCost = Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : this.getFullHealCost();
    if (!this.callbacks.trySpendCurrency(requestedCost)) {
      this.callbacks.onInsufficientShopFunds?.();
      if (this.callbacks.onTutorialShopInteraction) {
        this.callbacks.onTutorialShopInteraction('full_heal');
      }
      this.showCurrentBonusChoices();
      return;
    }

    this.callbacks.healPlayerToFull();
    this.showCurrentBonusChoices();
  }

  private isRerollEnabled(): boolean {
    return this.freePicksRemaining > 0 && this.selectedChoiceIds.size === 0;
  }

  private showCurrentBonusChoices(): void {
    if (this.freePicksRemaining > 0 && this.currentBonusChoices.length === 0) {
      this.freePicksRemaining = 0;
      this.transitionToNextRoom();
      return;
    }

    if (
      !this.paidRarePurchased
      && this.selectedChoiceIds.size === 0
      && this.currentPaidRareChoice
      && !this.bonusPool.canApply(this.currentPaidRareChoice.id)
    ) {
      const excludeIds = new Set<string>();
      this.currentBonusChoices.forEach((choice) => excludeIds.add(choice.id));
      this.currentPaidRareChoice = this.rollPaidRareChoice(excludeIds);
    }

    const health = this.callbacks.getPlayerHealth();
    const playerHealthCurrent = Math.max(0, Math.floor(health?.current ?? 0));
    const playerHealthMax = Math.max(playerHealthCurrent, Math.floor(health?.max ?? 0));

    this.callbacks.showBonusChoices(
      (this.tutorialShopScriptStep === 'paid_only' || this.tutorialShopScriptStep === 'await_free_reveal') ? [] : this.currentBonusChoices,
      this.callbacks.getCurrency(),
      this.bonusRerollCost,
      {
        freePicksRemaining: this.freePicksRemaining,
        paidRareChoice: this.tutorialShopScriptStep === 'free_only' ? null : this.currentPaidRareChoice,
        paidRareCost: this.getPaidRareCost(),
        paidRarePurchased: this.paidRarePurchased,
        selectedBonusIds: Array.from(this.selectedChoiceIds),
        rerollEnabled: this.tutorialShopScriptStep === 'free_only' ? true : this.isRerollEnabled(),
        hideRerollButton: this.tutorialShopScriptStep === 'paid_only' || this.tutorialShopScriptStep === 'await_free_reveal',
        fullHealCost: this.getFullHealCost(),
        hideFullHealButton: this.tutorialShopScriptStep === 'paid_only' || this.tutorialShopScriptStep === 'await_free_reveal',
        forceFullHealClickable: this.tutorialShopScriptStep === 'free_only',
        playerHealthCurrent,
        playerHealthMax,
      }
    );
  }

  private transitionToNextRoom(): void {
    const roomCount = this.callbacks.getRoomOrderLength();
    if (roomCount <= 0) return;

    const nextIndex = (this.callbacks.getCurrentRoomIndex() + 1) % roomCount;
    this.callbacks.startRoomTransition(nextIndex);
  }
}
