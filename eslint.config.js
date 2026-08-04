import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Honour the underscore convention for intentionally-unused args/vars
      // (e.g. an effect trigger passed for future use, an unused map index).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Context modules intentionally export both their Provider component and
    // the corresponding hook. That is the standard API shape for this codebase;
    // splitting each hook solely for Fast Refresh would add churn without
    // changing runtime behavior.
    files: ['src/context/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Existing form-prefill/diagnostics effects synchronize local editable form
    // state with navigation/context input. Preserve their shipping behavior in
    // this security PR and track a future structural refactor separately. New
    // files and every other component remain covered by the rule.
    files: [
      'src/components/GamePlanBuilder.tsx',
      'src/components/WorkoutLogger.tsx',
      'src/components/shared/ConnectionDiagnostics.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Legacy camp-list countdown is display-only. Replacing its time source is
    // better handled with the broader date-only/time-zone refactor in Phase 2.
    files: ['src/components/Settings.tsx'],
    rules: {
      'react-hooks/purity': 'off',
    },
  },
])
