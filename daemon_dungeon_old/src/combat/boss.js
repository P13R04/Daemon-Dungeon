// Global Boss abilities module (non-module)
(function(){
  window.DungeonCombat = window.DungeonCombat || {};
  window.DungeonCombat.boss = {
    spawnShockwave(game, origin, damage){
      const wave = BABYLON.MeshBuilder.CreateDisc('shockwave', { radius: 4, tessellation: 48 }, game.scene);
      wave.position = origin.clone(); wave.position.y = 0.05; wave.rotation.x = Math.PI / 2;
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff3333');
      mat.emissiveColor = new BABYLON.Color3(1.0, 0.35, 0.35); mat.alpha = 0.95; wave.material = mat;
      window.DungeonCore?.delegates?.applyRoomClipping?.(game, wave.material); game.glow.addIncludedOnlyMesh(wave);
      const shockwave = { mesh: wave, lifetime: 1.2, lifetimeTotal: 1.2, damage, radius: 0.1, prevRadius: 0.0, maxRadius: 20, hasHit: false };
      const initialScale = shockwave.radius / 4; wave.scaling = new BABYLON.Vector3(initialScale, initialScale, initialScale);
      game.shockwaves = game.shockwaves || []; game.shockwaves.push(shockwave);
    },
    spawnTemporarySpikes(game, boss, bossData){
      const room = game.currentRoom; if (!room) return; const origin = room.origin;
      const isHorizontal = Math.random() > 0.5; const third = isHorizontal ? game.CONFIG.ROOM_DEPTH / 3 : game.CONFIG.ROOM_WIDTH / 3;
      const offset = (Math.floor(Math.random() * 3) - 1) * third;
      const warning = BABYLON.MeshBuilder.CreateGround('spike_warning', { width: isHorizontal ? game.CONFIG.ROOM_WIDTH : third, height: isHorizontal ? third : game.CONFIG.ROOM_DEPTH }, game.scene);
      warning.position = origin.clone().add(new BABYLON.Vector3(isHorizontal ? 0 : offset, 0.1, isHorizontal ? offset : 0));
      const warnMat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff0000'); warnMat.emissiveColor = new BABYLON.Color3(1, 0, 0); warnMat.alpha = 0.4; warning.material = warnMat;
      game.glow.addIncludedOnlyMesh(warning);
      const tempSpike = { warningMesh: warning, lifetime: 1.5, damageLifetime: 3.5, damage: Math.floor(boss.damage * 0.8), position: warning.position.clone(), size: { x: isHorizontal ? game.CONFIG.ROOM_WIDTH : third, z: isHorizontal ? third : game.CONFIG.ROOM_DEPTH }, active: false, blinkPhase: 0 };
      bossData.activeSpikes.push(tempSpike);
    },
    updateBossAbilities(game, deltaTime){
      // Shockwaves
      if (game.shockwaves) {
        for (let i = game.shockwaves.length - 1; i >= 0; i--) {
          const sw = game.shockwaves[i];
          sw.lifetime -= deltaTime;
          const growRate = sw.maxRadius / sw.lifetimeTotal;
          sw.prevRadius = sw.radius;
          sw.radius = Math.min(sw.maxRadius, sw.radius + deltaTime * growRate);
          const scale = sw.radius / 4;
          sw.mesh.scaling = new BABYLON.Vector3(scale, scale, scale);
          sw.mesh.material.alpha = Math.max(0, sw.lifetime / sw.lifetimeTotal);
          if (!sw.hasHit) {
            const dist = sw.mesh.position.subtract(game.player.mesh.position).length();
            if (dist >= sw.prevRadius && dist <= sw.radius) {
              const now = performance.now() / 1000;
              if (now - game.player.lastDamageTime >= 0.5) {
                window.DungeonLogic?.damage?.damagePlayer?.(game, sw.damage);
              }
              sw.hasHit = true;
            }
          }
          if (sw.lifetime <= 0) { sw.mesh.dispose(); game.shockwaves.splice(i, 1); }
        }
      }
      // Temporary spikes
      game.enemies.forEach(enemy => {
        if (enemy.type === 'boss_spikes' && enemy.bossData) {
          const spikes = enemy.bossData.activeSpikes;
          for (let i = spikes.length - 1; i >= 0; i--) {
            const sp = spikes[i]; sp.blinkPhase += deltaTime * 8;
            if (!sp.active) {
              sp.lifetime -= deltaTime;
              sp.warningMesh.material.alpha = 0.3 + Math.sin(sp.blinkPhase) * 0.3;
              if (sp.lifetime <= 0) { sp.active = true; sp.warningMesh.material.alpha = 0.8; }
            } else {
              sp.damageLifetime -= deltaTime;
              const p = game.player.mesh.position;
              const inX = Math.abs(p.x - sp.position.x) < sp.size.x / 2;
              const inZ = Math.abs(p.z - sp.position.z) < sp.size.z / 2;
              if (inX && inZ) {
                const now = performance.now() / 1000;
                if (now - game.player.lastDamageTime >= 0.5) {
                  game.player.hp -= sp.damage; game.player.lastDamageTime = now;
                }
              }
              if (sp.damageLifetime <= 0) { sp.warningMesh.dispose(); spikes.splice(i, 1); }
            }
          }
        }
      });
    }
  };
})();