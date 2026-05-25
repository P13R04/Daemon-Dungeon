import { Vector3, Scene, MeshBuilder, StandardMaterial, Color3, TransformNode, Mesh, Observer, Nullable } from '@babylonjs/core';
import { EventBus, GameEvents } from './EventBus';
import { GameStartRequestedPayload } from './GameEventBindings';
import { HUDManager } from '../systems/HUDManager';
import { GameSettingsStore } from '../settings/GameSettings';
import { AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control } from '@babylonjs/gui';
import { UI_LAYER } from '../ui/uiLayers';
import { PlayerController } from '../gameplay/PlayerController';

export type TutorialPhase = 'init' | 'movement_prompt' | 'movement_door' | 'shop_intro' | 'shop_buy' | 'shop_door' | 'combat_aim' | 'combat_dummy' | 'combat_stance' | 'combat_ultimate' | 'combat_door' | 'playground_mobs' | 'playground_completed';

export interface TutorialDependencies {
  getRoomCenter: () => Vector3;
  getRoomIndex: () => number;
  hudManager: HUDManager;
  scene: Scene;
  playerController?: PlayerController;
}

export class GameTutorialManager {
  private eventBus: EventBus;
  private currentPhase: TutorialPhase = 'init';
  private classId: 'mage' | 'firewall' | 'rogue' | 'cat' = 'mage';
  private isActive: boolean = false;
  private unsubscribers: Array<() => void> = [];
  private enemiesAlive: number = 0;
  private phaseState: any = {};
  private timer: number | null = null;
  private introTriggered: boolean = false;
  private dependencies: TutorialDependencies | null = null;
  private promptGui: AdvancedDynamicTexture | null = null;
  private forcedRoomIndex: number = -1;
  private indicatorMesh: Mesh | null = null;
  private aimIndicatorRoot: TransformNode | null = null;
  private aimIndicatorObserver: Nullable<Observer<Scene>> | null = null;

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_START_REQUESTED, (payload: GameStartRequestedPayload) => {
      this.startTutorial(payload.classId || 'mage');
    }));

    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_ENTERED, () => this.handleRoomEntered()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DIED, () => this.handleEnemyDied()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ATTACK_PERFORMED, (data: any) => this.handleAttackPerformed(data)));
    
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_SHOP_OPENED, () => {
      if (this.isActive) this.triggerPhase('shop_intro');
    }));
    
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_SHOP_INTERACTED, (data: any) => {
      if (!this.isActive) return;
      if (data.type === 'paid_rare') {
        this.daemonSay("You lack the credits to purchase premium daemons right now.", "neutral", 4);
      } else if (data.type === 'full_heal') {
        this.daemonSay("Full repair protocols require credits you do not have.", "neutral", 4);
      } else if (data.type === 'reroll') {
        this.daemonSay("Rerolling the registry costs credits. Pick the free upgrade instead.", "neutral", 4);
      }
    }));
  }

  public initialize(dependencies?: TutorialDependencies): void {
    if (dependencies) {
      this.dependencies = dependencies;
    }
  }

  public dispose(): void {
    this.stopTutorial();
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }

  public startTutorial(classId: 'mage' | 'firewall' | 'rogue' | 'cat'): void {
    if (this.isActive) return;
    this.isActive = true;
    this.classId = classId;
    this.currentPhase = 'init';
    this.enemiesAlive = 0;
    this.phaseState = {};
    this.introTriggered = false;
    this.forcedRoomIndex = -1;
  }

  public stopTutorial(): void {
    this.isActive = false;
    this.currentPhase = 'init';
    this.phaseState = {};
    this.enemiesAlive = 0;
    this.introTriggered = false;
    
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.promptGui) {
      this.promptGui.dispose();
      this.promptGui = null;
    }
    
    this.clearIndicator();
    this.stopAimIndicator();
  }

  public isTutorialActive(): boolean {
    return this.isActive;
  }

  public getCurrentPhase(): TutorialPhase {
    return this.currentPhase;
  }

  private triggerPhase(phase: TutorialPhase): void {
    if (!this.isActive) return;
    if (this.currentPhase === phase && phase !== 'init') return;
    this.currentPhase = phase;
    this.phaseState = {};

    switch (phase) {
      case 'movement_prompt':
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) {
          this.showControlPrompt();
        } else {
          this.timer = window.setTimeout(() => this.triggerPhase('movement_door'), 500);
        }
        break;
      case 'movement_door':
        this.daemonSay("Try moving around without falling. Reach the door to continue.", "neutral", 4);
        this.pointTo(new Vector3(0, 0, 4)); // usually positive Z is north
        this.eventBus.emit(GameEvents.TUTORIAL_PHASE_COMPLETED, { phaseId: 'unlock_door' });
        break;
      case 'shop_intro':
        this.clearIndicator();
        this.daemonSay("This is the daemon registry. Pick an upgrade to enhance your shell. You'll definitely need them... trust me, I've seen your skills.", "neutral", 6);
        break;
      case 'combat_aim':
        this.clearIndicator();
        this.daemonSay("Aim with your cursor — that glowing line shows where you're pointing. Line it up, then shoot.", "neutral", 5);
        this.startAimIndicator();
        this.timer = window.setTimeout(() => this.triggerPhase('combat_dummy'), 5000);
        break;
      case 'combat_dummy':
        this.stopAimIndicator();
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0, 0, -2));
        this.pointTo(new Vector3(0, 0, -2));
        break;
      case 'combat_stance':
        this.clearIndicator();
        this.daemonSay("Hold [SHIFT] or your stance button, then attack to unleash your secondary.", "neutral", 6);
        this.spawnEnemy('tutorial_dummy_mobile', new Vector3(0, 0, -2));
        this.pointTo(new Vector3(0, 0, -2));
        break;
      case 'combat_ultimate':
        this.clearIndicator();
        this.daemonSay("Your core is charged. Press [SPACE] to unleash your ultimate.", "neutral", 5);
        this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED);
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0, 0, -1));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(-1, 0, -1.5));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(1, 0, -1.5));
        this.pointTo(new Vector3(0, 0, -1.5));
        break;
      case 'combat_door':
        this.clearIndicator();
        this.daemonSay("Excellent. Proceed to the final area.", "neutral", 3);
        this.pointTo(new Vector3(0, 0, 4));
        this.eventBus.emit(GameEvents.TUTORIAL_PHASE_COMPLETED, { phaseId: 'unlock_door' });
        break;
      case 'playground_mobs':
        this.clearIndicator();
        this.daemonSay("Clear the remaining corrupted processes.", "neutral", 4);
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(-2, 0, -2));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0, 0, -1));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(2, 0, -2));
        break;
      case 'playground_completed':
        this.clearIndicator();
        this.daemonSay("Initialization complete. Returning to host...", "neutral", 4);
        this.timer = window.setTimeout(() => {
          this.eventBus.emit(GameEvents.TUTORIAL_END_REQUESTED);
          this.stopTutorial();
        }, 4000);
        break;
    }
  }

  private pointTo(localOffset: Vector3): void {
    this.clearIndicator();
    if (!this.dependencies?.scene) return;
    
    const center = this.dependencies.getRoomCenter();
    const position = center.add(localOffset);
    
    this.indicatorMesh = MeshBuilder.CreateCylinder("tutorialIndicator", { height: 1.5, diameterTop: 0, diameterBottom: 0.8, tessellation: 4 }, this.dependencies.scene);
    this.indicatorMesh.position = position.add(new Vector3(0, 2, 0));
    this.indicatorMesh.rotation.x = Math.PI; // point downwards
    
    const material = new StandardMaterial("indicatorMat", this.dependencies.scene);
    material.emissiveColor = new Color3(0, 1, 0.8);
    material.alpha = 0.7;
    this.indicatorMesh.material = material;
    
    this.dependencies.scene.onBeforeRenderObservable.add(this.animateIndicator);
  }

  private animateIndicator = () => {
    if (this.indicatorMesh) {
      this.indicatorMesh.rotation.y += 0.05;
      this.indicatorMesh.position.y += Math.sin(Date.now() / 200) * 0.01;
    }
  };

  private clearIndicator(): void {
    if (this.indicatorMesh) {
      if (this.dependencies?.scene) {
        this.dependencies.scene.onBeforeRenderObservable.removeCallback(this.animateIndicator);
      }
      this.indicatorMesh.dispose();
      this.indicatorMesh = null;
    }
  }

  private startAimIndicator(): void {
    this.stopAimIndicator();
    const scene = this.dependencies?.scene;
    if (!scene) return;

    // Build a simple arrow: a thin box as shaft + a cone tip
    this.aimIndicatorRoot = new TransformNode('aimIndicatorRoot', scene);

    const shaft = MeshBuilder.CreateBox('aimShaft', { width: 0.06, height: 0.06, depth: 1.2 }, scene);
    shaft.parent = this.aimIndicatorRoot;
    shaft.position.set(0, 0, 0.6); // extend forward (+Z)

    const tip = MeshBuilder.CreateCylinder('aimTip', { height: 0.4, diameterTop: 0, diameterBottom: 0.18, tessellation: 6 }, scene);
    tip.parent = this.aimIndicatorRoot;
    tip.position.set(0, 0, 1.4);
    tip.rotation.x = Math.PI / 2; // point along +Z

    const mat = new StandardMaterial('aimIndicatorMat', scene);
    mat.emissiveColor = new Color3(1.0, 0.6, 0.1);
    mat.alpha = 0.85;
    mat.disableLighting = true;
    shaft.material = mat;
    tip.material = mat;

    this.aimIndicatorObserver = scene.onBeforeRenderObservable.add(() => {
      const pc = this.dependencies?.playerController;
      const root = this.aimIndicatorRoot;
      if (!pc || !root) return;

      const playerPos = pc.getPosition();
      root.position.set(playerPos.x, 1.15, playerPos.z);

      const aimDir = pc.getAttackDirection();
      if (aimDir && aimDir.lengthSquared() > 0.0001) {
        const angle = Math.atan2(aimDir.x, aimDir.z);
        root.rotation.y = angle;
      }

      // Pulsing opacity
      const pulse = (Math.sin(Date.now() / 200) * 0.15) + 0.85;
      mat.alpha = pulse;
    });
  }

  private stopAimIndicator(): void {
    if (this.aimIndicatorObserver && this.dependencies?.scene) {
      this.dependencies.scene.onBeforeRenderObservable.remove(this.aimIndicatorObserver);
      this.aimIndicatorObserver = null;
    }
    if (this.aimIndicatorRoot) {
      this.aimIndicatorRoot.getChildMeshes().forEach(m => m.dispose());
      this.aimIndicatorRoot.dispose();
      this.aimIndicatorRoot = null;
    }
  }

  private showControlPrompt(): void {
    if (!this.dependencies?.scene) return;
    
    this.promptGui = AdvancedDynamicTexture.CreateFullscreenUI('TutorialPromptUI', true, this.dependencies.scene);
    if (this.promptGui.layer) this.promptGui.layer.layerMask = UI_LAYER;

    const overlay = new Rectangle('promptOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.background = 'rgba(0, 0, 0, 0.8)';
    overlay.thickness = 0;
    this.promptGui.addControl(overlay);

    const bgRect = new Rectangle('promptBg');
    bgRect.width = '600px';
    bgRect.height = '400px';
    bgRect.background = 'rgba(10, 20, 20, 0.9)';
    bgRect.color = '#7CFFEA';
    bgRect.thickness = 2;
    bgRect.cornerRadius = 8;
    overlay.addControl(bgRect);

    const container = new StackPanel('promptContainer');
    container.paddingTop = '20px';
    container.paddingBottom = '20px';
    bgRect.addControl(container);

    const title = new TextBlock('title', 'SELECT CONTROL SCHEME');
    title.height = '40px';
    title.color = '#00FFD1';
    title.fontSize = 24;
    title.fontFamily = 'Consolas';
    container.addControl(title);

    let isAutoAimOn = GameSettingsStore.get().controls.autoAimTowardMovement;
    const toggleBtn = Button.CreateSimpleButton('autoAimToggle', `AUTO-AIM: ${isAutoAimOn ? 'ON' : 'OFF'}`);
    toggleBtn.width = '400px';
    toggleBtn.height = '40px';
    toggleBtn.color = '#FF9900';
    toggleBtn.background = '#331A00';
    toggleBtn.fontFamily = 'Consolas';
    toggleBtn.paddingBottom = '10px';
    toggleBtn.onPointerUpObservable.add(() => {
      isAutoAimOn = !isAutoAimOn;
      GameSettingsStore.updateControls({ autoAimTowardMovement: isAutoAimOn });
      if (toggleBtn.textBlock) {
        toggleBtn.textBlock.text = `AUTO-AIM: ${isAutoAimOn ? 'ON' : 'OFF'}`;
      }
    });
    container.addControl(toggleBtn);

    const makeBtn = (text: string, action: () => void) => {
      const btn = Button.CreateSimpleButton('btn', text);
      btn.width = '400px';
      btn.height = '50px';
      btn.color = '#7CFFEA';
      btn.background = '#1A332C';
      btn.paddingTop = '10px';
      btn.fontFamily = 'Consolas';
      btn.onPointerUpObservable.add(action);
      container.addControl(btn);
    };

    makeBtn('WASD', () => {
      GameSettingsStore.setKeybinding('moveUp', 'w');
      GameSettingsStore.setKeybinding('moveLeft', 'a');
      GameSettingsStore.setKeybinding('moveDown', 's');
      GameSettingsStore.setKeybinding('moveRight', 'd');
      this.promptGui?.dispose();
      this.promptGui = null;
      this.triggerPhase('movement_door');
    });

    makeBtn('ZQSD', () => {
      GameSettingsStore.setKeybinding('moveUp', 'z');
      GameSettingsStore.setKeybinding('moveLeft', 'q');
      GameSettingsStore.setKeybinding('moveDown', 's');
      GameSettingsStore.setKeybinding('moveRight', 'd');
      this.promptGui?.dispose();
      this.promptGui = null;
      this.triggerPhase('movement_door');
    });

    makeBtn('ARROWS', () => {
      GameSettingsStore.setKeybinding('moveUp', 'arrowup');
      GameSettingsStore.setKeybinding('moveLeft', 'arrowleft');
      GameSettingsStore.setKeybinding('moveDown', 'arrowdown');
      GameSettingsStore.setKeybinding('moveRight', 'arrowright');
      this.promptGui?.dispose();
      this.promptGui = null;
      this.triggerPhase('movement_door');
    });
  }

  private spawnEnemy(typeId: string, localOffset: Vector3): void {
    this.enemiesAlive++;
    const center = this.dependencies?.getRoomCenter() ?? new Vector3(0, 0, 0);
    const position = center.add(localOffset);
    this.eventBus.emit(GameEvents.ENEMY_SPAWN_REQUESTED, { typeId, position });
  }

  private daemonSay(message: string, emotion: string, duration: number): void {
    if (this.dependencies?.hudManager) {
      this.dependencies.hudManager.showDaemonMessage(message, emotion, { holdDuration: duration, canCrash: false, canGlitchFrames: false });
    }
  }

  private handleEnemyDied(): void {
    if (!this.isActive) return;
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);

    if (this.enemiesAlive === 0) {
      if (this.currentPhase === 'combat_dummy') {
        this.timer = window.setTimeout(() => this.triggerPhase('combat_stance'), 1000);
      } else if (this.currentPhase === 'combat_stance') {
        this.timer = window.setTimeout(() => this.triggerPhase('combat_ultimate'), 1000);
      } else if (this.currentPhase === 'combat_ultimate') {
        this.timer = window.setTimeout(() => this.triggerPhase('combat_door'), 1500);
      } else if (this.currentPhase === 'playground_mobs') {
        this.timer = window.setTimeout(() => this.triggerPhase('playground_completed'), 1000);
      }
    }
  }

  private handleRoomEntered(): void {
    if (!this.isActive || !this.dependencies) return;
    
    const roomIndex = this.dependencies.getRoomIndex();
    if (this.forcedRoomIndex === roomIndex) return; // Prevent double trigger
    this.forcedRoomIndex = roomIndex;

    if (roomIndex === 0) {
      this.timer = window.setTimeout(() => this.triggerPhase('movement_prompt'), 1000);
    } else if (roomIndex === 1) {
      this.timer = window.setTimeout(() => this.triggerPhase('combat_aim'), 1000);
    } else if (roomIndex === 2) {
      this.timer = window.setTimeout(() => this.triggerPhase('playground_mobs'), 1000);
    }
  }

  private handleAttackPerformed(data: any): void {
    if (!this.isActive) return;
    if (this.currentPhase === 'combat_stance') {
      if (data?.type === 'mage_stance_explosion') {
        this.phaseState.dashed = true;
      }
    }
  }
}
