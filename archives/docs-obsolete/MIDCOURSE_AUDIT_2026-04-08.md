# Daemon Dungeon - Audit De Mi-Parcours
**Date:** 2026-04-08

## Synthese Rapide
- Build global: **PASS** (`npm run build`)
- Dette `any/as any` dans `src/`: **2 occurrences** (seulement dans documentation `src/data/voicelines/README.md`)
- Marqueurs de dette `TODO|FIXME|HACK` dans `src/`: **17**
- Lint: **operationnel** avec config minimale + pipeline local `npm run ci:local` (lint + build)

## Hotspots Prioritaires (taille + complexite)
Top fichiers TypeScript par taille:
1. `src/gameplay/EnemyController.ts` - 3122 lignes
2. `src/core/GameManager.ts` - 2799 lignes
3. `src/systems/HUDManager.ts` - 2271 lignes
4. `src/gameplay/PlayerController.ts` - 1679 lignes
5. `src/systems/DevConsole.ts` - 1409 lignes
6. `src/systems/RoomManager.ts` - 1127 lignes

Conclusion: la dette principale est surtout structurelle (fichiers monolithiques), plus que typage/compilation.

## Qualite Actuelle
Points forts:
- Typage fortement ameliore (quasi-zero `any` executable)
- Pipeline de build stable
- Refactoring de `GameManager` deja engage (event bindings, transitions, run economy)

Points faibles:
- Absence de baseline lint automatisable
- Plusieurs modules encore tres longs, avec logique melangee (orchestration + domaine + presentation)
- Presence de stubs TODO techniques historiques (combat patterns, AIController, musique)

## Changements Prioritaires Recommandes
### P0 (securite de progression)
1. Ajouter une config ESLint minimale pour rendre `npm run lint` operationnel.
2. Ajouter au moins une passe "no regression" scriptable (build + lint) en CI locale.

### P1 (architecture)
1. Continuer la decomposition de `GameManager`:
   - extraire gestion des attaques entrantes et reactions (partiellement fait)
   - extraire preparation/reset de run (partiellement fait)
   - cible: reduire les callbacks inline et les blocs > 30 lignes
2. Segmenter `EnemyController` en sous-modules comportementaux (deplacements, capacites speciales, VFX).
3. Segmenter `HUDManager` en sous-composants (combat feed, daemon popup, bars/resources, codex overlays).

### P2 (dette fonctionnelle)
1. Traiter les TODO qui impactent gameplay (combat patterns, AI behavior execution).
2. Normaliser les services legacy (EntityFactory/MusicManager) en decidant: implementation ou deprecation explicite.

## Actions Executees Pendant Cet Audit
Refactor applique dans `src/core/GameManager.ts`:
- Extraction de la logique d'event `ATTACK_PERFORMED` vers:
  - `handleAttackPerformedEvent(...)`
  - `resolveIncomingMeleeDamage(...)`
- Extraction du reset de run de `startNewGame()` vers:
  - `prepareRunStateForStart()`
- Decomposition de `preloadRoomsAround(...)` en helpers lisibles:
  - `collectPreloadIndices(...)`
  - `preloadRoomInstanceAtIndex(...)`
  - `unloadNonDesiredRoomInstances(...)`
- Ajout d'une file de prechargement differe des tiles pour lisser les pics frame-time:
  - `enqueueDeferredTilePreload(...)`
  - `flushDeferredTilePreloadQueueBatch(...)`
  - `clearDeferredTilePreloadQueue()`

Refactor applique dans `src/systems/RoomManager.ts`:
- Deduplication du mapping des spawn points via:
  - `isValidSpawnPoint(...)`
  - `mapSpawnPointToWorld(...)`

CI local/lint:
- Ajout de `.eslintrc.cjs` minimal.
- Ajout scripts `lint:ci` et `ci:local` dans `package.json`.
- Correction d'un blocage lint dans `PlayerAnimationController`.

Validation:
- `npm run ci:local`: **PASS** apres refactor.

## Plan De Suite Propose (court)
1. Passer `EnemyController` en decomposition comportementale (navigation/abilities/VFX en sous-modules).
2. Segmenter `HUDManager` en sous-composants UI pour reduire le couplage et la taille.
3. Introduire du preloading progressif audio/modeles en taches deferrees (IdleCallback/RAF) sur les scenes d'entree.

## Mise A Jour Continue (2026-04-09)
Execution demandee en autonomie: **1 puis 2 puis 3**.

1. `EnemyController` - extraction du bloc laser pattern:
- Nouveau module `src/gameplay/enemy/EnemyLaserPatternSubsystem.ts`.
- `EnemyController` delegue desormais le state/update/generation/visuals laser a ce sous-systeme.

2. `EnemyController` - extraction du bloc spike strategist:
- Nouveau module `src/gameplay/enemy/EnemySpikeCastSubsystem.ts`.
- `EnemyController` delegue desormais le state/update/zone/visuals spikes a ce sous-systeme.

3. `HUDManager` - extraction state machine avatar daemon:
- Nouveau module `src/systems/hud/DaemonAvatarController.ts`.
- `HUDManager` delegue le tick d'animation avatar, les phases voicelines et la logique de boucle audio-timebox.

Validation complete:
- `npm run ci:local`: **PASS** (lint + build)
