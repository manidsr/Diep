import { runAllCombatBenchmarks } from '../tests/combat-bench';

const metrics = runAllCombatBenchmarks();
const sorted = [...metrics].sort((a, b) => b.sustainedDps - a.sustainedDps);
const column = (value: string, width: number) => value.padEnd(width).slice(0, width);
console.log('Combat lab: level 45 with fixed max-stat allocations for each role.');
console.log('DPS is measured against a stationary target through the server simulation.');
console.log('Range is the furthest sampled centre-to-centre hit; + means the 2800u sample ceiling was reached.');
console.log('Survival is passive time-to-kill from a moderate-pressure Basic tank (20s cap); defender auto-weapons are disabled.');
console.log('');
console.log(
  column('CLASS', 17) + column('ROLE', 10) +
  'DPS'.padStart(9) + 'BURST/0.25s'.padStart(13) +
  'RANGE'.padStart(9) + 'SURVIVAL'.padStart(12),
);
for (const metric of sorted) {
  const survival = metric.survivedBenchmark
    ? metric.survivalSeconds.toFixed(1) + 's+'
    : metric.survivalSeconds.toFixed(1) + 's';
  console.log(
    column(metric.name, 17) + column(metric.role, 10) +
    metric.sustainedDps.toFixed(1).padStart(9) +
    metric.burstDamage.toFixed(1).padStart(13) +
    (String(metric.effectiveRange) + (metric.rangeAtCeiling ? 'u+' : 'u')).padStart(9) +
    survival.padStart(12),
  );
}
console.log('');
console.log('Highest sustained DPS (raw; compare within role before changing balance):');
for (const metric of sorted.slice(0, 10)) {
  console.log('  ' + metric.name + ' (' + metric.role + '): ' + metric.sustainedDps.toFixed(1) + ' DPS');
}
console.log('\nMeasured ' + metrics.length + ' / 54 tank classes.');
