export interface RunEconomyConsumableState {
  damageStims: number;
  shieldPatches: number;
}

export class RunEconomyManager {
  private currency = 0;
  private currencyCarry = 0;
  private consumableDamageStims = 0;
  private consumableShieldPatches = 0;

  resetRun(): void {
    this.currency = 0;
    this.currencyCarry = 0;
    this.consumableDamageStims = 0;
    this.consumableShieldPatches = 0;
  }

  getCurrency(): number {
    return this.currency;
  }

  getConsumableState(): RunEconomyConsumableState {
    return {
      damageStims: this.consumableDamageStims,
      shieldPatches: this.consumableShieldPatches,
    };
  }

  addCurrency(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return this.currency;
    this.currency += Math.floor(amount);
    return this.currency;
  }

  addCurrencyFraction(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return this.currency;
    this.currencyCarry += amount;
    const gained = Math.floor(this.currencyCarry);
    if (gained <= 0) return this.currency;
    this.currencyCarry -= gained;
    this.currency += gained;
    return this.currency;
  }

  trySpendCurrency(cost: number): boolean {
    const safeCost = Math.max(0, Math.floor(cost));
    if (this.currency < safeCost) return false;
    this.currency -= safeCost;
    return true;
  }

  consumeDamageStim(): boolean {
    if (this.consumableDamageStims <= 0) return false;
    this.consumableDamageStims -= 1;
    return true;
  }

  consumeShieldPatch(): boolean {
    if (this.consumableShieldPatches <= 0) return false;
    this.consumableShieldPatches -= 1;
    return true;
  }

  grantDamageStim(amount = 1): void {
    const safeAmount = Math.max(0, Math.floor(amount));
    this.consumableDamageStims += safeAmount;
  }

  grantShieldPatch(amount = 1): void {
    const safeAmount = Math.max(0, Math.floor(amount));
    this.consumableShieldPatches += safeAmount;
  }

  getConsumableStatusLabel(activeDamageState: { active: boolean; remaining: number }, activeShieldState: { active: boolean; remaining: number }): string {
    const charges = `DMGx${this.consumableDamageStims} SHDx${this.consumableShieldPatches}`;
    const active: string[] = [];
    if (activeDamageState.active) active.push(`DMG ${activeDamageState.remaining.toFixed(1)}s`);
    if (activeShieldState.active) active.push(`SHD ${activeShieldState.remaining.toFixed(1)}s`);

    if (active.length === 0) return charges;
    return `${charges} | ${active.join(' | ')}`;
  }
}
