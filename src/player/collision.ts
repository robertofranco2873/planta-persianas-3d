import * as THREE from 'three';

export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; h?: number; tag?: string }

export const rectAABB = (x: number, z: number, w: number, d: number, h = 3, tag?: string): AABB =>
  ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, tag });

/** Huella de una caja w×d rotada `rotRad` alrededor de Y. */
export function rotatedAABB(x: number, z: number, w: number, d: number, rotRad: number, h = 3, tag?: string): AABB {
  const c = Math.abs(Math.cos(rotRad)), s = Math.abs(Math.sin(rotRad));
  const ew = (w * c + d * s) / 2, ed = (w * s + d * c) / 2;
  return { minX: x - ew, maxX: x + ew, minZ: z - ed, maxZ: z + ed, h, tag };
}

export class Collision {
  static: AABB[] = [];
  dynamic = new Map<string, AABB[]>();
  /** Cajas 3D que bloquean la cámara (muros). */
  camBoxes: THREE.Box3[] = [];

  addStatic(b: AABB) { this.static.push(b); }
  addWall(b: AABB, y0 = 0, y1 = 11) {
    this.static.push(b);
    this.camBoxes.push(new THREE.Box3(new THREE.Vector3(b.minX, y0, b.minZ), new THREE.Vector3(b.maxX, y1, b.maxZ)));
  }
  setDynamic(key: string, boxes: AABB[]) { if (boxes.length) this.dynamic.set(key, boxes); else this.dynamic.delete(key); }

  *all(): Generator<AABB> {
    yield* this.static;
    for (const arr of this.dynamic.values()) yield* arr;
  }

  /** Empuja un círculo (x,z,r) fuera de todas las cajas. Devuelve la posición corregida. */
  resolve(p: { x: number; z: number }, r: number) {
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const b of this.all()) {
        if (p.x < b.minX - r || p.x > b.maxX + r || p.z < b.minZ - r || p.z > b.maxZ + r) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // centro dentro de la caja: salir por el lado más cercano
          const pen = [p.x - b.minX + r, b.maxX - p.x + r, p.z - b.minZ + r, b.maxZ - p.z + r];
          const i = pen.indexOf(Math.min(...pen));
          if (i === 0) p.x = b.minX - r; else if (i === 1) p.x = b.maxX + r; else if (i === 2) p.z = b.minZ - r; else p.z = b.maxZ + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return p;
  }

  blocked(x: number, z: number, r: number) {
    for (const b of this.all()) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Posición libre más cercana (búsqueda en espiral). */
  findFree(x: number, z: number, r: number) {
    if (!this.blocked(x, z, r)) return { x, z };
    for (let rad = 0.25; rad < 15; rad += 0.25) {
      const n = Math.ceil((rad * 2 * Math.PI) / 0.3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const nx = x + Math.cos(a) * rad, nz = z + Math.sin(a) * rad;
        if (!this.blocked(nx, nz, r)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  /** Punto libre más cercano considerando sólo las cajas estáticas + `boxes` (p.ej. las del layout destino). */
  findFreeWith(x: number, z: number, r: number, boxes: AABB[]) {
    const hit = (px: number, pz: number) => {
      for (const arr of [this.static, boxes]) for (const b of arr) {
        const cx = Math.max(b.minX, Math.min(px, b.maxX)), cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
        if ((px - cx) ** 2 + (pz - cz) ** 2 < r * r) return true;
      }
      return false;
    };
    if (!hit(x, z)) return { x, z };
    for (let rad = 0.15; rad < 12; rad += 0.15) {
      const n = Math.ceil((rad * 2 * Math.PI) / 0.2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const nx = x + Math.cos(a) * rad, nz = z + Math.sin(a) * rad;
        if (!hit(nx, nz)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  /** Distancia máxima libre a lo largo de un rayo (para la cámara). */
  rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    const ray = new THREE.Ray(origin, dir);
    const hit = new THREE.Vector3();
    let best = maxDist;
    const test = (b: THREE.Box3) => {
      if (b.containsPoint(origin)) return;
      if (ray.intersectBox(b, hit)) {
        const d = hit.distanceTo(origin);
        if (d < best) best = d;
      }
    };
    for (const b of this.camBoxes) test(b);
    // objetos altos (racks, elevadores, remolques, árboles) también detienen la cámara
    const tmp = new THREE.Box3();
    for (const b of this.all()) {
      if ((b.h ?? 0) < 2.4) continue;
      tmp.min.set(b.minX, 0, b.minZ); tmp.max.set(b.maxX, b.h!, b.maxZ);
      test(tmp);
    }
    return best;
  }
}
