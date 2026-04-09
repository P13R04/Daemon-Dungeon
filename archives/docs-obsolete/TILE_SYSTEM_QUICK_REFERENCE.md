# Tile System - Référence Rapide

## La Solution du Mapping ✅

### Problème
L'éditeur tiles_mapping utilise Y vers le bas, Babylon.js utilise Z pour la profondeur avec vue de dessus.

### Solution
**Inversion Nord/Sud dans les adjacences** :
```typescript
n: grid.get(this.getTileKey(x, z + 1))  // Inversé : z + 1 au lieu de z - 1
s: grid.get(this.getTileKey(x, z - 1))  // Inversé : z - 1 au lieu de z + 1
```

**Pas de transformation texture** :
```typescript
texture.uScale = 1;  // Pas de flip
texture.vScale = 1;  // Pas de flip
rotationOffsetDegrees = 0;  // Pas d'offset
```

## Workflow Création de Salle

1. **Design** → Ouvrir `tiles_mapping/index.html`
2. **Export** → Console: `exportGameJSON()`
3. **Import** → DevConsole: `window.gameManager.loadRoomFromTileMappingJson(jsonData)`
4. **Test** → Vérifier adjacences, transitions, hazards

## Types de Tiles

| Type | Rendu | Gameplay | Hazard |
|------|-------|----------|--------|
| floor | ✅ Texture sol | Marchable | Non |
| wall | ❌ Pas de rendu 2D | Non marchable | Non |
| pillar | ❌ Mesh 3D séparé | Non marchable | Non |
| poison | ✅ Transition fluide | Marchable | 6 DPS |
| void | ✅ Texture vide | Non marchable | Mort |
| spikes | ✅ Texture danger | Marchable | 10 DPS |

## Salles de Test

- **room_test_json** - Salle 20x20 avec tous les types
- **room_test_tiles_hazards** - Test hazards complet
- **room_test_tiles_maze** - Labyrinthe complexe

## DevConsole Commands

```javascript
// Charger une room
window.gameManager.loadRoom('room_test_json')

// Import depuis editor
window.gameManager.loadRoomFromTileMappingJson(jsonData)

// Check tile sous joueur
const pos = window.gameManager.playerController.playerEntity.position;
window.gameManager.tileFloorManager.getTileTypeAtWorld(pos.x, pos.z)

// Toggle tiles
window.gameManager.tilesEnabled = false
```

## Priorités suivantes

### 🔴 Haute
- Hitbox murs/piliers
- Void transparency + falling effect
- Wall rendering 3D

### 🟡 Moyenne
- Spawn ennemis sur tiles
- Obstacles variés
- Pathfinding AI sur tiles

### 🟢 Basse
- Généraliser toutes les salles
- Animated tiles
- Tile events

## Fichiers Clés

| Fichier | Rôle |
|---------|------|
| `src/systems/TileSystem.ts` | Moteur d'adjacence + rendu |
| `src/systems/TileFloorManager.ts` | Gestionnaire par room |
| `src/systems/RoomLayoutParser.ts` | Parser ASCII/JSON |
| `src/core/GameManager.ts` | Integration gameplay |
| `tiles_mapping/script.js` | Éditeur + algorithme source |
| `src/data/config/rooms.json` | Définitions salles |
| `src/data/config/gameplay.json` | Config hazards |

## Documentation Complète

Voir `TILE_SYSTEM_FINAL_IMPLEMENTATION.md` pour :
- Architecture détaillée
- Algorithme d'adjacence
- Explications techniques
- Exemples de code
- Debugging avancé
