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
          // Pin the JWT secret so tests never pick up the real one from backend/.env
          // (dotenv does not override variables that are already set).
          env: {
            JWT_SECRET: 'test_jwt_secret_64_characters_long_for_isolated_unit_testing_key!'
          },
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
