import { Vector3 } from '@babylonjs/core';
import { EventBus, GameEvents } from './EventBus';
import { GameStartRequestedPayload } from './GameEventBindings';

export type TutorialPhase = 'init' | 'intro' | 'basic_attack' | 'class_mechanic' | 'ultimate' | 'shop' | 'playground' | 'completed';

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
  private dependencies: { getRoomCenter: () => Vector3; getRoomIndex: () => number } | null = null;

  constructor() {
    this.eventBus = EventBus.getInstance();
    // Subscribe to start request early so we don't miss it before initialize()
    this.unsubscribers.push(this.eventBus.on(GameEvents.TUTORIAL_START_REQUESTED, (payload: GameStartRequestedPayload) => {
      this.startTutorial(payload.classId || 'mage');
    }));

    // Subscribe to gameplay events early so we don't miss room entry during startNewGame
    this.unsubscribers.push(this.eventBus.on(GameEvents.ROOM_ENTERED, () => this.handleRoomEntered()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DIED, () => this.handleEnemyDied()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ATTACK_PERFORMED, (data: any) => this.handleAttackPerformed(data)));
    this.unsubscribers.push(this.eventBus.on(GameEvents.ENEMY_DAMAGED, () => this.handleEnemyDamaged()));
    this.unsubscribers.push(this.eventBus.on(GameEvents.PLAYER_DAMAGED, () => this.handlePlayerDamaged()));
  }

  public initialize(dependencies?: { getRoomCenter: () => Vector3; getRoomIndex: () => number }): void {
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
    console.log(`[GameTutorialManager] Tutorial started for class: ${classId}`);
  }

  public stopTutorial(): void {
    this.isActive = false;
    this.currentPhase = 'init';
    this.phaseState = {};
    this.enemiesAlive = 0;
    this.introTriggered = false;
    
    // Clear gameplay-specific listeners
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public isTutorialActive(): boolean {
    return this.isActive;
  }

  public getCurrentPhase(): TutorialPhase {
    return this.currentPhase;
  }

  private triggerPhase(phase: TutorialPhase): void {
    if (!this.isActive) return;
    if (this.currentPhase === phase && phase !== 'init') return; // Prevent echoing
    console.log(`[GameTutorialManager] triggerPhase: ${phase}`);
    this.currentPhase = phase;
    this.phaseState = {};

    switch (phase) {
      case 'intro':
        this.daemonSayById('tutorial_intro');
        this.timer = window.setTimeout(() => this.triggerPhase('basic_attack'), 5000);
        break;
      case 'basic_attack':
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0, 0, -2));
        this.daemonSayById('tutorial_basic_attack');
        break;
      case 'class_mechanic':
        this.startClassMechanicPhase();
        break;
      case 'ultimate':
        this.eventBus.emit(GameEvents.PLAYER_ULTIMATE_REFILL_REQUESTED);
        this.daemonSayById('tutorial_ultimate');
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0, 0, -1));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(-1, 0, -1.5));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(1, 0, -1.5));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(-0.5, 0, -2.5));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0.5, 0, -2.5));
        break;
      case 'shop':
        this.daemonSayById('tutorial_shop');
        this.eventBus.emit(GameEvents.TUTORIAL_PHASE_COMPLETED, { phaseId: 'shop_start', gold: 50 });
        break;
      case 'playground':
        this.daemonSayById('tutorial_playground');
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(-2, 0, -2));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(0, 0, -1));
        this.spawnEnemy('tutorial_dummy_basic', new Vector3(2, 0, -2));
        // No timer to stop tutorial here; wait for enemies to die
        break;
      case 'completed':
        this.daemonSayById('tutorial_completed');
        this.timer = window.setTimeout(() => {
          this.eventBus.emit(GameEvents.TUTORIAL_END_REQUESTED);
          this.stopTutorial();
        }, 4000);
        break;
    }
  }

  private startClassMechanicPhase(): void {
    if (this.classId === 'mage') {
      this.daemonSayById('tutorial_mage_mechanic');
      this.spawnEnemy('tutorial_dummy_mobile', new Vector3(0, 0, -2));
    } else if (this.classId === 'firewall') {
      this.daemonSayById('tutorial_tank_mechanic');
      this.spawnEnemy('tutorial_turret', new Vector3(0, 0, 1));
      this.phaseState.blocked = false;
    } else {
      // rogue or cat
      this.daemonSayById('tutorial_rogue_mechanic');
      this.spawnEnemy('tutorial_sentinel', new Vector3(0, 0, 1));
      this.phaseState.dashed = false;
    }
  }

  private spawnEnemy(typeId: string, localOffset: Vector3): void {
    this.enemiesAlive++;
    const center = this.dependencies?.getRoomCenter() ?? new Vector3(0, 0, 0);
    const position = center.add(localOffset);
    console.log(`[GameTutorialManager] Requesting spawn: type=${typeId}, roomCenter=${center.toString()}, localOffset=${localOffset.toString()}, finalPosition=${position.toString()}`);
    this.eventBus.emit(GameEvents.ENEMY_SPAWN_REQUESTED, { typeId, position });
  }

  private daemonSayById(voicelineId: string): void {
    console.log(`[GameTutorialManager] daemonSayById: ${voicelineId}`);
    this.eventBus.emit(GameEvents.DAEMON_TAUNT, {
      voicelineId
    });
  }

  private handleEnemyDied(): void {
    if (!this.isActive) return;
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);

    if (this.enemiesAlive === 0) {
      if (this.currentPhase === 'basic_attack') {
        this.timer = window.setTimeout(() => this.triggerPhase('class_mechanic'), 1000);
      } else if (this.currentPhase === 'class_mechanic') {
        this.timer = window.setTimeout(() => this.triggerPhase('ultimate'), 1000);
      } else if (this.currentPhase === 'ultimate') {
        this.timer = window.setTimeout(() => this.triggerPhase('shop'), 1500);
      } else if (this.currentPhase === 'playground') {
        this.timer = window.setTimeout(() => this.triggerPhase('completed'), 1000);
      }
    }
  }

  private handleRoomEntered(): void {
    if (!this.isActive || !this.dependencies) {
      console.log(`[GameTutorialManager] handleRoomEntered skipped: isActive=${this.isActive}, deps=${!!this.dependencies}`);
      return;
    }
    
    const roomIndex = this.dependencies.getRoomIndex();
    console.log(`[GameTutorialManager] Room entered index: ${roomIndex}, currentPhase: ${this.currentPhase}`);

    if (roomIndex === 0 && !this.introTriggered) {
      this.introTriggered = true;
      console.log(`[GameTutorialManager] Triggering phase: intro (delayed)`);
      this.timer = window.setTimeout(() => this.triggerPhase('intro'), 2000);
    } else if (roomIndex === 1) {
      console.log(`[GameTutorialManager] Triggering phase: playground (delayed)`);
      this.timer = window.setTimeout(() => this.triggerPhase('playground'), 2000);
    }
  }

  private handleAttackPerformed(data: any): void {
    if (!this.isActive) return;
    if (this.currentPhase === 'class_mechanic') {
      if (this.classId === 'firewall' && data?.type === 'shield_bash') {
        this.phaseState.dashed = true; // wait for it to die from it
      }
      if (this.classId === 'rogue' && data?.type === 'dash') {
        this.phaseState.dashed = true;
      }
    }
  }

  private handleEnemyDamaged(): void {
    // For tank block detection we might not have a direct event, but it's fine, the enemy will die from shield bash or damage
  }

  private handlePlayerDamaged(): void {
    if (!this.isActive) return;
    if (this.currentPhase === 'class_mechanic' && this.classId === 'firewall') {
      // Just to annoy player
    }
  }

}

