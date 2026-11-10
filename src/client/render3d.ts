import {
  ARENA_SIZE, SURVIVAL_ARENA_SIZE, CLASSES, SHAPES, TEAM_BASE_DEPTH,
} from '../shared/config';
import type { View } from './render';

type V3 = [number, number, number];
type RGB = [number, number, number];

const colourCache = new Map<string, RGB>();
function colour(hex: string): RGB {
  const key = hex.toLowerCase();
  const cached = colourCache.get(key);
  if (cached) return cached;
  const value = key.replace('#', '');
  const rgb: RGB = [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
  colourCache.set(key, rgb);
  return rgb;
}

function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: V3): V3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}
function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}
function lookAt(eye: V3, target: V3): Float32Array {
  const z = normalize(sub(eye, target));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -dot(x, eye); out[13] = -dot(y, eye); out[14] = -dot(z, eye); out[15] = 1;
  return out;
}
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
    out[col * 4 + row] =
      a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] +
      a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
  }
  return out;
}

class Geometry {
  data: number[] = [];

  triangle(a: V3, b: V3, c: V3, tint: RGB) {
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    for (const point of [a, b, c]) {
      this.data.push(point[0], point[1], point[2], normal[0], normal[1], normal[2], tint[0], tint[1], tint[2]);
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, tint: RGB) {
    this.triangle(a, b, c, tint);
    this.triangle(a, c, d, tint);
  }
  floorRect(cx: number, cz: number, length: number, width: number, y: number, tint: RGB) {
    const x0 = cx - length / 2, x1 = cx + length / 2;
    const z0 = cz - width / 2, z1 = cz + width / 2;
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], tint);
  }
  box(cx: number, cz: number, angle: number, length: number, width: number, bottom: number, height: number, tint: RGB) {
    const fx = Math.cos(angle), fz = Math.sin(angle);
    const sx = -fz, sz = fx;
    const point = (forward: number, side: number, y: number): V3 => [
      cx + fx * forward + sx * side, y, cz + fz * forward + sz * side,
    ];
    const flb = point(length / 2, -width / 2, bottom);
    const frb = point(length / 2, width / 2, bottom);
    const blb = point(-length / 2, -width / 2, bottom);
    const brb = point(-length / 2, width / 2, bottom);
    const flt = point(length / 2, -width / 2, bottom + height);
    const frt = point(length / 2, width / 2, bottom + height);
    const blt = point(-length / 2, -width / 2, bottom + height);
    const brt = point(-length / 2, width / 2, bottom + height);
    this.quad(blt, brt, frt, flt, tint);
    this.quad(blb, flb, frb, brb, tint);
    this.quad(flb, flt, frt, frb, tint);
    this.quad(brb, brt, blt, blb, tint);
    this.quad(blb, blt, flt, flb, tint);
    this.quad(frb, frt, brt, brb, tint);
  }
  cylinder(cx: number, cz: number, radius: number, bottom: number, height: number, sides: number, tint: RGB) {
    const low: V3[] = [], high: V3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      low.push([cx + Math.cos(a) * radius, bottom, cz + Math.sin(a) * radius]);
      high.push([cx + Math.cos(a) * radius, bottom + height, cz + Math.sin(a) * radius]);
    }
    const top: V3 = [cx, bottom + height, cz], base: V3 = [cx, bottom, cz];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.triangle(top, high[j], high[i], tint);
      this.triangle(base, low[i], low[j], tint);
      this.quad(low[i], low[j], high[j], high[i], tint);
    }
  }
  sphere(cx: number, cy: number, cz: number, radius: number, tint: RGB, segments = 8, rings = 5) {
    for (let lat = 0; lat < rings; lat++) {
      const a0 = -Math.PI / 2 + (lat / rings) * Math.PI;
      const a1 = -Math.PI / 2 + ((lat + 1) / rings) * Math.PI;
      for (let lon = 0; lon < segments; lon++) {
        const b0 = (lon / segments) * Math.PI * 2;
        const b1 = ((lon + 1) / segments) * Math.PI * 2;
        const p = (a: number, b: number): V3 => [
          cx + Math.cos(a) * Math.cos(b) * radius,
          cy + Math.sin(a) * radius,
          cz + Math.cos(a) * Math.sin(b) * radius,
        ];
        const p00 = p(a0, b0), p01 = p(a0, b1), p10 = p(a1, b0), p11 = p(a1, b1);
        this.triangle(p00, p01, p11, tint);
        this.triangle(p00, p11, p10, tint);
      }
    }
  }
  prism(cx: number, cz: number, radius: number, sides: number, rotation: number, height: number, tint: RGB) {
    const bottom: V3[] = [], top: V3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = rotation + (i / sides) * Math.PI * 2;
      bottom.push([cx + Math.cos(a) * radius, 0, cz + Math.sin(a) * radius]);
      top.push([cx + Math.cos(a) * radius, height, cz + Math.sin(a) * radius]);
    }
    const center: V3 = [cx, height, cz];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.triangle(center, top[j], top[i], tint);
      this.quad(bottom[i], bottom[j], top[j], top[i], tint);
    }
  }
  flatRing(cx: number, cz: number, radius: number, width: number, y: number, tint: RGB, segments = 64) {
    const outer = radius + width / 2, inner = Math.max(0, radius - width / 2);
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const point = (r: number, a: number): V3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      this.quad(point(outer, a0), point(inner, a0), point(inner, a1), point(outer, a1), tint);
    }
  }
  flatBar(cx: number, cz: number, angle: number, length: number, width: number, y: number, tint: RGB) {
    const fx = Math.cos(angle), fz = Math.sin(angle), sx = -fz, sz = fx;
    const point = (forward: number, side: number): V3 =>
      [cx + fx * forward + sx * side, y, cz + fz * forward + sz * side];
    this.quad(point(-length / 2, -width / 2), point(-length / 2, width / 2),
      point(length / 2, width / 2), point(length / 2, -width / 2), tint);
  }
  ring(cx: number, cz: number, radius: number, width: number, y: number, tint: RGB, segments = 24) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const mid = a + Math.PI / segments;
      const x = cx + Math.cos(mid) * radius, z = cz + Math.sin(mid) * radius;
      this.box(x, z, mid + Math.PI / 2, (2 * Math.PI * radius) / segments * 1.12, width, y, 2, tint);
    }
  }
  bar(cx: number, cz: number, y: number, length: number, fraction: number, tint: RGB) {
    this.floorRect(cx, cz, length, 5, y, colour('#141b22'));
    if (fraction > 0) this.floorRect(cx - length / 2 + (length * fraction) / 2, cz, Math.max(1, length * fraction), 4, y + 0.8, tint);
  }
}

const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uMvp;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLight;
void main() {
  gl_Position = uMvp * vec4(aPosition, 1.0);
  vec3 n = normalize(aNormal);
  vec3 key = normalize(vec3(-0.48, 0.86, 0.28));
  vec3 fill = normalize(vec3(0.62, 0.28, -0.54));
  vLight = 0.34 + max(dot(n, key), 0.0) * 0.72 + max(dot(n, fill), 0.0) * 0.16;
  vColor = aColor;
  vWorld = aPosition;
  vNormal = n;
}`;
const fragmentShader = `
precision mediump float;
uniform vec3 uEye;
uniform vec2 uArenaCenter;
uniform float uTime;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLight;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(uEye - vWorld);
  vec3 lightDir = normalize(vec3(-0.48, 0.86, 0.28));
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(n, halfDir), 0.0), 26.0) * 0.28;
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6) * 0.16;
  vec3 base = vColor;

  // Engraved slate tiles, repeating summoning rings and subtle ley lines.
  if (n.y > 0.92 && vWorld.y < -4.5) {
    vec2 tile = mod(vWorld.xz + vec2(90.0), 180.0) - 90.0;
    float seamDist = min(abs(abs(tile.x) - 87.0), abs(abs(tile.y) - 87.0));
    float seams = 1.0 - smoothstep(0.8, 2.1, seamDist);
    float circleDist = abs(length(tile) - 50.0);
    float rune = 1.0 - smoothstep(1.0, 2.8, circleDist);
    float crossMark = 1.0 - smoothstep(1.0, 2.3, min(abs(tile.x), abs(tile.y)));
    vec2 fromHeart = vWorld.xz - uArenaCenter;
    float radial = exp(-dot(fromHeart, fromHeart) / 1700000.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 0.75 + length(fromHeart) * 0.012);
    vec3 slate = base * vec3(0.58, 0.66, 1.10);
    slate += vec3(0.035, 0.09, 0.15) * seams;
    slate += vec3(0.08, 0.045, 0.16) * rune;
    slate += vec3(0.018, 0.055, 0.09) * crossMark;
    slate += vec3(0.045, 0.025, 0.12) * radial * pulse;
    base = slate;
  }

  vec3 lit = base * vLight + vec3(specular + rim) + max(base - vec3(0.72), 0.0) * 0.12;
  gl_FragColor = vec4(lit, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate WebGL shader');
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
    gl.deleteShader(shader); throw new Error(message);
  }
  return shader;
}

const zombieColours: Record<string, { body: string; trim: string }> = {
  shambler: { body: '#456c48', trim: '#b9dd85' },
  runner: { body: '#a96f3c', trim: '#ffe09a' },
  tank: { body: '#4d566c', trim: '#bac5de' },
  ranger: { body: '#356b91', trim: '#8fe7ff' },
  guardian: { body: '#287f80', trim: '#9cfff0' },
  bomber: { body: '#9d3c42', trim: '#ffc080' },
  leaper: { body: '#a35a94', trim: '#ffc2ed' },
  armoured: { body: '#51546c', trim: '#e4d5ff' },
  medic: { body: '#61a77b', trim: '#d7ffe4' },
  exploder: { body: '#c65a3a', trim: '#ff9a5b' },
  splitter: { body: '#ad7446', trim: '#ffd09a' },
  stalker: { body: '#505a7e', trim: '#aab7ff' },
  commander: { body: '#a37d3d', trim: '#ffe08a' },
};
const bossColours: Record<string, { body: string; trim: string }> = {
  breaker: { body: '#a84a43', trim: '#ffc17a' },
  spitter: { body: '#6c964f', trim: '#d4f47a' },
  summoner: { body: '#66518d', trim: '#d2aaff' },
  colossus: { body: '#77706a', trim: '#ffd49b' },
  nestMother: { body: '#766044', trim: '#f4c87b' },
  lich: { body: '#6855a4', trim: '#c8aaff' },
  devourer: { body: '#773d3d', trim: '#ff9a6b' },
  abomination: { body: '#8e4b62', trim: '#ffb0c7' },
};

export class Arena3D {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly mvpLocation: WebGLUniformLocation;
  private readonly positionLocation: number;
  private readonly normalLocation: number;
  private readonly colourLocation: number;
  private readonly eyeLocation: WebGLUniformLocation;
  private readonly arenaCenterLocation: WebGLUniformLocation;
  private readonly timeLocation: WebGLUniformLocation;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL is unavailable in this browser');
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to allocate WebGL program');
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL program link failed');
    this.program = program;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Unable to allocate WebGL buffer');
    this.buffer = buffer;
    this.mvpLocation = gl.getUniformLocation(program, 'uMvp')!;
    this.positionLocation = gl.getAttribLocation(program, 'aPosition');
    this.normalLocation = gl.getAttribLocation(program, 'aNormal');
    this.colourLocation = gl.getAttribLocation(program, 'aColor');
    this.eyeLocation = gl.getUniformLocation(program, 'uEye')!;
    this.arenaCenterLocation = gl.getUniformLocation(program, 'uArenaCenter')!;
    this.timeLocation = gl.getUniformLocation(program, 'uTime')!;
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
  }

  resize(width: number, height: number) {
    this.canvas.width = width; this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(view: View, selfId: number, camera: { x: number; y: number }, fovMul = 1) {
    const gl = this.gl;
    const size = view.mode === 'survival' ? SURVIVAL_ARENA_SIZE : ARENA_SIZE;
    const geometry = new Geometry();
    const floor = colour('#171a31'), grid = colour('#35405f'), edge = colour('#9477aa');
    const now = performance.now() / 1000;

    geometry.floorRect(size / 2, size / 2, size, size, -5, floor);
    for (let x = 0; x <= size; x += 180) geometry.floorRect(x, size / 2, 1.4, size, -4, grid);
    for (let z = 0; z <= size; z += 180) geometry.floorRect(size / 2, z, size, 1.4, -4, grid);
    const wall = colour('#40365c'), gold = colour('#e6bd79'), violet = colour('#8764ce');
    geometry.box(size / 2, 0, 0, size + 28, 24, -1, 46, wall);
    geometry.box(size / 2, size, 0, size + 28, 24, -1, 46, wall);
    geometry.box(0, size / 2, Math.PI / 2, size + 28, 24, -1, 46, wall);
    geometry.box(size, size / 2, Math.PI / 2, size + 28, 24, -1, 46, wall);
    geometry.flatRing(size / 2, size / 2, size * 0.486, 8, -2.7, gold, 128);
    geometry.flatRing(size / 2, size / 2, size * 0.468, 2.2, -2.6, violet, 128);
    geometry.flatRing(camera.x, camera.y, 236, 2.4, -2.8, colour('#8062c8'), 72);
    geometry.flatRing(camera.x, camera.y, 252, 1.1, -2.7, colour('#c9a56e'), 72);
    geometry.flatRing(camera.x, camera.y, 174, 1.1, -2.9, colour('#465eaa'), 64);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + now * 0.012;
      const markX = camera.x + Math.cos(a) * 244;
      const markZ = camera.y + Math.sin(a) * 244;
      geometry.flatBar(markX, markZ, a, 18, 3, -2.65, gold);
      geometry.prism(camera.x + Math.cos(a) * 174, camera.y + Math.sin(a) * 174,
        5.5, 4, a + now * 0.08, 12, violet);
    }
    for (let x = 360; x < size; x += 640) for (let z = 360; z < size; z += 640) {
      if (Math.hypot(x - camera.x, z - camera.y) < 370) continue;
      geometry.cylinder(x, z, 15, -4, 7, 8, colour('#51456d'));
      geometry.flatRing(x, z, 18, 2.2, 3.2, gold, 24);
      geometry.prism(x, z, 10, 6, now * 0.09 + (x + z) * 0.001, 54, violet);
      geometry.sphere(x, 59, z, 4.2, colour('#d8b7ff'), 6, 4);
    }

    if (view.mode === 'teams') {
      geometry.floorRect(TEAM_BASE_DEPTH / 2, size / 2, TEAM_BASE_DEPTH, size, -3, colour('#174967'));
      geometry.floorRect(size - TEAM_BASE_DEPTH / 2, size / 2, TEAM_BASE_DEPTH, size, -3, colour('#612f3b'));
      geometry.floorRect(size / 2, size / 2, 5, size, -2.5, colour('#b9c9d0'));
      geometry.box(TEAM_BASE_DEPTH, size / 2, Math.PI / 2, 5, size, -1, 15, colour('#3194ce'));
      geometry.box(size - TEAM_BASE_DEPTH, size / 2, Math.PI / 2, 5, size, -1, 15, colour('#d34c5b'));
    }

    // Map geometry: polygonal 3D props replace the old flat sprites.
    for (const shape of view.shapes) {
      const def = Object.values(SHAPES)[shape[4]] ?? Object.values(SHAPES)[0];
      const tint = colour(def.color);
      geometry.cylinder(shape[1], shape[2], def.radius * 0.88, -2, 4, Math.max(8, def.sides * 2), colour('#34314e'));
      geometry.flatRing(shape[1], shape[2], def.radius * 0.98, 2.8, 2.1, colour('#b89a69'), def.sides * 4);
      geometry.prism(shape[1], shape[2], def.radius, def.sides, shape[3], 15 + def.radius * 0.22, tint);
      geometry.ring(shape[1], shape[2], def.radius * 0.96, 2, 0.8, colour(def.stroke), def.sides * 2);
      geometry.sphere(shape[1], 17 + def.radius * 0.22, shape[2], Math.max(4, def.radius * 0.12), colour('#f5d99b'), 6, 4);
      geometry.bar(shape[1], shape[2], 28 + def.radius * 0.22, def.radius * 1.9, Math.max(0, Math.min(1, shape[5])), colour('#a9ed79'));
    }

    for (const pool of view.pools) {
      geometry.cylinder(pool.x, pool.y, pool.r, -2, 1.2, 24, colour('#a64237'));
      geometry.ring(pool.x, pool.y, pool.r * 0.9, 3, 0, colour('#ff8a56'));
    }
    for (const drop of view.xpDrops) {
      const bob = 14 + Math.sin(now * 3 + drop.id) * 3;
      geometry.flatRing(drop.x, drop.y, drop.r * 1.7, 1.6, -2.5, colour('#c99b48'), 20);
      geometry.prism(drop.x, drop.y, Math.max(6, drop.r * 0.88), 6, now * 0.65 + drop.id, bob + 10, colour('#f2c96c'));
      geometry.prism(drop.x, drop.y, Math.max(3, drop.r * 0.42), 4, -now * 0.8, bob + 19, colour('#fff0b1'));
      geometry.sphere(drop.x, bob + 18, drop.y, Math.max(2, drop.r * 0.2), colour('#fff6ce'), 6, 4);
    }
    for (const drop of view.healthDrops) {
      const bob = 12 + Math.sin(now * 3 + drop.id) * 2.5;
      geometry.flatRing(drop.x, drop.y, drop.r * 1.8, 2, -2.4, colour('#4dba89'), 24);
      geometry.prism(drop.x, drop.y, Math.max(7, drop.r * 0.92), 5, Math.PI / 4, bob + 8, colour('#42b985'));
      geometry.sphere(drop.x, bob + 10, drop.y, Math.max(4, drop.r * 0.55), colour('#c8ffe1'), 7, 4);
      geometry.box(drop.x, drop.y, 0, drop.r * 1.05, drop.r * 0.22, bob + 9, 3, colour('#effff4'));
      geometry.box(drop.x, drop.y, Math.PI / 2, drop.r * 1.05, drop.r * 0.22, bob + 9, 3, colour('#effff4'));
    }

    // Zombie silhouettes and boss scale make threats readable at a glance.
    for (const zombie of view.zombies) {
      if (zombie.visibility < 0.08) continue;
      const boss = zombie.bossKind !== null;
      const palette = boss
        ? bossColours[zombie.bossKind!] ?? bossColours.breaker
        : zombieColours[zombie.kind] ?? zombieColours.shambler;
      const r = zombie.r * (boss ? 1.12 : 1);
      geometry.flatRing(zombie.x, zombie.y, r * (boss ? 1.62 : 1.18), boss ? 5 : 2.2, -2.8,
        colour(boss ? '#9c69dc' : '#597d64'), boss ? 48 : 28);
      geometry.cylinder(zombie.x, zombie.y, r * 0.82, 0, r * 0.66, boss ? 14 : 10, colour(palette.body));
      geometry.sphere(zombie.x, r * 0.62, zombie.y, r * 0.78, colour(palette.body), boss ? 12 : 8, 6);
      geometry.sphere(zombie.x, r * 1.12, zombie.y, r * 0.18, colour(palette.trim), 7, 4);
      geometry.sphere(zombie.x + Math.cos(zombie.angle) * r * 0.58, r * 0.76, zombie.y + Math.sin(zombie.angle) * r * 0.58,
        Math.max(3, r * 0.18), colour(palette.trim), 6, 4);
      if (boss) {
        geometry.ring(zombie.x, zombie.y, r * 1.38, 4, 1, colour(palette.trim));
        geometry.prism(zombie.x, zombie.y, r * 0.32, 5, now * 0.3, r * 1.9, colour(palette.trim));
        for (let spike = 0; spike < 6; spike++) {
          const a = (spike / 6) * Math.PI * 2 + now * 0.12;
          geometry.prism(zombie.x + Math.cos(a) * r * 0.72, zombie.y + Math.sin(a) * r * 0.72,
            r * 0.16, 4, a, r * 0.92, colour(palette.trim));
        }
      } else if (zombie.kind === 'armoured' || zombie.kind === 'guardian') {
        geometry.ring(zombie.x, zombie.y, r * 1.35, 4, 1, colour(palette.trim));
      } else if (zombie.kind === 'medic') {
        geometry.box(zombie.x, zombie.y, 0, r * 1.3, r * 0.28, r * 0.72, 5, colour('#eafff0'));
        geometry.box(zombie.x, zombie.y, Math.PI / 2, r * 1.3, r * 0.28, r * 0.72, 5, colour('#eafff0'));
      } else if (zombie.kind === 'exploder' && Math.sin(now * 9) > -0.25) {
        geometry.ring(zombie.x, zombie.y, r * 1.45, 3, 1, colour('#ff9a5b'));
      }
      if (zombie.specialPhase === 'windup' || zombie.bossPhase === 'windup') {
        const pulse = 1 + 0.12 * Math.sin(now * 16);
        geometry.ring(zombie.x, zombie.y, r * 1.7 * pulse, 5, 2, colour('#ff4655'));
      }
      if (zombie.bossPhase === 'charge') geometry.ring(zombie.x, zombie.y, r * 1.55, 5, 2, colour('#ff754c'));
      geometry.bar(zombie.x, zombie.y, r * 1.8 + 8, r * 2.1, Math.max(0, Math.min(1, zombie.hp / zombie.mhp)), colour('#8be070'));
    }

    const downedIds = new Set(view.downed.map((player) => player.id));
    for (const downed of view.downed) {
      geometry.cylinder(downed.x, downed.y, downed.r, 0, 4, 12, colour('#8b4e50'));
      geometry.ring(downed.x, downed.y, downed.r * 1.35, 4, 1, colour('#ffc26c'));
      geometry.bar(downed.x, downed.y, 20, downed.r * 2, Math.max(0, downed.reviveProgress), colour('#ffc26c'));
    }

    const playersById = new Map(view.players.map((p) => [p.id, p]));
    // Projectiles are batched into one GPU submission; even large drone volleys stay inexpensive.
    for (const bullet of view.bullets) {
      const [, x, z, radius, ownerId, kind, angle, droneState = 0] = bullet;
      const owner = playersById.get(ownerId);
      const mine = ownerId === selfId;
      const tint = owner?.team === 'blue' ? colour('#3fbaff')
        : owner?.team === 'red' ? colour('#fa6672')
          : mine ? colour('#42d5f5') : colour('#ff7278');
      if (kind === 2) {
        geometry.prism(x, z, radius * 1.05, 4, Math.PI / 4, Math.max(6, radius * 0.5), colour('#f3c56b'));
      } else if (kind === 1) {
        geometry.sphere(x, 15, z, radius * 1.05, colour('#e3f5ff'), 7, 4);
        geometry.ring(x, z, radius * 1.2, 1.8, 8, colour('#7adfff'), 10);
      } else if (kind === 3 || kind === 4) {
        geometry.box(x, z, angle, radius * 3.1, radius * 0.72, 6, radius * 0.8, kind === 3 ? colour('#ffc36a') : colour('#fff0a0'));
        geometry.sphere(x + Math.cos(angle) * radius * 1.5, 9, z + Math.sin(angle) * radius * 1.5,
          radius * 0.65, colour('#ff8d4f'), 6, 3);
      } else {
        geometry.sphere(x, 8, z, Math.max(3.5, radius * 0.72), tint, 7, 4);
      }
      if (owner && CLASSES[owner.cls]?.id === 'overlord' && kind === 1) {
        const dx = x - owner.x, dz = z - owner.y, distance = Math.hypot(dx, dz);
        const tension = Math.max(0, Math.min(1, (distance - 260) / 220));
        if (tension > 0.08) {
          geometry.box((x + owner.x) / 2, (z + owner.y) / 2, Math.atan2(dz, dx),
            distance, 1.4 + tension * 1.5, 10, 1.5,
            tension > 0.72 ? colour('#ff705f') : colour('#62cdeb'));
        }
      }
      if (droneState === 1 || droneState === 2) {
        geometry.box(x - Math.cos(angle) * radius * 1.8, z - Math.sin(angle) * radius * 1.8, angle,
          radius * 2.6, 2.4, 9, 1.5, droneState === 1 ? colour('#8fe5ff') : colour('#ffd29a'));
      }
    }

    const tanks = view.players;
    for (const player of tanks) {
      if (downedIds.has(player.id)) continue;
      const mine = player.id === selfId;
      const body = player.team === 'blue' ? '#257fae'
        : player.team === 'red' ? '#a93e59'
          : mine ? '#168ea9' : '#a94361';
      const trim = player.team === 'blue' ? '#9cecff'
        : player.team === 'red' ? '#ffd0a3'
          : mine ? '#a4f7ff' : '#ffb7d0';
      const dark = player.team === 'blue' ? '#173951'
        : player.team === 'red' ? '#49243c'
          : mine ? '#123d50' : '#48243b';
      const radius = player.r;
      const cls = CLASSES[player.cls];
      const angle = player.a;
      const aura = player.team === 'red' ? '#d36a9a' : player.team === 'blue' ? '#62d8ff' : mine ? '#65edff' : '#e987af';
      geometry.flatRing(player.x, player.y, radius * 1.28, 2.2, -2.7, colour(aura), 32);
      geometry.flatRing(player.x, player.y, radius * 0.78, 1, -2.65, colour('#c7a46c'), 28);
      geometry.ring(player.x, player.y, radius * 0.98, 2, 0.8, colour(dark), 24);
      geometry.box(player.x, player.y, angle + Math.PI / 2, radius * 1.82, radius * 0.4, 0, 10, colour(dark));
      geometry.box(player.x, player.y, angle - Math.PI / 2, radius * 1.82, radius * 0.4, 0, 10, colour(dark));
      for (let tread = -2; tread <= 2; tread++) {
        const forward = tread * radius * 0.29;
        for (const side of [-radius * 0.73, radius * 0.73]) {
          const tx = player.x + Math.cos(angle) * forward - Math.sin(angle) * side;
          const tz = player.y + Math.sin(angle) * forward + Math.cos(angle) * side;
          geometry.box(tx, tz, angle, radius * 0.22, radius * 0.31, 2, 3, colour('#8f9aaa'));
        }
      }
      geometry.cylinder(player.x, player.y, radius * 0.88, 3, 15, 16, colour(dark));
      geometry.cylinder(player.x, player.y, radius * 0.78, 14, 11, 16, colour(body));
      geometry.flatRing(player.x, player.y, radius * 0.48, 2.3, 25, colour('#d9b879'), 24);
      geometry.cylinder(player.x, player.y, radius * 0.42, 24, 6, 12, colour(trim));
      geometry.sphere(player.x, 31 + Math.sin(now * 2.4 + player.id) * 1.2, player.y,
        radius * 0.2, colour(aura), 8, 5);
      geometry.sphere(player.x, 32 + Math.sin(now * 2.4 + player.id) * 1.2, player.y,
        radius * 0.085, colour('#fff1c7'), 7, 4);
      if (cls?.barrels.length) for (const barrel of cls.barrels) {
        const direction = angle + barrel.angle;
        const side = barrel.offset;
        const barrelX = player.x - Math.sin(direction) * side;
        const barrelZ = player.y + Math.cos(direction) * side;
        const length = barrel.length + radius * 0.42;
        const centerDistance = radius * 0.25 + barrel.length * 0.42;
        geometry.box(barrelX + Math.cos(direction) * centerDistance, barrelZ + Math.sin(direction) * centerDistance,
          direction, length, Math.max(7, barrel.width), 17, 13, colour('#aebdc7'));
        geometry.box(barrelX + Math.cos(direction) * centerDistance, barrelZ + Math.sin(direction) * centerDistance,
          direction, length * 0.82, Math.max(3, barrel.width * 0.45), 27, 2.5, colour('#e2edf2'));
        const muzzleX = barrelX + Math.cos(direction) * (centerDistance + length * 0.48);
        const muzzleZ = barrelZ + Math.sin(direction) * (centerDistance + length * 0.48);
        geometry.box(muzzleX, muzzleZ, direction, Math.max(5, barrel.width * 0.22), Math.max(9, barrel.width * 1.12),
          17, 13, colour('#d8b879'));
      }
      const turretCount = cls?.turretCount ?? 0;
      for (let i = 0; i < turretCount; i++) {
        const direction = (i / turretCount) * Math.PI * 2 + angle * 0.18;
        const tx = player.x + Math.cos(direction) * radius * 0.46;
        const tz = player.y + Math.sin(direction) * radius * 0.46;
        geometry.cylinder(tx, tz, radius * 0.3, 23, 6, 10, colour(dark));
        geometry.box(tx + Math.cos(direction) * radius * 0.44, tz + Math.sin(direction) * radius * 0.44,
          direction, radius * 0.95, radius * 0.2, 26, 7, colour('#c2cbd0'));
      }
      geometry.bar(player.x, player.y, 48, radius * 2.1, Math.max(0, Math.min(1, player.hp / player.mhp)), colour('#8be070'));
    }

    // Upload all triangles once, then render the scene in a single call.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = Math.max(0.1, this.canvas.width / Math.max(1, this.canvas.height));
    const zoom = Math.max(0.82, Math.min(1.65, fovMul));
    const height = 1420 * zoom;
    const back = 1120 * zoom;
    const eye: V3 = [camera.x, height, camera.y + back];
    const target: V3 = [camera.x, 0, camera.y];
    const viewMatrix = lookAt(eye, target);
    const projection = perspective((48 * Math.PI / 180) / Math.max(0.75, fovMul), aspect, 8, 9000);
    const mvp = multiply(projection, viewMatrix);

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.data), gl.DYNAMIC_DRAW);
    const stride = 9 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.normalLocation);
    gl.vertexAttribPointer(this.normalLocation, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(this.colourLocation);
    gl.vertexAttribPointer(this.colourLocation, 3, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
    gl.uniformMatrix4fv(this.mvpLocation, false, mvp);
    gl.uniform3f(this.eyeLocation, eye[0], eye[1], eye[2]);
    gl.uniform2f(this.arenaCenterLocation, size / 2, size / 2);
    gl.uniform1f(this.timeLocation, now);
    gl.drawArrays(gl.TRIANGLES, 0, geometry.data.length / 9);
  }
}
