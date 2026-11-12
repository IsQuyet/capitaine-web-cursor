import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root } from './build-assets.mjs';

const dist = path.join(root, 'dist');
const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const manifest = await readJSON(path.join(dist, 'manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage', 'scripting']);
assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']);
assert.equal(manifest.content_scripts[0].all_frames, true);
assert.equal(manifest.content_scripts[0].match_origin_as_fallback, true);
assert.deepEqual(manifest.web_accessible_resources[0].resources, ['assets/light/*.svg', 'assets/dark/*.svg']);
for (const file of [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap(script => script.js),
  manifest.action.default_popup,
  manifest.options_ui.page,
  'options/options.js', 'options/options.css',
  'popup/popup.js', 'popup/popup.css', 'ui/settings-ui.css',
]) {
  await access(path.join(dist, file));
}

const map = await readJSON(path.join(root, 'assets/cursor-map.json'));
assert.deepEqual(await readJSON(path.join(dist, 'cursor-map.json')), map);
for (const theme of ['light', 'dark']) {
  assert.deepEqual((await readdir(path.join(dist, `assets/${theme}`))).sort(), Object.keys(map).map(type => `${type}.svg`).sort());
  for (const [type, entry] of Object.entries(map)) {
    const packaged = await readFile(path.join(dist, entry[theme]));
    const generated = await readFile(path.join(root, `assets/generated/${theme}/${type}.svg`));
    assert.ok(packaged.equals(generated), `分发图片不匹配: ${theme}/${type}`);
    const source = `source/${theme}/${entry.source}`;
    assert.ok((await readFile(path.join(dist, source))).equals(await readFile(path.join(root, `assets/${source}`))));
    const spec = `source/config/${entry.spec}`;
    assert.ok((await readFile(path.join(dist, spec))).equals(await readFile(path.join(root, `assets/${spec}`))));
  }
}
assert.ok((await readFile(path.join(dist, 'LICENSE'))).equals(await readFile(path.join(root, 'LICENSE'))));
for (const name of ['Capitaine-COPYING.txt', 'GPL-3.0.txt', 'NOTICE.txt']) {
  assert.ok((await readFile(path.join(dist, 'licenses', name))).equals(await readFile(path.join(root, 'licenses', name))));
}
assert.deepEqual(await readJSON(path.join(dist, 'source/provenance.json')), await readJSON(path.join(root, 'assets/sources.json')));
await access(path.join(dist, 'assets/NOTICE.txt'));
await access(path.join(dist, 'source/NOTICE.txt'));
console.log('分发包验收通过：入口、最小权限、20份图像、20份源SVG、10份热点及许可完整。');
