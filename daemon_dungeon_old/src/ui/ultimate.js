// Ultimate UI helpers
(function(){
  'use strict';
  if (!window.DungeonUI) window.DungeonUI = {};
  if (!window.DungeonUI.ultimate) window.DungeonUI.ultimate = {};

  function ensureUltimateButton(game){
    const btn = document.getElementById('ultimateButton');
    if (!btn) return;
    btn.addEventListener('touchstart', (e)=>{ e.preventDefault(); window.DungeonCore?.delegates?.activateUltimate?.(game); });
    btn.addEventListener('click', ()=> window.DungeonCore?.delegates?.activateUltimate?.(game));
  }

  window.DungeonUI.ultimate.ensureUltimateButton = ensureUltimateButton;
  window.DungeonUI.ultimate._loaded = true;
})();
