import './styles.css';

import meSpeak from 'mespeak';
import meSpeakConfig from 'mespeak/src/mespeak_config.json';
import enVoice from 'mespeak/voices/en/en.json';
import enRpVoice from 'mespeak/voices/en/en-rp.json';
import enScVoice from 'mespeak/voices/en/en-sc.json';
import enUsVoice from 'mespeak/voices/en/en-us.json';
import enWmVoice from 'mespeak/voices/en/en-wm.json';
import frVoice from 'mespeak/voices/fr.json';

import { AnimationPhase, VoicelineConfig, VOICELINES } from '../../data/voicelines/VoicelineDefinitions';
import { DAEMON_ANIMATION_PRESETS, normalizeDaemonPresetName } from '../../data/voicelines/DaemonAnimationPresets';
import {
  SCI_FI_TYPEWRITER_PRESETS,
  SciFiTypewriterPreset,
  SciFiTypewriterSynth,
} from '../../audio/SciFiTypewriterSynth';

type Language = 'en' | 'fr';
type SourceType = 'custom' | 'library' | 'voiceline';
type SynthesisMode = 'dual-overlay' | 'alternate' | 'single-low' | 'single-high' | 'glitch-switch';
type PlaybackMode = 'forward' | 'pingpong' | 'custom';

type VoiceJson = Record<string, unknown> & { voice_id?: string };

interface RuntimeAnimationPhase {
  frameSequence: string[];
  frameInterval: number;
}

interface PopupState {
  visible: boolean;
  fullTextWithPauses: string;
  displayText: string;
  typingIndex: number;
  typingSpeed: number;
  typingDelay: number;
  typingDelayTimer: number;
  typingTimer: number;
  pauseUntil: number;
  holdDuration: number;
  holdStartedAt: number;
  speaking: boolean;
  speechEndAt: number;
  shakeStrength: number;
  continuousShake: boolean;
  glitchTimer: number;
  glitchDuration: number;
  phases: RuntimeAnimationPhase[];
  currentPhaseIndex: number;
  currentPhaseFrameCount: number;
  avatarFrameIndex: number;
  avatarFrameTimer: number;
  avatarFrameInterval: number;
}

interface LayerPlan {
  text: string;
  voiceId: string;
  pitch: number;
  speed: number;
  amplitude: number;
  wordgap: number;
  gain: number;
  delaySeconds: number;
}

interface AlternationPlan {
  segmentCount: number;
  crossfadeSeconds: number;
}

interface GlitchPlan {
  eventCount: number;
  sliceSeconds: number;
  repeats: number;
  repeatGapSeconds: number;
  gain: number;
}

interface SynthesisPlan {
  layers: LayerPlan[];
  alternation?: AlternationPlan;
  glitch?: GlitchPlan;
}

interface FxChain {
  input: GainNode;
  nodes: AudioNode[];
}

interface ActivePlayback {
  id: number;
  sources: AudioBufferSourceNode[];
  nodes: AudioNode[];
  endTime: number;
}

interface VoicePreset {
  synthesisMode: SynthesisMode;
  lowPitch: number;
  highPitch: number;
  lowSpeed: number;
  highSpeed: number;
  lowAmplitude: number;
  highAmplitude: number;
  overlayDelayMs: number;
  chunkWordCount: number;
  glitchChance: number;
  glitchReplayWords: number;
  wordGap: number;
  reverbMix: number;
  distortion: number;
}

const MESSAGE_LIBRARY: Record<Language, Array<{ id: string; text: string }>> = {
  en: [
    { id: 'cold_boot', text: 'Boot complete. Your confidence was not part of the startup sequence.' },
    { id: 'cynic_ping', text: 'I detected effort. The result remains statistically hilarious.' },
    { id: 'threat_smile', text: 'Run faster, human. I enjoy the sound of your panic.' },
    { id: 'bug_mock', text: 'That movement looked like a bug. I might keep it as a feature.' },
    { id: 'mercy_error', text: 'Mercy request rejected. Error code: absolutely not.' },
    { id: 'glitchy', text: 'System stable. System stable. System... almost stable.' },
  ],
  fr: [
    { id: 'placeholder_fr_1', text: 'Version francaise a venir. Garder ce slot pour plus tard.' },
    { id: 'placeholder_fr_2', text: 'Prototype FR pret pour localisation future.' },
  ],
};

const VOICE_DATA: Record<string, VoiceJson> = {
  'en/en-us': enUsVoice as VoiceJson,
  'en/en-rp': enRpVoice as VoiceJson,
  'en/en-sc': enScVoice as VoiceJson,
  'en/en-wm': enWmVoice as VoiceJson,
  'en/en': enVoice as VoiceJson,
  'fr': frVoice as VoiceJson,
};

const LANGUAGE_VOICE_IDS: Record<Language, string[]> = {
  en: ['en/en-us', 'en/en-rp', 'en/en-sc', 'en/en-wm', 'en/en'],
  fr: ['fr'],
};

const VOICE_PRESETS: Record<string, VoicePreset> = {
  cold_dual: {
    synthesisMode: 'dual-overlay',
    lowPitch: 20,
    highPitch: 70,
    lowSpeed: 170,
    highSpeed: 170,
    lowAmplitude: 118,
    highAmplitude: 96,
    overlayDelayMs: 18,
    chunkWordCount: 3,
    glitchChance: 0.35,
    glitchReplayWords: 2,
    wordGap: 1,
    reverbMix: 0.28,
    distortion: 0.18,
  },
  cynic_switch: {
    synthesisMode: 'alternate',
    lowPitch: 32,
    highPitch: 76,
    lowSpeed: 176,
    highSpeed: 176,
    lowAmplitude: 110,
    highAmplitude: 90,
    overlayDelayMs: 0,
    chunkWordCount: 2,
    glitchChance: 0.2,
    glitchReplayWords: 2,
    wordGap: 0,
    reverbMix: 0.22,
    distortion: 0.11,
  },
  demon_glitch: {
    synthesisMode: 'glitch-switch',
    lowPitch: 14,
    highPitch: 84,
    lowSpeed: 168,
    highSpeed: 168,
    lowAmplitude: 132,
    highAmplitude: 104,
    overlayDelayMs: 12,
    chunkWordCount: 2,
    glitchChance: 0.64,
    glitchReplayWords: 3,
    wordGap: 1,
    reverbMix: 0.34,
    distortion: 0.27,
  },
  flat_operator: {
    synthesisMode: 'single-low',
    lowPitch: 44,
    highPitch: 44,
    lowSpeed: 172,
    highSpeed: 172,
    lowAmplitude: 96,
    highAmplitude: 96,
    overlayDelayMs: 0,
    chunkWordCount: 4,
    glitchChance: 0,
    glitchReplayWords: 1,
    wordGap: 0,
    reverbMix: 0.12,
    distortion: 0.05,
  },
};

const popupState: PopupState = {
  visible: false,
  fullTextWithPauses: '',
  displayText: '',
  typingIndex: 0,
  typingSpeed: 12,
  typingDelay: 0.25,
  typingDelayTimer: 0,
  typingTimer: 0,
  pauseUntil: 0,
  holdDuration: 1.8,
  holdStartedAt: 0,
  speaking: false,
  speechEndAt: 0,
  shakeStrength: 4,
  continuousShake: true,
  glitchTimer: 0,
  glitchDuration: 0,
  phases: [],
  currentPhaseIndex: 0,
  currentPhaseFrameCount: 0,
  avatarFrameIndex: 0,
  avatarFrameTimer: 0,
  avatarFrameInterval: 0.12,
};

const sourceTypeSelect = byId<HTMLSelectElement>('sourceType');
const languageSelect = byId<HTMLSelectElement>('language');
const libraryLineSelect = byId<HTMLSelectElement>('libraryLine');
const voicelineIdSelect = byId<HTMLSelectElement>('voicelineId');
const messageInput = byId<HTMLTextAreaElement>('messageInput');
const useVoicelineAnimationInput = byId<HTMLInputElement>('useVoicelineAnimation');
const presetNameSelect = byId<HTMLSelectElement>('presetName');
const playbackModeSelect = byId<HTMLSelectElement>('playbackMode');
const customFrameOrderInput = byId<HTMLInputElement>('customFrameOrder');
const cyclesInput = byId<HTMLInputElement>('cycles');
const frameIntervalInput = byId<HTMLInputElement>('frameInterval');
const typingSpeedInput = byId<HTMLInputElement>('typingSpeed');
const typingDelayInput = byId<HTMLInputElement>('typingDelay');
const autoTypingSyncInput = byId<HTMLInputElement>('autoTypingSync');
const enableTypewriterSynthInput = byId<HTMLInputElement>('enableTypewriterSynth');
const typewriterPresetSelect = byId<HTMLSelectElement>('typewriterPreset');
const holdDurationInput = byId<HTMLInputElement>('holdDuration');
const shakeStrengthInput = byId<HTMLInputElement>('shakeStrength');
const continuousShakeInput = byId<HTMLInputElement>('continuousShake');

const voicePresetSelect = byId<HTMLSelectElement>('voicePreset');
const synthesisModeSelect = byId<HTMLSelectElement>('synthesisMode');
const lowVoiceSelect = byId<HTMLSelectElement>('lowVoice');
const highVoiceSelect = byId<HTMLSelectElement>('highVoice');
const lowPitchInput = byId<HTMLInputElement>('lowPitch');
const highPitchInput = byId<HTMLInputElement>('highPitch');
const lowSpeedInput = byId<HTMLInputElement>('lowSpeed');
const highSpeedInput = byId<HTMLInputElement>('highSpeed');
const syncSpeedInput = byId<HTMLInputElement>('syncSpeed');
const lowAmplitudeInput = byId<HTMLInputElement>('lowAmplitude');
const highAmplitudeInput = byId<HTMLInputElement>('highAmplitude');
const overlayDelayInput = byId<HTMLInputElement>('overlayDelayMs');
const chunkWordCountInput = byId<HTMLInputElement>('chunkWordCount');
const wordGapInput = byId<HTMLInputElement>('wordGap');
const glitchChanceInput = byId<HTMLInputElement>('glitchChance');
const glitchReplayWordsInput = byId<HTMLInputElement>('glitchReplayWords');

const masterGainInput = byId<HTMLInputElement>('masterGain');
const reverbMixInput = byId<HTMLInputElement>('reverbMix');
const reverbTimeInput = byId<HTMLInputElement>('reverbTime');
const compThresholdInput = byId<HTMLInputElement>('compThreshold');
const compRatioInput = byId<HTMLInputElement>('compRatio');
const compAttackInput = byId<HTMLInputElement>('compAttack');
const compReleaseInput = byId<HTMLInputElement>('compRelease');
const highPassInput = byId<HTMLInputElement>('highPassHz');
const lowPassInput = byId<HTMLInputElement>('lowPassHz');
const distortionInput = byId<HTMLInputElement>('distortion');

const playBtn = byId<HTMLButtonElement>('playBtn');
const stopBtn = byId<HTMLButtonElement>('stopBtn');
const randomBtn = byId<HTMLButtonElement>('randomBtn');
const copyBtn = byId<HTMLButtonElement>('copyBtn');

const libraryLineWrap = byId<HTMLLabelElement>('libraryLineWrap');
const voicelineWrap = byId<HTMLLabelElement>('voicelineWrap');

const settingsOutput = byId<HTMLPreElement>('settingsOutput');

const daemonPopup = byId<HTMLDivElement>('daemonPopup');
const daemonGhost = byId<HTMLDivElement>('daemonGhost');
const daemonAvatar = byId<HTMLImageElement>('daemonAvatar');
const daemonMessage = byId<HTMLParagraphElement>('daemonMessage');
const daemonMeta = byId<HTMLParagraphElement>('daemonMeta');

const loadedVoices = new Set<string>();
const resolvedFrameSources = new Map<string, string>();

let audioContext: AudioContext | null = null;
let activePlayback: ActivePlayback | null = null;
let playbackIdCounter = 0;
let rafHandle = 0;
let previousTickSeconds = 0;
let typewriterSynth: SciFiTypewriterSynth | null = null;
let activeTypingSpeedCps = numberValue(typingSpeedInput, 14);

const TYPEWRITER_GAIN_BOOST = 2.8;
const TYPEWRITER_MAX_GAIN = 0.16;

initialize();

function initialize(): void {
  populateTypewriterPresetOptions();
  populatePresetOptions();
  populateVoicelineOptions();
  populateLibraryLines();
  refreshSourceVisibility();
  refreshVoiceOptions();
  applyVoicePreset(voicePresetSelect.value);
  bindRangeOutputs();
  applySpeedSyncFrom('low');
  refreshSettingsPreview();

  sourceTypeSelect.addEventListener('change', () => {
    refreshSourceVisibility();
    applySourceText();
    refreshSettingsPreview();
  });

  languageSelect.addEventListener('change', () => {
    populateLibraryLines();
    refreshVoiceOptions();
    applySourceText();
    refreshSettingsPreview();
  });

  libraryLineSelect.addEventListener('change', () => {
    if (getSourceType() === 'library') {
      applySourceText();
    }
    refreshSettingsPreview();
  });

  voicelineIdSelect.addEventListener('change', () => {
    if (getSourceType() === 'voiceline') {
      applySourceText();
    }
    refreshSettingsPreview();
  });

  voicePresetSelect.addEventListener('change', () => {
    applyVoicePreset(voicePresetSelect.value);
    refreshSettingsPreview();
  });

  lowSpeedInput.addEventListener('input', () => {
    applySpeedSyncFrom('low');
    refreshSettingsPreview();
  });

  highSpeedInput.addEventListener('input', () => {
    applySpeedSyncFrom('high');
    refreshSettingsPreview();
  });

  syncSpeedInput.addEventListener('change', () => {
    applySpeedSyncFrom('low');
    refreshSettingsPreview();
  });

  typewriterPresetSelect.addEventListener('change', () => {
    resetTypewriterSynth();
    refreshSettingsPreview();
  });

  enableTypewriterSynthInput.addEventListener('change', () => {
    if (!enableTypewriterSynthInput.checked) {
      typewriterSynth?.dispose();
      typewriterSynth = null;
    }
    refreshSettingsPreview();
  });

  autoTypingSyncInput.addEventListener('change', refreshSettingsPreview);

  playBtn.addEventListener('click', () => {
    void playCurrentLine();
  });

  stopBtn.addEventListener('click', () => {
    stopPlayback();
    hidePopupNow();
  });

  randomBtn.addEventListener('click', () => {
    randomizeSlightly();
    refreshSettingsPreview();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(settingsOutput.textContent ?? '');
      daemonMeta.textContent = 'Settings copied to clipboard.';
    } catch {
      daemonMeta.textContent = 'Clipboard copy failed in this browser context.';
    }
  });

  const allInputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea');
  allInputs.forEach((entry) => {
    entry.addEventListener('input', refreshSettingsPreview);
    entry.addEventListener('change', refreshSettingsPreview);
  });

  daemonAvatar.src = getResolvedFrameUrl('init_01.png');
  startAnimationLoop();
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element #${id}`);
  }
  return node as T;
}

function bindRangeOutputs(): void {
  const ranges = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="range"][data-output]'));
  ranges.forEach((range) => {
    const outputId = range.dataset.output;
    if (!outputId) return;

    const output = byId<HTMLOutputElement>(outputId);
    const update = () => {
      output.value = range.value;
      output.textContent = range.value;
    };

    range.addEventListener('input', update);
    update();
  });
}

function updateRangeOutput(input: HTMLInputElement): void {
  const outputId = input.dataset.output;
  if (!outputId) return;
  const output = document.getElementById(outputId) as HTMLOutputElement | null;
  if (!output) return;
  output.value = input.value;
  output.textContent = input.value;
}

function applySpeedSyncFrom(source: 'low' | 'high'): void {
  if (!syncSpeedInput.checked) return;
  if (source === 'low') {
    highSpeedInput.value = lowSpeedInput.value;
    updateRangeOutput(highSpeedInput);
  } else {
    lowSpeedInput.value = highSpeedInput.value;
    updateRangeOutput(lowSpeedInput);
  }
}

function populateTypewriterPresetOptions(): void {
  typewriterPresetSelect.innerHTML = '';
  const presetIds = Object.keys(SCI_FI_TYPEWRITER_PRESETS) as SciFiTypewriterPreset[];
  presetIds.forEach((presetId) => {
    const option = document.createElement('option');
    option.value = presetId;
    option.textContent = presetId;
    typewriterPresetSelect.appendChild(option);
  });

  if (presetIds.includes('oldschool_fast')) {
    typewriterPresetSelect.value = 'oldschool_fast';
  }
}

function estimateTypingSpeedFromVoice(textWithPauses: string): number {
  const text = stripPauseMarkers(textWithPauses);
  const words = Math.max(1, countWords(text));
  const chars = Math.max(1, text.length);
  const mode = synthesisModeSelect.value as SynthesisMode;

  const lowWpm = numberValue(lowSpeedInput, 170);
  const highWpm = syncSpeedInput.checked ? lowWpm : numberValue(highSpeedInput, lowWpm);

  let effectiveWpm = lowWpm;
  if (mode === 'single-high') {
    effectiveWpm = highWpm;
  } else if (mode === 'dual-overlay' || mode === 'alternate' || mode === 'glitch-switch') {
    effectiveWpm = (lowWpm + highWpm) * 0.5;
  }

  const estimatedSpeechSeconds = words / Math.max(1e-3, effectiveWpm / 60);
  const estimatedCps = (chars / Math.max(0.2, estimatedSpeechSeconds)) * 0.88;
  return Math.max(4, Math.min(70, estimatedCps));
}

function resolveTypingSpeed(textWithPauses: string, voiceline?: VoicelineConfig): number {
  if (autoTypingSyncInput.checked) {
    return estimateTypingSpeedFromVoice(textWithPauses);
  }
  return voiceline?.typingSpeed ?? numberValue(typingSpeedInput, 14);
}

function resetTypewriterSynth(charsPerSecond?: number): void {
  typewriterSynth?.dispose();
  typewriterSynth = null;

  if (!enableTypewriterSynthInput.checked) return;

  const preset = typewriterPresetSelect.value as SciFiTypewriterPreset;
  const presetOptions = SCI_FI_TYPEWRITER_PRESETS[preset] ?? SCI_FI_TYPEWRITER_PRESETS.oldschool_fast;
  const cps = Math.max(1, charsPerSecond ?? activeTypingSpeedCps);
  const intervalMs = Math.max(20, Math.round(1000 / cps));
  const boostedBaseGain = Math.min(
    TYPEWRITER_MAX_GAIN,
    (presetOptions.baseGain ?? 0.04) * TYPEWRITER_GAIN_BOOST
  );

  typewriterSynth = new SciFiTypewriterSynth({
    ...presetOptions,
    baseGain: boostedBaseGain,
    durationMs: Math.max(20, Math.round((presetOptions.durationMs ?? 24) * 1.35)),
    intervalMs,
    minIntervalMs: Math.max(16, Math.round(intervalMs * 0.75)),
    maxIntervalMs: Math.max(intervalMs + 8, Math.round(intervalMs * 1.4)),
    intervalJitterMs: 0,
  });
}

function populatePresetOptions(): void {
  presetNameSelect.innerHTML = '';
  const names = Object.keys(DAEMON_ANIMATION_PRESETS).sort((a, b) => a.localeCompare(b));
  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    presetNameSelect.appendChild(option);
  });

  if (names.includes('error')) {
    presetNameSelect.value = 'error';
  }
}

function populateVoicelineOptions(): void {
  voicelineIdSelect.innerHTML = '';
  const ids = Object.keys(VOICELINES).sort((a, b) => a.localeCompare(b));
  ids.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    voicelineIdSelect.appendChild(option);
  });

  if (ids.length > 0) {
    voicelineIdSelect.value = ids[0];
  }
}

function populateLibraryLines(): void {
  const language = getLanguage();
  libraryLineSelect.innerHTML = '';

  MESSAGE_LIBRARY[language].forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `${entry.id}: ${entry.text}`;
    libraryLineSelect.appendChild(option);
  });

  if (MESSAGE_LIBRARY[language].length > 0) {
    libraryLineSelect.value = MESSAGE_LIBRARY[language][0].id;
  }
}

function refreshVoiceOptions(): void {
  const language = getLanguage();
  const ids = LANGUAGE_VOICE_IDS[language];

  const currentLow = lowVoiceSelect.value;
  const currentHigh = highVoiceSelect.value;

  lowVoiceSelect.innerHTML = '';
  highVoiceSelect.innerHTML = '';

  ids.forEach((id) => {
    const lowOption = document.createElement('option');
    lowOption.value = id;
    lowOption.textContent = id;
    lowVoiceSelect.appendChild(lowOption);

    const highOption = document.createElement('option');
    highOption.value = id;
    highOption.textContent = id;
    highVoiceSelect.appendChild(highOption);
  });

  lowVoiceSelect.value = ids.includes(currentLow) ? currentLow : ids[0];
  highVoiceSelect.value = ids.includes(currentHigh)
    ? currentHigh
    : ids[Math.min(1, Math.max(0, ids.length - 1))];
}

function refreshSourceVisibility(): void {
  const sourceType = getSourceType();
  libraryLineWrap.style.display = sourceType === 'library' ? '' : 'none';
  voicelineWrap.style.display = sourceType === 'voiceline' ? '' : 'none';
}

function getLanguage(): Language {
  return languageSelect.value === 'fr' ? 'fr' : 'en';
}

function getSourceType(): SourceType {
  const value = sourceTypeSelect.value;
  if (value === 'library' || value === 'voiceline') return value;
  return 'custom';
}

function getVoicelineById(id: string): VoicelineConfig | undefined {
  return VOICELINES[id];
}

function applySourceText(): void {
  const sourceType = getSourceType();

  if (sourceType === 'library') {
    const language = getLanguage();
    const selected = MESSAGE_LIBRARY[language].find((entry) => entry.id === libraryLineSelect.value);
    if (selected) {
      messageInput.value = selected.text;
    }
    return;
  }

  if (sourceType === 'voiceline') {
    const voiceline = getVoicelineById(voicelineIdSelect.value);
    if (voiceline) {
      messageInput.value = voiceline.message;
    }
  }
}

function applyVoicePreset(presetId: string): void {
  const preset = VOICE_PRESETS[presetId];
  if (!preset) return;

  synthesisModeSelect.value = preset.synthesisMode;
  lowPitchInput.value = String(preset.lowPitch);
  highPitchInput.value = String(preset.highPitch);
  lowSpeedInput.value = String(preset.lowSpeed);
  highSpeedInput.value = String(preset.highSpeed);
  lowAmplitudeInput.value = String(preset.lowAmplitude);
  highAmplitudeInput.value = String(preset.highAmplitude);
  overlayDelayInput.value = String(preset.overlayDelayMs);
  chunkWordCountInput.value = String(preset.chunkWordCount);
  glitchChanceInput.value = String(preset.glitchChance);
  glitchReplayWordsInput.value = String(preset.glitchReplayWords);
  wordGapInput.value = String(preset.wordGap);
  reverbMixInput.value = String(preset.reverbMix);
  distortionInput.value = String(preset.distortion);

  applySpeedSyncFrom('low');
  bindRangeOutputs();
}

function collectSettingsForPreview(): Record<string, unknown> {
  return {
    language: getLanguage(),
    source: getSourceType(),
    voicelineId: voicelineIdSelect.value,
    message: messageInput.value,
    animation: {
      useVoicelineAnimation: useVoicelineAnimationInput.checked,
      presetName: presetNameSelect.value,
      playbackMode: playbackModeSelect.value,
      customFrameOrder: customFrameOrderInput.value,
      cycles: numberValue(cyclesInput, 2),
      frameInterval: numberValue(frameIntervalInput, 0.12),
      typingSpeed: numberValue(typingSpeedInput, 14),
      autoTypingSync: autoTypingSyncInput.checked,
      enableTypewriterSynth: enableTypewriterSynthInput.checked,
      typewriterPreset: typewriterPresetSelect.value,
      typingDelay: numberValue(typingDelayInput, 0.25),
      holdDuration: numberValue(holdDurationInput, 1.8),
      shakeStrength: numberValue(shakeStrengthInput, 4.5),
      continuousShake: continuousShakeInput.checked,
    },
    synthesis: {
      preset: voicePresetSelect.value,
      mode: synthesisModeSelect.value,
      lowVoice: lowVoiceSelect.value,
      highVoice: highVoiceSelect.value,
      lowPitch: numberValue(lowPitchInput, 20),
      highPitch: numberValue(highPitchInput, 70),
      lowSpeed: numberValue(lowSpeedInput, 165),
      highSpeed: numberValue(highSpeedInput, 198),
      syncSpeed: syncSpeedInput.checked,
      lowAmplitude: numberValue(lowAmplitudeInput, 118),
      highAmplitude: numberValue(highAmplitudeInput, 96),
      fixedVoiceDelayMs: numberValue(overlayDelayInput, 18),
      chunkWordCount: numberValue(chunkWordCountInput, 3),
      wordGap: numberValue(wordGapInput, 1),
      glitchChance: numberValue(glitchChanceInput, 0.35),
      glitchReplaySliceSize: numberValue(glitchReplayWordsInput, 2),
    },
    fx: {
      masterGain: numberValue(masterGainInput, 0.92),
      reverbMix: numberValue(reverbMixInput, 0.28),
      reverbTime: numberValue(reverbTimeInput, 1.2),
      compressor: {
        threshold: numberValue(compThresholdInput, -24),
        ratio: numberValue(compRatioInput, 6),
        attack: numberValue(compAttackInput, 0.01),
        release: numberValue(compReleaseInput, 0.18),
      },
      highPassHz: numberValue(highPassInput, 90),
      lowPassHz: numberValue(lowPassInput, 5200),
      distortion: numberValue(distortionInput, 0.18),
    },
  };
}

function refreshSettingsPreview(): void {
  settingsOutput.textContent = JSON.stringify(collectSettingsForPreview(), null, 2);
}

function numberValue(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function buildCustomFrameOrder(): number[] {
  return customFrameOrderInput.value
    .split(',')
    .map((raw) => Number.parseInt(raw.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function buildPhaseFrameSequence(baseFrames: string[], phase: AnimationPhase): string[] {
  const mode = phase.playbackMode ?? 'forward';
  let frameOrder: string[] = [];

  if (mode === 'custom') {
    const order = (phase.frameOrder ?? [])
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= baseFrames.length);

    frameOrder = order.length > 0 ? order.map((idx) => baseFrames[idx - 1]) : baseFrames.slice();
  } else if (mode === 'pingpong') {
    if (baseFrames.length <= 1) {
      frameOrder = baseFrames.slice();
    } else {
      frameOrder = [...baseFrames, ...baseFrames.slice(1, -1).reverse()];
    }
  } else {
    frameOrder = baseFrames.slice();
  }

  const cycles = Math.max(1, Math.floor(phase.cycles));
  const fullSequence: string[] = [];
  for (let i = 0; i < cycles; i += 1) {
    fullSequence.push(...frameOrder);
  }

  return fullSequence;
}

function buildAnimationPhases(voiceline: VoicelineConfig | undefined): RuntimeAnimationPhase[] {
  if (useVoicelineAnimationInput.checked && voiceline) {
    const phases: RuntimeAnimationPhase[] = [];

    voiceline.animationSequence.forEach((phase) => {
      const key = normalizeDaemonPresetName(phase.emotion);
      const frames = DAEMON_ANIMATION_PRESETS[key];
      if (!frames?.length) return;

      phases.push({
        frameSequence: buildPhaseFrameSequence(frames, phase),
        frameInterval: phase.frameInterval ?? numberValue(frameIntervalInput, 0.12),
      });
    });

    return phases;
  }

  const key = normalizeDaemonPresetName(presetNameSelect.value);
  const frames = DAEMON_ANIMATION_PRESETS[key] ?? DAEMON_ANIMATION_PRESETS.init;
  const playbackMode = playbackModeSelect.value as PlaybackMode;
  const cycles = Math.max(1, Math.floor(numberValue(cyclesInput, 2)));
  const customOrder = buildCustomFrameOrder();

  const phase: AnimationPhase = {
    emotion: key,
    cycles,
    frameInterval: numberValue(frameIntervalInput, 0.12),
    playbackMode,
    frameOrder: playbackMode === 'custom' ? customOrder : undefined,
  };

  return [
    {
      frameSequence: buildPhaseFrameSequence(frames, phase),
      frameInterval: numberValue(frameIntervalInput, 0.12),
    },
  ];
}

function startPopupFromText(textWithPauses: string, phases: RuntimeAnimationPhase[]): void {
  popupState.visible = true;
  popupState.fullTextWithPauses = textWithPauses;
  popupState.displayText = stripPauseMarkers(textWithPauses);
  popupState.typingIndex = 0;
  popupState.typingDelayTimer = 0;
  popupState.typingTimer = 0;
  popupState.pauseUntil = 0;
  popupState.typingSpeed = numberValue(typingSpeedInput, 14);
  popupState.typingDelay = numberValue(typingDelayInput, 0.25);
  popupState.holdDuration = numberValue(holdDurationInput, 1.8);
  popupState.holdStartedAt = 0;
  popupState.shakeStrength = numberValue(shakeStrengthInput, 4.5);
  popupState.continuousShake = continuousShakeInput.checked;
  popupState.glitchDuration = 0.28;
  popupState.glitchTimer = popupState.glitchDuration;

  popupState.phases = phases;
  popupState.currentPhaseIndex = 0;
  popupState.currentPhaseFrameCount = 0;
  popupState.avatarFrameIndex = 0;
  popupState.avatarFrameTimer = 0;
  popupState.avatarFrameInterval = phases[0]?.frameInterval ?? 0.12;

  daemonMessage.textContent = '';
  daemonPopup.classList.add('is-visible');
  daemonGhost.classList.add('is-visible');
}

function hidePopupNow(): void {
  popupState.visible = false;
  popupState.speaking = false;
  popupState.holdStartedAt = 0;
  popupState.glitchTimer = 0;
  daemonPopup.classList.remove('is-visible');
  daemonGhost.classList.remove('is-visible');
  daemonPopup.style.setProperty('--shake-x', '0px');
  daemonPopup.style.setProperty('--shake-y', '0px');
  daemonGhost.style.setProperty('--shake-x', '0px');
  daemonGhost.style.setProperty('--shake-y', '0px');
}

function stripPauseMarkers(text: string): string {
  return text.replace(/\{pause:[^}]+\}/g, '');
}

function getPauseAtDisplayIndex(fullText: string, displayIndex: number): { duration: number; markerLength: number } | null {
  let displayCount = 0;
  let i = 0;

  while (i < fullText.length) {
    const pauseMatch = fullText.substring(i).match(/^\{pause:([\d.]+)\}/);
    if (pauseMatch) {
      if (displayCount === displayIndex) {
        return {
          duration: Number.parseFloat(pauseMatch[1]),
          markerLength: pauseMatch[0].length,
        };
      }
      i += pauseMatch[0].length;
      continue;
    }

    if (displayCount === displayIndex) {
      return null;
    }

    displayCount += 1;
    i += 1;
  }

  return null;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
}

function buildSynthesisPlan(text: string): SynthesisPlan {
  const mode = synthesisModeSelect.value as SynthesisMode;
  const lowVoice = lowVoiceSelect.value;
  const highVoice = highVoiceSelect.value;
  const lowPitch = numberValue(lowPitchInput, 20);
  const highPitch = numberValue(highPitchInput, 70);
  const lowSpeed = numberValue(lowSpeedInput, 165);
  let highSpeed = numberValue(highSpeedInput, 198);
  if (syncSpeedInput.checked) {
    highSpeed = lowSpeed;
    if (highSpeedInput.value !== String(lowSpeed)) {
      highSpeedInput.value = String(lowSpeed);
      updateRangeOutput(highSpeedInput);
    }
  }

  const lowAmplitude = numberValue(lowAmplitudeInput, 118);
  const highAmplitude = numberValue(highAmplitudeInput, 96);
  const overlayDelaySeconds = numberValue(overlayDelayInput, 18) / 1000;
  const chunkWordCount = numberValue(chunkWordCountInput, 3);
  const glitchChance = numberValue(glitchChanceInput, 0.35);
  const glitchReplayWords = numberValue(glitchReplayWordsInput, 2);
  const wordGap = numberValue(wordGapInput, 1);
  const wordCount = Math.max(1, countWords(text));
  const segmentCount = Math.max(2, Math.ceil(wordCount / Math.max(1, Math.floor(chunkWordCount))));

  const lowLayer = (line: string): LayerPlan => ({
    text: line,
    voiceId: lowVoice,
    pitch: lowPitch,
    speed: lowSpeed,
    amplitude: lowAmplitude,
    wordgap: wordGap,
    delaySeconds: 0,
    gain: 0.86,
  });

  const highLayer = (line: string): LayerPlan => ({
    text: line,
    voiceId: highVoice,
    pitch: highPitch,
    speed: highSpeed,
    amplitude: highAmplitude,
    wordgap: wordGap,
    delaySeconds: overlayDelaySeconds,
    gain: 0.86,
  });

  if (mode === 'single-low') {
    return { layers: [lowLayer(text)] };
  }

  if (mode === 'single-high') {
    return { layers: [highLayer(text)] };
  }

  if (mode === 'dual-overlay') {
    return { layers: [lowLayer(text), { ...highLayer(text), gain: 0.74 }] };
  }

  if (mode === 'alternate') {
    return {
      layers: [
        { ...lowLayer(text), gain: 0.82 },
        { ...highLayer(text), gain: 0.82 },
      ],
      alternation: {
        segmentCount,
        crossfadeSeconds: 0.018,
      },
    };
  }

  const glitchSliceSeconds = Math.max(0.03, Math.min(0.22, 0.022 + glitchReplayWords * 0.028));
  const glitchEventCount = Math.max(1, Math.min(10, Math.round(glitchChance * 7 + wordCount / 20)));
  const glitchRepeats = Math.max(2, Math.min(6, 1 + Math.floor(glitchReplayWords)));

  return {
    layers: [
      { ...lowLayer(text), gain: 0.8 },
      { ...highLayer(text), gain: 0.8 },
    ],
    alternation: {
      segmentCount: Math.max(3, Math.floor(segmentCount * 1.3)),
      crossfadeSeconds: 0.012,
    },
    glitch: {
      eventCount: glitchEventCount,
      sliceSeconds: glitchSliceSeconds,
      repeats: glitchRepeats,
      repeatGapSeconds: Math.max(0.012, glitchSliceSeconds * 0.4),
      gain: Math.min(0.82, 0.34 + glitchChance * 0.34),
    },
  };
}

function createImpulseResponse(context: AudioContext, seconds: number): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * Math.max(0.1, seconds)));
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const progress = i / length;
      const decay = Math.pow(1 - progress, 2.8);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  return impulse;
}

function buildDistortionCurve(amount: number): Float32Array {
  const k = Math.max(0, amount) * 140;
  const sampleCount = 44100;
  const curve = new Float32Array(sampleCount);

  if (k <= 0) {
    for (let i = 0; i < sampleCount; i += 1) {
      const x = (i * 2) / sampleCount - 1;
      curve[i] = x;
    }
    return curve;
  }

  for (let i = 0; i < sampleCount; i += 1) {
    const x = (i * 2) / sampleCount - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }

  return curve;
}

function createFxChain(context: AudioContext): FxChain {
  const masterGain = context.createGain();
  const busInput = context.createGain();
  const highPass = context.createBiquadFilter();
  const lowPass = context.createBiquadFilter();
  const distortion = context.createWaveShaper();
  const compressor = context.createDynamicsCompressor();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const convolver = context.createConvolver();

  const highPassHz = numberValue(highPassInput, 90);
  const lowPassHz = numberValue(lowPassInput, 5200);
  const distortionAmount = numberValue(distortionInput, 0.18);
  const reverbMix = numberValue(reverbMixInput, 0.28);
  const reverbTime = numberValue(reverbTimeInput, 1.2);

  highPass.type = 'highpass';
  highPass.frequency.value = highPassHz;

  lowPass.type = 'lowpass';
  lowPass.frequency.value = lowPassHz;

  distortion.curve = buildDistortionCurve(distortionAmount) as unknown as Float32Array<ArrayBuffer>;
  distortion.oversample = '4x';

  compressor.threshold.value = numberValue(compThresholdInput, -24);
  compressor.ratio.value = numberValue(compRatioInput, 6);
  compressor.attack.value = numberValue(compAttackInput, 0.01);
  compressor.release.value = numberValue(compReleaseInput, 0.18);

  dryGain.gain.value = 1 - reverbMix;
  wetGain.gain.value = reverbMix;
  convolver.buffer = createImpulseResponse(context, reverbTime);

  masterGain.gain.value = numberValue(masterGainInput, 0.92);

  busInput.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(distortion);
  distortion.connect(compressor);

  compressor.connect(dryGain);
  compressor.connect(convolver);
  convolver.connect(wetGain);

  dryGain.connect(masterGain);
  wetGain.connect(masterGain);
  masterGain.connect(context.destination);

  return {
    input: busInput,
    nodes: [busInput, highPass, lowPass, distortion, compressor, convolver, dryGain, wetGain, masterGain],
  };
}

async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state !== 'running') {
    await audioContext.resume();
  }

  return audioContext;
}

function ensureMeSpeakConfig(): void {
  if (!meSpeak.isConfigLoaded()) {
    meSpeak.loadConfig(meSpeakConfig as Record<string, unknown>);
  }
}

function ensureVoicesLoaded(voiceIds: string[]): void {
  voiceIds.forEach((id) => {
    if (loadedVoices.has(id)) return;

    const voiceJson = VOICE_DATA[id];
    if (!voiceJson) return;

    meSpeak.loadVoice(voiceJson as Record<string, unknown>);

    const resolved = typeof voiceJson.voice_id === 'string' ? voiceJson.voice_id : id;
    loadedVoices.add(id);
    loadedVoices.add(resolved);
  });
}

function normalizeRawData(raw: unknown): ArrayBuffer {
  if (raw instanceof ArrayBuffer) {
    return raw.slice(0);
  }

  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }

  if (Array.isArray(raw)) {
    return new Uint8Array(raw).buffer;
  }

  throw new Error('Unexpected meSpeak raw output format');
}

async function synthesizeLayerBuffer(context: AudioContext, layer: LayerPlan): Promise<AudioBuffer> {
  const raw = meSpeak.speak(layer.text, {
    voice: layer.voiceId,
    pitch: layer.pitch,
    speed: layer.speed,
    amplitude: layer.amplitude,
    wordgap: layer.wordgap,
    rawdata: 'array',
  });

  const wavData = normalizeRawData(raw);
  return context.decodeAudioData(wavData.slice(0));
}

function scheduleAlternation(
  lowGain: GainNode,
  highGain: GainNode,
  lowBaseGain: number,
  highBaseGain: number,
  startTime: number,
  endTime: number,
  segmentCount: number,
  crossfadeSeconds: number
): void {
  if (endTime <= startTime || segmentCount < 2) return;

  const low = lowGain.gain;
  const high = highGain.gain;
  const total = endTime - startTime;
  const segmentDuration = total / segmentCount;
  const fade = Math.min(Math.max(0.004, crossfadeSeconds), segmentDuration * 0.45);

  low.cancelScheduledValues(startTime);
  high.cancelScheduledValues(startTime);
  low.setValueAtTime(lowBaseGain, startTime);
  high.setValueAtTime(0, startTime);

  for (let i = 1; i < segmentCount; i += 1) {
    const boundary = startTime + i * segmentDuration;
    const fadeEnd = Math.min(boundary + fade, endTime);
    const switchToHigh = i % 2 === 1;

    if (switchToHigh) {
      low.setValueAtTime(lowBaseGain, boundary);
      low.linearRampToValueAtTime(0, fadeEnd);
      high.setValueAtTime(0, boundary);
      high.linearRampToValueAtTime(highBaseGain, fadeEnd);
    } else {
      high.setValueAtTime(highBaseGain, boundary);
      high.linearRampToValueAtTime(0, fadeEnd);
      low.setValueAtTime(0, boundary);
      low.linearRampToValueAtTime(lowBaseGain, fadeEnd);
    }
  }
}

interface GlitchEvent {
  startPos: number;
  sliceSeconds: number;
  repeats: number;
  gapSeconds: number;
}

function applyGlitchMapToBuffer(context: AudioContext, buffer: AudioBuffer, map: GlitchEvent[]): AudioBuffer {
  if (map.length === 0) return buffer;
  
  let addedDuration = 0;
  for (const ev of map) {
    addedDuration += ev.repeats * Math.max(ev.sliceSeconds, ev.gapSeconds);
  }
  
  const sampleRate = buffer.sampleRate;
  const oldLength = buffer.length;
  const newLength = oldLength + Math.ceil(addedDuration * sampleRate) + 100;
  
  const newBuffer = context.createBuffer(buffer.numberOfChannels, newLength, sampleRate);
  
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const srcData = buffer.getChannelData(channel);
    const dstData = newBuffer.getChannelData(channel);
    
    let srcIdx = 0;
    let dstIdx = 0;
    let mapIdx = 0;
    
    while (srcIdx < oldLength && dstIdx < newLength) {
      if (mapIdx < map.length) {
        const ev = map[mapIdx];
        const evStartIdx = Math.floor(ev.startPos * sampleRate);
        const evSliceLen = Math.floor(ev.sliceSeconds * sampleRate);
        const evGapLen = Math.floor(ev.gapSeconds * sampleRate);
        
        if (srcIdx === evStartIdx) {
          for (let i = 0; i < evSliceLen && srcIdx < oldLength && dstIdx < newLength; i += 1) {
              dstData[dstIdx++] = srcData[srcIdx++];
          }
          
          for (let r = 0; r < ev.repeats; r += 1) {
            const decay = 1 - r / Math.max(1, ev.repeats + 1);
            const volume = 0.65 + decay * 0.35; 
            
            for (let i = 0; i < evSliceLen && (evStartIdx + i) < oldLength && dstIdx < newLength; i += 1) {
              dstData[dstIdx++] = srcData[evStartIdx + i] * volume;
            }
            if (evGapLen > evSliceLen) {
               dstIdx += (evGapLen - evSliceLen);
            }
          }
          
          mapIdx++;
          continue;
        }
      }
      
      dstData[dstIdx++] = srcData[srcIdx++];
    }
  }
  
  return newBuffer;
}

async function playSynthesisText(text: string): Promise<{ endTime: number; playback: ActivePlayback }> {
  const context = await ensureAudioContext();
  ensureMeSpeakConfig();

  const voices = [lowVoiceSelect.value, highVoiceSelect.value];
  ensureVoicesLoaded(voices);

  const plan = buildSynthesisPlan(text);
  const fx = createFxChain(context);

  const sources: AudioBufferSourceNode[] = [];
  const allNodes: AudioNode[] = [...fx.nodes];
  const startAt = context.currentTime + 0.05;

  const glitchMap: GlitchEvent[] = [];

  const renderedLayers = await Promise.all(
    plan.layers.map(async (layer) => ({
      layer,
      buffer: await synthesizeLayerBuffer(context, layer),
    }))
  );

  if (plan.glitch && renderedLayers.length > 0) {
    const duration = renderedLayers[0].buffer.duration;
    const usableStart = 0.08;
    const usableEnd = duration - plan.glitch.sliceSeconds - 0.08;
    if (usableEnd > usableStart) {
      const events: GlitchEvent[] = [];
      for (let i = 0; i < plan.glitch.eventCount; i += 1) {
        if (Math.random() > numberValue(glitchChanceInput, 0.35)) continue;
        const eventStart = usableStart + Math.random() * (usableEnd - usableStart);
        events.push({
          startPos: eventStart,
          sliceSeconds: plan.glitch.sliceSeconds,
          repeats: plan.glitch.repeats,
          gapSeconds: plan.glitch.repeatGapSeconds
        });
      }
      events.sort((a, b) => a.startPos - b.startPos);
      let lastEnd = 0;
      for (const ev of events) {
        if (ev.startPos < lastEnd) continue;
        glitchMap.push(ev);
        lastEnd = ev.startPos + ev.sliceSeconds + 0.01;
      }
    }
  }

  const scheduledLayers = renderedLayers.map(({ layer, buffer }) => {
    const processedBuffer = applyGlitchMapToBuffer(context, buffer, glitchMap);

    const source = context.createBufferSource();
    source.buffer = processedBuffer;

    const gainNode = context.createGain();
    gainNode.gain.value = layer.gain;

    source.connect(gainNode);
    gainNode.connect(fx.input);

    const startTime = startAt + layer.delaySeconds;
    source.start(startTime);

    allNodes.push(source, gainNode);
    sources.push(source);

    return {
      layer,
      buffer,
      source,
      gainNode,
      startTime,
      endTime: startTime + buffer.duration,
    };
  });

  const endTime = scheduledLayers.reduce((max, entry) => Math.max(max, entry.endTime), startAt);

  const lowEntry = plan.layers[0]
    ? scheduledLayers.find((entry) => entry.layer === plan.layers[0])
    : undefined;
  const highEntry = plan.layers[1]
    ? scheduledLayers.find((entry) => entry.layer === plan.layers[1])
    : undefined;

  if (plan.alternation && lowEntry && highEntry) {
    const alternationStart = Math.max(lowEntry.startTime, highEntry.startTime);
    const alternationEnd = Math.min(lowEntry.endTime, highEntry.endTime);

    scheduleAlternation(
      lowEntry.gainNode,
      highEntry.gainNode,
      lowEntry.layer.gain,
      highEntry.layer.gain,
      alternationStart,
      alternationEnd,
      plan.alternation.segmentCount,
      plan.alternation.crossfadeSeconds
    );
  }

  // Micro glitches are now baked into the buffer directly using applyGlitchMapToBuffer

  const playback: ActivePlayback = {
    id: ++playbackIdCounter,
    sources,
    nodes: allNodes,
    endTime,
  };

  return { endTime, playback };
}

function disconnectNodes(nodes: AudioNode[]): void {
  nodes.forEach((node) => {
    try {
      node.disconnect();
    } catch {
      // Ignore disconnect races.
    }
  });
}

function stopPlayback(): void {
  if (!activePlayback) return;

  activePlayback.sources.forEach((source) => {
    try {
      source.stop();
    } catch {
      // Ignore nodes already stopped.
    }
  });

  disconnectNodes(activePlayback.nodes);
  activePlayback = null;
}

function getRuntimeBaseUrl(): string {
  const fromVite = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL;
  if (typeof fromVite === 'string' && fromVite.length > 0) {
    return fromVite.endsWith('/') ? fromVite : `${fromVite}/`;
  }

  const basePath = new URL('./', window.location.href).pathname;
  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

function buildAvatarBaseCandidates(): string[] {
  const runtimeBase = getRuntimeBaseUrl();
  const fromRuntimeBase = new URL('assets/avatar_frames_cutout2/', `${window.location.origin}${runtimeBase}`).href;
  const fromOriginRoot = new URL('assets/avatar_frames_cutout2/', `${window.location.origin}/`).href;
  const fromDocumentBase = new URL('assets/avatar_frames_cutout2/', document.baseURI).href;
  const fromScriptSibling = new URL('./assets/avatar_frames_cutout2/', import.meta.url).href;
  const fromScriptParent = new URL('../assets/avatar_frames_cutout2/', import.meta.url).href;

  return Array.from(
    new Set([
      fromRuntimeBase,
      fromOriginRoot,
      fromDocumentBase,
      fromScriptSibling,
      fromScriptParent,
    ])
  );
}

function buildAvatarFrameUrlCandidates(fileName: string, normalization: 'NFD' | 'NFC' = 'NFD'): string[] {
  const normalized = fileName.normalize(normalization);
  const encoded = encodeURIComponent(normalized);
  return buildAvatarBaseCandidates().map((base) => `${base}${encoded}`);
}

function tryLoadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

function loadAvatarFrame(fileName: string): Promise<string> {
  const existing = resolvedFrameSources.get(fileName);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    void (async () => {
      const nfdCandidates = buildAvatarFrameUrlCandidates(fileName, 'NFD');
      for (const url of nfdCandidates) {
        if (await tryLoadImage(url)) {
          resolvedFrameSources.set(fileName, url);
          resolve(url);
          return;
        }
      }

      const nfcCandidates = buildAvatarFrameUrlCandidates(fileName, 'NFC');
      for (const url of nfcCandidates) {
        if (await tryLoadImage(url)) {
          resolvedFrameSources.set(fileName, url);
          resolve(url);
          return;
        }
      }

      const fallback = nfdCandidates[0] ?? nfcCandidates[0] ?? fileName;
      resolvedFrameSources.set(fileName, fallback);
      resolve(fallback);
    })();
  });
}

async function preloadAvatarFrames(frameList: string[]): Promise<void> {
  const unique = Array.from(new Set(frameList));
  await Promise.all(unique.map((frame) => loadAvatarFrame(frame)));
}

function getResolvedFrameUrl(fileName: string): string {
  const existing = resolvedFrameSources.get(fileName);
  if (existing) return existing;
  const candidates = buildAvatarFrameUrlCandidates(fileName, 'NFD');
  return candidates[0] ?? fileName;
}

function advancePopupAnimation(deltaSeconds: number): void {
  if (!popupState.visible || popupState.phases.length === 0) return;

  popupState.avatarFrameTimer += deltaSeconds;
  if (popupState.avatarFrameTimer < popupState.avatarFrameInterval) {
    return;
  }

  popupState.avatarFrameTimer = 0;

  const phase = popupState.phases[popupState.currentPhaseIndex];
  if (!phase || phase.frameSequence.length === 0) return;

  popupState.avatarFrameIndex = popupState.currentPhaseFrameCount % phase.frameSequence.length;
  popupState.currentPhaseFrameCount += 1;

  if (popupState.currentPhaseFrameCount >= phase.frameSequence.length) {
    if (popupState.currentPhaseIndex === popupState.phases.length - 1 && popupState.speaking) {
      popupState.currentPhaseFrameCount = 0;
    } else {
      popupState.currentPhaseIndex = Math.min(popupState.currentPhaseIndex + 1, popupState.phases.length - 1);
      popupState.currentPhaseFrameCount = 0;
      popupState.avatarFrameInterval = popupState.phases[popupState.currentPhaseIndex]?.frameInterval ?? 0.12;
    }
  }

  const current = popupState.phases[popupState.currentPhaseIndex];
  const frameName = current?.frameSequence[popupState.avatarFrameIndex];
  if (!frameName) return;
  daemonAvatar.src = getResolvedFrameUrl(frameName);
}

function advancePopupTyping(nowSeconds: number, deltaSeconds: number): void {
  if (!popupState.visible) return;

  if (popupState.typingDelayTimer < popupState.typingDelay) {
    popupState.typingDelayTimer += deltaSeconds;
    return;
  }

  if (popupState.pauseUntil > nowSeconds) {
    return;
  }

  const targetLength = popupState.displayText.length;

  if (popupState.typingIndex < targetLength) {
    popupState.typingTimer += deltaSeconds;
    const interval = 1 / Math.max(1, popupState.typingSpeed);

    while (popupState.typingTimer >= interval && popupState.typingIndex < targetLength) {
      popupState.typingTimer -= interval;

      const pause = getPauseAtDisplayIndex(popupState.fullTextWithPauses, popupState.typingIndex);
      if (pause) {
        popupState.pauseUntil = nowSeconds + pause.duration;
        return;
      }

      popupState.typingIndex += 1;
      daemonMessage.textContent = popupState.displayText.slice(0, popupState.typingIndex);

      const lastChar = popupState.displayText.charAt(popupState.typingIndex - 1);
      if (lastChar) {
        typewriterSynth?.triggerForTypedChar();
      }
    }

    return;
  }

  if (popupState.speaking) {
    if (nowSeconds >= popupState.speechEndAt) {
      popupState.speaking = false;
      popupState.holdStartedAt = nowSeconds;
    }
    return;
  }

  if (popupState.holdStartedAt <= 0) {
    popupState.holdStartedAt = nowSeconds;
  }

  if (nowSeconds - popupState.holdStartedAt >= popupState.holdDuration) {
    hidePopupNow();
  }
}

function advancePopupShake(deltaSeconds: number): void {
  if (!popupState.visible) return;

  popupState.glitchTimer = Math.max(0, popupState.glitchTimer - deltaSeconds);
  const activeGlitch = popupState.glitchTimer > 0;
  const activeContinuous = popupState.continuousShake && popupState.speaking;

  if (!activeGlitch && !activeContinuous) {
    daemonPopup.style.setProperty('--shake-x', '0px');
    daemonPopup.style.setProperty('--shake-y', '0px');
    daemonGhost.style.setProperty('--shake-x', '0px');
    daemonGhost.style.setProperty('--shake-y', '0px');
    daemonPopup.style.setProperty('--glow', '0');
    return;
  }

  const decay = popupState.glitchDuration > 0 ? popupState.glitchTimer / popupState.glitchDuration : 0;
  const intensity = activeGlitch
    ? popupState.shakeStrength * (0.4 + decay * 0.8)
    : popupState.shakeStrength * 0.35;

  const x = (Math.random() * 2 - 1) * intensity;
  const y = (Math.random() * 2 - 1) * (intensity * 0.5);

  daemonPopup.style.setProperty('--shake-x', `${x.toFixed(2)}px`);
  daemonPopup.style.setProperty('--shake-y', `${y.toFixed(2)}px`);
  daemonGhost.style.setProperty('--shake-x', `${(-x * 0.45).toFixed(2)}px`);
  daemonGhost.style.setProperty('--shake-y', `${(-y * 0.35).toFixed(2)}px`);
  daemonPopup.style.setProperty('--glow', activeGlitch ? `${(0.6 + decay * 0.4).toFixed(3)}` : '0.35');
}

function startAnimationLoop(): void {
  previousTickSeconds = performance.now() / 1000;

  const tick = () => {
    const nowSeconds = performance.now() / 1000;
    const deltaSeconds = Math.min(0.05, Math.max(0, nowSeconds - previousTickSeconds));
    previousTickSeconds = nowSeconds;

    advancePopupAnimation(deltaSeconds);
    advancePopupTyping(nowSeconds, deltaSeconds);
    advancePopupShake(deltaSeconds);

    rafHandle = requestAnimationFrame(tick);
  };

  if (rafHandle !== 0) {
    cancelAnimationFrame(rafHandle);
  }

  rafHandle = requestAnimationFrame(tick);
}

function resolveTextAndVoiceline(): { text: string; voiceline: VoicelineConfig | undefined } {
  const sourceType = getSourceType();

  if (sourceType === 'voiceline') {
    const voiceline = getVoicelineById(voicelineIdSelect.value);
    return {
      text: voiceline?.message ?? messageInput.value,
      voiceline,
    };
  }

  if (sourceType === 'library') {
    const language = getLanguage();
    const selected = MESSAGE_LIBRARY[language].find((entry) => entry.id === libraryLineSelect.value);
    return {
      text: selected?.text ?? messageInput.value,
      voiceline: undefined,
    };
  }

  return {
    text: messageInput.value,
    voiceline: undefined,
  };
}

async function playCurrentLine(): Promise<void> {
  const resolved = resolveTextAndVoiceline();
  const text = resolved.text.trim();

  if (!text) {
    daemonMeta.textContent = 'Type or select a message first.';
    return;
  }

  stopPlayback();

  const resolvedTypingSpeed = resolveTypingSpeed(text, resolved.voiceline);
  activeTypingSpeedCps = resolvedTypingSpeed;
  if (autoTypingSyncInput.checked) {
    typingSpeedInput.value = String(Math.round(resolvedTypingSpeed));
    updateRangeOutput(typingSpeedInput);
  }

  const phases = buildAnimationPhases(resolved.voiceline);
  const allFrames = phases.flatMap((phase) => phase.frameSequence);
  await preloadAvatarFrames(allFrames);

  startPopupFromText(text, phases);
  popupState.typingSpeed = resolvedTypingSpeed;
  popupState.holdDuration = resolved.voiceline?.holdDuration ?? numberValue(holdDurationInput, 1.8);

  if (enableTypewriterSynthInput.checked) {
    resetTypewriterSynth(resolvedTypingSpeed);
    const context = await ensureAudioContext();
    typewriterSynth?.attachContext(context);
    await typewriterSynth?.unlock();

    // Short preview chirp so the user can immediately confirm synth audibility.
    typewriterSynth?.triggerForTypedChar();
    setTimeout(() => typewriterSynth?.triggerForTypedChar(), 34);
  } else {
    resetTypewriterSynth();
  }

  daemonMeta.textContent = 'Rendering meSpeak layers and applying FX...';

  try {
    const { endTime, playback } = await playSynthesisText(stripPauseMarkers(text));
    activePlayback = playback;

    popupState.speaking = true;
    popupState.speechEndAt = endTime;
    daemonMeta.textContent = `Playing with ${synthesisModeSelect.value} mode.`;
  } catch (error) {
    console.error('Voice playback failed', error);
    popupState.speaking = false;
    popupState.holdStartedAt = performance.now() / 1000;
    daemonMeta.textContent = 'Playback failed. Check console for details.';
  }
}

function randomizeSlightly(): void {
  const randomRange = (input: HTMLInputElement, min: number, max: number) => {
    const current = numberValue(input, min);
    const span = max - min;
    const jitter = (Math.random() * 2 - 1) * span * 0.08;
    const next = Math.max(min, Math.min(max, current + jitter));
    input.value = String(Number(next.toFixed(3)));
  };

  randomRange(lowPitchInput, 0, 99);
  randomRange(highPitchInput, 0, 99);
  randomRange(lowSpeedInput, 90, 260);
  if (syncSpeedInput.checked) {
    applySpeedSyncFrom('low');
  } else {
    randomRange(highSpeedInput, 90, 260);
  }
  randomRange(overlayDelayInput, 0, 120);
  randomRange(glitchChanceInput, 0, 1);
  randomRange(reverbMixInput, 0, 1);
  randomRange(distortionInput, 0, 1);
  randomRange(shakeStrengthInput, 0, 14);

  bindRangeOutputs();
}
