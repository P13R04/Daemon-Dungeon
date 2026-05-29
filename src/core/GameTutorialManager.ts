import { Vector3, Scene, MeshBuilder, StandardMaterial, Color3, TransformNode, Mesh, Observer, Nullable } from '@babylonjs/core';
import { EventBus, GameEvents } from './EventBus';
import { GameStartRequestedPayload } from './GameEventBindings';
import { HUDManager } from '../systems/HUDManager';
import { GameSettingsStore, KeybindingAction } from '../settings/GameSettings';
import { AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control } from '@babylonjs/gui';
import { UI_LAYER } from '../ui/uiLayers';
import { PlayerController } from '../gameplay/PlayerController';
import { EnemyController } from '../gameplay/EnemyController';

export type TutorialPhase =
  | 'init'
  | 'mage_replay_intro'
  | 'mage_replay_complete'
  | 'intro_briefing'
  | 'movement_prompt'
  | 'movement_door'
  | 'shop_intro'
  | 'shop_buy'
  | 'shop_door'
  | 'combat_attack_intro'
  | 'combat_aim'
  | 'combat_dummy'
  | 'combat_stance'
  | 'combat_ultimate'
  | 'combat_door'
  | 'playground_mobs'
  | 'playground_completed'
  | 'class_intro'
  | 'class_primary_wave'
  | 'class_stance_wave'
  | 'class_dash_wave'
  | 'class_ultimate_wave'
  | 'class_exit_door';

export interface TutorialDependencies {
  getRoomCenter: () => Vector3;
  getRoomIndex: () => number;
  getPlayerSpawnPoint?: () => Vector3 | null;
  getDoorPosition?: () => Vector3 | null;
  mapPointToWorld?: (x: number, z: number, yHeight?: number) => Vector3 | null;
  getActiveEnemyCount?: () => number;
  revealTutorialFreeChoice?: () => void;
  setTutorialPopupAudioMuffle?: (enabled: boolean) => void;
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
  private indicatorMeshes: Mesh[] = [];
  private indicatorBasePositions: Vector3[] = [];
  private indicatorPathWorld: Vector3[] | null = null;
  private indicatorPathSegmentIndex: number = 0;
  private indicatorPathProgress: number = 0;
  private readonly indicatorPathSpeed: number = 7.5;
  private indicatorPathLoop: boolean = true;
  private indicatorPathStickToDoorOnEnd: boolean = false;
  private indicatorPathCompleted: boolean = false;
  private indicatorGroundMarker: Mesh | null = null;
  private indicatorGroundMarkerEnabled: boolean = false;
  private aimIndicatorRoot: TransformNode | null = null;
  private aimIndicatorObserver: Nullable<Observer<Scene>> | null = null;
  private promptKeyCaptureCleanup: (() => void) | null = null;
  private tutorialAttackAutoAimEnabled: boolean = false;
  private tutorialPaidRareFailedThisShop: boolean = false;
  private firstShopPaidScriptQueued: boolean = false;
  private tutorialStanceDamageWindowUntil: number = 0;
  private tutorialUltimateDamageWindowUntil: number = 0;
  private movementChoicePopupCompleted: boolean = false;
  private tutorialVoidFallCount: number = 0;
  private tutorialVoidTauntsSilenced: boolean = false;
  private tutorialHazardTauntCooldown = 0;
  private room2HazardTauntsPlayed: Set<string> = new Set();
  private pendingEnemyClearCheckTimer: number | null = null;
  private pendingDoorExitCheckTimer: number | null = null;
  private isReplayTutorial = false;

  private buildRepeatedEmotionFrames(baseEmotion: string, loops: number): string[] {
    const safeLoops = Math.max(1, Math.floor(loops));
    const frames = [`${baseEmotion}_01.png`, `${baseEmotion}_02.png`, `${baseEmotion}_03.png`, `${baseEmotion}_04.png`];
    const sequence: string[] = [];
    for (let i = 0; i < safeLoops; i += 1) {
      sequence.push(...frames);
    }
    return sequence;
  }

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_START_REQUESTED, (payload: GameStartRequestedPayload) => {
      this.startTutorial(payload.classId || 'mage');
    }));

    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_ENTERED, () => this.handleRoomEntered()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DIED, () => this.handleEnemyDied()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ATTACK_PERFORMED, (data: any) => this.handleAttackPerformed(data)));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_DAMAGED, () => this.handlePlayerDamaged()));
    
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_SHOP_OPENED, () => {
      if (this.isActive) this.triggerPhase('shop_intro');
    }));
    
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_SHOP_INTERACTED, (data: any) => {
      if (!this.isActive) return;
      if (data.type === 'paid_rare') {
        this.tutorialPaidRareFailedThisShop = true;
        const roomIndex = this.dependencies?.getRoomIndex?.() ?? -1;
        if (roomIndex < 1 && this.firstShopPaidScriptQueued) {
          return;
        }
        const failLine = roomIndex >= 1
          ? "You're still too poor, but nice try."
          : "Just kidding, it's too expensive for you.";
        this.daemonSay(failLine, roomIndex >= 1 ? "rire" : "rire", 3);
        if (roomIndex < 1) {
          this.firstShopPaidScriptQueued = true;
          this.deferUntilDaemonFinished(() => {
            if (!this.isActive) return;
            this.daemonSay("Take this free one instead.", "bored", 4);
            this.timer = window.setTimeout(() => {
              if (!this.isActive) return;
              this.dependencies?.revealTutorialFreeChoice?.();
            }, 120);
          }, 0);
        }
      } else if (data.type === 'full_heal') {
        this.daemonSay("Full repair protocols require credits you do not have.", "bored", 4);
      } else if (data.type === 'reroll') {
        this.daemonSay("Rerolling the registry costs credits. Pick the free upgrade instead.", "bored", 4);
      }
    }));

    this.unsubscribers.push(this.eventBus.on(GameEvents.BONUS_SELECTED, () => {
      if (!this.isActive) return;
      if (!this.tutorialPaidRareFailedThisShop) return;
      const roomIndex = this.dependencies?.getRoomIndex?.() ?? -1;
      if (roomIndex < 1) return;
      this.tutorialPaidRareFailedThisShop = false;
      this.daemonSay("I would have picked the other one, personally.", "superieur", 3.6);
    }));

    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_DIED, (data: any) => {
      if (!this.isActive) return;
      if (data?.reason === 'void_fall') {
        this.handleTutorialVoidFall();
        return;
      }
      const roomIndex = this.dependencies?.getRoomIndex?.() ?? -1;
      if (roomIndex === 1) {
        this.daemonSay("You died in the training room. That's almost impressive.", "rire", 3.4);
      }
    }));

    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_HAZARD_DAMAGED, (data: any) => {
      if (!this.isActive) return;
      const roomIndex = this.dependencies?.getRoomIndex?.() ?? -1;
      if (roomIndex !== 1 && this.tutorialHazardTauntCooldown > 0) return;
      const hazardType = typeof data?.hazardType === 'string' ? data.hazardType.toLowerCase() : '';
      if (hazardType === 'spikes') {
        if (roomIndex === 1 && this.room2HazardTauntsPlayed.has('spikes')) return;
        this.daemonSay("Those spikes are not decorative, you know.", "superieur", 2.8);
        if (roomIndex === 1) {
          this.room2HazardTauntsPlayed.add('spikes');
        }
        this.tutorialHazardTauntCooldown = 1.3;
      } else if (hazardType === 'poison') {
        if (roomIndex === 1 && this.room2HazardTauntsPlayed.has('poison')) return;
        this.daemonSay("Standing in poison on purpose? Bold.", "superieur", 2.8);
        if (roomIndex === 1) {
          this.room2HazardTauntsPlayed.add('poison');
        }
        this.tutorialHazardTauntCooldown = 1.3;
      }
    }));
  }

  public initialize(dependencies?: TutorialDependencies): void {
    if (dependencies) {
      this.dependencies = dependencies;
      if (this.isActive && !this.movementChoicePopupCompleted) {
        this.dependencies.playerController?.setInputSuppressed(true);
        this.dependencies.playerController?.setMovementLocked(true);
      }
    }
  }

  public dispose(): void {
    this.stopTutorial();
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }

  public startTutorial(classId: 'mage' | 'firewall' | 'rogue' | 'cat', options?: { replay?: boolean }): void {
    if (this.isActive) return;
    this.isActive = true;
    this.classId = classId;
    this.isReplayTutorial = !!options?.replay;
    this.currentPhase = 'init';
    this.enemiesAlive = 0;
    this.phaseState = {};
    this.introTriggered = false;
    this.forcedRoomIndex = -1;
    this.tutorialStanceDamageWindowUntil = 0;
    this.tutorialUltimateDamageWindowUntil = 0;
    this.movementChoicePopupCompleted = false;
    this.tutorialVoidFallCount = 0;
    this.tutorialVoidTauntsSilenced = false;
    this.tutorialHazardTauntCooldown = 0;
    this.room2HazardTauntsPlayed.clear();
    this.dependencies?.playerController?.setInputSuppressed(true);
    this.dependencies?.playerController?.setMovementLocked(true);
    EnemyController.setTutorialDamageGate((enemy) => this.shouldAllowTutorialDamage(enemy));
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
    if (this.pendingEnemyClearCheckTimer !== null) {
      clearTimeout(this.pendingEnemyClearCheckTimer);
      this.pendingEnemyClearCheckTimer = null;
    }
    if (this.pendingDoorExitCheckTimer !== null) {
      clearTimeout(this.pendingDoorExitCheckTimer);
      this.pendingDoorExitCheckTimer = null;
    }

    if (this.promptGui) {
      this.disposePromptGui();
    }
    
    this.clearIndicator();
    this.stopAimIndicator();
    this.dependencies?.playerController?.setInputSuppressed(false);
    this.dependencies?.playerController?.setMovementLocked(false);
    this.dependencies?.setTutorialPopupAudioMuffle?.(false);
    EnemyController.setTutorialDamageGate(null);
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
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    switch (phase) {
      case 'mage_replay_intro':
        this.dependencies?.playerController?.setMovementLocked(true);
        this.dependencies?.playerController?.setInputSuppressed(true);
        this.daemonSay("Mage shell restored for a refresher. You still need the basics before real pressure.", "superieur", 3.8);
        this.deferUntilDaemonFinished(() => {
          if (!this.isActive || this.currentPhase !== 'mage_replay_intro') return;
          this.daemonSay("You were once an admin caster. I revoked your privileges. Earn competence back.", "bored", 3.8);
          this.deferUntilDaemonFinished(() => {
            if (!this.isActive || this.currentPhase !== 'mage_replay_intro') return;
            this.dependencies?.playerController?.setMovementLocked(false);
            this.dependencies?.playerController?.setInputSuppressed(false);
            this.triggerPhase('combat_attack_intro');
          }, 120);
        }, 140);
        break;
      case 'intro_briefing':
        this.dependencies?.playerController?.setInputSuppressed(true);
        this.dependencies?.playerController?.setMovementLocked(true);
        this.daemonSay("Welcome, prisoner. Panicking is pointless. There is no escape.", "superieur", 4.2);
        this.deferUntilDaemonFinished(() => {
          if (!this.isActive || this.currentPhase !== 'intro_briefing') return;
          this.daemonSay("I am bored, so I will test you. We start with the basics, given your lack of skill.", "bored", 5.2);
          this.deferUntilDaemonFinished(() => {
            if (!this.isActive || this.currentPhase !== 'intro_briefing') return;
            this.triggerPhase('movement_prompt');
          }, 240);
        }, 180);
        break;
      case 'movement_prompt':
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) {
          this.dependencies?.playerController?.setInputSuppressed(true);
          this.dependencies?.playerController?.setMovementLocked(true);
          this.showControlPrompt();
        } else {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.timer = window.setTimeout(() => this.triggerPhase('movement_door'), 500);
        }
        break;
      case 'movement_door':
        this.movementChoicePopupCompleted = true;
        this.dependencies?.playerController?.setMovementLocked(false);
        this.dependencies?.playerController?.setInputSuppressed(false);
        this.daemonSay("Try moving around without falling. Reach the door to continue.", "happy", 4);
        // Single moving arrow following editor map coordinates.
        // Player spawn is around (7,13): start slightly forward on Z.
        this.pointToMovingPathMap([
          { x: 7, z: 12.6 },
          { x: 7, z: 10 },
          { x: 4, z: 10 },
          { x: 4, z: 4 },
          { x: 7, z: 4 },
          { x: 7, z: 0.5 },
        ], { loop: false, stickToDoorOnEnd: true, groundMarker: true });
        this.eventBus.emit(GameEvents.TUTORIAL_PHASE_COMPLETED, { phaseId: 'unlock_door' });
        break;
      case 'shop_intro':
        this.clearIndicator();
        this.tutorialPaidRareFailedThisShop = false;
        this.firstShopPaidScriptQueued = false;
        this.daemonSay("Between each room you can choose between bonuses, take this one.", "goofy", 5);
        break;
      case 'combat_attack_intro':
        this.clearIndicator();
        if (this.classId === 'mage' && this.isReplayTutorial) {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.daemonSay(
            this.isMobileTutorialMode()
              ? "Start with your basic attack: use the ATTACK button to cast bolts."
              : `Start with your basic attack: left click or ${GameSettingsStore.get().controls.keybindings.shoot === 'q' ? 'Q' : 'your attack button'} to cast bolts.`,
            "happy",
            3.8
          );
          this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('combat_aim')), 140);
        } else if (this.isMobileTutorialMode()) {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.daemonSay("Basic attack loaded. Press ATTACK. Auto-aim locks the nearest enemy.", "happy", 3.8);
          this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('combat_aim')), 140);
        } else {
          this.dependencies?.playerController?.setInputSuppressed(true);
          this.showAttackIntroPopup();
        }
        break;
      case 'combat_aim':
        this.clearIndicator();
        if (this.tutorialAttackAutoAimEnabled) {
          this.daemonSay("I knew you were weak, but relying on assistance this early is still disappointing.", "enerve", 5);
        } else {
          this.daemonSay("Aim with your cursor — that glowing line shows where you're pointing. Line it up, then shoot.", "happy", 5);
        }
        this.startAimIndicator();
        this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('combat_dummy')), 5000);
        break;
      case 'combat_dummy':
        this.stopAimIndicator();
        this.spawnEnemyAtMap('tutorial_dummy_basic', 7, 6.5);
        this.pointToMap(7, 6.5);
        break;
      case 'combat_stance':
        this.clearIndicator();
        if (this.classId === 'mage' && this.isReplayTutorial) {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.daemonSay(
            this.isMobileTutorialMode()
              ? "Now stance: hold STANCE to slow threats, then hit ATTACK for a burst."
              : "Now stance: hold it to slow threats, then attack to trigger a burst.",
            "happy",
            4.6
          );
          this.spawnEnemyAtMap('tutorial_dummy_mobile', 7, 6.5);
          this.pointToMap(7, 6.5);
        } else if (this.isMobileTutorialMode()) {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.daemonSay("Toggle STANCE on and off with the STANCE button. While stance is active, press ATTACK to trigger your secondary if you have enough resource.", "happy", 6.0);
          this.spawnEnemyAtMap('tutorial_dummy_mobile', 7, 6.5);
          this.pointToMap(7, 6.5);
        } else {
          this.dependencies?.playerController?.setInputSuppressed(true);
          this.showInfoPopupWithRemap({
            title: 'SECONDARY STANCE',
            action: 'posture',
            description: [
              'Stance is a secondary posture you can hold with its key.',
              'It drains resources and cannot be held forever.',
              'Attack while in stance to release a powerful secondary burst.',
              'Each class has a different stance behavior.',
            ],
            onConfirm: () => {
              this.dependencies?.playerController?.setInputSuppressed(false);
              this.daemonSay("Hold right click or your stance button to slow it down, then blow it up with your attack button.", "happy", 6);
              this.spawnEnemyAtMap('tutorial_dummy_mobile', 7, 6.5);
              this.pointToMap(7, 6.5);
            },
          });
        }
        break;
      case 'combat_ultimate':
        this.clearIndicator();
        if (this.classId === 'mage' && this.isReplayTutorial) {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.daemonSay(
            this.isMobileTutorialMode()
              ? "Ultimate ready: tap ULT to place a fixed massive damage zone."
              : "Ultimate ready: place a fixed zone of massive damage and melt the group.",
            "happy",
            4.8
          );
          this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED);
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7, 6.5);
          this.spawnEnemyAtMap('tutorial_dummy_basic', 6.2, 6.1);
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7.8, 6.1);
          this.pointToMap(7, 6.3);
        } else if (this.isMobileTutorialMode()) {
          this.dependencies?.playerController?.setInputSuppressed(false);
          this.daemonSay("Your core is charged. Tap ULT and wipe the group.", "happy", 3.8);
          this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED);
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7, 6.5);
          this.spawnEnemyAtMap('tutorial_dummy_basic', 6.2, 6.1);
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7.8, 6.1);
          this.pointToMap(7, 6.3);
        } else {
          this.dependencies?.playerController?.setInputSuppressed(true);
          this.showInfoPopupWithRemap({
            title: 'ULTIMATE ABILITY',
            action: 'ultimate',
            description: [
              'Ultimate takes time to charge but is devastating when ready.',
              'Every class has a unique ultimate.',
              'Use it to break dangerous combat situations.',
            ],
            onConfirm: () => {
              this.dependencies?.playerController?.setInputSuppressed(false);
              this.daemonSay("Your core is charged. Unleash your ultimate to erase the group.", "happy", 5);
              this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED);
              this.spawnEnemyAtMap('tutorial_dummy_basic', 7, 6.5);
              this.spawnEnemyAtMap('tutorial_dummy_basic', 6.2, 6.1);
              this.spawnEnemyAtMap('tutorial_dummy_basic', 7.8, 6.1);
              this.pointToMap(7, 6.3);
            },
          });
        }
        break;
      case 'combat_door':
        this.clearIndicator();
        this.daemonSay("WOW that's a lot of damage, I guess you can advance.", "choque", 3.2);
        this.pointToDoor();
        this.eventBus.emit(GameEvents.TUTORIAL_PHASE_COMPLETED, { phaseId: 'unlock_door' });
        break;
      case 'playground_mobs':
        this.clearIndicator();
        this.daemonSay("This is your playground now. Enjoy while it's easy.", "happy", 4.2);
        // Final tutorial room now owns spawn points directly in room JSON.
        this.phaseState.playgroundArmed = true;
        this.enemiesAlive = Math.max(0, this.dependencies?.getActiveEnemyCount?.() ?? 0);
        if (this.enemiesAlive <= 0) {
          this.timer = window.setTimeout(() => {
            if (!this.isActive || this.currentPhase !== 'playground_mobs') return;
            this.enemiesAlive = Math.max(0, this.dependencies?.getActiveEnemyCount?.() ?? 0);
            if (this.enemiesAlive <= 0) {
              this.daemonSay("No threats detected yet. Waiting for host injection...", "bored", 2);
            }
          }, 500);
        }
        break;
      case 'playground_completed':
        this.clearIndicator();
        this.daemonSay(
          "You know the basics now, Be prepared for the next time we encounter, bye.",
          "superieur",
          5.2,
          {
            sequence: [
              'superieur_01.png', 'superieur_02.png', 'superieur_03.png', 'superieur_04.png',
              'init_01.png', 'init_02.png', 'init_03.png', 'init_04.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
              'loading_01.png', 'loading_02.png',
            ],
            frameInterval: 0.14,
          },
        );
        this.deferUntilDaemonFinished(() => {
          if (!this.isActive || this.currentPhase !== 'playground_completed') return;
          this.eventBus.emit(GameEvents.TUTORIAL_END_REQUESTED);
          this.stopTutorial();
        }, 0);
        break;
      case 'class_intro':
        this.dependencies?.playerController?.setMovementLocked(true);
        this.dependencies?.playerController?.setInputSuppressed(true);
        if (this.classId === 'firewall') {
          if (this.isReplayTutorial) {
            this.daemonSay("Firewall shell reloaded. Quick refresher before you face live threats again.", "superieur", 3.6);
          } else {
            this.daemonSay("Firewall online. Quick drill first. You need the basics before the real run.", "superieur", 3.8);
          }
          this.deferUntilDaemonFinished(() => {
            if (this.isReplayTutorial) {
              this.daemonSay("Still the same heavy brute: slow feet, huge control. Keep it clean.", "bored", 3.4);
            } else {
              this.daemonSay("You're a slow brute with heavy area control. Crude, loud, effective enough.", "bored", 3.8);
            }
            this.deferUntilDaemonFinished(() => this.triggerPhase('class_primary_wave'), 160);
          }, 140);
        } else {
          if (this.isReplayTutorial) {
            this.daemonSay("Rogue shell reloaded. Quick refresher before you slip back into live combat.", "rire", 3.6);
          } else {
            this.daemonSay("Rogue online. Quick drill first. You need the basics before the real run.", "rire", 3.8);
          }
          this.deferUntilDaemonFinished(() => {
            if (this.isReplayTutorial) {
              this.daemonSay("You're still that outdated glitch. Move smart, strike first, vanish faster.", "superieur", 3.4);
            } else {
              this.daemonSay("You are the obsolete glitch that got replaced. Stay sharp, or get deleted quietly.", "superieur", 3.8);
            }
            this.deferUntilDaemonFinished(() => this.triggerPhase('class_primary_wave'), 160);
          }, 140);
        }
        break;
      case 'class_primary_wave':
        this.dependencies?.playerController?.setMovementLocked(false);
        this.dependencies?.playerController?.setInputSuppressed(false);
        this.clearIndicator();
        if (this.classId === 'firewall') {
          this.spawnEnemyAtMap('tutorial_dummy_basic', 6.4, 6.3, { hpMultiplier: 2.2 });
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7.0, 6.0, { hpMultiplier: 2.2 });
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7.6, 6.3, { hpMultiplier: 2.2 });
          this.daemonSay("Start with your basic attack: a wide cone swing. Clip multiple targets each hit.", "bored", 3.8);
          this.pointToMap(7, 6.2);
        } else {
          this.spawnEnemyAtMap('tutorial_dummy_basic', 7.0, 6.1);
          this.daemonSay("Start with your basic attack: fast dagger strikes. Short range, high tempo.", "happy", 3.4);
          this.pointToMap(7, 6.1);
        }
        break;
      case 'class_stance_wave':
        this.clearIndicator();
        this.phaseState.playerDamagedTauntDone = false;
        if (this.classId === 'firewall') {
          const btnTxt = this.isMobileTutorialMode() ? 'the STANCE button' : 'RIGHT CLICK or your STANCE key';
          this.daemonSay(`Now stance. Hold ${btnTxt} to shield, deflect a shot, and bounce it back to the turret.`, "superieur", 5.2);
          this.deferUntilDaemonFinished(() => {
            if (!this.isActive || this.currentPhase !== 'class_stance_wave') return;
            this.spawnEnemyAtMap('tutorial_turret', 7.0, 3.8, { hpMultiplier: 0.1 });
            this.pointToMap(7.0, 3.8);
          }, 80);
        } else {
          this.spawnEnemyAtMap('tutorial_dummy_mobile', 7.0, 6.2);
          const btnTxt = this.isMobileTutorialMode() ? 'STANCE button' : 'RIGHT CLICK or your STANCE key';
          this.daemonSay(`Hold ${btnTxt} to turn invisible. Stay outside detection range and the patroller loses you.`, "happy", 5.0);
          this.pointToMap(7.0, 6.2);
          const watchStealth = () => {
            if (!this.isActive || this.currentPhase !== 'class_stance_wave') return;
            if (this.dependencies?.playerController?.isSecondaryActive()) {
              this.phaseState.rogueStealthActivated = true;
              this.deferUntilDaemonFinished(() => this.triggerPhase('class_dash_wave'), 180);
              return;
            }
            this.timer = window.setTimeout(watchStealth, 120);
          };
          this.timer = window.setTimeout(watchStealth, 120);
        }
        break;
      case 'class_dash_wave':
        this.clearIndicator();
        if (this.classId === 'firewall') {
          this.spawnEnemyAtMap('tutorial_dummy_mobile', 7.0, 6.2, { hpMultiplier: 3.0 });
          this.daemonSay(
            this.isMobileTutorialMode()
              ? "Shield bash: aim with your right thumb, dash in, and shove the target off its line."
              : "Shield bash: aim with cursor, dash in, and shove the target off its line.",
            "goofy",
            4.0
          );
          this.pointToMap(7.0, 6.2);
        } else {
          this.daemonSay("Now dash. Break stealth with a fast in-and-out sneak attack.", "superieur", 3.8);
          this.pointToMap(7.0, 6.2);
        }
        // Robust progression for the first rogue tutorial run:
        // if the patroller was already killed just before this phase,
        // we still advance to the ultimate wave instead of getting stuck.
        this.scheduleEnemyClearCheck(6);
        break;
      case 'class_ultimate_wave':
        this.clearIndicator();
        this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED);
        this.spawnEnemyAtMap('tutorial_dummy_basic', 7.0, 6.0, { hpMultiplier: 4 });
        this.spawnEnemyAtMap('tutorial_dummy_basic', 7.0, 5.2, { hpMultiplier: 4 });
        this.spawnEnemyAtMap('tutorial_dummy_basic', 7.8, 5.6, { hpMultiplier: 4 });
        this.spawnEnemyAtMap('tutorial_dummy_basic', 7.8, 6.4, { hpMultiplier: 4 });
        this.spawnEnemyAtMap('tutorial_dummy_basic', 6.2, 6.4, { hpMultiplier: 4 });
        this.spawnEnemyAtMap('tutorial_dummy_basic', 6.2, 5.6, { hpMultiplier: 4 });
        if (this.classId === 'firewall') {
          this.daemonSay("Ultimate ready: a heavy vortex. Pull the pack and grind them down.", "rire", 4.0);
        } else {
          this.daemonSay("Ultimate ready: mark a zone and chain teleport-attacks inside it.", "superieur", 4.0);
        }
        if (this.isMobileTutorialMode()) {
          this.daemonSay("Use the ULT button when you're ready.", "happy", 2.8);
        }
        this.pointToMap(7.0, 6.0);
        break;
      case 'class_exit_door':
        this.clearIndicator();
        this.dependencies?.playerController?.setInputSuppressed(true);
        if (this.isReplayTutorial) {
          this.daemonSay("Refresher complete. Try doing that against real threats.", "happy", 3.6);
        } else {
          this.daemonSay("Tutorial complete. Uploading you into a real run. Try not to embarrass yourself.", "happy", 4.4);
        }
        this.deferUntilDaemonFinished(() => {
          if (!this.isActive || this.currentPhase !== 'class_exit_door') return;
          this.eventBus.emit(GameEvents.TUTORIAL_END_REQUESTED);
        }, 120);
        break;
      case 'mage_replay_complete':
        this.clearIndicator();
        this.dependencies?.playerController?.setInputSuppressed(true);
        this.daemonSay("Refresher complete. Try doing that with live hostiles.", "happy", 3.6);
        this.deferUntilDaemonFinished(() => {
          if (!this.isActive || this.currentPhase !== 'mage_replay_complete') return;
          this.eventBus.emit(GameEvents.TUTORIAL_END_REQUESTED);
        }, 120);
        break;
    }
  }

  private pointTo(localOffset: Vector3): void {
    this.pointToPath([localOffset]);
  }

  private getMapAnchorWorld(): Vector3 {
    const spawn = this.dependencies?.getPlayerSpawnPoint?.();
    if (spawn) return spawn.clone();
    return this.dependencies?.getRoomCenter?.() ?? Vector3.Zero();
  }

  private mapToWorld(x: number, z: number): Vector3 {
    const mapped = this.dependencies?.mapPointToWorld?.(x, z, 0.5);
    if (mapped) return mapped;

    const anchor = this.getMapAnchorWorld();
    return new Vector3(anchor.x + (x - 7), anchor.y, anchor.z - (z - 13));
  }

  private pointToMap(x: number, z: number): void {
    const world = this.mapToWorld(x, z);
    const center = this.dependencies?.getRoomCenter?.() ?? Vector3.Zero();
    this.pointTo(new Vector3(world.x - center.x, 0, world.z - center.z));
  }

  private pointToMovingPathMap(points: Array<{ x: number; z: number }>, options?: { loop?: boolean; stickToDoorOnEnd?: boolean; groundMarker?: boolean }): void {
    const center = this.dependencies?.getRoomCenter?.() ?? Vector3.Zero();
    const offsets = points.map((p) => {
      const w = this.mapToWorld(p.x, p.z);
      return new Vector3(w.x - center.x, 0, w.z - center.z);
    });
    this.pointToMovingPath(offsets, options);
  }

  private pointToPath(localOffsets: Vector3[]): void {
    this.clearIndicator();
    if (!this.dependencies?.scene) return;

    const center = this.dependencies.getRoomCenter();
    for (const offset of localOffsets) {
      const position = center.add(offset);
      const indicator = MeshBuilder.CreateCylinder("tutorialIndicator", { height: 1.33, diameterTop: 0, diameterBottom: 0.63, tessellation: 4 }, this.dependencies.scene);
      indicator.position = position.add(new Vector3(0, 3.1, 0));
      indicator.rotation.x = Math.PI; // point downwards

      const material = new StandardMaterial("indicatorMat", this.dependencies.scene);
      material.emissiveColor = new Color3(0, 1, 0.8);
      material.alpha = 0.78;
      indicator.material = material;
      this.indicatorMeshes.push(indicator);
      this.indicatorBasePositions.push(indicator.position.clone());
    }

    this.dependencies.scene.onBeforeRenderObservable.add(this.animateIndicator);
  }

  private pointToMovingPath(localOffsets: Vector3[], options?: { loop?: boolean; stickToDoorOnEnd?: boolean; groundMarker?: boolean }): void {
    this.clearIndicator();
    if (!this.dependencies?.scene || localOffsets.length === 0) return;
    const center = this.dependencies.getRoomCenter();
    const worldPath = localOffsets.map((offset) => center.add(offset));
    this.indicatorPathWorld = worldPath;
    this.indicatorPathSegmentIndex = 0;
    this.indicatorPathProgress = 0;
    this.indicatorPathLoop = options?.loop ?? true;
    this.indicatorPathStickToDoorOnEnd = options?.stickToDoorOnEnd ?? false;
    this.indicatorPathCompleted = false;
    this.indicatorGroundMarkerEnabled = options?.groundMarker ?? false;

    const startPos = worldPath[0];
    const indicator = MeshBuilder.CreateCylinder("tutorialIndicator", { height: 1.33, diameterTop: 0, diameterBottom: 0.63, tessellation: 4 }, this.dependencies.scene);
    indicator.position = startPos.add(new Vector3(0, 3.1, 0));
    indicator.rotation.x = Math.PI;
    const material = new StandardMaterial("indicatorMat", this.dependencies.scene);
    material.emissiveColor = new Color3(0, 1, 0.8);
    material.alpha = 0.78;
    indicator.material = material;
    this.indicatorMeshes.push(indicator);
    this.indicatorBasePositions.push(indicator.position.clone());

    if (this.indicatorGroundMarkerEnabled) {
      const marker = MeshBuilder.CreateDisc('tutorialIndicatorGround', { radius: 0.42, tessellation: 20 }, this.dependencies.scene);
      marker.rotation.x = Math.PI / 2;
      marker.position = new Vector3(startPos.x, 0.03, startPos.z);
      const markerMat = new StandardMaterial('indicatorGroundMat', this.dependencies.scene);
      markerMat.emissiveColor = new Color3(0.1, 0.85, 0.75);
      markerMat.alpha = 0.42;
      markerMat.disableLighting = true;
      marker.material = markerMat;
      this.indicatorGroundMarker = marker;
    }
    this.dependencies.scene.onBeforeRenderObservable.add(this.animateIndicator);
  }

  private pointToDoor(): void {
    const doorPos = this.dependencies?.getDoorPosition?.();
    if (doorPos) {
      this.clearIndicator();
      const indicator = MeshBuilder.CreateCylinder("tutorialIndicator", { height: 1.33, diameterTop: 0, diameterBottom: 0.63, tessellation: 4 }, this.dependencies!.scene);
      indicator.position = doorPos.add(new Vector3(0, 3.2, 0));
      indicator.rotation.x = Math.PI;
      const material = new StandardMaterial("indicatorMat", this.dependencies!.scene);
      material.emissiveColor = new Color3(0, 1, 0.8);
      material.alpha = 0.8;
      indicator.material = material;
      this.indicatorMeshes.push(indicator);
      this.indicatorBasePositions.push(indicator.position.clone());
      this.dependencies!.scene.onBeforeRenderObservable.add(this.animateIndicator);
      return;
    }
    this.pointTo(new Vector3(0, 0, 4));
  }

  private animateIndicator = () => {
    if (this.indicatorMeshes.length > 0) {
      const t = Date.now() / 260;
      if (this.indicatorPathWorld && this.indicatorPathWorld.length >= 2 && this.indicatorMeshes.length === 1) {
        const indicator = this.indicatorMeshes[0];
        if (this.indicatorPathCompleted) {
          const doorPos = this.indicatorPathStickToDoorOnEnd ? this.dependencies?.getDoorPosition?.() : null;
          const anchor = doorPos ?? this.indicatorPathWorld[this.indicatorPathWorld.length - 1];
          indicator.position.x = anchor.x;
          indicator.position.z = anchor.z;
          indicator.position.y = (doorPos ? 3.2 : 3.1) + Math.sin(t) * 0.08;
          if (this.indicatorGroundMarker) {
            this.indicatorGroundMarker.position.x = anchor.x;
            this.indicatorGroundMarker.position.z = anchor.z;
          }
          indicator.rotation.y += 0.045;
          return;
        }
        const dt = Math.max(0.001, this.dependencies?.scene?.getEngine().getDeltaTime?.() ?? 16.7) / 1000;
        let segIndex = this.indicatorPathSegmentIndex;
        let segProgress = this.indicatorPathProgress;
        let remaining = this.indicatorPathSpeed * dt;
        while (remaining > 0 && this.indicatorPathWorld.length >= 2) {
          const nextIndex = segIndex + 1;
          if (nextIndex >= this.indicatorPathWorld.length) {
            if (this.indicatorPathLoop) {
              segIndex = 0;
              segProgress = 0;
              continue;
            }
            this.indicatorPathCompleted = true;
            segProgress = 1;
            remaining = 0;
            break;
          }
          const a = this.indicatorPathWorld[segIndex];
          const b = this.indicatorPathWorld[nextIndex];
          const seg = b.subtract(a);
          const len = Math.max(0.0001, seg.length());
          const distLeft = (1 - segProgress) * len;
          if (remaining >= distLeft) {
            remaining -= distLeft;
            segIndex = nextIndex;
            segProgress = 0;
            if (!this.indicatorPathLoop && segIndex >= this.indicatorPathWorld.length - 1) {
              this.indicatorPathCompleted = true;
              remaining = 0;
              break;
            }
          } else {
            segProgress += remaining / len;
            remaining = 0;
          }
        }
        this.indicatorPathSegmentIndex = segIndex;
        this.indicatorPathProgress = segProgress;
        const from = this.indicatorPathWorld[segIndex];
        const to = this.indicatorPathWorld[Math.min(segIndex + 1, this.indicatorPathWorld.length - 1)];
        const interp = from.add(to.subtract(from).scale(segProgress));
        indicator.position.x = interp.x;
        indicator.position.z = interp.z;
        indicator.position.y = 3.1 + Math.sin(t) * 0.1;
        if (this.indicatorGroundMarker) {
          this.indicatorGroundMarker.position.x = interp.x;
          this.indicatorGroundMarker.position.z = interp.z;
          const pulse = 0.32 + (Math.sin(Date.now() / 180) * 0.08 + 0.08);
          const mat = this.indicatorGroundMarker.material as StandardMaterial | null;
          if (mat) mat.alpha = pulse;
        }
        indicator.rotation.y += 0.045;
        return;
      }
      for (let i = 0; i < this.indicatorMeshes.length; i++) {
        const indicator = this.indicatorMeshes[i];
        const base = this.indicatorBasePositions[i];
        if (!indicator || !base) continue;
        indicator.rotation.y += 0.045;
        indicator.position.x = base.x;
        indicator.position.z = base.z;
        indicator.position.y = base.y + Math.sin(t + (i * 0.55)) * 0.1;
      }
    }
  };

  private clearIndicator(): void {
    if (this.indicatorMeshes.length > 0) {
      if (this.dependencies?.scene) {
        this.dependencies.scene.onBeforeRenderObservable.removeCallback(this.animateIndicator);
      }
      this.indicatorMeshes.forEach((mesh) => mesh.dispose());
      this.indicatorMeshes = [];
      this.indicatorBasePositions = [];
      this.indicatorPathWorld = null;
      this.indicatorPathSegmentIndex = 0;
      this.indicatorPathProgress = 0;
      this.indicatorPathLoop = true;
      this.indicatorPathStickToDoorOnEnd = false;
      this.indicatorPathCompleted = false;
      this.indicatorGroundMarkerEnabled = false;
      if (this.indicatorGroundMarker) {
        this.indicatorGroundMarker.dispose();
        this.indicatorGroundMarker = null;
      }
    }
    if (this.indicatorGroundMarker) {
      this.indicatorGroundMarker.dispose();
      this.indicatorGroundMarker = null;
    }
    this.indicatorGroundMarkerEnabled = false;
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
    if (!this.dependencies?.scene) {
      // No scene/UI available: continue tutorial instead of leaving the player blocked.
      this.dependencies?.playerController?.setInputSuppressed(false);
      this.triggerPhase('movement_door');
      return;
    }
    
    this.disposePromptGui();
    this.dependencies?.setTutorialPopupAudioMuffle?.(true);
    this.promptGui = AdvancedDynamicTexture.CreateFullscreenUI('TutorialPromptUI', true, this.dependencies.scene);
    if (this.promptGui.layer) this.promptGui.layer.layerMask = UI_LAYER;

    const overlay = new Rectangle('promptOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.background = 'rgba(0, 0, 0, 0.8)';
    overlay.thickness = 0;
    this.promptGui.addControl(overlay);
    this.addPromptTransitionFilter(overlay);

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
    title.fontFamily = 'Arcade8Bit';
    container.addControl(title);

    const keyRow = new TextBlock('moveCurrentKeys', this.getMovementCurrentKeysLabel());
    keyRow.height = '34px';
    keyRow.color = '#FFD59A';
    keyRow.fontSize = 18;
    keyRow.fontFamily = 'Arcade8Bit';
    keyRow.paddingBottom = '8px';
    container.addControl(keyRow);

    const remapHint = new TextBlock('moveRemapHint', 'You can remap every key anytime in Settings.');
    remapHint.height = '28px';
    remapHint.color = '#9FC6D0';
    remapHint.fontSize = 16;
    remapHint.fontFamily = 'Arcade8Bit';
    remapHint.paddingBottom = '10px';
    container.addControl(remapHint);

    const makeBtn = (text: string, action: () => void) => {
      const btn = Button.CreateSimpleButton('btn', text);
      btn.width = '400px';
      btn.height = '50px';
      btn.color = '#7CFFEA';
      btn.background = '#1A332C';
      btn.paddingTop = '10px';
      btn.fontFamily = 'Arcade8Bit';
      btn.onPointerUpObservable.add(action);
      container.addControl(btn);
    };

    makeBtn('WASD', () => {
      GameSettingsStore.setKeybinding('moveUp', 'w');
      GameSettingsStore.setKeybinding('moveLeft', 'a');
      GameSettingsStore.setKeybinding('moveDown', 's');
      GameSettingsStore.setKeybinding('moveRight', 'd');
      GameSettingsStore.setKeybinding('shoot', 'q');
      this.movementChoicePopupCompleted = true;
      this.disposePromptGui();
      this.triggerPhase('movement_door');
    });

    makeBtn('ZQSD', () => {
      GameSettingsStore.setKeybinding('moveUp', 'z');
      GameSettingsStore.setKeybinding('moveLeft', 'q');
      GameSettingsStore.setKeybinding('moveDown', 's');
      GameSettingsStore.setKeybinding('moveRight', 'd');
      this.movementChoicePopupCompleted = true;
      this.disposePromptGui();
      this.triggerPhase('movement_door');
    });

    makeBtn('ARROWS', () => {
      GameSettingsStore.setKeybinding('moveUp', 'arrowup');
      GameSettingsStore.setKeybinding('moveLeft', 'arrowleft');
      GameSettingsStore.setKeybinding('moveDown', 'arrowdown');
      GameSettingsStore.setKeybinding('moveRight', 'arrowright');
      this.movementChoicePopupCompleted = true;
      this.disposePromptGui();
      this.triggerPhase('movement_door');
    });
  }

  private showAttackIntroPopup(): void {
    if (!this.dependencies?.scene) {
      this.dependencies?.playerController?.setInputSuppressed(false);
      this.triggerPhase('combat_aim');
      return;
    }

    this.disposePromptGui();
    this.dependencies?.setTutorialPopupAudioMuffle?.(true);
    const scene = this.dependencies.scene;
    this.promptGui = AdvancedDynamicTexture.CreateFullscreenUI('TutorialAttackPromptUI', true, scene);
    if (this.promptGui.layer) this.promptGui.layer.layerMask = UI_LAYER;

    const overlay = new Rectangle('attackPromptOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.background = 'rgba(0, 0, 0, 0.82)';
    overlay.thickness = 0;
    this.promptGui.addControl(overlay);
    this.addPromptTransitionFilter(overlay);

    const panel = new Rectangle('attackPromptPanel');
    panel.width = '780px';
    panel.height = '500px';
    panel.background = 'rgba(10, 20, 24, 0.94)';
    panel.color = '#7CFFEA';
    panel.thickness = 2;
    panel.cornerRadius = 8;
    overlay.addControl(panel);

    const stack = new StackPanel('attackPromptStack');
    stack.paddingTop = '20px';
    stack.paddingBottom = '18px';
    panel.addControl(stack);

    const title = new TextBlock('attackPromptTitle', 'PRIMARY ATTACK');
    title.height = '42px';
    title.color = '#00FFD1';
    title.fontSize = 28;
    title.fontFamily = 'Arcade8Bit';
    stack.addControl(title);

    const lines = [
      'Use your primary attack with LEFT CLICK (or your attack button).',
      'Each class has a different primary attack.',
      'Mage primary attack launches a projectile.',
      'Auto-aim lets you play without mouse by targeting the nearest enemy.',
    ];
    for (const lineText of lines) {
      const line = new TextBlock(`attackPromptLine_${lineText.slice(0, 8)}`, lineText);
      line.height = '40px';
      line.color = '#DDF9F3';
      line.fontSize = 20;
      line.fontFamily = 'Arcade8Bit';
      line.textWrapping = true;
      stack.addControl(line);
    }

    let autoAim = !!GameSettingsStore.get().controls.autoAimTowardMovement;
    const autoAimBtn = Button.CreateSimpleButton('attackPromptAutoAim', `AUTO-AIM: ${autoAim ? 'ON' : 'OFF'}`);
    autoAimBtn.width = '360px';
    autoAimBtn.height = '50px';
    autoAimBtn.color = '#FFCC82';
    autoAimBtn.background = '#3A2310';
    autoAimBtn.fontFamily = 'Arcade8Bit';
    autoAimBtn.paddingTop = '8px';
    autoAimBtn.onPointerUpObservable.add(() => {
      autoAim = !autoAim;
      GameSettingsStore.updateControls({
        autoAimTowardMovement: autoAim,
        keyboardOnlyMode: autoAim ? true : GameSettingsStore.get().controls.keyboardOnlyMode,
      });
      if (autoAimBtn.textBlock) autoAimBtn.textBlock.text = `AUTO-AIM: ${autoAim ? 'ON' : 'OFF'}`;
    });
    stack.addControl(autoAimBtn);

    const shootLabel = () => GameSettingsStore.get().controls.keybindings.shoot.toUpperCase();
    const keyInfo = new TextBlock('attackPromptKeyInfo', `Current attack key: ${shootLabel()}`);
    keyInfo.height = '32px';
    keyInfo.color = '#FFCB7A';
    keyInfo.fontSize = 19;
    keyInfo.fontFamily = 'Arcade8Bit';
    keyInfo.paddingTop = '8px';
    stack.addControl(keyInfo);

    const remapBtn = Button.CreateSimpleButton('attackPromptRemap', 'REMAP');
    remapBtn.width = '320px';
    remapBtn.height = '48px';
    remapBtn.color = '#FFD59A';
    remapBtn.background = '#3A2310';
    remapBtn.fontFamily = 'Arcade8Bit';
    remapBtn.paddingTop = '8px';
    stack.addControl(remapBtn);

    let waitingForKey = false;
    remapBtn.onPointerUpObservable.add(() => {
      if (waitingForKey) return;
      waitingForKey = true;
      if (remapBtn.textBlock) remapBtn.textBlock.text = 'PRESS A KEY...';
      const onKeyDown = (ev: KeyboardEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = (ev.key || '').toLowerCase();
        if (!key) return;
        GameSettingsStore.setKeybinding('shoot', key);
        const label = shootLabel();
        keyInfo.text = `Current attack key: ${label}`;
        if (remapBtn.textBlock) remapBtn.textBlock.text = 'REMAP';
        waitingForKey = false;
        window.removeEventListener('keydown', onKeyDown, true);
        if (this.promptKeyCaptureCleanup === cleanup) this.promptKeyCaptureCleanup = null;
      };
      const cleanup = () => {
        window.removeEventListener('keydown', onKeyDown, true);
        waitingForKey = false;
      };
      this.promptKeyCaptureCleanup = cleanup;
      window.addEventListener('keydown', onKeyDown, true);
    });

    const okBtn = Button.CreateSimpleButton('attackPromptOk', 'OK');
    okBtn.width = '320px';
    okBtn.height = '54px';
    okBtn.color = '#7CFFEA';
    okBtn.background = '#1A332C';
    okBtn.fontFamily = 'Arcade8Bit';
    okBtn.paddingTop = '10px';
    okBtn.onPointerUpObservable.add(() => {
      this.tutorialAttackAutoAimEnabled = autoAim;
      this.disposePromptGui();
      this.dependencies?.playerController?.setInputSuppressed(true);
      this.timer = window.setTimeout(() => {
        if (!this.isActive) return;
        this.dependencies?.playerController?.setInputSuppressed(false);
        this.triggerPhase('combat_aim');
      }, 140);
    });
    stack.addControl(okBtn);
  }

  private disposePromptGui(): void {
    if (this.promptKeyCaptureCleanup) {
      this.promptKeyCaptureCleanup();
      this.promptKeyCaptureCleanup = null;
    }
    if (this.promptGui) {
      this.promptGui.dispose();
      this.promptGui = null;
    }
    this.dependencies?.setTutorialPopupAudioMuffle?.(false);
  }

  private showInfoPopupWithRemap(config: { title: string; action: KeybindingAction; description: string[]; onConfirm: () => void }): void {
    if (!this.dependencies?.scene) {
      config.onConfirm();
      return;
    }

    this.disposePromptGui();
    this.dependencies?.setTutorialPopupAudioMuffle?.(true);
    const scene = this.dependencies.scene;
    this.promptGui = AdvancedDynamicTexture.CreateFullscreenUI('TutorialInfoPromptUI', true, scene);
    if (this.promptGui.layer) this.promptGui.layer.layerMask = UI_LAYER;

    const overlay = new Rectangle('infoPromptOverlay');
    overlay.width = 1;
    overlay.height = 1;
    overlay.background = 'rgba(0, 0, 0, 0.82)';
    overlay.thickness = 0;
    this.promptGui.addControl(overlay);
    this.addPromptTransitionFilter(overlay);

    const panel = new Rectangle('infoPromptPanel');
    panel.width = '760px';
    panel.height = '470px';
    panel.background = 'rgba(10, 20, 24, 0.94)';
    panel.color = '#7CFFEA';
    panel.thickness = 2;
    panel.cornerRadius = 8;
    overlay.addControl(panel);

    const stack = new StackPanel('infoPromptStack');
    stack.paddingTop = '22px';
    stack.paddingBottom = '20px';
    panel.addControl(stack);

    const title = new TextBlock('infoPromptTitle', config.title);
    title.height = '44px';
    title.color = '#00FFD1';
    title.fontSize = 28;
    title.fontFamily = 'Arcade8Bit';
    stack.addControl(title);

    for (const lineText of config.description) {
      const line = new TextBlock(`infoPromptLine_${lineText.slice(0, 8)}`, lineText);
      line.height = '42px';
      line.color = '#DDF9F3';
      line.fontSize = 21;
      line.fontFamily = 'Arcade8Bit';
      line.textWrapping = true;
      stack.addControl(line);
    }

    const keyLabel = () => GameSettingsStore.get().controls.keybindings[config.action].toUpperCase();
    const keyInfo = new TextBlock('infoPromptKeyInfo', `Current key: ${keyLabel()}`);
    keyInfo.height = '34px';
    keyInfo.color = '#FFCB7A';
    keyInfo.fontSize = 20;
    keyInfo.fontFamily = 'Arcade8Bit';
    keyInfo.paddingTop = '10px';
    stack.addControl(keyInfo);

    const remapBtn = Button.CreateSimpleButton('infoPromptRemap', 'REMAP');
    remapBtn.width = '320px';
    remapBtn.height = '50px';
    remapBtn.color = '#FFD59A';
    remapBtn.background = '#3A2310';
    remapBtn.fontFamily = 'Arcade8Bit';
    remapBtn.paddingTop = '10px';
    stack.addControl(remapBtn);

    let waitingForKey = false;
    remapBtn.onPointerUpObservable.add(() => {
      if (waitingForKey) return;
      waitingForKey = true;
      if (remapBtn.textBlock) remapBtn.textBlock.text = 'PRESS A KEY...';
      const onKeyDown = (ev: KeyboardEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = (ev.key || '').toLowerCase();
        if (!key) return;
        GameSettingsStore.setKeybinding(config.action, key);
        const label = keyLabel();
        keyInfo.text = `Current key: ${label}`;
        if (remapBtn.textBlock) remapBtn.textBlock.text = 'REMAP';
        waitingForKey = false;
        window.removeEventListener('keydown', onKeyDown, true);
        if (this.promptKeyCaptureCleanup === cleanup) this.promptKeyCaptureCleanup = null;
      };
      const cleanup = () => {
        window.removeEventListener('keydown', onKeyDown, true);
        waitingForKey = false;
      };
      this.promptKeyCaptureCleanup = cleanup;
      window.addEventListener('keydown', onKeyDown, true);
    });

    const okBtn = Button.CreateSimpleButton('infoPromptOk', 'OK');
    okBtn.width = '320px';
    okBtn.height = '56px';
    okBtn.color = '#7CFFEA';
    okBtn.background = '#1A332C';
    okBtn.fontFamily = 'Arcade8Bit';
    okBtn.paddingTop = '12px';
    okBtn.onPointerUpObservable.add(() => {
      this.disposePromptGui();
      config.onConfirm();
    });
    stack.addControl(okBtn);
  }

  private spawnEnemy(typeId: string, localOffset: Vector3): void {
    this.enemiesAlive++;
    const center = this.dependencies?.getRoomCenter() ?? new Vector3(0, 0, 0);
    const position = center.add(localOffset);
    this.eventBus.emit(GameEvents.ENEMY_SPAWN_REQUESTED, { typeId, position });
  }

  private spawnEnemyAtMap(
    typeId: string,
    x: number,
    z: number,
    options?: { hpMultiplier?: number }
  ): void {
    this.enemiesAlive++;
    const position = this.mapToWorld(x, z);
    this.eventBus.emit(GameEvents.ENEMY_SPAWN_REQUESTED, {
      typeId,
      position,
      hpMultiplier: options?.hpMultiplier,
    });
  }

  private daemonSay(
    message: string,
    emotion: string,
    duration: number,
    options?: {
      sequence?: string[];
      frameInterval?: number;
      canGlitchFrames?: boolean;
      canCrash?: boolean;
    },
  ): void {
    if (this.dependencies?.hudManager) {
      this.dependencies.hudManager.showDaemonMessage(message, emotion, {
        holdDuration: duration,
        sequence: options?.sequence,
        frameInterval: options?.frameInterval,
        canCrash: options?.canCrash ?? false,
        canGlitchFrames: options?.canGlitchFrames ?? false,
      });
    }
  }

  private handleTutorialVoidFall(): void {
    if (this.tutorialVoidTauntsSilenced) return;
    this.tutorialVoidFallCount += 1;

    if (this.tutorialVoidFallCount === 1) {
      this.daemonSay("The void doesn't have a safety net. And my patience has limits.", "enerve", 3.6, {
        sequence: this.buildRepeatedEmotionFrames('enerve', 4),
        frameInterval: 0.12,
      });
      return;
    }
    if (this.tutorialVoidFallCount === 2) {
      this.daemonSay("Are you doing that on purpose?", "surpris", 2.0, {
        sequence: this.buildRepeatedEmotionFrames('surpris', 3),
        frameInterval: 0.12,
      });
      return;
    }
    if (this.tutorialVoidFallCount === 3) {
      this.daemonSay("You cannot be that bad.", "bored", 2.0, {
        sequence: this.buildRepeatedEmotionFrames('bored', 3),
        frameInterval: 0.12,
      });
      return;
    }

    if (this.tutorialVoidFallCount === 4) {
      this.daemonSay(
        "I will stop commenting, you little glitch.\n[FATAL ERROR: DAEMON_DIALOG_OVERFLOW]",
        "censure",
        3.9,
        {
          sequence: [
            'censure_01.png', 'censure_02.png', 'censure_03.png', 'censure_04.png',
            'error_01.png', 'error_02.png', 'error_03.png', 'error_04.png',
            'bsod_01.png', 'bsod_02.png', 'bsod_03.png', 'bsod_04.png',
            'reboot_01.png', 'reboot_02.png', 'reboot_03.png', 'reboot_04.png',
            'init_01.png', 'init_02.png', 'init_03.png', 'init_04.png',
            'loading_01.png', 'loading_02.png',
          ],
          frameInterval: 0.12,
          canCrash: false,
          canGlitchFrames: false,
        },
      );
      this.deferUntilDaemonFinished(() => {
        if (!this.isActive) return;
        this.daemonSay("You are so bad you made me crash.", "enerve", 3.6);
      }, 0);
      return;
    }

    this.tutorialVoidTauntsSilenced = true;
  }

  private handleEnemyDied(): void {
    if (!this.isActive) return;
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);
    this.scheduleEnemyClearCheck(10);
  }

  private scheduleEnemyClearCheck(retriesLeft: number): void {
    if (!this.isActive) return;
    if (this.pendingEnemyClearCheckTimer !== null) {
      clearTimeout(this.pendingEnemyClearCheckTimer);
      this.pendingEnemyClearCheckTimer = null;
    }
    const activeEnemies = Math.max(0, this.dependencies?.getActiveEnemyCount?.() ?? this.enemiesAlive);
    this.enemiesAlive = activeEnemies;
    if (activeEnemies === 0) {
      if (this.currentPhase === 'combat_dummy') {
        this.deferUntilDaemonFinished(() => this.triggerPhase('combat_stance'), 320);
      } else if (this.currentPhase === 'combat_stance') {
        this.deferUntilDaemonFinished(() => this.triggerPhase('combat_ultimate'), 320);
      } else if (this.currentPhase === 'combat_ultimate') {
        if (this.classId === 'mage' && this.isReplayTutorial) {
          this.deferUntilDaemonFinished(() => this.triggerPhase('mage_replay_complete'), 280);
        } else {
          this.deferUntilDaemonFinished(() => this.triggerPhase('combat_door'), 360);
        }
      } else if (this.currentPhase === 'playground_mobs' && this.phaseState.playgroundArmed) {
        this.deferUntilDaemonFinished(() => this.triggerPhase('playground_completed'), 320);
      } else if (this.currentPhase === 'class_primary_wave') {
        this.deferUntilDaemonFinished(() => this.triggerPhase('class_stance_wave'), 260);
      } else if (this.currentPhase === 'class_stance_wave') {
        if (this.classId === 'firewall') {
          this.deferUntilDaemonFinished(() => this.triggerPhase('class_dash_wave'), 260);
        }
      } else if (this.currentPhase === 'class_dash_wave') {
        this.deferUntilDaemonFinished(() => this.triggerPhase('class_ultimate_wave'), 260);
      } else if (this.currentPhase === 'class_ultimate_wave') {
        this.deferUntilDaemonFinished(() => this.triggerPhase('class_exit_door'), 260);
      }
      return;
    }
    if (retriesLeft <= 0) return;
    this.pendingEnemyClearCheckTimer = window.setTimeout(() => {
      this.pendingEnemyClearCheckTimer = null;
      this.scheduleEnemyClearCheck(retriesLeft - 1);
    }, 90);
  }

  private handleRoomEntered(): void {
    if (!this.isActive || !this.dependencies) return;
    
    const roomIndex = this.dependencies.getRoomIndex();
    if (this.forcedRoomIndex === roomIndex) return; // Prevent double trigger
    this.forcedRoomIndex = roomIndex;

    if (roomIndex === 0) {
      if (this.classId === 'mage' && this.isReplayTutorial) {
        this.dependencies?.playerController?.setInputSuppressed(true);
        this.dependencies?.playerController?.setMovementLocked(true);
        this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('mage_replay_intro')), 420);
        return;
      }
      if (this.classId === 'firewall' || this.classId === 'rogue' || this.classId === 'cat') {
        this.dependencies?.playerController?.setInputSuppressed(true);
        this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('class_intro')), 500);
        return;
      }
      this.dependencies?.playerController?.setInputSuppressed(true);
      this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('intro_briefing')), 900);
    } else if (roomIndex === 1) {
      this.room2HazardTauntsPlayed.clear();
      this.dependencies?.playerController?.setInputSuppressed(false);
      this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('combat_attack_intro')), 1000);
    } else if (roomIndex === 2) {
      this.dependencies?.playerController?.setInputSuppressed(false);
      this.timer = window.setTimeout(() => this.deferUntilDaemonFinished(() => this.triggerPhase('playground_mobs')), 1000);
    }
  }

  private getMovementCurrentKeysLabel(): string {
    const kb = GameSettingsStore.get().controls.keybindings;
    return `Current keys: Up ${kb.moveUp.toUpperCase()} / Left ${kb.moveLeft.toUpperCase()} / Down ${kb.moveDown.toUpperCase()} / Right ${kb.moveRight.toUpperCase()}`;
  }

  private isMobileTutorialMode(): boolean {
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const forcedMobileQuery = typeof window !== 'undefined' && window.location?.search?.includes('mobile=true');
    return uaMobile || forcedMobileQuery;
  }

  private deferUntilDaemonFinished(action: () => void, minDelayMs: number = 0): void {
    const start = performance.now();
    const poll = () => {
      if (!this.isActive) return;
      const elapsed = performance.now() - start;
      if (elapsed < minDelayMs) {
        this.timer = window.setTimeout(poll, 40);
        return;
      }
      const daemonActive = this.dependencies?.hudManager?.isDaemonMessageActive?.() ?? false;
      if (daemonActive) {
        this.timer = window.setTimeout(poll, 80);
        return;
      }
      action();
    };
    this.timer = window.setTimeout(poll, 20);
  }


  private addPromptTransitionFilter(parent: Rectangle): void {
    const tint = new Rectangle('promptTransitionTint');
    tint.width = 1;
    tint.height = 1;
    tint.thickness = 0;
    tint.background = 'rgba(25, 120, 170, 0.14)';
    tint.isPointerBlocker = false;
    parent.addControl(tint);

    const vignette = new Rectangle('promptTransitionVignette');
    vignette.width = 1;
    vignette.height = 1;
    vignette.thickness = 0;
    vignette.background = 'rgba(0, 20, 35, 0.22)';
    vignette.isPointerBlocker = false;
    parent.addControl(vignette);
  }

  private handleAttackPerformed(data: any): void {
    if (!this.isActive) return;
    const type = typeof data?.type === 'string' ? data.type.toLowerCase() : '';
    if (this.currentPhase === 'combat_stance') {
      if (type.includes('stance') || type.includes('secondary')) {
        this.tutorialStanceDamageWindowUntil = performance.now() + 520;
      }
    } else if (this.currentPhase === 'combat_ultimate') {
      if (type.includes('ultimate')) {
        this.tutorialUltimateDamageWindowUntil = performance.now() + 4200;
      }
    } else if (this.currentPhase === 'class_stance_wave') {
      if (this.classId === 'rogue' || this.classId === 'cat') {
        if (this.dependencies?.playerController?.isSecondaryActive()) {
          this.phaseState.rogueStealthActivated = true;
          this.deferUntilDaemonFinished(() => this.triggerPhase('class_dash_wave'), 150);
        }
      }
    } else if (this.currentPhase === 'class_dash_wave') {
      if (this.classId === 'firewall') {
        if (type.includes('bash') || type.includes('tank')) {
          this.phaseState.tankBashUsed = true;
        }
      } else {
        if (type.includes('dash') || type.includes('rogue')) {
          this.phaseState.rogueDashUsed = true;
        }
      }
    }
  }

  private handlePlayerDamaged(): void {
    if (!this.isActive) return;
    if (this.currentPhase === 'class_stance_wave' && this.classId === 'firewall' && !this.phaseState.playerDamagedTauntDone) {
      this.phaseState.playerDamagedTauntDone = true;
      this.daemonSay("You had one job: block the projectile. Incredible.", "rire", 3.2);
    }
  }

  private startDoorExitWatch(): void {
    if (this.pendingDoorExitCheckTimer !== null) {
      clearTimeout(this.pendingDoorExitCheckTimer);
      this.pendingDoorExitCheckTimer = null;
    }
    const poll = () => {
      if (!this.isActive || this.currentPhase !== 'class_exit_door') return;
      const playerPos = this.dependencies?.playerController?.getPosition?.();
      const doorPos = this.dependencies?.getDoorPosition?.();
      if (playerPos && doorPos && Vector3.Distance(playerPos, doorPos) <= 1.2) {
        this.eventBus.emit(GameEvents.TUTORIAL_END_REQUESTED);
        return;
      }
      this.pendingDoorExitCheckTimer = window.setTimeout(poll, 120);
    };
    this.pendingDoorExitCheckTimer = window.setTimeout(poll, 120);
  }

  private shouldAllowTutorialDamage(enemy: EnemyController): boolean {
    if (!this.isActive) return true;
    const typeId = enemy.getTypeId?.() ?? '';
    const now = performance.now();

    if (this.currentPhase === 'combat_stance' && typeId === 'tutorial_dummy_mobile') {
      return now <= this.tutorialStanceDamageWindowUntil;
    }

    if (this.currentPhase === 'combat_ultimate' && typeId === 'tutorial_dummy_basic') {
      const isUltimateActive = this.dependencies?.playerController?.isUltimateActiveState?.() ?? false;
      return isUltimateActive || now <= this.tutorialUltimateDamageWindowUntil;
    }

    return true;
  }
}
