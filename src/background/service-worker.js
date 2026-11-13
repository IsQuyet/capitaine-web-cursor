import { t } from '../shared/i18n.js';
import { createCursorCSS } from '../shared/cursor-css.js';
import { normalizeCursorOverrides, withoutFileAssets } from '../shared/cursor-assets.js';
import { resetCursorInState, saveCursorToState } from '../shared/cursor-overrides.js';
import { replaceCursorStyles } from './style-manager.js';
import map from '../../assets/cursor-map.json';

let mutations = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (['save-cursor-asset', 'reset-cursor-asset'].includes(message?.type)) {
    if (sender.url !== chrome.runtime.getURL('options/options.html')) {
      reply({ ok: false, error: t('editInOptions') });
      return false;
    }
    mutations = mutations.catch(() => {}).then(async () => {
      const { cursorOverrides } = await chrome.storage.local.get('cursorOverrides');
      const state = message.type === 'save-cursor-asset'
        ? saveCursorToState(cursorOverrides, message.cursorType, message.palettes, message.asset, map)
        : resetCursorInState(cursorOverrides, message.cursorType, message.palettes, map);
      await chrome.storage.local.set({ cursorOverrides: state });
      reply({ ok: true, state });
    }).catch(error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== 'cursor-rules') return false;
  if (!sender.tab || !sender.documentId) {
    reply({ ok: false, error: t('contentScriptOnly') });
    return false;
  }
  const target = { tabId: sender.tab.id, documentIds: [sender.documentId] };
  (async () => {
    let css = null;
    if (message.theme !== null) {
      const { cursorOverrides } = await chrome.storage.local.get('cursorOverrides');
      let state = normalizeCursorOverrides(cursorOverrides, map);
      if (message.allowFileAssets === false) state = withoutFileAssets(state);
      css = createCursorCSS(message.marker, message.theme, map, file => chrome.runtime.getURL(file), state);
    }
    const result = await replaceCursorStyles(chrome.scripting, target, css, message.previousSheets);
    reply(result);
  })().catch(error => reply({ ok: false, error: error.message }));
  return true;
});
