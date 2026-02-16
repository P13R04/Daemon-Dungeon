# Tile System - Lessons Learned

## 🎯 Ce qui a fonctionné

### 1. Inversion des adjacences plutôt que transformation des textures

**✅ Solution finale :**
```typescript
n: grid.get(this.getTileKey(x, z + 1))  // Nord inversé
s: grid.get(this.getTileKey(x, z - 1))  // Sud inversé
```

**Pourquoi ça marche :**
- Adapte la logique au système de coordonnées sans modifier les textures
- Les rotations restent cohérentes
- Pas d'effets de bord sur les autres axes

### 2. Port direct de l'algorithme tiles_mapping

L'algorithme d'adjacence de `tiles_mapping/script.js` a été porté quasiment à l'identique :
- `maskFrom()`, `diagMaskFrom()` - Calcul des masques binaires
- `rotationFromMask()` et variants - Conversion masque → rotation
- `solve*()` functions - Sélection de texture par catégorie

**Avantage :** L'éditeur et le jeu utilisent exactement la même logique.

### 3. Pixel-perfect rendering

```typescript
texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
```

Évite le flou sur les textures low-res et préserve les détails des circuits.

### 4. Cache de textures global

Un seul cache partagé pour toutes les tiles évite de recharger les mêmes textures.

### 5. Salles de test variées

Les test rooms avec patterns complexes (coins, circuits, diagonales) ont permis de valider rapidement chaque tentative de correction.

## ❌ Ce qui n'a PAS fonctionné

### 1. Offset de rotation global (180°)

**Tenté :**
```typescript
rotationOffsetDegrees = 180;
```

**Problème :**
- Fixait l'axe vertical mais cassait l'axe horizontal
- Créait un décalage non uniforme
- Les coins ne s'alignaient plus correctement

### 2. Flip horizontal (uScale = -1)

**Tenté :**
```typescript
texture.uScale = -1;
```

**Problème :**
- Créait un effet miroir individuel sur chaque tile
- Les rotations devenaient incorrectes
- Les circuits se brisaient

### 3. Flip vertical (vScale = -1)

**Tenté :**
```typescript
texture.vScale = -1;
```

**Problème :**
- Décalait certaines textures sur l'autre axe
- Créait des rotations non voulues
- Incompatibilité avec le système de rotation par masque

### 4. Inversion du sens de rotation

**Tenté :**
```typescript
const rotationRadians = ((180 - renderData.rotationDegrees) * Math.PI) / 180;
```

**Problème :**
- Inversait toutes les rotations
- Les coins pointaient dans les mauvaises directions
- Confusion entre perspective caméra et coordonnées

## 🧠 Insights

### Systèmes de coordonnées 2D vs 3D

**Éditeur 2D :**
- Origine top-gauche
- X → droite (positif)
- Y → bas (positif)
- Nord = y - 1 (vers le haut de l'écran)

**Babylon 3D (vue de dessus) :**
- Origine au centre
- X → droite (positif)
- Z → profondeur (positif depuis la caméra)
- Caméra regarde vers le bas (Y négatif)

**La clé :** Mapper les directions logiques (N/S/E/W) plutôt que les axes bruts (X/Y/Z).

### Rotations

Les rotations calculées dans l'éditeur sont basées sur l'axe Y 2D. Dans Babylon :
- `mesh.rotation.y` effectue une rotation autour de l'axe vertical (Y up)
- Avec la vue de dessus, cette rotation affecte les axes X et Z
- Les rotations 0°/90°/180°/270° s'appliquent dans le plan XZ

**Pas besoin d'offset** si les adjacences sont correctement mappées.

### Textures

- Éviter les transformations UV (uScale/vScale négatifs) qui interagissent avec les rotations
- Garder uScale = 1, vScale = 1 pour un comportement prévisible
- Le sampling NEAREST est crucial pour les textures pixel-art

### Testing

**Patterns à tester obligatoirement :**
1. Circuits droits (N-S, E-W)
2. Coins (4 orientations)
3. Diagonales (coins internes)
4. T-junctions (3 côtés)
5. Croix (4 côtés)
6. Isolées (0 voisin)

Si ces 6 cas sont corrects, tout le reste fonctionnera.

## 📋 Checklist pour futurs mappings

- [ ] Identifier les axes source (éditeur)
- [ ] Identifier les axes cible (engine 3D)
- [ ] Mapper les directions logiques (N/S/E/W)
- [ ] Vérifier avec un pattern en croix (+)
- [ ] Vérifier avec un pattern en L
- [ ] Tester les 4 rotations possibles
- [ ] Conserver les textures intactes (uScale=1, vScale=1)
- [ ] Éviter les offsets de rotation globaux
- [ ] Ajuster la logique d'adjacence plutôt que la présentation

## 🚫 Erreurs à éviter

1. **Ne pas** appliquer d'offset de rotation global sans comprendre pourquoi
2. **Ne pas** flipper les textures pour corriger l'orientation
3. **Ne pas** confondre perspective caméra et système de coordonnées
4. **Ne pas** modifier l'algorithme d'adjacence sans tests exhaustifs
5. **Ne pas** supposer que 2D Y = 3D Z sans vérification

## 🎓 Principes généraux

### 1. Comprendre d'abord, coder ensuite

Prendre le temps de comprendre comment les deux systèmes fonctionnent avant de tenter des corrections.

### 2. Changer une seule variable à la fois

Face à un problème d'orientation :
- Tester rotation offset seul
- Tester uScale seul
- Tester vScale seul
- Tester inversion adjacence seule

**Ne jamais combiner plusieurs changements** avant de comprendre l'effet de chacun.

### 3. Patterns de test simples

Une croix `+` et un L sont suffisants pour valider 90% des cas.

### 4. Source of truth

L'éditeur tiles_mapping est la référence visuelle. Le jeu doit reproduire exactement ce qui est vu dans l'éditeur.

### 5. Adapter la logique, pas les assets

Il est plus fiable d'adapter le code (adjacences) que les assets (textures).

## 🔮 Évolutions futures

### Multi-layer tiles

Pour des tiles superposées (sol + décoration) :
- Maintenir la même logique d'adjacence par layer
- Combiner les meshes avec Y offsets
- Réutiliser le cache de textures

### Tiles animées

Pour eau, lave, etc. :
- Utiliser AnimatedTexture de Babylon
- Conserver le même système d'adjacence
- Cache séparé pour textures animées

### Tiles procédurales

Pour variation automatique :
- Seed basé sur position (x, z)
- Sélection aléatoire parmi variantes
- Conserver les transitions cohérentes

---

**Conclusion :** La solution finale est élégante car elle n'ajoute aucune transformation artificielle. Elle se contente d'adapter la sémantique des directions (N/S/E/W) entre les deux systèmes de coordonnées.
