import { test, expect, cursor, expectCursor, settings } from './fixtures.mjs';

const types = ['grab', 'grabbing', 'zoom-in', 'zoom-out', 'cell', 'vertical-text', 'alias', 'copy', 'col-resize', 'row-resize'];

for (const type of types) {
  test(`USER 样式替换 ${type}，即使网站使用 inline important`, async ({ page }) => {
    const target = page.locator(`#${type}`);
    await target.hover();
    await expectCursor(target, type);
    const expectedHotspot = ['alias', 'copy'].includes(type) ? '5 2' : '16 16';
    expect(await cursor(target)).toContain(`${expectedHotspot}, ${type}`);
    expect(await target.getAttribute('style')).toBe(`cursor: ${type} !important`);
  });
}

test('网站图片、none 与非目标类型原样保留', async ({ page }) => {
  for (const id of ['custom', 'none', 'plain']) {
    const element = page.locator(`#${id}`);
    const original = await cursor(element);
    await element.hover();
    await page.waitForTimeout(180);
    expect(await cursor(element)).toBe(original);
    expect(await element.evaluate(el => [...el.attributes].some(a => a.name.startsWith('data-capitaine-')))).toBe(false);
  }
});

test('静止鼠标跟随 inline、class、CSSOM 和网站图片变化', async ({ page }) => {
  const target = page.locator('#changing');
  await target.hover();
  await expectCursor(target, 'grab');
  await target.evaluate(el => { el.className = 'card changed'; });
  await expectCursor(target, 'zoom-out');
  await target.evaluate(el => { el.style.cursor = 'grabbing'; });
  await expectCursor(target, 'grabbing');
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('#changing { cursor: zoom-in !important; }');
    document.adoptedStyleSheets.push(sheet);
    window.dynamicSheet = sheet;
  });
  await expectCursor(target, 'zoom-in');
  await page.evaluate(() => {
    window.dynamicSheet.replaceSync('#changing { cursor: url("/cursor.svg") 4 4, grab !important; }');
  });
  await expect.poll(() => cursor(target)).toBe('url("http://127.0.0.1:41731/cursor.svg") 4 4, grab');
});

test('继承与快速切换不会把上次覆盖误认为网站样式', async ({ page }) => {
  const parent = page.locator('#inherited');
  await parent.hover({ position: { x: 130, y: 50 } });
  await expectCursor(parent, 'grab');
  await page.locator('#child').hover();
  await expectCursor(page.locator('#child'), 'grab');
  expect(await cursor(parent)).toBe('grab');
  await page.locator('#explicit').hover();
  await expectCursor(page.locator('#explicit'), 'zoom-in');
  await page.locator('#plain').hover();
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(el => [...el.attributes].some(attr => attr.name.startsWith('data-capitaine-'))).length)).toBe(0);
});

test('替换或移除鼠标下的 DOM 后重新命中，不残留标记', async ({ page }) => {
  const target = page.locator('#changing');
  await target.hover();
  await expectCursor(target, 'grab');
  await target.evaluate(el => {
    window.oldElement = el;
    const replacement = el.cloneNode(true);
    replacement.style.cursor = 'copy';
    el.replaceWith(replacement);
  });
  await expectCursor(target, 'copy');
  expect(await page.evaluate(() => [...window.oldElement.attributes].some(a => a.name.startsWith('data-capitaine-')))).toBe(false);
  await target.evaluate(el => el.remove());
  await expect.poll(() => page.evaluate(() => [...window.oldElement.attributes].some(a => a.name.startsWith('data-capitaine-')))).toBe(false);
});

test('Auto 随媒体查询即时切换，手动主题可覆盖偏好', async ({ page, extension }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectCursor(target, 'grab', 'dark');
  await settings(extension, { theme: 'light' });
  await expectCursor(target, 'grab', 'light');
  await settings(extension, { theme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expectCursor(target, 'grab', 'dark');
});

test('设置关闭后恢复原样，重新启用可工作', async ({ page, extension }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab');
  await settings(extension, { enabled: false });
  await expect.poll(() => cursor(target)).toBe('grab');
  expect(await target.evaluate(el => [...el.attributes].some(a => a.name.startsWith('data-capitaine-')))).toBe(false);
  await settings(extension, { enabled: true });
  await expectCursor(target, 'grab');
});

test('网站排除动态生效，不需要刷新', async ({ page, extension }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab');
  await settings(extension, { excludedHosts: ['127.0.0.1'] });
  await expect.poll(() => cursor(target)).toBe('grab');
  await settings(extension, { excludedHosts: [] });
  await expectCursor(target, 'grab');
});

test('开放与嵌套 Shadow DOM，动态值、主题及清理', async ({ page, extension }) => {
  const single = page.locator('#shadow-host #inner');
  await single.hover();
  await expectCursor(single, 'grab');
  await single.evaluate(el => { el.style.cursor = 'zoom-out'; });
  await expectCursor(single, 'zoom-out');
  const deep = page.locator('#nested-host #deep');
  await deep.hover();
  await expectCursor(deep, 'copy');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectCursor(deep, 'copy', 'dark');
  await settings(extension, { enabled: false });
  await expect.poll(() => cursor(deep)).toBe('copy');
  expect(await page.locator('#shadow-host').evaluate(el => el.shadowRoot.adoptedStyleSheets.length)).toBe(0);
  expect(await page.locator('#nested-host').evaluate(el => {
    const root = el.shadowRoot;
    return root.adoptedStyleSheets.length + root.querySelector('#nested').shadowRoot.adoptedStyleSheets.length;
  })).toBe(0);
});

test('统一 USER 样式覆盖 Shadow DOM 的 inline important', async ({ page }) => {
  const inner = page.locator('#shadow-host #inner');
  await inner.evaluate(el => { el.style.setProperty('cursor', 'grabbing', 'important'); });
  await inner.hover();
  await expectCursor(inner, 'grabbing');
  expect(await inner.getAttribute('style')).toBe('cursor: grabbing !important;');
});

test('Pointer capture 期间跟踪捕获元素，释放后恢复命中', async ({ page }) => {
  const source = page.locator('#capture');
  const other = page.locator('#other');
  await source.hover();
  await expectCursor(source, 'grab');
  await page.mouse.down();
  await expectCursor(source, 'grabbing');
  await other.hover();
  await expectCursor(source, 'grabbing');
  expect(await cursor(other)).toBe('copy');
  await page.mouse.up();
  await expectCursor(other, 'copy');
  expect(await cursor(source)).toBe('grab');
});

test('同源、跨源和 srcdoc Frame 分别注入', async ({ page }) => {
  await page.locator('#frames').evaluate((el) => {
    el.innerHTML = '<iframe id="same" src="/frame.html"></iframe>'
      + '<iframe id="cross" src="http://localhost:41731/frame.html"></iframe>'
      + '<iframe id="srcdoc" srcdoc="<div id=frame-target style=width:180px;height:90px;cursor:cell>srcdoc</div>"></iframe>';
  });
  for (const id of ['same', 'cross', 'srcdoc']) {
    const target = page.frameLocator(`#${id}`).locator('#frame-target');
    await target.hover();
    await expectCursor(target, 'cell');
    const size = await target.evaluate(el => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => reject(new Error('Frame 指针图像加载失败'));
      image.src = getComputedStyle(el).cursor.match(/url\("([^"]+)"\)/u)[1];
    }));
    expect(size).toEqual([32, 32]);
  }
});

test('网页 CSP 不阻断普通 DOM 的用户级规则', async ({ page }) => {
  await page.goto('/csp');
  await page.locator('#changing').hover();
  await expectCursor(page.locator('#changing'), 'grab');
});

test('扩展 SVG 可实际加载，固有显示尺寸保持 32×32', async ({ page, extension }) => {
  const results = await page.evaluate(async id => {
    const images = await Promise.all(['light', 'dark'].flatMap(theme =>
      ['grab', 'grabbing', 'zoom-in', 'zoom-out', 'cell', 'vertical-text', 'alias', 'copy', 'col-resize', 'row-resize'].map(type =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
          image.onerror = () => reject(new Error(`${theme}/${type} 加载失败`));
          image.src = `chrome-extension://${id}/assets/${theme}/${type}.svg`;
        }))));
    return images;
  }, extension.id);
  expect(results).toEqual(Array.from({ length: 20 }, () => [32, 32]));
});

test('观察器不会被自身标记激活成连续写入循环', async ({ page }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab');
  const mutations = await page.evaluate(() => new Promise(resolve => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.querySelector('#grab'), { attributes: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 600);
  }));
  expect(mutations).toBeLessThan(20);
  expect(mutations).toBeGreaterThan(0);
});
