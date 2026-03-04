const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: ['dist/', 'node_modules/', 'demo-examples/', 'tests/fixtures/', 'coverage/'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-console': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // CLI entry point — console output is the primary interface
  {
    files: ['src/cli.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Report formatters — console output is their purpose
  {
    files: ['src/core/report/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // MCP server — uses console.error for stderr logging per MCP protocol
  {
    files: ['src/mcp/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Core modules — console.error for internal error logging
  {
    files: ['src/config/index.ts', 'src/core/scanner.ts', 'src/core/yamlRuleLoader.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
