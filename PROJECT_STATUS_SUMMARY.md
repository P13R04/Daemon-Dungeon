# Daemon Dungeon — Project Status Summary

## Current Build State
- Compiles and runs locally.
- Core gameplay loop functional for the current test flow.

## Implemented Gameplay
- **Player & Camera**
  - Fixed player spawn and visibility (Y=1.0).
  - Camera rotated and elevated for a clear oblique view.
  - Camera centered on room bounds.
  - Mouse aim now uses a ground-plane raycast for accurate projectile targeting.

- **Room System**
  - Rooms defined in JSON with 13x11 layouts.
  - New test room: `room_test_dummies`.
  - Hazard zones on the floor (damage over time).

- **Enemies**
  - Spawning uses room `spawnPoints` with `enemyType`.
  - Dummy tank enemy for testing: `dummy_tank`.
  - Enemies die and meshes are disposed.
  - Enemy health bars follow enemy positions.

- **Combat**
  - Projectiles spawn on click and are destroyed on wall contact.
  - Enemy damage displays as floating numbers near impact.
  - Player vs enemy and enemy vs enemy collision resolution.

- **Mage Passive (Focus Fire)**
  - Attack speed ramps while stationary.
  - Resets on movement and at room start.

- **Ultimate (Mage)**
  - Ground AoE that applies DOT to enemies and HOT to the player.
  - Radius and heal/DOT configurable in player config.
  - Ultimate charge increases only during gameplay when enemies are present.
  - Debug option “Infinite Ultimate” works.

- **Game Flow**
  - Start screen → gameplay → room clear → next room.
  - Game over screen with restart.

- **UI / HUD**
  - Terminal-style HUD skeleton (top integrity bar, wave counter, command log, status panel).
  - Daemon popup with typewriter text and animated placeholder avatar.
  - Dev console shifted down to avoid top HUD overlap; section titles no longer clipped.

- **Menus**
  - Main menu with Play / Codex / Settings navigation screens.
  - Play now routes to class selection (Mage ready; others coming soon).
  - Back navigation between menu screens.

## Key Config Files
- Player stats, passive and ultimate: `src/data/config/player.json`
- Enemy types: `src/data/config/enemies.json`
- Rooms: `src/data/config/rooms.json`

## Known Limitations / TODO
- Room progression logic is basic (single test flow).
- Damage numbers are simple and can be refined.
- Combat feedback FX (hit flashes, impact effects) not yet added.
- Hazard zones are basic rectangles (no fancy VFX yet).
- Advanced collision with walls for entities still simplified.
- Codex and Settings screens are placeholders.
- Class selection is placeholder (no carousel yet).

## Notes for Teammates
- Test room is currently `room_test_dummies`.
- Dummy enemies are immobile; good for tuning combat.
- Use the Dev Console for debug toggles.
