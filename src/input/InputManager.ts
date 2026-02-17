/**
 * InputManager - Handles all player input
 */

import { Vector3, Scene, PointerEventTypes } from '@babylonjs/core';

export class InputManager {
  private keys: Set<string> = new Set();
  private mousePosition: Vector3 = Vector3.Zero();
  private mouseClick: boolean = false;
  private mouseClickThisFrame: boolean = false;
  private spacePressed: boolean = false;
  private spacePressedThisFrame: boolean = false;
  private canvas: HTMLCanvasElement | null = null;
  private scene: Scene | null = null;

  constructor(canvas?: HTMLCanvasElement, scene?: Scene) {
    this.canvas = canvas || null;
    this.scene = scene || null;
    this.setupKeyboardListeners();
    // Mouse listeners will be attached later via attachMouseListeners()
  }

  /**
   * Attach mouse listeners to canvas (call this AFTER scene is created)
   */
  public attachMouseListeners(): void {
    this.setupMouseListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      
      if (e.key === ' ') {
        e.preventDefault();
        if (!this.spacePressed) {
          this.spacePressedThisFrame = true;
          this.spacePressed = true;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      
      if (e.key === ' ') {
        this.spacePressed = false;
      }
    });
  }

  private setupMouseListeners(): void {
    if (this.scene) {
      this.scene.onPointerObservable.add((pointerInfo) => {
        const evt = pointerInfo.event as PointerEvent;
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
          if (evt.button === 0) {
            this.mouseClickThisFrame = true;
            this.mouseClick = true;
          }
        }

        if (pointerInfo.type === PointerEventTypes.POINTERUP) {
          if (evt.button === 0) {
            this.mouseClick = false;
          }
        }

        if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
          const canvas = this.scene?.getEngine().getRenderingCanvas();
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            this.mousePosition = new Vector3(evt.clientX - rect.left, evt.clientY - rect.top, 0);
          } else {
            this.mousePosition = new Vector3(evt.clientX, evt.clientY, 0);
          }
        }
      });
      return;
    }
    
    const mousedownHandler = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        this.mouseClickThisFrame = true;
        this.mouseClick = true;
      }
    };

    if (this.canvas) {
      this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
        const rect = this.canvas?.getBoundingClientRect();
        if (rect) {
          this.mousePosition = new Vector3(e.clientX - rect.left, e.clientY - rect.top, 0);
        } else {
          this.mousePosition = new Vector3(e.clientX, e.clientY, 0);
        }
      });

      this.canvas.addEventListener('mousedown', mousedownHandler);

      this.canvas.addEventListener('mouseup', (e: MouseEvent) => {
        if (e.button === 0) {
          this.mouseClick = false;
        }
      });
      return;
    }

    window.addEventListener('mousemove', (e: MouseEvent) => {
      this.mousePosition = new Vector3(e.clientX, e.clientY, 0);
    });

    window.addEventListener('mousedown', mousedownHandler);

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseClick = false;
      }
    });
  }

  /**
   * Get movement input (WASD or ZQSD)
   * Returns normalized direction vector
   */
  getMovementInput(): Vector3 {
    const input = new Vector3();

    if (this.keys.has('w') || this.keys.has('z')) input.z += 1;
    if (this.keys.has('s')) input.z -= 1;
    if (this.keys.has('a') || this.keys.has('q')) input.x -= 1;
    if (this.keys.has('d')) input.x += 1;

    if (input.length() > 0) {
      return input.normalize();
    }

    return Vector3.Zero();
  }

  /**
   * Get mouse position in screen space
   */
  getMousePosition(): Vector3 {
    return this.mousePosition;
  }

  /**
   * Check if mouse button is held down
   */
  isMouseDown(): boolean {
    return this.mouseClick;
  }

  /**
   * Check if mouse button was clicked this frame
   */
  isMouseClickedThisFrame(): boolean {
    const result = this.mouseClickThisFrame;
    this.mouseClickThisFrame = false;
    return result;
  }

  /**
   * Check if space was pressed this frame (one-shot, resets after read)
   */
  isSpacePressed(): boolean {
    const result = this.spacePressedThisFrame;
    this.spacePressedThisFrame = false;
    return result;
  }

  /**
   * Check if space is currently held down (continuous, no reset)
   * Use this for checking ongoing input states like Ultimate charge
   */
  isSpaceHeld(): boolean {
    return this.spacePressed;
  }

  /**
   * Check if a key is currently held
   */
  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  /**
   * Reset frame-specific input
   */
  updateFrame(): void {
    this.mouseClickThisFrame = false;
    this.spacePressedThisFrame = false;
  }
}
