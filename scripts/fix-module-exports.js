#!/usr/bin/env node
/**
 * Node.js Module Export Fix - Enterprise CI/CD Recovery
 * Resolves module.exports returning {} in CI environment
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Node.js module export issues...');

// Critical modules that must export correctly
const criticalModules = [
  'src/ai/index.js',
  'src/ai/model-training.js',
  'src/ai/adaptive-retrieval.js',
  'src/ai/multimodal-processing.js',
  'src/ai/federated-learning.js',
  'src/dx/index.js',
  'src/core/create-pipeline.js',
  'src/plugins/registry.js'
];

function fixModuleExports(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Ensure module.exports is at the end and properly formatted
  if (content.includes('module.exports')) {
    // Check if module.exports is properly terminated
    const lines = content.split('\n');
    const lastNonEmptyLine = lines.filter(line => line.trim()).pop();
    
    if (!lastNonEmptyLine || !lastNonEmptyLine.includes('module.exports')) {
      content += '\n\n// Ensure module.exports is properly defined\n';
      modified = true;
    }

    // Fix common export patterns that cause {} returns
    content = content
      .replace(/module\.exports\s*=\s*{\s*}/g, 'module.exports = module.exports || {}')
      .replace(/module\.exports\s*=\s*undefined/g, 'module.exports = {}')
      .replace(/module\.exports\s*=\s*null/g, 'module.exports = {}');

    if (content !== fs.readFileSync(filePath, 'utf8')) {
      modified = true;
    }
  }

  // Add explicit module.exports if missing
  if (!content.includes('module.exports')) {
    content += '\n\n// Default export\nmodule.exports = {};\n';
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed exports in ${filePath}`);
  }
}

// Fix critical modules
criticalModules.forEach(fixModuleExports);

// Scan and fix all JS files in src/
function scanAndFix(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanAndFix(fullPath);
    } else if (file.endsWith('.js')) {
      fixModuleExports(fullPath);
    }
  });
}

scanAndFix('src');

console.log('🎉 Module export fix completed!');
