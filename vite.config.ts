import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// FIX Vuln 11: Security headers applied in dev server (production
// headers should be set at the hosting layer, e.g. Vercel headers config).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    proxy: {
      '/google-api': {
        target: 'https://www.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/google-api/, ''),
      }
    }
  },
})
