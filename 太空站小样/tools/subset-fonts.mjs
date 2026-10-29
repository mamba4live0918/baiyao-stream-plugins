// Subsets the title font (得意黑) to exactly the characters used in src/content.js
// and copies the Space Mono files next to it. Run after editing on-screen text:
//   npm run fonts
// The full source font lives in assets-src/fonts, so this works without the raw
// downloads.
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import subsetFont from 'subset-font';
import { allText } from '../src/content.js';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'assets-src', 'fonts', 'SmileySans-Oblique.ttf');
const require = createRequire(import.meta.url);
const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;

export async function subsetFonts(outDir) {
  const fontsDir = join(outDir, 'fonts');
  mkdirSync(fontsDir, { recursive: true });

  const text = [...new Set(allText())].join('');
  const subset = await subsetFont(readFileSync(SOURCE), text, { targetFormat: 'woff2' });
  const title = join(fontsDir, 'smiley-sans-subset.woff2');
  writeFileSync(title, subset);
  console.log(`smiley-sans-subset.woff2 ${kb(title)} (${text.length} unique chars)`);

  for (const weight of [400, 700]) {
    const src = require.resolve(`@fontsource/space-mono/files/space-mono-latin-${weight}-normal.woff2`);
    const dst = join(fontsDir, `space-mono-${weight}.woff2`);
    copyFileSync(src, dst);
    console.log(`space-mono-${weight}.woff2 ${kb(dst)}`);
  }
}

// Run directly: node tools/subset-fonts.mjs [out-dir]   (default: src/assets)
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await subsetFonts(process.argv[2] || join(here, '..', 'src', 'assets'));
}
