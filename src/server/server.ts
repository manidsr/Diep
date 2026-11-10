import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { ARENA_SIZE, SERVER_TICK_HZ } from '../shared/config';
import { MAX_MESSAGE_BYTES, parseClientMessage, type GameMode, type ServerMessage } from '../shared/protocol';
import { Game } from './game';
import { lanAddresses } from './net';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'public');
const STATIC: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
};
const MAX_MSGS_PER_SEC = 90;
const KILL_MSGS_PER_SEC = 600;

interface Conn {
  ws: WebSocket; playerId: number | null; game: Game | null; mode: GameMode | null;
  count: number; windowStart: number; alive: boolean; sessionToken: string | null;
}
interface ResumeSession {
  game: Game; playerId: number; owner: Conn | null; expiresAt: number;
}

export interface RunningServer {
  http: Server; game: Game; teamGame: Game; survivalGame: Game; port: number; close(): Promise<void>;
}

export async function startServer(opts: { port?: number; host?: string; game?: Game; teamGame?: Game; survivalGame?: Game; devCheats?: boolean; reconnectGraceMs?: number } = {}): Promise<RunningServer> {
  const host = opts.host ?? '0.0.0.0';
  const game = opts.game ?? new Game();
  const teamGame = opts.teamGame ?? new Game(undefined, undefined, 'teams');
  const survivalGame = opts.survivalGame ?? new Game(undefined, 0, 'survival');
  if (teamGame.mode !== 'teams') throw new Error('teamGame must use Team Mode');
  if (survivalGame.mode !== 'survival') throw new Error('survivalGame must use Co-op Survival');
  const conns = new Set<Conn>();
  const resumeSessions = new Map<string, ResumeSession>();
  const reconnectGraceMs = Math.max(0, Math.floor(opts.reconnectGraceMs ?? 45_000));
  const devCheatsEnabled = opts.devCheats ?? (process.env.DIEP_DEV_CHEATS === '1');
  let devCheatOwnerSession: string | null = null;
  let port = opts.port ?? 3000;

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const headers = { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers).end(); return; }
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/api/info') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        addresses: lanAddresses(), port,
        players: game.players.size + teamGame.players.size + survivalGame.players.size,
        ffaPlayers: game.players.size, teamPlayers: teamGame.players.size, survivalPlayers: survivalGame.players.size,
      }));
      return;
    }
    const entry = STATIC[path];
    if (!entry) { res.writeHead(404, headers).end('Not found'); return; }
    try {
      const body = await readFile(join(PUBLIC_DIR, entry[0]));
      res.writeHead(200, { ...headers, 'Content-Type': entry[1] }).end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(503, headers).end('Client not built. Run: npm run build');
    }
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const send = (ws: WebSocket, m: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  wss.on('connection', (ws) => {
    const c: Conn = { ws, playerId: null, game: null, mode: null, count: 0, windowStart: Date.now(), alive: true, sessionToken: null };
    conns.add(c);
    // Small real-time game packets should not wait for Nagle coalescing.
    (ws as WebSocket & { _socket?: import('node:net').Socket })._socket?.setNoDelay(true);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const now = Date.now();
      if (now - c.windowStart >= 1000) { c.windowStart = now; c.count = 0; }
      c.count++;
      if (c.count > KILL_MSGS_PER_SEC) { ws.terminate(); return; }
      if (c.count > MAX_MSGS_PER_SEC) return;
      const m = parseClientMessage(data.toString());
      if (!m) return;
      const activeGame = c.game;
      const p = activeGame && c.playerId != null ? activeGame.players.get(c.playerId) : undefined;
      switch (m.t) {
        case 'join':
          if (!activeGame) {
            if (m.resumeToken) {
              const session = resumeSessions.get(m.resumeToken);
              if (!session || (!session.owner && session.expiresAt <= Date.now())) {
                if (session && !session.owner) {
                  session.game.removePlayer(session.playerId);
                  resumeSessions.delete(m.resumeToken);
                  if (devCheatOwnerSession === m.resumeToken) devCheatOwnerSession = null;
                }
                send(ws, { t: 'err', msg: 'Reconnect session expired. Joining a new tank is available.' });
                return;
              }
              const resumedPlayer = session.game.players.get(session.playerId);
              if (!resumedPlayer) {
                resumeSessions.delete(m.resumeToken);
                send(ws, { t: 'err', msg: 'Reconnect session is no longer available.' });
                return;
              }
              if (session.owner && session.owner !== c) {
                const previous = session.owner;
                previous.playerId = null; previous.game = null; previous.mode = null; previous.sessionToken = null;
                previous.ws.terminate();
              }
              session.owner = c;
              session.expiresAt = 0;
              c.playerId = session.playerId;
              c.game = session.game;
              c.mode = session.game.mode;
              c.sessionToken = m.resumeToken;
              session.game.resumePlayer(session.playerId);
              if (!resumedPlayer.alive) session.game.respawn(session.playerId);
              send(ws, {
                t: 'welcome', id: session.playerId, arena: ARENA_SIZE, hz: SERVER_TICK_HZ,
                devCheats: devCheatsEnabled && devCheatOwnerSession === m.resumeToken,
                mode: session.game.mode, resumeToken: m.resumeToken,
              });
              return;
            }

            const mode: GameMode = m.mode ?? 'ffa';
            const selectedGame = mode === 'teams' ? teamGame : mode === 'survival' ? survivalGame : game;
            const np = selectedGame.addPlayer(m.name);
            if (!np) { send(ws, { t: 'err', msg: 'Room is full' }); return; }
            const sessionToken = randomUUID();
            c.playerId = np.id;
            c.game = selectedGame;
            c.mode = mode;
            c.sessionToken = sessionToken;
            resumeSessions.set(sessionToken, { game: selectedGame, playerId: np.id, owner: c, expiresAt: 0 });
            if (devCheatsEnabled && devCheatOwnerSession == null) devCheatOwnerSession = sessionToken;
            send(ws, {
              t: 'welcome', id: np.id, arena: ARENA_SIZE, hz: SERVER_TICK_HZ,
              devCheats: devCheatsEnabled && devCheatOwnerSession === sessionToken, mode, resumeToken: sessionToken,
            });
          } else if (p && !p.alive) {
            activeGame.respawn(p.id, m.name);
            send(ws, {
              t: 'welcome', id: p.id, arena: ARENA_SIZE, hz: SERVER_TICK_HZ,
              devCheats: devCheatsEnabled && devCheatOwnerSession === c.sessionToken,
              mode: c.mode ?? 'ffa', resumeToken: c.sessionToken ?? '',
            });
          }
          break;
        case 'restart': {
          if (p && activeGame?.mode === 'survival' && activeGame.restartSurvivalRun()) {
            for (const target of conns) {
              if (target.game !== activeGame || target.playerId == null) continue;
              send(target.ws, {
                t: 'welcome', id: target.playerId, arena: ARENA_SIZE, hz: SERVER_TICK_HZ,
                devCheats: devCheatsEnabled && devCheatOwnerSession === target.sessionToken,
                mode: 'survival', resumeToken: target.sessionToken ?? '',
              });
            }
          }
          break;
        }
        case 'input': if (p) activeGame?.setInput(p.id, m); break;
        case 'reward': if (p) activeGame?.chooseSurvivalReward(p.id, m.id); break;
        case 'class': if (p) activeGame?.chooseClass(p.id, m.id); break;
        case 'devClass':
          if (p && devCheatsEnabled && devCheatOwnerSession === c.sessionToken) activeGame?.debugSetClass(p.id, m.id);
          break;
      }
    });
    ws.on('close', () => {
      conns.delete(c);
      if (c.playerId == null || !c.game) return;
      const session = c.sessionToken ? resumeSessions.get(c.sessionToken) : undefined;
      if (session?.owner === c) {
        session.owner = null;
        session.expiresAt = Date.now() + reconnectGraceMs;
        c.game.suspendPlayer(c.playerId);
      } else if (!session) {
        c.game.removePlayer(c.playerId);
      }
    });
    ws.on('error', () => ws.terminate());
  });

  // Both game worlds share one fixed timestep but never share players or combat state.
  const dt = 1 / SERVER_TICK_HZ;
  let last = performance.now(), acc = 0;
  let nextSessionSweep = Date.now() + 250;
  const loop = setInterval(() => {
    const wallNow = Date.now();
    if (wallNow >= nextSessionSweep) {
      nextSessionSweep = wallNow + 250;
      for (const [token, session] of resumeSessions) {
        if (session.owner || session.expiresAt > wallNow) continue;
        session.game.removePlayer(session.playerId);
        resumeSessions.delete(token);
        if (devCheatOwnerSession === token) devCheatOwnerSession = null;
      }
    }
    const now = performance.now();
    acc = Math.min(acc + (now - last) / 1000, 0.25);
    last = now;
    let stepped = false;
    while (acc >= dt) {
      game.step(dt);
      teamGame.step(dt);
      survivalGame.step(dt);
      acc -= dt;
      stepped = true;
    }
    if (!stepped) return;

    for (const world of [game, teamGame, survivalGame]) {
      for (const ev of world.drainEvents()) {
        if (ev.type === 'dead') {
          const feed = {
            t: 'feed' as const,
            killer: ev.killer,
            victim: ev.victim,
            killerClass: ev.killerClass,
            victimClass: ev.victimClass,
            killerTeam: ev.killerTeam,
            victimTeam: ev.victimTeam,
          };
          for (const c of conns) if (c.game === world) send(c.ws, feed);
          for (const c of conns) {
            if (c.game === world && c.playerId === ev.id) {
              send(c.ws, {
                t: 'dead', score: ev.score, level: ev.level, killer: ev.killer,
                killerClass: ev.killerClass, victimClass: ev.victimClass,
                kills: ev.kills, damageDealt: ev.damageDealt,
                damageTaken: ev.damageTaken, lifetime: ev.lifetime,
              });
            }
          }
        }
      }

      const leaderboard = world.tick % SERVER_TICK_HZ === 0
        ? (world.mode === 'teams'
          ? { t: 'lb' as const, mode: 'teams' as const, ...world.teamLeaderboard() }
          : world.mode === 'survival'
            ? { t: 'lb' as const, mode: 'survival' as const, ...world.survivalLeaderboard() }
            : { t: 'lb' as const, mode: 'ffa' as const, top: world.leaderboard() })
        : null;
      for (const c of conns) {
        if (c.game !== world || c.playerId == null) continue;
        const snap = world.snapshotFor(c.playerId);
        if (snap) send(c.ws, snap);
        if (leaderboard) send(c.ws, leaderboard);
      }
    }
  }, 1000 / SERVER_TICK_HZ / 2);

  const ping = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 15000);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, resolve);
  });
  const addr = http.address();
  if (addr && typeof addr === 'object') port = addr.port;

  return {
    http, game, teamGame, survivalGame, port,
    close: () => new Promise<void>((resolve) => {
      clearInterval(loop); clearInterval(ping);
      for (const c of conns) c.ws.terminate();
      wss.close(() => http.close(() => resolve()));
    }),
  };
}
