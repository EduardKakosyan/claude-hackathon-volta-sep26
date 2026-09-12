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
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        test: {
          environment: 'jsdom',
          include: [
            'hooks/**/*.test.{ts,tsx}',
            'components/**/*.test.{ts,tsx}',
          ],
          globals: true,
          setupFiles: ['./vitest.setup.ts', 'test/setup-dom.ts'],
        },
      },
    ],
  },
})
