import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Bullet, type Player, type Zombie } from '../src/server/game';
import { CLASS_BY_ID, PLAYER_PIERCE_COST, REGEN_DELAY_S, type BarrelDef } from '../src/shared/config';
import { seeded } from './helpers';

const DT = 1 / 30;
type Node = { k: number; o: unknown };
type Core = {
  fireBarrel(p: Player, b: BarrelDef, direction: number): void;
  reloadDelay(p: Player): number;
  maintainDrones(p: Player, dt: number): void;
  updatePlayer(p: Player, dt: number): void;
  updateZombie(z: Zombie, dt: number): void;
  updateHealthDrops(dt: number): void;
  updateXpDrops(dt: number): void;
  collectXpDrop(d: { id: number; x: number; y: number; r: number; xp: number; life: number; age: number }): void;
  spawnHealthDrop(z: Zombie): void;
  updateRevives(dt: number): void;
  applyZombieKnockback(z: Zombie, x: number, y: number, damage: number, speed: number, p?: Player): void;
  hurtPlayer(p: Player, amount: number, byId: number | null, name: string): void;
  refresh(p: Player): void;
  collidePair(a: Node, b: Node, dt: number): void;
};
const core = (g: Game) => g as unknown as Core;
function setup(rng: () => number = seeded(41)) {
  const game = new Game(rng, 0, 'survival');
  const player = game.addPlayer('upgrade tester')!;
  game.zombies = [];
  Object.assign(player, { x: 400, y: 400, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
  return { game, player, c: core(game) };
}
function zombie(overrides: Partial<Zombie> = {}): Zombie {
  return {
    id: 900, x: 442, y: 400, vx: 0, vy: 0, kvx: 0, kvy: 0, r: 26,
    hp: 500, maxHp: 500, speed: 0, damage: 0, xp: 10, kind: 'shambler',
    angle: 0, targetId: null, staggerT: 0, hitFlash: 0, hitAngle: 0,
    bossKind: null, bossPhase: 'idle', bossTimer: 0, bossCooldown: 0,
    bossAimX: 0, bossAimY: 0, bossPattern: 0,
    specialPhase: 'idle', specialTimer: 0, specialCooldown: 0, specialAimX: 0, specialAimY: 0,
    attackCooldown: 0, damageBy: new Map<number, number>(), slowT: 0, ...overrides,
  } as Zombie;
}
function shotFor(p: Player, z: Zombie, overrides: Partial<Bullet> = {}): Bullet {
  return {
    id: 9900, owner: p.id, x: z.x, y: z.y, vx: 500, vy: 0, r: 8,
    dmg: 10, hp: 30, life: 1, hit: new Set<number>(), kind: 'bullet',
    angle: 0, maxSpeed: 500, turnRate: 0, ...overrides,
  };
}
function fire(g: Game, p: Player, classId = 'basic', index = 0): Bullet {
  assert.ok(g.debugSetClass(p.id, classId));
  core(g).fireBarrel(p, CLASS_BY_ID[classId]!.barrels[index]!, 0);
  return [...g.bullets].reverse().find((b) => b.owner === p.id)!;
}
function hit(g: Game, b: Bullet, z: Zombie) {
  if (!g.zombies.includes(z)) g.zombies.push(z);
  core(g).collidePair({ k: 2, o: b }, { k: 3, o: z }, DT);
}

const ids = [
  'heavyRounds','rapidLoader','blastRounds','lifesteal','droneWingman','cryoRounds',
  'medicalSupplies','emergencyShield','piercingRounds','explosiveImpact','longshot',
  'ironSkin','fleetfoot','fieldMedic','criticalCore','bossHunter','executioner',
  'scavenger','luckyFind','xpMagnet','steadyAim','recoilDampers','hotRounds',
  'rescueProtocol','secondWind','armorPiercer','overdrive','chainShot','adrenaline',
  'shrapnel','vitalCore','concussiveRounds','droneTactician',
] as const;

test('all 33 Survival upgrade cards are selectable and grant their advertised ID', () => {
  const { game, player } = setup();
  assert.equal(ids.length, 33);
  for (const id of ids) {
    player.rewardOffers.push({ cards: [{ id, title: id, description: id, rarity: 'common' }], timeRemaining: 20 });
    assert.equal(game.chooseSurvivalReward(player.id, id), true, id);
    assert.equal(player.survivalPerks[id], 1, id);
  }
});

test('damage, reload, critical, speed, spread, recoil and penetration cards affect real shots', () => {
  {
    const { game, player, c } = setup();
    player.survivalPerks.heavyRounds = 2;
    const b = fire(game, player);
    assert.ok(Math.abs(b.dmg - player.d.bulletDamage * 1.3) < 0.001);
    player.survivalPerks.rapidLoader = 2;
    assert.ok(Math.abs(c.reloadDelay(player) - player.d.reload * 0.81) < 0.001);
  }
  {
    const { game, player } = setup();
    player.survivalPerks.longshot = 2;
    const b = fire(game, player, 'skimmer');
    assert.equal(b.kind, 'missile');
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - player.d.bulletSpeed * 0.52 * 1.21) < 0.01);
  }
  {
    const { game, player } = setup(() => 0);
    player.survivalPerks.criticalCore = 1;
    const b = fire(game, player);
    assert.equal(b.dmg, player.d.bulletDamage * 2);
  }
  {
    const { game, player } = setup(() => 1);
    player.survivalPerks.steadyAim = 1;
    const b = fire(game, player, 'machine');
    assert.ok(Math.abs(b.angle - 0.17 * 0.88) < 0.0001);
  }
  {
    const a = setup(), b = setup();
    fire(a.game, a.player);
    b.player.survivalPerks.recoilDampers = 1;
    fire(b.game, b.player);
    assert.ok(Math.abs(Math.hypot(b.player.rvx, b.player.rvy) / Math.hypot(a.player.rvx, a.player.rvy) - 0.88) < 0.001);
  }
  {
    const { game, player } = setup();
    player.survivalPerks.piercingRounds = 1;
    const b = fire(game, player);
    assert.equal(b.hp, 2 + PLAYER_PIERCE_COST);
    const z1 = zombie({ id: 901, x: b.x, y: b.y }), z2 = zombie({ id: 902, x: b.x, y: b.y });
    hit(game, b, z1);
    assert.equal(b.hp, 2);
    hit(game, b, z2);
    assert.ok(z1.hp < z1.maxHp && z2.hp < z2.maxHp);
  }
});

test('blast, shrapnel, explosive and cryo cards work on impacts, including non-standard weapons', () => {
  for (const [id, shots, radius] of [['blastRounds', 4, 64], ['shrapnel', 3, 70], ['explosiveImpact', 0, 42]] as const) {
    const { game, player } = setup();
    player.survivalPerks[id] = 1;
    player.shotsFired = shots;
    const b = fire(game, player);
    assert.equal(b.explosionRadius, radius, id);
    const direct = zombie({ id: 910 + shots, x: b.x, y: b.y });
    const near = zombie({ id: 920 + shots, x: b.x + 45, y: b.y });
    game.zombies = [direct, near];
    hit(game, b, direct);
    assert.ok(near.hp < near.maxHp, id + ' splashes nearby enemies');
  }
  {
    const { game, player } = setup();
    player.survivalPerks.explosiveImpact = 1;
    player.survivalPerks.cryoRounds = 1;
    const b = fire(game, player, 'skimmer');
    assert.equal(b.explosionRadius, 42);
    assert.equal(b.chilled, true);
    const z = zombie({ id: 930, x: b.x, y: b.y });
    hit(game, b, z);
    assert.ok(z.slowT >= 3);
  }
});

test('Firework rockets burst into sixteen pellets on direct tank impact', () => {
  const game = new Game(seeded(51), 0, 'ffa');
  const owner = game.addPlayer('Firework')!, victim = game.addPlayer('Target')!;
  Object.assign(owner, { x: 300, y: 300, protT: 0 });
  Object.assign(victim, { x: 350, y: 300, protT: 0 });
  const b = fire(game, owner, 'firework');
  b.x = victim.x; b.y = victim.y;
  const before = victim.hp;
  core(game).collidePair({ k: 0, o: victim }, { k: 2, o: b }, DT);
  assert.ok(victim.hp < before, 'rocket impact deals direct damage');
  const pellets = game.bullets.filter((entry) => entry.owner === owner.id && entry.kind === 'bullet');
  assert.equal(pellets.length, 16);
  assert.ok(pellets.every((pellet) => pellet.hit.has(victim.id)));
  const after = victim.hp;
  core(game).collidePair({ k: 0, o: victim }, { k: 2, o: pellets[0]! }, DT);
  assert.equal(victim.hp, after, 'the burst does not double-hit the direct target on the same tick');
  assert.match(CLASS_BY_ID.firework!.description, /impact/i);
});

test('lifesteal, burn, chain, splash and enemy-specific damage cards apply on real hits', () => {
  {
    const { game, player, c } = setup();
    player.hp = 10;
    player.survivalPerks.lifesteal = 2;
    player.survivalPerks.hotRounds = 1;
    player.survivalPerks.chainShot = 1;
    const direct = zombie({ id: 941 }), chain = zombie({ id: 942, x: 492 });
    const b = shotFor(player, direct, { dmg: 20 });
    game.zombies = [direct, chain];
    const oldHp = player.hp;
    hit(game, b, direct);
    assert.ok(player.hp > oldHp);
    assert.ok((direct.burnT ?? 0) >= 3 && (direct.burnDps ?? 0) > 0);
    assert.ok(chain.hp < chain.maxHp);
    const beforeBurn = direct.hp;
    c.updateZombie(direct, 0.51);
    assert.ok(direct.hp < beforeBurn);
  }
  {
    const { game, player } = setup();
    player.survivalPerks.cryoRounds = 1;
    const direct = zombie({ id: 943 }), near = zombie({ id: 944, x: 482 });
    const b = shotFor(player, direct, { dmg: 20, explosionRadius: 60, chilled: true });
    game.zombies = [direct, near];
    hit(game, b, direct);
    assert.ok(near.hp < near.maxHp && near.slowT >= 3);
  }
  for (const [perk, enemy, hpBefore, expected] of [
    ['armorPiercer', { kind: 'armoured' }, 500, 7.6],
    ['bossHunter', { bossKind: 'breaker' }, 500, 9.744],
    ['executioner', { hp: 150, maxHp: 500 }, 150, 11.8],
    ['adrenaline', {}, 500, 11.2],
  ] as const) {
    const { game, player } = setup();
    player.survivalPerks[perk] = 1;
    if (perk === 'armorPiercer') player.survivalPerks.armorPiercer = 2;
    if (perk === 'adrenaline') player.hp = player.maxHp * 0.3;
    const z = zombie({ id: 950, x: 442, y: 400, ...enemy });
    const b = shotFor(player, z, { dmg: 10 });
    hit(game, b, z);
    assert.ok(Math.abs((hpBefore - z.hp) - expected) < 0.001, perk);
  }
});

test('health, defence, XP and magnet cards produce their stated rewards', () => {
  {
    const { game, player, c } = setup();
    const base = player.maxHp;
    player.hp = base * 0.5;
    player.survivalPerks.vitalCore = 2;
    c.refresh(player);
    assert.ok(Math.abs(player.maxHp / base - 1.16) < 0.001);
    assert.ok(Math.abs(player.hp / player.maxHp - 0.5) < 0.001);
    player.survivalPerks.ironSkin = 2;
    const before = player.hp;
    c.hurtPlayer(player, 10, null, 'test');
    assert.ok(Math.abs((before - player.hp) - 8.8) < 0.001);
  }
  {
    const { game, player, c } = setup();
    player.hp = player.maxHp * 0.34;
    player.survivalPerks.emergencyShield = 1;
    c.hurtPlayer(player, player.maxHp * 0.08, null, 'critical hit');
    assert.ok(player.hp <= player.maxHp * 0.28 && player.protT >= 1.7);
  }
  {
    const { game, player, c } = setup();
    player.survivalPerks.fieldMedic = 2;
    player.hp = 10;
    player.lastDamageT = game.time - REGEN_DELAY_S - 1;
    const expected = player.maxHp * player.d.regenFrac * 1.36 * DT;
    c.updatePlayer(player, DT);
    assert.ok(Math.abs((player.hp - 10) - expected) < 0.01);
  }
  {
    const { game, player, c } = setup();
    player.hp = 10;
    player.survivalPerks.medicalSupplies = 2;
    game.healthDrops.push({ id: 1, x: player.x, y: player.y, r: 10, heal: 20, life: 20 });
    c.updateHealthDrops(DT);
    assert.ok(Math.abs(player.hp - 37.2) < 0.001);
  }
  {
    const { game, player, c } = setup(() => 0.2);
    player.survivalPerks.luckyFind = 1;
    c.spawnHealthDrop(zombie({ id: 951 }));
    assert.equal(game.healthDrops.length, 1);
  }
  {
    const { player, c } = setup();
    player.survivalPerks.scavenger = 1;
    c.collectXpDrop({ id: 2, x: 0, y: 0, r: 8, xp: 100, life: 20, age: 0 });
    assert.equal(player.xp, 112);
  }
  {
    const { game, player, c } = setup();
    const teammate = game.addPlayer('nearby teammate')!;
    game.zombies = [];
    player.survivalPerks.xpMagnet = 3;
    Object.assign(player, { x: 1400, y: 400 });
    Object.assign(teammate, { x: 1020, y: 400 });
    const drop = { id: 3, x: 1000, y: 400, r: 8, xp: 100, life: 20, age: 0 };
    game.xpDrops.push(drop);
    c.updateXpDrops(DT);
    assert.ok(drop.x > 1000, 'a closer ally without Magnet cannot suppress the perk owner');
  }
});

test('rescue, revive and damage-based knockback upgrades work', () => {
  {
    const { game, player, c } = setup();
    const downed = game.addPlayer('downed')!;
    game.zombies = [];
    Object.assign(player, { x: 1000, y: 1000, vx: 0, vy: 0 });
    Object.assign(downed, { x: 1150, y: 1000, alive: true, downed: true, hp: 0, reviveProgress: 0 });
    player.survivalPerks.rescueProtocol = 3;
    c.updateRevives(2);
    assert.equal(downed.downed, false);
  }
  {
    const { game, player, c } = setup();
    const helper = game.addPlayer('helper')!;
    game.zombies = [];
    Object.assign(player, { x: 1000, y: 1000, alive: true, downed: true, hp: 0, reviveProgress: 0 });
    Object.assign(helper, { x: 1050, y: 1000, vx: 0, vy: 0 });
    player.survivalPerks.secondWind = 2;
    c.updateRevives(3);
    assert.equal(player.downed, false);
    assert.ok(Math.abs(player.hp / player.maxHp - 0.7) < 0.001);
    assert.ok(Math.abs(player.protT - 2.6) < 0.001);
  }
  {
    const a = setup(), b = setup();
    const z1 = zombie(), z2 = zombie();
    core(a.game).applyZombieKnockback(z1, 1, 0, 20, 500, a.player);
    b.player.survivalPerks.concussiveRounds = 1;
    core(b.game).applyZombieKnockback(z2, 1, 0, 20, 500, b.player);
    assert.ok(Math.abs(z2.kvx / z1.kvx - 1.2) < 0.001);
  }
});

test('movement and drone-support cards improve real player and drone movement/damage', () => {
  {
    const { game, player, c } = setup();
    player.survivalPerks.fleetfoot = 2;
    game.setInput(player.id, { mx: 1, my: 0, a: 0, f: false });
    c.updatePlayer(player, 0.1);
    const response = 1 - Math.exp(-0.7);
    assert.ok(Math.abs(player.vx / (player.d.moveSpeed * response) - 1.12) < 0.001);
  }
  {
    const { game, player, c } = setup();
    player.survivalPerks.overdrive = 2;
    game.setInput(player.id, { mx: 1, my: 0, a: 0, f: true });
    c.updatePlayer(player, 0.1);
    const response = 1 - Math.exp(-0.7);
    assert.ok(Math.abs(player.vx / (player.d.moveSpeed * response) - 1.12) < 0.001);
  }
  {
    const { game, player, c } = setup();
    player.survivalPerks.droneWingman = 2;
    for (let i = 0; i < 6; i++) c.maintainDrones(player, 0.5);
    assert.equal(game.bullets.filter((b) => b.owner === player.id && b.kind === 'drone').length, 2);
  }
  {
    const { game, player, c } = setup();
    assert.ok(game.debugSetClass(player.id, 'overseer'));
    player.survivalPerks.droneTactician = 1;
    player.survivalPerks.heavyRounds = 1;
    player.survivalPerks.longshot = 1;
    player.survivalPerks.cryoRounds = 1;
    player.survivalPerks.explosiveImpact = 1;
    for (let i = 0; i < 12; i++) c.maintainDrones(player, 0.5);
    const d = game.bullets.find((b) => b.owner === player.id && b.kind === 'drone')!;
    const cls = CLASS_BY_ID.overseer!;
    assert.ok(Math.abs(d.dmg - player.d.bulletDamage * (cls.droneDamageMul ?? 0.85) * 1.15 * 1.15) < 0.001);
    assert.ok(Math.abs(d.maxSpeed - 300 * cls.droneSpeedMul! * 1.08 * 1.1) < 0.001);
    assert.equal(d.chilled, true);
    assert.equal(d.explosionRadius, 42);
  }
});
