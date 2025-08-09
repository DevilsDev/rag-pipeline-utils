// fix-mdx-image-imports.js
// Version: 1.0.0
// Description: Auto-wrap all BlogImage imports with SafeImageWrapper to avoid SSR issues.

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const blogDir = path.resolve('docs-site', 'blog');

glob(`${blogDir}/**/*.mdx`, (err, files) => {
  if (err) throw err;

  files.forEach((file) => {
    let content = fs.readFileSync(file, 'utf8');

    if (content.includes('from \'@site/src/components/BlogImage\'')) {
      content = content
        .replace(/from '@site\/src\/components\/BlogImage'/g, 'from \'@site/src/components/SafeImageWrapper\'')
        .replace(/<BlogImage/g, '<SafeImageWrapper')
        .replace(/<\/BlogImage>/g, '</SafeImageWrapper>');

      fs.writeFileSync(file, content, 'utf8');
      console.log(`✔️ Updated: ${file}`); // eslint-disable-line no-console
    }
  });
});
