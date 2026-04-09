# Testing Voicelines

This room is designed to test daemon voicelines without any gameplay mechanics.

## How to Use

1. **Load the room**: 
   - Open Dev Console (press `-`)
   - Go to "ROOM TESTING" section
   - Select "room_test_voicelines" 
   - Click "LOAD ROOM"

2. **Test voicelines**:
   - Stay in the room
   - Go to "VOICELINE TESTING" section
   - Use `<` and `>` to browse voicelines
   - Click "PLAY VOICELINE" to see the daemon appear and speak

3. **Iterate**:
   - Adjust timing/animation parameters in `src/data/voicelines/VoicelineDefinitions.ts`
   - Reload the room or just play voicelines again
   - No need to restart the full game

## Room Details

- **Layout**: 13x11 empty room with walls
- **Player spawn**: Center (M marker at position 6,5)
- **Enemies**: One dummy_tank for reference (won't attack)
- **Purpose**: Daemon popup testing only

## Current Voicelines Registered

1. `error_404_skill_not_found` - Error state transitioning to bored

## Adding More

Once you've tested a voiceline here, you can:
1. Integrate it into gameplay events (damage boasts, room clear messages, etc.)
2. Add it to event listeners in relevant controllers
3. Call `hudManager.playVoiceline(getVoiceline('your_id'))`

Example integration:
```typescript
// In PlayerController or combat system
import { getVoiceline } from '../data/voicelines/VoicelineDefinitions';

if (enemyCount === 0) {
  const voiceline = getVoiceline('error_404_skill_not_found');
  if (voiceline) {
    this.hudManager.playVoiceline(voiceline);
  }
}
```
