(function(){
  window.DungeonAI = window.DungeonAI || {};
  window.DungeonAI.enemies = window.DungeonAI.enemies || {};
  window.DungeonAI._loaded = true;

  function updateEnemies(game, deltaTime) {
    // Ensure zombie model is loading for base enemies
    window.DungeonEnemies?.zombieModel?.ensureLoaded?.(game);
    const enemies = game.enemies || [];
    enemies.forEach((enemy, idx) => {
      if (!enemy.mesh || !enemy.active) return;
      const now = performance.now()/1000;
      if (enemy.stunnedUntil && now < enemy.stunnedUntil) {
        enemy.velocity = new BABYLON.Vector3(0,0,0);
        return;
      }

      const toPlayer = game.player.mesh.position.subtract(enemy.mesh.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const dir = dist > 0 ? toPlayer.normalize() : new BABYLON.Vector3(0, 0, 0);

      // Separation to avoid clustering
      let sep = new BABYLON.Vector3(0, 0, 0);
      const minSep = 2.0;
      enemies.forEach(other => {
        if (other === enemy || !other.mesh) return;
        const d = enemy.mesh.position.subtract(other.mesh.position);
        d.y = 0;
        const l = d.length();
        if (l > 0 && l < minSep) {
          const push = d.normalize().scale((minSep - l) * 0.4);
          sep.addInPlace(push);
        }
      });

      // Boss AI: jumper
      if (enemy.type === 'boss_jumper' && enemy.bossData) {
        const bd = enemy.bossData;
        bd.jumpTimer -= deltaTime;
        enemy.velocity = new BABYLON.Vector3(0, 0, 0);
        if (bd.jumpTimer <= 0 && !bd.isJumping) {
          bd.isJumping = true;
          bd.jumpPhase = 0;
          bd.startPos = enemy.mesh.position.clone();
          bd.targetPos = game.player.mesh.position.clone();
          bd.jumpTimer = bd.jumpCooldown;
          if (bd.warningMesh) { bd.warningMesh.dispose(); bd.warningMesh = null; }
          const warn = BABYLON.MeshBuilder.CreateDisc('jump_warn', { radius: 4, tessellation: 48 }, game.scene);
          warn.position = bd.targetPos.clone();
          warn.position.y = 0.05;
          warn.rotation.x = Math.PI / 2;
          const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff5555');
          mat.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3);
          mat.alpha = 0.3;
          warn.material = mat;
          window.DungeonCore?.delegates?.applyRoomClipping?.(game, warn.material);
          game.glow.addIncludedOnlyMesh(warn);
          bd.warningMesh = warn;
        }
        if (bd.isJumping) {
          bd.jumpPhase += deltaTime / bd.jumpDuration;
          const t = Math.min(1, bd.jumpPhase);
          const horiz = BABYLON.Vector3.Lerp(bd.startPos, bd.targetPos, t);
          const height = Math.sin(t * Math.PI) * 6;
          enemy.mesh.position = horiz.add(new BABYLON.Vector3(0, height, 0));
          if (bd.warningMesh) {
            const blink = 0.25 + 0.35 * Math.sin(t * Math.PI * 6);
            bd.warningMesh.material.alpha = blink;
          }
          if (t >= 1) {
            bd.isJumping = false;
            enemy.mesh.position.y = CONFIG.ENEMY_SIZE / 2;
            if (bd.warningMesh) { bd.warningMesh.dispose(); bd.warningMesh = null; }
            window.DungeonCore?.delegates?.spawnShockwave?.(game, enemy.mesh.position.clone(), enemy.damage);
          }
        }
      } else if (enemy.type === 'boss_spawner' && enemy.bossData) {
        const bd = enemy.bossData;
        bd.spawnTimer -= deltaTime;
        if (bd.spawnTimer <= 0) {
          window.DungeonCore?.delegates?.spawnEnemyAt?.(game, enemy.mesh.position.clone().add(new BABYLON.Vector3(Math.random()*4-2, 0, Math.random()*4-2)), 1, enemy.roomIndex, { type: 'melee', active: true });
          bd.spawnTimer = bd.spawnCooldown;
        }
        enemy.velocity = dir.scale(enemy.speed).add(sep);
        if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
        enemy.mesh.position.addInPlace(enemy.velocity);
        window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, enemy.mesh, enemy.mesh.position, 1.1, false, enemy.velocity);
      } else if (enemy.type === 'boss_spikes' && enemy.bossData) {
        const bd = enemy.bossData;
        bd.spikeTimer -= deltaTime;
        if (bd.spikeTimer <= 0) {
          window.DungeonCore?.delegates?.spawnTemporarySpikes?.(game, enemy, bd);
          bd.spikeTimer = bd.spikeCooldown;
        }
        enemy.velocity = dir.scale(enemy.speed).add(sep);
        if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
        enemy.mesh.position.addInPlace(enemy.velocity);
        window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, enemy.mesh, enemy.mesh.position, 1.1, false, enemy.velocity);
      } else if (enemy.type === 'turret') {
        enemy.velocity = new BABYLON.Vector3(0, 0, 0);
        enemy.mesh.rotation.y += deltaTime * 0.6;
        enemy.shootTimer = (enemy.shootTimer || 0) - deltaTime;
        if (dist < (enemy.range || 30) && enemy.shootTimer <= 0) {
          window.DungeonCore?.delegates?.spawnEnemyProjectile?.(game, enemy, dir);
          enemy.shootTimer = enemy.shootCooldown || 1.0;
        }
      } else if (enemy.type === 'bouncer') {
        enemy.velocity.addInPlace(sep);
        if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
        enemy.mesh.position.addInPlace(enemy.velocity);
        const room = game.roomManager && game.roomManager.rooms ? game.roomManager.rooms[enemy.roomIndex] : null;
        const origin = room ? room.origin : (game.currentRoom ? game.currentRoom.origin : new BABYLON.Vector3(0,0,0));
        const halfW = CONFIG.ROOM_WIDTH / 2 - 1;
        const halfD = CONFIG.ROOM_DEPTH / 2 - 1;
        let bounced = false;
        if (enemy.mesh.position.x > origin.x + halfW) { enemy.mesh.position.x = origin.x + halfW; enemy.velocity.x *= -1; bounced = true; }
        if (enemy.mesh.position.x < origin.x - halfW) { enemy.mesh.position.x = origin.x - halfW; enemy.velocity.x *= -1; bounced = true; }
        if (enemy.mesh.position.z > origin.z + halfD) { enemy.mesh.position.z = origin.z + halfD; enemy.velocity.z *= -1; bounced = true; }
        if (enemy.mesh.position.z < origin.z - halfD) { enemy.mesh.position.z = origin.z - halfD; enemy.velocity.z *= -1; bounced = true; }
        window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, enemy.mesh, enemy.mesh.position, 1.0, true, enemy.velocity);
        if (bounced) {
          const speedLen = enemy.velocity.length();
          if (speedLen === 0) {
            const dirBounce = new BABYLON.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            enemy.velocity = dirBounce.scale(enemy.speed);
          }
        }
      } else {
        // Face the player so the zombie model points toward its target
        if (enemy.type === 'melee' && enemy.mesh && dir.length() > 0) {
          // Rotate toward player with +90° offset to align model forward axis
          enemy.mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
        }

        const prevPos = enemy.mesh.position.clone();
        if (enemy.unstuckVector && enemy.stuckCounter > 0) {
          enemy.velocity = enemy.unstuckVector.clone();
          enemy.stuckCounter--;
        } else {
          enemy.unstuckVector = null;
          enemy.stuckCounter = 0;
          enemy.velocity = dir.scale(enemy.speed).add(sep);
          if (enemy.velocity.length() > enemy.speed) enemy.velocity = enemy.velocity.normalize().scale(enemy.speed);
        }
        enemy.mesh.position.addInPlace(enemy.velocity);
        window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, enemy.mesh, enemy.mesh.position, 0.9, false, enemy.velocity);
        const moveAmount = enemy.mesh.position.subtract(prevPos).length();
        if (moveAmount < 0.05 && dist > 1.5 && dir.length() > 0 && !enemy.unstuckVector) {
          const perp1 = new BABYLON.Vector3(-dir.z, 0, dir.x).normalize().scale(enemy.speed);
          const perp2 = new BABYLON.Vector3(dir.z, 0, -dir.x).normalize().scale(enemy.speed);
          const testPos1 = enemy.mesh.position.add(perp1);
          const testPos2 = enemy.mesh.position.add(perp2);
          const save = enemy.mesh.position.clone();
          enemy.mesh.position = testPos1;
          const savedVel = enemy.velocity.clone();
          window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, enemy.mesh, enemy.mesh.position, 0.9, false, enemy.velocity);
          const move1 = enemy.mesh.position.subtract(save).length();
          enemy.mesh.position = testPos2;
          enemy.velocity = savedVel.clone();
          window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, enemy.mesh, enemy.mesh.position, 0.9, false, enemy.velocity);
          const move2 = enemy.mesh.position.subtract(save).length();
          if (move1 > 0.05 && move1 > move2) {
            enemy.mesh.position = testPos1;
            enemy.unstuckVector = perp1;
            enemy.stuckCounter = 5;
          } else if (move2 > 0.05) {
            enemy.mesh.position = testPos2;
            enemy.unstuckVector = perp2;
            enemy.stuckCounter = 5;
          } else {
            enemy.mesh.position = save;
          }
        }

        // Basic zombie attack logic
        enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - deltaTime);
        const attackRange = 3.0;
        const canAttack = dist <= attackRange && enemy.attackCooldown <= 0;
        if (canAttack && !enemy.attacking && enemy.animAttacks && enemy.animAttacks.length > 0) {
          const ag = enemy.animAttacks[Math.floor(Math.random() * enemy.animAttacks.length)];
          if (ag) {
            enemy.attacking = true;
            enemy.attackCooldown = 1.2;
            ag.reset();
            ag.start(false);
            ag.onAnimationEndObservable.addOnce(() => {
              enemy.attacking = false;
              if (enemy.animIdle) enemy.animIdle.start(true);
            });
          }
        } else if (!enemy.attacking && enemy.animIdle && !enemy.animIdle.isPlaying) {
          enemy.animIdle.start(true);
        }
      }

      // Clamp bounds and health bar
      window.DungeonCore?.delegates?.clampEntityBounds?.(game, enemy.mesh);
      // Update enemy health bar visually
      game.updateEnemyHealthBar(enemy);

      // Remove if dead
      if (enemy.hp <= 0) {
        if (enemy.animIdle) enemy.animIdle.stop();
        if (enemy.animAttacks) enemy.animAttacks.forEach(a => a.stop());
        if (enemy.healthBar) enemy.healthBar.dispose();
        if (enemy.bossData) {
          if (enemy.bossData.warningMesh) enemy.bossData.warningMesh.dispose();
          if (enemy.bossData.activeSpikes) {
            enemy.bossData.activeSpikes.forEach(sp => { if (sp.warningMesh) sp.warningMesh.dispose(); });
            enemy.bossData.activeSpikes = [];
          }
        }
        enemy.mesh.dispose();
        enemies.splice(idx, 1);
        game.score += 10;
        game.showDaemonMessage("Processus terminé.");
        const ri = enemy.roomIndex;
        if (game.roomManager && game.roomManager.rooms && game.roomManager.rooms[ri]) {
          const roomList = game.roomManager.rooms[ri].enemies;
          const i = roomList.indexOf(enemy);
          if (i >= 0) roomList.splice(i, 1);
        }
      }
    });

    // Open door when room cleared
    if (!game.doorOpen && game.currentRoom) {
      const alive = (game.currentRoom.enemies || []).filter(e => e.active && e.hp > 0).length;
      if (alive === 0) {
        game.roomManager.openDoor(game.roomsCleared);
        game.doorOpen = true;
        game.showDaemonMessage("Salle terminée. Avancez vers la porte.");
        if (!game.roomDamageTaken && !game.noDamageTauntDone) {
          window.DungeonUI?.evilUi?.showEvilTaunt?.(game, 'no_damage');
          game.noDamageTauntDone = true;
        }
      }
    }
  }

  window.DungeonAI.enemies.updateEnemies = updateEnemies;
})();
