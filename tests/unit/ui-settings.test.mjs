import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExcludedHosts, updateSettings } from '../../src/ui/settings-ui.js';

for (const [input, expected] of [
  ['', []],
  ['Example.COM\nlocalhost\nexample.com\n', ['example.com', 'localhost']],
  ['例子.中国\n[::1]\n127.0.0.1', ['127.0.0.1', '[::1]', 'xn--fsqu00a.xn--fiqs8s']],
]) {
  test(`设置界面排除主机名归一化 ${input || '空列表'}`, () => {
    assert.deepEqual(parseExcludedHosts(input), expected);
  });
}

for (const invalid of [
  '*.example.com', 'https://example.com', 'example.com/path', 'localhost:8080',
  'a b', '-bad.example', 'a..b', 'name@example.com', 'a?b', 'a#b', '%65xample.com',
]) {
  test(`设置界面拒绝无效主机名 ${invalid}`, () => {
    assert.throws(() => parseExcludedHosts(`example.com\n${invalid}`), /Line 2/u);
  });
}

test('弹窗增量保存保留最新其他设置，存储错误向调用方传播', async t => {
  const original = globalThis.chrome;
  t.after(() => { globalThis.chrome = original; });
  let saved;
  globalThis.chrome = { storage: { local: {
    get: async () => ({ settings: { enabled: true, theme: 'dark', excludedHosts: ['example.com'] } }),
    set: async data => { saved = data.settings; },
  } } };
  await updateSettings(settings => ({ ...settings, enabled: false }));
  assert.deepEqual(saved, { enabled: false, theme: 'dark', excludedHosts: ['example.com'] });
  chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(updateSettings(settings => settings), /Storage unavailable/u);
});
