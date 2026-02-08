/**
 * HUD - Main gameplay HUD
 */

import { AdvancedDynamicTexture, Rectangle, TextBlock, StackPanel } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

export class HUD {
  private ui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  
  private healthBar!: Rectangle;
  private ultChargeBar!: Rectangle;
  private roomNumberText!: TextBlock;
  private logsPanel!: StackPanel;

  constructor() {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('HUD');
    this.eventBus = EventBus.getInstance();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupUI(): void {
    // TODO: Create HUD elements
    // - Health bar
    // - Ultimate charge bar
    // - Room number
    // - Logs panel (scrolling terminal-style)
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.PLAYER_HEALTH_CHANGED, (data) => {
      this.updateHealthBar(data.currentHP, data.maxHP);
    });

    this.eventBus.on(GameEvents.ROOM_ENTERED, (data) => {
      this.updateRoomNumber(data.roomNumber);
    });
  }

  private updateHealthBar(currentHP: number, maxHP: number): void {
    // TODO: Update health bar visual
  }

  private updateRoomNumber(roomNumber: number): void {
    // TODO: Update room number display
  }

  addLog(message: string): void {
    // TODO: Add log entry to scrolling panel
  }

  show(): void {
    // TODO: Show HUD
  }

  hide(): void {
    // TODO: Hide HUD
  }

  dispose(): void {
    this.ui.dispose();
  }
}
