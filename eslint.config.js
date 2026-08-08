'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // The CLI sets `global.window`/`global.document` from jsdom, so browser
        // globals are ambient here too.
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      // The jsdom availability probe uses an intentional empty `catch {}`.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'error'
    }
  },
  {
    ignores: ['node_modules/**', 'coverage/**']
  },
  prettierConfig
];
