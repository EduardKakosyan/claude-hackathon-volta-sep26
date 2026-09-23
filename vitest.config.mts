import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./', import.meta.url)) }
// autonomy/ is a separate Python package (DGX environment); never collect from it.
const exclude = [...configDefaults.exclude, 'autonomy/**']

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        test: {
          environment: 'node',
          include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts', 'app/**/*.test.ts'],
          exclude,
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
          exclude,
          globals: true,
          setupFiles: ['./vitest.setup.ts', 'test/setup-dom.ts'],
        },
      },
    ],
  },
})
