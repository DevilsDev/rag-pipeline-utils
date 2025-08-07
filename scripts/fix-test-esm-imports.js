#!/usr/bin/env node

/**
 * Comprehensive Test File ESM to CommonJS Import Conversion Script
 * 
 * Converts all ES6 import statements to CommonJS require() statements
 * in test files to fix Jest test suite loading issues.
 */

const fs = require('fs').promises;
const path = require('path');

class TestESMToCommonJSConverter {
  constructor() {
    this.conversions = 0;
    this.filesProcessed = 0;
  }

  /**
   * Convert ES6 import to CommonJS require
   */
  convertImportToRequire(content) {
    let converted = content;
    let conversionCount = 0;

    // Pattern 1: import { jest } from '@jest/globals' (special case)
    converted = converted.replace(
      /import\s+\{\s*jest\s*\}\s+from\s+['"]@jest\/globals['"]/g,
      () => {
        conversionCount++;
        return '// Jest is available globally in CommonJS mode';
      }
    );

    // Pattern 2: import defaultExport from 'module'
    converted = converted.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, defaultImport, modulePath) => {
        conversionCount++;
        return `const ${defaultImport} = require('${modulePath}')`;
      }
    );

    // Pattern 3: import { namedExport1, namedExport2 } from 'module'
    converted = converted.replace(
      /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g,
      (match, namedImports, modulePath) => {
        conversionCount++;
        return `const { ${namedImports} } = require('${modulePath}')`;
      }
    );

    // Pattern 4: import * as namespace from 'module'
    converted = converted.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, namespace, modulePath) => {
        conversionCount++;
        return `const ${namespace} = require('${modulePath}')`;
      }
    );

    // Pattern 5: import 'module' (side-effect only)
    converted = converted.replace(
      /import\s+['"]([^'"]+)['"]/g,
      (match, modulePath) => {
        conversionCount++;
        return `require('${modulePath}')`;
      }
    );

    // Pattern 6: import defaultExport, { namedExport } from 'module'
    converted = converted.replace(
      /import\s+(\w+)\s*,\s*\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g,
      (match, defaultImport, namedImports, modulePath) => {
        conversionCount++;
        return `const ${defaultImport} = require('${modulePath}');\nconst { ${namedImports} } = require('${modulePath}')`;
      }
    );

    this.conversions += conversionCount;
    return converted;
  }

  /**
   * Process a single file
   */
  async processFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const originalContent = content;
      
      // Skip if no imports found
      if (!content.includes('import ')) {
        return;
      }

      const convertedContent = this.convertImportToRequire(content);
      
      // Only write if content changed
      if (convertedContent !== originalContent) {
        await fs.writeFile(filePath, convertedContent, 'utf8');
        console.log(`✅ Converted imports in: ${path.relative(process.cwd(), filePath)}`);
        this.filesProcessed++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }

  /**
   * Recursively find all JavaScript test files
   */
  async findTestFiles(dir, files = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await this.findTestFiles(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Convert all files in __tests__ directory
   */
  async convertAllTestFiles() {
    console.log('🔄 Starting test file ESM to CommonJS conversion...\n');
    
    const testsDir = path.join(process.cwd(), '__tests__');
    const files = await this.findTestFiles(testsDir);
    
    console.log(`📁 Found ${files.length} test files to process\n`);
    
    for (const file of files) {
      await this.processFile(file);
    }
    
    console.log('\n📊 Test File Conversion Summary:');
    console.log(`   Files processed: ${this.filesProcessed}`);
    console.log(`   Import statements converted: ${this.conversions}`);
    console.log('✅ Test file ESM to CommonJS conversion complete!\n');
  }
}

// Run the conversion
async function main() {
  const converter = new TestESMToCommonJSConverter();
  await converter.convertAllTestFiles();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { TestESMToCommonJSConverter };
