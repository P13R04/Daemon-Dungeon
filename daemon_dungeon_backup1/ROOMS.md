# Système de Salles Chaînées (Daemon Dungeon)

Ce document décrit le fonctionnement du système de **salles qui s'enchaînent physiquement** avec **presets** et **bonus entre les salles**.

## Objectifs
- Progression **linéaire** dans des salles rectangulaires visibles en **3D isométrique**.
- **Caméra** qui se déplace **sur l'axe Z uniquement** pour garder une vue de biais et toute la largeur visible.
  - **Porte d'entrée** (côté proche, décorative) et **porte de sortie** (mur éloigné, s'ouvre quand la salle est vide).
  - Passage par la porte de sortie → **choix de 3 bonus** → **transition caméra** vers la salle suivante.
- **Présentations de mobs** prédéfinies via **presets** (nombre d'ennemis fixé par preset).
- **Difficulté** qui **augmente** avec les rounds (PV/Dégâts des ennemis), **sans augmenter le nombre** d'ennemis (sauf via presets spécifiques).
- **Hazards** (pics, trous) et **obstacles** (piliers) possibles dans la salle.

## Vue d'ensemble technique

### 1) Organisation des salles
- Chaque salle a un **origin** en coordonnées monde: `(0, 0, -index * ROOM_SPACING)`.
- La salle est composée de:
  - **Ground** (`ROOM_WIDTH x ROOM_DEPTH`)
  - **Murs** gauche, droite, **mur éloigné** (côté proche ouvert pour voir la scène)
  - **Obstacles** (AABB) qui bloquent le passage (piliers)
  - **Hazards** (zones de dégâts avec cooldown)
  - **Enemies** (positions précises)
  - **Porte** (côté proche, s'ouvre quand la salle est vide)

### 2) Mouvement et caméra
- **Caméra isométrique façon Hades** via `ArcRotateCamera` (alpha ~ 45°, beta ~ 57°, radius ~ 70). La caméra **cible** le `origin` de la salle et **ne se déplace que** par changement de target **sur l'axe Z**.
- Le **joueur** spawn côté proche: `origin + (0, y, ROOM_DEPTH/2 - 5)`.
- Les mouvements sont **bornés par la salle**: `x ∈ [origin.x-ROOM_WIDTH/2, origin.x+ROOM_WIDTH/2]` et `z ∈ [origin.z-ROOM_DEPTH/2, origin.z+ROOM_DEPTH/2]`.

### 3) Progression et bonus
- Quand tous les ennemis sont **morts**, on **instancie la porte de sortie** (mesh émissif) au **mur éloigné**.
- Si le joueur **s'approche** de la porte (<3 unités), on affiche l'**overlay Bonus**.
- Le joueur choisit **1 bonus parmi 3**; on applique le bonus puis on charge la **salle suivante**.
 - **Transition**: la caméra interpole sa cible de la salle actuelle vers la suivante (0.6s).
 - La **salle précédente** reste chargée pour un fondu naturel; **fog curtain** empêche de voir les mobs des salles à venir.

### 4) Difficulté dynamique
- `scale = 1 + index * 0.15`.
- À l'instanciation des ennemis:
  - `hp = ENEMY_HP * scale`
  - `damage = 12 * scale`
  - `speed` reste stable (ou ajuste finement selon besoin).

### 5) Presets de salle
Un **preset** est un objet JSON-like:
```js
{
  name: 'Basic Square',
  enemies: [ { pos: [x, z], type: 'melee' }, ... ],
  obstacles: [ { kind: 'pillar', pos: [x, z], size: [w, h, d], color: '#333' }, ... ],
  hazards: [ { kind: 'spike', pos: [x, z], size: [w, h, d], damage: 10 }, ... ]
}
```
- **pos** est relatif au **origin** de la salle.
- **type** est prévu pour étendre (melee, ranged, boss...).

### 6) Tiles et textures
### 7) Collisions obstacles (piliers)
- Obstacles ont une AABB; le mouvement du joueur est **rejeté** s'il entre dans l'AABB (résolution axe par axe X/Z).
- Ajuster `size` pour des **poteaux**, **pics**, **trous**; les `hazards` appliquent des **dégâts** avec cooldown.
- **Direction artistique**: Low-Poly + **Flat Shading** → éviter les textures lourdes.
- Si besoin de **tiles/seamless**:
  - Utiliser des **textures unies** avec **seamless simple**.
  - Répéter un **pattern géométrique** (lignes, grille légère) en **UVs simples**.
  - Garder des **couleurs néon** et ajouter un `GlowLayer` pour le style glitché.

## API de code (extrait)

- `RoomManager.createRoomStructure(index)` → construit ground + murs de la salle `index`.
- `RoomManager.loadPreset(index, preset, scale, game)` → obstacles, hazards, enemies.
- `RoomManager.openDoor(index)` → instancie la porte (mesh) côté proche.
- `game.loadRandomRoom(index)` → choisit un preset, charge la salle, place la caméra et le joueur.
- `game.showBonusSelection()` → UI sélection bonus.
- `game.advanceRoom()` → applique le bonus et enchaîne la salle suivante.

## Ajouter vos propres presets
1. Ouvrez `game.js` et ajoutez un objet dans `ROOM_PRESETS`.
2. Placez vos `enemies`, `obstacles`, `hazards` aux coordonnées souhaitées.
3. Les **layouts spéciaux** (plus d'ennemis, patterns, boss) peuvent être limités à certains `index` (ex: apparaître seulement toutes les 5 salles).

## Bonnes pratiques
- Gardez des **AABB** simples pour obstacles/hazards.
- Évitez d'augmenter trop la **géométrie** (nettoyer si needed, ou limiter nombre de salles visibles).
- Testez les **positions** dans un playground Babylon (playground.babylonjs.com).

---
Ce système est **modulaire** et prêt pour étendre: types d'ennemis, projectiles spéciaux, boss, events du Daemon, etc.
