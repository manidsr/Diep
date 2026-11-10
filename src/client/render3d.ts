import {
  ARENA_SIZE, SURVIVAL_ARENA_SIZE, CLASSES, SHAPES,
} from '../shared/config';
import type { View } from './render';

declare const THREE: any;

type Visual = { group: any; [key: string]: any };

const ZOMBIE_PALETTE: Record<string, string> = {
  shambler: '#688e4d', runner: '#b98745', tank: '#64717b', ranger: '#468ca3',
  guardian: '#31a49a', bomber: '#bf6048', leaper: '#95619d', armoured: '#66717d',
  medic: '#68a77b', exploder: '#bf543e', splitter: '#ad774e', stalker: '#525e82',
  commander: '#b28b42',
};
const BOSS_PALETTE: Record<string, string> = {
  breaker: '#9f5148', spitter: '#759747', summoner: '#755a9c', colossus: '#777477',
  nestMother: '#907047', lich: '#6658a5', devourer: '#783d49', abomination: '#9a536e',
};

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function tankArchetype(cls: any): 'rammer' | 'drone' | 'trapper' | 'artillery' | 'scout' | 'sniper' | 'auto' | 'heavy' | 'rapid' | 'standard' {
  const id = cls?.id || 'basic';
  const barrels = cls?.barrels || [];
  if (cls?.smasher) return 'rammer';
  if (cls?.droneBehavior) return 'drone';
  if (barrels.some((barrel: any) => barrel.projectile === 'trap')) return 'trapper';
  if (barrels.some((barrel: any) => barrel.projectile === 'missile' || barrel.projectile === 'firework')) return 'artillery';
  if (['triAngle', 'booster', 'fighter'].includes(id)) return 'scout';
  if (cls?.specialty === 'sniper' || barrels.some((barrel: any) => barrel.length >= 58)) return 'sniper';
  if ((cls?.turretCount || 0) > 0) return 'auto';
  if (cls?.specialty === 'heavyArtillery' || (cls?.damageMul || 1) >= 1.7 || barrels.some((barrel: any) => barrel.width >= 30)) return 'heavy';
  if (['rapidFire', 'scatter', 'closeQuarters'].includes(cls?.specialty) || barrels.length >= 4) return 'rapid';
  return 'standard';
}

export class Arena3D {
  private readonly renderer: any;
  private readonly scene: any;
  private readonly camera: any;
  private readonly materials = new Map<string, any>();
  private readonly players = new Map<number, Visual>();
  private readonly zombies = new Map<number, Visual>();
  private readonly shapes = new Map<number, Visual>();
  private readonly bullets = new Map<number, Visual>();
  private readonly xpDrops = new Map<number, Visual>();
  private readonly healthDrops = new Map<number, Visual>();
  private readonly pools = new Map<number, Visual>();
  private readonly downed = new Map<number, Visual>();
  private readonly clock = new THREE.Clock();
  private forestGroups: any[] = [];
  private natureModels: any[] = [];
  private natureLoad: Promise<void> | null = null;
  private width = 1;
  private height = 1;
  private arenaSize = ARENA_SIZE;
  private readonly groundHeight = (x: number, z: number): number =>
    -7 + Math.sin(x * 0.0018) * 1.8 + Math.cos(z * 0.0021) * 1.35 +
    Math.sin((x + z) * 0.0037) * 0.75 + Math.cos((x - z) * 0.0029) * 0.55;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9bc9e7');
    this.scene.fog = new THREE.Fog(0xb5cbb9, 1900, 5900);
    this.camera = new THREE.PerspectiveCamera(53, 1, 1, 9000);
    this.createLighting();
    this.createEnvironment(ARENA_SIZE);
  }

  private material(color: string, options: Record<string, unknown> = {}): any {
    const key = color + ':' + JSON.stringify(options);
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0.08,
        flatShading: true,
        ...options,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private glow(color: string, intensity = 1.3): any {
    return this.material(color, {
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.12,
    });
  }

  private mesh(parent: any, geometry: any, material: any, x = 0, y = 0, z = 0): any {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  private createLighting() {
    const hemisphere = new THREE.HemisphereLight(0xe4f2ff, 0x4a5b3b, 1.55);
    this.scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0xffe4c0, 0.24);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe2b5, 2.45);
    sun.position.set(-900, 1650, 1050);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -2300;
    sun.shadow.camera.right = 2300;
    sun.shadow.camera.top = 2300;
    sun.shadow.camera.bottom = -2300;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 5200;
    sun.shadow.bias = -0.00022;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private makeGroundTexture(size: number): any {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rand = seeded(24891);
    const base = ctx.createLinearGradient(0, 0, 1024, 1024);
    base.addColorStop(0, '#718b4e');
    base.addColorStop(0.48, '#587b43');
    base.addColorStop(1, '#8a8750');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 820; i++) {
      const x = rand() * 1024, y = rand() * 1024;
      const r = 8 + rand() * 52;
      const colours = ['#87965a', '#9c985f', '#526f43', '#496a4a', '#a18c5e', '#6d8950'];
      ctx.globalAlpha = 0.07 + rand() * 0.13;
      ctx.fillStyle = colours[Math.floor(rand() * colours.length)];
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.6 + rand()), r * (0.4 + rand()), rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 18000; i++) {
      const x = rand() * 1024, y = rand() * 1024;
      const len = 1.5 + rand() * 6;
      ctx.strokeStyle = rand() > 0.5 ? '#c1bd78' : '#284f37';
      ctx.lineWidth = 0.5 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 2.5, y - len);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.82;
    for (let i = 0; i < 190; i++) {
      const x = rand() * 1024, y = rand() * 1024;
      ctx.fillStyle = rand() > 0.5 ? '#dfd18a' : '#e4e0be';
      ctx.beginPath();
      ctx.arc(x, y, 1.1 + rand() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private createTerrain(size: number) {
    const worldSize = size + 1500;
    const segments = 112;
    const half = worldSize / 2;
    const center = size / 2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let iz = 0; iz <= segments; iz++) {
      for (let ix = 0; ix <= segments; ix++) {
        const x = center - half + (ix / segments) * worldSize;
        const z = center - half + (iz / segments) * worldSize;
        positions.push(x, this.groundHeight(x, z), z);
        uvs.push(ix / segments, iz / segments);
      }
    }
    for (let iz = 0; iz < segments; iz++) for (let ix = 0; ix < segments; ix++) {
      const a = iz * (segments + 1) + ix;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const texture = this.makeGroundTexture(size);
    const ground = this.mesh(this.scene, geometry,
      new THREE.MeshStandardMaterial({ map: texture, color: '#ffffff', roughness: 1, metalness: 0 }));
    ground.receiveShadow = true;
  }

  private createTree(x: number, z: number, variant: number, rand: () => number) {
    const group = new THREE.Group();
    this.forestGroups.push(group);
    group.position.set(x, this.groundHeight(x, z), z);
    group.rotation.y = rand() * Math.PI * 2;
    const scale = 0.72 + rand() * 0.68;
    group.scale.setScalar(scale);
    const trunk = this.material('#765036');
    const bark = this.material('#987047');
    const greens = ['#406b3d', '#527d43', '#6d914f', '#48724c', '#7d9c57'];
    const leaves = this.material(greens[variant % greens.length]);
    const lightLeaves = this.material('#9aaa61');
    this.mesh(group, new THREE.CylinderGeometry(5, 8, 52, 7), trunk, 0, 26, 0);
    this.mesh(group, new THREE.CylinderGeometry(2, 4, 34, 6), bark, 0, 48, 0);

    if (variant % 3 === 0) {
      this.mesh(group, new THREE.ConeGeometry(45, 78, 7), leaves, 0, 75, 0);
      this.mesh(group, new THREE.ConeGeometry(36, 69, 7), leaves, 0, 120, 0);
      this.mesh(group, new THREE.ConeGeometry(25, 60, 7), lightLeaves, 0, 162, 0);
    } else {
      const canopy = [
        [-22, 72, 0, 37], [22, 78, 4, 38], [0, 94, -22, 39],
        [-6, 104, 20, 34], [0, 126, 0, 35],
      ];
      for (let i = 0; i < canopy.length; i++) {
        const [cx, cy, cz, r] = canopy[i];
        this.mesh(group, new THREE.IcosahedronGeometry(r, 1), i === 4 ? lightLeaves : leaves, cx, cy, cz);
      }
    }
    this.scene.add(group);
    return group;
  }

  private createRock(x: number, z: number, scale: number, rand: () => number) {
    const group = new THREE.Group();
    group.position.set(x, this.groundHeight(x, z), z);
    group.rotation.set(rand() * 0.5, rand() * Math.PI, rand() * 0.3);
    group.scale.set(scale, scale * (0.55 + rand() * 0.45), scale);
    const tones = ['#77766a', '#888372', '#a0957b', '#636b60'];
    this.mesh(group, new THREE.DodecahedronGeometry(28, 0),
      this.material(tones[Math.floor(rand() * tones.length)]), 0, 12, 0);
    this.scene.add(group);
  }

  private createTower(x: number, z: number, rand: () => number) {
    const group = new THREE.Group();
    group.position.set(x, this.groundHeight(x, z), z);
    const stone = this.material('#78716f');
    const stoneLight = this.material('#a69a82');
    const dark = this.material('#474657');
    const gold = this.material('#d3ad69', { metalness: 0.65, roughness: 0.42 });
    const roof = this.material('#58607a');
    const height = 155 + rand() * 30;
    this.mesh(group, new THREE.CylinderGeometry(68, 86, 26, 12), dark, 0, 12, 0);
    this.mesh(group, new THREE.CylinderGeometry(46, 59, height, 12), stone, 0, height / 2 + 24, 0);
    this.mesh(group, new THREE.CylinderGeometry(53, 53, 8, 12), gold, 0, height + 26, 0);
    this.mesh(group, new THREE.ConeGeometry(69, 76, 8), roof, 0, height + 68, 0);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const window = this.mesh(group, new THREE.BoxGeometry(8, 25, 5),
        this.glow('#e5a75b', 0.8), Math.sin(angle) * 47, 70, Math.cos(angle) * 47);
      window.rotation.y = angle;
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.mesh(group, new THREE.BoxGeometry(18, 24, 18), stoneLight,
        Math.sin(angle) * 49, height + 31, Math.cos(angle) * 49);
    }
    this.mesh(group, new THREE.SphereGeometry(8, 8, 6), this.glow('#8be8ff', 2.4), 0, height + 112, 0);
    const lantern = new THREE.PointLight('#e9ae65', 0.7, 260);
    lantern.position.set(0, height * 0.55, 0);
    group.add(lantern);
    this.scene.add(group);
  }

  private createWall(size: number) {
    const stone = this.material('#666776');
    const cap = this.material('#a49a85');
    const gold = this.material('#c6a56c', { metalness: 0.55, roughness: 0.5 });
    const yTop = -5;
    const count = 36;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count * size;
      const height = 68 + (i % 3) * 4;
      for (const side of [0, 1]) {
        const z = side === 0 ? 0 : size;
        const wall = this.mesh(this.scene, new THREE.BoxGeometry(size / count + 2, height, 38),
          stone, u, yTop + height / 2, z);
        const top = this.mesh(this.scene, new THREE.BoxGeometry(size / count + 2, 7, 43),
          cap, u, yTop + height + 2, z);
        top.castShadow = true;
      }
      for (const side of [0, 1]) {
        const x = side === 0 ? 0 : size;
        this.mesh(this.scene, new THREE.BoxGeometry(38, height, size / count + 2),
          stone, x, yTop + height / 2, u);
        this.mesh(this.scene, new THREE.BoxGeometry(43, 7, size / count + 2),
          cap, x, yTop + height + 2, u);
      }
    }
    const rim = this.mesh(this.scene, new THREE.BoxGeometry(size + 26, 4, 4), gold,
      size / 2, 68, 0);
    rim.castShadow = false;
  }

  private createEnvironment(size: number) {
    this.arenaSize = size;
    this.forestGroups = [];
    this.createTerrain(size);
    this.createWall(size);

    // A circular trade road and the central runestone seal give the field a sense of place.
    const roadMat = this.material('#937e5a', { roughness: 1 });
    const road = this.mesh(this.scene, new THREE.RingGeometry(size * 0.34, size * 0.355, 128),
      roadMat, size / 2, -3.1, size / 2);
    road.rotation.x = -Math.PI / 2;
    const innerRune = this.mesh(this.scene, new THREE.RingGeometry(size * 0.18, size * 0.184, 128),
      this.glow('#4d83bb', 0.55), size / 2, -3.2, size / 2);
    innerRune.rotation.x = -Math.PI / 2;

    const rand = seeded(91273);
    for (let i = 0; i < 56; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = (rand() - 0.5) * (size + 1250) + size / 2;
        z = (rand() - 0.5) * (size + 1250) + size / 2;
        const inside = x > 150 && x < size - 150 && z > 150 && z < size - 150;
        const nearRoad = Math.abs(Math.hypot(x - size / 2, z - size / 2) - size * 0.35) < 110;
        if (!inside && !nearRoad) break;
      }
      this.createTree(x, z, Math.floor(rand() * 6), rand);
    }
    for (let i = 0; i < 72; i++) {
      const x = (rand() - 0.5) * (size + 1200) + size / 2;
      const z = (rand() - 0.5) * (size + 1200) + size / 2;
      const outside = x < -80 || x > size + 80 || z < -80 || z > size + 80;
      if (outside && rand() > 0.28) this.createRock(x, z, 0.55 + rand() * 1.3, rand);
    }

    const corners: [number, number][] = [
      [70, 70], [size - 70, 70], [70, size - 70], [size - 70, size - 70],
      [size / 2, 70], [size / 2, size - 70], [70, size / 2], [size - 70, size / 2],
    ];
    for (const [x, z] of corners) this.createTower(x, z, rand);

    // Scattered flower patches around the edge of the playable field.
    const flowers = new THREE.Group();
    const flowerMat = this.material('#e7d07b');
    const flowerBlue = this.material('#b5c5ec');
    const stemMat = this.material('#477342');
    for (let i = 0; i < 160; i++) {
      const x = rand() * size, z = rand() * size;
      const nearCenter = Math.hypot(x - size / 2, z - size / 2) < size * 0.2;
      if (nearCenter) continue;
      const stem = this.mesh(flowers, new THREE.CylinderGeometry(0.7, 1.1, 8, 4), stemMat, x, this.groundHeight(x,z) + 4, z);
      this.mesh(flowers, new THREE.IcosahedronGeometry(3.3, 0), rand() > 0.5 ? flowerMat : flowerBlue,
        x, this.groundHeight(x,z) + 9, z);
    }
    this.scene.add(flowers);

    // A little high-fantasy landmark sits in the centre without blocking movement.
    const shrine = new THREE.Group();
    shrine.position.set(size / 2, this.groundHeight(size / 2, size / 2), size / 2);
    this.mesh(shrine, new THREE.CylinderGeometry(78, 92, 16, 12), this.material('#555870'), 0, 8, 0);
    this.mesh(shrine, new THREE.TorusGeometry(66, 3, 8, 48), this.glow('#78b9eb', 1.6), 0, 27, 0).rotation.x = Math.PI / 2;
    this.mesh(shrine, new THREE.OctahedronGeometry(24, 1), this.glow('#71c6ef', 2.5), 0, 82, 0);
    const shrineLight = new THREE.PointLight('#71c6ef', 2.2, 520);
    shrineLight.position.set(0, 90, 0);
    shrine.add(shrineLight);
    this.scene.add(shrine);

    // Low hills and distant pines form a visible horizon beyond the stone boundary.
    for (let i = 0; i < 28; i++) {
      const side = i % 4;
      const n = Math.floor(i / 4);
      const d = size * (0.5 + rand() * 0.42);
      const offset = (n - 3) * 520;
      const x = side < 2 ? offset + size / 2 : (side === 2 ? -d : size + d);
      const z = side < 2 ? (side === 0 ? -d : size + d) : offset + size / 2;
      const mountain = this.mesh(this.scene, new THREE.ConeGeometry(280 + rand() * 240, 260 + rand() * 300, 7),
        this.material(rand() > 0.5 ? '#64765a' : '#77735e'), x, -20, z);
      mountain.rotation.z = (rand() - 0.5) * 0.18;
    }

    this.createFireflies(size);
    this.loadNatureModels();
  }

  private async parseGlb(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load model ' + url + ' (' + response.status + ')');
    const data = await response.arrayBuffer();
    const header = new DataView(data);
    if (header.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB model: ' + url);
    let offset = 12;
    let documentData: any = null;
    let binary: ArrayBuffer | null = null;
    while (offset + 8 <= data.byteLength) {
      const length = header.getUint32(offset, true);
      const type = header.getUint32(offset + 4, true);
      offset += 8;
      if (type === 0x4e4f534a) documentData = JSON.parse(new TextDecoder().decode(new Uint8Array(data, offset, length)));
      else if (type === 0x004e4942) binary = data.slice(offset, offset + length);
      offset += length;
    }
    if (!documentData || !binary) throw new Error('GLB is missing its scene data: ' + url);

    const componentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const componentCounts: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const readNumber = (view: DataView, position: number, type: number): number => {
      switch (type) {
        case 5120: return view.getInt8(position);
        case 5121: return view.getUint8(position);
        case 5122: return view.getInt16(position, true);
        case 5123: return view.getUint16(position, true);
        case 5125: return view.getUint32(position, true);
        case 5126: return view.getFloat32(position, true);
        default: throw new Error('Unsupported GLB component type: ' + type);
      }
    };
    const readAccessor = (index: number, asIndices = false): any => {
      const accessor = documentData.accessors[index];
      const bufferView = documentData.bufferViews[accessor.bufferView];
      const count = componentCounts[accessor.type];
      const bytes = componentBytes[accessor.componentType];
      const stride = bufferView.byteStride || count * bytes;
      const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
      const view = new DataView(binary!);
      if (asIndices) {
        const IndexArray = accessor.componentType === 5125 ? Uint32Array
          : accessor.componentType === 5121 ? Uint8Array : Uint16Array;
        const values = new IndexArray(accessor.count);
        for (let i = 0; i < accessor.count; i++) values[i] = readNumber(view, start + i * stride, accessor.componentType);
        return values;
      }
      const values = new Float32Array(accessor.count * count);
      for (let i = 0; i < accessor.count; i++) for (let c = 0; c < count; c++) {
        let value = readNumber(view, start + i * stride + c * bytes, accessor.componentType);
        if (accessor.normalized && accessor.componentType !== 5126) {
          if (accessor.componentType === 5120) value = Math.max(value / 127, -1);
          else if (accessor.componentType === 5121) value /= 255;
          else if (accessor.componentType === 5122) value = Math.max(value / 32767, -1);
          else if (accessor.componentType === 5123) value /= 65535;
        }
        values[i * count + c] = value;
      }
      return values;
    };

    const textures: any[] = [];
    for (const image of documentData.images || []) {
      let imageBytes: ArrayBuffer;
      let mime = image.mimeType || 'image/png';
      if (image.bufferView != null) {
        const view = documentData.bufferViews[image.bufferView];
        const begin = view.byteOffset || 0;
        imageBytes = binary.slice(begin, begin + view.byteLength);
      } else if (image.uri && image.uri.startsWith('data:')) {
        const comma = image.uri.indexOf(',');
        const encoded = image.uri.slice(comma + 1);
        const decoded = atob(encoded);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
        imageBytes = bytes.buffer;
        mime = image.uri.slice(5, image.uri.indexOf(';')) || mime;
      } else {
        const external = await fetch(new URL(image.uri, url).toString());
        if (!external.ok) throw new Error('Could not load GLB texture');
        imageBytes = await external.arrayBuffer();
      }
      const objectUrl = URL.createObjectURL(new Blob([imageBytes], { type: mime }));
      const texture = await new Promise<any>((resolve, reject) => {
        new THREE.TextureLoader().load(objectUrl, (loaded: any) => resolve(loaded), undefined, reject);
      });
      URL.revokeObjectURL(objectUrl);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
    }

    const materials = (documentData.materials || []).map((entry: any) => {
      const pbr = entry.pbrMetallicRoughness || {};
      const rgba = pbr.baseColorFactor || [1, 1, 1, 1];
      let map: any = null;
      if (pbr.baseColorTexture) {
        const textureInfo = documentData.textures[pbr.baseColorTexture.index];
        if (textureInfo && textures[textureInfo.source] != null) map = textures[textureInfo.source];
      }
      const emissive = entry.emissiveFactor || [0, 0, 0];
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
        map,
        metalness: pbr.metallicFactor ?? 0,
        roughness: pbr.roughnessFactor ?? 1,
        emissive: new THREE.Color(emissive[0], emissive[1], emissive[2]),
        transparent: rgba[3] < 0.999 || entry.alphaMode === 'BLEND',
        opacity: rgba[3],
        alphaTest: entry.alphaMode === 'MASK' ? (entry.alphaCutoff ?? 0.5) : 0,
        side: entry.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
    });
    if (!materials.length) materials.push(this.material('#698950'));

    const buildNode = (index: number): any => {
      const node = documentData.nodes[index];
      const group = new THREE.Group();
      if (node.matrix) {
        group.matrix.fromArray(node.matrix);
        group.matrixAutoUpdate = false;
      } else {
        if (node.translation) group.position.fromArray(node.translation);
        if (node.rotation) group.quaternion.fromArray(node.rotation);
        if (node.scale) group.scale.fromArray(node.scale);
      }
      if (node.mesh != null) {
        const meshDef = documentData.meshes[node.mesh];
        for (const primitive of meshDef.primitives || []) {
          if (primitive.mode != null && primitive.mode !== 4) continue;
          const geometry = new THREE.BufferGeometry();
          const attributeNames: Record<string, string> = {
            POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color',
          };
          for (const [semantic, accessorId] of Object.entries(primitive.attributes || {})) {
            const name = attributeNames[semantic];
            if (!name) continue;
            const accessor = documentData.accessors[accessorId as number];
            geometry.setAttribute(name, new THREE.BufferAttribute(readAccessor(accessorId as number), componentCounts[accessor.type]));
          }
          if (primitive.indices != null) geometry.setIndex(new THREE.BufferAttribute(readAccessor(primitive.indices, true), 1));
          if (!geometry.attributes.normal) geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          const material = materials[primitive.material ?? 0] || materials[0];
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
      }
      for (const child of node.children || []) group.add(buildNode(child));
      return group;
    };

    const root = new THREE.Group();
    const sceneDef = documentData.scenes?.[documentData.scene || 0];
    for (const node of sceneDef?.nodes || []) root.add(buildNode(node));
    root.updateMatrixWorld(true);
    return root;
  }

  private loadNatureModels() {
    if (this.natureModels.length) {
      this.applyNatureModels();
      return;
    }
    if (!this.natureLoad) {
      const urls = [
        '/assets/nature/tree1.glb', '/assets/nature/tree2.glb',
        '/assets/nature/tree3.glb', '/assets/nature/bush.glb',
      ];
      this.natureLoad = Promise.all(urls.map(url => this.parseGlb(url)))
        .then(models => { this.natureModels = models; })
        .catch(error => { console.warn('Nature models unavailable; keeping procedural foliage.', error); });
    }
    void this.natureLoad.then(() => this.applyNatureModels());
  }

  private applyNatureModels() {
    if (!this.natureModels.length) return;
    for (let i = 0; i < this.forestGroups.length; i++) {
      const group = this.forestGroups[i];
      const bush = i % 5 === 4;
      const source = this.natureModels[bush ? 3 : i % 3];
      if (!source) continue;
      group.clear();
      const model = source.clone(true);
      const initialBounds = new THREE.Box3().setFromObject(model);
      const rawHeight = Math.max(0.01, initialBounds.max.y - initialBounds.min.y);
      model.scale.setScalar((bush ? 74 : 224) / rawHeight);
      const bounds = new THREE.Box3().setFromObject(model);
      model.position.x -= (bounds.min.x + bounds.max.x) / 2;
      model.position.z -= (bounds.min.z + bounds.max.z) / 2;
      model.position.y -= bounds.min.y;
      model.traverse((object: any) => {
        if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      group.add(model);
    }
  }

  private createFireflies(size: number) {
    const rand = seeded(4432);
    const positions = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      positions[i * 3] = rand() * size;
      positions[i * 3 + 1] = 18 + rand() * 150;
      positions[i * 3 + 2] = rand() * size;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: '#ffe5a3', size: 5, sizeAttenuation: true, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(points);
    this.fireflies = points;
  }

  private createTank(player: any): Visual {
    const root = new THREE.Group();
    const cls = CLASSES[player.cls] || CLASSES[0];
    const family = tankArchetype(cls);
    const blue = player.team === 'blue';
    const red = player.team === 'red';
    const own = !player.team && player.id === this.currentSelfId;
    const bodyColor = blue ? '#3d7898' : red ? '#984957' : own ? '#347e88' : '#95515b';
    const trimColor = blue ? '#a6d9e8' : red ? '#efb5a6' : own ? '#a9e7dd' : '#e8b5aa';
    const darkColor = blue ? '#233f50' : red ? '#492d39' : own ? '#1e4c50' : '#4b3039';
    const body = this.material(bodyColor, { metalness: 0.34, roughness: 0.58 });
    const trim = this.material(trimColor, { metalness: 0.5, roughness: 0.4 });
    const dark = this.material(darkColor, { metalness: 0.28, roughness: 0.76 });
    const steel = this.material('#65717b', { metalness: 0.72, roughness: 0.42 });
    const gold = this.material('#c4a16a', { metalness: 0.68, roughness: 0.4 });
    const accentColor = blue ? '#67c8e2' : red ? '#e78b83' : own ? '#73d8c6' : '#df928d';
    const accent = this.glow(accentColor, 1.15);
    const core = this.glow(accentColor, 1.8);

    const hullWidth = family === 'heavy' || family === 'rammer' ? 104
      : family === 'sniper' || family === 'scout' ? 66
      : family === 'drone' ? 86 : family === 'trapper' ? 98 : 82;
    const hullLength = family === 'sniper' || family === 'artillery' ? 112
      : family === 'scout' ? 96 : family === 'rammer' ? 108 : 88;
    const trackFamily = ['standard', 'sniper', 'heavy', 'rapid', 'trapper', 'auto', 'artillery'].includes(family);

    // Lower chassis: a shared construction language, with a different footprint for each role.
    this.mesh(root, new THREE.BoxGeometry(hullWidth * 0.78, 17, hullLength * 0.92), dark, 0, 12, -1);
    if (trackFamily) {
      const trackWidth = family === 'heavy' || family === 'rammer' ? 18 : 13;
      for (const side of [-1, 1]) {
        const sx = side * (hullWidth * 0.43);
        this.mesh(root, new THREE.BoxGeometry(trackWidth, 27, hullLength + 8), dark, sx, 14, 0);
        this.mesh(root, new THREE.BoxGeometry(trackWidth + 2, 4, hullLength - 8), steel, sx, 24, 0);
        const wheels = family === 'heavy' ? 5 : 4;
        for (let i = 0; i < wheels; i++) {
          const z = -hullLength * 0.37 + i * (hullLength * 0.74 / Math.max(1, wheels - 1));
          const wheel = this.mesh(root, new THREE.CylinderGeometry(7, 7, trackWidth + 3, 10),
            steel, sx, 11, z);
          wheel.rotation.z = Math.PI / 2;
          this.mesh(root, new THREE.CylinderGeometry(2.1, 2.1, trackWidth + 4, 8),
            gold, sx, 11, z);
        }
      }
    } else if (family === 'scout') {
      // Hover skids and rear thrusters replace tracks on fast mobile classes.
      for (const side of [-1, 1]) {
        const skid = this.mesh(root, new THREE.BoxGeometry(10, 7, 82), steel, side * 39, 8, -1);
        skid.rotation.y = side * 0.08;
        this.mesh(root, new THREE.CylinderGeometry(5, 7, 6, 8), accent, side * 39, 8, -42);
        this.mesh(root, new THREE.CylinderGeometry(5, 7, 6, 8), accent, side * 39, 8, 39);
      }
      for (const side of [-1, 1]) {
        this.mesh(root, new THREE.CylinderGeometry(9, 13, 8, 8), dark, side * 25, 20, -39);
        this.mesh(root, new THREE.SphereGeometry(7, 8, 6), core, side * 25, 20, -44);
      }
    } else if (family === 'drone') {
      const hover = this.mesh(root, new THREE.TorusGeometry(48, 5, 8, 40), accent, 0, 8, 0);
      hover.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + Math.PI / 4;
        const x = Math.cos(angle) * 43, z = Math.sin(angle) * 43;
        this.mesh(root, new THREE.CylinderGeometry(8, 10, 9, 8), steel, x, 11, z);
        this.mesh(root, new THREE.SphereGeometry(6, 8, 6), core, x, 20, z);
      }
    }

    // Upper hull and armor plates. Heavy, scout, command and rammer frames are intentionally distinct.
    if (family === 'heavy' || family === 'artillery') {
      this.mesh(root, new THREE.BoxGeometry(92, 25, 82), body, 0, 30, -2);
      this.mesh(root, new THREE.BoxGeometry(76, 9, 64), trim, 0, 46, -5);
      for (const side of [-1, 1]) {
        const plate = this.mesh(root, new THREE.BoxGeometry(15, 23, 49), steel, side * 45, 30, -9);
        plate.rotation.z = side * -0.12;
        this.mesh(root, new THREE.BoxGeometry(14, 6, 30), gold, side * 48, 42, 8);
      }
      this.mesh(root, new THREE.BoxGeometry(72, 8, 18), gold, 0, 22, 47);
    } else if (family === 'sniper') {
      this.mesh(root, new THREE.BoxGeometry(58, 18, 104), body, 0, 29, -1);
      this.mesh(root, new THREE.BoxGeometry(42, 9, 68), trim, 0, 41, -13);
      for (const side of [-1, 1]) {
        const fin = this.mesh(root, new THREE.BoxGeometry(4, 4, 48), gold, side * 34, 21, -31);
        fin.rotation.y = side * -0.08;
        this.mesh(root, new THREE.ConeGeometry(8, 17, 5), steel, side * 31, 31, -50).rotation.x = Math.PI / 2;
      }
    } else if (family === 'scout') {
      this.mesh(root, new THREE.BoxGeometry(58, 17, 76), body, 0, 25, 0);
      this.mesh(root, new THREE.ConeGeometry(35, 55, 5), trim, 0, 28, 36).rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const wing = this.mesh(root, new THREE.BoxGeometry(34, 7, 26), body, side * 39, 22, -6);
        wing.rotation.y = side * -0.22;
        this.mesh(root, new THREE.BoxGeometry(22, 3, 7), gold, side * 42, 27, -7);
      }
    } else if (family === 'drone') {
      this.mesh(root, new THREE.CylinderGeometry(39, 45, 19, 10), body, 0, 26, 0);
      this.mesh(root, new THREE.CylinderGeometry(31, 35, 8, 10), trim, 0, 39, 0);
      const commandRing = this.mesh(root, new THREE.TorusGeometry(34, 3, 8, 32), gold, 0, 45, 0);
      commandRing.rotation.x = Math.PI / 2;
      this.mesh(root, new THREE.SphereGeometry(13, 12, 10), core, 0, 51, 0);
    } else if (family === 'rammer') {
      this.mesh(root, new THREE.BoxGeometry(92, 24, 72), body, 0, 27, -13);
      this.mesh(root, new THREE.BoxGeometry(82, 11, 56), trim, 0, 43, -17);
      // A wedge-shaped battering nose makes rammer classes read instantly without a cannon.
      const nose = this.mesh(root, new THREE.ConeGeometry(48, 62, 4), steel, 0, 24, 38);
      nose.rotation.x = Math.PI / 2;
      this.mesh(root, new THREE.BoxGeometry(90, 12, 13), gold, 0, 16, 64);
      for (const side of [-1, 1]) {
        this.mesh(root, new THREE.ConeGeometry(9, 27, 5), trim, side * 36, 34, 19).rotation.x = Math.PI / 2;
      }
    } else if (family === 'trapper') {
      this.mesh(root, new THREE.CylinderGeometry(48, 52, 23, 8), body, 0, 28, 0);
      this.mesh(root, new THREE.BoxGeometry(88, 13, 54), trim, 0, 43, -4);
      for (const side of [-1, 1]) {
        this.mesh(root, new THREE.CylinderGeometry(12, 15, 10, 8), steel, side * 35, 50, 7);
        this.mesh(root, new THREE.TorusGeometry(10, 2, 6, 16), gold, side * 35, 56, 7);
      }
    } else if (family === 'auto') {
      this.mesh(root, new THREE.CylinderGeometry(43, 48, 23, 12), body, 0, 28, 0);
      this.mesh(root, new THREE.BoxGeometry(64, 13, 61), trim, 0, 43, -2);
      const ring = this.mesh(root, new THREE.TorusGeometry(36, 3.2, 8, 28), gold, 0, 51, 0);
      ring.rotation.x = Math.PI / 2;
    } else if (family === 'rapid') {
      this.mesh(root, new THREE.CylinderGeometry(38, 44, 22, 10), body, 0, 27, 0);
      this.mesh(root, new THREE.BoxGeometry(68, 12, 64), trim, 0, 42, -2);
      for (const side of [-1, 1]) {
        this.mesh(root, new THREE.BoxGeometry(10, 9, 42), steel, side * 32, 28, -2);
      }
    } else {
      this.mesh(root, new THREE.CylinderGeometry(39, 45, 22, 12), body, 0, 28, 0);
      this.mesh(root, new THREE.BoxGeometry(64, 13, 58), trim, 0, 42, -2);
    }

    // Every faction uses the same restrained metal language and one readable reactor accent.
    const topRing = this.mesh(root, new THREE.TorusGeometry(family === 'heavy' ? 32 : 28, 2.8, 8, 28),
      gold, 0, family === 'rammer' ? 48 : 49, -5);
    topRing.rotation.x = Math.PI / 2;
    this.mesh(root, new THREE.SphereGeometry(family === 'heavy' ? 11 : 9, 10, 8),
      core, 0, 54, family === 'rammer' ? -24 : -14);

    // Draw the real class barrels. Very high-count volleys are represented by a clean,
    // readable bank of sampled barrels; the server still fires every configured projectile.
    const barrelDefs = cls?.barrels || [];
    const visibleBarrels = barrelDefs.length > 8
      ? Array.from({ length: 7 }, (_, i) => barrelDefs[Math.round(i * (barrelDefs.length - 1) / 6)])
      : barrelDefs;
    for (const barrel of visibleBarrels) {
      if (barrel.projectile === 'drone') {
        const port = new THREE.Group();
        port.position.set(-barrel.offset, 48, 19);
        port.rotation.y = -barrel.angle;
        this.mesh(port, new THREE.CylinderGeometry(8, 11, 10, 8), dark, 0, 0, 0);
        this.mesh(port, new THREE.TorusGeometry(8, 2, 6, 18), gold, 0, 6, 0);
        this.mesh(port, new THREE.SphereGeometry(5, 8, 6), core, 0, 9, 0);
        root.add(port);
        continue;
      }
      const mount = new THREE.Group();
      mount.position.set(-barrel.offset, family === 'sniper' ? 45 : 47, 1);
      mount.rotation.y = -barrel.angle;
      const isTrap = barrel.projectile === 'trap';
      const isRocket = barrel.projectile === 'missile' || barrel.projectile === 'firework';
      const barrelLength = Math.max(25, barrel.length + (isTrap ? 12 : 22));
      const barrelWidth = Math.max(7, barrel.width);
      const metal = isTrap ? dark : isRocket ? steel : trim;
      const tube = this.mesh(mount,
        new THREE.CylinderGeometry(barrelWidth * 0.43, barrelWidth * 0.58, barrelLength, 10),
        metal, 0, 0, barrelLength * 0.5 + 9);
      tube.rotation.x = Math.PI / 2;
      const band = this.mesh(mount,
        new THREE.CylinderGeometry(barrelWidth * 0.54, barrelWidth * 0.54, 5, 10),
        gold, 0, 0, barrelLength + 8);
      band.rotation.x = Math.PI / 2;
      this.mesh(mount, new THREE.TorusGeometry(barrelWidth * 0.46, 2, 6, 14),
        gold, 0, 0, barrelLength + 11);
      this.mesh(mount, new THREE.CircleGeometry(barrelWidth * 0.31, 12),
        dark, 0, 0, barrelLength + 11.4);
      if (isTrap) {
        this.mesh(mount, new THREE.CylinderGeometry(barrelWidth * 0.65, barrelWidth * 0.75, 8, 8),
          dark, 0, 0, barrelLength * 0.3 + 6);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          this.mesh(mount, new THREE.BoxGeometry(3, 7, 14), steel,
            Math.cos(a) * barrelWidth * 0.62, Math.sin(a) * barrelWidth * 0.62, 15);
        }
      } else if (isRocket) {
        this.mesh(mount, new THREE.ConeGeometry(barrelWidth * 0.46, 16, 8),
          gold, 0, 0, barrelLength + 20).rotation.x = Math.PI / 2;
      }
      root.add(mount);
    }

    // Defensive auto-turrets are mounted on true radial hardpoints around the hull.
    const turretCount = cls?.turretCount ?? 0;
    for (let i = 0; i < turretCount; i++) {
      const angle = i / turretCount * Math.PI * 2;
      const turret = new THREE.Group();
      const radius = family === 'heavy' ? 48 : 39;
      turret.position.set(-Math.sin(angle) * radius, 48, Math.cos(angle) * radius);
      turret.rotation.y = -angle;
      this.mesh(turret, new THREE.CylinderGeometry(11, 14, 13, 10), dark, 0, 0, 0);
      const gun = this.mesh(turret, new THREE.CylinderGeometry(4.5, 5.5, 24, 8), steel, 0, 0, 17);
      gun.rotation.x = Math.PI / 2;
      this.mesh(turret, new THREE.TorusGeometry(5, 1.5, 5, 12), gold, 0, 0, 29);
      root.add(turret);
    }

    // Compact health strip and the nameplate share one baseline across every class.
    const hpBack = this.mesh(root, new THREE.BoxGeometry(56, 3, 3), dark, 0, 82, 0);
    const hpFill = this.mesh(root, new THREE.BoxGeometry(54, 2.5, 3.4), this.glow('#8ccf75', 0.75), 0, 82, 0.5);
    this.scene.add(root);
    return { group: root, label: null, classId: player.cls, team: player.team, hpFill, hpBack, family };
  }

  private createZombie(zombie: any): Visual {
    const boss = zombie.bossKind !== null;
    const baseColor = boss ? (BOSS_PALETTE[zombie.bossKind] || '#864c68') :
      (ZOMBIE_PALETTE[zombie.kind] || '#688e4d');
    const root = new THREE.Group();
    const skin = this.material(baseColor, { roughness: 0.95 });
    const dark = this.material('#303b37');
    const glow = this.glow(boss ? '#e0a7ff' : '#c7f58d', boss ? 2.5 : 1.45);
    const scale = boss ? 1.55 : 1;
    this.mesh(root, new THREE.IcosahedronGeometry(1, 1), skin, 0, 29, 0).scale.set(28 * scale, 37 * scale, 24 * scale);
    this.mesh(root, new THREE.IcosahedronGeometry(1, 1), skin, 0, 67 * scale, 0).scale.set(22 * scale, 22 * scale, 21 * scale);
    for (const side of [-1, 1]) {
      this.mesh(root, new THREE.ConeGeometry(7 * scale, 24 * scale, 5), dark,
        side * 15 * scale, 89 * scale, 2).rotation.z = side * 0.26;
      this.mesh(root, new THREE.SphereGeometry(4.6 * scale, 8, 6), glow,
        side * 8 * scale, 72 * scale, 18 * scale);
      const arm = this.mesh(root, new THREE.CylinderGeometry(5 * scale, 8 * scale, 34 * scale, 6),
        skin, side * 30 * scale, 29 * scale, 0);
      arm.rotation.z = side * 0.62;
      this.mesh(root, new THREE.IcosahedronGeometry(1, 0), dark,
        side * 36 * scale, 8 * scale, 5).scale.setScalar(11 * scale);
    }
    if (boss) {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        this.mesh(root, new THREE.ConeGeometry(10, 34, 5), glow,
          Math.cos(a) * 32, 53, Math.sin(a) * 32).rotation.z = Math.cos(a) * 0.65;
      }
      const aura = this.mesh(root, new THREE.TorusGeometry(49, 3, 8, 40), glow, 0, 2, 0);
      aura.rotation.x = Math.PI / 2;
    }
    this.scene.add(root);
    return { group: root, boss, hp: null };
  }

  private createShape(shape: any): Visual {
    const def = Object.values(SHAPES)[shape[4]] as any;
    const group = new THREE.Group();
    const color = def?.color || '#b7b9bd';
    const stone = this.material(color, { roughness: 0.95 });
    const edge = this.material(def?.stroke || '#e1d8bb');
    this.mesh(group, new THREE.CylinderGeometry((def?.radius || 40) * 0.9,
      (def?.radius || 40), 13, 10), this.material('#4a5362'), 0, 7, 0);
    const crystal = this.mesh(group, new THREE.IcosahedronGeometry(def?.radius || 40, 0), stone,
      0, 22 + (def?.radius || 40) * 0.18, 0);
    crystal.rotation.y = 0.3;
    this.mesh(group, new THREE.TorusGeometry((def?.radius || 40) * 0.78, 2, 6, 20),
      edge, 0, 15, 0).rotation.x = Math.PI / 2;
    this.scene.add(group);
    return { group, crystal };
  }

  private createBullet(bullet: any, players: Map<number, any>): Visual {
    const owner = players.get(bullet[4]);
    const tint = owner?.team === 'blue' ? '#75d9ff' : owner?.team === 'red' ? '#ff8190' :
      bullet[4] === this.currentSelfId ? '#7bedff' : '#ff858b';
    const group = new THREE.Group();
    if (bullet[5] === 3 || bullet[5] === 4) {
      this.mesh(group, new THREE.ConeGeometry(7, 30, 7), this.glow('#ffc277', 2), 0, 0, 0).rotation.x = Math.PI / 2;
    } else if (bullet[5] === 2) {
      this.mesh(group, new THREE.OctahedronGeometry(9, 0), this.glow('#f4cd77', 2.1));
    } else {
      this.mesh(group, new THREE.SphereGeometry(Math.max(4, bullet[3] * 0.8), 9, 7),
        this.glow(tint, 1.8));
      this.mesh(group, new THREE.SphereGeometry(Math.max(2, bullet[3] * 0.35), 7, 5),
        this.material('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.45 }));
    }
    this.scene.add(group);
    return { group };
  }

  private createDrop(drop: any, health: boolean): Visual {
    const group = new THREE.Group();
    const crystalColor = health ? '#54df9b' : '#ffd66e';
    const material = this.glow(crystalColor, 2.2);
    const base = this.mesh(group, new THREE.OctahedronGeometry(health ? 13 : 10, 1), material, 0, 15, 0);
    this.mesh(group, new THREE.TorusGeometry(health ? 22 : 18, 1.5, 6, 28),
      this.glow(health ? '#a3ffd1' : '#fff0ae', 1.1), 0, 0, 0).rotation.x = Math.PI / 2;
    if (health) {
      this.mesh(group, new THREE.BoxGeometry(4, 19, 4), this.material('#edfff4'), 0, 16, 0);
      this.mesh(group, new THREE.BoxGeometry(19, 4, 4), this.material('#edfff4'), 0, 16, 0);
    }
    this.scene.add(group);
    return { group, crystal: base };
  }

  private createPool(pool: any): Visual {
    const group = new THREE.Group();
    this.mesh(group, new THREE.CircleGeometry(pool.r, 32),
      this.material('#7d302c', { transparent: true, opacity: 0.68, side: THREE.DoubleSide }), 0, 0, 0).rotation.x = -Math.PI / 2;
    this.mesh(group, new THREE.TorusGeometry(pool.r * 0.86, 2, 6, 36),
      this.glow('#e56c49', 0.9), 0, 1, 0).rotation.x = Math.PI / 2;
    this.scene.add(group);
    return { group };
  }

  private createDowned(player: any): Visual {
    const group = new THREE.Group();
    this.mesh(group, new THREE.CylinderGeometry(player.r * 0.85, player.r, 7, 10),
      this.material('#59666c'), 0, 3, 0);
    this.mesh(group, new THREE.TorusGeometry(player.r * 1.25, 3, 6, 32),
      this.glow('#ffd37c', 1.6), 0, 7, 0).rotation.x = Math.PI / 2;
    this.scene.add(group);
    return { group };
  }

  private label(name: string): any {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = 'rgba(14, 23, 32, 0.72)';
    ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(235, 210, 158, 0.7)';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 25px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#111820';
    ctx.strokeText(name, 128, 33);
    ctx.fillStyle = '#f4e8ca'; ctx.fillText(name, 128, 33);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(105, 26, 1);
    return sprite;
  }

  private reconcile<T>(
    map: Map<number, Visual>, items: T[], idOf: (item: T) => number,
    create: (item: T) => Visual, update: (visual: Visual, item: T) => void,
  ) {
    const seen = new Set<number>();
    for (const item of items) {
      const id = idOf(item);
      seen.add(id);
      let visual = map.get(id);
      if (!visual) {
        visual = create(item);
        map.set(id, visual);
      }
      update(visual, item);
    }
    for (const [id, visual] of map) {
      if (seen.has(id)) continue;
      this.scene.remove(visual.group);
      map.delete(id);
    }
  }

  private position(group: any, x: number, z: number, lift = 0) {
    group.position.set(x, this.groundHeight(x, z) + lift, z);
  }

  private updateLabel(visual: Visual, name: string, x: number, z: number, lift: number) {
    if (!visual.label) {
      visual.label = this.label(name);
      if (visual.label) visual.group.add(visual.label);
    }
    if (visual.label) visual.label.position.set(0, lift, 0);
  }

  private currentSelfId = -1;
  private fireflies: any = null;

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render(view: View, selfId: number, camera: { x: number; y: number }, fovMul = 1) {
    const now = this.clock.getElapsedTime();
    this.currentSelfId = selfId;
    const size = view.mode === 'survival' ? SURVIVAL_ARENA_SIZE : ARENA_SIZE;

    if (size !== this.arenaSize) {
      // Survival has its own map scale; rebuild only the static field when modes change.
      this.scene.clear();
      this.materials.clear();
      this.players.clear(); this.zombies.clear(); this.shapes.clear(); this.bullets.clear();
      this.xpDrops.clear(); this.healthDrops.clear(); this.pools.clear(); this.downed.clear();
      this.createLighting();
      this.createEnvironment(size);
    }

    this.reconcile(this.players, view.players, p => p.id,
      p => this.createTank(p),
      (v, p) => {
        if (v.classId !== p.cls || v.team !== p.team) {
          this.scene.remove(v.group);
          Object.assign(v, this.createTank(p));
        }
        this.position(v.group, p.x, p.y, 1);
        v.group.rotation.y = Math.PI / 2 - p.a;
        v.group.scale.setScalar(Math.max(0.75, p.r / 40));
        const health = Math.max(0, Math.min(1, p.hp / Math.max(1, p.mhp)));
        if (v.hpFill) {
          v.hpFill.scale.x = health;
          v.hpFill.position.x = -(1 - health) * 27;
          v.hpFill.visible = health > 0 && health < 0.999;
        }
        if (v.hpBack) v.hpBack.visible = health < 0.999;
        this.updateLabel(v, p.name, p.x, p.y, p.r + 54);
      });

    const playerMap = new Map(view.players.map(p => [p.id, p]));
    this.reconcile(this.zombies, view.zombies, z => z.id,
      z => this.createZombie(z),
      (v, z) => {
        this.position(v.group, z.x, z.y, 0);
        v.group.rotation.y = Math.PI / 2 - z.angle;
        v.group.scale.setScalar(Math.max(0.7, z.r / 38));
        const blink = 0.92 + Math.sin(now * 5 + z.id) * 0.08;
        v.group.scale.y *= blink;
      });

    this.reconcile(this.shapes, view.shapes, s => s[0],
      s => this.createShape(s),
      (v, s) => {
        this.position(v.group, s[1], s[2], 0);
        v.group.rotation.y = s[3];
        v.crystal.rotation.y += 0.004;
        v.group.scale.setScalar(1);
      });

    this.reconcile(this.bullets, view.bullets, b => b[0],
      b => this.createBullet(b, playerMap),
      (v, b) => {
        this.position(v.group, b[1], b[2], 12);
        v.group.rotation.y = Math.PI / 2 - b[6];
        v.group.rotation.z = b[5] === 3 || b[5] === 4 ? Math.sin(now * 18) * 0.05 : 0;
      });

    this.reconcile(this.xpDrops, view.xpDrops, d => d.id,
      d => this.createDrop(d, false),
      (v, d) => {
        this.position(v.group, d.x, d.y, 12 + Math.sin(now * 2.7 + d.id) * 5);
        v.group.rotation.y = now * 0.7 + d.id;
      });

    this.reconcile(this.healthDrops, view.healthDrops, d => d.id,
      d => this.createDrop(d, true),
      (v, d) => {
        this.position(v.group, d.x, d.y, 10 + Math.sin(now * 3 + d.id) * 4);
        v.group.rotation.y = -now * 0.6 + d.id;
      });

    this.reconcile(this.pools, view.pools, p => p.id,
      p => this.createPool(p),
      (v, p) => {
        this.position(v.group, p.x, p.y, 0.5);
        v.group.scale.setScalar(p.r / 85);
      });

    this.reconcile(this.downed, view.downed, p => p.id,
      p => this.createDowned(p),
      (v, p) => {
        this.position(v.group, p.x, p.y, 1);
        const ring = v.group.children[1];
        if (ring) ring.rotation.z = now * 1.5;
      });

    const worldZoom = Math.max(0.86, Math.min(1.5, fovMul));
    this.camera.fov = 53 / worldZoom;
    this.camera.position.set(camera.x, 1120 * worldZoom, camera.y + 860 * worldZoom);
    this.camera.lookAt(camera.x, -1, camera.y);
    this.camera.updateProjectionMatrix();

    if (this.fireflies) this.fireflies.rotation.y = now * 0.018;
    this.renderer.render(this.scene, this.camera);
  }
}
