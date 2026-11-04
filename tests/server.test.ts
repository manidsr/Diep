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


test('a full 24-player room rejects the next join without allocating a player', async () => {
  const game = new Game(seeded(24), 0);
  const srv = await startServer({ port: 0, host: '127.0.0.1', game });
  const clients = Array.from({ length: 25 }, () => client(srv.port));
  try {
    await Promise.all(clients.map((c) => c.opened));
    for (let i = 0; i < 24; i++) clients[i].ws.send(JSON.stringify({ t: 'join', name: `Tank${i}` }));
    await Promise.all(clients.slice(0, 24).map((c) => c.waitFor((m) => m.t === 'welcome')));
    clients[24].ws.send(JSON.stringify({ t: 'join', name: 'Extra' }));
    const rejected = await clients[24].waitFor((m) => m.t === 'err');
    assert.equal(rejected.t, 'err');
    assert.equal(rejected.msg, 'Room is full');
    assert.equal(game.players.size, 24);
    assert.equal(clients[24].msgs.some((m) => m.t === 'welcome'), false);
  } finally {
    for (const c of clients) c.ws.close();
    await srv.close();
  }
});


test('eliminations broadcast a kill-feed line and send a detailed death report', async () => {
  const game = new Game(seeded(19), 0);
  const srv = await startServer({ port: 0, host: '127.0.0.1', game });
  const attacker = client(srv.port);
  const victim = client(srv.port);
  try {
    await Promise.all([attacker.opened, victim.opened]);
    attacker.ws.send(JSON.stringify({ t: 'join', name: 'Hunter' }));
    victim.ws.send(JSON.stringify({ t: 'join', name: 'Target' }));
    const attackerWelcome = await attacker.waitFor((m) => m.t === 'welcome');
    const victimWelcome = await victim.waitFor((m) => m.t === 'welcome');
    assert.ok(attackerWelcome.t === 'welcome' && victimWelcome.t === 'welcome');

    // Give the server clock a measurable amount of time before triggering the
    // elimination so the one-decimal lifetime field is non-zero deterministically.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const a = game.players.get(attackerWelcome.id)!;
    const v = game.players.get(victimWelcome.id)!;
    Object.assign(a, { x: 1000, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0 });
    Object.assign(v, { x: 1080, y: 1000, vx: 0, vy: 0, kvx: 0, kvy: 0, rvx: 0, rvy: 0, protT: 0, hp: 5 });
    attacker.ws.send(JSON.stringify({ t: 'input', mx: 0, my: 0, a: 0, f: true }));

    const [death, attackerFeed, victimFeed] = await Promise.all([
      victim.waitFor((m) => m.t === 'dead', 4000),
      attacker.waitFor((m) => m.t === 'feed', 4000),
      victim.waitFor((m) => m.t === 'feed', 4000),
    ]);
    assert.ok(death.t === 'dead');
    assert.equal(death.killer, 'Hunter');
    assert.equal(death.killerClass, 'basic');
    assert.equal(death.victimClass, 'basic');
    assert.ok(death.damageTaken >= 5);
    assert.ok(death.lifetime > 0);
    assert.ok(death.damageDealt >= 0 && death.kills >= 0);

    for (const feed of [attackerFeed, victimFeed]) {
      assert.ok(feed.t === 'feed');
      assert.equal(feed.killer, 'Hunter');
      assert.equal(feed.victim, 'Target');
      assert.equal(feed.killerClass, 'basic');
      assert.equal(feed.victimClass, 'basic');
    }
  } finally {
    attacker.ws.close();
    victim.ws.close();
    await srv.close();
  }
});


test('clients join isolated FFA and Team Mode worlds selected in the lobby', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(40), 0) });
  const solo = client(srv.port);
  const blue = client(srv.port);
  const red = client(srv.port);
  try {
    await Promise.all([solo.opened, blue.opened, red.opened]);
    solo.ws.send(JSON.stringify({ t: 'join', name: 'Solo', mode: 'ffa' }));
    blue.ws.send(JSON.stringify({ t: 'join', name: 'Blue', mode: 'teams' }));
    red.ws.send(JSON.stringify({ t: 'join', name: 'Red', mode: 'teams' }));

    const [soloWelcome, blueWelcome, redWelcome] = await Promise.all([
      solo.waitFor((m) => m.t === 'welcome'),
      blue.waitFor((m) => m.t === 'welcome'),
      red.waitFor((m) => m.t === 'welcome'),
    ]);
    assert.ok(soloWelcome.t === 'welcome' && soloWelcome.mode === 'ffa');
    assert.ok(blueWelcome.t === 'welcome' && blueWelcome.mode === 'teams');
    assert.ok(redWelcome.t === 'welcome' && redWelcome.mode === 'teams');
    assert.equal(srv.game.players.size, 1);
    assert.equal(srv.teamGame.players.size, 2);
    assert.equal(srv.teamGame.players.get(blueWelcome.id)?.team, 'blue');
    assert.equal(srv.teamGame.players.get(redWelcome.id)?.team, 'red');

    const teamSnap = await blue.waitFor((m) => m.t === 's');
    assert.ok(teamSnap.t === 's' && teamSnap.me.team === 'blue');
    assert.equal(teamSnap.flags.length, 2);
    const teamBoard = await blue.waitFor((m) => m.t === 'lb' && m.mode === 'teams', 2500);
    assert.ok(teamBoard.t === 'lb' && teamBoard.mode === 'teams');
  } finally {
    solo.ws.close();
    blue.ws.close();
    red.ws.close();
    await srv.close();
  }
});
