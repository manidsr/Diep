import { ARENA_SIZE, SURVIVAL_ARENA_SIZE, CLASSES, PLAYER_BASE_RADIUS, SHAPES, SHAPE_KINDS, TEAM_BASE_DEPTH } from '../shared/config';
import type { DownedPlayerSnap, GameMode, HealthDropSnap, PlayerSnap, TeamId, ZombieSnap } from '../shared/protocol';
import { STICK_RADIUS, type Input } from './input';

export interface View {
  players: PlayerSnap[];
  bullets: [number, number, number, number, number, number, number, number][];
  shapes: [number, number, number, number, number, number, number, number, number, number][];
  zombies: ZombieSnap[];
  downed: DownedPlayerSnap[];
  healthDrops: HealthDropSnap[];
  mode: GameMode;
}

const ME = { fill: '#00b2e1', stroke: '#0083a8' };
const FOE = { fill: '#f14e54', stroke: '#b43a3f' };
const TEAM_BLUE = { fill: '#00b7f0', stroke: '#006b9e' };
const TEAM_RED = { fill: '#f0525c', stroke: '#a92735' };
const TEAM_COLOURS: Record<TeamId, { fill: string; stroke: string }> = {
  blue: TEAM_BLUE, red: TEAM_RED,
};
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
  const arenaSize = view.mode === 'survival' ? SURVIVAL_ARENA_SIZE : ARENA_SIZE;
  const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000) / fov;
  ctx.fillStyle = '#b4b4b8';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = '#cdcdd2';
  ctx.fillRect(0, 0, arenaSize, arenaSize);
  const x0 = Math.max(0, Math.floor((cam.x - W / 2 / scale) / 50) * 50);
  const x1 = Math.min(arenaSize, cam.x + W / 2 / scale);
  const y0 = Math.max(0, Math.floor((cam.y - H / 2 / scale) / 50) * 50);
  const y1 = Math.min(arenaSize, cam.y + H / 2 / scale);
  ctx.strokeStyle = '#c1c1c7';
  ctx.lineWidth = 1 / scale + 0.5;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 50) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += 50) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();

  if (view.mode === 'teams') drawTeamBases(ctx);
  for (const shape of view.shapes) drawShape(ctx, shape);
  for (const drop of view.healthDrops) drawHealthDrop(ctx, drop);
  for (const zombie of view.zombies) drawZombie(ctx, zombie);
  for (const downed of view.downed) drawDownedPlayer(ctx, downed);
  for (const bullet of view.bullets) drawProjectile(ctx, bullet, bullet[4] === selfId, view.players);
  for (const player of view.players) if (player.id !== selfId) drawTank(ctx, player, false);
  for (const player of view.players) if (player.id === selfId) drawTank(ctx, player, true);
  ctx.restore();
}

function drawTeamBases(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = 'rgba(18, 145, 230, 0.045)';
  ctx.fillRect(0, 0, ARENA_SIZE / 2, ARENA_SIZE);
  ctx.fillStyle = 'rgba(232, 55, 75, 0.045)';
  ctx.fillRect(ARENA_SIZE / 2, 0, ARENA_SIZE / 2, ARENA_SIZE);

  // The end strips are protected home bases, not capture objectives.
  ctx.fillStyle = 'rgba(18, 145, 230, 0.18)';
  ctx.fillRect(0, 0, TEAM_BASE_DEPTH, ARENA_SIZE);
  ctx.fillStyle = 'rgba(232, 55, 75, 0.18)';
  ctx.fillRect(ARENA_SIZE - TEAM_BASE_DEPTH, 0, TEAM_BASE_DEPTH, ARENA_SIZE);

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(40, 150, 225, 0.9)';
  ctx.beginPath();
  ctx.moveTo(TEAM_BASE_DEPTH, 0);
  ctx.lineTo(TEAM_BASE_DEPTH, ARENA_SIZE);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230, 72, 82, 0.9)';
  ctx.beginPath();
  ctx.moveTo(ARENA_SIZE - TEAM_BASE_DEPTH, 0);
  ctx.lineTo(ARENA_SIZE - TEAM_BASE_DEPTH, ARENA_SIZE);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(ARENA_SIZE / 2, 0);
  ctx.lineTo(ARENA_SIZE / 2, ARENA_SIZE);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '900 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0009';
  ctx.fillStyle = '#8bdfff';
  ctx.strokeText('BLUE BASE · SAFE ZONE', TEAM_BASE_DEPTH / 2, 180);
  ctx.fillText('BLUE BASE · SAFE ZONE', TEAM_BASE_DEPTH / 2, 180);
  ctx.fillStyle = '#ff9ca2';
  ctx.strokeText('RED BASE · SAFE ZONE', ARENA_SIZE - TEAM_BASE_DEPTH / 2, 180);
  ctx.fillText('RED BASE · SAFE ZONE', ARENA_SIZE - TEAM_BASE_DEPTH / 2, 180);
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string, stroke: string, lineWidth: number) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke();
}

function drawProjectile(ctx: CanvasRenderingContext2D, bullet: View['bullets'][number], mine: boolean, players: PlayerSnap[]) {
  const [, x, y, radius, , kind, angle, droneState = 0] = bullet;
  const owner = players.find((player) => player.id === bullet[4]);
  const palette = owner?.team ? TEAM_COLOURS[owner.team] : mine ? ME : FOE;
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

function drawZombie(ctx: CanvasRenderingContext2D, zombie: ZombieSnap) {
  const { x, y, r } = zombie;
  const hit = Math.max(0, Math.min(1, zombie.hitFlash));
  const boss = zombie.bossKind !== null;
  const bossPalettes = {
    breaker: { fill: '#a84a43', stroke: '#59272a', accent: '#ffc17a' },
    spitter: { fill: '#6c964f', stroke: '#304c2d', accent: '#d4f47a' },
    summoner: { fill: '#66518d', stroke: '#352653', accent: '#d2aaff' },
  } as const;
  const mobPalettes: Record<ZombieSnap['kind'], { fill: string; stroke: string; accent: string }> = {
    shambler: { fill: '#4f854b', stroke: '#254b2b', accent: '#a8d66b' },
    runner: { fill: '#b58a40', stroke: '#65451e', accent: '#ffe08a' },
    tank: { fill: '#777b80', stroke: '#363c43', accent: '#c8d0d8' },
    ranger: { fill: '#4b8297', stroke: '#244b5d', accent: '#a4e7ff' },
    guardian: { fill: '#338f8a', stroke: '#15534f', accent: '#8fffee' },
    bomber: { fill: '#b34e32', stroke: '#692b22', accent: '#ffbd71' },
    leaper: { fill: '#955a87', stroke: '#512e55', accent: '#ffb2ea' },
  };
  const palette = zombie.bossKind ? bossPalettes[zombie.bossKind] : mobPalettes[zombie.kind];
  const facingX = Math.cos(zombie.angle);
  const facingY = Math.sin(zombie.angle);

  ctx.save();
  ctx.translate(x, y);

  if (boss) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = Math.max(3, r * 0.075);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (zombie.bossPhase === 'windup') {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 75);
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.75 + pulse * 0.12), 0, Math.PI * 2);
      ctx.setLineDash([r * 0.28, r * 0.17]);
      ctx.strokeStyle = zombie.bossKind === 'breaker' ? '#ff293d' : '#ff4e45';
      ctx.globalAlpha = 0.58 + pulse * 0.4;
      ctx.lineWidth = 5 + pulse * 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (zombie.bossKind === 'breaker') {
        ctx.save(); ctx.rotate(zombie.angle);
        ctx.fillStyle = 'rgba(255, 22, 40, 0.16)'; ctx.strokeStyle = '#ff293d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(r * 0.45, -r * 0.36);
        ctx.lineTo(r * 6.2, -r * 1.05); ctx.lineTo(r * 6.2, r * 1.05);
        ctx.lineTo(r * 0.45, r * 0.36); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    } else if (zombie.bossPhase === 'charge') {
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.48, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5f45';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (!boss && zombie.kind === 'guardian') {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.beginPath(); ctx.arc(0, 0, r * (1.62 + pulse * 0.08), 0, Math.PI * 2);
    ctx.strokeStyle = '#75fff0'; ctx.globalAlpha = zombie.protected ? 0.88 : 0.48;
    ctx.lineWidth = zombie.protected ? 5 : 3; ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (!boss && zombie.specialPhase === 'windup') {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 55);
    ctx.beginPath(); ctx.arc(0, 0, r * (1.55 + pulse * 0.16), 0, Math.PI * 2);
    ctx.strokeStyle = zombie.kind === 'ranger' ? '#ffe08a' : '#ff293d';
    ctx.globalAlpha = 0.56 + pulse * 0.42; ctx.lineWidth = 4 + pulse * 2;
    ctx.stroke(); ctx.globalAlpha = 1;
    if (zombie.kind === 'leaper') {
      ctx.save(); ctx.rotate(zombie.angle);
      ctx.fillStyle = 'rgba(255, 30, 50, 0.16)'; ctx.strokeStyle = '#ff3548';
      ctx.beginPath(); ctx.moveTo(r, -r * 0.7); ctx.lineTo(r * 4.7, -r * 1.15);
      ctx.lineTo(r * 4.7, r * 1.15); ctx.lineTo(r, r * 0.7); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
  // Silhouette details identify each boss before its attack starts.
  if (zombie.bossKind === 'breaker') {
    ctx.fillStyle = '#6f292b';
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, -r * 0.55); ctx.lineTo(-r * 1.18, -r * 1.35);
    ctx.lineTo(-r * 0.32, -r * 1.02); ctx.closePath();
    ctx.moveTo(r * 0.62, -r * 0.55); ctx.lineTo(r * 1.18, -r * 1.35);
    ctx.lineTo(r * 0.32, -r * 1.02); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (zombie.bossKind === 'spitter') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.93, r * 0.12, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#9bc957';
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 3;
      ctx.fill(); ctx.stroke();
    }
  } else if (zombie.bossKind === 'summoner') {
    ctx.fillStyle = '#49366f';
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const angle = -Math.PI / 2 + (i / 6 - 0.5) * Math.PI * 1.15;
      const outer = r * (i % 2 === 0 ? 1.42 : 1.08);
      const px = Math.cos(angle) * outer, py = Math.sin(angle) * outer - r * 0.2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  if (!boss && zombie.kind === 'tank') {
    ctx.beginPath(); ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2);
    ctx.strokeStyle = '#d0d5dc'; ctx.lineWidth = Math.max(4, r * 0.12); ctx.stroke();
  } else if (!boss && zombie.kind === 'runner') {
    ctx.fillStyle = '#e9bb60'; ctx.strokeStyle = palette.stroke; ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * r * 0.75, -r * 0.35);
      ctx.lineTo(side * r * 1.55, -r * 0.9); ctx.lineTo(side * r * 1.15, r * 0.15);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (!boss && zombie.kind === 'ranger') {
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, -r * 1.32); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -r * 1.38, r * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent; ctx.fill();
  } else if (!boss && zombie.kind === 'bomber') {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = '#ff744b'; ctx.globalAlpha = 0.45 + (zombie.specialPhase === 'windup' ? 0.45 : 0);
    ctx.fill(); ctx.globalAlpha = 1;
  } else if (!boss && zombie.kind === 'leaper') {
    ctx.fillStyle = '#6b3b68'; ctx.strokeStyle = palette.stroke; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.68); ctx.lineTo(-r * 0.82, -r * 1.42);
    ctx.lineTo(-r * 0.05, -r * 0.94); ctx.moveTo(r * 0.4, -r * 0.68);
    ctx.lineTo(r * 0.82, -r * 1.42); ctx.lineTo(r * 0.05, -r * 0.94);
    ctx.fill(); ctx.stroke();
  }
  ctx.shadowColor = hit > 0.08 ? '#eaffd2' : palette.stroke;
  ctx.shadowBlur = 2 + hit * 15;
  ctx.fillStyle = hit > 0.18 ? '#e5ffd1' : palette.fill;
  ctx.strokeStyle = hit > 0.18 ? '#f3ffd7' : palette.stroke;
  ctx.lineWidth = Math.max(2, r * (boss ? 0.1 : 0.12));
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 1.2, -r * 0.2);
  ctx.lineTo(-r * 1.65, -r * 0.8);
  ctx.lineTo(-r * 0.7, -r * 0.55);
  ctx.lineTo(-r * 0.35, -r);
  ctx.lineTo(r * 0.55, -r * 0.85);
  ctx.lineTo(r * 1.2, -r * 0.25);
  ctx.lineTo(r * 1.05, r * 0.9);
  ctx.lineTo(-r * 0.95, r * 0.95);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  // The hull stays upright at every heading. Only the pupils move, so circling
  // a zombie can never turn its face upside down.
  const eyeY = -r * 0.18;
  const gazeX = facingX * r * 0.075;
  const gazeY = facingY * r * 0.075;
  ctx.fillStyle = zombie.bossKind === 'spitter' ? '#d8ff9a' : '#a8d66b';
  for (const eyeX of [-r * 0.34, r * 0.35]) {
    ctx.beginPath(); ctx.arc(eyeX, eyeY, r * (boss ? 0.19 : 0.16), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#202b20';
    ctx.beginPath(); ctx.arc(eyeX + gazeX, eyeY + gazeY, r * (boss ? 0.09 : 0.07), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = zombie.bossKind === 'spitter' ? '#d8ff9a' : '#a8d66b';
  }
  ctx.strokeStyle = '#202b20';
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath(); ctx.moveTo(-r * 0.22, r * 0.43); ctx.lineTo(r * 0.28, r * 0.43); ctx.stroke();

  if (zombie.bossKind === 'spitter') {
    ctx.fillStyle = '#c7f26d';
    ctx.beginPath(); ctx.arc(0, r * 0.02, r * 0.18, 0, Math.PI * 2); ctx.fill();
  } else if (zombie.bossKind === 'summoner') {
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0.25, Math.PI - 0.25); ctx.stroke();
  }

  ctx.restore();

  // Directional impact sparks and a brief bright ring make each shot feel physical.
  if (hit > 0.08) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(zombie.hitAngle);
    ctx.globalAlpha = hit * 0.85;
    ctx.strokeStyle = '#fff1c4';
    ctx.lineWidth = 2 + hit * 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.15 + (1 - hit) * 0.25), -0.6, 0.6);
    ctx.moveTo(r * 0.7, 0); ctx.lineTo(r * (1.8 + hit), 0);
    ctx.moveTo(r * 1.1, -r * 0.4); ctx.lineTo(r * (1.9 + hit), -r * 0.8);
    ctx.moveTo(r * 1.1, r * 0.4); ctx.lineTo(r * (1.9 + hit), r * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  if (boss) {
    const names = { breaker: 'THE BREAKER', spitter: 'ROTBLOOM', summoner: 'GRAVEHEART' } as const;
    ctx.save();
    ctx.font = '900 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#160d18';
    ctx.fillStyle = palette.accent;
    ctx.strokeText(names[zombie.bossKind!], x, y - r - 20);
    ctx.fillText(names[zombie.bossKind!], x, y - r - 20);
    ctx.restore();
    hpBar(ctx, x, y + r + 13, r * 3.2, zombie.hp / Math.max(1, zombie.mhp));
  } else {
    hpBar(ctx, x, y + r + 9, r * 2.1, zombie.hp / Math.max(1, zombie.mhp));
  }
}

function drawHealthDrop(ctx: CanvasRenderingContext2D, drop: HealthDropSnap) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180 + drop.id);
  ctx.save(); ctx.translate(drop.x, drop.y); ctx.shadowColor = '#75ff9c'; ctx.shadowBlur = 7 + pulse * 8;
  ctx.fillStyle = '#baffbb'; ctx.strokeStyle = '#267648'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, drop.r * (1 + pulse * 0.08), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#23884a';
  ctx.fillRect(-drop.r * 0.18, -drop.r * 0.62, drop.r * 0.36, drop.r * 1.24);
  ctx.fillRect(-drop.r * 0.62, -drop.r * 0.18, drop.r * 1.24, drop.r * 0.36);
  ctx.restore();
}

function drawDownedPlayer(ctx: CanvasRenderingContext2D, player: DownedPlayerSnap) {
  const progress = Math.max(0, Math.min(1, player.reviveProgress));
  ctx.save(); ctx.translate(player.x, player.y); ctx.globalAlpha = 0.58;
  circle(ctx, 0, 0, player.r, '#6c7e8b', '#1b2b36', 4); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff0a5'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, player.r + 9, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff0a5'; ctx.font = '900 11px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('DOWN', 0, -player.r - 13);
  ctx.fillStyle = '#fff'; ctx.fillRect(-player.r * 0.42, -3, player.r * 0.84, 6);
  ctx.fillRect(-3, -player.r * 0.42, 6, player.r * 0.84);
  ctx.restore();
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

function drawBarrels(
  ctx: CanvasRenderingContext2D, player: PlayerSnap, cls: (typeof CLASSES)[number], scale: number,
) {
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
    ctx.strokeStyle = BARREL_EDGE;
    ctx.lineWidth = BARREL_STROKE;
    const barrelY = barrel.offset * scale - width / 2;
    const corner = Math.min(width * 0.18, 5 * scale);
    ctx.beginPath();
    ctx.roundRect(0, barrelY, length, width, corner);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5 * scale, barrelY + 2 * scale);
    ctx.lineTo(Math.max(5 * scale, length - 3 * scale), barrelY + 2 * scale);
    ctx.strokeStyle = '#ffffff35';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawTank(ctx: CanvasRenderingContext2D, player: PlayerSnap, mine: boolean) {
  const palette = player.team ? TEAM_COLOURS[player.team] : mine ? ME : FOE;
  const cls = CLASSES[player.cls] ?? CLASSES[0];
  const scale = player.r / PLAYER_BASE_RADIUS;
  ctx.save(); // Keep the whole tank draw isolated from the arena camera state.
  ctx.save(); // Fade barrels/turrets independently; the body and labels remain fully readable.
  ctx.globalAlpha *= Math.max(0.04, Math.min(1, player.vis ?? 1));

  // Main barrels sit beneath the hull first, so their roots blend naturally into it.
  drawBarrels(ctx, player, cls, scale);

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

  // The hull masks the roots, but should never hide the exposed barrel tips.
  // An even-odd clip selects everything outside the body circle and redraws
  // the same barrel geometry there, preserving the clean under-hull connection.
  ctx.save();
  ctx.beginPath();
  ctx.rect(player.x - player.r * 8, player.y - player.r * 8, player.r * 16, player.r * 16);
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.clip('evenodd');
  drawBarrels(ctx, player, cls, scale);
  ctx.restore();

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

/** Co-op Survival radar: full arena view with friendlies, horde and loot. */
export function drawMinimap(ctx: CanvasRenderingContext2D, W: number, H: number, view: View, selfId: number) {
  ctx.clearRect(0, 0, W, H);
  if (view.mode !== 'survival') return;
  const size = SURVIVAL_ARENA_SIZE, pad = 10, mapSize = Math.min(W, H) - pad * 2;
  const left = (W - mapSize) / 2, top = (H - mapSize) / 2;
  const px = (value: number) => left + value / size * mapSize;
  const py = (value: number) => top + value / size * mapSize;
  ctx.save(); ctx.fillStyle = 'rgba(8,15,20,0.9)'; ctx.strokeStyle = 'rgba(205,230,238,0.65)';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(2, 2, W - 4, H - 4, 12); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, mapSize, mapSize); ctx.clip();
  ctx.fillStyle = '#27343a'; ctx.fillRect(left, top, mapSize, mapSize);
  ctx.strokeStyle = 'rgba(220,240,245,0.12)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const line = left + mapSize * i / 4;
    ctx.beginPath(); ctx.moveTo(line, top); ctx.lineTo(line, top + mapSize);
    ctx.moveTo(left, top + mapSize * i / 4); ctx.lineTo(left + mapSize, top + mapSize * i / 4); ctx.stroke();
  }
  for (const drop of view.healthDrops) {
    ctx.fillStyle = '#77ff9a'; ctx.beginPath(); ctx.arc(px(drop.x), py(drop.y), 2.8, 0, Math.PI * 2); ctx.fill();
  }
  for (const enemy of view.zombies) {
    const x = px(enemy.x), y = py(enemy.y);
    if (enemy.bossKind) {
      ctx.fillStyle = '#ff4a42'; ctx.strokeStyle = '#ffd0b2'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = enemy.kind === 'guardian' ? '#85f4e8' : '#ff625b';
      ctx.beginPath(); ctx.arc(x, y, enemy.kind === 'tank' ? 3.5 : 2.3, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const ally of view.players) {
    const x = px(ally.x), y = py(ally.y);
    ctx.fillStyle = ally.id === selfId ? '#fff' : '#4bc6ff'; ctx.strokeStyle = '#092338'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, ally.id === selfId ? 4.4 : 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (ally.id === selfId) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  for (const ally of view.downed) {
    const x = px(ally.x), y = py(ally.y); ctx.strokeStyle = '#ffd96d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#d8e9ec'; ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('ALLIES', 10, H - 8); ctx.fillStyle = '#ff665d'; ctx.fillText('HORDE', 56, H - 8);
  ctx.fillStyle = '#77ff9a'; ctx.fillText('HEALS', 104, H - 8); ctx.restore();
}

/** Minimal touch hints; active sticks become visible only while a thumb is down. */
export function drawSticks(ctx: CanvasRenderingContext2D, W: number, H: number, input: Input) {
  if (!input.touchSeen) return;
  const draw = (stick: { ox: number; oy: number; x: number; y: number } | null, hintX: number, hintY: number, color: string) => {
    const active = !!stick;
    const ox = stick ? stick.ox : hintX, oy = stick ? stick.oy : hintY;
    ctx.save();
    if (active) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, STICK_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, STICK_RADIUS, 0, Math.PI * 2); ctx.stroke();

      const dx = stick!.x - stick!.ox, dy = stick!.y - stick!.oy;
      const length = Math.hypot(dx, dy), factor = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
      const knobX = ox + dx * factor, knobY = oy + dy * factor;
      ctx.globalAlpha = 0.48;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(knobX, knobY); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(knobX, knobY, 18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(knobX, knobY, 18, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ox, oy, 32, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  const insetX = Math.min(88, Math.max(64, W * 0.18));
  const insetY = Math.min(88, Math.max(64, H * 0.22));
  draw(input.moveStick, insetX, H - insetY, '#4aa3ff');
  draw(input.aimStick, W - insetX, H - insetY, '#ff6a6a');
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
    lv: 1, cls: classIndex, prot: 0, vis: 1, team: null,
  };
  drawTank(previewCtx, preview, true);
  return canvas.toDataURL('image/png');
}
