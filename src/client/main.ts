import { CLASS_BY_ID, CLASS_IDS, STAT_COLORS, STAT_KEYS, STAT_LABELS, MAX_STAT_LEVEL } from '../shared/config';
import type { GameMode, PlayerSnap, SelfSnap, ServerMessage, Snapshot } from '../shared/protocol';
import { Input } from './input';
import { drawFrame, drawSticks, tankPreviewDataUrl, type View } from './render';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);

// ---------- connection ----------
let ws: WebSocket | null = null;
let selfId = -1;
let playing = false;
let joining = false;
let selectedMode: GameMode = 'ffa';
let devCheatsEnabled = false;
let lastDevClass = '';
let recoilCameraX = 0, recoilCameraY = 0;
let recoilCameraVX = 0, recoilCameraVY = 0;
let previousFrameTime = 0;
const seenOwnBulletIds = new Set<number>();
const statusEl = $('status'), msgEl = $('msg'), playBtn = $<HTMLButtonElement>('play'), menu = $('menu'), nameEl = $<HTMLInputElement>('name');
const modeFfaBtn = $<HTMLButtonElement>('mode-ffa');
const modeTeamsBtn = $<HTMLButtonElement>('mode-teams');
const modeHelpEl = $('mode-help');
function setSelectedMode(mode: GameMode) {
  selectedMode = mode;
  modeFfaBtn.classList.toggle('selected', mode === 'ffa');
  modeTeamsBtn.classList.toggle('selected', mode === 'teams');
  modeFfaBtn.setAttribute('aria-pressed', String(mode === 'ffa'));
  modeTeamsBtn.setAttribute('aria-pressed', String(mode === 'teams'));
  modeHelpEl.textContent = mode === 'teams'
    ? 'Blue team starts on the left, red team on the right. Work together, steal the enemy flag and bring it home.'
    : 'Every tank fights for itself. Earn XP and climb the individual leaderboard.';
  try { localStorage.setItem('game-mode', mode); } catch { /* storage may be blocked */ }
}
modeFfaBtn.addEventListener('click', () => setSelectedMode('ffa'));
modeTeamsBtn.addEventListener('click', () => setSelectedMode('teams'));
try { setSelectedMode(localStorage.getItem('game-mode') === 'teams' ? 'teams' : 'ffa'); }
catch { setSelectedMode('ffa'); }
const deathPanel = $('deathpanel');
const killFeedEl = $('killfeed');
const recentFeed: string[] = [];

interface ClassProfile { role: string; strength: string; tradeoff: string }

function classProfile(classId: string): ClassProfile {
  const cls = CLASS_BY_ID[classId];
  if (!cls) return { role: 'Unknown', strength: 'Specialised weapon pattern', tradeoff: 'Learn its firing pattern' };
  const kinds = cls.barrels.map((barrel) => barrel.projectile ?? 'bullet');
  const allTraps = kinds.length > 0 && kinds.every((kind) => kind === 'trap');
  const wideSpread = cls.barrels.some((barrel) => (barrel.spread ?? 0) >= 0.12) ||
    (cls.barrels.length > 3 && Math.max(...cls.barrels.map((barrel) => Math.abs(barrel.angle))) > 0.55);

  let role = 'Cannon';
  if (cls.smasher) role = 'Rammer';
  else if (cls.droneBehavior) role = 'Drone controller';
  else if (allTraps) role = 'Area control';
  else if (kinds.some((kind) => kind === 'missile' || kind === 'firework')) role = 'Guided ordnance';
  else if (cls.barrels.length === 0 && (cls.turretCount ?? 0) > 0) role = 'Auto turret';
  else if (cls.reloadMul <= 0.55) role = 'Rapid fire';
  else if ((cls.bulletSpeedMul >= 1.5) || (cls.fovMul ?? 1) >= 1.2) role = 'Sniper';

  let strength = 'Balanced firepower and flexible handling';
  if (cls.smasher) strength = 'High body damage' + ((cls.maxHpMul ?? 1) > 1.3 ? ' and a tougher hull' : '');
  else if (cls.droneBehavior) strength = 'Autonomous pressure from up to ' + (cls.droneLimit ?? 0) + ' drones';
  else if (allTraps) strength = 'Lingering traps control space and punish approaches';
  else if (kinds.some((kind) => kind === 'missile' || kind === 'firework')) strength = 'Homing or explosive shots can pressure moving targets';
  else if ((cls.turretCount ?? 0) > 0) strength = (cls.turretCount ?? 0) + ' automatic turret' + ((cls.turretCount ?? 0) > 1 ? 's' : '') + ' add independent coverage';
  else if (cls.reloadMul <= 0.6) strength = 'High sustained fire rate';
  else if (cls.damageMul >= 1.5) strength = 'Heavy individual shots and strong burst';
  else if (cls.bulletSpeedMul >= 1.5 || (cls.fovMul ?? 1) >= 1.2) strength = 'Long sight lines and fast, accurate shots';
  else if (cls.barrels.length >= 4) strength = 'Multiple firing lanes cover a wide area';
  else if ((cls.moveSpeedMul ?? 1) >= 1.08) strength = 'Extra movement speed helps reposition';

  let tradeoff = 'Needs good aim and positioning';
  if (cls.smasher) tradeoff = 'Must get close enough to collide with opponents';
  else if (allTraps) tradeoff = 'Traps are stationary and less reliable against mobile targets';
  else if (cls.droneBehavior) tradeoff = 'Drones need time to travel and can be peeled away from targets';
  else if (cls.reloadMul >= 1.4) tradeoff = 'Long reload leaves gaps between attacks';
  else if (wideSpread) tradeoff = 'Spread makes full damage harder to land at long range';
  else if ((cls.bulletLifeMul ?? 1) <= 0.75) tradeoff = 'Short projectile lifetime limits reach';
  else if (cls.bulletSpeedMul <= 0.9) tradeoff = 'Slower shots are easier to dodge at range';
  else if (cls.barrels.length <= 1 && !(cls.turretCount ?? 0)) tradeoff = 'Limited firing lanes reward precise aim';

  return { role, strength, tradeoff };
}

function formatFeedLine(item: {
  killer: string; victim: string; killerClass: string | null; victimClass: string;
  killerTeam?: string | null; victimTeam?: string | null;
}): string {
  const killerClass = item.killerClass ? CLASS_BY_ID[item.killerClass]?.name : null;
  const victimClass = CLASS_BY_ID[item.victimClass]?.name ?? item.victimClass;
  const killerTeam = item.killerTeam ? '[' + item.killerTeam.toUpperCase() + '] ' : '';
  const victimTeam = item.victimTeam ? '[' + item.victimTeam.toUpperCase() + '] ' : '';
  return killerTeam + (killerClass ? item.killer + ' · ' + killerClass : item.killer) + '  →  ' +
    victimTeam + item.victim + ' · ' + victimClass;
}

function renderKillFeed(item: {
  killer: string; victim: string; killerClass: string | null; victimClass: string;
  killerTeam?: string | null; victimTeam?: string | null;
}) {
  const line = formatFeedLine(item);
  recentFeed.unshift(line);
  if (recentFeed.length > 5) recentFeed.length = 5;
  const row = document.createElement('div');
  row.className = 'killfeed-row';
  row.textContent = line;
  killFeedEl.prepend(row);
  while (killFeedEl.children.length > 5) killFeedEl.lastElementChild?.remove();
  window.setTimeout(() => row.classList.add('fade'), 6500);
  const deathFeed = $('deathfeed');
  if (!deathPanel.hidden) {
    deathFeed.replaceChildren();
    for (const entry of recentFeed) {
      const li = document.createElement('div');
      li.className = 'death-feed-row';
      li.textContent = entry;
      deathFeed.append(li);
    }
  }
}

function renderFlagNotice(m: Extract<ServerMessage, { t: 'flag' }>) {
  const flagName = m.flagTeam.toUpperCase() + ' flag';
  const teamName = m.playerTeam.toUpperCase();
  const captions = {
    taken: ['FLAG STOLEN!', m.player + ' picked up the ' + flagName + ' for ' + teamName],
    dropped: ['FLAG DROPPED!', m.player + ' dropped the ' + flagName],
    returned: ['FLAG RETURNED!', m.player + ' brought the ' + flagName + ' home'],
    captured: ['FLAG CAPTURED!', m.player + ' scored for ' + teamName + ' · capture ' + m.captures],
  } as const;
  const [headline, detail] = captions[m.action];
  showToast(headline, detail);
  const row = document.createElement('div');
  row.className = 'killfeed-row flag-event';
  row.textContent = headline + ' ' + detail;
  killFeedEl.prepend(row);
  while (killFeedEl.children.length > 5) killFeedEl.lastElementChild?.remove();
  window.setTimeout(() => row.classList.add('fade'), 6500);
}

function showDeathReport(m: Extract<ServerMessage, { t: 'dead' }>) {
  const killerClass = m.killerClass ? CLASS_BY_ID[m.killerClass]?.name : null;
  $('deathkiller').textContent = killerClass ? m.killer + ' · ' + killerClass : m.killer;
  $('deathclass').textContent = 'You were playing ' + (CLASS_BY_ID[m.victimClass]?.name ?? m.victimClass);
  const values: [string, string][] = [
    ['Kills', String(m.kills)],
    ['Damage dealt', m.damageDealt.toLocaleString()],
    ['Damage received', m.damageTaken.toLocaleString()],
    ['Survived', m.lifetime.toFixed(1) + 's'],
    ['Final score', m.score.toLocaleString()],
    ['Level', String(m.level)],
  ];
  const grid = $('deathstats');
  grid.replaceChildren();
  for (const [label, value] of values) {
    const cell = document.createElement('div');
    cell.className = 'death-stat';
    const strong = document.createElement('strong');
    strong.textContent = value;
    const caption = document.createElement('span');
    caption.textContent = label;
    cell.append(strong, caption);
    grid.append(cell);
  }
  const deathFeed = $('deathfeed');
  deathFeed.replaceChildren();
  if (!recentFeed.length) {
    const empty = document.createElement('div');
    empty.className = 'death-feed-row';
    empty.textContent = 'No recent arena eliminations';
    deathFeed.append(empty);
  } else {
    for (const entry of recentFeed) {
      const li = document.createElement('div');
      li.className = 'death-feed-row';
      li.textContent = entry;
      deathFeed.append(li);
    }
  }
  deathPanel.hidden = false;
}

function send(m: object) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

function connect() {
  statusEl.textContent = 'Connecting…'; playBtn.disabled = true;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { statusEl.textContent = 'Connected'; playBtn.disabled = false; joining = false; };
  ws.onclose = () => {
    playing = false; joining = false; playBtn.disabled = true; frames.length = 0; menu.classList.remove('hide');
    statusEl.textContent = 'Disconnected – reconnecting…'; playBtn.disabled = true;
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    let m: ServerMessage;
    try { m = JSON.parse(ev.data as string); } catch { return; }
    if (m.t === 's') onSnapshot(m);
    else if (m.t === 'lb') renderLeaderboard(m);
    else if (m.t === 'welcome') {
      selfId = m.id; playing = true; joining = false; playBtn.disabled = false;
      setSelectedMode(m.mode);
      msgEl.textContent = ''; deathPanel.hidden = true; playBtn.textContent = 'Play'; menu.classList.add('hide');
      devCheatsEnabled = m.devCheats;
      devTools.hidden = !devCheatsEnabled;
      if (!devCheatsEnabled) devTools.classList.remove('open');
    }
    else if (m.t === 'feed') renderKillFeed(m);
    else if (m.t === 'flag') renderFlagNotice(m);
    else if (m.t === 'dead') {
      playing = false; input.reset(); frames.length = 0; lastLv = 0;
      msgEl.textContent = '';
      showDeathReport(m);
      playBtn.textContent = 'Play again'; menu.classList.remove('hide');
    } else if (m.t === 'err') { joining = false; playing = false; playBtn.disabled = false; statusEl.textContent = m.msg; msgEl.textContent = m.msg; menu.classList.remove('hide'); }
  };
}

function play() {
  if (joining || playing || !ws || ws.readyState !== WebSocket.OPEN) return;
  try { localStorage.setItem('nick', nameEl.value); } catch { /* storage may be blocked */ }
  joining = true; playBtn.disabled = true; statusEl.textContent = 'Joining…'; msgEl.textContent = '';
  send({ t: 'join', name: nameEl.value, mode: selectedMode });
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
  // New bullets owned by us trigger a short directional camera punch. Bigger rounds hit harder.
  for (const bullet of s.b) {
    if (bullet[4] !== selfId || bullet[5] !== 0 || seenOwnBulletIds.has(bullet[0])) continue;
    seenOwnBulletIds.add(bullet[0]);
    const kick = Math.min(5.5, 1.5 + bullet[3] * 0.3);
    recoilCameraVX += Math.cos(input.angle) * kick * 18;
    recoilCameraVY += Math.sin(input.angle) * kick * 18;
  }
  if (seenOwnBulletIds.size > 512) {
    seenOwnBulletIds.clear();
    for (const bullet of s.b) if (bullet[4] === selfId) seenOwnBulletIds.add(bullet[0]);
  }
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
    bullets: b.snap.b.map((x) => { const q = a.bm.get(x[0]); return q ? [x[0], lerp(q[1], x[1], t), lerp(q[2], x[2], t), x[3], x[4], x[5], x[6], x[7]] as typeof x : x; }),
    shapes: b.snap.sh.map((x) => { const q = a.sm.get(x[0]); return q ? [x[0], lerp(q[1], x[1], t), lerp(q[2], x[2], t), lerpAng(q[3], x[3], t), x[4], x[5], x[6], x[7], x[8], x[9]] : x; }),
    flags: b.snap.flags,
  };
}

// Populate the optional full-roster guide once; evolution cards reuse the same profiles.
const classGuide = $('classguide');
for (const id of CLASS_IDS) {
  const cls = CLASS_BY_ID[id];
  const profile = classProfile(id);
  const article = document.createElement('article');
  article.className = 'guide-class';
  const heading = document.createElement('div');
  heading.className = 'guide-heading';
  const name = document.createElement('strong');
  name.textContent = cls.name;
  const role = document.createElement('span');
  role.textContent = profile.role;
  heading.append(name, role);
  const description = document.createElement('p');
  description.textContent = cls.description;
  const strength = document.createElement('p');
  strength.className = 'guide-strength';
  strength.textContent = '+ Best at: ' + profile.strength;
  const tradeoff = document.createElement('p');
  tradeoff.className = 'guide-tradeoff';
  tradeoff.textContent = '− Trade-off: ' + profile.tradeoff;
  article.append(heading, description, strength, tradeoff);
  classGuide.append(article);
}

// ---------- HUD ----------
const statsEl = $('stats'), rowsEl = $('rows'), ptsEl = $('pts'), classesEl = $('classes');
const xpEl = $('xp'), toastEl = $('toast');
const devTools = $('devtools');
const devToggle = $<HTMLButtonElement>('devtoggle');
const devClassSelect = $<HTMLSelectElement>('devclass');
const devApply = $<HTMLButtonElement>('devapply');
for (const id of CLASS_IDS) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = CLASS_BY_ID[id]?.name ?? id;
  devClassSelect.append(option);
}
devToggle.addEventListener('click', () => devTools.classList.toggle('open'));
devApply.addEventListener('click', () => {
  if (playing && devCheatsEnabled) send({ t: 'devClass', id: devClassSelect.value });
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && devCheatsEnabled && (e.target as HTMLElement | null)?.tagName !== 'INPUT') {
    e.preventDefault();
    devTools.classList.toggle('open');
  }
});
const pipEls: HTMLElement[][] = [];
const btnEls: HTMLButtonElement[] = [];
const rowEls: HTMLElement[] = [];
STAT_KEYS.forEach((k, i) => {
  const row = document.createElement('div'); row.className = 'row';
  const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = `${i + 1}. ${STAT_LABELS[k]}`;
  const pips = document.createElement('div'); pips.className = 'pips';
  pipEls[i] = [];
  for (let j = 0; j < MAX_STAT_LEVEL; j++) { const p = document.createElement('span'); p.className = 'pip'; pips.append(p); pipEls[i].push(p); }
  const btn = document.createElement('button'); btn.textContent = '+'; btn.style.background = STAT_COLORS[i];
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); upgrade(i); });
  btnEls[i] = btn; rowEls[i] = row;
  row.append(lbl, pips, btn); rowsEl.append(row);
});
function upgrade(i: number) { if (playing) send({ t: 'upgrade', stat: i }); }
input.onUpgrade = upgrade;

/** Restart a CSS animation class on an element. */
function retrigger(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(cls);
}

let toastTimer = 0;
function showToast(big: string, sub: string) {
  $('toastbig').textContent = big;
  $('toastsub').textContent = sub;
  retrigger(toastEl, 'go');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('go'), 2100);
}

let hudKey = '', optKey = '';
let lastLv = 0, lastPts = 0, lastStats: number[] = [];
function updateHud(m: SelfSnap) {
  // Only sync the selector when the server-confirmed class actually changes.
  // Do not overwrite the user's pending dropdown choice on every snapshot.
  if (devCheatsEnabled && m.cls !== lastDevClass) {
    lastDevClass = m.cls;
    devClassSelect.value = m.cls;
  }
  const span = Math.max(1, m.xpNext - m.xpCur);
  $('xpfill').style.width = `${m.xpNext === m.xpCur ? 100 : Math.min(100, ((m.xp - m.xpCur) / span) * 100)}%`;

  // Level-up celebration (only while alive and after the first snapshot of a life).
  if (!m.alive) { lastLv = 0; lastPts = 0; lastStats = []; }
  else {
    if (lastLv > 0 && m.lv > lastLv) {
      retrigger(xpEl, 'lvl');
      showToast(`LEVEL ${m.lv}`, m.pts > 0 ? `+${m.pts} upgrade point${m.pts > 1 ? 's' : ''} available` : '');
    }
    lastLv = m.lv;
  }

  const key = `${m.lv}|${m.xp}|${m.pts}|${m.stats.join(',')}|${m.cls}`;
  if (key !== hudKey) {
    hudKey = key;
    $('xptxt').textContent = `Lv ${m.lv} ${CLASS_BY_ID[m.cls]?.name ?? ''} — ${m.xp} xp`;
    statsEl.classList.toggle('show', m.pts > 0);
    ptsEl.textContent = m.pts > 0 ? `(x${m.pts})` : '';
    if (m.pts !== lastPts && m.pts > 0) retrigger(ptsEl, 'bump');
    lastPts = m.pts;
    m.stats.forEach((v, i) => {
      const prev = lastStats[i] ?? v;
      pipEls[i].forEach((p, j) => {
        p.style.background = j < v ? STAT_COLORS[i] : '';
        if (j === v - 1 && v > prev) retrigger(p, 'pop');
      });
      if (v > prev) retrigger(rowEls[i], 'flash');
      btnEls[i].disabled = m.pts <= 0 || v >= MAX_STAT_LEVEL || (!!CLASS_BY_ID[m.cls]?.smasher && i >= 3 && i <= 6);
    });
    lastStats = m.stats.slice();
  }

  const ok = m.opts.join(',');
  if (ok !== optKey) {
    optKey = ok;
    classesEl.replaceChildren();
    if (m.opts.length) {
      const evo = document.createElement('div'); evo.className = 'evo'; evo.textContent = 'EVOLVE!';
      classesEl.append(evo);
      if (lastLv > 0) showToast('EVOLUTION READY', 'Choose a new tank class');
    }
    m.opts.forEach((id, n) => {
      const cls = CLASS_BY_ID[id];
      const profile = classProfile(id);
      const b = document.createElement('button'); b.className = 'evo-card';
      b.title = (cls?.description ?? id) + ' Best at: ' + profile.strength + '. Trade-off: ' + profile.tradeoff + '.';
      const preview = document.createElement('img');
      preview.className = 'evo-preview'; preview.alt = cls?.name ?? id;
      preview.src = tankPreviewDataUrl(id);
      const name = document.createElement('span'); name.className = 'evo-name'; name.textContent = cls?.name ?? id;
      const role = document.createElement('span'); role.className = 'evo-role'; role.textContent = profile.role;
      const strength = document.createElement('span'); strength.className = 'evo-strength'; strength.textContent = '+ ' + profile.strength;
      const tradeoff = document.createElement('span'); tradeoff.className = 'evo-tradeoff'; tradeoff.textContent = '− ' + profile.tradeoff;
      b.append(preview, name, role, strength, tradeoff);
      b.style.animationDelay = `${n * 0.08}s, ${0.5 + n * 0.08}s`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (playing) send({ t: 'class', id }); });
      classesEl.append(b);
    });
  }
}

// ---------- Leaderboard (persistent rows that slide when ranks change) ----------
interface LbRow { el: HTMLElement; bar: HTMLElement; rk: HTMLElement; nm: HTMLElement; lv: HTMLElement; sc: HTMLElement }
const lbRows = new Map<number, LbRow>();
const LB_ROW_H = 26;
const fmtScore = (n: number) => (n >= 100000 ? `${(n / 1000).toFixed(0)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function makeLbRow(): LbRow {
  const el = document.createElement('div'); el.className = 'lrow';
  const bar = document.createElement('div'); bar.className = 'bar';
  const rk = document.createElement('span'); rk.className = 'rk';
  const nm = document.createElement('span'); nm.className = 'nm';
  const lv = document.createElement('span'); lv.className = 'lv';
  const sc = document.createElement('span'); sc.className = 'sc';
  el.append(bar, rk, nm, lv, sc);
  return { el, bar, rk, nm, lv, sc };
}

function renderLeaderboard(message: Extract<ServerMessage, { t: 'lb' }>) {
  const title = $('lbtitle');
  const teamScore = $('teamscore');
  const top = message.top;
  const teams = message.mode === 'teams';
  title.textContent = teams ? 'TEAM BATTLE' : 'LEADERBOARD';
  teamScore.hidden = !teams;
  if (message.mode === 'teams') {
    teamScore.textContent =
      'BLUE ' + message.blueKills + ' K · ' + message.blueCaptures + ' FLAGS' +
      '     RED ' + message.redKills + ' K · ' + message.redCaptures + ' FLAGS';
    teamScore.className = 'teamscore';
  }
  const box = $('lbrows');
  box.style.height = `${top.length * LB_ROW_H}px`;
  const max = Math.max(1, top[0]?.score ?? 1);
  const seen = new Set<number>();
  top.forEach((e, i) => {
    seen.add(e.id);
    let r = lbRows.get(e.id);
    if (!r) {
      r = makeLbRow();
      r.el.style.transform = `translateY(${i * LB_ROW_H}px)`;
      box.append(r.el);
      lbRows.set(e.id, r);
    }
    r.el.style.transform = `translateY(${i * LB_ROW_H}px)`;
    const team = message.mode === 'teams' ? e.team : null;
    r.el.className = `lrow${i < 3 ? ` r${i + 1}` : ''}${e.id === selfId ? ' me' : ''}${team ? ' ' + team : ''}`;
    r.bar.style.width = `${Math.max(4, (e.score / max) * 100)}%`;
    r.rk.textContent = String(i + 1);
    r.nm.textContent = team ? '[' + team.toUpperCase() + '] ' + e.name : e.name;
    r.lv.textContent = e.lv != null ? `Lv${e.lv}` : '';
    r.sc.textContent = teams ? String(e.score) + ' K' : fmtScore(e.score);
  });
  for (const [id, r] of lbRows) if (!seen.has(id)) { r.el.remove(); lbRows.delete(id); }
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
  // Sample/send intent at 60 Hz so the server gets the freshest input before each simulation step.
  if (playing && now - lastSendT >= 1000 / 60) {
    const msg = `{"t":"input","mx":${input.mx.toFixed(2)},"my":${input.my.toFixed(2)},"a":${input.angle.toFixed(2)},"f":${input.fire ? 1 : 0},"secondary":${input.secondary ? 1 : 0},"spin":${input.spin ? 1 : 0}}`;
    if (msg !== lastSent || now - lastSendT > 500) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
      lastSent = msg; lastSendT = now;
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const view = sample(now) ?? { players: [], bullets: [], shapes: [], flags: [] };
  const self = view.players.find((p) => p.id === selfId);
  if (self) {
    const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000);
    cam.x = self.x + recoilCameraX / scale;
    cam.y = self.y + recoilCameraY / scale;
  }
  const dt = previousFrameTime ? Math.min(0.05, (now - previousFrameTime) / 1000) : 1 / 60;
  previousFrameTime = now;
  // Critically damped spring: recoil eases into and out of the camera instead of snapping.
  const spring = 18, damping = 2 * spring;
  recoilCameraVX += (-spring * spring * recoilCameraX - damping * recoilCameraVX) * dt;
  recoilCameraVY += (-spring * spring * recoilCameraY - damping * recoilCameraVY) * dt;
  recoilCameraX += recoilCameraVX * dt; recoilCameraY += recoilCameraVY * dt;
  if (Math.abs(recoilCameraX) < 0.01 && Math.abs(recoilCameraVX) < 0.1) { recoilCameraX = 0; recoilCameraVX = 0; }
  if (Math.abs(recoilCameraY) < 0.01 && Math.abs(recoilCameraVY) < 0.1) { recoilCameraY = 0; recoilCameraVY = 0; }
  drawFrame(ctx, W, H, cam, view, selfId, frames[frames.length - 1]?.snap.me.fov ?? 1);
  if (playing) drawSticks(ctx, W, H, input);
}
requestAnimationFrame(frame);
connect();
