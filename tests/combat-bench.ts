import { Game, type Player } from '../src/server/game';
import { CLASS_BY_ID, CLASSES, SERVER_TICK_HZ } from '../src/shared/config';
import { totalXpForLevel } from '../src/shared/progression';
import { seeded } from './helpers';

const DT = 1 / SERVER_TICK_HZ;
const DPS_SECONDS = 8;
const RANGE_SECONDS = 4.5;
const SURVIVAL_LIMIT_SECONDS = 20;
const BURST_TICKS = Math.round(0.25 * SERVER_TICK_HZ);
const OFFENCE_STATS = [0, 0, 0, 7, 7, 7, 7, 0];
const RAMMER_STATS = [7, 7, 7, 0, 0, 0, 0, 7];
const DEFENCE_STATS = [7, 7, 7, 0, 0, 0, 0, 7];
const INCOMING_STATS = [0, 0, 0, 0, 0, 4, 4, 0];
const RANGE_SAMPLES = [100, 150, 220, 320, 420, 520, 680, 850, 1050, 1300, 1600, 1900, 2200, 2500, 2800] as const;
const TRAP_RANGE_SAMPLES = [90, 100, 110, 120, 140, 160, 200, 260, 360] as const;
const LAB_X = 200;
const LAB_Y = 1500;
const DUMMY_HP = 1_000_000_000;

export interface CombatMetric {
  id: string;
  name: string;
  role: 'cannon' | 'ordnance' | 'drone' | 'trap' | 'turret' | 'rammer';
  sustainedDps: number;
  burstDamage: number;
  effectiveRange: number;
  rangeAtCeiling: boolean;
  survivalSeconds: number;
  survivedBenchmark: boolean;
}

interface Pair {
  game: Game;
  attacker: Player;
  target: Player;
  attackerX: number;
  attackerY: number;
  targetX: number;
  targetY: number;
}

function seedFor(id: string, distance: number): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash ^ Math.round(distance * 10)) >>> 0;
}

function applyStats(game: Game, player: Player, allocation: number[]) {
  for (let index = 0; index < allocation.length; index++) {
    for (let point = 0; point < allocation[index]; point++) {
      if (!game.upgradeStat(player.id, index)) {
        throw new Error('Could not apply benchmark stat allocation for ' + player.cls + ', stat ' + index);
      }
    }
  }
}

function preparePair(
  classId: string,
  distance: number,
  options: { defensiveTarget?: boolean; targetHp?: number; seed?: number } = {},
): Pair {
  const game = new Game(seeded(options.seed ?? seedFor(classId, distance)), 0);
  game.spawnShape = () => {};
  const attacker = game.addPlayer('benchmark-attacker');
  const target = game.addPlayer('benchmark-target');
  if (!attacker || !target) throw new Error('Could not create benchmark players');

  game.addXp(attacker, totalXpForLevel(45));
  if (!game.debugSetClass(attacker.id, classId)) throw new Error('Unknown benchmark class: ' + classId);
  applyStats(game, attacker, CLASS_BY_ID[classId].smasher ? RAMMER_STATS : OFFENCE_STATS);

  game.addXp(target, totalXpForLevel(45));
  if (options.defensiveTarget) applyStats(game, target, DEFENCE_STATS);

  const attackerX = LAB_X;
  const attackerY = LAB_Y;
  const targetX = LAB_X + distance;
  const targetY = LAB_Y;
  Object.assign(attacker, {
    x: attackerX, y: attackerY, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
    protT: 0, alive: true,
  });
  Object.assign(target, {
    x: targetX, y: targetY, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
    protT: 0, alive: true,
  });

  target.hp = options.targetHp ?? DUMMY_HP;
  target.maxHp = options.targetHp ?? DUMMY_HP;
  if (!options.defensiveTarget) target.d.regenFrac = 0;

  const cls = CLASS_BY_ID[classId];
  const needsSecondary = classId !== 'firework' && cls.barrels.some((barrel) => barrel.trigger === 'secondary');
  game.setInput(attacker.id, {
    mx: 0, my: 0, a: 0,
    f: !cls.smasher || cls.barrels.length > 0,
    secondary: needsSecondary,
  });
  game.setInput(target.id, { mx: 0, my: 0, a: Math.PI, f: false, secondary: false });
  return { game, attacker, target, attackerX, attackerY, targetX, targetY };
}

function freeze(pair: Pair) {
  const reset = (player: Player, x: number, y: number) => {
    player.x = x; player.y = y;
    player.vx = 0; player.vy = 0;
    player.kvx = 0; player.kvy = 0;
    player.rvx = 0; player.rvy = 0;
  };
  reset(pair.target, pair.targetX, pair.targetY);
  reset(pair.attacker, pair.attackerX, pair.attackerY);
}

function runDamageScenario(classId: string, distance: number, seconds: number, seed?: number) {
  const pair = preparePair(classId, distance, { seed });
  const cls = CLASS_BY_ID[classId];
  const pureRammer = !!cls.smasher && cls.barrels.length === 0 && (cls.turretCount ?? 0) === 0;
  if (pureRammer) {
    pair.targetX = pair.attackerX + pair.attacker.r + pair.target.r - 2;
    pair.target.x = pair.targetX;
  }

  const startHp = pair.target.hp;
  const ticks: number[] = [];
  const count = Math.ceil(seconds * SERVER_TICK_HZ);
  let previousHp = pair.target.hp;
  for (let i = 0; i < count; i++) {
    pair.game.step(DT);
    ticks.push(Math.max(0, previousHp - pair.target.hp));
    previousHp = pair.target.hp;
    freeze(pair);
  }

  let burstDamage = 0;
  let rollingDamage = 0;
  for (let i = 0; i < ticks.length; i++) {
    rollingDamage += ticks[i];
    if (i >= BURST_TICKS) rollingDamage -= ticks[i - BURST_TICKS];
    burstDamage = Math.max(burstDamage, rollingDamage);
  }
  return {
    sustainedDps: Math.max(0, (startHp - pair.target.hp) / (count * DT)),
    burstDamage,
    damaged: startHp - pair.target.hp > 0.05,
  };
}

function classifyRole(classId: string): CombatMetric['role'] {
  const cls = CLASS_BY_ID[classId];
  if (cls.smasher && cls.barrels.length === 0 && (cls.turretCount ?? 0) === 0) return 'rammer';
  const kinds = cls.barrels.map((barrel) => barrel.projectile ?? 'bullet');
  if (cls.turretCount) kinds.push(cls.turretProjectile ?? 'bullet');
  if (kinds.length > 0 && kinds.every((kind) => kind === 'trap')) return 'trap';
  if (cls.droneBehavior) return 'drone';
  if (kinds.some((kind) => kind === 'missile' || kind === 'firework')) return 'ordnance';
  if (cls.barrels.length === 0 && (cls.turretCount ?? 0) > 0) return 'turret';
  return 'cannon';
}

function measureEffectiveRange(classId: string): number {
  const cls = CLASS_BY_ID[classId];
  const pureRammer = !!cls.smasher && cls.barrels.length === 0 && (cls.turretCount ?? 0) === 0;
  if (pureRammer) {
    const pair = preparePair(classId, 1);
    const contactDistance = Math.max(1, pair.attacker.r + pair.target.r - 2);
    const result = runDamageScenario(classId, contactDistance, 1.0);
    return result.damaged ? Math.round(contactDistance) : 0;
  }

  const kinds = cls.barrels.map((barrel) => barrel.projectile ?? 'bullet');
  if (cls.turretCount) kinds.push(cls.turretProjectile ?? 'bullet');
  const trapOnly = kinds.length > 0 && kinds.every((kind) => kind === 'trap');
  const samples: readonly number[] = trapOnly ? TRAP_RANGE_SAMPLES : RANGE_SAMPLES;
  let furthestHit = 0;
  for (const distance of samples) {
    const result = runDamageScenario(classId, distance, RANGE_SECONDS);
    if (result.damaged) furthestHit = distance;
  }
  return furthestHit;
}

function measureSurvivability(classId: string): { seconds: number; killed: boolean } {
  const game = new Game(seeded(seedFor(classId, 9876)), 0);
  game.spawnShape = () => {};
  const attacker = game.addPlayer('standard-attacker');
  const target = game.addPlayer('passive-defender');
  if (!attacker || !target) throw new Error('Could not create survivability players');

  game.addXp(attacker, totalXpForLevel(45));
  applyStats(game, attacker, INCOMING_STATS);
  game.addXp(target, totalXpForLevel(45));
  if (!game.debugSetClass(target.id, classId)) throw new Error('Unknown defence class: ' + classId);
  applyStats(game, target, DEFENCE_STATS);

  const passiveGame = game as unknown as {
    updateAutoTurrets: (player: Player, dt: number) => void;
    maintainDrones: (player: Player, dt: number) => void;
  };
  passiveGame.updateAutoTurrets = () => {};
  passiveGame.maintainDrones = () => {};

  const attackerX = LAB_X;
  const targetX = LAB_X + 360;
  const y = LAB_Y;
  Object.assign(attacker, { x: attackerX, y, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
  Object.assign(target, { x: targetX, y, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
  attacker.hp = attacker.maxHp;
  target.hp = target.maxHp;
  game.setInput(attacker.id, { mx: 0, my: 0, a: 0, f: true });
  game.setInput(target.id, { mx: 0, my: 0, a: Math.PI, f: false });

  const maxTicks = SURVIVAL_LIMIT_SECONDS * SERVER_TICK_HZ;
  for (let tick = 1; tick <= maxTicks; tick++) {
    game.step(DT);
    attacker.x = attackerX; attacker.y = y;
    attacker.vx = attacker.vy = attacker.kvx = attacker.kvy = attacker.rvx = attacker.rvy = 0;
    target.x = targetX; target.y = y;
    target.vx = target.vy = target.kvx = target.kvy = target.rvx = target.rvy = 0;
    if (!target.alive) return { seconds: tick * DT, killed: true };
  }
  return { seconds: SURVIVAL_LIMIT_SECONDS, killed: false };
}

export function runClassCombatBenchmark(classId: string): CombatMetric {
  const cls = CLASS_BY_ID[classId];
  if (!cls) throw new Error('Unknown class: ' + classId);
  const pureRammer = !!cls.smasher && cls.barrels.length === 0 && (cls.turretCount ?? 0) === 0;
  const kinds = cls.barrels.map((barrel) => barrel.projectile ?? 'bullet');
  if (cls.turretCount) kinds.push(cls.turretProjectile ?? 'bullet');
  const trapOnly = kinds.length > 0 && kinds.every((kind) => kind === 'trap');
  const distance = pureRammer ? 1 : trapOnly ? 110 : 360;
  const damage = runDamageScenario(classId, distance, DPS_SECONDS);
  const survival = measureSurvivability(classId);
  const effectiveRange = measureEffectiveRange(classId);
  const rangeCeiling = pureRammer ? 0 : trapOnly ? TRAP_RANGE_SAMPLES[TRAP_RANGE_SAMPLES.length - 1] : RANGE_SAMPLES[RANGE_SAMPLES.length - 1];
  return {
    id: classId, name: cls.name, role: classifyRole(classId),
    sustainedDps: damage.sustainedDps,
    burstDamage: damage.burstDamage,
    effectiveRange,
    rangeAtCeiling: rangeCeiling > 0 && effectiveRange === rangeCeiling,
    survivalSeconds: survival.seconds,
    survivedBenchmark: !survival.killed,
  };
}

export function runAllCombatBenchmarks(): CombatMetric[] {
  return CLASSES.map((cls) => runClassCombatBenchmark(cls.id));
}
