import { test, expect, cursor, expectCursor, settings } from './fixtures.mjs';
import { curFile, fileAsset, pngFile, setAsset, svgFile } from './cursor-files.mjs';

async function expectDataCursor(target, mime, hotspot) {
  await expect.poll(() => cursor(target)).toContain(`data:${mime};base64,`);
  if (hotspot) expect(await cursor(target)).toContain(`${hotspot.join(' ')}, grab`);
}

test('同主题更换 SVG、校准热点和重置均即时生效', async ({ page, extension }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab');
  const asset = fileAsset(svgFile());
  await setAsset(extension, asset, ['light']);
  await expectDataCursor(target, 'image/svg+xml', [4, 8]);
  const first = await cursor(target);
  await setAsset(extension, { ...asset, hotspot: [12, 15] }, ['light']);
  await expectDataCursor(target, 'image/svg+xml', [16, 20]);
  expect(await cursor(target)).not.toBe(first);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectCursor(target, 'grab', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectDataCursor(target, 'image/svg+xml', [16, 20]);
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ cursorOverrides: { assets: {}, bindings: { light: {}, dark: {} } } });
  });
  await expectCursor(target, 'grab');
});

test('PNG 保留原字节及原尺寸，网站自定义 URL 仍不覆盖', async ({ page, extension }) => {
  const png = await pngFile(page, 64, 64);
  const asset = fileAsset(png, 'png', { sourceSize: [64, 64], hotspot: [9, 15] });
  await setAsset(extension, asset);
  await page.locator('#grab').hover();
  await expectDataCursor(page.locator('#grab'), 'image/png', [9, 15]);
  expect(await cursor(page.locator('#grab'))).toContain(asset.source.dataUrl);
  const custom = page.locator('#custom');
  const original = await cursor(custom);
  await custom.hover();
  await page.waitForTimeout(160);
  expect(await cursor(custom)).toBe(original);
  expect(await cursor(custom)).not.toContain('data:image/png');
});

test('CUR 可实际加载，默认采用内置热点，人工校准可覆盖', async ({ page, extension }) => {
  const bytes = curFile(await pngFile(page));
  const asset = fileAsset(bytes, 'cur');
  await setAsset(extension, asset);
  const target = page.locator('#grab');
  await target.hover();
  await expectDataCursor(target, 'image/x-icon');
  expect(await cursor(target)).toBe(`url("${asset.source.dataUrl}"), grab`);
  const size = await page.evaluate(async url => {
    const image = new Image(); image.src = url; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, asset.source.dataUrl);
  expect(size).toEqual([32, 32]);
  await setAsset(extension, { ...asset, hotspotOrigin: 'manual', hotspot: [8, 10] });
  await expectDataCursor(target, 'image/x-icon', [8, 10]);
  await settings(extension, { enabled: false });
  await expect.poll(() => cursor(target)).toBe('grab');
  await settings(extension, { enabled: true });
  await expectDataCursor(target, 'image/x-icon', [8, 10]);
});

test('自定义资源进入开放 Shadow 和跨源 Frame，主题切换不残留旧图', async ({ page, extension }) => {
  const asset = fileAsset(svgFile('#7738c8'));
  await setAsset(extension, asset, ['light', 'dark'], 'cell');
  await page.locator('#frames').evaluate(el => {
    el.innerHTML = '<iframe id="asset-frame" src="http://localhost:41731/frame.html"></iframe>';
  });
  const frame = page.frameLocator('#asset-frame').locator('#frame-target');
  await frame.hover();
  await expect.poll(() => cursor(frame)).toContain('data:image/svg+xml');
  await page.locator('#shadow-host #inner').evaluate(el => { el.style.cursor = 'cell'; });
  const inner = page.locator('#shadow-host #inner');
  await inner.hover();
  await expect.poll(() => cursor(inner)).toContain('data:image/svg+xml');
  await settings(extension, { theme: 'dark' });
  await expect.poll(() => cursor(inner)).toContain('data:image/svg+xml');
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ cursorOverrides: { assets: {}, bindings: { light: {}, dark: {} } } });
  });
  await expectCursor(inner, 'cell', 'dark');
});

test('网页 CSP 拦截上传文件时退回内置，其他页面仍使用上传资源', async ({ page, extension }) => {
  const blocked = [];
  page.on('console', message => {
    if (/img-src/u.test(message.text()) && /data:/u.test(message.text())) blocked.push(message.text());
  });
  await page.goto('/csp');
  await setAsset(extension, fileAsset(svgFile('#1873bd')));
  const target = page.locator('#changing');
  await target.hover();
  await expectCursor(target, 'grab');
  await expect.poll(() => blocked.length).toBeGreaterThan(0);
  expect(await extension.worker.evaluate(async () => Object.keys((await chrome.storage.local.get('cursorOverrides')).cursorOverrides.assets).length)).toBe(1);
  await page.goto('/');
  await page.locator('#grab').hover();
  await expectDataCursor(page.locator('#grab'), 'image/svg+xml', [4, 8]);
});
