import { localizePage, t } from '../shared/i18n.js';
import {
  applyTheme,
  errorText,
  readSettings,
  setStatus,
  updateSettings,
} from '../ui/settings-ui.js';

localizePage();

const enabled = document.querySelector('#enabled');
const theme = document.querySelector('#theme');
const siteEnabled = document.querySelector('#site-enabled');
const currentHost = document.querySelector('#current-host');
const siteHint = document.querySelector('#site-hint');
const status = document.querySelector('#status');
const openOptions = document.querySelector('#open-options');
let settings = null;
let hostname = null;
let siteError = false;
let busy = true;

function updateDisabled() {
  enabled.disabled = busy || !settings;
  theme.disabled = busy || !settings;
  siteEnabled.disabled = busy || !settings || !hostname;
}

function render() {
  if (settings) {
    enabled.checked = settings.enabled;
    theme.value = settings.theme;
    applyTheme(settings.theme);
  }

  currentHost.textContent = hostname || (siteError ? t('siteReadUnavailable') : t('unsupportedPage'));
  siteEnabled.checked = Boolean(settings && hostname && !settings.excludedHosts.includes(hostname));

  if (!hostname) {
    siteHint.textContent = siteError
      ? t('siteReadRetry')
      : t('httpOnly');
  } else if (!settings) {
    siteHint.textContent = t('siteSettingsUnavailable');
  } else if (!settings.enabled) {
    siteHint.textContent = t('globalDisabledHint');
  } else {
    siteHint.textContent = t('hostnameOnlyHint');
  }
  updateDisabled();
}

async function persist(update, message) {
  if (busy || !settings) return;
  busy = true;
  updateDisabled();
  setStatus(status, t('saving'));
  try {
    settings = await updateSettings(update);
    setStatus(status, message, 'success');
  } catch (error) {
    setStatus(status, t('saveFailed', errorText(error)), 'error');
  } finally {
    busy = false;
    render();
  }
}

enabled.addEventListener('change', () => {
  const checked = enabled.checked;
  persist(current => ({ ...current, enabled: checked }), checked ? t('globallyEnabled') : t('globallyDisabled'));
});

theme.addEventListener('change', () => {
  const value = theme.value;
  persist(current => ({ ...current, theme: value }), t('appearanceSaved'));
});

siteEnabled.addEventListener('change', () => {
  if (!hostname) return;
  const checked = siteEnabled.checked;
  persist(current => ({
    ...current,
    excludedHosts: checked
      ? current.excludedHosts.filter(host => host !== hostname)
      : [...current.excludedHosts, hostname],
  }), t('sitePreferenceSaved'));
});

openOptions.addEventListener('click', async () => {
  openOptions.disabled = true;
  try {
    await chrome.runtime.openOptionsPage();
  } catch (error) {
    setStatus(status, t('openSettingsFailed', errorText(error)), 'error');
  } finally {
    openOptions.disabled = false;
  }
});

async function readActiveHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  const url = new URL(tab.url);
  return ['http:', 'https:'].includes(url.protocol) ? url.hostname.toLowerCase() : null;
}

async function initialize() {
  const [stored, site] = await Promise.allSettled([readSettings(), readActiveHost()]);
  const errors = [];
  if (stored.status === 'fulfilled') {
    settings = stored.value;
  } else {
    errors.push(t('popupSettingsReadFailed', errorText(stored.reason)));
  }
  if (site.status === 'fulfilled') {
    hostname = site.value;
  } else {
    siteError = true;
    errors.push(t('siteReadFailed', errorText(site.reason)));
  }
  busy = false;
  render();
  setStatus(status, errors.join(' '), errors.length ? 'error' : 'info');
}

initialize();
