# Audit Workspace — Daemon Dungeon
_Date: 2026-02-26_

## 1) Résumé exécutif
- **La version actuelle (`src/` TypeScript + Babylon + GameManager)** est globalement **au-dessus** des prototypes (`daemon_dungeon _backup1`, `daemon_dungeon_old`) sur l’architecture, la modularité et l’évolutivité.
- Les dossiers legacy représentent ~**67 MB** (33 MB + 34 MB) et sont encore suivis Git (105 fichiers), mais ne participent pas au runtime actuel.
- Il existe des **doublons d’assets sûrs** (notamment `tiles_test`) et des **fichiers potentiellement orphelins** côté TS.
- Le repo gagnerait en lisibilité en séparant clairement:
  - code de production,
  - outils/éditeurs,
  - documentation de design/historique,
  - archives locales non versionnées.

## 2) État global du projet actuel
### Ce qui est solide
- Entrée claire: `src/main.ts` -> `GameManager`.
- Architecture gameplay modulaire: `core/`, `gameplay/`, `systems/`, `scene/`, `data/`.
- Pipeline Vite + TypeScript propre (`vite.config.ts`, `package.json`).
- Système de config data-driven (`src/data/config/*`).
- Scènes menu / sélection / gameplay déjà en place.

### Points de dette technique
- Le `src/` contient un mélange de:
  - modules actifs,
  - modules “nouvelle archi” non branchés,
  - anciens blocs utilitaires.
- Incohérence input clic droit:
  - `main.ts` laisse le menu contextuel,
  - `InputManager` empêche `contextmenu` dans certains chemins.
- Beaucoup de documentation racine historique, utile pour mémoire mais bruyante pour l’onboarding.

## 3) Comparatif avec `daemon_dungeon _backup1` et `daemon_dungeon_old`
## Verdict
- **Gameplay / architecture active > proto** sur tous les axes techniques principaux.
- Les prototypes restent utiles comme:
  - trace historique,
  - doc de conception initiale,
  - éventuelle source de snippets visuels/UI legacy.

### Éléments intéressants potentiellement récupérables
1. `daemon_dungeon _backup1/README.md`
   - bonne synthèse “Project Design Document” (vision produit/roadmap), utile en doc produit.
2. `daemon_dungeon_old/FILE_LOCATIONS.md` + `ARCHITECTURE*.md`
   - cartographie pédagogique de l’ancienne architecture; utile si vous voulez documenter la migration “avant/après”.

### Ce qui est dépassé
- Le code JS legacy (`game.js`, `src/*.js` dans `daemon_dungeon_old`) est structurellement remplacé par la base TS actuelle.
- Les ressources duplicatives de ces protos ne doivent plus être source de vérité.

## 4) Doublons / redondances identifiées
## Doublons assets **confirmés**
- `assets/tiles_test` vs `public/tiles_test` vs `tiles_mapping/tiles_test`:
  - 68 fichiers dans chaque dossier,
  - hash identique 1:1 entre les trois jeux.
- Recommandation:
  - **Source de vérité unique**: `assets/tiles_test`.
  - Garder `tiles_mapping/tiles_test` uniquement si l’éditeur standalone l’exige localement.
  - Supprimer `public/tiles_test` (sûr dans la config actuelle).

### HTML dupliqué
- `index.html` et `public/index.html` sont identiques.
- Avec `vite.config.ts` (`publicDir: './assets'`), `public/index.html` n’est pas la source d’entrée Vite.
- Recommandation: supprimer `public/index.html`.

### Frames avatar
- `assets/avatar_frames`, `assets/avatar_frames_cutout`, `assets/avatar_frames_cutout2` coexistent.
- Le runtime HUD utilise `avatar_frames_cutout2`.
- Recommandation:
  - conserver `avatar_frames_cutout2` comme source runtime,
  - archiver les deux autres dossiers si non utilisés en pipeline art.

## 5) Code potentiellement non utilisé (à vérifier avant suppression)
Analyse statique imports: **34 fichiers TS potentiellement orphelins** (sans inbound import), dont:
- `src/ai/behaviors/Behaviors.ts`
- `src/ai/crowd/CrowdAgent.ts`
- `src/ai/pathfinding/AStar.ts`
- `src/audio/AudioManager.ts`, `src/audio/MusicManager.ts`
- `src/services/*` (`AchievementService`, `AuthService`, `CodexService`, etc.)
- `src/ui/*` (`Codex`, `HUD`, `PauseMenu`, etc.)
- `src/systems/*` (`AISystem`, `CombatSystem`, `MovementSystem`, etc.)

> Important: ce sont des **candidats** à archiver/supprimer, pas une suppression “blindée” sans test runtime.

## 6) Fichiers/dossiers supprimables à coup sûr (ou quasi sûr)
### “À coup sûr” (dans la config actuelle)
- `public/index.html` (dupliqué + non utilisé par Vite).
- `public/tiles_test/` (duplicat exact de `assets/tiles_test`).

### “Très probable” après validation rapide équipe
- `daemon_dungeon _backup1/`
- `daemon_dungeon_old/`
- `room test/` (dossier racine avec espaces, copies de test)
- `room_test.json` (racine; doublon de flux editor déjà intégré)
- `test-unicode.html` (si plus utilisé pour debug ponctuel)

## 7) Plan d’archivage recommandé (non push)
Créer un dossier local ignoré Git, par exemple:
- `archive/legacy-prototypes/` -> déplacer `daemon_dungeon _backup1`, `daemon_dungeon_old`
- `archive/legacy-tests/` -> déplacer `room test`, `room_test.json`, `test-unicode.html`
- `archive/legacy-docs/` -> déplacer docs historiques volumineuses non opérationnelles

Ensuite, supprimer les dossiers initiaux du repo.

## 8) Organisation cible recommandée
### Proposition de structure
- `src/` = code runtime uniquement
- `assets/` = assets runtime source de vérité
- `tools/` = scripts utilitaires
- `docs/`
  - `docs/architecture/`
  - `docs/features/`
  - `docs/archive/` (historique)
- `archive/` (ignoré Git, local uniquement)

### Documentation racine à déplacer vers `docs/archive/`
- `ANIMATION_*`
- `TILE_SYSTEM_*`
- `PROJECT_STATUS_SUMMARY.md`
- `RESUME_SIMPLE.md`
- etc. (conserver à plat seulement `README.md` + éventuellement un `CONTRIBUTING.md`)

## 9) Favicon / static assets
- Le favicon est référencé par `index.html` via `/assets/favicon.png`.
- Avec `publicDir: './assets'`, c’est cohérent.
- **Pas besoin de déplacer** le favicon tant que cette stratégie est conservée.
- Si vous revenez au `public/` standard Vite plus tard, déplacer vers `public/favicon.png` sera plus conventionnel.

## 10) Git / gouvernance de nettoyage
### Recommandation de process
1. Créer une branche `chore/workspace-cleanup`.
2. Supprimer d’abord les éléments “à coup sûr” (`public/index.html`, `public/tiles_test`).
3. Valider `npm run build` + smoke test en jeu.
4. Déplacer legacy dans `archive/` local (non push).
5. Supprimer legacy du repo en commit dédié.
6. Ajouter une page `docs/cleanup-log.md` avec décisions et dates.

## 11) Conclusion
- Le projet actif est mature et dépasse clairement les protos.
- Un nettoyage contrôlé peut **réduire fortement le bruit** repo et accélérer l’onboarding.
- Les suppressions les plus sûres sont déjà identifiées; le reste doit suivre un cycle “archive local -> validation -> suppression repo”.
