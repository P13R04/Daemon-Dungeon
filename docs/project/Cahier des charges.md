# PROJECT SPECIFICATION: DAEMON DUNGEON

## 1. Project Overview
**Title:** Daemon Dungeon
**Genre:** Isometric 3D Roguelike / Dungeon Crawler
**Theme:** Tech-Fantasy / Glitch / Cyberpunk. A "Program" (Player) fights against a malicious AI ("The Daemon") inside a corrupted system.
**Platform:** Web Browser (PC focus, Mobile controls ready via abstraction).
**Engine:** Babylon.js (TypeScript).

## 2. Core Architecture Principles
To ensure scalability and maintainability, the project must adhere to these rules:

### A. Data-Driven Design
* **No Hard-Coded Stats:** All damage values, speeds, health pools, and loot tables must be loaded from external configuration files (JSON/Typescript Config objects).
* **Level Design:** Rooms are defined via ASCII templates or JSON data, not manually positioned in code.

### B. Composition over Inheritance (Combat System)
* Avoid deep inheritance trees for entities.
* **Entities:** Use a component-based approach (or ECS-lite). An entity is a container for logic (Movement, Health, Attack).
* **Abilities:** Interactions must be modular. An "Attack" is composed of:
    * **Pattern:** (Projectile, Raycast, Melee, AoE).
    * **Payload:** (Damage, Heal, Knockback).
    * **Modifiers:** (Stun, DoT, Pierce, Bounce).
    * *Example:* An item can modify the Player's attack by injecting a "Burn Modifier" into the Payload without changing the Attack logic itself.

### C. State Management
* Use a global **GameManager** with a finite state machine:
    * `BOOT`: Asset loading.
    * `MAIN_MENU`: Title screen, Settings, Codex.
    * `CHARACTER_SELECT`: 3D Carousel view.
    * `GAMEPLAY_LOOP`: Active run.
    * `PAUSE`: Suspended logic.
    * `GAME_OVER`: Win/Loss screen.

### D. Event-Based Communication
* Systems should not tightly couple. Use a **Global Event Bus** (Observable pattern) for communication.
    * *Example:* When Player HP drops, Player emits `onHealthChanged`. The UI Manager listens to update the bar. The Daemon Narrative Manager listens to trigger a taunt.

### E. Modular UI & Presentation
* **Feature Flags:** Every UI layer (HUD, damage numbers, logs, dev overlays) must be independently toggleable.
* **Swappable Presentation:** Any UI or VFX module can be replaced by placeholders (simple shapes/colors) without changing core gameplay logic.
* **Rendering Abstraction:** UI widgets read data from events/state, never from direct references to game objects.

---

## 3. Tech Stack & Rendering
* **Language:** TypeScript.
* **Engine:** Babylon.js 6+.
* **Performance:**
    * Use **AssetContainer** for loading assets.
    * Implement **Object Pooling** for projectiles, enemies, and VFX (Crucial for web performance).
    * **Room Management:** Only render Active Room, Previous Room (for smooth exit), and Next Room (for smooth entry). Dispose/Disable distant rooms.
* **Visual Style:**
    * Low Poly / Voxel aesthetic.
    * **DefaultRenderingPipeline:** Heavy use of Pixelation, Chromatic Aberration, Glow Layer, and CRT/Scanline effects to simulate a "glitchy monitor".
    * **Fog of War:** Obscure future rooms/enemies until the player enters the room.

---

## 4. Gameplay Mechanics

### A. The Run Loop
1.  **Room Entry:** Player enters. Doors lock.
2.  **Combat Phase:** Enemies spawn via Tile logic. Timer starts (soft enrage or bonus objective).
3.  **Clear:** Last enemy dies -> "Process Terminated". Doors unlock.
4.  **Reward:** Player interacts with a terminal/object to choose a Bonus (Stat up, New Passive, Meta-currency).
5.  **Shop (Optional):** Occasional chance to buy heals/items.
6.  **Transition:** Camera pans to the next room.

### B. Difficulty & Stat Scaling
* **Enemy Base Stats:** Enemies spawn with base stats in Room 1 (HP, Damage, Speed, Behavior parameters).
* **Progressive Scaling:** After each room, enemy stats scale upward via configurable curves (JSON). Scaling applies globally and may vary by enemy archetype.
* **Player Compensation:** Player stats may increase per room (optional, configurable), but the primary counterbalance is via bonuses/build choices.
* **Balance Target:** Scaling must create pressure without invalidating skillful play or item synergy.

### C. Player Classes
Classes are defined in JSON config.
* **Stats:** HP, Speed, Dmg, FireRate.
* **Kit:**
    * `Primary`: Main weapon (Mouse aim).
    * `Secondary/Passive`: Unique mechanic.
    * `Ultimate`: High impact, charges over time or via kills (Spacebar).
    * `Items`: 1-2 slots for active artifacts (Q/E).

### D. The Daemon (Narrative AI)
* **System:** A `NarrativeManager` observes game events.
* **Triggers:** Low HP, Missed Ult, Boss Entry, Room Clear, Idle.
* **Output:**
    * **Audio:** Robotic voice processing.
    * **Visual:** Glitch effect on UI header, text appears character-by-character (terminal style).
    * **Content:** Cynical, meta-humor, computer puns (e.g., "Error 404: Skill not found").

---

## 5. Level Design System

### A. Room Generation
* **Grid System:** Rooms are tile-based.
* **Templates:** Rooms are designed via ASCII arrays in code/JSON.
    * `#`: Wall
    * `.`: Floor
    * `S`: Start
    * `E`: Exit
    * `M`: Melee Enemy Spawn
    * `R`: Ranged Enemy Spawn
    * `O`: Obstacle/Trap
* **Editor Tools:** A "Dev Mode" must allow hot-reloading of room layouts or a simple drag-and-drop interface to export JSON.

### B. Camera
* Isometric view.
* Smooth damping.
* Locks to the current room bounds during combat. transitions to the next room center during movement phase.

---

## 6. User Interface (UI)

### A. HUD (Diegetic/Terminal Style)
* **Health:** "System Integrity" bar.
* **Logs:** Scrolling command lines for combat info ("Crit Error applied to Enemy_01").
* **Wave:** "Process Cycle #X".
* **Ult:** Charge meter.
* **Enemy UI:** HP bar above each enemy.
* **Damage Numbers:** Floating damage values displayed on hit (toggleable).

### B. Menus
* **Character Select:** 3D scene. Rotating platform. Selected char in front with spotlight and stats.
* **Settings:** Audio, Keybindings (re-mappable), Accessibility (Daltonian modes, High Contrast, Subtitles scaling).

### C. UI Modularity Requirements
* UI elements must be built as independent modules (HUD, logs, damage numbers, enemy HP, dev overlays).
* Each module must be enable/disable without removing data sources.
* All UI text and labels must be internationalization-ready (English by default).

---

## 7. Developer Tools (The "God Console")
A dedicated UI overlay (e.g., dat.GUI or ImGui style) togglable via a specific key (e.g., F10).
* **Room Control:** Skip Room, Reset Room, Load specific Room ID.
* **Stats Override:** Slider for Player Speed, Damage, Enemy HP (Real-time).
* **Cheats:** God Mode, Infinite Ult, Add Item.
* **Export:** Button to "Export Current Stats" to JSON (for balancing).

---

## 8. Inputs
* **InputManager:** Abstract layer.
* **PC:** WASD/ZQSD + Mouse Aim + Click.
* **Mobile:** Virtual Joysticks (Left: Move, Right: Aim/Cast) + Touch Buttons.

---

## 9. Backend & Persistence System

### A. Account Management
* **Registration/Login:** Email + Password authentication (JWT tokens).
* **Session Management:** Persistent login via refresh tokens.
* **Profile Data:** Username, avatar (optional), account creation date, total playtime.
* **Offline Support:** Game must remain fully playable without authentication. Backend features are optional enhancements.

### B. Leaderboards
* **Global Leaderboards:** Top scores across all players (Daily, Weekly, All-Time).
* **Filters:** By class, by room reached, by build archetype.
* **Data Stored:** Score, class, rooms cleared, time survived, build summary (bonuses taken).
* **Anti-Cheat:** Server-side validation of run data (basic sanity checks on stats/progression).

### C. Run Save System
* **Save Points:** Between rooms only (after bonus selection, before next room entry).
* **Save Data Structure:**
    * Player state (HP, stats, class, bonuses, items, ultimate charge).
    * Current room number.
    * Seed (if procedural elements exist).
    * Timestamp.
* **Resume:** Load saved run from Main Menu. Only one active run per account.
* **Expiration:** Optional timeout (e.g., 7 days) to prevent save bloat.

### D. Codex & Achievements
* **Codex Entries:**
    * **Enemies:** Unlock on first encounter. Store: name, description, stats, lore snippet.
    * **Bonuses/Items:** Unlock when obtained. Store: icon, description, effects.
    * **Classes:** Unlock on first play or by default.
* **Achievements:**
    * Trigger conditions (e.g., "Defeat 100 zombies", "Reach Room 20", "Win without taking damage").
    * Progress tracking (incremental vs one-time).
    * Reward: Cosmetic unlocks or lore entries.
* **Sync:** Codex and achievements sync to backend on unlock. Local cache for offline play.

### E. Backend Architecture (Tech Stack Suggestions)
* **API:** RESTful or GraphQL (Node.js/Express, NestJS, or similar).
* **Database:** PostgreSQL or MongoDB for user data, scores, codex.
* **Authentication:** JWT (access + refresh tokens). Optional OAuth (Google, Discord).
* **Hosting:** Vercel, Railway, Heroku, or cloud provider (AWS, GCP, Azure).
* **Security:** Rate limiting, input validation, encrypted passwords (bcrypt), HTTPS only.

---

## 10. Missing/To-Define Details (For later implementation)
* **Localization:** System is English-native, but structure should support i18n keys from the start.
* **Social Features:** Friend lists, run sharing, spectator mode (stretch goals).

---

## 11. Assets & Naming Conventions
* **Strict Naming:** Assets must follow a consistent naming scheme to avoid confusion.
    * Example: `enemy_zombie_fast_v01.glb`, `sfx_ui_click_v02.wav`, `vo_daemon_taunt_001.ogg`, `room_preset_03.json`.
* **Folders by Type:** Separate folders for `models/`, `textures/`, `sounds/`, `music/`, `shaders/`, `rooms/`, `ui/`.
* **Versioned Content:** Use suffixes (`_v01`, `_v02`) for iteration tracking.

---

## 12. Placeholder-First Development
* Must be fully playable using geometric placeholders and flat colors.
* Replaceable assets (3D models, VFX, UI skins) must not alter gameplay behavior.

---

## 13. Deployment & Hosting
* **Target:** Static hosting (GitHub Pages, Netlify, or equivalent).
* **Build:** Babylon.js + TypeScript bundled with a standard web build pipeline.
* **Performance Budget:** Maintain stable FPS on mid-range laptops; prioritize pooling and instancing.

