import type { Snapshot } from '../shared/protocol';

type Cue = 'shot' | 'heavy' | 'trap' | 'hit' | 'hurt' | 'destroy' | 'level' | 'wave' | 'boss' | 'death' | 'reward';
type Track = 'menu' | 'arena' | 'survival' | 'boss';
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const limit = (n: number) => Math.max(0, Math.min(1, n));

/** Original synthesized music and SFX. No assets, network requests or server changes. */
export class GameAudio {
  private ctx?: AudioContext;
  private music?: GainNode;
  private effects?: GainNode;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private step = 0;
  private next = 0;
  private track: Track = 'menu';
  private shots = new Set<number>();
  private events = new Map<string, number>();
  private lastTick = -1;
  private lastCue = new Map<Cue, number>();
  musicVolume = 0.28;
  effectsVolume = 0.55;
  muted = false;

  constructor() {
    try {
      const p = JSON.parse(localStorage.getItem('tank-audio-v1') ?? '{}');
      if (typeof p.music === 'number' && Number.isFinite(p.music)) this.musicVolume = limit(p.music);
      if (typeof p.effects === 'number' && Number.isFinite(p.effects)) this.effectsVolume = limit(p.effects);
      this.muted = p.muted === true;
    } catch {}
  }
  async unlock() {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const c = this.ctx = new Ctor();
        this.master = c.createGain(); this.music = c.createGain(); this.effects = c.createGain();
        const compressor = c.createDynamicsCompressor();
        compressor.threshold.value = -18; compressor.ratio.value = 5;
        this.music.connect(this.master); this.effects.connect(this.master);
        this.master.connect(compressor); compressor.connect(c.destination);
        this.noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.apply();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch { /* Audio may be blocked or unavailable; gameplay remains independent. */ }
  }
  settings(music: number, effects: number, muted: boolean) {
    this.musicVolume = limit(music); this.effectsVolume = limit(effects); this.muted = muted;
    this.apply();
    try { localStorage.setItem('tank-audio-v1', JSON.stringify({ music: this.musicVolume, effects: this.effectsVolume, muted })); } catch {}
  }
  private apply() {
    if (!this.ctx || !this.master || !this.music || !this.effects) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted || document.hidden ? 0 : 0.8, t, 0.035);
    this.music.gain.setTargetAtTime(this.musicVolume, t, 0.035);
    this.effects.gain.setTargetAtTime(this.effectsVolume, t, 0.035);
  }
  visibility() { this.apply(); this.next = 0; }
  reset() { this.shots.clear(); this.events.clear(); this.lastTick = -1; this.lastCue.clear(); }
  private tone(bus: GainNode, at: number, f: number, end: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f), at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + Math.min(0.012, duration / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    o.connect(g); g.connect(bus); o.start(at); o.stop(at + duration + 0.01);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  private hiss(bus: GainNode, at: number, duration: number, volume: number, freq: number) {
    if (!this.noise) return;
    const c = this.ctx!, src = c.createBufferSource(), g = c.createGain(), filter = c.createBiquadFilter();
    src.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.0002, volume), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter); filter.connect(g); g.connect(bus); src.start(at); src.stop(at + duration);
    src.onended = () => { src.disconnect(); filter.disconnect(); g.disconnect(); };
  }
  cue(kind: Cue, strength = 1) {
    const c = this.ctx, bus = this.effects;
    if (!c || !bus || c.state !== 'running' || this.muted || !this.effectsVolume || document.hidden) return;
    const t = c.currentTime;
    const gap = kind === 'shot' ? 0.075 : kind === 'hit' ? 0.11 : kind === 'destroy' ? 0.14 : 0.23;
    if (t - (this.lastCue.get(kind) ?? -100) < gap) return;
    this.lastCue.set(kind, t);
    const v = limit(strength);
    const tone = (f: number, e: number, d: number, a: number, type: OscillatorType = 'triangle', delay = 0) =>
      this.tone(bus, t + delay, f, e, d, a * v, type);
    const noise = (d: number, a: number, f: number) => this.hiss(bus, t, d, a * v, f);
    switch (kind) {
      case 'shot': tone(250, 65, 0.10, 0.16); noise(0.07, 0.10, 1600); break;
      case 'heavy': tone(145, 38, 0.24, 0.25); noise(0.19, 0.19, 1000); break;
      case 'trap': tone(440, 180, 0.12, 0.13, 'sine'); break;
      case 'hit': tone(520, 220, 0.08, 0.085); noise(0.045, 0.045, 2600); break;
      case 'hurt': tone(185, 65, 0.17, 0.20, 'sine'); break;
      case 'destroy': tone(120, 32, 0.24, 0.20); noise(0.26, 0.19, 1800); break;
      case 'level': [60, 64, 67, 72].forEach((n,i) => tone(midi(n), midi(n), 0.22, 0.12, 'sine', i * 0.075)); break;
      case 'wave': [48,55,60].forEach((n,i) => tone(midi(n), midi(n), 0.3, 0.16, 'triangle', i * 0.12)); break;
      case 'boss': tone(75, 32, 0.45, 0.27, 'sawtooth'); tone(110, 55, 0.4, 0.13, 'triangle', 0.18); break;
      case 'death': [55,51,43].forEach((n,i) => tone(midi(n), midi(n)-8, 0.32, 0.17, 'triangle', i * 0.15)); break;
      case 'reward': [72,76,79].forEach((n,i) => tone(midi(n), midi(n), 0.16, 0.10, 'sine', i * 0.06)); break;
    }
  }
  snapshot(s: Snapshot, selfId: number, previous?: Snapshot) {
    if (s.tick <= this.lastTick) {
      if (s.tick === this.lastTick) return;
      this.reset();
    }
    const first = this.lastTick < 0 || !previous;
    this.lastTick = s.tick;
    const self = s.p.find(p => p.id === selfId) ?? s.d.find(p => p.id === selfId);
    const nearby = (x: number, y: number) => self ? Math.max(0, 1 - Math.hypot(x-self.x,y-self.y)/650) : 0;
    const bullets = new Set(s.b.map(b => b[0]));
    if (!first) for (const b of s.b) {
      if (this.shots.has(b[0]) || b[5] === 1) continue;
      const gain = b[4] === selfId ? 1 : nearby(b[1],b[2]) * 0.4;
      if (gain > 0.12) this.cue(b[5] === 2 ? 'trap' : b[3] >= 10 || b[5] >= 3 ? 'heavy' : 'shot', gain);
    }
    this.shots = bullets;
    for (const e of s.effects ?? []) {
      const key = [e.tick,e.x,e.y,e.kind,e.color].join(':');
      if (this.events.has(key)) continue;
      this.events.set(key,e.tick);
      const gain = nearby(e.x,e.y);
      if (!first && s.tick-e.tick <= 8 && gain > 0.15) this.cue(e.kind === 'destroy' ? 'destroy' : e.color === '#ff7777' ? 'hurt' : 'hit', gain);
    }
    for (const [key,tick] of this.events) if (s.tick-tick > 90) this.events.delete(key);
    if (first || !previous) return;
    if (s.me.lv > previous.me.lv) this.cue('level');
    if (s.me.downed && !previous.me.downed) this.cue('death');
    if (s.me.rewards.length && !previous.me.rewards.length) this.cue('reward');
    if (s.survival && s.survival.wave !== previous.survival?.wave) this.cue(s.survival.theme === 'boss' ? 'boss' : 'wave');
  }
  update(track: Track) {
    const c = this.ctx, bus = this.music;
    if (!c || !bus || c.state !== 'running' || document.hidden) return;
    const now = c.currentTime;
    if (track !== this.track) { this.track = track; this.step = 0; this.next = now + 0.08; }
    if (this.muted || !this.musicVolume) { this.next = 0; return; }
    if (this.next < now) this.next = now + 0.035;
    const beat = 60 / (track === 'boss' ? 142 : track === 'survival' ? 128 : track === 'arena' ? 116 : 90);
    const roots = track === 'boss' ? [36,36,37,34] : track === 'survival' ? [38,34,36,33] : track === 'arena' ? [45,41,48,43] : [48,45,41,43];
    while (this.next < now + 0.11) {
      const n = this.step % 16, root = roots[Math.floor(this.step / 16) % roots.length];
      const at = this.next;
      const menu = track === 'menu', minor = track === 'boss' || track === 'survival' || root === 45;
      const chord = [0, minor ? 3 : 4, 7, 12, 7, minor ? 3 : 4, 12, 7];
      if (n % 2 === 0) this.tone(bus,at,midi(root+12+chord[(n/2)%8]+12),midi(root+12+chord[(n/2)%8]+12),beat*0.46,menu?0.08:0.065,'sine');
      if (n % 4 === 0) {
        this.tone(bus,at,midi(root),midi(root),beat*0.78,0.15,'triangle');
        if (!menu) this.tone(bus,at,125,40,0.14,0.16,'sine');
      }
      if (!menu && n % 2 === 1) this.hiss(bus,at,0.04,0.035,7000);
      if (!menu && n % 8 === 4) this.hiss(bus,at,0.13,0.075,2000);
      if (n === 0) for (const interval of [0,minor?3:4,7]) this.tone(bus,at,midi(root+12+interval),midi(root+12+interval),beat*2.5,0.035,'sine');
      this.step++; this.next += beat / 4;
    }
  }
}
