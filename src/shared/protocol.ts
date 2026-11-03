import { MAX_NAME_LEN, STAT_KEYS } from './config';

export const MAX_MESSAGE_BYTES = 256;

// ---- Client -> server (intents only; never outcomes) ----
export type ClientMessage =
  | { t: 'join'; name: string }
  | { t: 'input'; mx: number; my: number; a: number; f: boolean }
  | { t: 'upgrade'; stat: number }
  | { t: 'class'; id: string };

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
  return clean || 'Tank';
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Parse and validate one raw WebSocket text frame. Returns null if invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'join':
      return { t: 'join', name: sanitizeName(o.name) };
    case 'input':
      if (!num(o.mx) || !num(o.my) || !num(o.a)) return null;
      return { t: 'input', mx: clamp(o.mx, -1, 1), my: clamp(o.my, -1, 1), a: clamp(o.a, -1000, 1000), f: o.f === true || o.f === 1 };
    case 'upgrade':
      if (!Number.isInteger(o.stat) || (o.stat as number) < 0 || (o.stat as number) >= STAT_KEYS.length) return null;
      return { t: 'upgrade', stat: o.stat as number };
    case 'class':
      if (typeof o.id !== 'string' || o.id.length > 24 || !/^[a-z0-9_-]+$/.test(o.id)) return null;
      return { t: 'class', id: o.id };
    default:
      return null;
  }
}

// ---- Server -> client ----
export interface PlayerSnap {
  id: number; name: string; x: number; y: number; a: number;
  hp: number; mhp: number; r: number; lv: number; cls: number; prot: 0 | 1;
}
export interface SelfSnap {
  alive: boolean; hp: number; mhp: number; lv: number;
  xp: number; xpCur: number; xpNext: number; pts: number;
  stats: number[]; cls: string; opts: string[];
}
export interface Snapshot {
  t: 's';
  tick: number;
  me: SelfSnap;
  p: PlayerSnap[];
  b: [number, number, number, number, number][]; // id, x, y, r, ownerId
  sh: [number, number, number, number, number, number][]; // id, x, y, rot, kind, hpFrac
}
export type ServerMessage =
  | { t: 'welcome'; id: number; arena: number; hz: number }
  | Snapshot
  | { t: 'lb'; top: { id: number; name: string; score: number; lv: number }[] }
  | { t: 'dead'; score: number; level: number; killer: string }
  | { t: 'err'; msg: string };
