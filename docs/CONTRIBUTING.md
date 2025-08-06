# Contributing to RAG Pipeline Utils

## 🚀 **CI/CD & Linting Strategy**

Our CI/CD pipeline uses a **branch-conditional linting strategy** designed for maximum developer productivity while maintaining code quality.

### **How It Works**

#### **Protected Branches (main/master)**
- ✅ **Strict linting enforced** - All errors and warnings must be resolved
- ❌ **CI fails on any lint issues** - Blocks merge until clean
- 🔒 **Production-grade quality gates**

#### **Feature/Development Branches**
- ✅ **Errors-only linting** - Only critical issues block CI
- ⚠️ **Warnings logged but don't block** - Maintains development velocity
- 🚀 **Fast feedback loops for iteration**

### **Pre-commit Strategy**

Our Husky + lint-staged setup is optimized for different code areas:

```json
{
  "**/*.{js,ts}": ["eslint --fix --quiet"],
  "src/core/**/*.{js,ts}": ["eslint --fix --max-warnings 0"],
  "src/enterprise/**/*.{js,ts}": ["eslint --fix --rule 'no-unused-vars: off'"]
}
```

### **Quick Commands**

```bash
# Fix all auto-fixable issues
npm run lint:fix

# Check only critical errors (fast)
npm run lint:errors-only

# Full diagnostic report
npm run lint:diagnostic

# Production cleanup script
node scripts/lint-cleanup.js
```

### **Common Patterns**

#### **Unused Variables**
```javascript
// ❌ Blocks CI
const data = fetchData();

// ✅ Allowed pattern
const _data = fetchData(); // Prefix with underscore
const { data, ...rest } = response; // Destructuring with rest
```

#### **Test Files**
```javascript
// ✅ Test files have relaxed rules
describe('Component', () => {
  const mockData = {}; // Unused vars allowed
  let fixture; // No initialization required
});
```

### **Troubleshooting**

#### **CI Failing on Feature Branch**
- Check if you're on main/master (strict rules apply)
- Run `npm run lint:errors-only` locally
- Use `node scripts/lint-cleanup.js` for batch fixes

#### **Pre-commit Hook Blocking**
- Only core production code has strict rules
- Enterprise/test code allows more flexibility
- Run `npm run lint:fix` before committing

### **Best Practices**

1. **Run `lint:fix` regularly** - Prevents accumulation of style issues
2. **Use underscore prefix** for intentionally unused variables
3. **Check `lint:errors-only`** before pushing feature branches
4. **Review diagnostic report** before merging to main

---

## 📝 **Development Workflow**

### **Setting Up**
```bash
git clone <repo>
cd rag-pipeline-utils
npm install
npm run setup
```

### **Feature Development**
```bash
git checkout -b feature/your-feature
# Develop with relaxed linting
npm run lint:errors-only  # Check critical issues only
git commit -m "feat: your feature"
```

### **Before Merging to Main**
```bash
npm run lint:diagnostic   # Full quality check
npm run lint:fix          # Auto-fix issues
npm test                  # Ensure tests pass
```

### **Emergency Fixes**
```bash
# Skip pre-commit hooks if absolutely necessary
git commit --no-verify -m "hotfix: critical issue"
```

---

## 🎯 **Quality Standards**

### **Code Areas & Rules**

#### **Core Production (`src/core/`)**
- ✅ Strict ESLint rules enforced
- ❌ No unused variables allowed
- 🔒 Security rules mandatory

#### **Enterprise Features (`src/enterprise/`)**
- ⚠️ Relaxed unused variable rules
- ✅ Auto-fix enabled
- 🚀 Development-friendly

#### **Tests (`__tests__/`, `*.test.js`)**
- 🆓 Most rules disabled for flexibility
- ✅ Focus on functionality over style
- 🧪 Test-specific patterns allowed

#### **DX Tools (`src/dx/`)**
- ⚖️ Balanced rules for developer tools
- ✅ Console logging allowed
- 🛠️ Debugging-friendly

---

## 🆘 **Getting Help**

- **Linting Issues**: Check `docs/LINTING.md`
- **CI Problems**: Review GitHub Actions logs
- **Local Setup**: Run `npm run setup`
- **Emergency**: Use `--no-verify` flag (sparingly)

Remember: Our linting strategy prioritizes **developer velocity** while maintaining **production quality**. The system is designed to help, not hinder your development process!
