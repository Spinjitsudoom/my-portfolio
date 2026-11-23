// Tiny Chrome DevTools driver: node cdp.mjs steps.json
// Steps: {"size":[w,h]} {"go":url} {"wait":ms} {"js":"expr"} {"shot":"file.png"} {"print":"expr"}
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const port = 9333;
const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'cdp-'));
const chrome = spawn('chromium-browser', ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); }
  catch { await sleep(200); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.log('PAGE ERROR:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('CONSOLE ERROR:', m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable'); await send('Runtime.enable');
for (const s of steps) {
  if (s.size) await send('Emulation.setDeviceMetricsOverride', { width: s.size[0], height: s.size[1], deviceScaleFactor: s.scale || 1, mobile: !!s.mobile });
  if (s.go) await send('Page.navigate', { url: s.go });
  if (s.wait) await sleep(s.wait);
  if (s.js) {
    const r = await send('Runtime.evaluate', { expression: s.js, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) console.error('JS error:', s.js.slice(0, 60), r.result.exceptionDetails.exception?.description);
  }
  if (s.print) {
    const r = await send('Runtime.evaluate', { expression: s.print, awaitPromise: true, returnByValue: true });
    console.log(typeof r.result?.result?.value === 'string' ? r.result.result.value : JSON.stringify(r.result?.result?.value));
  }
  if (s.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!s.full });
    writeFileSync(s.shot, Buffer.from(r.result.data, 'base64'));
    console.log('shot', s.shot);
  }
}
ws.close(); chrome.kill();
