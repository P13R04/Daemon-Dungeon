// Ultimate abilities and passives
// Exports window.DungeonLogic.ultimate
(function(){
  'use strict';

  if (!window.DungeonLogic) window.DungeonLogic = {};
  if (!window.DungeonLogic.ultimate) window.DungeonLogic.ultimate = {};

  const COOLDOWN_DEFAULT = 15; // seconds
  const ROOM_LIMIT_DEFAULT = 1;

  function initUltimateState(game){
    game.ultimateCooldown = COOLDOWN_DEFAULT;
    game.ultimateRoomLimit = ROOM_LIMIT_DEFAULT;
    game.ultimatesUsedThisRoom = 0;
    if (game.player) {
      game.player.ultimateCooldown = 0;
    }
    game.rogueUlt = null;
  }

  function ensureUltimateUI(game){
    let btn = document.getElementById('ultimateButton');
    if (!btn){
      btn = document.createElement('button');
      btn.id = 'ultimateButton';
      btn.textContent = 'ULTI';
      btn.style.position = 'fixed';
      btn.style.left = '50%';
      btn.style.bottom = '20px';
      btn.style.transform = 'translateX(-50%)';
      btn.style.padding = '12px 18px';
      btn.style.fontFamily = "'IBM Plex Mono','Consolas',monospace";
      btn.style.fontSize = '16px';
      btn.style.border = '2px solid #00ff99';
      btn.style.background = '#001e1a';
      btn.style.color = '#00ffcc';
      btn.style.borderRadius = '8px';
      btn.style.zIndex = 1000;
      btn.style.opacity = '0.9';
      btn.addEventListener('click', () => activateUltimate(game));
      document.body.appendChild(btn);
    }
    updateUltimateUI(game);
  }

  function updateUltimateUI(game){
    const btn = document.getElementById('ultimateButton');
    if (!btn) return;
    const cd = Math.ceil(game.player.ultimateCooldown || 0);
    const limitLeft = (game.ultimateRoomLimit - (game.ultimatesUsedThisRoom||0));
    btn.disabled = (cd > 0) || limitLeft <= 0 || !game.gameRunning;
    btn.textContent = cd > 0 ? `ULTI (${cd})` : `ULTI${limitLeft<=0?' ✕':''}`;
    btn.style.borderColor = btn.disabled ? '#888' : '#00ff99';
    btn.style.color = btn.disabled ? '#aaa' : '#00ffcc';
  }

  function ultimateAvailable(game){
    return (game.player.ultimateCooldown <= 0) && ((game.ultimatesUsedThisRoom||0) < game.ultimateRoomLimit);
  }

  function activateUltimate(game){
    if (!ultimateAvailable(game)) return;
    if (!game.player || !game.selectedClass) return;

    const cls = game.player.class || game.selectedClass;
    const now = performance.now()/1000;
    // Set invulnerability first to prevent self-damage during ultimate activation
    game.player.invulnerable = true;
    if (cls === 'mage') {
      game.player.invulnerableUntil = now + 6.0;
      mageStartBeam(game);
    } else if (cls === 'knight' || cls === 'tank') {
      game.player.invulnerableUntil = now + 2.0;
      tankShockwave(game);
    } else {
      game.player.invulnerableUntil = now + 8.0;
      rogueChain(game);
    }
    game.player.ultimateCooldown = game.ultimateCooldown;
    game.ultimatesUsedThisRoom = (game.ultimatesUsedThisRoom||0)+1;
    updateUltimateUI(game);
    game.showDaemonMessage('Compétence ultime activée.');
  }

  // ===== Mage Ultimate: Sustained Tracking Beam (6s) =====
  function mageStartBeam(game){
    const state = {
      active: true,
      timer: 0,
      duration: 6.0,
      radius: 2.0,
      dps: 12,
      beam: null
    };
    game.mageUlt = state;
    // Create beam immediately on activation to avoid visual delay
    mageUpdateBeam(game);
  }

  function mageUpdateBeam(game){
    const s = game.mageUlt; if (!s) return;
    const origin = game.player.mesh.position.clone();
    // Find closest active enemy directly instead of relying on delegate
    let target = null;
    let closestDist = Infinity;
    (game.enemies || []).forEach(e => {
      if (!e.mesh) return;
      const dist = BABYLON.Vector3.Distance(origin, e.mesh.position);
      if (dist < closestDist) {
        closestDist = dist;
        target = e;
      }
    });
    
    let end;
    if (target && target.mesh) {
      end = target.mesh.position.clone();
      end.y = origin.y;
    } else {
      const dir = new BABYLON.Vector3(0, 0, -1);
      const roomOrigin = game.currentRoom ? game.currentRoom.origin : new BABYLON.Vector3(0, 0, 0);
      const halfD = game.CONFIG.ROOM_DEPTH / 2 - 1;
      end = roomOrigin.clone().add(new BABYLON.Vector3(dir.x * halfD * 2, 0, dir.z * halfD * 2));
    }
    const length = BABYLON.Vector3.Distance(origin, end);
    try { if (s.beam) s.beam.dispose(); } catch{}
    const beam = BABYLON.MeshBuilder.CreateCylinder('mage_beam', { diameter: 0.7, height: length }, game.scene);
    beam.material = window.DungeonCore?.delegates?.createMaterial?.(game, '#55ffee');
    beam.material.emissiveColor = new BABYLON.Color3(0.3, 0.9, 1.0);
    beam.position = origin.add(end.subtract(origin).scale(0.5));
    beam.rotation.x = Math.PI / 2;
    const dirVec = end.subtract(origin);
    dirVec.y = 0;
    if (dirVec.length() > 0) dirVec.normalize();
    beam.rotation.y = Math.atan2(dirVec.x, dirVec.z);
    window.DungeonCore?.delegates?.applyRoomClipping?.(game, beam.material);
    game.glow.addIncludedOnlyMesh(beam);
    s.beam = beam;

    // Apply DPS along the beam segment
    (game.enemies || []).forEach(e => {
      if (!e.mesh) return;
      const p = e.mesh.position.clone();
      p.y = origin.y;
      const toLine = distancePointToSegment(p, origin, end);
      if (toLine <= s.radius) {
        window.DungeonLogic?.damage?.damageEntity?.(game, e, s.dps * (game._deltaTime || 0.016));
      }
    });
  }

  // Helper: distance from point to segment
  function distancePointToSegment(p, a, b){
    const ap = p.subtract(a); const ab = b.subtract(a);
    const t = Math.max(0, Math.min(1, BABYLON.Vector3.Dot(ap, ab) / ab.lengthSquared()));
    const closest = a.add(ab.scale(t));
    return p.subtract(closest).length();
  }

  // ===== Tank Ultimate: Shockwave + Stun =====
  function tankShockwave(game){
    window.DungeonCore?.delegates?.spawnShockwave?.(game, game.player.mesh.position.clone(), 45);
    const radius = 15; // Increased radius to catch more enemies
    const now = performance.now()/1000;
    (game.enemies||[]).forEach(e => {
      if (!e.mesh) return;
      const d = BABYLON.Vector3.Distance(game.player.mesh.position, e.mesh.position);
      if (d <= radius){
        window.DungeonLogic?.damage?.damageEntity?.(game, e, 40);
        // Stun for 2 seconds (prevents movement and attacks)
        e.stunnedUntil = now + 2.0;
      }
    });
  }

  // ===== Rogue Ultimate: Teleport Slash Chain =====
  function rogueChain(game){
    const state = {
      active: true,
      timer: 0,
      nextTick: 0,
      duration: 8.0,
      interval: 0.2,
      radius: 12,
      zone: null
    };
    const zone = BABYLON.MeshBuilder.CreateDisc('rogue_zone', {radius: state.radius, tessellation: 48}, game.scene);
    zone.position = game.player.mesh.position.clone(); zone.position.y = 0.04; zone.rotation.x = Math.PI/2;
    zone.material = window.DungeonCore?.delegates?.createMaterial?.(game, '#ffaa00');
    zone.material.alpha = 0.35; window.DungeonCore?.delegates?.applyRoomClipping?.(game, zone.material);
    game.glow.addIncludedOnlyMesh(zone);
    state.zone = zone; game.rogueUlt = state;
  }

  function updateUltimateState(game, deltaTime){
    updateUltimateUI(game);
    // Manage invulnerability timeout
    const now = performance.now()/1000;
    if (game.player && game.player.invulnerableUntil && now >= game.player.invulnerableUntil) {
      game.player.invulnerable = false;
      game.player.invulnerableUntil = null;
    }
    // Store delta for DPS integration
    game._deltaTime = deltaTime;
    // Mage sustained beam
    if (game.mageUlt && game.mageUlt.active) {
      const ms = game.mageUlt;
      ms.timer += deltaTime;
      mageUpdateBeam(game);
      if (ms.timer >= ms.duration) {
        try { if (ms.beam) ms.beam.dispose(); } catch{}
        game.mageUlt = null;
      }
    }
    // Rogue chain
    if (!game.rogueUlt || !game.rogueUlt.active) return;
    const s = game.rogueUlt;
    s.timer += deltaTime; s.zone.position = game.player.mesh.position.clone(); s.zone.position.y = 0.04;
    while (s.timer >= s.nextTick && s.timer <= s.duration){
      s.nextTick += s.interval;
      const enemies = (game.enemies||[]).filter(e => e.active && e.mesh && BABYLON.Vector3.Distance(game.player.mesh.position, e.mesh.position) <= s.radius);
      if (enemies.length>0){
        const target = enemies[0];
        const tp = target.mesh.position.clone(); tp.y = game.player.mesh.position.y;
        game.player.mesh.position = tp.add(new BABYLON.Vector3(0.6,0,0.6));
        window.DungeonLogic?.damage?.damageEntity?.(game, target, 8);
      }
    }
    if (s.timer >= s.duration){
      try{ s.zone.dispose(); }catch{}
      game.rogueUlt = null;
    }
  }

  // ===== Passives =====
  function updatePassives(game, deltaTime){
    if (!game.player) return;
    // Mage: stationary attack speed buildup
    if (game.player.class === 'mage'){
      const moving = game.player.velocity.length() > 0.0001 || (Math.abs(game.joystickInput?.x||0) + Math.abs(game.joystickInput?.y||0))>0.01;
      if (!moving){
        game.player.attackSpeedMultiplier = Math.min(2.5, (game.player.attackSpeedMultiplier||1) + deltaTime*0.25);
      } else {
        game.player.attackSpeedMultiplier = 1;
      }
    }
  }

  // Export
  window.DungeonLogic.ultimate.initUltimateState = initUltimateState;
  window.DungeonLogic.ultimate.ensureUltimateUI = ensureUltimateUI;
  window.DungeonLogic.ultimate.updateUltimateUI = updateUltimateUI;
  window.DungeonLogic.ultimate.activateUltimate = activateUltimate;
  window.DungeonLogic.ultimate.updateUltimateState = updateUltimateState;
  window.DungeonLogic.ultimate.updatePassives = updatePassives;
  window.DungeonLogic.ultimate._loaded = true;
})();
