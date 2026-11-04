import {
  ARENA_SIZE, BULLET_LIFE_S, CLASS_BY_ID, CLASS_IDS, MAX_BULLETS, MAX_PLAYERS, MAX_STAT_LEVEL, MAX_ZOMBIES, SURVIVAL_ARENA_SIZE, TEAM_BASE_DEPTH,
  PLAYER_PIERCE_COST, PROJECTILE_KIND_IDS, REGEN_DELAY_S, RESPAWN_PROTECTION_S, SHAPES,
  SHAPE_KINDS, SHAPE_TARGET_COUNT, SERVER_TICK_HZ, STAT_KEYS, VIEW_HALF,
  type BarrelDef, type ProjectileKind,
} from '../shared/config';
import {
  classOptions, deriveStats, levelFromXp, statPointsEarned, totalXpForLevel, type DerivedStats,
} from '../shared/progression';
import type { GameMode, RewardCardSnap, RewardRarity, Snapshot, TeamId, ZombieBossKind, ZombieBossPhase, ZombieKind, ZombieSnap, ZombieSpecialPhase } from '../shared/protocol';
import { SpatialGrid } from './grid';

type RewardOffer = { cards: RewardCardSnap[]; timeRemaining: number };
const REVIVE_SECONDS = 2.5;
const SURVIVAL_PERKS: { id: string; title: string; description: string; max: number }[] = [
  { id: 'heavyRounds', title: 'Heavy Rounds', description: '+15% projectile damage per stack', max: 4 },
  { id: 'rapidLoader', title: 'Rapid Loader', description: 'Fire 10% faster per stack', max: 4 },
  { id: 'blastRounds', title: 'Blast Rounds', description: 'Every fifth shot bursts in a small area', max: 3 },
  { id: 'lifesteal', title: 'Lifesteal', description: 'Recover 5% of projectile damage as health per stack', max: 4 },
  { id: 'droneWingman', title: 'Drone Wingman', description: 'Gain an extra automatic support drone', max: 3 },
  { id: 'cryoRounds', title: 'Cryo Rounds', description: 'Shots slow zombies for 3 seconds', max: 3 },
  { id: 'medicalSupplies', title: 'Medical Supplies', description: 'Healing pickups restore 18% more health per stack', max: 4 },
  { id: 'emergencyShield', title: 'Emergency Shield', description: 'A brief shield triggers at critical health', max: 2 },
  { id: 'piercingRounds', title: 'Piercing Rounds', description: 'Projectiles pass through one more enemy per stack', max: 3 },
  { id: 'explosiveImpact', title: 'Explosive Impact', description: 'Projectile hits splash nearby zombies', max: 3 },
];
const RARITY_SCORE: Record<RewardRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export interface Player {
  id: number; name: string;
  x: number; y: number; vx: number; vy: number; kvx: number; kvy: number; rvx: number; rvy: number;
  r: number; angle: number; hp: number; maxHp: number;
  level: number; xp: number; pts: number; stats: number[]; cls: string;
  team: TeamId | null; matchKills: number;
  alive: boolean; connected: boolean; downed: boolean; bleedoutT: number; reviveProgress: number; protT: number; lastDamageT: number;
  lastHit: { id: number | null; name: string; classId: string | null } | null;
  kills: number; damageDealt: number; damageTaken: number; lifeStartedAt: number;
  input: { mx: number; my: number; a: number; f: boolean; secondary: boolean; spin: boolean };
  wasFiring: boolean; wasSecondary: boolean; cd: number[]; autoCd: number[];
  droneSpawnCd: number; stealthT: number; visibility: number; d: DerivedStats;
  survivalPerks: Record<string, number>; rewardOffers: RewardOffer[]; shotsFired: number; emergencyShieldCd: number;
}
export interface Bullet {
  id: number; owner: number; x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; hp: number; life: number; hit: Set<number>;
  kind: ProjectileKind; angle: number; maxSpeed: number; turnRate: number;
  /** Stable place in the owner's drone formation, reused when a drone is lost. */
  formationSlot?: number;
  /** Drones may re-hit a target after a short contact cooldown. */
  hitCooldowns?: Map<number, number>;
  /** Drones cycle through a short strike, peel-away, and regroup pattern. */
  attackState?: 'guard' | 'dive' | 'recover';
  attackTargetId?: number;
  attackTimer?: number;
  attackCooldown?: number;
  attackEscapeAngle?: number;
  attackSide?: number;
  /** Hostile projectiles are used by survival bosses, never by player weapons. */
  hostile?: boolean;
  hostileName?: string;
  explosionRadius?: number; exploded?: boolean; chilled?: boolean;
}
export interface Zombie {
  id: number; x: number; y: number; vx: number; vy: number; kvx: number; kvy: number;
  r: number; hp: number; maxHp: number; speed: number; damage: number; xp: number;
  kind: ZombieKind;
  angle: number; targetId: number | null; staggerT: number; hitFlash: number; hitAngle: number;
  bossKind: ZombieBossKind | null; bossPhase: ZombieBossPhase; bossTimer: number; bossCooldown: number;
  bossAimX: number; bossAimY: number; bossPattern: number;
  specialPhase: ZombieSpecialPhase; specialTimer: number; specialCooldown: number; specialAimX: number; specialAimY: number;
  attackCooldown: number; damageBy: Map<number, number>; slowT: number;
}
export interface Shape {
  id: number; kind: number; x: number; y: number; vx: number; vy: number; kvx: number; kvy: number;
  r: number; hp: number; maxHp: number; rot: number; rotSpeed: number; lastHitBy: number | null;
  hitFlash?: number; hitX?: number; hitY?: number; hitAngle?: number;
}
export interface HealthDrop { id: number; x: number; y: number; r: number; heal: number; life: number; }
export interface XpDrop { id: number; x: number; y: number; r: number; xp: number; life: number; age: number; }
export interface DamagePool { id: number; x: number; y: number; r: number; damage: number; life: number; tick: number; }

export type GameEvent = {
  type: 'dead'; id: number; killer: string; killerClass: string | null;
  killerTeam: TeamId | null; victim: string; victimClass: string; victimTeam: TeamId | null;
  score: number; level: number; kills: number; damageDealt: number; damageTaken: number; lifetime: number;
};

type Ent = { k: 0 | 1 | 2 | 3; o: Player | Shape | Bullet | Zombie };
type Target = { x: number; y: number; r?: number; id?: number; vx?: number; vy?: number };
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
  zombies: Zombie[] = [];
  healthDrops: HealthDrop[] = [];
  xpDrops: XpDrop[] = [];
  damagePools: DamagePool[] = [];
  events: GameEvent[] = [];
  wave = 0;
  zombieKills = 0;
  survivalElapsed = 0;
  survivalGameOver = false;
  private waveSpawnRemaining = 0;
  private waveSpawned = 0;
  private waveSpawnTimer = 0;
  private waveIntermission = 0;
  private waveRewardIssued = false;
  private survivalStartedAt = 0;
  teamStats = {
    blue: { kills: 0 },
    red: { kills: 0 },
  };
  private nextId = 1;
  private grid = new SpatialGrid(128);

  get arenaSize() { return this.mode === 'survival' ? SURVIVAL_ARENA_SIZE : ARENA_SIZE; }

  constructor(
    private rng: () => number = Math.random,
    initialShapes = SHAPE_TARGET_COUNT,
    readonly mode: GameMode = 'ffa',
  ) {
    if (mode !== 'survival') {
      for (let i = 0; i < initialShapes; i++) this.spawnShape();
    }
  }

  addPlayer(name: string): Player | null {
    if (this.players.size >= MAX_PLAYERS) return null;
    const stats = STAT_KEYS.map(() => 0);
    const p: Player = {
      id: this.nextId++, name, x: 0, y: 0, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
      r: 26, angle: 0, hp: 50, maxHp: 0, level: 1, xp: 0, pts: 0, stats, cls: 'basic',
      team: this.mode === 'teams' ? this.assignTeam() : null, matchKills: 0,
      alive: true, connected: true, downed: false, bleedoutT: 0, reviveProgress: 0,
      protT: 0, lastDamageT: -99, lastHit: null,
      kills: 0, damageDealt: 0, damageTaken: 0, lifeStartedAt: 0,
      input: { mx: 0, my: 0, a: 0, f: false, secondary: false, spin: false },
      wasFiring: false, wasSecondary: false, cd: [0], autoCd: [], droneSpawnCd: 0,
      stealthT: 0, visibility: 1, d: deriveStats(1, stats, 'basic'),
      survivalPerks: {}, rewardOffers: [], shotsFired: 0, emergencyShieldCd: 0,
    };
    this.players.set(p.id, p);
    this.respawn(p.id, name);
    if (this.mode === 'survival' && this.wave === 0) this.beginSurvivalWave();
    if (this.mode === 'survival') this.syncSurvivalWaveSize();
    return p;
  }

  private assignTeam(): TeamId {
    const blue = [...this.players.values()].filter((player) => player.connected && player.team === 'blue').length;
    const red = [...this.players.values()].filter((player) => player.connected && player.team === 'red').length;
    return blue <= red ? 'blue' : 'red';
  }

  removePlayer(id: number) {
    this.players.delete(id);
    this.bullets = this.bullets.filter((b) => b.owner !== id || b.kind === 'bullet');
    for (const zombie of this.zombies) zombie.damageBy.delete(id);
    if (this.mode === 'survival') {
      if (this.players.size === 0) this.resetSurvivalRun();
      else this.syncSurvivalWaveSize();
    }
  }

  /** Freeze a disconnected player during the reconnect grace period. */
  suspendPlayer(id: number): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    p.connected = false;
    p.input = { mx: 0, my: 0, a: p.angle, f: false, secondary: false, spin: false };
    p.wasFiring = false; p.wasSecondary = false;
    p.vx = p.vy = p.kvx = p.kvy = p.rvx = p.rvy = 0;
    this.bullets = this.bullets.filter((bullet) => bullet.owner !== id);
    return true;
  }

  /** Re-enable a suspended player without resetting their progression or position. */
  resumePlayer(id: number): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    p.connected = true;
    p.input = { mx: 0, my: 0, a: p.angle, f: false, secondary: false, spin: false };
    p.wasFiring = false; p.wasSecondary = false;
    p.vx = p.vy = p.kvx = p.kvy = p.rvx = p.rvy = 0;
    return true;
  }

  respawn(id: number, name?: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = true;
    if (this.mode === 'survival' && this.survivalGameOver) this.resetSurvivalRun();
    if (name) p.name = name;
    p.level = 1; p.xp = 0; p.stats = STAT_KEYS.map(() => 0); p.cls = 'basic'; p.maxHp = 0;
    const spawn = this.findSafeSpawn(p.r, p.team);
    p.x = spawn.x;
    p.y = spawn.y;
    p.vx = p.vy = p.kvx = p.kvy = p.rvx = p.rvy = 0;
    p.alive = true; p.downed = false; p.bleedoutT = 0; p.reviveProgress = 0;
    p.protT = RESPAWN_PROTECTION_S; p.lastHit = null; p.lastDamageT = -99;
    p.kills = 0; p.damageDealt = 0; p.damageTaken = 0; p.lifeStartedAt = this.time;
    p.input = { mx: 0, my: 0, a: p.angle, f: false, secondary: false, spin: false };
    p.wasFiring = false; p.wasSecondary = false; p.stealthT = 0; p.visibility = 1;
    p.droneSpawnCd = 0; p.cd = [0]; p.autoCd = [];
    this.bullets = this.bullets.filter((b) => b.owner !== id || b.kind === 'bullet');
    this.refresh(p);
    p.hp = p.maxHp;
    if (this.mode === 'survival' && this.wave === 0) this.beginSurvivalWave();
  }

  /**
   * Pick a quiet, unobstructed spawn point. Sampling is bounded so joining never
   * stalls the simulation; candidates are scored by nearby player traffic and
   * clearance from world shapes, with the best candidate used as a fallback.
   */
  private findSafeSpawn(radius: number, team: TeamId | null = null): { x: number; y: number } {
    const size = this.arenaSize;
    let best = { x: size / 2, y: size / 2 };
    let bestScore = -Infinity;
    const margin = Math.max(150, radius + 100);
    const minX = this.mode === 'survival' ? size * 0.36 : team === 'blue' ? 300 : team === 'red' ? ARENA_SIZE - 900 : margin;
    const maxX = this.mode === 'survival' ? size * 0.64 : team === 'blue' ? 900 : team === 'red' ? ARENA_SIZE - 300 : size - margin;
    for (let i = 0; i < 72; i++) {
      const x = minX + this.rng() * (maxX - minX);
      const y = margin + this.rng() * (size - margin * 2);
      let nearestPlayer = 1200;
      let playerTraffic = 0;
      for (const other of this.players.values()) {
        if (!other.connected || !other.alive || other.downed) continue;
        const distance = Math.hypot(x - other.x, y - other.y);
        nearestPlayer = Math.min(nearestPlayer, distance);
        if (distance < 520) playerTraffic += (520 - distance) / 520;
      }
      let nearestShape = 900;
      let shapeTraffic = 0;
      let blocked = false;
      for (const shape of this.shapes) {
        const distance = Math.hypot(x - shape.x, y - shape.y) - shape.r - radius;
        nearestShape = Math.min(nearestShape, distance);
        if (distance < 80) blocked = true;
        if (distance < 420) shapeTraffic += (420 - distance) / 420;
      }
      // Hard-avoid spawning inside an object; otherwise maximize open space and
      // separation from active players, with a strong penalty for busy clusters.
      const score = (blocked ? -5000 : 0)
        + Math.min(nearestPlayer, 1100) * 1.2
        + Math.min(nearestShape, 600) * 1.5
        - playerTraffic * 260
        - shapeTraffic * 95;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
      if (!blocked && nearestPlayer > 650 && nearestShape > 140 && playerTraffic < 0.2) return { x, y };
    }
    return best;
  }

  // ---------- validated player intents ----------
  setInput(id: number, input: { mx: number; my: number; a: number; f: boolean; secondary?: boolean; spin?: boolean }) {
    const p = this.players.get(id);
    if (!p || !p.connected || !p.alive || p.downed) return;
    const unit = (v: number) => Number.isFinite(v) ? clamp(v, -1, 1) : 0;
    p.input = {
      mx: unit(input.mx), my: unit(input.my),
      a: Number.isFinite(input.a) ? input.a : p.input.a,
      f: !!input.f, secondary: !!input.secondary, spin: !!input.spin,
    };
  }

  upgradeStat(id: number, idx: number): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || p.downed || !Number.isInteger(idx) || idx < 0 || idx >= STAT_KEYS.length) return false;
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
    if (!p || !p.alive || p.downed || !classOptions(p.cls, p.level).includes(classId)) return false;
    this.switchClass(p, classId);
    return true;
  }

  /** Bypasses evolution rules. The WebSocket server must authorize this before calling. */
  debugSetClass(id: number, classId: string): boolean {
    const p = this.players.get(id);
    if (!p || !p.alive || p.downed || !CLASS_IDS.includes(classId as (typeof CLASS_IDS)[number])) return false;
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
    for (const p of this.players.values()) if (p.connected && p.alive && !p.downed) this.updatePlayer(p, dt);
    for (const s of this.shapes) this.updateShape(s, dt);
    if (this.mode === 'survival') for (const zombie of this.zombies) this.updateZombie(zombie, dt);

    for (const b of this.bullets) {
      if (b.kind === 'drone') this.updateDrone(b, dt);
      else if (b.kind === 'missile') this.updateMissile(b, dt);
      else if (b.kind !== 'trap') { b.x += b.vx * dt; b.y += b.vy * dt; }
      b.life -= dt;
    }
    this.bullets = this.bullets.filter((bullet) => !this.isBlockedByEnemyBase(bullet));
    this.explodeExpiredFireworks();
    this.collideAll(dt);
    this.constrainAllTeamPlayers();
    this.reap();
    if (this.mode === 'survival') {
      this.updateHealthDrops(dt); this.updateXpDrops(dt); this.updateDamagePools(dt); this.updateSurvivalWaves(dt);
    }
    this.bullets = this.bullets.filter((b) =>
      b.hp > 0 && b.life > 0 && b.x > -80 && b.y > -80 && b.x < this.arenaSize + 80 && b.y < this.arenaSize + 80,
    );
    if (this.mode !== 'survival' && this.shapes.length < SHAPE_TARGET_COUNT && this.rng() < dt * 4) this.spawnShape();
  }

  private resetSurvivalRun() {
    this.zombies = [];
    this.healthDrops = [];
    this.xpDrops = [];
    this.damagePools = [];
    this.waveRewardIssued = false;
    this.wave = 0;
    this.zombieKills = 0;
    this.survivalElapsed = 0;
    this.survivalGameOver = false;
    this.waveSpawnRemaining = 0;
    this.waveSpawned = 0;
    this.waveSpawnTimer = 0;
    this.waveIntermission = 0;
    this.survivalStartedAt = this.time;
    this.bullets = [];
    this.shapes = [];
  }

  private survivalWaveZombieCount(playerCount: number) {
    const scale = 1 + Math.min(0.6, Math.max(0, playerCount - 1) * 0.18);
    return Math.min(70, Math.round((6 + this.wave * 3) * scale));
  }

  private syncSurvivalWaveSize() {
    if (this.mode !== 'survival' || this.wave === 0 || this.survivalGameOver) return;
    this.waveSpawnRemaining = Math.max(0, this.survivalWaveZombieCount(this.players.size) - this.waveSpawned);
  }

  private beginSurvivalWave() {
    if (this.mode !== 'survival' || this.survivalGameOver) return;
    this.wave++;
    this.waveSpawned = 0;
    this.waveSpawnRemaining = this.survivalWaveZombieCount(this.players.size);
    this.waveSpawnTimer = 1.1;
    this.waveIntermission = 0;
    this.waveRewardIssued = false;
    if (this.wave === 1) this.survivalStartedAt = this.time;
  }

  private chooseZombieKind(): ZombieKind {
    const available: [ZombieKind, number][] = [
      ['runner', this.wave >= 2 ? 0.17 : 0],
      ['tank', this.wave >= 3 ? 0.11 : 0],
      ['ranger', this.wave >= 4 ? 0.17 : 0],
      ['guardian', this.wave >= 5 ? 0.12 : 0],
      ['bomber', this.wave >= 6 ? 0.13 : 0],
      ['leaper', this.wave >= 7 ? 0.14 : 0],
      ['armoured', this.wave >= 6 ? 0.035 : 0], ['exploder', this.wave >= 8 ? 0.03 : 0],
      ['medic', this.wave >= 9 ? 0.025 : 0], ['splitter', this.wave >= 10 ? 0.025 : 0],
      ['stalker', this.wave >= 12 ? 0.02 : 0], ['commander', this.wave >= 14 ? 0.015 : 0],
    ];
    let roll = this.rng();
    for (const [kind, weight] of available) {
      roll -= weight;
      if (roll < 0) return kind;
    }
    return 'shambler';
  }

  private spawnZombie(forceKind?: ZombieKind) {
    if (this.zombies.length >= MAX_ZOMBIES) return false;
    const living = [...this.players.values()].filter((player) => player.connected && player.alive && !player.downed);
    if (!living.length) return false;
    const size = this.arenaSize;
    let best = { x: 70, y: 70 }, bestDistance = -Infinity;
    for (let i = 0; i < 24; i++) {
      const edge = Math.floor(this.rng() * 4);
      const along = 90 + this.rng() * (size - 180);
      const point = edge === 0 ? { x: 70, y: along }
        : edge === 1 ? { x: size - 70, y: along }
        : edge === 2 ? { x: along, y: 70 }
        : { x: along, y: size - 70 };
      const nearest = Math.min(...living.map((player) => Math.hypot(point.x - player.x, point.y - player.y)));
      if (nearest > bestDistance) { bestDistance = nearest; best = point; }
    }

    const isBossWave = this.wave > 0 && this.wave % 5 === 0 && this.waveSpawned === 0;
    const bossKinds: ZombieBossKind[] = ['breaker', 'spitter', 'summoner', 'colossus', 'nestMother', 'lich', 'devourer', 'abomination'];
    const bossKind = isBossWave ? bossKinds[(Math.floor(this.wave / 5) - 1) % bossKinds.length] : null;
    const kind = bossKind ? 'tank' : forceKind ?? this.chooseZombieKind();
    const players = Math.max(1, this.players.size);
    const hpScale = 1 + Math.min(0.36, (players - 1) * 0.12);
    const baseHp = 28 + this.wave * 11, baseDamage = 6 + this.wave * 1.25;
    const stats: Record<ZombieKind, { radius: number; hp: number; speed: number; damage: number; xp: number }> = {
      shambler: { radius: 17 + Math.min(8, this.wave * 0.5), hp: 1, speed: 1, damage: 1, xp: 1 },
      runner: { radius: 15, hp: 0.72, speed: 1.92, damage: 0.78, xp: 1.45 },
      tank: { radius: 30, hp: 3.15, speed: 0.52, damage: 1.65, xp: 2.65 },
      ranger: { radius: 18, hp: 1.08, speed: 0.78, damage: 0.72, xp: 1.75 },
      guardian: { radius: 25, hp: 2.3, speed: 0.7, damage: 1.18, xp: 2.4 },
      bomber: { radius: 19, hp: 0.86, speed: 1.34, damage: 0.95, xp: 1.65 },
      leaper: { radius: 18, hp: 1.12, speed: 0.88, damage: 1.28, xp: 1.9 },
      armoured: { radius: 25, hp: 2.55, speed: 0.66, damage: 1.35, xp: 2.8 },
      medic: { radius: 20, hp: 1.35, speed: 0.74, damage: 0.75, xp: 2.3 },
      exploder: { radius: 21, hp: 1.12, speed: 1.12, damage: 1.05, xp: 2.15 },
      splitter: { radius: 22, hp: 1.75, speed: 0.8, damage: 1.1, xp: 2.5 },
      stalker: { radius: 17, hp: 1.05, speed: 1.48, damage: 1.45, xp: 2.5 },
      commander: { radius: 24, hp: 2.15, speed: 0.72, damage: 1.2, xp: 3.1 },
    };
    const def = stats[kind];
    const hp = bossKind
      ? Math.round((1650 + this.wave * 105) * hpScale)
      : Math.round(baseHp * def.hp * (1 + Math.min(0.24, (players - 1) * 0.08)));
    const bossRadii: Record<ZombieBossKind, number> = { breaker: 60, spitter: 52, summoner: 56, colossus: 84, nestMother: 68, lich: 54, devourer: 72, abomination: 76 };
    const bossSpeeds: Record<ZombieBossKind, number> = { breaker: 64, spitter: 82, summoner: 66, colossus: 48, nestMother: 58, lich: 92, devourer: 74, abomination: 68 };
    const radius = bossKind ? bossRadii[bossKind] : def.radius;
    const speed = bossKind ? bossSpeeds[bossKind] : Math.min(220, (64 + this.wave * 3.5) * def.speed);
    const damageScale = 1 + Math.min(0.12, (players - 1) * 0.035);
    const damage = bossKind ? Math.min(48, (24 + this.wave * 1.15) * damageScale)
      : Math.min(42, baseDamage * def.damage * damageScale);
    this.zombies.push({
      id: this.nextId++, kind, x: best.x, y: best.y, vx: 0, vy: 0, kvx: 0, kvy: 0,
      r: radius, hp, maxHp: hp, speed, damage,
      xp: bossKind ? 420 + this.wave * 52 : Math.round((10 + this.wave * 3) * def.xp),
      angle: 0, targetId: null, staggerT: 0, hitFlash: 0, hitAngle: 0,
      bossKind, bossPhase: 'idle', bossTimer: 0,
      bossCooldown: bossKind === 'breaker' ? 0.9 : bossKind === 'spitter' ? 0.65 : bossKind === 'summoner' ? 1.5 : 0,
      bossAimX: 1, bossAimY: 0, bossPattern: 0,
      specialPhase: 'idle', specialTimer: 0,
      specialCooldown: kind === 'ranger' ? 0.8 : kind === 'bomber' ? 1.2 : kind === 'leaper' ? 1.1 : 0,
      specialAimX: 1, specialAimY: 0,
      attackCooldown: 0, damageBy: new Map(), slowT: 0,
    });
    return true;
  }

  private updateZombie(zombie: Zombie, dt: number) {
    zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);
    zombie.slowT = Math.max(0, zombie.slowT - dt);
    zombie.staggerT = Math.max(0, zombie.staggerT - dt);
    if (zombie.kind === 'medic') {
      for (const ally of this.zombies) if (ally !== zombie && ally.hp > 0 && Math.hypot(ally.x - zombie.x, ally.y - zombie.y) <= 205)
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.045 * dt);
    }
    zombie.hitFlash = Math.max(0, zombie.hitFlash * Math.exp(-dt * 8));
    let target = zombie.targetId == null ? undefined : this.players.get(zombie.targetId);
    if (!target?.connected || !target.alive || target.downed) {
      target = undefined;
      let bestScore = Infinity;
      for (const player of this.players.values()) {
        if (!player.connected || !player.alive || player.downed) continue;
        const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
        const pursuers = this.zombies.reduce((count, other) =>
          count + (other !== zombie && other.targetId === player.id ? 1 : 0), 0);
        const score = distance + pursuers * 135;
        if (score < bestScore) { bestScore = score; target = player; }
      }
      zombie.targetId = target?.id ?? null;
    }

    let separationX = 0, separationY = 0, alignmentX = 0, alignmentY = 0, neighbours = 0;
    for (const other of this.zombies) {
      if (other === zombie || other.hp <= 0) continue;
      let dx = zombie.x - other.x, dy = zombie.y - other.y, distance = Math.hypot(dx, dy);
      if (distance < 0.001) {
        const angle = (zombie.id * 2.399963229728653) % (Math.PI * 2);
        dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
      }
      if (distance < 190) { alignmentX += other.vx; alignmentY += other.vy; neighbours++; }
      const avoidRadius = (zombie.r + other.r + 18) * 1.8;
      if (distance < avoidRadius) {
        const push = (avoidRadius - distance) / avoidRadius;
        separationX += dx / distance * push; separationY += dy / distance * push;
      }
    }

    let desiredX = 0, desiredY = 0;
    if (zombie.bossKind) {
      const motion = this.updateBoss(zombie, target, dt);
      desiredX = motion.x; desiredY = motion.y;
    } else {
      const special = this.updateSpecialZombie(zombie, target, dt);
      if (special) { desiredX = special.x; desiredY = special.y; }
      else if (target) {
        const dx = target.x - zombie.x, dy = target.y - zombie.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        desiredX = dx / distance * zombie.speed; desiredY = dy / distance * zombie.speed;
      }
    }
    const separationLength = Math.hypot(separationX, separationY);
    if (separationLength > 0.001) {
      separationX /= separationLength; separationY /= separationLength;
      const weight = zombie.bossKind ? 0.55 : 1.1;
      desiredX += separationX * zombie.speed * weight;
      desiredY += separationY * zombie.speed * weight;
    }
    if (neighbours > 0) {
      desiredX += alignmentX / neighbours * 0.14;
      desiredY += alignmentY / neighbours * 0.14;
    }
    const stagger = zombie.staggerT > 0 ? (zombie.bossKind ? 1 : 0.32) : 1;
    const commanderBoost = !zombie.bossKind && this.zombies.some((ally) => ally !== zombie && ally.kind === 'commander' && ally.hp > 0 && Math.hypot(ally.x - zombie.x, ally.y - zombie.y) <= 245) ? 1.28 : 1;
    const slowMultiplier = zombie.slowT > 0 ? 0.62 : 1;
    desiredX *= stagger * commanderBoost * slowMultiplier; desiredY *= stagger * commanderBoost * slowMultiplier;
    const steer = 1 - Math.exp(-dt * (zombie.bossKind === 'breaker' && zombie.bossPhase === 'charge' ? 8.5 : 3.8));
    zombie.vx += (desiredX - zombie.vx) * steer; zombie.vy += (desiredY - zombie.vy) * steer;
    if (Math.hypot(zombie.vx, zombie.vy) > 6 && zombie.bossPhase !== 'windup' && zombie.specialPhase !== 'windup') {
      zombie.angle = Math.atan2(zombie.vy, zombie.vx);
    }
    zombie.x += (zombie.vx + zombie.kvx) * dt; zombie.y += (zombie.vy + zombie.kvy) * dt;
    const decay = Math.exp(-dt * 4.5);
    zombie.kvx *= decay; zombie.kvy *= decay;
    if (zombie.bossKind) zombie.kvx = zombie.kvy = 0;
    const size = this.arenaSize;
    zombie.x = clamp(zombie.x, zombie.r, size - zombie.r);
    zombie.y = clamp(zombie.y, zombie.r, size - zombie.r);
  }

  private updateSpecialZombie(zombie: Zombie, target: Player | undefined, dt: number): { x: number; y: number } | null {
    zombie.specialCooldown = Math.max(0, zombie.specialCooldown - dt);
    if (!target) return { x: 0, y: 0 };
    const dx = target.x - zombie.x, dy = target.y - zombie.y;
    const distance = Math.max(1, Math.hypot(dx, dy)), nx = dx / distance, ny = dy / distance;

    if (zombie.kind === 'ranger') {
      if (zombie.specialPhase === 'windup') {
        zombie.specialTimer = Math.max(0, zombie.specialTimer - dt);
        if (zombie.specialTimer === 0) {
          this.fireHostileProjectile(zombie.x, zombie.y, Math.atan2(zombie.specialAimY, zombie.specialAimX),
            265, Math.max(7, zombie.damage * 0.78), 7, 2.6, 'a ranged zombie bolt');
          zombie.specialPhase = 'idle'; zombie.specialCooldown = 2.35;
        }
      } else if (zombie.specialCooldown <= 0 && distance < 820) {
        const aimX = target.x + target.vx * 0.24 - zombie.x;
        const aimY = target.y + target.vy * 0.24 - zombie.y;
        const length = Math.max(1, Math.hypot(aimX, aimY));
        zombie.specialAimX = aimX / length; zombie.specialAimY = aimY / length;
        zombie.angle = Math.atan2(zombie.specialAimY, zombie.specialAimX);
        zombie.specialPhase = 'windup'; zombie.specialTimer = 0.5;
      }
      if (zombie.specialPhase === 'windup') return { x: 0, y: 0 };
      if (distance > 560) return { x: nx * zombie.speed, y: ny * zombie.speed };
      if (distance < 350) return { x: -nx * zombie.speed, y: -ny * zombie.speed };
      const side = zombie.id % 2 ? 1 : -1;
      return { x: -ny * zombie.speed * 0.55 * side, y: nx * zombie.speed * 0.55 * side };
    }

    if (zombie.kind === 'bomber') {
      if (zombie.specialPhase === 'windup') {
        zombie.specialTimer = Math.max(0, zombie.specialTimer - dt);
        if (zombie.specialTimer === 0) {
          this.explodeBomber(zombie); zombie.specialPhase = 'idle'; zombie.specialCooldown = 3.7;
        }
        return { x: 0, y: 0 };
      }
      if (distance < 205 && zombie.specialCooldown <= 0) {
        zombie.specialAimX = nx; zombie.specialAimY = ny;
        zombie.angle = Math.atan2(ny, nx);
        zombie.specialPhase = 'windup'; zombie.specialTimer = 0.62;
        return { x: 0, y: 0 };
      }
    }

    if (zombie.kind === 'leaper') {
      if (zombie.specialPhase === 'windup') {
        zombie.specialTimer = Math.max(0, zombie.specialTimer - dt);
        if (zombie.specialTimer === 0) { zombie.specialPhase = 'charge'; zombie.specialTimer = 0.52; }
        return { x: 0, y: 0 };
      }
      if (zombie.specialPhase === 'charge') {
        zombie.specialTimer = Math.max(0, zombie.specialTimer - dt);
        if (zombie.specialTimer === 0) {
          zombie.specialPhase = 'idle'; zombie.specialCooldown = 3.8; return { x: 0, y: 0 };
        }
        return { x: zombie.specialAimX * zombie.speed * 3.2, y: zombie.specialAimY * zombie.speed * 3.2 };
      }
      if (distance < 590 && zombie.specialCooldown <= 0) {
        const aimX = target.x + target.vx * 0.32 - zombie.x;
        const aimY = target.y + target.vy * 0.32 - zombie.y;
        const length = Math.max(1, Math.hypot(aimX, aimY));
        zombie.specialAimX = aimX / length; zombie.specialAimY = aimY / length;
        zombie.angle = Math.atan2(zombie.specialAimY, zombie.specialAimX);
        zombie.specialPhase = 'windup'; zombie.specialTimer = 0.58;
        return { x: 0, y: 0 };
      }
    }
    return null;
  }

  private fireHostileProjectile(
    x: number, y: number, angle: number, speed: number, damage: number, radius: number, life: number, name: string,
  ) {
    if (this.bullets.length >= MAX_BULLETS) return;
    this.bullets.push({
      id: this.nextId++, owner: -1, x: x + Math.cos(angle) * 18, y: y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: radius, dmg: damage, hp: 1, life, hit: new Set(), kind: 'bullet', angle,
      maxSpeed: speed, turnRate: 0, hostile: true, hostileName: name,
    });
  }

  private explodeBomber(bomber: Zombie) {
    bomber.hitFlash = 1;
    const radius = 158;
    for (const player of this.players.values()) {
      if (!player.connected || !player.alive || player.downed || player.protT > 0) continue;
      const dx = player.x - bomber.x, dy = player.y - bomber.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius + player.r) continue;
      const falloff = 1 - 0.25 * clamp(distance / (radius + player.r), 0, 1);
      this.hurtPlayer(player, bomber.damage * 1.7 * falloff, null, 'a bomber zombie');
      const length = Math.max(1, distance);
      player.kvx += dx / length * 145 * falloff;
      player.kvy += dy / length * 145 * falloff;
    }
  }

  private isZombieProtected(zombie: Zombie): boolean {
    return this.zombies.some((guardian) =>
      guardian !== zombie && guardian.kind === 'guardian' && guardian.hp > 0 &&
      Math.hypot(guardian.x - zombie.x, guardian.y - zombie.y) <= 185
    );
  }

  /** Server-authoritative boss brains. Each encounter has a readable wind-up. */
  private updateBoss(zombie: Zombie, target: Player | undefined, dt: number): { x: number; y: number } {
    zombie.bossCooldown = Math.max(0, zombie.bossCooldown - dt);
    if (zombie.bossPhase !== 'idle') zombie.bossTimer = Math.max(0, zombie.bossTimer - dt);

    const dx = target ? target.x - zombie.x : 0;
    const dy = target ? target.y - zombie.y : 0;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance, ny = dy / distance;

    if (zombie.bossKind === 'breaker' || zombie.bossKind === 'colossus') {
      if (zombie.bossPhase === 'windup') {
        if (zombie.bossTimer <= 0) {
          zombie.bossPhase = 'charge';
          zombie.bossTimer = 0.78;
        }
        return { x: 0, y: 0 };
      }
      if (zombie.bossPhase === 'charge') {
        if (zombie.bossTimer <= 0) {
          this.bossSlam(zombie);
          zombie.bossPhase = 'recovery';
          zombie.bossTimer = 1.05;
          zombie.bossCooldown = 4.1;
          return { x: 0, y: 0 };
        }
        return { x: zombie.bossAimX * zombie.speed * 4.5, y: zombie.bossAimY * zombie.speed * 4.5 };
      }
      if (zombie.bossPhase === 'recovery') {
        if (zombie.bossTimer > 0) return { x: nx * zombie.speed * 0.28, y: ny * zombie.speed * 0.28 };
        zombie.bossPhase = 'idle';
      }
      if (target && distance < 690 && zombie.bossCooldown <= 0) {
        const lead = 0.34;
        const aimX = target.x + target.vx * lead - zombie.x;
        const aimY = target.y + target.vy * lead - zombie.y;
        const aimLength = Math.max(1, Math.hypot(aimX, aimY));
        zombie.bossAimX = aimX / aimLength;
        zombie.bossAimY = aimY / aimLength;
        zombie.angle = Math.atan2(zombie.bossAimY, zombie.bossAimX);
        zombie.bossPhase = 'windup';
        zombie.bossTimer = 1.02;
        return { x: 0, y: 0 };
      }
      return target ? { x: nx * zombie.speed, y: ny * zombie.speed } : { x: 0, y: 0 };
    }

    if (zombie.bossKind === 'spitter') {
      if (zombie.bossPhase === 'windup') {
        if (zombie.bossTimer <= 0) {
          this.fireBossVolley(zombie, Math.atan2(zombie.bossAimY, zombie.bossAimX));
          zombie.bossPattern = (zombie.bossPattern + 1) % 3;
          zombie.bossPhase = 'idle';
          zombie.bossCooldown = 2.05;
        }
      } else if (target && zombie.bossCooldown <= 0) {
        const lead = 0.22;
        const aimX = target.x + target.vx * lead - zombie.x;
        const aimY = target.y + target.vy * lead - zombie.y;
        const aimLength = Math.max(1, Math.hypot(aimX, aimY));
        zombie.bossAimX = aimX / aimLength;
        zombie.bossAimY = aimY / aimLength;
        zombie.angle = Math.atan2(zombie.bossAimY, zombie.bossAimX);
        zombie.bossPhase = 'windup';
        zombie.bossTimer = 0.5;
      }
      if (!target) return { x: 0, y: 0 };
      zombie.angle = Math.atan2(dy, dx);
      if (distance > 500) return { x: nx * zombie.speed, y: ny * zombie.speed };
      if (distance < 315) return { x: -nx * zombie.speed * 0.9, y: -ny * zombie.speed * 0.9 };
      const side = zombie.id % 2 === 0 ? 1 : -1;
      return { x: -ny * zombie.speed * 0.72 * side, y: nx * zombie.speed * 0.72 * side };
    }

    if (zombie.bossKind === 'lich') {
      if (zombie.bossPhase === 'windup') {
        if (zombie.bossTimer <= 0) {
          if (target) {
            const away = Math.atan2(zombie.y - target.y, zombie.x - target.x) + (zombie.bossPattern % 2 ? 0.65 : -0.65);
            zombie.x = clamp(target.x + Math.cos(away) * 330, zombie.r + 20, this.arenaSize - zombie.r - 20);
            zombie.y = clamp(target.y + Math.sin(away) * 330, zombie.r + 20, this.arenaSize - zombie.r - 20);
          }
          this.spawnBossMinions(zombie, 2);
          const pattern = zombie.bossPattern; zombie.bossPattern = 2;
          this.fireBossVolley(zombie, target ? Math.atan2(target.y - zombie.y, target.x - zombie.x) : zombie.angle);
          zombie.bossPattern = (pattern + 1) % 3;
          zombie.bossPhase = 'idle'; zombie.bossCooldown = 4.6;
        }
      } else if (zombie.bossCooldown <= 0) { zombie.bossPhase = 'windup'; zombie.bossTimer = 0.72; }
      if (!target) return { x: 0, y: 0 };
      return distance > 430 ? { x: nx * zombie.speed, y: ny * zombie.speed } : { x: -nx * zombie.speed * 0.45, y: -ny * zombie.speed * 0.45 };
    }
    if (zombie.bossKind === 'devourer') {
      if (!target) return { x: 0, y: 0 };
      zombie.angle = Math.atan2(dy, dx); return { x: nx * zombie.speed * 1.08, y: ny * zombie.speed * 1.08 };
    }
    if (zombie.bossKind === 'abomination') {
      const ratio = zombie.hp / Math.max(1, zombie.maxHp);
      const phase = ratio <= 0.33 ? 2 : ratio <= 0.66 ? 1 : 0;
      if (phase !== zombie.bossPattern) {
        zombie.bossPattern = phase; zombie.speed = phase === 0 ? 68 : phase === 1 ? 86 : 108;
        zombie.damage = Math.min(54, zombie.damage * (phase === 1 ? 1.12 : 1.18));
      }
      if (zombie.bossPhase === 'windup') {
        if (zombie.bossTimer <= 0) {
          this.bossSlam(zombie);
          if (phase >= 1) { const pattern = zombie.bossPattern; zombie.bossPattern = 2; this.fireBossVolley(zombie, target ? Math.atan2(dy, dx) : zombie.angle); zombie.bossPattern = pattern; }
          zombie.bossPhase = 'recovery'; zombie.bossTimer = phase === 2 ? 0.55 : 0.85; zombie.bossCooldown = phase === 2 ? 2.8 : 3.7;
        }
        return { x: 0, y: 0 };
      }
      if (zombie.bossPhase === 'recovery') { if (zombie.bossTimer > 0) return target ? { x: nx * zombie.speed * 0.25, y: ny * zombie.speed * 0.25 } : { x: 0, y: 0 }; zombie.bossPhase = 'idle'; }
      if (target && zombie.bossCooldown <= 0) { zombie.bossPhase = 'windup'; zombie.bossTimer = phase === 2 ? 0.52 : 0.78; return { x: 0, y: 0 }; }
      return target ? { x: nx * zombie.speed, y: ny * zombie.speed } : { x: 0, y: 0 };
    }
    // Graveheart summons small groups; Nest Mother creates larger broods more often.
    if (zombie.bossPhase === 'windup') {
      if (zombie.bossTimer <= 0) {
        this.spawnBossMinions(zombie, zombie.bossKind === 'nestMother' ? 6 : this.wave >= 15 ? 3 : 2);
        zombie.bossPhase = 'idle';
        zombie.bossCooldown = zombie.bossKind === 'nestMother' ? 4.8 : 6.5;
      }
    } else if (zombie.bossCooldown <= 0) {
      zombie.bossPhase = 'windup';
      zombie.bossTimer = zombie.bossKind === 'nestMother' ? 0.62 : 0.82;
    }
    if (!target) return { x: 0, y: 0 };
    zombie.angle = Math.atan2(dy, dx);
    if (distance > 520) return { x: nx * zombie.speed * 0.82, y: ny * zombie.speed * 0.82 };
    if (distance < 325) return { x: -nx * zombie.speed * 0.82, y: -ny * zombie.speed * 0.82 };
    const side = zombie.id % 2 === 0 ? 1 : -1;
    return { x: -ny * zombie.speed * 0.58 * side, y: nx * zombie.speed * 0.58 * side };
  }

  private bossSlam(boss: Zombie) {
    const radius = (boss.bossKind === 'colossus' ? 390 : boss.bossKind === 'abomination' ? 310 : 255) + boss.r * 0.78;
    boss.hitFlash = 1;
    for (const player of this.players.values()) {
      if (!player.connected || !player.alive || player.downed || player.protT > 0) continue;
      const dx = player.x - boss.x, dy = player.y - boss.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius + player.r) continue;
      const length = Math.max(1, distance);
      const falloff = 1 - 0.22 * clamp(distance / (radius + player.r), 0, 1);
      const bossName = boss.bossKind === 'colossus' ? 'the Colossus' : boss.bossKind === 'abomination' ? 'the Abomination' : 'the Breaker';
      const multiplier = boss.bossKind === 'colossus' ? 2.45 : boss.bossKind === 'abomination' ? 2.2 : 2.05;
      this.hurtPlayer(player, boss.damage * multiplier * falloff, null, bossName);
      const impulse = 210 * falloff;
      player.kvx += (dx / length) * impulse;
      player.kvy += (dy / length) * impulse;
    }
  }

  private fireBossVolley(boss: Zombie, direction: number) {
    // Rotbloom cycles through a lead spread, a broad fan, then a radial burst.
    const pattern = boss.bossPattern % 3;
    const spreads = pattern === 0 ? [-0.34, 0, 0.34]
      : pattern === 1 ? [-0.62, -0.31, 0, 0.31, 0.62]
      : Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
    const base = pattern === 2 ? 0 : direction;
    const speed = pattern === 0 ? 325 : pattern === 1 ? 285 : 245;
    const damageMul = pattern === 0 ? 0.78 : pattern === 1 ? 0.62 : 0.5;
    for (const spread of spreads) {
      if (this.bullets.length >= MAX_BULLETS) break;
      this.fireHostileProjectile(
        boss.x, boss.y, base + spread, speed, Math.max(9, boss.damage * damageMul),
        pattern === 2 ? 9 : 10, 3, 'a Rotbloom glob',
      );
    }
  }

  private spawnBossMinions(boss: Zombie, count: number) {
    const size = this.arenaSize;
    for (let i = 0; i < count && this.zombies.length < MAX_ZOMBIES; i++) {
      const angle = (i / count) * Math.PI * 2 + boss.id * 0.37;
      const kind: ZombieKind = i === 0 ? 'guardian' : i === 1 ? 'runner' : 'shambler';
      const distance = boss.r + 30, hpBase = 20 + this.wave * 7;
      const radius = kind === 'guardian' ? 22 : kind === 'runner' ? 14 : 16;
      const hp = Math.round(hpBase * (kind === 'guardian' ? 1.75 : kind === 'runner' ? 0.72 : 1));
      this.zombies.push({
        id: this.nextId++, kind,
        x: clamp(boss.x + Math.cos(angle) * distance, 16, size - 16),
        y: clamp(boss.y + Math.sin(angle) * distance, 16, size - 16),
        vx: Math.cos(angle) * 24, vy: Math.sin(angle) * 24, kvx: 0, kvy: 0,
        r: radius, hp, maxHp: hp,
        speed: Math.min(190, (kind === 'runner' ? 150 : kind === 'guardian' ? 58 : 82) + this.wave * 2.4),
        damage: Math.min(34, (kind === 'runner' ? 5 : kind === 'guardian' ? 8 : 6) + this.wave * 0.8),
        xp: 8 + this.wave * 2,
        angle, targetId: null, staggerT: 0, hitFlash: 0, hitAngle: 0,
        bossKind: null, bossPhase: 'idle', bossTimer: 0, bossCooldown: 0,
        bossAimX: 1, bossAimY: 0, bossPattern: 0,
        specialPhase: 'idle', specialTimer: 0, specialCooldown: 0, specialAimX: 1, specialAimY: 0,
        attackCooldown: 0, damageBy: new Map(), slowT: 0,
      });
    }
  }

  private updateSurvivalWaves(dt: number) {
    if (this.survivalGameOver || this.players.size === 0) return;
    this.survivalElapsed = Math.max(0, this.time - this.survivalStartedAt);
    this.updateRevives(dt);
    this.updateRewardOffers(dt);
    // A squad wipe does not end the run: downed survivors wait indefinitely for rescue.
    if (![...this.players.values()].some((player) => player.connected && player.alive && !player.downed)) return;
    if (this.wave === 0) { this.beginSurvivalWave(); return; }

    this.syncSurvivalWaveSize();
    if (this.waveSpawnRemaining > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0 && this.zombies.length < MAX_ZOMBIES) {
        if (this.spawnZombie()) { this.waveSpawnRemaining--; this.waveSpawned++; }
        this.waveSpawnTimer = Math.max(0.28, 0.92 - this.wave * 0.025);
      }
      return;
    }

    if (this.zombies.length === 0) {
      this.shareAllXpDrops();
      if (!this.waveRewardIssued && this.wave > 0 && this.wave % 3 === 0) {
        this.waveRewardIssued = true; this.offerSurvivalRewards(false);
      }
      if (this.waveIntermission <= 0) this.waveIntermission = 5;
      else {
        this.waveIntermission = Math.max(0, this.waveIntermission - dt);
        if (this.waveIntermission === 0) this.beginSurvivalWave();
      }
    }
  }

  private updateRevives(dt: number) {
    for (const downed of this.players.values()) {
      if (!downed.alive || !downed.downed) continue;
      downed.bleedoutT = 0;
      const helperNearby = [...this.players.values()].some((ally) => ally.id !== downed.id && ally.connected && ally.alive && !ally.downed &&
        Math.hypot(ally.x - downed.x, ally.y - downed.y) <= 122 && Math.hypot(ally.vx, ally.vy) <= 155);
      if (helperNearby) downed.reviveProgress = Math.min(REVIVE_SECONDS, downed.reviveProgress + dt);
      else downed.reviveProgress = Math.max(0, downed.reviveProgress - dt * 0.12);
      if (downed.reviveProgress >= REVIVE_SECONDS) {
        downed.downed = false; downed.bleedoutT = 0; downed.reviveProgress = 0;
        downed.hp = Math.max(1, downed.maxHp * 0.5); downed.protT = 2;
        downed.lastDamageT = this.time;
        downed.vx = downed.vy = downed.kvx = downed.kvy = downed.rvx = downed.rvy = 0;
      }
    }
  }

  private finalizePlayerDeath(player: Player) {
    if (!player.alive) return;
    player.alive = false; player.downed = false; player.hp = 0;
    player.input.f = false; player.input.secondary = false; player.input.mx = 0; player.input.my = 0;
    this.bullets = this.bullets.filter((bullet) => bullet.owner !== player.id || bullet.kind === 'bullet');
    const killer = player.lastHit?.id != null ? this.players.get(player.lastHit.id) : undefined;
    if (killer && killer.alive && !killer.downed && killer.id !== player.id &&
        (killer.team == null || player.team == null || killer.team !== player.team)) {
      killer.kills++; killer.matchKills++;
      if (killer.team) this.teamStats[killer.team].kills++;
      this.addXp(killer, Math.max(25, Math.floor(player.xp * 0.6)));
    }
    this.events.push({
      type: 'dead', id: player.id,
      killer: player.lastHit?.name ?? 'the horde', killerClass: player.lastHit?.classId ?? null,
      killerTeam: killer?.team ?? null, victim: player.name, victimClass: player.cls, victimTeam: player.team,
      score: player.xp, level: player.level, kills: player.kills,
      damageDealt: Math.round(player.damageDealt), damageTaken: Math.round(player.damageTaken),
      lifetime: Math.round(Math.max(0, this.time - player.lifeStartedAt) * 10) / 10,
    });
  }

  private spawnHealthDrop(zombie: Zombie) {
    if (this.healthDrops.length >= 12) return;
    if (!zombie.bossKind && this.rng() >= 0.14) return;
    this.healthDrops.push({
      id: this.nextId++, x: zombie.x, y: zombie.y, r: zombie.bossKind ? 13 : 10,
      heal: zombie.bossKind ? 85 + this.wave * 2 : 28 + Math.min(34, this.wave * 1.3), life: 24,
    });
  }

  private updateHealthDrops(dt: number) {
    for (const drop of this.healthDrops) drop.life -= dt;
    this.healthDrops = this.healthDrops.filter((drop) => drop.life > 0);
    for (const drop of this.healthDrops) {
      const collector = [...this.players.values()].find((player) =>
        player.connected && player.alive && !player.downed && player.hp < player.maxHp &&
        Math.hypot(player.x - drop.x, player.y - drop.y) <= player.r + drop.r + 8
      );
      if (!collector) continue;
      collector.hp = Math.min(collector.maxHp, collector.hp + drop.heal);
      collector.lastDamageT = Math.min(collector.lastDamageT, this.time - REGEN_DELAY_S);
      drop.life = 0;
    }
    this.healthDrops = this.healthDrops.filter((drop) => drop.life > 0);
  }

  private spawnXpDrop(zombie: Zombie) {
    const nearby = this.xpDrops.find((drop) => Math.hypot(drop.x - zombie.x, drop.y - zombie.y) <= 74);
    if (nearby) { nearby.xp += zombie.xp; nearby.r = Math.min(16, nearby.r + 0.7); nearby.life = Math.max(nearby.life, 30); return; }
    if (this.xpDrops.length >= 42) {
      const closest = this.xpDrops.reduce((best, drop) => Math.hypot(drop.x - zombie.x, drop.y - zombie.y) < Math.hypot(best.x - zombie.x, best.y - zombie.y) ? drop : best);
      closest.xp += zombie.xp; closest.life = Math.max(closest.life, 25); return;
    }
    this.xpDrops.push({ id: this.nextId++, x: zombie.x, y: zombie.y, r: zombie.bossKind ? 15 : 8, xp: zombie.xp, life: 34, age: 0 });
  }
  private collectXpDrop(drop: XpDrop) {
    for (const player of this.players.values()) if (player.alive) this.addXp(player, drop.xp);
    drop.life = 0;
  }
  private shareAllXpDrops() { for (const drop of this.xpDrops) this.collectXpDrop(drop); this.xpDrops = []; }
  private updateXpDrops(dt: number) {
    for (const drop of this.xpDrops) {
      drop.age += dt; drop.life -= dt;
      if (drop.age >= 10) {
        let nearest: Player | undefined, nearestDistance = Infinity;
        for (const player of this.players.values()) {
          if (!player.connected || !player.alive || player.downed) continue;
          const distance = Math.hypot(player.x - drop.x, player.y - drop.y);
          if (distance < nearestDistance) { nearest = player; nearestDistance = distance; }
        }
        if (nearest) {
          const dx = nearest.x - drop.x, dy = nearest.y - drop.y, distance = Math.max(1, nearestDistance);
          const travel = Math.min(distance, 210 * dt); drop.x += dx / distance * travel; drop.y += dy / distance * travel;
          if (distance <= nearest.r + drop.r + 8) this.collectXpDrop(drop);
        }
      }
      if (drop.life <= 0) this.collectXpDrop(drop);
    }
    this.xpDrops = this.xpDrops.filter((drop) => drop.life > 0);
  }
  private spawnExploderPool(zombie: Zombie) {
    if (this.damagePools.length >= 10) this.damagePools.shift();
    this.damagePools.push({ id: this.nextId++, x: zombie.x, y: zombie.y, r: 94, damage: 8 + this.wave * 0.65, life: 5, tick: 0.1 });
    for (const player of this.players.values()) {
      if (!player.connected || !player.alive || player.downed || player.protT > 0) continue;
      const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
      if (distance <= 138 + player.r) this.hurtPlayer(player, (10 + this.wave * 0.9) * (1 - 0.25 * distance / 138), null, 'an Exploder');
    }
  }
  private updateDamagePools(dt: number) {
    for (const pool of this.damagePools) {
      pool.life -= dt; pool.tick -= dt;
      if (pool.tick > 0) continue;
      pool.tick = 0.65;
      for (const player of this.players.values()) {
        if (!player.connected || !player.alive || player.downed || player.protT > 0) continue;
        if (Math.hypot(player.x - pool.x, player.y - pool.y) <= pool.r + player.r) this.hurtPlayer(player, pool.damage, null, 'explosive residue');
      }
    }
    this.damagePools = this.damagePools.filter((pool) => pool.life > 0);
  }
  private spawnSplitMinions(zombie: Zombie) {
    for (let i = 0; i < 2 && this.zombies.length < MAX_ZOMBIES; i++) {
      const angle = zombie.id * 0.71 + i * Math.PI, r = Math.max(10, zombie.r * 0.58), hp = Math.max(12, zombie.maxHp * 0.28);
      this.zombies.push({ id: this.nextId++, kind: 'shambler',
        x: clamp(zombie.x + Math.cos(angle) * (zombie.r + r + 5), r, this.arenaSize - r),
        y: clamp(zombie.y + Math.sin(angle) * (zombie.r + r + 5), r, this.arenaSize - r),
        vx: Math.cos(angle) * 35, vy: Math.sin(angle) * 35, kvx: 0, kvy: 0, r, hp, maxHp: hp,
        speed: 90 + this.wave * 2, damage: 5 + this.wave * 0.7, xp: Math.max(2, Math.round(zombie.xp * 0.16)),
        angle, targetId: null, staggerT: 0, hitFlash: 0, hitAngle: 0,
        bossKind: null, bossPhase: 'idle', bossTimer: 0, bossCooldown: 0, bossAimX: 1, bossAimY: 0, bossPattern: 0,
        specialPhase: 'idle', specialTimer: 0, specialCooldown: 0, specialAimX: 1, specialAimY: 0,
        attackCooldown: 0, damageBy: new Map(), slowT: 0 });
  }

  private constrainTeamPlayer(player: Player) {
    if (this.mode !== 'teams' || !player.team) return;
    if (player.team === 'blue') {
      player.x = Math.min(player.x, ARENA_SIZE - TEAM_BASE_DEPTH - player.r);
    } else {
      player.x = Math.max(player.x, TEAM_BASE_DEPTH + player.r);
    }
  }

  private constrainAllTeamPlayers() {
    if (this.mode !== 'teams') return;
    for (const player of this.players.values()) {
      if (player.alive) this.constrainTeamPlayer(player);
    }
  }

  private isBlockedByEnemyBase(bullet: Bullet): boolean {
    if (this.mode !== 'teams') return false;
    const owner = this.players.get(bullet.owner);
    if (!owner?.team) return false;
    if (owner.team === 'blue') return bullet.x + bullet.r >= ARENA_SIZE - TEAM_BASE_DEPTH;
    return bullet.x - bullet.r <= TEAM_BASE_DEPTH;
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
    p.x = clamp(p.x, p.r, this.arenaSize - p.r);
    p.y = clamp(p.y, p.r, this.arenaSize - p.r);
    this.constrainTeamPlayer(p);

    if (p.protT > 0) p.protT -= dt;
    p.emergencyShieldCd = Math.max(0, p.emergencyShieldCd - dt);
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
          p.cd[i] = Math.max(p.cd[i], barrels[i].delay * this.reloadDelay(p));
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
      p.cd[i] = this.reloadDelay(p);
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

    const perkDamage = this.mode === 'survival' ? 1 + this.perkCount(p, 'heavyRounds') * 0.15 : 1;
    let explosionRadius: number | undefined, chilled = false;
    if (this.mode === 'survival' && kind === 'bullet') {
      p.shotsFired++;
      if (this.perkCount(p, 'blastRounds') > 0 && p.shotsFired % 5 === 0) explosionRadius = 64;
      if (this.perkCount(p, 'explosiveImpact') > 0) explosionRadius = Math.max(explosionRadius ?? 0, 34 + this.perkCount(p, 'explosiveImpact') * 8);
      chilled = this.perkCount(p, 'cryoRounds') > 0;
    }
    const bullet: Bullet = {
      id: this.nextId++, owner: p.id, x: muzzleX, y: muzzleY,
      vx: Math.cos(spreadAngle) * speed, vy: Math.sin(spreadAngle) * speed,
      r: bulletRadius, dmg: p.d.bulletDamage * (barrel.damageMul ?? 1) * perkDamage,
      hp: kind === 'drone' ? 8 : kind === 'trap' ? 100 : p.d.bulletHp + (this.mode === 'survival' ? this.perkCount(p, 'piercingRounds') : 0),
      life, hit: new Set(), kind, angle: spreadAngle,
      maxSpeed: kind === 'missile' ? p.d.bulletSpeed * 1.45 : speed,
      turnRate: kind === 'missile' ? 2.7 : 4.2,
      ...(explosionRadius ? { explosionRadius } : {}), ...(chilled ? { chilled: true } : {}),
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
    const limit = (cls.droneLimit ?? 0) + (this.mode === 'survival' ? this.perkCount(p, 'droneWingman') : 0);
    if (limit <= 0) return;
    p.droneSpawnCd = Math.max(0, p.droneSpawnCd - dt);
    const current = this.bullets.reduce((n, b) => n + (b.owner === p.id && b.kind === 'drone' ? 1 : 0), 0);
    if (current >= limit || p.droneSpawnCd > 0 || this.bullets.length >= MAX_BULLETS) return;

    const slot = this.nextDroneFormationSlot(p.id, limit);
    const source = cls.barrels.find((barrel) => barrel.projectile === 'drone');
    const ring = Math.floor(slot / 8);
    const slotsInRing = Math.min(8, limit - ring * 8);
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
      formationSlot: slot, attackState: 'guard', attackCooldown: 0,
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
    const isOverlord = cls.id === 'overlord';
    const manualCommand = owner.input.secondary;
    const ownerDistance = Math.hypot(drone.x - owner.x, drone.y - owner.y);
    const leashRetreat = isOverlord && ownerDistance > OVERLORD_DRONE_RECALL_RADIUS;
    const aimAngle = owner.input.a;
    const selectedTarget = manualCommand || leashRetreat
      ? null
      : this.findTarget(owner, isOverlord ? OVERLORD_DRONE_RECALL_RADIUS : 420, aimAngle);

    const slot = Math.max(0, drone.formationSlot ?? (drone.id % 8));
    const ring = Math.floor(slot / 8);
    const ringIndex = slot % 8;
    const slotAngle = (ringIndex / 8) * Math.PI * 2 + ring * 0.28 + this.time * 0.2;
    drone.attackCooldown = Math.max(0, (drone.attackCooldown ?? 0) - dt);

    if (leashRetreat) {
      drone.attackState = 'guard';
      drone.attackTargetId = undefined;
      drone.attackTimer = 0;
    }

    // Only a small part of the squad commits at once. The rest stay mobile
    // around their owner, ready to respond when the aim direction changes.
    if ((drone.attackState ?? 'guard') === 'guard' && selectedTarget?.id != null &&
      !manualCommand && drone.attackCooldown <= 0) {
      const activeDives = this.bullets.filter((other) =>
        other !== drone && other.owner === drone.owner && other.kind === 'drone' &&
        other.attackState === 'dive'
      ).length;
      const diveLimit = cls.droneBehavior === 'necromancer' ? 4 : 2;
      if (activeDives < diveLimit) {
        drone.attackState = 'dive';
        drone.attackTargetId = selectedTarget.id;
        drone.attackTimer = 0;
        drone.attackSide = slot % 2 === 0 ? 1 : -1;
      }
    }

    if (drone.attackState === 'dive') {
      const target = drone.attackTargetId == null ? null : this.findTargetById(drone.attackTargetId);
      if (!target) {
        this.beginDroneRecovery(drone, 0.65);
      } else {
        drone.attackTimer = (drone.attackTimer ?? 0) + dt;
        // A dive is deliberately short. If the enemy dodges the pass, the
        // drone breaks off instead of steering forever or orbiting in place.
        if (drone.attackTimer > 2.1) {
          this.beginDroneRecovery(drone, 0.8);
        } else {
          const distance = Math.hypot(target.x - drone.x, target.y - drone.y);
          const leadTime = clamp(distance / Math.max(180, drone.maxSpeed) * 0.45, 0.05, 0.32);
          const predictedX = target.x + (target.vx ?? 0) * leadTime;
          const predictedY = target.y + (target.vy ?? 0) * leadTime;
          const approach = Math.atan2(predictedY - drone.y, predictedX - drone.x);
          const curve = Math.sin((drone.attackTimer / 2.1) * Math.PI) * 12 * (drone.attackSide ?? 1);
          const goalX = predictedX - Math.sin(approach) * curve;
          const goalY = predictedY + Math.cos(approach) * curve;
          const desired = Math.atan2(goalY - drone.y, goalX - drone.x);
          drone.angle += clamp(
            angleDelta(drone.angle, desired),
            -drone.turnRate * 1.45 * dt,
            drone.turnRate * 1.45 * dt,
          );
          const currentSpeed = Math.hypot(drone.vx, drone.vy);
          const speed = currentSpeed + (drone.maxSpeed * 0.94 - currentSpeed) * (1 - Math.exp(-dt * 6));
          drone.vx = Math.cos(drone.angle) * speed;
          drone.vy = Math.sin(drone.angle) * speed;
        }
      }
    }

    if (drone.attackState === 'recover') {
      drone.attackTimer = (drone.attackTimer ?? 0) + dt;
      const escapeAngle = drone.attackEscapeAngle ?? drone.angle;
      drone.angle += clamp(
        angleDelta(drone.angle, escapeAngle),
        -drone.turnRate * 1.5 * dt,
        drone.turnRate * 1.5 * dt,
      );
      const currentSpeed = Math.hypot(drone.vx, drone.vy);
      const speed = currentSpeed + (drone.maxSpeed * 0.82 - currentSpeed) * (1 - Math.exp(-dt * 5));
      drone.vx = Math.cos(drone.angle) * speed;
      drone.vy = Math.sin(drone.angle) * speed;
      if (drone.attackTimer >= 0.5) {
        drone.attackState = 'guard';
        drone.attackTargetId = undefined;
        drone.attackTimer = 0;
        drone.attackEscapeAngle = undefined;
      }
    } else if (drone.attackState !== 'dive') {
      // Guard mode follows the tank in a loose, moving formation. A manual
      // secondary command moves the squad toward the cursor without locking
      // them into an endless attack orbit.
      let goalX: number, goalY: number;
      if (leashRetreat) {
        const regroupRadius = owner.r + 42 + ring * 18;
        goalX = owner.x + Math.cos(slotAngle) * regroupRadius;
        goalY = owner.y + Math.sin(slotAngle) * regroupRadius;
      } else if (manualCommand) {
        const commandDistance = isOverlord ? OVERLORD_DRONE_RECALL_RADIUS - 40 : 560;
        goalX = owner.x + Math.cos(aimAngle) * commandDistance;
        goalY = owner.y + Math.sin(aimAngle) * commandDistance;
      } else {
        const followRadius = 112 + ring * 38;
        goalX = owner.x + Math.cos(slotAngle) * followRadius;
        goalY = owner.y + Math.sin(slotAngle) * followRadius;
      }

      // Soft spacing stops the guard formation from collapsing into one point,
      // without pushing drones away from a strike they have already committed to.
      let separationX = 0, separationY = 0;
      for (const other of this.bullets) {
        if (other === drone || other.owner !== drone.owner || other.kind !== 'drone' || other.hp <= 0) continue;
        const dx = drone.x - other.x, dy = drone.y - other.y;
        const distanceSq = dx * dx + dy * dy;
        const minDistance = (drone.r + other.r) * 1.2 + 3;
        if (distanceSq >= minDistance * minDistance) continue;
        const distance = Math.max(0.001, Math.sqrt(distanceSq));
        const push = (minDistance - distance) / minDistance;
        separationX += (dx / distance) * push;
        separationY += (dy / distance) * push;
      }
      const steerX = goalX - drone.x + separationX * (drone.r * 6 + 20);
      const steerY = goalY - drone.y + separationY * (drone.r * 6 + 20);
      const desired = Math.atan2(steerY, steerX);
      drone.angle += clamp(angleDelta(drone.angle, desired), -drone.turnRate * dt, drone.turnRate * dt);
      const distanceToGoal = Math.hypot(steerX, steerY);
      const currentSpeed = Math.hypot(drone.vx, drone.vy);
      const desiredSpeed = drone.maxSpeed * clamp(distanceToGoal / 140, 0.22, 1);
      const speed = currentSpeed + (desiredSpeed - currentSpeed) * (1 - Math.exp(-dt * 3.8));
      drone.vx = Math.cos(drone.angle) * speed;
      drone.vy = Math.sin(drone.angle) * speed;
    }

    drone.dmg = owner.d.bulletDamage * (cls.droneDamageMul ?? 0.85);
    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;
  }

  private beginDroneRecovery(drone: Bullet, cooldown: number) {
    const speed = Math.hypot(drone.vx, drone.vy);
    drone.attackState = 'recover';
    drone.attackTargetId = undefined;
    drone.attackTimer = 0;
    drone.attackCooldown = Math.max(drone.attackCooldown ?? 0, cooldown);
    drone.attackEscapeAngle = speed > 1 ? Math.atan2(drone.vy, drone.vx) : drone.angle;
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

  private findTargetById(id: number): Target | null {
    const player = this.players.get(id);
    if (player?.connected && player.alive) {
      return { id: player.id, x: player.x, y: player.y, r: player.r, vx: player.vx, vy: player.vy };
    }
    const shape = this.shapes.find((candidate) => candidate.id === id);
    if (shape) return { id: shape.id, x: shape.x, y: shape.y, r: shape.r, vx: shape.vx + shape.kvx, vy: shape.vy + shape.kvy };
    const zombie = this.zombies.find((candidate) => candidate.id === id);
    return zombie ? { id: zombie.id, x: zombie.x, y: zombie.y, r: zombie.r, vx: zombie.vx + zombie.kvx, vy: zombie.vy + zombie.kvy } : null;
  }

  private findTarget(owner: Player, range: number, preferredAngle: number): Target | null {
    let best: Target | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    if (this.mode !== 'survival') {
      for (const p of this.players.values()) {
        if (!p.connected || !p.alive || p.id === owner.id || (owner.team != null && p.team === owner.team)) continue;
        const dx = p.x - owner.x, dy = p.y - owner.y;
        const distance = Math.hypot(dx, dy);
        if (distance > range) continue;
        const angle = Math.atan2(dy, dx);
        const score = distance * (1 + Math.abs(angleDelta(preferredAngle, angle)) * 0.35);
        if (score < bestScore) { bestScore = score; best = { id: p.id, x: p.x, y: p.y, r: p.r, vx: p.vx, vy: p.vy }; }
      }
    }
    if (best) return best;
    for (const zombie of this.zombies) {
      const dx = zombie.x - owner.x, dy = zombie.y - owner.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const angle = Math.atan2(dy, dx);
      const score = distance * (1 + Math.abs(angleDelta(preferredAngle, angle)) * 0.5);
      if (score < bestScore) { bestScore = score; best = { id: zombie.id, x: zombie.x, y: zombie.y, r: zombie.r, vx: zombie.vx + zombie.kvx, vy: zombie.vy + zombie.kvy }; }
    }
    if (best) return best;
    for (const s of this.shapes) {
      const dx = s.x - owner.x, dy = s.y - owner.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const angle = Math.atan2(dy, dx);
      const score = distance * (1 + Math.abs(angleDelta(preferredAngle, angle)) * 0.5);
      if (score < bestScore) { bestScore = score; best = { id: s.id, x: s.x, y: s.y, r: s.r, vx: s.vx + s.kvx, vy: s.vy + s.kvy }; }
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
      p.autoCd[i] = this.reloadDelay(p) * (cls.turretReloadMul ?? 1.2);
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
    for (const p of this.players.values()) if (p.connected && p.alive && !p.downed) entities.push({ k: 0, o: p });
    for (const s of this.shapes) entities.push({ k: 1, o: s });
    for (const b of this.bullets) if (b.hp > 0 && b.life > 0) entities.push({ k: 2, o: b });
    for (const zombie of this.zombies) if (zombie.hp > 0) entities.push({ k: 3, o: zombie });
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
      const enemies = this.mode !== 'survival' && (A.team == null || B.team == null || A.team !== B.team);
      if (enemies && A.protT <= 0 && B.protT <= 0) {
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
      if (bullet.kind === 'drone' && bullet.attackState && bullet.attackState !== 'dive') return;
      if (bullet.owner === A.id || A.protT > 0 || !this.projectileCanHit(bullet, A.id)) return;
      if (bullet.kind === 'drone') bullet.hit.add(A.id);
      const owner = this.players.get(bullet.owner);
      if (this.mode === 'survival') {
        if (!bullet.hostile) return;
        this.hurtPlayer(A, bullet.dmg, null, bullet.hostileName ?? 'a boss projectile');
        bullet.hp -= PLAYER_PIERCE_COST;
        A.kvx += bullet.vx / 8; A.kvy += bullet.vy / 8;
        return;
      }
      if (owner?.team != null && owner.team === A.team) return;
      this.hurtPlayer(A, bullet.dmg, bullet.owner, owner?.name ?? 'Someone');
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0) : bullet.kind === 'trap' ? 1 : PLAYER_PIERCE_COST;
      if (bullet.kind === 'drone') this.beginDroneRecovery(bullet, 0.85);
      A.kvx += bullet.vx / 8; A.kvy += bullet.vy / 8;
    } else if (a.k === 0 && b.k === 3) {
      const zombie = b.o as Zombie;
      if (zombie.bossKind) {
        const nx = distance > 0.001 ? dx / distance : 1;
        const ny = distance > 0.001 ? dy / distance : 0;
        const overlap = rr - distance;
        A.x -= nx * overlap; A.y -= ny * overlap;
        const kick = Math.min(overlap, 30) * 6;
        A.kvx -= nx * kick; A.kvy -= ny * kick;
      } else {
        this.separate(A, zombie, dx, dy, distance, rr, A.r * A.r, zombie.r * zombie.r * 1.4);
      }
      const bodyDamage = A.d.bodyDps * dt * 0.55 * (this.isZombieProtected(zombie) ? 0.58 : 1);
      if (bodyDamage > 0) {
        zombie.hp -= bodyDamage;
        zombie.damageBy.set(A.id, (zombie.damageBy.get(A.id) ?? 0) + bodyDamage);
        zombie.hitFlash = Math.max(zombie.hitFlash, 0.35);
        zombie.hitAngle = Math.atan2(dy, dx);
      }
      if (A.protT <= 0 && zombie.attackCooldown <= 0) {
        this.hurtPlayer(A, zombie.damage, null, 'a zombie');
        zombie.attackCooldown = 0.85;
      }
    } else if (a.k === 1 && b.k === 2) {
      const shape = a.o as unknown as Shape, bullet = b.o as unknown as Bullet;
      const firstDroneContact = bullet.kind === 'drone' && !bullet.hit.has(shape.id);
      if (bullet.kind === 'drone' && bullet.attackState && bullet.attackState !== 'dive') return;
      if (!this.projectileCanHit(bullet, shape.id)) return;
      if (bullet.kind === 'drone') bullet.hit.add(shape.id);
      shape.hp -= bullet.dmg; shape.lastHitBy = bullet.owner;
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0) : bullet.kind === 'trap' ? 1 : SHAPES[SHAPE_KINDS[shape.kind]].pierceCost;
      if (bullet.kind === 'drone') this.beginDroneRecovery(bullet, 0.85);
      const def = SHAPES[SHAPE_KINDS[shape.kind]];
      const speed = Math.hypot(bullet.vx, bullet.vy);
      const impulse = clamp(speed * 0.11 * (28 / def.radius) + bullet.dmg * 0.4, 18, 105);
      const nx = speed > 0.001 ? bullet.vx / speed : Math.cos(bullet.angle);
      const ny = speed > 0.001 ? bullet.vy / speed : Math.sin(bullet.angle);
      this.impactShape(shape, bullet.x, bullet.y, nx, ny, impulse);
    } else if (a.k === 2 && b.k === 3) {
      const bullet = a.o as Bullet;
      const zombie = b.o as Zombie;
      if (bullet.hostile) return;
      const firstDroneContact = bullet.kind === 'drone' && !bullet.hit.has(zombie.id);
      if (bullet.kind === 'drone' && bullet.attackState && bullet.attackState !== 'dive') return;
      if (!this.projectileCanHit(bullet, zombie.id)) return;
      if (bullet.kind === 'drone') bullet.hit.add(zombie.id);
      const guardianMul = this.isZombieProtected(zombie) ? 0.58 : 1;
      const armourMul = zombie.kind === 'armoured' ? 0.58 : 1;
      const bossMul = zombie.bossKind ? 0.84 : 1;
      const dealt = bullet.dmg * guardianMul * armourMul * bossMul;
      zombie.hp -= dealt;
      zombie.damageBy.set(bullet.owner, (zombie.damageBy.get(bullet.owner) ?? 0) + dealt);
      const owner = this.players.get(bullet.owner);
      if (owner && this.mode === 'survival') {
        if (this.perkCount(owner, 'lifesteal') > 0) owner.hp = Math.min(owner.maxHp, owner.hp + dealt * 0.05 * this.perkCount(owner, 'lifesteal'));
        if (bullet.chilled) zombie.slowT = Math.max(zombie.slowT, 3);
        if (bullet.explosionRadius && !bullet.exploded) this.explodeSurvivalImpact(bullet, zombie);
      }
      const shotSpeed = Math.hypot(bullet.vx, bullet.vy);
      const hitX = shotSpeed > 0.001 ? bullet.vx / shotSpeed : Math.cos(bullet.angle);
      const hitY = shotSpeed > 0.001 ? bullet.vy / shotSpeed : Math.sin(bullet.angle);
      zombie.hitFlash = 1;
      zombie.hitAngle = Math.atan2(hitY, hitX);
      // Bosses are immovable and cannot be stagger-locked by rapid fire.
      if (!zombie.bossKind) {
        const impact = clamp(shotSpeed * 0.11 + bullet.dmg * 0.28, 24, 140);
        zombie.kvx += hitX * impact; zombie.kvy += hitY * impact;
        zombie.staggerT = Math.max(zombie.staggerT, Math.min(0.24, 0.06 + bullet.dmg * 0.001));
      }
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0)
        : bullet.kind === 'trap' ? 1 : PLAYER_PIERCE_COST;
      if (bullet.kind === 'drone') this.beginDroneRecovery(bullet, 0.85);
    } else if (a.k === 3 && b.k === 3) {
      const firstZombie = a.o as Zombie;
      const secondZombie = b.o as Zombie;
      // Physical separation and mass make the horde push around itself naturally.
      if (firstZombie.bossKind) {
        const nx = dx / distance, ny = dy / distance, overlap = rr - distance;
        secondZombie.x += nx * overlap; secondZombie.y += ny * overlap;
        const kick = Math.min(overlap, 30) * 6;
        secondZombie.kvx += nx * kick; secondZombie.kvy += ny * kick;
      } else if (secondZombie.bossKind) {
        const nx = dx / distance, ny = dy / distance, overlap = rr - distance;
        firstZombie.x -= nx * overlap; firstZombie.y -= ny * overlap;
        const kick = Math.min(overlap, 30) * 6;
        firstZombie.kvx -= nx * kick; firstZombie.kvy -= ny * kick;
      } else {
        this.separate(firstZombie, secondZombie, dx, dy, distance, rr,
          firstZombie.r * firstZombie.r, secondZombie.r * secondZombie.r);
      }
    }
  }

  private explodeSurvivalImpact(bullet: Bullet, directHit: Zombie) {
    bullet.exploded = true;
    const radius = bullet.explosionRadius ?? 0, owner = this.players.get(bullet.owner);
    const splash = bullet.dmg * (this.perkCount(owner, 'blastRounds') > 0 ? 0.42 : 0.28);
    for (const zombie of this.zombies) {
      if (zombie === directHit || zombie.hp <= 0 || Math.hypot(zombie.x - bullet.x, zombie.y - bullet.y) > radius + zombie.r) continue;
      const dealt = splash * (zombie.kind === 'armoured' ? 0.58 : 1) * (zombie.bossKind ? 0.84 : 1);
      zombie.hp -= dealt; zombie.damageBy.set(bullet.owner, (zombie.damageBy.get(bullet.owner) ?? 0) + dealt);
      if (bullet.chilled) zombie.slowT = Math.max(zombie.slowT, 3);
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
    if (!p.connected || !p.alive || p.downed || amount <= 0) return;
    p.hp -= amount;
    p.damageTaken += amount;
    const attacker = byId == null ? undefined : this.players.get(byId);
    if (attacker && attacker.id !== p.id) attacker.damageDealt += amount;
    p.lastDamageT = this.time;
    p.lastHit = { id: byId, name: byName, classId: attacker?.cls ?? null };
    p.stealthT = 0; p.visibility = 1;
    if (this.mode === 'survival' && this.perkCount(p, 'emergencyShield') > 0 && p.emergencyShieldCd <= 0 && p.hp > 0 && p.hp <= p.maxHp * 0.28) {
      p.emergencyShieldCd = 28 / this.perkCount(p, 'emergencyShield'); p.protT = Math.max(p.protT, 1.7);
    }
  }

  private reap() {
    for (const player of this.players.values()) {
      if (!player.alive || player.downed || player.hp > 0) continue;
      if (this.mode === 'survival') {
        player.hp = 0; player.downed = true; player.bleedoutT = 0; player.reviveProgress = 0;
        player.input.f = false; player.input.secondary = false; player.input.mx = 0; player.input.my = 0;
        player.vx = player.vy = player.kvx = player.kvy = player.rvx = player.rvy = 0;
        this.bullets = this.bullets.filter((bullet) => bullet.owner !== player.id || bullet.kind === 'bullet');
        continue;
      }
      this.finalizePlayerDeath(player);
    }
    for (const zombie of this.zombies) {
      if (zombie.hp > 0) continue;
      this.spawnHealthDrop(zombie); this.spawnXpDrop(zombie);
      if (zombie.kind === 'exploder') this.spawnExploderPool(zombie);
      if (zombie.kind === 'splitter') this.spawnSplitMinions(zombie);
      if (zombie.bossKind) this.offerSurvivalRewards(true);
      for (const devourer of this.zombies) {
        if (devourer === zombie || devourer.bossKind !== 'devourer' || devourer.hp <= 0) continue;
        if (Math.hypot(devourer.x - zombie.x, devourer.y - zombie.y) <= 235) {
          devourer.hp = Math.min(devourer.maxHp, devourer.hp + devourer.maxHp * 0.075);
          devourer.r = Math.min(88, devourer.r + 1.6); devourer.damage = Math.min(58, devourer.damage + 0.65);
        }
      }
      this.zombieKills++;
      const killer = [...zombie.damageBy.entries()].sort((a, b) => b[1] - a[1])[0];
      const player = killer ? this.players.get(killer[0]) : undefined;
      if (player) { player.kills++; player.matchKills++; }
    }
    this.zombies = this.zombies.filter((zombie) => zombie.hp > 0);
    if (this.shapes.some((shape) => shape.hp <= 0)) {
      for (const shape of this.shapes) {
        if (shape.hp > 0) continue;
        const killer = shape.lastHitBy != null ? this.players.get(shape.lastHitBy) : undefined;
        if (killer?.alive && !killer.downed) {
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
      attackState: 'guard', attackCooldown: 0,
    });
  }

  private perkCount(p: Player | undefined, id: string): number { return p?.survivalPerks[id] ?? 0; }
  private reloadDelay(p: Player): number { return p.d.reload * Math.pow(0.9, this.mode === 'survival' ? this.perkCount(p, 'rapidLoader') : 0); }
  private queueRewardOffer(player: Player, bossReward: boolean) {
    if (player.rewardOffers.length >= 5) return;
    const available = SURVIVAL_PERKS.filter((perk) => (player.survivalPerks[perk.id] ?? 0) < perk.max);
    const cards: RewardCardSnap[] = [];
    while (cards.length < 3 && available.length) {
      const perk = available.splice(Math.floor(this.rng() * available.length), 1)[0]!;
      const roll = this.rng();
      const rarity: RewardRarity = bossReward ? (roll < 0.82 ? 'epic' : 'legendary')
        : roll < 0.035 ? 'legendary' : roll < 0.15 ? 'epic' : roll < 0.43 ? 'rare' : 'common';
      cards.push({ id: perk.id, title: perk.title, description: perk.description, rarity });
    }
    if (cards.length) player.rewardOffers.push({ cards, timeRemaining: 20 });
  }
  private offerSurvivalRewards(bossReward: boolean) {
    if (this.mode !== 'survival') return;
    for (const player of this.players.values()) if (player.alive) this.queueRewardOffer(player, bossReward);
  }
  private updateRewardOffers(dt: number) {
    for (const player of this.players.values()) {
      const offer = player.rewardOffers[0]; if (!offer) continue;
      offer.timeRemaining = Math.max(0, offer.timeRemaining - dt);
      if (offer.timeRemaining <= 0 && offer.cards.length) {
        const best = offer.cards.slice().sort((a, b) => RARITY_SCORE[b.rarity] - RARITY_SCORE[a.rarity])[0]!;
        this.chooseSurvivalReward(player.id, best.id);
      }
    }
  }
  chooseSurvivalReward(id: number, perkId: string): boolean {
    const player = this.players.get(id), offer = player?.rewardOffers[0];
    const card = offer?.cards.find((entry) => entry.id === perkId), perk = SURVIVAL_PERKS.find((entry) => entry.id === perkId);
    if (this.mode !== 'survival' || !player?.alive || !card || !perk) return false;
    player.survivalPerks[perkId] = Math.min(perk.max, (player.survivalPerks[perkId] ?? 0) + 1);
    player.rewardOffers.shift(); return true;
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
    return [...this.players.values()].filter((p) => p.connected && p.alive).sort((a, b) => b.xp - a.xp).slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, score: p.xp, lv: p.level }));
  }

  survivalLeaderboard(limit = 8) {
    return {
      wave: this.wave, zombieKills: this.zombieKills, zombiesRemaining: this.zombies.length + this.waveSpawnRemaining,
      nextWaveIn: Math.ceil(this.waveIntermission), elapsed: Math.floor(this.survivalElapsed),
      gameOver: this.survivalGameOver,
      top: [...this.players.values()].filter((player) => player.connected).sort((a, b) => b.kills - a.kills || b.xp - a.xp).slice(0, limit)
        .map((player) => ({ id: player.id, name: player.name, kills: player.kills, xp: player.xp, lv: player.level,
          alive: player.alive && !player.downed, downed: player.downed })),
    };
  }

  teamLeaderboard(limit = 5) {
    const members = <T extends TeamId>(team: T) => [...this.players.values()]
      .filter((player) => player.connected && player.team === team)
      .sort((a, b) => b.matchKills - a.matchKills || b.level - a.level)
      .slice(0, limit)
      .map((player) => ({ id: player.id, name: player.name, score: player.matchKills,
        kills: player.matchKills, lv: player.level, team }));
    return { blueKills: this.teamStats.blue.kills, redKills: this.teamStats.red.kills,
      blue: members('blue'), red: members('red') };
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
      t: 's', tick: this.tick, mode: this.mode,
      z: this.zombies.map((zombie) => ({
        id: zombie.id, x: r1(zombie.x), y: r1(zombie.y), r: r1(zombie.r),
        hp: r1(zombie.hp), mhp: r1(zombie.maxHp),
        angle: r2(zombie.angle), hitFlash: r2(zombie.hitFlash), hitAngle: r2(zombie.hitAngle),
        kind: zombie.kind, protected: this.isZombieProtected(zombie),
        visibility: zombie.kind === 'stalker' ? (Math.min(...[...this.players.values()].filter((player) => player.connected && player.alive && !player.downed).map((player) => Math.hypot(player.x - zombie.x, player.y - zombie.y)), Infinity) < 300 ? 1 : 0.07) : 1,
        bossKind: zombie.bossKind, bossPhase: zombie.bossPhase, bossTimer: r2(zombie.bossTimer),
        specialPhase: zombie.specialPhase, specialTimer: r2(zombie.specialTimer),
      })),
      d: [...this.players.values()].filter((player) => player.connected && player.alive && player.downed).map((player) => ({
        id: player.id, name: player.name, x: r1(player.x), y: r1(player.y), r: r1(player.r),
        reviveProgress: r2(player.reviveProgress / REVIVE_SECONDS), bleedout: 0,
      })),
      h: this.healthDrops.map((drop) => ({ id: drop.id, x: r1(drop.x), y: r1(drop.y), r: r1(drop.r), heal: r1(drop.heal) })),
      xpDrops: this.xpDrops.map((drop) => ({ id: drop.id, x: r1(drop.x), y: r1(drop.y), r: r1(drop.r), xp: drop.xp })),
      pools: this.damagePools.map((pool) => ({ id: pool.id, x: r1(pool.x), y: r1(pool.y), r: r1(pool.r), life: r1(pool.life) })),
      me: {
        alive: me.alive && !me.downed, downed: me.downed, reviveProgress: r2(me.reviveProgress / REVIVE_SECONDS),
        hp: r1(me.hp), mhp: r1(me.maxHp), lv: me.level, xp: me.xp,
        xpCur: currentXp, xpNext: nextXp, pts: me.pts, stats: me.stats.slice(),
        cls: me.cls, opts: me.alive && !me.downed ? classOptions(me.cls, me.level) : [], fov: me.d.fovMul * focus,
        team: me.team, rewards: me.rewardOffers[0]?.cards ?? [], rewardTimer: r1(me.rewardOffers[0]?.timeRemaining ?? 0),
      },
      p: [...this.players.values()].filter((player) => player.connected && player.alive && !player.downed &&
        (this.mode === 'survival' || near(player.x, player.y, player.r))).map((player) => ({
        id: player.id, name: player.name, x: r1(player.x), y: r1(player.y), a: r2(player.angle),
        hp: r1(player.hp), mhp: r1(player.maxHp), r: r1(player.r), lv: player.level,
        cls: CLASS_IDS.indexOf(player.cls), prot: player.protT > 0 ? 1 : 0, vis: player.visibility,
        team: player.team,
      })),
      b: this.bullets.filter((bullet) => near(bullet.x, bullet.y, bullet.r)).map((bullet) => [
        bullet.id, r1(bullet.x), r1(bullet.y), r1(bullet.r), bullet.owner,
        PROJECTILE_KIND_IDS[bullet.kind], r2(bullet.angle),
        bullet.kind === 'drone' ? (bullet.attackState === 'dive' ? 1 : bullet.attackState === 'recover' ? 2 : 0) : 0,
      ]),
      sh: this.shapes.filter((shape) => near(shape.x, shape.y, shape.r)).map((shape) =>
        [shape.id, r1(shape.x), r1(shape.y), r2(shape.rot), shape.kind, r2(shape.hp / shape.maxHp),
          r2(shape.hitFlash ?? 0), r1(shape.hitX ?? shape.x), r1(shape.hitY ?? shape.y), r2(shape.hitAngle ?? 0)]),
    };
  }
}
