import { t } from '../shared/i18n.js';
import { normalizeCursorOverrides } from '../shared/cursor-assets.js';
import map from '../../assets/cursor-map.json';

export async function readCursorOverrides() {
  const { cursorOverrides } = await chrome.storage.local.get('cursorOverrides');
  return normalizeCursorOverrides(cursorOverrides, map);
}

async function mutate(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || t('cursorSaveRetry'));
  return normalizeCursorOverrides(response.state, map);
}

export function saveCursorAsset(type, palettes, asset) {
  return mutate({ type: 'save-cursor-asset', cursorType: type, palettes, asset });
}

export function resetCursorAsset(type, palettes) {
  return mutate({ type: 'reset-cursor-asset', cursorType: type, palettes });
}
