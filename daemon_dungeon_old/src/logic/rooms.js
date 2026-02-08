(function(){
  window.DungeonLogic = window.DungeonLogic || {};
  window.DungeonLogic.rooms = window.DungeonLogic.rooms || {};
  window.DungeonLogic._loaded = true;

  function loadRandomRoom(game, index) {
    const isBossRoom = ((index + 1) % CONFIG.WAVES_UNTIL_BOSS === 0);
    const preset = isBossRoom ? ROOM_PRESETS[ROOM_PRESETS.length - 1] : ROOM_PRESETS[Math.floor(Math.random() * (ROOM_PRESETS.length - 1))];
    const scale = 1 + index * 0.15;
    game.currentRoom = game.roomManager.loadPreset(index, preset, scale, game, true);
    game.obstacles = game.currentRoom.obstacles;
    game.hazards = game.currentRoom.hazards;
    const origin = game.currentRoom.origin;
    game.player.mesh.position = origin.clone().add(new BABYLON.Vector3(0, CONFIG.PLAYER_SIZE, CONFIG.ROOM_DEPTH/2 - 5));
    game.doorOpen = false;
    game.ultimatesUsedThisRoom = 0;
    // Increment wave counter when entering new room
    game.currentWave = (game.currentWave || 0) + 1;
    window.DungeonCore?.delegates?.updateUltimateUI?.(game);
    const bossEnemy = game.getBossInRoom(game.currentRoom);
    if (bossEnemy) window.DungeonCore?.delegates?.showBossIntro?.(game, bossEnemy.type);
    const now = performance.now() / 1000;
    game.lastMoveTime = now;
    game.idleTauntDone = false;
    game.roomDamageTaken = false;
    game.noDamageTauntDone = false;
    for (let i = 1; i <= 2; i++) {
      const futureIndex = index + i;
      if (!game.roomManager.rooms[futureIndex]) {
        const futureIsBoss = ((futureIndex + 1) % CONFIG.WAVES_UNTIL_BOSS === 0);
        const futurePreset = futureIsBoss ? ROOM_PRESETS[ROOM_PRESETS.length - 1] : ROOM_PRESETS[Math.floor(Math.random() * (ROOM_PRESETS.length - 1))];
        const futureScale = 1 + futureIndex * 0.15;
        game.roomManager.loadPreset(futureIndex, futurePreset, futureScale, game, false);
      }
    }
    game.roomManager.createFogCurtain(index);
  }

  function updateCameraToRoom(game, index) {
    const origin = game.roomManager.roomOrigin(index);
    game.camera.setTarget(origin.clone());
  }

  function spawnEnemies(game, count) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 15;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      window.DungeonCore?.delegates?.spawnEnemyAt?.(game, new BABYLON.Vector3(x, CONFIG.ENEMY_SIZE / 2, z), 1, game.roomsCleared, { type: 'melee' });
    }
  }

  function spawnEnemyAt(game, position, scale, roundIndex, options = {}) {
    const type = options.type || 'melee';
    let mesh;
    let damage = Math.floor(12 * scale);
    let speed = CONFIG.ENEMY_SPEED;
    let hp = Math.floor(CONFIG.ENEMY_HP * scale);
    let shootCooldown = 1.5;
    let shootTimer = 0.5;
    let range = 30;
    let velocity = new BABYLON.Vector3(0, 0, 0);
    let bossData = null;

    if (type === 'boss_jumper') {
      mesh = BABYLON.MeshBuilder.CreateSphere('boss_jumper', { diameter: 4.5 }, game.scene);
      damage = Math.floor(25 * scale);
      speed = CONFIG.ENEMY_SPEED * 0.5;
      hp = Math.floor(CONFIG.ENEMY_HP * 8 * scale);
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff0000');
      mat.emissiveColor = new BABYLON.Color3(1, 0.1, 0.1);
      mesh.material = mat;
      bossData = { jumpTimer: 3, jumpCooldown: 4, isJumping: false, jumpPhase: 0, jumpDuration: 1.0, startPos: null, targetPos: null };
    } else if (type === 'boss_spawner') {
      mesh = BABYLON.MeshBuilder.CreateCylinder('boss_spawner', { diameter: 4, height: 5, tessellation: 8 }, game.scene);
      damage = Math.floor(20 * scale);
      speed = CONFIG.ENEMY_SPEED * 0.4;
      hp = Math.floor(CONFIG.ENEMY_HP * 7 * scale);
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#880088');
      mat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.5);
      mesh.material = mat;
      bossData = { spawnTimer: 4, spawnCooldown: 4 };
    } else if (type === 'boss_spikes') {
      mesh = BABYLON.MeshBuilder.CreateBox('boss_spikes', { width: 4, height: 3.5, depth: 4 }, game.scene);
      damage = Math.floor(22 * scale);
      speed = CONFIG.ENEMY_SPEED * 0.6;
      hp = Math.floor(CONFIG.ENEMY_HP * 6 * scale);
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#cc2222');
      mat.emissiveColor = new BABYLON.Color3(0.8, 0.1, 0.1);
      mesh.material = mat;
      bossData = { spikeTimer: 6, spikeCooldown: 6, activeSpikes: [] };
    } else if (type === 'turret') {
      mesh = BABYLON.MeshBuilder.CreateCylinder('enemy_turret', { diameterTop: 0, diameterBottom: 2.2, height: 2.4, tessellation: 4 }, game.scene);
      mesh.rotation.y = Math.PI / 4;
      damage = Math.floor(15 * scale);
      speed = 0;
      hp = Math.floor(CONFIG.ENEMY_HP * 1.3 * scale);
      shootCooldown = 1.0;
      range = 35;
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff66ff');
      mat.emissiveColor = new BABYLON.Color3(1, 0.4, 1);
      mesh.material = mat;
    } else if (type === 'bouncer') {
      mesh = BABYLON.MeshBuilder.CreateSphere('enemy_bouncer', { diameter: 2.4 }, game.scene);
      damage = Math.floor(12 * scale);
      speed = CONFIG.ENEMY_SPEED * 1.4;
      hp = Math.floor(CONFIG.ENEMY_HP * 1.0 * scale);
      const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#66ccff');
      mat.emissiveColor = new BABYLON.Color3(0.3, 0.6, 1.0);
      mesh.material = mat;
      const dir = new BABYLON.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      velocity = dir.scale(speed);
    } else {
        // Base zombie: try to instantiate glTF model; fallback to box if not ready
        const zombieInst = window.DungeonEnemies?.zombieModel?.createInstance?.(game);
        if (zombieInst) {
          mesh = zombieInst.mesh;
          mesh.position = position.clone();
          mesh.getChildMeshes().forEach(m => { m.material = window.DungeonEnemies?.zombieModel?.getTintMaterial?.(game); });
        } else {
          mesh = BABYLON.MeshBuilder.CreateBox('enemy', { size: CONFIG.ENEMY_SIZE * 1.6 }, game.scene);
          const mat = window.DungeonCore?.delegates?.createMaterial?.(game, '#ff0000');
          mat.emissiveColor = new BABYLON.Color3(1, 0, 0);
          mesh.material = mat;
        }
    }

    mesh.position = position.clone();
    game.glow.addIncludedOnlyMesh(mesh);

    const obj = {
      mesh,
      type,
      hp,
      maxHp: hp,
      speed,
      damage,
      velocity,
      active: options.active !== false,
      roomIndex: roundIndex,
      shootCooldown,
      shootTimer,
      range,
      stuckCounter: 0,
      unstuckVector: null,
      stunnedUntil: 0,
      bossData,
      healthBar: null,
        animIdle: null,
        animAttacks: [],
        attacking: false,
        attackCooldown: 0,
    };
      // Attach animations if zombie model is active
      if (mesh && window.DungeonEnemies?.zombieModel?.applyAnimationsToEnemy) {
        window.DungeonEnemies.zombieModel.applyAnimationsToEnemy(obj);
      }
    if (options.active === false) mesh.isVisible = false;
    game.enemies.push(obj);
    return obj;
  }

  function advanceRoom(game) {
    document.getElementById('bonusScreen').classList.add('hidden');
    window.DungeonCore?.delegates?.setMusicMuffled?.(game, false);
    game.roomsCleared++;
    game.currentWave = (game.currentWave || 0) + 1;
    game.doorOpen = false;
    const prevIndex = game.roomsCleared - 1;
    const nextIndex = game.roomsCleared;
    const nextRoom = game.roomManager.rooms[nextIndex];
    if (nextRoom) {
      nextRoom.enemies.forEach(e => { if (e.mesh) { e.mesh.isVisible = true; e.active = true; } });
      nextRoom.hazards.forEach(h => { if (h.mesh) h.mesh.isVisible = true; });
    }
    const prevRoom = game.roomManager.rooms[prevIndex];
    if (prevRoom && prevRoom.fogCurtain) prevRoom.fogCurtain.dispose();
    const futureIndex = nextIndex + 2;
    if (!game.roomManager.rooms[futureIndex]) {
      const futureIsBoss = ((futureIndex + 1) % CONFIG.WAVES_UNTIL_BOSS === 0);
      const futurePreset = futureIsBoss ? ROOM_PRESETS[ROOM_PRESETS.length - 1] : ROOM_PRESETS[Math.floor(Math.random() * (ROOM_PRESETS.length - 1))];
      const futureScale = 1 + futureIndex * 0.15;
      game.roomManager.loadPreset(futureIndex, futurePreset, futureScale, game, false);
    }
    const oldIndex = nextIndex - 2;
    if (oldIndex >= 0 && game.roomManager.rooms[oldIndex]) {
      const oldRoom = game.roomManager.rooms[oldIndex];
      if (oldRoom.fogCurtain) oldRoom.fogCurtain.dispose();
      if (oldRoom.doorExit) oldRoom.doorExit.dispose();
      if (oldRoom.doorEntrance) oldRoom.doorEntrance.dispose();
      (oldRoom.meshes || []).forEach(m => { try { m.dispose(); } catch {} });
      (oldRoom.obstacles || []).forEach(o => { if (o.mesh) o.mesh.dispose(); });
      (oldRoom.hazards || []).forEach(h => { if (h.mesh) h.mesh.dispose(); });
      (oldRoom.enemies || []).forEach(e => { if (e.mesh) e.mesh.dispose(); const idx = game.enemies.indexOf(e); if (idx >= 0) game.enemies.splice(idx, 1); });
      delete game.roomManager.rooms[oldIndex];
    }
    if (nextRoom) {
      game.player.mesh.position = nextRoom.origin.clone().add(new BABYLON.Vector3(0, CONFIG.PLAYER_SIZE, CONFIG.ROOM_DEPTH/2 - 5));
    }
    const target = game.roomManager.roomOrigin(nextIndex).clone();
    const start = game.camera.target.clone();
    let t = 0;
    const duration = 0.6;
    const step = () => {
      if (t >= duration) {
        game.camera.setTarget(target);
        game.currentRoom = nextRoom;
        game.obstacles = nextRoom ? nextRoom.obstacles : [];
        game.hazards = nextRoom ? nextRoom.hazards : [];
        game.inBonusSelection = false;
        game.gameRunning = true;
        const bossEnemy = game.getBossInRoom(game.currentRoom);
        if (bossEnemy) window.DungeonCore?.delegates?.showBossIntro?.(game, bossEnemy.type);
        const now = performance.now() / 1000;
        game.lastMoveTime = now;
        game.idleTauntDone = false;
        game.roomDamageTaken = false;
        game.noDamageTauntDone = false;
        return;
      }
      const k = t / duration;
      const z = start.z + (target.z - start.z) * k;
      const x = start.x + (target.x - start.x) * k;
      const y = start.y + (target.y - start.y) * k;
      game.camera.setTarget(new BABYLON.Vector3(x, y, z));
      t += game.engine.getDeltaTime() / 1000;
      requestAnimationFrame(step);
    };
    step();
  }

  window.DungeonLogic.rooms.loadRandomRoom = loadRandomRoom;
  window.DungeonLogic.rooms.updateCameraToRoom = updateCameraToRoom;
  window.DungeonLogic.rooms.spawnEnemies = spawnEnemies;
  window.DungeonLogic.rooms.spawnEnemyAt = spawnEnemyAt;
  window.DungeonLogic.rooms.advanceRoom = advanceRoom;
})();
