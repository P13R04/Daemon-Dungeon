# Daemon Dungeon - Guide de Test

## 📋 Instructions pour Tester le Projet

### Option 1: Utiliser Python (Recommandé - Windows)
```powershell
cd "c:\Users\Pierre Constantin\Desktop\daemon_dungeon"
python -m http.server 8000
```

Puis ouvrir: **http://localhost:8000**

### Option 2: Utiliser Node.js + Live Server
Si vous avez Node.js installé:
```powershell
npm install -g live-server
cd "c:\Users\Pierre Constantin\Desktop\daemon_dungeon"
live-server
```

### Option 3: VS Code Live Server Extension
1. Installer l'extension "Live Server" (Ritwick Dey)
2. Clique droit sur `index.html` → "Open with Live Server"

---

## 🎮 Contrôles

### Clavier (PC)
- **ZQSD** : Se déplacer
- **Flèches** : Alternative pour se déplacer
- **ESPACE** : Déclencher l'ultime

### Tactile (Mobile)
- **Joystick virtuel** (coin bas-gauche) : Se déplacer
- **Toucher l'écran** : Déclencher l'ultime

---

## ✅ Checklist MVP

- [x] Scène Babylon.js avec vue isométrique
- [x] Contrôles ZQSD + Joystick virtuel
- [x] Spawning d'ennemis automatique
- [x] Système de vagues
- [x] Auto-aim et tir (Mage)
- [x] Dégâts et mort
- [x] HUD basique (HP, Niveau, Vague)
- [x] Écran de démarrage avec sélection de classe
- [x] Écran de Game Over
- [x] Messages du Daemon
- [x] Glow effects néon
- [x] Responsive (PC + Mobile)

---

## 🚀 Prochaines Étapes Recommandées (Semaines 1-3)

### Phase 1: Polish de Base
1. **Animations** : Importer un modèle Mixamo pour le joueur
2. **Particules** : Ajouter des effets de "destruction" (voxels)
3. **Audio** : Ajouter des SFX simples (Freesound.org)
4. **Équilibrage** : Ajuster vitesses, dégâts, cooldowns

### Phase 2: Mécaniques de Classe
- Implémenter les ultimes spécifiques (Chevalier, Voleur)
- Différencier les attaques par classe
- Ajouter des passifs

### Phase 3: Progression
- Système de bonus (3 cartes par salle)
- Sauvegarde du meilleur score
- Augmentation progressive de la difficulté

---

## 🐛 Troubleshooting

### Le jeu ne se charge pas
- Vérifier que le serveur http est actif
- Vérifier la console du navigateur (F12)
- Vérifier que Babylon.js CDN est accessible

### Le joystick n'apparaît pas
- C'est normal si vous testez sur PC
- Le joystick ne s'affiche que sur mobile

### Performance basse
- Réduire la résolution de la scène
- Diminuer le nombre d'ennemis (CONFIG.ENEMIES_PER_WAVE)
- Vérifier les FPS en bas-à-gauche de Babylon Sandbox

---

## 📁 Structure du Projet

```
daemon_dungeon/
├── index.html          # Structure HTML principale
├── styles.css          # UI et animations
├── game.js             # Logique de jeu (Babylon.js)
└── README.md           # Document de design
```

---

## 💡 Tips Développement

1. **Déboguer:** Utilisez `console.log()` pour tracer la logique
2. **Babylon Sandbox:** Testez les mailles 3D isolées sur https://playground.babylonjs.com
3. **Performance:** Vérifier `CONFIG.TARGET_FPS` en bas de l'écran
4. **Git:** Commitez régulièrement votre progress!

---

Bon développement! 🚀
