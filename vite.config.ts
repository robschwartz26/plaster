import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8081,
    // Bind all interfaces (IPv4 + IPv6). Vite's default bound IPv6-only (::1),
    // so browsers resolving localhost -> 127.0.0.1 got connection refused.
    // Also makes the dev server reachable from a phone on the same network.
    host: true,
  },
})
