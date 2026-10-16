import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Matches the light-theme background (--bg) so the installed app's chrome blends in.
const THEME_COLOR = '#fff7e8';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      // public/ assets are already matched by globPatterns; avoid duplicate precache entries.
      includeManifestIcons: false,
      manifest: {
        name: 'Bobo – obědy',
        short_name: 'Bobo',
        description: 'Přihlašování na obědy',
        lang: 'cs',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fff7e8',
        theme_color: THEME_COLOR,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  build: {
    // Served by the Cloudflare Worker as static assets (worker/wrangler.jsonc).
    outDir: '../worker/public',
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` in worker/ (wrangler dev) listens on 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
