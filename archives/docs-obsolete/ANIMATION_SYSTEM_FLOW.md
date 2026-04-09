# Animation System Flow Diagram

## Diagram: State Transitions

```
                        ┌─────────────────┐
                        │ ULTIMATE READY  │
                        │ (spacebar + 1.0)│
                        └────────┬────────┘
                                 │
                ┌────────────────▼────────────────┐
                │    ULTIMATE ANIMATION           │
                │  (Ultime - play once)           │
                │  speedRatio: 1.0                │
                └────────────┬───────────────────┘
                             │
                ┌────────────▼─────────┐
         ┌──────► PREVIOUS STATE       │
         │      (Walking/Idle)        │
         │      └────────────────────┘
         │
    [onComplete callback]
         │
    ┌─────────────────────────────────┐
    │   IS PLAYER FIRING?              │
    │   (Mouse button down)            │
    └──────┬──────────────────┬────────┘
           │ YES              │ NO
    ┌──────▼────────┐      ┌──▼────────────────┐
    │ ATTACK STATE  │      │ IS PLAYER MOVING? │
    │               │      │ (Input detected)  │
    └──┬───┬────────┘      └──┬───────┬────────┘
    ┌──▼┐┌─▼──────┐           │ YES   │ NO
    │A1││ A2      │    ┌──────▼───┐ ┌─▼────┐
    │  ││         │    │ WALKING  │ │IDLE  │
    └──┘└─┬──────┘    └────┬─────┘ └──────┘
         │            ┌────▼────────────┐
         │            │ Start_walking   │
         │            │ (intro, once)   │
         │            └────┬────────────┘
         │            [onComplete]
         │                 │
         │            ┌────▼────────────┐
         │            │ walking (loop)  │
         │            └─────────────────┘
         │
    [alternates every shot]
    Attack_1 ↔ Attack_2
    with speed variation
    [0.8x, 0.9x, 1.0x, 1.1x, 1.2x]
```

## Diagram: Animation Priority Chain

```
┌────────────────────────────────────────────────────────────────┐
│  ANIMATION PRIORITY SYSTEM                                      │
│  (Checked each frame in updateAnimationState())                 │
└────────────────────────────────────────────────────────────────┘

     LEVEL 1: ULTIMATE CHECK
     ┌──────────────────────────────────────┐
     │ if (isUltimateActive)                 │
     │   → play(ULTIMATE)                    │
     │   → return (EARLY EXIT)               │
     └──────────────────────────────────────┘
                    │
                    └─ NO? Continue to Level 2
                    
     LEVEL 2: ATTACK CHECK
     ┌──────────────────────────────────────┐
     │ if (isFiring)                         │
     │   → play(ATTACKING)                   │
     │   → alternate Attack_1 ↔ Attack_2    │
     │   → apply speed variation             │
     │   → return (EARLY EXIT)               │
     └──────────────────────────────────────┘
                    │
                    └─ NO? Continue to Level 3
                    
     LEVEL 3: MOVEMENT CHECK
     ┌──────────────────────────────────────┐
     │ if (isMoving)                         │
     │   → play(WALKING)                     │
     │   → handle Start_walking intro        │
     │   → return (EARLY EXIT)               │
     └──────────────────────────────────────┘
                    │
                    └─ NO? Continue to Level 4
                    
     LEVEL 4: DEFAULT STATE
     ┌──────────────────────────────────────┐
     │ play(IDLE)                            │
     │ → always available fallback           │
     └──────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ KEY CONCEPT: EARLY EXIT PATTERN                                │
│ Each priority level can produce an early exit, meaning         │
│ lower priority animations are completely ignored.             │
│                                                                │
│ Example: If attacking (LEVEL 2 active), walking never gets    │
│ checked. This creates the "attack preempts movement" behavior.│
└────────────────────────────────────────────────────────────────┘
```

## Diagram: Walking State Machine

```
┌─────────────────────────────────────────────────────────┐
│ WALKING ANIMATION FLOW                                   │
└─────────────────────────────────────────────────────────┘

First time entering WALKING:
  updateAnimationState(true, false, false)
        ↓
  playAnimation(WALKING)
        ↓
  if (!isWalking && !hasStartedWalking)
  → hasStartedWalking = true
  → _playAnimationOnce("Start_walking")
        ↓
  When Start_walking completes:
  → onAnimationGroupEndObservable trigger
        ↓
  callback: _playAnimationLoop("walking", 1.0)
        ↓
  walking: loopAnimation = true (loops forever)


Subsequent frames (while moving):
  updateAnimationState(true, false, false)
        ↓
  playAnimation(WALKING)
        ↓
  isWalking = true
  hasStartedWalking = true ← skip intro
  → Continue existing walking loop


Player stops moving:
  updateAnimationState(false, false, false)
        ↓
  playAnimation(IDLE)
        ↓
  isWalking = false
  hasStartedWalking = false ← reset flags
        ↓
  walking animation stops
  Idle.001 starts
```

## Diagram: Attack Sequence with Speed Variation

```
┌─────────────────────────────────────────────────────────┐
│ ATTACK SEQUENCE                                          │
│ (Rapid succession when player holds mouse button)        │
└─────────────────────────────────────────────────────────┘

Shot 1:
  isFiring = true
  → playAnimation(ATTACKING)
  → lastAttackWasAttack1 = !false = true
  → play "Attack_1" at speed [0] = 0.8x
  lastAttackSpeedIndex = 1

Shot 2 (~0.15s later, fireRate):
  isFiring = true
  → playAnimation(ATTACKING)
  → lastAttackWasAttack1 = !true = false
  → play "Attack_2" at speed [1] = 0.9x
  lastAttackSpeedIndex = 2

Shot 3:
  → play "Attack_1" at speed [2] = 1.0x
  lastAttackSpeedIndex = 3

Shot 4:
  → play "Attack_2" at speed [3] = 1.1x
  lastAttackSpeedIndex = 4

Shot 5:
  → play "Attack_1" at speed [4] = 1.2x
  lastAttackSpeedIndex = 0 (wraps)

Shot 6:
  → play "Attack_2" at speed [0] = 0.8x (cycles back)
  ...

Speed Values Array:
  [0.8, 0.9, 1.0, 1.1, 1.2]
      0    1    2    3    4  ← indices

Visual Result:
  Attack_1 (0.8x) → Attack_2 (0.9x) → Attack_1 (1.0x) →
  Attack_2 (1.1x) → Attack_1 (1.2x) → Attack_2 (0.8x) → ...

Effect: Each animation plays at different speed
        Makes rapid attack sequences less repetitive
        Feels more dynamic and alive
```

## Diagram: PlayerAnimationController Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ PLAYER ANIMATION CONTROLLER LIFECYCLE                    │
└─────────────────────────────────────────────────────────┘

CONSTRUCTION:
new PlayerAnimationController(scene)
    ↓
this.scene = scene
this.animationGroups = new Map()
this.currentState = AnimationState.IDLE


LOADING THE MODEL:
await loadModel('assets/models/player/')
    ↓
SceneLoader.ImportMeshAsync() [ASYNC]
    ↓ (continues while gameplay runs)
result.meshes[0] → this.mesh
    ↓
result.animationGroups.forEach(group)
    → this.animationGroups.set(group.name, group)
    ↓
this.playAnimation(AnimationState.IDLE)
    ↓
console: "✓ Loaded animation: Idle.001"
console: "✓ Loaded animation: walking"
...
console: "✓ Player model loaded: player_mage, animations: 6"


RUNTIME ANIMATION UPDATES:
PlayerController.update()
    ↓
animationController.updateAnimationState(isMoving, isFiring, isUltimate)
    ↓
[Priority chain check] → determines target state
    ↓
playAnimation(targetState, speedMultiplier)
    ↓
animationGroups.get(animationName)
    ↓
group.speedRatio = speedMultiplier
group.loopAnimation = (loop or once)
    ↓
group.play()
    ↓
[Animation plays this frame]


DISPOSAL (on scene cleanup):
dispose()
    ↓
this.mesh.dispose()
    ↓
animationGroups.forEach(group)
    → group.dispose()
    ↓
animationGroups.clear()
    ↓
[All resources freed]
```

## Diagram: Error Handling & Fallback

```
┌─────────────────────────────────────────────────────────┐
│ LOADING ERROR HANDLING                                   │
└─────────────────────────────────────────────────────────┘

loadModel('assets/models/player/')
    ↓
try {
    SceneLoader.ImportMeshAsync() [FAILS]
    ↓
} catch (error)
    ↓
console.error('Failed to load mage model:', error)
    ↓
PlayerController initialize() catches:
    ↓
    .catch(error => {
        console.warn('Creating fallback placeholder...');
        createFallbackPlaceholder();
    })
    ↓
createFallbackPlaceholder():
    ↓
MeshBuilder.CreateBox('player_fallback', {size: 0.6})
    ↓
StandardMaterial (Blue color)
    ↓
position.y = 1.0
    ↓
this.mesh = cube
    ↓
[Gameplay continues with placeholder]

Result:
✓ Player visible (blue cube)
✓ No animations, but no crash
✓ Game is playable
✓ Error logged for debugging
```

## Diagram: Import & Dependency Flow

```
┌─────────────────────────────────────────────────────────┐
│ MODULE DEPENDENCY GRAPH                                  │
└─────────────────────────────────────────────────────────┘

src/gameplay/PlayerController.ts
    ├── imports PlayerAnimationController
    │       └── uses SceneLoader (babylon.js)
    │       └── uses AnimationGroup (babylon.js)
    │       └── uses Mesh (babylon.js)
    │
    ├── imports EventBus
    ├── imports Time
    ├── imports Health
    ├── imports Knockback
    └── imports ConfigLoader


src/core/GameManager.ts
    └── creates PlayerController
            └── which creates PlayerAnimationController
                    └── loads 'assets/models/player/mage.glb'


Babylon.js Scene
    ├── loads glb file
    │   └── extracts meshes
    │   └── extracts AnimationGroups
    │
    ├── provides update loop
    │   └── called by Time system
    │   └── triggers PlayerController.update()
    │       └── triggers PlayerAnimationController.updateAnimationState()
    │
    └── renders animations each frame
```

---

**Key Takeaway**: The system is a hierarchical priority chain with graceful fallbacks,
allowing attacks to preempt movement while maintaining smooth transitions and visual variety.
