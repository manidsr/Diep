import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automaticStatLevel, classOptions, deriveStats, levelFromXp, totalXpForLevel } from '../src/shared/progression';
import { CLASS_BY_ID, CLASSES, MAX_LEVEL, TANK_SPECIALTIES } from '../src/shared/config';

test('xp thresholds are strictly increasing and invert via levelFromXp', () => {
  for (let level = 2; level <= MAX_LEVEL; level++) {
    assert.ok(totalXpForLevel(level) > totalXpForLevel(level - 1));
    assert.equal(levelFromXp(totalXpForLevel(level)), level);
    assert.equal(levelFromXp(totalXpForLevel(level) - 1), level - 1);
  }
  assert.equal(levelFromXp(1e9), MAX_LEVEL);
});

test('automatic stat growth advances every stat on every level and caps at level 45', () => {
  assert.equal(automaticStatLevel(1), 0);
  assert.equal(automaticStatLevel(2), 0.12);
  assert.ok(Math.abs(automaticStatLevel(45) - 5.28) < 1e-9);
  assert.ok(Math.abs(automaticStatLevel(100) - 5.28) < 1e-9);

  for (let level = 1; level < MAX_LEVEL; level++) {
    const current = deriveStats(level, 'basic');
    const next = deriveStats(level + 1, 'basic');
    assert.ok(next.maxHp > current.maxHp, `max health at level ${level + 1}`);
    assert.ok(next.regenFrac > current.regenFrac, `regeneration at level ${level + 1}`);
    assert.ok(next.bodyDps > current.bodyDps, `body damage at level ${level + 1}`);
    assert.ok(next.bulletSpeed > current.bulletSpeed, `bullet speed at level ${level + 1}`);
    assert.ok(next.bulletHp > current.bulletHp, `bullet penetration at level ${level + 1}`);
    assert.ok(next.bulletDamage > current.bulletDamage, `bullet damage at level ${level + 1}`);
    assert.ok(next.reload < current.reload, `reload gets faster at level ${level + 1}`);
    assert.ok(next.moveSpeed > current.moveSpeed, `movement speed at level ${level + 1}`);
  }
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
    assert.ok(TANK_SPECIALTIES[cls.specialty], `${cls.id} has a valid stat specialty`);
  }
  assert.ok(classOptions('auto3', 45).includes('auto5'));
  assert.ok(classOptions('overseer', 45).includes('overtrapper'));
});

test('tank specialties give distinct classes meaningful stat advantages', () => {
  const level = 30;
  const balanced = deriveStats(level, 'basic');
  const sniper = deriveStats(level, 'sniper');
  const rapid = deriveStats(level, 'machine');
  const octo = deriveStats(level, 'octo');
  const rammer = deriveStats(level, 'smasher');
  const trapper = deriveStats(level, 'trapper');
  const drone = deriveStats(level, 'overseer');
  const mobile = deriveStats(level, 'triAngle');
  const scatter = deriveStats(level, 'spread');

  assert.ok(sniper.bulletDamage > balanced.bulletDamage);
  assert.ok(scatter.bulletDamage > balanced.bulletDamage * 1.35);
  assert.ok(scatter.maxHp > balanced.maxHp);
  assert.ok(sniper.bulletSpeed > balanced.bulletSpeed);
  assert.ok(sniper.bulletHp > balanced.bulletHp);
  assert.ok(rapid.reload < balanced.reload);
  assert.ok(rapid.bulletSpeed > balanced.bulletSpeed);
  assert.equal(CLASS_BY_ID.octo.specialty, 'rapidFire');
  assert.equal(TANK_SPECIALTIES[CLASS_BY_ID.octo.specialty].bonuses.reload, 0.22);
  assert.ok(rammer.maxHp > balanced.maxHp);
  assert.ok(rammer.bodyDps > balanced.bodyDps);
  assert.ok(rammer.moveSpeed > balanced.moveSpeed);
  assert.ok(trapper.maxHp > balanced.maxHp);
  assert.ok(trapper.regenFrac > balanced.regenFrac);
  assert.ok(drone.bulletDamage > balanced.bulletDamage);
  assert.ok(mobile.moveSpeed > balanced.moveSpeed);
});
