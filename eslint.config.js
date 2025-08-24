// ESLint 9 flat config - Modern ESM with defineConfig for type safety
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base configuration
  js.configs.recommended,
  
  // Global settings
  {
    name: 'global-config',
    languageOptions: {
      ecmaVersion: 2022,
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
    name: 'typescript-config',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      // Disable base rules that are covered by TypeScript versions
      'no-unused-vars': 'off',
      
      // TypeScript rules - Following architecture specification
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true
      }],
      '@typescript-eslint/no-explicit-any': 'error',
    }
  },

  // Schema types - allow unknown for JSON Schema compliance
  {
    name: 'schema-types',
    files: ['**/types/schema.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    }
  },

  // Error types - allow any for context and params, relaxed complexity
  {
    name: 'error-types',
    files: ['**/types/errors.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'complexity': 'off',
      'max-lines': ['error', 500],
      'max-params': ['error', 6],
    }
  },

  // Test files - relaxed rules
  {
    name: 'test-files',
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    }
  },

  // CLI files - allow console
  {
    name: 'cli-files',
    files: ['packages/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    }
  },

  // Ignore patterns
  {
    name: 'ignore-patterns',
    ignores: [
      '**/dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.config.js',
      'eslint.config.js'
    ]
  }
);