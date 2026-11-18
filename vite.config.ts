import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// Single source of truth for the version the app reports. package.json is what
// scripts/capgo-ota.mjs bumps on each OTA release, so Settings always shows the
// bundle that is actually running rather than a hand-edited constant.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
