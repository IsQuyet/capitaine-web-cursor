import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = ['grab', 'grabbing', 'zoom-in', 'zoom-out', 'cell', 'vertical-text', 'alias', 'copy', 'col-resize', 'row-resize'];
const css = `
body { margin: 20px; font: 15px sans-serif; }
.grid { display: grid; grid-template-columns: repeat(5, 150px); gap: 10px; }
.card { display: block; box-sizing: border-box; width: 150px; height: 65px; padding: 12px; background: #ddd; }
#changing { cursor: grab; }
#changing.changed { cursor: zoom-out; }
iframe { width: 220px; height: 130px; }
`;
const fixture = `<!doctype html><meta charset="utf-8"><title>指针兼容性测试</title>
<link rel="stylesheet" href="/fixture.css"><div class="grid">
${types.map(type => `<div class="card" id="${type}" style="cursor: ${type} !important">${type}</div>`).join('')}
<div class="card" id="changing">动态指针</div>
<div class="card" id="custom" style="cursor: url('/cursor.svg') 4 4, grab">网站图片指针</div>
<div class="card" id="none" style="cursor: none">隐藏指针</div>
<div class="card" id="plain" style="cursor: pointer">不替换</div>
<div class="card" id="inherited" style="cursor: grab"><span id="child">继承</span><b id="explicit" style="cursor: zoom-in">独立类型</b></div>
<div class="card" id="shadow-host"></div>
<div class="card" id="nested-host"></div>
<div class="card" id="capture" style="cursor: grab">Pointer capture</div>
<div class="card" id="other" style="cursor: copy">捕获后经过的元素</div>
</div><div id="frames"></div><script src="/fixture.js"></script>`;
const js = `
const first = document.querySelector('#shadow-host').attachShadow({ mode: 'open' });
first.innerHTML = '<style>.inner { cursor: grab; display: block; height: 35px; }</style><div id="inner" class="inner">开放 Shadow</div>';
const outer = document.querySelector('#nested-host').attachShadow({ mode: 'open' });
outer.innerHTML = '<section id="nested"></section>';
const inner = outer.querySelector('#nested').attachShadow({ mode: 'open' });
inner.innerHTML = '<style>span { display: block; height: 35px; cursor: copy; }</style><span id="deep">嵌套 Shadow</span>';
const capture = document.querySelector('#capture');
capture.addEventListener('pointerdown', event => {
  capture.setPointerCapture(event.pointerId);
  capture.style.cursor = 'grabbing';
});
capture.addEventListener('pointerup', () => { capture.style.cursor = 'grab'; });
window.fixtureReady = true;
`;
const frame = '<!doctype html><meta charset="utf-8"><div id="frame-target" style="width:180px;height:90px;cursor:cell !important">Frame cursor</div>';

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') { res.end('ok'); return; }
  if (url.pathname === '/cursor.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(await readFile(path.join(root, 'assets/generated/light/copy.svg')));
    return;
  }
  if (url.pathname === '/fixture.css') {
    res.setHeader('Content-Type', 'text/css'); res.end(css); return;
  }
  if (url.pathname === '/fixture.js') {
    res.setHeader('Content-Type', 'application/javascript'); res.end(js); return;
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (url.pathname === '/csp') {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'");
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(url.pathname === '/frame.html' ? frame : fixture);
});
server.listen(41731, '0.0.0.0', () => console.log('测试页面 http://127.0.0.1:41731'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
