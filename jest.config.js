/**
 * Version: 0.1.0
 * Path: /jest.config.js
 * Description: Jest configuration for native ESM test support
 * Author: Ali Kahwaji
 */

export default {
    testEnvironment: 'node',
    transform: {}, // Native ESM — no Babel used
    roots: ['<rootDir>/__tests__'],
    verbose: true,
    globalSetup: './__tests__/setup/global.js'
  };
  