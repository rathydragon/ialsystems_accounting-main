import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        name: 'backend',
        test: {
          globals: true,
          environment: 'node',
          include: ['backend/tests/**/*.test.js'],
        }
      },
      {
        name: 'frontend',
        test: {
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./frontend/tests/setupTests.ts'],
          include: ['frontend/tests/**/*.test.{ts,tsx,js,jsx}'],
        }
      }
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'backend/api/**/*.js',
        'backend/app.js',
        'frontend/src/utils/**/*.ts',
        'frontend/src/services/**/*.ts',
        'frontend/src/components/**/*.{ts,tsx}'
      ],
      exclude: [
        'backend/scripts/**',
        'backend/server.js',
        'backend/tests/**',
        'frontend/tests/**',
        'frontend/src/main.tsx',
        'frontend/src/vite-env.d.ts'
      ]
    }
  }
});
