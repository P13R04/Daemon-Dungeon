/**
 * EnemyHealthBars - Displays HP bars above enemies
 */

import { Scene, Mesh, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, Rectangle } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

export class EnemyHealthBars {
  private scene: Scene;
  private ui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private healthBars: Map<string, Rectangle> = new Map();
  private enabled: boolean = true;

  constructor(scene: Scene) {
    this.scene = scene;
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('EnemyHealthBars');
    this.eventBus = EventBus.getInstance();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data) => {
      this.createHealthBar(data.entityId, data.maxHP);
    });

    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      this.updateHealthBar(data.entityId, data.currentHP, data.maxHP);
    });

    this.eventBus.on(GameEvents.ENEMY_DIED, (data) => {
      this.removeHealthBar(data.entityId);
    });
  }

  private createHealthBar(entityId: string, maxHP: number): void {
    if (!this.enabled) return;
    
    // TODO: Create health bar UI element
    // const bar = new Rectangle();
    // this.healthBars.set(entityId, bar);
  }

  private updateHealthBar(entityId: string, currentHP: number, maxHP: number): void {
    const bar = this.healthBars.get(entityId);
    if (bar) {
      // TODO: Update bar width based on HP percentage
    }
  }

  private removeHealthBar(entityId: string): void {
    const bar = this.healthBars.get(entityId);
    if (bar) {
      bar.dispose();
      this.healthBars.delete(entityId);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAllBars();
    }
  }

  private clearAllBars(): void {
    this.healthBars.forEach(bar => bar.dispose());
    this.healthBars.clear();
  }

  update(): void {
    // TODO: Update positions to follow enemies
  }

  dispose(): void {
    this.clearAllBars();
    this.ui.dispose();
  }
}
