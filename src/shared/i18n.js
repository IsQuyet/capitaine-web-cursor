import english from '../_locales/en/messages.json' with { type: 'json' };

export function t(key, substitutions = []) {
  const values = (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  if (globalThis.chrome?.i18n) return chrome.i18n.getMessage(key, values);
  // Node 单测没有 Chrome API，只使用英文默认消息，不另行选择语言。
  const entry = english[key];
  if (!entry) throw new Error(`Unknown i18n message: ${key}`);
  return entry.message.replace(/\$(\w+)\$/gu, (_match, name) => {
    const placeholder = entry.placeholders[name.toLowerCase()];
    return placeholder.content.replace(/\$([1-9])/gu, (_token, index) => values[Number(index) - 1] ?? '');
  });
}

export function localizePage() {
  document.documentElement.lang = t('localeCode');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const attribute of ['aria-label', 'alt']) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
