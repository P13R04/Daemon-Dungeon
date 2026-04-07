/**
 * InputManager - Handles all player input
 */

import { Vector3, Scene, PointerEventTypes } from '@babylonjs/core';
import {
  GameSettings,
  GameSettingsStore,
  KeybindingAction,
  Keybindings,
  normalizeInputKey,
} from '../settings/GameSettings';

export class InputManager {
  private keys: Set<string> = new Set();
  private keysPressedThisFrame: Set<string> = new Set();
  private mousePosition: Vector3 = Vector3.Zero();
  private mouseClick: boolean = false;
  private mouseClickThisFrame: boolean = false;
  private rightMouseClick: boolean = false;
  private rightMouseClickThisFrame: boolean = false;
  private canvas: HTMLCanvasElement | null = null;
  private scene: Scene | null = null;
  private keybindings: Keybindings = GameSettingsStore.get().controls.keybindings;
  private keyboardOnlyMode: boolean = GameSettingsStore.get().controls.keyboardOnlyMode;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(canvas?: HTMLCanvasElement, scene?: Scene) {
    this.canvas = canvas || null;
    this.scene = scene || null;
    this.applySettings(GameSettingsStore.get());
    this.unsubscribeSettings = GameSettingsStore.subscribe((settings) => {
      this.applySettings(settings);
    });
    this.setupKeyboardListeners();
    // Mouse listeners will be attached later via attachMouseListeners()
  }

  dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = null;
    }
  }

  /**
   * Attach mouse listeners to canvas (call this AFTER scene is created)
   */
  public attachMouseListeners(): void {
    this.setupMouseListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      const key = normalizeInputKey(e.key);
      if (!key) return;

      if (!this.keys.has(key)) {
        this.keysPressedThisFrame.add(key);
      }
      this.keys.add(key);

      if (this.shouldPreventBrowserDefault(key)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = normalizeInputKey(e.key);
      if (!key) return;
      this.keys.delete(key);
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
          } else if (evt.button === 2) {
            evt.preventDefault();
            this.rightMouseClickThisFrame = true;
            this.rightMouseClick = true;
          }
        }

        if (pointerInfo.type === PointerEventTypes.POINTERUP) {
          if (evt.button === 0) {
            this.mouseClick = false;
          } else if (evt.button === 2) {
            this.rightMouseClick = false;
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
      } else if (e.button === 2) {
        e.preventDefault();
        this.rightMouseClickThisFrame = true;
        this.rightMouseClick = true;
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
        } else if (e.button === 2) {
          this.rightMouseClick = false;
        }
      });

      this.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
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
      } else if (e.button === 2) {
        this.rightMouseClick = false;
      }
    });
  }

  /**
   * Get movement input (WASD or ZQSD)
   * Returns normalized direction vector
   */
  getMovementInput(): Vector3 {
    const input = new Vector3();

    if (this.isActionHeld('moveUp')) input.z += 1;
    if (this.isActionHeld('moveDown')) input.z -= 1;
    if (this.isActionHeld('moveLeft')) input.x -= 1;
    if (this.isActionHeld('moveRight')) input.x += 1;

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
    if (this.keyboardOnlyMode) return false;
    return this.mouseClick;
  }

  /**
   * Check if mouse button was clicked this frame
   */
  isMouseClickedThisFrame(): boolean {
    if (this.keyboardOnlyMode) {
      this.mouseClickThisFrame = false;
      return false;
    }
    const result = this.mouseClickThisFrame;
    this.mouseClickThisFrame = false;
    return result;
  }

  isRightMouseDown(): boolean {
    if (this.keyboardOnlyMode) return false;
    return this.rightMouseClick;
  }

  isRightMouseClickedThisFrame(): boolean {
    if (this.keyboardOnlyMode) {
      this.rightMouseClickThisFrame = false;
      return false;
    }
    const result = this.rightMouseClickThisFrame;
    this.rightMouseClickThisFrame = false;
    return result;
  }

  /**
   * Check if space was pressed this frame (one-shot, resets after read)
   */
  isSpacePressed(): boolean {
    return this.isActionPressedThisFrame('ultimate');
  }

  /**
   * Check if space is currently held down (continuous, no reset)
   * Use this for checking ongoing input states like Ultimate charge
   */
  isSpaceHeld(): boolean {
    return this.isActionHeld('ultimate');
  }

  /**
   * Check if a key is currently held
   */
  isKeyDown(key: string): boolean {
    return this.keys.has(normalizeInputKey(key));
  }

  isKeyPressedThisFrame(key: string): boolean {
    return this.keysPressedThisFrame.has(normalizeInputKey(key));
  }

  isAttackSlotHeld(slot: 1 | 2): boolean {
    return slot === 1 ? this.isActionHeld('shoot') : this.isActionHeld('posture');
  }

  isAttackSlotPressedThisFrame(slot: 1 | 2): boolean {
    return slot === 1 ? this.isActionPressedThisFrame('shoot') : this.isActionPressedThisFrame('posture');
  }

  isItemHeld(slot: 1 | 2): boolean {
    return slot === 1 ? this.isActionHeld('item1') : this.isActionHeld('item2');
  }

  isItemPressedThisFrame(slot: 1 | 2): boolean {
    return slot === 1 ? this.isActionPressedThisFrame('item1') : this.isActionPressedThisFrame('item2');
  }

  setAttackSlotBindings(bindings: Partial<Record<1 | 2, string[]>>): void {
    const slot1 = bindings[1];
    const slot2 = bindings[2];
    if (Array.isArray(slot1) && slot1.length > 0) {
      this.keybindings.shoot = normalizeInputKey(slot1[0]);
    }
    if (Array.isArray(slot2) && slot2.length > 0) {
      this.keybindings.posture = normalizeInputKey(slot2[0]);
    }
  }

  isKeyboardOnlyMode(): boolean {
    return this.keyboardOnlyMode;
  }

  /**
   * Reset frame-specific input
   */
  updateFrame(): void {
    this.mouseClickThisFrame = false;
    this.rightMouseClickThisFrame = false;
    this.keysPressedThisFrame.clear();
  }

  private applySettings(settings: GameSettings): void {
    this.keybindings = {
      ...settings.controls.keybindings,
    };
    this.keyboardOnlyMode = !!settings.controls.keyboardOnlyMode;
  }

  private shouldPreventBrowserDefault(key: string): boolean {
    if (key === 'space') return true;
    if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') return true;

    const actions: KeybindingAction[] = ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'shoot', 'posture', 'ultimate', 'item1', 'item2'];
    return actions.some((action) => this.keybindings[action] === key);
  }

  private isActionHeld(action: KeybindingAction): boolean {
    const key = this.keybindings[action];
    return this.isPhysicalBindingHeld(key);
  }

  private isActionPressedThisFrame(action: KeybindingAction): boolean {
    const key = this.keybindings[action];
    return this.isPhysicalBindingPressedThisFrame(key);
  }

  private isPhysicalBindingHeld(key: string): boolean {
    const normalized = normalizeInputKey(key);
    if (normalized === 'mouse0') return this.keyboardOnlyMode ? false : this.mouseClick;
    if (normalized === 'mouse2') return this.keyboardOnlyMode ? false : this.rightMouseClick;
    return this.keys.has(normalized);
  }

  private isPhysicalBindingPressedThisFrame(key: string): boolean {
    const normalized = normalizeInputKey(key);
    if (normalized === 'mouse0') {
      if (this.keyboardOnlyMode) {
        this.mouseClickThisFrame = false;
        return false;
      }
      const value = this.mouseClickThisFrame;
      this.mouseClickThisFrame = false;
      return value;
    }
    if (normalized === 'mouse2') {
      if (this.keyboardOnlyMode) {
        this.rightMouseClickThisFrame = false;
        return false;
      }
      const value = this.rightMouseClickThisFrame;
      this.rightMouseClickThisFrame = false;
      return value;
    }
    return this.keysPressedThisFrame.has(normalized);
  }
}
