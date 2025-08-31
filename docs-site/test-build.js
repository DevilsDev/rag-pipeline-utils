const { spawn } = require('child_process');
const path = require('path');

console.log('Testing Docusaurus build...');

const buildProcess = spawn('npm', ['run', 'build'], {
  cwd: path.resolve(__dirname),
  stdio: 'inherit',
  shell: true
});

buildProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Build completed successfully!');
  } else {
    console.log(`\n❌ Build failed with exit code ${code}`);
  }
  process.exit(code);
});

buildProcess.on('error', (error) => {
  console.error('❌ Build process error:', error.message);
  process.exit(1);
});
