import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/server/game';
import { ARENA_SIZE, SHAPES } from '../src/shared/config';
import { totalXpForLevel } from '../src/shared/progression';
import { seeded } from './helpers';

const DT = 1 / 30;
const run = (g: Game, secs: number) => { for (let i = 0; i < Math.round(secs * 30); i++) g.step(DT); };
const fresh = (shapes = 0) => new Game(seeded(7), shapes);
function place(g: Game, id: number, x: number, y: number) {
  const p = g.players.get(id)!; p.x = x; p.y = y; p.protT = 0; return p;
}

test('movement is server-clamped: huge input cannot exceed max speed', () => {
  const g = fresh();
  const p = place(g, g.addPlayer('a')!.id, 1000, 1000);
  g.setInput(p.id, { mx: 1e6, my: 0, a: 0, f: false });
  run(g, 3);
  const speed = Math.hypot(p.vx, p.vy);
  assert.ok(speed <= p.d.moveSpeed + 0.01, `speed ${speed}`);
  assert.ok(p.x > 1000);
  g.setInput(p.id, { mx: NaN, my: 0, a: NaN, f: false }); // must not poison state
  run(g, 1);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.angle));
});

test('players stay inside the arena', () => {
  const g = fresh();
  const p = place(g, g.addPlayer('a')!.id, 100, 100);
  g.setInput(p.id, { mx: -1, my: -1, a: 0, f: false });
  run(g, 5);
  assert.ok(p.x >= p.r && p.y >= p.r && p.x <= ARENA_SIZE && p.y <= ARENA_SIZE);
});

test('firing respects reload; bullets expire', () => {
  const g = fresh();
  const p = place(g, g.addPlayer('a')!.id, 1500, 1500);
  g.setInput(p.id, { mx: 0, my: 0, a: 0, f: true });
  run(g, 1.0);
  const expected = Math.floor(1.0 / p.d.reload) + 1;
  assert.ok(g.bullets.length >= expected - 1 && g.bullets.length <= expected + 1, `${g.bullets.length} vs ${expected}`);
  g.setInput(p.id, { mx: 0, my: 0, a: 0, f: false });
  run(g, 3);
  assert.equal(g.bullets.length, 0);
});

test('shooting a shape kills it, awards XP and levels up', () => {
  const g = fresh();
  const p = place(g, g.addPlayer('a')!.id, 1000, 1000);
  g.shapes.push({ id: 9999, kind: 0, x: 1200, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0, r: 24, hp: 12, maxHp: 12, rot: 0, rotSpeed: 0, lastHitBy: null });
  g.setInput(p.id, { mx: 0, my: 0, a: 0, f: true });
  run(g, 2);
  assert.ok(!g.shapes.some((s) => s.id === 9999));
  assert.equal(p.xp, SHAPES.square.xp);
  assert.equal(p.level, 2);
  assert.equal(p.pts, 1);
});

test('upgrade spends points only when available and caps at 7', () => {
  const g = fresh();
  const p = g.addPlayer('a')!;
  assert.equal(g.upgradeStat(p.id, 0), false);
  g.addXp(p, totalXpForLevel(10));
  assert.equal(p.pts, 9);
  const mhp = p.maxHp;
  for (let i = 0; i < 7; i++) assert.ok(g.upgradeStat(p.id, 1));
  assert.equal(g.upgradeStat(p.id, 1), false);
  assert.equal(p.pts, 2);
  assert.ok(p.maxHp > mhp);
  assert.equal(g.upgradeStat(p.id, 99), false);
});

test('class evolution requires level and valid parent', () => {
  const g = fresh();
  const p = g.addPlayer('a')!;
  assert.equal(g.chooseClass(p.id, 'twin'), false);
  g.addXp(p, totalXpForLevel(15));
  assert.equal(g.chooseClass(p.id, 'triple'), false);
  assert.equal(g.chooseClass(p.id, 'twin'), true);
  assert.equal(p.cd.length, 2);
  g.addXp(p, totalXpForLevel(30));
  assert.equal(g.chooseClass(p.id, 'sniper'), false);
  assert.equal(g.chooseClass(p.id, 'triple'), true);
  assert.equal(p.cd.length, 3);
});

test('player-vs-player bullets kill, credit killer, emit dead event; respawn resets', () => {
  const g = fresh();
  const a = place(g, g.addPlayer('shooter')!.id, 1000, 1000);
  const b = place(g, g.addPlayer('victim')!.id, 1300, 1000);
  b.xp = 200; b.level = 5;
  g.setInput(a.id, { mx: 0, my: 0, a: 0, f: true });
  run(g, 8);
  assert.equal(b.alive, false);
  assert.ok(a.xp >= 120);
  const ev = g.drainEvents();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].id, b.id);
  assert.equal(ev[0].killer, 'shooter');
  g.respawn(b.id, 'victim2');
  assert.ok(b.alive && b.level === 1 && b.xp === 0 && b.hp === b.maxHp && b.protT > 0);
});

test('spawn protection blocks bullet and body damage', () => {
  const g = fresh();
  const a = place(g, g.addPlayer('a')!.id, 1000, 1000);
  const b = g.players.get(g.addPlayer('b')!.id)!;
  b.x = 1300; b.y = 1000; b.protT = 5;
  g.setInput(a.id, { mx: 0, my: 0, a: 0, f: true });
  run(g, 3);
  assert.equal(b.hp, b.maxHp);
});

test('snapshot only contains nearby entities and own full state', () => {
  const g = fresh();
  const a = place(g, g.addPlayer('a')!.id, 500, 500);
  const far = place(g, g.addPlayer('far')!.id, 3000, 3000);
  g.shapes.push({ id: 5, kind: 1, x: 600, y: 500, vx: 0, vy: 0, kvx: 0, kvy: 0, r: 28, hp: 32, maxHp: 32, rot: 0, rotSpeed: 0, lastHitBy: null });
  g.shapes.push({ id: 6, kind: 1, x: 3000, y: 3000, vx: 0, vy: 0, kvx: 0, kvy: 0, r: 28, hp: 32, maxHp: 32, rot: 0, rotSpeed: 0, lastHitBy: null });
  const s = g.snapshotFor(a.id)!;
  assert.deepEqual(s.p.map((p) => p.id), [a.id]);
  assert.deepEqual(s.sh.map((x) => x[0]), [5]);
  assert.equal(s.me.lv, 1);
  assert.ok(far.alive);
  assert.equal(g.snapshotFor(12345), null);
});

test('room cap and shape respawn', () => {
  const g = new Game(seeded(3), 5);
  for (let i = 0; i < 24; i++) assert.ok(g.addPlayer('p' + i));
  assert.equal(g.addPlayer('extra'), null);
  g.shapes.length = 0;
  run(g, 60);
  assert.ok(g.shapes.length > 50);
});
