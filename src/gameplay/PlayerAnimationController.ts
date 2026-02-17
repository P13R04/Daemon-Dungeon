/**
 * PlayerAnimationController - Manages player character animations
 * Handles loading mage.glb and managing animation states with proper prioritization
 */

import { Scene, Mesh, AnimationGroup, SceneLoader, Vector3 } from '@babylonjs/core';

export enum AnimationState {
  IDLE = 'idle',
  WALKING = 'walking',
  ATTACKING = 'attacking',
  ULTIMATE = 'ultimate',
}

export interface AnimationTransition {
  from: AnimationState;
  to: AnimationState;
  // Play intro animation? (e.g., Start_walking before walking)
  useIntro?: boolean;
}

export class PlayerAnimationController {
  private mesh: Mesh | null = null;
  private scene: Scene;
  private animationGroups: Map<string, AnimationGroup> = new Map();

  // Current animation state
  private currentState: AnimationState = AnimationState.IDLE;
  private currentAnimation: string = '';
  private isTransitioning: boolean = false;

  // Attack animation alternation and speed variation
  private lastAttackWasAttack1: boolean = false;
  private attackSpeedVariation: number[] = [0.8, 0.9, 1.0, 1.1, 1.2]; // Speed multipliers
  private lastAttackSpeedIndex: number = 0;

  // Walking state tracking
  private isWalking: boolean = false;
  private hasStartedWalking: boolean = false;

  // Animation transition settings
  private readonly FADE_DURATION = 0.1; // seconds
  private readonly ATTACK_SPEED_INTERVAL = 200; // ms between speed changes

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Load the mage.glb model and extract animation groups
   */
  async loadModel(modelPath: string = 'assets/models/player/'): Promise<Mesh> {
    try {
      const result = await SceneLoader.ImportMeshAsync('', modelPath, 'mage.glb', this.scene);

      this.mesh = result.meshes[0] as Mesh;
      this.mesh.name = 'player_mage';

      // Extract all animation groups
      result.animationGroups.forEach((group) => {
        this.animationGroups.set(group.name, group);
        console.log(`✓ Loaded animation: ${group.name}`);
      });

      console.log(`✓ Player model loaded: ${this.mesh.name}, animations: ${this.animationGroups.size}`);

      // Initialize with Idle animation
      this.playAnimation(AnimationState.IDLE);

      return this.mesh;
    } catch (error) {
      console.error('Failed to load mage model:', error);
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

    let animationName = '';

    switch (state) {
      case AnimationState.IDLE:
        animationName = 'Idle.001';
        this.currentState = AnimationState.IDLE;
        this.isWalking = false;
        this.hasStartedWalking = false;
        break;

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
        const framesToWait = Date.now() % this.ATTACK_SPEED_INTERVAL;
        const speedVariation = this.attackSpeedVariation[this.lastAttackSpeedIndex];
        this.lastAttackSpeedIndex = (this.lastAttackSpeedIndex + 1) % this.attackSpeedVariation.length;

        this.currentState = AnimationState.ATTACKING;
        this._playAnimationOnce(animationName, () => {
          // After attack, return to current movement state
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        }, speedVariation);
        return;

      case AnimationState.ULTIMATE:
        animationName = 'Ultime';
        this.currentState = AnimationState.ULTIMATE;
        this._playAnimationOnce(animationName, () => {
          // After ultimate, return to current movement state
          if (this.isWalking) {
            this.playAnimation(AnimationState.WALKING);
          } else {
            this.playAnimation(AnimationState.IDLE);
          }
        });
        return;
    }

    this._playAnimationLoop(animationName, speedMultiplier);
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
    // Priority: Ultimate > Attack > Movement > Idle
    if (isUltimateActive && this.currentState !== AnimationState.ULTIMATE) {
      this.playAnimation(AnimationState.ULTIMATE);
      return;
    }

    // Attack takes priority over movement
    if (isFiring && this.currentState !== AnimationState.ATTACKING) {
      this.playAnimation(AnimationState.ATTACKING);
      return;
    }

    // If attacking just finished, check movement state
    if (isMoving && this.currentState !== AnimationState.WALKING) {
      this.playAnimation(AnimationState.WALKING);
      return;
    }

    // Return to idle when not moving/attacking
    if (!isMoving && this.currentState !== AnimationState.IDLE && this.currentState !== AnimationState.ATTACKING) {
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
   * Get current animation state
   */
  getCurrentState(): AnimationState {
    return this.currentState;
  }

  /**
   * Position the mesh at a given location
   */
  setPosition(position: Vector3): void {
    if (this.mesh) {
      this.mesh.position.copyFrom(position);
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
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
    group.play();
    this.currentAnimation = animationName;
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
}
