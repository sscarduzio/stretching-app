import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the build works both at sscarduzio.github.io/stretching-app/ and locally
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // offline support: precache the shell + voice atoms (~3.3 MB — voice must
    // work in a no-signal gym); music tracks (~8 MB) cache on first play
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.json is hand-maintained
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,jpg}', 'audio/voice/*.mp3'],
        runtimeCaching: [
          {
            urlPattern: /\/audio\/[^/]+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'music', expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
});
