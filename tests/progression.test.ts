import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classOptions, deriveStats, levelFromXp, statPointsEarned, totalXpForLevel } from '../src/shared/progression';
import { CLASSES, MAX_LEVEL, STAT_KEYS } from '../src/shared/config';

test('xp thresholds are strictly increasing and invert via levelFromXp', () => {
  for (let l = 2; l <= MAX_LEVEL; l++) {
    assert.ok(totalXpForLevel(l) > totalXpForLevel(l - 1));
    assert.equal(levelFromXp(totalXpForLevel(l)), l);
    assert.equal(levelFromXp(totalXpForLevel(l) - 1), l - 1);
  }
  assert.equal(levelFromXp(1e9), MAX_LEVEL);
});

test('stat points: 1 per level to 28, then every 3rd level => 33 at level 45', () => {
  assert.equal(statPointsEarned(1), 0);
  assert.equal(statPointsEarned(2), 1);
  assert.equal(statPointsEarned(28), 27);
  assert.equal(statPointsEarned(29), 27);
  assert.equal(statPointsEarned(30), 28);
  assert.equal(statPointsEarned(45), 33);
});

test('class tree: tier 1 at 15, tier 2 at 30; parents exist', () => {
  assert.deepEqual(classOptions('basic', 14), []);
  assert.deepEqual(classOptions('basic', 15).sort(), ['flank', 'machine', 'sniper', 'twin']);
  assert.deepEqual(classOptions('twin', 29), []);
  assert.deepEqual(classOptions('twin', 30), ['triple']);
  for (const c of CLASSES) {\n    if (c.parent) assert.ok(CLASSES.some((p) => p.id === c.parent), c.id);\n    for (const parent of c.alternateParents ?? []) assert.ok(CLASSES.some((p) => p.id === parent), c.id);\n  }\n  assert.ok(classOptions('auto3', 45).includes('auto5'));\n  assert.ok(classOptions('overseer', 45).includes('overtrapper'));
});

test('each stat point improves its derived value in the right direction', () => {
  const base = deriveStats(10, STAT_KEYS.map(() => 0), 'basic');
  const up = (k: string) => deriveStats(10, STAT_KEYS.map((s) => (s === k ? 5 : 0)), 'basic');
  assert.ok(up('regen').regenFrac > base.regenFrac);
  assert.ok(up('maxHealth').maxHp > base.maxHp);
  assert.ok(up('bodyDamage').bodyDps > base.bodyDps);
  assert.ok(up('bulletSpeed').bulletSpeed > base.bulletSpeed);
  assert.ok(up('bulletPenetration').bulletHp > base.bulletHp);
  assert.ok(up('bulletDamage').bulletDamage > base.bulletDamage);
  assert.ok(up('reload').reload < base.reload);
  assert.ok(up('moveSpeed').moveSpeed > base.moveSpeed);
});
