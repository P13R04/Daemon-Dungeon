# Système d'Animation du Joueur Mage

## Architecture

Le système d'animation du joueur mage est géré par deux composants principales:

### 1. **PlayerAnimationController** (`src/gameplay/PlayerAnimationController.ts`)
- Gère le chargement du modèle 3D `assets/models/player/mage.glb`
- Cartographie et joue les animations du modèle
- Gère les transitions entre états d'animation
- Applique les variations de vitesse pour les attaques

### 2. **PlayerController** (`src/gameplay/PlayerController.ts`)
- Détermine l'état du joueur (mouvement, attaque, ultime)
- Appelle `updateAnimationState()` chaque frame
- Intègre le contrôle du joueur avec le système d'animation

## Animations Supportées

Le modèle mage.glb contient les animations suivantes:

| Animation | Trigger | Description |
|-----------|---------|-------------|
| `Idle.001` | État par défaut | Pose de repos du mage |
| `Start_walking` | Initial du mouvement | Animation d'introduction avant la marche |
| `walking` | En mouvement | Animation de marche en boucle |
| `Attack_1` | Attaque (1/2) | Première animation d'attaque |
| `Attack_2` | Attaque (2/2) | Deuxième animation d'attaque |
| `Ultime` | Cast ultime | Animation ultime |

## Fonctionnalités

### 1. **Alternance des Attaques**
```
Les attaques alternent entre Attack_1 et Attack_2 pour moins de répétition
- Premier tir: Attack_1
- Deuxième tir: Attack_2
- Troisième tir: Attack_1
- etc...
```

### 2. **Variation de Vitesse d'Attaque**
```
Les animations d'attaque jouent à des vitesses variables (0.8x à 1.2x)
Cela rend les attaques moins monotones et plus naturelles
Séquence: [0.8x, 0.9x, 1.0x, 1.1x, 1.2x] puis boucle
```

### 3. **Priorité des Animations**
```
Ultimate > Attack > Walking > Idle

Cela signifie:
- Si l'ultime est activée → joue Ultime
- Sinon, si en attaque → joue Attack_1 or Attack_2
- Sinon, si en mouvement → joue Start_walking → walking
- Sinon → joue Idle.001

Les attaques INTERRUPTENT le mouvement
```

### 4. **Transitions Lisses**
```
- Start_walking → walking: Lance automatiquement walking après Start_walking
- Attack → précédent état: Retourne au mouvement/idle après l'attaque
- Ultime → précédent état: Retourne au mouvement/idle après l'ultime
```

## Intégration dans le Code

### Charger le Modèle
Le modèle se charge automatiquement lors de la création du PlayerController:
```typescript
const playerController = new PlayerController(scene, inputManager, config);
// Le modèle mage.glb charge en arrière-plan
// Les animations commencent après le chargement
```

### Déclencher une Animation
```typescript
// Appelé automatiquement par PlayerController à chaque frame
animationController.updateAnimationState(
  isMoving: boolean,      // Joueur se déplace
  isFiring: boolean,      // Joueur attaque (souris enfoncée)
  isUltimateActive: boolean  // Ultime en cours
);
```

### Gérer les Erreurs
Si le modèle ne charge pas:
1. Un message d'erreur apparaît dans la console
2. Un fallback (cube bleu) s'affiche à la place
3. Le gameplay continue normalement
4. Vérifier que `assets/models/player/mage.glb` existe

## Debugging

### Vérifier les Animations Disponibles
```typescript
// Dans la console navigateur
const controller = player.animationController;
console.log(controller.getAvailableAnimations());
// Affiche: ["Idle.001", "Start_walking", "walking", "Attack_1", "Attack_2", "Ultime", ...]
```

### Vérifier L'État Courant
```typescript
const currentState = controller.getCurrentState();
console.log(currentState); // "idle" | "walking" | "attacking" | "ultimate"
```

### Tester une Animation Manuelle
```javascript
// Depuis la console de dev ou un DevConsole command
player.animationController.playAnimation(AnimationState.WALKING, 1.0);
player.animationController.playAnimation(AnimationState.ATTACKING, 0.9);
```

## Consoles Logs

Le système log les informations suivantes:

```
✓ Loaded animation: Idle.001
✓ Loaded animation: Start_walking
✓ Loaded animation: walking
✓ Loaded animation: Attack_1
✓ Loaded animation: Attack_2
✓ Loaded animation: Ultime
✓ Player model loaded: player_mage, animations: 6
```

## Configuration (Future)

Pour ajuster les paramètres d'animation:

```typescript
// Dans PlayerAnimationController.ts
private readonly FADE_DURATION = 0.1;  // Durée de transition
private readonly ATTACK_SPEED_INTERVAL = 200; // Intervalle de variation
private attackSpeedVariation: number[] = [0.8, 0.9, 1.0, 1.1, 1.2];
```

## Fichiers à Modifier pour Ajouter des Animations

1. Ajouter l'animation dans le modèle mage.glb (via Blender/3DS Max)
2. S'assurer que l'AnimationGroup a le bon nom dans le fichier glb
3. Ajouter un case dans `playAnimation()` si c'est une nouvelle catégorie
4. Mettre à jour la table "Animations Supportées" ci-dessus

## Test en Jeu

1. Démarrer le serveur: `npm run dev`
2. Naviguer à `http://localhost:3001`
3. Observer les animations:
   - Au démarrage: Idle.001
   - Bouger la souris: Start_walking → walking
   - Click souris: Attack_1 ou Attack_2 (alternés, vitesse variable)
   - Espace (avec ultime chargée): Ultime

## Performance

- **Modèle**: 2.7MB (mage.glb)
- **Animations**: ~6 AnimationGroups
- **Mémoire**: Charges une fois au démarrage
- **CPU**: Impact minimal (transitions GPU)

## Notes

- Les animations doivent avoir exactement les noms spécifiés dans la table ci-dessus
- Si une animation n'existe pas, un warning apparaît dans la console
- Le système continue de fonctionner même si une animation manque (elle ne joue pas)
- Les transitions utilisent la fade-out/in (0.1s) pour fluidité visuelle
