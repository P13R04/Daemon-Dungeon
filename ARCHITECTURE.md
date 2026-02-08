# ARCHITECTURE — DAEMON DUNGEON

## 1) Objectif
Document de référence pour une base propre, modulable et maintenable (équipe de 3), adaptée à Babylon.js et à un déploiement web statique.

---

## 2) Principes structurants
- **Data-driven** : aucun chiffre en dur. Tout vient de JSON/TS config.
- **ECS-lite / Composition** : entités = conteneurs de composants.
- **Event Bus** : communication découplée entre systèmes.
- **UI modulaire** : chaque widget activable/désactivable.
- **Placeholder-first** : formes simples possibles à tout moment.

---

## 3) Arborescence proposée
```
/ (root)
  /public
  /src
    /core
      GameManager.ts
      StateMachine.ts
      EventBus.ts
      Time.ts
    /scene
      SceneBootstrap.ts
      Lighting.ts
      PostProcess.ts
    /entities
      Entity.ts
      EntityFactory.ts
    /components
      Transform.ts
      Health.ts
      Movement.ts
      Attack.ts
      AIController.ts
      Loot.ts
    /systems
      MovementSystem.ts
      CombatSystem.ts
      AISystem.ts
      SpawnSystem.ts
      RoomSystem.ts
      ScalingSystem.ts
    /ai
      behaviors/
      pathfinding/
      crowd/
    /combat
      patterns/
      payloads/
      modifiers/
    /ui
      HUD.ts
      EnemyHealthBars.ts
      DamageNumbers.ts
      LogsPanel.ts
      PauseMenu.ts
      DevConsole.ts
      Codex.ts
      Leaderboard.ts
    /audio
      AudioManager.ts
      MusicManager.ts
    /services
      ApiClient.ts
      AuthService.ts
      LeaderboardService.ts
      SaveService.ts
      CodexService.ts
      AchievementService.ts
    /data
      classes/
      enemies/
      rooms/
      items/
      scaling/
      achievements/
    /utils
      Math.ts
      Pool.ts
      Debug.ts
      LocalCache.ts
  /assets
    /models
    /textures
    /sounds
    /music
    /shaders
    /ui
  /docs
  /backend (separate repository recommended)
    /src
      /controllers
      /services
      /models
      /middleware
      /routes
    /config
```

---

## 4) Boucle de jeu & états
**GameManager + StateMachine**
- `BOOT` → chargement assets
- `MAIN_MENU`
- `CHARACTER_SELECT`
- `GAMEPLAY_LOOP`
- `PAUSE`
- `GAME_OVER`

Chaque état doit être isolé et remplacé sans effet de bord.

---

## 5) Systèmes runtime (ordre logique)
1. **InputSystem** → collecte input
2. **AISystem** → intention/decision
3. **MovementSystem** → déplacement physique
4. **CombatSystem** → collisions, dégâts, statuts
5. **UISystem** → lecture des events / state, rendu UI
6. **AudioSystem** → SFX/VO

**Event Bus** : tous les événements publics (dégâts, morts, rooms, bonus, narrateur).

---

## 6) Données & configs
- `data/classes/*.json`
- `data/enemies/*.json`
- `data/items/*.json`
- `data/rooms/*.json`
- `data/scaling/*.json`

**Exemples clés**
- `enemy.zombie.json` : HP, speed, behavior, drop table
- `scaling/default.json` : courbes par salle (HP, dmg, speed)

---

## 7) Room System
- Salles en **grille** (tiles).
- Présets en JSON ou ASCII.
- Chargement : salle active + 1 précédente + 2 suivantes.
- Fog of War sur salles non actives.
- Enemies activés uniquement dans la salle active.

---

## 8) Combat modulaire
**Attack = Pattern + Payload + Modifiers**
- Pattern : projectile, raycast, melee, AoE
- Payload : damage, heal, knockback
- Modifiers : stun, DoT, pierce, bounce

Les bonus modifient les attaques par injection de modifiers.

---

## 9) UI & debug
- UI en modules indépendants
- `DamageNumbers` et `EnemyHealthBars` activables
- Dev Console : sliders, cheats, export JSON, hot reload rooms

---

## 10) Assets & naming
- `enemy_zombie_fast_v01.glb`
- `vo_daemon_taunt_001.ogg`
- `sfx_ui_click_v02.wav`
- `room_preset_03.json`

Versionner chaque itération.

---

## 11) Backend & Services

### Architecture de services
**Couche `/services/` (Frontend)**
- `ApiClient.ts` : gestionnaire HTTP centralisé (fetch/axios)
- `AuthService.ts` : login, register, refresh token, logout
- `LeaderboardService.ts` : fetch/submit scores
- `SaveService.ts` : save/load run state
- `CodexService.ts` : unlock entries, fetch unlocked data
- `AchievementService.ts` : track progress, unlock achievements

**Principe d'isolation**
- Tous les services retournent des Promises
- En cas d'échec réseau, fallback sur LocalStorage/IndexedDB
- Le jeu reste 100% fonctionnel hors ligne

### API Backend (suggérée)
**Endpoints principaux**
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /user/profile
PUT    /user/profile

GET    /leaderboard?filter=daily|weekly|alltime&class=...
POST   /leaderboard/submit

GET    /save
POST   /save
DELETE /save

GET    /codex
POST   /codex/unlock

GET    /achievements
POST   /achievements/progress
```

**Sécurité**
- JWT access token (15min) + refresh token (7 jours)
- Rate limiting (express-rate-limit)
- CORS configuré pour le domaine du jeu
- Validation des payloads (zod, joi, class-validator)

### Base de données (schéma suggéré)
**Users**
- id, email, password_hash, username, created_at, last_login

**Runs (saves)**
- id, user_id, class, room_number, player_state (JSON), created_at, updated_at

**Scores**
- id, user_id, class, score, rooms_cleared, time_survived, build_summary (JSON), submitted_at

**Codex_Unlocks**
- id, user_id, entry_type (enemy/item/bonus), entry_id, unlocked_at

**Achievements**
- id, user_id, achievement_id, progress, completed, completed_at

### Synchronisation
**Pattern recommandé : Sync on Event**
- Unlock codex entry → event → CodexService.syncUnlock()
- Achievement progress → debounced sync (toutes les 30s ou sur pause)
- Run save → manuel (bouton) ou auto (entre salles)
- Score submit → fin de partie uniquement

**Cache local**
- LocalStorage : user profile, auth tokens
- IndexedDB : codex entries, achievement list (pour offline)

Le jeu doit rester fonctionnel en offline.

---

## 12) Déploiement
- Build web (bundle)
- Déploiement statique (GitHub Pages / Netlify)
- Performance : pooling + instancing + AssetContainer
