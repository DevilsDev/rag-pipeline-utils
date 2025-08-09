#!/usr/bin/env node

/**
 * Comprehensive ESM to CommonJS Import Conversion Script
 * 
 * Converts all ES6 import statements to CommonJS require() statements // eslint-disable-line global-require
 * to fix Jest test suite loading issues.
 */

const fs = require('fs').promises; // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require

class ESMToCommonJSConverter {
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

    // Pattern 1: import defaultExport from 'module'
    converted = converted.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, defaultImport, modulePath) => {
        conversionCount++;
        return `const ${defaultImport} = require('${modulePath}')`; // eslint-disable-line global-require
      }
    );

    // Pattern 2: import { namedExport1, namedExport2 } from 'module'
    converted = converted.replace(
      /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g,
      (match, namedImports, modulePath) => {
        conversionCount++;
        return `const { ${namedImports} } = require('${modulePath}')`; // eslint-disable-line global-require
      }
    );

    // Pattern 3: import * as namespace from 'module'
    converted = converted.replace(
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      (match, namespace, modulePath) => {
        conversionCount++;
        return `const ${namespace} = require('${modulePath}')`; // eslint-disable-line global-require
      }
    );

    // Pattern 4: import 'module' (side-effect only)
    converted = converted.replace(
      /import\s+['"]([^'"]+)['"]/g,
      (match, modulePath) => {
        conversionCount++;
        return `require('${modulePath}')`; // eslint-disable-line global-require
      }
    );

    // Pattern 5: import defaultExport, { namedExport } from 'module'
    converted = converted.replace(
      /import\s+(\w+)\s*,\s*\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g,
      (match, defaultImport, namedImports, modulePath) => {
        conversionCount++;
        return `const ${defaultImport} = require('${modulePath}');\nconst { ${namedImports} } = require('${modulePath}')`; // eslint-disable-line global-require
      }
    );

    this.conversions += conversionCount;
    return converted;
  }

  /**
   * Process a single file
   */
  async processFile(_filePath) {
    try {
      const content = await fs.readFile(_filePath, 'utf8');
      const originalContent = content;
      
      // Skip if no imports found
      if (!content.includes('import ')) {
        return;
      }

      const convertedContent = this.convertImportToRequire(content);
      
      // Only write if content changed
      if (convertedContent !== originalContent) {
        await fs.writeFile(_filePath, convertedContent, 'utf8');
        console.log(`✅ Converted imports in: ${path.relative(process.cwd(), _filePath)}`); // eslint-disable-line no-console
        this.filesProcessed++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${_filePath}:`, error.message); // eslint-disable-line no-console
    }
  }

  /**
   * Recursively find all JavaScript files
   */
  async findJavaScriptFiles(dir, files = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await this.findJavaScriptFiles(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Convert all files in src directory
   */
  async convertAllFiles() {
    console.log('🔄 Starting ESM to CommonJS conversion...\n'); // eslint-disable-line no-console
    
    const srcDir = path.join(process.cwd(), 'src');
    const files = await this.findJavaScriptFiles(srcDir);
    
    console.log(`📁 Found ${files.length} JavaScript files to process\n`); // eslint-disable-line no-console
    
    for (const file of files) {
      await this.processFile(file);
    }
    
    console.log('\n📊 Conversion Summary:'); // eslint-disable-line no-console
    console.log(`   Files processed: ${this.filesProcessed}`); // eslint-disable-line no-console
    console.log(`   Import statements converted: ${this.conversions}`); // eslint-disable-line no-console
    console.log('✅ ESM to CommonJS conversion complete!\n'); // eslint-disable-line no-console
  }
}

// Run the conversion
async function main() {
  const converter = new ESMToCommonJSConverter();
  await converter.convertAllFiles();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ESMToCommonJSConverter };
