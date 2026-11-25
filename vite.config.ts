import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { dashboardRefresh } from './experiments/dashboard-refresh/server.ts'

const input = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwind(), dashboardRefresh(mode === 'test')],
  resolve: { alias: { '@': input('./experiments/brand-theme/shadcn') } },
  optimizeDeps: { entries: ['index.html', 'experiments/brand-theme/*/index.html', 'experiments/dashboard-refresh/index.html'] },
  build: {
    manifest: true,
    rolldownOptions: {
      input: {
        home: input('./index.html'),
        'dashboard-refresh': input('./experiments/dashboard-refresh/index.html'),
        'css-modules': input('./experiments/brand-theme/css-modules/index.html'),
        'styled-components': input('./experiments/brand-theme/styled-components/index.html'),
        'tailwind': input('./experiments/brand-theme/tailwind/index.html'),
        'shadcn': input('./experiments/brand-theme/shadcn/index.html'),
      },
    },
  },
}))
