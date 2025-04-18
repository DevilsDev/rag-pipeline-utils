// docs-site/scripts/watch-images.js
// Version: 1.0.0
// Description: Watches /static/img for changes and regenerates Plaiceholder LQIP cache
// Author: Ali Kahwaji

import { generate } from 'plaiceholder';
import { readdir, readFile, writeFile } from 'fs/promises';
import chokidar from 'chokidar';
import path from 'path';

const IMG_DIR = path.resolve('docs-site/static/img');
const CACHE_DIR = path.resolve('docs-site/.plaiceholder-cache');

async function processImage(file) {
  const buffer = await readFile(path.join(IMG_DIR, file));
  const { base64, img } = await generate(buffer);

  const output = {
    base64,
    img,
  };

  const name = file.replace(/\.(jpg|jpeg|png|webp)/i, '');
  await writeFile(path.join(CACHE_DIR, `img_${name}.json`), JSON.stringify(output, null, 2));
  console.log(`✅ LQIP generated: img_${name}.json`);
}

async function run() {
  const files = await readdir(IMG_DIR);
  for (const file of files) {
    if (/\.(jpg|jpeg|png|webp)$/i.test(file)) {
      await processImage(file);
    }
  }

  // Watch for future changes
  chokidar.watch(IMG_DIR).on('change', processImage).on('add', processImage);
}

run();
