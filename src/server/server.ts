import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { ARENA_SIZE, SERVER_TICK_HZ } from '../shared/config';
import { MAX_MESSAGE_BYTES, parseClientMessage, type ServerMessage } from '../shared/protocol';
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

interface Conn { ws: WebSocket; playerId: number | null; count: number; windowStart: number; alive: boolean }

export interface RunningServer {
  http: Server; game: Game; port: number; close(): Promise<void>;
}

export async function startServer(opts: { port?: number; host?: string; game?: Game } = {}): Promise<RunningServer> {
  const host = opts.host ?? '0.0.0.0';
  const game = opts.game ?? new Game();
  const conns = new Set<Conn>();
  let port = opts.port ?? 3000;

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const headers = { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers).end(); return; }
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/api/info') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ addresses: lanAddresses(), port, players: game.players.size }));
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

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
  const send = (ws: WebSocket, m: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  wss.on('connection', (ws) => {
    const c: Conn = { ws, playerId: null, count: 0, windowStart: Date.now(), alive: true };
    conns.add(c);
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
      const p = c.playerId != null ? game.players.get(c.playerId) : undefined;
      switch (m.t) {
        case 'join':
          if (!p) {
            const np = game.addPlayer(m.name);
            if (!np) { send(ws, { t: 'err', msg: 'Room is full' }); return; }
            c.playerId = np.id;
            send(ws, { t: 'welcome', id: np.id, arena: ARENA_SIZE, hz: SERVER_TICK_HZ });
          } else if (!p.alive) {
            game.respawn(p.id, m.name);
          }
          break;
        case 'input': if (p) game.setInput(p.id, m); break;
        case 'upgrade': if (p) game.upgradeStat(p.id, m.stat); break;
        case 'class': if (p) game.chooseClass(p.id, m.id); break;
      }
    });
    ws.on('close', () => {
      conns.delete(c);
      if (c.playerId != null) game.removePlayer(c.playerId);
    });
    ws.on('error', () => ws.terminate());
  });

  // Fixed-timestep loop with accumulator.
  const dt = 1 / SERVER_TICK_HZ;
  let last = performance.now(), acc = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    acc = Math.min(acc + (now - last) / 1000, 0.25);
    last = now;
    let stepped = false;
    while (acc >= dt) { game.step(dt); acc -= dt; stepped = true; }
    if (!stepped) return;
    for (const ev of game.drainEvents()) {
      for (const c of conns) if (c.playerId === ev.id) send(c.ws, { t: 'dead', score: ev.score, level: ev.level, killer: ev.killer });
    }
    const lb = game.tick % SERVER_TICK_HZ === 0 ? game.leaderboard() : null;
    for (const c of conns) {
      if (c.playerId == null) continue;
      const snap = game.snapshotFor(c.playerId);
      if (snap) send(c.ws, snap);
      if (lb) send(c.ws, { t: 'lb', top: lb });
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
    http, game, port,
    close: () => new Promise<void>((resolve) => {
      clearInterval(loop); clearInterval(ping);
      for (const c of conns) c.ws.terminate();
      wss.close(() => http.close(() => resolve()));
    }),
  };
}
