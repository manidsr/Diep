/** Unified keyboard / mouse / touch input. Produces movement intent + aim angle + fire flag. */
interface Stick { id: number; ox: number; oy: number; x: number; y: number }
export const STICK_RADIUS = 60;

export class Input {
  mx = 0; my = 0; angle = 0; fire = false;
  moveStick: Stick | null = null;
  aimStick: Stick | null = null;
  touchSeen = false;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, seen: false };
  private everAimed = false;
  onUpgrade: (idx: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const typing = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'INPUT';
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.key >= '1' && e.key <= '8' && !e.repeat) this.onUpgrade(Number(e.key) - 1);
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('lostpointercapture', (e) => this.up(e));
    // Stop iOS pinch/scroll gestures while playing.
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault());
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  reset() {
    this.keys.clear(); this.mouse.down = false; this.moveStick = null; this.aimStick = null;
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true;
      if (e.button === 0) this.mouse.down = true;
    } else {
      this.touchSeen = true;
      const s: Stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      const left = e.clientX < window.innerWidth / 2;
      if (left && !this.moveStick) this.moveStick = s;
      else if (!left && !this.aimStick) this.aimStick = s;
      else if (!this.moveStick) this.moveStick = s;
      else if (!this.aimStick) this.aimStick = s;
      else return;
    }
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  private move(e: PointerEvent) {
    if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true; return; }
    for (const s of [this.moveStick, this.aimStick]) if (s && s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; }
  }
  private up(e: PointerEvent) {
    if (e.pointerType === 'mouse') { if (e.button === 0 || e.type !== 'pointerup') this.mouse.down = false; return; }
    if (this.moveStick?.id === e.pointerId) this.moveStick = null;
    if (this.aimStick?.id === e.pointerId) this.aimStick = null;
  }

  /** Recompute intents for the current frame. w/h are CSS pixel size of the canvas. */
  update(w: number, h: number) {
    const k = this.keys;
    let mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (this.moveStick) {
      const dx = (this.moveStick.x - this.moveStick.ox) / STICK_RADIUS, dy = (this.moveStick.y - this.moveStick.oy) / STICK_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 0.15) { mx = dx / Math.max(1, len); my = dy / Math.max(1, len); }
      if (!this.everAimed && len > 0.3) this.angle = Math.atan2(dy, dx);
    }
    this.mx = mx; this.my = my;
    let fire = k.has(' ') || this.mouse.down;
    if (this.aimStick) {
      const dx = this.aimStick.x - this.aimStick.ox, dy = this.aimStick.y - this.aimStick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 8) { this.angle = Math.atan2(dy, dx); this.everAimed = true; }
      if (len > 14) fire = true;
    } else if (this.mouse.seen && !this.touchSeen) {
      this.angle = Math.atan2(this.mouse.y - h / 2, this.mouse.x - w / 2);
    } else if (this.mouse.seen && this.mouse.down) {
      this.angle = Math.atan2(this.mouse.y - h / 2, this.mouse.x - w / 2);
    }
    this.fire = fire;
  }
}
