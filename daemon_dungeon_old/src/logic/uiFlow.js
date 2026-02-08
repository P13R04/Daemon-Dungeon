(function(){
  window.DungeonLogic = window.DungeonLogic || {};
  window.DungeonLogic.uiFlow = window.DungeonLogic.uiFlow || {};
  window.DungeonLogic._loaded = true;

  function updateUI(game) {
    window.DungeonUI?.hud?.updateHud?.(game);
  }

  function onGameOver(game) {
    window.DungeonUI?.gameOver?.showGameOver?.(game);
  }

  function showBonusSelection(game) {
    if (!game.gameRunning || game.inBonusSelection) return;
    game.inBonusSelection = true;
    game.gameRunning = false;
    window.DungeonAudio?.music?.setMusicMuffled?.(game, true);
    window.DungeonUI?.bonus?.showBonusSelection?.(game, BONUS_OPTIONS);
  }

  function showBossIntro(game, bossType) {
    window.DungeonUI?.bossIntro?.showBossIntro?.(game, bossType);
  }

  function showDaemonMessage(game, msg) {
    window.DungeonUI?.hud?.showMessage?.(game, msg);
  }

  window.DungeonLogic.uiFlow.updateUI = updateUI;
  window.DungeonLogic.uiFlow.onGameOver = onGameOver;
  window.DungeonLogic.uiFlow.showBonusSelection = showBonusSelection;
  window.DungeonLogic.uiFlow.showBossIntro = showBossIntro;
  window.DungeonLogic.uiFlow.showDaemonMessage = showDaemonMessage;
})();
