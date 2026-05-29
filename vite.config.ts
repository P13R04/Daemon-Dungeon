import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    assetsDir: '.',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        entryFileNames: `daemon-v3.js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `[name].[ext]`,
        manualChunks(id) {
          if (id.includes('node_modules/@babylonjs/core')) return 'vendor-babylon-core';
          if (id.includes('node_modules/@babylonjs/gui')) return 'vendor-babylon-gui';
          if (id.includes('node_modules/@babylonjs/loaders')) return 'vendor-babylon-loaders';
          if (id.includes('node_modules/@babylonjs/havok')) return 'vendor-babylon-havok';
          if (id.includes('node_modules/mespeak')) return 'vendor-mespeak';
          if (id.includes('node_modules/@babylonjs')) return 'vendor-babylon';
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('/src/scene/CreditsScene') || id.includes('/src/scene/CodexScene') || id.includes('/src/scene/AchievementsScene') || id.includes('/src/scene/HighscoresScene')) {
            return 'scene-secondary';
          }
          if (id.includes('/src/systems/DevConsole')) return 'tools-devconsole';
          if (id.includes('/src/systems/HUDManager') || id.includes('/src/core/DaemonVoicelineManager') || id.includes('/src/ui/SettingsMenuBuilder')) return 'gameplay-core';
          if (id.includes('/src/tools/')) return 'tools';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
