import assert from 'node:assert/strict';
import test from 'node:test';
import { curImages, curRuntimeBytes, pngDimensions } from '../../src/shared/cursor-file-metadata.js';

function png(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

function cur(entries) {
  const bytes = new Uint8Array(6 + entries.length * 16 + entries.length * 8);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 2, true); view.setUint16(4, entries.length, true);
  entries.forEach((entry, index) => {
    const offset = 6 + index * 16;
    bytes[offset] = entry.width === 256 ? 0 : entry.width;
    bytes[offset + 1] = entry.height === 256 ? 0 : entry.height;
    view.setUint16(offset + 4, entry.x, true); view.setUint16(offset + 6, entry.y, true);
    view.setUint32(offset + 8, 8, true); view.setUint32(offset + 12, 6 + entries.length * 16 + index * 8, true);
  });
  return bytes;
}

test('PNG 元数据尺寸按大端读取，拒绝超限和伪造签名', () => {
  assert.deepEqual(pngDimensions(png(32, 64)), [32, 64]);
  assert.throws(() => pngDimensions(png(256, 32)));
  assert.throws(() => pngDimensions(png(0, 32)));
  assert.throws(() => pngDimensions(new Uint8Array(33)));
  assert.throws(() => pngDimensions(new Uint8Array(8)));
});

test('CUR 解析多尺寸各自的热点，不将尺寸字段零误认为0像素', () => {
  const bytes = cur([{ width: 32, height: 32, x: 7, y: 9 }, { width: 256, height: 256, x: 56, y: 72 }]);
  assert.deepEqual(curImages(bytes), [
    { size: [32, 32], hotspot: [7, 9] }, { size: [256, 256], hotspot: [56, 72] },
  ]);
});

test('CUR 超大尺寸只在运行时过滤，不重采样或改写原文件', () => {
  const source = cur([{ width: 32, height: 32, x: 7, y: 9 }, { width: 256, height: 256, x: 56, y: 72 }]);
  const original = source.slice();
  const runtime = curRuntimeBytes(source);
  assert.deepEqual(curImages(runtime), [{ size: [32, 32], hotspot: [7, 9] }]);
  assert.deepEqual(source, original);
  assert.deepEqual(runtime.subarray(22), source.subarray(38, 46));
  assert.equal(curRuntimeBytes(runtime), runtime);
  assert.throws(() => curRuntimeBytes(cur([{ width: 256, height: 256, x: 0, y: 0 }])));
});

test('CUR 拒绝 ICO、越界热点、截断目录和越界数据偏移', () => {
  const good = () => cur([{ width: 32, height: 32, x: 7, y: 9 }]);
  const ico = good(); new DataView(ico.buffer).setUint16(2, 1, true);
  const out = good(); new DataView(out.buffer).setUint32(18, 999999, true);
  assert.throws(() => curImages(ico));
  assert.throws(() => curImages(out));
  assert.throws(() => curImages(good().subarray(0, 20)));
  assert.throws(() => curImages(cur([{ width: 32, height: 32, x: 32, y: 0 }])));
});
