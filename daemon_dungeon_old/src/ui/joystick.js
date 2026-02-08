// Global Joystick UI toggles (non-module)
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.joystick = {
    showJoystick(){
      try { const el = document.getElementById('joystickContainer'); if (el) el.classList.remove('hidden'); } catch {}
    },
    hideJoystick(){
      try { const el = document.getElementById('joystickContainer'); if (el) el.classList.add('hidden'); } catch {}
    }
  };
})();