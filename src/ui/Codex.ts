/**
 * Codex - Bestiary and bonus information viewer
 */

import { AdvancedDynamicTexture, Rectangle, ScrollViewer, StackPanel } from '@babylonjs/gui';

export class Codex {
  private ui: AdvancedDynamicTexture;
  private container!: Rectangle;
  private unlockedEnemies: Set<string> = new Set();
  private unlockedBonuses: Set<string> = new Set();

  constructor() {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('Codex');
    this.setupUI();
  }

  private setupUI(): void {
    // TODO: Create codex UI
    // - Tabs: Enemies, Bonuses, Classes
    // - Scrollable list
    // - Detail view for selected entry
  }

  unlockEnemy(enemyId: string): void {
    this.unlockedEnemies.add(enemyId);
    // TODO: Update UI
  }

  unlockBonus(bonusId: string): void {
    this.unlockedBonuses.add(bonusId);
    // TODO: Update UI
  }

  show(): void {
    this.container.isVisible = true;
  }

  hide(): void {
    this.container.isVisible = false;
  }

  dispose(): void {
    this.ui.dispose();
  }
}
