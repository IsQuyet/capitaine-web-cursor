import { readFile } from 'node:fs/promises';
import { test, expect, message, setExcludedHosts } from './fixtures.mjs';
import { svgFile, fileAsset, setAsset } from './cursor-files.mjs';

const catalogs = Object.fromEntries(await Promise.all(['en', 'zh_CN'].map(async locale => [
  locale, JSON.parse(await readFile(new URL(`../../src/_locales/${locale}/messages.json`, import.meta.url), 'utf8')),
])));

function expectedMessage(catalog, key, values = []) {
  const entry = catalog[key];
  return entry.message.replace(/\$(\w+)\$/gu, (_match, name) => entry.placeholders[name.toLowerCase()].content
    .replace(/\$([1-9])/gu, (_token, index) => values[Number(index) - 1] ?? ''));
}

async function openUI(extension, name, activeSite) {
  const ui = await extension.context.newPage();
  if (activeSite) await activeSite.bringToFront();
  await ui.goto(`chrome-extension://${extension.id}/${name}/${name}.html`);
  await expect(ui.locator('#theme')).toBeEnabled();
  if (name === 'options') await expect(ui.locator('#cursor-calibrator')).toBeEnabled();
  return ui;
}

async function expectMessage(ui, selector, key, values = []) {
  await expect(ui.locator(selector)).toHaveText(await message(ui, key, values));
}

async function expectLayout(ui, name) {
  expect(await ui.evaluate(() => ({
    page: document.documentElement.scrollWidth <= window.innerWidth,
    body: document.body.scrollWidth <= document.body.clientWidth,
  }))).toEqual({ page: true, body: true });
  const overflow = await ui.locator('button, select, input:not([hidden]), textarea, .page-footer a').evaluateAll(elements => {
    const shell = document.querySelector('main').getBoundingClientRect();
    return elements.filter(element => {
      if (!element.getClientRects().length) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.left < shell.left - 1 || bounds.right > shell.right + 1 || element.scrollWidth > element.clientWidth + 2;
    }).map(element => element.id || element.tagName);
  });
  expect(overflow).toEqual([]);
  const footer = ui.locator('.page-footer');
  const lastAction = ui.locator(name === 'options' ? '#cursor-editor' : '#open-options');
  expect((await footer.boundingBox()).y).toBeGreaterThanOrEqual((await lastAction.boundingBox()).y + (await lastAction.boundingBox()).height);
}

for (const [browserUILanguage, catalogName] of [['en-US', 'en'], ['zh-CN', 'zh_CN'], ['de', 'en']]) {
  const localizedTest = test.extend({ browserUILanguage: [browserUILanguage, { option: true, scope: 'worker' }] });
  localizedTest.describe(`Chrome 原生 i18n ${browserUILanguage}`, () => {

    localizedTest('消息目录、manifest 和静态界面使用真实 UI 语言，布局与页脚保持完整', async ({ page, extension }) => {
      const catalog = catalogs[catalogName];
      const native = await extension.worker.evaluate(async keys => ({
        uiLanguage: chrome.i18n.getUILanguage(),
        messages: Object.fromEntries(keys.map(key => [key, chrome.i18n.getMessage(key, ['first', 'second'])])),
        description: chrome.runtime.getManifest().description,
        actionTitle: await chrome.action.getTitle({}),
      }), Object.keys(catalog));
      expect(native.uiLanguage).toBe(browserUILanguage);
      for (const key of Object.keys(catalog)) {
        expect(native.messages[key], key).toBe(expectedMessage(catalog, key, ['first', 'second']));
        expect(native.messages[key], key).not.toMatch(/__MSG_|\$\w+\$/u);
      }
      expect(native.description).toBe(catalog.extensionDescription.message);
      expect(native.actionTitle).toBe(catalog.actionTitle.message);
      console.log(`native i18n: ${native.uiLanguage} → ${native.messages.localeCode}, ${Object.keys(catalog).length} keys`);

      for (const name of ['options', 'popup']) {
        const ui = await openUI(extension, name, page);
        const errors = [];
        ui.on('pageerror', error => errors.push(error.message));
        try {
          await expect(ui.locator('html')).toHaveAttribute('lang', catalog.localeCode.message);
          await expect(ui).toHaveTitle(catalog[name === 'options' ? 'optionsTitle' : 'popupTitle'].message);
          await expect(ui.locator('#theme option')).toHaveText(['Auto', 'Light', 'Dark']);
          expect(await ui.locator('select').count()).toBe(name === 'options' ? 4 : 1);
          const staticMismatch = await ui.locator('[data-i18n]').evaluateAll(elements => elements
            .filter(element => !['current-host', 'cursor-reload'].includes(element.id))
            .filter(element => element.textContent !== chrome.i18n.getMessage(element.dataset.i18n))
            .map(element => element.dataset.i18n));
          expect(staticMismatch).toEqual([]);
          const attributeMismatch = await ui.locator('[data-i18n-aria-label]').evaluateAll(elements => elements
            .filter(element => element.getAttribute('aria-label') !== chrome.i18n.getMessage(element.getAttribute('data-i18n-aria-label')))
            .map(element => element.id));
          expect(attributeMismatch).toEqual([]);
          if (catalogName === 'en') expect(await ui.locator('body').innerText()).not.toMatch(/[一-鿿]/u);
          const link = ui.locator('.page-footer a');
          await expect(link).toHaveText('GitHub');
          await expect(link).toHaveAttribute('href', 'https://github.com/IsQuyet/capitaine-web-cursor');
          await expect(link).toHaveAttribute('target', '_blank');
          await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
          await link.focus();
          expect(await link.evaluate(element => getComputedStyle(element).outlineWidth)).toBe('2px');
          await ui.emulateMedia({ colorScheme: 'light' });
          await expectLayout(ui, name);
          if (browserUILanguage !== 'de') await ui.locator('body').screenshot({ path: `.cache/i18n-${browserUILanguage}-${name}-light.png` });
          await ui.emulateMedia({ colorScheme: 'dark' });
          if (name === 'options') await ui.setViewportSize({ width: 360, height: 850 });
          await expectLayout(ui, name);
          if (browserUILanguage !== 'de') await ui.locator('body').screenshot({ path: `.cache/i18n-${browserUILanguage}-${name}-dark.png` });
          expect(errors).toEqual([]);
        } finally {
          await ui.close();
        }
      }
    });

    localizedTest('动态设置、导入错误、hotspot 校准与后台错误均本地化', async ({ page, extension }) => {
      const ui = await openUI(extension, 'options');
      let popup;
      try {
        await expectMessage(ui, '#theme-help', 'autoThemeHelp');
        await setExcludedHosts(ui, 'example.com\n*.example.org');
        await expectMessage(ui, '#status', 'unsaved');
        await ui.locator('#save').click();
        await expectMessage(ui, '#status', 'invalidHostLine', 2);
        await setExcludedHosts(ui, 'example.com');
        await ui.locator('#save').click();
        await expectMessage(ui, '#status', 'saved');
        await ui.locator('#cursor-hotspot-x').fill('32');
        await expectMessage(ui, '#cursor-hotspot-bounds', 'hotspotBounds', ['X', 32]);
        await expect(ui.locator('#cursor-apply')).toBeDisabled();
        await ui.locator('#cursor-file').setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" onload="alert(1)"/>') });
        await expectMessage(ui, '#cursor-editor-status', 'importFailed', await message(ui, 'svgEvents'));
        await ui.locator('#cursor-file').setInputFiles({ name: 'custom.svg', mimeType: 'image/svg+xml', buffer: svgFile() });
        await expect(ui.locator('#cursor-apply')).toBeEnabled();
        await expectMessage(ui, '#cursor-draft-state', 'unapplied');
        await expectMessage(ui, '#cursor-share-label', 'sharePalette', 'Dark');
        await expect(ui.locator('#cursor-image')).toHaveAttribute('alt', await message(ui, 'calibrationImageAlt', 'custom.svg'));
        const switchPrompt = await message(ui, 'discardOnSwitch');
        const switching = ui.waitForEvent('dialog');
        const selecting = ui.locator('#cursor-type').selectOption('copy');
        const dialog = await switching;
        expect(dialog.message()).toBe(switchPrompt);
        await dialog.dismiss();
        await selecting;
        await expect(ui.locator('#cursor-type')).toHaveValue('grab');
        await ui.locator('#cursor-hotspot-x').fill('4');
        await ui.locator('#cursor-hotspot-y').fill('5');
        await ui.locator('#cursor-trial').click({ position: { x: 30, y: 40 } });
        await expectMessage(ui, '#cursor-trial-result', 'trialResult', [30, 40]);
        await ui.locator('#cursor-apply').click();
        await expectMessage(ui, '#cursor-editor-status', 'cursorSaved', ['grab', 'Light / Dark']);
        await expectMessage(ui, '#cursor-reset', 'resetPalette', 'Light');
        await ui.locator('#cursor-hotspot-x').fill('6');
        await setAsset(extension, { ...fileAsset(svgFile('#222222')), id: 'external-update' }, ['light']);
        await expect(ui.locator('#cursor-external-change')).toBeVisible();
        await expectMessage(ui, '#cursor-external-change', 'externalChange');
        await expectMessage(ui, '#cursor-reload', 'loadUpdate');
        const resetPrompt = await message(ui, 'discardOnReset', ['grab', 'Light']);
        const resetting = ui.waitForEvent('dialog');
        const resetClick = ui.locator('#cursor-reset').click();
        const resetDialog = await resetting;
        expect(resetDialog.message()).toBe(resetPrompt);
        await resetDialog.accept();
        await resetClick;
        await expectMessage(ui, '#cursor-editor-status', 'cursorReset', ['grab', 'Light']);
        const rejected = await ui.evaluate(() => chrome.runtime.sendMessage({ type: 'save-cursor-asset', cursorType: 'default', palettes: ['light'], asset: {} }));
        expect(rejected).toEqual({ ok: false, error: await message(ui, 'invalidCursorBinding') });

        popup = await openUI(extension, 'popup', page);
        await expect(popup.locator('#current-host')).toHaveText('127.0.0.1');
        await expectMessage(popup, '#site-hint', 'hostnameOnlyHint');
        await popup.locator('#site-enabled').uncheck();
        await expectMessage(popup, '#status', 'sitePreferenceSaved');
        await popup.locator('#enabled').uncheck();
        await expectMessage(popup, '#status', 'globallyDisabled');
        await expectMessage(popup, '#site-hint', 'globalDisabledHint');
        await popup.locator('#enabled').check();
        await expectMessage(popup, '#status', 'globallyEnabled');
        await popup.locator('#theme').selectOption('dark');
        await expectMessage(popup, '#status', 'appearanceSaved');
        const forbidden = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'reset-cursor-asset', cursorType: 'grab', palettes: ['light'] }));
        expect(forbidden).toEqual({ ok: false, error: await message(popup, 'editInOptions') });
        const rules = await ui.evaluate(() => chrome.runtime.sendMessage({ type: 'cursor-rules', marker: '', theme: 'light' }));
        expect(rules).toEqual({ ok: false, error: await message(ui, 'invalidExtensionMarker') });
        await expectLayout(popup, 'popup');
      } finally {
        await popup?.close();
        // 上面仅 Light 恢复默认，Dark 已保存。没有未应用草稿，不触发离开确认。
        await ui.close();
      }
    });

    localizedTest('读取、保存和打开设置失败时保留原始错误并使用本地化提示', async ({ page, extension }) => {
      const ui = await extension.context.newPage();
      try {
        await ui.addInitScript(() => {
          const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
          window.restoreRead = () => { chrome.storage.local.get = originalGet; };
          chrome.storage.local.get = async () => { throw new Error('Storage unavailable'); };
          chrome.tabs.query = async () => { throw new Error('Tab unavailable'); };
          chrome.runtime.openOptionsPage = async () => { throw new Error('Open unavailable'); };
        });
        await ui.goto(`chrome-extension://${extension.id}/options/options.html`);
        await expectMessage(ui, '#status', 'settingsReadFailed', 'Storage unavailable');
        await expectMessage(ui, '#cursor-editor-status', 'cursorReadFailed', 'Storage unavailable');
        await expectMessage(ui, '#cursor-reload', 'retry');
        await expect(ui.locator('#save')).toBeDisabled();
        await ui.evaluate(() => window.restoreRead());
        await extension.worker.evaluate(async () => {
          await chrome.storage.local.set({ settings: { enabled: true, theme: 'light', excludedHosts: [] } });
        });
        await expect(ui.locator('#save')).toBeEnabled();
        await expect(ui.locator('#status')).toBeEmpty();
        await ui.goto(`chrome-extension://${extension.id}/popup/popup.html`);
        await expect(ui.locator('#status')).toHaveText([
          await message(ui, 'popupSettingsReadFailed', 'Storage unavailable'),
          await message(ui, 'siteReadFailed', 'Tab unavailable'),
        ].join(' '));
        await expectMessage(ui, '#current-host', 'siteReadUnavailable');
        await expectMessage(ui, '#site-hint', 'siteReadRetry');
        await ui.locator('#open-options').click();
        await expectMessage(ui, '#status', 'openSettingsFailed', 'Open unavailable');
      } finally {
        await ui.close();
      }

      const savingUI = await openUI(extension, 'options');
      try {
        await savingUI.evaluate(() => {
          const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
          window.restoreWrite = () => { chrome.storage.local.set = originalSet; };
          chrome.storage.local.set = async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
            throw new Error('Write unavailable');
          };
        });
        await savingUI.locator('#enabled').uncheck();
        await savingUI.locator('#save').click();
        await expectMessage(savingUI, '#save', 'saving');
        await expectMessage(savingUI, '#status', 'saveFailed', 'Write unavailable');
        await expect(savingUI.locator('#status')).toHaveAttribute('data-tone', 'error');
        await expect(savingUI.locator('#save')).toBeEnabled();
        await expectMessage(savingUI, '#save', 'saveSettings');
        await extension.worker.evaluate(async () => {
          const { settings } = await chrome.storage.local.get('settings');
          await chrome.storage.local.set({ settings: { ...settings, excludedHosts: ['remote.example'] } });
        });
        await expect(savingUI.locator('#excluded-hosts')).toHaveValue('remote.example');
        await expectMessage(savingUI, '#status', 'saveFailed', 'Write unavailable');
        await expect(savingUI.locator('#enabled')).not.toBeChecked();
        await savingUI.locator('#theme').selectOption('dark');
        await expectMessage(savingUI, '#status', 'unsaved');
        await savingUI.evaluate(() => window.restoreWrite());
        await savingUI.locator('#save').click();
        await expectMessage(savingUI, '#status', 'saved');
      } finally {
        await savingUI.close();
      }
    });
  });
}
