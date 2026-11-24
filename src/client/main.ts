import { CLASS_BY_ID, CLASS_IDS, TANK_SPECIALTIES, SERVER_TICK_HZ, TANK_SKINS } from '../shared/config';
import type { GameMode, PlayerSnap, SelfSnap, ServerMessage, Snapshot, ZombieSnap } from '../shared/protocol';
import { Input } from './input';
import { GameAudio } from './audio';
import { initializePreferences, setPreference, tr, seconds, language } from './preferences';
initializePreferences();
import { POWER_META, powerIcon } from './powerups';
import { POWERUPS } from '../shared/config';
import { drawFrame, drawMinimap, drawSticks, tankPreviewDataUrl, type View } from './render';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const ctx = canvas.getContext('2d')!;
const minimapCanvas = $<HTMLCanvasElement>('minimap');
const minimapCtx = minimapCanvas.getContext('2d')!;
const MINIMAP_SIZE = 176;
const input = new Input(canvas);
const audio = new GameAudio();
const audioPanel = $('audio-panel');
const musicSlider = $<HTMLInputElement>('music-volume'), effectsSlider = $<HTMLInputElement>('effects-volume');
const muteAudio = $<HTMLInputElement>('mute-audio');
musicSlider.value = String(Math.round(audio.musicVolume*100));
effectsSlider.value = String(Math.round(audio.effectsVolume*100));
muteAudio.checked = audio.muted;
const saveAudio = () => audio.settings(Number(musicSlider.value)/100, Number(effectsSlider.value)/100, muteAudio.checked);
for (const control of [musicSlider,effectsSlider,muteAudio]) control.addEventListener('input',saveAudio);
for (const id of ['audio-menu','audio-hud']) $(id).addEventListener('click',() => { if(id==='audio-hud')closeGameMenu(); input.reset(); audioPanel.hidden = false; void audio.unlock(); $('audio-close').focus(); });
$('audio-close').addEventListener('click',() => { audioPanel.hidden = true; if(playing)canvas.focus({preventScroll:true}); });
$('audio-test').addEventListener('click',() => { void audio.unlock().then(() => audio.cue('heavy')); });
document.addEventListener('pointerdown', () => { void audio.unlock(); }, { passive:true });
document.addEventListener('keydown', () => { void audio.unlock(); });
document.addEventListener('visibilitychange', () => audio.visibility());

// ---------- connection ----------
let ws: WebSocket | null = null;
let selfId = -1;
let playing = false;
let joining = false;
const RESUME_TOKEN_KEY = `diep-resume:${location.host}`;
let resumeToken = '';
let resumeOnReconnect = false;
let resumeAttempt = false;
// A fresh page visit always returns to the mode picker. The in-memory token still
// restores the tank after a network drop without silently rejoining Survival on reload.
let selectedMode: GameMode = 'ffa';
let devCheatsEnabled = false;
let lastDevClass = '';
let recoilCameraX = 0, recoilCameraY = 0;
let recoilCameraVX = 0, recoilCameraVY = 0;
let previousFrameTime = 0;
const seenOwnBulletIds = new Set<number>();
const statusEl = $('status'), msgEl = $('msg'), playBtn = $<HTMLButtonElement>('play'), menu = $('menu'), nameEl = $<HTMLInputElement>('name');
const fullscreenBtn = $<HTMLButtonElement>('fullscreen-btn');
const modeFfaBtn = $<HTMLButtonElement>('mode-ffa');
const modeTeamsBtn = $<HTMLButtonElement>('mode-teams');
const modeSurvivalBtn = $<HTMLButtonElement>('mode-survival');
const modeHelpEl = $('mode-help');
const modeRoyaleBtn=$<HTMLButtonElement>('mode-royale');
const skinSelect=$<HTMLSelectElement>('skin-select');
for(const id of Object.keys(TANK_SKINS)){const option=document.createElement('option');option.value=id;option.textContent=tr(id[0].toUpperCase()+id.slice(1));skinSelect.append(option);}
try{const saved=localStorage.getItem('tank-skin');if(saved&&Object.prototype.hasOwnProperty.call(TANK_SKINS,saved))skinSelect.value=saved;}catch{}
skinSelect.addEventListener('change',()=>{try{localStorage.setItem('tank-skin',skinSelect.value);}catch{}if(playing)send({t:'skin',id:skinSelect.value});});
function setSelectedMode(mode: GameMode) {
  if(!playing&&mode!==selectedMode){resumeToken='';try{localStorage.removeItem(RESUME_TOKEN_KEY);}catch{}}
  selectedMode = mode;
  modeRoyaleBtn.classList.toggle('selected',mode==='royale');modeRoyaleBtn.setAttribute('aria-pressed',String(mode==='royale'));
  modeFfaBtn.classList.toggle('selected', mode === 'ffa');
  modeTeamsBtn.classList.toggle('selected', mode === 'teams');
  modeSurvivalBtn.classList.toggle('selected', mode === 'survival');
  modeFfaBtn.setAttribute('aria-pressed', String(mode === 'ffa'));
  modeTeamsBtn.setAttribute('aria-pressed', String(mode === 'teams'));
  modeSurvivalBtn.setAttribute('aria-pressed', String(mode === 'survival'));
  modeHelpEl.textContent = tr(mode === 'teams'
    ? 'Blue base on the left, red base on the right. Fight for the middle and defend your safe base.'
    : mode === 'survival'
      ? 'Cooperate with everyone. Fight off zombie waves, earn XP from kills and survive as long as you can.'
      : mode==='royale'?'Last tank standing. At least two players required; avoid the shrinking storm.':'Every tank fights for itself. Earn XP and climb the individual leaderboard.');
}
modeFfaBtn.addEventListener('click', () => setSelectedMode('ffa'));
modeTeamsBtn.addEventListener('click', () => setSelectedMode('teams'));
modeSurvivalBtn.addEventListener('click', () => setSelectedMode('survival'));
modeRoyaleBtn.addEventListener('click',()=>setSelectedMode('royale'));
setSelectedMode('ffa');
const deathPanel = $('deathpanel');
const killFeedEl = $('killfeed');
const recentFeed: string[] = [];

interface ClassProfile { role: string; strength: string; tradeoff: string; bonuses: string }

function classProfile(classId: string): ClassProfile {
  const cls = CLASS_BY_ID[classId];
  if (!cls) return { role: 'Unknown', strength: 'Specialised weapon pattern', tradeoff: 'Learn its firing pattern', bonuses: 'Automatic stat growth' };
  const specialty = TANK_SPECIALTIES[cls.specialty] ?? TANK_SPECIALTIES.balanced;
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

  return { role:tr(role), strength:tr(strength), tradeoff:tr(tradeoff), bonuses:tr(specialty.summary) };
}

function formatFeedLine(item: {
  killer: string; victim: string; killerClass: string | null; victimClass: string;
  killerTeam?: string | null; victimTeam?: string | null;
}): string {
  const killerClass = item.killerClass ? tr(CLASS_BY_ID[item.killerClass]?.name??item.killerClass) : null;
  const victimClass = tr(CLASS_BY_ID[item.victimClass]?.name ?? item.victimClass);
  const killerTeam = item.killerTeam ? '[' + tr(item.killerTeam.toUpperCase()) + '] ' : '';
  const victimTeam = item.victimTeam ? '[' + tr(item.victimTeam.toUpperCase()) + '] ' : '';
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

function showDeathReport(m: Extract<ServerMessage, { t: 'dead' }>) {
  const killerClass = m.killerClass ? tr(CLASS_BY_ID[m.killerClass]?.name??m.killerClass) : null;
  $('deathkiller').textContent = killerClass ? m.killer + ' · ' + killerClass : m.killer;
  $('deathclass').textContent = tr('You were playing ','تانک شما: ') + tr(CLASS_BY_ID[m.victimClass]?.name ?? m.victimClass);
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
    caption.textContent = tr(label);
    cell.append(strong, caption);
    grid.append(cell);
  }
  const deathFeed = $('deathfeed');
  deathFeed.replaceChildren();
  if (!recentFeed.length) {
    const empty = document.createElement('div');
    empty.className = 'death-feed-row';
    empty.textContent = tr("No recent arena eliminations");
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
  statusEl.textContent = tr(resumeOnReconnect ? 'Restoring your tank…' : 'Connecting…');
  playBtn.disabled = true;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    if (resumeOnReconnect && resumeToken) {
      joining = true;
      resumeAttempt = true;
      statusEl.textContent = tr("Restoring your tank…");
      send({ t: 'join', name: nameEl.value, mode: selectedMode, resumeToken });
    } else {
      statusEl.textContent = tr("Connected");
      playBtn.disabled = false;
      joining = false;
    }
  };
  ws.onclose = () => {
    const shouldResume = playing || joining || resumeOnReconnect;
    playing = false; joining = false; input.reset(); playBtn.disabled = true; frames.length = 0;
    if (shouldResume && resumeToken) {
      resumeOnReconnect = true;
      menu.classList.add('hide');
      statusEl.textContent = tr("Connection lost – restoring your tank…");
    } else {
      resumeOnReconnect = false;
      menu.classList.remove('hide');
      statusEl.textContent = tr("Disconnected – reconnecting…");
    }
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    let m: ServerMessage;
    try { m = JSON.parse(ev.data as string); } catch { return; }
    if (m.t === 's') onSnapshot(m);
    else if (m.t === 'lb') renderLeaderboard(m);
    else if (m.t === 'welcome') {
      audio.reset(); frames.length=0; seenOwnBulletIds.clear(); resetPowerHud();
      selfId = m.id; playing = true;
      send({t:'skin',id:skinSelect.value}); joining = false; playBtn.disabled = false;
      resumeToken = m.resumeToken;
      resumeOnReconnect = false;
      resumeAttempt = false;
      try { localStorage.setItem(RESUME_TOKEN_KEY, resumeToken); } catch { /* Session recovery is optional without storage. */ }
      setSelectedMode(m.mode);
      survivalGameOverEl.hidden = true;
      survivalRestartBtn.disabled = false;
      survivalRestartBtn.textContent = tr("RESTART RUN FOR EVERYONE");
      lastLv = 0; lastHudClass = ''; wasDowned = false;
      msgEl.textContent = ''; deathPanel.hidden = true; playBtn.textContent = tr("Play"); menu.classList.add('hide');
      devCheatsEnabled = m.devCheats;
      devTools.hidden = !devCheatsEnabled;
      if (!devCheatsEnabled) devTools.classList.remove('open');
    }
    else if (m.t === 'feed') renderKillFeed(m);
    else if (m.t === 'dead') {
      audio.cue('death');
      playing = false; input.reset(); frames.length = 0; lastLv = 0;
      msgEl.textContent = '';
      showDeathReport(m);
      playBtn.textContent = tr("Play again"); menu.classList.remove('hide');
    } else if (m.t === 'err') {
      if (resumeAttempt) {
        // The grace period elapsed (or the server restarted). Fall back to a fresh join.
        resumeAttempt = false;
        resumeOnReconnect = false;
        resumeToken = '';
        try { localStorage.removeItem(RESUME_TOKEN_KEY); } catch { /* ignore */ }
        if (ws && ws.readyState === WebSocket.OPEN) {
          joining = true;
          statusEl.textContent = tr("Previous session expired. Starting a new tank…");
          send({ t: 'join', name: nameEl.value, mode: selectedMode });
          return;
        }
      }
      joining = false; playing = false; playBtn.disabled = false;
      statusEl.textContent = tr(m.msg); msgEl.textContent = tr(m.msg); menu.classList.remove('hide');
    }
  };
}


async function enterFullscreen() {
  if (!document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      msgEl.textContent = tr("Fullscreen is unavailable here. Try Chrome menu → Add to Home screen for an app-style launch.");
      return;
    }
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> };
    await orientation.lock?.('landscape');
  } catch { /* Some browsers restrict orientation locking; fullscreen still works. */ }
}
fullscreenBtn.addEventListener('click', () => { void enterFullscreen(); });
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = tr(document.fullscreenElement ? 'Fullscreen is on' : 'Enter fullscreen');
});

function play() {
  if (joining || playing || !ws || ws.readyState !== WebSocket.OPEN) return;
  try { localStorage.setItem('nick', nameEl.value); } catch { /* storage may be blocked */ }
  joining = true; playBtn.disabled = true; statusEl.textContent = tr("Joining…"); msgEl.textContent = '';
  send({ t: 'join', name: nameEl.value, mode: selectedMode, ...(resumeToken ? { resumeToken } : {}) });
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
interface Frame { recv: number; snap: Snapshot; pm: Map<number, PlayerSnap>; bm: Map<number, number[]>; sm: Map<number, number[]>; zm: Map<number, ZombieSnap> }
const frames: Frame[] = [];
const TICK_MS = 1000 / SERVER_TICK_HZ;
const INTERP_MS = 2 * TICK_MS;
let clockOffset = 0;
let lastRenderTickTime = -Infinity;

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
  const arrival = performance.now();
  const tickTime = s.tick * TICK_MS;
  const previous = frames[frames.length - 1];
  if(s.royale&&!playing){const rr=s.royale;$('royale-menu-status').textContent=rr.phase==='result'?'Winner: '+rr.winner+' · next lobby in '+rr.seconds+'s':rr.phase==='active'?rr.alive+' tanks left · round in progress':'Next round lobby open';}else $('royale-menu-status').textContent='';
  if (playing) audio.snapshot(s, selfId, previous?.snap);
  if (previous && s.tick <= previous.snap.tick) {
    if (s.tick === previous.snap.tick) return;
    frames.length = 0;
  }
  if (!frames.length) {
    clockOffset = arrival - tickTime;
    lastRenderTickTime = -Infinity;
  } else {
    // Track the server clock slowly; packet arrival jitter must not change simulation spacing.
    const error = arrival - tickTime - clockOffset;
    clockOffset += Math.max(-2, Math.min(2, error * 0.05));
  }
  frames.push({
    recv: tickTime, snap: s,
    pm: new Map(s.p.map((p) => [p.id, p])), bm: new Map(s.b.map((b) => [b[0], b])), sm: new Map(s.sh.map((x) => [x[0], x])),
    zm: new Map(s.z.map((zombie) => [zombie.id, zombie])),
  });
  if (frames.length > 8) frames.shift();
  updateHud(s.me, s.survival);
  if(playing)updatePowerHud(s);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAng = (a: number, b: number, t: number) => a + ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * t;

function sample(now: number): View | null {
  if (!frames.length) return null;
  const rt = Math.max(lastRenderTickTime, Math.min(now - clockOffset - INTERP_MS, frames[frames.length - 1].recv));
  lastRenderTickTime = rt;
  let a = frames[0], b = frames[frames.length - 1];
  if (rt >= a.recv && rt < b.recv) {
    for (let i = 0; i < frames.length - 1; i++) if (frames[i].recv <= rt && rt < frames[i + 1].recv) { a = frames[i]; b = frames[i + 1]; break; }
  } else if (rt >= b.recv) a = b; else b = a;
  const t = a === b ? 1 : Math.min(1, Math.max(0, (rt - a.recv) / (b.recv - a.recv)));
  return {
    survival: b.snap.survival, royale:b.snap.royale, crates:b.snap.crates, explosiveIds:b.snap.explosiveIds, beams:(b.snap.beams??[]).map(beam=>({...beam,age:(rt/TICK_MS-beam.tick)/SERVER_TICK_HZ})), renderTick:rt/TICK_MS,
    pickups:(b.snap.me.pickups??[]).map(e=>({...e,age:(rt/TICK_MS-e.tick)/SERVER_TICK_HZ})),
    effects: (b.snap.effects ?? []).map((effect) => ({ ...effect, age: (rt / TICK_MS - effect.tick) / SERVER_TICK_HZ })),
    players: b.snap.p.map((p) => { const q = a.pm.get(p.id); return q ? { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t), a: lerpAng(q.a, p.a, t) } : p; }),
    bullets: b.snap.b.map((x) => { const q = a.bm.get(x[0]); return q ? [x[0], lerp(q[1], x[1], t), lerp(q[2], x[2], t), x[3], x[4], x[5], x[6], x[7]] as typeof x : x; }),
    shapes: b.snap.sh.map((x) => { const q = a.sm.get(x[0]); return q ? [x[0], lerp(q[1], x[1], t), lerp(q[2], x[2], t), lerpAng(q[3], x[3], t), x[4], x[5], x[6], x[7], x[8], x[9]] : x; }),
    zombies: b.snap.z.map((zombie) => { const q = a.zm.get(zombie.id); return q ? { ...zombie, x: lerp(q.x, zombie.x, t), y: lerp(q.y, zombie.y, t), angle: lerpAng(q.angle, zombie.angle, t) } : zombie; }),
    downed: b.snap.d,
    healthDrops: b.snap.h,
    xpDrops: b.snap.xpDrops,
    pools: b.snap.pools,
    mode: b.snap.mode,
  };
}

// Populate the optional full-roster guide once; evolution cards reuse the same profiles.
const classGuide = $('classguide');
function renderClassGuide(){classGuide.replaceChildren();
for (const id of CLASS_IDS) {
  const cls = CLASS_BY_ID[id];
  const profile = classProfile(id);
  const article = document.createElement('article');
  article.className = 'guide-class';
  const heading = document.createElement('div');
  heading.className = 'guide-heading';
  const name = document.createElement('strong');
  name.textContent = tr(cls.name);
  const role = document.createElement('span');
  role.textContent = profile.role;
  heading.append(name, role);
  const description = document.createElement('p');
  description.textContent = tr(cls.description);
  const strength = document.createElement('p');
  strength.className = 'guide-strength';
  strength.textContent = tr('+ Best at: ','+ نقطه قوت: ') + profile.strength;
  const bonus = document.createElement('p');
  bonus.className = 'guide-bonus';
  bonus.textContent = tr('CLASS BONUS: ','امتیاز کلاس: ') + profile.bonuses;
  const tradeoff = document.createElement('p');
  tradeoff.className = 'guide-tradeoff';
  tradeoff.textContent = tr('− Trade-off: ','− محدودیت: ') + profile.tradeoff;
  article.append(heading, description, bonus, strength, tradeoff);
  classGuide.append(article);
}}
renderClassGuide();

// ---------- HUD ----------
const classesEl = $('classes');
const leaderboardEl = $('lb');
const leaderboardToggle = $<HTMLButtonElement>('lbtitle');
const xpEl = $('xp'), toastEl = $('toast');
const rewardPanel = $('reward-panel'), rewardCardsEl = $('reward-cards'), rewardTimerEl = $('reward-timer');
const devTools = $('devtools');

const evolveToggle = $<HTMLButtonElement>('evolve-toggle');
function closeEvolution() {
  document.body.classList.remove('evolution-open');
  evolveToggle.setAttribute('aria-expanded', 'false');
}
evolveToggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('evolution-open');
  evolveToggle.setAttribute('aria-expanded', String(open));
});
function isCompactHud(): boolean {
  return window.matchMedia('(pointer: coarse), (max-width: 760px)').matches;
}
if (!isCompactHud()) {
  leaderboardEl.classList.remove('mobile-collapsed');
  leaderboardToggle.setAttribute('aria-expanded', 'true');
}
leaderboardToggle.addEventListener('click', () => {
  if (!isCompactHud()) return;
  const collapsed = leaderboardEl.classList.toggle('mobile-collapsed');
  leaderboardToggle.setAttribute('aria-expanded', String(!collapsed));
});
const devToggle = $<HTMLButtonElement>('devtoggle');
const devClassSelect = $<HTMLSelectElement>('devclass');
const devApply = $<HTMLButtonElement>('devapply');
for (const id of CLASS_IDS) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = tr(CLASS_BY_ID[id]?.name ?? id);
  devClassSelect.append(option);
}
function setDevPanel(open:boolean){devTools.classList.toggle('open',open);devToggle.setAttribute('aria-expanded',String(open));}
devToggle.addEventListener('click', () => setDevPanel(!devTools.classList.contains('open')));
devApply.addEventListener('click', () => {
  if (playing && devCheatsEnabled) send({ t: 'devClass', id: devClassSelect.value });
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && playing && devCheatsEnabled && shopPanel.hidden && audioPanel.hidden && survivalGameOverEl.hidden && !e.repeat && (e.target as HTMLElement | null)?.tagName !== 'INPUT') {
    e.preventDefault();
    const open=gameMenuPanel.hidden||!devTools.classList.contains('open');
    if(gameMenuPanel.hidden)openGameMenu();setDevPanel(open);if(open)devToggle.focus();
  }
});

/** Restart a CSS animation class on an element. */
function retrigger(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(cls);
}

let toastTimer = 0;
function showToast(big: string, sub: string) {
  $('toastbig').textContent = tr(big);
  $('toastsub').textContent = tr(sub);
  retrigger(toastEl, 'go');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('go'), 2100);
}

let hudKey = '', optKey = '', rewardKey = '';
let lastLv = 0, lastHudClass = '';
let wasDowned = false;
let streakSerial=-1, shopKey='';
const shopPanel=$('shop-panel'),shopToggle=$('shop-toggle');
const shopIcons:Record<string,{color:string;path:string}>={
  heal:{color:'#8fe1a3',path:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'},
  rapidLoader:{color:'#7ecdf3',path:'M13 2 4 14h7l-1 8 10-12h-7z'},
  heavyRounds:{color:'#f5c76b',path:'M7 20V8l5-6 5 6v12zM7 16h10M10 20v2m4-2v2'},
  cryoRounds:{color:'#9ce7ff',path:'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 4 4-4M8 20l4-4 4 4M3 11l5-1-1-5M21 13l-5 1 1 5M3 13l5 1-1 5M21 11l-5-1 1-5'},
  chainShot:{color:'#9bbcff',path:'M10 13 7 16a3 3 0 0 0 4 4l5-5a3 3 0 0 0 0-4M14 11l3-3a3 3 0 0 0-4-4L8 9a3 3 0 0 0 0 4M9 15l6-6'},
  hotRounds:{color:'#ff9a65',path:'M12 2c1 5 5 6 5 10 2-1 3-3 3-3 4 8-1 13-8 13S2 17 5 11c1 2 2 2 3 3-1-5 2-7 4-12zM12 15c-4 3-2 7 0 7s4-4 0-7'},
  blastRounds:{color:'#ffd17e',path:'m12 2 2.5 6.5 6-3-3 6 4.5 3-6.5 1.5 1 6-5-4-5 4 1-6L2 14.5l4.5-3-3-6 6 3z'},
  lifesteal:{color:'#ff9ea9',path:'M12 21 4 13C-1 7 7 1 12 7c5-6 13 0 8 6zM7 12h3l2-3 2 6 2-3h2'},
  criticalCore:{color:'#c6a8ff',path:'M12 2 22 12 12 22 2 12zM12 7v10M7 12h10'},
  droneWingman:{color:'#8be2d5',path:'M12 3 22 20l-10-4-10 4zM12 9v7'},
  combo:{color:'#a7efd1',path:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'},
};
function shopIcon(id:string):SVGSVGElement{
  const spec=shopIcons[id]??shopIcons.combo;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',spec.path);svg.append(p);return svg;
}
function coinIcon():SVGSVGElement{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx','12');c.setAttribute('cy','12');c.setAttribute('r','9');c.setAttribute('fill','#e8bc53');c.setAttribute('stroke','#a77a28');c.setAttribute('stroke-width','2');svg.append(c);
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M12 7v10M8 10h6a2 2 0 0 1 0 4H8');p.setAttribute('fill','none');p.setAttribute('stroke','#77551f');p.setAttribute('stroke-width','1.7');p.setAttribute('stroke-linecap','round');svg.append(p);return svg;
}
const gameMenuPanel=$('game-menu-panel'),hamburger=$('hamburger-toggle');
function closeShop(restoreFocus=false){shopPanel.hidden=true;shopToggle.setAttribute('aria-expanded','false');if(restoreFocus&&playing)canvas.focus({preventScroll:true});}
shopToggle.addEventListener('click',()=>{if(!shopPanel.hidden){closeShop(true);return;}if(!playing||shopToggle.hidden)return;closeGameMenu();input.reset();shopPanel.hidden=false;shopToggle.setAttribute('aria-expanded','true');$('shop-close').focus();});
$('shop-close').addEventListener('click',()=>closeShop(true));
$('dev-shop').addEventListener('click',()=>{if(playing&&!shopToggle.hidden&&devCheatsEnabled&&shopPanel.hidden)shopToggle.click();});
shopPanel.addEventListener('click',event=>{if(event.target===shopPanel)closeShop(true);});
window.addEventListener('keydown',event=>{if(shopPanel.hidden)return;if(event.key==='Escape'){event.preventDefault();closeShop(true);}else if(event.key==='Tab'){const buttons=Array.from(shopPanel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));if(!buttons.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
function closeGameMenu(restoreFocus=false){
  gameMenuPanel.hidden=true;hamburger.setAttribute('aria-expanded','false');setDevPanel(false);
  if(restoreFocus&&playing)canvas.focus({preventScroll:true});
}
function updateGameMenu(){
  const modeNames:Record<GameMode,string>={ffa:'Free for All',teams:'Team Mode',survival:'Co-op Survival',royale:'Battle Royale'};
  $('game-menu-mode').textContent=tr(modeNames[selectedMode]);
  const shop=$<HTMLButtonElement>('game-menu-shop');shop.hidden=selectedMode!=='survival';shop.disabled=shopToggle.hidden;
  $('game-menu-shop-status').textContent=shopToggle.hidden?tr('Opens between waves'):(lastShopState?.devShop?tr('Free test upgrades'):tr('Available · ','در دسترس · ')+$('shop-toggle-balance').textContent);
  const full=$('game-menu-fullscreen-label');full.textContent=tr(document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');
  const visible=!document.body.classList.contains('hide-leaderboard');
  $('game-menu-leaderboard').setAttribute('aria-pressed',String(visible));$('game-menu-lb-label').textContent=tr(visible?'Hide leaderboard':'Show leaderboard');
}
function openGameMenu(){
  if(!playing||!shopPanel.hidden||!audioPanel.hidden||!survivalGameOverEl.hidden)return;
  input.reset();closeEvolution();updateGameMenu();$('game-menu-message').textContent='';
  gameMenuPanel.hidden=false;hamburger.setAttribute('aria-expanded','true');$('game-menu-resume').focus();
}
hamburger.addEventListener('click',()=>{if(gameMenuPanel.hidden)openGameMenu();else closeGameMenu(true);});
for(const id of ['game-menu-close','game-menu-resume'])$(id).addEventListener('click',()=>closeGameMenu(true));
gameMenuPanel.addEventListener('click',e=>{if(e.target===gameMenuPanel)closeGameMenu(true);});
$('game-menu-shop').addEventListener('click',()=>{if(!shopToggle.hidden)shopToggle.click();});
$('game-menu-fullscreen').addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else {await document.documentElement.requestFullscreen({navigationUI:'hide'});}
    $('game-menu-message').textContent='';
  }catch{$('game-menu-message').textContent=tr("Fullscreen is unavailable in this browser.");}
  updateGameMenu();
});
document.addEventListener('fullscreenchange',()=>{if(!gameMenuPanel.hidden)updateGameMenu();});
$('game-menu-leaderboard').addEventListener('click',()=>{document.body.classList.toggle('hide-leaderboard');updateGameMenu();});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&playing&&shopPanel.hidden&&audioPanel.hidden&&survivalGameOverEl.hidden&&!e.repeat){
    e.preventDefault();if(gameMenuPanel.hidden)openGameMenu();else closeGameMenu(true);return;
  }
  if(gameMenuPanel.hidden||e.key!=='Tab')return;
  const items=Array.from(gameMenuPanel.querySelectorAll<HTMLElement>('button:not(:disabled),select,summary')).filter(el=>el.getClientRects().length>0);
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
const shopCategories=[['All','combo'],['Chain','chainShot'],['Fork','droneWingman'],['Explosion','blastRounds'],['Elemental','hotRounds'],['Weapons','heavyRounds'],['Defense','heal'],['Mobility','rapidLoader'],['Support','droneWingman']] as const;
let shopCategory='All',lastShopState:SelfSnap|undefined,lastShopSurvival:Snapshot['survival']|undefined;
const shopTabs=$('shop-tabs');
for(const [name,iconId] of shopCategories){
  const btn=document.createElement('button');btn.type='button';btn.dataset.category=name;btn.setAttribute('aria-pressed',String(name==='All'));btn.append(shopIcon(iconId),document.createTextNode(tr(name)));
  btn.addEventListener('click',()=>{shopCategory=name;shopKey='';$('shop-items').scrollTop=0;if(lastShopState)updateShop(lastShopState,lastShopSurvival);});shopTabs.append(btn);
}
function updateShop(m:SelfSnap,survival?:Snapshot['survival']){
  lastShopState=m;lastShopSurvival=survival;
  const offers=m.shop??[],coins=m.coins??0,developer=m.devShop===true;
  shopToggle.hidden=!offers.length;$('shop-toggle-balance').textContent=developer?tr('DEV'):String(coins)+'¢';
  $('dev-shop').hidden=!developer||!offers.length;
  if(!gameMenuPanel.hidden)updateGameMenu();
  if(!offers.length){closeShop();shopKey='';return;}
  const remaining=Math.max(0,Math.ceil(survival?.intermission??0));
  const clock=$('shop-clock');clock.textContent=developer?tr('DEV · Always open'):tr('Next wave · ','موج بعدی · ')+seconds(remaining);clock.classList.toggle('urgent',!developer&&remaining<=3);
  $('shop-subtitle').textContent=developer?tr('Test any perk and combination for free'):survival?tr('Wave '+survival.wave+' cleared · Upgrade your tank','موج '+survival.wave+' پایان یافت · تانک خود را ارتقا دهید'):tr('Between-wave upgrades');
  const key=JSON.stringify([offers,coins,m.combos,developer,shopCategory]);if(key===shopKey)return;shopKey=key;
  $('shop-coins').textContent=developer?tr('Free test upgrades'):tr(coins+' coins');
  const comboList=$('shop-combo-list');comboList.replaceChildren();$('shop-combo-empty').hidden=!!m.combos?.length;
  for(const name of m.combos??[]){const chip=document.createElement('span');chip.className='shop-combo-chip';chip.append(shopIcon('combo'),document.createTextNode(tr(name)));comboList.append(chip);}
  const list=$('shop-items'),scroll=list.scrollTop,focused=(document.activeElement as HTMLElement|null)?.dataset.shopId;
  list.replaceChildren();
  for(const tab of Array.from(shopTabs.querySelectorAll('button')))tab.setAttribute('aria-pressed',String(tab.dataset.category===shopCategory));
  for(const offer of offers.filter(o=>shopCategory==='All'||o.category===shopCategory)){
    const btn=document.createElement('button');btn.type='button';btn.className='shop-item';btn.dataset.shopId=offer.id;const family=shopCategories.find(c=>c[0]===offer.category)?.[1]??'combo';const iconId=shopIcons[offer.id]?offer.id:family;btn.style.setProperty('--item-accent',(shopIcons[iconId]??shopIcons.combo).color);
    const affordable=coins>=offer.cost&&!offer.locked;btn.disabled=!affordable;btn.setAttribute('aria-label',offer.title+', '+offer.description+', '+offer.cost+' coins'+(affordable?'':', not enough coins'));
    const icon=document.createElement('span');icon.className='shop-icon';icon.append(shopIcon(iconId));
    const info=document.createElement('span');info.className='shop-info';const title=document.createElement('strong');title.textContent=tr(offer.title);const desc=document.createElement('small');desc.textContent=tr(offer.description);info.append(title,desc);
    if(offer.max){const rank=document.createElement('span');rank.className='shop-rank';rank.append(document.createTextNode((offer.rank??0)+'/'+offer.max));for(let i=0;i<offer.max;i++){const pip=document.createElement('span');pip.className='shop-pip'+(i<(offer.rank??0)?' active':'');rank.append(pip);}info.append(rank);}
    btn.append(icon,info);
    if(offer.value){const stat=document.createElement('span');stat.className='shop-stat';stat.append(document.createTextNode(tr(offer.value)));if(offer.nextValue&&offer.nextValue!==offer.value){const next=document.createElement('b');next.textContent=(language==='fa'?'← ':'→ ')+tr(offer.nextValue);stat.append(next);}btn.append(stat);}
    if(offer.locked&&offer.locked!=='MAX LEVEL'){const lock=document.createElement('span');lock.className='shop-lock';lock.textContent=tr(offer.locked);btn.append(lock);}
    const bottom=document.createElement('span');bottom.className='shop-buy-row';const price=document.createElement('span');price.className='shop-price';price.append(coinIcon(),document.createTextNode(developer?tr('FREE'):String(offer.cost)));
    const action=document.createElement('span');action.className='shop-buy-label';action.textContent=tr(offer.locked?(offer.locked==='MAX LEVEL'?'MAX':'LOCKED'):developer?'ADD':affordable?'BUY':'NEED '+(offer.cost-coins));
    bottom.append(price,action);btn.append(bottom);
    btn.addEventListener('click',()=>{if(playing&&!shopPanel.hidden)send({t:'shop',id:offer.id});});list.append(btn);
  }
  list.scrollTop=scroll;
  if(focused&&!shopPanel.hidden){const next=Array.from(list.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.dataset.shopId===focused&&!b.disabled);(next??$('shop-close')).focus({preventScroll:true});}
}
function updateSurvivalRewards(m: SelfSnap) {
  rewardPanel.hidden = m.rewards.length === 0;
  rewardTimerEl.textContent = m.rewards.length ? seconds(Math.ceil(m.rewardTimer)) : '';
  const key = m.rewards.map((card) => `${card.id}:${card.title}:${card.description}:${card.rarity}`).join('|');
  if (key === rewardKey) return;
  rewardKey = key;
  rewardCardsEl.replaceChildren();
  for (const card of m.rewards) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `reward-card rarity-${card.rarity}`;
    const rarity = document.createElement('span'); rarity.className = 'reward-rarity'; rarity.textContent = tr(card.rarity.toUpperCase());
    const title = document.createElement('strong'); title.textContent = tr(card.title);
    const description = document.createElement('small'); description.textContent = tr(card.description);
    button.append(rarity, title, description);
    button.addEventListener('click', () => { if (playing) send({ t: 'reward', id: card.id }); });
    rewardCardsEl.append(button);
  }
}

const powerStatus=$('power-status'),pickupNotice=$('pickup-notice');
let powerKey='',pickupTimer=0,lastPowerTick=-1;
const seenPickups=new Set<number>();
function resetPowerHud(){
  powerKey='';lastPowerTick=-1;seenPickups.clear();powerStatus.replaceChildren();powerStatus.hidden=true;pickupNotice.hidden=true;window.clearTimeout(pickupTimer);
}
function updatePowerHud(s:Snapshot){
  if(s.tick<lastPowerTick)resetPowerHud();
  lastPowerTick=s.tick;
  const active=POWERUPS.filter(k=>k!=='heal'&&(s.me.powerups?.[k]??0)>0);
  const key=active.map(k=>k+':'+s.me.powerups?.[k]).join('|');
  if(key!==powerKey){
    powerKey=key;powerStatus.replaceChildren();powerStatus.hidden=active.length===0;
    for(const kind of active){
      const m=POWER_META[kind],seconds=s.me.powerups?.[kind]??0;
      const card=document.createElement('div');card.className='power-chip';card.style.setProperty('--power-color',m.fill);
      const icon=document.createElement('span');icon.className='power-chip-icon';icon.append(powerIcon(kind));
      const body=document.createElement('span');body.className='power-chip-body';
      const top=document.createElement('span');top.className='power-chip-top';
      const title=document.createElement('strong');title.textContent=tr(m.name);
      const timer=document.createElement('b');timer.textContent=tr(seconds+'s');top.append(title,timer);
      const detail=document.createElement('small');detail.textContent=tr(m.detail);
      const track=document.createElement('span');track.className='power-track';const fill=document.createElement('span');fill.style.width=Math.max(0,Math.min(100,seconds/12*100))+'%';track.append(fill);
      body.append(top,detail,track);card.append(icon,body);powerStatus.append(card);
    }
  }
  const events=(s.me.pickups??[]).filter(e=>!seenPickups.has(e.id)&&s.tick-e.tick<=SERVER_TICK_HZ*2);
  // Keep only currently advertised event IDs, so a long run cannot accumulate a large set.
  const live=new Set((s.me.pickups??[]).map(e=>e.id));for(const id of seenPickups)if(!live.has(id))seenPickups.delete(id);
  if(!events.length)return;
  for(const e of events)seenPickups.add(e.id);
  pickupNotice.replaceChildren();
  for(const e of events){
    const m=POWER_META[e.kind],row=document.createElement('div');row.className='pickup-row';row.style.setProperty('--power-color',m.fill);
    const icon=document.createElement('span');icon.className='power-chip-icon';icon.append(powerIcon(e.kind));
    const text=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');
    title.textContent=tr(m.name+' collected',tr(m.name)+' دریافت شد');
    detail.textContent=e.kind==='heal'?(e.healed?tr('+'+e.healed+' HP restored',e.healed+' واحد سلامت بازیابی شد'):tr('Health already full')):tr(m.detail)+' · '+seconds(12);
    text.append(title,detail);row.append(icon,text);pickupNotice.append(row);
  }
  pickupNotice.hidden=false;window.clearTimeout(pickupTimer);pickupTimer=window.setTimeout(()=>{pickupNotice.hidden=true;},2400);
  audio.cue('reward');
}
function updateHud(m: SelfSnap, survival?:Snapshot['survival']) {
  updateSurvivalRewards(m);
  const serial=m.streakSerial??0;
  if(streakSerial>=0&&serial!==streakSerial&&(m.streak??0)>=2){showToast((m.streak===2?'DOUBLE KILL':m.streak===3?'TRIPLE KILL':m.streak===4?'QUAD KILL':'RAMPAGE ×'+m.streak),'Kill streak');audio.cue('level');}streakSerial=serial;

  updateShop(m,survival);
  const fraction = Math.max(0, Math.min(1, m.hp / Math.max(1, m.mhp)));
  $('mobile-hpfill').style.width = (fraction * 100) + '%';
  $('mobile-hptxt').textContent = m.downed ? tr('DOWNED · REVIVE') : tr('HP') + ' ' + Math.ceil(Math.max(0,m.hp)) + ' / ' + Math.ceil(m.mhp);
  $('mobile-vitals').classList.toggle('low', fraction < 0.3);
  // Only sync the selector when the server-confirmed class actually changes.
  // Do not overwrite the user's pending dropdown choice on every snapshot.
  if (devCheatsEnabled && m.cls !== lastDevClass) {
    lastDevClass = m.cls;
    devClassSelect.value = m.cls;
  }
  const span = Math.max(1, m.xpNext - m.xpCur);
  $('xpfill').style.width = `${m.xpNext === m.xpCur ? 100 : Math.min(100, ((m.xp - m.xpCur) / span) * 100)}%`;

  // Level-up celebration (only while alive and after the first snapshot of a life).
  if (m.downed && !wasDowned) showToast('DOWNED', 'Stay close to an ally — you can be revived any time');
  wasDowned = m.downed;
  if (!m.alive && !m.downed) { lastLv = 0; lastHudClass = ''; }
  else {
    if (lastLv > 0 && m.lv > lastLv) {
      retrigger(xpEl, 'lvl');
      showToast(`LEVEL ${m.lv}`, 'All stats increased automatically');
    }
    if (lastHudClass && m.cls !== lastHudClass) {
      const profile = classProfile(m.cls);
      showToast((CLASS_BY_ID[m.cls]?.name ?? 'NEW TANK').toUpperCase(), tr(profile.role+' bonus: '+profile.bonuses,'امتیاز '+profile.role+': '+profile.bonuses));
    }
    lastLv = m.lv;
    lastHudClass = m.cls;
  }

  const key = `${m.lv}|${m.xp}|${m.cls}|${m.downed}`;
  if (key !== hudKey) {
    hudKey = key;
    $('xptxt').textContent = m.downed ? tr('DOWNED · stay close to an ally to be revived') : tr('Lv '+m.lv,'سطح '+m.lv)+' · '+tr(CLASS_BY_ID[m.cls]?.name??'')+' — '+m.xp+' '+tr('XP');
  }

  const ok = m.opts.join(',');
  document.body.classList.toggle('choosing-class', m.opts.length > 0);
  if (ok !== optKey) {
    optKey = ok;
    closeEvolution();
    classesEl.replaceChildren();
    if (m.opts.length) {
      const evo = document.createElement('div'); evo.className = 'evo'; evo.textContent = tr('EVOLVE!');
      classesEl.append(evo);
      if (lastLv > 0) showToast('EVOLUTION READY', 'Choose a new tank class');
    }
    m.opts.forEach((id, n) => {
      const cls = CLASS_BY_ID[id];
      const profile = classProfile(id);
      const b = document.createElement('button'); b.className = 'evo-card';
      b.title = tr(cls?.description ?? id) + tr(' Best at: ',' نقطه قوت: ') + profile.strength + tr('. Trade-off: ','؛ محدودیت: ') + profile.tradeoff + '.';
      const preview = document.createElement('img');
      preview.className = 'evo-preview'; preview.alt = tr(cls?.name ?? id);
      preview.src = tankPreviewDataUrl(id);
      const name = document.createElement('span'); name.className = 'evo-name'; name.textContent = tr(cls?.name ?? id);
      const role = document.createElement('span'); role.className = 'evo-role'; role.textContent = profile.role;
      const strength = document.createElement('span'); strength.className = 'evo-strength'; strength.textContent = '+ ' + profile.strength;
      const bonus = document.createElement('span'); bonus.className = 'evo-bonus'; bonus.textContent = profile.bonuses;
      const tradeoff = document.createElement('span'); tradeoff.className = 'evo-tradeoff'; tradeoff.textContent = '− ' + profile.tradeoff;
      b.append(preview, name, role, bonus, strength, tradeoff);
      b.style.animationDelay = `${n * 0.08}s, ${0.5 + n * 0.08}s`;
      b.type = 'button';
      b.addEventListener('click', () => {
        if (playing) send({ t: 'class', id });
      });
      classesEl.append(b);
    });
  }
}

// ---------- Leaderboard (persistent rows that slide when ranks change) ----------
interface LbRow { el: HTMLElement; bar: HTMLElement; rk: HTMLElement; nm: HTMLElement; lv: HTMLElement; sc: HTMLElement }
const lbRows = new Map<number, LbRow>();
const LB_ROW_H = 26;
const fmtScore = (n: number) => (n >= 100000 ? `${(n / 1000).toFixed(0)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const survivalGameOverEl = $('survival-gameover');
const survivalRestartBtn = $<HTMLButtonElement>('survival-restart');
survivalRestartBtn.addEventListener('click', () => {
  if (!playing || survivalRestartBtn.disabled) return;
  survivalRestartBtn.disabled = true;
  survivalRestartBtn.textContent = tr("RESTARTING…");
  send({ t: 'restart' });
});

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

let lastLeaderboard:Extract<ServerMessage,{t:'lb'}>|undefined;
function renderLeaderboard(message: Extract<ServerMessage, { t: 'lb' }>) {
  lastLeaderboard=message;
  const title = $('lbtitle');
  if (message.mode !== 'survival') survivalGameOverEl.hidden = true;
  const teamScore = $('teamscore');
  const box = $('lbrows');

  if (message.mode === 'survival') {
    if (message.gameOver) {
      if (survivalGameOverEl.hidden) {
        survivalRestartBtn.disabled = false;
        survivalRestartBtn.textContent = tr("RESTART RUN FOR EVERYONE");
      }
      survivalGameOverEl.hidden = false;
      $('survival-over-wave').textContent = String(message.wave);
      $('survival-over-kills').textContent = String(message.zombieKills);
      $('survival-over-time').textContent = `${Math.floor(message.elapsed / 60)}:${String(message.elapsed % 60).padStart(2, '0')}`;
      const finalRoster = $('survival-over-roster');
      finalRoster.replaceChildren();
      for (const player of message.top) {
        const row = document.createElement('div');
        row.className = 'survival-final-row';
        const name = document.createElement('span');
        name.textContent = `${player.name}${player.downed ? ' · '+tr('DOWNED') : player.alive ? '' : ' · '+tr('OUT')}`;
        const stat = document.createElement('b');
        stat.textContent = tr(player.kills+' kills')+' · '+tr('Lv '+player.lv,'سطح '+player.lv);
        row.append(name, stat);
        finalRoster.append(row);
      }
    } else {
      survivalGameOverEl.hidden = true;
    }
    title.textContent = tr(message.gameOver ? 'HORDE OVER · GAME OVER' : 'CO-OP SURVIVAL');
    box.hidden = true;
    for (const row of lbRows.values()) row.el.remove();
    lbRows.clear();
    teamScore.hidden = false;
    teamScore.className = 'survival-score';
    teamScore.replaceChildren();

    const summary = document.createElement('div');
    summary.className = 'survival-summary';
    const wave = document.createElement('strong');
    wave.textContent = tr('WAVE')+' ' + message.wave + (message.theme && message.theme !== 'standard' ? ' · ' + tr(message.theme.toUpperCase()) : '');
    const kills = document.createElement('span');
    kills.textContent = message.zombieKills + ' '+tr('ZOMBIES KILLED');
    const remaining = document.createElement('span');
    remaining.textContent = message.gameOver
      ? tr('SURVIVED')+' ' + Math.floor(message.elapsed / 60) + ':' + String(message.elapsed % 60).padStart(2, '0')
      : message.nextWaveIn > 0
        ? tr('NEXT WAVE IN ','موج بعدی تا ')+seconds(message.nextWaveIn)
        : tr(message.zombiesRemaining+' ZOMBIES REMAINING',message.zombiesRemaining+' زامبی باقی‌مانده');
    summary.append(wave, kills, remaining);
    teamScore.append(summary);

    const roster = document.createElement('div');
    roster.className = 'survival-roster';
    if (!message.top.length) {
      const empty = document.createElement('div');
      empty.className = 'team-player-empty';
      empty.textContent = tr("Waiting for survivors");
      roster.append(empty);
    }
    for (const player of message.top) {
      const row = document.createElement('div');
      row.className = 'survival-player-row' + (player.id === selfId ? ' me' : '') +
        (player.downed ? ' downed' : !player.alive ? ' out' : '');
      const name = document.createElement('span');
      name.textContent = player.name + (player.alive ? '' : ' · OUT');
      const stat = document.createElement('b');
      stat.textContent = player.downed ? tr('DOWNED · REVIVE') : player.alive ? tr(player.kills+' kills') : tr('OUT');
      row.append(name, stat);
      roster.append(row);
    }
    teamScore.append(roster);
    return;
  }

  if (message.mode === 'teams') {
    title.textContent = tr("TEAM LEADERBOARD");
    box.hidden = true;
    for (const row of lbRows.values()) row.el.remove();
    lbRows.clear();
    teamScore.hidden = false;
    teamScore.className = 'team-score-grid';
    teamScore.replaceChildren();

    const buildTeamPanel = (
      team: 'blue' | 'red',
      totalKills: number,
      players: { id: number; name: string; kills: number; lv: number }[],
    ) => {
      const panel = document.createElement('section');
      panel.className = 'team-panel ' + team;
      const heading = document.createElement('div');
      heading.className = 'team-panel-heading';
      const name = document.createElement('strong');
      name.textContent = tr(team.toUpperCase());
      const score = document.createElement('span');
      score.textContent = tr(totalKills+' kills');
      heading.append(name, score);
      const list = document.createElement('div');
      list.className = 'team-player-list';
      if (!players.length) {
        const empty = document.createElement('div');
        empty.className = 'team-player-empty';
        empty.textContent = tr("Waiting for players");
        list.append(empty);
      }
      for (const player of players) {
        const line = document.createElement('div');
        line.className = 'team-player-row' + (player.id === selfId ? ' me' : '');
        const playerName = document.createElement('span');
        playerName.className = 'team-player-name';
        playerName.textContent = player.name;
        const kills = document.createElement('b');
        kills.textContent = String(player.kills);
        line.append(playerName, kills);
        list.append(line);
      }
      panel.append(heading, list);
      teamScore.append(panel);
    };

    buildTeamPanel('blue', message.blueKills, message.blue);
    buildTeamPanel('red', message.redKills, message.red);
    return;
  }

  title.textContent = tr("LEADERBOARD");
  teamScore.hidden = true;
  teamScore.replaceChildren();
  box.hidden = false;
  const top = message.top;
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
    r.el.className = `lrow${i < 3 ? ` r${i + 1}` : ''}${e.id === selfId ? ' me' : ''}`;
    r.bar.style.width = `${Math.max(4, (e.score / max) * 100)}%`;
    r.rk.textContent = String(i + 1);
    r.nm.textContent = e.name;
    r.lv.textContent = e.lv != null ? tr('Lv'+e.lv,'سطح '+e.lv) : '';
    r.sc.textContent = fmtScore(e.score);
  });
  for (const [id, r] of lbRows) if (!seen.has(id)) { r.el.remove(); lbRows.delete(id); }
}

// ---------- main loop ----------
let W = 0, H = 0, dpr = 1;
function resize() {
  W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, isCompactHud() ? 1.75 : 2);
  if (window.matchMedia('(pointer: coarse)').matches) input.touchSeen = true;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  minimapCanvas.width = Math.round(MINIMAP_SIZE * dpr);
  minimapCanvas.height = Math.round(MINIMAP_SIZE * dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
window.visualViewport?.addEventListener('resize', resize);
resize();

const cam = { x: 1600, y: 1600 };
let lastSent = '', lastSendT = 0, lastInputPoll = -Infinity;

function frame(now: number) {
  requestAnimationFrame(frame);
  if(!playing&&!shopPanel.hidden)closeShop();
  if((!playing||!survivalGameOverEl.hidden)&&!gameMenuPanel.hidden)closeGameMenu();
  if(!shopPanel.hidden||!gameMenuPanel.hidden||!audioPanel.hidden)input.reset();
  input.update(W, H);
  document.body.classList.toggle('in-game', playing);
  // Sample/send intent at 60 Hz so the server gets the freshest input before each simulation step.
  if (!playing) { lastSent = ''; lastInputPoll = -Infinity; if(!powerStatus.hidden||!pickupNotice.hidden||powerKey)resetPowerHud(); }
  if (playing && now - lastInputPoll >= 1000 / 60 - 1) {
    lastInputPoll = now;
    const msg = `{"t":"input","mx":${input.mx.toFixed(2)},"my":${input.my.toFixed(2)},"a":${input.angle.toFixed(4)},"f":${input.fire ? 1 : 0},"secondary":${input.secondary ? 1 : 0},"spin":${input.spin ? 1 : 0}}`;
    if (msg !== lastSent || now - lastSendT > 500) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
      lastSent = msg; lastSendT = now;
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const view = sample(now) ?? { players: [], bullets: [], shapes: [], zombies: [], downed: [], healthDrops: [], xpDrops: [], pools: [], mode: 'ffa' as GameMode };
  audio.update(!playing || !$('survival-gameover').hidden ? 'menu' : view.mode !== 'survival' ? 'arena' : view.zombies.some(z => z.bossKind && z.hp > 0) ? 'boss' : 'survival');
  minimapCanvas.hidden = !playing || view.mode !== 'survival';
  minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!minimapCanvas.hidden) drawMinimap(minimapCtx, MINIMAP_SIZE, MINIMAP_SIZE, view, selfId);
  const self = view.players.find((p) => p.id === selfId);
  const downedSelf = view.downed.find((p) => p.id === selfId);
  const cameraTarget = self ?? downedSelf;
  if (cameraTarget) {
    const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000);
    cam.x = cameraTarget.x + recoilCameraX / scale;
    cam.y = cameraTarget.y + recoilCameraY / scale;
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
for(const select of Array.from(document.querySelectorAll<HTMLSelectElement>('[data-preference]')))select.addEventListener('change',()=>{
  const key=select.dataset.preference==='language'?'language':'theme';setPreference(key,select.value);
  if(key==='language'){
    setSelectedMode(selectedMode);renderClassGuide();
    for(const o of Array.from(devClassSelect.options))o.textContent=tr(CLASS_BY_ID[o.value]?.name??o.value);
    for(const o of Array.from(skinSelect.options))o.textContent=tr(o.value[0].toUpperCase()+o.value.slice(1));
    for(const tab of Array.from(shopTabs.querySelectorAll<HTMLButtonElement>('button'))){const name=tab.dataset.category??'All';const icon=shopCategories.find(c=>c[0]===name)?.[1]??'combo';tab.replaceChildren(shopIcon(icon),document.createTextNode(tr(name)));}
    hudKey='';optKey='';rewardKey='';shopKey='';powerKey='';
    const snap=frames[frames.length-1]?.snap;if(snap){updateHud(snap.me,snap.survival);updatePowerHud(snap);}
    if(lastLeaderboard)renderLeaderboard(lastLeaderboard);
    if(!gameMenuPanel.hidden)updateGameMenu();
  }
});
requestAnimationFrame(frame);
connect();
