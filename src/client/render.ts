import { ARENA_SIZE, SURVIVAL_ARENA_SIZE, CLASSES, PLAYER_BASE_RADIUS, SHAPES, SHAPE_KINDS, TEAM_BASE_DEPTH } from '../shared/config';
import type { Snapshot, CombatEffect, DamagePoolSnap, DownedPlayerSnap, GameMode, HealthDropSnap, PlayerSnap, TeamId, XpDropSnap, ZombieSnap } from '../shared/protocol';
import { type Input } from './input';

export interface View {
  survival?: Snapshot['survival'];
  effects?: (CombatEffect & { age: number })[];
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
const BODY_STROKE = 3.5;
const BARREL_STROKE = 3;
const BARREL_FILL = '#a4adb5';
const BARREL_EDGE = '#4e5965';
const BARREL_WIDTH_MUL = 1.08;
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
  for (const pool of view.pools) drawDamagePool(ctx, pool);
  for (const drop of view.xpDrops) drawXpDrop(ctx, drop);
  for (const drop of view.healthDrops) drawHealthDrop(ctx, drop);
  for (const zombie of view.zombies) drawZombie(ctx, zombie);
  for (const downed of view.downed) drawDownedPlayer(ctx, downed);
  for (const bullet of view.bullets) drawBulletTrail(ctx, bullet, bullet[4] === selfId);
  for (const bullet of view.bullets) drawProjectile(ctx, bullet, bullet[4] === selfId, view.players);
  for (const player of view.players) if (player.id !== selfId) drawTank(ctx, player, false);
  for (const player of view.players) if (player.id === selfId) drawTank(ctx, player, true);
  for (const effect of view.effects ?? []) drawCombatEffect(ctx, effect);
  ctx.restore();
  if (view.mode === 'survival') drawSurvivalOverlay(ctx, W, H, view);
}

function drawSurvivalOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, view: View) {
  const state = view.survival;
  if (!state) return;
  const boss = view.zombies.find((z) => z.bossKind && z.hp > 0);
  const compact = W < 760 || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const offset = compact ? 50 : 0;
  const width = Math.min(330, W * (compact ? 0.48 : 0.55)), left = (W - width) / 2;
  ctx.save();
  ctx.translate(0, offset);
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.font = (compact ? '900 11px' : '900 15px') + ' system-ui, sans-serif';
  ctx.lineWidth = 4; ctx.strokeStyle = '#17232b';
  const theme = state.theme === 'standard' ? 'HORDE' : state.theme.toUpperCase();
  const title = state.intermission > 0 ? 'WAVE CLEARED · ' + Math.ceil(state.intermission) + 's' :
    'WAVE ' + state.wave + ' · ' + theme + ' · ' + state.remaining + ' LEFT';
  ctx.fillStyle = state.intermission > 0 ? '#a9ffc1' : '#fff1c8';
  ctx.strokeText(title, W / 2, 27); ctx.fillText(title, W / 2, 27);
  if (boss) {
    const fraction = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.mhp)));
    ctx.fillStyle = '#24212b'; ctx.beginPath(); ctx.roundRect(left, 39, width, 24, 6); ctx.fill();
    ctx.fillStyle = '#dc485b'; ctx.fillRect(left + 3, 42, (width - 6) * fraction, 18);
    ctx.font = '800 12px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    const label = (boss.bossKind ?? 'boss').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase() + ' · ' + Math.ceil(fraction * 100) + '%';
    ctx.strokeText(label, W / 2, 55); ctx.fillText(label, W / 2, 55);
  }
  ctx.restore();
}

function drawBulletTrail(ctx: CanvasRenderingContext2D, bullet: View['bullets'][number], mine: boolean) {
  const [, x, y, r, , kind, angle] = bullet;
  if (kind !== 0 && kind !== 3 && kind !== 4) return;
  const length = Math.min(65, Math.max(14, r * 4));
  const color = kind === 0 ? (mine ? ME.fill : FOE.fill) : '#ffab55';
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.lineCap = 'round';
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.11 + (3 - i) * 0.08;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, r * (1.15 - i * 0.19));
    ctx.beginPath(); ctx.moveTo(-length * i / 3, 0); ctx.lineTo(-r * 0.5, 0); ctx.stroke();
  }
  ctx.restore();
}

function drawCombatEffect(ctx: CanvasRenderingContext2D, effect: CombatEffect & { age: number }) {
  const { x, y, radius, age, kind, color, amount } = effect;
  if (age < 0 || age >= 0.9) return;
  const t = age / 0.9;
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha *= 1 - t;
  if (kind === 'damage') {
    ctx.font = '900 ' + (amount >= 30 ? 23 : 17) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#30272b'; ctx.fillStyle = color;
    const label = amount < 1 ? amount.toFixed(1) : String(Math.round(amount));
    const offset = -radius * 0.65 - age * 65;
    ctx.strokeText(label, 0, offset); ctx.fillText(label, 0, offset);
  } else {
    const size = Math.max(12, Math.min(radius, 80));
    // Seed once per destruction event (not per frame): every explosion is unique
    // while particle trajectories remain smooth and consistent across clients.
    let seed = (Math.imul(Math.round(x * 100), 73856093) ^
      Math.imul(Math.round(y * 100), 19349663) ^ Math.imul(effect.tick, 83492791)) >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = 9 + Math.floor(random() * 10);
    const phase = random() * Math.PI * 2;
    const ringScale = 1.7 + random() * 0.9;
    const fade = ctx.globalAlpha;
    ctx.globalAlpha = fade * Math.max(0, 1 - t * 2.5);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.8, 3 * (1 - t));
    ctx.beginPath(); ctx.arc(0, 0, size * (0.45 + t * ringScale), 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < count; i++) {
      const angle = phase + i * Math.PI * 2 / count + (random() - 0.5) * 1.15;
      const speed = 0.65 + random() * 3.3;
      const start = random() * 0.55;
      const scale = 0.06 + random() * 0.22;
      const spin = (random() - 0.5) * 22;
      const rotation = random() * Math.PI * 2;
      const life = 0.38 + random() * 0.52;
      const type = Math.floor(random() * 4);
      const stretch = 0.6 + random() * 1.1;
      const bright = random() < 0.2;
      if (age >= life) continue;
      const progress = age / life;
      const travel = (1 - Math.exp(-age * 4)) / (1 - Math.exp(-3.6));
      const distance = size * (start + travel * speed);
      const fragment = Math.max(1, size * scale * (1 - progress * 0.65));
      ctx.save();
      ctx.globalAlpha = fade * Math.sqrt(1 - progress);
      ctx.translate(Math.cos(angle) * distance, Math.sin(angle) * distance);
      ctx.rotate(rotation + age * spin);
      ctx.fillStyle = bright ? '#fff3cf' : color;
      ctx.strokeStyle = '#34343b'; ctx.lineWidth = Math.min(1.5, fragment * 0.35);
      ctx.beginPath();
      if (type === 0) {
        ctx.moveTo(-fragment, -fragment * 0.6); ctx.lineTo(fragment * stretch, 0); ctx.lineTo(0, fragment); ctx.closePath();
      } else if (type === 1) {
        ctx.rect(-fragment, -fragment * 0.45, fragment * stretch * 2, fragment * 0.9);
      } else if (type === 2) {
        ctx.moveTo(-fragment, 0); ctx.lineTo(0, -fragment * stretch); ctx.lineTo(fragment, 0); ctx.lineTo(0, fragment * 0.7); ctx.closePath();
      } else {
        ctx.arc(0, 0, fragment * 0.65, 0, Math.PI * 2);
      }
      ctx.fill(); if (fragment > 2) ctx.stroke();
      ctx.restore();
    }
  }
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

// Deterministic, world-space impact effects: no random flicker or persistent particles.
function drawImpactBurst(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, flash: number, angle: number, accent: string) {
  const strength = Math.max(0, Math.min(1, flash));
  if (strength <= 0.025) return;
  const age = 1 - strength;
  const size = Math.max(12, Math.min(45, radius));
  const alpha = Math.sqrt(strength);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = 'round';

  // Expanding double shockwave with a dark rim for contrast on the pale arena.
  const ring = size * (0.22 + age * 1.15);
  ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.arc(0, 0, ring, 0, Math.PI * 2);
  ctx.strokeStyle = '#59432f'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, ring * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff5d6'; ctx.lineWidth = 1.6; ctx.stroke();

  // Long directional streaks with warm edges and bright cores.
  for (let i = -3; i <= 3; i++) {
    const direction = i * 0.32;
    const inner = size * (0.18 + age * 0.65);
    const outer = inner + size * (0.95 - Math.abs(i) * 0.13) * (0.6 + strength * 0.4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(direction) * inner, Math.sin(direction) * inner);
    ctx.lineTo(Math.cos(direction) * outer, Math.sin(direction) * outer);
    ctx.strokeStyle = '#a66336'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : accent;
    ctx.lineWidth = 2; ctx.stroke();
  }

  // Small flying debris, animated by the existing hit timer.
  ctx.fillStyle = accent;
  for (let i = 0; i < 6; i++) {
    const direction = (i - 2.5) * 0.75;
    const distance = size * (0.5 + age * (1.1 + (i % 3) * 0.23));
    const px = Math.cos(direction) * distance, py = Math.sin(direction) * distance;
    const particle = 1.2 + strength * 1.8;
    ctx.fillRect(px - particle / 2, py - particle / 2, particle, particle);
  }
  ctx.restore();
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

  const opacity = Math.max(0.04, Math.min(1, zombie.visibility));
  // Keep attack telegraphs in world coordinates, independent of the artwork.
  if (!boss && zombie.kind === 'guardian') {
    ctx.save(); ctx.globalAlpha *= 0.65; ctx.strokeStyle = '#29c9bb';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  if (!boss && zombie.specialPhase === 'windup') {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    ctx.save(); ctx.strokeStyle = zombie.kind === 'ranger' ? '#d99c25' : '#f13b40';
    ctx.lineWidth = 3 + pulse * 2; ctx.beginPath(); ctx.arc(0, 0, r * (1.55 + pulse * 0.15), 0, Math.PI * 2); ctx.stroke();
    if (zombie.kind === 'leaper') {
      ctx.rotate(zombie.angle); ctx.fillStyle = 'rgba(255,30,50,0.16)';
      ctx.beginPath(); ctx.moveTo(r, -r * 0.7); ctx.lineTo(r * 4.7, -r * 1.15);
      ctx.lineTo(r * 4.7, r * 1.15); ctx.lineTo(r, r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  if (!boss && zombie.kind === 'exploder') {
    ctx.save(); ctx.strokeStyle = '#ed7137'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * (1.35 + 0.12 * Math.sin(performance.now() / 90)), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  ctx.globalAlpha = opacity;
  ctx.scale(r, r);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const disk = (px: number, py: number, radius: number, fill: string, edge = palette.stroke, width = 0.1) =>
    circle(ctx, px, py, radius, fill, edge, width);
  const plate = (px: number, py: number, w: number, h: number, fill: string) => {
    ctx.beginPath(); ctx.roundRect(px, py, w, h, 0.12); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = palette.stroke; ctx.lineWidth = 0.09; ctx.stroke();
  };
  const line = (points: number[], color: string, width = 0.08) => {
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  const heavy = boss || zombie.kind === 'tank' || zombie.kind === 'armoured' || zombie.kind === 'guardian';
  // Small shadow, symmetrical hands and a rounded silhouette at every heading.
  ctx.fillStyle = '#18202526'; ctx.beginPath(); ctx.ellipse(0, 0.48, 1.05, 0.75, 0, 0, Math.PI * 2); ctx.fill();
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 0.92, 0.27); ctx.rotate(side * -0.22);
    plate(-0.24, -0.34, 0.48, 0.78, heavy ? palette.stroke : palette.fill);
    if (heavy) plate(-0.24, -0.29, 0.48, 0.3, palette.accent);
    ctx.restore();
  }
  disk(0, 0, 0.98, hit > 0.22 ? '#efffdc' : palette.fill, palette.stroke, boss ? 0.09 : 0.12);
  ctx.beginPath(); ctx.arc(0, 0, 0.79, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.strokeStyle = '#17232235'; ctx.lineWidth = 0.14; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 0.81, 1.12 * Math.PI, 1.76 * Math.PI);
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 0.09; ctx.stroke();

  // One recognizable accessory per variant, placed on top of the hull.
  const crown = () => {
    ctx.beginPath(); ctx.moveTo(-0.65, -0.76); ctx.lineTo(-0.59, -1.24);
    ctx.lineTo(-0.26, -1.02); ctx.lineTo(0, -1.39); ctx.lineTo(0.26, -1.02);
    ctx.lineTo(0.59, -1.24); ctx.lineTo(0.65, -0.76); ctx.closePath();
    ctx.fillStyle = palette.accent; ctx.fill(); ctx.strokeStyle = palette.stroke; ctx.lineWidth = 0.1; ctx.stroke();
  };
  if (boss) {
    switch (zombie.bossKind) {
      case 'breaker':
      case 'abomination':
        for (const side of [-1, 1]) line([side * 0.55, -0.62, side * 0.94, -1.19, side * 0.97, -0.8], palette.accent, 0.2);
        break;
      case 'colossus': for (const side of [-1, 1]) plate(side * 0.64 - 0.18, -0.84, 0.36, 0.62, palette.accent); break;
      case 'spitter': for (const side of [-1, 1]) disk(side * 0.86, 0.2, 0.23, palette.accent); break;
      case 'nestMother': for (const side of [-1, 1]) disk(side * 0.65, 0.68, 0.25, palette.accent); break;
      case 'summoner':
      case 'lich': crown(); break;
      case 'devourer': plate(-0.48, 0.35, 0.96, 0.32, palette.stroke); break;
    }
  } else {
    switch (zombie.kind) {
      case 'shambler': line([-0.48, -0.75, -0.24, -0.55, -0.38, -0.37], palette.stroke); break;
      case 'runner': for (const side of [-1, 1]) line([side * 0.75, -0.2, side * 1.17, -0.75], palette.accent, 0.17); break;
      case 'tank':
      case 'armoured': plate(-0.65, -0.79, 1.3, 0.25, palette.accent); break;
      case 'guardian': plate(-0.17, -0.83, 0.34, 0.27, palette.accent); break;
      case 'ranger': plate(-0.66, -0.36, 1.32, 0.37, palette.stroke); break;
      case 'medic': line([-0.23, -0.64, 0.23, -0.64], palette.accent, 0.16); line([0, -0.87, 0, -0.41], palette.accent, 0.16); break;
      case 'bomber':
      case 'exploder': disk(0, -0.65, 0.2, '#ffcf73'); line([0, -0.84, 0.12, -1.08, 0.28, -1.08], palette.stroke); break;
      case 'leaper': for (const side of [-1, 1]) line([side * 0.59, -0.47, side * 0.83, -0.97], palette.accent, 0.15); break;
      case 'splitter': line([0, -0.87, -0.13, -0.65, 0.09, -0.45], palette.stroke); break;
      case 'stalker': line([-0.55, -0.6, 0, -0.78, 0.55, -0.6], palette.accent); break;
      case 'commander': crown(); break;
    }
  }
  // High-contrast eyes stay upright; pupils follow the movement direction.
  const eyeColor = hit > 0.22 ? '#ffffff' : palette.accent;
  for (const side of [-1, 1]) {
    const px = side * 0.32;
    disk(px, -0.12, boss ? 0.21 : 0.18, eyeColor, '#263028', 0.055);
    disk(px + facingX * 0.055, -0.12 + facingY * 0.055, 0.078, '#202827', '#202827', 0.025);
    line([px - 0.16, -0.33 - side * 0.045, px + 0.16, -0.33 + side * 0.045], palette.stroke, 0.09);
  }
  plate(-0.28, 0.33, 0.56, 0.19, '#27302b');
  line([0, 0.36, 0, 0.46], '#e8e6c2', 0.05);

  ctx.restore();

  // Directional impact sparks and a brief bright ring make each shot feel physical.
  if (hit > 0.025) {
    drawImpactBurst(ctx, x + Math.cos(zombie.hitAngle) * r * 0.65,
      y + Math.sin(zombie.hitAngle) * r * 0.65, r, hit, zombie.hitAngle, '#ffd36b');
  }

  if (zombie.elite && !boss && zombie.visibility > 0.5) {
    ctx.save(); ctx.strokeStyle = '#ffcd63'; ctx.lineWidth = 3;
    ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.arc(x, y, r * 1.24, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#392b20'; ctx.lineWidth = 3; ctx.fillStyle = '#ffe28e';
    ctx.strokeText('ELITE', x, y - r - 12); ctx.fillText('ELITE', x, y - r - 12); ctx.restore();
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
  ctx.fillStyle = def.color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = hit > 0.08 ? '#fff4d6' : def.stroke;
  ctx.lineJoin = 'round'; ctx.stroke();

  if (hit > 0.025) {
    ctx.save();
    path();
    ctx.globalAlpha = hit * 0.62;
    ctx.fillStyle = '#ffffff'; ctx.fill();

    ctx.restore();
    drawImpactBurst(ctx, impactX, impactY, def.radius, hit, hitAngle, '#ffe27a');
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
    ctx.fillStyle = barrel.projectile === 'trap' ? '#c5ad83' : barrel.projectile === 'missile' ? '#c4a276' : BARREL_FILL;
    ctx.strokeStyle = BARREL_EDGE;
    ctx.lineWidth = BARREL_STROKE * scale;
    const barrelY = barrel.offset * scale - width / 2;
    const corner = Math.min(width * 0.16, 3 * scale, length / 2);
    ctx.beginPath();
    ctx.roundRect(0, barrelY, length, width, corner);
    ctx.fill();
    ctx.stroke();

    // Inset bevels and a muzzle band give the barrel depth without changing its silhouette.
    const inset = 2.5 * scale;
    const muzzle = Math.min(length * 0.22, 7 * scale);
    if (length > inset * 2 && width > inset * 2) {
      ctx.fillStyle = '#ffffff38';
      ctx.fillRect(inset, barrelY + inset, length - inset * 2, width * 0.17);
      ctx.fillStyle = '#26374626';
      ctx.fillRect(inset, barrelY + width - inset - width * 0.19, length - inset * 2, width * 0.19);
      ctx.fillStyle = '#37455255';
      ctx.fillRect(length - muzzle, barrelY + inset, Math.max(0, muzzle - inset), width - inset * 2);
    }
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

  // Draw the hull once, above the barrel roots. No duplicate outlines or clipping seam.
  ctx.restore();
  const x = player.x, y = player.y, r = player.r;
  circle(ctx, x, y, r, palette.fill, palette.stroke, BODY_STROKE * scale);

  // A restrained lower rim and upper highlight retain the classic flat 2D style.
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.84, 0.22 * Math.PI, 0.82 * Math.PI);
  ctx.strokeStyle = '#172b4826'; ctx.lineWidth = Math.max(1, 2.8 * scale); ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.84, 1.12 * Math.PI, 1.78 * Math.PI);
  ctx.strokeStyle = '#ffffff62'; ctx.lineWidth = Math.max(1, 2.1 * scale); ctx.stroke();

  // Auto-turret mounts use the same world-space offsets as the server.
  // Aim is not included in PlayerSnap; use a stable outward-facing visual.
  ctx.save();
  ctx.globalAlpha *= Math.max(0.04, Math.min(1, player.vis ?? 1));
  const turretCount = cls.turretCount ?? 0;
  for (let i = 0; i < turretCount; i++) {
    const orbit = (i / turretCount) * Math.PI * 2;
    ctx.save();
    ctx.translate(x + Math.cos(orbit) * r * 0.48, y + Math.sin(orbit) * r * 0.48);
    ctx.rotate(orbit);
    ctx.fillStyle = BARREL_FILL; ctx.strokeStyle = BARREL_EDGE; ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.roundRect(-2 * scale, -4.5 * scale, 24 * scale, 9 * scale, 2 * scale);
    ctx.fill(); ctx.stroke();
    circle(ctx, 0, 0, 7 * scale, '#aab4bd', BARREL_EDGE, 2 * scale);
    circle(ctx, 0, 0, 3 * scale, palette.fill, palette.stroke, 1.2 * scale);
    ctx.restore();
  }
  ctx.restore();
  if (player.prot) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 7 + pulse * 3, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`; ctx.stroke();
  }
  let labelY = player.y + player.r;
  if (player.hp < player.mhp && player.vis > 0.5) {
    hpBar(ctx, player.x, labelY + HP_GAP, player.r * 1.8, player.hp / player.mhp);
    labelY += HP_GAP + 8;
  }
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#000b'; ctx.fillStyle = '#fff';
  if (player.vis > 0.5) {
    ctx.strokeText(player.name, player.x, labelY + NAME_GAP + 4);
    ctx.fillText(player.name, player.x, labelY + NAME_GAP + 4);
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
  const radius = input.stickRadius;
  const draw = (stick: { ox: number; oy: number; x: number; y: number } | null, hintX: number, hintY: number, color: string, label: string) => {
    const ox = stick ? stick.ox : hintX, oy = stick ? stick.oy : hintY;
    const dx = stick ? stick.x - ox : 0, dy = stick ? stick.y - oy : 0;
    const length = Math.hypot(dx,dy), factor = length > radius ? radius / length : 1;
    const kx = ox + dx * factor, ky = oy + dy * factor;
    ctx.save(); ctx.globalAlpha = stick ? 0.83 : 0.55;
    ctx.beginPath(); ctx.arc(ox,oy,radius,0,Math.PI*2); ctx.fillStyle='#14213155'; ctx.fill();
    ctx.strokeStyle='#f4faff99'; ctx.lineWidth=2; ctx.stroke();
    ctx.beginPath(); ctx.arc(ox,oy,radius*0.72,0,Math.PI*2); ctx.strokeStyle='#ffffff30'; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(kx,ky,radius*0.36,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); ctx.strokeStyle='#ffffffbb'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.textAlign='center'; ctx.font='800 10px system-ui,sans-serif'; ctx.fillStyle='#fff'; ctx.strokeStyle='#15212f'; ctx.lineWidth=3;
    ctx.strokeText(label,ox,oy+radius+14); ctx.fillText(label,ox,oy+radius+14); ctx.restore();
  };
  const insetX = Math.max(radius + 18,Math.min(100,W*0.20));
  const insetY = radius + 42;
  draw(input.moveStick,insetX,H-insetY,'#368dcb','MOVE');
  draw(input.aimStick,W-insetX,H-insetY,'#d85e65','AIM / FIRE');
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
