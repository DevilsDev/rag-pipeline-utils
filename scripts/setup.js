/**
const fs = require('fs');
const path = require('path');
 * Version: 1.1.0
 * Description: Test setup script to ensure fixtures exist and validate mocks before running tests.
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Resolve __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(__dirname, '../__tests__/fixtures/sample.pdf');

// Ensure PDF test fixture
if (!fs.existsSync(fixturePath)) {
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, 'Dummy PDF content for test');
  console.log('[setup] Created sample.pdf fixture'); // eslint-disable-line no-console
}

// Validate plugin fixture presence
try {
  execSync('node ./scripts/verify-fixtures.js', { stdio: 'inherit' });
} catch (err) {
  console.error('[setup] Fixture verification failed. Please check missing mocks.'); // eslint-disable-line no-console
  process.exit(1);
}
