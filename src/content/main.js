import { CursorController } from './cursor-controller.js';
import { isEnabledForHost, normalizeSettings } from '../shared/settings.js';

const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
const marker = `data-capitaine-${token}`;
const controller = new CursorController({ document, marker });
let appliedSheets = [];
let dataImagesBlocked = false;
let pending = Promise.resolve();

function configure() {
  pending = pending.catch(() => {}).then(async () => {
    const { settings: stored } = await chrome.storage.local.get('settings');
    const settings = normalizeSettings(stored);
    // 顶层网站排除对其全部 Frame 生效，Frame 自身主机名也可以单独排除。
    let pageHostname = location.hostname;
    try {
      const origins = location.ancestorOrigins;
      if (origins.length) pageHostname = new URL(origins[origins.length - 1]).hostname;
      else if (!pageHostname && document.referrer) pageHostname = new URL(document.referrer).hostname;
    } catch {
      // 不可解析的 opaque origin 只按当前可见主机名判断。
    }
    const allowed = isEnabledForHost(settings, pageHostname) && isEnabledForHost(settings, location.hostname);
    const nextTheme = allowed ? settings.theme : null;
    if (nextTheme === null) controller.stop();
    if (nextTheme !== null || appliedSheets.length) {
      const response = await chrome.runtime.sendMessage({
        type: 'cursor-rules', marker, theme: nextTheme, previousSheets: appliedSheets,
        allowFileAssets: !dataImagesBlocked,
      });
      if (response?.sheets) appliedSheets = response.sheets;
      if (!response?.ok) throw new Error(response?.error || '指针样式注入失败。');
    }
    if (nextTheme !== null) controller.start();
  }).catch(error => {
    controller.stop();
    console.warn('[Capitaine Web Cursor]', error.message);
  });
}

window.addEventListener('securitypolicyviolation', event => {
  if (!dataImagesBlocked && event.isTrusted && event.disposition === 'enforce'
      && event.effectiveDirective === 'img-src' && /^data(?::|$)/u.test(event.blockedURI)) {
    dataImagesBlocked = true;
    configure();
  }
}, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.cursorOverrides)) configure();
});
window.addEventListener('pagehide', () => controller.stop());
window.addEventListener('pageshow', configure);
configure();
