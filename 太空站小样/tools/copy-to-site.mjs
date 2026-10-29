// Copies the single-file build into the 白曜重工 site (plugin-library-site), where
// Next.js serves it as a static file at /space-station.html.
// Usage: npm run site   (builds first, then runs this)
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'dist', 'index.html');
const SITE_PUBLIC = join(here, '..', '..', 'plugin-library-site', 'public');
const TARGET = join(SITE_PUBLIC, 'space-station.html');

if (!existsSync(SOURCE)) {
  console.error('找不到 dist/index.html，请先运行 npm run build');
  process.exit(1);
}
if (!existsSync(SITE_PUBLIC)) {
  console.error(`找不到官网的 public 文件夹：${SITE_PUBLIC}`);
  process.exit(1);
}
copyFileSync(SOURCE, TARGET);
console.log(`已复制到 ${TARGET}（${(statSync(TARGET).size / 1048576).toFixed(1)} MB）`);
