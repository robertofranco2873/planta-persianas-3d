import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Caja con UV en metros (para texturas repetidas en coordenadas de mundo). */
export function boxGeo(w: number, h: number, d: number, uvScale = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale > 0) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // caras: +x,-x,+y,-y,+z,-z (4 vértices cada una)
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * dims[f][0] / uvScale, uv.getY(k) * dims[f][1] / uvScale);
      }
    }
  }
  return g;
}

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, uvScale = 0): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d, uvScale), mat);
  m.position.set(x, y, z);
  return m;
}
/** Caja apoyada: y es la base. */
export function boxB(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return box(w, h, d, mat, x, y + h / 2, z);
}
export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 12): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}
/** Cilindro horizontal a lo largo de X. */
export function cylX(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const m = cyl(r, r, len, mat, seg);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
export function cylZ(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const m = cyl(r, r, len, mat, seg);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/**
 * Fusiona las mallas estáticas de un grupo en una malla por material.
 * Las mallas marcadas con userData.dynamic (o descendientes de un nodo dinámico) se conservan.
 */
const plainCache = new Map<string, THREE.MeshStandardMaterial>();
/** Material compartido con color por vértice (agrupado por rugosidad/metalicidad). */
function plainMat(rough: number, metal: number) {
  const r = rough >= 0.75 ? 0.85 : rough >= 0.45 ? 0.6 : 0.35, m = metal >= 0.4 ? 0.55 : 0.1;
  const k = `${r}|${m}`;
  let mat = plainCache.get(k);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: m }); plainCache.set(k, mat); }
  return mat;
}
const isPlain = (m: THREE.Material): m is THREE.MeshStandardMaterial => {
  const s = m as THREE.MeshStandardMaterial;
  return !!s.isMeshStandardMaterial && !s.map && !s.normalMap && !s.emissiveMap && !s.transparent && s.side === THREE.FrontSide &&
    !s.vertexColors && (s.emissiveIntensity === 0 || s.emissive.getHex() === 0) && !s.polygonOffset;
};

export function bake(group: THREE.Object3D, castShadow = true, plain = true) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    for (const c of o.children.slice()) visit(c);
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as any).isInstancedMesh && !Array.isArray(m.material)) {
      let g = m.geometry.clone();
      const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(mat);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (g.index) g = g.toNonIndexed();
      g.morphAttributes = {};
      let target: THREE.Material = m.material;
      if (plain && isPlain(m.material)) {
        const c = m.material.color;
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        target = plainMat(m.material.roughness, m.material.metalness);
      }
      const arr = buckets.get(target) ?? [];
      arr.push(g);
      buckets.set(target, arr);
      remove.push(m);
    }
  };
  for (const c of group.children.slice()) visit(c);
  for (const m of remove) m.parent?.remove(m);
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow && !(mat as any).transparent;
    mesh.receiveShadow = true;
    group.add(mesh);
    geos.forEach((g) => g.dispose());
  }
}

/** Polígono plano (rectángulo) en el piso. */
export function floorRect(w: number, d: number, mat: THREE.Material, x: number, z: number, y = 0.01): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/** Cinta plana sobre el piso que sigue una polilínea; u = distancia acumulada. */
export function ribbon(points: [number, number][], width: number, y = 0.03): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  let vi = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-4) continue;
    const nx = -(z1 - z0) / len * width / 2;
    const nz = (x1 - x0) / len * width / 2;
    // extiende un poco cada segmento para cubrir las esquinas
    const ex = (x1 - x0) / len * width / 2, ez = (z1 - z0) / len * width / 2;
    const a = [x0 - ex, z0 - ez], b = [x1 + ex, z1 + ez];
    pos.push(a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] + nx, y, b[1] + nz, b[0] - nx, y, b[1] - nz);
    uv.push(acc - width / 2, 1, acc - width / 2, 0, acc + len + width / 2, 1, acc + len + width / 2, 0);
    idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
    vi += 4;
    acc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const polyLength = (pts: [number, number][]) => {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return s;
};

export const deg = (d: number) => (d * Math.PI) / 180;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
