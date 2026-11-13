import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawFrame, drawSticks, type View } from '../src/client/render';
import type { Input } from '../src/client/input';

function mockCanvasContext() {
  let saveDepth = 0;
  const rotations: number[] = [];
  let fillRectCount = 0;
  const target: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(target, {
    get(object, property) {
      if (property === 'save') return () => { saveDepth++; };
      if (property === 'restore') return () => { saveDepth--; };
      if (property === 'rotate') return (angle: number) => { rotations.push(angle); };
      if (property === 'fillRect') return () => { fillRectCount++; };
      const value = Reflect.get(object, property);
      return value === undefined ? () => {} : value;
    },
    set(object, property, value) {
      return Reflect.set(object, property, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, saveDepth: () => saveDepth, rotations, fillRectCount: () => fillRectCount };
}

test('rendering two players keeps the arena camera transform intact for both tanks', () => {
  const { ctx, saveDepth } = mockCanvasContext();
  const player = (id: number, name: string, x: number) => ({
    id, name, x, y: 1100, a: 0, hp: 100, mhp: 100, r: 26,
    lv: 1, cls: 0, prot: 0 as const, vis: 1, team: null,
  });
  const view: View = {
    players: [player(1, 'host', 1000), player(2, 'guest', 1200)],
    bullets: [], shapes: [], zombies: [], downed: [], healthDrops: [],
    xpDrops: [{ id: 3, x: 1040, y: 1100, r: 8, xp: 25 }], pools: [{ id: 4, x: 1080, y: 1100, r: 90, life: 3 }], mode: 'survival',
  };

  drawFrame(ctx, 800, 600, { x: 1000, y: 1100 }, view, 2);

  assert.equal(saveDepth(), 0, 'every tank must restore only its own canvas state, not pop the camera transform');
});

test('touch control hints keep canvas drawing state isolated', () => {
  const { ctx, saveDepth } = mockCanvasContext();
  const idle = { touchSeen: true, moveStick: null, aimStick: null } as unknown as Input;
  const active = {
    touchSeen: true,
    moveStick: { id: 1, ox: 70, oy: 760, x: 95, y: 744 },
    aimStick: { id: 2, ox: 320, oy: 760, x: 300, y: 740 },
  } as unknown as Input;

  drawSticks(ctx, 390, 844, idle);
  drawSticks(ctx, 390, 844, active);

  assert.equal(saveDepth(), 0, 'touch controls must not leak canvas drawing state into the next frame');
});


test('tank barrels preserve continuous aim angles instead of snapping to fixed directions', () => {
  const { ctx, rotations } = mockCanvasContext();
  const aimAngle = 0.123456789;
  const player = {
    id: 1, name: 'pilot', x: 1000, y: 1100, a: aimAngle,
    hp: 100, mhp: 100, r: 26, lv: 1, cls: 0, prot: 0 as const, vis: 1, team: null,
  };
  const view: View = {
    players: [player], bullets: [], shapes: [], zombies: [], downed: [],
    healthDrops: [], xpDrops: [], pools: [], mode: 'ffa',
  };

  drawFrame(ctx, 800, 600, { x: player.x, y: player.y }, view, player.id);

  assert.ok(
    rotations.some((angle) => Math.abs(angle - aimAngle) < 1e-12),
    'barrel transform should receive the full continuous aim angle',
  );
});


test('one sustained hit flash produces one particle burst, not a second burst after the cooldown', async () => {
  const { ctx, fillRectCount } = mockCanvasContext();
  const target: View['zombies'][number] = {
    id: 654321, x: 1000, y: 1100, r: 24, hp: 90, mhp: 100, visibility: 1,
    angle: 0, hitFlash: 1, hitAngle: 0.35, kind: 'shambler', protected: false,
    bossKind: null, bossPhase: 'idle', bossTimer: 0,
    specialPhase: 'idle', specialTimer: 0,
  };
  const view: View = {
    players: [], bullets: [], shapes: [], zombies: [target], downed: [],
    healthDrops: [], xpDrops: [], pools: [], mode: 'survival',
  };

  drawFrame(ctx, 800, 600, { x: target.x, y: target.y }, view, 0);
  const firstFrameRects = fillRectCount();
  await new Promise((resolve) => setTimeout(resolve, 130));
  drawFrame(ctx, 800, 600, { x: target.x, y: target.y }, view, 0);
  const secondFrameRects = fillRectCount() - firstFrameRects;

  assert.ok(
    secondFrameRects <= firstFrameRects,
    'a hit flash that never rises again must not emit another batch of impact particles',
  );
});
