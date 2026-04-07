# Daemon Voice Lab - Parameter Guide

This guide explains the less obvious voice synthesis controls in `daemon-voice-lab.html`.

## Core Behavior

- `Dual overlay`: both voices read the full sentence at the same time.
- `Alternate chunks`: both voices still read the full sentence, but volume crossfades between low/high voice over time to create pitch switching without sentence gaps.
- `Glitch switch`: same continuous alternation as above, plus short repeated micro-slices of the rendered audio to simulate bug/glitch artifacts.

## Voice Pair Controls

- `Low/High amplitude`:
  - Controls synthesis loudness per voice before FX.
  - Higher value = stronger voice contribution.
  - Practical tuning:
    - Keep both near each other for balanced dual voice.
    - Push low higher for heavier/demonic weight.
    - Push high higher for metallic/taunting edge.

- `Sync low/high speed`:
  - When enabled, both voices share the same WPM to avoid progressive desync (snowball drift).
  - Recommended ON for `alternate` and `glitch-switch`.

- `Fixed voice delay (ms)` (formerly overlay delay):
  - Adds a constant start offset between the two voices.
  - `0-12ms`: near-merged timbre.
  - `12-35ms`: noticeable dual texture.
  - `35ms+`: clearly separated attack / echo-like double-hit.

- `Word gap (10ms unit)`:
  - Extra pause between words inserted by meSpeak.
  - Useful for robotic cadence.
  - Too high values can make lines sound choppy.

## Alternation / Glitch Controls

- `Chunk words`:
  - Defines how often the lab switches active voice in continuous alternation.
  - Lower values = more frequent pitch jumps.
  - Higher values = slower, more readable switching.

- `Glitch chance`:
  - Probability/intensity driver for glitch events in `glitch-switch` mode.
  - Higher values spawn more micro-repeat events.

- `Replay slice size` (UI id kept from old replay words control):
  - Controls the length of each repeated glitch slice.
  - It now targets short audio slices (roughly syllable-like durations), not whole word chunks.
  - Lower = sharper digital stutter.
  - Higher = chunkier repeat artifacts.

## Typing + SFX Sync

- `Auto sync typing to voice WPM`:
  - Automatically derives typing speed (chars/s) from current voice speed settings.
  - Useful to keep text reveal and narration approximately aligned without manual per-line tweaking.
  - If OFF, the manual `Typing speed` slider is used as-is.

- `Play SciFi typewriter synth while typing`:
  - Enables procedural typing beeps while characters are revealed.
  - Lets you audition "voice + text SFX" in one pass.
  - On `Play line`, the lab emits a tiny 2-click preview chirp to confirm synth audibility.

- `Typewriter synth preset`:
  - Selects the style of procedural typing beep (`oldschool_fast`, `oldschool_arcade`, `oldschool_crt`).
  - Preset changes timbre and click cadence, while still adapting to effective typing speed.

## Quick Starting Presets

- Clean dual voice:
  - Mode: `dual-overlay`
  - Sync speed: ON
  - Delay: `10-20ms`
  - Distortion: low-to-mid

- Convincing pitch-jump narration:
  - Mode: `alternate`
  - Sync speed: ON
  - Chunk words: `2-4`
  - Delay: `6-16ms`

- Aggressive daemon glitch:
  - Mode: `glitch-switch`
  - Sync speed: ON
  - Chunk words: `2-3`
  - Glitch chance: `0.45-0.75`
  - Replay slice size: `1-3`
