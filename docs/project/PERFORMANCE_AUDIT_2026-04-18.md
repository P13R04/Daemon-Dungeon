# PERFORMANCE AUDIT - 2026-04-18

## Scope
Large optimization pass focused on:
- reducing initial loading time
- reducing room transition spikes
- preserving gameplay behavior and current visual identity
- introducing a lightweight alternative texture mode that can be toggled from settings

## Hotspots Identified

### 1) Procedural floor materials were over-specialized
In relief mode, floor material cache keys included tile coordinates.
Effect: many unique DynamicTexture instances were generated and cached, even when visual differences were minor.

### 2) Relief wall material keys were too granular
Wall face material keys used precise offsets/seeds, creating many near-duplicate materials.
Effect: high texture generation churn and memory pressure.

### 3) High relief geometry density on floor tiles
Relief floor tiles used high subdivisions and per-tile displacement in all cases.
Effect: expensive mesh creation and normal recomputation during tile floor loading.

### 4) Enemy room spawn was burst-loaded
All room enemies were instantiated in one pass.
Effect: frame spikes in rooms with many enemies (boss rooms/stress rooms).

### 5) Room-clear logic ignored pending spawn work
With progressive spawning, room clear could be evaluated too early if no active enemies existed momentarily.
Effect: potential gameplay regression risk (fixed in this pass).

### 6) Room transition preload breadth was aggressive
Transition preloaded wider room ranges than needed in many cases.
Effect: transition-time CPU spikes from room/tile preparation.

### 7) Per-enemy debug logs in constructor path
Enemy initialization emitted console logs per spawn.
Effect: avoidable main-thread overhead in high-enemy scenarios.

## Implemented Changes

### A) New persistent graphics/performance settings
File: src/settings/GameSettings.ts
- Added graphics settings:
  - lightweightTexturesMode (default: true for test)
  - progressiveEnemySpawning (default: true)
  - enemySpawnBatchSize (default: 2)
- Added updateGraphics() and sanitize/clamp logic.

Certainty: HIGH
Reason: deterministic behavior and backward-compatible sanitize defaults.

### B) Main menu settings integration
File: src/scene/MainMenuScene.ts
- Added GRAPHICS // PERFORMANCE section.
- Added toggles for lightweight textures and progressive enemy spawning.
- Updated menu hint text to expose active performance mode.

Certainty: HIGH
Reason: direct UI wiring to persistent settings store.

### C) Lightweight mode in procedural relief pipeline
File: src/systems/ProceduralReliefTheme.ts
- Added runtime lightweight flag:
  - setLightweightMode()
  - isLightweightMode()
- Lightweight mode behavior:
  - reduced procedural texture resolutions
  - reduced anisotropic filtering and sampling cost for wall textures
  - coarser (bucketed) wall material cache keys to increase material reuse
  - floor material cache key no longer tied to raw tile coordinates in lightweight mode (variant bucket + neighbor masks)
  - reduced wall/top mesh subdivisions in relief wall blocks
  - skipped expensive floor warmup prewarm stage in lightweight mode

Certainty: HIGH
Reason: directly reduces generation count and generation complexity.

### D) Reduced tile mesh cost in lightweight mode
File: src/systems/TileSystem.ts
- In lightweight relief mode:
  - floor subdivisions reduced from 14 to 3
  - floor vertex displacement pass skipped
- Procedural prewarm budget capped in lightweight mode.

Certainty: HIGH
Reason: strict reduction in mesh processing and CPU loops.

### E) Progressive room enemy spawning
File: src/systems/EnemySpawner.ts
- Added configurable spawn smoothing:
  - setSpawnSmoothingConfig()
  - queued room spawns processed in batches per frame
- Dynamic gameplay spawns remain immediate (spawnEnemyAt path unchanged behavior-wise).
- Added hasPendingSpawns() for orchestration safety.

Certainty: HIGH
Reason: replaces burst allocation with amortized frame work.

### F) Room completion guard for pending spawn queue
File: src/core/GameRuntimeOrchestrator.ts
- Room clear now requires:
  - no active enemies
  - no pending room spawn queue

Certainty: HIGH
Reason: prevents premature room clear with progressive spawning.

### G) GameManager runtime wiring for live settings
File: src/core/GameManager.ts
- Subscribes to GameSettingsStore and applies graphics settings at runtime.
- Forces low procedural quality while lightweight mode is enabled.
- Propagates spawn smoothing config to EnemySpawner.
- Reduces blocking prewarm behavior and caps prewarm room count in lightweight mode.

Certainty: HIGH
Reason: central orchestration updated with explicit deterministic state transitions.

### H) Transition and preload pressure reduction
Files:
- src/core/GameRoomStreamingManager.ts
- src/systems/RoomTransitionManager.ts

Changes:
- default forward preload reduced (2 -> 1)
- transition preload range reduced (2/2 -> 1/1)

Certainty: MEDIUM-HIGH
Reason: lower preload work is guaranteed, while exact player-perceived gain depends on room composition.

### I) Removed per-enemy debug logs
File: src/gameplay/EnemyController.ts
- Removed two console.log calls in enemy initialize path.

Certainty: HIGH
Reason: guaranteed reduction in spawn overhead.

## Validation Performed
- TypeScript diagnostics: no errors on all modified files.
- Full build: `npm run build` successful.

## Expected Gains (Qualitative)
- Faster first-play initialization in relief mode when lightweight is enabled.
- Lower frame-time spikes during room transitions.
- Better stability in rooms with many simultaneous enemy spawns.
- Lower texture/material churn and lower peak CPU work during tile/room preparation.

## Notes
- Existing visual mode is preserved; lightweight mode is additive and toggleable.
- Lightweight mode is ON by default for immediate performance testing.
- If visual fidelity testing is needed, toggle lightweight mode OFF in settings.
