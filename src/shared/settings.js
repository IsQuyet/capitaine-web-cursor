import { t } from './i18n.js';
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  theme: 'auto',
  excludedHosts: Object.freeze([]),
});

export const THEMES = Object.freeze(['auto', 'light', 'dark']);

export function parseHost(value) {
  const input = value.trim();
  if (!input || /[\s*]/u.test(input)) {
    throw new Error(t('invalidHost'));
  }
  const url = new URL(input.includes('://') ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(t('invalidHostURL'));
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
