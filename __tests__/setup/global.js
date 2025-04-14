// __tests__/setup/global.js

import fs from 'fs';
import path from 'path';

export default async () => {
  const pdfPath = path.resolve('__tests__/fixtures/sample.pdf');
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

  if (!fs.existsSync(pdfPath)) {
    fs.writeFileSync(pdfPath, '%PDF-1.4\n%EOF');
  }
};
