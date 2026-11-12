import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'assets/sources.json'), 'utf8'));
const cache = path.join(root, '.cache');
await mkdir(cache, { recursive: true });
// 下载内容只作为数据读取，不从此目录执行任何工具或脚本。
const download = await mkdtemp(path.join(cache, 'upstream-'));
const base = `https://raw.githubusercontent.com/keeferrourke/capitaine-cursors/${config.commit}`;
const files = [];
for (const name of Object.values(config.cursors)) {
  for (const theme of ['light', 'dark']) {
    files.push([`src/svg/${theme}/${name}.svg`, `assets/source/${theme}/${name}.svg`]);
  }
  files.push([`src/config/static/${name}.spec`, `assets/source/config/${name}.spec`]);
}
files.push(['COPYING', 'licenses/Capitaine-COPYING.txt']);
const hashes = {};
for (const [source, destination] of files) {
  const response = await fetch(`${base}/${source}`);
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${source}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const isolatedFile = path.join(download, source);
  await mkdir(path.dirname(isolatedFile), { recursive: true });
  await writeFile(isolatedFile, buffer, { flag: 'wx' });
  if (source.endsWith('.svg')) {
    const svg = buffer.toString('utf8');
    if (/<script\b|<!ENTITY|<!DOCTYPE|(?:href|xlink:href)\s*=\s*["'](?!#)/iu.test(svg)) {
      throw new Error(`SVG 含不允许的脚本或外部资源: ${source}`);
    }
  }
  const target = path.join(root, destination);
  try {
    const existing = await readFile(target);
    if (!existing.equals(buffer)) throw new Error(`目标已存在且与上游不同，停止覆盖: ${destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(isolatedFile, target);
  }
  hashes[destination] = createHash('sha256').update(buffer).digest('hex');
  console.log(destination);
}
await writeFile(path.join(root, 'assets/source-hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
console.log(`已核实并导入 ${files.length} 个上游文件，commit ${config.commit}`);
