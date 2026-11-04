// Data-driven game configuration shared by server, client and tests.

export const SERVER_TICK_HZ = 30;
export const ARENA_SIZE = 3200;
export const VIEW_HALF = 1000; // server only sends entities within this half-extent of the player
export const MAX_LEVEL = 45;
export const MAX_STAT_LEVEL = 7;
export const MAX_NAME_LEN = 16;
export const MAX_PLAYERS = 24;
export const MAX_BULLETS = 1500;
export const SHAPE_TARGET_COUNT = 90;
export const PLAYER_BASE_RADIUS = 26;
export const BULLET_LIFE_S = 2.0;
export const RESPAWN_PROTECTION_S = 3;
export const REGEN_DELAY_S = 3;

export const STAT_KEYS = [
  'regen',
  'maxHealth',
  'bodyDamage',
  'bulletSpeed',
  'bulletPenetration',
  'bulletDamage',
  'reload',
  'moveSpeed',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  regen: 'Health Regen',
  maxHealth: 'Max Health',
  bodyDamage: 'Body Damage',
  bulletSpeed: 'Bullet Speed',
  bulletPenetration: 'Bullet Penetration',
  bulletDamage: 'Bullet Damage',
  reload: 'Reload',
  moveSpeed: 'Movement Speed',
};

export const STAT_COLORS = ['#e6b37c', '#e666e6', '#9966e6', '#6690e6', '#e6e666', '#e66666', '#66e666', '#66e6e6'];

// ---- Shapes ----
export interface ShapeDef {
  sides: number;
  radius: number;
  hp: number;
  xp: number;
  bodyDps: number; // damage per second dealt to tanks touching it
  pierceCost: number; // bullet hp consumed on hit
  weight: number; // spawn weight
  color: string;
  stroke: string;
}
export const SHAPE_KINDS = ['square', 'triangle', 'pentagon'] as const;
export const SHAPES: Record<(typeof SHAPE_KINDS)[number], ShapeDef> = {
  square: { sides: 4, radius: 24, hp: 12, xp: 10, bodyDps: 6, pierceCost: 2, weight: 60, color: '#ffe869', stroke: '#bfae4e' },
  triangle: { sides: 3, radius: 28, hp: 32, xp: 25, bodyDps: 10, pierceCost: 2, weight: 28, color: '#fc7677', stroke: '#bd5859' },
  pentagon: { sides: 5, radius: 44, hp: 120, xp: 130, bodyDps: 14, pierceCost: 3, weight: 12, color: '#768dfc', stroke: '#5869bd' },
};
export const PLAYER_PIERCE_COST = 3;

// ---- Tank classes ----
export interface BarrelDef {
  angle: number; // radians relative to aim
  offset: number; // lateral offset (units at base size)
  length: number;
  width: number;
  delay: number; // 0..1 fraction of reload before the barrel first fires
  spread?: number; // random half-angle in radians
  recoil?: number; // per-barrel recoil multiplier; 0 disables recoil
}
export interface TankClassDef {
  id: string;
  name: string;
  parent: string | null;
  minLevel: number;
  barrels: BarrelDef[];
  reloadMul: number;
  damageMul: number;
  bulletSpeedMul: number;
}

const B = (angle: number, offset: number, length: number, width: number, delay = 0, spread = 0, recoil = 1): BarrelDef => ({
  angle, offset, length, width, delay, spread, recoil,
});
const PI = Math.PI;

export const CLASSES: TankClassDef[] = [
  { id: 'basic', name: 'Tank', parent: null, minLevel: 1, barrels: [B(0, 0, 42, 20, 0, 0, 1.0)], reloadMul: 1, damageMul: 1, bulletSpeedMul: 1 },
  // Tier 1 (level 15)
  { id: 'twin', name: 'Twin', parent: 'basic', minLevel: 15, barrels: [B(0, -11, 40, 14, 0, 0, 0.7), B(0, 11, 40, 14, 0.5, 0, 0.7)], reloadMul: 1, damageMul: 1, bulletSpeedMul: 1 },
  { id: 'sniper', name: 'Sniper', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 58, 20, 0, 0, 1.4)], reloadMul: 1.5, damageMul: 1.25, bulletSpeedMul: 1.6 },
  { id: 'machine', name: 'Machine Gun', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 38, 26, 0, 0.17, 0.22)], reloadMul: 0.45, damageMul: 0.6, bulletSpeedMul: 1 },
  { id: 'flank', name: 'Flank Guard', parent: 'basic', minLevel: 15, barrels: [B(0, 0, 40, 18, 0, 0, 0.8), B(PI, 0, 40, 18, 0, 0, 0.8)], reloadMul: 1.2, damageMul: 1, bulletSpeedMul: 1 },
  // Tier 2 (level 30)
  { id: 'triple', name: 'Triple Shot', parent: 'twin', minLevel: 30, barrels: [B(-PI / 6, 0, 38, 16, 0, 0, 0.65), B(PI / 6, 0, 38, 16, 0, 0, 0.65), B(0, 0, 44, 16, 0, 0, 0.65)], reloadMul: 1.1, damageMul: 1, bulletSpeedMul: 1 },
  { id: 'assassin', name: 'Assassin', parent: 'sniper', minLevel: 30, barrels: [B(0, 0, 66, 20, 0, 0, 1.5)], reloadMul: 1.7, damageMul: 1.5, bulletSpeedMul: 1.9 },
  { id: 'gunner', name: 'Gunner', parent: 'machine', minLevel: 30,
    barrels: [B(0, -15, 34, 10, 0, 0, 0.14), B(0, -5, 40, 10, 0.5, 0, 0.14), B(0, 5, 40, 10, 0.25, 0, 0.14), B(0, 15, 34, 10, 0.75, 0, 0.14)],
    reloadMul: 0.5, damageMul: 0.5, bulletSpeedMul: 1.1 },
  { id: 'quad', name: 'Quad Tank', parent: 'flank', minLevel: 30,
    barrels: [B(0, 0, 40, 18, 0, 0, 0.55), B(PI / 2, 0, 40, 18, 0, 0, 0.55), B(PI, 0, 40, 18, 0, 0, 0.55), B(-PI / 2, 0, 40, 18, 0, 0, 0.55)], reloadMul: 1.3, damageMul: 1, bulletSpeedMul: 1 },
  // Tier 3 (level 45)
  { id: 'penta', name: 'Penta Shot', parent: 'triple', minLevel: 45,
    barrels: [B(-0.6, 0, 36, 14, 0, 0, 0.45), B(0.6, 0, 36, 14, 0, 0, 0.45), B(-0.3, 0, 40, 14, 0.5, 0, 0.45), B(0.3, 0, 40, 14, 0.5, 0, 0.45), B(0, 0, 44, 14, 0.25, 0, 0.45)],
    reloadMul: 1.25, damageMul: 1, bulletSpeedMul: 1 },
  { id: 'ranger', name: 'Ranger', parent: 'assassin', minLevel: 45, barrels: [B(0, 0, 74, 20, 0, 0, 1.8)], reloadMul: 1.9, damageMul: 1.7, bulletSpeedMul: 2.1 },
  { id: 'streamliner', name: 'Streamliner', parent: 'gunner', minLevel: 45,
    barrels: [B(0, -20, 32, 9, 0, 0, 0.16), B(0, -10, 38, 9, 0.2, 0, 0.16), B(0, 0, 44, 9, 0.4, 0, 0.16), B(0, 10, 38, 9, 0.6, 0, 0.16), B(0, 20, 32, 9, 0.8, 0, 0.16)],
    reloadMul: 0.45, damageMul: 0.45, bulletSpeedMul: 1.2 },
  { id: 'octo', name: 'Octo Tank', parent: 'quad', minLevel: 45,
    barrels: Array.from({ length: 8 }, (_, i) => B((i * PI) / 4, 0, 40, 16, i % 2 ? 0.5 : 0, 0, 0.45)), reloadMul: 1.5, damageMul: 1, bulletSpeedMul: 1 },
];
export const CLASS_IDS = CLASSES.map((c) => c.id);
export const CLASS_BY_ID: Record<string, TankClassDef> = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
