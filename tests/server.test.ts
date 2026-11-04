import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../src/server/server';
import { Game } from '../src/server/game';
import type { ServerMessage } from '../src/shared/protocol';
import { seeded } from './helpers';

function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs: ServerMessage[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const opened = new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
  const waitFor = async (pred: (m: ServerMessage) => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const m = msgs.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 20)); }
    throw new Error('timeout waiting for message');
  };
  return { ws, msgs, opened, waitFor };
}

test('developer cheats are granted only to the first player when explicitly enabled', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(8), 0), devCheats: true });
  try {
    const host = client(srv.port), guest = client(srv.port);
    await Promise.all([host.opened, guest.opened]);
    host.ws.send(JSON.stringify({ t: 'join', name: 'Host' }));
    const hostWelcome = await host.waitFor((m) => m.t === 'welcome');
    guest.ws.send(JSON.stringify({ t: 'join', name: 'Guest' }));
    const guestWelcome = await guest.waitFor((m) => m.t === 'welcome');
    assert.ok(hostWelcome.t === 'welcome' && hostWelcome.devCheats);
    assert.ok(guestWelcome.t === 'welcome' && !guestWelcome.devCheats);

    guest.ws.send(JSON.stringify({ t: 'devClass', id: 'octo' }));
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(srv.game.players.get(guestWelcome.id)?.cls, 'basic', 'guest cannot use developer class override');

    host.ws.send(JSON.stringify({ t: 'devClass', id: 'octo' }));
    await host.waitFor((m) => m.t === 's' && m.me.cls === 'octo');
    assert.equal(srv.game.players.get(hostWelcome.id)?.cls, 'octo');
    host.ws.close(); guest.ws.close();
  } finally {
    await srv.close();
  }
});
test('LAN server: join, snapshots, input, validation, disconnect cleanup', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(5), 10) });
  try {
    const info = await (await fetch(`http://127.0.0.1:${srv.port}/api/info`)).json() as { port: number };
    assert.equal(info.port, srv.port);
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/nope`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/`, { method: 'POST' })).status, 405);

    const a = client(srv.port), b = client(srv.port);
    await Promise.all([a.opened, b.opened]);
    a.ws.send('garbage'); a.ws.send('{"t":"input","mx":9,"my":9,"a":0,"f":1}'); // ignored before join
    a.ws.send(JSON.stringify({ t: 'join', name: 'Alice' }));
    b.ws.send(JSON.stringify({ t: 'join', name: 'Bob' }));
    const wa = await a.waitFor((m) => m.t === 'welcome');
    await b.waitFor((m) => m.t === 'welcome');
    assert.equal(srv.game.players.size, 2);

    a.ws.send(JSON.stringify({ t: 'input', mx: 1, my: 0, a: 0, f: false }));
    const first = await a.waitFor((m) => m.t === 's');
    assert.ok(first.t === 's' && first.me.alive && first.p.some((p) => p.name === 'Alice'));
    await a.waitFor((m) => m.t === 's' && m.p.find((p) => p.name === 'Alice')!.x > (first as any).p.find((p: any) => p.name === 'Alice').x + 1);
    await a.waitFor((m) => m.t === 'lb');
    assert.ok(wa.t === 'welcome');

    // flooding with junk must not crash the server or disconnect-kill valid state
    for (let i = 0; i < 300; i++) b.ws.send('{"t":"upgrade","stat":99}');
    await new Promise((r) => setTimeout(r, 100));

    a.ws.close(); b.ws.close();
    const end = Date.now() + 2000;
    while (srv.game.players.size > 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    assert.equal(srv.game.players.size, 0);
  } finally {
    await srv.close();
  }
});
