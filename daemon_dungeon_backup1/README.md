# ⚔️ DAEMON DUNGEON - Project Design Document

**Pitch :** Un Roguelite Arcade en 3D isométrique où le joueur incarne un programme tentant de survivre à une simulation de donjon médiéval "glitché", contrôlée par une IA malveillante.
**Type :** Archero-like / Dungeon Crawler infini.
**Contexte :** Projet Étudiant (5 mois) - Équipe de 3.

---

## 🛠️ 1. Contraintes & Stack Technique (HARD REQUIREMENTS)

Ce projet doit respecter strictement les contraintes suivantes :

* **Plateforme :** Navigateur Web (Chrome/Firefox/Safari/Edge).
* **Moteur 3D :** **Babylon.js** (Version latest).
    * *Interdiction d'utiliser des moteurs physiques lourds externes (Ammo/Cannon) sauf si inclus nativement.*
    * *Interdiction d'utiliser Three.js ou Unity WebGL.*
* **Compatibilité :** **Cross-Platform PC & Mobile**.
    * Le jeu doit être jouable au tactile (Smartphone) et Clavier/Souris (PC).
    * Performance cible : 60 FPS constants (Low Poly obligatoire).
* **Outils de Dev :** VS Code, GitHub, Copilot (Aide au code), Mixamo (Animation), IA Générative (Assets 2D/UI seulement).

---

## 🎨 2. Direction Artistique (DA) : "Diegetic Glitch"

L'univers est une simulation informatique instable qui tente de recréer de la Fantasy.

* **Style Visuel :** Low Poly, Flat Shading (pas de textures complexes), Couleurs Néons sur fond sombre.
* **Ambiance :** Mélange Pierre Médiévale / Circuits Imprimés.
* **VFX (Effets) :**
    * Pas de sang → Des pixels/voxels qui tombent.
    * Brouillard de guerre → "Static Noise" (neige TV) ou Code Matrix.
    * Lumière → Utilisation intensive de la `GlowLayer` de Babylon.js.
* **Pipeline Assets (Stratégie "No-Artist") :**
    * **Modèles 3D :** Utilisation de packs gratuits (Kenney, Quaternius).
    * **Animations :** Rigging et Animation via **Mixamo** (Adobe).
    * **UI :** Icônes générées par IA (Midjourney/DALL-E) style "Vector Flat".

---

## 🎮 3. Gameplay Mechanics

### A. La Boucle de Jeu (Core Loop)
1.  **Spawn** dans une salle fermée (carrée).
2.  **Combat :** Vagues d'ennemis apparaissent.
3.  **Victoire :** La porte s'ouvre, choix d'un **Bonus (Upgrade)** parmi 3 cartes aléatoires.
4.  **Transition :** Le joueur avance dans la salle suivante.
5.  **Boss :** Toutes les X salles (ex: 10), un Boss apparaît.
6.  **Mort :** Game Over définitif. Score affiché. Retour au menu. Pas de progression persistante (Roguelike pur).

### B. Contrôles & Camera
* **Vue :** 3D Isométrique (Vue de dessus fixe).
* **Déplacement :**
    * *Mobile :* Joystick Virtuel (Babylon GUI).
    * *PC :* ZQSD / Flèches (Mouvement 8 directions).
* **Attaque (Auto-Aim) :**
    * Le joueur ne vise pas. Le personnage cible automatiquement l'ennemi le plus proche.
    * **Règle d'Or :** Pour la classe distance, le tir se déclenche quand le joueur **arrête de bouger** (Stop-to-shoot).
* **Ulti :** Un seul bouton d'action (Espace / Bouton Tactile) pour déclencher la compétence spéciale.

### C. Le Système de Classes (Les "Programmes")
Le joueur choisit sa classe au début de la run.

| Classe | Nom de Code | Rôle | Attaque Auto | Ulti (Active) | Passif |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mage** | `.EXE` | Distance | Projectiles (Tir à l'arrêt) | **Bandwidth Overload :** Rayon laser chargé puissant | Vitesse d'attaque augmente tant qu'on ne bouge pas. |
| **Chevalier**| `FIREWALL` | Tank / Zone | Coup large courte portée | **System Restore :** Onde de choc (Stun) + Soin | Réduction des dégâts subis (-15%). |
| **Voleur** | `GLITCH` | Hit & Run | Attaque très rapide au contact | **Runtime Error :** Invulnérabilité temporaire + téléportation sur cibles | Dash automatique vers l'ennemi (Téléportation courte). |

---

## 🤖 4. Thème & Narration : "Le Daemon"

Une IA supérieure (Le Maître du Jeu) commente la partie via des boîtes de texte ou voix synthétique.
* **Rôle :** Antagoniste passif-agressif.
* **Comportement :**
    * Si le joueur joue bien : *"Anomalie détectée. Augmentation de la difficulté."*
    * Si le joueur meurt : *"Suppression des données obsolètes. Suivant."*
    * Lors du choix des bonus : *"Mise à jour système disponible."*

---

## 📅 5. Plan d'Action (Roadmap MVP)

L'objectif est d'avoir une boucle jouable le plus vite possible.

### Phase 1 : Setup & Mouvement (Semaines 1-3)
* [ ] Initialiser le projet Babylon.js (HTML/TS).
* [ ] Mettre en place la scène (Caméra Iso, Lumières, Sol, Murs).
* [ ] Implémenter le Joystick Virtuel (Mobile) et ZQSD (PC).
* [ ] Importer le modèle 3D du **Mage (.EXE)** et le faire courir (Anim Mixamo).

### Phase 2 : Le MVP Combat (Semaines 4-8) - *Focus Classe Mage*
* [ ] Coder la logique "Auto-Aim" (Trouver l'ennemi le plus proche).
* [ ] Coder le tir de projectile quand le joueur s'arrête.
* [ ] Ajouter un ennemi simple (Cube rouge ou Squelette) qui suit le joueur.
* [ ] Gérer les collisions (Projectile touche Ennemi / Ennemi touche Joueur).
* [ ] Gérer la mort (Game Over UI).

### Phase 3 : La Boucle Roguelike (Semaines 9-12)
* [ ] Système de Salles (Génération ou Enchaînement).
* [ ] UI de choix de bonus (3 cartes aléatoires).
* [ ] Implémenter 3 bonus simples (Multishot, Vitesse Attaque, PV Max).
* [ ] Ajouter l'ennemi "Distant" (qui tire aussi).

### Phase 4 : Contenu & Polish (Semaines 13-16)
* [ ] Intégrer la classe **Chevalier (Firewall)**.
* [ ] Intégrer la classe **Voleur (Glitch)** (si temps disponible).
* [ ] Ajouter le Boss (toutes les 10 salles).
* [ ] **Juice & FX :** Particules d'explosion, `GlowLayer` néon, Screen Shake.
* [ ] Textes du Daemon (Narration).

### Phase 5 : Finalisation (Dernier mois)
* [ ] Debugging Mobile.
* [ ] Équilibrage (Dégâts/PV).
* [ ] Écran d'accueil et "High Score".