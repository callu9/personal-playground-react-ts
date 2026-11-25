import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --mode test',
    url: 'http://127.0.0.1:4173',
    env: { VITE_DEFAULT_BRAND: 'signal' },
  },
})
