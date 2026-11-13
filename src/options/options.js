import { localizePage, t } from '../shared/i18n.js';
import {
  applyTheme,
  errorText,
  parseExcludedHosts,
  readSettings,
  setStatus,
  updateSettings,
} from '../ui/settings-ui.js';
import { initCursorEditor } from './cursor-editor.js';

localizePage();

const form = document.querySelector('#settings-form');
const fields = document.querySelector('#settings-fields');
const enabled = document.querySelector('#enabled');
const theme = document.querySelector('#theme');
const themeHelp = document.querySelector('#theme-help');
const excludedHosts = document.querySelector('#excluded-hosts');
const save = document.querySelector('#save');
const saveLabel = save.textContent;
const status = document.querySelector('#status');
let baseline = null;
let ready = false;
let saving = false;
let readVersion = 0;
let readFailure = '';

function announce(message, tone = 'info') {
  if (status.textContent !== message || status.dataset.tone !== tone) setStatus(status, message, tone);
}

function setBusy(busy) {
  saving = busy;
  fields.disabled = busy || !ready;
  save.disabled = busy || !ready;
  save.textContent = busy ? t('saving') : saveLabel;
  form.setAttribute('aria-busy', String(busy || !ready));
}

function changedFields() {
  const changed = new Set();
  if (!baseline) return changed;
  if (enabled.checked !== baseline.enabled) changed.add('enabled');
  if (theme.value !== baseline.theme) changed.add('theme');
  try {
    const hosts = parseExcludedHosts(excludedHosts.value);
    if (JSON.stringify(hosts) !== JSON.stringify(baseline.excludedHosts)) changed.add('excludedHosts');
  } catch {
    changed.add('excludedHosts');
  }
  return changed;
}

function updateTheme() {
  applyTheme(theme.value);
  themeHelp.textContent = theme.value === 'auto' ? t('autoThemeHelp') : '';
}

function showSettings(next, preserveDraft = true) {
  const changed = preserveDraft ? changedFields() : new Set();
  baseline = next;
  if (!changed.has('enabled')) enabled.checked = next.enabled;
  if (!changed.has('theme')) theme.value = next.theme;
  if (!changed.has('excludedHosts')) {
    excludedHosts.value = next.excludedHosts.join('\n');
    excludedHosts.removeAttribute('aria-invalid');
  }
  ready = true;
  updateTheme();
  // 后台刷新只同步字段，保存失败提示保留到用户再次编辑或保存。
  if (preserveDraft && status.dataset.tone === 'error') return;
  if (changedFields().size) {
    if (excludedHosts.getAttribute('aria-invalid') !== 'true') announce(t('unsaved'));
  } else if (status.dataset.tone !== 'success') {
    announce('');
  }
}

async function refreshSettings() {
  const version = ++readVersion;
  try {
    const next = await readSettings();
    if (version !== readVersion || saving) return;
    if (readFailure && status.textContent === readFailure) announce('');
    readFailure = '';
    // 只同步未编辑的字段，其他入口保存后保留当前草稿。
    showSettings(next);
  } catch (error) {
    if (version === readVersion && !saving) {
      readFailure = t('settingsReadFailed', errorText(error));
      announce(readFailure, 'error');
    }
  } finally {
    if (version === readVersion) setBusy(saving);
  }
}

function markDirty(event) {
  if (!ready || saving) return;
  if (event.target === excludedHosts) excludedHosts.removeAttribute('aria-invalid');
  updateTheme();
  if (excludedHosts.getAttribute('aria-invalid') !== 'true') announce(changedFields().size ? t('unsaved') : '');
}

form.addEventListener('input', markDirty);
form.addEventListener('change', markDirty);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || saving) return;
  let hosts;
  try {
    hosts = parseExcludedHosts(excludedHosts.value);
    excludedHosts.removeAttribute('aria-invalid');
  } catch (error) {
    excludedHosts.setAttribute('aria-invalid', 'true');
    const section = excludedHosts.closest('details');
    if (section) section.open = true;
    announce(errorText(error), 'error');
    excludedHosts.focus();
    return;
  }
  const changed = changedFields();
  const patch = {};
  if (changed.has('enabled')) patch.enabled = enabled.checked;
  if (changed.has('theme')) patch.theme = theme.value;
  if (changed.has('excludedHosts')) patch.excludedHosts = hosts;
  readVersion += 1;
  setBusy(true);
  try {
    // 合并当前表单真正修改的字段，不用旧快照覆盖弹窗等入口的新配置。
    const saved = await updateSettings(current => ({ ...current, ...patch }));
    showSettings(saved, false);
    announce(t('saved'), 'success');
  } catch (error) {
    announce(t('saveFailed', errorText(error)), 'error');
  } finally {
    setBusy(false);
    await refreshSettings();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.hasOwn(changes, 'settings') && !saving) void refreshSettings();
});

void refreshSettings();
void initCursorEditor();
