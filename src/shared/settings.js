export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  theme: 'auto',
  excludedHosts: Object.freeze([]),
});

export const THEMES = Object.freeze(['auto', 'light', 'dark']);

export function parseHost(value) {
  const input = value.trim();
  if (!input || /[\s*]/u.test(input)) {
    throw new Error('请输入有效的主机名或 HTTP(S) 地址，不支持通配符。');
  }
  const url = new URL(input.includes('://') ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('只接受不包含用户名和密码的 HTTP(S) 地址。');
  }
  return url.hostname.toLowerCase();
}

export function normalizeSettings(value = {}) {
  const settings = value && typeof value === 'object' ? value : {};
  const hosts = Array.isArray(settings.excludedHosts) ? settings.excludedHosts : [];
  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : true,
    theme: THEMES.includes(settings.theme) ? settings.theme : 'auto',
    excludedHosts: [...new Set(hosts.flatMap(host => {
      if (typeof host !== 'string') return [];
      try {
        return [parseHost(host)];
      } catch {
        return [];
      }
    }))].sort(),
  };
}

export function isEnabledForHost(settings, hostname) {
  return settings.enabled && !settings.excludedHosts.includes(hostname.toLowerCase());
}
