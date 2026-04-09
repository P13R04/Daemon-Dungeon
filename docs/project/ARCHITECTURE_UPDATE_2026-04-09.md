# Architecture Update - 2026-04-09

## Objectives Completed

The recent refactor sprints focused on reducing orchestration overload in the main manager and isolating domain logic into dedicated modules.

### Main delivered outcomes

- Significant reduction of central responsibilities in `src/core/GameManager.ts`.
- Introduction of dedicated managers for runtime, combat actions, world collisions/hazards, room streaming, void recovery, daemon test behavior, and economy flow.
- Repeated validation through lint + build checks (`npm run ci:local`) during each sprint.

## Current Architecture Snapshot

### Core orchestration

- `src/core/GameManager.ts`
  - Keeps high-level composition and lifecycle orchestration.
  - Wires managers and cross-domain coordination.

### Extracted domain managers

- `src/core/GameRuntimeOrchestrator.ts`
  - Runtime frame flow (`playing` / non-playing), action resolution sequencing, HUD updates.
- `src/core/GameCombatActionManager.ts`
  - Combat action effects and gameplay-side combat action handling.
- `src/core/GameWorldCollisionHazardManager.ts`
  - Entity collisions and hazard damage application.
- `src/core/GameRoomStreamingManager.ts`
  - Room/tile preload-unload strategy and deferred queue handling.
- `src/core/GamePlayerVoidRecoveryManager.ts`
  - Void fall detection/state/update and related visual effects.
- `src/core/GameDaemonTestManager.ts`
  - Daemon idle-test behavior and taunt triggering logic.
- `src/core/GameEconomyFlowManager.ts`
  - Currency/reward flow, passive income, consumables, and economy-facing helpers.

## Remaining Critical Points

### 1) GameManager still carries too many integration details

Even after extraction, `GameManager` remains a large integration node with many private methods and direct references to concrete subsystems.

Risk:
- Feature additions can still gravitate back into the main manager.
- Regression surface remains broad for cross-domain updates.

### 2) Data/config access is still distributed

Configuration reads and data transformations are scattered between manager classes and orchestration.

Risk:
- Inconsistent balancing behavior when tuning gameplay values.
- Harder diff review for content-related changes.

### 3) Runtime allocations and update hot-path pressure

The runtime loop still includes frequent object creation and repeated dynamic lookups in several paths.

Risk:
- Avoidable GC pressure and frame-time spikes in combat-dense rooms.

## Performance Improvement Plan (Next)

### A) Runtime hot-path cleanup

- Cache high-frequency references in frame updates.
- Reduce temporary `Vector3` allocations where possible.
- Reuse pooled visual objects/particle systems for burst-like effects.

### B) Streaming throughput and stutter control

- Increase room/tile preload batching adaptively based on frame budget.
- Add lightweight telemetry counters (queue length, flush time, room load time).
- Validate tile preload policy for near/far room windows under stress.

### C) Combat and FX budgeting

- Add per-frame caps for non-critical visual spawns.
- Add optional quality scaling hooks for heavy effects.
- Profile expensive collision/hazard checks with enemy-count scaling.

## Clarity/Maintainability Plan (Next)

### A) Contract-first manager interfaces

- Introduce narrow context interfaces for each manager with explicit dependency boundaries.
- Avoid direct cross-manager calls except via orchestrator-level coordination.

### B) Module-level documentation

- Add short module docs for each manager:
  - ownership
  - update order assumptions
  - side effects/events emitted

### C) Test strategy

- Add focused unit tests for:
  - economy reward and consumable logic
  - void recovery state progression
  - room streaming queue behavior
- Add integration smoke tests for update order and room transitions.

## Recommended Development Mode

Use dual-track delivery:

1. Feature/content/polish track (majority capacity)
2. Architecture hardening track (continuous, small batches each sprint)

Suggested split:
- 70% gameplay/content/polish
- 30% architecture/performance hardening

This keeps momentum while preventing monolith regression.

## Workspace Reorganization Summary

### Dedicated tools structure

- `tools/labs/daemon-voice-lab/`
- `tools/utilities/content_tools/`
- `tools/utilities/tiles_mapping/`
- `tools/examples/examples_texture/`

### Dedicated docs structure

- Active docs moved under `docs/`.
- Obsolete/legacy docs moved under `archives/docs-obsolete/`.

## Done Definition For Next Sprint

The next architecture sprint is considered complete when:

- `GameManager` is reduced further with no new domain logic added back.
- Runtime hot-path allocations are measurably reduced.
- At least one manager-level test suite is added and passing.
- `npm run ci:local` remains green throughout the sprint.
