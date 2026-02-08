/**
 * Leaderboard - Display top scores
 */

import { AdvancedDynamicTexture, Rectangle, ScrollViewer, Grid } from '@babylonjs/gui';

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  roomsCleared: number;
  className: string;
}

export class Leaderboard {
  private ui: AdvancedDynamicTexture;
  private container!: Rectangle;
  private entries: LeaderboardEntry[] = [];

  constructor() {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('Leaderboard');
    this.setupUI();
  }

  private setupUI(): void {
    // TODO: Create leaderboard UI
    // - Filter buttons (Daily, Weekly, All-Time)
    // - Class filter
    // - Scrollable table
  }

  setEntries(entries: LeaderboardEntry[]): void {
    this.entries = entries;
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    // TODO: Update table with entries
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
