import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // prompt = não recarrega a página sozinho no meio da música.
      // O app aplica a atualização ao abrir o ícone quando nada estiver tocando.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        id: '/',
        name: 'Spot Music',
        short_name: 'SpotMusic',
        description: 'Ouça músicas estilo Spotify',
        theme_color: '#1db954',
        background_color: '#121212',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['music', 'entertainment'],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(jpg|jpeg|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cover-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
