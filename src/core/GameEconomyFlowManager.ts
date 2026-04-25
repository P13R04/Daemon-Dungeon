import { ConfigLoader } from '../utils/ConfigLoader';
import { InputManager } from '../input/InputManager';
import { PlayerController } from '../gameplay/PlayerController';
import { RunEconomyManager } from './RunEconomyManager';
import { BonusSystemManager } from '../systems/BonusSystemManager';
import { HUDManager } from '../systems/HUDManager';

export class GameEconomyFlowManager {
  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly runEconomy: RunEconomyManager,
    private readonly bonusSystemManager: BonusSystemManager,
    private readonly hudManager: HUDManager,
    private readonly playerController: PlayerController,
    private readonly inputManager: InputManager,
  ) {}

  getCurrency(): number {
    return this.runEconomy.getCurrency();
  }

  computeEnemyKillReward(enemyType: string | undefined, roomElapsedSeconds: number): number {
    const enemies = this.configLoader.getEnemiesConfig() ?? {};
    const enemyConfig = typeof enemyType === 'string' ? enemies[enemyType] : null;
    const hp = Number(enemyConfig?.baseStats?.hp ?? 40);
    const damage = Number(enemyConfig?.baseStats?.damage ?? 8);
    const speed = Number(enemyConfig?.baseStats?.speed ?? 2.5);
    const cooldown = Number(enemyConfig?.baseStats?.attackCooldown ?? 1.0);

    const threatScore = (hp * 0.05) + (damage * 0.18) + (speed * 1.2) + (1 / Math.max(0.2, cooldown));
    const baseReward = Math.max(1, Math.round(2 + threatScore));

    const decayMultiplier = Math.max(0.35, 1.25 - (roomElapsedSeconds * 0.015));
    const economyMultiplier = this.bonusSystemManager.getCurrencyMultiplier();
    return Math.max(1, Math.floor(baseReward * decayMultiplier * economyMultiplier));
  }

  addCurrency(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.runEconomy.addCurrency(amount);
    this.hudManager.updateCurrency(this.runEconomy.getCurrency());
  }

  addCurrencyFraction(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.runEconomy.addCurrencyFraction(amount);
    this.hudManager.updateCurrency(this.runEconomy.getCurrency());
  }

  applyPassiveIncome(deltaTime: number): void {
    const passiveIncome = this.bonusSystemManager.getPassiveIncomePerSecond();
    if (passiveIncome <= 0) return;
    this.addCurrencyFraction(passiveIncome * deltaTime);
  }

  trySpendCurrency(cost: number): boolean {
    const discountMultiplier = this.bonusSystemManager.getShopDiscountMultiplier();
    const adjustedCost = Math.max(1, Math.ceil(cost * discountMultiplier));
    const spent = this.runEconomy.trySpendCurrency(adjustedCost);
    if (!spent) return false;
    this.hudManager.updateCurrency(this.runEconomy.getCurrency());
    return true;
  }

  updateConsumablesFromInput(): void {
    if (this.inputManager.isItemPressedThisFrame(1) && this.runEconomy.consumeDamageStim()) {
      this.playerController.activateDamageBoost(1.7, 5.0);
    }
    if (this.inputManager.isItemPressedThisFrame(2) && this.runEconomy.consumeShieldPatch()) {
      this.playerController.activateDamageReduction(0.5, 5.0);
    }
  }

  getConsumableStatusLabel(): string {
    const damage = this.playerController.getDamageBoostState();
    const shield = this.playerController.getDamageReductionState();

    return this.runEconomy.getConsumableStatusLabel(
      { active: damage.active, remaining: damage.remaining },
      { active: shield.active, remaining: shield.remaining }
    );
  }
}
