// ESLint 9 flat config - Simplified but following architecture principles
const js = require('@eslint/js');

module.exports = [
  // Base configuration
  js.configs.recommended,
  
  // Global settings
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
      }
    },
    rules: {
      // Code Quality - Following architecture specification (lines 1530-1537)
      'complexity': ['error', 10],
      'max-lines': ['error', 300], 
      'max-lines-per-function': ['error', 50],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    }
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    rules: {
      // TypeScript rules - Following architecture specification
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true
      }],
      '@typescript-eslint/no-explicit-any': 'error',
    }
  },

  // Test files - relaxed rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines-per-function': 'off',
    }
  },

  // CLI files - allow console
  {
    files: ['packages/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    }
  },

  // Ignore patterns
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      '*.js',
      'jest.config.js'
    ]
  }
];