import { BONUS_CATALOG, BonusDefinition, BonusRarity, BonusScope } from '../data/bonuses/bonusCatalog';

export interface BonusChoice {
  id: string;
  title: string;
  description: string;
  rarity: BonusRarity;
  stackLabel: string;
}

export class BonusPoolSystem {
  private readonly definitions: Map<string, BonusDefinition>;
  private readonly stacks: Map<string, number> = new Map();

  constructor() {
    this.definitions = new Map(BONUS_CATALOG.map((entry) => [entry.id, entry]));
  }

  resetRun(): void {
    this.stacks.clear();
  }

  getDefinition(bonusId: string): BonusDefinition | null {
    return this.definitions.get(bonusId) ?? null;
  }

  getStackCount(bonusId: string): number {
    return this.stacks.get(bonusId) ?? 0;
  }

  canApply(bonusId: string): boolean {
    const def = this.definitions.get(bonusId);
    if (!def) return false;

    const current = this.getStackCount(bonusId);
    if (def.stackMode === 'unique') return current === 0;
    if (def.stackMode === 'limited') return current < (def.maxStacks ?? 1);
    return true;
  }

  applyBonus(bonusId: string): { applied: boolean; newStacks: number } {
    if (!this.canApply(bonusId)) {
      return { applied: false, newStacks: this.getStackCount(bonusId) };
    }

    const next = this.getStackCount(bonusId) + 1;
    this.stacks.set(bonusId, next);
    return { applied: true, newStacks: next };
  }

  getOfferCount(): number {
    const extra = this.getMetaValue('meta_offer_slot', 1);
    return Math.max(3, 3 + extra);
  }

  getCurrencyMultiplier(): number {
    return 1 + this.getMetaValue('meta_bounty_index', 0.1);
  }

  getPassiveIncomePerSecond(): number {
    return this.getMetaValue('meta_background_miner', 0.35);
  }

  private getRarityLuck(): number {
    return this.getMetaValue('meta_lucky_compile', 0.12);
  }

  private getMetaValue(bonusId: string, perStack: number): number {
    return this.getStackCount(bonusId) * perStack;
  }

  rollChoices(scope: BonusScope, count: number): BonusChoice[] {
    const pool = BONUS_CATALOG.filter((def) => this.isEligible(def, scope));
    if (pool.length === 0) return [];

    const offerCount = Math.max(1, count);
    const selected: BonusDefinition[] = [];
    const blockedIds = new Set<string>();

    while (selected.length < offerCount) {
      const candidates = pool.filter((def) => !blockedIds.has(def.id));
      if (candidates.length === 0) break;

      const picked = this.pickByWeight(candidates);
      if (!picked) break;

      selected.push(picked);
      blockedIds.add(picked.id);
    }

    return selected.map((def) => {
      const stacks = this.getStackCount(def.id);
      return {
        id: def.id,
        title: def.name,
        description: def.description,
        rarity: def.rarity,
        stackLabel: this.formatStackLabel(def, stacks),
      };
    });
  }

  private isEligible(def: BonusDefinition, scope: BonusScope): boolean {
    if (def.scope !== 'all' && def.scope !== scope) return false;
    return this.canApply(def.id);
  }

  private pickByWeight(candidates: BonusDefinition[]): BonusDefinition | null {
    const luck = this.getRarityLuck();
    const weights = candidates.map((def) => this.computeWeight(def.rarity, luck));
    const total = weights.reduce((acc, v) => acc + v, 0);
    if (total <= 0) return null;

    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        return candidates[i];
      }
    }
    return candidates[candidates.length - 1] ?? null;
  }

  private computeWeight(rarity: BonusRarity, luck: number): number {
    const base: Record<BonusRarity, number> = {
      common: 70,
      uncommon: 22,
      rare: 7,
      epic: 1,
    };

    const safeLuck = Math.max(0, luck);
    if (rarity === 'common') {
      return base.common * Math.max(0.3, 1 - 0.55 * safeLuck);
    }
    if (rarity === 'uncommon') {
      return base.uncommon * (1 + 0.8 * safeLuck);
    }
    if (rarity === 'rare') {
      return base.rare * (1 + 1.6 * safeLuck);
    }
    return base.epic * (1 + 2.8 * safeLuck);
  }

  private formatStackLabel(def: BonusDefinition, currentStacks: number): string {
    if (def.stackMode === 'unique') {
      return currentStacks > 0 ? 'UNIQUE (TAKEN)' : 'UNIQUE';
    }
    if (def.stackMode === 'limited') {
      const maxStacks = def.maxStacks ?? 1;
      return `STACK ${currentStacks}/${maxStacks}`;
    }
    return `STACK ${currentStacks}+`;
  }
}