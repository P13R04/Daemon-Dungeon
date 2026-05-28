import { buildHudAssetUrl } from '../systems/hud/HudAssetPaths';

let baseAudio: HTMLAudioElement | null = null;

function getBaseAudio(): HTMLAudioElement {
  if (!baseAudio) {
    baseAudio = new Audio(buildHudAssetUrl('sfx/ui/select1.mp3'));
    baseAudio.preload = 'auto';
  }
  return baseAudio;
}

export function playUiSelectClick(volume = 0.8): void {
  try {
    const source = getBaseAudio();
    const instance = source.cloneNode(true) as HTMLAudioElement;
    instance.volume = Math.max(0, Math.min(1, volume));
    const maybePromise = instance.play();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {});
    }
  } catch {
    // Ignore audio failures on restrictive/browser-muted contexts.
  }
}

