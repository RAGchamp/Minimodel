// Renders public/icon.svg to the PNG sizes that phones expect on the home screen.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { publicDir } from './node-assets.mjs';

const svg = await readFile(join(publicDir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(publicDir, `icon-${size}.png`) });
  await page.close();
}
await browser.close();
