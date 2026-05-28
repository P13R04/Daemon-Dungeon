/**
 * DaemonGlitchFx — Embedded per-button glitch effects.
 *
 * Injects child controls INSIDE each button:
 *   - tearSlab: an opaque band at a random Y, displaced in X — simulates
 *     a real screen tear where a horizontal slice of content shifts sideways.
 *     No colored line; just displacement that lasts ~450ms then resets.
 *   - ghost: duplicate text offset in X (chromatic feel), shown briefly.
 *   - click: rapid color flicker with displaced ghost, then delayed callback.
 */

import { Button, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { UITheme } from './UITheme';

export class DaemonGlitchFx {
  dispose(): void {}

  /**
   * Injects tear + ghost effects into a BabylonJS Button.
   * The onClick callback fires after a short glitch animation on click.
   *
   * @param btn        Target button
   * @param label      Button text (for ghost duplicate)
   * @param onClick    Callback fired after the click animation
   * @param clickDelay ms delay before firing onClick (0 = immediate)
   */
  static inject(btn: Button, label: string, onClick: () => void, clickDelay = 220): void {
    DaemonGlitchFx.injectWithOptions(btn, label, onClick, { clickDelayMs: clickDelay, enableHoverGlitch: true });
  }

  static injectWithOptions(
    btn: Button,
    label: string,
    onClick: () => void,
    options?: { clickDelayMs?: number; enableHoverGlitch?: boolean; hoverBackground?: string }
  ): void {
    const clickDelay = Math.max(0, options?.clickDelayMs ?? 220);
    const enableHoverGlitch = options?.enableHoverGlitch !== false;
    const hoverBackground = options?.hoverBackground ?? UITheme.colors.hoverBg;
    const baseBackground = (btn as Button & { __daemonBaseBackground?: string }).__daemonBaseBackground
      ?? btn.background;
    const baseColor = (btn as Button & { __daemonBaseColor?: string }).__daemonBaseColor
      ?? btn.color;
    const baseTextColor = btn.textBlock?.color;

    (btn as Button & { __daemonBaseBackground?: string }).__daemonBaseBackground = baseBackground;
    (btn as Button & { __daemonBaseColor?: string }).__daemonBaseColor = baseColor;
    if (btn.textBlock) {
      (btn.textBlock as TextBlock & { __daemonBaseColor?: string }).__daemonBaseColor = baseTextColor;
    }

    // ── Tear slab ─────────────────────────────────────────────────────────────
    // An opaque band at the button's background color, positioned at a random Y,
    // displaced in X to simulate a torn horizontal slice of the button content.
    const slab = new Rectangle(`${btn.name}_slab`);
    slab.background          = UITheme.colors.bgPanelSolid; // opaque version of btn bg
    slab.thickness           = 0;
    slab.isHitTestVisible    = false;
    slab.isPointerBlocker    = false;
    slab.isVisible           = false;
    slab.verticalAlignment   = Control.VERTICAL_ALIGNMENT_TOP;
    slab.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    slab.zIndex              = 5; // above btn bg, below text
    btn.addControl(slab);

    // Duplicate text inside the slab (shows the displaced content)
    const slabText = new TextBlock(`${btn.name}_slabText`);
    slabText.text       = label;
    slabText.color      = UITheme.colors.textNormal;
    slabText.fontSize   = UITheme.fonts.normalSize;
    slabText.fontFamily = UITheme.fonts.primary;
    slabText.isHitTestVisible = false;
    slab.addControl(slabText);

    // ── Ghost text (chromatic offset) ─────────────────────────────────────────
    const ghost = new TextBlock(`${btn.name}_ghost`);
    ghost.text             = label;
    ghost.color            = '#FF2255';
    ghost.fontSize         = UITheme.fonts.normalSize;
    ghost.fontFamily       = UITheme.fonts.primary;
    ghost.left             = '0px';
    ghost.alpha            = 0;
    ghost.isHitTestVisible = false;
    ghost.zIndex           = 6;
    btn.addControl(ghost);

    // Ensure main text is above both
    if (btn.textBlock) btn.textBlock.zIndex = 10;

    // ── State ─────────────────────────────────────────────────────────────────
    let tearHandle: ReturnType<typeof setTimeout> | null = null;
    let clicking = false;

    const resetSlab = () => {
      slab.isVisible = false;
      slab.left      = '0px';
    };

    const resetGhost = () => {
      ghost.alpha = 0;
      ghost.left  = '0px';
    };

    /** Fire a single tear burst: random Y, random X displacement, auto-reset */
    const fireTear = (btnHeightPx: number, intensityMult = 1) => {
      const slabH   = 8 + Math.floor(Math.random() * 20);          // 8–28 px band
      const slabY   = 4 + Math.floor(Math.random() * (btnHeightPx - slabH - 8));
      const dir     = Math.random() > 0.5 ? 1 : -1;
      const shiftPx = dir * Math.round((5 + Math.random() * 10) * intensityMult);

      slab.height    = `${slabH}px`;
      slab.top       = `${slabY}px`;
      slab.left      = `${shiftPx}px`;
      slab.width     = '100%';
      slab.isVisible = true;

      // Ghost shows in OPPOSITE direction (chromatic split)
      ghost.alpha = 0.40 * intensityMult;
      ghost.left  = `${-shiftPx * 0.5}px`;

      const duration = 350 + Math.floor(Math.random() * 150); // 350–500 ms
      if (tearHandle) clearTimeout(tearHandle);
      tearHandle = setTimeout(() => {
        resetSlab();
        resetGhost();
        tearHandle = null;
      }, duration);
    };

    // ── Hover in ──────────────────────────────────────────────────────────────
    btn.onPointerEnterObservable.add(() => {
      if (clicking) return;
      btn.background = hoverBackground;
      if (enableHoverGlitch) {
        // Approximate button height; main buttons are 46px, others vary
        const h = parseFloat(btn.height as string) || 46;
        fireTear(h, 1);
      }
    });

    // ── Hover out ─────────────────────────────────────────────────────────────
    btn.onPointerOutObservable.add(() => {
      if (clicking) return;
      btn.background = (btn as Button & { __daemonBaseBackground?: string }).__daemonBaseBackground ?? baseBackground;
      btn.color = (btn as Button & { __daemonBaseColor?: string }).__daemonBaseColor ?? baseColor;
      if (btn.textBlock) {
        const textBaseColor = (btn.textBlock as TextBlock & { __daemonBaseColor?: string }).__daemonBaseColor ?? baseTextColor;
        if (textBaseColor) {
          btn.textBlock.color = textBaseColor;
        }
      }
      // Don't cancel the tear — let it finish naturally for 400ms effect
    });

    // ── Click ─────────────────────────────────────────────────────────────────
    btn.onPointerDownObservable.add(() => {
      if (clicking) return;
      clicking = true;
      if (tearHandle) { clearTimeout(tearHandle); tearHandle = null; }
      resetSlab();
      resetGhost();

      // Intense color flicker sequence
      const seq: Array<[string, string]> = [
        ['#FF003C', 'rgba(255,0,60,0.45)'],
        ['#FFFFFF', 'rgba(70,120,255,0.25)'],
        ['#CC00FF', 'rgba(204,0,255,0.30)'],
        ['#FF003C', 'rgba(255,0,60,0.50)'],
        ['#5AA7FF', 'rgba(70,120,255,0.20)'],
        ['#FFFFFF', 'rgba(0,0,0,0.40)'],
      ];
      const step = Math.max(20, Math.floor((clickDelay || 220) / seq.length));
      let i = 0;
      const h = parseFloat(btn.height as string) || 46;

      const flicker = () => {
        if (i < seq.length) {
          const [c, bg] = seq[i++];
          btn.color      = c;
          btn.background = bg;
          // Re-fire a tear for each flicker frame (intense burst)
          fireTear(h, 1.5);
          tearHandle = setTimeout(flicker, step);
        } else {
          btn.color      = (btn as Button & { __daemonBaseColor?: string }).__daemonBaseColor ?? baseColor;
          btn.background = (btn as Button & { __daemonBaseBackground?: string }).__daemonBaseBackground ?? baseBackground;
          if (btn.textBlock) {
            const textBaseColor = (btn.textBlock as TextBlock & { __daemonBaseColor?: string }).__daemonBaseColor ?? baseTextColor;
            if (textBaseColor) {
              btn.textBlock.color = textBaseColor;
            }
          }
          ghost.alpha    = 0;
          slab.isVisible = false;
          clicking = false;
          if (clickDelay > 0) {
            onClick();
          } else {
            onClick();
          }
        }
      };

      flicker();
    });
  }
}
