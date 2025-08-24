/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    '<rootDir>/packages/*/jest.config.js'
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.{ts,tsx}',
    '!packages/*/src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};