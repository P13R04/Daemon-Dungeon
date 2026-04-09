# Daemon Dungeon — Bestiary Implementation Plan

## Goals
- Maintain good framerate with scalable AI (lightweight updates, pooled projectiles, minimal allocations).
- Keep behaviors modular, data-driven, and easy to extend.
- Support future bosses and variants without duplicating logic.

## Core Architecture (AI & Combat)

### 1) Behavior Model (Data-Driven)
- Each enemy uses a **behavior profile** with:
  - `movementPattern`: chase, kite, patrol, bounce, charge, hop, orbit, stationary
  - `attackPattern`: melee-contact, projectile-single, projectile-burst, projectile-split, heal
  - `targeting`: direct, lead-predict, lock-direction, maintain-distance
  - `timing`: cooldowns, windups, recovery windows
- Keep AI in **state machines** with simple states (e.g., `idle → aim → attack → recover`).

### 2) Performance Strategy
- Avoid per-frame heavy operations (raycasts, pathfinding). Use simplified movement and occasional checks.
- Use **object pooling** for projectiles, AoE, hazards, and VFX.
- Limit AI update frequency for low-priority enemies (e.g., update every 2–3 frames).
- Use **shared components** (Knockback, Health, Movement, Cooldowns) to avoid duplication.

### 3) Standard Utilities
- **Movement helpers**: seek, flee, maintain distance, predict intercept, bounce off walls.
- **Attack helpers**: melee contact check, projectile spawn, cone/burst spread.
- **Targeting helpers**:
  - Direct: current player position.
  - Lead: `playerPos + playerVelocity * leadTime`.
  - Lock: store direction once before charge.

---

## Bestiary (Enemy Specifications)

### 1) Zombie (Base)
- **Role**: Standard melee chaser.
- **Movement**: Seek player.
- **Attack**: Contact damage only.
- **Variants**:
  - **Fuyard**: Approaches but keeps a min distance (adds chaos).
  - **Stratège**: Predictive targeting (leads the player).

### 2) Pong
- **Role**: Chaos mover; bounces.
- **Movement**: Straight line; bounce off walls/obstacles/entities.
- **Attack**: Contact damage.
- **Notes**: Should ignore pathfinding; simple bounce response.

### 3) Bélier (Bull)
- **Role**: Burst threat.
- **Movement**: Lock direction, charge at high speed.
- **Attack**: Contact damage; knockback on hit.
- **States**: `chase → aim → charge → cooldown`.

### 4) Sentinelle
- **Role**: Ranged shooter.
- **Movement**: Maintain medium distance (kite).
- **Attack**: Single projectile.
- **Notes**: Stop when at optimal range, shoot with short windup.

### 5) Sauteur
- **Role**: Burst melee with leap.
- **Movement**: Like bull but in arcs.
- **Attack**: Jump to target; contact damage on landing.
- **Notes**: Small windup; landing AoE optional later.

### 6) Fuyard (Zombie Variant)
- **Role**: Adds spacing chaos.
- **Movement**: Move toward but maintain minimum range (orbit if too close).
- **Attack**: Light contact damage if player collides.

### 7) Stratège (Zombie Variant)
- **Role**: Smarter chaser.
- **Movement**: Predict player position using velocity lead.
- **Attack**: Contact damage.
- **Notes**: Lead time adjustable by config.

### 8) Tourelle fixe
- **Role**: Static ranged.
- **Movement**: None.
- **Attack**: Projectile burst or single; optional cone.

### 9) Healer
- **Role**: Support.
- **Movement**: Keeps within healing range of allies.
- **Attack**: Heals allies (AoE pulse or single target).
- **Notes**: No player damage.

### 10) Artificier
- **Role**: Area denial.
- **Movement**: Moves to medium range, stops to fire.
- **Attack**: Launches 1 projectile at player.
  - On impact: splits into 3–4 nodes around impact point.
  - Nodes explode after 2 seconds in medium AoE.
- **After shot**: Heavy self-knockback (retreat).

### 11) Bullet Hell
- **Role**: Stationary cone spammer.
- **Movement**: None.
- **Attack**: Burst of 3/4/5 projectiles in a cone.

### 12) Mage “Missiles”
- **Role**: Spawns homing kamikaze.
- **Movement**: Stationary or slow reposition.
- **Attack**: Spawns homing missile with low HP.
- **Missile AI**:
  - Steers toward player with inertia.
  - Accelerates on straight paths, slows on turns.
  - Dies on contact with walls/obstacles.

---

## Boss Concepts (Phase 1)

### Necromancer
- **Role**: Summoner.
- **Behavior**: Spawns base zombies at intervals.

### Hazard Setter
- **Role**: Area control.
- **Behavior**: Spawns spike hazards to avoid.

### Laser
- **Role**: Room-wide pattern.
- **Behavior**: Sweeping laser or grid pattern to dodge.

### Big Jumper
- **Role**: Burst AoE.
- **Behavior**: Large leap; shockwave on impact.

---

## Implementation Checklist

### Phase A — Core Systems
- Add enemy behavior states & config-driven parameters.
- Add targeting utilities (direct, lead, lock).
- Add movement utilities (seek, flee, maintain distance, bounce).
- Expand projectile patterns (single, burst, split).
- Add healing pulses for support enemies.

### Phase B — Enemy Set 1
- Zombie (base), Bull, Pong.
- Sentinelle, Tourelle fixe.

### Phase C — Enemy Set 2
- Sauteur, Fuyard, Stratège.
- Healer.

### Phase D — Enemy Set 3
- Artificier.
- Bullet Hell.
- Mage “Missiles” + missile unit.

### Phase E — Boss Skeletons
- Necromancer, Hazard Setter, Laser, Big Jumper.

---

## Notes & Tuning
- All attack ranges and timings should be in `enemies.json`.
- Use `behaviorConfig` for each enemy to avoid hard-coded logic.
- Keep each enemy’s state machine minimal; avoid per-frame heavy logic.
- Prefer pooled projectiles and VFX.
