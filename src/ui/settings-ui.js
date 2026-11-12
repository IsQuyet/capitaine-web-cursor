import { normalizeSettings, parseHost } from '../shared/settings.js';

export async function readSettings() {
  const stored = await chrome.storage.local.get('settings');
  return normalizeSettings(stored.settings);
}

export async function updateSettings(update) {
  const current = await readSettings();
  const next = normalizeSettings(update(current));
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function setStatus(element, message, tone = 'info') {
  element.dataset.tone = tone;
  element.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  element.textContent = message;
}

export function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function parseExcludedHosts(text) {
  const hosts = [];
  const lines = text.split(/\r?\n/u);

  for (const [index, line] of lines.entries()) {
    const value = line.trim();
    if (!value) continue;

    try {
      // 只接受主机名，避免把带路径的地址误当作整站排除规则。
      const ipv6 = /^\[[\da-f:.]+\]$/iu.test(value);
      if (/[\s/?#@\\%*]/u.test(value) || (!ipv6 && value.includes(':'))) {
        throw new Error('请只填写主机名，不含协议、端口、路径或通配符。');
      }

      const host = parseHost(value);
      const domain = host.endsWith('.') ? host.slice(0, -1) : host;
      if (!ipv6 && (domain.length > 253 || !domain.split('.').every(label =>
        /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/iu.test(label)))) {
        throw new Error('主机名格式无效。');
      }
      hosts.push(host);
    } catch {
      throw new Error(`第 ${index + 1} 行不是有效主机名。请填写 example.com 这样的主机名，不含协议、端口、路径或通配符。`);
    }
  }

  return [...new Set(hosts)].sort();
}
