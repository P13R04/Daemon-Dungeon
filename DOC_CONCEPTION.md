# Design Document: Daemon Dungeon
**Project for the Games on Web 2026 Competition - IA Edition**

## 1. Global Vision and Concept

**Daemon Dungeon** is a 3D isometric Roguelike with a Voxel aesthetic, designed to deliver a high-octane arcade experience on the web. The player embodies a rogue program infiltrated into a corrupted simulation, managed by a tyrannical entity: the **Daemon**.

### 1.1 A World of Corrupted Simulation
The game's identity relies on an aesthetic duality: the solidity of a medieval dungeon and the instability of a computer system.
- **Narrative:** The Daemon (inspired by GLaDOS) comments on the player's performance with cynicism. Technical lexicon is omnipresent (classes *Wizard Installer*, *Firewall*, *Glitch*; achievements named after error codes).
- **Visual:** The use of Voxels, magnified by post-process shaders (pixelation, CRT lines), creates a unique "Cyber-Fantasy" visual signature.

### 1.2 Artificial Intelligence and Dynamic Behaviors
We have implemented algorithms ensuring tactical combat:
- **Navigation:** **A*** algorithm for intelligent navigation in complex environments.
- **Crowd Steering:** Use of steering behaviors (separation, cohesion) to create organic encirclement patterns, avoiding entity overlaps.

---

## 2. Technical Architecture & Engineering Choices

### 2.1 Technology Stack Justification
- **TypeScript & Babylon.js:** The choice of TypeScript was dictated by the need for a typed codebase to manage complex interactions between systems. Babylon.js (imposed) was leveraged for its scene management and shader capabilities.
- **Havok Physics (WASM):** Chosen for its raw performance on the web, allowing the management of dozens of projectiles and entities without framerate drops.

### 2.2 Design Philosophy: Modularity and Scalability
The project followed a critical evolution, moving from a monolithic prototype (Proof of Concept) to a layered architecture:
1.  **Global EventBus:** We implemented this pattern to completely decouple systems. For example, an enemy's death emits a single event intercepted by sound, UI, score, and narrator, without direct links between these modules.
2.  **Data-Driven Design:** To allow rapid balancing, all statistics (HP, speed, damage) are stored in external JSON files. This separation allows gameplay adjustments without modifying business logic.

### 2.3 Architecture Mapping (Layered View)
```text
DAEMON DUNGEON ARCHITECTURE
│
├── [CORE] Orchestration & Lifecycle
│   ├── GameManager.ts             # Central Orchestrator (Singleton)
│   ├── EventBus.ts                # Global Event Bus (Decoupling)
│   └── GameRuntimeOrchestrator.ts # Frame profiling & sequencing
│
├── [DOMAIN] Business Managers (Extracted Managers)
│   ├── GameCombatActionManager.ts      # Combat effects & VFX
│   ├── GameRoomStreamingManager.ts     # Asynchronous room pipeline
│   ├── GameWorldCollisionHazardManager.ts # Hazard management
│   └── DaemonVoicelineManager.ts       # Narrative engine
│
├── [SYSTEMS] Technical Subsystems
│   ├── RoomManager.ts             # Room 3D geometry manager
│   ├── TileFloorManager.ts        # Tiled floor rendering
│   └── EnemySpawner.ts            # Progressive spawning (CPU smoothing)
│
├── [GAMEPLAY] Entity Logic
│   ├── PlayerController.ts        # Input mapping & ability kits
│   ├── EnemyController.ts         # Combat AI (A*, Steering)
│   └── ProjectileManager.ts       # High-performance pooling
│
└── [INFRA] Infrastructure & Services
    ├── Havok Physics              # WASM Physics
    ├── ConfigLoader.ts            # Data-driven loading (JSON)
    └── CodexService.ts            # Persistence & Achievements
```

---

## 3. Game Design Choices

### 3.1 Arcade Loop Justification
Unlike classic Roguelikes based on labyrinth exploration, we chose a **linear and high-octane** progression (Runner/Arcade type).
- **Reason:** Maximize immediate engagement and facilitate potential mobile porting. Difficulty lies in combat and space management, not navigation.
- **No Meta-progression:** We prioritized the purity of the "High Score". Each run is an equal chance for performance, reinforcing the competitive arcade aspect.

### 3.2 Integrated Economy System
We merged the Shop and inter-room bonus choices into a single interface.
- **Reason:** Streamline the game pace. The player can spend credits to heal, reroll bonuses, or buy rarities without breaking the run dynamic with a superfluous scene change.

---

## 4. Encountered Difficulties and Solutions (Workarounds)

### 4.1 Procedural Texture Bottleneck
3D relief rendering generated massive CPU spikes (up to 150ms) when entering a new room.
- **Solution (Workaround):** Implementation of a **Lightweight Mode**. Instead of generating unique textures per tile, we created a "bucketing" system (shared materials by relief categories) and reduced mesh subdivision based on detected performance.

### 4.2 Resource and Deadline Constraints
Team of 3 with limited availability.
- **Solution:** Automation of the artistic pipeline. We used AI to generate 2D assets and the "Daemon Voice Lab" for speech synthesis, freeing up time for gameplay logic polishing.

### 4.3 Complexity Management: The April Refactor
Moving from a throwaway prototype to a modular structure in February was a planned step to clean up project foundations. However, the rapid growth of features spawned a new challenge in April: the hyper-centralization of `GameManager.ts`.
- **Difficulty:** Although modular, the project suffered from "orchestration overload". The `GameManager` was becoming a "God Object" managing too many disparate responsibilities (combat, economy, streaming, narrative), making maintenance risky.
- **Solution (Workaround):** We operated a massive refactor in early April to extract business logic into specialized **Domain Managers** (e.g., `GameCombatActionManager`, `GameRoomStreamingManager`). The `GameManager` was reduced to a pure orchestrator role, delegating execution to expert modules. This isolation allowed for codebase stabilization and faster regression testing.

---

## 5. Points of Pride

1.  **Internal Tooling Quality:** We are proud to have developed our own editors (ASCII-to-3D, Voice Lab, Benchmark Mode). These tools allowed us to achieve a high level of content with a small team.
2.  **Decoupling Robustness:** The strict use of the EventBus allows us to add complex visual or sound effects without ever impacting gameplay code stability.
3.  **"Smart Retro" Identity:** Successfully transforming the constraint of simple voxel models into an aesthetic strength through a consistent post-process pipeline (CRT/Glitch).

---

## 6. Project Status and Roadmap (D-15)

### 6.1 Implemented
- **Core:** Game loop, 3 complete kits, bonus system, and economy.
- **Meta:** Codex, Achievements, Save system, Accessibility (Auto-aim, Colorblind).
- **Art:** Hand-made models, VFX, Daemon TTS.

### 6.2 Final Roadmap
- **Content:** Final rooms, missing SFX, balancing.
- **Optimization:** Resolve residual memory leaks (transitions).
- **Multi-platform:** Mobile porting (joysticks, responsive UI).

---

## 7. The Team
- **Pierre Constantin:** Lead Developer (Architecture, Core, AI).
- **Baptiste Giacchero:** 3D Artist & Animator (Voxel assets & animations).
- **Vlad Vasiliev:** Deployment, Utilities, SFX & Design Research.
