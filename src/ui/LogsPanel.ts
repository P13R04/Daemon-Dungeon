/**
 * LogsPanel - Terminal-style scrolling combat logs
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, StackPanel } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

export class LogsPanel {
  private ui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private panel!: StackPanel;
  private maxLogs: number = 10;
  private logs: TextBlock[] = [];

  constructor(ui: AdvancedDynamicTexture) {
    this.ui = ui;
    this.eventBus = EventBus.getInstance();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupUI(): void {
    // TODO: Create scrolling panel with monospace font
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.ENEMY_DIED, (data) => {
      this.addLog(`> Process ${data.entityId} terminated`);
    });

    this.eventBus.on(GameEvents.ROOM_CLEARED, () => {
      this.addLog('> All processes cleared');
    });

    this.eventBus.on(GameEvents.PLAYER_DAMAGED, (data) => {
      this.addLog(`> ERROR: System integrity compromised (-${Math.floor(data.damage)})`);
    });
  }

  addLog(message: string): void {
    // TODO: Add new log entry
    // Remove oldest if exceeds maxLogs
    // Scroll to bottom
  }

  clear(): void {
    this.logs.forEach(log => log.dispose());
    this.logs = [];
  }
}
