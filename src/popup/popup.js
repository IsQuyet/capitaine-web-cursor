import {
  applyTheme,
  errorText,
  readSettings,
  setStatus,
  updateSettings,
} from '../ui/settings-ui.js';

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

  currentHost.textContent = hostname || (siteError ? '无法读取当前网站' : '此页面不支持');
  siteEnabled.checked = Boolean(settings && hostname && !settings.excludedHosts.includes(hostname));

  if (!hostname) {
    siteHint.textContent = siteError
      ? '请重新打开弹窗，全局设置仍可修改。'
      : '仅支持 HTTP(S) 网页。';
  } else if (!settings) {
    siteHint.textContent = '设置读取失败，无法修改网站偏好。';
  } else if (!settings.enabled) {
    siteHint.textContent = '全局关闭中，网站偏好在开启后生效。';
  } else {
    siteHint.textContent = '仅此主机名，子域名单独设置。';
  }
  updateDisabled();
}

async function persist(update, message) {
  if (busy || !settings) return;
  busy = true;
  updateDisabled();
  setStatus(status, '正在保存…');
  try {
    settings = await updateSettings(update);
    setStatus(status, message, 'success');
  } catch (error) {
    setStatus(status, `保存失败：${errorText(error)}`, 'error');
  } finally {
    busy = false;
    render();
  }
}

enabled.addEventListener('change', () => {
  const checked = enabled.checked;
  persist(current => ({ ...current, enabled: checked }), checked ? '已全局启用' : '已全局关闭');
});

theme.addEventListener('change', () => {
  const value = theme.value;
  persist(current => ({ ...current, theme: value }), '显示模式已保存');
});

siteEnabled.addEventListener('change', () => {
  if (!hostname) return;
  const checked = siteEnabled.checked;
  persist(current => ({
    ...current,
    excludedHosts: checked
      ? current.excludedHosts.filter(host => host !== hostname)
      : [...current.excludedHosts, hostname],
  }), '网站偏好已保存');
});

openOptions.addEventListener('click', async () => {
  openOptions.disabled = true;
  try {
    await chrome.runtime.openOptionsPage();
  } catch (error) {
    setStatus(status, `无法打开完整设置：${errorText(error)}`, 'error');
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
    errors.push(`读取设置失败：${errorText(stored.reason)}`);
  }
  if (site.status === 'fulfilled') {
    hostname = site.value;
  } else {
    siteError = true;
    errors.push(`读取当前网站失败：${errorText(site.reason)}`);
  }
  busy = false;
  render();
  setStatus(status, errors.join(' '), errors.length ? 'error' : 'info');
}

initialize();
