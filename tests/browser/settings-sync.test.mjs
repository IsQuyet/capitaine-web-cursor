import { test, expect, setExcludedHosts } from './fixtures.mjs';

test.beforeEach(async ({ page }) => { await page.bringToFront(); });

async function openSettings(extension, name) {
  const ui = await extension.context.newPage();
  await ui.goto(`chrome-extension://${extension.id}/${name}/${name}.html`);
  await expect(ui.locator('#theme')).toBeEnabled();
  return ui;
}

async function stored(extension) {
  return extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
}

async function setPopupMode(ui, value) {
  await ui.locator('#theme').selectOption(value);
  await expect(ui.locator('#theme')).toBeEnabled();
}

test('面板只保存网站排除时，保留弹窗刚修改的显示模式', async ({ extension }) => {
  const ui = await openSettings(extension, 'options');
  const popup = await openSettings(extension, 'popup');
  try {
    await setPopupMode(popup, 'dark');
    await expect.poll(async () => (await stored(extension)).theme).toBe('dark');
    await setExcludedHosts(ui, 'example.com');
    await ui.locator('#save').click();
    await expect.poll(async () => (await stored(extension)).excludedHosts).toEqual(['example.com']);
    expect((await stored(extension)).theme).toBe('dark');
    await expect(ui.locator('#theme')).toHaveValue('dark');
  } finally {
    await popup.close(); await ui.close();
  }
});

test('同步其他入口的设置，同时保留尚未保存的网站草稿', async ({ extension }) => {
  const ui = await openSettings(extension, 'options');
  const popup = await openSettings(extension, 'popup');
  try {
    await setExcludedHosts(ui, 'pending.example');
    await setPopupMode(popup, 'dark');
    await popup.locator('#enabled').uncheck();
    await expect(popup.locator('#enabled')).toBeEnabled();
    await expect(ui.locator('#theme')).toHaveValue('dark');
    await expect(ui.locator('#enabled')).not.toBeChecked();
    await expect(ui.locator('#excluded-hosts')).toHaveValue('pending.example');
    await ui.locator('#save').click();
    await expect.poll(() => stored(extension)).toEqual({ enabled: false, theme: 'dark', excludedHosts: ['pending.example'] });
  } finally {
    await popup.close(); await ui.close();
  }
});

test('保留主动编辑的主题，保存时合并最新的其他字段', async ({ extension }) => {
  const ui = await openSettings(extension, 'options');
  const popup = await openSettings(extension, 'popup');
  try {
    await ui.locator('#theme').selectOption('light');
    await setPopupMode(popup, 'dark');
    await extension.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, excludedHosts: ['remote.example'] } });
    });
    await expect(ui.locator('#theme')).toHaveValue('light');
    await expect(ui.locator('#excluded-hosts')).toHaveValue('remote.example');
    await ui.locator('#save').click();
    await expect.poll(() => stored(extension)).toEqual({ enabled: true, theme: 'light', excludedHosts: ['remote.example'] });
  } finally {
    await popup.close(); await ui.close();
  }
});
