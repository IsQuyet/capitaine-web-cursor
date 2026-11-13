import { test as base, expect, chromium } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export const test = base.extend({
  browserUILanguage: ['en-US', { option: true, scope: 'worker' }],
  extension: [async ({ browserUILanguage }, use) => {
    await mkdir(path.join(root, '.cache'), { recursive: true });
    const profile = await mkdtemp(path.join(root, '.cache/browser-profile-'));
    const extensionPath = path.join(root, 'dist');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: process.env.HEADED !== '1',
      viewport: { width: 1100, height: 850 },
      locale: browserUILanguage,
      // Linux Chromium 按 LANGUAGE → LC_ALL → LC_MESSAGES → LANG 选择 UI 语言。
      // 只覆盖最高优先级变量，不依赖 runner 安装对应的 POSIX locale。
      env: process.platform === 'linux' ? { ...process.env, LANGUAGE: browserUILanguage } : undefined,
      args: [`--lang=${browserUILanguage}`, `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    try {
      await use({ context, worker, id });
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],
  page: async ({ extension }, use) => {
    await extension.worker.evaluate(async () => {
      await chrome.storage.local.set({
        settings: { enabled: true, theme: 'auto', excludedHosts: [] },
        cursorOverrides: { assets: {}, bindings: { light: {}, dark: {} } },
      });
    });
    const page = await extension.context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('http://127.0.0.1:41731');
    await page.waitForFunction(() => window.fixtureReady);
    try {
      await use(page);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  },
});

export { expect };

export async function message(page, key, substitutions = []) {
  const values = (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  return page.evaluate(({ key, values }) => chrome.i18n.getMessage(key, values), { key, values });
}

export async function cursor(locator) {
  return locator.evaluate(element => getComputedStyle(element).cursor);
}

export async function expectCursor(locator, type, theme = 'light') {
  await expect.poll(() => cursor(locator)).toContain(`/assets/${theme}/${type}.svg`);
}

export async function setExcludedHosts(page, value) {
  if (!await page.locator('#excluded-hosts').isVisible()) await page.locator('#site-settings > summary').click();
  await page.locator('#excluded-hosts').fill(value);
}

export async function settings(extension, patch) {
  await extension.worker.evaluate(async patch => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  }, patch);
}
