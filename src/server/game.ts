import {
  ARENA_SIZE, BULLET_LIFE_S, CLASS_BY_ID, CLASS_IDS, MAX_BULLETS, MAX_PLAYERS, MAX_STAT_LEVEL,
  PLAYER_PIERCE_COST, PROJECTILE_KIND_IDS, REGEN_DELAY_S, RESPAWN_PROTECTION_S, SHAPES,
  SHAPE_KINDS, SHAPE_TARGET_COUNT, SERVER_TICK_HZ, STAT_KEYS, VIEW_HALF,
  type BarrelDef, type ProjectileKind,
} from '../shared/config';
import {
  classOptions, deriveStats, levelFromXp, statPointsEarned, totalXpForLevel, type DerivedStats,
} from '../shared/progression';
import type { Snapshot } from '../shared/protocol';
import { SpatialGrid } from './grid';

export interface Player {
  id: number; name: string;
  x: number; y: number; vx: number; vy: number; kvx: number; kvy: number; rvx: number; rvy: number;
  r: number; angle: number; hp: number; maxHp: number;
  level: number; xp: number; pts: number; stats: number[]; cls: string;
  alive: boolean; protT: number; lastDamageT: number; lastHit: { id: number | null; name: string } | null;
  input: { mx: number; my: number; a: number; f: boolean; secondary: boolean; spin: boolean };
  wasFiring: boolean; wasSecondary: boolean; cd: number[]; autoCd: number[];
  droneSpawnCd: number; stealthT: number; visibility: number; d: DerivedStats;
}
export interface Bullet {
  id: number; owner: number; x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; hp: number; life: number; hit: Set<number>;
  kind: ProjectileKind; angle: number; maxSpeed: number; turnRate: number;
  /** Stable place in the owner's drone formation, reused when a drone is lost. */
  formationSlot?: number;
  /** Drones may re-hit a target after a short contact cooldown. */
  hitCooldowns?: Map<number, number>;
}
export interface Shape {
  id: number; kind: number; x: number; y: number; vx: number; vy: number; kvx: number; kvy: number;
  r: number; hp: number; maxHp: number; rot: number; rotSpeed: number; lastHitBy: number | null;
  hitFlash?: number; hitX?: number; hitY?: number; hitAngle?: number;
}
export type GameEvent = { type: 'dead'; id: number; killer: string; score: number; level: number };

type Ent = { k: 0 | 1 | 2; o: Player | Shape | Bullet };
type Target = { x: number; y: number; r?: number };
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const RECOIL_DECAY_PER_TICK = 0.82;
const BASE_RECOIL_DISTANCE = 28;
const DRONE_LIFE_S = 24;
const FIREWORK_PELLETS = 16;
const OVERLORD_DRONE_RECALL_RADIUS = 440;
const OVERLORD_DRONE_LEASH_RADIUS = 480;

export class Game {
  tick = 0;
  time = 0;
  players = new Map<number, Player>();
  bullets: Bullet[] = [];
  shapes: Shape[] = [];
  events: GameEvent[] = [];
  private nextId = 1;
  private grid = new SpatialGrid(128);

  constructor(private rng: () => number = Math.random, initialShapes = SHAPE_TARGET_COUNT) {
    for (let i = 0; i < initialShapes; i++) this.spawnShape();
  }

  addPlayer(name: string): Player | null {
    if (this.players.size >= MAX_PLAYERS) return null;
    const stats = STAT_KEYS.map(() => 0);
    const p: Player = {
      id: this.nextId++, name, x: 0, y: 0, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
      r: 26, angle: 0, hp: 50, maxHp: 0, level: 1, xp: 0, pts: 0, stats, cls: 'basic',
      alive: true, protT: 0, lastDamageT: -99, lastHit: null,
      input: { mx: 0, my: 0, a: 0, f: false, secondary: false, spin: false },
      wasFiring: false, wasSecondary: false, cd: [0], autoCd: [], droneSpawnCd: 0,
      stealthT: 0, visibility: 1, d: deriveStats(1, stats, 'basic'),
    };
    this.players.set(p.id, p);
    this.respawn(p.id, name);
    return p;
  }

  removePlayer(id: number) {
    this.players.delete(id);
    this.bullets = this.bullets.filter((b) => b.owner !== id || b.kind === 'bullet');
  }

  respawn(id: number, name?: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (name) p.name = name;
    p.level = 1; p.xp = 0; p.stats = STAT_KEYS.map(() => 0); p.cls = 'basic'; p.maxHp = 0;
    p.x = 200 + this.rng() * (ARENA_SIZE - 400);
    p.y = 200 + this.rng() * (ARENA_SIZE - 400);
    p.vx = p.vy = p.kvx = p.kvy = p.rvx = p.rvy = 0;
    p.alive = true; p.protT = RESPAWN_PROTECTION_S; p.lastHit = null; p.lastDamageT = -99;
    p.input = { mx: 0, my: 0, a: p.angle, f: false, secondary: false, spin: false };
    p.wasFiring = false; p.wasSecondary = false; p.stealthT = 0; p.visibility = 1;
    p.droneSpawnCd = 0; p.cd = [0]; p.autoCd = [];
    this.bullets = this.bullets.filter((b) => b.owner !== id || b.kind === 'bullet');
    this.refresh(p);
    p.hp = p.maxHp;
  }

  // ---------- validated player intents ----------
  setInput(id: number, input: { mx: number; my: number; a: number; f: boolean; secondary?: boolean; spin?: boolean }) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const unit = (v: number) => Number.isFinite(v) ? clamp(v, -1, 1) : 0;
    p.input = {
      mx: unit(input.mx), my: unit(input.my),
      a: Number.isFinite(input.a) ? input.a : p.input.a,
      f: !!input.f, secondary: !!input.secondary, spin: !!input.spin,
    };
  }

  upgradeStat(id: number, idx: number): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || !Number.isInteger(idx) || idx < 0 || idx >= STAT_KEYS.length) return false;
    const cls = CLASS_BY_ID[p.cls];
    // Smasher branches refund and lock all projectile-only stats.
    if (cls.smasher && idx >= 3 && idx <= 6) return false;
    if (p.pts <= 0 || p.stats[idx] >= MAX_STAT_LEVEL) return false;
    p.stats[idx]++;
    this.refresh(p);
    return true;
  }

  chooseClass(id: number, classId: string): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || !classOptions(p.cls, p.level).includes(classId)) return false;
    this.switchClass(p, classId);
    return true;
  }

  /** Bypasses evolution rules. The WebSocket server must authorize this before calling. */
  debugSetClass(id: number, classId: string): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || !CLASS_IDS.includes(classId as (typeof CLASS_IDS)[number])) return false;
    this.switchClass(p, classId);
    return true;
  }

  private switchClass(p: Player, classId: string) {
    p.cls = classId;
    if (CLASS_BY_ID[classId].smasher) {
      // Return invested projectile points to the player when entering the Smasher branch.
      for (let i = 3; i <= 6; i++) p.stats[i] = 0;
    }
    // Remove owned special weapons so class changes cannot leave stale drones, traps or missiles.
    this.bullets = this.bullets.filter((b) => b.owner !== p.id || b.kind === 'bullet');
    p.droneSpawnCd = 0;
    p.stealthT = 0; p.visibility = 1;
    p.wasFiring = false; p.wasSecondary = false;
    p.cd = new Array(CLASS_BY_ID[classId].barrels.length).fill(0);
    p.autoCd = new Array(CLASS_BY_ID[classId].turretCount ?? 0).fill(0);
    this.refresh(p);
  }

  // ---------- simulation ----------
  step(dt: number) {
    this.time += dt;
    this.tick++;
    for (const p of this.players.values()) if (p.alive) this.updatePlayer(p, dt);
    for (const s of this.shapes) this.updateShape(s, dt);

    for (const b of this.bullets) {
      if (b.kind === 'drone') this.updateDrone(b, dt);
      else if (b.kind === 'missile') this.updateMissile(b, dt);
      else if (b.kind !== 'trap') { b.x += b.vx * dt; b.y += b.vy * dt; }
      b.life -= dt;
    }
    this.explodeExpiredFireworks();
    this.collideAll(dt);
    this.reap();
    this.bullets = this.bullets.filter((b) =>
      b.hp > 0 && b.life > 0 && b.x > -80 && b.y > -80 && b.x < ARENA_SIZE + 80 && b.y < ARENA_SIZE + 80,
    );
    if (this.shapes.length < SHAPE_TARGET_COUNT && this.rng() < dt * 4) this.spawnShape();
  }

  private updatePlayer(p: Player, dt: number) {
    const cls = CLASS_BY_ID[p.cls];
    const { mx, my, a, f, secondary, spin } = p.input;
    if (spin && cls.spinSpeed) p.angle += cls.spinSpeed * dt;
    else p.angle = a;

    let ix = mx, iy = my;
    const inputLen = Math.hypot(ix, iy);
    if (inputLen > 1) { ix /= inputLen; iy /= inputLen; }
    const k = 1 - Math.exp(-dt * 7);
    p.vx += (ix * p.d.moveSpeed - p.vx) * k;
    p.vy += (iy * p.d.moveSpeed - p.vy) * k;
    p.x += (p.vx + p.kvx + p.rvx) * dt;
    p.y += (p.vy + p.kvy + p.rvy) * dt;
    const dec = Math.exp(-dt * 6);
    p.kvx *= dec; p.kvy *= dec;
    const recoilDecay = Math.pow(RECOIL_DECAY_PER_TICK, dt * SERVER_TICK_HZ);
    p.rvx *= recoilDecay; p.rvy *= recoilDecay;
    p.x = clamp(p.x, p.r, ARENA_SIZE - p.r);
    p.y = clamp(p.y, p.r, ARENA_SIZE - p.r);

    if (p.protT > 0) p.protT -= dt;
    if (this.time - p.lastDamageT > REGEN_DELAY_S && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.d.regenFrac * dt);
    }

    // Stealth requires a genuinely stationary, non-firing player. Damage reveals immediately.
    if (cls.stealthAfter != null) {
      const settled = inputLen < 0.05 && Math.hypot(p.vx, p.vy) < 8 && !f && !secondary;
      p.stealthT = settled ? p.stealthT + dt : 0;
      p.visibility = p.stealthT >= cls.stealthAfter ? (cls.stealthAlpha ?? 0.1) : 1;
    } else {
      p.stealthT = 0; p.visibility = 1;
    }

    const barrels = cls.barrels;
    for (let i = 0; i < p.cd.length; i++) p.cd[i] = Math.max(0, p.cd[i] - dt);

    if (f && !p.wasFiring) {
      for (let i = 0; i < barrels.length; i++) {
        if ((barrels[i].trigger ?? 'primary') === 'primary') {
          p.cd[i] = Math.max(p.cd[i], barrels[i].delay * p.d.reload);
        }
      }
    }
    p.wasFiring = f;

    if (secondary && !p.wasSecondary && cls.id === 'firework') this.splitOwnedFireworks(p.id);
    p.wasSecondary = secondary;

    if (f || secondary) this.fire(p, barrels);
    this.maintainDrones(p, dt);
    this.updateAutoTurrets(p, dt);
  }

  private fire(p: Player, barrels: BarrelDef[]) {
    for (let i = 0; i < barrels.length; i++) {
      const barrel = barrels[i];
      const trigger = barrel.trigger ?? 'primary';
      const requested = trigger === 'secondary' ? p.input.secondary : p.input.f;
      if (!requested || barrel.projectile === 'drone' || p.cd[i] > 0 || this.bullets.length >= MAX_BULLETS) continue;
      this.fireBarrel(p, barrel, p.angle + barrel.angle);
      p.cd[i] = p.d.reload;
    }
  }

  private fireBarrel(p: Player, barrel: BarrelDef, direction: number, origin?: Target) {
    if (this.bullets.length >= MAX_BULLETS) return;
    const cls = CLASS_BY_ID[p.cls];
    const spreadAngle = direction + (barrel.spread ? (this.rng() * 2 - 1) * barrel.spread : 0);
    const sc = p.r / 26;
    const cx = Math.cos(direction), cy = Math.sin(direction);
    const bulletRadius = barrel.width * 0.5 * sc;
    const kind = barrel.projectile ?? 'bullet';
    const muzzleX = origin?.x ?? (p.x + cx * barrel.length * sc - cy * barrel.offset * sc);
    const muzzleY = origin?.y ?? (p.y + cy * barrel.length * sc + cx * barrel.offset * sc);
    let speed = p.d.bulletSpeed * (barrel.speedMul ?? 1);
    let life = BULLET_LIFE_S * (cls.bulletLifeMul ?? 1);
    if (kind === 'trap') { speed = 0; life = cls.trapLife ?? 9; }
    else if (kind === 'missile') { speed *= 0.52; life *= 1.6; }
    else if (kind === 'firework') { life = 1.45; }
    else if (kind === 'drone') { speed *= 0.55; life = DRONE_LIFE_S; }

    const bullet: Bullet = {
      id: this.nextId++, owner: p.id, x: muzzleX, y: muzzleY,
      vx: Math.cos(spreadAngle) * speed, vy: Math.sin(spreadAngle) * speed,
      r: bulletRadius, dmg: p.d.bulletDamage * (barrel.damageMul ?? 1), hp: kind === 'drone' ? 8 : kind === 'trap' ? 100 : p.d.bulletHp,
      life, hit: new Set(), kind, angle: spreadAngle,
      maxSpeed: kind === 'missile' ? p.d.bulletSpeed * 1.45 : speed,
      turnRate: kind === 'missile' ? 2.7 : 4.2,
    };
    this.bullets.push(bullet);

    // Recoil is per barrel and based on projectile cross-sectional area.
    // Rear barrels naturally propel the tank forward because recoil opposes their shot direction.
    const sizeRatio = barrel.width / 20;
    const recoilDistance = BASE_RECOIL_DISTANCE * sizeRatio * sizeRatio * (barrel.recoil ?? 1);
    const recoilImpulse = recoilDistance * SERVER_TICK_HZ * (1 - RECOIL_DECAY_PER_TICK);
    p.rvx -= Math.cos(spreadAngle) * recoilImpulse;
    p.rvy -= Math.sin(spreadAngle) * recoilImpulse;
  }

  private nextDroneFormationSlot(ownerId: number, limit: number): number {
    const occupied = new Set<number>();
    for (const bullet of this.bullets) {
      if (bullet.owner === ownerId && bullet.kind === 'drone' && bullet.formationSlot != null) {
        occupied.add(bullet.formationSlot);
      }
    }
    for (let slot = 0; slot < limit; slot++) if (!occupied.has(slot)) return slot;
    return occupied.size % Math.max(1, limit);
  }

  private maintainDrones(p: Player, dt: number) {
    const cls = CLASS_BY_ID[p.cls];
    if (!cls.droneLimit) return;
    p.droneSpawnCd = Math.max(0, p.droneSpawnCd - dt);
    const current = this.bullets.reduce((n, b) => n + (b.owner === p.id && b.kind === 'drone' ? 1 : 0), 0);
    if (current >= cls.droneLimit || p.droneSpawnCd > 0 || this.bullets.length >= MAX_BULLETS) return;

    const slot = this.nextDroneFormationSlot(p.id, cls.droneLimit);
    const source = cls.barrels.find((barrel) => barrel.projectile === 'drone');
    const ring = Math.floor(slot / 8);
    const slotsInRing = Math.min(8, cls.droneLimit - ring * 8);
    const slotAngle = p.angle + ((slot % 8) / Math.max(1, slotsInRing)) * Math.PI * 2 + ring * 0.28;
    const length = source?.length ?? 28;
    const radius = source?.width ?? 14;
    const origin = { x: p.x + Math.cos(slotAngle) * (p.r + 5), y: p.y + Math.sin(slotAngle) * (p.r + 5) };
    const drone: Bullet = {
      id: this.nextId++, owner: p.id, x: origin.x, y: origin.y,
      vx: Math.cos(slotAngle) * 70, vy: Math.sin(slotAngle) * 70,
      r: radius * 0.65, dmg: p.d.bulletDamage * (cls.droneDamageMul ?? 0.85),
      hp: 8, life: DRONE_LIFE_S, hit: new Set(), kind: 'drone',
      angle: slotAngle, maxSpeed: 300 * (cls.droneSpeedMul ?? 1), turnRate: 4.6,
      formationSlot: slot,
    };
    // Keep the first spawn close to the tank; barrel length is used as a size hint for drone spacing.
    drone.x += Math.cos(slotAngle) * Math.min(8, length * 0.1);
    drone.y += Math.sin(slotAngle) * Math.min(8, length * 0.1);
    this.bullets.push(drone);
    p.droneSpawnCd = cls.droneBehavior === 'factory' ? 0.28 : 0.38;
  }

  private updateDrone(drone: Bullet, dt: number) {
    const owner = this.players.get(drone.owner);
    if (!owner?.alive) {
      drone.x += drone.vx * dt; drone.y += drone.vy * dt;
      return;
    }
    const cls = CLASS_BY_ID[owner.cls];
    const aimAngle = owner.input.a;
    const manualCommand = owner.input.secondary;
    const isOverlord = cls.id === 'overlord';
    const ownerDistance = Math.hypot(drone.x - owner.x, drone.y - owner.y);
    const leashRetreat = isOverlord && ownerDistance > OVERLORD_DRONE_RECALL_RADIUS;
    // Overlord drones can only acquire targets while inside their command radius.
    // Crossing the recall radius cancels the attack and pulls the drone home.
    const target = manualCommand || leashRetreat
      ? null
      : this.findTarget(owner, isOverlord ? OVERLORD_DRONE_RECALL_RADIUS : 980, aimAngle);

    const slot = Math.max(0, drone.formationSlot ?? (drone.id % 8));
    const ring = Math.floor(slot / 8);
    const ringIndex = slot % 8;
    const slotAngle = (ringIndex / 8) * Math.PI * 2 + ring * 0.28 + this.time * 0.2;

    let goalX: number, goalY: number;
    let attackRun = false;
    let targetDistance = Number.POSITIVE_INFINITY;

    if (leashRetreat) {
      const regroupRadius = owner.r + 42 + ring * 18;
      goalX = owner.x + Math.cos(slotAngle) * regroupRadius;
      goalY = owner.y + Math.sin(slotAngle) * regroupRadius;
    } else if (target) {
      attackRun = true;
      const dx = target.x - drone.x, dy = target.y - drone.y;
      targetDistance = Math.hypot(dx, dy);
      // Aim for the object/player itself. The earlier ring-around-target goal
      // was the cause of drones orbiting just outside collision range.
      goalX = target.x;
      goalY = target.y;
    } else if (manualCommand) {
      // Right-click / Shift remains direct, but Overlord commands cannot exceed
      // the tether's safe attack radius.
      attackRun = true;
      const commandDistance = isOverlord ? OVERLORD_DRONE_RECALL_RADIUS - 40 : 560;
      goalX = owner.x + Math.cos(aimAngle) * commandDistance;
      goalY = owner.y + Math.sin(aimAngle) * commandDistance;
    } else if (Math.hypot(drone.x - owner.x, drone.y - owner.y) > 650) {
      // Regroup distant drones behind the tank before they get stranded.
      goalX = owner.x + Math.cos(slotAngle) * (owner.r + 28 + ring * 30);
      goalY = owner.y + Math.sin(slotAngle) * (owner.r + 28 + ring * 30);
    } else {
      // While idle, keep a loose moving guard formation around the owner.
      const followRadius = 112 + ring * 38;
      goalX = owner.x + Math.cos(slotAngle) * followRadius;
      goalY = owner.y + Math.sin(slotAngle) * followRadius;
    }

    // Separation is deliberately gentle during an attack run. Drones should
    // avoid occupying the same space, but must still be able to reach the target.
    let separationX = 0, separationY = 0;
    for (const other of this.bullets) {
      if (other === drone || other.owner !== drone.owner || other.kind !== 'drone' || other.hp <= 0) continue;
      const dx = drone.x - other.x, dy = drone.y - other.y;
      const distanceSq = dx * dx + dy * dy;
      const minDistance = (drone.r + other.r) * 1.4 + 3;
      if (distanceSq >= minDistance * minDistance) continue;
      const distance = Math.max(0.001, Math.sqrt(distanceSq));
      const push = (minDistance - distance) / minDistance;
      separationX += (dx / distance) * push;
      separationY += (dy / distance) * push;
    }
    const separationWeight = attackRun
      ? clamp(targetDistance / 130, 0.12, 0.62)
      : 1;
    const steerX = goalX - drone.x + separationX * (drone.r * 8 + 28) * separationWeight;
    const steerY = goalY - drone.y + separationY * (drone.r * 8 + 28) * separationWeight;
    const desired = Math.atan2(steerY, steerX);
    const turnRate = drone.turnRate * (attackRun ? 1.3 : 1);
    drone.angle += clamp(angleDelta(drone.angle, desired), -turnRate * dt, turnRate * dt);

    const distanceToGoal = Math.hypot(steerX, steerY);
    const currentSpeed = Math.hypot(drone.vx, drone.vy);
    const speedFactor = attackRun ? clamp(distanceToGoal / 165, 0.1, 1) : clamp(distanceToGoal / 150, 0.38, 1);
    const desiredSpeed = drone.maxSpeed * speedFactor;
    const speed = currentSpeed + (desiredSpeed - currentSpeed) * (1 - Math.exp(-dt * (attackRun ? 5 : 3.5)));
    drone.vx = Math.cos(drone.angle) * speed;
    drone.vy = Math.sin(drone.angle) * speed;
    drone.dmg = owner.d.bulletDamage * (cls.droneDamageMul ?? 0.85);
    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;
  }
  private updateMissile(missile: Bullet, dt: number) {
    const owner = this.players.get(missile.owner);
    if (owner?.alive) {
      const target = this.findTarget(owner, 900, missile.angle);
      if (target) {
        const desired = Math.atan2(target.y - missile.y, target.x - missile.x);
        missile.angle += clamp(angleDelta(missile.angle, desired), -missile.turnRate * dt, missile.turnRate * dt);
      }
    }
    const speed = Math.min(missile.maxSpeed, Math.hypot(missile.vx, missile.vy) + 420 * dt);
    missile.vx = Math.cos(missile.angle) * speed;
    missile.vy = Math.sin(missile.angle) * speed;
    missile.x += missile.vx * dt; missile.y += missile.vy * dt;
  }

  private findTarget(owner: Player, range: number, preferredAngle: number): Target | null {
    let best: Target | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const p of this.players.values()) {
      if (!p.alive || p.id === owner.id) continue;
      const dx = p.x - owner.x, dy = p.y - owner.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const angle = Math.atan2(dy, dx);
      const score = distance * (1 + Math.abs(angleDelta(preferredAngle, angle)) * 0.35);
      if (score < bestScore) { bestScore = score; best = { x: p.x, y: p.y, r: p.r }; }
    }
    if (best) return best;
    for (const s of this.shapes) {
      const dx = s.x - owner.x, dy = s.y - owner.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const angle = Math.atan2(dy, dx);
      const score = distance * (1 + Math.abs(angleDelta(preferredAngle, angle)) * 0.5);
      if (score < bestScore) { bestScore = score; best = { x: s.x, y: s.y, r: s.r }; }
    }
    return best;
  }

  private updateAutoTurrets(p: Player, dt: number) {
    const cls = CLASS_BY_ID[p.cls];
    const count = cls.turretCount ?? 0;
    if (!count) return;
    const range = cls.turretRange ?? 560;
    const kind = cls.turretProjectile ?? 'bullet';
    const width = kind === 'trap' ? 15 : 9;
    const barrel: BarrelDef = {
      angle: 0, offset: 0, length: 24, width, delay: 0,
      recoil: kind === 'trap' ? 0.35 : 0.12, projectile: kind,
      damageMul: kind === 'trap' ? 0.75 : 0.42, speedMul: 1,
    };
    for (let i = 0; i < count; i++) {
      p.autoCd[i] = Math.max(0, (p.autoCd[i] ?? 0) - dt);
      if (p.autoCd[i] > 0) continue;
      const target = this.findTarget(p, range, p.angle + (i / count) * Math.PI * 2);
      if (!target) continue;
      const angle = Math.atan2(target.y - p.y, target.x - p.x);
      const orbit = (i / count) * Math.PI * 2;
      const origin = {
        x: p.x + Math.cos(orbit) * p.r * 0.48,
        y: p.y + Math.sin(orbit) * p.r * 0.48,
      };
      this.fireBarrel(p, barrel, angle, origin);
      p.autoCd[i] = p.d.reload * (cls.turretReloadMul ?? 1.2);
    }
  }

  private explodeExpiredFireworks() {
    for (const rocket of this.bullets) {
      if (rocket.kind !== 'firework' || rocket.life > 0 || rocket.hp <= 0) continue;
      this.explodeFirework(rocket);
    }
  }

  private splitOwnedFireworks(ownerId: number) {
    for (const rocket of this.bullets) {
      if (rocket.owner === ownerId && rocket.kind === 'firework' && rocket.hp > 0) {
        this.explodeFirework(rocket);
      }
    }
  }

  private explodeFirework(rocket: Bullet) {
    rocket.hp = 0;
    const baseAngle = rocket.angle;
    const speed = Math.max(260, Math.hypot(rocket.vx, rocket.vy) * 0.75);
    for (let i = 0; i < FIREWORK_PELLETS && this.bullets.length < MAX_BULLETS; i++) {
      const angle = baseAngle + (i / FIREWORK_PELLETS) * Math.PI * 2;
      this.bullets.push({
        id: this.nextId++, owner: rocket.owner, x: rocket.x, y: rocket.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: Math.max(3, rocket.r * 0.45), dmg: rocket.dmg * 0.42, hp: 1,
        life: 0.8, hit: new Set(), kind: 'bullet', angle, maxSpeed: speed, turnRate: 0,
      });
    }
  }

  private updateShape(s: Shape, dt: number) {
    s.x += (s.vx + s.kvx) * dt; s.y += (s.vy + s.kvy) * dt; s.rot += s.rotSpeed * dt;
    const dec = Math.exp(-dt * 4);
    s.kvx *= dec; s.kvy *= dec;
    s.hitFlash = Math.max(0, (s.hitFlash ?? 0) * Math.exp(-dt * 7));
    if (s.x < s.r || s.x > ARENA_SIZE - s.r) { s.vx = -s.vx; s.x = clamp(s.x, s.r, ARENA_SIZE - s.r); }
    if (s.y < s.r || s.y > ARENA_SIZE - s.r) { s.vy = -s.vy; s.y = clamp(s.y, s.r, ARENA_SIZE - s.r); }
  }

  spawnShape() {
    const total = SHAPE_KINDS.reduce((sum, kind) => sum + SHAPES[kind].weight, 0);
    let roll = this.rng() * total, kind = 0;
    for (let i = 0; i < SHAPE_KINDS.length; i++) {
      roll -= SHAPES[SHAPE_KINDS[i]].weight;
      if (roll <= 0) { kind = i; break; }
    }
    const def = SHAPES[SHAPE_KINDS[kind]];
    const angle = this.rng() * Math.PI * 2, speed = 6 + this.rng() * 12;
    this.shapes.push({
      id: this.nextId++, kind, x: 100 + this.rng() * (ARENA_SIZE - 200), y: 100 + this.rng() * (ARENA_SIZE - 200),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, kvx: 0, kvy: 0,
      r: def.radius, hp: def.hp, maxHp: def.hp, rot: this.rng() * 6.28,
      rotSpeed: (this.rng() - 0.5) * 0.8, lastHitBy: null,
      hitFlash: 0, hitX: 0, hitY: 0, hitAngle: 0,
    });
  }

  // ---------- collisions ----------
  private collideAll(dt: number) {
    const entities: Ent[] = [];
    for (const p of this.players.values()) if (p.alive) entities.push({ k: 0, o: p });
    for (const s of this.shapes) entities.push({ k: 1, o: s });
    for (const b of this.bullets) if (b.hp > 0 && b.life > 0) entities.push({ k: 2, o: b });
    this.grid.clear();
    entities.forEach((entity, index) => this.grid.insert(index, entity.o.x, entity.o.y));
    entities.forEach((a, i) => {
      this.grid.forNeighbors(a.o.x, a.o.y, (j) => {
        if (j > i) this.collidePair(a, entities[j], dt);
      });
    });
  }

  private collidePair(e1: Ent, e2: Ent, dt: number) {
    const [a, b] = e1.k <= e2.k ? [e1, e2] : [e2, e1];
    const A = a.o as Player, B = b.o as Player;
    const dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const distance = Math.max(Math.sqrt(d2), 0.001);
    if (a.k === 0 && b.k === 0) {
      this.separate(A, B, dx, dy, distance, rr, A.r * A.r, B.r * B.r);
      if (A.protT <= 0 && B.protT <= 0) {
        this.hurtPlayer(A, B.d.bodyDps * dt, B.id, B.name);
        this.hurtPlayer(B, A.d.bodyDps * dt, A.id, A.name);
      }
    } else if (a.k === 0 && b.k === 1) {
      const shape = b.o as unknown as Shape, def = SHAPES[SHAPE_KINDS[shape.kind]];
      this.separate(A, shape as unknown as Player, dx, dy, distance, rr, A.r * A.r, shape.r * shape.r * 1.5);
      if (A.protT <= 0) this.hurtPlayer(A, def.bodyDps * dt, null, 'a shape');
      shape.hp -= A.d.bodyDps * dt; shape.lastHitBy = A.id;
      const nx = dx / distance, ny = dy / distance;
      const bodyImpact = clamp(Math.hypot(A.vx, A.vy) * 0.16 + A.d.bodyDps * 0.45, 14, 62);
      this.impactShape(shape, A.x + nx * A.r, A.y + ny * A.r, nx, ny, bodyImpact);
    } else if (a.k === 0 && b.k === 2) {
      const bullet = b.o as unknown as Bullet;
      const firstDroneContact = bullet.kind === 'drone' && !bullet.hit.has(A.id);
      if (bullet.owner === A.id || A.protT > 0 || !this.projectileCanHit(bullet, A.id)) return;
      if (bullet.kind === 'drone') bullet.hit.add(A.id);
      const owner = this.players.get(bullet.owner);
      this.hurtPlayer(A, bullet.dmg, bullet.owner, owner?.name ?? 'Someone');
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0) : bullet.kind === 'trap' ? 1 : PLAYER_PIERCE_COST;
      A.kvx += bullet.vx / 8; A.kvy += bullet.vy / 8;
    } else if (a.k === 1 && b.k === 2) {
      const shape = a.o as unknown as Shape, bullet = b.o as unknown as Bullet;
      const firstDroneContact = bullet.kind === 'drone' && !bullet.hit.has(shape.id);
      if (!this.projectileCanHit(bullet, shape.id)) return;
      if (bullet.kind === 'drone') bullet.hit.add(shape.id);
      shape.hp -= bullet.dmg; shape.lastHitBy = bullet.owner;
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0) : bullet.kind === 'trap' ? 1 : SHAPES[SHAPE_KINDS[shape.kind]].pierceCost;
      const def = SHAPES[SHAPE_KINDS[shape.kind]];
      const speed = Math.hypot(bullet.vx, bullet.vy);
      const impulse = clamp(speed * 0.11 * (28 / def.radius) + bullet.dmg * 0.4, 18, 105);
      const nx = speed > 0.001 ? bullet.vx / speed : Math.cos(bullet.angle);
      const ny = speed > 0.001 ? bullet.vy / speed : Math.sin(bullet.angle);
      this.impactShape(shape, bullet.x, bullet.y, nx, ny, impulse);
    }
  }

  private separate(
    A: { x: number; y: number; kvx: number; kvy: number },
    B: { x: number; y: number; kvx: number; kvy: number },
    dx: number, dy: number, distance: number, rr: number, massA: number, massB: number,
  ) {
    const nx = dx / distance, ny = dy / distance, overlap = rr - distance, totalMass = massA + massB;
    A.x -= nx * overlap * (massB / totalMass); A.y -= ny * overlap * (massB / totalMass);
    B.x += nx * overlap * (massA / totalMass); B.y += ny * overlap * (massA / totalMass);
    const kick = Math.min(overlap, 30) * 6;
    A.kvx -= nx * kick * (massB / totalMass); A.kvy -= ny * kick * (massB / totalMass);
    B.kvx += nx * kick * (massA / totalMass); B.kvy += ny * kick * (massA / totalMass);
  }

  private impactShape(shape: Shape, x: number, y: number, dirX: number, dirY: number, impulse: number) {
    const length = Math.max(0.001, Math.hypot(dirX, dirY));
    const nx = dirX / length, ny = dirY / length;
    shape.kvx += nx * impulse;
    shape.kvy += ny * impulse;
    shape.hitFlash = 1;
    shape.hitX = x; shape.hitY = y; shape.hitAngle = Math.atan2(ny, nx);

    // Off-centre impacts add a little spin, making each hit read as a physical collision.
    const armX = x - shape.x, armY = y - shape.y;
    const torque = (armX * ny - armY * nx) / Math.max(1, shape.r);
    shape.rotSpeed += clamp(torque * impulse * 0.012, -1.6, 1.6);
  }

  private projectileCanHit(bullet: Bullet, targetId: number): boolean {
    if (bullet.kind !== 'drone') {
      if (bullet.hit.has(targetId)) return false;
      bullet.hit.add(targetId);
      return true;
    }
    const cooldowns = bullet.hitCooldowns ?? (bullet.hitCooldowns = new Map<number, number>());
    const nextHit = cooldowns.get(targetId) ?? 0;
    if (this.time < nextHit) return false;
    cooldowns.set(targetId, this.time + 0.62);
    return true;
  }

  private hurtPlayer(p: Player, amount: number, byId: number | null, byName: string) {
    if (amount <= 0) return;
    p.hp -= amount;
    p.lastDamageT = this.time;
    p.lastHit = { id: byId, name: byName };
    p.stealthT = 0; p.visibility = 1;
  }

  private reap() {
    for (const p of this.players.values()) {
      if (!p.alive || p.hp > 0) continue;
      p.alive = false; p.hp = 0; p.input.f = false; p.input.secondary = false;
      this.bullets = this.bullets.filter((b) => b.owner !== p.id || b.kind === 'bullet');
      const killer = p.lastHit?.id != null ? this.players.get(p.lastHit.id) : undefined;
      if (killer && killer.alive && killer.id !== p.id) this.addXp(killer, Math.max(25, Math.floor(p.xp * 0.6)));
      this.events.push({ type: 'dead', id: p.id, killer: p.lastHit?.name ?? 'the arena', score: p.xp, level: p.level });
    }
    if (this.shapes.some((shape) => shape.hp <= 0)) {
      for (const shape of this.shapes) {
        if (shape.hp > 0) continue;
        const killer = shape.lastHitBy != null ? this.players.get(shape.lastHitBy) : undefined;
        if (killer?.alive) {
          this.addXp(killer, SHAPES[SHAPE_KINDS[shape.kind]].xp);
          if (CLASS_BY_ID[killer.cls].droneBehavior === 'necromancer' && shape.kind === 0) this.convertSquareToDrone(killer, shape);
        }
      }
      this.shapes = this.shapes.filter((shape) => shape.hp > 0);
    }
  }

  private convertSquareToDrone(owner: Player, shape: Shape) {
    const cls = CLASS_BY_ID[owner.cls];
    const owned = this.bullets.filter((b) => b.owner === owner.id && b.kind === 'drone').length;
    if (owned >= (cls.droneLimit ?? 0) || this.bullets.length >= MAX_BULLETS) return;
    const formationSlot = this.nextDroneFormationSlot(owner.id, cls.droneLimit ?? 8);
    this.bullets.push({
      id: this.nextId++, owner: owner.id, x: shape.x, y: shape.y, vx: 0, vy: 0,
      r: 12, dmg: owner.d.bulletDamage * (cls.droneDamageMul ?? 0.6), hp: 8,
      life: DRONE_LIFE_S, hit: new Set(), kind: 'drone', angle: owner.angle,
      maxSpeed: 300 * (cls.droneSpeedMul ?? 1), turnRate: 4.6, formationSlot,
    });
  }

  addXp(p: Player, amount: number) {
    p.xp += amount;
    p.level = levelFromXp(p.xp);
    this.refresh(p);
  }

  private refresh(p: Player) {
    const previousMax = p.maxHp;
    p.d = deriveStats(p.level, p.stats, p.cls);
    p.maxHp = p.d.maxHp;
    p.r = p.d.radius;
    if (previousMax > 0) p.hp = Math.min(p.maxHp, p.hp * (p.maxHp / previousMax));
    p.pts = statPointsEarned(p.level) - p.stats.reduce((sum, value) => sum + value, 0);
    const cls = CLASS_BY_ID[p.cls];
    if (p.cd.length !== cls.barrels.length) p.cd = new Array(cls.barrels.length).fill(0);
    if (p.autoCd.length !== (cls.turretCount ?? 0)) p.autoCd = new Array(cls.turretCount ?? 0).fill(0);
  }

  // ---------- output ----------
  leaderboard(limit = 10) {
    return [...this.players.values()].filter((p) => p.alive).sort((a, b) => b.xp - a.xp).slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, score: p.xp, lv: p.level }));
  }

  drainEvents(): GameEvent[] { const events = this.events; this.events = []; return events; }

  snapshotFor(id: number): Snapshot | null {
    const me = this.players.get(id);
    if (!me) return null;
    const near = (x: number, y: number, radius: number) =>
      Math.abs(x - me.x) <= VIEW_HALF + radius && Math.abs(y - me.y) <= VIEW_HALF + radius;
    const currentXp = totalXpForLevel(me.level);
    const nextXp = me.level >= 45 ? currentXp : totalXpForLevel(me.level + 1);
    const myClass = CLASS_BY_ID[me.cls];
    const focus = myClass.id === 'predator' && me.input.secondary ? 1.55 : 1;
    return {
      t: 's', tick: this.tick,
      me: {
        alive: me.alive, hp: r1(me.hp), mhp: r1(me.maxHp), lv: me.level, xp: me.xp,
        xpCur: currentXp, xpNext: nextXp, pts: me.pts, stats: me.stats.slice(),
        cls: me.cls, opts: me.alive ? classOptions(me.cls, me.level) : [], fov: me.d.fovMul * focus,
      },
      p: [...this.players.values()].filter((player) => player.alive && near(player.x, player.y, player.r)).map((player) => ({
        id: player.id, name: player.name, x: r1(player.x), y: r1(player.y), a: r2(player.angle),
        hp: r1(player.hp), mhp: r1(player.maxHp), r: r1(player.r), lv: player.level,
        cls: CLASS_IDS.indexOf(player.cls), prot: player.protT > 0 ? 1 : 0, vis: player.visibility,
      })),
      b: this.bullets.filter((bullet) => near(bullet.x, bullet.y, bullet.r)).map((bullet) => [
        bullet.id, r1(bullet.x), r1(bullet.y), r1(bullet.r), bullet.owner,
        PROJECTILE_KIND_IDS[bullet.kind], r2(bullet.angle),
      ]),
      sh: this.shapes.filter((shape) => near(shape.x, shape.y, shape.r)).map((shape) =>
        [shape.id, r1(shape.x), r1(shape.y), r2(shape.rot), shape.kind, r2(shape.hp / shape.maxHp),
          r2(shape.hitFlash ?? 0), r1(shape.hitX ?? shape.x), r1(shape.hitY ?? shape.y), r2(shape.hitAngle ?? 0)]),
    };
  }
}
