import { Engine } from '@babylonjs/core';

export type KeybindingAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'shoot'
  | 'posture'
  | 'ultimate'
  | 'item1'
  | 'item2';

export type ColorVisionFilter = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'highContrast';

export interface Keybindings {
  moveUp: string;
  moveDown: string;
  moveLeft: string;
  moveRight: string;
  shoot: string;
  posture: string;
  ultimate: string;
  item1: string;
  item2: string;
}

export interface ControlsSettings {
  keybindings: Keybindings;
  keyboardOnlyMode: boolean;
  autoAimTowardMovement: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  voice: number;
}

export interface AccessibilitySettings {
  colorFilter: ColorVisionFilter;
  catGodModeEnabled: boolean;
}

export interface GraphicsSettings {
  lightweightTexturesMode: boolean;
  progressiveEnemySpawning: boolean;
  enemySpawnBatchSize: number;
  roomPreloadAheadCount: number;
}

export interface GameSettings {
  controls: ControlsSettings;
  audio: AudioSettings;
  accessibility: AccessibilitySettings;
  graphics: GraphicsSettings;
}

interface AudioEngineLike {
  setGlobalVolume?: (value: number) => void;
}

const STORAGE_KEY = 'daemonDungeon.settings.v1';

const DEFAULT_SETTINGS: GameSettings = {
  controls: {
    keybindings: {
      moveUp: 'z',
      moveDown: 's',
      moveLeft: 'q',
      moveRight: 'd',
      shoot: 'a',
      posture: 'e',
      ultimate: 'space',
      item1: '1',
      item2: '2',
    },
    keyboardOnlyMode: false,
    autoAimTowardMovement: true,
  },
  audio: {
    master: 1,
    music: 0.8,
    sfx: 0.9,
    ui: 0.9,
    voice: 1,
  },
  accessibility: {
    colorFilter: 'none',
    catGodModeEnabled: false,
  },
  graphics: {
    lightweightTexturesMode: true,
    progressiveEnemySpawning: true,
    enemySpawnBatchSize: 2,
    roomPreloadAheadCount: 2,
  },
};

type SettingsListener = (settings: GameSettings) => void;

export class GameSettingsStore {
  private static settings: GameSettings = GameSettingsStore.load();
  private static listeners: Set<SettingsListener> = new Set();

  static get(): GameSettings {
    return GameSettingsStore.clone(GameSettingsStore.settings);
  }

  static subscribe(listener: SettingsListener): () => void {
    GameSettingsStore.listeners.add(listener);
    return () => {
      GameSettingsStore.listeners.delete(listener);
    };
  }

  static resetToDefaults(): void {
    GameSettingsStore.settings = GameSettingsStore.clone(DEFAULT_SETTINGS);
    GameSettingsStore.persist(GameSettingsStore.settings);
    GameSettingsStore.notify();
  }

  static setKeybinding(action: KeybindingAction, key: string): void {
    const normalized = normalizeInputKey(key);
    if (!normalized) return;
    GameSettingsStore.settings.controls.keybindings[action] = normalized;
    GameSettingsStore.persist(GameSettingsStore.settings);
    GameSettingsStore.notify();
  }

  static updateControls(patch: Partial<ControlsSettings>): void {
    GameSettingsStore.settings.controls = {
      ...GameSettingsStore.settings.controls,
      ...patch,
      keybindings: {
        ...GameSettingsStore.settings.controls.keybindings,
        ...(patch.keybindings ?? {}),
      },
    };
    GameSettingsStore.persist(GameSettingsStore.settings);
    GameSettingsStore.notify();
  }

  static updateAudio(patch: Partial<AudioSettings>): void {
    GameSettingsStore.settings.audio = {
      ...GameSettingsStore.settings.audio,
      ...patch,
    };

    GameSettingsStore.settings.audio.master = clamp01(GameSettingsStore.settings.audio.master);
    GameSettingsStore.settings.audio.music = clamp01(GameSettingsStore.settings.audio.music);
    GameSettingsStore.settings.audio.sfx = clamp01(GameSettingsStore.settings.audio.sfx);
    GameSettingsStore.settings.audio.ui = clamp01(GameSettingsStore.settings.audio.ui);
    GameSettingsStore.settings.audio.voice = clamp01(GameSettingsStore.settings.audio.voice);

    GameSettingsStore.persist(GameSettingsStore.settings);
    GameSettingsStore.notify();
  }

  static updateAccessibility(patch: Partial<AccessibilitySettings>): void {
    GameSettingsStore.settings.accessibility = {
      ...GameSettingsStore.settings.accessibility,
      ...patch,
    };
    GameSettingsStore.persist(GameSettingsStore.settings);
    GameSettingsStore.notify();
  }

  static updateGraphics(patch: Partial<GraphicsSettings>): void {
    GameSettingsStore.settings.graphics = {
      ...GameSettingsStore.settings.graphics,
      ...patch,
    };
    GameSettingsStore.settings.graphics.enemySpawnBatchSize = clampInt(
      GameSettingsStore.settings.graphics.enemySpawnBatchSize,
      1,
      12,
      DEFAULT_SETTINGS.graphics.enemySpawnBatchSize,
    );
    GameSettingsStore.settings.graphics.roomPreloadAheadCount = clampInt(
      GameSettingsStore.settings.graphics.roomPreloadAheadCount,
      1,
      8,
      DEFAULT_SETTINGS.graphics.roomPreloadAheadCount,
    );
    GameSettingsStore.persist(GameSettingsStore.settings);
    GameSettingsStore.notify();
  }

  static getEffectiveVolume(channel: 'music' | 'sfx' | 'ui' | 'voice'): number {
    const settings = GameSettingsStore.settings;
    return clamp01(settings.audio.master) * clamp01(settings.audio[channel]);
  }

  static applyRuntimeEffects(canvas?: HTMLCanvasElement | null): void {
    const targetCanvas = canvas ?? document.getElementById('renderCanvas');
    if (targetCanvas instanceof HTMLCanvasElement) {
      targetCanvas.style.filter = getCanvasFilter(GameSettingsStore.settings.accessibility.colorFilter);
    }

    const audioEngine = Engine.audioEngine as AudioEngineLike | undefined;
    if (audioEngine && typeof audioEngine.setGlobalVolume === 'function') {
      audioEngine.setGlobalVolume(clamp01(GameSettingsStore.settings.audio.master));
    }
  }

  private static notify(): void {
    const snapshot = GameSettingsStore.get();
    GameSettingsStore.applyRuntimeEffects();
    for (const listener of GameSettingsStore.listeners) {
      listener(snapshot);
    }
  }

  private static persist(settings: GameSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures.
    }
  }

  private static load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return GameSettingsStore.clone(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return GameSettingsStore.sanitize(parsed);
    } catch {
      return GameSettingsStore.clone(DEFAULT_SETTINGS);
    }
  }

  private static sanitize(parsed: Partial<GameSettings>): GameSettings {
    return {
      controls: {
        keybindings: {
          moveUp: normalizeInputKey(parsed.controls?.keybindings?.moveUp ?? DEFAULT_SETTINGS.controls.keybindings.moveUp),
          moveDown: normalizeInputKey(parsed.controls?.keybindings?.moveDown ?? DEFAULT_SETTINGS.controls.keybindings.moveDown),
          moveLeft: normalizeInputKey(parsed.controls?.keybindings?.moveLeft ?? DEFAULT_SETTINGS.controls.keybindings.moveLeft),
          moveRight: normalizeInputKey(parsed.controls?.keybindings?.moveRight ?? DEFAULT_SETTINGS.controls.keybindings.moveRight),
          shoot: normalizeInputKey(parsed.controls?.keybindings?.shoot ?? DEFAULT_SETTINGS.controls.keybindings.shoot),
          posture: normalizeInputKey(parsed.controls?.keybindings?.posture ?? DEFAULT_SETTINGS.controls.keybindings.posture),
          ultimate: normalizeInputKey(parsed.controls?.keybindings?.ultimate ?? DEFAULT_SETTINGS.controls.keybindings.ultimate),
          item1: normalizeInputKey(parsed.controls?.keybindings?.item1 ?? DEFAULT_SETTINGS.controls.keybindings.item1),
          item2: normalizeInputKey(parsed.controls?.keybindings?.item2 ?? DEFAULT_SETTINGS.controls.keybindings.item2),
        },
        keyboardOnlyMode: !!parsed.controls?.keyboardOnlyMode,
        autoAimTowardMovement: parsed.controls?.autoAimTowardMovement ?? DEFAULT_SETTINGS.controls.autoAimTowardMovement,
      },
      audio: {
        master: clamp01(parsed.audio?.master ?? DEFAULT_SETTINGS.audio.master),
        music: clamp01(parsed.audio?.music ?? DEFAULT_SETTINGS.audio.music),
        sfx: clamp01(parsed.audio?.sfx ?? DEFAULT_SETTINGS.audio.sfx),
        ui: clamp01(parsed.audio?.ui ?? DEFAULT_SETTINGS.audio.ui),
        voice: clamp01(parsed.audio?.voice ?? DEFAULT_SETTINGS.audio.voice),
      },
      accessibility: {
        colorFilter: sanitizeFilter(parsed.accessibility?.colorFilter),
        catGodModeEnabled: !!parsed.accessibility?.catGodModeEnabled,
      },
      graphics: {
        lightweightTexturesMode:
          parsed.graphics?.lightweightTexturesMode ?? DEFAULT_SETTINGS.graphics.lightweightTexturesMode,
        progressiveEnemySpawning:
          parsed.graphics?.progressiveEnemySpawning ?? DEFAULT_SETTINGS.graphics.progressiveEnemySpawning,
        enemySpawnBatchSize: clampInt(
          parsed.graphics?.enemySpawnBatchSize,
          1,
          12,
          DEFAULT_SETTINGS.graphics.enemySpawnBatchSize,
        ),
        roomPreloadAheadCount: clampInt(
          parsed.graphics?.roomPreloadAheadCount,
          1,
          8,
          DEFAULT_SETTINGS.graphics.roomPreloadAheadCount,
        ),
      },
    };
  }

  private static clone(value: GameSettings): GameSettings {
    return JSON.parse(JSON.stringify(value)) as GameSettings;
  }
}

export function normalizeInputKey(key: string): string {
  const raw = (key ?? '').toLowerCase();
  if (raw === ' ') return 'space';
  const value = raw.trim();
  if (!value) return '';
  if (value === 'spacebar') return 'space';
  if (value === 'arrowup') return 'arrowup';
  if (value === 'arrowdown') return 'arrowdown';
  if (value === 'arrowleft') return 'arrowleft';
  if (value === 'arrowright') return 'arrowright';
  if (value === 'leftmouse' || value === 'mouseleft' || value === 'mouse0') return 'mouse0';
  if (value === 'rightmouse' || value === 'mouseright' || value === 'mouse2') return 'mouse2';
  return value;
}

export function formatInputKeyLabel(key: string): string {
  const normalized = normalizeInputKey(key);
  if (normalized === 'space') return 'SPACE';
  if (normalized === 'mouse0') return 'MOUSE LEFT';
  if (normalized === 'mouse2') return 'MOUSE RIGHT';
  if (normalized.startsWith('arrow')) {
    return normalized.replace('arrow', 'ARROW ').toUpperCase();
  }
  return normalized.length === 1 ? normalized.toUpperCase() : normalized.toUpperCase();
}

function sanitizeFilter(filter: unknown): ColorVisionFilter {
  if (filter === 'protanopia' || filter === 'deuteranopia' || filter === 'tritanopia' || filter === 'highContrast') {
    return filter;
  }
  return 'none';
}

function getCanvasFilter(filter: ColorVisionFilter): string {
  if (filter === 'protanopia') {
    return 'contrast(1.08) sepia(0.24) saturate(0.8) hue-rotate(-14deg)';
  }
  if (filter === 'deuteranopia') {
    return 'contrast(1.06) sepia(0.18) saturate(0.82) hue-rotate(20deg)';
  }
  if (filter === 'tritanopia') {
    return 'contrast(1.08) sepia(0.2) saturate(0.86) hue-rotate(112deg)';
  }
  if (filter === 'highContrast') {
    return 'contrast(1.28) saturate(0.9) brightness(1.06)';
  }
  return 'none';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  return Math.max(min, Math.min(max, rounded));
}
