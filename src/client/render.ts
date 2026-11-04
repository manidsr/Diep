import { ARENA_SIZE, CLASSES, PLAYER_BASE_RADIUS, SHAPES, SHAPE_KINDS } from '../shared/config';
import type { PlayerSnap } from '../shared/protocol';
import { STICK_RADIUS, type Input } from './input';

export interface View {
  players: PlayerSnap[];
  bullets: [number, number, number, number, number, number, number, number][];
  shapes: [number, number, number, number, number, number, number, number, number, number][];
}

const ME = { fill: '#00b2e1', stroke: '#0083a8' };
const FOE = { fill: '#f14e54', stroke: '#b43a3f' };
const BODY_STROKE = 4.5;
const BARREL_STROKE = 4;
const BARREL_FILL = '#999999';
const BARREL_EDGE = '#727272';
const BARREL_WIDTH_MUL = 1.15;
const NAME_GAP = 16;
const HP_GAP = 10;

export function drawFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  cam: { x: number; y: number }, view: View, selfId: number, fovMul = 1,
) {
  const fov = Math.max(0.65, Math.min(1.8, fovMul));
  const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000) / fov;
  ctx.fillStyle = '#b4b4b8';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = '#cdcdd2';
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  const x0 = Math.max(0, Math.floor((cam.x - W / 2 / scale) / 50) * 50);
  const x1 = Math.min(ARENA_SIZE, cam.x + W / 2 / scale);
  const y0 = Math.max(0, Math.floor((cam.y - H / 2 / scale) / 50) * 50);
  const y1 = Math.min(ARENA_SIZE, cam.y + H / 2 / scale);
  ctx.strokeStyle = '#c1c1c7';
  ctx.lineWidth = 1 / scale + 0.5;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 50) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += 50) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();

  for (const shape of view.shapes) drawShape(ctx, shape);
  for (const bullet of view.bullets) drawProjectile(ctx, bullet, bullet[4] === selfId, view.players);
  for (const player of view.players) if (player.id !== selfId) drawTank(ctx, player, false);
  for (const player of view.players) if (player.id === selfId) drawTank(ctx, player, true);
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string, stroke: string, lineWidth: number) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke();
}

function drawProjectile(ctx: CanvasRenderingContext2D, bullet: View['bullets'][number], mine: boolean, players: PlayerSnap[]) {
  const [, x, y, radius, , kind, angle, droneState = 0] = bullet;
  const palette = mine ? ME : FOE;
  if (kind === 1) {
    // Overlord drones have a visible signal tether. It fades nearby and turns
    // amber/red as the drone stretches toward its recall boundary.
    const ownerId = bullet[4];
    const owner = players.find((player) => player.id === ownerId);
    if (owner && CLASSES[owner.cls]?.id === 'overlord') {
      const dx = x - owner.x, dy = y - owner.y;
      const distance = Math.hypot(dx, dy);
      const tension = Math.max(0, Math.min(1, (distance - 260) / 220));
      if (tension > 0.03 && distance > 0.001) {
        const nx = dx / distance, ny = dy / distance;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(owner.x + nx * owner.r * 0.72, owner.y + ny * owner.r * 0.72);
        ctx.lineTo(x - nx * radius * 0.8, y - ny * radius * 0.8);
        ctx.setLineDash([9, 9]);
        ctx.lineDashOffset = -performance.now() / 90;
        ctx.lineWidth = 1.5 + tension * 1.5;
        ctx.strokeStyle = tension > 0.72
          ? `rgba(255, 91, 76, ${0.35 + tension * 0.55})`
          : `rgba(91, 207, 244, ${0.18 + tension * 0.42})`;
        ctx.shadowColor = tension > 0.72 ? '#ff6a55' : '#5bcff4';
        ctx.shadowBlur = 2 + tension * 7;
        ctx.stroke();
        ctx.restore();
      }
    }

    // A short coloured wake makes the current action readable without a UI marker.
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    if (droneState === 1 || droneState === 2) {
      const wake = droneState === 1 ? '#8fe5ff' : '#ffd29a';
      ctx.beginPath(); ctx.moveTo(-radius * 0.8, 0); ctx.lineTo(-radius * 3.1, 0);
      ctx.strokeStyle = wake; ctx.lineWidth = Math.max(2, radius * 0.42);
      ctx.globalAlpha = 0.82; ctx.shadowColor = wake; ctx.shadowBlur = 8; ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    // Drone: diamond-shaped body with a visible centre.
    ctx.beginPath(); ctx.moveTo(radius * 1.35, 0); ctx.lineTo(0, radius * 0.95);
    ctx.lineTo(-radius * 1.15, 0); ctx.lineTo(0, -radius * 0.95); ctx.closePath();
    ctx.fillStyle = '#d8f3ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = palette.stroke; ctx.stroke();
    circle(ctx, 0, 0, Math.max(2, radius * 0.28), palette.fill, palette.stroke, 1);
    ctx.restore();
  } else if (kind === 2) {
    // Trap: stationary square with a heavy outline.
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f3c56b'; ctx.strokeStyle = '#8d6232'; ctx.lineWidth = 3;
    ctx.fillRect(-radius * 0.78, -radius * 0.78, radius * 1.56, radius * 1.56);
    ctx.strokeRect(-radius * 0.78, -radius * 0.78, radius * 1.56, radius * 1.56);
    ctx.restore();
  } else if (kind === 3 || kind === 4) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(radius * 1.9, 0); ctx.lineTo(-radius, -radius * 0.72); ctx.lineTo(-radius * 0.55, 0);
    ctx.lineTo(-radius, radius * 0.72); ctx.closePath();
    ctx.fillStyle = kind === 3 ? '#ffc36a' : '#fff0a0'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = kind === 3 ? '#9c5a23' : '#b78327'; ctx.stroke();
    ctx.restore();
  } else {
    circle(ctx, x, y, radius, palette.fill, palette.stroke, 3);
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: View['shapes'][number]) {
  const def = SHAPES[SHAPE_KINDS[shape[4]]];
  const hit = Math.max(0, Math.min(1, shape[6] ?? 0));
  const impactX = shape[7] ?? shape[1], impactY = shape[8] ?? shape[2];
  const hitAngle = shape[9] ?? 0;
  const ca = Math.cos(hitAngle), sa = Math.sin(hitAngle);
  const stretch = 1 + hit * 0.12, squash = 1 - hit * 0.055;

  const path = () => {
    ctx.beginPath();
    for (let i = 0; i < def.sides; i++) {
      const angle = shape[3] + (i * Math.PI * 2) / def.sides;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const along = ux * ca + uy * sa;
      const across = -ux * sa + uy * ca;
      const px = shape[1] + def.radius * (along * stretch * ca - across * squash * sa);
      const py = shape[2] + def.radius * (along * stretch * sa + across * squash * ca);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  path();
  ctx.fillStyle = def.color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = hit > 0.08 ? '#fff4d6' : def.stroke;
  ctx.lineJoin = 'round'; ctx.stroke();

  if (hit > 0.025) {
    ctx.save();
    path();
    ctx.globalAlpha = hit * 0.32;
    ctx.fillStyle = '#ffffff'; ctx.fill();

    // A quick expanding impact ring and short directional sparks make hits readable.
    ctx.globalAlpha = hit * 0.9;
    ctx.strokeStyle = '#fff9df';
    ctx.lineWidth = 1.8 + hit * 1.2;
    ctx.beginPath();
    ctx.arc(impactX, impactY, 4 + (1 - hit) * 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const angle = hitAngle + i * 0.58;
      const inner = 5 + (1 - hit) * 4, outer = inner + 5 + hit * 6;
      ctx.moveTo(impactX + Math.cos(angle) * inner, impactY + Math.sin(angle) * inner);
      ctx.lineTo(impactX + Math.cos(angle) * outer, impactY + Math.sin(angle) * outer);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (shape[5] < 1) hpBar(ctx, shape[1], shape[2] + def.radius + 10, def.radius * 1.4, shape[5]);
}
function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, fraction: number) {
  ctx.fillStyle = '#000a'; ctx.fillRect(x - width / 2 - 2, y - 4, width + 4, 8);
  ctx.fillStyle = '#85e37d'; ctx.fillRect(x - width / 2, y - 2, width * Math.max(0, Math.min(1, fraction)), 4);
}

function drawTank(ctx: CanvasRenderingContext2D, player: PlayerSnap, mine: boolean) {
  const palette = mine ? ME : FOE;
  const cls = CLASSES[player.cls] ?? CLASSES[0];
  const scale = player.r / PLAYER_BASE_RADIUS;
  ctx.save();
  ctx.globalAlpha *= Math.max(0.04, Math.min(1, player.vis ?? 1));

  // Main barrels.
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.a);
  ctx.lineJoin = 'round';
  for (const barrel of cls.barrels) {
    ctx.save();
    ctx.rotate(barrel.angle);
    const width = barrel.width * scale * BARREL_WIDTH_MUL;
    const length = barrel.length * scale;
    ctx.fillStyle = barrel.projectile === 'trap' ? '#b8a17e' : barrel.projectile === 'missile' ? '#bd9b70' : BARREL_FILL;
    ctx.strokeStyle = BARREL_EDGE; ctx.lineWidth = BARREL_STROKE;
    const barrelY = barrel.offset * scale - width / 2;
    const corner = Math.min(width * 0.18, 5 * scale);
    ctx.beginPath();
    ctx.roundRect(0, barrelY, length, width, corner);
    ctx.fill(); ctx.stroke();
    // A restrained inner highlight gives the flat Diep-style cannon a little depth.
    ctx.beginPath(); ctx.moveTo(5 * scale, barrelY + 2 * scale);
    ctx.lineTo(Math.max(5 * scale, length - 3 * scale), barrelY + 2 * scale);
    ctx.strokeStyle = '#ffffff35'; ctx.lineWidth = Math.max(1, 1.2 * scale); ctx.stroke();
    ctx.strokeStyle = BARREL_EDGE; ctx.lineWidth = BARREL_STROKE;
    ctx.restore();
  }

  // Auto turrets are mounted on the body and can aim independently on the server.
  const turretCount = cls.turretCount ?? 0;
  for (let i = 0; i < turretCount; i++) {
    const angle = (i / turretCount) * Math.PI * 2;
    const mountRadius = player.r * 0.42;
    const tx = Math.cos(angle) * mountRadius;
    const ty = Math.sin(angle) * mountRadius;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(angle - player.a);
    ctx.fillStyle = '#777'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2.5;
    ctx.fillRect(-2, -5 * scale, 18 * scale, 10 * scale);
    ctx.strokeRect(-2, -5 * scale, 18 * scale, 10 * scale);
    circle(ctx, 0, 0, 6 * scale, '#888', '#555', 2);
    ctx.restore();
  }
  ctx.restore();

  // Body and shield.
  circle(ctx, player.x, player.y, player.r, palette.fill, palette.stroke, BODY_STROKE);
  // Soft upper-left sheen, kept subtle to preserve the original flat arena aesthetic.
  ctx.beginPath();
  ctx.arc(player.x - player.r * 0.08, player.y - player.r * 0.08, player.r * 0.82, Math.PI * 1.08, Math.PI * 1.78);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = Math.max(2, player.r * 0.055); ctx.stroke();
  if (player.prot) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 7 + pulse * 3, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`; ctx.stroke();
  }
  let y = player.y + player.r;
  if (player.hp < player.mhp && player.vis > 0.5) {
    hpBar(ctx, player.x, y + HP_GAP, player.r * 1.8, player.hp / player.mhp);
    y += HP_GAP + 8;
  }
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#000b'; ctx.fillStyle = '#fff';
  if (player.vis > 0.5) {
    ctx.strokeText(player.name, player.x, y + NAME_GAP + 4);
    ctx.fillText(player.name, player.x, y + NAME_GAP + 4);
  }
  ctx.restore();
}

/** Virtual joysticks are shown on touch devices after the first touch. */
export function drawSticks(ctx: CanvasRenderingContext2D, W: number, H: number, input: Input) {
  if (!input.touchSeen) return;
  const draw = (stick: { ox: number; oy: number; x: number; y: number } | null, hintX: number, hintY: number, color: string) => {
    const ox = stick ? stick.ox : hintX, oy = stick ? stick.oy : hintY;
    ctx.globalAlpha = stick ? 0.5 : 0.18;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, STICK_RADIUS, 0, Math.PI * 2); ctx.fill();
    if (stick) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
      const length = Math.hypot(dx, dy), factor = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.arc(ox + dx * factor, oy + dy * factor, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  draw(input.moveStick, Math.min(110, W * 0.2), H - Math.min(110, H * 0.3), '#4aa3ff');
  draw(input.aimStick, W - Math.min(110, W * 0.2), H - Math.min(110, H * 0.3), '#ff6a6a');
}


/** Generate an image preview using the same tank renderer as the live game. */
export function tankPreviewDataUrl(classId: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 176;
  canvas.height = 112;
  const previewCtx = canvas.getContext('2d');
  if (!previewCtx) return '';

  previewCtx.translate(canvas.width / 2, canvas.height / 2);
  const classIndex = Math.max(0, CLASSES.findIndex((tankClass) => tankClass.id === classId));
  const preview: PlayerSnap = {
    id: 0, name: '', x: 0, y: 0, a: -0.12,
    hp: 100, mhp: 100, r: PLAYER_BASE_RADIUS,
    lv: 1, cls: classIndex, prot: 0, vis: 1,
  };
  drawTank(previewCtx, preview, true);
  return canvas.toDataURL('image/png');
}
