import type { AdvancedDynamicTexture } from '@babylonjs/gui';
import type { Engine } from '@babylonjs/core';

/**
 * Design resolution for the 16:9 UI layout.
 * All pixel values in the codebase are expressed in this coordinate space.
 */
export const DESIGN_WIDTH  = 1920;
export const DESIGN_HEIGHT = 1080;

/**
 * Minimum render width (in CSS pixels) below which we consider the device
 * "small" and switch to a more generous ideal resolution so controls stay large.
 * 700 CSS px covers most landscape phones (e.g. iPhone in landscape = 844 px).
 */
const MOBILE_BREAKPOINT_CSS_PX = 700;

/**
 * Returns the CSS pixel width of the canvas (independent of DPR / hardware scaling).
 */
function getCssWidth(engine: Engine): number {
  const canvas = engine.getRenderingCanvas();
  return canvas ? canvas.clientWidth || canvas.offsetWidth || DESIGN_WIDTH : DESIGN_WIDTH;
}

/**
 * Configure a fullscreen GUI texture for sharp, responsive rendering.
 *
 * Strategy:
 *  - `renderAtIdealSize = false`  → texture renders at the native canvas
 *    resolution (= CSS size × devicePixelRatio when adaptToDeviceRatio is on).
 *    Text/borders are always crisp; no off-resolution upscaling artefacts.
 *  - `idealWidth / idealHeight`   → defines the virtual coordinate space.
 *    On wide screens we use 1920×1080.  On narrow / mobile screens we use
 *    960×540 (half the design), which effectively doubles all pixel sizes and
 *    keeps controls comfortably touchable without changing any layout numbers.
 *  - `useSmallestIdeal = true`    → Babylon picks the tightest axis so the
 *    layout always fits without clipping.
 */
export function applyResponsiveGuiScaling(
  gui: AdvancedDynamicTexture,
  engine: Engine,
): void {
  const cssWidth  = getCssWidth(engine);
  const isMobile  = cssWidth < MOBILE_BREAKPOINT_CSS_PX;

  // Half the design space on small screens → elements appear twice as large.
  const idealW = isMobile ? 960  : DESIGN_WIDTH;
  const idealH = isMobile ? 540  : DESIGN_HEIGHT;

  gui.idealWidth        = idealW;
  gui.idealHeight       = idealH;
  gui.useSmallestIdeal  = true;
  gui.renderAtIdealSize = false; // renders at native canvas resolution → crisp
}

/**
 * Compute the uniform scale to apply to a fixed 1920×1080 layout container
 * so it fills (letter-boxed) the current GUI surface.
 *
 * @param gui  The AdvancedDynamicTexture whose getSize() we query.
 * @returns    A scalar in (0, ∞), typically ≈ 0.6–1.4.
 */
export function computeLayoutScale(gui: AdvancedDynamicTexture): number {
  const size   = gui.getSize();
  const scaleX = size.width  / DESIGN_WIDTH;
  const scaleY = size.height / DESIGN_HEIGHT;
  return Math.min(scaleX, scaleY);
}
