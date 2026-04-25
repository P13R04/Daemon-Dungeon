# Pipeline de Génération d'Artworks - Bonus Daemon Dungeon

Ce document définit les règles strictes, les paramètres graphiques, et fournit une structure JSON pour générer l'ensemble des icônes de bonus du jeu.

## 1. Directives Globales (Style Guide)

Afin d'assurer une parfaite cohérence visuelle avec les modèles de personnages du jeu (rendu voxel/3D low-poly, flat, textures pixelisées) et pour s'intégrer parfaitement dans l'UI des cartes de bonus, voici les nouvelles consignes.

### 1.1 Composition & Format
- **Dimensions de génération** : 1024x1024 (pour avoir du détail) puis *downscale* en 128x128.
- **Ratio** : 1:1 (Carré).
- **Cadrage** : Sujet principal parfaitement centré, flottant (macro iconique). Quasi frontal ou 3/4 haut.
- **Lisibilité** : Rendu "flat", géométrie simple (type voxel ou 3D retro low-poly), silhouette très claire.
- **Fond (Critique)** : Fond UNI et SOMBRE (clean solid dark background). **Surtout aucun cadre, aucune bordure**, pour éviter au maximum le phénomène de "double bordure" une fois la carte intégrée dans l'UI du jeu.

### 1.2 Thème et Ambiance
- **Univers** : Tech-Fantasy, Cyberpunk, Voxel, Pixel-art 3D, Retro.
- **Style visuel** : Flat low-poly 3D shading, pixel-art textures. (Style proche de modèles 3D blocky de type Minecraft / Crossy Road / Cube World mais avec une DA SF/Tech).
- **Interdits absolus** : AUCUN fond détaillé, AUCUNE bordure (`no borders, no frames`), AUCUN texte (`no text`), AUCUN logo (`no logo`), AUCUN filigrane (`no watermark`), pas de rendu photoréaliste, pas de surcharges de détails au centre.

### 1.3 Couleurs et Textures par Archétype
Pour coller aux modèles de la hiérarchie du jeu :
- **General / Meta** : Vert + Cyan (Textures de code type matrix, lumières néon).
- **Firewall (Tank)** : Base métallique gris/argent, circuits imprimés dorés et composants oranges, accents de lumières bleues.
- **Mage (Caster)** : Base violet foncé, lignes de circuits imprimés cyan, lumières néon bleu froid.
- **Rogue (Assassin)** : Base texturée de code matrix noir/vert, détails vert néon glitchés, et motifs de texture manquante en damier rose et noir (`pink and black checkerboard`).

---

## 2. Base Prompts

**Base Prompt Universel** (à concaténer avec le prompt spécifique) :
> "Detailed pixel-art 3D game perk icon, flat low-poly shading, clean solid dark gray background (no borders or frames), balanced cohesive composition, tech-fantasy RPG theme, <<COLOR_SCHEME>>, bold clear silhouette, highly legible at small sizes, perfectly centered, no text, no logo, no watermark."

**Negative Prompt Universel** :
> "borders, frames, UI elements, highly detailed background, complex shapes, photorealistic, smooth lighting, gradients, text, signature, letters, numbers, blurry, cluttered, asymmetrical framing"

---

## 3. Configuration Pipeline (JSON Structure)

Voici la structure JSON mise à jour avec la nouvelle direction artistique.

```json
{
  "pipeline_config": {
    "resolution": "1024x1024",
    "ratio": "1:1",
    "base_prompt": "Detailed pixel-art 3D game perk icon, flat low-poly shading, clean solid dark gray background (no borders or frames), balanced cohesive composition, tech-fantasy RPG theme, {COLOR_SCHEME}, bold clear silhouette, highly legible at small sizes, perfectly centered, no text, no logo, no watermark.",
    "negative_prompt": "borders, frames, UI elements, highly detailed background, complex shapes, photorealistic, smooth lighting, gradients, text, signature, letters, numbers, blurry, cluttered, asymmetrical framing"
  },
  "color_schemes": {
    "general": "green matrix motifs and cyan neon lines",
    "meta": "green matrix motifs and cyan neon lines",
    "firewall": "metallic silver base with gold and orange circuits and blue highlights",
    "mage": "dark purple base with cyan printed circuit lines and cold blue neon accents",
    "rogue": "black matrix code base with glowing neon green details and pink and black checkerboard missing textures",
    "shop": "cyan and bright green tech details"
  },
  "bonuses": [
    {
      "id": "bonus_hp",
      "category": "general",
      "name": "Integrity Overclock",
      "specific_prompt": "A glowing voxel heart-core inside a transparent server block casing, overclock heat vents, green matrix code flowing through coolant tubes."
    },
    {
      "id": "bonus_ms",
      "category": "general",
      "name": "Vector Drift",
      "specific_prompt": "A pair of blocky cyber boots leaving luminous pixel vector trails, motion streaks in cyan and lime, dynamic forward tilt."
    },
    {
      "id": "bonus_poison",
      "category": "general",
      "name": "Memory Leak",
      "specific_prompt": "A cracked cubic poison vial leaking bright toxic liquid filled with malicious matrix code pixels, corrupted memory blocks floating around."
    },
    {
      "id": "bonus_fire_rate",
      "category": "general",
      "name": "Clock Speed Up",
      "specific_prompt": "A futuristic pixelated processor crystal with spinning clock rings, rapid blocky pulse ticks, cascading timing lines."
    },
    {
      "id": "bonus_dodge_roll",
      "category": "general",
      "name": "Null Pointer Dodge",
      "specific_prompt": "A ghostly flat character silhouette phasing through a red attack line, null-pointer square symbols dissolving impact, digital voxel afterimage trails."
    },
    {
      "id": "bonus_crit_engine",
      "category": "general",
      "name": "Branch Predictor",
      "specific_prompt": "A split neon decision tree chip with one voxel branch exploding into critical hit shards, predictive luminous arrows."
    },
    {
      "id": "bonus_ulti_charge",
      "category": "general",
      "name": "Fast Boot Sequence",
      "specific_prompt": "A circular pixelated bootloader sigil filling rapidly with luminous progress segments, startup blocky sparks."
    },
    {
      "id": "bonus_ulti_duration",
      "category": "general",
      "name": "Persistent Process",
      "specific_prompt": "An infinite-loop cubic daemon orb stabilized by rotating process block rings, persistent bright glow."
    },
    {
      "id": "bonus_stance_efficiency",
      "category": "general",
      "name": "Resource Scheduler",
      "specific_prompt": "A holographic task scheduler wheel balancing three energy block streams, optimized queue bars, abstract flat UI overlays."
    },
    {
      "id": "meta_bounty_index",
      "category": "meta",
      "name": "Bounty Index",
      "specific_prompt": "A neon cubic credit chip stack with a rising market graph made of blocks, enemy skull pixel token reflected."
    },
    {
      "id": "meta_background_miner",
      "category": "meta",
      "name": "Background Miner",
      "specific_prompt": "An autonomous blocky mining daemon drone extracting glowing pixel credits from a dark data cube."
    },
    {
      "id": "meta_offer_slot",
      "category": "meta",
      "name": "Extra Slot Daemon",
      "specific_prompt": "A flat bonus card rack with an extra slot unfolding from a cyber hinge, one new cubic card glowing brighter."
    },
    {
      "id": "meta_lucky_compile",
      "category": "meta",
      "name": "Lucky Compile",
      "specific_prompt": "A blocky compiler cube rolling rare-quality pixel symbols, green success checks and golden cubic sparks."
    },
    {
      "id": "meta_double_pick",
      "category": "meta",
      "name": "Parallel Selection",
      "specific_prompt": "Two synchronized blocky robotic hands grabbing two glowing bonus flat cards at once, mirrored circuitry."
    },
    {
      "id": "meta_discount_patch",
      "category": "meta",
      "name": "Shop Cache",
      "specific_prompt": "A blocky price tag chip being patched with downward pixel arrows, cache memory cubes reducing cost values."
    },
    {
      "id": "firewall_thorns_driver",
      "category": "firewall",
      "name": "Kernel Spikes",
      "specific_prompt": "A heavy blocky firewall shield core erupting with outward sharp data spikes, close-range defensive flat burst."
    },
    {
      "id": "firewall_deflect_matrix",
      "category": "firewall",
      "name": "Packet Deflector",
      "specific_prompt": "A broad cubic cyber shield reflecting incoming red voxel projectiles into blue trajectories, clean reflection blocky arcs."
    },
    {
      "id": "firewall_stun_driver",
      "category": "firewall",
      "name": "Interrupt Handler",
      "specific_prompt": "A shield bash impact frame freezing enemy signal with an electric flat interrupt stun pixel icon, blocky shockwave."
    },
    {
      "id": "firewall_bash_range",
      "category": "firewall",
      "name": "Quarantine Sweep",
      "specific_prompt": "A heavy voxel shield generating an expanded quarantine arc cone, wide containment force flat wave."
    },
    {
      "id": "firewall_damage_reduction",
      "category": "firewall",
      "name": "Hardened Signature",
      "specific_prompt": "A reinforced low-poly cyber armor plate with layered digital lock voxel glyphs deflecting incoming pixel damage shards."
    },
    {
      "id": "mage_multishot_arc",
      "category": "mage",
      "name": "Wizard Installer",
      "specific_prompt": "A voxel cyber staff core launching three neon blocky projectiles in a curved fan arc, flat progress digital runes."
    },
    {
      "id": "mage_dual_burst",
      "category": "mage",
      "name": "Dual Build Pipeline",
      "specific_prompt": "Twin parallel cubic energy pipelines firing two synchronized laser blocky projectiles, flat muzzle flashes."
    },
    {
      "id": "mage_pierce_patch",
      "category": "mage",
      "name": "Dependency Injector",
      "specific_prompt": "A razor-thin piercing voxel neon projectile cutting through multiple stacked flat target silhouettes, blocky break impact."
    },
    {
      "id": "mage_reactive_aoe",
      "category": "mage",
      "name": "Rollback Snapshot",
      "specific_prompt": "A defensive rollback data pixel bubble triggering an instant impact, cubic shockwave expanding from a bright center core."
    },
    {
      "id": "mage_impact_aoe",
      "category": "mage",
      "name": "Crash Handler",
      "specific_prompt": "A projectile collision creating a circular crash-exception energy blast with fragmented blocky matrix code shards."
    },
    {
      "id": "mage_bounce_kernel",
      "category": "mage",
      "name": "Ricochet Runtime",
      "specific_prompt": "A glowing voxel projectile ricocheting sharply between flat metallic walls with bright block reflection sparks."
    },
    {
      "id": "mage_autolock_patch",
      "category": "mage",
      "name": "Auto-Target Service",
      "specific_prompt": "A smart cyber blocky projectile curving precisely toward a cubic enemy node, lock-on flat HUD reticle."
    },
    {
      "id": "rogue_lifesteal_script",
      "category": "rogue",
      "name": "Leech Script",
      "specific_prompt": "A jagged flat stealth cyber dagger extracting red cube health packets sending them into a glowing green life buffer voxel vial."
    },
    {
      "id": "rogue_stealth_zone",
      "category": "rogue",
      "name": "Cloak Injector",
      "specific_prompt": "A cloaking field tech voxel emitter creating a compact translucent stealth energy pixel dome, hidden flat shadowed silhouette inside."
    },
    {
      "id": "rogue_backdoor",
      "category": "rogue",
      "name": "Backdoor Strike",
      "specific_prompt": "A sharp rogue blocky energy blade piercing through a glowing vulnerability flat backdoor port on heavy voxel armor, bright cyber burst."
    },
    {
      "id": "rogue_whitehat_chain",
      "category": "rogue",
      "name": "White-Hat Chain",
      "specific_prompt": "A primary weapon voxel strike generating clean secondary electric flat pixel arcs chaining to nearby cubic enemy nodes."
    },
    {
      "id": "rogue_range_patch",
      "category": "rogue",
      "name": "Signal Sniffer",
      "specific_prompt": "A glowing cubic cyber dagger emitting an extended frontal detection flat pulse wave, signal sniffing pixel radar grid."
    },
    {
      "id": "shop_full_heal",
      "category": "shop",
      "name": "Integrity Reboot",
      "specific_prompt": "A reboot medical terminal flat icon restoring a full green digital blocky health bar to maximum, hard reset pixel pulse."
    },
    {
      "id": "shop_ult_refill",
      "category": "shop",
      "name": "Ultimate Recompile",
      "specific_prompt": "An ultimate voxel core battery instantly refilled to 100% capacity with compile energy flat lightning, glowing pixel charge."
    },
    {
      "id": "shop_damage_stim",
      "category": "shop",
      "name": "Dmg Stim",
      "specific_prompt": "A combat stim blocky syringe injector overclocking a glowing voxel weapon core, bright red-orange flat upward burst pixel arrows."
    },
    {
      "id": "shop_shield_patch",
      "category": "shop",
      "name": "Shield Patch",
      "specific_prompt": "A defensive modular flat patch sealing digital blocky cracks on a transparent energy barrier wall, pixel mitigation glyphs."
    }
  ]
}
```

## 4. Recommandations d'Intégration et Processus

Pour générer en masse sans perdre en cohésion :
1. **Contrôler les bords** : En incluant `clean solid dark gray background (no borders or frames)` et en insistant sur le `flat low-poly shading with pixel-art textures`, on s'assure d'avoir un élément facilement intégrable dans la case carrée de ton interface.
2. **Tester le rendu des archétypes cibles** : Les couleurs des prompts ont été mises à jour pour matcher l'identité des 3 modèles 3D (le damier rose/noir sur le rogue, les circuits dorés sur fond argent pour le firewall, et les circuits cyan sur fond violet pour le mage).
3. **Optimiser** : Une fois générés, une passe de color-grading automatique vers palette indexée pourra donner un cachet d'autant plus "pixel" si souhaité, mais le rendu Midjourney/DALL-E suffit souvent si tu as ce prompt stylisé.
