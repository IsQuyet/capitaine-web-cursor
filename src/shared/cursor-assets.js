import { t } from './i18n.js';
import { CURSOR_TYPES } from './cursor-types.js';
import { curRuntimeBytes } from './cursor-file-metadata.js';

export const PALETTES = Object.freeze(['light', 'dark']);
export const MAX_CURSOR_FILE_BYTES = 256 * 1024;

export function emptyCursorOverrides() {
  return { assets: {}, bindings: { light: {}, dark: {} } };
}

export function bytesToDataURL(bytes, mime) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export function dataURLToBytes(dataUrl) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function builtinCursorAsset(type, palette, map) {
  if (!CURSOR_TYPES.includes(type) || !PALETTES.includes(palette)) throw new Error(t('invalidCursorType'));
  const entry = map[type];
  return {
    id: `builtin:${palette}:${type}`,
    name: `Capitaine · ${type} · ${palette === 'light' ? 'Light' : 'Dark'}`,
    format: 'svg',
    source: { kind: 'builtin', type, palette },
    sourceSize: [entry.size, entry.size],
    displaySize: [entry.size, entry.size],
    hotspot: [...entry.hotspot],
    hotspotOrigin: 'preset',
  };
}

export function validateCursorAsset(value, map) {
  if (!value || !['svg', 'png', 'cur'].includes(value.format)) throw new Error(t('invalidCursorFormat'));
  const pair = (array, max, integer = false) => Array.isArray(array) && array.length === 2
    && array.every(number => Number.isFinite(number) && number > 0 && number <= max && (!integer || Number.isInteger(number)));
  if (!pair(value.sourceSize, 4096) || !pair(value.displaySize, 128, true)) throw new Error(t('invalidCursorSize'));
  if (!Array.isArray(value.hotspot) || value.hotspot.length !== 2
      || value.hotspot.some((number, index) => !Number.isFinite(number) || number < 0 || number >= value.sourceSize[index])) {
    throw new Error(t('invalidHotspot'));
  }
  if (!['preset', 'embedded', 'manual'].includes(value.hotspotOrigin)
      || (value.hotspotOrigin === 'embedded' && value.format !== 'cur')) throw new Error(t('invalidHotspotOrigin'));
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/u.test(value.id)
      || ['__proto__', 'constructor', 'prototype'].includes(value.id)) throw new Error(t('invalidAssetId'));
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200) throw new Error(t('invalidAssetName'));
  let source;
  if (value.source?.kind === 'builtin') {
    const builtin = builtinCursorAsset(value.source.type, value.source.palette, map);
    if (value.format !== 'svg' || value.sourceSize.some((number, index) => number !== builtin.sourceSize[index])
        || value.displaySize.some((number, index) => number !== builtin.displaySize[index])) {
      throw new Error(t('builtinDimensions'));
    }
    source = { ...builtin.source };
  } else if (value.source?.kind === 'file') {
    const mime = { svg: 'image/svg+xml', png: 'image/png', cur: 'image/x-icon' }[value.format];
    const prefix = `data:${mime};base64,`;
    const dataUrl = value.source.dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new Error(t('localFileRequired'));
    const encoded = dataUrl.slice(prefix.length);
    if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
        || dataURLToBytes(dataUrl).length > MAX_CURSOR_FILE_BYTES) {
      throw new Error(t('invalidImageData'));
    }
    if (value.format !== 'svg' && value.displaySize.some((number, index) => number !== value.sourceSize[index])) {
      throw new Error(t('bitmapOriginalSize'));
    }
    source = { kind: 'file', dataUrl };
  } else {
    throw new Error(t('unknownAssetSource'));
  }
  return {
    id: value.id, name: value.name, format: value.format, source,
    sourceSize: [...value.sourceSize], displaySize: [...value.displaySize],
    hotspot: [...value.hotspot], hotspotOrigin: value.hotspotOrigin,
  };
}

export function normalizeCursorOverrides(value, map) {
  if (value === undefined || value === null) return emptyCursorOverrides();
  if (typeof value !== 'object' || !value.assets || !value.bindings) throw new Error(t('invalidSavedCursors'));
  const state = emptyCursorOverrides();
  const entries = Object.entries(value.assets);
  if (entries.length > CURSOR_TYPES.length * PALETTES.length) throw new Error(t('tooManyAssets'));
  for (const [id, asset] of entries) {
    const normalized = validateCursorAsset(asset, map);
    if (id !== normalized.id) throw new Error(t('assetIdMismatch'));
    state.assets[id] = normalized;
  }
  for (const palette of PALETTES) {
    for (const [type, id] of Object.entries(value.bindings[palette] || {})) {
      if (!CURSOR_TYPES.includes(type) || typeof id !== 'string' || !Object.hasOwn(state.assets, id)) {
        throw new Error(t('missingBoundAsset'));
      }
      state.bindings[palette][type] = id;
    }
  }
  return state;
}

export function withoutFileAssets(state) {
  const result = emptyCursorOverrides();
  for (const palette of PALETTES) {
    for (const [type, id] of Object.entries(state.bindings[palette])) {
      if (state.assets[id].source.kind === 'builtin') {
        result.assets[id] = state.assets[id];
        result.bindings[palette][type] = id;
      }
    }
  }
  return result;
}

export function resolveCursorAsset(type, palette, map, state = emptyCursorOverrides()) {
  const id = state.bindings[palette]?.[type];
  return id && Object.hasOwn(state.assets, id) ? state.assets[id] : builtinCursorAsset(type, palette, map);
}

export function assetDisplayHotspot(asset) {
  return asset.hotspot.map((number, index) => Math.min(asset.displaySize[index] - 1,
    Math.floor(number * asset.displaySize[index] / asset.sourceSize[index])));
}

export function assetImageURL(asset, getURL) {
  if (asset.source.kind === 'builtin') return getURL(`assets/${asset.source.palette}/${asset.source.type}.svg`);
  if (asset.format === 'cur') {
    const bytes = dataURLToBytes(asset.source.dataUrl);
    const runtime = curRuntimeBytes(bytes);
    return runtime === bytes ? asset.source.dataUrl : bytesToDataURL(runtime, 'image/x-icon');
  }
  if (asset.format !== 'svg') return asset.source.dataUrl;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(dataURLToBytes(asset.source.dataUrl));
  const svg = text.replace(/<svg\b[^>]*>/u, tag => tag.replace(
    /(\s)(width|height)\s*=\s*["'][^"']*["']/gu,
    (_match, space, name) => `${space}${name}="${asset.displaySize[name === 'width' ? 0 : 1]}"`,
  ));
  return bytesToDataURL(new TextEncoder().encode(svg), 'image/svg+xml');
}

export function cursorValueForAsset(asset, getURL, fallback) {
  if (!CURSOR_TYPES.includes(fallback)) throw new Error(t('invalidCursorFallback'));
  const url = assetImageURL(asset, getURL);
  const hotspot = asset.format === 'cur' && asset.hotspotOrigin === 'embedded'
    ? '' : ` ${assetDisplayHotspot(asset).join(' ')}`;
  return `url("${url}")${hotspot}, ${fallback}`;
}
