# 📋 Script Migration Guide

This document outlines the changes made during the script refactoring initiative to improve maintainability, safety, and functionality.

## 🔄 **Script Changes**

### **Renamed Scripts**
| Old Name | New Name | Reason |
|----------|----------|--------|
| `banner-injector.js` | `roadmap-sync.js` | More descriptive of actual functionality |

### **Consolidated Scripts**
| Consolidated Into | Replaces | Functionality |
|-------------------|----------|---------------|
| `manage-labels.js` | `ensure-roadmap-labels.js`<br>`sync-labels.js`<br>`sync-roadmap-labels.js` | Unified label management with multiple actions |

### **Enhanced Scripts**
| Script | Version | Key Improvements |
|--------|---------|------------------|
| `roadmap-sync.js` | 2.0.0 | CLI args, dry-run, rate limiting, retry logic |
| `manage-labels.js` | 2.0.0 | Consolidated functionality, dry-run, enhanced CLI |
| `generate-release-note.js` | 3.0.0 | CLI args, dry-run, retry logic, better error handling |
| `ci-runner.js` | 2.0.0 | Enhanced logging, dry-run, selective task execution |
| `restore-git-hooks.js` | 2.0.0 | Logging integration, dry-run support |

## 🛠️ **New Infrastructure**

### **Configuration**
- **`scripts.config.json`** - Centralized configuration for all scripts
- Configurable GitHub API settings, paths, labels, and logging

### **Utilities**
- **`utils/logger.js`** - Standardized logging with levels and colors
- **`utils/retry.js`** - Retry logic with exponential backoff and rate limiting
- **`utils/cli.js`** - CLI argument parsing with dry-run and help support

## 🎯 **New Features**

### **Dry-Run Mode**
All scripts that modify external state now support `--dry-run`:
```bash
node scripts/roadmap-sync.js --dry-run
node scripts/manage-labels.js --dry-run --action=sync
node scripts/generate-release-note.js --version=v1.2.3 --dry-run
```

### **Enhanced CLI**
All scripts now support:
- `--help` - Show usage information
- `--verbose` - Enable debug logging
- `--dry-run` - Show what would be done without executing
- `--log-level` - Set logging level (debug, info, warn, error)

### **Rate Limiting & Retry**
GitHub API scripts now include:
- Automatic rate limit detection and waiting
- Exponential backoff on failures
- Configurable retry attempts
- Detailed logging of retry attempts

## 📊 **Usage Examples**

### **Roadmap Sync**
```bash
# Basic sync
node scripts/roadmap-sync.js

# Dry-run with verbose output
node scripts/roadmap-sync.js --dry-run --verbose

# Custom roadmap file
node scripts/roadmap-sync.js --roadmap-file=CUSTOM_ROADMAP.md
```

### **Label Management**
```bash
# Ensure labels exist (safe default)
node scripts/manage-labels.js

# Sync all labels (create + update)
node scripts/manage-labels.js --action=sync

# Roadmap labels only
node scripts/manage-labels.js --roadmap-only
```

### **Release Notes**
```bash
# Generate release notes
node scripts/generate-release-note.js --version=v1.2.3

# Blog post only
node scripts/generate-release-note.js --version=v1.2.3 --blog-only

# Skip git operations
node scripts/generate-release-note.js --version=v1.2.3 --skip-git
```

### **CI Pipeline**
```bash
# Full CI pipeline
node scripts/ci-runner.js

# Skip specific steps
node scripts/ci-runner.js --skip-lint --coverage

# Dry-run CI
node scripts/ci-runner.js --dry-run
```

## 🔧 **Configuration**

### **Environment Variables**
Required for GitHub operations:
```bash
GITHUB_TOKEN=your_github_token
GITHUB_REPO=DevilsDev/rag-pipeline-utils  # Optional, uses config default
```

### **scripts.config.json**
Key configuration sections:
- `github` - API settings, retry configuration
- `roadmap` - File paths, label definitions
- `release` - Changelog and blog paths
- `logging` - Default log levels and formatting

## 🚨 **Breaking Changes**

### **Removed Scripts**
- `banner-injector.js` → Use `roadmap-sync.js`
- `ensure-roadmap-labels.js` → Use `manage-labels.js --action=ensure`
- `sync-labels.js` → Use `manage-labels.js --action=sync`
- `sync-roadmap-labels.js` → Use `manage-labels.js --roadmap-only`

### **Changed Behavior**
- All scripts now require explicit execution (no auto-execution on import)
- Error handling is more strict with proper exit codes
- Logging format has changed to structured format with timestamps

## 🧪 **Testing**

### **Dry-Run Testing**
Test all scripts safely:
```bash
# Test roadmap sync
node scripts/roadmap-sync.js --dry-run --verbose

# Test label management
node scripts/manage-labels.js --dry-run --action=sync --verbose

# Test CI pipeline
node scripts/ci-runner.js --dry-run --verbose
```

### **Validation**
```bash
# Validate configuration
node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/scripts.config.json', 'utf-8')))"

# Test utilities
node -e "import('./scripts/utils/logger.js').then(m => m.createLogger('test').info('Logger working!'))"
```

## 📈 **Benefits**

1. **Safety** - Dry-run mode prevents accidental changes
2. **Reliability** - Retry logic handles transient failures
3. **Maintainability** - Centralized configuration and utilities
4. **Usability** - Consistent CLI interface across all scripts
5. **Observability** - Structured logging with multiple levels
6. **Performance** - Rate limiting prevents API abuse

## 🔮 **Future Enhancements**

- Unit tests for all utilities
- Script health monitoring
- Parallel execution where appropriate
- Integration with CI/CD metrics
- Plugin system for custom scripts
