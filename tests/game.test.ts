import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/server/game';
import { ARENA_SIZE, SURVIVAL_ARENA_SIZE, SHAPES, TEAM_BASE_DEPTH } from '../src/shared/config';
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
  const death = ev.find((event) => event.type === 'dead');
  assert.ok(death);
  assert.equal(death.id, b.id);
  assert.equal(death.killer, 'shooter');
  assert.equal(death.victim, 'victim');
  assert.equal(death.killerClass, 'basic');
  assert.equal(death.victimClass, 'basic');
  assert.equal(death.kills, 0, 'the victim report records the victim life kill count');
  assert.ok(death.damageTaken > 0);
  assert.ok(a.damageDealt > 0);
  assert.ok(death.lifetime > 0);
  g.respawn(b.id, 'victim2');
  assert.ok(b.alive && b.level === 1 && b.xp === 0 && b.hp === b.maxHp && b.protT > 0);
  assert.equal(b.kills, 0);
  assert.equal(b.damageDealt, 0);
  assert.equal(b.damageTaken, 0);
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

test('drone squads use the mouse command and keep unique formation spacing', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('commander')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overlord'));
  // Right mouse / Shift commands the squad toward the cursor direction (positive X).
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false, secondary: true });
  run(game, 5);
  const drones = game.bullets.filter((bullet) => bullet.owner === player.id && bullet.kind === 'drone');
  assert.equal(drones.length, 8);
  assert.equal(new Set(drones.map((drone) => drone.formationSlot)).size, 8);
  const centerX = drones.reduce((sum, drone) => sum + drone.x, 0) / drones.length;
  assert.ok(centerX > player.x + 180, `drone formation should move toward cursor: centerX=${centerX}`);
  for (let i = 0; i < drones.length; i++) {
    for (let j = i + 1; j < drones.length; j++) {
      const distance = Math.hypot(drones[i].x - drones[j].x, drones[i].y - drones[j].y);
      assert.ok(distance > 5, 'friendly drones should not occupy the same position');
    }
  }
});

test('hits on map shapes apply punchier knockback and expose impact feedback', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('shooter')!.id, 1000, 1000);
  const shape = {
    id: 9999, kind: 0, x: 1200, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 24, hp: 500, maxHp: 500, rot: 0, rotSpeed: 0, lastHitBy: null,
    hitFlash: 0, hitX: 0, hitY: 0, hitAngle: 0,
  };
  game.shapes.push(shape);
  game.bullets.push({
    id: 10000, owner: player.id, x: 1170, y: 1000, vx: 600, vy: 0,
    r: 5, dmg: 10, hp: 100, life: 2, hit: new Set(), kind: 'bullet',
    angle: 0, maxSpeed: 600, turnRate: 0,
  });
  game.step(DT);
  assert.ok(shape.kvx > 35, `shape should receive a clear impact impulse: ${shape.kvx}`);
  assert.equal(shape.hitFlash, 1);
  assert.ok(shape.hitX > 0);
  const snap = game.snapshotFor(player.id)!;
  const snapShape = snap.sh.find((entry) => entry[0] === shape.id)!;
  assert.equal(snapShape[6], 1, 'snapshot should carry the hit flash');
  run(game, 0.25);
  assert.ok(shape.hitFlash < 1, 'impact flash should fade smoothly');
});

test('overseer drones attack a mouse-prioritised shape instead of orbiting outside contact range', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('drone-ai')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overseer'));
  const hex = {
    id: 9900, kind: 2, x: 1260, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 44, hp: 10000, maxHp: 10000, rot: 0, rotSpeed: 0, lastHitBy: null,
    hitFlash: 0, hitX: 0, hitY: 0, hitAngle: 0,
  };
  game.shapes.push(hex);
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false });
  run(game, 3);
  const drones = game.bullets.filter((bullet) => bullet.owner === player.id && bullet.kind === 'drone');
  assert.ok(drones.length > 0);
  assert.ok(hex.hp < hex.maxHp, 'drones should make contact and damage the selected hexagon');
  assert.ok(drones.some((drone) => drone.hit.has(hex.id)), 'at least one drone should register a successful hit');
});


test('Overlord drones stay inside their tether and recall when overextended', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('leashed-overlord')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overlord'));

  const distantShape = {
    id: 9910, kind: 2, x: 1700, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 44, hp: 10000, maxHp: 10000, rot: 0, rotSpeed: 0, lastHitBy: null,
  };
  game.shapes.push(distantShape);
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false });
  run(game, 4);

  assert.equal(distantShape.hp, distantShape.maxHp, 'drones must not chase targets beyond command range');
  const drones = game.bullets.filter((bullet) => bullet.owner === player.id && bullet.kind === 'drone');
  assert.equal(drones.length, 8);

  const overextended = drones[0];
  overextended.x = player.x + 470;
  overextended.y = player.y;
  overextended.vx = 260;
  overextended.vy = 0;
  overextended.angle = 0;
  run(game, 2);

  const recalledDistance = Math.hypot(overextended.x - player.x, overextended.y - player.y);
  assert.ok(recalledDistance < 400, `overextended drone should regroup near its owner: ${recalledDistance}`);
  assert.ok(drones.every((drone) =>
    Math.hypot(drone.x - player.x, drone.y - player.y) <= 480.5
  ), 'no drone should escape the visible tether boundary');
});

test('drones launch staggered strike passes, then peel away instead of orbiting', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('strike-drones')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overlord'));
  const hex = {
    id: 9920, kind: 2, x: 1260, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 44, hp: 10000, maxHp: 10000, rot: 0, rotSpeed: 0, lastHitBy: null,
  };
  game.shapes.push(hex);
  (game as unknown as { updateShape: (shape: unknown, dt: number) => void }).updateShape = () => {};
  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false });

  for (let i = 0; i < 180; i++) {
    game.step(DT);
    const diving = game.bullets.filter((bullet) =>
      bullet.owner === player.id && bullet.kind === 'drone' && bullet.attackState === 'dive'
    ).length;
    assert.ok(diving <= 2, `no more than two drones should dive at once, diving=${diving}`);
  }

  const drones = game.bullets.filter((bullet) => bullet.owner === player.id && bullet.kind === 'drone');
  assert.equal(drones.length, 8);
  assert.ok(hex.hp < hex.maxHp, 'drones should make responsive attack passes and damage the aimed target');
  assert.ok(drones.some((drone) => drone.hit.has(hex.id)), 'a completed strike should register contact');
  assert.ok(drones.some((drone) => drone.attackState === 'recover' || drone.attackState === 'dive'),
    'the squad should visibly cycle through dive and peel-away states');
  const visualStates = game.snapshotFor(player.id)!.b.filter((bullet) => bullet[5] === 1).map((bullet) => bullet[7] ?? 0);
  assert.ok(visualStates.some((state) => state === 1 || state === 2),
    'snapshots should identify attacking and peeling drones for the visual streak');
});

test('drone attacks respond to a new aim direction on the next available strike', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('responsive-drones')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overseer'));
  const front = {
    id: 9930, kind: 2, x: 1220, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 44, hp: 10000, maxHp: 10000, rot: 0, rotSpeed: 0, lastHitBy: null,
  };
  const upper = {
    id: 9931, kind: 2, x: 1000, y: 1220, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 44, hp: 10000, maxHp: 10000, rot: 0, rotSpeed: 0, lastHitBy: null,
  };
  game.shapes.push(front, upper);
  (game as unknown as { updateShape: (shape: unknown, dt: number) => void }).updateShape = () => {};

  game.setInput(player.id, { mx: 0, my: 0, a: 0, f: false });
  run(game, 3.5);
  assert.ok(front.hp < front.maxHp, 'the first wave should follow the initial aim direction');

  game.setInput(player.id, { mx: 0, my: 0, a: Math.PI / 2, f: false });
  run(game, 3.5);
  assert.ok(upper.hp < upper.maxHp, 'the next available wave should retarget toward the new aim direction');
});

test('a drone peels away after a strike and can hit again on a later pass', () => {
  const game = fresh();
  const player = place(game, game.addPlayer('repeat-strike')!.id, 1000, 1000);
  assert.ok(game.debugSetClass(player.id, 'overseer'));
  const hex = {
    id: 9901, kind: 2, x: 1100, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0,
    r: 44, hp: 10000, maxHp: 10000, rot: 0, rotSpeed: 0, lastHitBy: null,
  };
  game.shapes.push(hex);
  const drone = {
    id: 9902, owner: player.id, x: 1100, y: 1000, vx: 220, vy: 0,
    r: 10, dmg: 12, hp: 8, life: 20, hit: new Set<number>(), kind: 'drone' as const,
    angle: 0, maxSpeed: 300, turnRate: 4.6,
    attackState: 'dive' as 'guard' | 'dive' | 'recover',
    attackTargetId: hex.id, attackTimer: 0, attackCooldown: 0,
  };
  game.bullets.push(drone);
  const collide = (game as unknown as { collideAll: (dt: number) => void }).collideAll.bind(game);
  collide(DT);
  const firstStrike = hex.hp;
  assert.ok(firstStrike < hex.maxHp, 'a diving drone should damage on contact');
  assert.equal(drone.attackState, 'recover', 'contact should trigger a peel-away');
  collide(DT);
  assert.equal(hex.hp, firstStrike, 'a peeling drone must not keep damaging while touching the target');

  drone.attackState = 'dive';
  drone.attackTargetId = hex.id;
  drone.attackCooldown = 0;
  drone.attackTimer = 0;
  game.time += 0.7;
  collide(DT);
  assert.ok(hex.hp < firstStrike, 'the drone should be able to make another hit on a later pass');
  assert.equal(drone.hp, 7, 'repeat strikes should not consume extra drone durability');
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
  assert.deepEqual(player.autoCd, [0, 0, 0]);

  player.cd[0] = 4;
  player.autoCd.fill(3);
  game.respawn(player.id);
  assert.equal(player.cls, 'basic');
  assert.deepEqual(player.cd, [0]);
  assert.deepEqual(player.autoCd, []);
});


test('spawn selection avoids shape overlap and prefers quieter space', () => {
  const game = fresh();
  const first = game.addPlayer('first')!;
  assert.ok(game.shapes.every((shape) =>
    Math.hypot(first.x - shape.x, first.y - shape.y) >= first.r + shape.r + 79
  ), 'spawn should not overlap a world object');
  const second = game.addPlayer('second')!;
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > 200,
    'a new player should prefer a lower-traffic area away from active players');
});


test('Team Mode balances players and spawns each team on its own map side', () => {
  const game = new Game(seeded(33), 0, 'teams');
  const blue = game.addPlayer('blue')!;
  const red = game.addPlayer('red')!;
  const blueTwo = game.addPlayer('blue two')!;
  const redTwo = game.addPlayer('red two')!;
  assert.equal(blue.team, 'blue');
  assert.equal(red.team, 'red');
  assert.equal(blueTwo.team, 'blue');
  assert.equal(redTwo.team, 'red');
  assert.ok(blue.x < ARENA_SIZE / 2 && blueTwo.x < ARENA_SIZE / 2);
  assert.ok(red.x > ARENA_SIZE / 2 && redTwo.x > ARENA_SIZE / 2);
  const snapshot = game.snapshotFor(blue.id);
  assert.equal(snapshot?.mode, 'teams');
  assert.equal(snapshot?.me.team, 'blue');
});

test('Team Mode blocks friendly fire and keeps enemy damage enabled', () => {
  const game = new Game(seeded(34), 0, 'teams');
  const shooter = game.addPlayer('blue shooter')!;
  const enemy = game.addPlayer('red enemy')!;
  const ally = game.addPlayer('blue ally')!;
  Object.assign(shooter, { x: 800, y: 800, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
  Object.assign(ally, { x: 880, y: 800, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
  Object.assign(enemy, { x: 960, y: 800, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
  const makeBullet = (id: number, x: number, targetId: number) => ({
    id, owner: shooter.id, x, y: 800, vx: 0, vy: 0,
    r: 8, dmg: 20, hp: 5, life: 1, hit: new Set<number>(),
    kind: 'bullet' as const, angle: 0, maxSpeed: 0, turnRate: 0,
  });
  game.bullets.push(makeBullet(9001, ally.x, ally.id));
  const allyHp = ally.hp;
  game.step(DT);
  assert.equal(ally.hp, allyHp, 'blue bullets must pass through blue teammates without damage');

  enemy.hp = 10;
  game.bullets.push(makeBullet(9002, enemy.x, enemy.id));
  const enemyHp = enemy.hp;
  game.step(DT);
  assert.ok(enemy.hp < enemyHp, 'blue bullets must still damage red opponents');
  assert.equal(enemy.alive, false);
  assert.equal(shooter.matchKills, 1);
  assert.equal(game.teamStats.blue.kills, 1);
});


test('Team bases block enemy entry and stop enemy projectiles at the boundary', () => {
  const game = new Game(seeded(35), 0, 'teams');
  const blue = game.addPlayer('blue base defender')!;
  const red = game.addPlayer('red raider')!;

  // A red player cannot cross into the blue base, but blue can enter its own base.
  Object.assign(red, {
    x: TEAM_BASE_DEPTH + red.r + 2, y: 900, vx: 0, vy: 0,
    kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0,
  });
  Object.assign(blue, {
    x: TEAM_BASE_DEPTH + blue.r + 12, y: 1900, vx: 0, vy: 0,
    kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0,
  });
  game.setInput(red.id, { mx: -1, my: 0, a: Math.PI, f: false });
  game.setInput(blue.id, { mx: -1, my: 0, a: Math.PI, f: false });
  run(game, 4);
  assert.ok(red.x >= TEAM_BASE_DEPTH + red.r - 0.01, 'red tanks must not enter the blue safe base');
  assert.ok(blue.x < TEAM_BASE_DEPTH, 'blue tanks can enter their own base');

  // Red fire crossing into blue base is removed before it can collide with a defender.
  Object.assign(red, { x: 1200, y: 1200, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0 });
  Object.assign(blue, { x: TEAM_BASE_DEPTH - 20, y: 1200, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0 });
  game.setInput(red.id, { mx: 0, my: 0, a: Math.PI, f: false });
  game.setInput(blue.id, { mx: 0, my: 0, a: 0, f: false });
  const redShot = {
    id: 9101, owner: red.id, x: TEAM_BASE_DEPTH + 15, y: 1200, vx: -900, vy: 0,
    r: 8, dmg: 40, hp: 5, life: 1, hit: new Set<number>(),
    kind: 'bullet' as const, angle: Math.PI, maxSpeed: 900, turnRate: 0,
  };
  const blueHp = blue.hp;
  game.bullets.push(redShot);
  game.step(DT);
  assert.equal(blue.hp, blueHp, 'enemy bullets cannot damage players inside the blue base');
  assert.ok(!game.bullets.some((bullet) => bullet.id === redShot.id), 'enemy bullets are stopped at the blue base edge');

  // Blue fire is likewise stopped before reaching the red home base.
  Object.assign(blue, { x: 2000, y: 1600, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0 });
  Object.assign(red, { x: ARENA_SIZE - TEAM_BASE_DEPTH + 20, y: 1600, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0 });
  const blueShot = {
    id: 9102, owner: blue.id, x: ARENA_SIZE - TEAM_BASE_DEPTH - 15, y: 1600, vx: 900, vy: 0,
    r: 8, dmg: 40, hp: 5, life: 1, hit: new Set<number>(),
    kind: 'bullet' as const, angle: 0, maxSpeed: 900, turnRate: 0,
  };
  const redHp = red.hp;
  game.bullets.push(blueShot);
  game.step(DT);
  assert.equal(red.hp, redHp, 'enemy bullets cannot damage players inside the red base');
  assert.ok(!game.bullets.some((bullet) => bullet.id === blueShot.id), 'enemy bullets are stopped at the red base edge');
});


test('Co-op Survival starts zombie waves without normal shapes and zombies chase survivors', () => {
  const game = new Game(seeded(61), 0, 'survival');
  const player = game.addPlayer('survivor')!;
  assert.equal(game.shapes.length, 0, 'survival should not spawn XP shapes');
  assert.equal(game.wave, 1, 'the first wave starts when the first player joins');

  run(game, 1.5);
  assert.ok(game.zombies.length > 0, 'the first wave should spawn zombies');
  const zombie = game.zombies[0]!;
  const before = Math.hypot(zombie.x - player.x, zombie.y - player.y);
  run(game, 1.0);
  const after = Math.hypot(zombie.x - player.x, zombie.y - player.y);
  assert.ok(after < before, 'zombies should move toward the nearest living player');
  assert.equal(game.shapes.length, 0, 'normal shape farming stays disabled in survival');
});

test('Co-op Survival: damaging zombies awards XP and records shared zombie kills', () => {
  const game = new Game(seeded(62), 0, 'survival');
  const player = game.addPlayer('shooter')!;
  run(game, 1.5);
  const zombie = game.zombies[0]!;
  Object.assign(player, {
    x: zombie.x - 100, y: zombie.y, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
    protT: 0,
  });
  Object.assign(zombie, {
    x: player.x + 78, y: player.y, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
    attackCooldown: 2,
  });
  const xpBefore = player.xp;
  game.bullets.push({
    id: 99001, owner: player.id, x: zombie.x, y: zombie.y, vx: 0, vy: 0,
    r: 8, dmg: zombie.hp + 100, hp: 5, life: 2, hit: new Set<number>(),
    kind: 'bullet', angle: 0, maxSpeed: 0, turnRate: 0,
  });
  game.step(DT);
  assert.ok(player.xp > xpBefore, 'zombie kills should award XP to contributing players');
  assert.equal(game.zombieKills, 1);
  assert.equal(player.kills, 1);
  assert.equal(zombie.hitFlash, 1, 'hits should trigger a visible impact flash');
  assert.ok(Math.hypot(zombie.kvx, zombie.kvy) > 0, 'projectile impacts should knock zombies back');
  assert.ok(zombie.staggerT > 0, 'strong impacts briefly stagger zombies');
  assert.equal(game.zombies.some((entry) => entry.id === zombie.id), false);
});

test('Co-op Survival advances to a harder wave after the arena is cleared', () => {
  const game = new Game(seeded(63), 0, 'survival');
  game.addPlayer('wave tester');
  const waveState = game as unknown as { waveSpawnRemaining: number; waveSpawned: number; waveIntermission: number };
  waveState.waveSpawnRemaining = 0;
  waveState.waveSpawned = 9; // Solo Wave 1's full quota has already spawned and been cleared.
  game.zombies = [];
  game.step(DT);
  run(game, 5.1);
  assert.equal(game.wave, 2);
  assert.ok(waveState.waveSpawnRemaining > 0, 'the next wave should queue a larger enemy group');
});

test('Co-op Survival ends the run when every player is eliminated', () => {
  const game = new Game(seeded(64), 0, 'survival');
  const player = game.addPlayer('last survivor')!;
  player.hp = 0;
  player.lastDamageT = game.time;
  game.step(DT);
  assert.equal(player.alive, false);
  assert.equal(game.survivalGameOver, true);
  assert.equal(game.survivalLeaderboard().gameOver, true);
});


test('Co-op Survival uses a smaller arena while FFA keeps the original dimensions', () => {
  const survival = new Game(seeded(71), 0, 'survival');
  const ffa = new Game(seeded(72), 0, 'ffa');
  assert.equal(survival.arenaSize, SURVIVAL_ARENA_SIZE);
  assert.ok(SURVIVAL_ARENA_SIZE < ARENA_SIZE);
  assert.equal(ffa.arenaSize, ARENA_SIZE);
  const player = survival.addPlayer('small map survivor')!;
  assert.ok(player.x >= 0 && player.x <= SURVIVAL_ARENA_SIZE);
  assert.ok(player.y >= 0 && player.y <= SURVIVAL_ARENA_SIZE);
  survival.setInput(player.id, { mx: 1, my: 1, a: 0, f: false });
  run(survival, 20);
  assert.ok(player.x <= SURVIVAL_ARENA_SIZE - player.r);
  assert.ok(player.y <= SURVIVAL_ARENA_SIZE - player.r);
});

test('Co-op Survival zombies separate physically instead of stacking', () => {
  const game = new Game(seeded(73), 0, 'survival');
  const player = game.addPlayer('crowd target')!;
  const spawn = (game as unknown as { spawnZombie: () => boolean }).spawnZombie.bind(game);
  spawn(); spawn();
  const [first, second] = game.zombies;
  assert.ok(first && second);
  Object.assign(player, { x: 1200, y: 1200, vx: 0, vy: 0 });
  Object.assign(first, { x: 900, y: 900, vx: 0, vy: 0, kvx: 0, kvy: 0, targetId: player.id });
  Object.assign(second, { x: 915, y: 900, vx: 0, vy: 0, kvx: 0, kvy: 0, targetId: player.id });
  run(game, 0.2);
  const separation = Math.hypot(first.x - second.x, first.y - second.y);
  assert.ok(separation >= first.r + second.r - 1, `zombies should keep body spacing, got ${separation}`);
});

test('Co-op Survival spreads zombie targets across available survivors', () => {
  const game = new Game(seeded(74), 0, 'survival');
  const firstPlayer = game.addPlayer('left survivor')!;
  const secondPlayer = game.addPlayer('right survivor')!;
  Object.assign(firstPlayer, { x: 950, y: 1100, vx: 0, vy: 0 });
  Object.assign(secondPlayer, { x: 1450, y: 1100, vx: 0, vy: 0 });
  const spawn = (game as unknown as { spawnZombie: () => boolean }).spawnZombie.bind(game);
  spawn(); spawn();
  const [first, second] = game.zombies;
  assert.ok(first && second);
  Object.assign(first, { x: 1200, y: 1000, targetId: null });
  Object.assign(second, { x: 1200, y: 1200, targetId: null });
  game.step(DT);
  assert.notEqual(first.targetId, second.targetId, 'nearby zombies should distribute pressure across the team');
});

test('Co-op Survival scales wave size gently as more players join', () => {
  const solo = new Game(seeded(75), 0, 'survival');
  solo.addPlayer('solo');
  const duo = new Game(seeded(76), 0, 'survival');
  duo.addPlayer('first');
  duo.addPlayer('second');
  const waveState = (game: Game) => (game as unknown as { waveSpawnRemaining: number }).waveSpawnRemaining;
  assert.ok(waveState(duo) > waveState(solo), 'more players should add enemies to a wave');
  assert.ok(waveState(duo) <= Math.ceil(waveState(solo) * 1.25), 'one extra player should not make the wave dramatically harder');
});
