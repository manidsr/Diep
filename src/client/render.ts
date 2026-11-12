import { ARENA_SIZE, SURVIVAL_ARENA_SIZE, CLASSES, PLAYER_BASE_RADIUS, SHAPES, SHAPE_KINDS, TEAM_BASE_DEPTH } from '../shared/config';
import type { DamagePoolSnap, DownedPlayerSnap, GameMode, HealthDropSnap, PlayerSnap, TeamId, XpDropSnap, ZombieSnap } from '../shared/protocol';
import { STICK_RADIUS, type Input } from './input';

export interface View {
  players: PlayerSnap[];
  bullets: [number, number, number, number, number, number, number, number][];
  shapes: [number, number, number, number, number, number, number, number, number, number][];
  zombies: ZombieSnap[];
  downed: DownedPlayerSnap[];
  healthDrops: HealthDropSnap[];
  xpDrops: XpDropSnap[];
  pools: DamagePoolSnap[];
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

type PixelParticle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string };
type FxSource = { x: number; y: number; color: string; count: number; speed: number; size: number };
type ShockRing = { x: number; y: number; color: string; age: number; duration: number; radius: number; expansion: number };

const pixelParticles: PixelParticle[] = [];
const shockRings: ShockRing[] = [];
const fxEmitTimes = new Map<string, number>();
const previousBullets = new Map<number, FxSource>();
const previousShapes = new Map<number, FxSource>();
const previousZombies = new Map<number, FxSource>();

function pixelBurst(x: number, y: number, color: string, count: number, speed: number, size = 3) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.28 + Math.random() * 0.92);
    const life = 0.22 + Math.random() * 0.42;
    pixelParticles.push({
      x: x + (Math.random() - 0.5) * 5, y: y + (Math.random() - 0.5) * 5,
      vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      life, maxLife: life, size: size * (0.65 + Math.random() * 1.2), color,
    });
  }
  if (shockRings.length < 80) shockRings.push({ x, y, color, age: 0, duration: 0.34, radius: 5, expansion: Math.max(24, speed * 0.42) });
  if (pixelParticles.length > 1000) pixelParticles.splice(0, pixelParticles.length - 1000);
}

function trailPixel(x: number, y: number, angle: number, color: string, radius: number, intensity = 1) {
  const back = radius * (0.55 + Math.random() * 0.6);
  const life = 0.2 + Math.random() * 0.18;
  pixelParticles.push({
    x: x - Math.cos(angle) * back + (Math.random() - 0.5) * radius * 0.45,
    y: y - Math.sin(angle) * back + (Math.random() - 0.5) * radius * 0.45,
    vx: -Math.cos(angle) * (18 + Math.random() * 36) + (Math.random() - 0.5) * 30,
    vy: -Math.sin(angle) * (18 + Math.random() * 36) + (Math.random() - 0.5) * 30,
    life, maxLife: life, size: Math.max(2, radius * (0.15 + Math.random() * 0.16)) * intensity, color,
  });
}

function syncRemoved(
  currentIds: Set<number>, previous: Map<number, FxSource>, current: Map<number, FxSource>,
) {
  for (const [id, source] of previous) {
    if (!currentIds.has(id)) pixelBurst(source.x, source.y, source.color, source.count, source.speed, source.size);
  }
  previous.clear();
  for (const [id, source] of current) previous.set(id, source);
}

function collectPixelFx(view: View, now: number) {
  const bulletIds = new Set<number>();
  const bulletSources = new Map<number, FxSource>();
  for (const bullet of view.bullets) {
    const [id, x, y, radius, ownerId, kind, angle] = bullet;
    bulletIds.add(id);
    const owner = view.players.find((player) => player.id === ownerId);
    const color = kind === 4 ? '#ff42d8' : kind === 3 ? '#ff9b42' : owner?.team === 'red' ? '#ff426e' : '#42dfff';
    bulletSources.set(id, { x, y, color, count: kind === 3 || kind === 4 ? 8 : 5, speed: 92, size: 3 });
    const interval = kind === 3 || kind === 4 ? 26 : kind === 1 ? 58 : 42;
    const key = 'bullet:' + id;
    if (now - (fxEmitTimes.get(key) ?? 0) > interval) {
      trailPixel(x, y, angle, color, radius, kind === 3 || kind === 4 ? 1.45 : 1);
      if (kind === 3 || kind === 4) trailPixel(x, y, angle, '#fff0ca', radius, 0.75);
      fxEmitTimes.set(key, now);
    }
  }
  syncRemoved(bulletIds, previousBullets, bulletSources);

  const shapeIds = new Set<number>();
  const shapeSources = new Map<number, FxSource>();
  for (const shape of view.shapes) {
    const id = shape[0], x = shape[1], y = shape[2], def = SHAPES[SHAPE_KINDS[shape[4]]];
    shapeIds.add(id);
    shapeSources.set(id, { x, y, color: def.color, count: 22, speed: 145, size: 4 });
    const hit = Math.max(0, Math.min(1, shape[6] ?? 0));
    const key = 'shape-hit:' + id;
    if (hit > 0.22 && now - (fxEmitTimes.get(key) ?? 0) > 115) {
      pixelBurst(shape[7] ?? x, shape[8] ?? y, '#fff0a0', 4, 110, 2.8);
      fxEmitTimes.set(key, now);
    }
  }
  syncRemoved(shapeIds, previousShapes, shapeSources);

  const zombieIds = new Set<number>();
  const zombieSources = new Map<number, FxSource>();
  for (const zombie of view.zombies) {
    zombieIds.add(zombie.id);
    const boss = zombie.bossKind !== null;
    const color = boss ? '#ff5c9e' : zombie.kind === 'stalker' ? '#a69aff' : zombie.kind === 'bomber' || zombie.kind === 'exploder' ? '#ff874e' : '#9dff73';
    zombieSources.set(zombie.id, { x: zombie.x, y: zombie.y, color, count: boss ? 52 : 28, speed: boss ? 190 : 135, size: boss ? 5 : 3.5 });
    const key = 'zombie-hit:' + zombie.id;
    if (zombie.hitFlash > 0.24 && now - (fxEmitTimes.get(key) ?? 0) > 86) {
      const ix = zombie.x + Math.cos(zombie.hitAngle) * zombie.r * 0.7;
      const iy = zombie.y + Math.sin(zombie.hitAngle) * zombie.r * 0.7;
      pixelBurst(ix, iy, boss ? '#ffd0ec' : '#d9ffad', boss ? 8 : 5, 105, 2.7);
      fxEmitTimes.set(key, now);
    }
  }
  syncRemoved(zombieIds, previousZombies, zombieSources);

  if (fxEmitTimes.size > 1800) fxEmitTimes.clear();
}

function drawPixelFx(ctx: CanvasRenderingContext2D, now: number, dt: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = pixelParticles.length - 1; i >= 0; i--) {
    const p = pixelParticles[i];
    p.life -= dt;
    if (p.life <= 0) { pixelParticles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = Math.pow(0.12, dt);
    p.vx *= drag; p.vy *= drag;
    const fade = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = fade * 0.92;
    ctx.fillStyle = p.color;
    const size = Math.max(1, Math.round(p.size * (0.55 + fade * 0.5)));
    ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
    if (fade > 0.62) {
      ctx.globalAlpha = (fade - 0.62) * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p.x + size), Math.round(p.y), Math.max(1, Math.ceil(size * 0.45)), 1);
    }
  }
  for (let i = shockRings.length - 1; i >= 0; i--) {
    const ring = shockRings[i];
    ring.age += dt;
    if (ring.age >= ring.duration) { shockRings.splice(i, 1); continue; }
    const progress = ring.age / ring.duration;
    const radius = ring.radius + ring.expansion * progress;
    ctx.globalAlpha = (1 - progress) * 0.72;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = Math.max(1.5, 4 * (1 - progress));
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -now / 32;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawCoreLayer(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, seed: number, phase: number) {
  ctx.beginPath();
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wobble = 1 + Math.sin(i * 2.7 + seed) * 0.018 + Math.cos(i * 0.83 + seed * 2) * 0.012 + Math.sin(phase + i * 0.14) * 0.012;
    const r = radius * wobble;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function drawNeonCore(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
  const phase = performance.now() / 620;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = seed ? '#ff385f' : '#43ff78';
  ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 34;
  ctx.beginPath(); ctx.arc(x, y, 190 + Math.sin(phase) * 5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  drawCoreLayer(ctx, x, y, 176 + Math.sin(phase) * 3, '#38ef70', seed + 1, phase);
  drawCoreLayer(ctx, x, y, 148 + Math.sin(phase + 0.6) * 2, '#385fe9', seed + 2, phase);
  drawCoreLayer(ctx, x, y, 119 + Math.sin(phase + 1.1) * 2, '#ff963d', seed + 3, phase);
  drawCoreLayer(ctx, x, y, 91 + Math.sin(phase + 1.8) * 1.5, '#e9e9df', seed + 4, phase);
  drawCoreLayer(ctx, x, y, 61 + Math.sin(phase + 2.4) * 1.5, seed ? '#f52260' : '#f52260', seed + 5, phase);
  ctx.strokeStyle = seed ? '#ff557b' : '#b2ff9e';
  ctx.globalAlpha = 0.7; ctx.lineWidth = 3;
  ctx.setLineDash([5, 9]); ctx.lineDashOffset = -phase * 12;
  ctx.beginPath(); ctx.arc(x, y, 190 + Math.sin(phase) * 5, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 14; i++) {
    const a = phase * (seed ? -0.9 : 0.9) + i * Math.PI * 2 / 14;
    ctx.globalAlpha = 0.55 + 0.4 * Math.sin(phase * 2 + i);
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : seed ? '#ff4b86' : '#72ff9a';
    ctx.fillRect(Math.round(x + Math.cos(a) * 202), Math.round(y + Math.sin(a) * 202), 5, 5);
  }
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  cam: { x: number; y: number }, view: View, selfId: number, fovMul = 1,
) {
  const fov = Math.max(0.65, Math.min(1.8, fovMul));
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - (drawFrame as any)._fxAt || now) / 1000));
  (drawFrame as any)._fxAt = now;
  collectPixelFx(view, now);
  const arenaSize = view.mode === 'survival' ? SURVIVAL_ARENA_SIZE : ARENA_SIZE;
  const scale = Math.max(Math.min(W, H) / 700, W / 2000, H / 2000) / fov;
  ctx.fillStyle = '#03050b';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  ctx.fillStyle = '#070912';
  ctx.fillRect(0, 0, arenaSize, arenaSize);
  const x0 = Math.max(0, Math.floor((cam.x - W / 2 / scale) / 120) * 120);
  const x1 = Math.min(arenaSize, cam.x + W / 2 / scale);
  const y0 = Math.max(0, Math.floor((cam.y - H / 2 / scale) / 120) * 120);
  const y1 = Math.min(arenaSize, cam.y + H / 2 / scale);
  // Deterministic sparse starfield: stars stay anchored to the world as the camera moves.
  for (let sx = x0; sx <= x1; sx += 120) for (let sy = y0; sy <= y1; sy += 120) {
    let hash = Math.imul(Math.floor(sx / 120) + 7919, 374761393) ^ Math.imul(Math.floor(sy / 120) + 104729, 668265263);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const n = (hash >>> 0) / 4294967295;
    if (n > 0.72) {
      const px = sx + n * 73, py = sy + ((hash >>> 8) % 97);
      ctx.fillStyle = n > 0.94 ? '#a7caff' : '#46506d';
      ctx.fillRect(px, py, n > 0.94 ? 3 : 2, n > 0.94 ? 3 : 2);
    }
  }
  ctx.strokeStyle = '#27314b'; ctx.lineWidth = 5 / scale;
  ctx.strokeRect(0, 0, arenaSize, arenaSize);

  if (view.mode === 'teams') drawTeamBases(ctx);
  for (const shape of view.shapes) drawShape(ctx, shape);
  for (const pool of view.pools) drawDamagePool(ctx, pool);
  for (const drop of view.xpDrops) drawXpDrop(ctx, drop);
  for (const drop of view.healthDrops) drawHealthDrop(ctx, drop);
  for (const zombie of view.zombies) drawZombie(ctx, zombie);
  for (const downed of view.downed) drawDownedPlayer(ctx, downed);
  for (const bullet of view.bullets) drawProjectile(ctx, bullet, bullet[4] === selfId, view.players);
  for (const player of view.players) if (player.id !== selfId) drawTank(ctx, player, false);
  for (const player of view.players) if (player.id === selfId) drawTank(ctx, player, true);
  drawPixelFx(ctx, now, dt);
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
  // These oversized bullseye cores echo the pulsing, concentric neon bases in the reference.
  drawNeonCore(ctx, TEAM_BASE_DEPTH / 2, ARENA_SIZE / 2, 13);
  drawNeonCore(ctx, ARENA_SIZE - TEAM_BASE_DEPTH / 2, ARENA_SIZE / 2, 29);
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
    // A dotted magenta satellite ring gives drone swarms the orbital look from the reference.
    const orbit = radius * 1.9;
    for (let i = 0; i < 10; i++) {
      const a = performance.now() / 230 + i * Math.PI * 2 / 10;
      ctx.globalAlpha = 0.42 + 0.5 * Math.sin(performance.now() / 90 + i);
      ctx.fillStyle = i % 3 === 0 ? '#fff0ff' : '#ff3f91';
      ctx.shadowColor = '#ff277b'; ctx.shadowBlur = 8;
      ctx.fillRect(Math.cos(a) * orbit - 2, Math.sin(a) * orbit - 2, 4, 4);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
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
    const trail = kind === 4 ? '#ff3bd4' : '#ff9b42';
    for (let i = 1; i <= 4; i++) {
      ctx.globalAlpha = (1 - i / 5) * 0.68;
      ctx.fillStyle = i === 1 ? '#fff4d4' : trail;
      ctx.shadowColor = trail; ctx.shadowBlur = 12;
      const tail = radius * (0.9 + i * 0.62);
      ctx.fillRect(-tail - radius * 0.55, -radius * (0.08 + i * 0.035), radius * 0.42, radius * (0.16 + i * 0.07));
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(radius * 1.9, 0); ctx.lineTo(-radius, -radius * 0.72); ctx.lineTo(-radius * 0.55, 0);
    ctx.lineTo(-radius, radius * 0.72); ctx.closePath();
    ctx.fillStyle = kind === 3 ? '#ffc36a' : '#fff0a0'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = kind === 3 ? '#9c5a23' : '#b78327'; ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = palette.fill; ctx.shadowColor = palette.fill; ctx.shadowBlur = 13;
    ctx.beginPath(); ctx.arc(x, y, radius * 1.65, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    circle(ctx, x, y, radius, palette.fill, palette.stroke, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - radius * 0.18), Math.round(y - radius * 0.18), Math.max(2, radius * 0.36), Math.max(2, radius * 0.36));
    ctx.restore();
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
    colossus: { fill: '#77706a', stroke: '#38312d', accent: '#ffd49b' },
    nestMother: { fill: '#766044', stroke: '#3f2c22', accent: '#f4c87b' },
    lich: { fill: '#6855a4', stroke: '#2e2356', accent: '#c8aaff' },
    devourer: { fill: '#773d3d', stroke: '#3d2027', accent: '#ff9a6b' },
    abomination: { fill: '#8e4b62', stroke: '#492337', accent: '#ffb0c7' },
  } as const;
  const mobPalettes: Record<ZombieSnap['kind'], { fill: string; stroke: string; accent: string }> = {
    shambler: { fill: '#4f854b', stroke: '#254b2b', accent: '#a8d66b' },
    runner: { fill: '#b58a40', stroke: '#65451e', accent: '#ffe08a' },
    tank: { fill: '#777b80', stroke: '#363c43', accent: '#c8d0d8' },
    ranger: { fill: '#4b8297', stroke: '#244b5d', accent: '#a4e7ff' },
    guardian: { fill: '#338f8a', stroke: '#15534f', accent: '#8fffee' },
    bomber: { fill: '#b34e32', stroke: '#692b22', accent: '#ffbd71' },
    leaper: { fill: '#955a87', stroke: '#512e55', accent: '#ffb2ea' },
    armoured: { fill: '#777d83', stroke: '#323b43', accent: '#d9e0e7' },
    medic: { fill: '#609b75', stroke: '#27583e', accent: '#b6ffd0' },
    exploder: { fill: '#b34e32', stroke: '#692b22', accent: '#ffbd71' },
    splitter: { fill: '#a16c42', stroke: '#5f3a25', accent: '#ffd09a' },
    stalker: { fill: '#434b69', stroke: '#1b203a', accent: '#9eacff' },
    commander: { fill: '#94733a', stroke: '#563d1c', accent: '#ffe08a' },
  };
  const palette = zombie.bossKind ? bossPalettes[zombie.bossKind] : mobPalettes[zombie.kind];
  const facingX = Math.cos(zombie.angle);
  const facingY = Math.sin(zombie.angle);

  ctx.save();
  ctx.globalAlpha *= Math.max(0.04, Math.min(1, zombie.visibility));
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

  if (!boss && zombie.kind === 'shambler') {
    ctx.strokeStyle = '#b4d57b'; ctx.lineWidth = Math.max(2, r * 0.13); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.72, r * 0.15); ctx.lineTo(-r * 1.38, r * 0.7);
    ctx.moveTo(r * 0.72, r * 0.18); ctx.lineTo(r * 1.35, r * 0.62); ctx.stroke();
    ctx.fillStyle = '#d5e2a0'; ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.65);
    ctx.lineTo(-r * 0.85, -r * 1.22); ctx.lineTo(-r * 0.15, -r * 0.82); ctx.fill();
  } else if (!boss && zombie.kind === 'armoured') {
    ctx.beginPath(); ctx.arc(0, 0, r * 1.36, 0, Math.PI * 2);
    ctx.strokeStyle = '#dce4ea'; ctx.lineWidth = Math.max(4, r * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, Math.PI * 2); ctx.strokeStyle = '#49535d'; ctx.lineWidth = 2; ctx.stroke();
  } else if (!boss && zombie.kind === 'medic') {
    ctx.fillStyle = '#d8ffe4'; ctx.fillRect(-r * 0.16, -r * 0.78, r * 0.32, r * 1.56);
    ctx.fillRect(-r * 0.78, -r * 0.16, r * 1.56, r * 0.32);
    ctx.strokeStyle = '#eafff0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2); ctx.stroke();
  } else if (!boss && zombie.kind === 'splitter') {
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(-r * 0.25, 0, r * 0.82, -1.1, 1.1); ctx.arc(r * 0.25, 0, r * 0.82, Math.PI - 1.1, Math.PI + 1.1); ctx.stroke();
  } else if (!boss && zombie.kind === 'stalker') {
    ctx.shadowColor = palette.accent; ctx.shadowBlur = 14; ctx.strokeStyle = palette.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#b7c4ff'; ctx.fillRect(-r * 0.55, -r * 0.22, r * 0.34, r * 0.09); ctx.fillRect(r * 0.2, -r * 0.22, r * 0.34, r * 0.09);
  } else if (!boss && zombie.kind === 'commander') {
    ctx.fillStyle = palette.accent; ctx.strokeStyle = palette.stroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.65); ctx.lineTo(-r * 0.42, -r * 1.5);
    ctx.lineTo(0, -r * 0.92); ctx.lineTo(r * 0.42, -r * 1.5); ctx.lineTo(r * 0.7, -r * 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (!boss && zombie.kind === 'tank') {
    ctx.fillStyle = '#929aa2'; ctx.strokeStyle = '#343c45'; ctx.lineWidth = 2;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * r * 0.1, -r * 0.72); ctx.lineTo(side * r * 0.8, -r * 0.52); ctx.lineTo(side * r * 0.72, r * 0.45); ctx.lineTo(side * r * 0.08, r * 0.66); ctx.closePath(); ctx.fill(); ctx.stroke(); }
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
  if (zombie.bossKind === 'colossus') {
    ctx.strokeStyle = palette.accent; ctx.lineWidth = r * 0.2; ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.9); ctx.lineTo(-r * 0.8, -r * 1.55);
    ctx.moveTo(r * 0.5, -r * 0.9); ctx.lineTo(r * 0.8, -r * 1.55); ctx.stroke();
  } else if (zombie.bossKind === 'nestMother') {
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 4;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * r * 0.95, r * 0.55, r * 0.32, 0, Math.PI * 2); ctx.stroke(); }
  } else if (zombie.bossKind === 'lich') {
    ctx.fillStyle = palette.accent; ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.55);
    ctx.lineTo(-r * 0.45, -r * 1.65); ctx.lineTo(0, -r * 1.05); ctx.lineTo(r * 0.45, -r * 1.65);
    ctx.lineTo(r * 0.75, -r * 0.55); ctx.closePath(); ctx.fill();
  } else if (zombie.bossKind === 'devourer') {
    ctx.fillStyle = '#351b20'; ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.55, r * 0.23, 0, 0, Math.PI * 2); ctx.fill();
  } else if (zombie.bossKind === 'abomination') {
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.4); ctx.lineTo(-r * 1.35, -r * 1.15);
    ctx.moveTo(r * 0.75, -r * 0.4); ctx.lineTo(r * 1.35, -r * 1.15); ctx.stroke();
  } else if (zombie.bossKind === 'breaker') {
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

  if (!boss && zombie.kind === 'exploder') {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
    ctx.strokeStyle = '#ff9a5b'; ctx.lineWidth = 3 + pulse * 2; ctx.beginPath();
    ctx.arc(0, 0, r * (1.35 + pulse * 0.18), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + pulse * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = '#ff7546'; ctx.globalAlpha = 0.5 + pulse * 0.45; ctx.fill(); ctx.globalAlpha = 1;
  } else if (!boss && zombie.kind === 'tank') {
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
    ctx.save(); ctx.rotate(zombie.angle);
    ctx.strokeStyle = '#d8f5ff'; ctx.lineWidth = Math.max(3, r * 0.16);
    ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.52); ctx.lineTo(r * 1.55, -r * 0.52); ctx.stroke();
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.82); ctx.lineTo(r * 1.25, -r * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.2, -r * 0.52, r * 0.12, 0, Math.PI * 2); ctx.fillStyle = palette.accent; ctx.fill();
    ctx.restore();
  } else if (!boss && zombie.kind === 'bomber') {
    ctx.strokeStyle = '#ffcc74'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.7); ctx.lineTo(-r * 0.82, -r * 1.25); ctx.lineTo(-r * 0.35, -r * 1.38); ctx.stroke();
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
    const names = { breaker: 'THE BREAKER', spitter: 'ROTBLOOM', summoner: 'GRAVEHEART', colossus: 'THE COLOSSUS', nestMother: 'NEST MOTHER', lich: 'THE LICH', devourer: 'THE DEVOURER', abomination: 'ABOMINATION' } as const;
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

function drawXpDrop(ctx: CanvasRenderingContext2D, drop: XpDropSnap) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 150 + drop.id);
  ctx.save(); ctx.translate(drop.x, drop.y); ctx.rotate(performance.now() / 500 + drop.id);
  ctx.shadowColor = '#ffe56f'; ctx.shadowBlur = 6 + pulse * 10;
  ctx.fillStyle = '#fff2a1'; ctx.strokeStyle = '#b27a21'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -drop.r * (1 + pulse * 0.12)); ctx.lineTo(drop.r * 0.8, 0);
  ctx.lineTo(0, drop.r * (1 + pulse * 0.12)); ctx.lineTo(-drop.r * 0.8, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function drawDamagePool(ctx: CanvasRenderingContext2D, pool: DamagePoolSnap) {
  ctx.save(); ctx.globalAlpha = Math.min(0.52, pool.life / 8); ctx.fillStyle = '#e35b32'; ctx.strokeStyle = '#ffae65'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pool.x, pool.y, pool.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.arc(pool.x, pool.y, pool.r * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#7f251e'; ctx.fill(); ctx.restore();
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
  ctx.save();
  if (hit > 0.08) { ctx.shadowColor = '#fff3b0'; ctx.shadowBlur = 12 + hit * 18; }
  ctx.fillStyle = def.color; ctx.fill();
  ctx.shadowBlur = 0;
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
  ctx.restore();
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
  for (const drop of view.xpDrops) {
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(px(drop.x), py(drop.y), 2.4, 0, Math.PI * 2); ctx.fill();
  }
  for (const enemy of view.zombies) {
    const x = px(enemy.x), y = py(enemy.y);
    if (enemy.bossKind) {
      ctx.fillStyle = '#ff4a42'; ctx.strokeStyle = '#ffd0b2'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      if (enemy.visibility < 0.25) continue;
      ctx.fillStyle = enemy.kind === 'guardian' ? '#85f4e8' : enemy.kind === 'medic' ? '#b6ffd0' : enemy.kind === 'commander' ? '#ffe08a' : '#ff625b';
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
  ctx.fillStyle = '#77ff9a'; ctx.fillText('HEALS', 104, H - 8); ctx.fillStyle = '#ffe27a'; ctx.fillText('XP', 148, H - 8); ctx.restore();
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
