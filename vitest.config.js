import { fileURLToPath } from 'url';
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
        // The root and frontend/ each install React; tests must load only one copy
        // (two copies break hooks: "Cannot read properties of null (reading 'useState')").
        resolve: {
          alias: {
            react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
            'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))
          },
          dedupe: ['react', 'react-dom']
        },
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
