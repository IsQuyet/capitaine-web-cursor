import { test, expect, settings, setExcludedHosts } from './fixtures.mjs';

test.beforeEach(async ({ page }) => { await page.bringToFront(); });

const PALETTES = {
  light: { background: 'rgb(255, 255, 255)', surface: 'rgb(247, 247, 247)', text: 'rgb(17, 17, 17)', accent: 'rgb(201, 31, 112)', buttonText: 'rgb(255, 255, 255)' },
  dark: { background: 'rgb(10, 10, 10)', surface: 'rgb(22, 22, 22)', text: 'rgb(245, 245, 245)', accent: 'rgb(255, 92, 168)', buttonText: 'rgb(17, 17, 17)' },
};

async function openUI(extension, name, colorScheme) {
  const ui = await extension.context.newPage();
  await ui.emulateMedia({ colorScheme });
  await ui.goto(`chrome-extension://${extension.id}/${name}/${name}.html`);
  await expect(ui.locator('#theme')).toBeEnabled();
  if (name === 'options') await expect(ui.locator('#cursor-calibrator')).toBeEnabled();
  return ui;
}

async function colors(ui) {
  return ui.evaluate(() => {
    const body = getComputedStyle(document.body);
    return {
      background: body.backgroundColor,
      text: body.color,
      surface: getComputedStyle(document.querySelector('.panel')).backgroundColor,
      accent: getComputedStyle(document.querySelector('#enabled')).backgroundColor,
    };
  });
}

async function expectPalette(ui, palette) {
  const { background, text, surface, accent } = PALETTES[palette];
  await expect.poll(() => colors(ui)).toEqual({ background, text, surface, accent });
}

async function selectMode(ui, extension, name, mode) {
  await ui.locator('#theme').selectOption(mode);
  if (name === 'options') await ui.locator('#save').click();
  await expect.poll(() => extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.theme)).toBe(mode);
}

function contrast(first, second) {
  const luminance = color => color.match(/[\d.]+/gu).slice(0, 3).map(Number)
    .map(value => value / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const name of ['options', 'popup']) {
  test(`${name} 的 Auto 随浏览器配色切换，手动 Light / Dark 保持所选模式`, async ({ extension }) => {
    const ui = await openUI(extension, name, 'light');
    try {
      await expectPalette(ui, 'light');
      await ui.emulateMedia({ colorScheme: 'dark' });
      await expectPalette(ui, 'dark');
      await ui.emulateMedia({ colorScheme: 'light' });
      await selectMode(ui, extension, name, 'dark');
      await expectPalette(ui, 'dark');
      await ui.emulateMedia({ colorScheme: 'dark' });
      await selectMode(ui, extension, name, 'light');
      await expectPalette(ui, 'light');
      await selectMode(ui, extension, name, 'auto');
      await expectPalette(ui, 'dark');
    } finally {
      await ui.close();
    }
  });
}

for (const palette of ['light', 'dark']) {
  test(`${palette} 的粉色按钮、状态文字、placeholder 和焦点描边保持清晰`, async ({ extension }) => {
    await settings(extension, { theme: palette });
    const ui = await openUI(extension, 'options', palette === 'light' ? 'dark' : 'light');
    try {
      await expectPalette(ui, palette);
      await ui.locator('#cursor-hotspot-x').fill('5');
      await ui.locator('#save').click();
      await expect(ui.locator('#status')).toHaveAttribute('data-tone', 'success');
      await ui.locator('#site-settings > summary').click();
      await ui.mouse.move(1, 1);
      const values = await ui.evaluate(() => {
        const style = id => getComputedStyle(document.querySelector(id));
        const body = getComputedStyle(document.body);
        const placeholder = getComputedStyle(document.querySelector('#excluded-hosts'), '::placeholder');
        const thumb = getComputedStyle(document.querySelector('#enabled'), '::before');
        return {
          text: [body.color, body.backgroundColor],
          button: [style('#save').color, style('#save').backgroundColor],
          hint: [style('#cursor-file-help').color, style('#cursor-editor').backgroundColor],
          badge: [style('#cursor-draft-state').color, style('#cursor-draft-state').backgroundColor],
          placeholder: [placeholder.color, style('#excluded-hosts').backgroundColor],
          placeholderOpacity: placeholder.opacity,
          successColor: style('#status').color,
          thumb: [thumb.backgroundColor, style('#enabled').backgroundColor],
        };
      });
      expect(values.button).toEqual([PALETTES[palette].buttonText, PALETTES[palette].accent]);
      for (const role of ['text', 'button', 'hint', 'badge', 'placeholder']) {
        expect(contrast(...values[role]), role).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(...values.thumb)).toBeGreaterThanOrEqual(3);
      expect(values.placeholderOpacity).toBe('1');
      expect(values.successColor).toBe(PALETTES[palette].text);
      await ui.locator('#save').hover();
      const hover = await ui.locator('#save').evaluate(element => {
        const style = getComputedStyle(element);
        return [style.color, style.backgroundColor];
      });
      expect(contrast(...hover)).toBeGreaterThanOrEqual(4.5);
      await ui.locator('#theme').focus();
      await ui.keyboard.press('Tab');
      const focus = await ui.evaluate(() => {
        const active = document.activeElement;
        const style = getComputedStyle(active);
        return { visible: active.matches(':focus-visible'), color: style.outlineColor, width: style.outlineWidth };
      });
      expect(focus).toEqual({ visible: true, color: PALETTES[palette].accent, width: '2px' });
      await ui.locator('#cursor-preview-background').selectOption('dark');
      expect(await ui.locator('#cursor-trial').evaluate(element => {
        const style = getComputedStyle(element);
        return [style.color, style.backgroundColor];
      })).toEqual(['rgb(245, 245, 245)', 'rgb(22, 22, 22)']);
      await setExcludedHosts(ui, '*.example.com');
      await ui.locator('#save').click();
      await expect(ui.locator('#status')).toHaveAttribute('data-tone', 'error');
      const error = await ui.locator('#status').evaluate(element => getComputedStyle(element).color);
      expect(error).not.toBe(PALETTES[palette].accent);
      expect(contrast(error, PALETTES[palette].background)).toBeGreaterThanOrEqual(4.5);
    } finally {
      await ui.close();
    }
  });
}
