import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classOptions, deriveStats, levelFromXp, statPointsEarned, totalXpForLevel } from '../src/shared/progression';
import { CLASSES, MAX_LEVEL, STAT_KEYS } from '../src/shared/config';

test('xp thresholds are strictly increasing and invert via levelFromXp', () => {
  for (let level = 2; level <= MAX_LEVEL; level++) {
    assert.ok(totalXpForLevel(level) > totalXpForLevel(level - 1));
    assert.equal(levelFromXp(totalXpForLevel(level)), level);
    assert.equal(levelFromXp(totalXpForLevel(level) - 1), level - 1);
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

test('class tree has the expected initial paths and all parent references resolve', () => {
  assert.deepEqual(classOptions('basic', 14), []);
  assert.deepEqual(classOptions('basic', 15).sort(), ['flank', 'machine', 'sniper', 'twin']);
  assert.deepEqual(classOptions('twin', 29), []);
  assert.deepEqual(classOptions('twin', 30), ['triple']);
  for (const cls of CLASSES) {
    if (cls.parent) assert.ok(CLASSES.some((parent) => parent.id === cls.parent), cls.id);
    for (const parentId of cls.alternateParents ?? []) {
      assert.ok(CLASSES.some((parent) => parent.id === parentId), cls.id);
    }
  }
  assert.ok(classOptions('auto3', 45).includes('auto5'));
  assert.ok(classOptions('overseer', 45).includes('overtrapper'));
});

test('each stat point improves its derived value in the right direction', () => {
  const base = deriveStats(10, STAT_KEYS.map(() => 0), 'basic');
  const upgraded = (key: string) => deriveStats(10, STAT_KEYS.map((stat) => (stat === key ? 5 : 0)), 'basic');
  assert.ok(upgraded('regen').regenFrac > base.regenFrac);
  assert.ok(upgraded('maxHealth').maxHp > base.maxHp);
  assert.ok(upgraded('bodyDamage').bodyDps > base.bodyDps);
  assert.ok(upgraded('bulletSpeed').bulletSpeed > base.bulletSpeed);
  assert.ok(upgraded('bulletPenetration').bulletHp > base.bulletHp);
  assert.ok(upgraded('bulletDamage').bulletDamage > base.bulletDamage);
  assert.ok(upgraded('reload').reload < base.reload);
  assert.ok(upgraded('moveSpeed').moveSpeed > base.moveSpeed);
});
