// docs-site/utils/image.js
import { getPlaiceholder } from 'plaiceholder';
import fs from 'fs/promises';
import path from 'path';

/**
 * Generates base64 placeholder and img props from local image file
 * @param {string} imagePath - Relative path to image in /static/img
 */
export async function generatePlaceholder(imagePath) {
  const fullPath = path.join(process.cwd(), 'docs-site', 'static', imagePath);
  const buffer = await fs.readFile(fullPath);
  const { base64, img } = await getPlaiceholder(buffer);

  return {
    ...img,
    blurDataURL: base64,
  };
}
