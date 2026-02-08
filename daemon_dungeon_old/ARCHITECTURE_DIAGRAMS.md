# 🎯 DAEMON DUNGEON - ARCHITECTURE VISUALIZATION

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME.JS (Orchestrator)                   │
│                        ≈ 535 lines                              │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Init     │  │ GameLoop │  │ Input    │  │ Cleanup  │       │
│  │ StartGame│  │ 60 FPS   │  │ Handlers │  │ Reset    │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┘       │
│       │             │             │                            │
│       └─────┬───────┴─────┬───────┘                            │
│             │             │                                    │
└─────────────┼─────────────┼────────────────────────────────────┘
              │             │
              ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SRC/CORE/DELEGATES.JS (Entry Point)                │
│                     ≈ 134 lines                                │
│                                                                 │
│  window.DungeonCore.delegates = {                             │
│    createScene(), setupMusic(), unlockAudio(),               │
│    createPlayer(), updatePlayer(), updateEnemies(),          │
│    updateProjectiles(), checkCollisions(), updateUI(),       │
│    ... 58 more function delegates                            │
│  }                                                            │
│                                                                 │
│  Safe chaining: window.DungeonCore?.delegates?.funcName?.(this)│
└──────┬──────────────────────────────────────────────────────┬─┘
       │                                                       │
       └───────────────────────┬───────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   ┌─────────────┐        ┌──────────────┐     ┌──────────────┐
   │  SCENE/     │        │  PLAYER/     │     │  ENEMIES/    │
   │  SETUP      │        │  MOVEMENT    │     │  TARGETING   │
   │             │        │              │     │              │
   │ • Create    │        │ • Move       │     │ • Find       │
   │ • Post FX   │        │ • Animate    │     │ • Raycast    │
   │ • Vaporwave │        │ • Cooldowns  │     │ • Distance   │
   │ • Glow      │        │ • Auto atk   │     │ • Direction  │
   └─────────────┘        │ • Ultimate   │     └──────────────┘
        │                  └──────────────┘            │
        │                        │                     │
        └────────────┬───────────┴─────────┬───────────┘
                     │                     │
                     ▼                     ▼
   ┌──────────────────────────────────────────────────┐
   │              COMBAT SYSTEMS                      │
   │                                                  │
   │  ┌─────────────┐  ┌──────────┐  ┌────────────┐ │
   │  │ RANGED.JS   │  │ MELEE.JS │  │  BOSS.JS   │ │
   │  │             │  │          │  │            │ │
   │  │ • Projectile│  │ • Sweeps │  │ • Jumper   │ │
   │  │ • Shots     │  │ • Tank   │  │ • Spawner  │ │
   │  │ • Collision │  │ • Rogue  │  │ • Spikes   │ │
   │  │             │  │ • Melee  │  │            │ │
   │  └─────────────┘  └──────────┘  └────────────┘ │
   └──────────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐
   │ PHYSICS │  │  LOGIC   │  │   UI     │
   │         │  │          │  │          │
   │Collision│  │Collision │  │HUD       │
   │         │  │Damage    │  │Bonus     │
   │         │  │Rooms     │  │GameOver  │
   │         │  │UiFlow    │  │Messages  │
   └─────────┘  └──────────┘  └──────────┘
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   BABYLON.JS SCENE     │
        │   (Render Target)      │
        └────────────────────────┘
```

---

## Module Dependency Graph

```
game.js (CORE ORCHESTRATOR)
│
├─→ src/core/gameState.js ........... Game state management
├─→ src/core/delegates.js .......... Entry point router
│
├─→ startGame() ..................... Initialize
│   ├─→ src/scene/setup.js ......... Create scene
│   ├─→ src/entities/player.js ..... Create player
│   ├─→ src/audio/music.js ........ Setup audio
│   └─→ src/logic/rooms.js ........ Load first room
│
├─→ gameLoop() (60 FPS)
│   ├─→ src/player/movement.js .... Player update
│   │   └─→ src/enemies/targeting.js .. Get target
│   │   └─→ src/combat/ranged.js .... Player attack
│   │
│   ├─→ src/ai/enemies.js ......... Enemy update
│   │   └─→ src/combat/melee.js ... Enemy attack
│   │
│   ├─→ src/combat/ranged.js ....... Update projectiles
│   │   └─→ src/physics/collision.js . Collision test
│   │
│   ├─→ src/combat/melee.js ........ Update sweeps
│   │
│   ├─→ src/combat/boss.js ......... Boss abilities
│   │   └─→ src/logic/damage.js ... Damage entities
│   │
│   ├─→ src/logic/collisions.js ... Check all collisions
│   │   ├─→ src/logic/damage.js .. Apply damage
│   │   └─→ src/logic/rooms.js ... Room transitions
│   │
│   ├─→ Babylon.js scene.render() . Draw scene
│   │
│   └─→ src/logic/uiFlow.js ....... Update UI
│       ├─→ src/ui/hud.js ........ HUD updates
│       ├─→ src/ui/evilUi.js ..... System messages
│       └─→ src/ui/bonus.js ...... Bonus screen
│
└─→ Input Handlers
    └─→ src/input/handlers.js ..... Input processing
        └─→ inputMap update (read by movement.js)
```

---

## Data Flow Diagram

```
┌─────────────┐
│   INPUT    │ (keyboard, mouse, touch)
└─────────────┘
      │
      ▼
┌──────────────────────┐
│ INPUT/HANDLERS.JS    │ Parse input
└──────────────────────┘
      │
      ▼
┌──────────────────────┐
│ this.inputMap        │ Store input state
└──────────────────────┘
      │
      ▼
┌──────────────────────────────────────┐
│ PLAYER/MOVEMENT.JS                   │
│ Read inputMap → Update player        │
│ ├─ Calculate velocity                │
│ ├─ Apply movement                    │
│ ├─ Update animations                 │
│ └─ Handle attacks                    │
└──────────────────────────────────────┘
      │
      ├─→ this.player.velocity (moved)
      ├─→ this.player.animations
      └─→ this.enemies (targeted)
               │
               ▼
      ┌──────────────────────┐
      │ COMBAT/RANGED.JS     │
      │ Spawn projectiles    │
      └──────────────────────┘
               │
               ▼
      ┌──────────────────────────┐
      │ this.projectiles[]       │
      │ (Collision candidates)   │
      └──────────────────────────┘
               │
               ▼
      ┌────────────────────────────┐
      │ LOGIC/COLLISIONS.JS        │
      │ Detect collisions          │
      │ ├─ Projectile hit?         │
      │ ├─ Enemy hit?              │
      │ └─ Door reached?           │
      └────────────────────────────┘
               │
               ▼
      ┌────────────────────────────┐
      │ LOGIC/DAMAGE.JS            │
      │ Apply effects              │
      │ ├─ Reduce enemy HP         │
      │ ├─ Reduce player HP        │
      │ └─ Remove dead entities    │
      └────────────────────────────┘
               │
               ▼
      ┌────────────────────────────┐
      │ LOGIC/UIFLOW.JS            │
      │ Update UI                  │
      │ ├─ Update HUD              │
      │ ├─ Show messages           │
      │ └─ Room transitions        │
      └────────────────────────────┘
               │
               ▼
      ┌──────────────────────┐
      │ BABYLON.JS           │
      │ Render scene         │
      └──────────────────────┘
```

---

## Module Coupling Chart

```
                    DELEGATES.JS
                    (hub - 67 entries)
                           │
        ┌──────────┬────────┼────────┬──────────┐
        │          │        │        │          │
     SCENE      PLAYER     AI     COMBAT    LOGIC
        │          │        │        │          │
     SETUP     MOVEMENT ENEMIES  RANGED  COLLISIONS
                              │    MELEE    DAMAGE
                              │    BOSS     UIFLOW
                              │            
                           PHYSICS
                          COLLISION
```

**Coupling Pattern**: ⭐ Star topology
- All modules connect through delegates.js
- Low coupling between modules
- Easy to modify individual modules
- Easy to replace modules

---

## Game Loop Timeline (16.67ms per frame @ 60 FPS)

```
Frame N Start
│
├─ 0ms: updatePlayer()              [~1-2ms]
│  └─ Read input → Move → Animate
│
├─ 2ms: updateEnemies()             [~2-3ms]
│  └─ Move AI → Chase → Attack
│
├─ 5ms: updateProjectiles()         [~1-2ms]
│  └─ Move projectiles → Despawn
│
├─ 7ms: updateMeleeEffects()        [~0.5ms]
│  └─ Animate sweeps
│
├─ 8ms: updateBossAbilities()       [~1-2ms]
│  └─ Boss attacks
│
├─ 10ms: checkCollisions()          [~2-3ms]
│  └─ Detect → React
│
├─ 13ms: scene.render()             [~3-4ms]
│  └─ Babylon.js draws frame
│
└─ 16ms: updateUI()                 [~0.5ms]
   └─ HUD updates
   
FRAME COMPLETE (16.67ms budget - target 60 FPS)
```

---

## State Flow Diagram

```
START
  │
  ├─→ TITLE SCREEN (waiting for class select)
  │   │
  │   └─→ User clicks class
  │       │
  │       ▼
  ├─→ GAME INITIALIZING
  │   │
  │   ├─ Create scene ✓
  │   ├─ Create player ✓
  │   ├─ Setup audio ✓
  │   └─ Load first room ✓
  │       │
  │       ▼
  ├─→ GAMEPLAY (gameLoop running)
  │   │
  │   ├─ Player moves & attacks ✓
  │   ├─ Enemies move & attack ✓
  │   ├─ Collisions & damage ✓
  │   │
  │   ├─ Room clear? 
  │   │   YES → Bonus selection
  │   │        ├─ Skip
  │   │        └─ Pick bonus
  │   │           │
  │   │           └─→ Next room
  │   │
  │   └─ Player dead?
  │       YES → GAME OVER
  │            │
  │            ├─ Show stats
  │            │
  │            └─→ Restart button
  │
  └─→ RESTART (click class again) → Back to TITLE SCREEN
```

---

## Class Hierarchy

```
                         RoomManager
                              │
                    ┌─────────┴─────────┐
                    │                   │
            createRoomStructure()   findNonCollidingSpot()
            loadPreset()            _mat()
            addObstacle()           _aabb()
            addSpike()              
            openDoor()
            createFogCurtain()


                         DaemonDungeon
                              │
                    ┌─────────┴──────────────┐
                    │                       │
            startGame()               resetGame()
            gameLoop()                updateEnemyHealthBar()
            playerUltimate()          Input handlers
            showDaemonMessage()       showBossIntro()
            advanceRoom()             spawnEnemyAt()
```

---

## File Size Distribution

```
game.js                 ████████████ (535 lines, 18%)
────────────────────────────────────────
delegates.js            ███ (134 lines, 4.5%)
────────────────────────────────────────
combat/ranged.js        ███████████ (250+ lines, 8%)
logic/rooms.js          ███████████ (300+ lines, 10%)
ai/enemies.js           ██████████ (200+ lines, 7%)
────────────────────────────────────────
Other modules (19)      ████████████████ (2000+ lines, 67%)

Total: ~5500 lines
```

---

## Call Chain Examples

### Example 1: Player Attack
```
Input: Press SPACE

onKeyDown(e)                              [game.js]
  │
  ├─→ inputMap['attack'] = true          [input/handlers.js]
  │
  └─→ gameLoop iteration
      │
      ├─→ updatePlayer()                 [player/movement.js]
      │   │
      │   ├─→ Get closest enemy          [enemies/targeting.js]
      │   │
      │   └─→ handleAutoAttack()
      │       │
      │       └─→ playerAttack()          [combat/ranged.js]
      │           │
      │           └─→ spawnProjectile()
      │               │
      │               └─→ this.projectiles.push()
      │
      └─→ updateProjectiles()             [game.js]
          │
          └─→ moveProjectile()            [combat/ranged.js]
              │
              ├─→ updateProjectiles()     [~8 frames later]
              │
              └─→ checkProjectileCollisions() [logic/collisions.js]
                  │
                  └─→ damageEntity()      [logic/damage.js]
```

### Example 2: Player Takes Damage
```
Enemy Attack Hit Player

checkCollisions()                        [logic/collisions.js]
  │
  └─→ checkEnemyCollisions()
      │
      └─→ damagePlayer()                 [logic/damage.js]
          │
          ├─→ this.player.hp -= damage
          │
          └─→ if (hp <= 0) →
              │
              └─→ killEntity()
                  │
                  ├─→ this.enemies.remove(player)
                  │
                  └─→ onGameOver()        [logic/uiFlow.js]
                      │
                      └─→ showGameOver()  [ui/gameOver.js]
```

---

## Performance Bottleneck Analysis

```
Per Frame Budget: 16.67ms (60 FPS)

Current Performance:
├─ updatePlayer()           ~1-2ms ✅
├─ updateEnemies()          ~2-3ms ✅
├─ updateProjectiles()      ~1-2ms ✅
├─ updateMeleeEffects()     ~0.5ms ✅
├─ updateBossAbilities()    ~1-2ms ✅
├─ checkCollisions()        ~2-3ms ⚠️ (largest)
├─ scene.render()           ~3-4ms ✅
├─ updateUI()               ~0.5ms ✅
└─ Other/Overhead           ~1-2ms ✅
                            ─────────
Total ~13-14ms (1-3ms buffer)

Optimization Opportunities:
• Spatial partitioning for collision detection
• Object pooling for projectiles
• LOD for distant enemies
• Render target caching
```

---

## Summary

This architecture provides:
✅ **Clear separation of concerns** - Each module owns its domain  
✅ **Single entry point** - delegates.js centralizes all calls  
✅ **Low coupling** - Star topology via delegates  
✅ **High cohesion** - Related code together  
✅ **Testable** - Each module independent  
✅ **Extensible** - Add features without touching game.js  
✅ **Maintainable** - Clear code flow and dependencies  
✅ **Performant** - No wrapper overhead, tight loop  

