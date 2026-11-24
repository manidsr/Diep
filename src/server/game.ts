import {
  ARENA_SIZE, BULLET_LIFE_S, CLASS_BY_ID, CLASS_IDS, MAX_BULLETS, MAX_PLAYERS, MAX_ZOMBIES, SURVIVAL_ARENA_SIZE, TEAM_BASE_DEPTH,
  PLAYER_PIERCE_COST, PROJECTILE_KIND_IDS, REGEN_DELAY_S, RESPAWN_PROTECTION_S, SHAPES,
  SHAPE_KINDS, SHAPE_TARGET_COUNT, SERVER_TICK_HZ, VIEW_HALF, POWERUPS, TANK_SKINS, type Powerup, type TankSkin,
  type BarrelDef, type ProjectileKind,
} from '../shared/config';
import {
  classOptions, deriveStats, levelFromXp, totalXpForLevel, type DerivedStats,
} from '../shared/progression';
import type { BeamSnap, CombatEffect, WaveTheme, GameMode, RewardCardSnap, RewardRarity, Snapshot, TeamId, ZombieBossKind, ZombieBossPhase, ZombieKind, ZombieSnap, ZombieSpecialPhase } from '../shared/protocol';
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
  { id: 'explosiveImpact', title: 'Explosive Impact', description: 'Projectile hits splash nearby zombies', max: 3 },
  { id: 'longshot', title: 'Longshot Coils', description: '+10% projectile speed per stack', max: 4 },
  { id: 'ironSkin', title: 'Iron Skin', description: 'Take 6% less damage per stack', max: 4 },
  { id: 'fleetfoot', title: 'Fleetfoot', description: '+6% movement speed per stack', max: 4 },
  { id: 'fieldMedic', title: 'Field Medic', description: '+18% health regeneration per stack', max: 4 },
  { id: 'criticalCore', title: 'Critical Core', description: '+6% chance for a double-damage shot per stack', max: 4 },
  { id: 'bossHunter', title: 'Boss Hunter', description: '+16% damage against bosses per stack', max: 4 },
  { id: 'executioner', title: 'Executioner', description: '+18% damage against wounded enemies per stack', max: 3 },
  { id: 'scavenger', title: 'Scavenger', description: '+12% shared XP from orbs per stack', max: 4 },
  { id: 'luckyFind', title: 'Lucky Find', description: '+8% chance for zombies to drop healing per stack', max: 5 },
  { id: 'xpMagnet', title: 'XP Magnet', description: 'Attract XP orbs sooner and from farther away', max: 3 },
  { id: 'steadyAim', title: 'Steady Aim', description: 'Reduce random weapon spread by 12% per stack', max: 4 },
  { id: 'recoilDampers', title: 'Recoil Dampers', description: 'Reduce firing recoil by 12% per stack', max: 4 },
  { id: 'hotRounds', title: 'Hot Rounds', description: 'Shots burn enemies for damage over time', max: 3 },
  { id: 'rescueProtocol', title: 'Rescue Protocol', description: 'Revive allies faster and from farther away', max: 3 },
  { id: 'secondWind', title: 'Second Wind', description: 'Revive with more health and protection', max: 3 },
  { id: 'armorPiercer', title: 'Armour Piercer', description: 'Ignore more of Armoured zombies’ damage reduction', max: 4 },
  { id: 'overdrive', title: 'Overdrive', description: 'Move faster while firing', max: 3 },
  { id: 'chainShot', title: 'Chain Shot', description: 'Hits chain through 2–4 nearby zombies; each stack adds one jump', max: 3 },
  { id: 'adrenaline', title: 'Adrenaline', description: 'Deal more damage and move faster while your health is low', max: 3 },
  { id: 'shrapnel', title: 'Shrapnel', description: 'Every fourth shot bursts into a larger blast', max: 3 },
  { id: 'vitalCore', title: 'Vital Core', description: '+8% maximum health per stack', max: 4 },
  { id: 'concussiveRounds', title: 'Concussive Rounds', description: '+20% damage-based knockback per stack', max: 3 },
  { id: 'droneTactician', title: 'Drone Tactician', description: '+15% drone damage and +8% drone speed per stack', max: 4 },
];
const EXTRA_PERKS = [{"id":"chainCount","title":"Chain Amount","description":"+1 additional enemy per stack","max":3,"requires":"chainShot","category":"Chain"},{"id":"chainRange","title":"Chain Range","description":"+35 world units per jump per stack","max":4,"requires":"chainShot","category":"Chain"},{"id":"chainDamage","title":"Chain Damage","description":"+10 percentage points of original damage per stack","max":4,"requires":"chainShot","category":"Chain"},{"id":"chainRetention","title":"Chain Retention","description":"+6 percentage points of damage retained each jump per stack","max":4,"requires":"chainShot","category":"Chain"},{"id":"forkShot","title":"Fork Shot","description":"Hits launch 2 seeking-direction projectiles at nearby distinct enemies; 30% damage each","max":1,"requires":"","category":"Fork"},{"id":"forkCount","title":"Fork Amount","description":"+1 branch per stack; +2 Firework pellets","max":3,"requires":"forkShot","category":"Fork"},{"id":"forkDamage","title":"Fork Damage","description":"+10 percentage points of original damage per stack","max":4,"requires":"forkShot","category":"Fork"},{"id":"forkRange","title":"Fork Range","description":"+45 targeting units and +0.12s branch lifetime per stack","max":4,"requires":"forkShot","category":"Fork"},{"id":"forkSpeed","title":"Fork Speed","description":"+15% branch projectile speed per stack","max":4,"requires":"forkShot","category":"Fork"},{"id":"blastRadius","title":"Blast Radius","description":"+20 world units of explosion radius per stack","max":4,"requires":"explosiveImpact","category":"Explosion"},{"id":"blastDamage","title":"Blast Damage","description":"+12 percentage points of original projectile damage as splash per stack","max":4,"requires":"explosiveImpact","category":"Explosion"},{"id":"blastFrequency","title":"Blast Frequency","description":"Periodic Blast Rounds and Shrapnel trigger one shot sooner per stack, minimum 2","max":3,"requires":"blastRounds","category":"Explosion"},{"id":"blastKnockback","title":"Blast Force","description":"+25 outward impulse per stack; bosses remain immovable","max":3,"requires":"explosiveImpact","category":"Explosion"},{"id":"burnDuration","title":"Burn Duration","description":"+1 second of burn per stack","max":4,"requires":"hotRounds","category":"Elemental"},{"id":"burnDamage","title":"Burn Damage","description":"+25% burn damage per stack","max":4,"requires":"hotRounds","category":"Elemental"},{"id":"cryoDuration","title":"Freeze Duration","description":"+1 second of slow per stack","max":4,"requires":"cryoRounds","category":"Elemental"},{"id":"cryoStrength","title":"Freeze Strength","description":"+7 percentage points of movement slow per stack","max":4,"requires":"cryoRounds","category":"Elemental"},{"id":"projectileLife","title":"Projectile Lifetime","description":"+12% lifetime of standard bullets per stack","max":4,"requires":"","category":"Weapons"},{"id":"criticalDamage","title":"Critical Damage","description":"+25 percentage points of critical damage per stack","max":4,"requires":"criticalCore","category":"Weapons"}] as const;
SURVIVAL_PERKS.push(...EXTRA_PERKS);
const SHOP_GROUPS:Record<string,string[]> = {
  Chain:['chainShot'], Fork:[], Explosion:['explosiveImpact','blastRounds','shrapnel'], Elemental:['hotRounds','cryoRounds'],
  Weapons:['heavyRounds','rapidLoader','longshot','criticalCore','steadyAim','recoilDampers','bossHunter','executioner','armorPiercer','concussiveRounds'],
  Defense:['heal','lifesteal','medicalSupplies','emergencyShield','ironSkin','fieldMedic','vitalCore','secondWind'],
  Mobility:['fleetfoot','overdrive','adrenaline'], Support:['droneWingman','droneTactician','scavenger','luckyFind','xpMagnet','rescueProtocol']
};
const RARITY_SCORE: Record<RewardRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export interface Player {
  id: number; name: string;
  x: number; y: number; vx: number; vy: number; kvx: number; kvy: number; rvx: number; rvy: number;
  r: number; angle: number; hp: number; maxHp: number;
  level: number; xp: number; cls: string;
  team: TeamId | null; matchKills: number;
  alive: boolean; connected: boolean; downed: boolean; bleedoutT: number; reviveProgress: number; protT: number; lastDamageT: number;
  lastHit: { id: number | null; name: string; classId: string | null } | null;
  kills: number; damageDealt: number; damageTaken: number; lifeStartedAt: number;
  input: { mx: number; my: number; a: number; f: boolean; secondary: boolean; spin: boolean };
  wasFiring: boolean; wasSecondary: boolean; cd: number[]; autoCd: number[];
  droneSpawnCd: number; stealthT: number; visibility: number; d: DerivedStats;
  skin?: TankSkin; powerups?: Partial<Record<Powerup,number>>; coins?: number; streak?: number; streakSerial?: number; lastKillT?: number; shots?: number[];
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
  bounces?: number; weapon?: string; turretNext?: number;
  hostile?: boolean;
  hostileName?: string;
  explosionRadius?: number; exploded?: boolean; chilled?: boolean; chained?: boolean; splitDone?:boolean; weaponChained?:boolean; forked?:boolean; forkChild?:boolean;
}
export interface Zombie {
  elite?: boolean;
  id: number; x: number; y: number; vx: number; vy: number; kvx: number; kvy: number;
  r: number; hp: number; maxHp: number; speed: number; damage: number; xp: number;
  kind: ZombieKind;
  angle: number; targetId: number | null; staggerT: number; hitFlash: number; hitAngle: number;
  bossKind: ZombieBossKind | null; bossPhase: ZombieBossPhase; bossTimer: number; bossCooldown: number;
  bossAimX: number; bossAimY: number; bossPattern: number;
  specialPhase: ZombieSpecialPhase; specialTimer: number; specialCooldown: number; specialAimX: number; specialAimY: number;
  attackCooldown: number; damageBy: Map<number, number>; slowT: number;
  slowStrength?:number; burnT?: number; burnDps?: number; burnTick?: number; burnOwnerId?: number | null;
}
export interface Shape {
  id: number; kind: number; x: number; y: number; vx: number; vy: number; kvx: number; kvy: number;
  r: number; hp: number; maxHp: number; rot: number; rotSpeed: number; lastHitBy: number | null;
  hitFlash?: number; hitX?: number; hitY?: number; hitAngle?: number;
  explosive?: boolean;
  ramCooldowns?: Map<number, number>;
  ramFeedback?: Map<number, { damage: number; next: number }>;
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
  private combatEffects: CombatEffect[] = [];
  crates: {id:number;x:number;y:number;r:number;kind:Powerup;life:number}[] = [];
  private nextCrate = 10;
  private beams: BeamSnap[] = [];
  private link(from:{x:number;y:number;id?:number},to:{x:number;y:number;id?:number},color:string,kind:BeamSnap['kind'],root=true,hop=0,radius?:number){
    this.beams.push({tick:this.tick,x:from.x,y:from.y,tx:to.x,ty:to.y,color,kind,root,hop,radius,fromId:from.id,toId:to.id});
    if(this.beams.length>280)this.beams.splice(0,this.beams.length-280);
  }
  private blastVisual(x:number,y:number,radius:number,color='#ffb653',kind:'blast'|'gravity'='blast'){
    this.link({x,y},{x,y},color,kind,true,0,radius);
  }
  /** Cache last known coordinates before removal; clients use their interpolated positions when available. */
  private followCombatLinks(){
    if(!this.beams.length)return;
    const positions=new Map<number,{x:number;y:number}>();
    for(const p of this.players.values())positions.set(p.id,p);
    for(const entities of [this.zombies,this.shapes,this.bullets])for(const e of entities)positions.set(e.id,e);
    for(const b of this.beams){
      const from=b.fromId===undefined?undefined:positions.get(b.fromId);
      const to=b.toId===undefined?undefined:positions.get(b.toId);
      if(from){b.x=from.x;b.y=from.y;}
      if(to){b.tx=to.x;b.ty=to.y;}
    }
  }
  royalePhase: 'lobby'|'active'|'result' = 'lobby';
  private royaleTimer = 10;
  private royaleWinner = '';
  private royaleRadius = ARENA_SIZE * 0.71;
  private royaleOvertime=0;
  private incomingFeedback = new Map<number, { damage: number; next: number }>();
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
    if (this.players.size >= MAX_PLAYERS || (this.mode === 'royale' && this.royalePhase !== 'lobby')) return null;
    const p: Player = {
      id: this.nextId++, name, x: 0, y: 0, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0,
      r: 26, angle: 0, hp: 50, maxHp: 0, level: 1, xp: 0, cls: 'basic',
      team: this.mode === 'teams' ? this.assignTeam() : null, matchKills: 0,
      alive: true, connected: true, downed: false, bleedoutT: 0, reviveProgress: 0,
      protT: 0, lastDamageT: -99, lastHit: null,
      kills: 0, damageDealt: 0, damageTaken: 0, lifeStartedAt: 0,
      input: { mx: 0, my: 0, a: 0, f: false, secondary: false, spin: false },
      wasFiring: false, wasSecondary: false, cd: [0], autoCd: [], droneSpawnCd: 0,
      stealthT: 0, visibility: 1, d: deriveStats(1, 'basic'),
      survivalPerks: {}, rewardOffers: [], shotsFired: 0, emergencyShieldCd: 0,
    };
    this.players.set(p.id, p);
    this.respawn(p.id, name);
    if (this.mode === 'survival') {
      if (this.wave === 0) this.beginSurvivalWave();
      else this.applySurvivalCatchUp(p);
      this.syncSurvivalWaveSize();
    }
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
    if(this.mode==='royale'&&this.royalePhase==='active'){p.alive=false;p.hp=0;}
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
    if (this.mode === 'royale' && this.royalePhase !== 'lobby') return;
    p.level = 1; p.xp = 0; p.cls = 'basic'; p.maxHp = 0;
    p.powerups = {}; p.coins = 0; p.streak = 0; p.lastKillT = -Infinity; p.shots = [];
    this.incomingFeedback.delete(p.id);
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
    p.shots=[];
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
    // Keep the server's broadcast clock alive while the post-game results scene is frozen.
    if (this.mode === 'survival' && this.survivalGameOver) { this.tick++; return; }
    this.time += dt;
    this.tick++;
    if (this.mode === 'royale' && !this.updateRoyale(dt)) return;
    this.beams = this.beams.filter(b=>this.tick-b.tick<=30);
    this.updateCrates(dt);
    this.combatEffects = this.combatEffects.filter((effect) => this.tick - effect.tick <= SERVER_TICK_HZ);
    for (const p of this.players.values()) if (p.connected && p.alive && p.hp>0 && !p.downed) this.updatePlayer(p, dt);
    for (const s of this.shapes) this.updateShape(s, dt);
    if (this.mode === 'survival') for (const zombie of this.zombies) this.updateZombie(zombie, dt);

    for (const b of this.bullets) {
      if (b.kind === 'drone') this.updateDrone(b, dt);
      else if (b.kind === 'missile') this.updateMissile(b, dt);
      else if (b.kind !== 'trap') { b.x += b.vx * dt; b.y += b.vy * dt; }
      if ((b.bounces ?? 0)>0 && b.kind==='bullet') {
        let bounced=false;
        if(b.x<b.r || b.x>this.arenaSize-b.r){b.x=clamp(b.x,b.r,this.arenaSize-b.r);b.vx=-b.vx;bounced=true;}
        if(b.y<b.r || b.y>this.arenaSize-b.r){b.y=clamp(b.y,b.r,this.arenaSize-b.r);b.vy=-b.vy;bounced=true;}
        if(bounced){b.bounces=(b.bounces??1)-1;b.angle=Math.atan2(b.vy,b.vx);}
      }
      if(b.weapon==='engineer' && b.kind==='trap') this.updateEngineer(b);
      b.life -= dt;
    }
    this.bullets = this.bullets.filter((bullet) => !this.isBlockedByEnemyBase(bullet));
    this.explodeExpiredFireworks();
    this.collideAll(dt);
    this.constrainAllTeamPlayers();
    for (const [id, feedback] of this.incomingFeedback) {
      if (feedback.next <= this.time || !this.players.has(id)) this.flushIncomingFeedback(id);
    }
    this.followCombatLinks();
    this.reap();
    if (this.mode === 'royale') this.finishRoyaleIfNeeded();
    if (this.mode === 'survival') {
      this.updateHealthDrops(dt); this.updateXpDrops(dt); this.updateDamagePools(dt); this.updateSurvivalWaves(dt);
    }
    this.bullets = this.bullets.filter((b) =>
      b.hp > 0 && b.life > 0 && b.x > -80 && b.y > -80 && b.x < this.arenaSize + 80 && b.y < this.arenaSize + 80,
    );
    if (this.mode !== 'survival' && this.shapes.length < SHAPE_TARGET_COUNT && this.rng() < dt * 4) this.spawnShape();
  }

  setSkin(id:number, skin:TankSkin) {
    const p=this.players.get(id);if(p && Object.prototype.hasOwnProperty.call(TANK_SKINS,skin)) p.skin=skin;
  }
  private boost(p:Player,kind:Powerup){return (p.powerups?.[kind]??0)>this.time;}
  private powerupStatus(p:Player){const out:Partial<Record<Powerup,number>>={};for(const k of POWERUPS){if(this.boost(p,k))out[k]=Math.ceil(p.powerups![k]!-this.time);}return out;}
  private updateCrates(dt:number){
    if(![...this.players.values()].some(p=>p.connected&&p.alive))return;
    if(this.time>=this.nextCrate && this.crates.length<5){
      this.nextCrate=this.time+12;
      const x=100+this.rng()*(this.arenaSize-200),y=100+this.rng()*(this.arenaSize-200);
      if((this.mode!=='royale'||Math.hypot(x-ARENA_SIZE/2,y-ARENA_SIZE/2)<this.royaleRadius-30)&&!this.shapes.some(s=>Math.hypot(s.x-x,s.y-y)<s.r+25))
        this.crates.push({id:this.nextId++,x,y,r:17,kind:POWERUPS[Math.min(POWERUPS.length-1,Math.floor(this.rng()*POWERUPS.length))],life:35});
    }
    for(const c of this.crates){
      c.life-=dt;if(c.life<=0)continue;
      for(const p of this.players.values()){
        if(!p.connected||!p.alive||p.hp<=0||p.downed||Math.hypot(p.x-c.x,p.y-c.y)>p.r+c.r)continue;
        if(c.kind==='heal')p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.35);
        else (p.powerups??={})[c.kind]=this.time+12;
        c.life=0;break;
      }
    }
    this.crates=this.crates.filter(c=>c.life>0);
  }
  private updateRoyale(dt:number):boolean{
    const alive=[...this.players.values()].filter(p=>p.connected&&p.alive);
    if(this.royalePhase==='lobby'){
      if(alive.length<2){this.royaleTimer=10;return false;}
      this.royaleTimer-=dt;if(this.royaleTimer>0)return false;
      for(const p of alive){this.respawn(p.id);this.addXp(p,totalXpForLevel(15));}
      this.royalePhase='active';this.royaleTimer=180;this.royaleOvertime=0;this.royaleRadius=ARENA_SIZE*0.71;
      this.royaleWinner='';this.crates=[];this.bullets=[];
    }else if(this.royalePhase==='result'){
      this.royaleTimer-=dt;
      if(this.royaleTimer<=0){this.royalePhase='lobby';this.royaleTimer=10;this.royaleRadius=ARENA_SIZE*0.71;this.royaleWinner='';this.bullets=[];this.crates=[];for(const p of alive)this.respawn(p.id);}
      return false;
    }
    this.royaleTimer=Math.max(0,this.royaleTimer-dt);
    if(this.royaleTimer===0)this.royaleOvertime+=dt;
    this.royaleRadius=this.royaleTimer>0?90+(ARENA_SIZE*0.71-90)*Math.pow(this.royaleTimer/180,1.15):Math.max(0,90-this.royaleOvertime*3);
    for(const p of alive)if(Math.hypot(p.x-ARENA_SIZE/2,p.y-ARENA_SIZE/2)+p.r>this.royaleRadius)
      this.hurtPlayer(p,p.maxHp*(this.royaleTimer>0?0.065:0.25)*dt,null,'the storm');
    return true;
  }
  private finishRoyaleIfNeeded(){
    if(this.royalePhase!=='active')return;
    const alive=[...this.players.values()].filter(p=>p.connected&&p.alive);
    if(alive.length>1)return;
    this.royaleWinner=alive[0]?.name??'No survivor';this.royalePhase='result';this.royaleTimer=9;
  }
  private recordKill(p:Player){
    p.streak=this.time-(p.lastKillT??-Infinity)<=6?(p.streak??0)+1:1;
    p.lastKillT=this.time;p.streakSerial=(p.streakSerial??0)+1;
    if(this.mode==='survival')p.coins=(p.coins??0)+1;
  }
  private combos(p:Player):string[]{
    const has=(id:string)=>this.perkCount(p,id)>0;const out:string[]=[];
    if(has('hotRounds')&&has('blastRounds'))out.push('Napalm');
    if(has('cryoRounds')&&has('chainShot'))out.push('Frozen Storm');
    if(has('lifesteal')&&has('criticalCore'))out.push('Vampire Core');
    if(has('droneWingman')&&has('rapidLoader'))out.push('Drone Army');
    return out;
  }
  private perkRequirement(p:Player,id:string):string|undefined{
    const e=EXTRA_PERKS.find(k=>k.id===id);
    if(!e?.requires)return;
    if(e.requires==='explosiveImpact'&&(this.perkCount(p,'blastRounds')||this.perkCount(p,'shrapnel')))return;
    if(e.requires==='blastRounds'&&this.perkCount(p,'shrapnel'))return;
    if(e.requires==='forkShot'&&p.cls==='firework')return;
    if(e.requires==='chainShot'&&p.cls==='tesla')return;
    if(this.perkCount(p,e.requires)>0)return;
    return 'Requires '+(SURVIVAL_PERKS.find(k=>k.id===e.requires)?.title??e.requires);
  }
  private upgradeValue(p:Player,id:string,delta=0):string|undefined{
    const n=(key:string)=>this.perkCount(p,key)+(key===id?delta:0);
    const pct=(v:number)=>Math.round(v*100)+'%';
    const tesla=p.cls==='tesla',firework=p.cls==='firework',chain=n('chainShot'),fork=n('forkShot');
    switch(id){
      case 'chainShot':case 'chainCount': return (chain||tesla?Math.min(8,(chain?chain+1+(tesla?1:0):3)+n('chainCount')):0)+' jumps';
      case 'chainRange':return (chain?100+chain*25+35*n(id):150+35*n(id))+' units';
      case 'chainDamage':return pct((tesla?Math.max(0.45,0.14+chain*0.06):0.14+chain*0.06)+0.10*n(id));
      case 'chainRetention':return pct(Math.min(0.98,(tesla&&!chain?0.72:0.76)+0.06*n(id)))+' retained';
      case 'forkShot':case 'forkCount':return (firework?FIREWORK_PELLETS+2*n('forkCount'):fork?2+n('forkCount'):0)+' branches';
      case 'forkDamage':return pct((firework?0.42:0.30)+0.10*n(id));
      case 'forkRange':return (160+45*n(id))+' units';
      case 'forkSpeed':return pct(1+0.15*n(id))+' speed';
      case 'blastRadius':return '+'+20*n(id)+' units';
      case 'blastDamage':return '+'+12*n(id)+'% of shot';
      case 'blastFrequency':return Math.max(2,5-n(id))+' / '+Math.max(2,4-n(id))+' shots';
      case 'blastKnockback':return '+'+25*n(id)+' impulse';
      case 'burnDuration':case 'cryoDuration':return (3+n(id))+'s';
      case 'burnDamage':return pct(1+0.25*n(id))+' burn';
      case 'cryoStrength':return pct(0.38+0.07*n(id))+' slow';
      case 'projectileLife':return pct(1+0.12*n(id))+' lifetime';
      case 'criticalDamage':return pct(2+0.25*n(id))+' critical';
    }
  }
  private shopOffers(p:Player, developer=false):NonNullable<Snapshot['me']['shop']>{
    if(this.mode!=='survival'||(!developer&&this.waveIntermission<=0)||!p.alive||p.downed||this.survivalGameOver)return [];
    const legacyPrices:Record<string,number>={rapidLoader:12,heavyRounds:12,cryoRounds:14,chainShot:14,hotRounds:14,blastRounds:14,lifesteal:14,criticalCore:14,droneWingman:15};
    const offers:NonNullable<Snapshot['me']['shop']>=[{id:'heal',title:'Repair',cost:developer?0:8,description:'Restore 40% health',category:'Defense',locked:p.hp>=p.maxHp?'Full health':undefined}];
    for(const k of SURVIVAL_PERKS){
      const rank=this.perkCount(p,k.id),extra=EXTRA_PERKS.find(e=>e.id===k.id);
      const category=extra?.category??Object.keys(SHOP_GROUPS).find(g=>SHOP_GROUPS[g].includes(k.id))??'Weapons';
      const locked=rank>=k.max?'MAX LEVEL':this.perkRequirement(p,k.id);
      offers.push({id:k.id,title:k.title,description:k.description,category,rank,max:k.max,locked,
        cost:developer?0:(legacyPrices[k.id]??(extra?16+rank*3:14)),value:this.upgradeValue(p,k.id),nextValue:rank<k.max?this.upgradeValue(p,k.id,1):undefined});
    }
    return offers;
  }
  buyShop(id:number,item:string,developer=false):boolean{
    const p=this.players.get(id);if(!p)return false;
    const offer=this.shopOffers(p,developer).find(o=>o.id===item);
    if(!offer||offer.locked||(p.coins??0)<offer.cost)return false;
    p.coins=(p.coins??0)-offer.cost;
    if(item==='heal')p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.4);
    else{p.survivalPerks[item]=(p.survivalPerks[item]??0)+1;this.refresh(p);}
    return true;
  }

  /** Restart a completed Survival run for every connected squad member. */
  restartSurvivalRun(): boolean {
    if (this.mode !== 'survival' || !this.survivalGameOver || this.players.size === 0) return false;
    this.resetSurvivalRun();
    for (const player of this.players.values()) {
      if (player.connected) this.respawn(player.id, player.name);
    }
    return true;
  }

  private resetSurvivalRun() {
    this.combatEffects = [];
    this.incomingFeedback.clear();
    this.crates=[];this.beams=[];
    for (const player of this.players.values()) {
      player.survivalPerks = {}; player.coins=0;player.powerups={};player.streak=0;
      player.rewardOffers = [];
      player.shotsFired = 0;
      player.emergencyShieldCd = 0;
    }
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

  /** Late arrivals receive the current squad's average XP before the next snapshot. */
  private applySurvivalCatchUp(joiner: Player) {
    const squad = [...this.players.values()].filter((player) =>
      player.id !== joiner.id && player.connected && player.alive
    );
    if (!squad.length) return;
    const averageXp = squad.reduce((total, player) => total + player.xp, 0) / squad.length;
    joiner.xp = Math.max(joiner.xp, Math.round(averageXp));
    joiner.level = levelFromXp(joiner.xp);
    this.refresh(joiner);
    joiner.hp = joiner.maxHp;
  }

  private waveTheme(): WaveTheme {
    if (this.wave > 0 && this.wave % 5 === 0) return 'boss';
    if (this.wave >= 4 && this.wave % 4 === 0) return 'siege';
    if (this.wave >= 3 && this.wave % 3 === 0) return 'rush';
    if (this.wave >= 7 && this.wave % 7 === 0) return 'swarm';
    return 'standard';
  }

  private survivalWaveZombieCount(playerCount: number) {
    const scale = 1 + Math.min(0.6, Math.max(0, playerCount - 1) * 0.18);
    return Math.min(82, Math.round((6 + this.wave * 3) * scale * (this.waveTheme() === 'swarm' ? 1.2 : 1)));
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
    const theme = this.waveTheme();
    const weighted = available.map(([kind, weight]): [ZombieKind, number] => [
      kind, weight * (theme === 'rush' && (kind === 'runner' || kind === 'leaper' || kind === 'stalker') ? 3 :
        theme === 'siege' && (kind === 'ranger' || kind === 'tank' || kind === 'armoured' || kind === 'guardian') ? 2.8 :
        theme === 'swarm' && (kind === 'splitter' || kind === 'runner' || kind === 'bomber') ? 2.5 : 1),
    ]);
    // Normalize all weights together so late-game enemy types remain reachable.
    const total = 0.35 + weighted.reduce((sum, entry) => sum + entry[1], 0);
    let roll = this.rng() * total;
    for (const [kind, weight] of weighted) {
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
    const elite = !bossKind && !forceKind && this.wave >= 6 && this.waveSpawned > 0 && this.waveSpawned % Math.max(4, 10 - Math.floor(this.wave / 5)) === 0;
    const hp = bossKind
      ? Math.round((1650 + this.wave * 105) * hpScale)
      : Math.round(baseHp * def.hp * (1 + Math.min(0.24, (players - 1) * 0.08)) * (elite ? 1.65 : 1));
    const bossRadii: Record<ZombieBossKind, number> = { breaker: 60, spitter: 52, summoner: 56, colossus: 84, nestMother: 68, lich: 54, devourer: 72, abomination: 76 };
    const bossSpeeds: Record<ZombieBossKind, number> = { breaker: 64, spitter: 82, summoner: 66, colossus: 48, nestMother: 58, lich: 92, devourer: 74, abomination: 68 };
    const radius = bossKind ? bossRadii[bossKind] : def.radius * (elite ? 1.18 : 1);
    const speed = bossKind ? bossSpeeds[bossKind] : Math.min(235, (64 + this.wave * 3.5) * def.speed * (elite ? 1.15 : 1));
    const damageScale = 1 + Math.min(0.12, (players - 1) * 0.035);
    const damage = bossKind ? Math.min(48, (24 + this.wave * 1.15) * damageScale)
      : Math.min(46, baseDamage * def.damage * damageScale * (elite ? 1.18 : 1));
    this.zombies.push({
      id: this.nextId++, kind, elite, x: best.x, y: best.y, vx: 0, vy: 0, kvx: 0, kvy: 0,
      r: radius, hp, maxHp: hp, speed, damage,
      xp: bossKind ? 420 + this.wave * 52 : Math.round((10 + this.wave * 3) * def.xp * (elite ? 2.2 : 1)),
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
    zombie.burnT = Math.max(0, (zombie.burnT ?? 0) - dt);
    if (zombie.hp > 0 && (zombie.burnT ?? 0) > 0) {
      zombie.burnTick = (zombie.burnTick ?? 0) - dt;
      if (zombie.burnTick <= 0) {
        zombie.burnTick = 0.5;
        const burnDamage = (zombie.burnDps ?? 0) * 0.5;
        this.effect(zombie, burnDamage, '#ffb45e');
      zombie.hp -= burnDamage;
        if (zombie.burnOwnerId != null) zombie.damageBy.set(zombie.burnOwnerId, (zombie.damageBy.get(zombie.burnOwnerId) ?? 0) + burnDamage);
        zombie.hitFlash = Math.max(zombie.hitFlash, 0.3);
      }
    }
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
    const slowMultiplier = zombie.slowT > 0 ? 1-(zombie.slowStrength??0.38) : 1;
    if(zombie.slowT<=0)zombie.slowStrength=undefined;
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
    // Downed players can be revived while at least one teammate remains on their feet.
    // When the entire squad is down, lock the run and show the game-over state.
    if (![...this.players.values()].some((player) => player.alive && !player.downed)) {
      this.survivalGameOver = true;
      return;
    }
    if (this.wave === 0) { this.beginSurvivalWave(); return; }

    this.syncSurvivalWaveSize();
    if (this.waveSpawnRemaining > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0 && this.zombies.length < MAX_ZOMBIES) {
        const batch = this.wave >= 12 && this.waveTheme() !== 'boss' ? 2 : 1;
        for (let i = 0; i < batch && this.waveSpawnRemaining > 0 && this.zombies.length < MAX_ZOMBIES; i++) {
          if (!this.spawnZombie()) break;
          this.waveSpawnRemaining--; this.waveSpawned++;
        }
        this.waveSpawnTimer = Math.max(0.28, 0.92 - this.wave * 0.025) * (this.waveTheme() === 'rush' ? 0.8 : 1);
      }
      return;
    }

    if (this.zombies.length === 0) {
      this.shareAllXpDrops();
      if (!this.waveRewardIssued) {
        this.waveRewardIssued = true;
        for (const player of this.players.values()) {
          if (!player.connected || !player.alive) continue;
          player.coins=(player.coins??0)+8+Math.min(12,this.wave);
          if (player.downed) {
            player.downed = false; player.reviveProgress = 0; player.bleedoutT = 0;
            player.hp = player.maxHp * 0.35; player.protT = Math.max(player.protT, 2);
          } else {
            player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.12);
          }
        }
        if (this.wave > 0 && this.wave % 3 === 0) this.offerSurvivalRewards(false);
      }
      if (this.waveIntermission <= 0) this.waveIntermission = 8;
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
      let helper: Player | undefined;
      let helperStacks = 0;
      for (const ally of this.players.values()) {
        if (ally.id === downed.id || !ally.connected || !ally.alive || ally.downed || Math.hypot(ally.vx, ally.vy) > 155) continue;
        const stacks = this.perkCount(ally, 'rescueProtocol');
        if (Math.hypot(ally.x - downed.x, ally.y - downed.y) > 122 + stacks * 18) continue;
        if (!helper || stacks > helperStacks) { helper = ally; helperStacks = stacks; }
      }
      const reviveSeconds = Math.max(1.55, REVIVE_SECONDS * (1 - helperStacks * 0.12));
      if (helper) downed.reviveProgress = Math.min(reviveSeconds, downed.reviveProgress + dt);
      else downed.reviveProgress = Math.max(0, downed.reviveProgress - dt * 0.12);
      if (downed.reviveProgress >= reviveSeconds) {
        downed.downed = false; downed.bleedoutT = 0; downed.reviveProgress = 0;
        const secondWind = this.perkCount(downed, 'secondWind');
        downed.hp = Math.max(1, downed.maxHp * Math.min(0.82, 0.5 + secondWind * 0.1));
        downed.protT = 2 + secondWind * 0.3;
        downed.lastDamageT = this.time;
        downed.vx = downed.vy = downed.kvx = downed.kvy = downed.rvx = downed.rvy = 0;
      }
    }
  }

  private finalizePlayerDeath(player: Player) {
    if (!player.alive) return;
    this.effect(player, 0, '#72caff', 'destroy');
    player.alive = false; player.downed = false; player.hp = 0;
    player.input.f = false; player.input.secondary = false; player.input.mx = 0; player.input.my = 0;
    this.bullets = this.bullets.filter((bullet) => bullet.owner !== player.id || bullet.kind === 'bullet');
    const killer = player.lastHit?.id != null ? this.players.get(player.lastHit.id) : undefined;
    if (killer && killer.alive && !killer.downed && killer.id !== player.id &&
        (killer.team == null || player.team == null || killer.team !== player.team)) {
      killer.kills++; killer.matchKills++; this.recordKill(killer);
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
    const luck = [...this.players.values()].reduce((best, player) => Math.max(best, this.perkCount(player, 'luckyFind')), 0);
    if (!zombie.bossKind && this.rng() >= Math.min(0.6, 0.14 + luck * 0.08)) return;
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
      const medicalStacks = this.mode === 'survival' ? this.perkCount(collector, 'medicalSupplies') : 0;
      collector.hp = Math.min(collector.maxHp, collector.hp + drop.heal * (1 + medicalStacks * 0.18));
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
    for (const player of this.players.values()) if (player.alive) {
      const bonus = this.perkCount(player, 'scavenger') * 0.12;
      this.addXp(player, Math.max(1, Math.round(drop.xp * (1 + bonus))));
    }
    drop.life = 0;
  }
  private shareAllXpDrops() { for (const drop of this.xpDrops) this.collectXpDrop(drop); this.xpDrops = []; }
  private updateXpDrops(dt: number) {
    for (const drop of this.xpDrops) {
      drop.age += dt; drop.life -= dt;
      // Any living teammate can collect a world orb; its XP is immediately shared with the whole run.
      const collector = [...this.players.values()].find((player) => player.connected && player.alive && !player.downed &&
        Math.hypot(player.x - drop.x, player.y - drop.y) <= player.r + drop.r + 10);
      if (collector) { this.collectXpDrop(drop); continue; }
      let nearest: Player | undefined, nearestDistance = Infinity;
      let magnetTarget: Player | undefined, magnetDistance = Infinity, magnetStacks = 0;
      for (const player of this.players.values()) {
        if (!player.connected || !player.alive || player.downed) continue;
        const distance = Math.hypot(player.x - drop.x, player.y - drop.y);
        if (distance < nearestDistance) { nearest = player; nearestDistance = distance; }
        const stacks = this.perkCount(player, 'xpMagnet');
        const inMagnetRange = distance <= 180 + stacks * 120;
        const magnetReady = drop.age >= Math.max(2, 10 - stacks * 2);
        if (stacks > 0 && (inMagnetRange || magnetReady) && distance < magnetDistance) {
          magnetTarget = player; magnetDistance = distance; magnetStacks = stacks;
        }
      }
      // Prefer an eligible Magnet owner; ordinary nearby teammates cannot suppress the perk.
      const target = magnetTarget ?? nearest;
      const targetDistance = magnetTarget ? magnetDistance : nearestDistance;
      const targetStacks = magnetTarget ? magnetStacks : 0;
      const magnetRange = 180 + targetStacks * 120;
      const magnetDelay = Math.max(2, 10 - targetStacks * 2);
      if (target && (drop.age >= magnetDelay || (targetStacks > 0 && targetDistance <= magnetRange))) {
        const dx = target.x - drop.x, dy = target.y - drop.y, distance = Math.max(1, targetDistance);
        const travel = Math.min(distance, (210 + targetStacks * 65) * dt);
        drop.x += dx / distance * travel; drop.y += dy / distance * travel;
        if (distance <= target.r + drop.r + 8) this.collectXpDrop(drop);
      }
      if (drop.life <= 0) this.collectXpDrop(drop);
    }
    this.xpDrops = this.xpDrops.filter((drop) => drop.life > 0);
  }
  private spawnExploderPool(zombie: Zombie) {
    this.blastVisual(zombie.x,zombie.y,138,'#f27d62');
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
      const x=clamp(zombie.x+Math.cos(angle)*(zombie.r+r+5),r,this.arenaSize-r),y=clamp(zombie.y+Math.sin(angle)*(zombie.r+r+5),r,this.arenaSize-r);
      const id=this.nextId++;
      this.link({x:zombie.x,y:zombie.y},{x,y,id},'#b6df83','fork',i===0);
      this.zombies.push({ id, kind: 'shambler', x,y,
        vx: Math.cos(angle) * 35, vy: Math.sin(angle) * 35, kvx: 0, kvy: 0, r, hp, maxHp: hp,
        speed: 90 + this.wave * 2, damage: 5 + this.wave * 0.7, xp: Math.max(2, Math.round(zombie.xp * 0.16)),
        angle, targetId: null, staggerT: 0, hitFlash: 0, hitAngle: 0,
        bossKind: null, bossPhase: 'idle', bossTimer: 0, bossCooldown: 0, bossAimX: 1, bossAimY: 0, bossPattern: 0,
        specialPhase: 'idle', specialTimer: 0, specialCooldown: 0, specialAimX: 1, specialAimY: 0,
        attackCooldown: 0, damageBy: new Map(), slowT: 0 });
    }
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
    const lowHealth = p.hp <= p.maxHp * 0.35;
    const moveBonus = (this.boost(p,'speed')?1.35:1)*(p.cls==='berserker'?1+0.30*(1-p.hp/Math.max(1,p.maxHp)):1)*(this.mode === 'survival'
      ? 1 + this.perkCount(p, 'fleetfoot') * 0.06 + (f ? this.perkCount(p, 'overdrive') * 0.06 : 0) + (lowHealth ? this.perkCount(p, 'adrenaline') * 0.025 : 0)
      : 1);
    p.vx += (ix * p.d.moveSpeed * moveBonus - p.vx) * k;
    p.vy += (iy * p.d.moveSpeed * moveBonus - p.vy) * k;
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
    if (p.hp>0 && this.time - p.lastDamageT > REGEN_DELAY_S && p.hp < p.maxHp) {
      const regenBonus = this.mode === 'survival' ? 1 + this.perkCount(p, 'fieldMedic') * 0.18 : 1;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.d.regenFrac * regenBonus * dt);
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
    if(p.cls==='berserker')p.d.bodyDps=deriveStats(p.level,p.cls).bodyDps*(1+0.65*(1-p.hp/Math.max(1,p.maxHp)));
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
      (p.shots??=[])[i]=this.tick;
      p.cd[i] = this.reloadDelay(p);
    }
  }

  private fireBarrel(p: Player, barrel: BarrelDef, direction: number, origin?: Target) {
    if (this.bullets.length >= MAX_BULLETS) return;
    const cls = CLASS_BY_ID[p.cls];
    const spreadReduction = this.mode === 'survival' ? Math.max(0.48, 1 - this.perkCount(p, 'steadyAim') * 0.12) : 1;
    const spreadAngle = direction + (barrel.spread ? (this.rng() * 2 - 1) * barrel.spread * spreadReduction : 0);
    const sc = p.r / 26;
    const cx = Math.cos(direction), cy = Math.sin(direction);
    const bulletRadius = barrel.width * 0.5 * sc;
    const kind = barrel.projectile ?? 'bullet';
    const muzzleX = origin?.x ?? (p.x + cx * barrel.length * sc - cy * barrel.offset * sc);
    const muzzleY = origin?.y ?? (p.y + cy * barrel.length * sc + cx * barrel.offset * sc);
    let speed = p.d.bulletSpeed * (barrel.speedMul ?? 1) * (this.mode === 'survival' ? 1 + this.perkCount(p, 'longshot') * 0.1 : 1);
    let life = BULLET_LIFE_S * (cls.bulletLifeMul ?? 1);
    if (kind === 'trap') { speed = 0; life = cls.trapLife ?? 9; }
    else if (kind === 'missile') { speed *= 0.52; life *= 1.6; }
    else if (kind === 'firework') { life = 1.45; }
    else if (kind === 'drone') { speed *= 0.55; life = DRONE_LIFE_S; }

    const perkDamage = (this.boost(p,'damage')?1.5:1)*(this.mode === 'survival' ? 1 + this.perkCount(p, 'heavyRounds') * 0.15 : 1);
    if(this.mode==='survival'&&kind==='bullet')life*=1+0.12*this.perkCount(p,'projectileLife');
    const critical = this.mode === 'survival' && this.rng() < this.perkCount(p, 'criticalCore') * 0.06 ? 2+0.25*this.perkCount(p,'criticalDamage') : 1;
    let explosionRadius: number | undefined, chilled = false;
    if (this.mode === 'survival') {
      if (kind !== 'drone') {
        p.shotsFired++;
        if (this.perkCount(p, 'blastRounds') > 0 && p.shotsFired % Math.max(2,5-this.perkCount(p,'blastFrequency')) === 0) explosionRadius = 64;
        if (this.perkCount(p, 'shrapnel') > 0 && p.shotsFired % Math.max(2,4-this.perkCount(p,'blastFrequency')) === 0)
          explosionRadius = Math.max(explosionRadius ?? 0, 58 + this.perkCount(p, 'shrapnel') * 12);
      }
      if (kind !== 'drone' && this.perkCount(p, 'explosiveImpact') > 0)
        explosionRadius = Math.max(explosionRadius ?? 0, 34 + this.perkCount(p, 'explosiveImpact') * 8);
      chilled = this.perkCount(p, 'cryoRounds') > 0;
    }
    if(p.cls==='engineer'&&kind==='trap'){
      const old=this.bullets.filter(b=>b.owner===p.id&&b.kind==='trap'&&b.weapon==='engineer'&&b.hp>0);if(old.length>=3)old[0].hp=0;
    }
    if(p.cls==='laser' && kind==='bullet'){
      const beam={tick:this.tick,x:muzzleX,y:muzzleY,tx:muzzleX+cx*550,ty:muzzleY+cy*550,color:'#91dcff'};
      let nearest: {id:number;x:number;y:number;r:number}|undefined, distance=550;
      for(const t of this.weaponTargets(p)){
        const dx=t.x-muzzleX,dy=t.y-muzzleY,along=dx*cx+dy*cy,side=Math.abs(dx*cy-dy*cx);
        if(along>=0&&along<distance&&side<=t.r){nearest=t;distance=along;}
      }
      if(nearest){beam.tx=muzzleX+cx*distance;beam.ty=muzzleY+cy*distance;this.specialDamage(p,nearest.id,p.d.bulletDamage*perkDamage*critical);}
      this.link(beam,{x:beam.tx,y:beam.ty},beam.color,'laser');return;
    }
    const bullet: Bullet = {
      id: this.nextId++, owner: p.id, x: muzzleX, y: muzzleY,
      weapon:p.cls,...(p.cls==='ricochet'?{bounces:2}:{}),
      vx: Math.cos(spreadAngle) * speed, vy: Math.sin(spreadAngle) * speed,
      r: bulletRadius, dmg: p.d.bulletDamage * (barrel.damageMul ?? 1) * perkDamage * critical,
      hp: kind === 'drone' ? 8 : kind === 'trap' ? 100 : p.d.bulletHp,
      life, hit: new Set(), kind, angle: spreadAngle,
      maxSpeed: kind === 'missile' ? p.d.bulletSpeed * 1.45 : speed,
      turnRate: kind === 'missile' ? 2.7 : 4.2,
      ...(explosionRadius ? { explosionRadius } : {}), ...(chilled ? { chilled: true } : {}),
    };
    this.bullets.push(bullet);

    // Recoil follows projectile damage, not barrel width alone. Normalising across
    // a volley keeps multi-barrel tanks controllable; high-rate light guns stay light.
    const damageRatio = Math.sqrt(clamp(bullet.dmg / Math.max(1, p.d.bulletDamage), 0.04, 4));
    const volleyScale = 1 / Math.sqrt(Math.max(1, cls.barrels.length));
    const dampers = this.mode === 'survival' ? Math.max(0.5, 1 - this.perkCount(p, 'recoilDampers') * 0.12) : 1;
    const recoilDistance = clamp(BASE_RECOIL_DISTANCE * damageRatio * volleyScale * (barrel.recoil ?? 1) * dampers, 0, BASE_RECOIL_DISTANCE * 2.5);
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
      r: radius * 0.65,
      dmg: p.d.bulletDamage * (this.boost(p,'damage')?1.5:1) * (cls.droneDamageMul ?? 0.85) *
        (1 + this.perkCount(p, 'heavyRounds') * 0.15) * (1 + this.perkCount(p, 'droneTactician') * 0.15),
      hp: 8, life: DRONE_LIFE_S, hit: new Set(), kind: 'drone',
      angle: slotAngle,
      maxSpeed: 300 * (cls.droneSpeedMul ?? 1) *
        (1 + this.perkCount(p, 'droneTactician') * 0.08) * (1 + this.perkCount(p, 'longshot') * 0.1),
      turnRate: 4.6, formationSlot: slot, attackState: 'guard', attackCooldown: 0,
      ...(this.perkCount(p, 'cryoRounds') > 0 ? { chilled: true } : {}),
      ...(this.perkCount(p, 'explosiveImpact') > 0 ? { explosionRadius: 34 + this.perkCount(p, 'explosiveImpact') * 8 } : {}),
    };
    // Keep the first spawn close to the tank; barrel length is used as a size hint for drone spacing.
    drone.x += Math.cos(slotAngle) * Math.min(8, length * 0.1);
    drone.y += Math.sin(slotAngle) * Math.min(8, length * 0.1);
    this.bullets.push(drone);
    p.droneSpawnCd = (cls.droneBehavior === 'factory' ? 0.28 : 0.38)*(this.combos(p).includes('Drone Army')?0.65:1);
  }

  private updateDrone(drone: Bullet, dt: number) {
    const owner = this.players.get(drone.owner);
    if (!owner?.alive) {
      drone.x += drone.vx * dt; drone.y += drone.vy * dt;
      return;
    }

    const cls = CLASS_BY_ID[owner.cls];
    if(cls.id==='orbiter'){
      const angle=this.time*3.8+(drone.formationSlot??0)*Math.PI*2/3,rad=owner.r+44;
      drone.x=owner.x+Math.cos(angle)*rad;drone.y=owner.y+Math.sin(angle)*rad;drone.angle=angle+Math.PI/2;drone.attackState='dive';return;
    }
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

    drone.dmg = owner.d.bulletDamage * (cls.droneDamageMul ?? 0.85) *
      (1 + this.perkCount(owner, 'heavyRounds') * 0.15) * (1 + this.perkCount(owner, 'droneTactician') * 0.15);
    drone.maxSpeed = 300 * (cls.droneSpeedMul ?? 1) *
      (1 + this.perkCount(owner, 'droneTactician') * 0.08) * (1 + this.perkCount(owner, 'longshot') * 0.1);
    drone.chilled = this.mode === 'survival' && this.perkCount(owner, 'cryoRounds') > 0;
    drone.explosionRadius = this.mode === 'survival' && this.perkCount(owner, 'explosiveImpact') > 0
      ? 34 + this.perkCount(owner, 'explosiveImpact') * 8 : undefined;
    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;
  }

  private beginDroneRecovery(drone: Bullet, cooldown: number) {
    const speed = Math.hypot(drone.vx, drone.vy);
    drone.attackState = 'recover';
    drone.attackTargetId = undefined;
    drone.attackTimer = 0;
    drone.attackCooldown = Math.max(drone.attackCooldown ?? 0, cooldown);
    drone.exploded = false; drone.chained = false; drone.weaponChained=false;
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
      damageMul: kind === 'trap' ? 0.75 : (cls.turretDamageMul ?? 0.42), speedMul: 1,
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
    if(rocket.splitDone)return;
    rocket.splitDone=true;rocket.hp = 0;
    const baseAngle = rocket.angle;
    const owner=this.mode==='survival'?this.players.get(rocket.owner):undefined;
    const count=FIREWORK_PELLETS+2*this.perkCount(owner,'forkCount');
    const speed = Math.max(260, Math.hypot(rocket.vx, rocket.vy) * 0.75)*(1+0.15*this.perkCount(owner,'forkSpeed'));
    for (let i = 0; i < count && this.bullets.length < MAX_BULLETS; i++) {
      const angle = baseAngle + (i / count) * Math.PI * 2;
      const id=this.nextId++;
      this.link({x:rocket.x,y:rocket.y},{x:rocket.x,y:rocket.y,id},'#ffd174','fork',i===0);
      this.bullets.push({
        id, owner: rocket.owner, x: rocket.x, y: rocket.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: Math.max(3, rocket.r * 0.45), dmg: rocket.dmg * (0.42+0.10*this.perkCount(owner,'forkDamage')), hp: 1,
        life: 0.8+0.12*this.perkCount(owner,'forkRange'), forkChild:true, hit: new Set(rocket.hit), kind: 'bullet', angle, maxSpeed: speed, turnRate: 0,
        ...(rocket.chilled ? { chilled: true } : {}),
      });
    }
  }

  private updateShape(s: Shape, dt: number) {
    s.x += (s.vx + s.kvx) * dt; s.y += (s.vy + s.kvy) * dt; s.rot += s.rotSpeed * dt;
    const dec = Math.exp(-dt * 4);
    s.kvx *= dec; s.kvy *= dec;
    const knockback = Math.hypot(s.kvx, s.kvy);
    if (knockback > 180) { s.kvx *= 180 / knockback; s.kvy *= 180 / knockback; }
    s.rotSpeed = clamp(s.rotSpeed, -2.5, 2.5);
    if (s.ramCooldowns) for (const [id, until] of s.ramCooldowns) if (until <= this.time) s.ramCooldowns.delete(id);
    if (s.ramFeedback) for (const [id, feedback] of s.ramFeedback) {
      if (feedback.next <= this.time) {
        if (feedback.damage > 0) this.effect(s, feedback.damage, '#fff0a0', 'damage', true);
        s.ramFeedback.delete(id);
      }
    }
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
    const clear = (x: number, y: number) =>
      this.shapes.every((shape) => shape.hp <= 0 || Math.hypot(shape.x - x, shape.y - y) >= shape.r + def.radius + 8) &&
      [...this.players.values()].every((p) => !p.alive || Math.hypot(p.x - x, p.y - y) >= p.r + def.radius + 24);
    let point: { x: number; y: number } | undefined;
    for (let i = 0; i < 40; i++) {
      const x = 100 + this.rng() * (ARENA_SIZE - 200), y = 100 + this.rng() * (ARENA_SIZE - 200);
      if (clear(x, y)) { point = { x, y }; break; }
    }
    // Deterministic fallback also handles seeded or constant random sources.
    if (!point) {
      for (let y = 100; y < ARENA_SIZE - 100 && !point; y += 100) {
        for (let x = 100; x < ARENA_SIZE - 100; x += 100) {
          if (clear(x, y)) { point = { x, y }; break; }
        }
      }
    }
    if (!point) return;
    this.shapes.push({
      id: this.nextId++, kind, x: point.x, y: point.y,
      explosive: kind===1 && this.nextId%4===0,
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
    if (this.mode !== 'survival') this.resolveShapeContacts();
  }

  // Position-only cleanup after combat. Never repeat damage or hit effects here.
  private resolveShapeContacts() {
    const shapes = this.shapes.filter((shape) => shape.hp > 0);
    const players = [...this.players.values()].filter((p) => p.connected && p.alive && !p.downed && p.hp > 0);
    const bound = (o: { x: number; y: number; r: number }) => {
      o.x = clamp(o.x, o.r, this.arenaSize - o.r);
      o.y = clamp(o.y, o.r, this.arenaSize - o.r);
    };
    const push = (a: { x: number; y: number; r: number; id: number }, b: { x: number; y: number; r: number; id: number }, massA: number, massB: number) => {
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r + 0.25;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) return;
      const d = Math.sqrt(d2), angle = (a.id + b.id) * 2.399963;
      const nx = d > 0.001 ? dx / d : Math.cos(angle), ny = d > 0.001 ? dy / d : Math.sin(angle);
      const overlap = rr - d, total = massA + massB;
      a.x -= nx * overlap * massB / total; a.y -= ny * overlap * massB / total;
      b.x += nx * overlap * massA / total; b.y += ny * overlap * massA / total;
      bound(a); bound(b);
    };
    for (let pass = 0; pass < 5; pass++) {
      for (let i = 0; i < shapes.length; i++) {
        const a = shapes[i];
        bound(a);
        for (let j = i + 1; j < shapes.length; j++) {
          const b = shapes[j]; push(a, b, a.r * a.r, b.r * b.r);
        }
        for (const p of players) push(p, a, p.r * p.r, a.r * a.r * 1.5);
      }
    }
  }

  private collidePair(e1: Ent, e2: Ent, dt: number) {
    const [a, b] = e1.k <= e2.k ? [e1, e2] : [e2, e1];
    const A = a.o as Player, B = b.o as Player;
    let dx = B.x - A.x, dy = B.y - A.y;
    const rr = A.r + B.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-6) { const angle = (A.id + B.id) * 2.399963; dx = Math.cos(angle) * 0.001; dy = Math.sin(angle) * 0.001; }
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
      if (shape.hp <= 0) return;
      const nx = dx / distance, ny = dy / distance;
      const approach = Math.max(0, (A.vx + A.kvx - shape.vx - shape.kvx) * nx + (A.vy + A.kvy - shape.vy - shape.kvy) * ny);
      const massRatio = A.r * A.r / (A.r * A.r + shape.r * shape.r * 1.5);
      this.separate(A, shape, dx, dy, distance, rr, A.r * A.r, shape.r * shape.r * 1.5);
      // Speed-based ram bonus, throttled per tank/shape pair to prevent tick-rate abuse.
      const cooldowns = shape.ramCooldowns ?? (shape.ramCooldowns = new Map<number, number>());
      const slam = approach > 100 && this.time >= (cooldowns.get(A.id) ?? -Infinity);
      const damage = A.d.bodyDps * (dt + (slam ? Math.min(0.36, approach / 950) : 0));
      if (A.protT <= 0) this.hurtPlayer(A, def.bodyDps * dt, null, 'a shape');
      // Display only actual accumulated contact damage, not a number every tick.
      const pending = shape.ramFeedback ?? (shape.ramFeedback = new Map<number, { damage: number; next: number }>());
      const feedback = pending.get(A.id) ?? { damage: 0, next: this.time + 0.25 };
      feedback.damage += Math.min(shape.hp, damage);
      if (slam || this.time >= feedback.next || damage >= shape.hp) {
        this.effect(shape, feedback.damage, slam ? '#ffd06b' : '#fff0a0', 'damage', true);
        feedback.damage = 0;
        feedback.next = this.time + 0.4;
      }
      pending.set(A.id, feedback);
      shape.hp -= damage; shape.lastHitBy = A.id;
      if (slam) cooldowns.set(A.id, this.time + 0.25);
      const impulse = slam ? clamp(approach * massRatio * 0.75 + A.d.bodyDps * 0.4, 24, 145) : clamp(approach * massRatio * 0.15, 0, 12);
      if (slam || (shape.hitFlash ?? 0) < 0.45) {
        this.impactShape(shape, shape.x - nx * shape.r, shape.y - ny * shape.r, nx, ny, impulse);
      } else {
        shape.kvx += nx * impulse; shape.kvy += ny * impulse;
      }
      if (slam) {
        const recoil = Math.min(35, approach * (1 - massRatio) * 0.18);
        A.kvx -= nx * recoil; A.kvy -= ny * recoil;
      }
    } else if (a.k === 1 && b.k === 1) {
      const first = a.o as Shape, second = b.o as Shape;
      if (first.hp <= 0 || second.hp <= 0) return;
      const nx = dx / distance, ny = dy / distance;
      const closing = (first.vx + first.kvx - second.vx - second.kvx) * nx + (first.vy + first.kvy - second.vy - second.kvy) * ny;
      const m1 = first.r * first.r, m2 = second.r * second.r;
      this.separate(first, second, dx, dy, distance, rr + 0.25, m1, m2);
      if (closing > 0) {
        const impulse = Math.min(120, closing * 0.85);
        first.kvx -= nx * impulse * m2 / (m1 + m2); first.kvy -= ny * impulse * m2 / (m1 + m2);
        second.kvx += nx * impulse * m1 / (m1 + m2); second.kvy += ny * impulse * m1 / (m1 + m2);
      }
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
      this.weaponImpact(bullet,A);
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0) : bullet.kind === 'trap' ? 1 : PLAYER_PIERCE_COST;
      if (bullet.kind === 'drone') this.beginDroneRecovery(bullet, 0.85);
      A.kvx += bullet.vx / 8; A.kvy += bullet.vy / 8;
      if (bullet.kind === 'firework') this.explodeFirework(bullet);
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
        this.effect(zombie, bodyDamage, '#ffda83');
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
      this.effect(shape, bullet.dmg, '#fff0a0');
      shape.hp -= bullet.dmg; shape.lastHitBy = bullet.owner;
      this.weaponImpact(bullet,shape);
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0) : bullet.kind === 'trap' ? 1 : SHAPES[SHAPE_KINDS[shape.kind]].pierceCost;
      if (bullet.kind === 'drone') this.beginDroneRecovery(bullet, 0.85);
      const def = SHAPES[SHAPE_KINDS[shape.kind]];
      const speed = Math.hypot(bullet.vx, bullet.vy);
      const impulse = clamp(speed * 0.11 * (28 / def.radius) + bullet.dmg * 0.4, 18, 105);
      const nx = speed > 0.001 ? bullet.vx / speed : Math.cos(bullet.angle);
      const ny = speed > 0.001 ? bullet.vy / speed : Math.sin(bullet.angle);
      this.impactShape(shape, bullet.x, bullet.y, nx, ny, impulse);
      if (bullet.kind === 'firework') this.explodeFirework(bullet);
    } else if (a.k === 2 && b.k === 3) {
      const bullet = a.o as Bullet;
      const zombie = b.o as Zombie;
      if (bullet.hostile) return;
      const firstDroneContact = bullet.kind === 'drone' && !bullet.hit.has(zombie.id);
      if (bullet.kind === 'drone' && bullet.attackState && bullet.attackState !== 'dive') return;
      if (!this.projectileCanHit(bullet, zombie.id)) return;
      if (bullet.kind === 'drone') bullet.hit.add(zombie.id);
      const owner = this.players.get(bullet.owner);
      const dealt = bullet.dmg * this.survivalDamageMultiplier(owner, zombie);
      this.effect(zombie, dealt, '#ffda83');
      zombie.hp -= dealt;
      this.weaponImpact(bullet,zombie);
      zombie.damageBy.set(bullet.owner, (zombie.damageBy.get(bullet.owner) ?? 0) + dealt);
      if (owner && this.mode === 'survival') {
        this.applySurvivalHitEffects(owner, zombie, dealt, bullet);
        if (!bullet.forkChild && (this.perkCount(owner,'chainShot')>0||bullet.weapon==='tesla') && !bullet.chained) this.chainSurvivalImpact(bullet,zombie,dealt);
        if(!bullet.forkChild&&!bullet.forked&&bullet.kind==='bullet'&&this.perkCount(owner,'forkShot')>0)this.forkSurvivalImpact(bullet,zombie,owner);
        if (bullet.explosionRadius && !bullet.exploded) this.explodeSurvivalImpact(bullet, zombie);
      }
      const shotSpeed = Math.hypot(bullet.vx, bullet.vy);
      const hitX = shotSpeed > 0.001 ? bullet.vx / shotSpeed : Math.cos(bullet.angle);
      const hitY = shotSpeed > 0.001 ? bullet.vy / shotSpeed : Math.sin(bullet.angle);
      zombie.hitFlash = 1;
      zombie.hitAngle = Math.atan2(hitY, hitX);
      // Bosses are immovable. Regular enemies receive damage-based knockback;
      // light rapid-fire hits cannot build unlimited velocity or stagger-lock them.
      if (!zombie.bossKind) this.applyZombieKnockback(zombie, hitX, hitY, dealt, shotSpeed, owner);
      bullet.hp -= bullet.kind === 'drone' ? (firstDroneContact ? 1 : 0)
        : bullet.kind === 'trap' ? 1 : PLAYER_PIERCE_COST;
      if (bullet.kind === 'drone') this.beginDroneRecovery(bullet, 0.85);
      if (bullet.kind === 'firework') this.explodeFirework(bullet);
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

  private weaponTargets(owner:Player){
    return [...(this.mode==='survival'?this.zombies.filter(z=>z.hp>0):[...this.players.values()].filter(p=>p.id!==owner.id&&p.connected&&p.alive&&p.hp>0&&p.protT<=0&&(owner.team==null||p.team!==owner.team))),
      ...this.shapes.filter(s=>s.hp>0)];
  }
  private specialDamage(owner:Player,id:number,amount:number){
    const p=this.players.get(id);if(p){if(p.alive&&p.protT<=0)this.hurtPlayer(p,amount,owner.id,owner.name);return;}
    const z=this.zombies.find(z=>z.id===id&&z.hp>0);if(z){const dealt=amount*this.survivalDamageMultiplier(owner,z);this.effect(z,dealt,'#b6e5ff');z.hp-=dealt;z.damageBy.set(owner.id,(z.damageBy.get(owner.id)??0)+dealt);z.hitFlash=1;return;}
    const s=this.shapes.find(s=>s.id===id&&s.hp>0);if(s){this.effect(s,amount,'#b6e5ff');s.hp-=amount;s.lastHitBy=owner.id;s.hitFlash=1;}
  }
  private weaponImpact(b:Bullet,target:{id:number;x:number;y:number}){
    const owner=this.players.get(b.owner);if(!owner||!b.weapon)return;
    if(b.weapon==='tesla'){
      // In Survival combine Tesla and Chain Shot into one path, rather than hitting the same victim twice.
      if(this.mode==='survival')return;
      if(b.weaponChained)return;b.weaponChained=true;
      const visited=new Set([target.id]);let from=target;
      for(let hop=0;hop<3;hop++){
        const next=this.weaponTargets(owner).filter(t=>!visited.has(t.id)&&Math.hypot(t.x-from.x,t.y-from.y)<=150).sort((a,c)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(c.x-from.x,c.y-from.y)||a.id-c.id)[0];
        if(!next)break;
        visited.add(next.id);this.link(from,next,'#82c9ff','arc',hop===0,hop);
        this.specialDamage(owner,next.id,b.dmg*0.45*Math.pow(0.72,hop));from=next;
      }
    }else if(b.weapon==='gravity'){
      if(b.weaponChained)return;b.weaponChained=true;
      this.blastVisual(target.x,target.y,145,'#b69ce9','gravity');
      for(const t of this.weaponTargets(owner)){
        const dx=target.x-t.x,dy=target.y-t.y,d=Math.hypot(dx,dy);
        if(d>1&&d<145){t.kvx+=dx/d*45*(1-d/145);t.kvy+=dy/d*45*(1-d/145);}
      }
    }
  }
  private updateEngineer(b:Bullet){
    if(b.hp<=0||b.life<=0||this.time<(b.turretNext??0)||this.bullets.length>=MAX_BULLETS)return;
    const p=this.players.get(b.owner);if(!p?.alive||p.cls!=='engineer'){b.hp=0;return;}
    const t=this.weaponTargets(p).filter(t=>Math.hypot(t.x-b.x,t.y-b.y)<300).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
    if(!t)return;
    const angle=Math.atan2(t.y-b.y,t.x-b.x),speed=600;
    b.angle=angle;b.turretNext=this.time+0.65;
    this.bullets.push({id:this.nextId++,owner:p.id,x:b.x+Math.cos(angle)*b.r,y:b.y+Math.sin(angle)*b.r,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:5,dmg:p.d.bulletDamage*0.48,hp:2,life:0.75,hit:new Set(),kind:'bullet',angle,maxSpeed:speed,turnRate:0});
  }
  private survivalDamageMultiplier(owner: Player | undefined, zombie: Zombie): number {
    const guardianMul = this.isZombieProtected(zombie) ? 0.58 : 1;
    const armourStacks = this.mode === 'survival' ? this.perkCount(owner, 'armorPiercer') : 0;
    const armourMul = zombie.kind === 'armoured' ? Math.min(0.96, 0.58 + armourStacks * 0.09) : 1;
    const bossMul = zombie.bossKind ? 0.84 : 1;
    let perkMul = 1;
    if (owner && this.mode === 'survival') {
      if (zombie.bossKind) perkMul *= 1 + this.perkCount(owner, 'bossHunter') * 0.16;
      if (zombie.hp <= zombie.maxHp * 0.35) perkMul *= 1 + this.perkCount(owner, 'executioner') * 0.18;
      if (owner.hp <= owner.maxHp * 0.35) perkMul *= 1 + this.perkCount(owner, 'adrenaline') * 0.12;
    }
    return guardianMul * armourMul * bossMul * perkMul;
  }

  private applySurvivalHitEffects(owner: Player | undefined, zombie: Zombie, dealt: number, bullet: Bullet) {
    if (this.mode !== 'survival' || !owner) return;
    const lifesteal = this.perkCount(owner, 'lifesteal');
    if (lifesteal > 0) owner.hp = Math.min(owner.maxHp, owner.hp + dealt * 0.05 * lifesteal * (this.combos(owner).includes('Vampire Core')?1.5:1));
    if(bullet.chilled){zombie.slowT=Math.max(zombie.slowT,3+this.perkCount(owner,'cryoDuration'));zombie.slowStrength=Math.max(zombie.slowStrength??0.38,0.38+0.07*this.perkCount(owner,'cryoStrength'));}
    const hotStacks = this.perkCount(owner, 'hotRounds');
    if (hotStacks > 0) {
      zombie.burnT = Math.max(zombie.burnT ?? 0, 3+this.perkCount(owner,'burnDuration'));
      zombie.burnDps = Math.max(zombie.burnDps ?? 0, dealt * 0.09 * hotStacks*(1+0.25*this.perkCount(owner,'burnDamage')));
      zombie.burnTick = Math.min(zombie.burnTick ?? 0.5, 0.5);
      zombie.burnOwnerId = owner.id;
    }
  }

  private applyZombieKnockback(zombie: Zombie, dirX: number, dirY: number, damage: number, shotSpeed: number, owner?: Player) {
    const mass: Record<ZombieKind, number> = {
      shambler: 1, runner: 0.82, tank: 0.48, ranger: 0.88, guardian: 0.62, bomber: 0.9,
      leaper: 0.76, armoured: 0.4, medic: 0.92, exploder: 0.86, splitter: 0.78, stalker: 0.72, commander: 0.68,
    };
    const concussive = this.mode === 'survival' ? 1 + this.perkCount(owner, 'concussiveRounds') * 0.2 : 1;
    const impulse = (Math.sqrt(Math.max(0, damage)) * 3.4 + Math.max(0, shotSpeed - 250) * 0.006) * mass[zombie.kind] * concussive;
    zombie.kvx += dirX * impulse; zombie.kvy += dirY * impulse;
    const maxSpeed = zombie.kind === 'tank' ? 38 : zombie.kind === 'armoured' ? 32 : zombie.kind === 'guardian' ? 44 : zombie.kind === 'runner' ? 72 : 58;
    const current = Math.hypot(zombie.kvx, zombie.kvy);
    if (current > maxSpeed) { zombie.kvx = zombie.kvx / current * maxSpeed; zombie.kvy = zombie.kvy / current * maxSpeed; }
    const stagger = clamp((damage - 9) / 55, 0, 1) * 0.16;
    if (stagger > 0) zombie.staggerT = Math.max(zombie.staggerT, stagger);
  }

  private chainSurvivalImpact(bullet: Bullet, directHit: Zombie, damage: number) {
    const owner = this.players.get(bullet.owner);
    if (!owner) return;
    bullet.chained = true;
    const stacks = this.perkCount(owner, 'chainShot');
    const radius = (stacks?100 + stacks * 25:150)+35*this.perkCount(owner,'chainRange');
    const tesla=bullet.weapon==='tesla';
    const frozen=this.combos(owner).includes('Frozen Storm');
    const visited=new Set([directHit.id]);let from=directHit;
    const jumps=Math.min(8,(stacks?stacks+1+(tesla?1:0):3)+this.perkCount(owner,'chainCount'));
    for(let hop=0;hop<jumps;hop++){
      let target:Zombie|undefined,nearest=radius;
      for(const z of this.zombies){
        if(visited.has(z.id)||z.hp<=0)continue;
        const d=Math.hypot(z.x-from.x,z.y-from.y);
        if(d>nearest||(d===nearest&&target&&z.id>target.id))continue;
        target=z;nearest=d;
      }
      if(!target)break;
      visited.add(target.id);
      this.link(from,target,frozen?'#9ce9ff':tesla?'#82c9ff':'#a5b4ff','arc',hop===0,hop);
      const chainDamage=damage*((tesla?Math.max(0.45,0.14+stacks*0.06):0.14+stacks*0.06)+0.10*this.perkCount(owner,'chainDamage'))*Math.pow(Math.min(0.98,(tesla&&!stacks?0.72:0.76)+0.06*this.perkCount(owner,'chainRetention')),hop)*this.survivalDamageMultiplier(owner,target);
      this.effect(target,chainDamage,'#9eeaff');
      target.hp-=chainDamage;
      if(frozen)target.slowT=Math.max(target.slowT,4);
      target.damageBy.set(owner.id,(target.damageBy.get(owner.id)??0)+chainDamage);
      this.applySurvivalHitEffects(owner,target,chainDamage,bullet);
      target.hitFlash=Math.max(target.hitFlash,0.65);
      target.hitAngle=Math.atan2(target.y-from.y,target.x-from.x);
      from=target;
    }
  }

  private forkSurvivalImpact(bullet:Bullet,direct:Zombie,owner:Player){
    bullet.forked=true;
    const range=160+45*this.perkCount(owner,'forkRange'), count=2+this.perkCount(owner,'forkCount');
    const targets=this.zombies.filter(z=>z.hp>0&&z.id!==direct.id&&!bullet.hit.has(z.id)&&Math.hypot(z.x-direct.x,z.y-direct.y)<=range)
      .sort((a,b)=>Math.hypot(a.x-direct.x,a.y-direct.y)-Math.hypot(b.x-direct.x,b.y-direct.y)||a.id-b.id).slice(0,count);
    const speed=Math.max(300,Math.hypot(bullet.vx,bullet.vy))*(1+0.15*this.perkCount(owner,'forkSpeed'));
    for(const [i,z] of targets.entries()){
      if(this.bullets.length>=MAX_BULLETS)break;
      // Aim ahead using current velocity; the child is an actual projectile and can miss.
      const lead=Math.min(0.30,Math.hypot(z.x-direct.x,z.y-direct.y)/speed);
      const angle=Math.atan2(z.y+(z.vy+z.kvy)*lead-direct.y,z.x+(z.vx+z.kvx)*lead-direct.x);
      const id=this.nextId++;
      this.bullets.push({id,owner:owner.id,x:direct.x,y:direct.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:Math.max(4,bullet.r*0.65),
        dmg:bullet.dmg*(0.30+0.10*this.perkCount(owner,'forkDamage')),hp:1,life:Math.max(0.55,range/speed+0.22)+0.12*this.perkCount(owner,'forkRange'),
        hit:new Set([...bullet.hit,direct.id]),kind:'bullet',angle,maxSpeed:speed,turnRate:0,forkChild:true,chilled:bullet.chilled});
      this.link({x:direct.x,y:direct.y},{id,x:direct.x,y:direct.y},'#ffd174','fork',i===0);
    }
  }

  private explodeSurvivalImpact(bullet: Bullet, directHit: Zombie) {
    bullet.exploded = true;
    const owner = this.players.get(bullet.owner), radius = (bullet.explosionRadius ?? 0)+20*this.perkCount(owner,'blastRadius');
    if(radius<=0)return;
    this.blastVisual(bullet.x,bullet.y,radius,owner&&this.combos(owner).includes('Napalm')?'#ff8f55':'#ffba62');
    const splash = bullet.dmg * (Math.min(0.62, (this.perkCount(owner, 'blastRounds') > 0 ? 0.42 : 0.28) + this.perkCount(owner, 'shrapnel') * 0.07)+0.12*this.perkCount(owner,'blastDamage'));
    for (const zombie of this.zombies) {
      if (zombie === directHit || zombie.hp <= 0 || Math.hypot(zombie.x - bullet.x, zombie.y - bullet.y) > radius + zombie.r) continue;
      const dealt = splash * this.survivalDamageMultiplier(owner, zombie);
      this.effect(zombie, dealt, '#ffda83');
      zombie.hp -= dealt;
      const force=25*this.perkCount(owner,'blastKnockback'),d=Math.hypot(zombie.x-bullet.x,zombie.y-bullet.y);
      if(force>0&&!zombie.bossKind&&d>0.01){zombie.kvx+=(zombie.x-bullet.x)/d*force;zombie.kvy+=(zombie.y-bullet.y)/d*force;}
      zombie.damageBy.set(bullet.owner, (zombie.damageBy.get(bullet.owner) ?? 0) + dealt);
      this.applySurvivalHitEffects(owner, zombie, dealt, bullet);
      if(owner&&this.combos(owner).includes('Napalm')) {zombie.burnT=Math.max(zombie.burnT??0,3);zombie.burnDps=Math.max(zombie.burnDps??0,dealt*0.14);zombie.burnOwnerId=owner.id;zombie.burnTick=0.5;}
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

  private effect(target: { x: number; y: number; r: number; hp: number }, amount: number, color: string, kind: CombatEffect['kind'] = 'damage', alreadyClamped = false) {
    const damage = alreadyClamped ? amount : Math.min(Math.max(0, target.hp), amount);
    if (kind === 'damage' && damage <= 0) return;
    // Coalesce rapid contact damage per target position within a short window.
    const last = this.combatEffects[this.combatEffects.length - 1];
    if (kind === 'damage' && last?.kind === kind && last.tick === this.tick &&
        last.x === target.x && last.y === target.y && last.color === color) {
      last.amount += damage;
      return;
    }
    this.combatEffects.push({ tick: this.tick, x: target.x, y: target.y, radius: target.r, kind, amount: damage, color });
    if (this.combatEffects.length > 240) this.combatEffects.shift();
  }

  private flushIncomingFeedback(id: number) {
    const feedback = this.incomingFeedback.get(id);
    const player = this.players.get(id);
    if (feedback && player && feedback.damage > 0) {
      this.effect(player, feedback.damage, '#ff7777', 'damage', true);
    }
    this.incomingFeedback.delete(id);
  }

  private hurtPlayer(p: Player, amount: number, byId: number | null, byName: string) {
    if (!p.connected || !p.alive || p.downed || amount <= 0) return;
    const reduced = (byName==='the storm'?1:this.boost(p,'shield')?0.45:1)*(this.mode === 'survival' ? amount * Math.max(0.68, 1 - this.perkCount(p, 'ironSkin') * 0.06) : amount);
    // Aggregate incoming damage across all sources, independently of outgoing ram feedback.
    const feedback = this.incomingFeedback.get(p.id) ?? { damage: 0, next: this.time + 0.45 };
    feedback.damage += Math.min(Math.max(0, p.hp), reduced);
    this.incomingFeedback.set(p.id, feedback);
    if (reduced >= p.hp) this.flushIncomingFeedback(p.id);
    p.hp -= reduced;
    p.damageTaken += reduced;
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
      this.effect(zombie, 0, '#a1c76b', 'destroy');
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
      if (player) { player.kills++; player.matchKills++; this.recordKill(player); }
    }
    this.zombies = this.zombies.filter((zombie) => zombie.hp > 0);
    // Resolve chained explosive objects once before collecting destroyed shapes.
    const exploded=new Set<number>();
    for(let pass=0;pass<this.shapes.length;pass++){
      const source=this.shapes.find(s=>s.explosive&&s.hp<=0&&!exploded.has(s.id));if(!source)break;exploded.add(source.id);
      this.blastVisual(source.x,source.y,125,'#ff995b');
      this.effect({...source,r:42},0,'#ff8954','destroy');
      const owner=source.lastHitBy==null?undefined:this.players.get(source.lastHitBy);
      for(const t of this.shapes){if(t.hp<=0||Math.hypot(t.x-source.x,t.y-source.y)>125+t.r)continue;this.effect(t,28,'#ffcf75');t.hp-=28;t.lastHitBy=source.lastHitBy;}
      for(const p of this.players.values()){if(!p.connected||!p.alive||p.protT>0||Math.hypot(p.x-source.x,p.y-source.y)>125+p.r||(owner?.team!=null&&owner.team===p.team&&owner.id!==p.id))continue;this.hurtPlayer(p,24,owner?.id??null,owner?.name??'an explosive object');}
    }
    if (this.shapes.some((shape) => shape.hp <= 0)) {
      for (const shape of this.shapes) {
        if (shape.hp > 0) continue;
        this.effect(shape, 0, SHAPES[SHAPE_KINDS[shape.kind]].color, 'destroy');
        const killer = shape.lastHitBy != null ? this.players.get(shape.lastHitBy) : undefined;
        if (killer?.alive && !killer.downed) {
          this.addXp(killer, SHAPES[SHAPE_KINDS[shape.kind]].xp);
          if (CLASS_BY_ID[killer.cls].droneBehavior === 'necromancer' && shape.kind === 0) this.convertSquareToDrone(killer, shape);
        }
      }
      this.shapes = this.shapes.filter((shape) => shape.hp > 0);
    }
    for(const p of this.players.values())if(p.alive&&!p.downed&&p.hp<=0&&this.mode!=='survival')this.finalizePlayerDeath(p);
  }

  private convertSquareToDrone(owner: Player, shape: Shape) {
    const cls = CLASS_BY_ID[owner.cls];
    const owned = this.bullets.filter((b) => b.owner === owner.id && b.kind === 'drone').length;
    if (owned >= (cls.droneLimit ?? 0) || this.bullets.length >= MAX_BULLETS) return;
    const formationSlot = this.nextDroneFormationSlot(owner.id, cls.droneLimit ?? 8);
    this.bullets.push({
      id: this.nextId++, owner: owner.id, x: shape.x, y: shape.y, vx: 0, vy: 0,
      r: 12, dmg: owner.d.bulletDamage * (cls.droneDamageMul ?? 0.6) *
        (1 + this.perkCount(owner, 'heavyRounds') * 0.15) * (1 + this.perkCount(owner, 'droneTactician') * 0.15), hp: 8,
      life: DRONE_LIFE_S, hit: new Set(), kind: 'drone', angle: owner.angle,
      maxSpeed: 300 * (cls.droneSpeedMul ?? 1) *
        (1 + this.perkCount(owner, 'droneTactician') * 0.08) * (1 + this.perkCount(owner, 'longshot') * 0.1),
      turnRate: 4.6, formationSlot, attackState: 'guard', attackCooldown: 0,
      ...(this.perkCount(owner, 'cryoRounds') > 0 ? { chilled: true } : {}),
      ...(this.perkCount(owner, 'explosiveImpact') > 0 ? { explosionRadius: 34 + this.perkCount(owner, 'explosiveImpact') * 8 } : {}),
    });
  }

  private perkCount(p: Player | undefined, id: string): number { return p?.survivalPerks[id] ?? 0; }
  private reloadDelay(p: Player): number { return p.d.reload * (this.boost(p,'rapid')?0.65:1)*Math.pow(0.9, this.mode === 'survival' ? this.perkCount(p, 'rapidLoader') : 0); }
  private queueRewardOffer(player: Player, bossReward: boolean) {
    if (player.rewardOffers.length >= 5) return;
    const available = SURVIVAL_PERKS.filter((perk) => (player.survivalPerks[perk.id] ?? 0) < perk.max && !this.perkRequirement(player,perk.id));
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
    if (this.mode !== 'survival' || !player?.alive || !card || !perk || this.perkRequirement(player,perkId)) return false;
    player.survivalPerks[perkId] = Math.min(perk.max, (player.survivalPerks[perkId] ?? 0) + 1);
    this.refresh(player);
    player.rewardOffers.shift(); return true;
  }

  addXp(p: Player, amount: number) {
    p.xp += amount;
    p.level = levelFromXp(p.xp);
    this.refresh(p);
  }

  private refresh(p: Player) {
    const previousMax = p.maxHp;
    p.d = deriveStats(p.level, p.cls);
    const vitality = this.mode === 'survival' ? 1 + this.perkCount(p, 'vitalCore') * 0.08 : 1;
    p.maxHp = p.d.maxHp * vitality;
    p.r = p.d.radius;
    if (previousMax > 0) p.hp = Math.min(p.maxHp, p.hp * (p.maxHp / previousMax));
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
      wave: this.wave, theme: this.waveTheme(), zombieKills: this.zombieKills, zombiesRemaining: this.zombies.length + this.waveSpawnRemaining,
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

  snapshotFor(id: number, developer=false): Snapshot | null {
    const me = this.players.get(id);
    if (!me) return null;
    this.followCombatLinks();
    const near = (x: number, y: number, radius: number) =>
      Math.abs(x - me.x) <= VIEW_HALF + radius && Math.abs(y - me.y) <= VIEW_HALF + radius;
    const currentXp = totalXpForLevel(me.level);
    const nextXp = me.level >= 45 ? currentXp : totalXpForLevel(me.level + 1);
    const myClass = CLASS_BY_ID[me.cls];
    const focus = myClass.id === 'predator' && me.input.secondary ? 1.55 : 1;
    return {
      t: 's', tick: this.tick, mode: this.mode,
      crates:this.crates.filter(c=>near(c.x,c.y,c.r)).map(({id,x,y,r,kind})=>({id,x,y,r,kind})),
      explosiveIds:this.shapes.filter(s=>s.explosive&&near(s.x,s.y,s.r)).map(s=>s.id),
      beams:this.beams.filter(b=>this.tick-b.tick<=(b.kind==='laser'?8:30)&&(near(b.x,b.y,b.radius??100)||near(b.tx,b.ty,100))),
      ...(this.mode==='royale'?{royale:{phase:this.royalePhase,radius:this.royaleRadius,seconds:Math.ceil(this.royaleTimer),alive:[...this.players.values()].filter(p=>p.connected&&p.alive).length,winner:this.royaleWinner}}:{}),
      ...(this.mode === 'survival' ? { survival: { wave: this.wave, theme: this.waveTheme(), remaining: this.zombies.length + this.waveSpawnRemaining, intermission: this.waveIntermission } } : {}),
      effects: this.combatEffects.filter((effect) => this.tick - effect.tick <= SERVER_TICK_HZ && near(effect.x, effect.y, effect.radius)),
      z: this.zombies.map((zombie) => ({
        id: zombie.id, x: r1(zombie.x), y: r1(zombie.y), r: r1(zombie.r),
        hp: r1(zombie.hp), mhp: r1(zombie.maxHp),
        angle: r2(zombie.angle), hitFlash: r2(zombie.hitFlash), hitAngle: r2(zombie.hitAngle),
        kind: zombie.kind, elite: zombie.elite, chilled:zombie.slowT>0, burning:(zombie.burnT??0)>0, protected: this.isZombieProtected(zombie),
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
        xpCur: currentXp, xpNext: nextXp,
        cls: me.cls, opts: me.alive && !me.downed ? classOptions(me.cls, me.level) : [], fov: me.d.fovMul * focus,
        coins:me.coins??0,shop:this.shopOffers(me,developer),devShop:developer&&this.mode==='survival',combos:this.combos(me),streak:me.streak??0,streakSerial:me.streakSerial??0,powerups:this.powerupStatus(me),
        team: me.team, rewards: me.rewardOffers[0]?.cards ?? [], rewardTimer: r1(me.rewardOffers[0]?.timeRemaining ?? 0),
      },
      p: [...this.players.values()].filter((player) => player.connected && player.alive && !player.downed &&
        (this.mode === 'survival' || near(player.x, player.y, player.r))).map((player) => ({
        id: player.id, name: player.name, x: r1(player.x), y: r1(player.y), a: r2(player.angle),
        hp: r1(player.hp), mhp: r1(player.maxHp), r: r1(player.r), lv: player.level,
        cls: CLASS_IDS.indexOf(player.cls), prot: player.protT > 0 ? 1 : 0, vis: player.visibility,
        team: player.team,skin:player.skin,powerups:this.powerupStatus(player),shots:player.shots,
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
