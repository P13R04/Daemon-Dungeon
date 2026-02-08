// Input handling for keyboard, touch, and joystick
// Exports window.DungeonInput.handlers
(function() {
    'use strict';
    
    if (!window.DungeonInput) window.DungeonInput = {};
    if (!window.DungeonInput.handlers) window.DungeonInput.handlers = {};
    
    /**
     * Handle key down event
     * @param {Game} game - The game instance
     * @param {KeyboardEvent} event - The keyboard event
     */
    function onKeyDown(game, event) {
        const key = event.key.toLowerCase();
        game.inputMap[key] = true;
        if (event.code === 'Space') {
            window.DungeonCore?.delegates?.activateUltimate?.(game);
            event.preventDefault();
        }
    }

    /**
     * Handle key up event
     * @param {Game} game - The game instance
     * @param {KeyboardEvent} event - The keyboard event
     */
    function onKeyUp(game, event) {
        const key = event.key.toLowerCase();
        game.inputMap[key] = false;
    }

    /**
     * Handle touch start event
     * @param {Game} game - The game instance
     * @param {TouchEvent} event - The touch event
     */
    function onTouchStart(game, event) {
        const joystick = document.getElementById('joystickContainer');
        if (joystick.classList.contains('hidden')) return;
        
        const touch = event.touches[0];
        const base = document.getElementById('joystickBase');
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        game.joystickActive = true;
        updateJoystick(game, touch.clientX - centerX, touch.clientY - centerY);
    }

    /**
     * Handle touch move event
     * @param {Game} game - The game instance
     * @param {TouchEvent} event - The touch event
     */
    function onTouchMove(game, event) {
        if (!game.joystickActive) return;
        event.preventDefault();
        
        const joystick = document.getElementById('joystickContainer');
        if (joystick.classList.contains('hidden')) return;
        
        const touch = event.touches[0];
        const base = document.getElementById('joystickBase');
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        updateJoystick(game, touch.clientX - centerX, touch.clientY - centerY);
    }

    /**
     * Handle touch end event
     * @param {Game} game - The game instance
     * @param {TouchEvent} event - The touch event
     */
    function onTouchEnd(game, event) {
        game.joystickActive = false;
        game.joystickInput = { x: 0, y: 0 };
        document.getElementById('joystickStick').style.transform = 'translate(-50%, -50%)';
    }

    /**
     * Update joystick position and input values
     * @param {Game} game - The game instance
     * @param {number} x - X offset from center
     * @param {number} y - Y offset from center
     */
    function updateJoystick(game, x, y) {
        const radius = 75; // Base radius / 2
        const distance = Math.sqrt(x * x + y * y);
        const maxDistance = radius;
        
        let finalX = x;
        let finalY = y;
        
        if (distance > maxDistance) {
            finalX = (x / distance) * maxDistance;
            finalY = (y / distance) * maxDistance;
        }
        
        game.joystickInput.x = finalX / maxDistance;
        game.joystickInput.y = finalY / maxDistance;
        
        const offsetX = finalX + 75;
        const offsetY = finalY + 75;
        document.getElementById('joystickStick').style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    /**
     * Setup input event listeners
     * @param {Game} game - The game instance
     */
    function setupInputListeners(game) {
        window.addEventListener('keydown', (e) => onKeyDown(game, e));
        window.addEventListener('keyup', (e) => onKeyUp(game, e));
        window.addEventListener('touchstart', (e) => onTouchStart(game, e), { passive: false });
        window.addEventListener('touchmove', (e) => onTouchMove(game, e), { passive: false });
        window.addEventListener('touchend', (e) => onTouchEnd(game, e));
    }

    // Export public API
    window.DungeonInput.handlers.onKeyDown = onKeyDown;
    window.DungeonInput.handlers.onKeyUp = onKeyUp;
    window.DungeonInput.handlers.onTouchStart = onTouchStart;
    window.DungeonInput.handlers.onTouchMove = onTouchMove;
    window.DungeonInput.handlers.onTouchEnd = onTouchEnd;
    window.DungeonInput.handlers.updateJoystick = updateJoystick;
    window.DungeonInput.handlers.setupInputListeners = setupInputListeners;
    window.DungeonInput.handlers._loaded = true;
})();
