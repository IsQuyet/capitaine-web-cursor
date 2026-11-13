import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, verifySourceHashes } from './build-assets.mjs';

await verifySourceHashes();
const { icon } = JSON.parse(await readFile(path.join(root, 'assets/sources.json'), 'utf8'));
const source = await readFile(path.join(root, 'assets/source', icon.source));
const output = path.join(root, 'assets/generated/icons');
await mkdir(output, { recursive: true });

// 仅在主动重建图标时使用浏览器，常规构建直接复制已校验的 PNG。
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.cache/browsers');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent('<style>body{margin:0}img{display:block}</style><img alt="">');
  await page.locator('img').evaluate(async (image, data) => {
    image.src = `data:image/svg+xml;base64,${data}`;
    await image.decode();
  }, source.toString('base64'));
  for (const size of icon.sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.locator('img').evaluate((image, size) => {
      image.width = size;
      image.height = size;
    }, size);
    await page.locator('img').screenshot({
      path: path.join(output, `icon-${size}.png`),
      omitBackground: true,
      animations: 'disabled',
      scale: 'css',
    });
  }
} finally {
  await browser.close();
}
console.log(`已从 ${icon.source} 导出 ${icon.sizes.join(' / ')} px 静态图标。`);
