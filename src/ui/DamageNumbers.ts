/**
 * DamageNumbers - Floating damage text on hits
 */

import { Scene, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

interface DamageNumberData {
  text: TextBlock;
  startTime: number;
  duration: number;
  startPosition: Vector3;
}

export class DamageNumbers {
  private scene: Scene;
  private ui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private activeNumbers: DamageNumberData[] = [];
  private enabled: boolean = true;

  constructor(scene: Scene) {
    this.scene = scene;
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('DamageNumbers');
    this.eventBus = EventBus.getInstance();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      if (data.position) {
        this.showDamage(data.damage, data.position);
      }
    });
  }

  private showDamage(damage: number, position: Vector3): void {
    if (!this.enabled) return;

    // TODO: Create floating text
    // const text = new TextBlock();
    // text.text = Math.floor(damage).toString();
    // text.color = 'white';
    // text.fontSize = 24;
    // Animate upward and fade out
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAll();
    }
  }

  private clearAll(): void {
    this.activeNumbers.forEach(data => data.text.dispose());
    this.activeNumbers = [];
  }

  update(deltaTime: number): void {
    // TODO: Update positions and fade out
    // Remove expired numbers
  }

  dispose(): void {
    this.clearAll();
    this.ui.dispose();
  }
}
