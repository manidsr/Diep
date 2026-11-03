import {
  ARENA_SIZE, BULLET_LIFE_S, CLASS_BY_ID, CLASS_IDS, MAX_BULLETS, MAX_PLAYERS, MAX_STAT_LEVEL,
  PLAYER_PIERCE_COST, REGEN_DELAY_S, RESPAWN_PROTECTION_S, SHAPES, SHAPE_KINDS, SHAPE_TARGET_COUNT,
  SERVER_TICK_HZ, STAT_KEYS, VIEW_HALF,
} from '../shared/config';
import {
  classOptions, deriveStats, levelFromXp, statPointsEarned, totalXpForLevel, type DerivedStats,
} from '../shared/progression';
import type { Snapshot } from '../shared/protocol';
import { SpatialGrid } from './grid';

export interface Player {
  id: number; name: string;
  x: number; y: number; vx: number; vy: number; kvx: number; kvy: number; rvx: number; rvy: number;
  r: number; angle: number; hp: number; maxHp: number;
  level: number; xp: number; pts: number; stats: number[]; cls: string;
  alive: boolean; protT: number; lastDamageT: number;
  lastHit: { id: number | null; name: string } | null;
  input: { mx: number; my: number; a: number; f: boolean };
  wasFiring: boolean; cd: number[]; d: DerivedStats;
}
export interface Bullet {
  id: number; owner: number; x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; hp: number; life: number; hit: Set<number>;
}
export interface Shape {
  id: number; kind: number; x: number; y: number; vx: number; vy: number; kvx: number; kvy: number;
  r: number; hp: number; maxHp: number; rot: number; rotSpeed: number; lastHitBy: number | null;
}
export type GameEvent = { type: 'dead'; id: number; killer: string; score: number; level: number };

type Ent = { k: 0 | 1 | 2; o: Player | Shape | Bullet };
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
// Recoil velocity loses 10% per server tick, matching Diep.io's smooth, lingering kick.
const RECOIL_DECAY_PER_TICK = 0.9;
// A standard 20-wide barrel should move the tank about 10 world units per isolated shot.
const BASE_RECOIL_DISTANCE = 10;

export class Game {
  tick = 0;
  time = 0;
  players = new Map<number, Player>();
  bullets: Bullet[] = [];
  shapes: Shape[] = [];
  events: GameEvent[] = [];
  private nextId = 1;
  private grid = new SpatialGrid(128);

  constructor(private rng: () => number = Math.random, initialShapes = SHAPE_TARGET_COUNT) {
    for (let i = 0; i < initialShapes; i++) this.spawnShape();
  }

  // ---------- lifecycle ----------
  /** Returns null when the room is full. */
  addPlayer(name: string): Player | null {
    if (this.players.size >= MAX_PLAYERS) return null;
    const p: Player = {
      id: this.nextId++, name, x: 0, y: 0, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, r: 26, angle: 0, hp: 50, maxHp: 0,
      level: 1, xp: 0, pts: 0, stats: STAT_KEYS.map(() => 0), cls: 'basic', alive: true, protT: 0,
      lastDamageT: -99, lastHit: null, input: { mx: 0, my: 0, a: 0, f: false }, wasFiring: false, cd: [0],
      d: deriveStats(1, STAT_KEYS.map(() => 0), 'basic'),
    };
    this.players.set(p.id, p);
    this.respawn(p.id, name);
    return p;
  }
  removePlayer(id: number) { this.players.delete(id); }

  respawn(id: number, name?: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (name) p.name = name;
    p.level = 1; p.xp = 0; p.stats = STAT_KEYS.map(() => 0); p.cls = 'basic'; p.maxHp = 0;
    p.x = 200 + this.rng() * (ARENA_SIZE - 400);
    p.y = 200 + this.rng() * (ARENA_SIZE - 400);
    p.vx = p.vy = p.kvx = p.kvy = p.rvx = p.rvy = 0;
    p.alive = true; p.protT = RESPAWN_PROTECTION_S; p.lastHit = null; p.lastDamageT = -99;
    p.input = { mx: 0, my: 0, a: p.angle, f: false }; p.wasFiring = false;
    this.refresh(p);
    p.hp = p.maxHp;
  }

  // ---------- intents (validated by caller's protocol layer, re-clamped here) ----------
  setInput(id: number, i: { mx: number; my: number; a: number; f: boolean }) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const cl = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    p.input = { mx: cl(i.mx), my: cl(i.my), a: Number.isFinite(i.a) ? i.a : p.input.a, f: !!i.f };
  }

  upgradeStat(id: number, idx: number): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || !Number.isInteger(idx) || idx < 0 || idx >= STAT_KEYS.length) return false;
    if (p.pts <= 0 || p.stats[idx] >= MAX_STAT_LEVEL) return false;
    p.stats[idx]++;
    this.refresh(p);
    return true;
  }

  chooseClass(id: string | number, classId: string): boolean {
    const p = this.players.get(id as number);
    if (!p || !p.alive || !classOptions(p.cls, p.level).includes(classId)) return false;
    p.cls = classId;
    this.refresh(p);
    return true;
  }

  // ---------- simulation ----------
  step(dt: number) {
    this.time += dt;
    this.tick++;
    for (const p of this.players.values()) if (p.alive) this.updatePlayer(p, dt);
    for (const s of this.shapes) this.updateShape(s, dt);
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    }
    this.collideAll(dt);
    this.reap();
    this.bullets = this.bullets.filter(
      (b) => b.hp > 0 && b.life > 0 && b.x > -50 && b.y > -50 && b.x < ARENA_SIZE + 50 && b.y < ARENA_SIZE + 50,
    );
    if (this.shapes.length < SHAPE_TARGET_COUNT && this.rng() < dt * 4) this.spawnShape();
  }

  private updatePlayer(p: Player, dt: number) {
    const { mx, my, a, f } = p.input;
    p.angle = a;
    let ix = mx, iy = my;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const k = 1 - Math.exp(-dt * 7);
    p.vx += (ix * p.d.moveSpeed - p.vx) * k;
    p.vy += (iy * p.d.moveSpeed - p.vy) * k;
    p.x += (p.vx + p.kvx + p.rvx) * dt;
    p.y += (p.vy + p.kvy + p.rvy) * dt;
    const dec = Math.exp(-dt * 6);
    p.kvx *= dec; p.kvy *= dec;
    // Keep recoil separate from collision knockback so tuning one does not alter the other.
    const recoilDecay = Math.pow(RECOIL_DECAY_PER_TICK, dt * SERVER_TICK_HZ);
    p.rvx *= recoilDecay; p.rvy *= recoilDecay;
    p.x = Math.min(ARENA_SIZE - p.r, Math.max(p.r, p.x));
    p.y = Math.min(ARENA_SIZE - p.r, Math.max(p.r, p.y));
    if (p.protT > 0) p.protT -= dt;
    if (this.time - p.lastDamageT > REGEN_DELAY_S && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.d.regenFrac * dt);
    }
    const barrels = CLASS_BY_ID[p.cls].barrels;
    for (let i = 0; i < p.cd.length; i++) p.cd[i] = Math.max(0, p.cd[i] - dt);
    if (f && !p.wasFiring) {
      for (let i = 0; i < barrels.length; i++) p.cd[i] = Math.max(p.cd[i], barrels[i].delay * p.d.reload);
    }
    p.wasFiring = f;
    if (f) this.fire(p, barrels);
  }

  private fire(p: Player, barrels: { angle: number; offset: number; length: number; width: number; spread?: number }[]) {
    const sc = p.r / 26;
    for (let i = 0; i < barrels.length; i++) {
      if (p.cd[i] > 0 || this.bullets.length >= MAX_BULLETS) continue;
      const b = barrels[i];
      const da = p.angle + b.angle;
      const ang = da + (b.spread ? (this.rng() * 2 - 1) * b.spread : 0);
      const cx = Math.cos(da), cy = Math.sin(da);
      const bulletRadius = b.width * 0.5 * sc;
      this.bullets.push({
        id: this.nextId++, owner: p.id,
        x: p.x + cx * b.length * sc - cy * b.offset * sc,
        y: p.y + cy * b.length * sc + cx * b.offset * sc,
        vx: Math.cos(ang) * p.d.bulletSpeed, vy: Math.sin(ang) * p.d.bulletSpeed,
        r: bulletRadius, dmg: p.d.bulletDamage, hp: p.d.bulletHp, life: BULLET_LIFE_S, hit: new Set(),
      });
      // Treat barrel width as projectile diameter: cross-sectional area scales with width squared.
      // The impulse is opposite the actual shot direction, including any barrel spread.
      const sizeRatio = b.width / 20;
      const recoilDistance = BASE_RECOIL_DISTANCE * sizeRatio * sizeRatio;
      const recoilImpulse = recoilDistance * SERVER_TICK_HZ * (1 - RECOIL_DECAY_PER_TICK);
      p.rvx -= Math.cos(ang) * recoilImpulse;
      p.rvy -= Math.sin(ang) * recoilImpulse;
      p.cd[i] = p.d.reload;
    }
  }

  private updateShape(s: Shape, dt: number) {
    s.x += (s.vx + s.kvx) * dt; s.y += (s.vy + s.kvy) * dt; s.rot += s.rotSpeed * dt;
    const dec = Math.exp(-dt * 4);
    s.kvx *= dec; s.kvy *= dec;
    if (s.x < s.r || s.x > ARENA_SIZE - s.r) { s.vx = -s.vx; s.x = Math.min(ARENA_SIZE - s.r, Math.max(s.r, s.x)); }
    if (s.y < s.r || s.y > ARENA_SIZE - s.r) { s.vy = -s.vy; s.y = Math.min(ARENA_SIZE - s.r, Math.max(s.r, s.y)); }
  }

  spawnShape() {
    const total = SHAPE_KINDS.reduce((a, k) => a + SHAPES[k].weight, 0);
    let roll = this.rng() * total, kind = 0;
    for (let i = 0; i < SHAPE_KINDS.length; i++) { roll -= SHAPES[SHAPE_KINDS[i]].weight; if (roll <= 0) { kind = i; break; } }
    const def = SHAPES[SHAPE_KINDS[kind]];
    const ang = this.rng() * Math.PI * 2, spd = 6 + this.rng() * 12;
    this.shapes.push({
      id: this.nextId++, kind, x: 100 + this.rng() * (ARENA_SIZE - 200), y: 100 + this.rng() * (ARENA_SIZE - 200),
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, kvx: 0, kvy: 0, r: def.radius, hp: def.hp, maxHp: def.hp,
      rot: this.rng() * 6.28, rotSpeed: (this.rng() - 0.5) * 0.8, lastHitBy: null,
    });
  }

  // ---------- collisions ----------
  private collideAll(dt: number) {
    const ents: Ent[] = [];
    for (const p of this.players.values()) if (p.alive) ents.push({ k: 0, o: p });
    for (const s of this.shapes) ents.push({ k: 1, o: s });
    for (const b of this.bullets) ents.push({ k: 2, o: b });
    this.grid.clear();
    ents.forEach((e, i) => this.grid.insert(i, e.o.x, e.o.y));
    ents.forEach((a, i) => {
      this.grid.forNeighbors(a.o.x, a.o.y, (j) => {
        if (j > i) this.collidePair(a, ents[j], dt);
      });
    });
  }

  private collidePair(e1: Ent, e2: Ent, dt: number) {
    const [a, b] = e1.k <= e2.k ? [e1, e2] : [e2, e1];
    const A = a.o as Player, B = b.o as Player;
    const dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.max(Math.sqrt(d2), 0.001);
    if (a.k === 0 && b.k === 0) {
      this.separate(A, B, dx, dy, d, rr, A.r * A.r, B.r * B.r);
      if (A.protT <= 0 && B.protT <= 0) {
        this.hurtPlayer(A, B.d.bodyDps * dt, B.id, B.name);
        this.hurtPlayer(B, A.d.bodyDps * dt, A.id, A.name);
      }
    } else if (a.k === 0 && b.k === 1) {
      const s = b.o as unknown as Shape, def = SHAPES[SHAPE_KINDS[s.kind]];
      this.separate(A, s as unknown as Player, dx, dy, d, rr, A.r * A.r, s.r * s.r * 1.5);
      if (A.protT <= 0) this.hurtPlayer(A, def.bodyDps * dt, null, 'a shape');
      s.hp -= A.d.bodyDps * dt; s.lastHitBy = A.id;
    } else if (a.k === 0 && b.k === 2) {
      const bl = b.o as unknown as Bullet;
      if (bl.owner === A.id || bl.hit.has(A.id) || A.protT > 0) return;
      bl.hit.add(A.id);
      const owner = this.players.get(bl.owner);
      this.hurtPlayer(A, bl.dmg, bl.owner, owner?.name ?? 'Someone');
      bl.hp -= PLAYER_PIERCE_COST;
      A.kvx += (bl.vx / 8); A.kvy += (bl.vy / 8);
    } else if (a.k === 1 && b.k === 2) {
      const s = a.o as unknown as Shape, bl = b.o as unknown as Bullet;
      if (bl.hit.has(s.id)) return;
      bl.hit.add(s.id);
      s.hp -= bl.dmg; s.lastHitBy = bl.owner;
      bl.hp -= SHAPES[SHAPE_KINDS[s.kind]].pierceCost;
      s.kvx += bl.vx / 12; s.kvy += bl.vy / 12;
    }
  }

  private separate(
    A: { x: number; y: number; kvx: number; kvy: number }, B: { x: number; y: number; kvx: number; kvy: number },
    dx: number, dy: number, d: number, rr: number, mA: number, mB: number,
  ) {
    const nx = dx / d, ny = dy / d, ov = rr - d, tot = mA + mB;
    A.x -= nx * ov * (mB / tot); A.y -= ny * ov * (mB / tot);
    B.x += nx * ov * (mA / tot); B.y += ny * ov * (mA / tot);
    const kick = Math.min(ov, 30) * 6;
    A.kvx -= nx * kick * (mB / tot); A.kvy -= ny * kick * (mB / tot);
    B.kvx += nx * kick * (mA / tot); B.kvy += ny * kick * (mA / tot);
  }

  private hurtPlayer(p: Player, amount: number, byId: number | null, byName: string) {
    if (amount <= 0) return;
    p.hp -= amount;
    p.lastDamageT = this.time;
    p.lastHit = { id: byId, name: byName };
  }

  private reap() {
    for (const p of this.players.values()) {
      if (!p.alive || p.hp > 0) continue;
      p.alive = false; p.hp = 0; p.input.f = false;
      const killer = p.lastHit?.id != null ? this.players.get(p.lastHit.id) : undefined;
      if (killer && killer.alive && killer.id !== p.id) this.addXp(killer, Math.max(25, Math.floor(p.xp * 0.6)));
      this.events.push({ type: 'dead', id: p.id, killer: p.lastHit?.name ?? 'the arena', score: p.xp, level: p.level });
    }
    if (this.shapes.some((s) => s.hp <= 0)) {
      for (const s of this.shapes) {
        if (s.hp > 0) continue;
        const k = s.lastHitBy != null ? this.players.get(s.lastHitBy) : undefined;
        if (k && k.alive) this.addXp(k, SHAPES[SHAPE_KINDS[s.kind]].xp);
      }
      this.shapes = this.shapes.filter((s) => s.hp > 0);
    }
  }

  addXp(p: Player, amount: number) {
    p.xp += amount;
    p.level = levelFromXp(p.xp);
    this.refresh(p);
  }

  /** Recompute derived stats; keep hp ratio when max hp changes. */
  private refresh(p: Player) {
    const prevMax = p.maxHp;
    p.d = deriveStats(p.level, p.stats, p.cls);
    p.maxHp = p.d.maxHp;
    p.r = p.d.radius;
    if (prevMax > 0) p.hp = Math.min(p.maxHp, p.hp * (p.maxHp / prevMax));
    p.pts = statPointsEarned(p.level) - p.stats.reduce((a, b) => a + b, 0);
    const n = CLASS_BY_ID[p.cls].barrels.length;
    if (p.cd.length !== n) p.cd = new Array(n).fill(0);
  }

  // ---------- output ----------
  leaderboard(limit = 10) {
    return [...this.players.values()].filter((p) => p.alive).sort((a, b) => b.xp - a.xp).slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, score: p.xp, lv: p.level }));
  }

  drainEvents(): GameEvent[] { const e = this.events; this.events = []; return e; }

  snapshotFor(id: number): Snapshot | null {
    const me = this.players.get(id);
    if (!me) return null;
    const near = (x: number, y: number, r: number) => Math.abs(x - me.x) <= VIEW_HALF + r && Math.abs(y - me.y) <= VIEW_HALF + r;
    const cur = totalXpForLevel(me.level), next = me.level >= 45 ? cur : totalXpForLevel(me.level + 1);
    return {
      t: 's', tick: this.tick,
      me: {
        alive: me.alive, hp: r1(me.hp), mhp: r1(me.maxHp), lv: me.level, xp: me.xp, xpCur: cur, xpNext: next,
        pts: me.pts, stats: me.stats.slice(), cls: me.cls, opts: me.alive ? classOptions(me.cls, me.level) : [],
      },
      p: [...this.players.values()].filter((q) => q.alive && near(q.x, q.y, q.r)).map((q) => ({
        id: q.id, name: q.name, x: r1(q.x), y: r1(q.y), a: r2(q.angle), hp: r1(q.hp), mhp: r1(q.maxHp),
        r: r1(q.r), lv: q.level, cls: CLASS_IDS.indexOf(q.cls), prot: q.protT > 0 ? 1 : 0,
      })),
      b: this.bullets.filter((b) => near(b.x, b.y, b.r)).map((b) => [b.id, r1(b.x), r1(b.y), r1(b.r), b.owner]),
      sh: this.shapes.filter((s) => near(s.x, s.y, s.r)).map((s) => [s.id, r1(s.x), r1(s.y), r2(s.rot), s.kind, r2(s.hp / s.maxHp)]),
    };
  }
}
