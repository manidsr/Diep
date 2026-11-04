/** Unified keyboard, mouse and touch controls for movement, aim, fire and tank abilities. */
interface Stick { id: number; ox: number; oy: number; x: number; y: number }
export const STICK_RADIUS = 60;

export class Input {
  mx = 0; my = 0; angle = 0; fire = false; secondary = false; spin = false;
  moveStick: Stick | null = null;
  aimStick: Stick | null = null;
  touchSeen = false;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, rightDown: false, seen: false };
  private everAimed = false;
  onUpgrade: (idx: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const typing = (event: Event) => (event.target as HTMLElement | null)?.tagName === 'INPUT';
    window.addEventListener('keydown', (event) => {
      if (typing(event)) return;
      const key = event.key.toLowerCase();
      if (event.key >= '1' && event.key <= '8' && !event.repeat) this.onUpgrade(Number(event.key) - 1);
      if (key === 'c' && !event.repeat) this.spin = !this.spin;
      this.keys.add(key);
      if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => this.down(event));
    canvas.addEventListener('pointermove', (event) => this.move(event));
    canvas.addEventListener('pointerup', (event) => this.up(event));
    canvas.addEventListener('pointercancel', (event) => this.up(event));
    canvas.addEventListener('lostpointercapture', (event) => this.up(event));
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, (event) => event.preventDefault());
    }
    canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  }

  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.mouse.rightDown = false;
    this.moveStick = null;
    this.aimStick = null;
    this.spin = false;
  }

  private down(event: PointerEvent) {
    event.preventDefault();
    if (event.pointerType === 'mouse') {
      this.mouse.x = event.clientX; this.mouse.y = event.clientY; this.mouse.seen = true;
      if (event.button === 0) this.mouse.down = true;
      if (event.button === 2) this.mouse.rightDown = true;
    } else {
      this.touchSeen = true;
      const stick: Stick = { id: event.pointerId, ox: event.clientX, oy: event.clientY, x: event.clientX, y: event.clientY };
      const left = event.clientX < window.innerWidth / 2;
      if (left && !this.moveStick) this.moveStick = stick;
      else if (!left && !this.aimStick) this.aimStick = stick;
      else if (!this.moveStick) this.moveStick = stick;
      else if (!this.aimStick) this.aimStick = stick;
      else return;
    }
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
  }

  private move(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      this.mouse.x = event.clientX; this.mouse.y = event.clientY; this.mouse.seen = true;
      return;
    }
    for (const stick of [this.moveStick, this.aimStick]) {
      if (stick?.id === event.pointerId) { stick.x = event.clientX; stick.y = event.clientY; }
    }
  }

  private up(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      if (event.button === 0 || event.type !== 'pointerup') this.mouse.down = false;
      if (event.button === 2 || event.type !== 'pointerup') this.mouse.rightDown = false;
      return;
    }
    if (this.moveStick?.id === event.pointerId) this.moveStick = null;
    if (this.aimStick?.id === event.pointerId) this.aimStick = null;
  }

  /** Recompute intent for the current frame. w/h are CSS pixel canvas dimensions. */
  update(w: number, h: number) {
    const keys = this.keys;
    let mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (this.moveStick) {
      const dx = (this.moveStick.x - this.moveStick.ox) / STICK_RADIUS;
      const dy = (this.moveStick.y - this.moveStick.oy) / STICK_RADIUS;
      const length = Math.hypot(dx, dy);
      if (length > 0.15) { mx = dx / Math.max(1, length); my = dy / Math.max(1, length); }
      if (!this.everAimed && length > 0.3) this.angle = Math.atan2(dy, dx);
    }
    this.mx = mx; this.my = my;

    let fire = keys.has(' ') || keys.has('e') || this.mouse.down;
    if (this.aimStick) {
      const dx = this.aimStick.x - this.aimStick.ox, dy = this.aimStick.y - this.aimStick.oy;
      const length = Math.hypot(dx, dy);
      if (length > 8) { this.angle = Math.atan2(dy, dx); this.everAimed = true; }
      if (length > 14) fire = true;
    } else if (this.mouse.seen && (!this.touchSeen || this.mouse.down || this.mouse.rightDown)) {
      this.angle = Math.atan2(this.mouse.y - h / 2, this.mouse.x - w / 2);
    }
    this.fire = fire;
    const touchAimLength = this.aimStick
      ? Math.hypot(this.aimStick.x - this.aimStick.ox, this.aimStick.y - this.aimStick.oy)
      : 0;
    this.secondary = this.mouse.rightDown || keys.has('shift') || (this.touchSeen && touchAimLength > 14);
  }
}
