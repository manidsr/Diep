import { ARENA_SIZE, SURVIVAL_ARENA_SIZE, CLASSES, PLAYER_BASE_RADIUS, SHAPES, SHAPE_KINDS, TEAM_BASE_DEPTH, TANK_SKINS, SERVER_TICK_HZ } from '../shared/config';
import type { Snapshot, CombatEffect, DamagePoolSnap, DownedPlayerSnap, GameMode, HealthDropSnap, PlayerSnap, TeamId, XpDropSnap, ZombieSnap } from '../shared/protocol';
import { type Input } from './input';
import { POWER_META, drawPowerIcon } from './powerups';

export interface View {
  survival?: Snapshot['survival'];
  royale?:Snapshot['royale'];crates?:Snapshot['crates'];explosiveIds?:number[];beams?:(NonNullable<Snapshot['beams']>[number]&{age:number})[];renderTick?:number;
  pickups?: (NonNullable<Snapshot['me']['pickups']>[number]&{age:number})[];
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
  if(view.royale){ctx.save();ctx.fillStyle='#e9535933';ctx.beginPath();ctx.rect(0,0,arenaSize,arenaSize);ctx.arc(arenaSize/2,arenaSize/2,view.royale.radius,0,Math.PI*2,true);ctx.fill('evenodd');ctx.strokeStyle='#da545b';ctx.lineWidth=5;ctx.beginPath();ctx.arc(arenaSize/2,arenaSize/2,view.royale.radius,0,Math.PI*2);ctx.stroke();ctx.restore();}
  const explosive=new Set(view.explosiveIds??[]);
  for (const shape of view.shapes) drawShape(ctx, shape,explosive.has(shape[0]));
  for(const c of view.crates??[]){
    const m=POWER_META[c.kind],r=c.r,phase=(view.renderTick??0)/SERVER_TICK_HZ*3+c.id;
    ctx.save();ctx.translate(c.x,c.y);
    ctx.fillStyle='#17212b22';ctx.beginPath();ctx.ellipse(0,r*0.75,r*0.92,r*0.33,0,0,Math.PI*2);ctx.fill();
    ctx.translate(0,Math.sin(phase)*2);
    ctx.fillStyle=m.fill;ctx.strokeStyle=m.edge;ctx.lineWidth=3;ctx.lineJoin='round';
    ctx.beginPath();ctx.roundRect(-r,-r,r*2,r*2,6);ctx.fill();ctx.stroke();
    ctx.fillStyle=m.edge;ctx.beginPath();ctx.roundRect(-r*0.69,-r*0.69,r*1.38,r*1.38,4);ctx.fill();
    drawPowerIcon(ctx,c.kind,r*1.25,'#fff');
    ctx.restore();
  }
  for (const pool of view.pools) drawDamagePool(ctx, pool);
  for (const drop of view.xpDrops) drawXpDrop(ctx, drop);
  for (const drop of view.healthDrops) drawHealthDrop(ctx, drop);
  for (const zombie of view.zombies) drawZombie(ctx, zombie);
  for (const downed of view.downed) drawDownedPlayer(ctx, downed);
  for (const bullet of view.bullets) drawBulletTrail(ctx, bullet, bullet[4] === selfId);
  for (const bullet of view.bullets) drawProjectile(ctx, bullet, bullet[4] === selfId, view.players);
  for (const player of view.players) if (player.id !== selfId) drawTank(ctx, player, false,view.renderTick);
  for (const player of view.players) if (player.id === selfId) drawTank(ctx, player, true,view.renderTick);
  // The same interpolated positions used to draw entities anchor every combat link.
  if(view.beams?.length){
    const positions=new Map<number,{x:number;y:number}>();
    for(const p of view.players)positions.set(p.id,p);
    for(const z of view.zombies)positions.set(z.id,z);
    for(const p of view.downed)positions.set(p.id,p);
    for(const s of view.shapes)positions.set(s[0],{x:s[1],y:s[2]});
    for(const b of view.bullets)positions.set(b[0],{x:b[1],y:b[2]});
    for(const beam of view.beams){
      const from=beam.fromId===undefined?undefined:positions.get(beam.fromId);
      const to=beam.toId===undefined?undefined:positions.get(beam.toId);
      drawCombatLink(ctx,{...beam,x:from?.x??beam.x,y:from?.y??beam.y,tx:to?.x??beam.tx,ty:to?.y??beam.ty});
    }
  }
  for(const event of view.pickups??[]){
    if(event.age<0||event.age>=0.55)continue;
    const m=POWER_META[event.kind],t=event.age/0.55;
    ctx.save();ctx.translate(event.x,event.y);ctx.globalAlpha=1-t;
    ctx.strokeStyle=m.edge;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,18+40*t,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=m.fill;ctx.lineWidth=2.5;ctx.stroke();
    ctx.translate(0,-18-22*t);drawPowerIcon(ctx,event.kind,24,m.edge);ctx.restore();
  }
  for (const effect of view.effects ?? []) drawCombatEffect(ctx, effect);
  ctx.restore();
  if (view.mode === 'survival') drawSurvivalOverlay(ctx, W, H, view);
  if(view.royale){const r=view.royale;ctx.save();ctx.textAlign='center';ctx.font='900 15px system-ui';ctx.lineWidth=4;ctx.strokeStyle='#242936';ctx.fillStyle='#fff0b0';const text=r.phase==='lobby'?(r.alive<2?'WAITING FOR 2 PLAYERS':'ROUND STARTS · '+r.seconds+'s'):r.phase==='result'?'WINNER · '+r.winner:'BATTLE ROYALE · '+r.alive+' LEFT · '+r.seconds+'s';ctx.strokeText(text,W/2,76);ctx.fillText(text,W/2,76);ctx.restore();}
}

/** Animated, outlined links; deterministic bends avoid random per-frame flicker. */
function drawCombatLink(ctx:CanvasRenderingContext2D, beam:NonNullable<View['beams']>[number]){
  const {x,y,tx,ty,color}=beam;
  const kind=beam.kind??'laser';
  const age=beam.age-(kind==='arc'?(beam.hop??0)*0.055:0);
  if(kind==='blast'||kind==='gravity'){drawAreaPulse(ctx,x,y,beam.radius??0,age,color,kind==='gravity');return;}
  const duration=kind==='arc'?0.44:kind==='fork'?0.28:0.18;
  if(age<0||age>=duration)return;
  const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);
  if(d<0.01)return;
  const progress=Math.min(1,(age+0.012)/(kind==='arc'?0.065:kind==='fork'?0.04:0.025));
  const fade=Math.min(1,(duration-age)/(duration*0.55));
  const nx=-dy/d,ny=dx/d;
  const points:{x:number;y:number}[]=[{x,y}];
  if(kind==='arc'){
    const segments=Math.max(3,Math.min(9,Math.ceil(d/23)));
    let seed=(Math.imul(beam.tick+1,1664525)^Math.imul(beam.fromId??Math.round(beam.x*10),73856093)^Math.imul(beam.toId??Math.round(beam.ty*10),19349663))>>>0;
    for(let i=1;i<segments;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const t=i/segments, bend=(i%2===0?1:-1)*(0.55+seed/4294967296*0.45)*Math.min(12,d*0.10)*Math.sin(t*Math.PI);
      points.push({x:x+dx*t+nx*bend,y:y+dy*t+ny*bend});
    }
  }
  points.push({x:tx,y:ty});
  const end={x,y};
  const trace=()=>{
    ctx.beginPath();ctx.moveTo(x,y);
    const at=progress*(points.length-1);
    for(let i=1;i<points.length;i++){
      const f=Math.max(0,Math.min(1,at-i+1));if(f<=0)break;
      const a=points[i-1],b=points[i];end.x=a.x+(b.x-a.x)*f;end.y=a.y+(b.y-a.y)*f;
      ctx.lineTo(end.x,end.y);if(f<1)break;
    }
  };
  ctx.save();ctx.globalAlpha=fade;ctx.lineCap='round';ctx.lineJoin='round';
  trace();
  ctx.strokeStyle=kind==='arc'?'#456794':kind==='fork'?'#9b7138':'#4688b5';ctx.lineWidth=kind==='arc'?7:kind==='fork'?4.8:6;ctx.stroke();
  ctx.strokeStyle=color;ctx.lineWidth=kind==='arc'?4.4:kind==='fork'?2.8:3.8;ctx.stroke();
  ctx.strokeStyle='#f9fdff';ctx.lineWidth=kind==='fork'?1:1.6;ctx.stroke();
  if(kind!=='laser'){
    // The travelling head makes direction clear. End sparks sit at real hit points.
    ctx.fillStyle='#f8fdff';ctx.beginPath();ctx.arc(end.x,end.y,kind==='arc'?3.8:2.3,0,Math.PI*2);ctx.fill();
    const pulse=(age/duration);
    if(beam.root!==false&&age<0.22){
      ctx.strokeStyle=color;ctx.lineWidth=2.3;ctx.globalAlpha=fade*(1-age/0.22);
      ctx.beginPath();ctx.arc(x,y,5+18*pulse,0,Math.PI*2);ctx.stroke();
    }
    if(kind==='arc'&&progress===1){
      const p=Math.min(1,(age-0.075)/(duration-0.075));ctx.globalAlpha=fade;
      ctx.strokeStyle=color;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(tx,ty,6+p*16,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2+0.5;const r=9+p*9;
        ctx.moveTo(tx+Math.cos(a)*r,ty+Math.sin(a)*r);
        ctx.lineTo(tx+Math.cos(a)*(r+5),ty+Math.sin(a)*(r+5));
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Two crisp expanding rings show the actual blast radius; gravity contracts instead. */
function drawAreaPulse(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,age:number,color:string,inward:boolean){
  const duration=inward?0.42:0.46;
  if(age<0||age>=duration||radius<=0)return;
  const t=age/duration,fade=(1-t)*(1-t);
  const wave=inward?radius*(1-0.9*t):radius*(0.16+0.84*(1-Math.pow(1-t,3)));
  ctx.save();ctx.translate(x,y);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.globalAlpha=fade*0.18;ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=fade*0.65;ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=Math.min(1,fade*1.6);ctx.strokeStyle=inward?'#72589f':'#ad6839';ctx.lineWidth=7;
  ctx.beginPath();ctx.arc(0,0,wave,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=4;ctx.stroke();
  ctx.strokeStyle='#fff6da';ctx.lineWidth=1.5;ctx.stroke();
  ctx.globalAlpha=fade;ctx.strokeStyle=color;ctx.lineWidth=3;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4+0.2, r=Math.min(radius,wave+5);
    const r2=Math.min(radius,r+8+12*t);
    ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);ctx.stroke();
  }
  ctx.globalAlpha=fade*0.8;ctx.fillStyle='#fff5cf';ctx.beginPath();ctx.arc(0,0,Math.max(2,radius*0.13*(1-t)),0,Math.PI*2);ctx.fill();
  ctx.restore();
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
    if (amount <= 0) { ctx.restore(); return; }
    const incoming = color === '#ff7777';
    const heavy = amount >= 30;
    // Stable lateral spread prevents successive hits from sharing the same path.
    const hash = (Math.imul(effect.tick + 1, 2654435761) ^
      Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(y * 10), 19349663)) >>> 0;
    const drift = ((hash % 101) / 100 - 0.5) * 2;
    const lane = (hash >>> 9) % 3 - 1;
    const rise = 1 - Math.pow(1 - t, 2);
    const pop = t < 0.12 ? 0.76 + 0.54 * Math.sin(t / 0.12 * Math.PI / 2)
      : 1 + 0.30 * Math.exp(-(t - 0.12) * 14);
    const fontSize = incoming ? 22 : Math.min(34, 19 + Math.log2(1 + amount / 8) * 3.4);
    const label = (incoming ? '−' : '') + (amount < 1 ? (amount < 0.1 ? '<0.1' : amount.toFixed(1)) : String(Math.round(amount)));
    ctx.globalAlpha = Math.min(1, (1 - t) / 0.28);
    ctx.translate(lane * 9 + drift * rise * 25, -Math.max(16, radius * 0.85) - rise * 48);
    ctx.scale(pop, pop);
    ctx.font = '900 ' + fontSize + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111820'; ctx.lineWidth = heavy ? 4.5 : 3.5;
    ctx.fillStyle = incoming ? '#ff747e' : heavy && color === '#fff0a0' ? '#ffd45d' : color;
    // A short offset shadow and contrasting outline remain readable over every arena color.
    ctx.save(); ctx.globalAlpha *= 0.42; ctx.fillStyle = '#111820';
    ctx.fillText(label, 0, 3); ctx.restore();
    ctx.strokeText(label, 0, 0); ctx.fillText(label, 0, 0);
    if (heavy && !incoming && t < 0.38) {
      const half = ctx.measureText(label).width / 2 + 7;
      ctx.globalAlpha *= 1 - t / 0.38;
      ctx.strokeStyle = '#fff1b5'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const px = side * (half + rise * 9);
        ctx.beginPath(); ctx.moveTo(px, -6); ctx.lineTo(px + side * 5, -10);
        ctx.moveTo(px, 2); ctx.lineTo(px + side * 6, 4); ctx.stroke();
      }
    }
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
    shambler: { fill: '#87c96a', stroke: '#588e43', accent: '#c6f69b' },
    runner: { fill: '#ffc65b', stroke: '#bf8c32', accent: '#fff0a7' },
    tank: { fill: '#a2a6af', stroke: '#696f7a', accent: '#edf0f4' },
    ranger: { fill: '#68b8e6', stroke: '#397da8', accent: '#c0edff' },
    guardian: { fill: '#62cfc4', stroke: '#328c85', accent: '#c4fff2' },
    bomber: { fill: '#f08b58', stroke: '#ae5837', accent: '#ffe1a0' },
    leaper: { fill: '#ce8bd6', stroke: '#94579e', accent: '#ffe0fa' },
    armoured: { fill: '#8b95a8', stroke: '#505c73', accent: '#e5ebf7' },
    medic: { fill: '#6fcf91', stroke: '#3c945a', accent: '#e1ffe5' },
    exploder: { fill: '#f47766', stroke: '#b34d43', accent: '#ffd39a' },
    splitter: { fill: '#d5a36a', stroke: '#9c7044', accent: '#ffe5af' },
    stalker: { fill: '#9d8bd4', stroke: '#61568f', accent: '#e5daff' },
    commander: { fill: '#e4be60', stroke: '#a1863e', accent: '#fff2b1' },
  };
  const palette = zombie.bossKind ? bossPalettes[zombie.bossKind] : mobPalettes[zombie.kind];

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
  // Classic tank art: flat colored hull, darker matching outline and a single
  // readable role marker. No textures, glow, shading gradients or heavy effects.
  ctx.globalAlpha = opacity;
  ctx.scale(r, r);
  ctx.rotate(zombie.angle);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const shell = hit > 0.30 ? '#f8f8f0' : palette.fill;
  const edge = palette.stroke;
  const accent = palette.accent;
  const width = Math.max(0.045, Math.min(0.14, 3.2 / r));
  const path = (points: readonly number[], fill = shell, stroke = edge, w = width) => {
    ctx.beginPath(); ctx.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2) ctx.lineTo(points[i],points[i+1]);
    ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
    ctx.strokeStyle=stroke; ctx.lineWidth=w; ctx.stroke();
  };
  const poly = (sides: number, radius=0.98, angle=0, inner=radius, fill=shell) => {
    const count=inner===radius?sides:sides*2, points:number[]=[];
    for(let i=0;i<count;i++){
      const a=angle+i*Math.PI*2/count, d=i%2===0?radius:inner;
      points.push(Math.cos(a)*d,Math.sin(a)*d);
    }
    path(points,fill);
  };
  const disk = (px:number,py:number,radius:number,fill=shell,stroke=edge,w=width) =>
    circle(ctx,px,py,radius,fill,stroke,w);
  const core = (radius=0.34,px=0,py=0) => {
    disk(px,py,radius,accent,edge,width*0.72);
    // Same modest highlight treatment as the player hull.
    ctx.beginPath(); ctx.arc(px,py,radius*0.72,Math.PI*1.1,Math.PI*1.8);
    ctx.strokeStyle='#ffffff85'; ctx.lineWidth=width*0.55; ctx.stroke();
  };
  const rect = (x:number,y:number,w:number,h:number,fill=BARREL_FILL,stroke=BARREL_EDGE) => {
    ctx.beginPath();ctx.roundRect(x,y,w,h,0.06);
    ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();
  };
  const cross = () => {
    path([-0.12,-0.38,0.12,-0.38,0.12,-0.12,0.38,-0.12,0.38,0.12,0.12,0.12,0.12,0.38,-0.12,0.38,-0.12,0.12,-0.38,0.12,-0.38,-0.12,-0.12,-0.12],accent,edge,width*0.65);
  };
  const sidePlates = (fill:string, size=1) => {
    for(const side of [-1,1]){
      ctx.save();ctx.scale(1,side);rect(-0.48*size,0.49*size,0.96*size,0.30*size,fill,edge);ctx.restore();
    }
  };
  const arrow = (back=0.80,notch=0.36,fill=shell) =>
    path([1.02,0,-back,0.75,-notch,0,-back,-0.75],fill);
  if (boss) {
    switch(zombie.bossKind){
      case 'breaker':
        for(const side of [-1,1]) {ctx.save();ctx.scale(1,side);rect(0.03,0.38,1.04,0.40,shell,edge);ctx.restore();}
        poly(6,0.91);core(0.39);break;
      case 'spitter':
        for(const angle of [-0.38,0.38]){ctx.save();ctx.rotate(angle);rect(0.40,-0.18,0.77,0.36);ctx.restore();}
        poly(6,0.92);core(0.35);break;
      case 'summoner':
        poly(6,0.97);poly(3,0.65,0,0.65,accent);
        core(0.26);break;
      case 'colossus':
        sidePlates(edge,1.18);poly(8,1.02,Math.PI/8);poly(4,0.68,Math.PI/4,0.68,edge);core(0.35);break;
      case 'nestMother':
        poly(6,0.94);
        for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;disk(Math.cos(angle)*0.70,Math.sin(angle)*0.70,0.22,accent);}
        core(0.34);break;
      case 'lich':
        poly(4,1.04,0,0.65);poly(4,0.64,Math.PI/4,0.64,edge);core(0.34);break;
      case 'devourer':
        poly(6,0.95);
        for(const side of [-1,1]){ctx.save();ctx.scale(1,side);path([0.16,0.44,1.06,0.56,0.82,0.13,0.40,0.23],accent);ctx.restore();}
        core(0.34,-0.20,0);break;
      case 'abomination':
        poly(5,1.05,0,0.72);core(0.29,-0.23,0.18);core(0.26,0.25,-0.16);break;
    }
  } else {
    switch(zombie.kind){
      case 'shambler':
        poly(6);core(0.34);break;
      case 'runner':
        arrow();core(0.27,0.13);break;
      case 'tank':
        sidePlates(edge,1.1);poly(8,0.96,Math.PI/8);core(0.40);break;
      case 'ranger':
        rect(0.45,-0.20,0.72,0.40);poly(6,0.94);core(0.32);break;
      case 'guardian':
        poly(6,0.96);poly(6,0.68,0,0.68,edge);core(0.34);break;
      case 'bomber':
        poly(6,0.98);core(0.48);break;
      case 'leaper':
        arrow(0.84,0.10);core(0.29,0.05);break;
      case 'armoured':
        poly(8,1.0,Math.PI/8,1.0,edge);poly(8,0.78,Math.PI/8);core(0.31);break;
      case 'medic':
        poly(6);cross();break;
      case 'exploder':
        poly(6,1.05,0,0.72);core(0.43);break;
      case 'splitter':
        path([1.0,0,0.12,0.86,-0.82,0.62,-0.60,0,-0.82,-0.62,0.12,-0.86]);
        core(0.25,-0.30,0.27);core(0.25,0.25,-0.20);break;
      case 'stalker':
        path([1.0,0,0.15,0.67,-0.84,0.55,-0.37,0,-0.84,-0.55,0.15,-0.67]);
        core(0.25,0.17);break;
      case 'commander':
        poly(6);poly(3,0.62,0,0.62,edge);core(0.25);break;
    }
  }
  ctx.restore();

  if(zombie.visibility>0.15&&(zombie.chilled||zombie.burning)){
    ctx.save();ctx.globalAlpha=0.85;ctx.lineWidth=2.5;ctx.lineCap='round';
    if(zombie.chilled){ctx.strokeStyle='#70c8f5';ctx.beginPath();ctx.arc(x,y,r+3,Math.PI*0.15,Math.PI*0.92);ctx.stroke();ctx.beginPath();ctx.arc(x,y,r+3,Math.PI*1.15,Math.PI*1.92);ctx.stroke();}
    if(zombie.burning){ctx.strokeStyle='#ef8b42';for(let i=0;i<3;i++){const a=i*Math.PI*2/3+performance.now()*0.002;const px=x+Math.cos(a)*(r+4),py=y+Math.sin(a)*(r+4);ctx.beginPath();ctx.moveTo(px-3,py+3);ctx.lineTo(px,py-4);ctx.lineTo(px+3,py+3);ctx.stroke();}}
    ctx.restore();
  }
  // Directional impact sparks and a brief bright ring make each shot feel physical.
  if (hit > 0.025 && zombie.visibility > 0.15) {
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
  } else if (zombie.visibility > 0.15 && zombie.hp < zombie.mhp) {
    hpBar(ctx, x, y + r + 9, r * 1.8, zombie.hp / Math.max(1, zombie.mhp));
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

function drawShape(ctx: CanvasRenderingContext2D, shape: View['shapes'][number],explosive=false) {
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
  ctx.fillStyle = explosive?'#f58b48':def.color; ctx.fill();
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
  if(explosive){ctx.save();ctx.font='900 20px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#77351e';ctx.fillText('!',shape[1],shape[2]);ctx.restore();}
  if (shape[5] < 1) hpBar(ctx, shape[1], shape[2] + def.radius + 10, def.radius * 1.4, shape[5]);
}
function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, fraction: number) {
  ctx.fillStyle = '#000a'; ctx.fillRect(x - width / 2 - 2, y - 4, width + 4, 8);
  ctx.fillStyle = '#85e37d'; ctx.fillRect(x - width / 2, y - 2, width * Math.max(0, Math.min(1, fraction)), 4);
}

function drawBarrels(
  ctx: CanvasRenderingContext2D, player: PlayerSnap, cls: (typeof CLASSES)[number], scale: number, renderTick?:number,
) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.a);
  ctx.lineJoin = 'round';
  for (const [index,barrel] of cls.barrels.entries()) {
    ctx.save();
    ctx.rotate(barrel.angle);
    const width = barrel.width * scale * BARREL_WIDTH_MUL;
    const shot=player.shots?.[index];const age=shot==null||renderTick==null?99:(renderTick-shot)/SERVER_TICK_HZ;
    const kick=age>=0&&age<0.16?(1-age/0.16)*5*scale:0;
    const length = Math.max(5,barrel.length * scale-kick);
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
    if(age>=0&&age<0.085){ctx.save();ctx.globalAlpha=1-age/0.085;ctx.fillStyle='#fff1a1';ctx.strokeStyle='#e4ac4d';ctx.lineWidth=1.5*scale;const y=barrel.offset*scale;ctx.beginPath();ctx.moveTo(length,y-width*0.25);ctx.lineTo(length+width*0.72,y);ctx.lineTo(length,y+width*0.25);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    ctx.restore();
  }
  ctx.restore();
}

function drawTank(ctx: CanvasRenderingContext2D, player: PlayerSnap, mine: boolean,renderTick?:number) {
  const palette = player.team ? TEAM_COLOURS[player.team] : player.skin&&player.skin!=='default' ? TANK_SKINS[player.skin]??(mine?ME:FOE) : mine ? ME : FOE;
  const cls = CLASSES[player.cls] ?? CLASSES[0];
  const scale = player.r / PLAYER_BASE_RADIUS;
  ctx.save(); // Keep the whole tank draw isolated from the arena camera state.
  ctx.save(); // Fade barrels/turrets independently; the body and labels remain fully readable.
  ctx.globalAlpha *= Math.max(0.04, Math.min(1, player.vis ?? 1));

  // Main barrels sit beneath the hull first, so their roots blend naturally into it.
  drawBarrels(ctx, player, cls, scale,renderTick);

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
  if (player.prot || player.powerups?.shield) {
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
