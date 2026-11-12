import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHotspot, resizeSvg, scaleHotspot, svgDimensions, validateSourceMap } from './asset-utils.mjs';

export const root = fileURLToPath(new URL('..', import.meta.url));

export async function verifySourceHashes() {
  const hashes = JSON.parse(await readFile(path.join(root, 'assets/source-hashes.json'), 'utf8'));
  for (const [file, expected] of Object.entries(hashes)) {
    const actual = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    if (actual !== expected) throw new Error(`上游源文件校验失败: ${file}`);
  }
}

export async function buildAssets() {
  await verifySourceHashes();
  const config = JSON.parse(await readFile(path.join(root, 'assets/sources.json'), 'utf8'));
  validateSourceMap(config);
  const map = {};
  const outputs = [];
  for (const [type, name] of Object.entries(config.cursors)) {
    const spec = await readFile(path.join(root, `assets/source/config/${name}.spec`), 'utf8');
    let dimensions;
    for (const theme of ['light', 'dark']) {
      const svg = await readFile(path.join(root, `assets/source/${theme}/${name}.svg`), 'utf8');
      const size = svgDimensions(svg);
      if (Math.abs(size.width - size.height) > 0.001) {
        throw new Error(`源 SVG 不是正方形，不能无损输出到固定画布: ${name}`);
      }
      if (dimensions && (dimensions.width !== size.width || dimensions.height !== size.height)) {
        throw new Error(`双主题源尺寸不一致: ${name}`);
      }
      dimensions = size;
      outputs.push([`assets/generated/${theme}/${type}.svg`, resizeSvg(svg, config.outputSize)]);
    }
    map[type] = {
      source: `${name}.svg`,
      spec: `${name}.spec`,
      light: `assets/light/${type}.svg`,
      dark: `assets/dark/${type}.svg`,
      hotspot: scaleHotspot(parseHotspot(spec), dimensions, config.outputSize),
      fallback: type,
      size: config.outputSize,
    };
  }
  // 所有源文件先完成校验和尺寸设置，再落盘，缺失素材不会被其他图标替代。
  for (const [file, buffer] of outputs) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), buffer);
  }
  await writeFile(path.join(root, 'assets/cursor-map.json'), `${JSON.stringify(map, null, 2)}\n`);
  console.log(`已生成 ${outputs.length} 个显示尺寸为 ${config.outputSize}×${config.outputSize} 的 SVG 和独立热点映射。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAssets();
}
