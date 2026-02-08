// Global Bonus selection UI (non-module)
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.bonus = {
    showBonusSelection(game, options){
      try {
        const list = document.getElementById('bonusList');
        if (!list) return;
        list.innerHTML = '';
        const picks = [...options].sort(() => Math.random() - 0.5).slice(0,3);
        picks.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'class-btn bonus-btn';
          btn.textContent = opt.label;
          btn.addEventListener('click', () => {
            try { opt.apply(game); } catch {}
            const scr = document.getElementById('bonusScreen');
            if (scr) scr.classList.add('hidden');
            try { window.DungeonCore?.delegates?.advanceRoom?.(game); } catch {}
          });
          list.appendChild(btn);
        });
        const scr = document.getElementById('bonusScreen');
        if (scr) scr.classList.remove('hidden');
      } catch {}
    }
  };
})();