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
    rollupOptions: {
      output: {
        entryFileNames: `daemon-v3.js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `[name].[ext]`,
        manualChunks(id) {
          if (id.includes('node_modules/@babylonjs')) return 'vendor-babylon';
          if (id.includes('node_modules')) return 'vendor';
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
