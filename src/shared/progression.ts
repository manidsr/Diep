import {
  CLASSES, CLASS_BY_ID, MAX_LEVEL, PLAYER_BASE_RADIUS, STAT_KEYS, type StatKey,
} from './config';

/** Cumulative XP needed to reach `level` (level 1 = 0). */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(10 * Math.pow(level - 1, 1.85));
}

export function levelFromXp(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= totalXpForLevel(l + 1)) l++;
  return l;
}

/** Total stat points earned at `level`: one per level 2..28, then every 3rd level from 30. */
export function statPointsEarned(level: number): number {
  let n = 0;
  for (let l = 2; l <= Math.min(level, MAX_LEVEL); l++) {
    if (l <= 28 || (l >= 30 && (l - 30) % 3 === 0)) n++;
  }
  return n;
}

/** Class ids the player may evolve into right now. */
export function classOptions(classId: string, level: number): string[] {
  return CLASSES.filter((c) => c.parent === classId && c.minLevel <= level).map((c) => c.id);
}

export interface DerivedStats {
  radius: number;
  maxHp: number;
  regenFrac: number; // fraction of max hp per second
  bodyDps: number;
  bulletSpeed: number;
  bulletDamage: number;
  bulletHp: number;
  reload: number; // seconds
  moveSpeed: number;
}

export function deriveStats(level: number, stats: readonly number[], classId: string): DerivedStats {
  const cls = CLASS_BY_ID[classId] ?? CLASS_BY_ID.basic;
  const s = (k: StatKey) => stats[STAT_KEYS.indexOf(k)] ?? 0;
  return {
    radius: PLAYER_BASE_RADIUS * Math.pow(1.01, level - 1),
    maxHp: 50 + 2 * (level - 1) + 20 * s('maxHealth'),
    regenFrac: 0.015 + 0.0125 * s('regen'),
    bodyDps: 18 + 6 * s('bodyDamage'),
    bulletSpeed: 520 * (1 + 0.12 * s('bulletSpeed')) * cls.bulletSpeedMul,
    bulletDamage: (7 + 3 * s('bulletDamage')) * cls.damageMul,
    bulletHp: 2 + 2 * s('bulletPenetration'),
    reload: 0.6 * Math.pow(0.9, s('reload')) * cls.reloadMul,
    moveSpeed: 260 * (1 + 0.06 * s('moveSpeed')) * Math.pow(0.99, level - 1),
  };
}
