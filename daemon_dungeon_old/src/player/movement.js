// Player movement and update logic
// Exports window.DungeonPlayer.movement
(function() {
    'use strict';
    
    if (!window.DungeonPlayer) window.DungeonPlayer = {};
    if (!window.DungeonPlayer.movement) window.DungeonPlayer.movement = {};

    /**
     * Update player movement and animations
     * @param {Game} game - The game instance
     * @param {number} deltaTime - Time since last frame (seconds)
     */
    function updatePlayer(game, deltaTime) {
        if (!game.player) return;
        
        // Calculate velocity from input
        calculateVelocity(game);
        
        // Apply movement with collision
        applyMovement(game, deltaTime);
        
        // Update animation and visual state
        updateAnimationAndVisuals(game, deltaTime);
        
        // Update cooldowns
        updateCooldowns(game, deltaTime);
        
        // Auto-attack based on class
        handleAutoAttack(game);
        
        // Handle ultimate ability
        handleUltimate(game);
    }

    /**
     * Calculate player velocity from input
     * @param {Game} game - The game instance
     */
    function calculateVelocity(game) {
        game.player.velocity = new BABYLON.Vector3(0, 0, 0);
        
        // Keyboard input (ZQSD or Arrows)
        if (game.inputMap['z'] || game.inputMap['ArrowUp']) {
            game.player.velocity.z -= game.player.speed;
        }
        if (game.inputMap['s'] || game.inputMap['ArrowDown']) {
            game.player.velocity.z += game.player.speed;
        }
        if (game.inputMap['q'] || game.inputMap['ArrowLeft']) {
            game.player.velocity.x += game.player.speed;
        }
        if (game.inputMap['d'] || game.inputMap['ArrowRight']) {
            game.player.velocity.x -= game.player.speed;
        }
        
        // Joystick input (mobile)
        if (game.joystickActive) {
            game.player.velocity.x -= game.joystickInput.x * game.player.speed;
            game.player.velocity.z += game.joystickInput.y * game.player.speed;
        }
    }

    /**
     * Apply movement with obstacle collision
     * @param {Game} game - The game instance
     */
    function applyMovement(game, deltaTime) {
        const prev = game.player.mesh.position.clone();
        // Normalize movement to be framerate-independent (baseline 60 FPS)
        const fps = (game.CONFIG && game.CONFIG.TARGET_FPS) ? game.CONFIG.TARGET_FPS : 60;
        const scale = deltaTime * fps;
        game.player.mesh.position.addInPlace(game.player.velocity.scale(scale));
        window.DungeonCore?.delegates?.resolveEntityObstacleCollision?.(game, game.player.mesh, prev, 0.8, false, null);
        window.DungeonCore?.delegates?.clampPlayerBounds?.(game);
    }

    /**
     * Update animation state and visual effects
     * @param {Game} game - The game instance
     * @param {number} deltaTime - Time since last frame
     */
    function updateAnimationAndVisuals(game, deltaTime) {
        const speedMag = game.player.velocity.length();
        const now = performance.now() / 1000;

        // Track idle time for taunts
        if (speedMag > 0.0001) {
            game.lastMoveTime = now;
        }
        
        // Show idle taunt after 10 seconds of no movement
        if (game.doorOpen && !game.idleTauntDone && now - game.lastMoveTime >= 10) {
            window.DungeonUI?.evilUi?.showEvilTaunt?.(game, 'idle');
            game.idleTauntDone = true;
        }

        // Update mesh scaling (stretch and attack pulse)
        const baseScale = game.player.baseScale || 1.6;
        const speedFactor = Math.min(1, speedMag / 0.25);
        const stretch = 1 + 0.25 * speedFactor;
        game.player.attackPulse = Math.max(0, game.player.attackPulse - deltaTime);
        const pulseFactor = 1 + 0.35 * (game.player.attackPulse / 0.25);
        
        game.player.mesh.scaling = new BABYLON.Vector3(
            baseScale * pulseFactor,
            baseScale * stretch * pulseFactor,
            baseScale * pulseFactor
        );

        // Update trail particles
        if (game.player.trail) {
            game.player.trail.isEmitting = speedMag > 0.02;
        }

        // Handle animations and rotation
        if (speedMag > 0) {
            // Running animation
            const angle = Math.atan2(game.player.velocity.x, game.player.velocity.z);
            const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            game.player.mesh.rotation.y = snappedAngle + (game.player.rotationOffset || 0);
            window.DungeonCore?.delegates?.playAnimation?.(game, 'run', true);

            // Bounce animation for running
            const bounceData = game.player.animations['run'];
            if (bounceData) {
                game.player.idleBobbingPhase += deltaTime * bounceData.speed;
                const bobbingAmount = Math.sin(game.player.idleBobbingPhase) * bounceData.intensity;
                game.player.mesh.position.y = game.player.initialY + bobbingAmount;
            }
        } else {
            // Idle animation
            window.DungeonCore?.delegates?.playAnimation?.(game, 'idle', true);

            const idleData = game.player.animations['idle'];
            if (idleData && game.player.currentAnimation === 'idle') {
                game.player.idleBobbingPhase += deltaTime * idleData.speed;
                const bobbingAmount = Math.sin(game.player.idleBobbingPhase) * idleData.intensity;
                game.player.mesh.position.y = game.player.initialY + bobbingAmount;
            }
        }
    }

    /**
     * Update cooldowns
     * @param {Game} game - The game instance
     */
    function updateCooldowns(game, deltaTime) {
        game.player.attackCooldown = Math.max(0, game.player.attackCooldown - deltaTime);
        game.player.ultimateCooldown = Math.max(0, game.player.ultimateCooldown - deltaTime);
    }

    /**
     * Handle auto-attack based on player class
     * @param {Game} game - The game instance
     */
    function handleAutoAttack(game) {
        if (game.player.attackCooldown > 0) return;

        const closestEnemy = window.DungeonEnemies?.targeting?.getClosestEnemy?.(game);
        if (!closestEnemy) return;

        if (game.player.class === 'mage') {
            // Mage: fires only when stationary
            if (game.player.velocity.length() === 0) {
                window.DungeonCore?.delegates?.playerAttack?.(game, closestEnemy);
                const mult = (game.player.attackSpeedMultiplier || 1);
                game.player.attackCooldown = Math.max(0.2, CONFIG.PLAYER_ATTACK_COOLDOWN / mult);
            }
        } else if (game.player.class === 'knight') {
            // Tank: cone sweep in front, medium melee range
            const ppos = game.player.mesh.position;
            const ediff = closestEnemy.mesh.position.subtract(ppos);
            ediff.y = 0;
            const dist = ediff.length();
            const maxReach = 6;
            
            if (dist <= maxReach) {
                window.DungeonCore?.delegates?.playerTankAttack?.(game, closestEnemy);
                game.player.attackCooldown = Math.max(0.5, CONFIG.PLAYER_ATTACK_COOLDOWN * 0.9);
            }
        } else if (game.player.class === 'rogue') {
            // Rogue: auto-aim melee
            const attacked = window.DungeonCore?.delegates?.playerRogueAttack?.(game);
            if (attacked) {
                game.player.attackCooldown = Math.max(0.3, CONFIG.PLAYER_ATTACK_COOLDOWN * 0.6);
            }
        }
    }

    /**
     * Handle ultimate ability
     * @param {Game} game - The game instance
     */
    function handleUltimate(game) {
        if (!game.inputMap[' ']) return;
        window.DungeonCore?.delegates?.activateUltimate?.(game);
        game.inputMap[' '] = false;
    }

    // Export public API
    window.DungeonPlayer.movement.updatePlayer = updatePlayer;
    window.DungeonPlayer.movement.calculateVelocity = calculateVelocity;
    window.DungeonPlayer.movement.applyMovement = applyMovement;
    window.DungeonPlayer.movement.updateAnimationAndVisuals = updateAnimationAndVisuals;
    window.DungeonPlayer.movement.updateCooldowns = updateCooldowns;
    window.DungeonPlayer.movement.handleAutoAttack = handleAutoAttack;
    window.DungeonPlayer.movement.handleUltimate = handleUltimate;
    window.DungeonPlayer.movement._loaded = true;
})();
