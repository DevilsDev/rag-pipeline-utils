module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000,
  maxWorkers: 1,
  detectOpenHandles: false,
  forceExit: true,
  verbose: false,
  silent: false,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
    '!**/node_modules/**'
  ],
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
  restoreMocks: true,
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      ancestorSeparator: ' › ',
      uniqueOutputName: 'false',
      suiteNameTemplate: '{filepath}',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ]
};