# Pipeline de Generation d'Artworks - Achievements Daemon Dungeon

Ce document definit le design du contenu Achievements et le pipeline de generation visuelle associe. L'objectif est de produire une serie d'illustrations coherentes entre elles, lisibles en petit format, et prêtes a etre integrees dans l'UI en tant qu'icones/tuiles de succes.

## 1. Direction Artistique Globale

### 1.1 Format
- Resolution de generation: 1024x1024, puis downscale 128x128.
- Ratio: 1:1.
- Cadrage: sujet centre, silhouette forte, lisible a petite taille.
- Fond: uni sombre, sans bordure, sans frame.

### 1.2 Style
- Univers: techno-fantasy, cyber-dungeon, voxel/low-poly retro.
- Rendu: flat 3D low-poly avec texture pixel-art legere.
- Contraste: fort contraste sujet/fond pour garder une bonne lecture dans HUD/Codex.
- Interdits: texte, logos, watermark, elements UI, fond complexe, photorealisme.

### 1.3 Palette
- Base globale: cyan/vert neon sur fond graphite.
- Boss/exploit: accents rouges/ambre.
- Tutorial/progression: accents bleu/indigo.
- Codex/systeme: cyan froid + blanc cassé.

## 2. Prompts Globaux

### Prompt General
"Detailed pixel-art 3D achievement icon, flat low-poly shading, clean solid dark gray background (no borders or frames), centered macro composition, tech-fantasy cyber dungeon style, bold silhouette, high readability at small sizes, no text, no logo, no watermark."

### Negative Prompt
"borders, frames, UI elements, detailed background, photorealistic, smooth gradients, text, letters, numbers, logo, watermark, blurry, cluttered, asymmetrical crop"

## 3. Catalogue Achievements (Design + Intent)

- `tutorial_mage`
  - Nom: Hello World Wizard
  - Description: Finish the tutorial as Mage.
  - Direction artwork: Purple voxel circuit-grimoire with a glowing cyan boot rune.

- `tutorial_firewall`
  - Nom: Kernel Panic Tank
  - Description: Finish the tutorial as Firewall.
  - Direction artwork: Armored server shield with orange sparks and a kernel lock.

- `tutorial_rogue`
  - Nom: Stealth Commit
  - Description: Finish the tutorial as Rogue.
  - Direction artwork: Stealthy data dagger leaving a green glitch trail.

- `tutorial_trinity`
  - Nom: Triforce Merge
  - Description: Finish the tutorial with Mage, Firewall, and Rogue.
  - Direction artwork: Three distinct class glyphs merging into a triangular core: a purple arcane grimoire, an orange armored firewall shield, and a neon green glitching dagger.

- `room_10`
  - Nom: System Defender
  - Description: Reach room 10 in any run.
  - Direction artwork: Digital dungeon gate marked with 10 glowing segments.

- `room_20`
  - Nom: Production Ready
  - Description: Reach room 20.
  - Direction artwork: Stabilized server core with a double security ring (20 ticks).

- `room_10_mage`
  - Nom: Stack Mage
  - Description: Reach room 10 as Mage.
  - Direction artwork: Stack of circuit-grimoires with a compiled arcane orb.

- `room_10_firewall`
  - Nom: Zero-Trust Tour
  - Description: Reach room 10 as Firewall.
  - Direction artwork: Firewall wall made of armored plates with validation badges.

- `room_10_rogue`
  - Nom: Shadow Deploy
  - Description: Reach room 10 as Rogue.
  - Direction artwork: Stealthy silhouette deploying with a neon knife.

- `room_10_trinity`
  - Nom: Polyglot Pipeline
  - Description: Reach room 10 with Mage, Firewall, and Rogue.
  - Direction artwork: A tri-phase data pipeline with three converging energy streams: purple arcane pulses, orange heavy shield-plating waves, and sharp neon green glitching data-flow.

- `stack_overflow_5000`
  - Nom: Stack Overflow
  - Description: Reach a score of 5,000.
  - Direction artwork: Stack of memory blocks overflowing with cyan sparks.

- `stack_overflow_15000`
  - Nom: Segfault Celebrity
  - Description: Reach a score of 15,000.
  - Direction artwork: Brilliant memory crash forming a crown of digital fragments.

- `ghost_shell_5`
  - Nom: Ghost in the Shell
  - Description: Clear 5 rooms in a row without taking damage.
  - Direction artwork: Translucent spectral helmet passing through 5 neon gates.

- `ghost_shell_10`
  - Nom: Ghost in the Shell++
  - Description: Clear 10 rooms in a row without taking damage.
  - Direction artwork: Elite version of the spectral helmet, binary trail across 10 rings.

- `boss_killer`
  - Nom: Exception Handler
  - Description: Defeat 1 boss.
  - Direction artwork: Debug hammer striking a cracked boss-cube.

- `boss_hunter`
  - Nom: Boss Thread Terminator
  - Description: Defeat 5 bosses.
  - Direction artwork: Trophy of 5 boss cores threaded on a process string.

- `scan_complete`
  - Nom: Scan Complete
  - Description: Encounter every enemy type from the normal run pool.
  - Direction artwork: Full hexagonal radar with holographic enemy silhouettes.

- `encounter_sentinel`
  - Nom: Handshake Refused
  - Description: Encounter a Sentinel.
  - Direction artwork: Red Sentinel eye rejecting a connection request.

- `daemon_slayer_10`
  - Nom: Daemon Slayer
  - Description: Defeat 10 enemies.
  - Direction artwork: Simple cyber blade surrounded by 10 fragments.

- `daemon_slayer_100`
  - Nom: Senior Daemon Slayer
  - Description: Defeat 100 enemies.
  - Direction artwork: Evolved blade with a halo of one hundred micro-shards.

- `move_speed_1_5`
  - Nom: Sudo Make Me Fast
  - Description: Reach 1.5 movement speed.
  - Direction artwork: Over-accelerated voxel boots with a cyan vector trail.

- `overclocked`
  - Nom: Overclocked
  - Description: Reach 1.5 attack speed.
  - Direction artwork: Red-cyan clock chip with sprinting hands.

- `bonus_sampler_10`
  - Nom: Plugin Collector
  - Description: Select 10 different bonuses.
  - Direction artwork: Module rack with 10 active slots.

- `bonus_sampler_20`
  - Nom: Dependency Hoarder
  - Description: Select 20 different bonuses.
  - Direction artwork: Dependency graph in a dense neon web.

- `bonus_sampler_30`
  - Nom: Package Manager
  - Description: Select 30 different bonuses.
  - Direction artwork: Mega-box of extensions with 30 stacked modules.

- `run_boot_10`
  - Nom: Boot Loop
  - Description: Start 10 runs.
  - Direction artwork: Circular boot sequence with a 10-segment counter.

- `open_codex`
  - Nom: Read The Docs
  - Description: Open the Codex.
  - Direction artwork: Open holographic codex with a glowing index.

- `dont_fix_it`
  - Nom: If It Works, Don't Fix It
  - Description: Open the settings menu.
  - Direction artwork: Locked toggle panel with a suspended screwdriver, industrial cyberpunk style.

- `death_void`
  - Nom: Null Pointer Exception
  - Description: Fall into the abyss.
  - Direction artwork: A stylized digital figure fragmenting into vertical blue light streaks while falling into a pitch-black void.

- `death_poison`
  - Nom: Memory Leak
  - Description: Succumb to gradual data corruption (Poison).
  - Direction artwork: A neon green skull icon dissolving into digital liquid droplets, leaving a trail of binary '0' and '1'.

- `death_boss`
  - Nom: Force Kill -9
  - Description: Terminated by a high-level process (Boss).
  - Direction artwork: A massive, glowing red "X" symbol crushing a small, vulnerable voxel character, high contrast.

- `death_sentinel`
  - Nom: Access Denied
  - Description: Security Sentinel refused your credentials.
  - Direction artwork: A red Sentinel laser eye firing a beam that shatters a semi-transparent cyan data-wall.

- `death_spike`
  - Nom: Buffer Overflow
  - Description: Impaled by physical memory spikes.
  - Direction artwork: Sharp voxel spikes emerging from a grid floor, impaling a glowing data block with orange sparks.

- `death_quick`
  - Nom: Alt + F4
  - Description: Die in the first room.
  - Direction artwork: A power button symbol glitching with red and white noise, set against a dark terminal background.

- `death_simultaneous`
  - Nom: Race Condition
  - Description: Die at the same time as an enemy.
  - Direction artwork: Two colliding pulses of yellow energy exploding simultaneously in a cloud of square bits.

- `death_trap`
  - Nom: Logic Bomb
  - Description: Die from a trap.
  - Direction artwork: A digital landmine exploding into a sphere of jagged red fragments and shockwave rings.

- `death_mage_void`
  - Nom: Garbage Collector
  - Description: As a Mage, get deallocated in the void.
  - Direction artwork: A purple arcane grimoire dissolving into white static noise while suspended in a dark digital pit.

- `death_tank_overload`
  - Nom: Kernel Panic
  - Description: As a Tank, suffer a critical shield breach.
  - Direction artwork: A heavy orange firewall shield shattering into pieces, with heat-map colors and internal circuit glow.

- `death_rogue_caught`
  - Nom: Intrusion Detected
  - Description: As a Rogue, get intercepted by security.
  - Direction artwork: A green hooded digital silhouette being illuminated by multiple overlapping red searchlight cones.

## 4. Structure JSON Conseillee pour la Generation

```json
{
  "pipeline_config": {
    "resolution": "1024x1024",
    "ratio": "1:1",
    "base_prompt": "Detailed pixel-art 3D achievement icon, flat low-poly shading, clean solid dark gray background (no borders or frames), centered macro composition, tech-fantasy cyber dungeon style, bold silhouette, high readability at small sizes, no text, no logo, no watermark.",
    "negative_prompt": "borders, frames, UI elements, detailed background, photorealistic, smooth gradients, text, letters, numbers, logo, watermark, blurry, cluttered, asymmetrical crop"
  },
  "achievements": [
    {
      "id": "tutorial_mage",
      "name": "Hello World Wizard",
      "specific_prompt": "Purple voxel circuit-grimoire with a glowing cyan boot rune."
    },
    {
      "id": "tutorial_firewall",
      "name": "Kernel Panic Tank",
      "specific_prompt": "Armored server shield with orange sparks and a kernel lock."
    },
    {
      "id": "tutorial_rogue",
      "name": "Stealth Commit",
      "specific_prompt": "Stealthy data dagger leaving a green glitch trail."
    },
    {
      "id": "tutorial_trinity",
      "name": "Triforce Merge",
      "specific_prompt": "Three distinct class glyphs merging into a triangular core: a purple arcane grimoire, an orange armored firewall shield, and a neon green glitching dagger."
    },
    {
      "id": "room_10",
      "name": "System Defender",
      "specific_prompt": "Digital dungeon gate marked with 10 glowing segments."
    },
    {
      "id": "room_20",
      "name": "Production Ready",
      "specific_prompt": "Stabilized server core with a double security ring (20 ticks)."
    },
    {
      "id": "room_10_mage",
      "name": "Stack Mage",
      "specific_prompt": "Stack of circuit-grimoires with a compiled arcane orb."
    },
    {
      "id": "room_10_firewall",
      "name": "Zero-Trust Tour",
      "specific_prompt": "Firewall wall made of armored plates with validation badges."
    },
    {
      "id": "room_10_rogue",
      "name": "Shadow Deploy",
      "specific_prompt": "Stealthy silhouette deploying with a neon knife."
    },
    {
      "id": "room_10_trinity",
      "name": "Polyglot Pipeline",
      "specific_prompt": "A tri-phase data pipeline with three converging energy streams: purple arcane pulses, orange heavy shield-plating waves, and sharp neon green glitching data-flow."
    },
    {
      "id": "stack_overflow_5000",
      "name": "Stack Overflow",
      "specific_prompt": "Stack of memory blocks overflowing with cyan sparks."
    },
    {
      "id": "stack_overflow_15000",
      "name": "Segfault Celebrity",
      "specific_prompt": "Brilliant memory crash forming a crown of digital fragments."
    },
    {
      "id": "ghost_shell_5",
      "name": "Ghost in the Shell",
      "specific_prompt": "Translucent spectral helmet passing through 5 neon gates."
    },
    {
      "id": "ghost_shell_10",
      "name": "Ghost in the Shell++",
      "specific_prompt": "Elite version of the spectral helmet, binary trail across 10 rings."
    },
    {
      "id": "boss_killer",
      "name": "Exception Handler",
      "specific_prompt": "Debug hammer striking a cracked boss-cube."
    },
    {
      "id": "boss_hunter",
      "name": "Boss Thread Terminator",
      "specific_prompt": "Trophy of 5 boss cores threaded on a process string."
    },
    {
      "id": "scan_complete",
      "name": "Scan Complete",
      "specific_prompt": "Full hexagonal radar with holographic enemy silhouettes."
    },
    {
      "id": "encounter_sentinel",
      "name": "Handshake Refused",
      "specific_prompt": "Red Sentinel eye rejecting a connection request."
    },
    {
      "id": "daemon_slayer_10",
      "name": "Daemon Slayer",
      "specific_prompt": "Simple cyber blade surrounded by 10 fragments."
    },
    {
      "id": "daemon_slayer_100",
      "name": "Senior Daemon Slayer",
      "specific_prompt": "Evolved blade with a halo of one hundred micro-shards."
    },
    {
      "id": "move_speed_1_5",
      "name": "Sudo Make Me Fast",
      "specific_prompt": "Over-accelerated voxel boots with a cyan vector trail."
    },
    {
      "id": "overclocked",
      "name": "Overclocked",
      "specific_prompt": "Red-cyan clock chip with sprinting hands."
    },
    {
      "id": "bonus_sampler_10",
      "name": "Plugin Collector",
      "specific_prompt": "Module rack with 10 active slots."
    },
    {
      "id": "bonus_sampler_20",
      "name": "Dependency Hoarder",
      "specific_prompt": "Dependency graph in a dense neon web."
    },
    {
      "id": "bonus_sampler_30",
      "name": "Package Manager",
      "specific_prompt": "Mega-box of extensions with 30 stacked modules."
    },
    {
      "id": "run_boot_10",
      "name": "Boot Loop",
      "specific_prompt": "Circular boot sequence with a 10-segment counter."
    },
    {
      "id": "open_codex",
      "name": "Read The Docs",
      "specific_prompt": "Open holographic codex with a glowing index."
    },
    {
      "id": "dont_fix_it",
      "name": "If It Works, Don't Fix It",
      "specific_prompt": "Locked toggle panel with a suspended screwdriver, industrial cyberpunk style."
    },
    {
      "id": "death_void",
      "name": "Null Pointer Exception",
      "specific_prompt": "A stylized digital figure fragmenting into vertical blue light streaks while falling into a pitch-black void."
    },
    {
      "id": "death_poison",
      "name": "Memory Leak",
      "specific_prompt": "A neon green skull icon dissolving into digital liquid droplets, leaving a trail of binary '0' and '1'."
    },
    {
      "id": "death_boss",
      "name": "Force Kill -9",
      "specific_prompt": "A massive, glowing red \"X\" symbol crushing a small, vulnerable voxel character, high contrast."
    },
    {
      "id": "death_sentinel",
      "name": "Access Denied",
      "specific_prompt": "A red Sentinel laser eye firing a beam that shatters a semi-transparent cyan data-wall."
    },
    {
      "id": "death_spike",
      "name": "Buffer Overflow",
      "specific_prompt": "Sharp voxel spikes emerging from a grid floor, impaling a glowing data block with orange sparks."
    },
    {
      "id": "death_quick",
      "name": "Alt + F4",
      "specific_prompt": "A power button symbol glitching with red and white noise, set against a dark terminal background."
    },
    {
      "id": "death_simultaneous",
      "name": "Race Condition",
      "specific_prompt": "Two colliding pulses of yellow energy exploding simultaneously in a cloud of square bits."
    },
    {
      "id": "death_trap",
      "name": "Logic Bomb",
      "specific_prompt": "A digital landmine exploding into a sphere of jagged red fragments and shockwave rings."
    },
    {
      "id": "death_mage_void",
      "name": "Garbage Collector",
      "specific_prompt": "A purple arcane grimoire dissolving into white static noise while suspended in a dark digital pit."
    },
    {
      "id": "death_tank_overload",
      "name": "Kernel Panic",
      "specific_prompt": "A heavy orange firewall shield shattering into pieces, with heat-map colors and internal circuit glow."
    },
    {
      "id": "death_rogue_caught",
      "name": "Intrusion Detected",
      "specific_prompt": "A green hooded digital silhouette being illuminated by multiple overlapping red searchlight cones."
    }
  ]
}
```

## 5. Pipeline de Production Recommande

1. Generer toutes les images en batch avec le prompt general + `specific_prompt` de chaque achievement.
2. Controler la lisibilite en 128x128 (silhouette et contraste).
3. Corriger au besoin en variant uniquement le `specific_prompt` (ne pas changer le style global).
4. Export final en PNG transparent optionnel (ou fond sombre uniforme selon l'UI finale).
5. Nommage de fichier recommande: `achievement_<id>.png`.

## 6. Integration UI (Placeholder deja prepare)

- Toast d'unlock prevu en haut a gauche (sous la barre de vie en gameplay).
- Bloc image actuellement en placeholder `IMG`, pret pour brancher les artworks finaux.
- Log d'unlock egalement pousse dans la mini-console gameplay (bas gauche).
