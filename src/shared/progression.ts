import {
  CLASSES, CLASS_BY_ID, MAX_LEVEL, PLAYER_BASE_RADIUS, STAT_KEYS, type StatKey,
} from './config';

/** Cumulative XP needed to reach level (level 1 = 0). */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(10 * Math.pow(level - 1, 1.85));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

/** One point per level 2..28, then every third level from 30 onward. */
export function statPointsEarned(level: number): number {
  let total = 0;
  for (let current = 2; current <= Math.min(level, MAX_LEVEL); current++) {
    if (current <= 28 || (current >= 30 && (current - 30) % 3 === 0)) total++;
  }
  return total;
}

/** Returns all classes reachable from the current class, including alternate evolution paths. */
export function classOptions(classId: string, level: number): string[] {
  return CLASSES
    .filter((c) => c.minLevel <= level && (c.parent === classId || c.alternateParents?.includes(classId)))
    .map((c) => c.id);
}

export interface DerivedStats {
  radius: number;
  maxHp: number;
  regenFrac: number;
  bodyDps: number;
  bulletSpeed: number;
  bulletDamage: number;
  bulletHp: number;
  reload: number;
  moveSpeed: number;
  fovMul: number;
}

export function deriveStats(level: number, stats: readonly number[], classId: string): DerivedStats {
  const cls = CLASS_BY_ID[classId] ?? CLASS_BY_ID.basic;
  const stat = (key: StatKey) => stats[STAT_KEYS.indexOf(key)] ?? 0;
  return {
    radius: PLAYER_BASE_RADIUS * Math.pow(1.01, level - 1) * (cls.sizeMul ?? 1),
    maxHp: (50 + 2 * (level - 1) + 20 * stat('maxHealth')) * (cls.maxHpMul ?? 1),
    regenFrac: (0.015 + 0.0125 * stat('regen')),
    bodyDps: (18 + 6 * stat('bodyDamage')) * (cls.bodyDamageMul ?? 1),
    bulletSpeed: 520 * (1 + 0.12 * stat('bulletSpeed')) * cls.bulletSpeedMul,
    bulletDamage: (7 + 3 * stat('bulletDamage')) * cls.damageMul,
    bulletHp: 2 + 2 * stat('bulletPenetration'),
    reload: 0.6 * Math.pow(0.9, stat('reload')) * cls.reloadMul,
    moveSpeed: 260 * (1 + 0.06 * stat('moveSpeed')) * Math.pow(0.99, level - 1) * (cls.moveSpeedMul ?? 1),
    fovMul: cls.fovMul ?? 1,
  };
}
