import { CLASS_IDS, MAX_NAME_LEN, TANK_SKINS, type TankSkin, type Powerup } from './config';

export const MAX_MESSAGE_BYTES = 256;

// Client messages express intent only. The server owns all state and outcomes.
export type TeamId = 'blue' | 'red';
export type GameMode = 'ffa' | 'teams' | 'survival' | 'royale';

export type ClientMessage =
  | { t: 'join'; name: string; mode?: GameMode; resumeToken?: string }
  | { t: 'input'; mx: number; my: number; a: number; f: boolean; secondary?: boolean; spin?: boolean }
  | { t: 'reward'; id: string }
  | { t: 'skin'; id: TankSkin }
  | { t: 'shop'; id: string }
  | { t: 'restart' }
  | { t: 'class'; id: string }
  | { t: 'devClass'; id: string };

export function sanitizeName(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f<>&"'\`]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
  return clean || 'Tank';
}

const num = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const bool = (value: unknown) => value === true || value === 1;

/** Parse and validate one raw WebSocket text frame. Returns null when invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const message = parsed as Record<string, unknown>;
  switch (message.t) {
    case 'join':
      if (message.resumeToken !== undefined &&
          (typeof message.resumeToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(message.resumeToken))) return null;
      return {
        t: 'join',
        name: sanitizeName(message.name),
        mode: message.mode === 'teams' ? 'teams' : message.mode === 'survival' ? 'survival' : message.mode === 'royale' ? 'royale' : 'ffa',
        ...(typeof message.resumeToken === 'string' ? { resumeToken: message.resumeToken } : {}),
      };
    case 'input':
      if (!num(message.mx) || !num(message.my) || !num(message.a)) return null;
      return {
        t: 'input',
        mx: clamp(message.mx, -1, 1),
        my: clamp(message.my, -1, 1),
        a: clamp(message.a, -1000, 1000),
        f: bool(message.f),
        secondary: bool(message.secondary),
        spin: bool(message.spin),
      };
    case 'reward':
      if (typeof message.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{1,31}$/.test(message.id)) return null;
      return { t: 'reward', id: message.id };
    case 'skin':
      return typeof message.id === 'string' && Object.prototype.hasOwnProperty.call(TANK_SKINS,message.id) ? {t:'skin',id:message.id as TankSkin} : null;
    case 'shop':
      return typeof message.id === 'string' && /^[a-zA-Z][a-zA-Z0-9]{1,31}$/.test(message.id) ? {t:'shop',id:message.id} : null;
    case 'restart':
      return { t: 'restart' };
    case 'class':
    case 'devClass':
      if (typeof message.id !== 'string' || !CLASS_IDS.includes(message.id as (typeof CLASS_IDS)[number])) return null;
      return { t: message.t, id: message.id };
    default:
      return null;
  }
}

// ---- Server -> client ----
export interface PlayerSnap {
  id: number; name: string; x: number; y: number; a: number;
  hp: number; mhp: number; r: number; lv: number; cls: number; prot: 0 | 1; vis: number;
  team: TeamId | null;
  skin?: TankSkin; powerups?: Partial<Record<Powerup,number>>; shots?: number[];
}
export type ZombieBossKind = 'breaker' | 'spitter' | 'summoner' | 'colossus' | 'nestMother' | 'lich' | 'devourer' | 'abomination';
export type ZombieBossPhase = 'idle' | 'windup' | 'charge' | 'recovery';
export type ZombieKind = 'shambler' | 'runner' | 'tank' | 'ranger' | 'guardian' | 'bomber' | 'leaper' | 'armoured' | 'medic' | 'exploder' | 'splitter' | 'stalker' | 'commander';
export type ZombieSpecialPhase = 'idle' | 'windup' | 'charge';

export type WaveTheme = 'standard' | 'rush' | 'siege' | 'swarm' | 'boss';
export interface ZombieSnap {
  elite?: boolean; chilled?:boolean; burning?:boolean;
  id: number; x: number; y: number; r: number; hp: number; mhp: number; visibility: number;
  angle: number; hitFlash: number; hitAngle: number;
  kind: ZombieKind; protected: boolean;
  bossKind: ZombieBossKind | null; bossPhase: ZombieBossPhase; bossTimer: number;
  specialPhase: ZombieSpecialPhase; specialTimer: number;
}
export interface DownedPlayerSnap {
  id: number; name: string; x: number; y: number; r: number;
  reviveProgress: number; bleedout: number;
}
export interface HealthDropSnap {
  id: number; x: number; y: number; r: number; heal: number;
}
export interface XpDropSnap { id: number; x: number; y: number; r: number; xp: number; }
export interface DamagePoolSnap { id: number; x: number; y: number; r: number; life: number; }
export type RewardRarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface RewardCardSnap { id: string; title: string; description: string; rarity: RewardRarity; }
export interface SelfSnap {
  alive: boolean; downed: boolean; reviveProgress: number; hp: number; mhp: number; lv: number;
  xp: number; xpCur: number; xpNext: number;
  cls: string; opts: string[]; fov: number; team: TeamId | null;
  rewards: RewardCardSnap[]; rewardTimer: number;
  devShop?: boolean;
  coins?: number; shop?: {id:string; title:string; cost:number; description:string}[]; combos?: string[]; streak?: number; streakSerial?: number; powerups?: Partial<Record<Powerup,number>>;
}
export interface CombatEffect {
  tick: number; x: number; y: number; radius: number;
  kind: 'damage' | 'destroy'; amount: number; color: string;
}
/** Short-lived visual links. Endpoints come from actual server combat events. */
export interface BeamSnap {
  tick:number; x:number; y:number; tx:number; ty:number; color:string;
  kind?:'arc'|'fork'|'laser'|'blast'|'gravity'; root?:boolean;
  fromId?:number; toId?:number; hop?:number; radius?:number;
}
export interface Snapshot {
  t: 's';
  tick: number;
  effects?: CombatEffect[];
  crates?: {id:number;x:number;y:number;r:number;kind:Powerup}[];
  explosiveIds?: number[];
  beams?: BeamSnap[];
  royale?: {phase:'lobby'|'active'|'result'; radius:number; seconds:number; alive:number; winner:string};
  survival?: { wave: number; theme: WaveTheme; remaining: number; intermission: number };
  me: SelfSnap;
  p: PlayerSnap[];
  // id, x, y, radius, ownerId, projectile kind, direction angle, drone state (0 guard, 1 dive, 2 peel)
  b: [number, number, number, number, number, number, number, number][];
  // id, x, y, rotation, kind, health fraction, hit flash, impact x/y, impact angle
  sh: [number, number, number, number, number, number, number, number, number, number][];
  mode: GameMode;
  z: ZombieSnap[];
  d: DownedPlayerSnap[];
  h: HealthDropSnap[];
  xpDrops: XpDropSnap[];
  pools: DamagePoolSnap[];
}
export type ServerMessage =
  | { t: 'welcome'; id: number; arena: number; hz: number; devCheats: boolean; mode: GameMode; resumeToken: string }
  | Snapshot
  | { t: 'lb'; mode: 'ffa'; top: { id: number; name: string; score: number; lv: number }[] }
  | {
      t: 'lb'; mode: 'teams'; blueKills: number; redKills: number;
      blue: { id: number; name: string; score: number; lv: number; kills: number; team: 'blue' }[];
      red: { id: number; name: string; score: number; lv: number; kills: number; team: 'red' }[];
    }
  | {
      t: 'lb'; mode: 'survival'; theme?: WaveTheme; wave: number; zombieKills: number; zombiesRemaining: number;
      nextWaveIn: number; elapsed: number; gameOver: boolean;
      top: { id: number; name: string; kills: number; xp: number; lv: number; alive: boolean; downed: boolean }[];
    }
  | {
      t: 'dead'; score: number; level: number; killer: string; killerClass: string | null;
      victimClass: string; kills: number; damageDealt: number; damageTaken: number; lifetime: number;
    }
  | {
      t: 'feed'; killer: string; victim: string;
      killerClass: string | null; victimClass: string;
      killerTeam: TeamId | null; victimTeam: TeamId | null;
    }
  | { t: 'err'; msg: string };
