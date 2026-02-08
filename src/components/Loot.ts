/**
 * Loot - Drop table and loot generation component
 */

import { IComponent } from '../entities/Entity';

export interface LootEntry {
  itemId: string;
  dropChance: number; // 0-1
  quantity?: number;
}

export class Loot implements IComponent {
  private lootTable: LootEntry[];

  constructor(lootTable: LootEntry[]) {
    this.lootTable = lootTable;
  }

  generateLoot(): string[] {
    const drops: string[] = [];
    
    for (const entry of this.lootTable) {
      if (Math.random() < entry.dropChance) {
        drops.push(entry.itemId);
      }
    }
    
    return drops;
  }

  update(deltaTime: number): void {
    // Loot is passive
  }

  destroy(): void {
    // Cleanup
  }
}
