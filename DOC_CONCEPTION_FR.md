# Document de Conception : Daemon Dungeon
**Projet pour le concours Games on Web 2026 - IA Edition**

## 1. Vision et Concept Global

**Daemon Dungeon** est un Rogue-like 3D isométrique à l'esthétique Voxel, conçu pour offrir une expérience arcade nerveuse sur le web. Le joueur incarne un programme rebelle infiltré dans une simulation corrompue, gérée par une entité tyrannique : le **Daemon**.

### 1.1 Un Univers de Simulation Corrompue
L'identité du jeu repose sur une dualité esthétique : la solidité d'un donjon médiéval et l'instabilité d'un système informatique.
- **Narratif :** Le Daemon (inspiré par GLaDOS) commente les performances du joueur avec cynisme. Le lexique technique est omniprésent (classes *Wizard Installer*, *Firewall*, *Glitch* ; succès nommés d'après des codes d'erreur).
- **Visuel :** L'utilisation du Voxel, magnifiée par des shaders de post-process (pixelisation, lignes CRT), crée une signature visuelle "Cyber-Fantasy" unique.

### 1.2 Intelligence Artificielle et Comportements Dynamiques
Nous avons implémenté des algorithmes garantissant des combats tactiques :
- **Navigation :** Algorithme **A*** pour une navigation intelligente dans des environnements complexes.
- **Gestion de foule (Crowd Steering) :** Utilisation de comportements de steering (séparation, cohésion) pour créer des patterns d'encerclement organiques, évitant les chevauchements d'entités.

---

## 2. Architecture Technique & Choix d'Ingénierie

### 2.1 Justification de la Pile Technologique
- **TypeScript & Babylon.js :** Le choix de TypeScript a été dicté par la nécessité d'une codebase typée pour gérer les interactions complexes entre les systèmes. Babylon.js (imposé) a été exploité pour ses capacités de gestion de scènes et de shaders.
- **Havok Physics (WASM) :** Choisi pour sa performance brute sur le web, permettant de gérer des dizaines de projectiles et d'entités sans chute de framerate.

### 2.2 Philosophie de Conception : Modularité et Scalabilité
Le projet a suivi une évolution critique, passant d'un prototype monolithique (Proof of Concept) à une architecture en couches :
1.  **EventBus Global :** Nous avons implémenté ce pattern pour découpler totalement les systèmes. Par exemple, la mort d'un ennemi émet un événement unique intercepté par le son, l'interface, le score et le narrateur, sans lien direct entre ces modules.
2.  **Data-Driven Design :** Pour permettre un équilibrage rapide, toutes les statistiques (HP, vitesse, dégâts) sont stockées dans des JSON externes. Cette séparation permet d'ajuster le gameplay sans modifier la logique métier.

### 2.3 Cartographie de l'Architecture (Vue en Couches)
```text
DAEMON DUNGEON ARCHITECTURE
│
├── [CORE] Orchestration & Cycle de Vie
│   ├── GameManager.ts             # Orchestrateur central (Singleton)
│   ├── EventBus.ts                # Bus d'événements global (Découplage)
│   └── GameRuntimeOrchestrator.ts # Profiling de frame & séquençage
│
├── [DOMAIN] Gestionnaires Métier (Extracted Managers)
│   ├── GameCombatActionManager.ts      # Effets de combat & VFX
│   ├── GameRoomStreamingManager.ts     # Pipeline asynchrone des salles
│   ├── GameWorldCollisionHazardManager.ts # Gestion des dangers
│   └── DaemonVoicelineManager.ts       # Moteur narratif
│
├── [SYSTEMS] Sous-systèmes Techniques
│   ├── RoomManager.ts             # Géométrie 3D des salles
│   ├── TileFloorManager.ts        # Rendu de sol par tuilage
│   └── EnemySpawner.ts            # Spawn progressif (lissage CPU)
│
├── [GAMEPLAY] Logique d'Entités
│   ├── PlayerController.ts        # Input mapping & kits de capacités
│   ├── EnemyController.ts         # IA de combat (A*, Steering)
│   └── ProjectileManager.ts       # Pooling haute performance
│
└── [INFRA] Infrastructure & Services
    ├── Havok Physics              # Physique WASM
    ├── ConfigLoader.ts            # Chargement Data-driven (JSON)
    └── CodexService.ts            # Persistance & Succès
```

---

## 3. Choix de Conception du Jeu (Game Design)

### 3.1 Justification de la Boucle Arcade
Contrairement aux Rogue-likes classiques basés sur l'exploration de labyrinthes, nous avons choisi une progression **linéaire et nerveuse** (type Runner/Arcade).
- **Raison :** Maximiser l'engagement immédiat et faciliter un éventuel portage mobile. La difficulté réside dans le combat et la gestion de l'espace, pas dans la navigation.
- **Absence de Meta-progression :** Nous avons privilégié la pureté du "High Score". Chaque run est une chance égale de performance, renforçant l'aspect arcade compétitif.

### 3.2 Système d'Économie Intégrée
Nous avons fusionné le Shop et le choix de bonus inter-salles en une interface unique.
- **Raison :** Fluidifier le rythme de jeu. Le joueur peut dépenser ses crédits pour se soigner, reroll ses bonus ou acheter des raretés, sans rompre la dynamique de la run par un changement de scène superflu.

---

## 4. Difficultés Rencontrées et Solutions (Workarounds)

### 4.1 Goulot d'Étranglement des Textures Procédurales
Le rendu des reliefs 3D générait des pics de CPU massifs (jusqu'à 150ms) lors de l'entrée dans une nouvelle salle.
- **Solution (Workaround) :** Implémentation d'un **Mode Lightweight**. Au lieu de générer des textures uniques par tuile, nous avons créé un système de "bucketing" (matériaux partagés par catégories de relief) et réduit la subdivision des maillages en fonction des performances détectées.

### 4.2 Contraintes de Ressources et Délai
Équipe de 3 avec des disponibilités réduites.
- **Solution :** Automatisation du pipeline artistique. Nous avons utilisé l'IA pour générer les assets 2D et le "Daemon Voice Lab" pour la synthèse vocale, libérant du temps pour le polissage de la logique de jeu.

### 4.3 Maîtrise de la Complexité : Le Refactor d'Avril
Le passage d'un prototype jetable à une structure modulaire en février était une étape planifiée pour assainir les bases du projet. Cependant, la croissance rapide des fonctionnalités a engendré un nouveau défi en avril : l'hyper-centralisation du `GameManager.ts`.
- **Difficulté :** Bien que modulaire, le projet souffrait d'une "orchestration overload". Le `GameManager` devenait un "God Object" gérant trop de responsabilités disparates (combat, économie, streaming, narratif), rendant la maintenance risquée.
- **Solution (Workaround) :** Nous avons opéré un refactor massif début avril pour extraire la logique métier vers des **Domain Managers** spécialisés (ex: `GameCombatActionManager`, `GameRoomStreamingManager`). Le `GameManager` a été réduit à un rôle de pur chef d'orchestre, délégant l'exécution aux modules experts. Cette isolation a permis de stabiliser la codebase et d'accélérer les tests de régression.

---

## 5. Points de Fierté

1.  **Qualité de l'Outillage Interne :** Nous sommes fiers d'avoir développé nos propres éditeurs (ASCII-to-3D, Voice Lab, Mode Benchmark). Ces outils nous ont permis d'atteindre un niveau de contenu élevé avec une équipe réduite.
2.  **Robustesse du Découplage :** L'utilisation stricte de l'EventBus nous permet d'ajouter des effets visuels ou sonores complexes sans jamais impacter la stabilité du code de gameplay.
3.  **Identité "Smart Retro" :** Avoir réussi à transformer la contrainte des modèles voxel simples en une force esthétique grâce à un pipeline de post-process (CRT/Glitch) cohérent.

---

## 6. État d'Avancement et Roadmap (J-15)

### 6.1 Implémenté
- **Core :** Boucle de jeu, 3 classes complètes, système de bonus et économie.
- **Méta :** Codex, Achievements, Sauvegarde, Accessibilité (Auto-aim, Daltonisme).
- **Art :** Modèles hand-made, VFX, TTS Daemon.

### 6.2 Roadmap Finale
- **Contenu :** Salles finales, SFX manquants, équilibrage.
- **Optimisation :** Résolution des fuites de mémoire (transitions).
- **Multi-plateforme :** Portage mobile (joysticks, interface responsive).

---

## 7. L'Équipe
- **Pierre Constantin :** Lead Développeur (Architecture, Core, IA).
- **Baptiste Giacchero :** Artiste 3D & Animateur (Assets voxels & animations).
- **Vlad Vasiliev :** Déploiement, Utilitaires, SFX & Recherche Design.
