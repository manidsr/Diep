import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runClassCombatBenchmark } from './combat-bench';

test('combat benchmark measures real damage, burst, range and passive durability for each archetype', () => {
  const representativeClasses = ['basic', 'trapper', 'overlord', 'firework', 'auto3', 'smasher'];
  for (const classId of representativeClasses) {
    const metric = runClassCombatBenchmark(classId);
    assert.equal(metric.id, classId);
    assert.ok(metric.sustainedDps > 0, classId + ' should deal measurable damage in its combat scenario');
    assert.ok(metric.burstDamage > 0, classId + ' should register a burst window');
    assert.ok(metric.effectiveRange > 0, classId + ' should have a measured engagement distance');
    assert.ok(metric.survivalSeconds > 0, classId + ' should have a survivability result');
    assert.ok(Number.isFinite(metric.sustainedDps));
    assert.ok(Number.isFinite(metric.burstDamage));
    assert.ok(Number.isFinite(metric.effectiveRange));
    assert.ok(Number.isFinite(metric.survivalSeconds));
  }
});
