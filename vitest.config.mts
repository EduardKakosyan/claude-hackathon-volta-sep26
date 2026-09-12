import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./', import.meta.url)) }

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        test: {
          environment: 'node',
          include: ['lib/**/*.test.ts'],
        },
      },
      {
        test: {
          environment: 'jsdom',
          include: ['components/**/*.test.tsx'],
          globals: true,
          setupFiles: ['test/setup-dom.ts'],
        },
      },
    ],
  },
})
