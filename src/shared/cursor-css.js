import { CURSOR_TYPES } from './cursor-types.js';
import { cursorValueForAsset, emptyCursorOverrides, resolveCursorAsset } from './cursor-assets.js';

export function createCursorCSS(marker, theme, map, getURL, overrides = emptyCursorOverrides()) {
  if (!/^data-capitaine-[a-f0-9]{32}$/u.test(marker)) {
    throw new Error('无效的扩展标记。');
  }
  if (!['auto', 'light', 'dark'].includes(theme)) throw new Error('无效的主题。');
  const rules = palette => CURSOR_TYPES.map(type => {
    const asset = resolveCursorAsset(type, palette, map, overrides);
    return `[${marker}="${type}"] { cursor: ${cursorValueForAsset(asset, getURL, type)} !important; }`;
  }).join('\n');
  if (theme !== 'auto') return rules(theme);
  return `${rules('light')}\n@media (prefers-color-scheme: dark) {\n${rules('dark')}\n}`;
}
