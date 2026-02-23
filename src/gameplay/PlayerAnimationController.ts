/**
 * PlayerAnimationController - Manages player character animations
 * Handles loading mage.glb and managing animation states with proper prioritization
 */

import { Scene, Mesh, AnimationGroup, SceneLoader, Vector3, TransformNode } from '@babylonjs/core';

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
  private meshParent: TransformNode | null = null;  // Parent for rotation/position
  private scene: Scene;
  private animationGroups: Map<string, AnimationGroup> = new Map();

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
  
  // Height adjustment
  private heightOffset: number = -2; // Adjustable height offset (default -2 for mage)

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

      // Scale down model by factor of 10
      this.mesh.scaling.scaleInPlace(0.1);

      // Create parent TransformNode for rotation and position management
      // This avoids animation keyframes overriding our rotation
      this.meshParent = new TransformNode('player_mage_parent', this.scene);
      this.meshParent.position.y = 1.0 + this.heightOffset;
      
      // Set mesh local position to 0 (parent controls world position)
      this.mesh.parent = this.meshParent;
      this.mesh.position = Vector3.Zero();

      // Debug: log all meshes loaded
      console.log(`📦 Total meshes loaded: ${result.meshes.length}`);
      result.meshes.forEach((m, idx) => {
        console.log(`   [${idx}] ${m.name} (children: ${m.getChildren().length})`);
      });

      // Extract all animation groups
      result.animationGroups.forEach((group) => {
        this.animationGroups.set(group.name, group);
        console.log(`✓ Loaded animation: ${group.name}`);
      });

      console.log(`✓ Player model loaded: ${this.mesh.name}, animations: ${this.animationGroups.size}, scale: 0.1`);
      console.log(`✓ Parent TransformNode created for rotation management`);

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

    // Attack takes priority over movement
    // BUT: if attack animation is still playing, let it finish
    if (isFiring && this.currentState !== AnimationState.ATTACKING) {
      this.playAnimation(AnimationState.ATTACKING);
      return;
    }

    // If currently attacking but animation finished, allow state change
    if (this.currentState === AnimationState.ATTACKING && this.isAnimationCurrentlyPlaying()) {
      // Keep attacking until animation finishes
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
      this.meshParent.position.y = 1.0 + this.heightOffset; // Ensure correct height with offset
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
    // Apply -90° offset for model orientation
    this.targetRotationY = Math.atan2(direction.x, direction.z) - Math.PI / 2;
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
        const rot = child as any;
        console.log(`      Rotation: ${rot.rotation.x}, ${rot.rotation.y}, ${rot.rotation.z}`);
      }
    });
  }
}
