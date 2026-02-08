// Game state management and utilities
// Exports window.DungeonCore.state
(function() {
    'use strict';
    
    if (!window.DungeonCore) window.DungeonCore = {};
    if (!window.DungeonCore.state) window.DungeonCore.state = {};

    /**
     * Initialize game state
     * @param {Game} game - The game instance
     */
    function initializeState(game) {
        game.gameState = {
            isRunning: false,
            isGameOver: false,
            isPaused: false,
            inBonusSelection: false,
            doorOpen: false,
            audioUnlocked: false,
            
            // Player state
            playerClass: null,
            selectedBonus: null,
            
            // Room state
            currentRoomIndex: 0,
            roomsCleared: 0,
            currentWave: 0,
            
            // Progression
            score: 0,
            kills: 0,
            damageDealt: 0,
            damageTaken: 0,
            
            // Flags
            roomDamageTaken: false,
            noDamageTauntDone: false,
            idleTauntDone: false,
            lastHazardTaunt: 0,
            lastMoveTime: 0
        };
    }

    /**
     * Start a new game
     * @param {Game} game - The game instance
     * @param {string} playerClass - Selected player class
     */
    function startNewGame(game, playerClass) {
        initializeState(game);
        game.gameState.isRunning = true;
        game.gameState.playerClass = playerClass;
        game.gameState.currentRoomIndex = 0;
        game.selectedClass = playerClass;
    }

    /**
     * End game state
     * @param {Game} game - The game instance
     */
    function endGame(game) {
        game.gameState.isRunning = false;
        game.gameState.isGameOver = true;
    }

    /**
     * Reset game state
     * @param {Game} game - The game instance
     */
    function resetGameState(game) {
        initializeState(game);
    }

    /**
     * Get current game state
     * @param {Game} game - The game instance
     * @returns {Object} Current game state
     */
    function getState(game) {
        return game.gameState || {};
    }

    /**
     * Update game stat
     * @param {Game} game - The game instance
     * @param {string} stat - Stat name
     * @param {*} value - New value
     */
    function updateStat(game, stat, value) {
        if (game.gameState && stat in game.gameState) {
            game.gameState[stat] = value;
        }
    }

    /**
     * Increment game stat
     * @param {Game} game - The game instance
     * @param {string} stat - Stat name
     * @param {number} amount - Amount to increment
     */
    function incrementStat(game, stat, amount = 1) {
        if (game.gameState && stat in game.gameState) {
            if (typeof game.gameState[stat] === 'number') {
                game.gameState[stat] += amount;
            }
        }
    }

    // Export public API
    window.DungeonCore.state.initializeState = initializeState;
    window.DungeonCore.state.startNewGame = startNewGame;
    window.DungeonCore.state.endGame = endGame;
    window.DungeonCore.state.resetGameState = resetGameState;
    window.DungeonCore.state.getState = getState;
    window.DungeonCore.state.updateStat = updateStat;
    window.DungeonCore.state.incrementStat = incrementStat;
    window.DungeonCore.state._loaded = true;
})();
