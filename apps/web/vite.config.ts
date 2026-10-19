/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-learnchants';
  const fnBase = `http://127.0.0.1:5001/${projectId}/us-central1`;
  // In dev, same-origin paths are proxied to the Functions emulator, mirroring
  // the Firebase Hosting rewrites in firebase.json.
  const proxy = {
    '/media': { target: fnBase, changeOrigin: true, rewrite: (p: string) => `/stream_media${p}` },
    '/mock-upload': { target: fnBase, changeOrigin: true, rewrite: (p: string) => `/mock_upload${p}` },
    '/drive/callback': { target: fnBase, changeOrigin: true, rewrite: (p: string) => `/drive_oauth_callback${p.replace('/drive/callback', '')}` },
  };

  return {
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage', 'firebase/app-check'],
            motion: ['framer-motion'],
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'mandala.svg'],
        manifest: {
          name: 'Learn Chants',
          short_name: 'Learn Chants',
          description: 'Learn Vedic and devotional chants verse by verse: listen, chant, get guidance from your teacher.',
          theme_color: '#4a0d1c',
          background_color: '#140a1f',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          categories: ['education', 'music', 'lifestyle'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/media\//, /^\/mock-upload\//, /^\/drive\//, /^\/__\//],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-css' },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: ({ url }) => url.hostname.endsWith('firebasestorage.googleapis.com') || url.pathname.includes('/covers%2F'),
              handler: 'CacheFirst',
              options: { cacheName: 'covers', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      css: false,
    },
  };
});
