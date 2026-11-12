import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assetDisplayHotspot, assetImageURL, builtinCursorAsset, bytesToDataURL,
  cursorValueForAsset, dataURLToBytes, emptyCursorOverrides, normalizeCursorOverrides,
  resolveCursorAsset, validateCursorAsset, withoutFileAssets,
} from '../../src/shared/cursor-assets.js';
import { resetCursorInState, saveCursorToState } from '../../src/shared/cursor-overrides.js';
import { createCursorCSS } from '../../src/shared/cursor-css.js';

const map = JSON.parse(await readFile(new URL('../../assets/cursor-map.json', import.meta.url), 'utf8'));
const getURL = file => `chrome-extension://test/${file}`;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M1 1L20 20"/></svg>';
const asset = () => ({
  id: 'test-file', name: '自定义.svg', format: 'svg',
  source: { kind: 'file', dataUrl: bytesToDataURL(new TextEncoder().encode(svg), 'image/svg+xml') },
  sourceSize: [24, 24], displaySize: [32, 32], hotspot: [12, 6], hotspotOrigin: 'manual',
});

test('内置资源和文件资源共用尺寸、热点及 cursor 生成器', () => {
  const builtin = builtinCursorAsset('copy', 'light', map);
  assert.deepEqual(assetDisplayHotspot(builtin), [5, 2]);
  assert.equal(cursorValueForAsset(builtin, getURL, 'copy'), 'url("chrome-extension://test/assets/light/copy.svg") 5 2, copy');
  const custom = validateCursorAsset(asset(), map);
  assert.deepEqual(assetDisplayHotspot(custom), [16, 8]);
  const generated = new TextDecoder().decode(dataURLToBytes(assetImageURL(custom, getURL)));
  assert.ok(generated.includes('width="32" height="32"'));
  assert.ok(generated.includes('viewBox="0 0 24 24"'));
  assert.ok(custom.source.dataUrl === asset().source.dataUrl, '生成不会修改保存的源图');
  assert.ok(cursorValueForAsset(custom, getURL, 'grab').endsWith('16 8, grab'));
});

test('源热点坐标缩放后向下取整，不能越过图像边缘', () => {
  assert.deepEqual(assetDisplayHotspot({ ...asset(), hotspot: [23.9, 23.9] }), [31, 31]);
  assert.throws(() => validateCursorAsset({ ...asset(), hotspot: [24, 0] }, map));
  assert.throws(() => validateCursorAsset({ ...asset(), hotspot: [-1, 0] }, map));
  assert.throws(() => validateCursorAsset({ ...asset(), displaySize: [129, 32] }, map));
});

test('CUR 默认不附加 CSS 坐标，人工校准后才覆盖文件内热点', () => {
  const bytes = new Uint8Array(23);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 2, true); view.setUint16(4, 1, true);
  bytes[6] = 32; bytes[7] = 32;
  view.setUint16(10, 7, true); view.setUint16(12, 9, true);
  view.setUint32(14, 1, true); view.setUint32(18, 22, true);
  const dataUrl = bytesToDataURL(bytes, 'image/x-icon');
  const cur = { ...asset(), format: 'cur', source: { kind: 'file', dataUrl },
    sourceSize: [32, 32], displaySize: [32, 32], hotspot: [7, 9], hotspotOrigin: 'embedded' };
  assert.equal(cursorValueForAsset(cur, getURL, 'grab'), `url("${dataUrl}"), grab`);
  assert.ok(cursorValueForAsset({ ...cur, hotspotOrigin: 'manual' }, getURL, 'grab').endsWith('7 9, grab'));
});

test('单主题修改会分离共享资源，恢复默认清理无引用资源', () => {
  let state = saveCursorToState(undefined, 'grab', ['light', 'dark'], asset(), map);
  const shared = state.bindings.light.grab;
  assert.equal(shared, state.bindings.dark.grab);
  state = saveCursorToState(state, 'grab', ['light'], { ...asset(), hotspot: [3, 4] }, map);
  assert.notEqual(state.bindings.light.grab, shared);
  assert.deepEqual(resolveCursorAsset('grab', 'dark', map, state).hotspot, [12, 6]);
  assert.deepEqual(resolveCursorAsset('grab', 'light', map, state).hotspot, [3, 4]);
  state = resetCursorInState(state, 'grab', ['light'], map);
  assert.equal(Object.keys(state.assets).length, 1);
  assert.equal(resolveCursorAsset('grab', 'light', map, state).source.kind, 'builtin');
  state = resetCursorInState(state, 'grab', ['dark'], map);
  assert.deepEqual(state, emptyCursorOverrides());
});

test('其他类型的资源绑定不会被保存或重置误删', () => {
  let state = saveCursorToState(undefined, 'copy', ['light'], asset(), map);
  state = saveCursorToState(state, 'grab', ['light', 'dark'], builtinCursorAsset('grab', 'light', map), map);
  assert.equal(Object.keys(state.assets).length, 2);
  const copy = state.bindings.light.copy;
  state = resetCursorInState(state, 'grab', ['light', 'dark'], map);
  assert.equal(state.bindings.light.copy, copy);
  assert.equal(Object.keys(state.assets).length, 1);
});

test('拒绝远程资源、非法数据 URL、未知类型和原型键', () => {
  for (const bad of [
    { ...asset(), source: { kind: 'file', dataUrl: 'https://example.com/a.svg' } },
    { ...asset(), source: { kind: 'file', dataUrl: 'data:text/html;base64,AAAA' } },
    { ...asset(), source: { kind: 'file', dataUrl: 'data:image/svg+xml;base64,AAAA\"){}' } },
    { ...asset(), format: 'ani' }, { ...asset(), id: '__proto__' },
    { ...asset(), hotspotOrigin: 'embedded' },
  ]) assert.throws(() => validateCursorAsset(bad, map));
  assert.throws(() => normalizeCursorOverrides({ assets: {}, bindings: { light: { grab: 'missing' } } }, map));
  assert.throws(() => saveCursorToState(undefined, 'default', ['light'], asset(), map));
  assert.throws(() => saveCursorToState(undefined, 'grab', [], asset(), map));
});

test('CSP 回退只过滤上传文件，保留内置校准且不修改持久化状态', () => {
  let state = saveCursorToState(undefined, 'grab', ['light', 'dark'], asset(), map);
  state = saveCursorToState(state, 'copy', ['light'], {
    ...builtinCursorAsset('copy', 'light', map), hotspot: [8, 9], hotspotOrigin: 'manual',
  }, map);
  const filtered = withoutFileAssets(state);
  assert.equal(resolveCursorAsset('grab', 'light', map, filtered).source.kind, 'builtin');
  assert.deepEqual(resolveCursorAsset('copy', 'light', map, filtered).hotspot, [8, 9]);
  assert.equal(Object.keys(filtered.assets).length, 1);
  assert.equal(Object.keys(state.assets).length, 2);
});

test('自定义覆盖只进入所选类型和主题，其他规则仍用内置 SVG', () => {
  const state = saveCursorToState(undefined, 'grab', ['light'], asset(), map);
  const css = createCursorCSS('data-capitaine-0123456789abcdef0123456789abcdef', 'auto', map, getURL, state);
  assert.ok(css.includes(assetImageURL(asset(), getURL)));
  assert.ok(!css.includes('/assets/light/grab.svg'));
  assert.ok(css.includes('/assets/dark/grab.svg'));
  assert.ok(css.includes('/assets/light/grabbing.svg'));
  assert.ok(css.includes('16 8, grab !important'));
});
