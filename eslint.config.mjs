import tseslint from 'typescript-eslint';

/**
 * Lint config for the framework-free workspace packages and the API. `apps/web` has its own
 * config (Next.js rules) and ESLint picks the nearest one, so the two never mix.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/web/**', 'apps/api/db/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // Nest resolves constructor dependencies from decorator metadata, so a class used only as a
    // parameter type is still a runtime import. These parser options let the rule see that.
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
