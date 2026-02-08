(function(){
  window.DungeonAudio = window.DungeonAudio || {};
  window.DungeonAudio.music = window.DungeonAudio.music || {};
  window.DungeonAudio._loaded = true;

  function setupMusic(game) {
    if (game.musicInitialized) return;
    game.musicInitialized = true;
    loadAudioElement(game, 0);
  }

  function setMusicMuffled(game, enabled) {
    game.musicMuffled = enabled;
    const targetVolume = enabled ? game.musicBaseVolume * 0.55 : game.musicBaseVolume;
    if (game.audioEl) {
      game.audioEl.volume = targetVolume;
    }
    ensureAudioGraph(game);
    if (game.musicFilter && game.audioCtx) {
      const targetFreq = enabled ? 800 : 18000;
      const now = game.audioCtx.currentTime;
      try {
        game.musicFilter.frequency.cancelScheduledValues(now);
        game.musicFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
      } catch (_) {
        game.musicFilter.frequency.value = targetFreq;
      }
    }
  }

  function loadAudioElement(game, index) {
    if (index >= (game.musicCandidates ? game.musicCandidates.length : 0)) {
      console.error('Music: no playable source found');
      game.musicInitialized = false;
      return;
    }
    // Stop and clear previous element if any to avoid duplicates
    if (game.audioEl) {
      try { game.audioEl.pause(); } catch {}
      try { game.audioEl.src = ''; } catch {}
    }
    const path = game.musicCandidates[index];
    game.currentMusicPath = path;
    const audio = new Audio(path);
    audio.loop = true;
    audio.volume = game.musicBaseVolume;
    audio.preload = 'auto';
    audio.addEventListener('canplaythrough', () => {
      game.audioEl = audio;
      ensureAudioGraph(game);
      setMusicMuffled(game, game.musicMuffled);
      playMusicIfReady(game);
    }, { once: true });
    audio.addEventListener('error', () => {
      console.error('Audio element load error, trying next:', path);
      loadAudioElement(game, index + 1);
    }, { once: true });
    audio.load();
  }

  function ensureAudioGraph(game) {
    if (!game.audioEl) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!game.audioCtx) {
      game.audioCtx = new AudioCtx();
    }
    if (game.audioCtx.state === 'suspended' && game.audioUnlocked) {
      game.audioCtx.resume();
    }
    if (!game.musicSource || game.musicSource.mediaElement !== game.audioEl) {
      game.musicSource = game.audioCtx.createMediaElementSource(game.audioEl);
      game.musicFilter = null;
    }
    if (!game.musicFilter) {
      game.musicFilter = game.audioCtx.createBiquadFilter();
      game.musicFilter.type = 'lowpass';
      game.musicFilter.frequency.value = game.musicMuffled ? 800 : 18000;
      game.musicFilter.Q.value = 0.8;
      game.musicSource.disconnect();
      game.musicSource.connect(game.musicFilter);
      game.musicFilter.connect(game.audioCtx.destination);
    }
  }

  function playMusicIfReady(game) {
    if (!game.audioEl) return;
    try {
      const p = game.audioEl.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { game.pendingMusicPlay = false; }).catch(() => { game.pendingMusicPlay = true; });
      } else {
        game.pendingMusicPlay = false;
      }
    } catch (_) {
      game.pendingMusicPlay = true;
    }
  }

  function unlockAudio(game, forcePlay) {
    if (game.audioUnlocked) {
      if (forcePlay) {
        if (BABYLON.Engine.audioEngine && BABYLON.Engine.audioEngine.audioContext && BABYLON.Engine.audioEngine.audioContext.state === 'suspended') {
          BABYLON.Engine.audioEngine.audioContext.resume();
        }
        playMusicIfReady(game);
      }
      return;
    }
    try {
      if (BABYLON.Engine.audioEngine) {
        BABYLON.Engine.audioEngine.unlock();
        if (BABYLON.Engine.audioEngine.audioContext && BABYLON.Engine.audioEngine.audioContext.state === 'suspended') {
          BABYLON.Engine.audioEngine.audioContext.resume();
        }
      }
      if (game.audioCtx && game.audioCtx.state === 'suspended') {
        game.audioCtx.resume();
      }
    } catch (e) {
      console.warn('Audio unlock failed', e);
    }
    game.audioUnlocked = true;
    if (forcePlay || game.pendingMusicPlay) {
      playMusicIfReady(game);
    }
    if (game.audioEl) {
      game.pendingMusicPlay = false;
    }
  }

  window.DungeonAudio.music.setupMusic = setupMusic;
  window.DungeonAudio.music.setMusicMuffled = setMusicMuffled;
  window.DungeonAudio.music.loadAudioElement = loadAudioElement;
  window.DungeonAudio.music.ensureAudioGraph = ensureAudioGraph;
  window.DungeonAudio.music.playMusicIfReady = playMusicIfReady;
  window.DungeonAudio.music.unlockAudio = unlockAudio;
})();
