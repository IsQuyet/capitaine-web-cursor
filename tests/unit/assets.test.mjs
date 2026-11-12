import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHotspot, resizeSvg, scaleHotspot, svgDimensions, validateSourceMap } from '../../scripts/asset-utils.mjs';
import { CURSOR_TYPES } from '../../src/shared/cursor-types.js';

test('读取实际 .spec 并按24到32缩放热点，不照抄示例', () => {
  assert.deepEqual(parseHotspot('12 12\n'), [12, 12]);
  assert.deepEqual(parseHotspot('4 2\n'), [4, 2]);
  const dimensions = { width: 24, height: 24 };
  assert.deepEqual(scaleHotspot([12, 12], dimensions, 32), [16, 16]);
  assert.deepEqual(scaleHotspot([4, 2], dimensions, 32), [5, 2]);
});

test('无效热点、动画 spec 与无效尺寸直接报错', () => {
  for (const spec of ['12', '12 12 10', '-1 4', 'a b']) {
    assert.throws(() => parseHotspot(spec));
  }
  assert.throws(() => scaleHotspot([24, 12], { width: 24, height: 24 }, 32));
  assert.throws(() => scaleHotspot([12, 12], { width: 24, height: 24 }, 129));
});

test('按像素画布尺寸缩放热点，不受 viewBox 浮点误差影响', () => {
  for (const viewBox of ['0 0 24 24', '0 0 24.000002 24.000002', '0 0 23.999999 23.999999']) {
    const size = svgDimensions(`<svg width="24" height="24" viewBox="${viewBox}"><path/></svg>`);
    assert.deepEqual(size, { width: 24, height: 24 });
    assert.deepEqual(scaleHotspot([12, 12], size, 32), [16, 16]);
  }
  assert.throws(() => svgDimensions('<svg/>'));
  assert.throws(() => svgDimensions('<svg width="0" height="24"/>'));
});

test('运行时 SVG 只调整根尺寸，保留 viewBox、滤镜和图形', () => {
  const source = '<svg width="24" height="24" viewBox="0 0 23.999999 23.999999"><filter width="1.25" height="1.5"><feGaussianBlur stdDeviation=".8"/></filter><path d="M1 2L3 4"/></svg>';
  const expected = '<svg width="32" height="32" viewBox="0 0 23.999999 23.999999"><filter width="1.25" height="1.5"><feGaussianBlur stdDeviation=".8"/></filter><path d="M1 2L3 4"/></svg>';
  assert.equal(resizeSvg(source, 32), expected);
  assert.deepEqual(svgDimensions(resizeSvg(source, 32)), { width: 32, height: 32 });
});

test('尺寸转换不误改 stroke-width 或 data-width', () => {
  const source = '<svg stroke-width="2" data-width="99" width="24px" height="24px" viewBox="0 0 24 24"></svg>';
  assert.deepEqual(svgDimensions(source), { width: 24, height: 24 });
  assert.equal(resizeSvg(source, 32), '<svg stroke-width="2" data-width="99" width="32" height="32" viewBox="0 0 24 24"></svg>');
});

test('运行时 SVG 拒绝无效源尺寸和超限输出', () => {
  assert.throws(() => resizeSvg('<svg/>', 32));
  for (const size of [0, 129, 32.5]) {
    assert.throws(() => resizeSvg('<svg width="24" height="24"/>', size));
  }
});

test('拒绝缺失与复用的素材映射', () => {
  const cursors = Object.fromEntries(CURSOR_TYPES.map(type => [type, type]));
  validateSourceMap({ cursors });
  assert.throws(() => validateSourceMap({ cursors: { ...cursors, grab: 'grabbing' } }));
  const incomplete = { ...cursors };
  delete incomplete.alias;
  assert.throws(() => validateSourceMap({ cursors: incomplete }));
});
