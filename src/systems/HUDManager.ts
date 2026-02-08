/**
 * HUDManager - Manages health bars, damage numbers, and UI elements
 */

import { Scene, Vector3, Matrix } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock, Button } from '@babylonjs/gui';
import { EventBus, GameEvents } from '../core/EventBus';

interface DamageNumber {
  text: TextBlock;
  value: number;
  position: Vector3;
  timeElapsed: number;
  duration: number;
}

export class HUDManager {
  private gui: AdvancedDynamicTexture;
  private eventBus: EventBus;
  private damageNumbers: DamageNumber[] = [];
  private enemyHealthBars: Map<string, { container: Rectangle; bar: Rectangle; label: TextBlock }> = new Map();
  private playerHealthDisplay: TextBlock | null = null;
  private playerUltDisplay: TextBlock | null = null;
  private isEnabled: boolean = true;
  private showDamageNumbers: boolean = true;
  private startScreen: Rectangle | null = null;
  private gameOverScreen: Rectangle | null = null;
  private roomClearScreen: Rectangle | null = null;

  constructor(private scene: Scene) {
    this.eventBus = EventBus.getInstance();
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('HUD', true, scene);
    this.setupEventListeners();
    this.createPlayerHUD();
    this.createOverlays();
  }

  private setupEventListeners(): void {
    this.eventBus.on(GameEvents.ENEMY_DAMAGED, (data) => {
      if (!data || !data.position) return;
      if (this.showDamageNumbers) {
        this.addDamageNumber(data.position, data.damage);
      }
    });

    this.eventBus.on(GameEvents.ENEMY_SPAWNED, (data) => {
      const enemyId = data?.enemyId ?? data?.entityId;
      if (!enemyId) return;
      this.createEnemyHealthBar(enemyId);
    });

    this.eventBus.on(GameEvents.ENEMY_DIED, (data) => {
      const enemyId = data?.enemyId ?? data?.entityId;
      if (!enemyId) return;
      this.removeEnemyHealthBar(enemyId);
    });

    this.eventBus.on(GameEvents.PLAYER_DAMAGED, (data) => {
      if (this.playerHealthDisplay) {
        this.playerHealthDisplay.text = `HP: ${data.health.current}/${data.health.max}`;
      }
    });

    this.eventBus.on(GameEvents.PLAYER_ULTIMATE_READY, (data) => {
      if (this.playerUltDisplay) {
        const percentage = Math.floor(data.charge * 100);
        this.playerUltDisplay.text = `ULTIMATE: ${percentage}%`;
        this.playerUltDisplay.color = data.charge >= 1.0 ? '#00FF00' : '#FFFF00';
      }
    });

    this.eventBus.on(GameEvents.UI_OPTION_CHANGED, (data) => {
      if (data?.option === 'showDamageNumbers') {
        this.showDamageNumbers = !!data.value;
        if (!this.showDamageNumbers) {
          this.clearDamageNumbers();
        }
      }
    });
  }

  private createPlayerHUD(): void {
    // Player Health Display
    this.playerHealthDisplay = new TextBlock('playerHealth');
    this.playerHealthDisplay.text = 'HP: 100/100';
    this.playerHealthDisplay.fontSize = 24;
    this.playerHealthDisplay.fontFamily = 'Arial';
    this.playerHealthDisplay.color = '#FFFFFF';
    this.playerHealthDisplay.left = 20;
    this.playerHealthDisplay.top = 20;
    this.playerHealthDisplay.width = '200px';
    this.playerHealthDisplay.height = '40px';
    this.playerHealthDisplay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.playerHealthDisplay.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.playerHealthDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.playerHealthDisplay.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.gui.addControl(this.playerHealthDisplay);

    // Ultimate Display
    this.playerUltDisplay = new TextBlock('playerUltimate');
    this.playerUltDisplay.text = 'ULTIMATE: 0%';
    this.playerUltDisplay.fontSize = 20;
    this.playerUltDisplay.fontFamily = 'Arial';
    this.playerUltDisplay.color = '#FFFF00';
    this.playerUltDisplay.left = 0;
    this.playerUltDisplay.top = -20;
    this.playerUltDisplay.width = '300px';
    this.playerUltDisplay.height = '30px';
    this.playerUltDisplay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.playerUltDisplay.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.playerUltDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.playerUltDisplay.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.gui.addControl(this.playerUltDisplay);
  }

  private createOverlays(): void {
    this.startScreen = this.createOverlay('DAEMON DUNGEON', 'START', () => {
      this.eventBus.emit(GameEvents.GAME_START_REQUESTED);
    });
    this.startScreen.isVisible = false;

    this.gameOverScreen = this.createOverlay('GAME OVER', 'RESTART', () => {
      this.eventBus.emit(GameEvents.GAME_RESTART_REQUESTED);
    });
    this.gameOverScreen.isVisible = false;

    this.roomClearScreen = this.createOverlay('ROOM CLEARED', 'NEXT ROOM', () => {
      this.eventBus.emit(GameEvents.ROOM_NEXT_REQUESTED);
    });
    this.roomClearScreen.isVisible = false;
  }

  private createOverlay(titleText: string, buttonText: string, onClick: () => void): Rectangle {
    const container = new Rectangle(`${titleText}_overlay`);
    container.width = 1;
    container.height = 1;
    container.thickness = 0;
    container.background = 'rgba(0,0,0,0.6)';
    container.isPointerBlocker = true;
    container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.gui.addControl(container);

    const title = new TextBlock(`${titleText}_title`);
    title.text = titleText;
    title.color = '#FFFFFF';
    title.fontSize = 38;
    title.fontFamily = 'Arial';
    title.top = '-60px';
    container.addControl(title);

    const btn = Button.CreateSimpleButton(`${titleText}_btn`, buttonText);
    btn.width = '200px';
    btn.height = '50px';
    btn.color = '#FFFFFF';
    btn.cornerRadius = 6;
    btn.background = '#2A2A2A';
    btn.thickness = 2;
    btn.onPointerUpObservable.add(() => onClick());
    container.addControl(btn);

    return container;
  }

  private createEnemyHealthBar(enemyId: string): void {
    const existing = this.enemyHealthBars.get(enemyId);
    if (existing) {
      existing.container.dispose();
      existing.label.dispose();
      this.enemyHealthBars.delete(enemyId);
    }

    const container = new Rectangle(`healthbar_container_${enemyId}`);
    container.width = '80px';
    container.height = '12px';
    container.background = 'rgba(0, 0, 0, 0.8)';
    container.thickness = 2;

    const bar = new Rectangle(`healthbar_${enemyId}`);
    bar.width = '100%';
    bar.height = '100%';
    bar.background = '#00FF00';
    container.addControl(bar);

    const label = new TextBlock(`healthbar_label_${enemyId}`);
    label.text = 'E';
    label.fontSize = 10;
    label.color = '#FFFFFF';
    label.width = '80px';
    label.height = '20px';

    this.gui.addControl(container);
    this.gui.addControl(label);

    this.enemyHealthBars.set(enemyId, { container, bar, label });
  }

  private removeEnemyHealthBar(enemyId: string): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      bar.container.dispose();
      bar.label.dispose();
      this.enemyHealthBars.delete(enemyId);
    }
  }

  private addDamageNumber(position: Vector3, damage: number): void {
    const text = new TextBlock(`dmg_${Date.now()}`);
    text.text = Math.round(damage).toString();
    text.color = '#FFFFFF';
    text.fontSize = 18;
    text.outlineColor = '#000000';
    text.outlineWidth = 2;
    text.alpha = 1.0;
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.gui.addControl(text);

    this.damageNumbers.push({
      text,
      value: damage,
      position: position.clone(),
      timeElapsed: 0,
      duration: 1.5,
    });
  }

  updateEnemyHealthBar(enemyId: string, health: number, maxHealth: number): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      const percentage = (health / maxHealth) * 100;
      bar.bar.width = `${percentage}%`;
      
      if (percentage > 50) {
        bar.bar.background = '#00FF00';
      } else if (percentage > 25) {
        bar.bar.background = '#FFFF00';
      } else {
        bar.bar.background = '#FF0000';
      }
    }
  }

  updateEnemyHealthBarPosition(enemyId: string, screenPosition: Vector3): void {
    const bar = this.enemyHealthBars.get(enemyId);
    if (bar) {
      bar.container.left = `${screenPosition.x - 40}px`;
      bar.container.top = `${screenPosition.y - 30}px`;
      bar.label.left = `${screenPosition.x - 40}px`;
      bar.label.top = `${screenPosition.y - 50}px`;

      bar.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bar.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      bar.label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bar.label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    }
  }

  update(deltaTime: number): void {
    // Update damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dmg = this.damageNumbers[i];
      dmg.timeElapsed += deltaTime;

      if (dmg.timeElapsed >= dmg.duration) {
        dmg.text.dispose();
        this.damageNumbers.splice(i, 1);
        continue;
      }

      const camera = this.scene.activeCamera;
      if (!camera) continue;

      const engine = this.scene.getEngine();
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());

      const worldPos = dmg.position.add(new Vector3(0, 0.6 + dmg.timeElapsed * 0.6, 0));
      const screenPos = Vector3.Project(
        worldPos,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport
      );

      dmg.text.left = `${screenPos.x}px`;
      dmg.text.top = `${screenPos.y}px`;
      dmg.text.alpha = 1.0 - dmg.timeElapsed / dmg.duration;
    }
  }

  private clearDamageNumbers(): void {
    this.damageNumbers.forEach(dmg => dmg.text.dispose());
    this.damageNumbers = [];
  }

  toggleDisplay(enabled: boolean): void {
    this.isEnabled = enabled;
    this.gui.rootContainer.isVisible = enabled;
  }

  showStartScreen(): void {
    if (this.startScreen) this.startScreen.isVisible = true;
    this.setHudVisible(false);
  }

  showGameOverScreen(): void {
    if (this.gameOverScreen) this.gameOverScreen.isVisible = true;
    this.setHudVisible(false);
  }

  showRoomClearScreen(): void {
    if (this.roomClearScreen) this.roomClearScreen.isVisible = true;
    this.setHudVisible(false);
  }

  hideOverlays(): void {
    if (this.startScreen) this.startScreen.isVisible = false;
    if (this.gameOverScreen) this.gameOverScreen.isVisible = false;
    if (this.roomClearScreen) this.roomClearScreen.isVisible = false;
    this.setHudVisible(true);
  }

  private setHudVisible(visible: boolean): void {
    if (this.playerHealthDisplay) this.playerHealthDisplay.isVisible = visible;
    if (this.playerUltDisplay) this.playerUltDisplay.isVisible = visible;
  }

  dispose(): void {
    this.gui.dispose();
    this.enemyHealthBars.clear();
  }
}
