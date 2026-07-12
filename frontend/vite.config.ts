import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: precache the built app shell so the app boots with no connection, and
    // make it installable to a phone home screen (standalone, like a native app).
    // The offline *data* layer is the sync engine (IndexedDB); this only handles
    // loading the app itself offline.
    VitePWA({
      // Ship new app versions silently — the SW updates itself on next load. Fine
      // here: a single admin, and no long-lived tabs to disrupt mid-session.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Serve the SW in local dev too, so install/offline can be tested via nginx.
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Hawkins Dubs',
        short_name: 'Hawkins Dubs',
        description: 'Hawkins doubles league check-in and scoring',
        start_url: '/',
        display: 'standalone',
        // Green app bar → matching Android status bar; purple splash to match the icon.
        theme_color: '#2f6f4f',
        background_color: '#863bff',
        icons: [
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // SPA: unknown navigations fall back to the app shell, except /api which
        // must always hit the network (the backend, never the cache).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  // DEV ONLY: this `server` block configures the Vite dev server, which runs only
  // in local docker-compose development (see infrastructure/local/docker-compose.yml).
  // In production the frontend is built to static files and served by nginx, so
  // none of this applies. Note there is no /api proxy here: nginx handles /api/
  // routing to the backend in BOTH environments (nginx.local.conf / nginx.conf).
  server: {
    host: true, // Listen on 0.0.0.0 so the nginx container can reach the dev server.
    hmr: {
      // The browser reaches the HMR websocket through nginx (published on :80),
      // not Vite's internal 5173, so tell the HMR client which port to dial.
      clientPort: 80,
    },
  },
})
