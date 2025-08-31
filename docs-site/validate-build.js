#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Docusaurus configuration...');

// Check if required files exist
const requiredFiles = [
  'package.json',
  'docusaurus.config.js',
  'sidebars.js'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
    allFilesExist = false;
  }
});

// Check docs directory
const docsDir = path.join(__dirname, 'docs');
if (fs.existsSync(docsDir)) {
  const docFiles = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
  console.log(`✅ Found ${docFiles.length} documentation files`);
  
  // Check for problematic characters in markdown files
  let hasIssues = false;
  docFiles.forEach(file => {
    const content = fs.readFileSync(path.join(docsDir, file), 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // Check for unescaped < or > in non-code blocks
      if (line.includes('<') || line.includes('>')) {
        if (!line.trim().startsWith('```') && !line.includes('&lt;') && !line.includes('&gt;')) {
          console.log(`⚠️  ${file}:${index + 1} - Potential MDX issue: ${line.trim().substring(0, 50)}...`);
          hasIssues = true;
        }
      }
    });
  });
  
  if (!hasIssues) {
    console.log('✅ No obvious MDX syntax issues found');
  }
} else {
  console.log('❌ docs directory missing');
  allFilesExist = false;
}

// Try to load the config
try {
  const config = require('./docusaurus.config.js');
  console.log('✅ Docusaurus config loaded successfully');
  console.log(`   Title: ${config.title}`);
  console.log(`   URL: ${config.url}`);
} catch (error) {
  console.log('❌ Error loading Docusaurus config:', error.message);
  allFilesExist = false;
}

if (allFilesExist) {
  console.log('\n🎉 Configuration validation passed!');
  console.log('Ready to attempt build...');
} else {
  console.log('\n❌ Configuration validation failed!');
  process.exit(1);
}
