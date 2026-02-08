// Enemy targeting and AI utilities
// Exports window.DungeonEnemies.targeting
(function() {
    'use strict';
    
    if (!window.DungeonEnemies) window.DungeonEnemies = {};
    if (!window.DungeonEnemies.targeting) window.DungeonEnemies.targeting = {};

    /**
     * Get the closest enemy to the player
     * @param {Game} game - The game instance
     * @returns {Object|null} The closest enemy or null
     */
    function getClosestEnemy(game) {
        if (!game.player || !game.enemies.length) return null;

        let closest = null;
        let minDist = Infinity;
        
        game.enemies.forEach(enemy => {
            if (!enemy.active || !enemy.mesh) return;
            
            const diff = enemy.mesh.position.subtract(game.player.mesh.position);
            const dist = diff.length();
            
            if (dist < minDist) {
                minDist = dist;
                closest = enemy;
            }
        });
        
        return closest;
    }

    /**
     * Get enemies within a radius
     * @param {Game} game - The game instance
     * @param {BABYLON.Vector3} center - Center point
     * @param {number} radius - Search radius
     * @returns {Array} Array of enemies within radius
     */
    function getEnemiesInRadius(game, center, radius) {
        return game.enemies.filter(enemy => {
            if (!enemy.active || !enemy.mesh) return false;
            const dist = BABYLON.Vector3.Distance(center, enemy.mesh.position);
            return dist <= radius;
        });
    }

    /**
     * Get visible enemies (line of sight check)
     * @param {Game} game - The game instance
     * @returns {Array} Array of visible enemies
     */
    function getVisibleEnemies(game) {
        if (!game.player || !game.scene) return [];

        return game.enemies.filter(enemy => {
            if (!enemy.active || !enemy.mesh) return false;
            
            const playerPos = game.player.mesh.position;
            const enemyPos = enemy.mesh.position;
            
            // Simple raycast check
            const direction = enemyPos.subtract(playerPos);
            const length = direction.length();
            
            if (length === 0) return false;
            direction.normalize();

            const ray = new BABYLON.Ray(playerPos, direction, length);
            const hit = game.scene.pickWithRay(ray, (mesh) => {
                return mesh === enemy.mesh;
            });

            return hit && hit.hit && hit.pickedMesh === enemy.mesh;
        });
    }

    /**
     * Get enemy at a specific direction from player
     * @param {Game} game - The game instance
     * @param {number} angle - Direction angle in radians
     * @param {number} tolerance - Angular tolerance in radians
     * @returns {Object|null} Enemy in that direction or null
     */
    function getEnemyInDirection(game, angle, tolerance = Math.PI / 4) {
        if (!game.player) return null;

        let bestEnemy = null;
        let bestAngleDiff = tolerance;

        game.enemies.forEach(enemy => {
            if (!enemy.active || !enemy.mesh) return;

            const diff = enemy.mesh.position.subtract(game.player.mesh.position);
            const enemyAngle = Math.atan2(diff.x, diff.z);
            let angleDiff = Math.abs(enemyAngle - angle);

            // Normalize angle difference to [0, PI]
            if (angleDiff > Math.PI) {
                angleDiff = 2 * Math.PI - angleDiff;
            }

            if (angleDiff < bestAngleDiff) {
                bestAngleDiff = angleDiff;
                bestEnemy = enemy;
            }
        });

        return bestEnemy;
    }

    /**
     * Check if enemy is in melee range
     * @param {Game} game - The game instance
     * @param {Object} enemy - The enemy to check
     * @param {number} range - Melee range (default 3)
     * @returns {boolean} True if enemy is in range
     */
    function isEnemyInMeleeRange(game, enemy, range = 3) {
        if (!game.player || !enemy.mesh) return false;
        const dist = BABYLON.Vector3.Distance(game.player.mesh.position, enemy.mesh.position);
        return dist <= range;
    }

    /**
     * Check if enemy is in attack range based on player class
     * @param {Game} game - The game instance
     * @param {Object} enemy - The enemy to check
     * @returns {boolean} True if enemy is in attack range
     */
    function isEnemyInAttackRange(game, enemy) {
        if (!game.player || !enemy.mesh) return false;

        const dist = BABYLON.Vector3.Distance(game.player.mesh.position, enemy.mesh.position);

        if (game.player.class === 'mage') {
            return dist <= 20; // Ranged
        } else if (game.player.class === 'knight') {
            return dist <= 6; // Melee with sweep
        } else if (game.player.class === 'rogue') {
            return dist <= 3; // Close melee
        }

        return false;
    }

    // Export public API
    window.DungeonEnemies.targeting.getClosestEnemy = getClosestEnemy;
    window.DungeonEnemies.targeting.getEnemiesInRadius = getEnemiesInRadius;
    window.DungeonEnemies.targeting.getVisibleEnemies = getVisibleEnemies;
    window.DungeonEnemies.targeting.getEnemyInDirection = getEnemyInDirection;
    window.DungeonEnemies.targeting.isEnemyInMeleeRange = isEnemyInMeleeRange;
    window.DungeonEnemies.targeting.isEnemyInAttackRange = isEnemyInAttackRange;
    window.DungeonEnemies.targeting._loaded = true;
})();
