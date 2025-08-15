module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000,
  maxWorkers: 1,
  detectOpenHandles: false,
  forceExit: true,
  verbose: false,
  silent: false,
  collectCoverage: false,
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
  setupFilesAfterEnv: [],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};