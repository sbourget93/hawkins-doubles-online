import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
