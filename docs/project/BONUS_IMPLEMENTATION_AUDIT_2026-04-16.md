# Audit Bonus - 16 avril 2026

## 1) Etat actuel du systeme bonus

### Ce qui est deja solide
- Le pool de bonus est operationnel: rarete, poids de tirage, scope par classe, gestion des stacks (`unique` / `limited` / `infinite`).
- Le flow room clear -> porte -> ecran bonus -> selection -> transition est en place.
- Les bonus meta actifs dans l'economie sont deja relies dynamiquement (currency multiplier, revenu passif, nombre d'offres, luck de rarete).
- L'UI de choix bonus est deja fonctionnelle (cartes + reroll + rarity + stack label).

### Ce qui est effectivement applique en gameplay
- `bonus_hp`: applique multiplicateur de HP max + heal plein.
- `bonus_ms`: applique multiplicateur de vitesse.
- `bonus_poison`: active DoT sur hit projectile ami.
- `bonus_fire_rate`: augmente cadence (baseFireRate reduit).
- Meta live: `meta_bounty_index`, `meta_background_miner`, `meta_offer_slot`, `meta_lucky_compile`.

### Ce qui est encore placeholder dans le runtime
- Mage: multishot arc, autolock, bounce bonus expose, pierce, reactive AoE, impact AoE.
- Firewall: thorns, bonus deflect shield, bonus stun shield bash, bonus range bash, bonus reduction de degats.
- Rogue: lifesteal, chain, stealth tuning, range patch, backdoor scaling fin.
- General: dodge roll, crit engine, ulti charge, ulti duration, stance efficiency.
- Meta: double pick, discount shop.

## 2) Constats techniques critiques

### 2.1 Point tres important pour ta demande (rebond sur murs)
- Le moteur projectile gere DEJA nativement les rebonds mur/obstacles:
  - `maxBounces`, `remainingBounces`, `bounceDamping`
  - detection mur/obstacle + reflection vectorielle
  - fallback normal + normal physique via raycast (`RoomManager.getPhysicsBounceNormal`)
- Donc l'implementation de `mage_bounce_kernel` est surtout un branchement de stats joueur -> spawn projectile.

### 2.2 Manque principal: pas de couche centralisee d'effets bonus runtime
- `GameManager.applyBonus` ne traite que 4 IDs (HP/MS/poison/fire rate).
- Tous les autres IDs sont no-op.
- Il manque une couche type `PlayerBonusRuntimeState` (ou `BonusEffectsRuntime`) pour accumuler stacks et exposer des getters gameplay.

### 2.3 Events de combat sous-utilises pour passifs
- `PROJECTILE_HIT` existe et contient damage + target, mais n'est pas exploite globalement pour effets bonus.
- `ATTACK_PERFORMED` est utilise surtout pour flux melee incoming/timers.
- Pour lifesteal, chain, proc-on-hit, c'est la meilleure surface d'integration.

### 2.4 Ecart docs vs code reel
- `docs/project/BONUS_POOL_CATALOG.md` decrit un pool plus large que `src/data/bonuses/bonusCatalog.ts`.
- `src/data/codex/bonuses.ts` contient des IDs qui ne sont pas alignes avec le catalog runtime (ex: `fire_rate` vs `bonus_fire_rate`, `damage_boost`, `piercing_shot`, `burn`).
- Sans synchronisation, risque de confusion QA/design et tracking codex partiellement faux.

## 3) Plan d'implementation recommande (ordre prioritaire)

## Phase A - Fondations runtime bonus (priorite haute)
1. Creer un etat runtime des bonus joueur (stacks applicatifs), avec getters utilises par gameplay.
2. Etendre `applyBonus` pour enregistrer les stacks et non plus faire uniquement des `switch` hardcodes partiels.
3. Centraliser les calculs par classe:
   - Mage projectile modifiers (multishot, bounce, pierce, autolock, impact proc)
   - Rogue on-hit modifiers (lifesteal, chain)
   - Firewall mitigation/reflect modifiers

## Phase B - Mage (priorite haute, gros impact build diversity)
1. `mage_bounce_kernel`
   - +1 bounce par stack (cap 5), damping configurable.
   - pass-through via event `PROJECTILE_SPAWNED` payload (`maxBounces`, `bounceDamping`).
2. `mage_multishot_arc`
   - spawn N projectiles en cone (angle total scale par stack).
3. `mage_dual_burst`
   - volley additionnelle (deux projectiles legerement decales).
4. `mage_pierce_patch`
   - ajouter `remainingPierces` sur projectile data et ne pas despawn tant que >0.
5. `mage_impact_aoe`
   - chance on hit projectile ami de spawn micro AoE.
6. `mage_autolock_patch`
   - homing local dans un rayon court (steering doux, pas instant turn).

## Phase C - Rogue sustain/build identity (priorite haute)
1. `rogue_lifesteal_script`
   - sur hit (projectile/strike/dash), heal % des degats infliges.
   - soft cap anti-immortalite (ex: max heal/s).
2. `rogue_whitehat_chain`
   - sur hit, propagation partielle vers X cibles proches.
3. `rogue_backdoor`
   - renforcer la fenetre reveal/opening strike via multiplicateur stackable.
4. `rogue_stealth_zone` et `rogue_range_patch`
   - bonus lisibles et ressentis immediats.

## Phase D - Firewall (priorite moyenne-haute)
1. `firewall_deflect_matrix`
   - augmenter `tankProjectileReflectMultiplier` ou angle utile de block.
2. `firewall_stun_driver`
   - +duree stun shield bash.
3. `firewall_thorns_driver`
   - degats de proximity/contact ou renvoi melee partiel.
4. `firewall_damage_reduction`
   - mitigation additive capee.

## Phase E - General/meta restants
- dodge roll, crit engine, ulti charge/duration, stance efficiency.
- `meta_double_pick`, `meta_discount_patch`.

## 4) Rejouabilite et differenciation des builds

### Situation actuelle
- Build diversity ressentie: faible a moyenne.
- Le coeur du systeme de roll est bon, mais trop de picks sont placeholders no-op.
- La sensation de build vient surtout de 4 bonus generalistes + meta economie.

### Apres implementation des phases A/B/C
- Build Mage distincts:
  - Ricochet (bounce + pierce)
  - Shotgun arc (multishot + burst)
  - Control/proc (impact AoE + autolock)
- Build Rogue distincts:
  - Sustain assassin (lifesteal + backdoor)
  - Chain execution (whitehat + range)
  - Stealth burst (sneaky + opening)
- Build Firewall distincts:
  - Reflect tank
  - Crowd control bash
  - Attrition thorns/reduction

Conclusion: avec ces lots, la variete est suffisante pour differencier les parties et les classes.

## 5) Healing/sustain - recommandations concretes

1. Rogue lifesteal direct (priorite):
- 4% par stack, cap 3 stacks, plafonne a X HP/s.

2. Sustain secondaire classe:
- Mage: heal mineur sur kill sous DoT poison ou sur proc impact AoE.
- Firewall: micro-heal sur deflect reussi (valeur faible, orientee tank play).

3. Bonus general de sustain (option):
- Bonus general rare non-classe: `hot_patch` = regen hors degats pendant 2s.
- Permet un socle de sustain meme sans Rogue.

## 6) Havok/Babylon - opportunites a exploiter

- Rebond mur: deja pret via normale physique raycast.
- Amelioration proposee:
  - limiter homing/autolock avec courbure max par seconde pour garder lisibilite.
  - eviter oscillation sur murs: cooldown rebond tres court (quelques ms) par projectile.
  - conserver l'approche actuelle tile+obstacle+raycast (robuste pour top-down indoor).

## 7) Dette documentaire et synchronisation recommandee

1. Source of truth unique bonus:
- Soit `bonusCatalog.ts` pilote tout,
- soit generation automatique de docs/codex a partir de ce catalog.

2. Synchroniser IDs codex/runtime:
- aligner noms et IDs pour eviter bonus fantomes dans codex.

3. Ajouter un tableau de suivi implementation:
- colonne "runtime wired", "tested", "vfx", "artwork", "balance".

## 8) Definition Done suggeree (par bonus)
- Effet gameplay actif et testable en room normale.
- Stack cap respecte.
- UI stack label coherent.
- Codex entry alignee (ID/nom/description).
- Test manuel: acquisition bonus + verification comportement + non-regression perf.
