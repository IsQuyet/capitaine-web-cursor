import { test, expect, cursor, expectCursor, settings } from './fixtures.mjs';

test('不安全的 HTTP 网页也能初始化，不能依赖 randomUUID', async ({ page }) => {
  await page.route('http://capitaine.test:41731/**', async route => {
    const response = await page.request.get(route.request().url().replace('capitaine.test', '127.0.0.1'));
    await route.fulfill({ response });
  });
  await page.goto('http://capitaine.test:41731');
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  await page.locator('#grab').hover();
  await expectCursor(page.locator('#grab'), 'grab');
});

test('离开网页视口会清理当前标记', async ({ page }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab');
  await page.mouse.move(-5, -5);
  await expect.poll(() => cursor(target)).toBe('grab');
});

test('触屏事件不改变已知鼠标目标', async ({ page }) => {
  await page.locator('#grab').hover();
  await expectCursor(page.locator('#grab'), 'grab');
  await page.locator('#copy').dispatchEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 10 });
  await page.waitForTimeout(150);
  await expectCursor(page.locator('#grab'), 'grab');
  expect(await cursor(page.locator('#copy'))).toBe('copy');
});
test('被复制到其他位置的标记会清除，不污染非当前元素', async ({ page }) => {
  const source = page.locator('#grab');
  await source.hover();
  await expectCursor(source, 'grab');
  await source.evaluate(element => {
    const clone = element.cloneNode(true);
    clone.id = 'background-clone';
    clone.style.setProperty('cursor', 'copy', 'important');
    document.body.append(clone);
  });
  const clone = page.locator('#background-clone');
  await expect.poll(() => cursor(clone)).toBe('copy');
  expect(await clone.evaluate(el => [...el.attributes].some(a => a.name.startsWith('data-capitaine-')))).toBe(false);
  await expectCursor(source, 'grab');
});

test('网页运行期间写入同名属性时，停用恢复网页新值', async ({ page, extension }) => {
  const target = page.locator('#grab');
  await target.hover();
  await expectCursor(target, 'grab');
  const marker = await target.evaluate(el => [...el.attributes].find(a => a.name.startsWith('data-capitaine-')).name);
  await target.evaluate((el, marker) => el.setAttribute(marker, 'website-value'), marker);
  await expectCursor(target, 'grab');
  await settings(extension, { enabled: false });
  await expect.poll(() => target.getAttribute(marker)).toBe('website-value');
  expect(await cursor(target)).toBe('grab');
});

test('停用期间鼠标移动后，重新启用采用最新位置', async ({ page, extension }) => {
  await page.locator('#grab').hover();
  await expectCursor(page.locator('#grab'), 'grab');
  await settings(extension, { enabled: false });
  await expect.poll(() => cursor(page.locator('#grab'))).toBe('grab');
  await page.locator('#copy').hover();
  expect(await cursor(page.locator('#copy'))).toBe('copy');
  await settings(extension, { enabled: true });
  await expectCursor(page.locator('#copy'), 'copy');
  expect(await cursor(page.locator('#grab'))).toBe('grab');
});

test('顶层网站排除也停用跨源 Frame，取消排除可静止恢复', async ({ page, extension }) => {
  await page.locator('#frames').evaluate(el => {
    el.innerHTML = '<iframe id="excluded-frame" src="http://localhost:41731/frame.html"></iframe>';
  });
  const target = page.frameLocator('#excluded-frame').locator('#frame-target');
  await target.hover();
  await expectCursor(target, 'cell');
  await settings(extension, { excludedHosts: ['127.0.0.1'] });
  await expect.poll(() => cursor(target)).toBe('cell');
  await settings(extension, { excludedHosts: [] });
  await expectCursor(target, 'cell');
});

test('鼠标静止时新增开放 Shadow Root 仍能识别', async ({ page }) => {
  const host = page.locator('#plain');
  await host.hover();
  await host.evaluate(el => {
    const root = el.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="late" style="height:100%;cursor:zoom-in !important">延后创建</div>';
  });
  await expectCursor(page.locator('#plain #late'), 'zoom-in');
});

test('已存在的嵌套 Shadow Root 在标记变化后适用 USER important', async ({ page, extension }) => {
  await page.evaluate(() => {
    const host = document.createElement('section');
    host.id = 'late-probe';
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<span data-user-probe="yes" style="cursor:grab !important">单层</span><aside></aside>';
    const nested = root.querySelector('aside').attachShadow({ mode: 'open' });
    nested.innerHTML = '<span data-user-probe="yes" style="cursor:grabbing !important">嵌套</span>';
    getComputedStyle(root.querySelector('span')).cursor;
    getComputedStyle(nested.querySelector('span')).cursor;
  });
  await extension.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id }, origin: 'USER',
      css: '[data-user-probe="yes"] { cursor: copy !important; }',
    });
  });
  const values = await page.evaluate(() => {
    const root = document.querySelector('#late-probe').shadowRoot;
    const elements = [root.querySelector('span'), root.querySelector('aside').shadowRoot.querySelector('span')];
    return elements.map(el => {
      el.removeAttribute('data-user-probe');
      el.setAttribute('data-user-probe', 'yes');
      return getComputedStyle(el).cursor;
    });
  });
  expect(values).toEqual(['copy', 'copy']);
});
