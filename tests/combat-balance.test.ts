import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS } from '../src/shared/config';
import { runAllCombatBenchmarks } from './combat-bench';

test('combat benchmark measures every tank through the real server simulation', () => {
  const metrics = runAllCombatBenchmarks();
  assert.equal(metrics.length, 54);
  assert.deepEqual(metrics.map((metric) => metric.id).sort(), [...CLASS_IDS].sort());

  for (const metric of metrics) {
    assert.ok(metric.sustainedDps > 0, metric.id + ' should deal measurable damage');
    assert.ok(metric.burstDamage > 0, metric.id + ' should register a burst window');
    assert.ok(metric.effectiveRange > 0, metric.id + ' should have a measured engagement distance');
    assert.ok(metric.survivalSeconds > 0, metric.id + ' should have a survivability result');
    const minimumDps = { cannon: 50, ordnance: 55, drone: 55, trap: 55, turret: 15, rammer: 100 }[metric.role];
    assert.ok(metric.sustainedDps >= minimumDps,
      metric.name + ' is underpowered for its ' + metric.role + ' role: ' + metric.sustainedDps.toFixed(1) + ' DPS < ' + minimumDps);
    assert.equal(typeof metric.rangeAtCeiling, 'boolean');
    assert.ok(Number.isFinite(metric.sustainedDps), metric.id);
    assert.ok(Number.isFinite(metric.burstDamage), metric.id);
    assert.ok(Number.isFinite(metric.effectiveRange), metric.id);
    assert.ok(Number.isFinite(metric.survivalSeconds), metric.id);
  }

  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const streamliner = byId.get('streamliner')!;
  const gunner = byId.get('gunner')!;
  assert.ok(
    streamliner.sustainedDps <= gunner.sustainedDps * 1.1,
    'Streamliner should remain within 10% of its Gunner baseline after targeted tuning',
  );
});
