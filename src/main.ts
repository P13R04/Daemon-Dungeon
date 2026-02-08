/**
 * Main entry point for Daemon Dungeon
 */

import { GameManager } from './core/GameManager';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('renderCanvas');
  
  if (!(canvas instanceof HTMLCanvasElement)) {
    console.error('Canvas element not found or invalid');
    return;
  }

  // Initialize game
  const game = GameManager.getInstance();
  
  try {
    await game.initialize(canvas);

    // Allow browser right-click context menu
    canvas.addEventListener('contextmenu', (e) => {
      // Allow right-click menu for debugging
      // Don't prevent default - let browser handle it
    });

    // Hide loading screen
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
    }
  } catch (error) {
    console.error('Failed to initialize game:', error);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.textContent = 'INITIALIZATION FAILED';
      loading.style.color = '#FF0000';
    }
  }
});
