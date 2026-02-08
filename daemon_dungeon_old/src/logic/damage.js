// Damage and health management
// Exports window.DungeonLogic.damage
(function() {
    'use strict';
    
    if (!window.DungeonLogic) window.DungeonLogic = {};
    if (!window.DungeonLogic.damage) window.DungeonLogic.damage = {};

    /**
     * Damage the player
     * @param {Game} game - The game instance
     * @param {number} amount - Damage amount
     */
    function damagePlayer(game, amount) {
        if (!game.player) return;
        if (game.player.invulnerable) return;
        // Tank passive: partial damage reduction
        const cls = game.player.class || game.selectedClass;
        if (cls === 'knight' || cls === 'tank') {
            amount = Math.max(0, Math.floor(amount * 0.7));
        }
        
        game.player.hp -= amount;
        game.roomDamageTaken = true;
        game.player.lastDamageTime = performance.now() / 1000;

        // Check if dead
        if (game.player.hp <= 0) {
            game.player.hp = 0;
            game.gameRunning = false;
            game.gameOver = true;
            window.DungeonCore?.delegates?.onGameOver?.(game);
        }
    }

    /**
     * Damage an entity (enemy)
     * @param {Game} game - The game instance
     * @param {Object} entity - The entity to damage
     * @param {number} amount - Damage amount
     */
    function damageEntity(game, entity, amount) {
        if (!entity) return;
        
        entity.hp -= amount;
                // Rogue passive: lifesteal when dealing damage
                const cls2 = game.player?.class || game.selectedClass;
                if (cls2 === 'rogue') {
                    const heal = Math.floor(amount * 0.2);
                    healPlayer(game, heal);
                }
        
        // Update health bar
        game.updateEnemyHealthBar(entity);
        
        // Check if dead
        if (entity.hp <= 0) {
            entity.hp = 0;
            killEntity(game, entity);
        }
    }

    /**
     * Kill an entity (handle cleanup and rewards)
     * @param {Game} game - The game instance
     * @param {Object} entity - The entity to kill
     */
    function killEntity(game, entity) {
        if (!entity.mesh) return;

        // Cleanup
        if (entity.healthBar) {
            entity.healthBar.dispose();
            entity.healthBar = null;
        }
        
        entity.mesh.dispose();
        entity.mesh = null;
        entity.active = false;

        // Remove from enemies array
        const idx = game.enemies.indexOf(entity);
        if (idx >= 0) {
            game.enemies.splice(idx, 1);
        }

        // Check if room is clear
        const roomHasEnemies = game.enemies.some(e => e.active && e.mesh);
        if (!roomHasEnemies && game.currentRoom) {
            onRoomClear(game);
        }
    }

    /**
     * Handle room clear event
     * @param {Game} game - The game instance
     */
    function onRoomClear(game) {
        if (game.doorOpen) return; // Already opened
        
        game.doorOpen = true;
        game.idleTauntDone = false;
        game.noDamageTauntDone = false;
        game.roomDamageTaken = false;
        
        // Open the exit door
        if (game.roomManager && game.currentRoom) {
            game.roomManager.openDoor(game.roomManager.currentIndex);
        }

        // Show room clear message
        if (!game.roomDamageTaken) {
            window.DungeonUI?.evilUi?.showEvilTaunt?.(game, 'no_damage');
        }
    }

    /**
     * Heal the player
     * @param {Game} game - The game instance
     * @param {number} amount - Heal amount
     */
    function healPlayer(game, amount) {
        if (!game.player) return;
        game.player.hp = Math.min(game.player.hp + amount, game.player.maxHp);
    }

    /**
     * Get player health as percentage
     * @param {Game} game - The game instance
     * @returns {number} Health percentage (0-100)
     */
    function getPlayerHealthPercent(game) {
        if (!game.player) return 0;
        return Math.round((game.player.hp / game.player.maxHp) * 100);
    }

    // Export public API
    window.DungeonLogic.damage.damagePlayer = damagePlayer;
    window.DungeonLogic.damage.damageEntity = damageEntity;
    window.DungeonLogic.damage.killEntity = killEntity;
    window.DungeonLogic.damage.onRoomClear = onRoomClear;
    window.DungeonLogic.damage.healPlayer = healPlayer;
    window.DungeonLogic.damage.getPlayerHealthPercent = getPlayerHealthPercent;
    window.DungeonLogic.damage._loaded = true;
})();
