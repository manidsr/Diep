import { CLASS_BY_ID, STAT_COLORS, STAT_KEYS, STAT_LABELS, MAX_STAT_LEVEL } from '../shared/config';
import type { PlayerSnap, SelfSnap, ServerMessage, Snapshot } from '../shared/protocol';
import { Input } from './input';
import { drawFrame, drawSticks, type View } from './render';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);

// ---------- connection ----------
let ws: WebSocket | null = null;
let selfId = -1;
let playing = false;
const statusEl = $('status'), msgEl = $('msg'), playBtn = $<HTMLButtonElement>('play'), menu = $('menu'), nameEl = $<HTMLInputElement>('name');

function send(m: object) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

function connect() {
  statusEl.textContent = 'Connecting…'; playBtn.disabled = true;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { statusEl.textContent = 'Connected'; playBtn.disabled = false; };
  ws.onclose = () => {
    playing = false; frames.length = 0; menu.classList.remove('hide');
    statusEl.textContent = 'Disconnected – reconnecting…'; playBtn.disabled = true;
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    let m: ServerMessage;
    try { m = JSON.parse(ev.data as string); } catch { return; }
    if (m.t === 's') onSnapshot(m);
    else if (m.t === 'lb') renderLeaderboard(m.top);
    else if (m.t === 'welcome') { selfId = m.id; playing = true; menu.classList.add('hide'); }
    else if (m.t === 'dead') {
      playing = false; input.reset(); frames.length = 0;
      msgEl.textContent = `Destroyed by ${m.killer} — level ${m.level}, score ${m.score}`;
      playBtn.textContent = 'Play again'; menu.classList.remove('hide');
    } else if (m.t === 'err') { statusEl.textContent = m.msg; }
  };
}

function play() {
  try { localStorage.setItem('nick', nameEl.value); } catch { /* storage may be blocked */ }
  send({ t: 'join', name: nameEl.value });
  playing = true; msgEl.textContent = ''; menu.classList.add('hide');
}
playBtn.addEventListener('click', play);
nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !playBtn.disabled) play(); });
try { nameEl.value = localStorage.getItem('nick') ?? ''; } catch { /* ignore */ }

// LAN address helper for the host.
fetch('/api/info').then((r) => r.json()).then((i: { addresses: string[]; port: number }) => {
  if (!i.addresses.length) return;
  const el = $('lan');
  el.textContent = 'Friends on the same hotspot/Wi-Fi can join at: ';
  for (const a of i.addresses) { const c = document.createElement('code'); c.textContent = `http://${a}:${i.port}`; el.append(c, ' '); }
}).catch(() => { /* optional */ });

// ---------- snapshot interpolation ----------
interface Frame { recv: number; snap: Snapshot; pm: Map<number, PlayerSnap>; bm: Map<number, number[]>; sm: Map<number, number[]> }
const frames: Frame[] = [];
const INTERP_MS = 100;

function onSnapshot(s: Snapshot) {
  frames.push({
    recv: performance.now(), snap: s,
    pm: new Map(s.p.map((p) => [p.id, p])), bm: new Map(s.b.map((b) => [b[0], b])), sm: new Map(s.sh.map((x) => [x[0], x])),
  });
  if (frames.length > 8) frames.shift();
  updateHud(s.me);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAng = (a: number, b: number, t: number) => a + ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * t;

function sample(now: number): View | null {
  if (!frames.length) return null;
  const rt = now - INTERP_MS;
  let a = frames[0], b = frames[frames.length - 1];
  if (rt >= a.recv && rt < b.recv) {
    for (let i = 0; i < frames.length - 1; i++) if (frames[i].recv <= rt && rt < frames[i + 1].recv) { a = frames[i]; b = frames[i + 1]; break; }
  } else if (rt >= b.recv) a = b; else b = a;
  const t = a === b ? 1 : Math.min(1, Math.max(0, (rt - a.recv) / (b.recv - a.recv)));
  return {
    players: b.snap.p.map((p) => { const q = a.pm.get(p.id); return q ? { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t), a: lerpAng(q.a, p.a, t) } : p; }),
    bullets: b.snap.b.map((x) => { const q = a.bm.get(x[0]); return q ? [x[0], lerp(q[1], x[1], t), lerp(q[2], x[2], t), x[3], x[4]] : x; }),
    shapes: b.snap.sh.map((x) => { const q = a.sm.get(x[0]); return q ? [x[0], lerp(q[1], x[1], t), lerp(q[2], x[2], t), lerpAng(q[3], x[3], t), x[4], x[5]] : x; }),
  };
}

// ---------- HUD ----------
const statsEl = $('stats'), rowsEl = $('rows'), ptsEl = $('pts'), classesEl = $('classes');
const pipEls: HTMLElement[][] = [];
const btnEls: HTMLButtonElement[] = [];
STAT_KEYS.forEach((k, i) => {
  const row = document.createElement('div'); row.className = 'row';
  const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = `${i + 1}. ${STAT_LABELS[k]}`;
  const pips = document.createElement('div'); pips.className = 'pips';
  pipEls[i] = [];
  for (let j = 0; j < MAX_STAT_LEVEL; j++) { const p = document.createElement('span'); p.className = 'pip'; pips.append(p); pipEls[i].push(p); }
  const btn = document.createElement('button'); btn.textContent = '+'; btn.style.background = STAT_COLORS[i];
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); upgrade(i); });
  btnEls[i] = btn;
  row.append(lbl, pips, btn); rowsEl.append(row);
});
function upgrade(i: number) { if (playing) send({ t: 'upgrade', stat: i }); }
input.onUpgrade = upgrade;

let hudKey = '', optKey = '';
function updateHud(m: SelfSnap) {
  const span = Math.max(1, m.xpNext - m.xpCur);
  $('xpfill').style.width = `${m.xpNext === m.xpCur ? 100 : Math.min(100, ((m.xp - m.xpCur) / span) * 100)}%`;
  const key = `${m.lv}|${m.xp}|${m.pts}|${m.stats.join(',')}|${m.cls}`;
  if (key !== hudKey) {
    hudKey = key;
    $('xptxt').textContent = `Lv ${m.lv} ${CLASS_BY_ID[m.cls]?.name ?? ''} — ${m.xp} xp`;
    statsEl.classList.toggle('show', m.pts > 0);
    ptsEl.textContent = m.pts > 0 ? `(x${m.pts})` : '';
    m.stats.forEach((v, i) => {
      pipEls[i].forEach((p, j) => { p.style.background = j < v ? STAT_COLORS[i] : ''; });
      btnEls[i].disabled = m.pts <= 0 || v >= MAX_STAT_LEVEL;
    });
  }
  const ok = m.opts.join(',');
  if (ok !== optKey) {
    optKey = ok;
    classesEl.replaceChildren();
    for (const id of m.opts) {
      const b = document.createElement('button'); b.textContent = CLASS_BY_ID[id]?.name ?? id; b.style.background = '#2a8fd6';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (playing) send({ t: 'class', id }); });
      classesEl.append(b);
    }
  }
}

function renderLeaderboard(top: { id: number; name: string; score: number }[]) {
  const box = $('lbrows'); box.replaceChildren();
  for (const e of top) {
    const d = document.createElement('div'); if (e.id === selfId) d.className = 'me';
    const n = document.createElement('span'); n.textContent = e.name;
    const s = document.createElement('span'); s.textContent = String(e.score);
    d.append(n, s); box.append(d);
  }
}

// ---------- main loop ----------
let W = 0, H = 0, dpr = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
window.visualViewport?.addEventListener('resize', resize);
resize();

const cam = { x: 1600, y: 1600 };
let lastSent = '', lastSendT = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  input.update(W, H);
  if (playing && now - lastSendT >= 33) {
    const msg = `{"t":"input","mx":${input.mx.toFixed(2)},"my":${input.my.toFixed(2)},"a":${input.angle.toFixed(2)},"f":${input.fire ? 1 : 0}}`;
    if (msg !== lastSent || now - lastSendT > 500) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
      lastSent = msg; lastSendT = now;
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const view = sample(now) ?? { players: [], bullets: [], shapes: [] };
  const self = view.players.find((p) => p.id === selfId);
  if (self) { cam.x = self.x; cam.y = self.y; }
  drawFrame(ctx, W, H, cam, view, selfId);
  if (playing) drawSticks(ctx, W, H, input);
}
requestAnimationFrame(frame);
connect();
