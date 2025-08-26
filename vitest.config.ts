import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Environment
    environment: 'node',

    // Test files pattern - includes all packages in monorepo
    include: ['packages/**/*.{test,spec}.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/*/src/**/*.d.ts',
        'packages/*/src/**/*.{test,spec}.{ts,tsx}',
        'packages/*/src/**/__tests__/**',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Projects configuration for monorepo
    projects: ['packages/*'],
  },
});
