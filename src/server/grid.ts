/** Minimal uniform spatial hash. Cell size must exceed the largest possible sum of two radii. */
export class SpatialGrid {
  private cells = new Map<number, number[]>();
  constructor(private readonly cell: number) {}
  private key(cx: number, cy: number) { return (cx + 512) * 1024 + (cy + 512); }
  clear() { this.cells.clear(); }
  insert(i: number, x: number, y: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const c = this.cells.get(k);
    if (c) c.push(i); else this.cells.set(k, [i]);
  }
  forNeighbors(x: number, y: number, fn: (i: number) => void) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const c = this.cells.get(this.key(cx + dx, cy + dy));
      if (c) for (const i of c) fn(i);
    }
  }
}
