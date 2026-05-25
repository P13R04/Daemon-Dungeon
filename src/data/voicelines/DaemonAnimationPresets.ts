export const DAEMON_FOUR_FRAME_PRESET_NAMES = [
  'bored',
  'censored',
  'censure',
  'error',
  'happy',
  'init',
  'reboot',
  'rire',
  'superieur',
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
  'blase': ['blase_01.png', 'blase_02.png'],
  'bsod': ['bsod_01.png', 'bsod_02.png', 'bsod_03.png', 'bsod_04.png'],
  'choque': ['choque_01.png', 'choque_02.png'],
  'goofy': ['goofy_01.png', 'goofy_02.png', 'goofy_03.png'],
  'loading': ['loading_01.png', 'loading_02.png'],
  'override': ['override_01.png', 'override_02.png', 'override_03.png', 'override_04.png'],
  'enerve': ['enerve_01.png', 'enerve_02.png', 'enerve_03.png', 'enerve_04.png'],
};

const PRESET_ALIASES: Record<string, string> = {
  blase: 'blase',
  censure: 'censure',
  choque: 'choque',
  enerve: 'enerve',
  superieur: 'superieur',
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
