/* ================= STEM Atlas · script.js ================= */
const CFG = {
  folder: 'books',  // folder in your GitHub repo that holds the PDFs
  owner: '',        // leave '' to auto-detect from the website address
  repo: '',         // leave '' to auto-detect
  branch: '',       // leave '' to try "main", then "master"
  ambient: 0.58     // 0 = fully lit room, 1 = pitch black (darkness far from the lanterns)
};
const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#year').textContent = new Date().getFullYear();

/* ---------------- LANTERNS ---------------- */
const LANTERNS = [
  { type:'top',  x:'13%', rope:44, dur:5.8, amp:2.6, delay:-1.4 },
  { type:'top',  x:'50%', rope:74, dur:6.9, amp:2.2, delay:-3.8 },
  { type:'top',  x:'87%', rope:54, dur:6.2, amp:2.8, delay:-0.6 },
  { type:'side', side:'left',  y:'38%', arm:30, rope:34, dur:6.4, amp:3.2, delay:-2.1 },
  { type:'side', side:'left',  y:'72%', arm:26, rope:48, dur:7.1, amp:2.8, delay:-4.5, extra:true },
  { type:'side', side:'right', y:'46%', arm:30, rope:42, dur:6.7, amp:3.0, delay:-0.9 },
  { type:'side', side:'right', y:'78%', arm:26, rope:30, dur:6.0, amp:3.2, delay:-3.0, extra:true }
];
document.body.insertAdjacentHTML('afterbegin',
 `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
   <radialGradient id="lg" cx="50%" cy="48%" r="60%"><stop offset="0" stop-color="#fff6cf"/><stop offset=".45" stop-color="#ffc766"/><stop offset="1" stop-color="#b8661a"/></radialGradient>
   <linearGradient id="mt" x1="0" x2="1"><stop offset="0" stop-color="#2b2118"/><stop offset=".5" stop-color="#7a6040"/><stop offset="1" stop-color="#241a12"/></linearGradient>
 </defs></svg>`);
const LANTERN_SVG = `<svg viewBox="0 0 60 100" aria-hidden="true">
  <circle cx="30" cy="6" r="4.5" fill="none" stroke="url(#mt)" stroke-width="2.4"/>
  <path d="M30 10 L16 24 H44 Z" fill="url(#mt)"/>
  <rect x="12" y="24" width="36" height="4" rx="1.5" fill="url(#mt)"/>
  <rect x="15" y="28" width="30" height="42" rx="3" fill="url(#lg)"/>
  <g stroke="#2a1d12" stroke-width="2"><line x1="15" y1="28" x2="15" y2="70"/><line x1="45" y1="28" x2="45" y2="70"/></g>
  <ellipse class="flame" cx="30" cy="52" rx="4.5" ry="9" fill="#fffbe6"/>
  <rect x="12" y="70" width="36" height="4" rx="1.5" fill="url(#mt)"/>
  <path d="M17 74 L23 86 H37 L43 74 Z" fill="url(#mt)"/>
  <circle cx="30" cy="90" r="3" fill="url(#mt)"/></svg>`;
$('#lanterns').innerHTML = LANTERNS.map(c => {
  const pos = c.type === 'top' ? `--x:${c.x};` : `--y:${c.y};--arm:${c.arm}px;`;
  return `<div class="lantern ${c.type === 'top' ? 'top' : 'side ' + c.side}${c.extra ? ' extra' : ''}"
    style="${pos}--rope:${c.rope}px;--dur:${c.dur}s;--delay:${c.delay}s;--amp:${c.amp}deg" data-power="${c.power || 1}">
    ${c.type === 'side' ? '<i class="arm"></i>' : ''}
    <div class="hang"><div class="swing"><i class="rope"></i>${LANTERN_SVG}</div></div></div>`;
}).join('');

/* ---------------- LIGHT PHYSICS ----------------
   A dark layer covers the page. Each lantern "cuts" a hole in it using a
   radial gradient whose brightness falls off like real light (inverse-square
   style). Several lanterns combine multiplicatively. Positions are read from
   the swinging lantern every frame, so the light sways and flickers with it. */
const lamps = [...document.querySelectorAll('.lantern')].map((el, i) => ({
  flame: el.querySelector('.flame'), power: +el.dataset.power || 1, seed: i * 1.9 + 0.7
}));
(() => {
  const dark = $('#dark'), glow = $('#glow');
  const dc = dark.getContext('2d'), gc = glow.getContext('2d'), S = 0.5;
  let W = 0, H = 0;
  const size = () => {
    W = dark.clientWidth; H = dark.clientHeight;
    for (const c of [dark, glow]) { c.width = Math.max(1, (W * S) | 0); c.height = Math.max(1, (H * S) | 0); }
  };
  size(); addEventListener('resize', size);
  const fall = t => t >= 1 ? 0 : Math.pow(1 - t * t, 2) / (1 + 4 * t * t);   // 1 at the flame, 0 at the edge
  const stops = (g, rgb, peak) => { for (let i = 0; i <= 16; i++) { const t = i / 16; g.addColorStop(t, `rgba(${rgb},${Math.min(1, peak * fall(t)).toFixed(3)})`); } };
  const flick = (t, s) => reduceMotion ? 1 : 1 + 0.045 * Math.sin(t * 7.3 + s) + 0.03 * Math.sin(t * 12.9 + s * 2.1) + 0.02 * Math.sin(t * 3.3 + s * 0.6);

  function frame(ms) {
    const t = ms / 1000, R = Math.max(260, Math.min(Math.hypot(W, H) * 0.55, 820));
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, dark.width, dark.height);
    dc.fillStyle = `rgba(3,2,2,${CFG.ambient})`;
    dc.fillRect(0, 0, dark.width, dark.height);
    gc.globalCompositeOperation = 'source-over';
    gc.clearRect(0, 0, glow.width, glow.height);
    for (const l of lamps) {
      const r = l.flame.getBoundingClientRect(); if (!r.width) continue;
      const x = (r.left + r.width / 2) * S, y = (r.top + r.height / 2) * S, f = flick(t, l.seed) * l.power;
      dc.globalCompositeOperation = 'destination-out';
      let g = dc.createRadialGradient(x, y, 0, x, y, R * S); stops(g, '0,0,0', 0.97 * f);
      dc.fillStyle = g; dc.fillRect(0, 0, dark.width, dark.height);
      gc.globalCompositeOperation = 'lighter';
      g = gc.createRadialGradient(x, y, 0, x, y, R * 0.8 * S); stops(g, '255,168,76', 0.2 * f);
      gc.fillStyle = g; gc.fillRect(0, 0, glow.width, glow.height);
      g = gc.createRadialGradient(x, y, 0, x, y, 70 * S); stops(g, '255,214,140', 0.5 * f);
      gc.fillStyle = g; gc.fillRect(0, 0, glow.width, glow.height);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
/* ---------------- RAIN IN THE WINDOW ---------------- */
(() => {
  const c = $('#rain'), ctx = c.getContext('2d'), btn = $('#rainBtn');
  const WIND = 0.38;                       // higher = more diagonal
  let w = 0, h = 0, drops = [], splashes = [], on = true, visible = false, raf = 0, last = 0;
  try { if (localStorage.getItem('stemAtlasRain') === 'off') on = false; } catch (e) {}

  const make = anywhere => {
    const z = Math.random();               // z = how close the drop is (0 far, 1 near)
    return { x: Math.random() * (w + h * WIND), y: anywhere ? Math.random() * h : -50,
             z, len: 16 + z * 30, sp: 520 + z * 700, a: 0.28 + z * 0.6, lw: 0.8 + z * 1.5 };
  };
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.clientWidth; h = c.clientHeight; if (!w) return;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(400, Math.max(90, Math.round(w * h / 1500)));
    drops = Array.from({ length: n }, () => make(true));
  }
  function step(now) {
    raf = 0; if (!on || !visible) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    ctx.clearRect(0, 0, w, h); ctx.lineCap = 'round';
    for (const d of drops) {
      d.y += d.sp * dt; d.x -= d.sp * dt * WIND;
      if (d.y > h - 4) {                   // hit the bottom: tiny splash, then respawn at the top
        if (d.x > 0 && d.x < w && d.z > 0.35) splashes.push({ x: d.x, y: h - 3, t: 0, r: 2 + d.z * 4 });
        Object.assign(d, make(false)); continue;
      }
      ctx.strokeStyle = `rgba(195,222,255,${d.a})`; ctx.lineWidth = d.lw;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * WIND, d.y - d.len); ctx.stroke();
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]; s.t += dt * 3.2;
      if (s.t >= 1) { splashes.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(200,225,255,${0.5 * (1 - s.t)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * (0.4 + s.t * 1.6), s.r * 0.35 * (0.4 + s.t), 0, 0, 6.283); ctx.stroke();
    }
    raf = requestAnimationFrame(step);
  }
  const start = () => { if (!raf && on && visible) { last = performance.now(); raf = requestAnimationFrame(step); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, w, h); splashes = []; };
  function setOn(v) {
    on = v; btn.setAttribute('aria-pressed', String(v));
    btn.querySelector('.rb-text').textContent = v ? 'Rain: On' : 'Rain: Off';
    btn.classList.toggle('off', !v);
    try { localStorage.setItem('stemAtlasRain', v ? 'on' : 'off'); } catch (e) {}
    v ? start() : stop();
  }
  btn.addEventListener('click', () => setOn(!on));
  new ResizeObserver(size).observe(c);
  new IntersectionObserver(([e]) => {      // only animate while the window is on screen
    visible = e.isIntersecting;
    visible ? start() : (cancelAnimationFrame(raf), raf = 0);
  }).observe(c);
  setOn(on);
})();

/* ---------------- LIBRARY (reads your GitHub repo) ---------------- */
const shelves = $('#shelves'), countEl = $('#count');
const PALETTE = [['#7b2d26','#4a1512'],['#1f4a3d','#0f2a22'],['#23375f','#111d38'],['#5b3a1e','#33200f'],
                 ['#4b2a56','#291432'],['#8a6a1f','#4f3a0c'],['#2f4f56','#152b30'],['#5a2e3a','#321620']];
const hash = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const fmtSize = n => !n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const label = s => s.replace(/^\d+[\s._-]+/, '').replace(/_+/g, ' ').trim();   // "01_Physics" -> "Physics"

function repoInfo() {
  let owner = CFG.owner, repo = CFG.repo;
  if (!owner && location.hostname.endsWith('.github.io')) owner = location.hostname.split('.')[0];
  if (!repo) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    repo = seg && !seg.includes('.') ? seg : (owner ? owner + '.github.io' : '');
  }
  return { owner, repo };
}
async function loadTree() {
  const { owner, repo } = repoInfo();
  if (!owner || !repo) throw new Error('config');
  let status = 0;
  for (const br of (CFG.branch ? [CFG.branch] : ['main', 'master'])) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${br}?recursive=1`, { cache: 'no-store' });
    if (res.ok) return (await res.json()).tree;
    status = res.status;
    if (status === 403 || status === 429) break;
  }
  throw new Error('api' + status);
}
function parseTree(tree) {
  const root = CFG.folder.replace(/^\/+|\/+$/g, '') + '/';
  const files = tree.filter(t => t.type === 'blob' && t.path.startsWith(root));
  const covers = new Map();
  files.forEach(f => { if (/\.(jpe?g|png|webp)$/i.test(f.path)) covers.set(f.path.replace(/\.[^./]+$/, '').toLowerCase(), f.path); });
  return files.filter(f => /\.pdf$/i.test(f.path)).map(f => {
    const parts = f.path.slice(root.length).split('/'), file = parts.pop();
    const rawCat = parts.join('/') , cover = covers.get(f.path.replace(/\.pdf$/i, '').toLowerCase());
    return {
      title: file.replace(/\.pdf$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim(),
      file, rawCat, cat: rawCat ? rawCat.split('/').map(label).join(' › ') : 'General',
      url: enc(f.path), cover: cover ? enc(cover) : '', size: f.size
    };
  });
}

function bookEl(b, tag) {
  const h = hash(b.title), [c1, c2] = PALETTE[h % PALETTE.length];
  const e = document.createElement(tag);
  e.className = 'book' + (tag === 'div' ? ' static' : '') + (b.cover ? ' has-img' : '');
  e.style.setProperty('--c1', c1); e.style.setProperty('--c2', c2);
  if (tag === 'button') { e.style.setProperty('--w', (0.9 + ((h >> 3) % 11) / 100).toFixed(2)); e.type = 'button'; e.setAttribute('aria-label', 'Open ' + b.title); }
  e.innerHTML = '<span class="spine"></span><span class="cover"><b class="cover-title"></b><i class="cover-cat"></i></span><span class="edge"></span>';
  e.querySelector('.cover-title').textContent = b.title;
  e.querySelector('.cover-cat').textContent = b.cat;
  if (b.cover) e.querySelector('.cover').style.backgroundImage = `url("${b.cover}")`;
  return e;
}
function makeCase(name, minRows) {
  const sec = document.createElement('section');
  sec.className = 'case wood'; sec.setAttribute('aria-label', name);
  const p = document.createElement('div'); p.className = 'plaque'; p.textContent = name;
  const g = document.createElement('div'); g.className = 'case-grid'; g.dataset.minRows = minRows || 1;
  sec.append(p, g); return { sec, g };
}
function padCases() {   // fill the remaining cubbies of each row with empty ones
  document.querySelectorAll('.case-grid').forEach(g => {
    g.querySelectorAll('.cubby.empty').forEach(n => n.remove());
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length || 1, n = g.children.length;
    const rows = Math.max(+g.dataset.minRows || 1, Math.ceil(n / cols));
    for (let i = 0; i < rows * cols - n; i++) { const d = document.createElement('div'); d.className = 'cubby empty'; g.append(d); }
  });
}
function render(books) {
  shelves.innerHTML = '';
  if (!books.length) {
    const { sec } = makeCase('Coming soon', 2); shelves.append(sec);
    countEl.textContent = 'The shelves are being stocked'; padCases(); return;
  }
  const groups = new Map();
  books.forEach(b => { if (!groups.has(b.rawCat)) groups.set(b.rawCat, []); groups.get(b.rawCat).push(b); });
  [...groups.keys()].sort(natural).forEach(k => {
    const list = groups.get(k).sort((a, b) => natural(a.title, b.title));
    const { sec, g } = makeCase(list[0].cat);
    list.forEach(b => {
      const cub = document.createElement('div'); cub.className = 'cubby';
      const el = bookEl(b, 'button'); el.addEventListener('click', () => openModal(b));
      cub.append(el); g.append(cub);
    });
    shelves.append(sec);
  });
  countEl.textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'} · ${groups.size} ${groups.size === 1 ? 'shelf' : 'shelves'}`;
  padCases();
}
function note(msg) { shelves.innerHTML = ''; const p = document.createElement('p'); p.className = 'status'; p.textContent = msg; shelves.append(p); }
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(padCases, 150); });

(async function init() {
  try {
    const books = parseTree(await loadTree());
    try { localStorage.setItem('stemAtlasBooks', JSON.stringify(books)); } catch (e) {}
    render(books);
  } catch (err) {
    let cached = null; try { cached = JSON.parse(localStorage.getItem('stemAtlasBooks')); } catch (e) {}
    if (cached && cached.length) { render(cached); return; }
    note(err.message === 'config'
      ? 'Open this site from its GitHub Pages address (or set owner and repo at the top of script.js) so the library knows where your books are.'
      : /api40[39]|api429/.test(err.message)
        ? 'GitHub is limiting requests right now. Please try again in a few minutes.'
        : 'The shelves could not be loaded. Check your connection and refresh.');
  }
})();

/* ---------------- BOOK POP-UP ---------------- */
const modal = $('#bookModal');
function openModal(b) {
  $('#mTitle').textContent = b.title; $('#mCat').textContent = b.cat;
  $('#mSize').textContent = [fmtSize(b.size), 'PDF'].filter(Boolean).join(' · ');
  $('#mBook').replaceChildren(bookEl(b, 'div'));
  const dl = $('#mDownload'); dl.href = b.url; dl.setAttribute('download', b.file);
  $('#mRead').onclick = () => { closeModal(); openReader(b); };
  modal.hidden = false; $('#mRead').focus();
}
function closeModal() { modal.hidden = true; }
modal.addEventListener('click', e => { if (e.target === modal || e.target.hasAttribute('data-close')) closeModal(); });

/* ---------------- IN-BROWSER READER (PDF.js, no download prompt) ---------------- */
const reader = $('#reader'), rScroll = $('#rScroll'), rPages = $('#rPages'), rMsg = $('#rMsg'), rPage = $('#rPage');
const R = { pdf: null, pages: [], zoom: 1, w: 0, ratio: 1.4, token: 0 };
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function setMsg(text, book) {
  rMsg.textContent = text || '';
  if (book) { rMsg.append(' '); const a = document.createElement('a'); a.href = book.url; a.setAttribute('download', book.file); a.textContent = 'Download the PDF'; rMsg.append(a); }
}
function layout() {
  R.w = Math.max(220, Math.min(rScroll.clientWidth - 24, 980)) * R.zoom;
  for (const p of R.pages) { p.el.style.width = R.w + 'px'; p.el.style.height = (R.w * (p.ratio || R.ratio)) + 'px'; }
}
const keyNow = () => Math.round(R.w) + '@' + (devicePixelRatio || 1);
async function drawPage(p, num) {
  const key = keyNow(); if (p.key === key || p.busy === key) return;
  p.busy = key; const token = R.token;
  try {
    const page = await R.pdf.getPage(num); if (token !== R.token) return;
    const v1 = page.getViewport({ scale: 1 }); p.ratio = v1.height / v1.width;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const scale = Math.min(R.w / v1.width * dpr, 3600 / v1.width), vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    if (token !== R.token || key !== keyNow()) return;
    p.el.replaceChild(c, p.canvas); p.canvas = c; p.key = key;
    p.el.style.height = (R.w * p.ratio) + 'px';
  } catch (e) { /* page skipped */ } finally { if (p.busy === key) p.busy = ''; }
}
function renderVisible() {
  if (!R.pdf) return;
  const top = rScroll.scrollTop, h = rScroll.clientHeight;
  R.pages.forEach((p, i) => {
    const y = p.el.offsetTop, b = y + p.el.offsetHeight;
    if (b > top - h && y < top + 2 * h) drawPage(p, i + 1);
    else if (p.key && (b < top - 4 * h || y > top + 5 * h)) { p.canvas.width = 1; p.canvas.height = 1; p.key = ''; }  // free memory
  });
}
function updateCurrent() {
  if (!R.pages.length) return;
  const mid = rScroll.scrollTop + rScroll.clientHeight * 0.35; let cur = 1;
  for (let i = 0; i < R.pages.length; i++) { if (R.pages[i].el.offsetTop <= mid) cur = i + 1; else break; }
  rPage.textContent = cur + ' / ' + R.pages.length;
}
function setZoom(z) {
  z = Math.min(3, Math.max(0.5, z)); if (z === R.zoom || !R.pdf) return;
  const ratio = rScroll.scrollTop / (rScroll.scrollHeight || 1);
  R.zoom = z; layout(); rScroll.scrollTop = ratio * rScroll.scrollHeight; renderVisible(); updateCurrent();
}
async function openReader(b) {
  const token = ++R.token;
  rPages.innerHTML = ''; R.pages = []; R.zoom = 1; R.pdf = null; rPage.textContent = '';
  $('#rTitle').textContent = b.title;
  const dl = $('#rDownload'); dl.href = b.url; dl.setAttribute('download', b.file);
  setMsg('Opening book…'); reader.hidden = false; document.body.classList.add('lock'); rScroll.scrollTop = 0;
  history.pushState({ reader: true }, '');
  try {
    const task = pdfjsLib.getDocument({ url: b.url, isEvalSupported: false });
    task.onProgress = p => { if (token === R.token && p.total) setMsg('Opening book… ' + Math.round(p.loaded / p.total * 100) + '%'); };
    const pdf = await task.promise;
    if (token !== R.token) { pdf.destroy(); return; }
    R.pdf = pdf;
    const v = (await pdf.getPage(1)).getViewport({ scale: 1 }); R.ratio = v.height / v.width;
    for (let i = 0; i < pdf.numPages; i++) {
      const el = document.createElement('div'); el.className = 'page';
      const canvas = document.createElement('canvas'); el.append(canvas); rPages.append(el);
      R.pages.push({ el, canvas, key: '', busy: '', ratio: 0 });
    }
    setMsg(''); layout(); renderVisible(); updateCurrent();
  } catch (e) {
    if (token === R.token) setMsg('Sorry, this book could not be opened here.', b);
  }
}
function hideReader() {
  R.token++; if (R.pdf) { R.pdf.destroy(); R.pdf = null; }
  R.pages = []; rPages.innerHTML = ''; reader.hidden = true; document.body.classList.remove('lock');
}
function closeReader() { history.state && history.state.reader ? history.back() : hideReader(); }
addEventListener('popstate', () => { if (!reader.hidden) hideReader(); });
$('#rClose').onclick = closeReader;
$('#rIn').onclick = () => setZoom(R.zoom + 0.25);
$('#rOut').onclick = () => setZoom(R.zoom - 0.25);
let tick = false;
rScroll.addEventListener('scroll', () => {
  if (tick) return; tick = true;
  requestAnimationFrame(() => { tick = false; renderVisible(); updateCurrent(); });
}, { passive: true });
addEventListener('resize', () => { if (!reader.hidden && R.pdf) { layout(); renderVisible(); } });
addEventListener('keydown', e => { if (e.key === 'Escape') { if (!reader.hidden) closeReader(); else if (!modal.hidden) closeModal(); } });
/* ---------------- VIDEO BEFORE READ / DOWNLOAD ---------------- */
(() => {
  const VIDEO_SRC = 'intro.mp4';
  const VIDEO_VERSION = 2;         // change this number whenever you replace intro.mp4
  const FADE_OUT_MS = 1400;        // website slowly fades to black
  const FADE_IN_MS = 250;          // video fades in fast

  document.head.insertAdjacentHTML('beforeend', `<style>
    #vidLayer{position:fixed;inset:0;z-index:300;background:#000;opacity:0}
    #vidLayer video{width:100%;height:100%;object-fit:cover;pointer-events:none;background:#000;opacity:0;transition:opacity ${FADE_IN_MS}ms ease}
    #vidLayer.show video{opacity:1}
    .vid-skip{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;z-index:3;min-height:48px;padding:0 26px;border-radius:999px;border:2px solid #fff;background:rgba(0,0,0,.7);color:#fff;font:700 .9rem Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;opacity:0;transition:opacity ${FADE_IN_MS}ms ease}
    #vidLayer.show .vid-skip,#vidLayer.msg .vid-skip{opacity:1}
    #vidMsg{position:absolute;inset:0;z-index:2;display:none;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;text-align:center;color:#fff;font:600 1.05rem Inter,sans-serif}
    #vidLayer.msg #vidMsg{display:flex}
    .vid-play{min-height:56px;padding:0 34px;border-radius:999px;border:0;background:#e6b865;color:#24150a;font:700 1rem Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
  </style>`);

  const layer = document.createElement('div');
  layer.id = 'vidLayer'; layer.hidden = true;
  const vid = document.createElement('video');
  vid.src = VIDEO_SRC + '?v=' + VIDEO_VERSION;
  vid.preload = 'auto'; vid.playsInline = true; vid.setAttribute('playsinline', '');
  const msg = document.createElement('div'); msg.id = 'vidMsg';
  const msgText = document.createElement('span');
  const playBtn = document.createElement('button');
  playBtn.type = 'button'; playBtn.className = 'vid-play'; playBtn.textContent = '▶ Play'; playBtn.hidden = true;
  msg.append(msgText, playBtn);
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'vid-skip'; skip.textContent = 'Skip ›';
  layer.append(vid, msg, skip);
  document.body.append(layer);

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fade = (o, ms) => { layer.style.transition = `opacity ${ms}ms ease`; layer.style.opacity = o; };
  let busy = false, bypass = false, finishVideo = null;

  async function tryPlay() {
    if (vid.error) vid.load();
    for (const muted of [false, true]) {
      vid.muted = muted;
      try { await vid.play(); return 'ok'; } catch (e) {}
    }
    return vid.error ? 'error' : 'blocked';
  }

  async function playThen(action) {
    if (busy) return; busy = true;
    layer.hidden = false; layer.classList.remove('show', 'msg');
    try { vid.currentTime = 0; } catch (e) {}
    void layer.offsetWidth;
    fade(1, FADE_OUT_MS);                       // 1) website fades out slowly
    await wait(FADE_OUT_MS);

    const state = await tryPlay();              // 2) video starts and fades in fast
    const done = new Promise(res => { finishVideo = res; });
    if (state === 'ok') {
      layer.classList.add('show');
    } else if (state === 'blocked') {
      msgText.textContent = 'Tap to play the intro';
      playBtn.hidden = false; layer.classList.add('msg');
    } else {
      msgText.textContent = "The video couldn't be played" + (vid.error ? ' (error ' + vid.error.code + ')' : '') + '. Opening your book…';
      playBtn.hidden = true; layer.classList.add('msg');
      setTimeout(() => finishVideo && finishVideo(), 2500);
    }
    await done;
    finishVideo = null;
    vid.pause(); layer.classList.remove('show', 'msg'); playBtn.hidden = true;

    action();                                   // 3) now the book opens / downloads
    fade(0, 500); await wait(500);
    layer.hidden = true; busy = false;
  }

  playBtn.addEventListener('click', async () => {
    const s = await tryPlay();
    if (s === 'ok') { playBtn.hidden = true; layer.classList.remove('msg'); layer.classList.add('show'); }
    else { msgText.textContent = "The video couldn't be played. Tap Skip to continue."; playBtn.hidden = true; }
  });
  skip.addEventListener('click', () => finishVideo && finishVideo());
  vid.addEventListener('ended', () => finishVideo && finishVideo());

  document.addEventListener('click', e => {
    if (bypass) return;
    const t = e.target.closest('#mRead, #mDownload');
    if (!t) return;
    e.preventDefault(); e.stopImmediatePropagation();
    playThen(() => { bypass = true; t.click(); bypass = false; });
  }, true);
})();
/* ---------------- ULTIMATE VIDEO LOADER (add-on) ---------------- */
(() => {
  const vid = document.querySelector('#vidLayer video');
  if (!vid) return;
  const NAMES = ['intro.mp4', 'intro.webm', 'intro.mov', 'intro.m4v'];
  let i = 0;
  vid.removeAttribute('src'); vid.load();          // drop the old fixed address

  async function fingerprint(name) {
    try {
      const r = await fetch(name, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) return null;                      // file doesn't exist
      return (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '1')
        .replace(/[^a-z0-9]/gi, '');
    } catch (e) { return null; }
  }
  async function loadNext() {
    while (i < NAMES.length) {
      const name = NAMES[i++], v = await fingerprint(name);
      if (v === null) continue;                    // try the next format
      vid.src = name + '?v=' + v; vid.load(); return;
    }
  }
  vid.addEventListener('error', () => { if (vid.getAttribute('src') && i < NAMES.length) loadNext(); });
  loadNext();
})();
