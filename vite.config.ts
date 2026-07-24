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
        // voice is now 5 locales (~16 MB total) — runtime-cached per locale on
        // first use (preload() warms the session's atoms at Start) instead of
        // precaching every language onto every device
        globPatterns: ['**/*.{js,css,html,svg,jpg}'],
        runtimeCaching: [
          {
            urlPattern: /\/audio\/voice\/.*\.mp3$/,
            handler: 'CacheFirst',
            // bump the suffix whenever atoms are regenerated: CacheFirst never
            // revalidates, so a rename is how cached devices pick up new audio
            options: { cacheName: 'voice-v2', expiration: { maxEntries: 500 } },
          },
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
