import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/server/game';
import { CLASSES, CLASS_BY_ID, MAX_LEVEL } from '../src/shared/config';
import { classOptions, totalXpForLevel } from '../src/shared/progression';
import { seeded } from './helpers';

test('class tree is consistent: unique ids, valid parents, minLevel increases down the tree', () => {
  assert.equal(new Set(CLASSES.map((c) => c.id)).size, CLASSES.length);
  for (const c of CLASSES) {
    assert.ok(c.barrels.length > 0, c.id);
    assert.ok(c.minLevel <= MAX_LEVEL, c.id);
    if (c.parent) assert.ok(CLASS_BY_ID[c.parent].minLevel < c.minLevel, c.id);
  }
});

test('tier-3 classes unlock only at level 45 from their tier-2 parent', () => {
  const t3 = CLASSES.filter((c) => c.minLevel === 45);
  assert.deepEqual(t3.map((c) => c.id).sort(), ['octo', 'penta', 'ranger', 'streamliner']);
  for (const c of t3) {
    assert.deepEqual(classOptions(c.parent!, 44), [], c.id);
    assert.deepEqual(classOptions(c.parent!, 45), [c.id]);
  }
});

test('player can evolve basic -> flank -> quad -> octo and gets 8 barrel cooldowns', () => {
  const g = new Game(seeded(2), 0);
  const p = g.addPlayer('a')!;
  g.addXp(p, totalXpForLevel(44));
  assert.ok(g.chooseClass(p.id, 'flank'));
  assert.ok(g.chooseClass(p.id, 'quad'));
  assert.equal(g.chooseClass(p.id, 'octo'), false); // still level 44
  g.addXp(p, totalXpForLevel(45));
  assert.ok(g.chooseClass(p.id, 'octo'));
  assert.equal(p.cd.length, 8);
});
