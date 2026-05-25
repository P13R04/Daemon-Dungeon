# Voicelines System - Implementation Guide

## Overview

The voicelines system provides a clean, centralized way to manage daemon character animations and messages with multiple animation phases. Instead of hardcoding animation sequences throughout the codebase, all voicelines are defined in a single configuration file.

## Architecture

### 1. **VoicelineDefinitions.ts** (`src/data/voicelines/`)
Centralized registry for all voicelines with clean, readable configuration.

```typescript
export interface AnimationPhase {
  emotion: string;        // Which emotion/animation set to use
  cycles: number;        // How many times to repeat the full sequence
  frameInterval?: number; // Optional: frame duration in seconds
}

export interface VoicelineConfig {
  id: string;
  message: string;
  animationSequence: AnimationPhase[];
  typingSpeed?: number;      // Characters per second (default: 55)
  holdDuration?: number;     // Seconds to display after typing (default: 3.5)
}
```

### 2. **HUDManager.ts** - Enhanced Animation System
- New method: `playVoiceline(config: VoicelineConfig)` - Public method to play any voiceline
- Supports multiple animation phases with different frame intervals
- Each phase can repeat multiple times
- Automatic frame preloading for smooth playback

### 3. **DevConsole.ts** - Testing Interface
- New section: "VOICELINE TESTING"
- Selector to browse all registered voicelines
- Play button to test voicelines in real-time
- Same UI pattern as room selection

## Adding New Voicelines

### Simple Example

```typescript
export const VOICELINES: Record<string, VoicelineConfig> = {
  'error_404_skill_not_found': {
    id: 'error_404_skill_not_found',
    message: 'Error 404, skill not found',
    animationSequence: [
      {
        emotion: 'error',      // Play error animation set
        cycles: 1,             // One full cycle (4 frames: error_01 to error_04)
        frameInterval: 0.15,   // Each frame stays for 150ms
      },
      {
        emotion: 'bored',      // Then play bored animation
        cycles: 3,             // Three cycles (12 frames total: bored_01-04 repeated 3x)
        frameInterval: 0.18,   // Each frame stays for 180ms
      },
    ],
    typingSpeed: 30,    // Slow reading: 30 characters per second
    holdDuration: 4.0,  // Display for 4 seconds after typing finishes
  },
};
```

### Available Emotions (Animation Sets)

These correspond to the daemon avatar sets:
- `'blasé'` (2 frames)
- `'bored'` (4 frames)
- `'bsod'` (4 frames)
- `'censored'`, `'censuré'` (4 frames)
- `'choqué'` (2 frames)
- `'error'` (4 frames)
- `'goofy'` (3 frames)
- `'happy'` (4 frames)
- `'init'` (4 frames)
- `'loading'` (2 frames)
- `'override'` (4 frames)
- `'reboot'` (4 frames)
- `'rire'` (4 frames)
- `'supérieur'` (4 frames)
- `'surpris'` (4 frames)
- `'énervé'` (4 frames)

## Usage

### From Code

```typescript
import { getVoiceline } from './data/voicelines/VoicelineDefinitions';
import { HUDManager } from './systems/HUDManager';

// Get a voiceline and play it
const config = getVoiceline('error_404_skill_not_found');
if (config && hudManager) {
  await hudManager.playVoiceline(config);
}
```

### From Dev Console

1. Load the game
2. Open Dev Console (press `-` key)
3. Scroll to "VOICELINE TESTING" section
4. Use `<` and `>` buttons to browse voicelines
5. Click "PLAY VOICELINE" to test

### Timing Parameters

- **typingSpeed** (characters/second): Controls how fast text appears
  - 55 = normal (default)
  - 30 = slow reading
  - 60+ = fast

- **holdDuration** (seconds): How long message stays after typing
  - Default: 3.5
  - Recommended: 2-5 seconds

- **frameInterval** (seconds): Duration each animation frame displays
  - 0.10 = fast (100ms per frame)
  - 0.15 = medium (150ms)
  - 0.20 = slow (200ms)

## Test Room

Load `room_test_voicelines` to test voicelines in game:
- Empty room with daemon popup area
- Use dev console to select and play any voiceline
- Perfect for iteration and tweaking timing

## Best Practices

1. **Define all voicelines centrally** in `VoicelineDefinitions.ts`
2. **Use meaningful IDs** with underscores (e.g., `'error_404_skill_not_found'`)
3. **Group similar emotions** - start with error/warning, transition to bored/happy
4. **Test in dev console** before integrating into gameplay
5. **Consider pacing** - match typing speed to message length
6. **Reuse emotions** - don't create new animation sets, use existing ones creatively

## Future Enhancements

Potential additions:
- Sound/voice acting support
- Multiple message variants with random selection
- Emotion transitions (e.g., error → sad)
- Conditional logic based on game state
- Queue system for multiple voicelines
- Customizable animation easing/timing curves
