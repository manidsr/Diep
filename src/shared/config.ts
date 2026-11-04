// Shared, data-driven tank and arena configuration.

export const SERVER_TICK_HZ = 30;
export const ARENA_SIZE = 3200;
export const SURVIVAL_ARENA_SIZE = 2400;
export const TEAM_BASE_DEPTH = 520;
export const VIEW_HALF = 1000;
export const MAX_LEVEL = 45;
export const MAX_STAT_LEVEL = 7;
export const MAX_NAME_LEN = 16;
export const MAX_PLAYERS = 24;
export const MAX_BULLETS = 1500;
export const SHAPE_TARGET_COUNT = 90;
export const MAX_ZOMBIES = 90;
export const PLAYER_BASE_RADIUS = 26;
export const BULLET_LIFE_S = 2.0;
export const RESPAWN_PROTECTION_S = 3;
export const REGEN_DELAY_S = 3;

export const STAT_KEYS = [
  'regen', 'maxHealth', 'bodyDamage', 'bulletSpeed',
  'bulletPenetration', 'bulletDamage', 'reload', 'moveSpeed',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  regen: 'Health Regen', maxHealth: 'Max Health', bodyDamage: 'Body Damage',
  bulletSpeed: 'Bullet Speed', bulletPenetration: 'Bullet Penetration',
  bulletDamage: 'Bullet Damage', reload: 'Reload', moveSpeed: 'Movement Speed',
};
export const STAT_COLORS = ['#e6b37c', '#e666e6', '#9966e6', '#6690e6', '#e6e666', '#e66666', '#66e666', '#66e6e6'];

// ---- Shapes ----
export interface ShapeDef {
  sides: number; radius: number; hp: number; xp: number; bodyDps: number;
  pierceCost: number; weight: number; color: string; stroke: string;
}
export const SHAPE_KINDS = ['square', 'triangle', 'pentagon'] as const;
export const SHAPES: Record<(typeof SHAPE_KINDS)[number], ShapeDef> = {
  square: { sides: 4, radius: 24, hp: 12, xp: 10, bodyDps: 6, pierceCost: 2, weight: 60, color: '#ffe869', stroke: '#bfae4e' },
  triangle: { sides: 3, radius: 28, hp: 32, xp: 25, bodyDps: 10, pierceCost: 2, weight: 28, color: '#fc7677', stroke: '#bd5859' },
  pentagon: { sides: 5, radius: 44, hp: 120, xp: 130, bodyDps: 14, pierceCost: 3, weight: 12, color: '#768dfc', stroke: '#5869bd' },
};
export const PLAYER_PIERCE_COST = 3;

// ---- Weapons and tank classes ----
export type ProjectileKind = 'bullet' | 'drone' | 'trap' | 'missile' | 'firework';
export type BarrelTrigger = 'primary' | 'secondary';

export interface BarrelDef {
  angle: number;
  offset: number;
  length: number;
  width: number;
  delay: number;
  spread?: number;
  recoil?: number;
  projectile?: ProjectileKind;
  trigger?: BarrelTrigger;
  damageMul?: number;
  speedMul?: number;
}
export interface TankClassDef {
  id: string;
  name: string;
  description: string;
  parent: string | null;
  alternateParents?: string[];
  minLevel: number;
  barrels: BarrelDef[];
  reloadMul: number;
  damageMul: number;
  bulletSpeedMul: number;
  bulletLifeMul?: number;
  fovMul?: number;
  bodyDamageMul?: number;
  moveSpeedMul?: number;
  maxHpMul?: number;
  sizeMul?: number;
  smasher?: boolean;
  stealthAfter?: number;
  stealthAlpha?: number;
  droneLimit?: number;
  droneSpeedMul?: number;
  droneDamageMul?: number;
  droneBehavior?: 'overseer' | 'battleship' | 'factory' | 'necromancer';
  turretCount?: number;
  turretRange?: number;
  turretReloadMul?: number;
  turretProjectile?: ProjectileKind;
  trapLife?: number;
  spinSpeed?: number;
}

const PI = Math.PI;
const B = (
  angle: number, offset: number, length: number, width: number,
  delay = 0, spread = 0, recoil = 1,
  projectile: ProjectileKind = 'bullet', trigger: BarrelTrigger = 'primary',
  damageMul = 1, speedMul = 1,
): BarrelDef => ({ angle, offset, length, width, delay, spread, recoil, projectile, trigger, damageMul, speedMul });

const T = (
  id: string, name: string, description: string, parent: string | null,
  minLevel: number, barrels: BarrelDef[], mods: Partial<TankClassDef> = {},
): TankClassDef => ({
  id, name, description, parent, minLevel, barrels,
  reloadMul: 1, damageMul: 1, bulletSpeedMul: 1, ...mods,
});

const noBarrels: BarrelDef[] = [];
export const CLASSES: TankClassDef[] = [
  T('basic', 'Tank', 'Balanced starter tank with one medium cannon.', null, 1, [B(0, 0, 42, 20)]),

  // Level 15: first evolution.
  T('twin', 'Twin', 'Two alternating front cannons. Reliable sustained fire.', 'basic', 15,
    [B(0, -11, 40, 14, 0, 0, 0.7), B(0, 11, 40, 14, 0.5, 0, 0.7)]),
  T('sniper', 'Sniper', 'Longer view, range and bullet speed; slow, accurate shots.', 'basic', 15,
    [B(0, 0, 58, 20, 0, 0, 1.4)], { reloadMul: 1.5, damageMul: 1.25, bulletSpeedMul: 1.6, bulletLifeMul: 1.35, fovMul: 1.18 }),
  T('machine', 'Machine Gun', 'Very rapid, wide-spread fire with light projectiles.', 'basic', 15,
    [B(0, 0, 38, 26, 0, 0.17, 0.22)], { reloadMul: 0.45, damageMul: 0.6 }),
  T('flank', 'Flank Guard', 'A front and rear cannon provide coverage in both directions.', 'basic', 15,
    [B(0, 0, 40, 18, 0, 0, 0.8), B(PI, 0, 40, 18, 0, 0, 0.8)], { reloadMul: 1.2 }),

  // Level 30: all tier-two paths.
  T('triple', 'Triple Shot', 'Three forward-facing cannons spread damage across a wide arc.', 'twin', 30,
    [B(-PI / 6, 0, 38, 16, 0, 0, 0.65), B(PI / 6, 0, 38, 16, 0, 0, 0.65), B(0, 0, 44, 16, 0, 0, 0.65)],
    { reloadMul: 1.1 }),
  T('quad', 'Quad Tank', 'Four directional cannons. Opposing shots mostly cancel recoil.', 'flank', 30,
    [B(0, 0, 40, 18, 0, 0, 0.55), B(PI / 2, 0, 40, 18, 0, 0, 0.55), B(PI, 0, 40, 18, 0, 0, 0.55), B(-PI / 2, 0, 40, 18, 0, 0, 0.55)],
    { reloadMul: 1.3 }),
  T('twinFlank', 'Twin Flank', 'Twin cannons on the front and rear for strong two-way coverage.', 'flank', 30,
    [B(0, -10, 38, 13, 0, 0, 0.55), B(0, 10, 38, 13, 0.5, 0, 0.55), B(PI, -10, 38, 13, 0, 0, 0.55), B(PI, 10, 38, 13, 0.5, 0, 0.55)],
    { reloadMul: 1.15 }),
  T('assassin', 'Assassin', 'A longer, more powerful sniper cannon with a slower reload.', 'sniper', 30,
    [B(0, 0, 66, 20, 0, 0, 1.5)], { reloadMul: 1.7, damageMul: 1.5, bulletSpeedMul: 1.9, bulletLifeMul: 1.5, fovMul: 1.28 }),
  T('overseer', 'Overseer', 'Commands a squad of up to eight autonomous drones.', 'sniper', 30,
    [B(0, -10, 30, 14, 0, 0, 0, 'drone'), B(0, 10, 30, 14, 0.5, 0, 0, 'drone')],
    { droneLimit: 8, droneBehavior: 'overseer', droneDamageMul: 0.85, droneSpeedMul: 1.05 }),
  T('hunter', 'Hunter', 'Two long cannons fire in sequence and extend your effective range.', 'sniper', 30,
    [B(0, 0, 64, 20, 0, 0, 1.4), B(0, 0, 72, 15, 0.48, 0, 1.0)],
    { reloadMul: 1.65, damageMul: 1.35, bulletSpeedMul: 1.8, bulletLifeMul: 1.4, fovMul: 1.22 }),
  T('trapper', 'Trapper', 'Launches durable stationary traps that punish enemies who approach.', 'basic', 30,
    [B(0, 0, 34, 28, 0, 0, 1.6, 'trap')], { reloadMul: 1.65, damageMul: 1.15, trapLife: 10 }),
  T('destroyer', 'Destroyer', 'A huge, slow cannon delivers heavy burst damage and strong recoil.', 'basic', 30,
    [B(0, 0, 46, 32, 0, 0, 3.2)], { reloadMul: 1.8, damageMul: 2.05, bulletSpeedMul: 0.82, bulletLifeMul: 1.2 }),
  T('gunner', 'Gunner', 'Four narrow cannons fire a fast stream of smaller bullets.', 'machine', 30,
    [B(0, -15, 34, 10, 0, 0, 0.14), B(0, -5, 40, 10, 0.5, 0, 0.14), B(0, 5, 40, 10, 0.25, 0, 0.14), B(0, 15, 34, 10, 0.75, 0, 0.14)],
    { reloadMul: 0.5, damageMul: 0.5, bulletSpeedMul: 1.1 }),
  T('shotgun', 'Shotgun', 'A close-range fan of fast pellets with substantial combined recoil.', 'basic', 30,
    Array.from({ length: 12 }, (_, i) => B(-0.62 + i * (1.24 / 11), 0, 34, 8, i % 3 * 0.08, 0, 1.35, 'bullet', 'primary', 0.42, 1.35)),
    { reloadMul: 1.75, bulletSpeedMul: 1.25, bulletLifeMul: 0.72 }),
  T('triAngle', 'Tri-Angle', 'A front cannon and two weaker rear thrusters give excellent mobility.', 'flank', 30,
    [B(0, 0, 42, 18, 0, 0, 0.65), B(2.62, 0, 34, 14, 0, 0, 1.05, 'bullet', 'primary', 0.22), B(-2.62, 0, 34, 14, 0, 0, 1.05, 'bullet', 'primary', 0.22)],
    { reloadMul: 0.9, moveSpeedMul: 1.08 }),
  T('auto3', 'Auto 3', 'One main cannon supported by three independently tracking auto turrets.', 'basic', 30,
    [B(0, 0, 42, 18, 0, 0, 0.75)], { turretCount: 3, turretRange: 620, turretReloadMul: 1.1 }),
  T('smasher', 'Smasher', 'No cannons. Invest in health, body damage and speed to ram enemies.', 'basic', 30,
    noBarrels, { smasher: true, sizeMul: 1.12, maxHpMul: 1.35, bodyDamageMul: 1.8, moveSpeedMul: 1.12, fovMul: 1.15 }),

  // Level 45: third-tier specialisations and cross-branch evolutions.
  T('triplet', 'Triplet', 'Three aligned front barrels deliver concentrated, continuous fire.', 'triple', 45,
    [B(0, -11, 42, 13, 0, 0, 0.45), B(0, 0, 46, 13, 0.33, 0, 0.45), B(0, 11, 42, 13, 0.66, 0, 0.45)],
    { reloadMul: 0.82, damageMul: 0.88 }),
  T('penta', 'Penta Shot', 'Five forward barrels create a wide wall of bullets.', 'triple', 45,
    [B(-0.6, 0, 36, 14, 0, 0, 0.45), B(0.6, 0, 36, 14, 0, 0, 0.45), B(-0.3, 0, 40, 14, 0.5, 0, 0.45), B(0.3, 0, 40, 14, 0.5, 0, 0.45), B(0, 0, 44, 14, 0.25, 0, 0.45)],
    { reloadMul: 1.25 }),
  T('spread', 'Spread Shot', 'Eleven small cannons saturate a broad fan in front of the tank.', 'triple', 45,
    Array.from({ length: 11 }, (_, i) => B(-0.8 + i * 0.16, 0, 34 + (i % 2) * 3, 8, (i % 3) * 0.09, 0, 0.28, 'bullet', 'primary', 0.48)),
    { reloadMul: 1.15 }),
  T('octo', 'Octo Tank', 'Eight radial cannons cover every direction. Press C to auto-spin.', 'quad', 45,
    Array.from({ length: 8 }, (_, i) => B((i * PI) / 4, 0, 40, 16, i % 2 ? 0.5 : 0, 0, 0.45)),
    { reloadMul: 1.5, spinSpeed: 1.7 }),
  T('auto5', 'Auto 5', 'Five tracking turrets defend the tank from every direction.', 'quad', 45, noBarrels,
    { alternateParents: ['auto3'], turretCount: 5, turretRange: 680, turretReloadMul: 0.9 }),
  T('tripleTwin', 'Triple Twin', 'Six twin barrels arranged across front and rear firing lanes.', 'twinFlank', 45,
    [B(0, -12, 38, 12, 0, 0, 0.4), B(0, 0, 42, 12, 0.33, 0, 0.4), B(0, 12, 38, 12, 0.66, 0, 0.4),
      B(PI, -12, 38, 12, 0, 0, 0.4), B(PI, 0, 42, 12, 0.33, 0, 0.4), B(PI, 12, 38, 12, 0.66, 0, 0.4)],
    { reloadMul: 0.92, damageMul: 0.86 }),
  T('battleship', 'Battleship', 'A broad drone squad with two auxiliary defensive turrets.', 'twinFlank', 45,
    [B(0, -14, 28, 12, 0, 0, 0, 'drone'), B(0, 14, 28, 12, 0.5, 0, 0, 'drone')],
    { alternateParents: ['overseer'], droneLimit: 8, droneBehavior: 'battleship', droneDamageMul: 0.75, turretCount: 2, turretRange: 540 }),
  T('ranger', 'Ranger', 'Extreme range and a precise, powerful long-distance cannon.', 'assassin', 45,
    [B(0, 0, 74, 20, 0, 0, 1.8)], { reloadMul: 1.9, damageMul: 1.7, bulletSpeedMul: 2.1, bulletLifeMul: 1.65, fovMul: 1.38 }),
  T('stalker', 'Stalker', 'A sniper tank that fades out after standing still and not firing.', 'assassin', 45,
    [B(0, 0, 70, 20, 0, 0, 1.6)], { reloadMul: 1.75, damageMul: 1.45, bulletSpeedMul: 1.9, bulletLifeMul: 1.45, fovMul: 1.3, stealthAfter: 2, stealthAlpha: 0.08 }),
  T('overlord', 'Overlord', 'Commands eight drones that make staggered strike passes and regroup between attacks.', 'overseer', 45,
    [B(0, -10, 30, 15, 0, 0, 0, 'drone'), B(0, 10, 30, 15, 0.5, 0, 0, 'drone')],
    { droneLimit: 8, droneBehavior: 'overseer', droneDamageMul: 0.85, droneSpeedMul: 1.2 }),
  T('necromancer', 'Necromancer', 'Can maintain up to 36 drones; destroyed squares can become new drones.', 'overseer', 45,
    [B(0, -10, 28, 13, 0, 0, 0, 'drone'), B(0, 10, 28, 13, 0.5, 0, 0, 'drone')],
    { droneLimit: 36, droneBehavior: 'necromancer', droneDamageMul: 0.62, droneSpeedMul: 1.08 }),
  T('manager', 'Manager', 'A drone controller that becomes nearly invisible while idle.', 'overseer', 45,
    [B(0, 0, 32, 16, 0, 0, 0, 'drone')],
    { droneLimit: 8, droneBehavior: 'overseer', droneDamageMul: 1.0, stealthAfter: 2, stealthAlpha: 0.1 }),
  T('overtrapper', 'Overtrapper', 'Combines a small drone squad with a forward trap launcher.', 'overseer', 45,
    [B(0, -11, 27, 12, 0, 0, 0, 'drone'), B(0, 11, 27, 12, 0.5, 0, 0, 'drone'), B(0, 0, 33, 24, 0, 0, 1.3, 'trap')],
    { alternateParents: ['trapper'], droneLimit: 4, droneBehavior: 'overseer', droneDamageMul: 0.75, trapLife: 9 }),
  T('factory', 'Factory', 'Deploys up to six durable minions that swarm nearby targets.', 'overseer', 45,
    [B(0, -10, 28, 14, 0, 0, 0, 'drone'), B(0, 10, 28, 14, 0.5, 0, 0, 'drone')],
    { droneLimit: 6, droneBehavior: 'factory', droneDamageMul: 0.8, droneSpeedMul: 0.88, turretCount: 2, turretRange: 500 }),
  T('predator', 'Predator', 'Three aligned sniper barrels. Hold right mouse to zoom out and focus.', 'hunter', 45,
    [B(0, -12, 68, 15, 0, 0, 1.15), B(0, 0, 74, 18, 0.33, 0, 1.25), B(0, 12, 68, 15, 0.66, 0, 1.15)],
    { reloadMul: 1.65, damageMul: 1.25, bulletSpeedMul: 1.9, bulletLifeMul: 1.5, fovMul: 1.35 }),
  T('streamliner', 'Streamliner', 'Five narrow overlapping barrels fire in a precise sequence.', 'gunner', 45,
    [B(0, -20, 32, 9, 0, 0, 0.16), B(0, -10, 38, 9, 0.2, 0, 0.16), B(0, 0, 44, 9, 0.4, 0, 0.16), B(0, 10, 38, 9, 0.6, 0, 0.16), B(0, 20, 32, 9, 0.8, 0, 0.16)],
    { alternateParents: ['hunter'], reloadMul: 0.55, damageMul: 0.40, bulletSpeedMul: 1.2 }),
  T('triTrapper', 'Tri-Trapper', 'Three trap launchers cover a wide area around the tank.', 'trapper', 45,
    [B(0, 0, 34, 24, 0, 0, 1.25, 'trap'), B(2.1, 0, 34, 24, 0.33, 0, 1.25, 'trap'), B(-2.1, 0, 34, 24, 0.66, 0, 1.25, 'trap')],
    { reloadMul: 1.35, trapLife: 10 }),
  T('gunnerTrapper', 'Gunner Trapper', 'Four small rapid cannons plus a central trap launcher.', 'trapper', 45,
    [B(0, -15, 31, 8, 0, 0, 0.12), B(0, -5, 34, 8, 0.25, 0, 0.12), B(0, 5, 34, 8, 0.5, 0, 0.12), B(0, 15, 31, 8, 0.75, 0, 0.12), B(0, 0, 34, 22, 0, 0, 1.15, 'trap')],
    { alternateParents: ['gunner'], reloadMul: 0.65, damageMul: 0.6, trapLife: 8 }),
  T('megaTrapper', 'Mega Trapper', 'A huge trap launcher places large, long-lasting area-denial mines.', 'trapper', 45,
    [B(0, 0, 40, 38, 0, 0, 2.1, 'trap')], { reloadMul: 2.0, damageMul: 1.5, trapLife: 13 }),
  T('autoTrapper', 'Auto Trapper', 'A trap launcher backed by an independent auto-targeting turret.', 'trapper', 45,
    [B(0, 0, 35, 25, 0, 0, 1.25, 'trap')],
    { reloadMul: 1.5, turretCount: 1, turretProjectile: 'trap', turretRange: 560, turretReloadMul: 1.3, trapLife: 10 }),
  T('hybrid', 'Hybrid', 'A heavy Destroyer cannon supported by two autonomous drones.', 'destroyer', 45,
    [B(0, 0, 46, 30, 0, 0, 2.8), B(PI, 0, 28, 13, 0, 0, 0, 'drone')],
    { reloadMul: 1.8, damageMul: 1.85, bulletSpeedMul: 0.86, droneLimit: 2, droneBehavior: 'overseer', droneDamageMul: 0.58 }),
  T('annihilator', 'Annihilator', 'An enormous projectile with extreme burst damage and recoil.', 'destroyer', 45,
    [B(0, 0, 50, 40, 0, 0, 4.4)], { reloadMul: 2.1, damageMul: 2.45, bulletSpeedMul: 0.78, bulletLifeMul: 1.25 }),
  T('skimmer', 'Skimmer', 'Fires fast missiles that accelerate and steer toward nearby enemies.', 'destroyer', 45,
    [B(0, 0, 44, 18, 0, 0, 1.4, 'missile')], { reloadMul: 1.35, damageMul: 1.35, bulletSpeedMul: 1.1, bulletLifeMul: 1.3 }),
  T('rocketeer', 'Rocketeer', 'A guided rocket launcher with rear machine-gun thruster barrels.', 'destroyer', 45,
    [B(0, 0, 48, 20, 0, 0, 1.7, 'missile'), B(PI, -9, 28, 9, 0, 0, 0.32, 'bullet', 'primary', 0.28), B(PI, 9, 28, 9, 0.5, 0, 0.32, 'bullet', 'primary', 0.28)],
    { reloadMul: 1.55, damageMul: 1.35, bulletSpeedMul: 1.05, bulletLifeMul: 1.3 }),
  T('glider', 'Glider', 'A guided missile launcher with two small rear propulsion cannons.', 'destroyer', 45,
    [B(0, 0, 46, 19, 0, 0, 1.55, 'missile'), B(PI, -8, 28, 8, 0, 0, 0.24, 'bullet', 'primary', 0.2), B(PI, 8, 28, 8, 0.5, 0, 0.24, 'bullet', 'primary', 0.2)],
    { reloadMul: 1.45, damageMul: 1.2, bulletSpeedMul: 1.08, bulletLifeMul: 1.35 }),
  T('firework', 'Firework', 'Launches a rocket that automatically bursts into sixteen projectiles after its flight.', 'destroyer', 45,
    [B(0, 0, 46, 22, 0, 0, 1.8, 'firework')],
    { reloadMul: 1.7, damageMul: 1.25, bulletSpeedMul: 1.15, bulletLifeMul: 1.1 }),
  T('autoGunner', 'Auto Gunner', 'Four rapid front barrels and an automatic tracking turret.', 'gunner', 45,
    [B(0, -14, 35, 9, 0, 0, 0.13), B(0, -5, 40, 9, 0.33, 0, 0.13), B(0, 5, 40, 9, 0.66, 0, 0.13), B(0, 14, 35, 9, 0, 0, 0.13)],
    { alternateParents: ['auto3'], reloadMul: 0.5, damageMul: 0.48, bulletSpeedMul: 1.12, turretCount: 1, turretRange: 600 }),
  T('pelletShot', 'Pellet Shot', 'Fires a dense cloud of tiny, high-speed pellets at close range.', 'shotgun', 45,
    Array.from({ length: 30 }, (_, i) => B(-0.68 + i * (1.36 / 29), 0, 33, 6, (i % 5) * 0.035, 0, 0.55, 'bullet', 'primary', 0.24, 1.5)),
    { reloadMul: 1.8, bulletSpeedMul: 1.25, bulletLifeMul: 0.65 }),
  T('dualBarrel', 'Dual-Barrel', 'Two powerful barrels fire together automatically.', 'shotgun', 45,
    [B(0, -10, 44, 18, 0, 0, 0.8), B(0, 10, 44, 18, 0, 0, 0.8)],
    { reloadMul: 0.9, damageMul: 1.2 }),
  T('sprayer', 'Sprayer', 'A wide, rapid central spray gun with stronger sustained recoil.', 'machine', 45,
    [B(0, 0, 42, 24, 0, 0.15, 0.42), B(0, 0, 38, 15, 0.35, 0.12, 0.3)],
    { reloadMul: 0.38, damageMul: 0.62, bulletSpeedMul: 1.04 }),
  T('booster', 'Booster', 'Multiple rear-facing cannons generate strong thrust for high-speed movement.', 'triAngle', 45,
    [B(0, 0, 42, 18, 0, 0, 0.6), B(2.45, 0, 34, 14, 0, 0, 1.0, 'bullet', 'primary', 0.2), B(-2.45, 0, 34, 14, 0, 0, 1.0, 'bullet', 'primary', 0.2),
      B(PI, 0, 30, 12, 0.5, 0, 1.15, 'bullet', 'primary', 0.18)],
    { reloadMul: 0.82, moveSpeedMul: 1.16 }),
  T('fighter', 'Fighter', 'A front cannon and four side cannons create broad mobile coverage.', 'triAngle', 45,
    [B(0, 0, 42, 17, 0, 0, 0.55), B(-0.9, 0, 36, 13, 0.25, 0, 0.35), B(0.9, 0, 36, 13, 0.25, 0, 0.35),
      B(-2.4, 0, 32, 12, 0.5, 0, 0.6, 'bullet', 'primary', 0.5), B(2.4, 0, 32, 12, 0.5, 0, 0.6, 'bullet', 'primary', 0.5)],
    { reloadMul: 0.92, moveSpeedMul: 1.1 }),
  T('landmine', 'Landmine', 'A pure rammer that becomes nearly invisible after remaining still.', 'smasher', 45,
    noBarrels, { smasher: true, sizeMul: 1.14, maxHpMul: 1.55, bodyDamageMul: 1.95, moveSpeedMul: 1.08, stealthAfter: 13, stealthAlpha: 0.06, fovMul: 1.18 }),
  T('autoSmasher', 'Auto Smasher', 'A durable rammer with one automatic defensive turret.', 'smasher', 45,
    noBarrels, { smasher: true, sizeMul: 1.12, maxHpMul: 1.4, bodyDamageMul: 1.8, moveSpeedMul: 1.08, turretCount: 1, turretRange: 440 }),
  T('spike', 'Spike', 'A heavy rammer with greatly increased body collision damage.', 'smasher', 45,
    noBarrels, { smasher: true, sizeMul: 1.2, maxHpMul: 1.45, bodyDamageMul: 2.65, moveSpeedMul: 1.02 }),
  T('autoTank', 'Auto Tank', 'A standard cannon supported by one tracking auto turret.', 'basic', 45,
    [B(0, 0, 42, 18, 0, 0, 0.75)], { turretCount: 1, turretRange: 600 }),
];

export const CLASS_IDS = CLASSES.map((c) => c.id);
export const CLASS_BY_ID: Record<string, TankClassDef> = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
export const PROJECTILE_KIND_IDS: Record<ProjectileKind, number> = {
  bullet: 0, drone: 1, trap: 2, missile: 3, firework: 4,
};
export const PROJECTILE_KIND_BY_ID: ProjectileKind[] = ['bullet', 'drone', 'trap', 'missile', 'firework'];
