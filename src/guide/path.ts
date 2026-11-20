import type { AABB } from '../player/collision';

/** Rejilla de ocupación + A* para la flecha del recorrido guiado. */
export class NavGrid {
  readonly cell = 0.35;
  readonly x0 = -14; readonly z0 = -14;
  readonly nx: number; readonly nz: number;
  blocked: Uint8Array;
  private g: Float32Array; private f: Float32Array; private from: Int32Array; private closed: Uint8Array;
  private heap: Int32Array; private hn = 0;

  constructor(x1 = 96, z1 = 62) {
    this.nx = Math.ceil((x1 - this.x0) / this.cell);
    this.nz = Math.ceil((z1 - this.z0) / this.cell);
    const n = this.nx * this.nz;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n); this.f = new Float32Array(n); this.from = new Int32Array(n); this.closed = new Uint8Array(n);
    this.heap = new Int32Array(n);
  }
  idx(x: number, z: number) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  cx(k: number) { return this.x0 + ((k % this.nx) + 0.5) * this.cell; }
  cz(k: number) { return this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell; }

  rebuild(boxes: Iterable<AABB>, r: number) {
    this.blocked.fill(0);
    for (const b of boxes) {
      const i0 = Math.max(0, Math.floor((b.minX - r - this.x0) / this.cell)), i1 = Math.min(this.nx - 1, Math.floor((b.maxX + r - this.x0) / this.cell));
      const j0 = Math.max(0, Math.floor((b.minZ - r - this.z0) / this.cell)), j1 = Math.min(this.nz - 1, Math.floor((b.maxZ + r - this.z0) / this.cell));
      for (let j = j0; j <= j1; j++) {
        const z = this.z0 + (j + 0.5) * this.cell;
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + (i + 0.5) * this.cell;
          const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ));
          if ((x - qx) ** 2 + (z - qz) ** 2 < r * r) this.blocked[j * this.nx + i] = 1;
        }
      }
    }
  }

  private nearestFree(k: number) {
    if (k >= 0 && !this.blocked[k]) return k;
    if (k < 0) return -1;
    const i = k % this.nx, j = Math.floor(k / this.nx);
    for (let rad = 1; rad < 8; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
      const kk = jj * this.nx + ii;
      if (!this.blocked[kk]) return kk;
    }
    return -1;
  }

  private push(k: number) {
    const h = this.heap, f = this.f;
    let i = this.hn++;
    h[i] = k;
    while (i > 0) { const p = (i - 1) >> 1; if (f[h[p]] <= f[h[i]]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  }
  private pop() {
    const h = this.heap, f = this.f;
    const top = h[0];
    h[0] = h[--this.hn];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1; let m = i;
      if (l < this.hn && f[h[l]] < f[h[m]]) m = l;
      if (r < this.hn && f[h[r]] < f[h[m]]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
    return top;
  }

  /** Ruta desde (sx,sz) hasta cualquier celda que cumpla `goal`. h = distancia al punto (tx,tz). */
  find(sx: number, sz: number, tx: number, tz: number, goal: (x: number, z: number) => boolean): [number, number][] | null {
    const s = this.nearestFree(this.idx(sx, sz));
    if (s < 0) return null;
    this.g.fill(Infinity); this.closed.fill(0); this.hn = 0;
    const hfun = (k: number) => Math.hypot(this.cx(k) - tx, this.cz(k) - tz);
    this.g[s] = 0; this.f[s] = hfun(s); this.from[s] = -1; this.push(s);
    const nx = this.nx, c = this.cell, D = Math.SQRT2 * c;
    let iter = 0;
    while (this.hn > 0 && iter++ < 120000) {
      const k = this.pop();
      if (this.closed[k]) continue;
      this.closed[k] = 1;
      if (goal(this.cx(k), this.cz(k))) return this.smooth(this.trace(k), sx, sz);
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= this.nz) continue;
        const kk = jj * nx + ii;
        if (this.blocked[kk] || this.closed[kk]) continue;
        if (di && dj && (this.blocked[j * nx + ii] || this.blocked[jj * nx + i])) continue;
        const ng = this.g[k] + (di && dj ? D : c);
        if (ng < this.g[kk]) { this.g[kk] = ng; this.f[kk] = ng + hfun(kk); this.from[kk] = k; this.push(kk); }
      }
    }
    return null;
  }
  private trace(k: number) {
    const out: [number, number][] = [];
    while (k >= 0) { out.push([this.cx(k), this.cz(k)]); k = this.from[k]; }
    return out.reverse();
  }
  clear(ax: number, az: number, bx: number, bz: number) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (this.cell * 0.4));
    for (let t = 0; t <= n; t++) {
      const k = this.idx(ax + (bx - ax) * t / n, az + (bz - az) * t / n);
      if (k < 0 || this.blocked[k]) return false;
    }
    return true;
  }
  /** "Jalar la cuerda": elimina vértices innecesarios con línea de vista. */
  private smooth(p: [number, number][], sx: number, sz: number) {
    if (p.length) p[0] = [sx, sz];
    const out: [number, number][] = [p[0]];
    let i = 0;
    while (i < p.length - 1) {
      let j = p.length - 1;
      while (j > i + 1 && !this.clear(p[i][0], p[i][1], p[j][0], p[j][1])) j--;
      out.push(p[j]);
      i = j;
    }
    return out;
  }
}
