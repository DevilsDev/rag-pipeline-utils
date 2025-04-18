// docs-site/scripts/generate-placeholders.js
import { getPlaiceholder } from 'plaiceholder';
import fs from 'fs/promises';
import path from 'path';

const images = ['img/hero.jpg', 'img/logo.png'];

for (const relPath of images) {
  const fullPath = path.join(process.cwd(), 'docs-site', 'static', relPath);
  const buffer = await fs.readFile(fullPath);
  const { base64 } = await getPlaiceholder(buffer);
  const outPath = relPath.replace(/\//g, '_') + '.json';
  await fs.writeFile(
    path.join(process.cwd(), 'docs-site/.plaiceholder-cache', outPath),
    JSON.stringify({ base64 })
  );
}
