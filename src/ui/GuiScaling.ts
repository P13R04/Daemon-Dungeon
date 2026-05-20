import type { AdvancedDynamicTexture } from '@babylonjs/gui';
import type { Engine } from '@babylonjs/core';

/**
 * Design resolution — the 16:9 virtual canvas for all UI layouts.
 * All pixel values in the codebase are expressed in this coordinate space.
 */
export const DESIGN_WIDTH  = 1920;
export const DESIGN_HEIGHT = 1080;

/**
 * CSS pixel width below which the screen is considered "mobile/small".
 * 700 CSS px covers landscape phones (iPhone landscape ≈ 667–932px CSS).
 */
const MOBILE_BREAKPOINT_CSS_PX = 700;

function getCssWidth(engine: Engine): number {
  const canvas = engine.getRenderingCanvas();
  // clientWidth is the CSS layout size — DPR-independent, cheap to read.
  return canvas ? (canvas.clientWidth || canvas.offsetWidth || DESIGN_WIDTH) : DESIGN_WIDTH;
}

/**
 * Configure a fullscreen GUI texture for sharp, responsive rendering.
 *
 * Key insight:
 *   With `renderAtIdealSize = false` the GUI texture is drawn at the canvas's
 *   current render resolution (= CSS size, since adaptToDeviceRatio is off).
 *   This gives sharp text/borders — no upscale artefacts.
 *
 *   `idealWidth / idealHeight` define the virtual coordinate space.
 *   On small screens we halve the ideal dimensions (960×540 instead of 1920×1080).
 *   This means a 24px font in "design space" renders as 24 × (renderWidth/960) px
 *   on mobile, vs 24 × (renderWidth/1920) px on desktop — twice as large, keeping
 *   controls comfortably legible without touching any layout code.
 *
 * Returns the ideal dimensions that were applied so callers can use them in
 * their own `updateScale` callbacks (avoiding a stale DESIGN_WIDTH mismatch).
 */
export function applyResponsiveGuiScaling(
  gui: AdvancedDynamicTexture,
  engine: Engine,
): { idealWidth: number; idealHeight: number } {
  const cssWidth  = getCssWidth(engine);
  const isMobile  = cssWidth < MOBILE_BREAKPOINT_CSS_PX;

  const idealWidth  = isMobile ? 960  : DESIGN_WIDTH;
  const idealHeight = isMobile ? 540  : DESIGN_HEIGHT;

  gui.idealWidth        = idealWidth;
  gui.idealHeight       = idealHeight;
  gui.useSmallestIdeal  = true;
  gui.renderAtIdealSize = false; // render at native canvas resolution → crisp
  gui.renderScale       = 1;

  return { idealWidth, idealHeight };
}

/**
 * Compute the uniform scale to apply to a fixed-size layout container
 * (e.g. a 1920×1080 Rectangle) so it letter-boxes inside the GUI surface.
 *
 * Always call `applyResponsiveGuiScaling` first so that `gui.idealWidth/Height`
 * are already set to the correct values before calling this function.
 */
export function computeLayoutScale(gui: AdvancedDynamicTexture): number {
  const size    = gui.getSize();
  // gui.idealWidth is set by applyResponsiveGuiScaling, always current.
  const idealW  = gui.idealWidth  || DESIGN_WIDTH;
  const idealH  = gui.idealHeight || DESIGN_HEIGHT;
  const scaleX  = size.width  / idealW;
  const scaleY  = size.height / idealH;
  return Math.min(scaleX, scaleY);
}
