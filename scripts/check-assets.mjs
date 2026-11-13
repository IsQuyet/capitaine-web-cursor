import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, verifySourceHashes } from './build-assets.mjs';
import { parseHotspot, resizeSvg, scaleHotspot, svgDimensions, validateSourceMap } from './asset-utils.mjs';

await verifySourceHashes();
const config = JSON.parse(await readFile(path.join(root, 'assets/sources.json'), 'utf8'));
const map = JSON.parse(await readFile(path.join(root, 'assets/cursor-map.json'), 'utf8'));
validateSourceMap(config);
assert.deepEqual(Object.keys(map), Object.keys(config.cursors));
const hashes = new Set();
for (const theme of ['light', 'dark']) {
  const entries = await readdir(path.join(root, `assets/generated/${theme}`));
  assert.deepEqual(entries.sort(), Object.keys(map).map(type => `${type}.svg`).sort());
  for (const [type, name] of Object.entries(config.cursors)) {
    const source = await readFile(path.join(root, `assets/source/${theme}/${name}.svg`), 'utf8');
    const spec = await readFile(path.join(root, `assets/source/config/${name}.spec`), 'utf8');
    const svg = await readFile(path.join(root, `assets/generated/${theme}/${type}.svg`), 'utf8');
    assert.deepEqual(svgDimensions(svg), { width: config.outputSize, height: config.outputSize });
    assert.equal(svg, resizeSvg(source, config.outputSize), `${theme}/${type} 除根尺寸外不得修改源 SVG`);
    assert.deepEqual(map[type].hotspot, scaleHotspot(parseHotspot(spec), svgDimensions(source), config.outputSize));
    assert.equal(map[type][theme], `assets/${theme}/${type}.svg`);
    assert.equal(map[type].fallback, type);
    assert.equal(map[type].size, config.outputSize);
    const hash = createHash('sha256').update(svg).digest('hex');
    assert.ok(!hashes.has(hash), `${theme}/${type} 不得复用其他指针图像`);
    hashes.add(hash);
  }
}
assert.deepEqual(config.icon.sizes, [16, 32, 48, 128]);
assert.deepEqual((await readdir(path.join(root, 'assets/generated/icons'))).sort(), config.icon.sizes.map(size => `icon-${size}.png`).sort());
for (const size of config.icon.sizes) {
  const png = await readFile(path.join(root, `assets/generated/icons/icon-${size}.png`));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size]);
  assert.equal(png[25], 6, '扩展图标应保留透明通道');
}
console.log('素材验收通过：20 个独立 SVG、4 份透明 PNG 图标，源文件、主题、热点和 SHA-256 全部匹配。');
