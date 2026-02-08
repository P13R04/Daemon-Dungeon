/**
 * DevConsole - Development tools overlay
 */

import { AdvancedDynamicTexture, Rectangle, Button, Slider, TextBlock } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

export class DevConsole {
  private ui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private container!: Rectangle;
  private isVisible: boolean = false;

  constructor() {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('DevConsole');
    this.eventBus = EventBus.getInstance();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupUI(): void {
    // TODO: Create dev console UI
    // - Sliders for player stats (speed, damage, health)
    // - Sliders for enemy stats
    // - Buttons: Skip Room, Reset Room, God Mode, Infinite Ult
    // - Room selector
    // - Export Stats button
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.UI_DEV_CONSOLE_TOGGLE, () => {
      this.toggle();
    });
  }

  show(): void {
    this.isVisible = true;
    this.container.isVisible = true;
  }

  hide(): void {
    this.isVisible = false;
    this.container.isVisible = false;
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  exportStats(): void {
    // TODO: Export current game stats to JSON
  }

  dispose(): void {
    this.ui.dispose();
  }
}
