import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Separate from vite.config.ts on purpose: the PWA plugin (service worker
// generation, manifest injection) has no reason to run under tests and adds
// startup cost / noise. The path aliases are duplicated from vite.config.ts —
// see the comment there for why Vite needs its own copy of tsconfig's paths.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@core': path.resolve(__dirname, './src/core'),
      '@data': path.resolve(__dirname, './src/data'),
      '@presentation': path.resolve(__dirname, './src/presentation'),
      '@hooks': path.resolve(__dirname, './src/presentation/hooks/index.ts'),
      '@stores': path.resolve(__dirname, './src/presentation/stores/app.ts'),
      '@pages': path.resolve(__dirname, './src/presentation/pages'),
      '@components': path.resolve(__dirname, './src/presentation/components'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
