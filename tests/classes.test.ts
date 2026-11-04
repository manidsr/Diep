import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/server/game';
import { CLASSES, CLASS_BY_ID, CLASS_IDS, MAX_LEVEL } from '../src/shared/config';
import { classOptions, totalXpForLevel } from '../src/shared/progression';
import { seeded } from './helpers';

test('full class roster has 54 unique, valid definitions and reachable parents', () => {
  assert.equal(CLASSES.length, 54);
  assert.equal(new Set(CLASS_IDS).size, CLASSES.length);
  for (const cls of CLASSES) {
    assert.ok(cls.minLevel <= MAX_LEVEL, cls.id);
    assert.ok(cls.description.length > 10, cls.id);
    assert.ok(cls.barrels.length > 0 || cls.smasher, cls.id);
    const parents = [...(cls.parent ? [cls.parent] : []), ...(cls.alternateParents ?? [])];
    for (const parentId of parents) {
      assert.ok(CLASS_BY_ID[parentId], `${cls.id} has missing parent ${parentId}`);
      assert.ok(CLASS_BY_ID[parentId].minLevel < cls.minLevel, `${cls.id} must unlock after ${parentId}`);
    }
  }
});

test('the first and second evolution tiers unlock at their intended levels', () => {
  assert.deepEqual(classOptions('basic', 14), []);
  assert.deepEqual(classOptions('basic', 15).sort(), ['flank', 'machine', 'sniper', 'twin']);
  assert.deepEqual(classOptions('twin', 29), []);
  assert.deepEqual(classOptions('twin', 30), ['triple']);
  assert.deepEqual(classOptions('flank', 30).sort(), ['quad', 'triAngle', 'twinFlank']);
});

test('all 36 level-45 classes unlock only at level 45 from a valid parent', () => {
  const tierThree = CLASSES.filter((cls) => cls.minLevel === 45);
  assert.equal(tierThree.length, 36);
  for (const cls of tierThree) {
    const parents = [...(cls.parent ? [cls.parent] : []), ...(cls.alternateParents ?? [])];
    assert.ok(parents.length > 0, cls.id);
    for (const parent of parents) {
      assert.ok(!classOptions(parent, 44).includes(cls.id), cls.id);
      assert.ok(classOptions(parent, 45).includes(cls.id), cls.id);
    }
  }
});

test('alternate evolution paths are supported', () => {
  assert.ok(classOptions('auto3', 45).includes('auto5'));
  assert.ok(classOptions('auto3', 45).includes('autoGunner'));
  assert.ok(classOptions('overseer', 45).includes('battleship'));
  assert.ok(classOptions('overseer', 45).includes('overtrapper'));
  assert.ok(classOptions('trapper', 45).includes('overtrapper'));
  assert.ok(classOptions('hunter', 45).includes('streamliner'));
  assert.ok(classOptions('gunner', 45).includes('streamliner'));
  assert.ok(classOptions('trapper', 45).includes('gunnerTrapper'));
  assert.ok(classOptions('gunner', 45).includes('gunnerTrapper'));
});

test('player can evolve basic -> flank -> quad -> octo with eight barrel cooldowns', () => {
  const game = new Game(seeded(2), 0);
  const player = game.addPlayer('a')!;
  game.addXp(player, totalXpForLevel(44));
  assert.ok(game.chooseClass(player.id, 'flank'));
  assert.ok(game.chooseClass(player.id, 'quad'));
  assert.equal(game.chooseClass(player.id, 'octo'), false);
  game.addXp(player, totalXpForLevel(45));
  assert.ok(game.chooseClass(player.id, 'octo'));
  assert.equal(player.cd.length, 8);
});

test('alternate evolution works for Auto 3 -> Auto 5', () => {
  const game = new Game(seeded(5), 0);
  const player = game.addPlayer('a')!;
  game.addXp(player, totalXpForLevel(30));
  assert.ok(game.chooseClass(player.id, 'auto3'));
  game.addXp(player, totalXpForLevel(45));
  assert.ok(game.chooseClass(player.id, 'auto5'));
  assert.equal(player.autoCd.length, 5);
});
