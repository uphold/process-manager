'use strict';

/**
 * Module dependencies.
 */

import { defineConfig } from 'eslint/config';
import uphold from 'eslint-config-uphold';

/**
 * Export ESLint config.
 */

export default defineConfig([
  uphold,
  {
    name: 'process-manager/base',
    rules: {
      'node-plugin/no-process-env': 'off',
      'node-plugin/no-process-exit': 'off',
      'promise/prefer-await-to-then': 'off'
    }
  }
]);
