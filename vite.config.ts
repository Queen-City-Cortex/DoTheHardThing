/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Cloudflare Web Analytics: the beacon is added to index.html only when VITE_CF_ANALYTICS_TOKEN is set at build time,
// so a build without the token ships no third-party script at all. See README, "Analytics".
function cfBeacon(token: string): Plugin {
  return {
    name: 'cf-web-analytics',
    // raw HTML: the data attribute is JSON and needs its own double quotes (token characters are escaped for safety)
    transformIndexHtml: (html) => (token
      ? html.replace('</body>', `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token.replace(/[^\w-]/g, '')}"}'></script></body>`)
      : html),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    cfBeacon(loadEnv(mode, '.', 'VITE_').VITE_CF_ANALYTICS_TOKEN?.trim() ?? ''),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // explicit, not the default js/css/html: the self-hosted fonts must be precached or they fail offline (`npm run check:dist`)
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallbackDenylist: [/^\/api\//], // /api/event goes to the Worker, never to the cached app shell
      },
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Do The Hard Thing',
        short_name: 'Hard Thing',
        description: "A morning method: name what's uncomfortable, pick one thing, and protect one block.",
        theme_color: '#1f2329',
        background_color: '#f4f3ef',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  preview: { allowedHosts: true, host: '127.0.0.1', port: 4173 },
  test: { include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'scripts/**/*.test.mjs'], css: { include: [/index\.css/] } }, // contrast.test.ts reads the stylesheet as text
}));
