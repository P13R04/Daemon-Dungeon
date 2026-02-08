/**
 * PauseMenu - Pause screen UI
 */

import { AdvancedDynamicTexture, Rectangle, Button, TextBlock } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

export class PauseMenu {
  private ui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private container!: Rectangle;
  private isVisible: boolean = false;

  constructor() {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('PauseMenu');
    this.eventBus = EventBus.getInstance();
    this.setupUI();
    this.setupEventListeners();
  }

  private setupUI(): void {
    // TODO: Create pause menu
    // - Resume button
    // - Settings button
    // - Main Menu button
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.UI_PAUSE_TOGGLE, () => {
      this.toggle();
    });
  }

  show(): void {
    this.isVisible = true;
    // TODO: Show menu and pause game
  }

  hide(): void {
    this.isVisible = false;
    // TODO: Hide menu and resume game
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  dispose(): void {
    this.ui.dispose();
  }
}
