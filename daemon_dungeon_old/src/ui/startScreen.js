// Global Start/Level UI helpers (non-module)
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.start = {
    hideStartScreen(){
      try { const el = document.getElementById('startScreen'); if (el) el.classList.add('hidden'); } catch {}
    },
    showStartScreen(){
      try { const el = document.getElementById('startScreen'); if (el) el.classList.remove('hidden'); } catch {}
    },
    hideLevelUI(){
      try {
        const levelEl = document.getElementById('levelText');
        if (levelEl) {
          levelEl.textContent = '';
          levelEl.style.display = 'none';
          if (levelEl.parentElement) levelEl.parentElement.style.display = 'none';
        }
        const levelLabel = document.getElementById('levelLabel');
        if (levelLabel) levelLabel.style.display = 'none';
      } catch {}
    }
  };
})();