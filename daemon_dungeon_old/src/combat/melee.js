// Global Melee combat module (non-module)
(function(){
  window.DungeonCombat = window.DungeonCombat || {};
  window.DungeonCombat.melee = {
    init(game){
      game.sweeps = game.sweeps || [];
    },
    updateMeleeEffects(game, deltaTime){
      if (!game.sweeps) return;
      for (let i = game.sweeps.length - 1; i >= 0; i--) {
        const swp = game.sweeps[i];
        swp.lifetime -= deltaTime;
        swp.prevDistance = swp.currentDistance || 0;
        swp.currentDistance = Math.min(swp.maxDistance, (swp.currentDistance || 0) + swp.speed * deltaTime);
        if (swp.mesh) {
          swp.mesh.position = swp.origin;
          const baseR = swp.baseRadius || 4;
          const scale = Math.max(0.001, swp.currentDistance / baseR);
          swp.mesh.scaling = new BABYLON.Vector3(scale, scale, scale);
          if (swp.mesh.material) {
            swp.mesh.material.alpha = Math.max(0, swp.lifetime / swp.lifetimeTotal);
          }
        }
        const cosHalf = Math.cos(swp.halfAngle);
        game.enemies.forEach(enemy => {
          if (!enemy.mesh || !enemy.active) return;
          if (swp.hitSet && swp.hitSet.has(enemy)) return;
          const d = enemy.mesh.position.subtract(swp.origin); d.y = 0;
          const dist = d.length(); if (dist === 0) return;
          const dirN = d.scale(1 / dist);
          const dot = swp.dir.x * dirN.x + swp.dir.z * dirN.z;
          if (dot < cosHalf) return;
          const thickness = 1.0;
          if (dist >= swp.prevDistance && dist <= swp.currentDistance + thickness) {
            enemy.hp -= swp.damage;
            if (swp.hitSet) swp.hitSet.add(enemy);
          }
        });
        if (swp.lifetime <= 0) {
          if (swp.mesh) { try { swp.mesh.dispose(); } catch {} }
          game.sweeps.splice(i, 1);
        }
      }
    },
    tankAttack(game, targetEnemy){
      const playerPos = game.player.mesh.position.clone();
      let baseDir = new BABYLON.Vector3(0, 0, -1);
      if (targetEnemy && targetEnemy.mesh) {
        baseDir = targetEnemy.mesh.position.subtract(playerPos); baseDir.y = 0;
        if (baseDir.lengthSquared() > 0.0001) baseDir.normalize();
      } else if (game.player.velocity.length() > 0) {
        baseDir = game.player.velocity.clone().normalize();
      }
      const halfAngle = Math.PI / 3;
      const range = 8;
      const aimAngle = Math.atan2(baseDir.x, baseDir.z);
      const wedgeBuild = window.DungeonCore?.delegates?.createSweepWedge?.(game, halfAngle, '#ffaa00');
      const wedge = wedgeBuild.mesh;
      wedge.position = playerPos.clone(); wedge.position.y = 0.08; wedge.rotation.y = aimAngle;
      game.glow.addIncludedOnlyMesh(wedge);
      const sweep = {
        mesh: wedge,
        origin: playerPos,
        dir: baseDir,
        range,
        halfAngle,
        speed: 12,
        maxDistance: 6,
        currentDistance: 0,
        prevDistance: 0,
        lifetime: 0.35,
        lifetimeTotal: 0.35,
        hitSet: new Set(),
        damage: Math.floor(12 * (1 + (game.player.damageBonus || 0))),
        baseRadius: wedgeBuild.baseRadius
      };
      game.sweeps.push(sweep);
      game.player.attackPulse = 0.2;
    },
    rogueAttack(game){
      const playerPos = game.player.mesh.position.clone();
      const target = window.DungeonCore?.delegates?.getClosestEnemy?.(game);
      let fwd = new BABYLON.Vector3(0, 0, -1);
      if (target && target.mesh) {
        const toTarget = target.mesh.position.subtract(playerPos); toTarget.y = 0;
        if (toTarget.lengthSquared() > 0.0001) {
          toTarget.normalize(); fwd = toTarget;
          const aim = Math.atan2(fwd.x, fwd.z);
          game.player.mesh.rotation.y = aim;
        }
      }
      const range = 4.5;
      const halfAngle = Math.PI / 3;
      const dmg = Math.floor(8 * (1 + (game.player.damageBonus || 0)));
      const targets = [];
      game.enemies.forEach(enemy => {
        if (!enemy.mesh || !enemy.active) return;
        const d = enemy.mesh.position.subtract(playerPos); d.y = 0;
        const dist = d.length(); if (dist === 0 || dist > range) return;
        const dirN = dist > 0 ? d.scale(1 / dist) : new BABYLON.Vector3(0, 0, 0);
        const dot = fwd.x * dirN.x + fwd.z * dirN.z;
        if (dot >= Math.cos(halfAngle)) targets.push(enemy);
      });
      if (targets.length === 0 && target && target.mesh) {
        const dd = target.mesh.position.subtract(playerPos); dd.y = 0;
        if (dd.length() <= range + 0.2) targets.push(target);
      }
      if (targets.length === 0) return false;
      targets.forEach(enemy => { enemy.hp -= dmg; });
      game.player.attackPulse = 0.15;
      const slash = BABYLON.MeshBuilder.CreateDisc('rogue_slash', { radius: 0.9, tessellation: 32 }, game.scene);
      const slashDir = targets[0] && targets[0].mesh ? targets[0].mesh.position.subtract(playerPos) : fwd;
      slashDir.y = 0; if (slashDir.lengthSquared() > 0.0001) slashDir.normalize();
      slash.position = playerPos.add(slashDir.scale(1.2)); slash.position.y = 0.08; slash.rotation.x = Math.PI / 2;
      const smat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff66aa');
      smat.emissiveColor = new BABYLON.Color3(1.0, 0.4, 0.8); smat.alpha = 0.7; slash.material = smat;
      window.DungeonCore?.delegates?.applyRoomClipping?.(game, slash.material); game.glow.addIncludedOnlyMesh(slash);
      setTimeout(() => { try { slash.dispose(); } catch {} }, 120);
      return true;
    }
  };
})();