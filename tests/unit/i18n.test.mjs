import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { t } from '../../src/shared/i18n.js';

const src = new URL('../../src/', import.meta.url);
const catalogs = Object.fromEntries(await Promise.all(['en', 'zh_CN'].map(async locale => [
  locale, JSON.parse(await readFile(new URL(`_locales/${locale}/messages.json`, src), 'utf8')),
])));

test('中英消息键和占位符一致，消息非空且无未声明占位符', () => {
  assert.deepEqual(Object.keys(catalogs.zh_CN).sort(), Object.keys(catalogs.en).sort());
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, entry] of Object.entries(catalog)) {
      assert.ok(entry.message.trim(), `${locale}:${key}`);
      const names = [...entry.message.matchAll(/\$(\w+)\$/gu)].map(match => match[1].toLowerCase()).sort();
      assert.deepEqual(names, Object.keys(entry.placeholders ?? {}).sort(), `${locale}:${key}`);
      assert.deepEqual(entry.placeholders ?? {}, catalogs.en[key].placeholders ?? {}, `${locale}:${key}`);
      for (const placeholder of Object.values(entry.placeholders ?? {})) assert.match(placeholder.content, /^\$[1-9]$/u);
    }
  }
});

test('源代码、HTML 和 manifest 的每个消息键都存在，目录无失去引用的消息', async () => {
  const used = new Set();
  for (const name of await readdir(src, { recursive: true })) {
    if (!/\.(?:js|html)$/u.test(name) && name !== 'manifest.json') continue;
    const text = await readFile(new URL(name.replaceAll('\\', '/'), src), 'utf8');
    for (const pattern of [/\bt\(\s*['"](\w+)['"]/gu, /data-i18n(?:-[\w-]+)?="(\w+)"/gu, /__MSG_(\w+)__/gu]) {
      for (const match of text.matchAll(pattern)) {
        assert.ok(Object.hasOwn(catalogs.en, match[1]), `${name}:${match[1]}`);
        used.add(match[1]);
      }
    }
  }
  assert.deepEqual([...used].sort(), Object.keys(catalogs.en).sort());
});

test('Node 默认英文支持原生消息占位符，替换值不会被再次插值', () => {
  assert.equal(t('saved'), 'Saved');
  assert.equal(t('sharePalette', 'Dark'), 'Also apply to Dark this time');
  assert.equal(t('hotspotBounds', ['X', 32]), 'X must be at least 0 and less than 32.');
  assert.equal(t('calibrationImageAlt', '<img>$palette$'), 'Enlarged calibration: <img>$palette$');
  assert.throws(() => t('missingMessage'), /Unknown i18n message/u);
});

test('Chrome 存在时只调用原生 i18n，不按网页语言或自定义规则选语言', context => {
  const original = globalThis.chrome;
  context.after(() => { globalThis.chrome = original; });
  const calls = [];
  globalThis.chrome = { i18n: { getMessage: (...args) => { calls.push(args); return '原生消息'; } } };
  assert.equal(t('hotspotBounds', ['X', 32]), '原生消息');
  assert.deepEqual(calls, [['hotspotBounds', ['X', '32']]]);
});
