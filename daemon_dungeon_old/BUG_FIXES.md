# Corrections de Bugs - Daemon Dungeon

## 🐛 Bug #1: Musique ne se lance pas

### Diagnostic
La fonction `setupMusic()` était définie mais **jamais appelée** dans le flux de démarrage du jeu.

**Avant**: 
```javascript
async startGame(selectedClass) {
    ...
    await this.createPlayer();
    this.unlockAudio(true);
    this.setMusicMuffled(false);
    // ❌ setupMusic() manquant!
```

### Correction
Ajout de l'appel à `setupMusic()` après la création du joueur:

**Après**:
```javascript
async startGame(selectedClass) {
    ...
    await this.createPlayer();
    this.setupMusic();  // ✅ Nouveau!
    this.unlockAudio(true);
    this.setMusicMuffled(false);
```

### Impact
- ✅ Musique sera initialisée lors du démarrage du jeu
- ✅ Audio graph configuré correctement
- ✅ Musique pourra être jouée avec `unlockAudio(true)`

---

## 🐛 Bug #2: Changement de classe fait crasher le jeu

### Diagnostic
Quand on cliquait sur une classe après avoir joué une partie et voir le Game Over, le code ne nettoyait pas complètement le joueur précédent avant d'en créer un nouveau.

Problèmes:
1. Le maillage (mesh) du joueur précédent restait en mémoire
2. Le système de particules (trail) n'était pas arrêté/disposé
3. Les références orphelines causaient des crashes lors de la création d'un nouveau joueur

**Avant**:
```javascript
function createPlayer(game) {
    return new Promise((resolve) => {
        // Nettoie seulement les sweeps, pas le player existant!
        if (game.sweeps) {
            game.sweeps.forEach(...);
        }
        // ❌ Aucun nettoyage de game.player
```

### Correction
Ajout du nettoyage complet du joueur avant création du nouveau:

**Après**:
```javascript
function createPlayer(game) {
    return new Promise((resolve) => {
        // ✅ Clean up existing player if any
        if (game.player && game.player.mesh) {
            try {
                game.player.mesh.dispose();
            } catch (e) {}
        }
        if (game.player && game.player.trail) {
            try {
                game.player.trail.stop();
                game.player.trail.dispose();
            } catch (e) {}
        }
        game.player = null;  // ✅ Réinitialiser complètement

        // Then clear sweeps
        if (game.sweeps) {
            game.sweeps.forEach(...);
        }
```

### Impact
- ✅ Maillage du joueur précédent disposé correctement
- ✅ Système de particules arrêté et nettoyé
- ✅ Pas de fuite mémoire entre les parties
- ✅ Changement de classe sans crash

---

## 📋 Fichiers Modifiés

1. **game.js** (ligne ~467)
   - Ajout `this.setupMusic();` dans `startGame()`

2. **src/entities/player.js** (ligne ~14)
   - Ajout cleanup du joueur existant dans `createPlayer()`

---

## ✅ Tests de Validation

- [ ] Démarrer le jeu → Musique se lance 🎵
- [ ] Jouer une partie complète
- [ ] Game Over → Cliquer sur une classe
- [ ] Vérifier pas de crash lors du changement de classe
- [ ] Jouer une 2ème partie sans problème
- [ ] Console: Pas d'erreurs WebGL ou audio

---

## 🔧 Notes d'Implémentation

### Sécurité des Corrections

Toutes les opérations de `dispose()` sont entourées de `try/catch` pour éviter les crashs si un objet est déjà disposé ou invalide.

```javascript
if (game.player && game.player.mesh) {
    try {
        game.player.mesh.dispose();
    } catch (e) {}  // Silencieux si déjà disposé
}
```

### Ordre des Appels dans startGame()

```
1. this.selectedClass = selectedClass;          // Set class
2. window.DungeonUI?.start?.hideStartScreen?.(); // Hide UI
3. this.createScene();                          // Create scene
4. await this.createPlayer();                   // Create player (avec cleanup)
5. this.setupMusic();           ← NOUVEAU      // Setup audio
6. this.unlockAudio(true);                      // Unlock audio
7. this.setMusicMuffled(false);                 // Unmute
8. ... Rest of startup
```

L'ordre est critique: l'audio doit être setup avant d'être unlocked.

---

## 🎯 Prochaines Vérifications

1. Tester sur différents navigateurs
2. Vérifier les logs de console en F12
3. Monitorer la mémoire lors de changements de classe répétés
4. S'assurer que les autres sons (SFX) fonctionnent aussi
