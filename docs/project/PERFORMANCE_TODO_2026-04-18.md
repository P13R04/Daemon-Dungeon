# PERFORMANCE TODO - 2026-04-18

## Completed in this pass
- [x] Add graphics/performance settings persistence
- [x] Add settings UI toggles for lightweight textures and progressive enemy spawn
- [x] Add lightweight procedural relief mode internals
- [x] Reduce floor relief mesh/displacement cost in lightweight mode
- [x] Implement progressive room enemy spawning queue
- [x] Protect room clear logic against pending spawn queue
- [x] Reduce preload breadth during transitions
- [x] Remove per-enemy constructor logging
- [x] Validate with full TypeScript + production build

## Completed in continuation pass (2026-04-19)
- [x] Restore seamless floor continuity in lightweight mode by removing over-bucketed floor material seeding
- [x] Improve procedural wall panel variation (per-panel axis seeds) while preserving brick continuity across connected faces
- [x] Improve wall material key precision in lightweight mode to prevent repeated/misaligned bump/diffuse reuse
- [x] Normalize procedural fractional sampling (`frac`) to avoid modulo artifacts and seam drift
- [x] Add room-adjacent enemy data prewarm during room preload window (non-blocking, previous-room phase)
- [x] Add scaled enemy runtime config cache to avoid redundant per-spawn config recomputation
- [x] Add shared bull model prewarm + container instancing to avoid repeated heavyweight model loads on grouped spawns
- [x] Add adaptive spawn throttle for large spawn queues to reduce multi-boss room frame spikes
- [x] Re-validate with full production build after integration

## Completed in rigorous pass (2026-04-19)
- [x] Prevent duplicate/racy bull visual initialization with serialized instantiation queue and per-enemy in-flight guards
- [x] Harden bull visual lifecycle cleanup on death/dispose to avoid orphaned or doubled model state
- [x] Desynchronize enemy pathfinding repath timings with jitter to eliminate synchronized spawn-frame path spikes
- [x] Reduce crowd-steering GC pressure by removing per-neighbor position clone allocations in separation computation
- [x] Move debug freeze config lookup from per-enemy update to one lookup per spawner update frame
- [x] Add frame-time budget guard to progressive room spawn flush so grouped waves cannot monopolize a frame
- [x] Constrain heavy enemy asset prewarm to transition windows and forward-facing rooms only
- [x] Decouple lightweight room-config prewarm from heavy-asset prewarm so transition prewarm still runs when needed
- [x] Re-validate with full TypeScript + production build after rigorous pass

## Completed in transition-prep pass (2026-04-19)
- [x] Fix asynchronous bull model race on disposed entities (prevents stray duplicate bull mesh attachment)
- [x] Add transition-time enemy preparation pipeline for next room (pre-spawn before camera transition end)
- [x] Reuse prepared enemies on room activation to avoid end-of-transition full respawn spike
- [x] Keep late unprepared leftovers progressive instead of forcing synchronous flush at transition end
- [x] Add room-instance spawn point retrieval in RoomManager (prepare next room without switching current room context)
- [x] Add transition fog-of-war reveal (dense fog at transition start, progressive reveal during camera travel)
- [x] Emit room transition start/end events consistently during transition pipeline
- [x] Re-validate with full TypeScript + production build after transition-prep pass

## Completed in camera-relative fog + spike pass (2026-04-19)
- [x] Replace fixed world fog with camera-relative transition fog curtain that tracks camera target each frame
- [x] Keep fog curtain orthogonal and axis-locked to room walls during transition (no radial/fixed-room drift)
- [x] Remove aggressive end-of-transition preparation pump to avoid final transition spike
- [x] Smooth suppressed enemy spawn event reveal over multiple frames (prevents HUD/control burst)
- [x] Tighten transition preparation per-frame time budget to reduce micro-freezes during camera travel
- [x] Re-validate with full TypeScript + production build after camera-relative fog and spike tuning

## Completed in curtain-translation + pre-stun prep pass (2026-04-19)
- [x] Convert transition curtain behavior from alpha pulse to translation reveal (constant opacity, no pulse)
- [x] Prime next-room enemy preparation immediately on room clear (before door transition) to shift heavy work earlier
- [x] Continue pumping next-room preparation incrementally each playing frame while room is cleared
- [x] Spawn preloaded next-room enemies with AI explicitly suppressed (stun-like frozen state) until room activation
- [x] Reactivate prepared enemies AI only when the next room becomes active
- [x] Add defensive dominant-root filtering for bull model instantiation to suppress duplicate visual hierarchies
- [x] Re-validate with full TypeScript + production build after pre-stun and curtain translation changes

## Completed in activation-smoothing + persistent fog pass (2026-04-19)
- [x] Smooth prepared-room AI activation over multiple frames instead of one-frame mass unsuppress
- [x] Move AI wake-up to post-update budgeted queue to prevent transition-entry CPU spikes
- [x] Keep fog curtain persistent outside transitions (playing/roomclear/bonus) to always mask the next room
- [x] Preserve transition-specific curtain translation while reusing the same fog plane in persistent mode
- [x] Re-validate with TypeScript diagnostics on touched files after integration

## Completed in unified-transition cleanup pass (2026-04-19)
- [x] Replace concurrent fog modes with a single camera-relative curtain behavior across playing, roomclear, bonus and transition
- [x] Remove transition-only fog branch to prevent behavior discontinuity during camera travel
- [x] Add proactive, time-sliced next-room enemy preparation while still in previous room (non-blocking)
- [x] Start bounded heavy asset prewarm earlier for immediate forward room in playing state
- [x] Merge spawn-reveal and AI wake-up into one incremental activation queue (removes duplicate runtime pipelines)
- [x] Dispose previous room enemies explicitly on prepared-room activation to avoid stale lifecycle overlap
- [x] Fix bull duplicate-root filtering by counting root mesh nodes with no children
- [x] Re-validate with TypeScript diagnostics + production build after cleanup pass

## Completed in benchmark stabilization pass (2026-04-19)
- [x] Reduce default automated benchmark scope to 5 transitions (faster first-pass signal)
- [x] Add temporary benchmark-only player invulnerability guard to prevent premature `player_died` aborts
- [x] Add hard benchmark time budget (30s) with forced graceful completion (`time_budget_reached`)
- [x] Add benchmark transition-count fallback based on room-index changes when transition bus events are missed
- [x] Fix bull visual lifecycle disposal to preserve shared materials/textures (prevents white bulls after first spawn)
- [x] Fix bull model orientation regression (180-degree flip) and strengthen bull ownership tagging to reduce duplicate roots
- [x] Add benchmark-only proactive next-room preparation pumping before transition request to reduce boss-room transition spikes
- [x] Add bull root-name fallback cleanup + mesh-disposed guards in async load/update paths to reduce lingering duplicate bull visuals above camera
- [x] Force clone-based bull instantiation (`doNotInstantiate`) and remove container source nodes from scene to prevent source/master visual duplicates
- [x] Increase benchmark proactive preparation cadence/batch for heavy boss rooms (`kernel abyss`) to further compress transition stalls
- [x] Roll back shared bull asset-container path and return to isolated `ImportMeshAsync` per-entity load (container path created persistent ghost visual coupling)
- [x] Ensure benchmark safety flag is always released on stop/finish/dispose paths
- [x] Re-validate with full TypeScript + production build after benchmark stabilization
- [x] Defer post-transition room maintenance (unload + forward prewarm sweep) off the transition frame to reduce room-switch spikes
- [x] Batch stale room/floor unloads across frames in the room streaming manager to avoid a single end-of-transition cleanup spike
- [x] Defer old enemy destruction after room switch and consume it in small batches instead of disposing the previous wave synchronously
- [x] Replace per-transition `ProjectileManager.dispose()`/`UltimateManager.dispose()` with lightweight transition resets that reuse pools and defer ephemeral mesh cleanup
- [x] Defer `ROOM_ENTERED` emission to next tick after room switch to move HUD/boss-alert event handling off the transition completion frame
- [x] Add configurable `roomPreloadAheadCount` setting (1-8) and apply wider async preload windows during background/primed/benchmark preparation to prefetch more rooms before transition
- [x] Add benchmark spike diagnostics with per-frame subsystem profiling so future lag spikes can be attributed to the exact blocking stage
- [x] Extend spike diagnostics to profile the whole render loop, including camera/fog updates, benchmark bookkeeping, and scene.render()
- [x] Defer far-room instance loads into a queued room-load pump so wider preload windows do not block a single gameplay frame
- [x] Add explicit unprofiled frame-gap telemetry (`frameMs - profile.totalMs`) and coverage ratio in spike diagnostics to distinguish loop CPU from external scheduler/GPU stalls
- [x] Move deferred room/tile/unload streaming work from `setTimeout` callbacks to a budgeted per-frame pump in render loop to eliminate large unprofiled inter-frame gaps
- [x] Gate deferred room-load pumping during active combat (`playing` + enemies alive) so heavyweight room instantiation cannot freeze mid-fight frames
- [x] Tighten room-load gating further: allow deferred room instantiation only in safe states (`roomclear`/`bonus`) and block it in `playing` and `transition`
- [x] Remove aggressive benchmark keep-safe preloading and block background room preparation while enemies are alive to reduce real gameplay hitches
- [x] Classify benchmark spikes by stall category (`profiled`, `mixed`, `external-unprofiled`) and add per-category breakdown stats to reports/summaries
- [x] Defer tile preload/unload streaming maintenance during active combat pressure (enemies/spawns/projectiles/ult zones) to reduce residual `roomStreamingDeferred` spikes
- [x] Refine combat-pressure gating: keep deferred unloads enabled (only tile preloads paused) to avoid inflated loaded-room count and reduce `sceneRender` pressure
- [x] Add dynamic deferred-streaming frame budget (lower in `playing`, higher in safe states) to further smooth `roomStreamingDeferred` frametime contribution
- [x] Optimize deferred unload batches: deduplicate unload keys and split room/floor unload across frames to reduce per-frame `roomStreamingDeferred` spikes
- [x] Gate deferred unloads during active combat by default (with critical overhang escape hatch) to cut residual `roomStreamingDeferred` spikes without letting loaded instances grow unbounded
- [x] Tighten unload pacing further: prioritize deferred unloads in safe states (`roomclear`/`bonus`/`transition`), allow in `playing` only for critical overhang and no active combat pressure

## Next recommended steps (profiling + hard numbers)
- [ ] Add lightweight telemetry for load stages (init, room preload, room entry) with `performance.now()`
- [ ] Capture before/after frame-time percentiles (P50/P95/P99) during room transitions
- [ ] Track number of generated procedural materials per room and per session
- [ ] Track spawn queue drain duration in large rooms
- [ ] Compare memory usage snapshots (classic vs procedural vs lightweight)

## Optional deeper optimizations
- [ ] Introduce object pools for common enemy visual placeholders
- [ ] Add incremental tile floor instance build pipeline (spread tile mesh creation across frames)
- [ ] Pre-bake selected procedural textures into assets for ultra-fast startup profile
- [ ] Add dedicated in-game Performance Preset selector (Quality/Balanced/Performance)
