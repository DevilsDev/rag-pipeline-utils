// __tests__/setup/global.js
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");

// __dirname is already available in CommonJS
// const __filename = __filename;
// const __dirname = __dirname;

const pdfPath = path.resolve(__dirname, "../fixtures/sample.pdf");

// Ensure the fixtures directory exists
fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

// Create a minimal valid PDF file if it doesn't exist
if (!fs.existsSync(pdfPath)) {
  fs.writeFileSync(pdfPath, "%PDF-1.4\n%EOF");
}
