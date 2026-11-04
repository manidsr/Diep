from pathlib import Path

ROOT = Path.cwd()
changes: dict[Path, str] = {}

def read(rel: str) -> str:
    path = ROOT / rel
    if path not in changes:
        if not path.is_file():
            raise SystemExit(f"Missing required project file: {rel}")
        changes[path] = path.read_text(encoding="utf-8")
    return changes[path]

def replace_once(rel: str, old: str, new: str, label: str) -> None:
    path = ROOT / rel
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Cannot safely update {rel} ({label}): expected exactly 1 match, found {count}. No files have been changed.")
    changes[path] = text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Shared weapon definitions: recoil is now an explicit per-barrel multiplier.
# ---------------------------------------------------------------------------
rel = "src/shared/config.ts"
replace_once(rel,
"  spread?: number; // random half-angle in radians\n",
"  spread?: number; // random half-angle in radians\n  recoil?: number; // per-barrel recoil multiplier; 0 disables recoil\n",
"barrel recoil property")
replace_once(rel,
"const B = (angle: number, offset: number, length: number, width: number, delay = 0, spread = 0): BarrelDef => ({\n  angle, offset, length, width, delay, spread,\n});",
"const B = (angle: number, offset: number, length: number, width: number, delay = 0, spread = 0, recoil = 1): BarrelDef => ({\n  angle, offset, length, width, delay, spread, recoil,\n});",
"barrel builder")
class_replacements = [
("  { id: 'basic', name: 'Tank', parent: null, minLevel: 1, barrels: [B(0, 0, 42, 20)], reloadMul: 1, damageMul: 1, bulletSpeedMul: 1 },",
 "  { id: 'basic', name: 'Tank', parent: null, minLevel: 1, barrels: [B(0, 0, 42, 20, 0, 0, 1.0)], reloadMul: 1, damageMul: 1, bulletSpeedMul: 1 },"),
("  { id: 'twin', name: 'Twin', parent: 'basic', minLevel: 15, barrels: [B(0, -11, 40, 14, 0), B(0, 11, 40, 14, 0.5)], reloadMul: 1, damageMul: 1, bulletSpeedMul: 1 },",
 "  { id: 'twin', name: 'Twin', parent: 'basic', minLevel: 15, barrels: [B(0, -11, 40, 14, 0, 0, 0.7), B(0, 11, 40, 14, 0.5, 0, 0.7)], reloadMul: 1, damageMul: 1, bulletSpeedMul: 1 },"),
("  { id: 'sniper', name: 'Sniper', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 58, 20)], reloadMul: 1.5, damageMul: 1.25, bulletSpeedMul: 1.6 },",
 "  { id: 'sniper', name: 'Sniper', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 58, 20, 0, 0, 1.4)], reloadMul: 1.5, damageMul: 1.25, bulletSpeedMul: 1.6 },"),
("  { id: 'machine', name: 'Machine Gun', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 38, 26, 0, 0.17)], reloadMul: 0.45, damageMul: 0.6, bulletSpeedMul: 1 },",
 "  { id: 'machine', name: 'Machine Gun', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 38, 26, 0, 0.17, 0.22)], reloadMul: 0.45, damageMul: 0.6, bulletSpeedMul: 1 },"),
("  { id: 'flank', name: 'Flank Guard', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 40, 18), B(PI, 0, 40, 18)], reloadMul: 1.2, damageMul: 1, bulletSpeedMul: 1 },",
 "  { id: 'flank', name: 'Flank Guard', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 40, 18, 0, 0, 0.8), B(PI, 0, 40, 18, 0, 0, 0.8)], reloadMul: 1.2, damageMul: 1, bulletSpeedMul: 1 },"),
("  { id: 'triple', name: 'Triple Shot', parent: 'twin', minLevel: 30, barrels: [B(-PI / 6, 0, 38, 16), B(PI / 6, 0, 38, 16), B(0, 0, 44, 16)], reloadMul: 1.1, damageMul: 1, bulletSpeedMul: 1 },",
 "  { id: 'triple', name: 'Triple Shot', parent: 'twin', minLevel: 30, barrels: [B(-PI / 6, 0, 38, 16, 0, 0, 0.65), B(PI / 6, 0, 38, 16, 0, 0, 0.65), B(0, 0, 44, 16, 0, 0, 0.65)], reloadMul: 1.1, damageMul: 1, bulletSpeedMul: 1 },"),
("  { id: 'assassin', name: 'Assassin', parent: 'sniper', minLevel: 30, barrels: [B(0, 0, 66, 20)], reloadMul: 1.7, damageMul: 1.5, bulletSpeedMul: 1.9 },",
 "  { id: 'assassin', name: 'Assassin', parent: 'sniper', minLevel: 30, barrels: [B(0, 0, 66, 20, 0, 0, 1.5)], reloadMul: 1.7, damageMul: 1.5, bulletSpeedMul: 1.9 },"),
("    barrels: [B(0, -15, 34, 10, 0), B(0, -5, 40, 10, 0.5), B(0, 5, 40, 10, 0.25), B(0, 15, 34, 10, 0.75)],",
 "    barrels: [B(0, -15, 34, 10, 0, 0, 0.14), B(0, -5, 40, 10, 0.5, 0, 0.14), B(0, 5, 40, 10, 0.25, 0, 0.14), B(0, 15, 34, 10, 0.75, 0, 0.14)],"),
("    barrels: [B(0, 0, 40, 18), B(PI / 2, 0, 40, 18), B(PI, 0, 40, 18), B(-PI / 2, 0, 40, 18)], reloadMul: 1.3, damageMul: 1, bulletSpeedMul: 1 },",
 "    barrels: [B(0, 0, 40, 18, 0, 0, 0.55), B(PI / 2, 0, 40, 18, 0, 0, 0.55), B(PI, 0, 40, 18, 0, 0, 0.55), B(-PI / 2, 0, 40, 18, 0, 0, 0.55)], reloadMul: 1.3, damageMul: 1, bulletSpeedMul: 1 },"),
("    barrels: [B(-0.6, 0, 36, 14, 0), B(0.6, 0, 36, 14, 0), B(-0.3, 0, 40, 14, 0.5), B(0.3, 0, 40, 14, 0.5), B(0, 0, 44, 14, 0.25)],",
 "    barrels: [B(-0.6, 0, 36, 14, 0, 0, 0.45), B(0.6, 0, 36, 14, 0, 0, 0.45), B(-0.3, 0, 40, 14, 0.5, 0, 0.45), B(0.3, 0, 40, 14, 0.5, 0, 0.45), B(0, 0, 44, 14, 0.25, 0, 0.45)],"),
("  { id: 'ranger', name: 'Ranger', parent: 'assassin', minLevel: 45, barrels: [B(0, 0, 74, 20)], reloadMul: 1.9, damageMul: 1.7, bulletSpeedMul: 2.1 },",
 "  { id: 'ranger', name: 'Ranger', parent: 'assassin', minLevel: 45, barrels: [B(0, 0, 74, 20, 0, 0, 1.8)], reloadMul: 1.9, damageMul: 1.7, bulletSpeedMul: 2.1 },"),
("    barrels: [B(0, -20, 32, 9, 0), B(0, -10, 38, 9, 0.2), B(0, 0, 44, 9, 0.4), B(0, 10, 38, 9, 0.6), B(0, 20, 32, 9, 0.8)],",
 "    barrels: [B(0, -20, 32, 9, 0, 0, 0.16), B(0, -10, 38, 9, 0.2, 0, 0.16), B(0, 0, 44, 9, 0.4, 0, 0.16), B(0, 10, 38, 9, 0.6, 0, 0.16), B(0, 20, 32, 9, 0.8, 0, 0.16)],"),
("    barrels: Array.from({ length: 8 }, (_, i) => B((i * PI) / 4, 0, 40, 16, i % 2 ? 0.5 : 0)), reloadMul: 1.5, damageMul: 1, bulletSpeedMul: 1 },",
 "    barrels: Array.from({ length: 8 }, (_, i) => B((i * PI) / 4, 0, 40, 16, i % 2 ? 0.5 : 0, 0, 0.45)), reloadMul: 1.5, damageMul: 1, bulletSpeedMul: 1 },"),
]
for old, new in class_replacements:
    replace_once(rel, old, new, f"recoil tuning for {old.split('id: ')[1].split(',')[0] if 'id: ' in old else 'class'}")

# ---------------------------------------------------------------------------
# Server simulation: stronger, slower-fading recoil; trusted dev class override.
# ---------------------------------------------------------------------------
rel = "src/server/game.ts"
replace_once(rel,
"// Recoil velocity loses 10% per server tick, matching Diep.io's smooth, lingering kick.\nconst RECOIL_DECAY_PER_TICK = 0.9;\n// A standard 20-wide barrel should move the tank about 10 world units per isolated shot.\nconst BASE_RECOIL_DISTANCE = 10;",
"// Retain 82% of recoil velocity per server tick for a punchier, longer kick.\nconst RECOIL_DECAY_PER_TICK = 0.82;\n// A standard 20-wide cannon moves the tank about one body radius per isolated shot.\nconst BASE_RECOIL_DISTANCE = 28;",
"recoil tuning constants")
replace_once(rel,
"  chooseClass(id: string | number, classId: string): boolean {\n    const p = this.players.get(id as number);\n    if (!p || !p.alive || !classOptions(p.cls, p.level).includes(classId)) return false;\n    p.cls = classId;\n    this.refresh(p);\n    return true;\n  }",
"  chooseClass(id: string | number, classId: string): boolean {\n    const p = this.players.get(id as number);\n    if (!p || !p.alive || !classOptions(p.cls, p.level).includes(classId)) return false;\n    p.cls = classId;\n    this.refresh(p);\n    return true;\n  }\n  /** Bypass evolution requirements for a developer. The WebSocket server must authorize before calling. */\n  debugSetClass(id: number, classId: string): boolean {\n    const p = this.players.get(id);\n    if (!p || !p.alive || !CLASS_IDS.includes(classId as (typeof CLASS_IDS)[number])) return false;\n    p.cls = classId;\n    this.refresh(p);\n    p.cd.fill(0);\n    return true;\n  }",
"developer class override")
replace_once(rel,
"  private fire(p: Player, barrels: { angle: number; offset: number; length: number; width: number; spread?: number }[]) {",
"  private fire(p: Player, barrels: { angle: number; offset: number; length: number; width: number; spread?: number; recoil?: number }[]) {",
"fire barrel type")
replace_once(rel,
"      const sizeRatio = b.width / 20;\n      const recoilDistance = BASE_RECOIL_DISTANCE * sizeRatio * sizeRatio;\n      const recoilImpulse = recoilDistance * SERVER_TICK_HZ * (1 - RECOIL_DECAY_PER_TICK);",
"      const sizeRatio = b.width / 20;\n      const recoilMultiplier = b.recoil ?? 1;\n      const recoilDistance = BASE_RECOIL_DISTANCE * sizeRatio * sizeRatio * recoilMultiplier;\n      const recoilImpulse = recoilDistance * SERVER_TICK_HZ * (1 - RECOIL_DECAY_PER_TICK);",
"per-barrel recoil calculation")

# ---------------------------------------------------------------------------
# Protocol: a dedicated developer-only command and an authorization hint.
# ---------------------------------------------------------------------------
rel = "src/shared/protocol.ts"
replace_once(rel,
"  | { t: 'class'; id: string };",
"  | { t: 'class'; id: string }\n  | { t: 'devClass'; id: string };",
"client message union")
replace_once(rel,
"    case 'class':\n      if (typeof o.id !== 'string' || o.id.length > 24 || !/^[a-z0-9_-]+$/.test(o.id)) return null;\n      return { t: 'class', id: o.id };",
"    case 'class':\n      if (typeof o.id !== 'string' || o.id.length > 24 || !/^[a-z0-9_-]+$/.test(o.id)) return null;\n      return { t: 'class', id: o.id };\n    case 'devClass':\n      if (typeof o.id !== 'string' || o.id.length > 24 || !/^[a-z0-9_-]+$/.test(o.id)) return null;\n      return { t: 'devClass', id: o.id };",
"dev class message parser")
replace_once(rel,
"  | { t: 'welcome'; id: number; arena: number; hz: number }",
"  | { t: 'welcome'; id: number; arena: number; hz: number; devCheats: boolean }",
"welcome message type")

# ---------------------------------------------------------------------------
# Server: opt-in via DIEP_DEV_CHEATS=1; only the first player to join is admin.
# ---------------------------------------------------------------------------
rel = "src/server/server.ts"
replace_once(rel,
"export async function startServer(opts: { port?: number; host?: string; game?: Game } = {}): Promise<RunningServer> {\n  const host = opts.host ?? '0.0.0.0';\n  const game = opts.game ?? new Game();\n  const conns = new Set<Conn>();",
"export async function startServer(opts: { port?: number; host?: string; game?: Game; devCheats?: boolean } = {}): Promise<RunningServer> {\n  const host = opts.host ?? '0.0.0.0';\n  const game = opts.game ?? new Game();\n  const conns = new Set<Conn>();\n  const devCheatsEnabled = opts.devCheats ?? (process.env.DIEP_DEV_CHEATS === '1');\n  let devCheatPlayerId: number | null = null;",
"server developer-cheat configuration")
replace_once(rel,
"            c.playerId = np.id;\n            send(ws, { t: 'welcome', id: np.id, arena: ARENA_SIZE, hz: SERVER_TICK_HZ });",
"            c.playerId = np.id;\n            // The first player to join is the local host/admin for this dev session.\n            if (devCheatsEnabled && devCheatPlayerId == null) devCheatPlayerId = np.id;\n            send(ws, { t: 'welcome', id: np.id, arena: ARENA_SIZE, hz: SERVER_TICK_HZ, devCheats: devCheatsEnabled && devCheatPlayerId === np.id });",
"grant developer tools to first player")
replace_once(rel,
"        case 'class': if (p) game.chooseClass(p.id, m.id); break;",
"        case 'class': if (p) game.chooseClass(p.id, m.id); break;\n        case 'devClass':\n          if (p && devCheatsEnabled && p.id === devCheatPlayerId) game.debugSetClass(p.id, m.id);\n          break;",
"server-side developer authorization")

# ---------------------------------------------------------------------------
# Client: show a DEV selector to the authorized host; apply visual camera kick.
# ---------------------------------------------------------------------------
rel = "src/client/main.ts"
replace_once(rel,
"import { CLASS_BY_ID, STAT_COLORS, STAT_KEYS, STAT_LABELS, MAX_STAT_LEVEL } from '../shared/config';",
"import { CLASS_BY_ID, CLASS_IDS, STAT_COLORS, STAT_KEYS, STAT_LABELS, MAX_STAT_LEVEL } from '../shared/config';",
"class IDs import")
replace_once(rel,
"let playing = false;\nconst statusEl = $('status'), msgEl = $('msg'), playBtn = $<HTMLButtonElement>('play'), menu = $('menu'), nameEl = $<HTMLInputElement>('name');",
"let playing = false;\nlet devCheatsEnabled = false;\nlet recoilCameraX = 0, recoilCameraY = 0;\nconst seenOwnBulletIds = new Set<number>();\nconst statusEl = $('status'), msgEl = $('msg'), playBtn = $<HTMLButtonElement>('play'), menu = $('menu'), nameEl = $<HTMLInputElement>('name');",
"client development and camera state")
replace_once(rel,
"    else if (m.t === 'welcome') { selfId = m.id; playing = true; menu.classList.add('hide'); }",
"    else if (m.t === 'welcome') {\n      selfId = m.id; playing = true; menu.classList.add('hide');\n      devCheatsEnabled = m.devCheats;\n      devTools.hidden = !devCheatsEnabled;\n      if (!devCheatsEnabled) devTools.classList.remove('open');\n    }",
"welcome handling")
replace_once(rel,
"function onSnapshot(s: Snapshot) {\n  frames.push({",
"function onSnapshot(s: Snapshot) {\n  // New bullets owned by us trigger a short directional camera punch. Bigger rounds hit harder.\n  for (const bullet of s.b) {\n    if (bullet[4] !== selfId || seenOwnBulletIds.has(bullet[0])) continue;\n    seenOwnBulletIds.add(bullet[0]);\n    const kick = Math.min(5.5, 1.5 + bullet[3] * 0.3);\n    recoilCameraX = Math.max(-22, Math.min(22, recoilCameraX + Math.cos(input.angle) * kick));\n    recoilCameraY = Math.max(-22, Math.min(22, recoilCameraY + Math.sin(input.angle) * kick));\n  }\n  if (seenOwnBulletIds.size > 512) {\n    seenOwnBulletIds.clear();\n    for (const bullet of s.b) if (bullet[4] === selfId) seenOwnBulletIds.add(bullet[0]);\n  }\n  frames.push({",
"local firing camera impact")
replace_once(rel,
"const xpEl = $('xp'), toastEl = $('toast');\nconst pipEls: HTMLElement[][] = [];",
"const xpEl = $('xp'), toastEl = $('toast');\nconst devTools = $('devtools');\nconst devToggle = $<HTMLButtonElement>('devtoggle');\nconst devClassSelect = $<HTMLSelectElement>('devclass');\nconst devApply = $<HTMLButtonElement>('devapply');\nfor (const id of CLASS_IDS) {\n  const option = document.createElement('option');\n  option.value = id;\n  option.textContent = CLASS_BY_ID[id]?.name ?? id;\n  devClassSelect.append(option);\n}\ndevToggle.addEventListener('click', () => devTools.classList.toggle('open'));\ndevApply.addEventListener('click', () => {\n  if (playing && devCheatsEnabled) send({ t: 'devClass', id: devClassSelect.value });\n});\nwindow.addEventListener('keydown', (e) => {\n  if (e.key === 'F2' && devCheatsEnabled && (e.target as HTMLElement | null)?.tagName !== 'INPUT') {\n    e.preventDefault();\n    devTools.classList.toggle('open');\n  }\n});\nconst pipEls: HTMLElement[][] = [];",
"developer class selector UI")
replace_once(rel,
"function updateHud(m: SelfSnap) {\n  const span = Math.max(1, m.xpNext - m.xpCur);",
"function updateHud(m: SelfSnap) {\n  if (devCheatsEnabled && devClassSelect.value !== m.cls) devClassSelect.value = m.cls;\n  const span = Math.max(1, m.xpNext - m.xpCur);",
"sync developer class selector")
replace_once(rel,
"  const self = view.players.find((p) => p.id === selfId);\n  if (self) { cam.x = self.x; cam.y = self.y; }\n  drawFrame(ctx, W, H, cam, view, selfId);",
"  const self = view.players.find((p) => p.id === selfId);\n  if (self) {\n    const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000);\n    cam.x = self.x + recoilCameraX / scale;\n    cam.y = self.y + recoilCameraY / scale;\n  }\n  recoilCameraX *= 0.72; recoilCameraY *= 0.72;\n  if (Math.abs(recoilCameraX) < 0.05) recoilCameraX = 0;\n  if (Math.abs(recoilCameraY) < 0.05) recoilCameraY = 0;\n  drawFrame(ctx, W, H, cam, view, selfId);",
"apply and decay camera kick")

# ---------------------------------------------------------------------------
# HTML: compact DEV button/panel, visible only for the authorized host.
# ---------------------------------------------------------------------------
rel = "src/client/index.html"
replace_once(rel,
"  #classes button:active { transform: scale(.94); }\n",
"  #classes button:active { transform: scale(.94); }\n  /* ---------- Host-only developer tools ---------- */\n  #devtools { position: fixed; right: max(10px, env(safe-area-inset-right)); bottom: max(10px, env(safe-area-inset-bottom)); z-index: 30; pointer-events: auto; }\n  #devtools[hidden] { display: none !important; }\n  #devtoggle { width: auto; padding: 7px 11px; border: 1px solid #7de0a5aa; background: #173d2c; color: #aaffc8; font-size: 11px; font-weight: 900; letter-spacing: .08em; }\n  #devpanel { display: none; position: absolute; right: 0; bottom: 42px; width: min(250px, 88vw); padding: 12px; gap: 8px; background: #171d1bee; border: 1px solid #7de0a5aa; border-radius: 10px; box-shadow: 0 8px 30px #000a; }\n  #devtools.open #devpanel { display: grid; }\n  #devpanel select { width: 100%; padding: 9px; border: 1px solid #ffffff33; border-radius: 6px; background: #252d31; color: var(--fg); font: inherit; }\n  #devpanel button { width: 100%; background: #24784a; color: white; font-weight: 800; }\n  #devpanel small { color: #b6d9c4; line-height: 1.35; }\n",
"developer panel styles")
replace_once(rel,
"<div id=\"classes\" class=\"hud\"></div>\n<div id=\"stats\"",
"<div id=\"classes\" class=\"hud\"></div>\n<div id=\"devtools\" hidden>\n  <button id=\"devtoggle\" type=\"button\" title=\"Developer tools (F2)\">DEV · F2</button>\n  <div id=\"devpanel\">\n    <strong>Developer tools</strong>\n    <label for=\"devclass\">Switch to any tank</label>\n    <select id=\"devclass\" aria-label=\"Tank class\"></select>\n    <button id=\"devapply\" type=\"button\">Switch tank now</button>\n    <small>Ignores level and evolution requirements. Your level, XP and skill points stay unchanged.</small>\n  </div>\n</div>\n<div id=\"stats\"",
"developer panel markup")

# ---------------------------------------------------------------------------
# Tests: direction/magnitude, level bypass, protocol parser, host-only access.
# ---------------------------------------------------------------------------
rel = "tests/game.test.ts"
replace_once(rel,
"test('player-vs-player bullets kill, credit killer, emit dead event; respawn resets', () => {",
"test('recoil pushes opposite the shot and weapon definitions change its strength', () => {\n  const basicGame = fresh();\n  const basic = place(basicGame, basicGame.addPlayer('basic')!.id, 1000, 1000);\n  basicGame.setInput(basic.id, { mx: 0, my: 0, a: 0, f: true });\n  basicGame.step(DT);\n  const basicKick = Math.abs(basic.rvx);\n  assert.ok(basic.rvx < 0, 'shooting right must push the tank left');\n\n  const rangerGame = fresh();\n  const ranger = rangerGame.addPlayer('ranger')!;\n  assert.ok(rangerGame.debugSetClass(ranger.id, 'ranger'));\n  ranger.x = 1000; ranger.y = 1000; ranger.protT = 0;\n  rangerGame.setInput(ranger.id, { mx: 0, my: 0, a: 0, f: true });\n  rangerGame.step(DT);\n  assert.ok(Math.abs(ranger.rvx) > basicKick * 1.5, 'Ranger should have a stronger per-shot kick');\n\n  const flankGame = fresh();\n  const flank = flankGame.addPlayer('flank')!;\n  assert.ok(flankGame.debugSetClass(flank.id, 'flank'));\n  flank.x = 1000; flank.y = 1000; flank.protT = 0;\n  flankGame.setInput(flank.id, { mx: 0, my: 0, a: 0, f: true });\n  flankGame.step(DT);\n  assert.ok(Math.hypot(flank.rvx, flank.rvy) < 0.001, 'opposing Flank Guard barrels should cancel recoil');\n});\ntest('developer class override bypasses evolution but preserves level and XP', () => {\n  const g = fresh();\n  const p = g.addPlayer('dev')!;\n  assert.equal(p.level, 1);\n  assert.equal(g.debugSetClass(p.id, 'octo'), true);\n  assert.equal(p.cls, 'octo');\n  assert.equal(p.level, 1);\n  assert.equal(p.xp, 0);\n  assert.equal(p.cd.length, 8);\n  assert.equal(g.debugSetClass(p.id, 'not-a-tank'), false);\n});\ntest('player-vs-player bullets kill, credit killer, emit dead event; respawn resets', () => {",
"recoil and developer override tests")

rel = "tests/protocol.test.ts"
replace_once(rel,
"  assert.deepEqual(parseClientMessage('{\"t\":\"class\",\"id\":\"twin\"}'), { t: 'class', id: 'twin' });",
"  assert.deepEqual(parseClientMessage('{\"t\":\"class\",\"id\":\"twin\"}'), { t: 'class', id: 'twin' });\n  assert.deepEqual(parseClientMessage('{\"t\":\"devClass\",\"id\":\"octo\"}'), { t: 'devClass', id: 'octo' });\n  assert.equal(parseClientMessage('{\"t\":\"devClass\",\"id\":\"OCTO\"}'), null);",
"developer protocol validation test")

rel = "tests/server.test.ts"
replace_once(rel,
"test('LAN server: join, snapshots, input, validation, disconnect cleanup', async () => {",
"test('developer cheats are granted only to the first player when explicitly enabled', async () => {\n  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(8), 0), devCheats: true });\n  try {\n    const host = client(srv.port), guest = client(srv.port);\n    await Promise.all([host.opened, guest.opened]);\n    host.ws.send(JSON.stringify({ t: 'join', name: 'Host' }));\n    const hostWelcome = await host.waitFor((m) => m.t === 'welcome');\n    guest.ws.send(JSON.stringify({ t: 'join', name: 'Guest' }));\n    const guestWelcome = await guest.waitFor((m) => m.t === 'welcome');\n    assert.ok(hostWelcome.t === 'welcome' && hostWelcome.devCheats);\n    assert.ok(guestWelcome.t === 'welcome' && !guestWelcome.devCheats);\n\n    guest.ws.send(JSON.stringify({ t: 'devClass', id: 'octo' }));\n    await new Promise((r) => setTimeout(r, 80));\n    assert.equal(srv.game.players.get(guestWelcome.id)?.cls, 'basic', 'guest cannot use developer class override');\n\n    host.ws.send(JSON.stringify({ t: 'devClass', id: 'octo' }));\n    await host.waitFor((m) => m.t === 's' && m.me.cls === 'octo');\n    assert.equal(srv.game.players.get(hostWelcome.id)?.cls, 'octo');\n    host.ws.close(); guest.ws.close();\n  } finally {\n    await srv.close();\n  }\n});\ntest('LAN server: join, snapshots, input, validation, disconnect cleanup', async () => {",
"host-only developer authorization test")

# New opt-in launcher. Normal start_server.bat remains cheat-free.
new_launcher = """@echo off
setlocal
rem Development-only launcher: enables host-only class cheats for local testing.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js 22 or newer is required. Install it from https://nodejs.org and try again.
    pause
    exit /b 1
)
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)
set "DIEP_DEV_CHEATS=1"
call npm start
pause
"""
new_path = ROOT / "start_server_dev.bat"
if new_path.exists():
    raise SystemExit("start_server_dev.bat already exists. Review it manually; no files have been changed.")

# Ensure all replacements were prepared before touching the working tree.
for path, content in changes.items():
    path.write_text(content, encoding="utf-8", newline="")
new_path.write_text(new_launcher, encoding="utf-8", newline="")

print(f"Updated {len(changes)} existing files and created start_server_dev.bat.")
print("Next: npm run typecheck && npm test && npm run start")
print("For host-only cheats, stop the normal server and launch start_server_dev.bat instead.")
