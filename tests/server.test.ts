import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../src/server/server';
import { Game } from '../src/server/game';
import type { ServerMessage } from '../src/shared/protocol';
import { seeded } from './helpers';
import { totalXpForLevel } from '../src/shared/progression';

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
  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(5), 10), reconnectGraceMs: 100 });
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
    assert.ok(teamSnap.t === 's' && teamSnap.mode === 'teams' && teamSnap.me.team === 'blue');
    const teamBoard = await blue.waitFor((m) => m.t === 'lb' && m.mode === 'teams', 2500);
    assert.ok(teamBoard.t === 'lb' && teamBoard.mode === 'teams');
    assert.equal(teamBoard.blue.length, 1);
    assert.equal(teamBoard.red.length, 1);
  } finally {
    solo.ws.close();
    blue.ws.close();
    red.ws.close();
    await srv.close();
  }
});


test('clients can join the separate Co-op Survival world and receive wave status', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(41), 0) });
  const survivor = client(srv.port);
  try {
    await survivor.opened;
    survivor.ws.send(JSON.stringify({ t: 'join', name: 'Survivor', mode: 'survival' }));
    const welcome = await survivor.waitFor((m) => m.t === 'welcome');
    assert.ok(welcome.t === 'welcome' && welcome.mode === 'survival');
    assert.equal(srv.survivalGame.mode, 'survival');
    assert.equal(srv.survivalGame.players.size, 1);
    assert.equal(srv.survivalGame.wave, 1);

    const snapshot = await survivor.waitFor((m) => m.t === 's');
    assert.ok(snapshot.t === 's' && snapshot.mode === 'survival');
    assert.equal(snapshot.me.team, null);
    const board = await survivor.waitFor((m) => m.t === 'lb' && m.mode === 'survival', 2500);
    assert.ok(board.t === 'lb' && board.mode === 'survival');
    assert.equal(board.wave, 1);
    assert.ok(board.zombiesRemaining > 0);
  } finally {
    survivor.ws.close();
    await srv.close();
  }
});

test('a Survival restart request respawns the connected squad and acknowledges every client', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', game: new Game(seeded(80), 0) });
  const first = client(srv.port), second = client(srv.port);
  try {
    await Promise.all([first.opened, second.opened]);
    first.ws.send(JSON.stringify({ t: 'join', name: 'First', mode: 'survival' }));
    second.ws.send(JSON.stringify({ t: 'join', name: 'Second', mode: 'survival' }));
    const [firstWelcome, secondWelcome] = await Promise.all([
      first.waitFor((m) => m.t === 'welcome'), second.waitFor((m) => m.t === 'welcome'),
    ]);
    assert.ok(firstWelcome.t === 'welcome' && secondWelcome.t === 'welcome');
    const firstPlayer = srv.survivalGame.players.get(firstWelcome.id)!;
    const secondPlayer = srv.survivalGame.players.get(secondWelcome.id)!;
    firstPlayer.downed = true; firstPlayer.hp = 0;
    secondPlayer.downed = true; secondPlayer.hp = 0;
    srv.survivalGame.survivalGameOver = true;
    await Promise.all([
      first.waitFor((m) => m.t === 'lb' && m.mode === 'survival' && m.gameOver, 3000),
      second.waitFor((m) => m.t === 'lb' && m.mode === 'survival' && m.gameOver, 3000),
    ]);
    const firstWelcomeCount = first.msgs.filter((m) => m.t === 'welcome').length;
    const secondWelcomeCount = second.msgs.filter((m) => m.t === 'welcome').length;
    first.ws.send(JSON.stringify({ t: 'restart' }));
    const waitForWelcomeCount = async (c: ReturnType<typeof client>, count: number) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (c.msgs.filter((m) => m.t === 'welcome').length > count) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('timeout waiting for restart acknowledgement');
    };
    await Promise.all([
      waitForWelcomeCount(first, firstWelcomeCount), waitForWelcomeCount(second, secondWelcomeCount),
    ]);
    assert.equal(srv.survivalGame.survivalGameOver, false);
    assert.equal(srv.survivalGame.wave, 1);
    assert.ok(firstPlayer.alive && !firstPlayer.downed);
    assert.ok(secondPlayer.alive && !secondPlayer.downed);
    assert.equal(firstPlayer.level, 1);
    assert.equal(secondPlayer.level, 1);
  } finally {
    first.ws.close(); second.ws.close();
    await srv.close();
  }
});

test('reconnecting restores the same player, class and progression during the grace period', async () => {
  const game = new Game(seeded(81), 0);
  const srv = await startServer({ port: 0, host: '127.0.0.1', game, reconnectGraceMs: 1400 });
  let first: ReturnType<typeof client> | null = null;
  let resumed: ReturnType<typeof client> | null = null;
  let stale: ReturnType<typeof client> | null = null;
  try {
    first = client(srv.port);
    await first.opened;
    first.ws.send(JSON.stringify({ t: 'join', name: 'ReturningTank', mode: 'ffa' }));
    const welcome = await first.waitFor((m) => m.t === 'welcome');
    assert.ok(welcome.t === 'welcome');
    if (welcome.t !== 'welcome') throw new Error('Missing welcome');
    assert.match(welcome.resumeToken, /^[0-9a-f-]{36}$/i);

    const original = game.players.get(welcome.id)!;
    game.addXp(original, totalXpForLevel(15));
    assert.equal(game.chooseClass(original.id, 'sniper'), true);
    assert.ok(original.d.bulletSpeed > 520, 'sniper specialty is applied to the saved player');
    original.x = 1234; original.y = 987;
    const saved = { xp: original.xp, level: original.level, cls: original.cls, derived: { ...original.d }, x: original.x, y: original.y };

    first.ws.close();
    const suspendedAt = Date.now() + 1000;
    while (original.connected && Date.now() < suspendedAt) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(original.connected, false);
    assert.equal(game.players.size, 1);
    const frozen = { x: original.x, y: original.y, hp: original.hp };
    game.setInput(original.id, { mx: 1, my: 0, a: 0, f: true });
    game.step(1 / 30);
    assert.deepEqual({ x: original.x, y: original.y, hp: original.hp }, frozen, 'suspended tanks must be frozen and invulnerable');
    assert.equal(original.input.f, false, 'stale input must not resume after reconnect');

    resumed = client(srv.port);
    await resumed.opened;
    resumed.ws.send(JSON.stringify({ t: 'join', name: 'ReturningTank', mode: 'ffa', resumeToken: welcome.resumeToken }));
    const welcomeAgain = await resumed.waitFor((m) => m.t === 'welcome');
    assert.ok(welcomeAgain.t === 'welcome');
    if (welcomeAgain.t !== 'welcome') throw new Error('Missing resumed welcome');
    assert.equal(welcomeAgain.id, welcome.id);
    assert.equal(welcomeAgain.resumeToken, welcome.resumeToken);
    assert.equal(game.players.get(welcome.id), original);
    assert.equal(original.connected, true);
    assert.deepEqual(
      { xp: original.xp, level: original.level, cls: original.cls, derived: { ...original.d }, x: original.x, y: original.y },
      saved,
    );

    resumed.ws.close();
    const expiryAt = Date.now() + 2500;
    while (game.players.has(welcome.id) && Date.now() < expiryAt) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(game.players.has(welcome.id), false, 'expired disconnected sessions are removed');
    stale = client(srv.port);
    await stale.opened;
    stale.ws.send(JSON.stringify({ t: 'join', name: 'ReturningTank', resumeToken: welcome.resumeToken }));
    const rejected = await stale.waitFor((m) => m.t === 'err');
    assert.ok(rejected.t === 'err' && rejected.msg.includes('expired'));
  } finally {
    first?.ws.close();
    resumed?.ws.close();
    stale?.ws.close();
    await srv.close();
  }
});


test('a resume token can take over a half-open socket without creating a duplicate player', async () => {
  const game = new Game(seeded(82), 0);
  const srv = await startServer({ port: 0, host: '127.0.0.1', game, reconnectGraceMs: 1000 });
  const first = client(srv.port);
  let replacement: ReturnType<typeof client> | null = null;
  try {
    await first.opened;
    first.ws.send(JSON.stringify({ t: 'join', name: 'MobileTank', mode: 'ffa' }));
    const welcome = await first.waitFor((m) => m.t === 'welcome');
    assert.ok(welcome.t === 'welcome');
    if (welcome.t !== 'welcome') throw new Error('Missing initial welcome');
    const original = game.players.get(welcome.id)!;
    const oldSocketClosed = new Promise<void>((resolve) => first.ws.once('close', () => resolve()));

    replacement = client(srv.port);
    await replacement.opened;
    replacement.ws.send(JSON.stringify({ t: 'join', name: 'MobileTank', resumeToken: welcome.resumeToken }));
    const resumed = await replacement.waitFor((m) => m.t === 'welcome');
    assert.ok(resumed.t === 'welcome');
    if (resumed.t !== 'welcome') throw new Error('Missing takeover welcome');
    await oldSocketClosed;

    assert.equal(resumed.id, welcome.id);
    assert.equal(game.players.size, 1);
    assert.equal(game.players.get(welcome.id), original);
    assert.equal(original.connected, true, 'closing the replaced socket must not suspend the new owner');
  } finally {
    first.ws.close();
    replacement?.ws.close();
    await srv.close();
  }
});
