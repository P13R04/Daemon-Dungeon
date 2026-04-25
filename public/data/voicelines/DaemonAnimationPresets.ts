export const DAEMON_FOUR_FRAME_PRESET_NAMES = [
  'bored',
  'censored',
  'censuré',
  'error',
  'happy',
  'init',
  'reboot',
  'rire',
  'supérieur',
  'surpris',
] as const;

export type DaemonFourFramePresetName = (typeof DAEMON_FOUR_FRAME_PRESET_NAMES)[number];

const toFrameName = (presetName: string, index: number): string => {
  return `${presetName}_${String(index).padStart(2, '0')}.png`;
};

const buildPresetFrames = (presetName: string, frameCount: number): string[] => {
  return Array.from({ length: frameCount }, (_, index) => toFrameName(presetName, index + 1));
};

const fourFramePresets = Object.fromEntries(
  DAEMON_FOUR_FRAME_PRESET_NAMES.map((presetName) => [presetName, buildPresetFrames(presetName, 4)])
) as Record<DaemonFourFramePresetName, string[]>;

export const DAEMON_ANIMATION_PRESETS: Record<string, string[]> = {
  ...fourFramePresets,
  'blasé': ['blasé_01.png', 'blasé_02.png'],
  'bsod': ['bsod_01.png', 'bsod_02.png', 'bsod_03.png', 'bsod_04.png'],
  'choqué': ['choqué_01.png', 'choqué_02.png'],
  'goofy': ['goofy_01.png', 'goofy_02.png', 'goofy_03.png'],
  'loading': ['loading_01.png', 'loading_02.png'],
  'override': ['override_01.png', 'override_02.png', 'override_03.png', 'override_04.png'],
  'énervé': ['énervé_01.png', 'énervé_02.png', 'énervé_03.png', 'énervé_04.png'],
};

const PRESET_ALIASES: Record<string, string> = {
  blase: 'blasé',
  censure: 'censuré',
  choque: 'choqué',
  enerve: 'énervé',
  superieur: 'supérieur',
};

export function normalizeDaemonPresetName(name: string): string {
  const lowered = name.toLowerCase();
  return PRESET_ALIASES[lowered] ?? lowered;
}

export function getDaemonAnimationPreset(name: string): string[] | undefined {
  return DAEMON_ANIMATION_PRESETS[normalizeDaemonPresetName(name)];
}

export function listDaemonAnimationPresets(): string[] {
  return Object.keys(DAEMON_ANIMATION_PRESETS);
}
