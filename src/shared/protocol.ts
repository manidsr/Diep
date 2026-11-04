import { MAX_NAME_LEN, STAT_KEYS } from './config';

export const MAX_MESSAGE_BYTES = 256;

// Client messages express intent only. The server owns all state and outcomes.
export type TeamId = 'blue' | 'red';
export type GameMode = 'ffa' | 'teams';

export type ClientMessage =
  | { t: 'join'; name: string; mode?: GameMode }
  | { t: 'input'; mx: number; my: number; a: number; f: boolean; secondary?: boolean; spin?: boolean }
  | { t: 'upgrade'; stat: number }
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
      return {
        t: 'join',
        name: sanitizeName(message.name),
        mode: message.mode === 'teams' ? 'teams' : 'ffa',
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
    case 'upgrade':
      if (!Number.isInteger(message.stat) || (message.stat as number) < 0 || (message.stat as number) >= STAT_KEYS.length) return null;
      return { t: 'upgrade', stat: message.stat as number };
    case 'class':
    case 'devClass':
      if (typeof message.id !== 'string' || message.id.length > 24 || !/^[a-z0-9_-]+$/.test(message.id)) return null;
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
}
export interface SelfSnap {
  alive: boolean; hp: number; mhp: number; lv: number;
  xp: number; xpCur: number; xpNext: number; pts: number;
  stats: number[]; cls: string; opts: string[]; fov: number; team: TeamId | null;
}
export interface Snapshot {
  t: 's';
  tick: number;
  me: SelfSnap;
  p: PlayerSnap[];
  // id, x, y, radius, ownerId, projectile kind, direction angle, drone state (0 guard, 1 dive, 2 peel)
  b: [number, number, number, number, number, number, number, number][];
  // id, x, y, rotation, kind, health fraction, hit flash, impact x/y, impact angle
  sh: [number, number, number, number, number, number, number, number, number, number][];
  mode: GameMode;
}
export type ServerMessage =
  | { t: 'welcome'; id: number; arena: number; hz: number; devCheats: boolean; mode: GameMode }
  | Snapshot
  | { t: 'lb'; mode: 'ffa'; top: { id: number; name: string; score: number; lv: number }[] }
  | {
      t: 'lb'; mode: 'teams'; blueKills: number; redKills: number;
      blue: { id: number; name: string; score: number; lv: number; kills: number; team: 'blue' }[];
      red: { id: number; name: string; score: number; lv: number; kills: number; team: 'red' }[];
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
