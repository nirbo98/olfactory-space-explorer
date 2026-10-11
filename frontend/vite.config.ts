/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.OSE_BACKEND_URL ?? 'http://127.0.0.1:8000'

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site from /<repo>/; override with PAGES_BASE if the repo name differs
  base: mode === 'pages' ? (process.env.PAGES_BASE ?? '/olfactory-space-explorer/') : '/',
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 2000 },
  server: { port: 5173, proxy: { '/api': backend } },
  preview: { port: 4173, proxy: { '/api': backend } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
