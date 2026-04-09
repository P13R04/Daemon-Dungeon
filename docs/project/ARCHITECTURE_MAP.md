# Daemon Dungeon Architecture & Code Organization Map

## 📐 Project Structure Visual

```
daemon-dungeon-main/
│
├── src/                          # TypeScript source (87 files, 29K LOC)
│   ├── main.ts                   # Entry point - Vite app initialization
│   │
│   ├── core/                     # Core systems
│   │   ├── GameManager.ts        # 🔴 Main orchestrator (2000+ LOC, needs refactor)
│   │   ├── EventBus.ts           # ✅ Pub/sub event system (well-designed)
│   │   ├── StateMachine.ts       # ⚠️ Defined but unused (see implementations)
│   │   └── Time.ts               # Delta time management
│   │
│   ├── scene/                    # Babylon.js scene management
│   │   ├── SceneBootstrap.ts     # Scene initialization, lighting, camera
│   │   ├── BootSequenceScene.ts  # Game startup sequence
│   │   ├── MainMenuScene.ts      # Main menu UI
│   │   ├── ClassSelectScene.ts   # Class selection screen
│   │   ├── CodexScene.ts         # Encyclopedia/codex UI
│   │   ├── PostProcess.ts        # Post-processing effects
│   │   ├── Lighting.ts           # Lighting configuration
│   │   ├── SynthwaveBackground.ts # Grid background effect
│   │   ├── PhysicsBootstrap.ts   # Havok physics setup
│   │   └── ClassSelectDevConsole.ts # Dev tools for class selection
│   │
│   ├── gameplay/                 # Character & action systems
│   │   ├── PlayerController.ts   # Player state, movement, abilities
│   │   ├── PlayerAnimationController.ts # Model loading, animation playback
│   │   ├── EnemyController.ts    # Individual enemy AI, behavior, animation
│   │   ├── ProjectileManager.ts  # Projectile pooling & lifecycle
│   │   └── UltimateManager.ts    # Ultimate ability system
│   │
│   ├── systems/                  # Game systems (major subsystems)
│   │   ├── RoomManager.ts        # Room creation, layout, obstacles
│   │   ├── TileFloorManager.ts   # Floor tile rendering coordinator
│   │   ├── TileSystem.ts         # Tile rendering engine (adjacency, rotation)
│   │   ├── TileAdjacencyValidator.ts # Tile neighbor validation
│   │   ├── RoomLayoutParser.ts   # ASCII layout → tile grid conversion
│   │   ├── RoomManagerTileAdapter.ts # Adapter pattern for room-tile integration
│   │   ├── EnemySpawner.ts       # Enemy spawn management
│   │   ├── HUDManager.ts         # HUD updates coordinator
│   │   ├── DevConsole.ts         # Developer debugging UI panel
│   │   ├── AISystem.ts           # AI loop (if separate from controllers)
│   │   ├── CombatSystem.ts       # ❌ File missing - references may be broken
│   │   ├── BonusPoolSystem.ts    # Bonus selection/pooling
│   │   ├── ScalingSystem.ts      # Difficulty scaling per room
│   │   ├── SpawnSystem.ts        # Spawn point management
│   │   ├── MovementSystem.ts     # Movement calculations
│   │   ├── ProceduralDungeonTheme.ts # Classic tile rendering (needs optimization)
│   │   ├── ProceduralReliefTheme.ts  # Advanced 3D tile rendering (bottleneck)
│   │   └── RoomSystem.ts         # Room system coordinator
│   │
│   ├── components/               # ECS components (entity attributes)
│   │   ├── Health.ts             # HP management component
│   │   ├── Knockback.ts          # Knockback force component
│   │   ├── Movement.ts           # Movement component
│   │   ├── Attack.ts             # Attack capability component
│   │   ├── Transform.ts          # Position/rotation component
│   │   ├── Loot.ts               # Loot drops component
│   │   └── AIController.ts       # AI decision component
│   │
│   ├── combat/                   # Combat mechanics
│   │   ├── modifiers/            # Damage modifiers
│   │   │   └── Modifiers.ts
│   │   ├── patterns/             # Attack patterns
│   │   │   └── AttackPatterns.ts
│   │   └── payloads/             # Projectile payloads
│   │       └── Payloads.ts
│   │
│   ├── ai/                       # Artificial intelligence
│   │   ├── behaviors/            # 🔴 Dead code - unimplemented behaviors
│   │   │   └── Behaviors.ts      # Chase, Attack, Flee, Patrol (TODOs)
│   │   ├── crowd/                # Crowd steering (flocking)
│   │   │   └── CrowdSteering.ts
│   │   └── pathfinding/          # Navigation
│   │       └── AStar.ts          # A* pathfinding algorithm
│   │
│   ├── entities/                 # Entity system
│   │   ├── Entity.ts             # Base entity class (component container)
│   │   └── EntityFactory.ts      # ⚠️ Factory with TODOs (not fully used)
│   │
│   ├── audio/                    # Audio systems
│   │   ├── AudioManager.ts       # Sound effects manager
│   │   ├── MusicManager.ts       # Music playback
│   │   └── SciFiTypewriterSynth.ts # Synthesized typewriter effect
│   │
│   ├── input/                    # Input handling
│   │   └── InputManager.ts       # Keyboard/mouse input capture
│   │
│   ├── services/                 # External/backend services
│   │   ├── ApiClient.ts          # HTTP API wrapper (backend)
│   │   ├── AuthService.ts        # Authentication (login/register)
│   │   ├── SaveService.ts        # Game save persistence
│   │   ├── AchievementService.ts # Achievement tracking
│   │   ├── CodexService.ts       # Codex (encyclopedia) data
│   │   └── LeaderboardService.ts # Leaderboard integration
│   │
│   ├── ui/                       # User interface layers
│   │   ├── HUD.ts                # Main HUD display
│   │   ├── DamageNumbers.ts      # Floating damage numbers
│   │   ├── EnemyHealthBars.ts    # Enemy health visualization
│   │   ├── Codex.ts              # Codex encyclopedia UI
│   │   ├── LogsPanel.ts          # Combat log panel
│   │   ├── PauseMenu.ts          # Pause screen
│   │   ├── Leaderboard.ts        # Leaderboard display
│   │   └── uiLayers.ts           # Scene layer configuration
│   │
│   ├── utils/                    # Utility functions
│   │   ├── ConfigLoader.ts       # ⚠️ Has duplicate methods  
│   │   ├── Math.ts               # Math utilities
│   │   ├── Debug.ts              # Debug logging utilities
│   │   ├── VisualPlaceholder.ts  # Placeholder geometry for missing assets
│   │   └── Pool.ts               # Object pooling utility
│   │
│   ├── settings/                 # Game settings
│   │   └── GameSettings.ts       # Audio, graphics, keybinds
│   │
│   ├── tools/                    # Development tools
│   │   └── daemonVoiceLab/       # Voice synthesis tool
│   │       └── main.ts
│   │
│   ├── types/                    # TypeScript type definitions
│   │   └── [type files]
│   │
│   ├── data/                     # Game content (JSON configs)
│   │   ├── config/               # Configuration files
│   │   │   ├── player.json       # Player class stats
│   │   │   ├── enemies.json      # Enemy definitions
│   │   │   ├── gameplay.json     # Game settings
│   │   │   └── rooms.json        # Room index (fallback)
│   │   ├── rooms/                # Room layouts (30+ test rooms)
│   │   │   ├── room_01.json ...room_04.json  # Main progression
│   │   │   └── room_test_*.json  # Test/specialized rooms
│   │   ├── enemies/              # Enemy data
│   │   │   └── enemies.json      # Enemy type definitions
│   │   ├── items/                # Item definitions
│   │   │   ├── items.json        # Item database
│   │   │   └── entries/          # Item entries
│   │   ├── bonuses/              # Bonus pool data
│   │   │   └── entries/          # Bonus definitions
│   │   ├── achievements/         # Achievement definitions
│   │   │   ├── *.json            # Achievements
│   │   │   └── entries/          # Achievement descriptions
│   │   ├── classes/              # Character class definitions
│   │   │   └── [class configs]
│   │   ├── scaling/              # Difficulty scaling curves
│   │   ├── voicelines/           # Voice line data & presets
│   │   │   ├── VoicelineDefinitions.ts # Voiceline registry
│   │   │   ├── DaemonAnimationPresets.ts # Animation presets
│   │   │   └── README.md         # Voice line documentation
│   │   └── codex/                # Codex entries
│   │
│   ├── vite-env.d.ts            # Vite type declarations
│   └── [other utilities]
│
├── assets/                       # Game assets (compiled at build time)
│   ├── models/                   # 3D models
│   │   ├── player/               # Player character models
│   │   │   ├── mage.glb
│   │   │   ├── tank.glb
│   │   │   ├── cat.glb
│   │   │   └── ...
│   │   └── [enemy models]
│   ├── tiles_test/               # Tile textures
│   ├── avatar_frames/            # Avatar sprite frames
│   ├── voicelines/               # Voice line audio
│   ├── music/                    # Background music
│   ├── sfx/                      # Sound effects
│   │   ├── attack/
│   │   ├── beep/
│   │   └── ...
│   └── [textures, etc]
│
├── tools/                        # Build/dev tools
│   ├── audit_rooms.js
│   ├── rembg_batch.py            # Background removal script
│   └── white_bg_floodfill.py    # Background fill script
│
├── archive_docs/                 # Old documentation (reference)
├── content_tools/                # Content editor tools
├── examples_texture/             # Texture generation examples
└── daemon_dungeon_backup1/       # Old backup
```

## 🔀 Data Flow Architecture

### Room Loading Sequence
```
GameManager.changeRoom(roomId)
  └─> RoomManager.loadRoom(roomId)
      ├─> ConfigLoader.getRoom(roomId) → RoomConfig
      ├─> RoomLayoutParser.parseLayout() → TileData[]
      ├─> TileFloorManager.loadRoomFloorInstance()
      │   ├─> TileSystem.registerTile()
      │   └─> ProceduralReliefTheme.generateTextures() ⚠️ EXPENSIVE
      ├─> RoomManager.createRoomGeometry()
      │   ├─> Players/Enemy collision mesh setup
      │   └─> Hazard zone creation
      ├─> EnemySpawner.spawnEnemiesForRoom()
      │   └─> Create EnemyController for each spawn
      └─> HUDManager.updateRoomDisplay()
```

### Combat Resolution
```
PlayerController.fireAttack()
  └─> ProjectileManager.createProjectile()
      ├─> Update loop: ProjectileManager.update()
      │   ├─> Check enemy collisions
      │   ├─> Apply damage on hit
      │   └─> Fire event: PROJECTILE_HIT
      ├─> EnemyController.takeDamage()
      │   ├─> Health.damage()
      │   ├─> Apply knockback
      │   ├─> Check death
      │   └─> Fire event: ENEMY_DAMAGED
      └─> GameManager.onEnemyDamaged()
          └─> Update HUD, check room clear
```

### Input Flow
```
InputManager.update(deltaTime)
  ├─> Check keyboard input
  ├─> Update: lastX, lastY, isAttacking, isSecondary
  └─> PlayerController.update(input)
      ├─> Apply movement
      ├─> Update animation state
      ├─> Check attack cooldown
      └─> Fire projectiles if attacking
```

## 🎯 Key Design Patterns Used

### ✅ Well-Used Patterns

1. **Singleton Pattern**
   - GameManager, EventBus, ConfigLoader
   - Good for: Shared global state
   - Risk: Global dependencies, hard to test

2. **Event-Driven Architecture**
   - EventBus with emit/on/off
   - Used for: Player death, enemy spawn, bonuses
   - Good decoupling of systems

3. **Component-Based Entity System**
   - Entity → Components (Health, Knockback, Movement)
   - Good for: Flexible entity composition

4. **Object Pooling**
   - ProjectileManager uses Pool<Projectile>
   - Good for: GC pressure reduction

5. **Factory Pattern**
   - EntityFactory, SceneBootstrap
   - Usage level: Partial (some stubs)

### ⚠️ Misused/Underused Patterns

1. **State Machine Pattern**
   - Defined in StateMachine.ts
   - NOT implemented - GameManager uses string literals
   - Should be: Using registered state handlers

2. **Adapter Pattern**
   - RoomManagerTileAdapter bridges Room↔Tiles
   - Good usage but creates extra abstraction layer

3. **Observer Pattern**
   - EventBus is observer pattern
   - Some listeners not cleaned up properly

## 📊 Coupling Analysis

```
High Coupling (Tightly Coupled):
  GameManager
    ├─→ Depends on: 15+ other systems
    └─→ Is depended on by: 10+ systems
    
  PlayerController ↔ GameManager (bidirectional)
  EnemyController ↔ RoomManager (obstacle queries)
  
Medium Coupling (Some Dependencies):
  RoomManager → TileFloorManager
  EnemySpawner → ConfigLoader
  
Low Coupling (Well Isolated):
  AudioManager (mostly independent)
  InputManager (mostly independent)
  AnimationController (internal)
```

## 🔧 System Update Order (Per Frame)

```typescript
GameManager.render() {
  1. Time.update(deltaTime)
  2. InputManager.update()
  3. PlayerController.update(input)
  4. EnemySpawner.updateEnemies()
     ├─ EnemyController.update() for each enemy
     └─ AI pathfinding and collision avoidance
  5. ProjectileManager.update()
     ├─ Move projectiles
     ├─ Check collisions
     └─ Apply damage
  6. HazardManager.update() / TileFloorManager.update()
  7. GameManager.resolveCollisions()
  8. RoomManager.updateMobileHazards()
  9. HUDManager.update()
  10. PostProcessManager.update()
  11. Engine.render() [Babylon.js]
}
```

## 🚀 Performance Hotspots

```
Critical Paths (Frame Must Complete):
├─ Enemy AI pathfinding (every 0.35s)
├─ Collision detection (every frame)
├─ HUD updates (every frame)
└─ Physics simulation (Havok)

Expensive Operations (Not Every Frame):
├─ Texture generation (room load) ⚠️ CRITICAL
├─ Model loading (async)
├─ Room geometry creation
├─ Pathfinding grid building
└─ Configuration loading
```

## 📋 Data Types Overview

### Room System Types
```typescript
interface Room {
  id: string;
  name: string;
  layout: string[];              // ASCII grid
  spawnPoints: SpawnPoint[];      // Enemy spawns
  obstacles: Obstacle[];          // Collision geometry
  hazards?: HazardZone[];         // Damage zones
  mobileHazards?: MobileHazard[]; // Moving obstacles
}

interface TileData {
  type: 'floor' | 'wall' | 'void' | 'poison' | 'spikes';
  x: number; z: number;
  adjacentTo?: DirectionMap;
}
```

### Entity System
```typescript
class Entity {
  id: string;
  components: Map<string, Component>;
  
  getComponent<T extends Component>(type: Class<T>): T;
  addComponent<T extends Component>(component: T): void;
  update(deltaTime: number): void;
}

interface Component {
  update(deltaTime: number): void;
}
```

### Combat Types
```typescript
interface ProjectileData {
  position: Vector3;
  direction: Vector3;
  damage: number;
  speed: number;
  range: number;
  friendly: boolean;
  maxBounces: number;
}

interface AttackPayload {
  damage: number;
  radius: number;
  knockback: number;
  dotDps?: number;
  dotDuration?: number;
}
```

## 🔗 Key Dependencies

**Critical Dependencies**:
- Babylon.js 6.0.0 (core rendering)
- Havok 1.3.12 (physics)
- mespeak 2.0.2 (text-to-speech)

**Build Dependencies**:
- Vite 5.0.0
- TypeScript 5.0.0
- ESLint 8.0.0
- Prettier 3.0.0

**Missing Type Definitions**:
- @types/mespeak (not available)

## 📈 File Size Distribution (Estimated)

```
Large Files (>200 Lines):
  ├─ GameManager.ts            ~2000+ LOC 🔴
  ├─ PlayerController.ts       ~600 LOC
  ├─ PlayerAnimationController.ts ~800 LOC
  ├─ EnemyController.ts        ~700 LOC
  ├─ RoomManager.ts            ~500 LOC
  ├─ ProjectileManager.ts      ~400 LOC
  └─ ProceduralReliefTheme.ts  ~400 LOC

Medium Files (50-200 Lines):
  ├─ TileSystem.ts            ~250 LOC
  ├─ DevConsole.ts            ~300 LOC
  └─ [Various controllers & systems]

Small Files (<50 Lines):
  ├─ EventBus.ts              ~70 LOC
  ├─ InputManager.ts          ~40 LOC
  ├─ Health.ts                ~35 LOC
  └─ [Various components & utilities]
```

## 🎓 Learning Notes for New Developers

**Start Here**:
1. Read [main.ts](src/main.ts) - entry point
2. Read [GameManager.ts](src/core/GameManager.ts) lines 1-100 - system overview
3. Read [EventBus.ts](src/core/EventBus.ts) - messaging pattern
4. Understand [RoomManager.ts](src/systems/RoomManager.ts) - room loading

**Core Concept**: Everything flows through GameManager → systems/controllers → update

**To Add a New Feature**:
1. Add event in EventBus.ts
2. Create system/controller class
3. Register in GameManager.initialize()
4. Hook into GameManager.render() update loop
5. Emit events for other systems to react

**Debugging Tips**:
- Use DevConsole (press key to open) for live testing
- Set breakpoints in GameManager.render() to pause frame
- Check console for logged room loads and entity updates
- Profile long room transitions with Chrome DevTools

---

**Architecture Documentation Generated**: April 3, 2026
