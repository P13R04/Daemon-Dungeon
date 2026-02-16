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
  - **Tile System (NEW)**:
    - Adjacency-based tile rendering with automatic texture selection and rotation.
    - Integrated tiles_mapping editor for visual room design.
    - Support for floor, wall, pillar, poison, void, and spikes tiles.
    - Tile-based hazards: poison (6 DPS), spikes (10 DPS), void (instant death).
    - Coordinate mapping solved: editor Y-axis (down) properly mapped to Babylon Z-axis.
    - Test rooms: room_test_json, room_test_tiles_hazards, room_test_tiles_maze.
    - Pixel-perfect texture rendering with NEAREST_SAMPLINGMODE.
    - Multi-room support with origin-aware positioning.
    - Export from tiles_mapping editor to game-compatible JSON.

- **Enemies**
  - Spawning uses room `spawnPoints` with `enemyType`.
  - Dummy tank enemy for testing: `dummy_tank`.
  - Expanded bestiary with new behaviors and configs:
    - Bull, Pong, Jumper, Fuyard (kite/orbit), Strategist (lead), Sentinel/Turret (ranged).
    - Healer, Artificer (split impact + DoT zones), Bullet Hell, Mage Missile, Missile.
  - Crowd steering, obstacle avoidance, and stuck handling for mobs.
  - Missile collision now explodes on pillar contact.
  - Enemy health bars follow enemy positions and can be toggled.

- **Combat**
  - Projectiles spawn on click and are destroyed on wall contact.
  - Enemy damage displays as floating numbers near impact (throttled + accumulated per enemy).
  - Player vs enemy and enemy vs enemy collision resolution.
  - Enemy projectiles support friendly/enemy flags, AoE impact, delayed explosions, split nodes and DoT zones.

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
  - Dev console is scrollable and adapts to screen height.
  - UI scaling decoupled from post-processing upscaling; enemy health bars render on a separate UI layer.
  - Player health display rounded to integer; bars drain from left to right.

- **Menus**
  - Main menu with Play / Codex / Settings navigation screens.
  - Play now routes to class selection (Mage ready; others coming soon).
  - Back navigation between menu screens.

- **Post Processing**
  - Default rendering pipeline with pixelation (hardware scaling), glow layer, chromatic aberration, grain, and vignette.
  - Fully toggleable at runtime via Dev Console with sliders for key parameters.
  - Disabling post FX fully disposes the pipeline and restores normal scaling.

## Key Config Files
- Player stats, passive and ultimate: `src/data/config/player.json`
- Enemy types: `src/data/config/enemies.json`
- Rooms: `src/data/config/rooms.json`
- Gameplay (tile hazards): `src/data/config/gameplay.json`
- Tile editor: `tiles_mapping/index.html`

## Known Limitations / TODO
- Room progression logic is basic (single test flow).
- Damage numbers are simple and can be refined.
- Combat feedback FX (hit flashes, impact effects) not yet added.
- Hazard zones are basic rectangles (no fancy VFX yet).
- Advanced collision with walls for entities still simplified.
- Codex and Settings screens are placeholders.
- Class selection is placeholder (no carousel yet).
- **Tile System TODO**:
  - Add physical hitboxes for wall/pillar tiles.
  - Implement void transparency with visual falling effect.
  - Render walls as 3D geometry instead of flat tiles.
  - Integrate enemy spawning on specific tiles.
  - Support varied obstacle types (crates, statues, etc.).
  - Adapt pathfinding system to tile-based rooms.
  - Generalize tile system to all existing rooms.

## Notes for Teammates
- Test room is currently `room_test_dummies`.
- Dummy enemies are immobile; good for tuning combat.
- Use the Dev Console for debug toggles.
- **Tile System Usage**:
  - Design rooms in `tiles_mapping/index.html` editor.
  - Export with `exportGameJSON()` in browser console.
  - Test rooms: `room_test_json`, `room_test_tiles_hazards`, `room_test_tiles_maze`.
  - Load custom rooms: `window.gameManager.loadRoom('room_name')`.
  - See `TILE_SYSTEM_FINAL_IMPLEMENTATION.md` for complete documentation.
