// Global HUD helpers (non-module)
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.hud = {
    updateHud(game){
      try {
        const hpPct = (game.player.hp / game.player.maxHp * 100);
        const bar = document.getElementById('healthBar');
        const text = document.getElementById('healthText');
        if (bar) bar.style.width = Math.max(0, Math.min(100, hpPct)) + '%';
        if (text) text.textContent = Math.ceil(Math.max(0, game.player.hp)) + '/' + game.player.maxHp;
        const waveEl = document.getElementById('waveText');
        if (waveEl) waveEl.textContent = game.currentWave;
        // Death check remains here to keep behavior intact
        if (game.player.hp <= 0 && !game.gameOver) {
          game.gameOver = true;
          window.DungeonCore?.delegates?.onGameOver?.(game);
        }
      } catch {}
    },
    showMessage(game, msg){
      try {
        const container = document.getElementById('daemonMessage');
        const txt = document.getElementById('daemonText');
        if (!container || !txt) return;
        txt.textContent = msg;
        container.classList.remove('hidden');
        if (game._hudMsgTimer) clearTimeout(game._hudMsgTimer);
        game._hudMsgTimer = setTimeout(() => {
          container.classList.add('hidden');
        }, 3000);
      } catch {}
    }
  };
})();