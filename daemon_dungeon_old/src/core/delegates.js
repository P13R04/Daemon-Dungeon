/**
 * Central Delegates Module
 * All method calls from DaemonDungeon to external modules go through here
 * This centralizes all delegation points for easier maintenance
 */

(function() {
    'use strict';

    if (!window.DungeonCore) window.DungeonCore = {};
    if (!window.DungeonCore.delegates) window.DungeonCore.delegates = {};

    // ============= SCENE & SETUP =============
    const createScene = (game) => window.DungeonScene?.setup?.createScene?.(game);
    const setupPostProcessing = (game) => window.DungeonScene?.setup?.setupPostProcessing?.(game);
    const createVaporwaveBackground = (game) => window.DungeonScene?.setup?.createVaporwaveBackground?.(game);

    // ============= AUDIO =============
    const setupMusic = (game) => window.DungeonAudio?.music?.setupMusic?.(game);
    const setMusicMuffled = (game, enabled) => window.DungeonAudio?.music?.setMusicMuffled?.(game, enabled);
    const unlockAudio = (game, forcePlay) => window.DungeonAudio?.music?.unlockAudio?.(game, forcePlay);
    const loadAudioElement = (game, index) => window.DungeonAudio?.music?.loadAudioElement?.(game, index);
    const ensureAudioGraph = (game) => window.DungeonAudio?.music?.ensureAudioGraph?.(game);
    const playMusicIfReady = (game) => window.DungeonAudio?.music?.playMusicIfReady?.(game);

    // ============= PLAYER ENTITY & ANIMATION =============
    const createPlayer = (game) => window.DungeonEntities?.player?.createPlayer?.(game);
    const setupProgrammaticAnimations = (game) => window.DungeonEntities?.player?.setupProgrammaticAnimations?.(game);
    const playAnimation = (game, animName, loop) => window.DungeonEntities?.player?.playAnimation?.(game, animName, loop);

    // ============= PLAYER MOVEMENT & COMBAT =============
    const updatePlayer = (game, deltaTime) => window.DungeonPlayer?.movement?.updatePlayer?.(game, deltaTime);
    const playerAttack = (game, targetEnemy) => window.DungeonCombat?.ranged?.playerAttack?.(game, targetEnemy);
    const playerTankAttack = (game, targetEnemy) => window.DungeonCombat?.melee?.tankAttack?.(game, targetEnemy);
    const playerRogueAttack = (game) => window.DungeonCombat?.melee?.rogueAttack?.(game);
    const updateMeleeEffects = (game, deltaTime) => window.DungeonCombat?.melee?.updateMeleeEffects?.(game, deltaTime);

    // ============= ENEMY LOGIC =============
    const updateEnemies = (game, deltaTime) => window.DungeonAI?.enemies?.updateEnemies?.(game, deltaTime);
    const spawnEnemyAt = (game, position, scale, roundIndex, options) => 
        window.DungeonLogic?.rooms?.spawnEnemyAt?.(game, position, scale, roundIndex, options);
    const spawnEnemies = (game, count) => window.DungeonLogic?.rooms?.spawnEnemies?.(game, count);
    const getClosestEnemy = (game) => window.DungeonEnemies?.targeting?.getClosestEnemy?.(game);
    const spawnEnemyProjectile = (game, enemy, dir) => window.DungeonCombat?.ranged?.spawnEnemyProjectile?.(game, enemy, dir);

    // ============= PROJECTILES & EFFECTS =============
    const updateProjectiles = (game, deltaTime) => window.DungeonCombat?.ranged?.updateProjectiles?.(game, deltaTime);
    const spawnShockwave = (game, origin, damage) => window.DungeonCombat?.boss?.spawnShockwave?.(game, origin, damage);
    const spawnTemporarySpikes = (game, boss, bossData) => window.DungeonCombat?.boss?.spawnTemporarySpikes?.(game, boss, bossData);

    // ============= BOSS COMBAT =============
    const updateBossAbilities = (game, deltaTime) => window.DungeonCombat?.boss?.updateBossAbilities?.(game, deltaTime);

    // ============= COLLISIONS & PHYSICS =============
    const checkCollisions = (game) => window.DungeonLogic?.collisions?.checkCollisions?.(game);
    const clampPlayerBounds = (game) => window.DungeonPhysics?.collision?.clampPlayerBounds?.(game);
    const clampEntityBounds = (game, entity) => window.DungeonPhysics?.collision?.clampEntityBounds?.(game, entity);
    const resolveEntityObstacleCollision = (game, mesh, prevPos, radius, bounceAxis, velocityRef) => 
        window.DungeonPhysics?.collision?.resolveEntityObstacleCollision?.(game, mesh, prevPos, radius, bounceAxis, velocityRef);

    // ============= ROOM MANAGEMENT =============
    const loadRandomRoom = (game, index) => window.DungeonLogic?.rooms?.loadRandomRoom?.(game, index);
    const updateCameraToRoom = (game, index) => window.DungeonLogic?.rooms?.updateCameraToRoom?.(game, index);
    const advanceRoom = (game) => window.DungeonLogic?.rooms?.advanceRoom?.(game);

    // ============= UI =============
    const updateUI = (game) => window.DungeonLogic?.uiFlow?.updateUI?.(game);
    const onGameOver = (game) => window.DungeonLogic?.uiFlow?.onGameOver?.(game);
    const showBonusSelection = (game) => window.DungeonLogic?.uiFlow?.showBonusSelection?.(game);
    const ensureBossIntroUI = (game) => window.DungeonUI?.bossIntro?.ensureBossIntroUI?.(game);
    const ensureEvilUI = (game) => window.DungeonUI?.evilUi?.ensureEvilUI?.(game);
    const showEvilTaunt = (game, kind) => window.DungeonUI?.evilUi?.showEvilTaunt?.(game, kind);

    // ============= ULTIMATE & PASSIVES =============
    const initUltimateState = (game) => window.DungeonLogic?.ultimate?.initUltimateState?.(game);
    const ensureUltimateUI = (game) => window.DungeonLogic?.ultimate?.ensureUltimateUI?.(game);
    const updateUltimateUI = (game) => window.DungeonLogic?.ultimate?.updateUltimateUI?.(game);
    const activateUltimate = (game) => window.DungeonLogic?.ultimate?.activateUltimate?.(game);
    const updateUltimateState = (game, dt) => window.DungeonLogic?.ultimate?.updateUltimateState?.(game, dt);
    const updatePassives = (game, dt) => window.DungeonLogic?.ultimate?.updatePassives?.(game, dt);

    // ============= VISUALS & MATERIALS =============
    const createMaterial = (game, color) => window.DungeonUtils?.visuals?.createMaterial?.(color, game.scene);
    const applyRoomClipping = (game, material) => {
        if (!game?.currentRoom) return;
        return window.DungeonUtils?.visuals?.applyRoomClipping?.(material, game.currentRoom.origin, CONFIG.ROOM_WIDTH, CONFIG.ROOM_DEPTH);
    };
    const createSweepWedge = (game, halfAngle, color) => 
        window.DungeonUtils?.visuals?.createSweepWedge?.(game.scene, halfAngle, color);
    const hexToRgb = (hex) => window.DungeonUtils?.visuals?.hexToRgb?.(hex);

    // Export all delegates
    window.DungeonCore.delegates = {
        // Scene & Setup
        createScene,
        setupPostProcessing,
        createVaporwaveBackground,
        
        // Audio
        setupMusic,
        setMusicMuffled,
        unlockAudio,
        loadAudioElement,
        ensureAudioGraph,
        playMusicIfReady,
        
        // Player
        createPlayer,
        setupProgrammaticAnimations,
        playAnimation,
        updatePlayer,
        
        // Combat
        playerAttack,
        playerTankAttack,
        playerRogueAttack,
        updateMeleeEffects,
        updateBossAbilities,
        spawnShockwave,
        spawnTemporarySpikes,
        
        // Enemies
        updateEnemies,
        spawnEnemyAt,
        spawnEnemies,
        getClosestEnemy,
        spawnEnemyProjectile,
        
        // Projectiles
        updateProjectiles,
        
        // Physics & Collision
        checkCollisions,
        clampPlayerBounds,
        clampEntityBounds,
        resolveEntityObstacleCollision,
        
        // Rooms
        loadRandomRoom,
        updateCameraToRoom,
        advanceRoom,
        
        // UI
        updateUI,
        onGameOver,
        showBonusSelection,
        ensureBossIntroUI,
        ensureEvilUI,
        showEvilTaunt,
        
        // Visuals
        createMaterial,
        applyRoomClipping,
        createSweepWedge,
        hexToRgb,
        // Ultimates & passives
        initUltimateState,
        ensureUltimateUI,
        updateUltimateUI,
        activateUltimate,
        updateUltimateState,
        updatePassives,
    };

    window.DungeonCore._loaded = true;
})();
