import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS, isEnabledForHost, normalizeSettings, parseHost,
} from '../../src/shared/settings.js';

test('空设置使用自动模式且默认启用', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

test('设置归一化并去重，不接受未知模式', () => {
  assert.deepEqual(normalizeSettings({
    enabled: false,
    theme: 'unknown',
    excludedHosts: ['EXAMPLE.com', 'https://example.com/path', 'localhost:8080', '*', null],
  }), { enabled: false, theme: 'auto', excludedHosts: ['example.com', 'localhost'] });
});

test('网站排除按主机名精确匹配，不扩大到子域名', () => {
  const settings = normalizeSettings({ excludedHosts: ['example.com'] });
  assert.equal(isEnabledForHost(settings, 'example.com'), false);
  assert.equal(isEnabledForHost(settings, 'EXAMPLE.COM'), false);
  assert.equal(isEnabledForHost(settings, 'sub.example.com'), true);
  assert.equal(isEnabledForHost({ ...settings, enabled: false }, 'other.com'), false);
});

test('主机名支持 IDN、IPv6 和本地测试端口', () => {
  assert.equal(parseHost('https://例子.中国/a'), 'xn--fsqu00a.xn--fiqs8s');
  assert.equal(parseHost('[::1]:8000'), '[::1]');
  assert.equal(parseHost('localhost:8000'), 'localhost');
});

for (const invalid of ['', '*', 'https://a b', 'ftp://example.com', 'https://user:pass@example.com']) {
  test(`拒绝无效排除项 ${invalid || '空值'}`, () => {
    assert.throws(() => parseHost(invalid));
  });
}
