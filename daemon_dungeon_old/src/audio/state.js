// Audio state and lifecycle management
// Exports window.DungeonAudio.state
(function() {
    'use strict';
    
    if (!window.DungeonAudio) window.DungeonAudio = {};
    if (!window.DungeonAudio.state) window.DungeonAudio.state = {};

    /**
     * Initialize audio state
     * @param {Game} game - The game instance
     */
    function initializeAudioState(game) {
        game.audioState = {
            unlocked: false,
            isMuted: false,
            isPlaying: false,
            isMuffled: false,
            currentVolume: 0.6,
            baseVolume: 0.6,
            
            // Playback state
            currentMusicPath: null,
            candidateIndex: 0,
            retries: 0,
            maxRetries: 3,
            
            // Timing
            lastUnlockAttempt: 0,
            lastPlayAttempt: 0
        };
    }

    /**
     * Set audio unlocked state
     * @param {Game} game - The game instance
     * @param {boolean} unlocked - Whether audio is unlocked
     */
    function setAudioUnlocked(game, unlocked) {
        if (game.audioState) {
            game.audioState.unlocked = unlocked;
            game.audioUnlocked = unlocked;
        }
    }

    /**
     * Set audio muffled state
     * @param {Game} game - The game instance
     * @param {boolean} muffled - Whether audio is muffled
     */
    function setAudioMuffled(game, muffled) {
        if (game.audioState) {
            game.audioState.isMuffled = muffled;
            game.musicMuffled = muffled;
        }
    }

    /**
     * Set audio playing state
     * @param {Game} game - The game instance
     * @param {boolean} playing - Whether audio is playing
     */
    function setAudioPlaying(game, playing) {
        if (game.audioState) {
            game.audioState.isPlaying = playing;
        }
    }

    /**
     * Update audio volume
     * @param {Game} game - The game instance
     * @param {number} volume - Volume level (0-1)
     */
    function setVolume(game, volume) {
        if (game.audioState) {
            game.audioState.currentVolume = Math.max(0, Math.min(1, volume));
            if (game.audioEl) {
                game.audioEl.volume = game.audioState.currentVolume;
            }
        }
    }

    /**
     * Get current audio state
     * @param {Game} game - The game instance
     * @returns {Object} Current audio state
     */
    function getAudioState(game) {
        return game.audioState || {};
    }

    /**
     * Check if audio is ready
     * @param {Game} game - The game instance
     * @returns {boolean} True if audio can be played
     */
    function isAudioReady(game) {
        if (!game.audioState) return false;
        return game.audioState.unlocked && game.audioEl && game.audioEl.readyState >= 2;
    }

    // Export public API
    window.DungeonAudio.state.initializeAudioState = initializeAudioState;
    window.DungeonAudio.state.setAudioUnlocked = setAudioUnlocked;
    window.DungeonAudio.state.setAudioMuffled = setAudioMuffled;
    window.DungeonAudio.state.setAudioPlaying = setAudioPlaying;
    window.DungeonAudio.state.setVolume = setVolume;
    window.DungeonAudio.state.getAudioState = getAudioState;
    window.DungeonAudio.state.isAudioReady = isAudioReady;
    window.DungeonAudio.state._loaded = true;
})();
