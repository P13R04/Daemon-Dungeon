/**
 * PlayerAnimationController - Manages player character animations
 * Handles loading character models (mage, tank) and managing animation states with proper prioritization
 */

import { Scene, Mesh, AbstractMesh, AnimationGroup, SceneLoader, Vector3, TransformNode, ParticleSystem, DynamicTexture, Color4, Observer, Nullable } from '@babylonjs/core';
import { SCENE_LAYER } from '../ui/uiLayers';
import { ConfigLoader } from '../utils/ConfigLoader';

type Canvas2DRenderingContext = CanvasRenderingContext2D;

export enum AnimationState {
  IDLE = 'idle',
  WALKING = 'walking',
  ATTACKING = 'attacking',
  DASH = 'dash',
  ULTIMATE = 'ultimate',
  SHIELD_BASH = 'shield_bash',
  SHIELD_ACTIVATE = 'shield_activate',
  SHIELD_DEACTIVATE = 'shield_deactivate',
  SHIELD_LOOP = 'shield_loop',
}

export interface AnimationTransition {
  from: AnimationState;
  to: AnimationState;
  // Play intro animation? (e.g., Start_walking before walking)
  useIntro?: boolean;
}

export type PlayerClass = 'mage' | 'firewall' | 'rogue' | 'cat';

export class PlayerAnimationController {
  private mesh: Mesh | null = null;
  private meshParent: TransformNode | null = null;  // Parent for rotation/position
  private scene: Scene;
  private animationGroups: Map<string, AnimationGroup> = new Map();
  private playerClass: PlayerClass = 'mage';

  // Current animation state
  private currentState: AnimationState = AnimationState.IDLE;
  private currentAnimation: string = '';
  private isTransitioning: boolean = false;
  private isAnimationPlaying: boolean = false;
  private isUltimateActive: boolean = false; // Track ultimate state
  private onUltimateAnimationFinished: (() => void) | null = null; // Callback when ultimate animation ends

  // Rotation system - progressive interpolation
  private targetRotationY: number = 0; // Target angle to rotate towards
  private rotationSpeed: number = 12; // Radians per second - controls rotation smoothness
  private rotationOffsetY: number = 0; // Permanent rotation offset (e.g., Math.PI for tank 180° flip)
  
  // Height adjustment
  private heightOffset: number = -2; // Adjustable height offset (default -2 for mage)

  // Attack animation alternation and speed variation
  private lastAttackWasAttack1: boolean = false;
  private attackSpeedVariation: number[] = [0.8, 0.9, 1.0, 1.1, 1.2]; // Speed multipliers
  private lastAttackSpeedIndex: number = 0;

  // Walking state tracking
  private isWalking: boolean = false;
  private hasStartedWalking: boolean = false;
  private rogueIdleLoopToken: number = 0;

  // Animation transition settings
  private readonly FADE_DURATION = 0.1; // seconds

  // Tank shield state
  private isShieldActive: boolean = false;
  private tankThrusterParticles: ParticleSystem | null = null;
  private tankThrusterAnchor: TransformNode | null = null;
  private tankThrusterTexture: DynamicTexture | null = null;
  private tankThrusterIdleOffset: Vector3 = new Vector3(-0.07, 1.6, -0.13);
  private tankThrusterMoveOffset: Vector3 = new Vector3(-0.07, 1.6, -0.03);
  private tankThrusterBashOffset: Vector3 = new Vector3(-0.07, 1.6, 0.11);
  private tankThrusterSizeMultiplier: number = 1;
  private tankThrusterSceneScale: number = 1;
  private lastTankThrusterMoving: boolean = false;
  private lastTankThrusterBashing: boolean = false;
  private lastPlayerVelocity: Vector3 = Vector3.Zero();

  constructor(scene: Scene, playerClass: PlayerClass = 'mage') {
    this.scene = scene;
    this.playerClass = playerClass;
    // Apply rotation offset for tank (firewall) - 180° flip
    if (playerClass === 'firewall') {
      this.rotationOffsetY = Math.PI;
    } else if (playerClass === 'rogue') {
      // Rogue rig forward axis is inverted; keep a persistent 180° correction.
      this.rotationOffsetY = Math.PI;
      this.heightOffset = 0;
    } else if (playerClass === 'cat') {
      // Rogue/cat rigs need to sit slightly higher than mage/tank in current scene setup.
      this.heightOffset = 0;
    }
  }

  /**
   * Load character model and extract animation groups
   */
  async loadModel(modelPath: string = 'models/player/'): Promise<Mesh> {
    try {
      const modelFile =
        this.playerClass === 'firewall'
          ? 'tank.glb'
          : this.playerClass === 'rogue'
            ? 'rogue.glb'
            : this.playerClass === 'cat'
              ? 'cat.glb'
            : 'mage.glb';
      const result = await SceneLoader.ImportMeshAsync('', modelPath, modelFile, this.scene);

      this.mesh = result.meshes[0] as Mesh;
      this.mesh.name = `player_${this.playerClass}`;

      // Scale model to a class-specific target height for reliable visibility.
      const bounds = this.mesh.getHierarchyBoundingVectors(true);
      const currentHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
      const targetHeight = 2.0;
      const modelScale = targetHeight / currentHeight;
      this.mesh.scaling.scaleInPlace(modelScale);

      // Create parent TransformNode for rotation and position management
      // This avoids animation keyframes overriding our rotation
      this.meshParent = new TransformNode(`player_${this.playerClass}_parent`, this.scene);
      this.meshParent.position.y = 1.0 + this.heightOffset;

      // Parent all root meshes so full model follows movement/rotation.
      result.meshes.forEach((mesh) => {
        if (mesh.parent === null) {
          mesh.parent = this.meshParent;
        }
        mesh.layerMask = SCENE_LAYER;
      });
      this.mesh.position = Vector3.Zero();

      // Debug: log all meshes loaded
      console.log(`📦 Total meshes loaded: ${result.meshes.length}`);
      result.meshes.forEach((m, idx) => {
        console.log(`   [${idx}] ${m.name} (children: ${m.getChildren().length})`);
      });
      result.animationGroups.forEach((group) => {
        this.animationGroups.set(group.name, group);
        console.log(`✓ Loaded animation: ${group.name}`);
      });

      if (this.playerClass === 'firewall') {
        this._setupTankThrusterParticles(result.meshes as AbstractMesh[]);
        this.applyTankThrusterTuning(this.loadTankThrusterTuningFromConfig());
        this.updateTankThrusterSceneScale();
      }

      console.log(`✓ Player ${this.playerClass} model loaded successfully, animations: ${this.animationGroups.size}, scale: 0.1`);
      console.log(`✓ Parent TransformNode created for rotation management`);

      // Initialize with Idle animation
      this.playAnimation(AnimationState.IDLE);

      return this.mesh;
    } catch (error) {
      console.error(`Failed to load ${this.playerClass} model:`, error);
      throw error;
    }
  }

  /**
   * Play animation for a given state with optional speed variation
   */
  playAnimation(state: AnimationState, speedMultiplier: number = 1.0): void {
    if (!this.mesh) {
      console.warn('Player mesh not loaded');
      return;
    }

    // Stop all animations
    this.animationGroups.forEach((group) => {
      if (group.isPlaying) {
        group.stop();
      }
    });

    if (this.playerClass === 'mage') {
      this._playMageAnimation(state, speedMultiplier);
    } else if (this.playerClass === 'firewall') {
      this._playTankAnimation(state, speedMultiplier);
    } else if (this.playerClass === 'rogue') {
      this._playRogueAnimation(state, speedMultiplier);
    } else if (this.playerClass === 'cat') {
      this._playCatAnimation(state, speedMultiplier);
    } else {
      console.warn(`Animation not yet implemented for class: ${this.playerClass}`);
    }
  }

  private _findAnimationByName(name: string): AnimationGroup | null {
    const direct = this.animationGroups.get(name);
    if (direct) return direct;

    const lower = name.toLowerCase();
    for (const [key, group] of this.animationGroups.entries()) {
      if (key.toLowerCase() === lower) {
        return group;
      }
    }
    return null;
  }

  private _playRogueIdleVariantLoop(token: number, speedMultiplier: number): void {
    if (token !== this.rogueIdleLoopToken) {
      return;
    }

    const idle2 = this._findAnimationByName('idle2');
    const idle3 = this._findAnimationByName('idle3');
    const variants = [idle2, idle3].filter((group): group is AnimationGroup => !!group);

    if (variants.length === 0) {
      const idle = this._findAnimationByName('idle');
      if (idle) {
        this._playAnimationLoop(idle.name, speedMultiplier);
      } else {
        console.warn('No rogue idle animation found');
      }
      return;
    }

    const picked = variants[Math.floor(Math.random() * variants.length)];
    this._playAnimationOnce(picked.name, () => {
      this._playRogueIdleVariantLoop(token, speedMultiplier);
    }, speedMultiplier);
  }

  /**
   * Play rogue animations using dedicated clips from rogue.glb.
   */
  private _playRogueAnimation(state: AnimationState, speedMultiplier: number = 1.0): void {
    const idle = this._findAnimationByName('idle');
    const startWalking = this._findAnimationByName('start_walking');
    const walking = this._findAnimationByName('walking');
    const attack1 = this._findAnimationByName('attack1');
    const attack2 = this._findAnimationByName('attack2');
    const dash = this._findAnimationByName('dash');

    switch (state) {
      case AnimationState.IDLE: {
        this.currentState = AnimationState.IDLE;
        this.isWalking = false;
        this.hasStartedWalking = false;

        const token = ++this.rogueIdleLoopToken;
        if (idle) {
          this._playAnimationOnce(idle.name, () => {
            this._playRogueIdleVariantLoop(token, speedMultiplier);
          }, speedMultiplier);
        } else {
          this._playRogueIdleVariantLoop(token, speedMultiplier);
        }
        return;
      }

      case AnimationState.WALKING: {
        this.rogueIdleLoopToken++;
        this.currentState = AnimationState.WALKING;
        this.isWalking = true;

        if (!this.hasStartedWalking && startWalking) {
          this.hasStartedWalking = true;
          this._playAnimationOnce(startWalking.name, () => {
            if (this.currentState !== AnimationState.WALKING) return;

            if (walking) {
              this._playAnimationLoop(walking.name, speedMultiplier);
              return;
            }

            this._playAnimationLoop(startWalking.name, speedMultiplier);
          }, speedMultiplier);
          return;
        }

        this.hasStartedWalking = true;
        if (walking) {
          this._playAnimationLoop(walking.name, speedMultiplier);
        } else if (startWalking) {
          this._playAnimationLoop(startWalking.name, speedMultiplier);
        } else if (idle) {
          this._playAnimationLoop(idle.name, speedMultiplier);
        } else {
          console.warn('No rogue walking animation found');
        }
        return;
      }

      case AnimationState.DASH: {
        this.rogueIdleLoopToken++;
        this.currentState = AnimationState.DASH;
        const dashClip = dash ?? attack1 ?? attack2 ?? idle;
        if (!dashClip) {
          console.warn('No rogue dash animation found');
          return;
        }

        // Dash is a strict one-shot; PlayerController will choose the next state
        // when gameplay dash movement actually ends.
        this._playAnimationOnce(dashClip.name, undefined, speedMultiplier);
        return;
      }

      case AnimationState.ATTACKING:
      case AnimationState.ULTIMATE: {
        this.rogueIdleLoopToken++;

        let attackClip: AnimationGroup | null = null;
        if (attack1 && attack2) {
          this.lastAttackWasAttack1 = !this.lastAttackWasAttack1;
          attackClip = this.lastAttackWasAttack1 ? attack1 : attack2;
        } else {
          attackClip = attack1 ?? attack2 ?? dash ?? idle;
        }

        if (!attackClip) {
          console.warn('No rogue attack animation found');
          return;
        }

        this.currentState = state;
        const attackSpeedVariation = this.attackSpeedVariation[this.lastAttackSpeedIndex];
        this.lastAttackSpeedIndex = (this.lastAttackSpeedIndex + 1) % this.attackSpeedVariation.length;
        const playbackSpeed =
          state === AnimationState.ATTACKING
            ? Math.max(0.01, attackSpeedVariation * speedMultiplier)
            : speedMultiplier;

        this._playAnimationOnce(attackClip.name, () => {
          if (state === AnimationState.ULTIMATE && this.onUltimateAnimationFinished) {
            this.onUltimateAnimationFinished();
            this.onUltimateAnimationFinished = null;
          }
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        }, playbackSpeed);
        return;
      }

      default:
        this.playAnimation(AnimationState.IDLE);
        return;
    }
  }

  /**
   * Play cat easter-egg animations with legacy placeholder behavior.
   */
  private _playCatAnimation(state: AnimationState, speedMultiplier: number = 1.0): void {
    const fallbackClip =
      this.animationGroups.get('Take 001') ??
      this.animationGroups.get('take 001') ??
      this.animationGroups.values().next().value;

    if (!fallbackClip) {
      console.warn('No cat animation group found');
      return;
    }

    const clipName = fallbackClip.name;

    switch (state) {
      case AnimationState.ATTACKING:
      case AnimationState.DASH:
      case AnimationState.ULTIMATE:
        this.currentState = state;
        this._playAnimationOnce(clipName, () => {
          if (state === AnimationState.ULTIMATE && this.onUltimateAnimationFinished) {
            this.onUltimateAnimationFinished();
            this.onUltimateAnimationFinished = null;
          }
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        }, speedMultiplier);
        return;

      case AnimationState.WALKING:
        this.currentState = AnimationState.WALKING;
        this.isWalking = true;
        this.hasStartedWalking = true;
        this._playAnimationLoop(clipName, speedMultiplier);
        return;

      case AnimationState.IDLE:
      default:
        this.currentState = AnimationState.IDLE;
        this.isWalking = false;
        this.hasStartedWalking = false;
        this._playAnimationLoop(clipName, speedMultiplier);
        return;
    }
  }

  /**
   * Play mage animations
   */
  private _playMageAnimation(state: AnimationState, speedMultiplier: number = 1.0): void {
    let animationName = '';

    switch (state) {
      case AnimationState.IDLE:
        animationName = 'Idle.001';
        this.currentState = AnimationState.IDLE;
        this.isWalking = false;
        this.hasStartedWalking = false;
        this._playAnimationLoop(animationName, speedMultiplier);
        return;

      case AnimationState.WALKING:
        // Use Start_walking → Walking transition
        if (!this.isWalking && !this.hasStartedWalking) {
          // First time walking: play Start_walking intro
          animationName = 'Start_walking';
          this.hasStartedWalking = true;
          this._playAnimationOnce(animationName, () => {
            // After intro, play looping walk animation
            this._playAnimationLoop('walking', 1.0);
          });
          return;
        } else {
          // Already walking, just update speed if needed
          animationName = 'walking';
        }
        this.currentState = AnimationState.WALKING;
        this.isWalking = true;
        this._playAnimationLoop(animationName, speedMultiplier);
        return;

      case AnimationState.ATTACKING:
        // Alternate between Attack_1 and Attack_2
        this.lastAttackWasAttack1 = !this.lastAttackWasAttack1;
        animationName = this.lastAttackWasAttack1 ? 'Attack_1' : 'Attack_2';

        // Vary speed to avoid repetition
        const speedVariation = this.attackSpeedVariation[this.lastAttackSpeedIndex];
        this.lastAttackSpeedIndex = (this.lastAttackSpeedIndex + 1) % this.attackSpeedVariation.length;
        const playbackSpeed = Math.max(0.01, speedVariation * speedMultiplier);

        this.currentState = AnimationState.ATTACKING;
        this._playAnimationOnce(animationName, () => {
          // After attack, return to current movement state
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        }, playbackSpeed);
        return;

      case AnimationState.ULTIMATE:
        animationName = 'Ultime';
        this.currentState = AnimationState.ULTIMATE;
        this._playAnimationOnce(animationName, () => {
          // Animation finished - call the ultimate callback if set
          if (this.onUltimateAnimationFinished) {
            this.onUltimateAnimationFinished();
            this.onUltimateAnimationFinished = null; // Reset callback
          }
          // After ultimate, return to current movement state
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        });
        return;
      
      default:
        break;
    }

    this._playAnimationLoop(animationName, speedMultiplier);
  }

  /**
   * Play tank (firewall) animations
   */
  private _playTankAnimation(state: AnimationState, speedMultiplier: number = 1.0): void {
    let animationName = '';

    switch (state) {
      case AnimationState.IDLE:
        animationName = 'Skyrim';
        this.currentState = AnimationState.IDLE;
        this.isWalking = false;
        this.hasStartedWalking = false;
        this._playAnimationLoop(animationName, speedMultiplier);
        return;

      case AnimationState.WALKING:
        // Use Walk_start → Walk transition
        if (!this.isWalking && !this.hasStartedWalking) {
          // First time walking: play Walk_start intro
          animationName = 'Walk_start';
          this.hasStartedWalking = true;
          this._playAnimationOnce(animationName, () => {
            // After intro, play looping walk animation
            this._playAnimationLoop('Walk', 1.0);
          });
          return;
        } else {
          // Already walking, just update speed if needed
          animationName = 'Walk';
        }
        this.currentState = AnimationState.WALKING;
        this.isWalking = true;
        this._playAnimationLoop(animationName, speedMultiplier);
        return;

      case AnimationState.ATTACKING:
        // Alternate between Normal_attack_1 and Normal_attack_2
        this.lastAttackWasAttack1 = !this.lastAttackWasAttack1;
        animationName = this.lastAttackWasAttack1 ? 'Normal_attack_1' : 'Normal_attack_2';

        const speedVariation = this.attackSpeedVariation[this.lastAttackSpeedIndex];
        this.lastAttackSpeedIndex = (this.lastAttackSpeedIndex + 1) % this.attackSpeedVariation.length;
        const playbackSpeed = Math.max(0.01, speedVariation * speedMultiplier);

        this.currentState = AnimationState.ATTACKING;
        this._playAnimationOnce(animationName, () => {
          // After attack, return to current movement state
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        }, playbackSpeed);
        return;

      case AnimationState.ULTIMATE:
        // Ultimate sequence: tourbillon_start → tourbillon (loop) → troubillion_end
        animationName = 'tourbillon_start';
        this.currentState = AnimationState.ULTIMATE;
        this._playAnimationOnceWithSpeedRamp(animationName, 2.0, 4.0, () => {
          // After start, play looping mid animation
          const midGroup = this.animationGroups.get('tourbillon');
          if (midGroup) {
            midGroup.loopAnimation = true;
            midGroup.speedRatio = 4.0;
            midGroup.play(true);
            this.currentAnimation = 'tourbillon';
          }
          // Note: The end animation will be triggered by gameplay code (UltimateManager)
          // This allows the looping animation to continue until the ultimate ends
        });
        return;

      case AnimationState.SHIELD_BASH:
        animationName = 'Shield_BASH';
        this.currentState = AnimationState.SHIELD_BASH;
        this._playAnimationOnce(animationName, () => {
          // Shield bash is a burst move and should not loop shield stance.
          this.isShieldActive = false;
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        }, 4.0);
        return;

      case AnimationState.SHIELD_ACTIVATE:
        animationName = 'Shield_Up';
        this.currentState = AnimationState.SHIELD_ACTIVATE;
        this.isShieldActive = true;
        this._playAnimationOnce(animationName, () => {
          // After activation, play looping shield stance
          this._playAnimationLoop('Shield', 1.0);
          // Keep state as SHIELD_LOOP to maintain shield active state
          this.currentState = AnimationState.SHIELD_LOOP;
        });
        return;

      case AnimationState.SHIELD_DEACTIVATE:
        animationName = 'Shield_Down';
        this.currentState = AnimationState.SHIELD_DEACTIVATE;
        this.isShieldActive = false;
        this._playAnimationOnce(animationName, () => {
          // After deactivation, return to idle
          this.playAnimation(AnimationState.IDLE);
        });
        return;
      
      default:
        break;
    }

    this._playAnimationLoop(animationName, speedMultiplier);
  }

  /**
   * Play shield bash animation (tank only)
   */
  playShieldBash(): void {
    if (this.playerClass === 'firewall') {
      this.playAnimation(AnimationState.SHIELD_BASH);
    }
  }

  playTankPrimaryCombo(totalDurationSeconds: number): void {
    if (this.playerClass !== 'firewall') {
      this.playAnimation(AnimationState.ATTACKING);
      return;
    }

    const clipA = 'Normal_attack_1';
    const clipB = 'Normal_attack_2';
    const fullDuration = Math.max(0.1, totalDurationSeconds);
    const halfDuration = fullDuration * 0.5;

    const baseA = this.getAnimationBaseDuration(clipA);
    const baseB = this.getAnimationBaseDuration(clipB);
    const speedA = Math.max(0.35, Math.min(4.5, baseA / halfDuration));
    const speedB = Math.max(0.35, Math.min(4.5, baseB / halfDuration));

    this.currentState = AnimationState.ATTACKING;
    this._playAnimationOnce(clipA, () => {
      this._playAnimationOnce(clipB, () => {
        if (this.isWalking) {
          this.playAnimation(AnimationState.WALKING);
        } else {
          this.playAnimation(AnimationState.IDLE);
        }
      }, speedB);
    }, speedA);
  }

  /**
   * Activate shield stance (tank only)
   */
  activateShield(): void {
    if (this.playerClass === 'firewall' && !this.isShieldActive) {
      this.playAnimation(AnimationState.SHIELD_ACTIVATE);
    }
  }

  /**
   * Deactivate shield stance (tank only)
   */
  deactivateShield(): void {
    if (this.playerClass === 'firewall' && this.isShieldActive) {
      this.isShieldActive = false; // Mark shield as deactivating
      this.playAnimation(AnimationState.SHIELD_DEACTIVATE);
    }
  }

  /**
   * Play ultimate end animation (tank only)
   */
  playUltimateEnd(): void {
    if (this.playerClass === 'firewall' && this.currentState === AnimationState.ULTIMATE) {
      // Stop the looping mid animation and play the end animation
      const midGroup = this.animationGroups.get('tourbillon');
      if (midGroup?.isPlaying) {
        midGroup.stop();
      }

      const endGroup = this.animationGroups.get('troubillion_end');
      if (endGroup) {
        this._playAnimationOnceWithSpeedRamp('troubillion_end', 4.0, 2.0, () => {
          if (this.onUltimateAnimationFinished) {
            this.onUltimateAnimationFinished();
            this.onUltimateAnimationFinished = null;
          }
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        });
        this.currentAnimation = 'troubillion_end';
      }
    }
  }

  /**
   * Update animation based on player state
   * Called from PlayerController.update()
   */
  updateAnimationState(
    isMoving: boolean,
    isFiring: boolean,
    isUltimateActive: boolean
  ): void {
    void isFiring;

    // If ultimate becomes active, trigger animation (allow retrigger each time)
    if (isUltimateActive && !this.isUltimateActive) {
      this.playAnimation(AnimationState.ULTIMATE);
      this.isUltimateActive = true;
      return;
    }

    // If ultimate is no longer active, reset flag to allow next cast
    if (!isUltimateActive && this.isUltimateActive) {
      this.isUltimateActive = false;
      // Fall through to check other states
    }

    // Keep ultimate running until animation finishes
    if (this.currentState === AnimationState.ULTIMATE && this.isAnimationCurrentlyPlaying()) {
      return;
    }

    // Keep shield loop running (don't interrupt with attack animations)
    if (this.currentState === AnimationState.SHIELD_LOOP && this.isAnimationCurrentlyPlaying()) {
      return;
    }

    // If currently attacking but animation finished, allow state change
    if (this.currentState === AnimationState.ATTACKING && this.isAnimationCurrentlyPlaying()) {
      // Keep attacking until animation finishes
      return;
    }

    if (this.currentState === AnimationState.DASH && this.isAnimationCurrentlyPlaying()) {
      return;
    }

    if (
      (this.currentState === AnimationState.SHIELD_BASH ||
        this.currentState === AnimationState.SHIELD_ACTIVATE ||
        this.currentState === AnimationState.SHIELD_DEACTIVATE) &&
      this.isAnimationCurrentlyPlaying()
    ) {
      return;
    }

    // If attacking just finished, check movement state
    if (isMoving && this.currentState !== AnimationState.WALKING) {
      this.playAnimation(AnimationState.WALKING);
      return;
    }

    if (!isMoving && this.currentState !== AnimationState.IDLE && this.currentState !== AnimationState.ATTACKING && this.currentState !== AnimationState.DASH && !this.isShieldActive) {
        this.updateTankThrusterSceneScale();
        this.applyTankThrusterTuning(this.loadTankThrusterTuningFromConfig());
      this.playAnimation(AnimationState.IDLE);
      return;
    }
  }

  /**
   * Get the player mesh
   */
  getMesh(): Mesh | null {
    return this.mesh;
  }

  /**
   * Set callback to be called when ultimate animation finishes
   */
  setOnUltimateAnimationFinished(callback: (() => void) | null): void {
    this.onUltimateAnimationFinished = callback;
  }

  /**
   * Get the parent TransformNode (for positioning)
   */
  getParent(): TransformNode | null {
    return this.meshParent;
  }

  /**
   * Set position of the parent (world position of the model)
   */
  setPosition(position: Vector3): void {
    if (this.meshParent) {
      this.meshParent.position.copyFrom(position);
      // Preserve caller-provided world Y (used by void-fall offset),
      // then apply class-specific rig offset.
      this.meshParent.position.y = position.y + this.heightOffset;
    }
  }

  setVisibility(visibility: number): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(visibility) ? visibility : 1));

    if (this.mesh) {
      this.mesh.visibility = clamped;
    }

    if (this.meshParent) {
      const childMeshes = this.meshParent.getChildMeshes(false);
      for (const child of childMeshes) {
        child.visibility = clamped;
      }
    }
  }

  setHeightOffset(offset: number): void {
    this.heightOffset = offset;
    if (this.meshParent) {
      this.meshParent.position.y = 1.0 + offset;
    }
  }

  getHeightOffset(): number {
    return this.heightOffset;
  }

  /**
   * Get current animation state
   */
  getCurrentState(): AnimationState {
    return this.currentState;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.tankThrusterParticles) {
      this.tankThrusterParticles.stop();
      this.tankThrusterParticles.dispose();
      this.tankThrusterParticles = null;
    }
    if (this.tankThrusterTexture) {
      this.tankThrusterTexture.dispose();
      this.tankThrusterTexture = null;
    }
    if (this.tankThrusterAnchor) {
      this.tankThrusterAnchor.dispose();
      this.tankThrusterAnchor = null;
    }
    if (this.mesh) {
      this.mesh.dispose();
    }
    if (this.meshParent) {
      this.meshParent.dispose();
    }
    this.animationGroups.forEach((group) => {
      group.dispose();
    });
    this.animationGroups.clear();
  }

  // ============ Private helpers ============

  /**
   * Play animation once and call callback when finished
   */
  private _playAnimationOnce(
    animationName: string,
    onComplete?: () => void,
    speedMultiplier: number = 1.0
  ): void {
    const group = this.animationGroups.get(animationName);
    if (!group) {
      console.warn(`Animation group not found: ${animationName}`);
      return;
    }

    group.speedRatio = speedMultiplier;
    group.loopAnimation = false;

    if (onComplete) {
      // Register callback for when animation ends
      group.onAnimationGroupEndObservable.addOnce(() => {
        onComplete();
      });
    }

    group.play();
    this.currentAnimation = animationName;
  }

  /**
   * Play animation once with a linear speed ramp (e.g., x2 -> x4).
   */
  private _playAnimationOnceWithSpeedRamp(
    animationName: string,
    startSpeed: number,
    endSpeed: number,
    onComplete?: () => void
  ): void {
    const group = this.animationGroups.get(animationName);
    if (!group) {
      console.warn(`Animation group not found: ${animationName}`);
      return;
    }

    const firstTarget = group.targetedAnimations?.[0]?.animation;
    const from = typeof group.from === 'number' ? group.from : 0;
    const to = typeof group.to === 'number' ? group.to : from + 1;
    const frameSpan = Math.max(1, to - from);
    const fps = firstTarget?.framePerSecond ?? 60;
    const baseDuration = frameSpan / Math.max(1, fps);
    const averageSpeed = Math.max(0.01, (startSpeed + endSpeed) * 0.5);
    const rampDurationSeconds = Math.max(0.01, baseDuration / averageSpeed);

    group.loopAnimation = false;
    group.speedRatio = startSpeed;

    let elapsed = 0;
    let observer: Nullable<Observer<Scene>> = null;

    const cleanup = (): void => {
      if (observer) {
        this.scene.onBeforeRenderObservable.remove(observer);
        observer = null;
      }
    };

    observer = this.scene.onBeforeRenderObservable.add(() => {
      if (!group.isPlaying) {
        cleanup();
        return;
      }
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      elapsed += dt;
      const t = Math.max(0, Math.min(1, elapsed / rampDurationSeconds));
      group.speedRatio = startSpeed + (endSpeed - startSpeed) * t;
    });

    group.onAnimationGroupEndObservable.addOnce(() => {
      cleanup();
      if (onComplete) {
        onComplete();
      }
    });

    group.play(false);
    this.currentAnimation = animationName;
  }

  /**
   * Play animation in loop
   */
  private _playAnimationLoop(animationName: string, speedMultiplier: number = 1.0): void {
    const group = this.animationGroups.get(animationName);
    if (!group) {
      console.warn(`Animation group not found: ${animationName}`);
      return;
    }

    group.speedRatio = speedMultiplier;
    group.loopAnimation = true;
    group.play(true);  // Pass true to enable looping
    this.currentAnimation = animationName;
  }

  private getAnimationBaseDuration(animationName: string): number {
    const group = this.animationGroups.get(animationName);
    if (!group) {
      return 0.5;
    }

    const firstTarget = group.targetedAnimations?.[0]?.animation;
    const from = typeof group.from === 'number' ? group.from : 0;
    const to = typeof group.to === 'number' ? group.to : from + 1;
    const frameSpan = Math.max(1, to - from);
    const fps = firstTarget?.framePerSecond ?? 60;
    return frameSpan / Math.max(1, fps);
  }

  private getAnimationGroupBaseDuration(group: AnimationGroup | null | undefined): number {
    if (!group) {
      return 0.5;
    }
    const firstTarget = group.targetedAnimations?.[0]?.animation;
    const from = typeof group.from === 'number' ? group.from : 0;
    const to = typeof group.to === 'number' ? group.to : from + 1;
    const frameSpan = Math.max(1, to - from);
    const fps = firstTarget?.framePerSecond ?? 60;
    return frameSpan / Math.max(1, fps);
  }

  getPrimaryAttackBaseDurationSeconds(): number {
    if (this.playerClass === 'mage') {
      const a = this.getAnimationBaseDuration('Attack_1');
      const b = this.getAnimationBaseDuration('Attack_2');
      return Math.max(0.05, (a + b) * 0.5);
    }

    if (this.playerClass === 'firewall') {
      const a = this.getAnimationBaseDuration('Normal_attack_1');
      const b = this.getAnimationBaseDuration('Normal_attack_2');
      return Math.max(0.05, (a + b) * 0.5);
    }

    if (this.playerClass === 'rogue') {
      const a = this._findAnimationByName('attack1');
      const b = this._findAnimationByName('attack2');
      const da = this.getAnimationGroupBaseDuration(a);
      const db = this.getAnimationGroupBaseDuration(b);
      return Math.max(0.05, (da + db) * 0.5);
    }

    if (this.playerClass === 'cat') {
      const fallbackClip =
        this.animationGroups.get('Take 001') ??
        this.animationGroups.get('take 001') ??
        this.animationGroups.values().next().value;
      return this.getAnimationGroupBaseDuration(fallbackClip);
    }

    return 0.5;
  }

  getDashBaseDurationSeconds(): number {
    if (this.playerClass === 'rogue') {
      const dash = this._findAnimationByName('dash') ?? this._findAnimationByName('attack1') ?? this._findAnimationByName('attack2');
      return this.getAnimationGroupBaseDuration(dash);
    }

    if (this.playerClass === 'cat') {
      const fallbackClip =
        this.animationGroups.get('Take 001') ??
        this.animationGroups.get('take 001') ??
        this.animationGroups.values().next().value;
      return this.getAnimationGroupBaseDuration(fallbackClip);
    }

    return this.getPrimaryAttackBaseDurationSeconds();
  }

  /**
   * Create a thruster-like flame particle effect under tank model.
   * The emitter is parented to a child mesh (or fallback anchor), so it follows animations and rotations.
   */
  private _setupTankThrusterParticles(meshes: AbstractMesh[]): void {
    if (!this.mesh || !this.meshParent) return;

    this.tankThrusterAnchor = new TransformNode('tank_thruster_anchor', this.scene);
    this.tankThrusterAnchor.parent = this.meshParent;
    this.tankThrusterAnchor.position = Vector3.Zero();
    this.tankThrusterAnchor.position.copyFrom(this.tankThrusterIdleOffset);

    void meshes;

    const particles = new ParticleSystem('tank_thruster_particles', 1400, this.scene);
    const particleTexture = new DynamicTexture('tank_thruster_particle_texture', { width: 64, height: 64 }, this.scene, false);
    const ctx = particleTexture.getContext() as Canvas2DRenderingContext;
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,190,80,0.95)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    particleTexture.update();
    particles.particleTexture = particleTexture;
    this.tankThrusterTexture = particleTexture;
    particles.emitter = this.tankThrusterAnchor as unknown as AbstractMesh;
    // Local-space emission keeps the trail aligned to the tank orientation and removes world-axis bias.
    particles.isLocal = true;
    particles.layerMask = SCENE_LAYER;

    particles.minEmitBox = new Vector3(-0.035, -0.01, -0.045);
    particles.maxEmitBox = new Vector3(0.035, 0.01, 0.045);

    // Hot flame core + orange shell.
    particles.color1 = new Color4(1.0, 0.95, 0.75, 0.98);
    particles.color2 = new Color4(1.0, 0.42, 0.08, 0.9);
    particles.colorDead = new Color4(0.12, 0.03, 0.0, 0);

    particles.minSize = 0.2;
    particles.maxSize = 0.52;
    particles.minLifeTime = 0.02;  // Shortened from 0.07
    particles.maxLifeTime = 0.08;  // Shortened from 0.18
    particles.emitRate = 980;
    particles.blendMode = ParticleSystem.BLENDMODE_ONEONE;
    // Mild downward gravity, with local emission vectors adjusted from movement speed.
    particles.gravity = new Vector3(0, -0.8, 0);
    particles.direction1 = new Vector3(-0.08, 0.06, -0.35);
    particles.direction2 = new Vector3(0.08, 0.22, -0.68);
    particles.minEmitPower = 1.2;
    particles.maxEmitPower = 3.0;
    particles.minAngularSpeed = -12;
    particles.maxAngularSpeed = 12;
    particles.updateSpeed = 0.01;

    particles.start();
    this.tankThrusterParticles = particles;
  }

  applyTankThrusterTuning(tuning: { height: number; lateral: number; depth: number; size: number }): void {
    this.updateTankThrusterSceneScale();
    const scale = this.getTankThrusterRelativeScale();
    this.tankThrusterIdleOffset = new Vector3(tuning.lateral * scale, tuning.height * scale, tuning.depth * scale);
    this.tankThrusterMoveOffset = new Vector3(tuning.lateral * scale, tuning.height * scale, (tuning.depth + 0.10) * scale);
    this.tankThrusterBashOffset = new Vector3(tuning.lateral * scale, tuning.height * scale, (tuning.depth + 0.24) * scale);
    this.tankThrusterSizeMultiplier = Math.max(0.1, tuning.size);

    this.updateTankThrusterState(this.lastTankThrusterMoving, this.lastTankThrusterBashing);
  }

  private getTankThrusterRelativeScale(): number {
    return this.tankThrusterSceneScale;
  }

  private updateTankThrusterSceneScale(): void {
    if (!this.mesh) {
      this.tankThrusterSceneScale = 1;
      return;
    }

    const bounds = this.mesh.getHierarchyBoundingVectors(true);
    const visibleHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
    this.tankThrusterSceneScale = Math.max(0.45, Math.min(1, visibleHeight / 3.0));
  }

  private loadTankThrusterTuningFromConfig(): { height: number; lateral: number; depth: number; size: number } {
    const gameplayConfig = ConfigLoader.getInstance().getGameplayConfig();
    const tuning = gameplayConfig?.tankVisuals;
    return {
      height: tuning?.height ?? this.tankThrusterIdleOffset.y,
      lateral: tuning?.lateral ?? this.tankThrusterIdleOffset.x,
      depth: tuning?.depth ?? this.tankThrusterIdleOffset.z,
      size: tuning?.size ?? 1,
    };
  }

  updateTankThrusterState(isMoving: boolean, isBashing: boolean): void {
    if (this.playerClass !== 'firewall' || !this.tankThrusterParticles || !this.tankThrusterAnchor) {
      return;
    }

    this.lastTankThrusterMoving = isMoving;
    this.lastTankThrusterBashing = isBashing;

    const sizeScale = this.tankThrusterSizeMultiplier * this.getTankThrusterRelativeScale();

    if (isBashing) {
      this.tankThrusterAnchor.position.copyFrom(this.tankThrusterBashOffset);
      this.tankThrusterParticles.emitRate = 1550;
      this.tankThrusterParticles.minEmitPower = 2.4;
      this.tankThrusterParticles.maxEmitPower = 4.8;
      this.tankThrusterParticles.minSize = 0.24 * sizeScale;
      this.tankThrusterParticles.maxSize = 0.62 * sizeScale;
      return;
    }

    if (isMoving) {
      this.tankThrusterAnchor.position.copyFrom(this.tankThrusterMoveOffset);
      this.tankThrusterParticles.emitRate = 1150;
      this.tankThrusterParticles.minEmitPower = 1.45;
      this.tankThrusterParticles.maxEmitPower = 3.2;
      this.tankThrusterParticles.minSize = 0.2 * sizeScale;
      this.tankThrusterParticles.maxSize = 0.56 * sizeScale;
      return;
    }

    this.tankThrusterAnchor.position.copyFrom(this.tankThrusterIdleOffset);
    this.tankThrusterParticles.emitRate = 760;
    this.tankThrusterParticles.minEmitPower = 0.9;
    this.tankThrusterParticles.maxEmitPower = 2.2;
    this.tankThrusterParticles.minSize = 0.16 * sizeScale;
    this.tankThrusterParticles.maxSize = 0.44 * sizeScale;
  }

  /**
   * Update particle direction based on player velocity
   * Makes the flame trail follow backwards movement
   */
  updateTankThrusterVelocity(playerVelocity: Vector3): void {
    if (this.playerClass !== 'firewall' || !this.tankThrusterParticles) {
      return;
    }

    this.lastPlayerVelocity.copyFrom(playerVelocity);

    // Only use speed to modulate the trail; the particle direction stays local to the tank.
    const horizontalVelocity = new Vector3(playerVelocity.x, 0, playerVelocity.z);
    const velocityMagnitude = horizontalVelocity.length();
    
    if (velocityMagnitude > 0.1) {
      const speedFactor = Math.min(1.4, velocityMagnitude / 5.0);
      const backward = 0.95 + speedFactor * 1.1;
      const spread = 0.08 + speedFactor * 0.05;
      const rotateCounterClockwise = (vector: Vector3): Vector3 => new Vector3(-vector.z, vector.y, vector.x);

      // Rotate the plume 90° counter-clockwise when viewed from above.
      this.tankThrusterParticles.direction1 = rotateCounterClockwise(new Vector3(-spread, 0.05, -backward));
      this.tankThrusterParticles.direction2 = rotateCounterClockwise(new Vector3(spread, 0.24, -(backward + 0.28)));

      this.tankThrusterParticles.minEmitPower = 0.8 + speedFactor * 0.9;
      this.tankThrusterParticles.maxEmitPower = 1.8 + speedFactor * 1.7;
      this.tankThrusterParticles.minLifeTime = 0.02 + speedFactor * 0.015;
      this.tankThrusterParticles.maxLifeTime = 0.08 + speedFactor * 0.03;
    } else {
      // Idle: compact plume slightly backward, not into floor.
      const rotateCounterClockwise = (vector: Vector3): Vector3 => new Vector3(-vector.z, vector.y, vector.x);
      this.tankThrusterParticles.direction1 = rotateCounterClockwise(new Vector3(-0.05, 0.08, -0.35));
      this.tankThrusterParticles.direction2 = rotateCounterClockwise(new Vector3(0.05, 0.18, -0.58));
      this.tankThrusterParticles.minEmitPower = 0.8;
      this.tankThrusterParticles.maxEmitPower = 1.8;
      this.tankThrusterParticles.minLifeTime = 0.02;
      this.tankThrusterParticles.maxLifeTime = 0.08;
    }
  }

  /**
   * Try to locate the most likely thruster mesh by name + approximate location.
   */
  private _findTankThrusterAnchor(meshes: AbstractMesh[]): AbstractMesh | null {
    const exactLayer003 = meshes.find((mesh) => (mesh.name ?? '').toLowerCase() === 'layer.003') ?? null;
    if (exactLayer003) {
      return exactLayer003;
    }

    const keywords = ['thruster', 'reactor', 'engine', 'jet', 'booster', 'propulseur', 'reac', 'flame'];
    const bodyY = this.mesh?.getBoundingInfo().boundingBox.centerWorld.y ?? 1;

    let best: AbstractMesh | null = null;
    let bestScore = -Infinity;

    for (const mesh of meshes) {
      if (!mesh || mesh === this.meshParent) continue;

      const lowerName = (mesh.name ?? '').toLowerCase();
      const bounds = mesh.getBoundingInfo().boundingBox;
      const center = bounds.centerWorld;
      const ext = bounds.extendSizeWorld;
      const approxVolume = Math.max(0.00001, ext.x * ext.y * ext.z);

      let score = 0;
      if (keywords.some((keyword) => lowerName.includes(keyword))) score += 8;
      if (center.y < bodyY) score += 2;
      if (approxVolume < 1) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = mesh;
      }
    }

    return bestScore >= 2 ? best : null;
  }

  /**
   * Get list of available animations (for debugging)
   */
  getAvailableAnimations(): string[] {
    return Array.from(this.animationGroups.keys());
  }

  /**
   * Check if a specific animation exists
   */
  hasAnimation(name: string): boolean {
    return this.animationGroups.has(name);
  }

  /**
   * Rotate the model to face a direction (8-directional)
   * Direction is a normalized Vector3 in 3D space
   * Rotation is applied to parent TransformNode, not the mesh directly
   */
  rotateTowardDirection(direction: Vector3): void {
    if (!this.meshParent || direction.lengthSquared() < 0.0001) {
      return;
    }

    // Calculate target angle from direction vector
    // Front direction convention: positive Z is forward
    // Apply -90° offset for model orientation + permanent rotation offset
    this.targetRotationY = Math.atan2(direction.x, direction.z) - Math.PI / 2 + this.rotationOffsetY;
  }

  /**
   * Update rotation smoothly toward target (call this every frame)
   * Should be called from PlayerController.update()
   */
  updateRotation(deltaTime: number): void {
    if (!this.meshParent) return;

    const currentRotation = this.meshParent.rotation.y;
    const diff = this.targetRotationY - currentRotation;

    // Normalize angle difference to [-PI, PI] for shortest path
    const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
    
    // Calculate max rotation for this frame
    const maxRotation = this.rotationSpeed * deltaTime;
    
    // Interpolate towards target
    if (Math.abs(normalizedDiff) > maxRotation) {
      // Still rotating - apply max rotation in correct direction
      this.meshParent.rotation.y += Math.sign(normalizedDiff) * maxRotation;
    } else {
      // Close enough - snap to target
      this.meshParent.rotation.y = this.targetRotationY;
    }
  }

  /**
   * Check if current animation is still playing
   */
  isAnimationCurrentlyPlaying(): boolean {
    if (!this.currentAnimation) return false;
    const group = this.animationGroups.get(this.currentAnimation);
    return group ? group.isPlaying : false;
  }

  /**
   * Debug: Log mesh hierarchy
   */
  debugMeshHierarchy(): void {
    if (!this.mesh) return;
    console.log(`🔍 === MESH DEBUG ===`);
    console.log(`Mesh: ${this.mesh.name}`);
    console.log(`  Position: ${this.mesh.position.x}, ${this.mesh.position.y}, ${this.mesh.position.z}`);
    console.log(`  Rotation: ${this.mesh.rotation.x}, ${this.mesh.rotation.y}, ${this.mesh.rotation.z}`);
    console.log(`  Scaling: ${this.mesh.scaling.x}, ${this.mesh.scaling.y}, ${this.mesh.scaling.z}`);
    console.log(`  Children: ${this.mesh.getChildren().length}`);
    
    this.mesh.getChildren().forEach((child, idx) => {
      console.log(`  [${idx}] ${child.name}`);
      console.log(`      Type: ${child.constructor.name}`);
      if ('rotation' in child) {
        const rot = child as { rotation: Vector3 };
        console.log(`      Rotation: ${rot.rotation.x}, ${rot.rotation.y}, ${rot.rotation.z}`);
      }
    });
  }
}
