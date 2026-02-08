// Player creation and animation utilities
// Exports window.DungeonEntities.player
(function() {
    'use strict';
    
    if (!window.DungeonEntities) window.DungeonEntities = {};
    if (!window.DungeonEntities.player) window.DungeonEntities.player = {};
    
    /**
     * Create the player mesh and object
     * @param {Game} game - The game instance
     * @returns {Promise<void>}
     */
    function createPlayer(game) {
        return new Promise((resolve) => {
            // Clean up existing player if any
            if (game.player && game.player.mesh) {
                try {
                    game.player.mesh.dispose();
                } catch (e) {}
            }
            if (game.player && game.player.trail) {
                try {
                    game.player.trail.stop();
                    game.player.trail.dispose();
                } catch (e) {}
            }
            game.player = null;

            // Clear any existing sweeps when creating new player
            if (game.sweeps) {
                game.sweeps.forEach(s => {
                    if (s.mesh) {
                        try {
                            s.mesh.dispose();
                        } catch (e) {}
                    }
                    if (s.outline) {
                        try {
                            s.outline.dispose();
                        } catch (e) {}
                    }
                });
                game.sweeps = [];
            }

            // Simple placeholder cylinder with subtle neon rim
            const placeholder = BABYLON.MeshBuilder.CreateCylinder('player', { 
                diameter: game.CONFIG.PLAYER_SIZE * 1.4, 
                height: game.CONFIG.PLAYER_SIZE * 2.4, 
                tessellation: 12 
            }, game.scene);
            placeholder.position = new BABYLON.Vector3(0, game.CONFIG.PLAYER_SIZE * 1.2, 0);
            const baseScale = 1.6; // smaller size
            placeholder.scaling = new BABYLON.Vector3(baseScale, baseScale, baseScale);
            const playerMat = window.DungeonCore?.delegates?.createMaterial?.(game, '#3fffdc');
            if (playerMat) {
                playerMat.emissiveColor = new BABYLON.Color3(0.2, 0.5, 0.8);
                placeholder.material = playerMat;
            }
            placeholder.renderOutline = true;
            placeholder.outlineColor = new BABYLON.Color3(0.15, 0.45, 1.0);
            placeholder.outlineWidth = 0.04;
            placeholder.renderOverlay = true;
            placeholder.overlayColor = new BABYLON.Color3(0.1, 0.3, 0.8);
            placeholder.overlayAlpha = 0.08;
            game.glow.addIncludedOnlyMesh(placeholder);

            // Trail particles for movement velocity
            const trail = new BABYLON.ParticleSystem('playerTrail', 200, game.scene);
            // Minimal 1x1 white pixel using a raw texture to avoid image decode issues
            const trailData = new Uint8Array([255, 255, 255, 255]);
            const trailTex = BABYLON.RawTexture.CreateRGBATexture(
                trailData,
                1,
                1,
                game.scene,
                false,
                false,
                BABYLON.Texture.NEAREST_SAMPLINGMODE
            );
            trail.particleTexture = trailTex;
            trail.emitter = placeholder;
            trail.minEmitBox = new BABYLON.Vector3(-0.2, -0.2, -0.2);
            trail.maxEmitBox = new BABYLON.Vector3(0.2, 0.2, 0.2);
            trail.minSize = 0.05; 
            trail.maxSize = 0.12;
            trail.minLifeTime = 0.25; 
            trail.maxLifeTime = 0.5;
            trail.emitRate = 120;
            trail.color1 = new BABYLON.Color4(0.2, 0.6, 1.0, 0.3);
            trail.color2 = new BABYLON.Color4(0.6, 0.2, 1.0, 0.25);
            trail.colorDead = new BABYLON.Color4(0.1, 0.1, 0.3, 0);
            trail.direction1 = new BABYLON.Vector3(-0.5, 0.2, -0.5);
            trail.direction2 = new BABYLON.Vector3(0.5, 0.1, 0.5);
            trail.minEmitPower = 0.2; 
            trail.maxEmitPower = 0.5;
            trail.updateSpeed = 0.01;
            trail.isEmitting = false;
            trail.start();

            game.player = {
                mesh: placeholder,
                hp: game.CONFIG.PLAYER_HP,
                maxHp: game.CONFIG.PLAYER_HP,
                speed: game.CONFIG.PLAYER_SPEED,
                velocity: new BABYLON.Vector3(0, 0, 0),
                attackCooldown: 0,
                class: game.selectedClass,
                ultimateCooldown: 0,
                lastDamageTime: 0,
                multishot: 1,
                damageBonus: 0,
                rotationOffset: Math.PI,
                animations: {},
                currentAnimation: null,
                isAttacking: false,
                idleBobbingPhase: 0,
                initialY: placeholder.position.y,
                baseScale,
                attackPulse: 0,
                trail,
            };

            // Programmatic animations
            setupProgrammaticAnimations(game);
            resolve();
        });
    }

    /**
     * Setup procedural animation system for player
     * @param {Game} game - The game instance
     */
    function setupProgrammaticAnimations(game) {
        if (!game.player) {
            return;
        }

        // Create simple programmatic animations
        game.player.animations = {
            'idle': { type: 'bobbing', intensity: 0.05, speed: 2 },
            'run': { type: 'bounce', intensity: 0.2, speed: 4 },
            'attack': { type: 'pop', intensity: 0.3, speed: 3 }
        };
        
        // Save initial Y position for bobbing reference
        game.player.initialY = game.player.mesh.position.y;
        
        console.log("Programmatic animations setup, initial Y:", game.player.initialY);
        
        // Start with idle
        setTimeout(() => {
            playAnimation(game, 'idle', true);
        }, 300);
    }

    /**
     * Play a player animation
     * @param {Game} game - The game instance
     * @param {string} animationName - The animation name
     */
    function playAnimation(game, animationName) {
        if (!game.player) {
            return;
        }
        
        const animData = game.player.animations[animationName];
        if (!animData) {
            console.log(`Animation "${animationName}" not available`);
            return;
        }
        game.player.currentAnimation = animationName;
        console.log(`Playing animation: ${animationName}`);
    }

    // Export public API
    window.DungeonEntities.player.createPlayer = createPlayer;
    window.DungeonEntities.player.setupProgrammaticAnimations = setupProgrammaticAnimations;
    window.DungeonEntities.player.playAnimation = playAnimation;
    window.DungeonEntities.player._loaded = true;
})();
