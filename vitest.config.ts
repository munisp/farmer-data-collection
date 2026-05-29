import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'client'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['server/**/*.ts'],
      exclude: [
        'server/**/__tests__/**',
        'server/**/*.test.ts',
        'server/**/*.spec.ts',
        'node_modules/**',
      ],
      thresholds: {
        lines: 60,
        functions: 55,
        branches: 45,
        statements: 60,
      },
    },
  },
});
