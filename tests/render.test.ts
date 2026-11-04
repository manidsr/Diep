import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawFrame, type View } from '../src/client/render';

function mockCanvasContext() {
  let saveDepth = 0;
  const target: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(target, {
    get(object, property) {
      if (property === 'save') return () => { saveDepth++; };
      if (property === 'restore') return () => { saveDepth--; };
      const value = Reflect.get(object, property);
      return value === undefined ? () => {} : value;
    },
    set(object, property, value) {
      return Reflect.set(object, property, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, saveDepth: () => saveDepth };
}

test('rendering two players keeps the arena camera transform intact for both tanks', () => {
  const { ctx, saveDepth } = mockCanvasContext();
  const player = (id: number, name: string, x: number) => ({
    id, name, x, y: 1100, a: 0, hp: 100, mhp: 100, r: 26,
    lv: 1, cls: 0, prot: 0 as const, vis: 1, team: null,
  });
  const view: View = {
    players: [player(1, 'host', 1000), player(2, 'guest', 1200)],
    bullets: [], shapes: [], zombies: [], downed: [], healthDrops: [], mode: 'survival',
  };

  drawFrame(ctx, 800, 600, { x: 1000, y: 1100 }, view, 2);

  assert.equal(saveDepth(), 0, 'every tank must restore only its own canvas state, not pop the camera transform');
});
