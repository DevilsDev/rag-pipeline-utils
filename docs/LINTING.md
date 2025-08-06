# Linting & Code Quality Guide

## Overview

Our ESLint configuration is designed with **Developer Experience (DX)** as the top priority while maintaining enterprise-grade code quality. We use a **tiered rule structure** that differentiates between critical errors, important warnings, and informational feedback.

## Philosophy

- **Enhance DX instead of blocking it** - Warnings don't block commits or CI
- **Context-aware rules** - Different standards for production vs test code
- **Signal over noise** - Focus on issues that matter for runtime stability
- **Auto-fix friendly** - Most style issues are automatically resolved

## Rule Tiers

### 🔴 Critical (Errors) - Block CI/Commits
These rules catch issues that could break runtime functionality:

- **Security & Runtime Safety**: `no-undef`, `no-unused-vars`, `no-redeclare`
- **Syntax & Import Errors**: `no-unreachable`, `constructor-super`, `no-const-assign`
- **Control Flow & Logic**: `no-case-declarations`, `no-fallthrough`, `no-empty`

### 🟡 Important (Warnings) - Log but Don't Block
These rules improve code quality but don't break functionality:

- **Code Style**: `semi`, `quotes`, `no-extra-semi`
- **Best Practices**: `no-debugger`, `no-useless-catch`, `no-useless-escape`
- **Formatting**: `no-mixed-spaces-and-tabs`, `no-irregular-whitespace`

### ⚪ Informational (Off/Warn) - Minimal Noise
These rules are disabled or relaxed to reduce noise:

- **Minor Issues**: `no-unused-labels`, `no-prototype-builtins`
- **Test-specific patterns**: Allowed in test files

## Context-Specific Rules

### Test Files (`__tests__/`, `*.test.js`, `*.spec.js`)
```javascript
// ✅ Allowed in tests
const mockData = { /* unused but needed for clarity */ };
const fixture = "test-data"; // Single quotes OK
console.log('Debug info') // Missing semicolon OK
```

**Relaxed Rules:**
- `no-unused-vars`: Warn only, ignore mock/fixture patterns
- `quotes`, `semi`: Disabled for readability
- `no-console`, `no-debugger`: Allowed for debugging
- `no-empty`: Allow empty test blocks during development

### Mock & Fixture Files (`mocks/`, `fixtures/`, `__mocks__/`)
```javascript
// ✅ Minimal restrictions for test data
module.exports = {
  unusedProperty: "value", // No unused-vars warnings
  "mixed-quotes": 'allowed'
};
```

**Rules:** Almost all style rules disabled for maximum flexibility.

### Production Code (`src/core/`, `src/plugins/`, `src/pipeline/`)
```javascript
// ❌ Strict rules enforced
const unusedVar = 'value'; // ERROR: no-unused-vars
console.log("debug"); // WARN: no-console
debugger; // ERROR: no-debugger in production
```

**Strict Rules:**
- `no-unused-vars`: Error
- `quotes`: Error (single quotes required)
- `semi`: Error (semicolons required)
- `no-debugger`: Error in production code

### AI/ML Module (`src/ai/`, `__tests__/ai/`)
```javascript
// ✅ Special handling for ML patterns
const model = createModel(); // Unused OK if matches pattern
switch (algorithm) {
  case 'gradient': 
    const weights = calculate(); // Case declarations allowed
    break;
}
```

**Special Rules:**
- `no-unused-vars`: Warn with ML-specific ignore patterns
- `no-case-declarations`: Warn (common in ML switch statements)

## Available Scripts

### Development
```bash
# Standard linting with auto-fix
npm run lint:fix

# Check only errors (fast feedback)
npm run lint:errors-only

# Full diagnostic report (includes warnings)
npm run lint:diagnostic
```

### CI/CD
```bash
# Strict mode - fails on any warnings (production code)
npm run lint:strict

# Standard mode - fails only on errors
npm run lint
```

## Pre-commit Hooks

Our Husky + lint-staged setup is developer-friendly:

```json
{
  "lint-staged": {
    "**/*.{js,ts}": [
      "eslint --fix --max-warnings=Infinity --quiet"
    ],
    "src/**/*.{js,ts}": [
      "eslint --fix --max-warnings 0"
    ]
  }
}
```

**Behavior:**
- ✅ Auto-fixes style issues where possible
- ✅ Allows warnings in test files
- ❌ Blocks commits only on critical errors in src/
- ⚡ Fast execution with `--quiet` flag

## CI/CD Integration

### Blocking Lint Check
```yaml
- name: 🧹 Lint codebase (Strict - Errors Only)
  run: npm run lint:strict
```
**Fails CI on:** Critical errors only

### Non-blocking Diagnostics
```yaml
- name: 📊 Lint diagnostics (Non-blocking)
  run: npm run lint:diagnostic || echo "⚠️ Warnings found but not blocking"
```
**Provides:** Full diagnostic report without blocking deployment

## Common Patterns

### Ignoring Specific Variables
```javascript
// Use underscore prefix for intentionally unused
const _unusedButNeeded = processData();
const { data, _metadata } = response; // Destructuring with ignored props
```

### Test File Patterns
```javascript
// ✅ These patterns are allowed in test files
describe('Component', () => {
  let mockService; // Unused mock setup
  const fixture = { /* test data */ };
  
  beforeEach(() => {
    // Empty setup blocks OK
  });
});
```

### Mock File Patterns
```javascript
// ✅ Minimal restrictions in mock files
module.exports = {
  mockMethod: jest.fn(),
  unusedProperty: 'for-future-use',
  "any-quote-style": 'allowed'
};
```

## Troubleshooting

### "Too many warnings" in CI
**Solution:** Use `npm run lint:strict` instead of `npm run lint`

### Pre-commit hook blocking on test files
**Solution:** Check if files are in `src/` - only production code has strict rules

### ESLint not auto-fixing
**Solution:** Run `npm run lint:fix` or check if rule is fixable

### Warnings in logs but CI passes
**Expected behavior** - warnings don't block CI, only errors do

## Migration from Legacy Config

If you're seeing new warnings after this update:

1. **Critical errors** - Fix immediately (will block CI)
2. **Warnings in src/** - Fix when convenient or add to ignore patterns
3. **Warnings in tests** - Safe to ignore, won't block development

## Configuration Files

- **Main config**: `.eslintrc.js` - Tiered rules and overrides
- **Ignore patterns**: Built into `.eslintrc.js`
- **Package scripts**: `package.json` - Various lint commands
- **Pre-commit**: `package.json` lint-staged config

## Best Practices

1. **Run `lint:fix` regularly** - Auto-fixes most style issues
2. **Use `lint:errors-only` for quick checks** - Fast feedback loop
3. **Check `lint:diagnostic` before PRs** - See full quality report
4. **Don't disable rules globally** - Use file-specific overrides instead
5. **Prefix unused vars with `_`** - Clear intent for reviewers

## Support

For questions about linting rules or configuration:
1. Check this guide first
2. Run `npm run lint:diagnostic` to see detailed reports
3. Review `.eslintrc.js` for specific rule configurations
4. Open an issue for rule changes or new patterns

---

*This configuration prioritizes developer productivity while maintaining code quality. Rules are designed to catch real issues without creating friction in the development process.*
