// m4ker 시연 영상 녹화
// 실제 화면(m4ker_input.html)을 헤드리스 Chrome으로 조작하면서 화면을 녹화해 mp4로 만든다.
// 가짜인 것: 커서 화살표, 파일 카드 애니메이션, 타이핑 속도, 단계 자막.
// 진짜인 것: 파일 드롭·클릭·입력 이벤트, 서버 검색/생성 결과.
//
// 사용: node tools/demo-video/record.mjs <설정.json> [설정2.json ...]
// 설정 형식과 전체 절차: tools/demo-video/README.md
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT || 9334);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용: node tools/demo-video/record.mjs <설정.json> [설정2.json ...]');
  process.exit(2);
}
for (const file of files) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const here = dirname(resolve(file));
  // image/out은 설정 파일 기준 상대 경로도 허용
  const cfg = { ...raw, image: resolve(here, raw.image), out: resolve(here, raw.out) };
  try {
    console.log(JSON.stringify(await record(cfg)));
  } catch (err) {
    console.error(`[실패] ${file}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function record(cfg) {
  const W = cfg.width || 1440, H = cfg.height || 900;
  mkdirSync(dirname(cfg.out), { recursive: true });
  const work = mkdtempSync(join(dirname(cfg.out), '.rec-'));
  const framesDir = join(work, 'frames'); mkdirSync(framesDir);

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${W},${H}`, '--no-first-run', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  // 어떤 경우에도 Chrome과 임시 폴더를 정리
  const cleanup = () => { try { chrome.kill(); } catch {} rmSync(work, { recursive: true, force: true }); };

  try {
    let wsUrl;
    for (let i = 0; i < 50 && !wsUrl; i++) {
      await sleep(200);
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    }
    if (!wsUrl) throw new Error(`Chrome 디버깅 포트(${PORT})에 연결 못 함. CHROME_PATH/CDP_PORT 확인`);
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const pending = new Map(); const frames = []; const errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Page.screencastFrame') {
        const f = join(framesDir, `f${String(frames.length).padStart(6, '0')}.jpg`);
        writeFileSync(f, Buffer.from(m.params.data, 'base64'));
        frames.push({ file: f, t: m.params.metadata.timestamp });
        ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
      }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
    // 실패하면 화면 상태를 같이 출력 (어디서 막혔는지 바로 보이게)
    const waitFor = async (expr, ms = 120000) => {
      const t = Date.now();
      while (Date.now() - t < ms) { if (await js(expr)) return true; await sleep(200); }
      const st = await js(`JSON.stringify({ status: document.getElementById('makeStatus').textContent, preview: !!document.getElementById('preview').getAttribute('src'), prompt: document.getElementById('prompt').value, disabled: document.getElementById('generateBtn').disabled, msg: document.getElementById('resultMsg').textContent, refs: document.querySelectorAll('.ref-card').length })`);
      throw new Error('timeout: ' + expr + '\nstate: ' + st);
    };

    // ---------- 가짜 커서 · 파일 카드 · 자막 (실제 클릭은 CDP 마우스 이벤트로) ----------
    const OVERLAY = `
(() => {
  if (window.__demo) return;
  const style = document.createElement('style');
  style.textContent = \`
    #demo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none;
      transform: translate(-3px, -2px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 16px; height: 16px; margin: -8px 0 0 -8px;
      border-radius: 50%; background: rgba(90,63,216,.35); animation: demoRipple .55s ease-out forwards; }
    @keyframes demoRipple { to { transform: scale(4); opacity: 0; } }
    #demo-file { position: fixed; z-index: 2147483645; pointer-events: none; width: 150px; padding: 8px; border-radius: 12px;
      background: #fff; box-shadow: 0 18px 40px -12px rgba(36,18,95,.45); font: 600 12px Pretendard, sans-serif; color: #24125f;
      transition: opacity .3s; }
    #demo-file img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; margin-bottom: 6px; }
    #demo-caption { position: fixed; left: 50%; top: 22px; transform: translateX(-50%); z-index: 2147483644; pointer-events: none;
      padding: 10px 18px; border-radius: 999px; background: rgba(36,18,95,.88); color: #fff; font: 600 15px Pretendard, sans-serif;
      opacity: 0; transition: opacity .35s; white-space: nowrap; }\`;
  document.head.appendChild(style);
  const c = document.createElement('div');
  c.id = 'demo-cursor';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 11.5-6.6.9 3.9 7.6-2.8 1.4-3.9-7.7L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  const cap = document.createElement('div'); cap.id = 'demo-caption'; document.body.appendChild(cap);
  window.__demo = {
    move(x, y) { c.style.left = x + 'px'; c.style.top = y + 'px'; },
    ripple(x, y) { const r = document.createElement('div'); r.className = 'demo-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); },
    file(src, name, x, y) { let f = document.getElementById('demo-file'); if (!f) { f = document.createElement('div'); f.id = 'demo-file'; f.innerHTML = '<img><span></span>'; document.body.appendChild(f); }
      f.querySelector('img').src = src; f.querySelector('span').textContent = name; f.style.left = (x - 20) + 'px'; f.style.top = (y - 20) + 'px'; f.style.opacity = 1; },
    dropFile() { const f = document.getElementById('demo-file'); if (f) { f.style.opacity = 0; setTimeout(() => f.remove(), 350); } },
    caption(t) { cap.textContent = t; cap.style.opacity = t ? 1 : 0; },
  };
})();`;

    let cur = { x: W * 0.62, y: H * 0.55 };
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    async function moveTo(x, y, ms = 700, extra = null) {
      const from = { ...cur }; const steps = Math.max(8, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const k = ease(i / steps);
        const px = from.x + (x - from.x) * k, py = from.y + (y - from.y) * k;
        await js(`__demo.move(${px},${py})${extra ? ';' + extra(px, py) : ''}`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
        await sleep(ms / steps);
      }
      cur = { x, y };
    }
    const center = (selector, dy = 0) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + ${dy} }; })()`);
    async function scrollIntoView(selector, block = 'center') {
      const need = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return r.top < 70 || r.bottom > innerHeight - 70; })()`);
      if (!need) return;
      await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ behavior: 'smooth', block: '${block}' })`);
      await sleep(900);
    }
    async function click(selector, { dy = 0, pause = 250 } = {}) {
      await scrollIntoView(selector);
      const p = await center(selector, dy);
      await moveTo(p.x, p.y);
      await sleep(pause);
      await js(`__demo.ripple(${p.x},${p.y})`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await sleep(70);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await sleep(300);
    }
    // 한 글자씩, 사람처럼 약간 불규칙하게. 쉼표·마침표 뒤에는 잠깐 멈춤
    async function type(text, cps = 16) {
      for (const ch of text) {
        await send('Input.insertText', { text: ch });
        await sleep(1000 / cps * (ch === ' ' ? 0.6 : 0.8 + Math.random() * 0.5) + (/[,.]/.test(ch) ? 160 : 0));
      }
    }
    const caption = (t) => js(`__demo.caption(${JSON.stringify(t)})`);
    let stepNo = 0;
    const step = (t) => caption(`${++stepNo}. ${t}`);
    const resultReady = `(() => { const i = document.querySelector('#resultFrame img'); return i && i.complete && i.naturalWidth > 0; })()`;

    // ---------- 시나리오 ----------
    await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { ${OVERLAY} })` });
    await send('Page.navigate', { url: cfg.url });
    await waitFor(`window.__demo && document.getElementById('serverPill').dataset.state !== 'checking'`, 30000);
    if (!(await js(`document.getElementById('serverPill').dataset.state !== 'off'`))) throw new Error('화면이 서버에 연결되지 않음 (server.py가 켜져 있는지 확인)');
    await js(`document.fonts.ready.then(() => true)`);
    await sleep(600);
    await send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    await js(`__demo.move(${cur.x},${cur.y})`);
    await sleep(1600);

    // 1) 이미지 끌어다 놓기 (실제 드롭 이벤트에 파일을 실어 보냄)
    await step('제품 사진을 끌어다 놓아요');
    const imgData = 'data:image/png;base64,' + readFileSync(cfg.image).toString('base64');
    const name = basename(cfg.image);
    const start = { x: W - 120, y: H - 150 };
    await moveTo(start.x, start.y, 800);
    await js(`__demo.file(${JSON.stringify(imgData)}, ${JSON.stringify(name)}, ${start.x}, ${start.y})`);
    await sleep(350);
    const drop = await center('#drop');
    const dragData = { items: [], files: [cfg.image], dragOperationsMask: 1 };
    await moveTo(drop.x, drop.y, 1300, (x, y) => `__demo.file(document.querySelector('#demo-file img').src, ${JSON.stringify(name)}, ${x}, ${y})`);
    await send('Input.dispatchDragEvent', { type: 'dragEnter', x: drop.x, y: drop.y, data: dragData });
    await send('Input.dispatchDragEvent', { type: 'dragOver', x: drop.x, y: drop.y, data: dragData });
    await sleep(450);
    await send('Input.dispatchDragEvent', { type: 'drop', x: drop.x, y: drop.y, data: dragData });
    await js(`__demo.dropFile()`);
    if (!(await js(`!!document.getElementById('preview').getAttribute('src')`))) {
      // 드래그 이벤트가 안 먹는 환경이면 같은 파일을 input에 직접 넣음
      const doc = await send('DOM.getDocument');
      const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#imageInput' });
      await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [cfg.image] });
      await js(`document.getElementById('imageInput').dispatchEvent(new Event('change', { bubbles: true }))`);
    }
    await sleep(1200);

    // 2) 프롬프트 타이핑
    await step('원하는 분위기를 적어요');
    await click('#prompt', { dy: -30 });
    await type(cfg.typed);
    await sleep(600);

    // 3) 예시 스타일 카드 (선택)
    if (cfg.styleCard != null) {
      await step('예시 스타일을 골라요');
      await click(`.style-card:nth-child(${cfg.styleCard + 1})`);
      await sleep(1100);
    }

    // 세부 설정: 참고 강도. showSettings면 화면에서 슬라이더를 끌어내리는 장면까지 녹화
    if (cfg.adapterScale != null && cfg.showSettings) {
      await step(`세부 설정에서 참고 강도를 ${cfg.adapterScale}로 낮춰요`);
      await click('#advanced summary');
      await sleep(500);
      await scrollIntoView('#adapterScale');
      const r = await js(`(() => { const e = document.getElementById('adapterScale'); const b = e.getBoundingClientRect(); return { l: b.left + 8, w: b.width - 16, y: b.top + b.height / 2, v: +e.value }; })()`);
      const sx = r.l + r.w * r.v, tx = r.l + r.w * cfg.adapterScale;
      await moveTo(sx, r.y, 600);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: r.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 20; i++) {
        const x = sx + (tx - sx) * i / 20;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: r.y, button: 'left', buttons: 1 });
        await js(`__demo.move(${x},${r.y})`);
        await sleep(35);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: r.y, button: 'left', clickCount: 1 });
      // 끌기 오차와 상관없이 정확한 값으로 맞춤
      await js(`(() => { const s = document.getElementById('adapterScale'); s.value = ${cfg.adapterScale}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      cur = { x: tx, y: r.y };
      await sleep(900);
      await click('#advanced summary');
      await sleep(400);
    } else if (cfg.adapterScale != null) {
      await js(`(() => { const s = document.getElementById('adapterScale'); s.value = ${cfg.adapterScale}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    }

    // 4) 생성하기 → 검색 Top-5 → 생성 결과
    await step('생성하기를 누르면 비슷한 광고 스타일을 먼저 찾아요');
    await click('#generateBtn');
    await waitFor(`document.querySelectorAll('.ref-card img').length === 5 && [...document.querySelectorAll('.ref-card img')].every(i => i.complete && i.naturalWidth)`);
    await js(`document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' })`);
    await sleep(900);
    await caption('찾은 스타일을 참고해서 광고 이미지를 만드는 중…');
    await waitFor(`!document.getElementById('generateBtn').disabled`, 300000);
    await waitFor(resultReady, 120000);
    await caption('완성! 제품은 그대로, 배경만 새로 그렸어요');
    let rf = await center('#resultFrame');
    await moveTo(rf.x + 120, rf.y + 140, 900);
    await sleep(2600);

    // 5) 다른 참조를 골라 다시 생성 (선택, pick = 0부터 센 순위)
    if (cfg.pick != null && cfg.pick !== 0) {
      await step(`다른 스타일(${cfg.pick + 1}위)을 골라 다시 만들어요`);
      await click(`.ref-card:nth-child(${cfg.pick + 1})`);
      await sleep(700);
      await click('#generateBtn');
      await js(`document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' })`);
      await sleep(500);
      await waitFor(`!document.getElementById('generateBtn').disabled`, 300000);
      await waitFor(resultReady, 120000);
      await caption('새 스타일로 완성!');
      rf = await center('#resultFrame');
      await moveTo(rf.x + 120, rf.y + 140, 900);
      await sleep(2800);
    }
    await caption('');
    await sleep(1200);
    await send('Page.stopScreencast');
    await sleep(300);
    const resultMsg = await js(`document.getElementById('resultMsg').textContent`);
    ws.close();
    if (!frames.length) throw new Error('녹화된 프레임이 없음');

    // ---------- 프레임 → mp4 (프레임 시각 그대로 이어 붙여 실제 속도 유지) ----------
    const list = frames.map((f, i) => {
      const d = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].t - f.t) : 1.5;
      return `file '${f.file}'\nduration ${d.toFixed(4)}`;
    }).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
    writeFileSync(join(work, 'list.txt'), list);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'),
      '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', cfg.out]);
    return { out: cfg.out, frames: frames.length, seconds: +(frames.at(-1).t - frames[0].t).toFixed(1), resultMsg, errors };
  } finally {
    cleanup();
  }
}
