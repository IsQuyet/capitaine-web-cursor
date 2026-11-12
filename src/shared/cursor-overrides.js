import { CURSOR_TYPES } from './cursor-types.js';
import { normalizeCursorOverrides, PALETTES, validateCursorAsset } from './cursor-assets.js';

function validateBinding(type, palettes) {
  if (!CURSOR_TYPES.includes(type) || !Array.isArray(palettes) || !palettes.length
      || palettes.some(palette => !PALETTES.includes(palette))) throw new Error('请选择有效的指针类型与主题。');
}

function prune(state) {
  const used = new Set(PALETTES.flatMap(palette => Object.values(state.bindings[palette])));
  for (const id of Object.keys(state.assets)) if (!used.has(id)) delete state.assets[id];
  return state;
}

export function saveCursorToState(value, type, palettes, asset, map) {
  validateBinding(type, palettes);
  const state = normalizeCursorOverrides(value, map);
  // 每次保存独立资源，单独编辑一个主题不会连带修改另一个主题的共享绑定。
  const saved = validateCursorAsset({ ...asset, id: crypto.randomUUID() }, map);
  state.assets[saved.id] = saved;
  for (const palette of palettes) state.bindings[palette][type] = saved.id;
  return prune(state);
}

export function resetCursorInState(value, type, palettes, map) {
  validateBinding(type, palettes);
  const state = normalizeCursorOverrides(value, map);
  for (const palette of palettes) delete state.bindings[palette][type];
  return prune(state);
}
