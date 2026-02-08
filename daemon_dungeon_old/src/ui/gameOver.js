// Global Game Over UI (non-module)
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.gameOver = {
    showGameOver(game){
      try {
        game.gameRunning = false;
        const scr = document.getElementById('gameOverScreen');
        const scoreEl = document.getElementById('finalScore');
        const roomsEl = document.getElementById('finalRooms');
        if (scr) scr.classList.remove('hidden');
        if (scoreEl) scoreEl.textContent = game.score;
        if (roomsEl) roomsEl.textContent = game.roomsCleared;
        // Optional: show daemon message via HUD module
        window.DungeonUI?.hud?.showMessage?.(game, "Suppression des données. Suivant...");
      } catch {}
    },
    hideGameOver(){
      try {
        const scr = document.getElementById('gameOverScreen');
        if (scr) scr.classList.add('hidden');
      } catch {}
    }
  };
})();