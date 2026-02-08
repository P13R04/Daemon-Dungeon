// Collision detection system
// Exports window.DungeonLogic.collisions
(function() {
    'use strict';
    
    if (!window.DungeonLogic) window.DungeonLogic = {};
    if (!window.DungeonLogic.collisions) window.DungeonLogic.collisions = {};

    /**
     * Check all collisions: projectiles, enemies, hazards, doors
     * @param {Game} game - The game instance
     */
    function checkCollisions(game) {
        if (!game.player) return;

        // Projectiles vs Enemies and Player
        checkProjectileCollisions(game);
        
        // Enemies vs Player
        checkEnemyCollisions(game);
        
        // Hazards vs Player
        checkHazardCollisions(game);
        
        // Door exit detection
        checkDoorCollision(game);
    }

    /**
     * Check projectile collisions
     * @param {Game} game - The game instance
     */
    function checkProjectileCollisions(game) {
        for (let pIdx = game.projectiles.length - 1; pIdx >= 0; pIdx--) {
            const proj = game.projectiles[pIdx];
            if (!proj.mesh) {
                game.projectiles.splice(pIdx, 1);
                continue;
            }

            if (proj.friendly) {
                // Friendly projectiles damage enemies
                for (const enemy of game.enemies) {
                    if (!enemy.mesh) continue;
                    const diff = proj.mesh.position.subtract(enemy.mesh.position);
                    if (diff.length() < 1.5) {
                        window.DungeonLogic?.damage?.damageEntity?.(game, enemy, proj.damage);
                        proj.mesh.dispose();
                        game.projectiles.splice(pIdx, 1);
                        break;
                    }
                }
            } else {
                // Enemy projectiles damage player
                const diff = proj.mesh.position.subtract(game.player.mesh.position);
                if (diff.length() < 1.5) {
                    const now = performance.now() / 1000;
                    if (now - game.player.lastDamageTime >= 0.5) {
                        window.DungeonLogic?.damage?.damagePlayer?.(game, proj.damage);
                    }
                    proj.mesh.dispose();
                    game.projectiles.splice(pIdx, 1);
                }
            }
        }
    }

    /**
     * Check enemy collision with player
     * @param {Game} game - The game instance
     */
    function checkEnemyCollisions(game) {
        const currentTime = performance.now() / 1000;
        const damageCooldown = 1.0; // seconds between hits

        game.enemies.forEach(enemy => {
            if (!enemy.mesh) return;
            const diff = enemy.mesh.position.subtract(game.player.mesh.position);
            if (diff.length() < 2) {
                if (currentTime - game.player.lastDamageTime >= damageCooldown) {
                    window.DungeonLogic?.damage?.damagePlayer?.(game, enemy.damage || 12);
                }
            }
        });
    }

    /**
     * Check hazard collision with player
     * @param {Game} game - The game instance
     */
    function checkHazardCollisions(game) {
        const now = performance.now() / 1000;

        game.hazards.forEach(h => {
            if (!h.mesh) return;
            
            const b = h.mesh.getBoundingInfo().boundingBox;
            h.aabb = { min: b.minimumWorld.clone(), max: b.maximumWorld.clone() };
            const p = game.player.mesh.position;
            const inside = (p.x > h.aabb.min.x && p.x < h.aabb.max.x && 
                            p.z > h.aabb.min.z && p.z < h.aabb.max.z);
            
            if (inside && now - h.lastHit >= h.cooldown) {
                window.DungeonLogic?.damage?.damagePlayer?.(game, h.damage);
                if (now - game.lastHazardTaunt >= 5) {
                    window.DungeonUI?.evilUi?.showEvilTaunt?.(game, 'hazard');
                    game.lastHazardTaunt = now;
                }
                h.lastHit = now;
            }
        });
    }

    /**
     * Check if player reached exit door
     * @param {Game} game - The game instance
     */
    function checkDoorCollision(game) {
        if (game.inBonusSelection || !game.doorOpen || !game.currentRoom || !game.currentRoom.doorExit) {
            return;
        }

        const distDoor = game.player.mesh.position.subtract(game.currentRoom.doorExit.position).length();
        if (distDoor < 3) {
            window.DungeonCore?.delegates?.showBonusSelection?.(game);
        }
    }

    // Export public API
    window.DungeonLogic.collisions.checkCollisions = checkCollisions;
    window.DungeonLogic.collisions.checkProjectileCollisions = checkProjectileCollisions;
    window.DungeonLogic.collisions.checkEnemyCollisions = checkEnemyCollisions;
    window.DungeonLogic.collisions.checkHazardCollisions = checkHazardCollisions;
    window.DungeonLogic.collisions.checkDoorCollision = checkDoorCollision;
    window.DungeonLogic.collisions._loaded = true;
})();
