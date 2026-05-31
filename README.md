# Daemon Dungeon

> Welcome to the simulation.

**Daemon Dungeon** est un rogue-like 3D isométrique (Babylon.js + TypeScript) réalisé pour **Games on Web 2026 – IA Edition**.
Le joueur affronte un système corrompu dirigé par le **Daemon**, narrateur antagoniste qui commente la run en direct.

## Jouer
Le jeu est disponible en ligne sur itch: [rolling2k.itch.io/daemon-dungeon](https://rolling2k.itch.io/daemon-dungeon).  
Le code source est disponible sur:
- Repo personnel: [P13R04/Daemon-Dungeon](https://github.com/P13R04/Daemon-Dungeon)
- Repo officiel concours: [gamesonweb/ia-edition-daemon-dungeon](https://github.com/gamesonweb/ia-edition-daemon-dungeon)

Note importante:
- La version web (itch) peut avoir des difficultés de chargement, et il arrive que la page plante selon le contexte de charge.
- Nous n’avons pas encore isolé une cause unique (taille du build, contraintes navigateur, charge simultanée, etc.) malgré plusieurs passes d’optimisation.
- La meilleure expérience reste le lancement en local.
- En local, quelques crashs rares subsistent encore (cause non totalement identifiée, possiblement liée à des scénarios d’accumulation mémoire). L’optimisation/stabilisation reste un axe d’amélioration.
- Hors ces crashs rares, le jeu est globalement fluide sur des PC moyens.
- Sur mobile, c’est plus juste mais jouable.
- Choix assumé pour l’expérience utilisateur: privilégier la constance du feeling gameplay (avec possibles chutes de FPS ponctuelles) plutôt qu’un ralentissement global du jeu.

## Expérience de jeu
Une run commence par le choix d’une classe (`Wizard Installer`, `Firewall`, `Glitch`), puis enchaîne des salles dont la difficulté monte progressivement. Entre deux combats, le joueur ajuste sa construction via les bonus, les rerolls, les soins, et les achats rares.

Le système de combat repose sur une base commune facile à lire: attaque principale, stance maintenue, attaque secondaire déclenchée depuis la stance, et ultimate en pic de puissance. Cette structure permet de garder une bonne lisibilité tout en offrant un vrai espace de maîtrise.

Nous avons volontairement évité une méta-progression lourde. Le choix est assumé: un jeu **arcade/runner** où l’on lance une run immédiatement, sans phase de grind obligatoire. Le plaisir vient de la rejouabilité, de la variété des runs, de la chasse au score, de la progression codex et des achievements.

## Pourquoi le thème IA est respecté
Le thème n’est pas seulement visuel. Le **Daemon** agit comme une vraie entité de jeu grâce au Director AI: il intervient selon le contexte, le rythme de la run et la progression du joueur. L’intro Takeover pose clairement ce rapport de domination, puis tout l’univers (lexique, interfaces, codex, feedbacks) prolonge cette logique de simulation hors de contrôle.

## Jouabilité et supports
La version recommandée est **clavier + souris**.  
Le jeu reste praticable en clavier seul via l’auto-aim, et jouable sur téléphone grâce au joystick virtuel, mais avec un confort moindre sur les longues sessions.

Le jeu supporte les usages **AZERTY** et **QWERTY** via remapping des touches dans les paramètres, afin de rester testable pour un jury international.

Sur le plan technique, le projet s’appuie sur Babylon.js + TypeScript, Havok en WASM, une architecture événementielle modulaire, et des comportements ennemis basés notamment sur A* et des stratégies de steering/prédiction.

## Documentation
Pour le jury, toute la documentation finale est centralisée dans [DOSSIER_RENDU_FINAL](DOSSIER_RENDU_FINAL): document de conception (référence du 15/05/2026), guide de gameplay et making-of final.

## Vidéos gameplay
- Premier lancement (intro + tutoriel): [youtu.be/4dlZoZ2nbrA](https://youtu.be/4dlZoZ2nbrA)
- Gameplay run mage (Wizard Installer): [youtu.be/fB6Nkec43bk](https://youtu.be/fB6Nkec43bk)
- Gameplay run tank (Firewall): [youtu.be/aRicpye42Mg](https://youtu.be/aRicpye42Mg)
- Gameplay run rogue (Glitch): [youtu.be/aD8-6f1Jxew](https://youtu.be/aD8-6f1Jxew)
- Exploration des menus: [youtu.be/xiQRTB9KSlw](https://youtu.be/xiQRTB9KSlw)
- Interactions cachées / easter eggs: documentées dans le README et le making-of (pas de vidéo dédiée).

## Interactions cachées et clins d'œil
- Cliquer sur l’avatar du Daemon dans l’écran titre change ses émotions.
- Références intégrées dans l’intro: `Buffa` et `All your base are belong to us`.
- Classe cachée en local/debug: un chat “god mode”.
- Interactions tutoriel:
  - tomber plusieurs fois dans le vide de la première salle,
  - mourir sur les pièges (pics, poison),
  - pour déclencher des réactions spéciales du Daemon.

## Équipe
- **Pierre Constantin** — Master Informatique (Université Côte d’Azur, Nice/Valrose), futur parcours IHM. Programmeur principal, vision artistique globale, gestion de projet, répartition des tâches, Director AI et architecture gameplay.
- **Baptiste Giacchero** — Master Informatique (Université Côte d’Azur, Nice/Valrose), futur parcours IHM. A appris Blender depuis zéro et a modélisé tous les modèles 3D + animations à la main, testeur principal, lead équilibrage (joueur/mobs/scaling), level designer (rooms).
- **Vlad Vasiliev** — ancien double licence maths-info à Valrose, puis école d’ingénieur à Mulhouse. Responsable CI/CD, hébergement initial, design de la page itch.io, designer sonore (recherche et branchement des SFX), support transversal.

Contexte commun:
- Rencontre initiale en double licence maths-info à Valrose (Nice).

## Lancer en local
Prérequis:
- Node.js 18+

Installation:
```bash
npm install
```

Développement:
```bash
npm run dev
```
Puis ouvrir l’URL de développement du projet:
- `http://localhost:3000`

Build local (proche prod):
```bash
npm run build
npm run preview
```

Utilitaires de test local:
- Une **dev console** est activable depuis les paramètres en environnement local/dev.
- Elle permet notamment d’accélérer les tests gameplay et de valider rapidement des parcours.
- Le mode “cat / god mode” est un outil de debug local, non destiné à l’expérience joueur finale.
