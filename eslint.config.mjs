import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import importPlugin from 'eslint-plugin-import';
import i18nextPlugin from 'eslint-plugin-i18next';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-native': reactNativePlugin,
      import: importPlugin,
      i18next: i18nextPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React Native
      'react-native/no-unused-styles': 'error',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-raw-text': 'off',

      // Imports
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',

      // i18n - enforce all text goes through translations
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true,
          ignoreAttribute: [
            'className',
            'testID',
            'accessibilityLabel',
            'accessibilityHint',
            'href',
            'name',
            'placeholder',
            'type',
            'id',
            'key',
            'behavior',
            'edges',
            'animationType',
            'keyboardType',
            'autoCapitalize',
            'autoComplete',
            'contentContainerClassName',
          ],
          ignoreCallee: ['console.warn', 'console.error', 'router.push', 'router.replace'],
          ignoreProperty: ['fontFamily'],
        },
      ],
    },
  },
  {
    // Node-land files: build scripts and Expo config plugins (CommonJS)
    files: ['scripts/**/*.{js,mjs}', 'plugins/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      '.agents/',
      '.claude/',
      '.expo/',
      'dist/',
      'web-build/',
      'coverage/',
      'android/.gradle/',
      'android/**/build/',
      'ios/Pods/',
      'docs/',
      'scripts/',
      'plugins/',
      '*.config.js',
      '*.config.mjs',
      'metro.config.js',
      'babel.config.js',
    ],
  }
);
