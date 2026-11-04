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

test('recoil pushes opposite the shot and weapon definitions change its strength', () => {
  const basicGame = fresh();
  const basic = place(basicGame, basicGame.addPlayer('basic')!.id, 1000, 1000);
  basicGame.setInput(basic.id, { mx: 0, my: 0, a: 0, f: true });
  basicGame.step(DT);
  const basicKick = Math.abs(basic.rvx);
  assert.ok(basic.rvx < 0, 'shooting right must push the tank left');

  const rangerGame = fresh();
  const ranger = rangerGame.addPlayer('ranger')!;
  assert.ok(rangerGame.debugSetClass(ranger.id, 'ranger'));
  ranger.x = 1000; ranger.y = 1000; ranger.protT = 0;
  rangerGame.setInput(ranger.id, { mx: 0, my: 0, a: 0, f: true });
  rangerGame.step(DT);
  assert.ok(Math.abs(ranger.rvx) > basicKick * 1.5, 'Ranger should have a stronger per-shot kick');

  const flankGame = fresh();
  const flank = flankGame.addPlayer('flank')!;
  assert.ok(flankGame.debugSetClass(flank.id, 'flank'));
  flank.x = 1000; flank.y = 1000; flank.protT = 0;
  flankGame.setInput(flank.id, { mx: 0, my: 0, a: 0, f: true });
  flankGame.step(DT);
  assert.ok(Math.hypot(flank.rvx, flank.rvy) < 0.001, 'opposing Flank Guard barrels should cancel recoil');
});
test('developer class override bypasses evolution but preserves level and XP', () => {
  const g = fresh();
  const p = g.addPlayer('dev')!;
  assert.equal(p.level, 1);
  assert.equal(g.debugSetClass(p.id, 'octo'), true);
  assert.equal(p.cls, 'octo');
  assert.equal(p.level, 1);
  assert.equal(p.xp, 0);
  assert.equal(p.cd.length, 8);
  assert.equal(g.debugSetClass(p.id, 'not-a-tank'), false);
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


test('Smasher branches refund projectile stats and only allow body-focused upgrades', () => {
  const game = fresh();
  const player = game.addPlayer('rammer')!;
  game.addXp(player, totalXpForLevel(28));
  for (const index of [3, 4, 5, 6]) assert.ok(game.upgradeStat(player.id, index));
  const spentPoints = player.pts;
  assert.ok(game.debugSetClass(player.id, 'smasher'));
  assert.deepEqual(player.stats.slice(3, 7), [0, 0, 0, 0]);
  assert.ok(player.pts > spentPoints);
  assert.equal(game.upgradeStat(player.id, 3), false);
  assert.equal(game.upgradeStat(player.id, 6), false);
  assert.ok(player.d.bodyDps > 18);
  assert.equal(player.cd.length, 0);
});

test('Overlord drones spawn up to their class limit and are server simulated', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('overlord')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overlord'));
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: true });
  run(game, 4);
  const drones = game.bullets.filter((bullet) => bullet.owner === player.id && bullet.kind === 'drone');
  assert.equal(drones.length, 8);
  assert.ok(drones.every((drone) => Number.isFinite(drone.x) && Number.isFinite(drone.y)));
});

test('Trapper launches a stationary trap instead of a normal travelling bullet', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('trapper')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'trapper'));
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: true });
  game.step(DT);
  const trap = game.bullets.find((bullet) => bullet.owner === player.id && bullet.kind === 'trap');
  assert.ok(trap);
  assert.equal(trap!.vx, 0);
  assert.equal(trap!.vy, 0);
  const x = trap!.x, y = trap!.y;
  run(game, 0.5);
  assert.equal(trap!.x, x);
  assert.equal(trap!.y, y);
});

test('guided missiles accelerate after launch', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('skimmer')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'skimmer'));
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: true });
  game.step(DT);
  const missile = game.bullets.find((bullet) => bullet.owner === player.id && bullet.kind === 'missile');
  assert.ok(missile);
  const initialSpeed = Math.hypot(missile!.vx, missile!.vy);
  run(game, 0.25);
  assert.ok(Math.hypot(missile!.vx, missile!.vy) > initialSpeed);
});

test('Firework rockets split into sixteen pellets on secondary input', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('firework')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'firework'));
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: true });
  game.step(DT);
  assert.equal(game.bullets.filter((bullet) => bullet.kind === 'firework').length, 1);
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false, secondary: true });
  game.step(DT);
  assert.equal(game.bullets.filter((bullet) => bullet.owner === player.id && bullet.kind === 'bullet').length, 16);
  assert.equal(game.bullets.filter((bullet) => bullet.kind === 'firework').length, 0);
});

test('Stalker becomes hidden while stationary and is revealed by firing', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('stalker')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'stalker'));
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false });
  run(game, 2.2);
  assert.equal(player.visibility, 0.08);
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: true });
  game.step(DT);
  assert.equal(player.visibility, 1);
});

test('Auto 3 turret fires at a nearby target without player firing input', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('auto')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'auto3'));
  game.shapes.push({
    id: 9999, kind: 0, x: 1200, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 24, hp: 100, maxHp: 100, rot: 0, rotSpeed: 0, lastHitBy: null,
  });
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false });
  game.step(DT);
  assert.ok(game.bullets.some((bullet) => bullet.owner === player.id && bullet.kind === 'bullet'));
});


test('class changes and respawns clear weapon and auto-turret cooldowns', () => {
  const game = fresh();
  const player = game.addPlayer('cooldowns')!;
  player.cd[0] = 5;
  assert.ok(game.debugSetClass(player.id, 'auto3'));
  assert.equal(player.cd.length, 1);
  assert.equal(player.cd[0], 0);
  assert.equal(player.autoCd.length, 3);
  assert.ok(player.autoCd.every((value) => value === 0));

  player.cd[0] = 4;
  player.autoCd.fill(3);
  game.respawn(player.id);
  assert.equal(player.cls, 'basic');
  assert.deepEqual(player.cd, [0]);
  assert.deepEqual(player.autoCd, []);
});
