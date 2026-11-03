import { ARENA_SIZE, CLASSES, PLAYER_BASE_RADIUS, SHAPES, SHAPE_KINDS } from '../shared/config';
import type { PlayerSnap } from '../shared/protocol';
import { STICK_RADIUS, type Input } from './input';

export interface View {
  players: PlayerSnap[];
  bullets: [number, number, number, number, number][];
  shapes: [number, number, number, number, number, number][];
}

const ME = { fill: '#00b2e1', stroke: '#0083a8' };
const FOE = { fill: '#f14e54', stroke: '#b43a3f' };

export function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, cam: { x: number; y: number }, view: View, selfId: number) {
  const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000);
  ctx.fillStyle = '#b4b4b8';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = '#cdcdd2';
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  // grid (visible range only)
  const x0 = Math.max(0, Math.floor((cam.x - W / 2 / scale) / 50) * 50), x1 = Math.min(ARENA_SIZE, cam.x + W / 2 / scale);
  const y0 = Math.max(0, Math.floor((cam.y - H / 2 / scale) / 50) * 50), y1 = Math.min(ARENA_SIZE, cam.y + H / 2 / scale);
  ctx.strokeStyle = '#c1c1c7';
  ctx.lineWidth = 1 / scale + 0.5;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 50) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += 50) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();

  for (const s of view.shapes) drawShape(ctx, s);
  for (const b of view.bullets) {
    const c = b[4] === selfId ? ME : FOE;
    circle(ctx, b[1], b[2], b[3], c.fill, c.stroke, 2.5);
  }
  for (const p of view.players) drawTank(ctx, p, p.id === selfId);
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string, lw: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
}

function drawShape(ctx: CanvasRenderingContext2D, s: View['shapes'][number]) {
  const def = SHAPES[SHAPE_KINDS[s[4]]];
  ctx.beginPath();
  for (let i = 0; i < def.sides; i++) {
    const a = s[3] + (i * Math.PI * 2) / def.sides;
    const px = s[1] + Math.cos(a) * def.radius, py = s[2] + Math.sin(a) * def.radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = def.color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = def.stroke; ctx.lineJoin = 'round'; ctx.stroke();
  if (s[5] < 1) hpBar(ctx, s[1], s[2] + def.radius + 10, def.radius * 1.4, s[5]);
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number) {
  ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2 - 2, y - 4, w + 4, 8);
  ctx.fillStyle = '#85e37d'; ctx.fillRect(x - w / 2, y - 2, w * Math.max(0, Math.min(1, frac)), 4);
}

function drawTank(ctx: CanvasRenderingContext2D, p: PlayerSnap, mine: boolean) {
  const c = mine ? ME : FOE;
  const cls = CLASSES[p.cls] ?? CLASSES[0];
  const sc = p.r / PLAYER_BASE_RADIUS;
  if (p.prot) ctx.globalAlpha = 0.55;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.a);
  for (const b of cls.barrels) {
    ctx.save();
    ctx.rotate(b.angle);
    ctx.fillStyle = '#9a9a9f'; ctx.strokeStyle = '#6f6f74'; ctx.lineWidth = 3;
    const w = b.width * sc;
    ctx.fillRect(0, b.offset * sc - w / 2, b.length * sc, w);
    ctx.strokeRect(0, b.offset * sc - w / 2, b.length * sc, w);
    ctx.restore();
  }
  ctx.restore();
  circle(ctx, p.x, p.y, p.r, c.fill, c.stroke, 3);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000a'; ctx.fillStyle = '#fff';
  ctx.strokeText(p.name, p.x, p.y - p.r - 12); ctx.fillText(p.name, p.x, p.y - p.r - 12);
  if (p.hp < p.mhp) hpBar(ctx, p.x, p.y + p.r + 12, p.r * 1.8, p.hp / p.mhp);
}

/** Virtual joysticks (screen space). Faint hints are shown on touch devices before any touch. */
export function drawSticks(ctx: CanvasRenderingContext2D, W: number, H: number, input: Input) {
  if (!input.touchSeen) return;
  const draw = (s: { ox: number; oy: number; x: number; y: number } | null, hx: number, hy: number, col: string) => {
    const ox = s ? s.ox : hx, oy = s ? s.oy : hy;
    ctx.globalAlpha = s ? 0.5 : 0.18;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, STICK_RADIUS, 0, Math.PI * 2); ctx.fill();
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy, len = Math.hypot(dx, dy), k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + dx * k, oy + dy * k, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  draw(input.moveStick, Math.min(110, W * 0.2), H - Math.min(110, H * 0.3), '#4aa3ff');
  draw(input.aimStick, W - Math.min(110, W * 0.2), H - Math.min(110, H * 0.3), '#ff6a6a');
}
