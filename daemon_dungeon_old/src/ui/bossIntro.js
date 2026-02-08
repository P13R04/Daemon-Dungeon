// Global script (non-module) exposing boss intro helpers on window
(function(){
  window.DungeonUI = window.DungeonUI || {};
  window.DungeonUI.bossIntro = {
    ensureBossIntroUI(game){
      if (game._bossIntroReady) return;
      game._bossIntroReady = true;

      if (!document.getElementById('bossIntroStyles')) {
        const style = document.createElement('style');
        style.id = 'bossIntroStyles';
        style.textContent = `
        @keyframes bossPulse {
            0% { opacity: 0.05; }
            50% { opacity: 0.22; }
            100% { opacity: 0.05; }
        }
        #bossIntroContainer {
            position: fixed;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding-top: 14vh;
            pointer-events: none;
            gap: 10px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.15s ease;
            font-family: 'Orbitron', 'Segoe UI', sans-serif;
            text-transform: uppercase;
        }
        #bossIntroContainer.active { opacity: 1; }
        #bossIntroFlash {
            position: absolute;
            inset: 0;
            background: rgba(255, 0, 0, 0.18);
            animation: bossPulse 0.6s infinite;
        }
        #bossIntroTitle {
            color: #ff3333;
            font-size: 64px;
            letter-spacing: 8px;
            text-shadow: 0 0 18px rgba(255,0,0,0.8);
        }
        #bossIntroName {
            color: #ffffff;
            font-size: 36px;
            letter-spacing: 4px;
            text-shadow: 0 0 12px rgba(255,255,255,0.65);
        }
        `;
        document.head.appendChild(style);
      }

      if (!document.getElementById('bossIntroContainer')) {
        const container = document.createElement('div');
        container.id = 'bossIntroContainer';
        const flash = document.createElement('div');
        flash.id = 'bossIntroFlash';
        const title = document.createElement('div');
        title.id = 'bossIntroTitle';
        title.textContent = 'BOSS ROOM';
        const name = document.createElement('div');
        name.id = 'bossIntroName';
        name.textContent = '';
        container.appendChild(flash);
        container.appendChild(title);
        container.appendChild(name);
        document.body.appendChild(container);
      }
    },
    showBossIntro(game, bossType){
      this.ensureBossIntroUI(game);
      const container = document.getElementById('bossIntroContainer');
      const title = document.getElementById('bossIntroTitle');
      const nameEl = document.getElementById('bossIntroName');
      if (!container || !title || !nameEl) return;

      const names = {
        boss_jumper: 'BIT CRUSHER',
        boss_spawner: 'MACRO_MANCER',
        boss_spikes: 'STACK_OVERLORD'
      };
      const displayName = names[bossType] || 'UNKNOWN THREAT';
      title.textContent = 'BOSS ROOM';
      nameEl.textContent = displayName;

      container.classList.add('active');
      if (game._bossIntroTimer) clearTimeout(game._bossIntroTimer);
      game._bossIntroTimer = setTimeout(() => {
        container.classList.remove('active');
      }, 2200);
    }
  };
})();
