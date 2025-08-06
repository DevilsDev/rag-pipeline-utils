/**
 * ESLint Configuration - Developer Experience & Quality Automation
 * 
 * Tiered rule structure:
 * - CRITICAL (errors): Security, breaking syntax, bad imports
 * - IMPORTANT (warnings): Code smells, style issues  
 * - INFORMATIONAL (off/warn): Naming, minor spacing, test scaffolds
 * 
 * Context-specific overrides for different environments:
 * - Strict rules for src/, core/, deployment logic
 * - Relaxed rules for __tests__, fixtures, performance, e2e
 */

module.exports = {
  env: {
    es2022: true,
    node: true,
    jest: true,
    browser: true
  },
  
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  
  plugins: [
    'storybook'
  ],
  
  ignorePatterns: [
    'node_modules',
    'docs-site',
    'public',
    'dist',
    'coverage',
    '*.min.js',
    'build/',
    '.next/',
    '.cache/'
  ],

  // BASE RULES - Applied to all files
  rules: {
    // === CRITICAL RULES (ERRORS) - Block CI/commits ===
    // Security & Runtime Safety
    'no-undef': 'error',
    'no-unused-vars': ['error', { 
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: true,
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-duplicate-case': 'error',
    
    // Syntax & Import Errors
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'constructor-super': 'error',
    'no-this-before-super': 'error',
    'no-const-assign': 'error',
    'no-class-assign': 'error',
    'no-func-assign': 'error',
    'no-import-assign': 'error',
    
    // Control Flow & Logic
    'no-case-declarations': 'error',
    'no-fallthrough': 'error',
    'no-empty': 'error',
    'no-ex-assign': 'error',
    'for-direction': 'error',
    'getter-return': 'error',
    
    // === IMPORTANT RULES (WARNINGS) - Log but don't block ===
    // Code Quality & Style
    'semi': ['warn', 'always'],
    'quotes': ['warn', 'single', { allowTemplateLiterals: true }],
    'no-extra-semi': 'warn',
    'no-mixed-spaces-and-tabs': 'warn',
    'no-irregular-whitespace': 'warn',
    
    // Best Practices
    'no-console': 'off', // Allow console in Node.js environment
    'no-debugger': 'warn', // Warn but don't block (useful for development)
    'no-useless-catch': 'warn',
    'no-useless-escape': 'warn',
    
    // === INFORMATIONAL RULES (OFF/WARN) - Minimal noise ===
    'no-unused-labels': 'off',
    'no-prototype-builtins': 'off'
  },

  // CONTEXT-SPECIFIC OVERRIDES
  overrides: [
    // === TEST FILES - Relaxed rules for better DX ===
    {
      files: [
        '**/__tests__/**/*.{js,jsx}',
        '**/*.test.{js,jsx}',
        '**/*.spec.{js,jsx}',
        '**/test/**/*.{js,jsx}',
        '**/tests/**/*.{js,jsx}'
      ],
      rules: {
        // Allow unused vars in test files (fixtures, mocks, etc.)
        'no-unused-vars': ['warn', {
          vars: 'local',
          args: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^(mock|stub|fixture|_)'
        }],
        
        // Relax style rules for test readability
        'quotes': 'off',
        'semi': 'off',
        'no-console': 'off',
        'no-debugger': 'off',
        
        // Allow test-specific patterns
        'no-empty': 'off', // Empty test blocks during development
        'no-useless-catch': 'off', // Test error handling patterns
        'no-constant-condition': 'off' // Test condition mocking
      }
    },

    // === MOCK & FIXTURE FILES - Minimal restrictions ===
    {
      files: [
        '**/mocks/**/*.{js,jsx}',
        '**/fixtures/**/*.{js,jsx}',
        '**/__mocks__/**/*.{js,jsx}',
        '**/mock-*.{js,jsx}',
        '**/fixture-*.{js,jsx}',
        '**/sample-*.{js,jsx}'
      ],
      rules: {
        'no-unused-vars': 'off',
        'quotes': 'off',
        'semi': 'off',
        'no-console': 'off',
        'no-empty': 'off',
        'no-useless-catch': 'off'
      }
    },

    // === PERFORMANCE & E2E TESTS - Allow test-specific patterns ===
    {
      files: [
        '**/performance/**/*.{js,jsx}',
        '**/e2e/**/*.{js,jsx}',
        '**/integration/**/*.{js,jsx}',
        '**/benchmark/**/*.{js,jsx}'
      ],
      rules: {
        'no-unused-vars': ['warn', { 
          varsIgnorePattern: '^(result|response|data|metrics|_)' 
        }],
        'no-console': 'off', // Allow logging in performance tests
        'quotes': 'off',
        'semi': 'off'
      }
    },

    // === CONFIGURATION & SCRIPT FILES - Relaxed for tooling ===
    {
      files: [
        '**/scripts/**/*.{js,jsx}',
        '**/config/**/*.{js,jsx}',
        '**/*.config.{js,jsx}',
        '**/tools/**/*.{js,jsx}',
        'bin/**/*.{js,jsx}'
      ],
      rules: {
        'no-unused-vars': ['warn', { 
          varsIgnorePattern: '^(config|options|args|_)' 
        }],
        'no-console': 'off', // Scripts need console output
        'quotes': 'off',
        'semi': 'off'
      }
    },

    // === AI/ML MODULE - Special handling for complex patterns ===
    {
      files: [
        'src/ai/**/*.{js,jsx}',
        '__tests__/ai/**/*.{js,jsx}'
      ],
      rules: {
        'no-unused-vars': ['warn', {
          vars: 'local',
          args: 'after-used',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^(model|tensor|weights|gradients|_)'
        }],
        'no-case-declarations': 'warn', // Allow switch patterns in ML code
        'quotes': 'off',
        'semi': 'off'
      }
    },

    // === PRODUCTION CODE - Strictest rules ===
    {
      files: [
        'src/core/**/*.{js,jsx}',
        'src/plugins/**/*.{js,jsx}',
        'src/pipeline/**/*.{js,jsx}',
        'src/cli/commands/**/*.{js,jsx}'
      ],
      excludedFiles: [
        '**/*.test.{js,jsx}',
        '**/*.spec.{js,jsx}',
        '**/mock*.{js,jsx}'
      ],
      rules: {
        // Enforce strict rules for production code
        'no-unused-vars': 'error',
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'no-console': 'warn', // Warn about console in production
        'no-debugger': 'error' // Block debugger in production
      }
    },

    // === DX COMPONENTS - Balanced rules for new features ===
    {
      files: [
        'src/dx/**/*.{js,jsx}',
        '__tests__/dx/**/*.{js,jsx}'
      ],
      rules: {
        'no-unused-vars': ['warn', {
          varsIgnorePattern: '^(component|element|event|_)'
        }],
        'quotes': 'off',
        'semi': 'off',
        'no-console': 'off' // Allow console in DX tools
      }
    }
  ]
};
