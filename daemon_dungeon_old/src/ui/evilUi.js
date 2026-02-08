// Global script (non-module) exposing evil UI helpers on window
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.evilUi = {
    ensureEvilUI(game){
      if (game._evilUiReady) return;
      game._evilUiReady = true;

      if (!document.getElementById('evilStyles')) {
        const style = document.createElement('style');
        style.id = 'evilStyles';
        style.textContent = `
        @keyframes evilFade {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        #evilContainer {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 18px;
            background: rgba(10, 10, 14, 0.88);
            border: 1px solid rgba(255, 0, 60, 0.45);
            box-shadow: 0 0 18px rgba(255,0,60,0.35);
            border-radius: 12px;
            width: 560px;
            color: #e2e2e2;
            font-family: 'IBM Plex Mono', 'Consolas', monospace;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.12s ease;
            z-index: 9998;
        }
        #evilContainer.active { opacity: 1; animation: evilFade 0.15s ease forwards; }
        #evilAvatar {
            width: 88px;
            height: 88px;
            flex-shrink: 0;
            background: url('images/evil_ai.png') center/cover no-repeat, url('images/ai.png') center/cover no-repeat, linear-gradient(135deg, #2a0b1e 0%, #0b0f2a 100%);
            border: 1px solid rgba(255,0,60,0.6);
            border-radius: 8px;
            box-shadow: 0 0 12px rgba(255,0,60,0.4);
        }
        #evilText {
            flex: 1;
            white-space: pre-wrap;
            line-height: 1.35;
            min-height: 54px;
            max-width: 400px;
        }
        `;
        document.head.appendChild(style);
      }

      if (!document.getElementById('evilContainer')) {
        const c = document.createElement('div');
        c.id = 'evilContainer';
        const avatar = document.createElement('div');
        avatar.id = 'evilAvatar';
        const text = document.createElement('div');
        text.id = 'evilText';
        c.appendChild(avatar);
        c.appendChild(text);
        document.body.appendChild(c);
      }
    },
    showEvilTaunt(game, kind = 'idle'){
      this.ensureEvilUI(game);
      const container = document.getElementById('evilContainer');
      const textEl = document.getElementById('evilText');
      if (!container || !textEl) return;

      const lines = {
        idle: [
          "Tu freezes déjà ? J'ai tout mon temps...",
          "Pause café ? Je peux attendre éternellement.",
          "L'immobilité, c'est ta nouvelle strat ?"
        ],
        no_damage: [
          "Zéro dégâts ? Chance ou compétence... j'observe.",
          "Intouchable ? On verra à la prochaine room.",
          "Joli, aucune égratignure. Ne t'habitue pas."
        ],
        hazard: [
          "Les pièges piquent, surprenant n'est-ce pas ?",
          "Tu adores marcher là où ça fait mal.",
          "Encore un pas et je facture la casse."
        ]
      };

      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const message = pick(lines[kind] || lines.idle);

      if (game._evilHideTimer) clearTimeout(game._evilHideTimer);
      if (game._evilTypeTimer) clearInterval(game._evilTypeTimer);
      container.classList.add('active');
      textEl.textContent = '';
      let idx = 0;
      const chars = message.split('');
      game._evilTypeTimer = setInterval(() => {
        if (idx >= chars.length) {
          clearInterval(game._evilTypeTimer);
          game._evilTypeTimer = null;
          game._evilHideTimer = setTimeout(() => {
            container.classList.remove('active');
          }, 2200);
          return;
        }
        textEl.textContent += chars[idx];
        idx++;
      }, 35);
    }
  };
})();
