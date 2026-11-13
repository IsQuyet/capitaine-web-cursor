import { test, expect, cursor, expectCursor, setExcludedHosts, message } from './fixtures.mjs';

async function openUI(extension, source, name, keepSiteActive = false) {
  const ui = await extension.context.newPage();
  if (keepSiteActive) await source.bringToFront();
  await ui.goto(`chrome-extension://${extension.id}/${name}/${name}.html`);
  return ui;
}

async function storedSettings(extension) {
  return extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
}

test('完整设置通过真实 storage 保存并持久化，公共样式可用', async ({ page, extension }) => {
  const ui = await openUI(extension, page, 'options');
  try {
    await expect(ui.locator('#save')).toBeEnabled();
    await ui.locator('#enabled').uncheck();
    await ui.locator('#theme').selectOption('dark');
    await setExcludedHosts(ui, 'LOCALHOST\nexample.com\nlocalhost');
    await ui.locator('#save').click();
    await expect(ui.locator('#status')).toHaveText(await message(ui, 'saved'));
    expect(await storedSettings(extension)).toEqual({ enabled: false, theme: 'dark', excludedHosts: ['example.com', 'localhost'] });
    expect(await ui.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    await ui.reload();
    await expect(ui.locator('#save')).toBeEnabled();
    await expect(ui.locator('#enabled')).not.toBeChecked();
    await expect(ui.locator('#theme')).toHaveValue('dark');
    await expect(ui.locator('#excluded-hosts')).toHaveValue('example.com\nlocalhost');
    await ui.screenshot({ path: '.cache/options-preview.png', fullPage: true });
  } finally {
    await ui.close();
  }
});

test('错误排除项标出行号，不能保存部分有效输入', async ({ page, extension }) => {
  const ui = await openUI(extension, page, 'options');
  try {
    await expect(ui.locator('#save')).toBeEnabled();
    await setExcludedHosts(ui, 'example.com\n*.example.org');
    await ui.locator('#save').click();
    await expect(ui.locator('#status')).toHaveText(await message(ui, 'invalidHostLine', 2));
    await expect(ui.locator('#excluded-hosts')).toHaveAttribute('aria-invalid', 'true');
    expect(await storedSettings(extension)).toEqual({ enabled: true, theme: 'auto', excludedHosts: [] });
  } finally {
    await ui.close();
  }
});

test('弹窗不需要 tabs 权限即可读当前网站并即时保存网站偏好', async ({ page, extension }) => {
  const ui = await openUI(extension, page, 'popup', true);
  try {
    await expect(ui.locator('#current-host')).toHaveText('127.0.0.1');
    await expect(ui.locator('#site-enabled')).toBeEnabled();
    await ui.locator('#site-enabled').uncheck();
    await expect.poll(async () => (await storedSettings(extension)).excludedHosts).toEqual(['127.0.0.1']);
    await page.locator('#grab').hover();
    expect(await cursor(page.locator('#grab'))).toBe('grab');
    await ui.locator('#site-enabled').check();
    await expect.poll(async () => (await storedSettings(extension)).excludedHosts).toEqual([]);
    await expectCursor(page.locator('#grab'), 'grab');
    await ui.locator('#theme').selectOption('dark');
    await expect.poll(async () => (await storedSettings(extension)).theme).toBe('dark');
    await expectCursor(page.locator('#grab'), 'grab', 'dark');
    await ui.screenshot({ path: '.cache/popup-preview.png', clip: { x: 0, y: 0, width: 344, height: 590 } });
  } finally {
    await ui.close();
  }
});

test('弹窗全局关闭即时恢复，完整设置入口可打开', async ({ page, extension }) => {
  const ui = await openUI(extension, page, 'popup', true);
  let options;
  try {
    await expect(ui.locator('#enabled')).toBeEnabled();
    await ui.locator('#enabled').uncheck();
    await expect.poll(async () => (await storedSettings(extension)).enabled).toBe(false);
    await expect(ui.locator('#site-hint')).toBeVisible();
    await page.locator('#grab').hover();
    await expect.poll(() => cursor(page.locator('#grab'))).toBe('grab');
    const opened = extension.context.waitForEvent('page');
    await ui.locator('#open-options').click();
    options = await opened;
    await options.waitForURL(`chrome-extension://${extension.id}/options/options.html`);
    await expect(options.locator('#save')).toBeEnabled();
    await expect(options.locator('#enabled')).not.toBeChecked();
  } finally {
    await options?.close();
    await ui.close();
  }
});

test('不支持的活动页面禁用网站开关，不妨碍全局设置', async ({ page, extension }) => {
  const ui = await openUI(extension, page, 'popup');
  try {
    await expect(ui.locator('#site-enabled')).toBeDisabled();
    await expect(ui.locator('#enabled')).toBeEnabled();
  } finally {
    await ui.close();
  }
});
