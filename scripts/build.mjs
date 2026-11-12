import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAssets, root } from './build-assets.mjs';

await buildAssets();
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'src/manifest.json'), path.join(dist, 'manifest.json'));
// 重建运行资源目录，防止更换格式后残留旧指针。
await rm(path.join(dist, 'assets'), { recursive: true, force: true });
await cp(path.join(root, 'assets/generated'), path.join(dist, 'assets'), { recursive: true });
await cp(path.join(root, 'assets/source'), path.join(dist, 'source'), { recursive: true });
await cp(path.join(root, 'licenses'), path.join(dist, 'licenses'), { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
await cp(path.join(root, 'assets/cursor-map.json'), path.join(dist, 'cursor-map.json'));
await cp(path.join(root, 'assets/sources.json'), path.join(dist, 'source/provenance.json'));
await cp(path.join(root, 'licenses/NOTICE.txt'), path.join(dist, 'assets/NOTICE.txt'));
await cp(path.join(root, 'licenses/NOTICE.txt'), path.join(dist, 'source/NOTICE.txt'));
await build({
  absWorkingDir: root,
  entryPoints: ['src/background/service-worker.js'],
  outdir: path.join(dist, 'background'),
  bundle: true,
  format: 'esm',
  target: 'chrome120',
});
await build({
  absWorkingDir: root,
  entryPoints: ['src/content/main.js'],
  outdir: path.join(dist, 'content'),
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
await mkdir(path.join(dist, 'ui'), { recursive: true });
await cp(path.join(root, 'src/ui/settings-ui.css'), path.join(dist, 'ui/settings-ui.css'));
for (const name of ['options', 'popup']) {
  await mkdir(path.join(dist, name), { recursive: true });
  for (const extension of ['html', 'css']) {
    await cp(path.join(root, `src/${name}/${name}.${extension}`), path.join(dist, `${name}/${name}.${extension}`));
  }
  await build({
    absWorkingDir: root,
    entryPoints: [`src/${name}/${name}.js`],
    outdir: path.join(dist, name),
    bundle: true,
    format: 'esm',
    target: 'chrome120',
  });
}
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`扩展构建完成: ${dist}`);
