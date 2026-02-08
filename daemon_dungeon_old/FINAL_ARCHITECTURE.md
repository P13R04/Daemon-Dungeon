# DAEMON DUNGEON - Architecture Minimale et Modulaire

## 📊 Vue d'ensemble

**Daemon Dungeon** est organisé en une architecture **modulaire ultra-minimaliste** où chaque composant a une responsabilité unique et claire.

### Fichier Principal
- **game.js** (≈450 lignes) : Classe DaemonDungeon + RoomManager + Configurations

### Tous les autres comportements sont externalisés dans des modules
- 26 modules spécialisés
- Pas de wrapper inutile
- Tous les appels passent par `window.DungeonCore.delegates`

---

## 🎯 Structure Modulaire

```
daemon_dungeon/
├── index.html
├── styles.css
├── game.js ...................... Orchestrateur minimal
│
└── src/
    ├── core/
    │   ├── gameState.js .......... État du jeu
    │   └── delegates.js .......... Tous les points d'entrée [NOUVEAU]
    │
    ├── scene/
    │   └── setup.js .............. Création scène, post-processing, vaporwave
    │
    ├── entities/
    │   └── player.js ............. Création & animations du joueur
    │
    ├── player/
    │   └── movement.js ........... Mouvement, input, cooldowns
    │
    ├── enemies/
    │   ├── targeting.js .......... Sélection & ciblage d'ennemis
    │   └── (ai/enemies.js) ....... IA ennemis générales
    │
    ├── combat/
    │   ├── ranged.js ............. Projectiles & attaques à distance
    │   ├── melee.js .............. Sweeps & attaques au sol
    │   └── boss.js ............... Abilities des boss
    │
    ├── physics/
    │   └── collision.js .......... Détection & résolution collisions
    │
    ├── logic/
    │   ├── rooms.js .............. Gestion salles, spawning
    │   ├── collisions.js ......... Orchestrateur collisions
    │   ├── damage.js ............. Système de dégâts et santé
    │   └── uiFlow.js ............. Gestion états UI
    │
    ├── audio/
    │   ├── music.js .............. Musique + audio graph
    │   └── state.js .............. État audio centralisé
    │
    ├── input/
    │   └── handlers.js ........... Gestion clavier/souris/tactile
    │
    ├── utils/
    │   └── visuals.js ............ Matériaux, shaders, utilitaires visuals
    │
    └── ui/
        ├── startScreen.js ........ Écran de démarrage
        ├── hud.js ................ Affichage HUD
        ├── bonus.js .............. Sélection bonus
        ├── gameOver.js ........... Écran game over
        ├── bossIntro.js .......... Intros boss
        ├── evilUi.js ............. Messages du système
        └── joystick.js ........... Joystick virtuel (mobile)
```

---

## 🔌 Architecture Delegates [NOUVEAU]

Fichier clé: **src/core/delegates.js** 

**Concept**: Centralise TOUS les appels de méthodes du jeu vers les modules externes.

```javascript
window.DungeonCore.delegates = {
    // Scene
    createScene,
    setupPostProcessing,
    createVaporwaveBackground,
    
    // Audio
    setupMusic,
    setMusicMuffled,
    unlockAudio,
    ...
    
    // Player
    createPlayer,
    updatePlayer,
    ...
    
    // Combat
    playerAttack,
    playerTankAttack,
    updateBossAbilities,
    ...
    
    // Enemies
    updateEnemies,
    getClosestEnemy,
    ...
    
    // Collisions & Physics
    checkCollisions,
    clampPlayerBounds,
    ...
    
    // Rooms
    loadRandomRoom,
    advanceRoom,
    ...
    
    // UI
    updateUI,
    showBonusSelection,
    ...
};
```

**Avantage**: 
- Un point d'entrée unique pour tous les modules
- Facile à déboguer (visualiser tous les appels)
- Facile d'ajouter logging/tracing
- Facile de refactoriser (changement centralisé)

---

## 🎮 Game.js - Responsabilités Minimales

**Classe DaemonDungeon** (≈350 lignes)
- ✅ Initialisation moteur Babylon.js
- ✅ Gestion boucle jeu (gameLoop)
- ✅ Gestion input (clavier, souris, tactile)
- ✅ Gestion états globaux du jeu
- ✅ Appels aux delegates
- ❌ PAS de logique de collision
- ❌ PAS de logique d'attaque
- ❌ PAS de logique audio
- ❌ PAS d'animations

**Classe RoomManager** (≈100 lignes)
- Création structure salles
- Gestion obstacles et pièges
- Gestion portes et brouillard
- **Utilitaires géométriques** (placement sans collision)

---

## 🔄 Flux d'Exécution Principal

### 1. Initialisation
```
new DaemonDungeon()
  ├─ Charge tous les scripts modules
  ├─ Attend chargement complet
  └─ UI prêt pour cliques classe
```

### 2. Démarrage d'une partie (startGame)
```
startGame(selectedClass)
  ├─ delegates.createScene()
  ├─ delegates.createPlayer()
  ├─ delegates.setupMusic()
  ├─ delegates.unlockAudio()
  ├─ delegates.setMusicMuffled()
  ├─ delegates.loadRandomRoom()
  └─ gameLoop() [démarre boucle]
```

### 3. Boucle de Jeu (60 FPS)
```
gameLoop() chaque frame:
  ├─ delegates.updatePlayer()       [Mouvement + input]
  ├─ delegates.updateEnemies()      [IA ennemis]
  ├─ delegates.updateProjectiles()  [Projectiles]
  ├─ delegates.updateMeleeEffects() [Attaques au sol]
  ├─ delegates.updateBossAbilities()[Boss abilities]
  ├─ delegates.checkCollisions()    [Détection + réaction]
  ├─ updateWaveLogic()              [Vide - prêt pour futur]
  ├─ scene.render()                 [Render Babylon.js]
  ├─ delegates.updateUI()           [HUD, messages]
  └─ engine.resize()                [Responsive]
```

---

## 📦 Modules Détaillés

### CORE
| Module | Responsabilité |
|--------|-----------------|
| `gameState.js` | État global du jeu, stats |
| `delegates.js` | Point d'entrée unique pour tous les modules |

### SCENE
| Module | Responsabilité |
|--------|-----------------|
| `setup.js` | Création scène Babylon, post-processing, vaporwave background |

### ENTITIES
| Module | Responsabilité |
|--------|-----------------|
| `player.js` | Création mesh joueur, animations programmatiques |

### PLAYER
| Module | Responsabilité |
|--------|-----------------|
| `movement.js` | Mouvement du joueur, gestion cooldowns, attaques auto |

### ENEMIES
| Module | Responsabilité |
|--------|-----------------|
| `enemies.js` (ai/) | Logique IA des ennemis (poursuite, attaques) |
| `targeting.js` | Détection ennemi le plus proche, raycast visibilité |

### COMBAT
| Module | Responsabilité |
|--------|-----------------|
| `ranged.js` | Projectiles du joueur et ennemis |
| `melee.js` | Attaques au sol (sweeps), tank attack, rogue attack |
| `boss.js` | Shockwaves, spikes temporaires, abilities boss |

### PHYSICS
| Module | Responsabilité |
|--------|-----------------|
| `collision.js` | Résolution collisions (sphere-AABB, bouncing) |

### LOGIC
| Module | Responsabilité |
|--------|-----------------|
| `rooms.js` | Chargement salles, spawning ennemis |
| `collisions.js` | Orchestrateur: projectiles vs ennemis/joueur, hazards |
| `damage.js` | Système dégâts, santé, événements de mort |
| `uiFlow.js` | Transitions états UI, messages daemon |

### AUDIO
| Module | Responsabilité |
|--------|-----------------|
| `music.js` | Gestion musique, audio graph, filtres |
| `state.js` | État centralisé audio |

### INPUT
| Module | Responsabilité |
|--------|-----------------|
| `handlers.js` | Clavier, souris, tactile, joystick |

### UTILS
| Module | Responsabilité |
|--------|-----------------|
| `visuals.js` | Matériaux Babylon, shaders, wedges, hex2rgb |

### UI
| Module | Responsabilité |
|--------|-----------------|
| `startScreen.js` | Sélection classe |
| `hud.js` | Affichage HP, score, vagues |
| `bonus.js` | Écran sélection bonus |
| `gameOver.js` | Écran défaite |
| `bossIntro.js` | Intro et cutscène boss |
| `evilUi.js` | Messages système du "daemon" |
| `joystick.js` | Joystick virtuel pour mobile |

---

## 🎯 Points Clés de l'Architecture

### 1. **Minimalisme**
- game.js contient JUSTE l'orchestration
- 0 wrapper inutile
- 0 duplication de code

### 2. **Centralisation via Delegates**
Avant:
```javascript
this.createScene();
this.updatePlayer();
this.checkCollisions();
```

Après:
```javascript
window.DungeonCore?.delegates?.createScene?.(this);
window.DungeonCore?.delegates?.updatePlayer?.(this, dt);
window.DungeonCore?.delegates?.checkCollisions?.(this);
```

**Bénéfice**: Un seul fichier à regarder pour comprendre le flux complet.

### 3. **Responsabilités Claires**
- **collisions.js** = Détection uniquement
- **damage.js** = Dégâts + santé uniquement
- **movement.js** = Mouvement + animations du joueur uniquement

Pas de chevauchement. Pas de side-effects implicites.

### 4. **Extensibilité**
Ajouter une nouvelle feature?

1. Créer `src/feature/myfeature.js`
2. Exporter fonction principale sur `window.DungeonFeature.myfunction`
3. Ajouter délégat dans `delegates.js`
4. Appeler via `window.DungeonCore?.delegates?.myfunction?.(this)`
5. **game.js jamais modifié!**

---

## 📊 Métriques

| Métrique | Valeur |
|----------|--------|
| Lignes game.js | ~450 |
| Lignes RoomManager | ~100 |
| Modules totaux | 26 |
| Wrapper/indirection | 100% externalisé |
| Complexité ciclomatique moyenne | ~3 |

---

## 🔗 Flux d'Appels Typiques

### Attaque Joueur
```
Input Event
  └─ onKeyDown() [game.js]
      └─ window.DungeonInput.handlers.onKeyDown() [input/handlers.js]
          └─ sets inputMap
                └─ delegates.updatePlayer() [player/movement.js]
                    └─ handleAutoAttack()
                        └─ delegates.playerAttack() [combat/ranged.js]
                            └─ spawnProjectile()
                                └─ delegates.updateProjectiles() [game loop]
```

### Collision Projectile -> Ennemi
```
delegates.checkCollisions() [logic/collisions.js]
  └─ checkProjectileCollisions()
      └─ delegates.damageEntity() [logic/damage.js]
          └─ enemy.hp -= damage
              └─ if (enemy.hp <= 0)
                  └─ delegates.killEntity()
                      └─ remove from enemies[]
```

---

## 🚀 Avantages de cette Architecture

1. **Testabilité**: Chaque module peut être testé isolément
2. **Maintenabilité**: Bug en collision? Regarde `collisions.js`
3. **Performance**: Pas d'overhead, appels directs
4. **Clarté**: Un seul endroit pour tous les appels
5. **Évolutivité**: Ajouter feature sans toucher game.js
6. **Debugging**: Ajouter logging en un seul lieu (delegates.js)

---

## 📝 Notes de Implementation

### Safe Chaining
Tous les appels utilisent l'optional chaining `?.` pour sécurité:
```javascript
window.DungeonCore?.delegates?.createScene?.(this);
```
Si module pas chargé, appel échoue silencieusement (pas de crash).

### Configuration Centralisée
```javascript
const CONFIG = {
    CANVAS_ID: 'gameCanvas',
    PLAYER_SPEED: 0.15,
    PLAYER_HP: 100,
    ...
};
```
Modificable facilement pour tuning gameplay.

### Input Dispatch
Tous les événements input vont vers `input/handlers.js` qui update `inputMap`.
Le mouvement lit `inputMap` chaque frame. Pattern clean et réactif.

---

## 🎬 Prochaines Évolutions

1. **Event Bus Centralisé**
   - Ajouter `core/eventBus.js`
   - Pattern observer pour couplage faible

2. **Configuration externe**
   - Créer `config/balance.json`
   - Charger au démarrage

3. **Système de Buffs/Débuffs**
   - Créer `effects/buffs.js` et `effects/debuffs.js`
   - Appels via delegates

4. **Persistance**
   - Créer `persistence/save.js` et `persistence/load.js`
   - Sauvegarde progression

5. **Logging/Telemetry**
   - Ajouter logging middleware dans delegates.js
   - Tracer tous les appels importants

---

## ✅ Checklist Refactoring Complet

- [x] Supprimer tous les wrappers de game.js
- [x] Créer delegates.js centralisé
- [x] Mettre à jour tous les appels à utiliser delegates
- [x] Vérifier pas d'erreurs ou crashes
- [x] Vérifier pas de features perdues
- [x] Compléter ce document
- [ ] Tests unitaires par module
- [ ] Performance profiling
- [ ] Documentation API modules
