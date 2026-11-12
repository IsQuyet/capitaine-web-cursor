import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCursorCSS } from '../../src/shared/cursor-css.js';

const map = JSON.parse(await readFile(new URL('../../assets/cursor-map.json', import.meta.url), 'utf8'));
const marker = 'data-capitaine-0123456789abcdef0123456789abcdef';
const url = file => `chrome-extension://test/${file}`;

test('Auto 使用媒体查询和每种类型自己的 fallback', () => {
  const css = createCursorCSS(marker, 'auto', map, url);
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'));
  for (const [type, entry] of Object.entries(map)) {
    assert.ok(css.includes(`[${marker}="${type}"]`));
    assert.ok(css.includes(url(entry.light)));
    assert.ok(css.includes(url(entry.dark)));
    assert.ok(css.includes(`, ${type} !important;`));
  }
  assert.equal((css.match(/cursor:/gu) || []).length, 20);
});

test('手动主题不包含另一主题或媒体查询', () => {
  const css = createCursorCSS(marker, 'light', map, url);
  assert.ok(!css.includes('@media'));
  assert.ok(!css.includes('/dark/'));
  assert.equal((css.match(/cursor:/gu) || []).length, 10);
});

test('标记与主题不能注入任意 CSS', () => {
  assert.throws(() => createCursorCSS('data-x] {color:red}', 'light', map, url));
  assert.throws(() => createCursorCSS(marker, 'unknown', map, url));
});
