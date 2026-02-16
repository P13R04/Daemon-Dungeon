# Tile System - Documentation Finale de l'Implémentation

## Vue d'ensemble

Le système de tiles intègre l'éditeur `tiles_mapping` au jeu Babylon.js avec un système d'adjacence automatique qui sélectionne les bonnes textures en fonction des voisins de chaque tile.

## Architecture

### Composants principaux

1. **TileSystem.ts** - Moteur de rendu avec logique d'adjacence
2. **TileFloorManager.ts** - Gestionnaire de tiles par room avec origin awareness
3. **RoomLayoutParser.ts** - Convertisseur ASCII/JSON vers TileData
4. **RoomManager.ts** - Gestion des salles et zones marchables
5. **GameManager.ts** - Orchestration et hazards gameplay

### Éditeur de tiles

- **tiles_mapping/** - Éditeur visuel standalone
- Export JSON compatible avec le jeu via `exportGameJSON()`
- Outil pilier pour obstacles
- Aperçu des adjacences en temps réel

## Solution de Mapping Coordonnées

### Le Problème

**Éditeur tiles_mapping :**
- Système 2D avec Y qui augmente vers le bas
- North = y - 1 (vers le haut de l'écran)
- South = y + 1 (vers le bas de l'écran)

**Babylon.js :**
- Système 3D avec Z dans l'axe de profondeur
- Caméra observant depuis le dessus
- Axes ne correspondent pas 1:1 avec l'éditeur

### La Solution ✅

**Inversion des adjacences Nord/Sud dans TileSystem.ts :**

```typescript
private getAdjacencies(x: number, z: number, grid: Map<string, TileData>) {
  return {
    n: grid.get(this.getTileKey(x, z + 1)) || null, // ⚠️ Inversé
    s: grid.get(this.getTileKey(x, z - 1)) || null, // ⚠️ Inversé
    e: grid.get(this.getTileKey(x + 1, z)) || null,
    w: grid.get(this.getTileKey(x - 1, z)) || null,
    ne: grid.get(this.getTileKey(x + 1, z + 1)) || null,
    nw: grid.get(this.getTileKey(x - 1, z + 1)) || null,
    se: grid.get(this.getTileKey(x + 1, z - 1)) || null,
    sw: grid.get(this.getTileKey(x - 1, z - 1)) || null,
  };
}
```

**Configuration texture :**
```typescript
texture.uScale = 1;  // Pas de flip horizontal
texture.vScale = 1;  // Pas de flip vertical
rotationOffsetDegrees = 0;  // Pas d'offset de rotation
```

**Pourquoi ça marche :**
- L'éditeur génère les rotations pour Nord = y-1
- En inversant Nord/Sud dans les adjacences, on adapte au système de coordonnées Babylon
- Les textures restent inchangées et les rotations s'appliquent correctement

## Système d'Adjacence

### Priorités de matching

```
Wall/Pillar > Poison > Spikes > Void > Floor
```

Les murs bloquants (`wall`, `pillar`) matchent ensemble pour les transitions visuelles.

### Types de tiles supportés

- **floor** - Sol de base + variantes
- **wall** - Murs 3D (non rendus en 2D)
- **pillar** - Obstacles bloquants
- **poison** - Hazard avec DPS (6/s)
- **void** - Chute mortelle instantanée
- **spikes** - Hazard avec DPS (10/s)

### Algorithme de sélection

```typescript
1. Calculer masque d'adjacence (n/e/s/w = bits 1/2/4/8)
2. Calculer masque diagonal (nw/ne/se/sw = bits 1/2/4/8)
3. Déterminer catégorie : côté, coin, intérieur, isolé
4. Sélectionner texture appropriée
5. Calculer rotation basée sur le masque
```

## Hazards et Gameplay

### Configuration (gameplay.json)

```json
"tileHazards": {
  "poisonDps": 6,
  "spikesDps": 10
}
```

### Comportements

- **Poison/Spikes** : DPS appliqué chaque frame si le joueur est sur la tile
- **Void** : Mort instantanée (resetToSpawn)
- **Wall/Pillar** : Non marchable, collision
- **Floor** : Marchable, pas d'effet

### Vérification position

```typescript
const worldPos = player.position;
const tileType = this.tileFloorManager.getTileTypeAtWorld(worldPos.x, worldPos.z);
```

## Salles de Test

### room_test_json

Salle 20x20 basée sur `room_test.json` de l'éditeur :
- Bordure void (VVVVVV)
- Murs intérieurs (##)
- Croix poison centrale (PPPP)
- Patches void internes (VV)
- Piliers sphériques
- Transitions automatiques

### room_test_tiles_hazards

Test de tous les hazards :
- Zone poison continue
- Zone spikes
- Patchs void
- Transitions variées

### room_test_tiles_maze

Labyrinthe avec bords void et circuits complexes.

## Rendu Visuel

### Textures pixel-perfect

```typescript
texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
```

Évite le flou sur les textures de faible résolution.

### Cache de textures

Un cache global stocke les textures pour réutilisation :
```typescript
private textureCache: TextureCache = {};
```

### Meshes par tile

Chaque tile a son propre mesh `CreateGround` avec :
- Position world-space basée sur origin de la room
- Rotation Y calculée depuis le masque d'adjacence
- Material avec texture appropriée
- Taille configurable (défaut : 1 unité)

## Multi-Room Support

### Origin awareness

Chaque room a son propre origin :
```typescript
setOrigin(origin: Vector3): void {
  this.origin = origin.clone();
}
```

Les tiles sont positionnés relativement à cet origin.

### Queries world-space

```typescript
getTileTypeAtWorld(worldX: number, worldZ: number): TileType | null
isWalkableWorld(worldX: number, worldZ: number): boolean
```

Permet de requêter les tiles depuis n'importe quel point du monde.

## Intégration Game Loop

### Chargement d'une room

```typescript
async loadTilesForRoom(roomKey: string): Promise<void> {
  const origin = this.roomManager.getCurrentRoomOrigin();
  this.tileFloorManager.setOrigin(origin);
  
  const layout = /* ... parse layout ... */;
  await this.tileFloorManager.loadRoomFloor(layout);
  
  this.roomManager.setFloorRenderingEnabled(false); // Disable placeholder floor
}
```

### Update loop

```typescript
private applyHazardDamage(deltaTime: number): void {
  const tileType = this.tileFloorManager.getTileTypeAtWorld(x, z);
  
  if (tileType === 'void') {
    // Instant death
    this.resetToSpawn();
  } else if (tileType === 'poison') {
    // Poison DPS
    this.playerController.takeDamage(poisonDps * deltaTime);
  } else if (tileType === 'spikes') {
    // Spikes DPS
    this.playerController.takeDamage(spikesDps * deltaTime);
  }
}
```

## Workflow Création de Salles

### 1. Design dans tiles_mapping

- Ouvrir `tiles_mapping/index.html`
- Dessiner la salle avec les outils
- Utiliser pilier pour obstacles
- Vérifier les adjacences visuellement

### 2. Export JSON

```javascript
// Dans la console du navigateur
exportGameJSON()
```

Copie le JSON compatible jeu dans le clipboard.

### 3. Import dans le jeu

**Option A - DevConsole :**
```typescript
window.gameManager.loadRoomFromTileMappingJson(jsonData)
```

**Option B - Fichier rooms.json :**
```json
{
  "room_custom": {
    "layout": [
      "VVVVVVVV",
      "V......V",
      "V.##.P.V",
      // ...
    ],
    "spawn": { "x": 5, "z": 5 },
    "obstacles": [
      { "x": 10, "z": 8, "type": "pillar" }
    ]
  }
}
```

### 4. Test

```typescript
window.gameManager.loadRoom('room_custom')
```

## Tâches Restantes

### Priorité Haute

- [ ] **Hitbox murs** - Ajouter collisions physiques sur wall/pillar tiles
- [ ] **Void transparency** - Effet de chute visuel avec transparence
- [ ] **Wall rendering 3D** - Rendu des murs en géométrie 3D

### Priorité Moyenne

- [ ] **Spawn ennemis** - Intégration avec le système d'ennemis sur tiles spécifiques
- [ ] **Obstacles variés** - Support de types d'obstacles multiples (crates, statues, etc.)
- [ ] **Transitions rooms** - Gestion des portes et transitions entre salles tiled
- [ ] **Pathfinding** - Adapter le système de navigation AI aux tiles

### Priorité Basse

- [ ] **Généralisation** - Convertir toutes les salles existantes au système de tiles
- [ ] **Animated tiles** - Support de tiles animées (lave, eau, etc.)
- [ ] **Tile events** - Système d'événements scriptés sur certaines tiles
- [ ] **Lighting per tile** - Éclairage différencié par type de tile

## Debugging

### DevConsole commands

```typescript
// Charger une room custom
window.gameManager.loadRoom('room_test_json')

// Charger depuis JSON editor
window.gameManager.loadRoomFromTileMappingJson(jsonData)

// Vérifier tile sous le joueur
const pos = window.gameManager.playerController.playerEntity.position;
const tile = window.gameManager.tileFloorManager.getTileTypeAtWorld(pos.x, pos.z);
console.log('Current tile:', tile);

// Toggle tile rendering
window.gameManager.tilesEnabled = false/true;
```

### Vérification visuelle

- Les circuits bleus/roses doivent former des lignes continues
- Les coins doivent être arrondis correctement
- Les transitions poison/floor doivent être fluides
- Les piliers doivent être visibles en 3D

## Performance

### Optimisations actuelles

- Cache de textures global
- Meshes réutilisés (pas recréés à chaque update)
- Queries O(1) via Map avec clés x,z
- Update minimal (région 5x5 autour des changements)

### Améliorations futures

- Instancing pour tiles identiques
- Frustum culling pour grandes salles
- LOD system pour tiles distants
- Merge meshes pour réduire draw calls

## Lessons Learned

### Coordination systèmes de coordonnées

Le challenge principal était l'adaptation entre :
- L'éditeur 2D (Y vers le bas)
- Babylon 3D (Z en profondeur, vue de dessus)

**Solution :** Inverser les adjacences N/S au lieu de transformer les textures.

### Rotations et flips

Éviter les transformations de texture (uScale/vScale négatifs) qui affectent aussi les rotations. Préférer adapter la logique d'adjacence.

### Testing

Les salles de test avec patterns variés (circuits, coins, diagonales) sont essentielles pour valider l'algorithme d'adjacence.

## Références

- **tiles_mapping/script.js** - Algorithme d'adjacence original
- **TILE_SYSTEM_ARCHITECTURE.md** - Architecture détaillée
- **TILE_SYSTEM_GUIDE.md** - Guide d'utilisation éditeur
- **room_test.json** - Exemple de salle complexe

---

**Status:** ✅ Système fonctionnel avec orientation correcte  
**Version:** 1.0 (Février 2026)  
**Auteur:** GitHub Copilot
