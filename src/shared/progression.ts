import {
  CLASSES, CLASS_BY_ID, MAX_LEVEL, PLAYER_BASE_RADIUS, TANK_SPECIALTIES, type StatKey,
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

/** Every level improves all eight stats; reaching 45 grows each stat a little beyond the old average allocation. */
export function automaticStatLevel(level: number): number {
  const cappedLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return (cappedLevel - 1) * 0.12;
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

export function deriveStats(level: number, classId: string): DerivedStats {
  const cls = CLASS_BY_ID[classId] ?? CLASS_BY_ID.basic;
  const statLevel = automaticStatLevel(level);
  const bonuses: Partial<Record<StatKey, number>> = TANK_SPECIALTIES[cls.specialty]?.bonuses ?? {};
  const applyBonus = (key: StatKey, value: number) => value * (1 + (bonuses[key] ?? 0));
  return {
    radius: PLAYER_BASE_RADIUS * Math.pow(1.01, level - 1) * (cls.sizeMul ?? 1),
    maxHp: applyBonus('maxHealth', 50 + 2 * (level - 1) + 20 * statLevel) * (cls.maxHpMul ?? 1),
    regenFrac: applyBonus('regen', 0.015 + 0.0125 * statLevel),
    bodyDps: applyBonus('bodyDamage', 18 + 6 * statLevel) * (cls.bodyDamageMul ?? 1),
    bulletSpeed: applyBonus('bulletSpeed', 520 * (1 + 0.12 * statLevel)) * cls.bulletSpeedMul,
    bulletDamage: applyBonus('bulletDamage', 7 + 3 * statLevel) * cls.damageMul,
    bulletHp: applyBonus('bulletPenetration', 2 + 2 * statLevel),
    reload: 0.6 * Math.pow(0.9, statLevel) * cls.reloadMul / (1 + (bonuses.reload ?? 0)),
    moveSpeed: applyBonus('moveSpeed', 260 * (1 + 0.06 * statLevel)) * (cls.moveSpeedMul ?? 1),
    fovMul: cls.fovMul ?? 1,
  };
}
