# Guide de Test - Système d'Animation du Joueur

## ✅ État du Système

- **Compilation**: ✓ TypeScript compiling without errors
- **Modèle**: ✓ mage.glb présent (2.7MB)
- **Code**: ✓ Intégration complète avec PlayerController
- **Documentation**: ✓ Complète
- **Serveur**: ✓ Démarrées sur `http://localhost:3000`

## 🎬 Comment Tester les Animations

### 1. Démarrer le Serveur
```bash
npm run dev
# Le serveur démarre sur http://localhost:3000
```

### 2. Ouvrir le Jeu dans le Navigateur
```
http://localhost:3000
```

### 3. Observer les Animations (Comportements Attendus)

#### A. Au Démarrage
```
ATTENDU:
✓ Joueur visible (mage 3D ou cube bleu fallback)
✓ Pose de repos (animation Idle.001)
✓ Console logs montrant animations chargées:
  ✓ Loaded animation: Idle.001
  ✓ Loaded animation: Start_walking
  ✓ Loaded animation: walking
  ✓ Loaded animation: Attack_1
  ✓ Loaded animation: Attack_2
  ✓ Loaded animation: Ultime
  ✓ Player model loaded: player_mage, animations: 6
```

#### B. Tester la Marche
```
ACTION: Bouger la souris/curseur vers le joueur

ATTENDU:
→ Animation Start_walking joue UNE FOIS (transition douce)
→ Puis walking loope continuellement tant que le joueur se déplace
→ Vitesse de l'animation: constante (1.0x)
→ La marche s'arrête → retour à Idle.001
```

#### C. Tester les Attaques
```
ACTION: Cliquer/Maintenir la souris enfoncée

ATTENDU:
→ Animation d'attaque démarre
→ 1ère tir: Attack_1 joue à vitesse 0.8x (PLUS LENT)
→ 2e tir: Attack_2 joue à vitesse 0.9x
→ 3e tir: Attack_1 joue à vitesse 1.0x (NORMAL)
→ 4e tir: Attack_2 joue à vitesse 1.1x (PLUS RAPIDE)
→ 5e tir: Attack_1 joue à vitesse 1.2x (TRÈS RAPIDE)
→ 6e tir: Attack_2 joue à vitesse 0.8x (cycle reprend)

OBSERVATION: Chaque attaque paraît légèrement différente
            du fait de la vitesse variable et alternance Attack_1/Attack_2

PRIORITÉ: Même si en train de marcher, attaquer ARRÊTE la marche
         et joue l'attaque
```

#### D. Tester l'Ultime
```
ACTION: 
1. Attendre que l'ultime charge (à proximité d'ennemis)
2. Appuyer sur SPACEBAR quand barre ultime est pleine

ATTENDU:
→ Animation Ultime se joue
→ Elle exécute complètement (non-interruptible)
→ Dopo animation ultime: retour à Idle ou Walking selon l'état
```

## 🔍 Vérifications dans la Console Navigateur

### Ouvrir DevTools
```
F12 ou Cmd+Option+I (Mac)
```

### Vérifier que le Modèle a Chargé
```javascript
// Dans la console, taper:
console.log("Animations disponibles:")
console.log(player.animationController.getAvailableAnimations())

// Attendu:
// ["Idle.001", "Start_walking", "walking", "Attack_1", "Attack_2", "Ultime", ...]
```

### Vérifier l'État d'Animation Courant
```javascript
// Pendant le jeu, taper:
console.log(player.animationController.getCurrentState())

// Possibles réponses:
// "idle"      - Au repos
// "walking"   - En mouvement
// "attacking" - En attaque
// "ultimate"  - En ultime
```

### Forcer une Animation (pour testing)
```javascript
// Test Idle
player.animationController.playAnimation(AnimationState.IDLE)

// Test Walking
player.animationController.playAnimation(AnimationState.WALKING)

// Test Attack à vitesse normale
player.animationController.playAnimation(AnimationState.ATTACKING, 1.0)

// Test Attack à vitesse lente (0.5x)
player.animationController.playAnimation(AnimationState.ATTACKING, 0.5)
```

## 📊 Tableau de Vérification

| Comportement | Attendu | Statut |
|-------------|---------|--------|
| Chargement modèle | Visible après ~1-2s | ? |
| Idle au démarrage | Posture de repos | ? |
| Walk intro (Start_walking) | Une seule fois | ? |
| Looping walk | Repeating smoothly | ? |
| Attack alternation | Attack_1, Attack_2, Attack_1... | ? |
| Speed variation | 0.8x, 0.9x, 1.0x, 1.1x, 1.2x | ? |
| Attack preempts walk | Walk stop lors attaque | ? |
| Return to previous state | Marche/Idle après attaque | ? |
| Ultimate animation | Joue complètement | ? |
| Fallback if error | Cube bleu visible | ? |

## ⚠️ Potentiels Problèmes & Solutions

### Problème 1: "Joueur n'est pas visible"
```
Cause possible: Modèle n'a pas encore chargé
Solution: Attendre 2 secondes, vérifier console pour erreurs
          Vérifier que http://localhost:3000/assets/models/player/mage.glb répond
```

### Problème 2: "Animations ne jouent pas"
```
Cause possible:
- Noms d'animations ne correspondent pas
- Modèle n'a pas ces animations
- Erreur lors du chargement

Solution: 
Ouvrir DevTools (F12) et vérifier:
console.log(player.animationController.getAvailableAnimations())
Comparer avec les noms attendus
```

### Problème 3: "Animations jouent mais ne varient pas"
```
Cause: Les animations existent mais vitesses ne varient pas
Solution: Vérifier que les indices de vitesse changent
          (ne devrait être pas un problème si code correct)
```

### Problème 4: "Crash/Erreur TypeScript"
```
Solution: 
npm run build  # recompile
npm run dev    # redémarre
```

## 🟢 Success Criteria

Le système est **correctement implémenté** si:

✅ Le joueur est visible avec le modèle mage (ou cube fallback)  
✅ Animations Idle, Walking, Attack, Ultime jouent  
✅ Attacks alternent entre Attack_1 et Attack_2  
✅ Vitesses varient (certaines attacks plus rapides/lentes que d'autres)  
✅ Attaques interruptent la marche  
✅ Pas de crash/erreurs TypeScript  
✅ Console affiche les logs de chargement correctement  

## 📋 Checklist Finale

- [ ] Serveur démarre sans erreur
- [ ] Modèle mage charge (console logs visible)
- [ ] Joueur visible en Idle
- [ ] Marche: Start_walking → loop walking
- [ ] Attacks: alternent + varient en vitesse
- [ ] Ultimate: joue correctement
- [ ] Priorités: Attack > Walk > Idle
- [ ] Fallback works (cube bleu si glb fails)
- [ ] Pas d'erreurs TypeScript
- [ ] Console logs clairs

---

**Prochaines Étapes Après Test**:
1. Si tout fonctionne: continuer développement gameplay
2. Si problèmes: debugger en utilisant console.log
3. Potentiellement: ajuster animations ou vitesses dans PlayerAnimationController.ts

**Support**: Consulter PLAYER_ANIMATION_SYSTEM.md pour plus de détails
