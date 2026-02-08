// Global Ranged combat module (non-module)
(function(){
  window.DungeonCombat = window.DungeonCombat || {};
  window.DungeonCombat.ranged = {
    playerAttack(game, targetEnemy){
      game.player.isAttacking = true;
      window.DungeonCore?.delegates?.playAnimation?.(game, 'attack', false);
      game.player.attackPulse = 0.25;
      if (targetEnemy && targetEnemy.mesh) {
        const dir = targetEnemy.mesh.position.subtract(game.player.mesh.position); dir.y = 0;
        if (dir.lengthSquared() > 0.0001) {
          const angle = Math.atan2(dir.x, dir.z);
          game.player.mesh.rotation.y = angle + (game.player.rotationOffset || 0);
        }
      }
      const projectile = BABYLON.MeshBuilder.CreateSphere('projectile', { segments: 8 }, game.scene);
      projectile.position = game.player.mesh.position.clone();
      projectile.scaling = new BABYLON.Vector3(game.CONFIG ? game.CONFIG.PROJECTILE_SIZE : 0.3, game.CONFIG ? game.CONFIG.PROJECTILE_SIZE : 0.3, game.CONFIG ? game.CONFIG.PROJECTILE_SIZE : 0.3);
      const projMat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ffff00');
      projMat.emissiveColor = new BABYLON.Color3(1, 1, 0);
      projectile.material = projMat;
      game.glow.addIncludedOnlyMesh(projectile);
      const shots = game.player.multishot || 1;
      const baseDir = targetEnemy.mesh.position.subtract(projectile.position).normalize();
      for (let i = 0; i < shots; i++) {
        const angle = (i - (shots-1)/2) * 0.08;
        const dir = new BABYLON.Vector3(
          baseDir.x * Math.cos(angle) - baseDir.z * Math.sin(angle),
          0,
          baseDir.x * Math.sin(angle) + baseDir.z * Math.cos(angle)
        );
        const p = i === 0 ? projectile : projectile.clone('projectile_clone');
        game.projectiles.push({
          mesh: p,
          velocity: dir.scale(game.CONFIG ? game.CONFIG.PROJECTILE_SPEED : 0.8),
          lifetime: game.CONFIG ? game.CONFIG.PROJECTILE_LIFETIME : 10,
          damage: Math.floor(10 * (1 + (game.player.damageBonus || 0))),
          friendly: true,
        });
      }
    },
    updateProjectiles(game, deltaTime){
      for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const proj = game.projectiles[i];
        if (!proj.mesh) { game.projectiles.splice(i, 1); continue; }
        proj.lifetime -= deltaTime;
        proj.mesh.position.addInPlace(proj.velocity);
        if (proj.lifetime <= 0) { proj.mesh.dispose(); game.projectiles.splice(i, 1); }
      }
    },
    spawnEnemyProjectile(game, enemy, dir){
      const proj = BABYLON.MeshBuilder.CreateSphere('enemy_projectile', { diameter: 0.6 }, game.scene);
      proj.position = enemy.mesh.position.clone();
      const color = enemy.type === 'turret' ? '#ff66ff' : '#aa66ff';
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, color);
      mat.emissiveColor = enemy.type === 'turret' ? new BABYLON.Color3(1, 0.4, 1) : new BABYLON.Color3(0.6, 0.2, 1);
      proj.material = mat;
      game.glow.addIncludedOnlyMesh(proj);
      game.projectiles.push({
        mesh: proj,
        velocity: dir.normalize().scale(game.CONFIG ? game.CONFIG.ENEMY_PROJECTILE_SPEED : 0.35),
        lifetime: 6,
        damage: enemy.damage || 10,
        friendly: false,
      });
    }
  };
})();