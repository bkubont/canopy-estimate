/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the build works from any folder on Hostinger.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/logo.svg', 'brand/apple-touch-icon.png'],
      manifest: {
        name: 'Advanced Tree Service',
        short_name: 'ATS',
        description: 'Estimates, jobs and invoices for Advanced Tree Service',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F5F7FA',
        theme_color: '#F5F7FA',
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        // Never cache API calls; the app keeps its own offline copy of the data.
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
      },
    }),
  ],
  test: { environment: 'node' },
});
