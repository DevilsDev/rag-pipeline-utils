// __tests__/setup/global.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname polyfill for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfPath = path.resolve(__dirname, '../fixtures/sample.pdf');

// Ensure the fixtures directory exists
fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

// Create a minimal valid PDF file if it doesn't exist
if (!fs.existsSync(pdfPath)) {
  fs.writeFileSync(pdfPath, '%PDF-1.4\n%EOF');
}
