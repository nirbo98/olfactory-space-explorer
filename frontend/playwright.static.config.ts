import { defineConfig } from '@playwright/test'

// End-to-end tests of the static GitHub Pages build (no Python server; model runs in the browser).
export default defineConfig({
  testDir: './e2e',
  testMatch: /static\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/olfactory-space-explorer/',
    viewport: { width: 1600, height: 1000 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build:pages && npx vite preview --mode pages --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/olfactory-space-explorer/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
