import { test, expect, cursor, expectCursor, setExcludedHosts, message } from './fixtures.mjs';
import { curFile, fileAsset, multiCurFile, pngFile, setAsset, svgFile } from './cursor-files.mjs';

test.beforeEach(async ({ page }) => { await page.bringToFront(); });

async function openEditor(extension) {
  const ui = await extension.context.newPage();
  const errors = [];
  ui.on('pageerror', error => errors.push(error.message));
  await ui.goto(`chrome-extension://${extension.id}/options/options.html`);
  await expect(ui.locator('#cursor-file')).toBeEnabled();
  await expect(ui.locator('#cursor-calibrator')).toBeEnabled();
  return { ui, async close() { await ui.close(); expect(errors).toEqual([]); } };
}

async function state(extension) {
  return extension.worker.evaluate(async () => (await chrome.storage.local.get('cursorOverrides')).cursorOverrides);
}

async function importFile(ui, name, buffer, mimeType) {
  await ui.locator('#cursor-file').setInputFiles({ name, mimeType, buffer });
  await expect(ui.locator('#cursor-resource-name')).toHaveText(name);
  await expect(ui.locator('#cursor-apply')).toBeEnabled();
}

async function setHotspot(ui, x, y) {
  await ui.locator('#cursor-hotspot-x').fill(String(x));
  await ui.locator('#cursor-hotspot-y').fill(String(y));
}

async function apply(ui) {
  const type = await ui.locator('#cursor-type').inputValue();
  const palettes = await ui.locator('#cursor-share-palette').isChecked()
    ? 'Light / Dark' : (await ui.locator('#cursor-palette').inputValue() === 'light' ? 'Light' : 'Dark');
  await ui.locator('#cursor-apply').click();
  await expect(ui.locator('#cursor-editor-status')).toHaveText(await message(ui, 'cursorSaved', [type, palettes]));
  await expect(ui.locator('#cursor-calibrator')).toBeEnabled();
}

test('面板只保留操作信息，原生文件选择后明确显示草稿与应用范围', async ({ extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    expect(await ui.locator('#site-settings').evaluate(element => element.open)).toBe(false);
    await expect(ui.locator('#theme option')).toHaveText(['Auto', 'Light', 'Dark']);
    await expect(ui.locator('#cursor-palette option')).toHaveText(['Light', 'Dark']);
    await expect(ui.locator('#status')).toBeEmpty();
    await expect(ui.locator('#cursor-editor-status')).toBeEmpty();
    await expect(ui.locator('#cursor-reload')).toBeHidden();
    await expect(ui.locator('#cursor-draft-state')).toBeHidden();
    await expect(ui.locator('#cursor-file')).toBeHidden();
    const chosen = ui.waitForEvent('filechooser');
    await ui.locator('#cursor-import').click();
    await (await chosen).setFiles({ name: 'picker.svg', mimeType: 'image/svg+xml', buffer: svgFile() });
    await expect(ui.locator('#cursor-resource-name')).toHaveText('picker.svg');
    await expect(ui.locator('#cursor-draft-state')).toBeVisible();
    await expect(ui.locator('#cursor-share-label')).toHaveText(await message(ui, 'sharePalette', 'Dark'));
    await expect(ui.locator('#cursor-editor-status')).toBeEmpty();
    await apply(ui);
    await expect(ui.locator('#cursor-draft-state')).toBeHidden();
    await expect(ui.locator('#cursor-share-palette')).not.toBeChecked();
    const saved = await state(extension);
    expect(saved.bindings.light.grab).toBe(saved.bindings.dark.grab);
    await expect(ui.locator('#cursor-resource-name')).toHaveText('picker.svg');
  } finally {
    await editor.close();
  }
});

test('SVG 统一预览、源坐标校准、双主题保存和重启持久化', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    await importFile(ui, '自己的光标.svg', svgFile(), 'image/svg+xml');
    await expect(ui.locator('#cursor-source-size')).toHaveText('24 × 24 px');
    await expect(ui.locator('#cursor-display-size')).toHaveText('32 × 32 px');
    await expect(ui.locator('#cursor-share-palette')).toBeChecked();
    await ui.locator('#cursor-calibrator').scrollIntoViewIfNeeded();
    const bounds = await ui.locator('#cursor-image').boundingBox();
    await ui.mouse.click(bounds.x + bounds.width / 4, bounds.y + bounds.height * 3 / 4);
    expect(Number(await ui.locator('#cursor-hotspot-x').inputValue())).toBeCloseTo(6, 1);
    expect(Number(await ui.locator('#cursor-hotspot-y').inputValue())).toBeCloseTo(18, 1);
    await setHotspot(ui, 6, 9);
    expect(await ui.locator('#cursor-trial').evaluate(el => el.style.cursor)).toContain('8 12, grab');
    await apply(ui);
    let saved = await state(extension);
    expect(saved.bindings.light.grab).toBe(saved.bindings.dark.grab);
    expect(saved.assets[saved.bindings.light.grab].hotspot).toEqual([6, 9]);
    await page.bringToFront();
    await page.locator('#grab').hover();
    await expect.poll(() => cursor(page.locator('#grab'))).toContain('8 12, grab');
    await ui.reload();
    await expect(ui.locator('#cursor-calibrator')).toBeEnabled();
    await expect(ui.locator('#cursor-resource-name')).toHaveText('自己的光标.svg');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('6');
    await ui.locator('#cursor-reset').click();
    await expect(ui.locator('#cursor-resource-name')).toContainText('Capitaine');
    await page.locator('#grab').hover();
    await expectCursor(page.locator('#grab'), 'grab');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => cursor(page.locator('#grab'))).toContain('data:image/svg+xml');
    await ui.locator('#cursor-palette').selectOption('dark');
    await expect(ui.locator('#cursor-resource-name')).toHaveText('自己的光标.svg');
    await ui.locator('#cursor-reset').click();
    await expect(ui.locator('#cursor-resource-name')).toContainText('Capitaine');
    saved = await state(extension);
    expect(saved.assets).toEqual({});
    await expectCursor(page.locator('#grab'), 'grab', 'dark');
  } finally {
    await editor.close();
  }
});

test('SVG 缺少尺寸时由 viewBox 补足，单边尺寸保持原有比例', async ({ extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    const variants = [
      ['viewBox="0 0 24 48"', '24 × 48 px'],
      ['width="48" viewBox="0 0 24 48"', '48 × 96 px'],
      ['width="24" height="48"', '24 × 48 px'],
    ];
    for (const [attributes, sourceSize] of variants) {
      const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><path d="M2 2L20 12L8 40Z"/></svg>`);
      await importFile(ui, '比例.svg', source, 'image/svg+xml');
      await expect(ui.locator('#cursor-source-size')).toHaveText(sourceSize);
      await expect(ui.locator('#cursor-display-size')).toHaveText('16 × 32 px');
      expect(await ui.locator('#cursor-image').evaluate(image => [image.naturalWidth, image.naturalHeight])).toEqual([16, 32]);
    }
  } finally {
    await editor.close();
  }
});

test('内置 SVG 同一校准流程，数字校验和全局设置保存不丢资源', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    await expect(ui.locator('#cursor-resource-name')).toContainText('Capitaine');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('16');
    await expect(ui.locator('#cursor-share-palette')).not.toBeChecked();
    await ui.locator('#cursor-hotspot-x').fill('32');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveAttribute('aria-invalid', 'true');
    await expect(ui.locator('#cursor-apply')).toBeDisabled();
    await setHotspot(ui, 4, 5);
    await ui.locator('#cursor-calibrator').focus();
    await ui.keyboard.press('ArrowRight');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('5');
    await apply(ui);
    await ui.locator('#cursor-hotspot-x').fill('32');
    await expect(ui.locator('#cursor-hotspot-bounds')).toContainText('X');
    await expect(ui.locator('#cursor-draft-state')).toBeVisible();
    await expect(ui.locator('#cursor-editor-status')).toBeEmpty();
    await ui.locator('#cursor-hotspot-x').fill('5');
    await apply(ui);
    const before = await state(extension);
    const asset = before.assets[before.bindings.light.grab];
    expect(asset.source.kind).toBe('builtin');
    expect(asset.hotspot).toEqual([5, 5]);
    await setExcludedHosts(ui, 'example.com');
    await ui.locator('#save').click();
    await expect(ui.locator('#status')).toHaveText(await message(ui, 'saved'));
    expect(await state(extension)).toEqual(before);
    await page.locator('#grab').hover();
    await expectCursor(page.locator('#grab'), 'grab');
    expect(await cursor(page.locator('#grab'))).toContain('5 5, grab');
    await ui.locator('#cursor-trial').click({ position: { x: 30, y: 40 } });
    await expect(ui.locator('#cursor-trial-marker')).toBeVisible();
    await expect(ui.locator('#cursor-trial-result')).toHaveText(await message(ui, 'trialResult', [30, 40]));
    expect(await state(extension)).toEqual(before);
    await expect(ui.locator('#cursor-apply')).toBeDisabled();
    await ui.screenshot({ path: '.cache/cursor-editor-preview.png', fullPage: true });
  } finally {
    await editor.close();
  }
});

test('PNG 导入不重采样，拖动越界被限制在源图内', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    const png = await pngFile(page, 64, 64);
    await importFile(ui, '清晰位图.png', png, 'image/png');
    await expect(ui.locator('#cursor-source-size')).toHaveText('64 × 64 px');
    await expect(ui.locator('#cursor-display-size')).toHaveText('64 × 64 px');
    await ui.locator('#cursor-calibrator').scrollIntoViewIfNeeded();
    const bounds = await ui.locator('#cursor-image').boundingBox();
    await ui.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await ui.mouse.down();
    await ui.mouse.move(bounds.x + bounds.width + 50, bounds.y + bounds.height / 2);
    await ui.mouse.up();
    const x = Number(await ui.locator('#cursor-hotspot-x').inputValue());
    expect(x).toBeGreaterThan(63);
    expect(x).toBeLessThan(64);
    await setHotspot(ui, 9, 15);
    await apply(ui);
    const saved = await state(extension);
    expect(saved.assets[saved.bindings.light.grab].source.dataUrl).toBe(`data:image/png;base64,${png.toString('base64')}`);
  } finally {
    await editor.close();
  }
});

test('CUR 导入自动读取文件热点，校准前后试用和网页一致', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    const cur = curFile(await pngFile(page));
    await importFile(ui, '原生指针.cur', cur, 'image/x-icon');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('7');
    await expect(ui.locator('#cursor-hotspot-y')).toHaveValue('9');
    await expect(ui.locator('#cursor-hotspot-origin')).toBeVisible();
    await expect(ui.locator('#cursor-hotspot-origin')).toContainText('CUR');
    const initial = await ui.locator('#cursor-trial').evaluate(el => el.style.cursor);
    expect(initial).toBe(`url("data:image/x-icon;base64,${cur.toString('base64')}"), grab`);
    await apply(ui);
    await page.locator('#grab').hover();
    await expect.poll(() => cursor(page.locator('#grab'))).toBe(initial);
    await setHotspot(ui, 8, 10);
    await expect(ui.locator('#cursor-hotspot-origin')).toBeHidden();
    await apply(ui);
    await expect.poll(() => cursor(page.locator('#grab'))).toContain('8 10, grab');
    const saved = await state(extension);
    expect(saved.assets[saved.bindings.light.grab].hotspotOrigin).toBe('manual');
  } finally {
    await editor.close();
  }
});

test('多尺寸 CUR 保留原文件，使用浏览器支持的原始图像与热点', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    const bytes = multiCurFile([
      { png: await pngFile(page), size: [32, 32], hotspot: [7, 9] },
      { png: await pngFile(page, 256, 256), size: [256, 256], hotspot: [56, 72] },
    ]);
    await importFile(ui, '多尺寸.cur', bytes, 'image/x-icon');
    await expect(ui.locator('#cursor-source-size')).toHaveText('32 × 32 px');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('7');
    const trial = await ui.locator('#cursor-trial').evaluate(el => el.style.cursor);
    const runtime = Buffer.from(trial.match(/base64,([A-Za-z0-9+/=]+)/u)[1], 'base64');
    expect(runtime.readUInt16LE(4)).toBe(1);
    await apply(ui);
    const saved = await state(extension);
    expect(saved.assets[saved.bindings.light.grab].source.dataUrl).toBe(`data:image/x-icon;base64,${bytes.toString('base64')}`);
    await page.locator('#grab').hover();
    await expect.poll(() => cursor(page.locator('#grab'))).toBe(trial);
  } finally {
    await editor.close();
  }
});

test('错误或非静态文件不会执行、保存或覆盖有效草稿', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    await setHotspot(ui, 4, 5);
    const invalid = [
      ['脚本.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" onload="window.cursorScriptRan=true"/>'), 'svgEvents'],
      ['外部.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><image href="https://example.invalid/picture.png"/></svg>'), 'svgExternalFile'],
      ['动画.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><animate attributeName="x"/></svg>'), 'svgStatic'],
      ['动画.ani', Buffer.from('RIFF'), 'cursorFileFormat'],
      ['损坏.cur', Buffer.from('not a cur'), 'curStaticOnly'],
      ['损坏.png', Buffer.from('not a png'), 'invalidPNG'],
      ['太大.png', await pngFile(page, 256, 256), 'pngSizeLimit'],
      ['超限.svg', Buffer.alloc(256 * 1024 + 1, 32), 'cursorFileSize'],
    ];
    for (const [name, buffer, error] of invalid) {
      await ui.locator('#cursor-file').setInputFiles({ name, buffer, mimeType: 'application/octet-stream' });
      await expect(ui.locator('#cursor-editor-status')).toHaveText(await message(ui, 'importFailed', await message(ui, error)));
      await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('4');
      await expect(ui.locator('#cursor-resource-name')).toContainText('Capitaine');
    }
    expect(await ui.evaluate(() => window.cursorScriptRan)).toBeUndefined();
    expect((await state(extension)).assets).toEqual({});
    await expect(ui.locator('#cursor-apply')).toBeEnabled();
  } finally {
    await editor.close();
  }
});

test('外部资源更新保留当前草稿，应用时合并而非覆盖其他类型', async ({ page, extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    await setHotspot(ui, 4, 5);
    await setAsset(extension, fileAsset(svgFile()), ['light'], 'copy');
    await expect(ui.locator('#cursor-external-change')).toBeHidden();
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('4');
    const external = { ...fileAsset(svgFile('#8160af')), id: 'external-grab' };
    await extension.worker.evaluate(async asset => {
      const { cursorOverrides } = await chrome.storage.local.get('cursorOverrides');
      cursorOverrides.assets[asset.id] = asset;
      cursorOverrides.bindings.light.grab = asset.id;
      await chrome.storage.local.set({ cursorOverrides });
    }, external);
    await expect(ui.locator('#cursor-external-change')).toBeVisible();
    await expect(ui.locator('#cursor-reload')).toBeVisible();
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('4');
    await apply(ui);
    await expect(ui.locator('#cursor-reload')).toBeHidden();
    const saved = await state(extension);
    expect(saved.bindings.light.copy).toBeTruthy();
    expect(saved.bindings.light.grab).toBeTruthy();
    expect(Object.keys(saved.assets)).toHaveLength(2);
  } finally {
    await editor.close();
  }
});

test('两处同时保存不同类型，不丢失另一处的绑定', async ({ extension }) => {
  const first = await openEditor(extension);
  const second = await openEditor(extension);
  try {
    await setHotspot(first.ui, 4, 5);
    await second.ui.locator('#cursor-type').selectOption('copy');
    await expect(second.ui.locator('#cursor-calibrator')).toBeEnabled();
    await setHotspot(second.ui, 6, 7);
    await Promise.all([
      first.ui.locator('#cursor-apply').click(),
      second.ui.locator('#cursor-apply').click(),
    ]);
    await expect.poll(async () => Object.keys((await state(extension)).bindings.light).sort()).toEqual(['copy', 'grab']);
    const saved = await state(extension);
    expect(saved.assets[saved.bindings.light.grab].hotspot).toEqual([4, 5]);
    expect(saved.assets[saved.bindings.light.copy].hotspot).toEqual([6, 7]);
    expect(Object.keys(saved.assets)).toHaveLength(2);
  } finally {
    await first.close(); await second.close();
  }
});

test('切换类型前可以取消丢弃未保存的校准', async ({ extension }) => {
  const editor = await openEditor(extension);
  const { ui } = editor;
  try {
    await setHotspot(ui, 4, 5);
    ui.once('dialog', dialog => dialog.dismiss());
    await ui.locator('#cursor-type').selectOption('copy');
    await expect(ui.locator('#cursor-type')).toHaveValue('grab');
    await expect(ui.locator('#cursor-hotspot-x')).toHaveValue('4');
    ui.once('dialog', dialog => dialog.accept());
    await ui.locator('#cursor-type').selectOption('copy');
    await expect(ui.locator('#cursor-type')).toHaveValue('copy');
    await expect(ui.locator('#cursor-resource-name')).toContainText('copy');
    await expect(ui.locator('#cursor-apply')).toBeDisabled();
  } finally {
    await editor.close();
  }
});
