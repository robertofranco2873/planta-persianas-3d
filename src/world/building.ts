import * as THREE from 'three';
import type { GameData, Zona } from '../data';
import { zonaById } from '../data';
import { bake, box, boxB, boxGeo, cyl, floorRect } from '../util/geo';
import { Collision, rectAABB } from '../player/collision';
import { Mats, signTexture, SignKind, canvasTex, textCanvas, PAL } from './materials';

interface Opening { c: number; w: number; h: number; kind: 'porton' | 'anden' | 'salida' | 'puerta' }
type Side = 'N' | 'S' | 'E' | 'W';

export interface Building {
  group: THREE.Group;
  update(player: THREE.Vector3, cam: THREE.Vector3, drone: boolean, dt?: number): void;
  entrance: { x: number; z: number };
  roofOn: boolean;
  ceilingAt(x: number, z: number): number;
  insideNave(p: THREE.Vector3): boolean;
  insideAnnex(p: THREE.Vector3): boolean;
  annexRooms: Zona[];
}

const WALL_T = 0.3;
const BASE_H = 1.2;

export function buildBuilding(data: GameData, M: Mats, col: Collision): Building {
  const P = data.planta;
  const nave = P.nave;
  const W = nave.w, D = nave.d, H = nave.altura;
  const x0 = nave.x - W / 2, z0 = nave.z - D / 2, x1 = x0 + W, z1 = z0 + D;
  const group = new THREE.Group();
  group.name = 'building';

  // ---------- Piso de la nave ----------
  const floorGeo = new THREE.PlaneGeometry(W, D);
  floorGeo.rotateX(-Math.PI / 2);
  const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 4, uv.getY(i) * D / 4);
  const floor = new THREE.Mesh(floorGeo, M.floor);
  floor.position.set(nave.x, 0.0, nave.z);
  floor.receiveShadow = true;
  group.add(floor);

  // ---------- Aberturas en muros (desde planta.json) ----------
  const open: Record<Side, Opening[]> = { N: [], S: [], E: [], W: [] };
  for (const a of P.andenes) {
    if (Math.abs(a.z - z0) < 0.5) open.N.push({ c: a.x, w: 3.6, h: 4.5, kind: 'porton' });
    else if (Math.abs(a.x - x1) < 0.5) open.E.push({ c: a.z, w: 3.0, h: 3.6, kind: 'anden' });
  }
  for (const s of P.seguridad.salidas_emergencia) {
    if (Math.abs(s.z - z0) < 0.5) open.N.push({ c: s.x, w: 1.2, h: 2.3, kind: 'salida' });
    else if (Math.abs(s.z - z1) < 0.5) open.S.push({ c: s.x, w: 1.2, h: 2.3, kind: 'salida' });
    else if (Math.abs(s.x - x0) < 0.5) open.W.push({ c: s.z, w: 1.2, h: 2.3, kind: 'salida' });
    else if (Math.abs(s.x - x1) < 0.5) open.E.push({ c: s.z, w: 1.2, h: 2.3, kind: 'salida' });
  }
  // Acceso peatonal nave ↔ pasillo de oficinas (entre recepción y lockers)
  const rec = zonaById(data, 'recepcion');
  const lock = zonaById(data, 'lockers');
  if (rec && lock) {
    const c = (rec.x + rec.w / 2 + lock.x - lock.w / 2) / 2;
    open.S.push({ c, w: 1.2, h: 2.4, kind: 'puerta' });
  }

  // materiales por lado (para volverlos semitransparentes)
  const sideMats: Record<Side, THREE.MeshStandardMaterial[]> = { N: [], S: [], E: [], W: [] };
  const sideGroups: Record<Side, THREE.Group> = { N: new THREE.Group(), S: new THREE.Group(), E: new THREE.Group(), W: new THREE.Group() };

  const buildWall = (side: Side) => {
    const horiz = side === 'N' || side === 'S';
    const len = horiz ? W : D;
    const start = horiz ? x0 : z0;
    const fixed = side === 'N' ? z0 - WALL_T / 2 : side === 'S' ? z1 + WALL_T / 2 : side === 'W' ? x0 - WALL_T / 2 : x1 + WALL_T / 2;
    const wallM = (M.wall as THREE.MeshStandardMaterial).clone();
    const baseM = (M.wallBase as THREE.MeshStandardMaterial).clone();
    sideMats[side].push(wallM, baseM);
    const g = sideGroups[side];
    const ops = open[side].slice().sort((a, b) => a.c - b.c);
    const piece = (a: number, b: number, y0: number, y1: number, mat: THREE.Material) => {
      const l = b - a;
      if (l <= 0.01 || y1 - y0 <= 0.01) return;
      const c = (a + b) / 2;
      const m = horiz
        ? box(l, y1 - y0, WALL_T, mat, c, (y0 + y1) / 2, fixed, 2)
        : box(WALL_T, y1 - y0, l, mat, fixed, (y0 + y1) / 2, c, 2);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };
    const solid = (a: number, b: number) => {
      piece(a, b, 0, BASE_H, baseM);
      piece(a, b, BASE_H, H, wallM);
      const bb = horiz ? rectAABB((a + b) / 2, fixed, b - a, WALL_T + 0.1, H) : rectAABB(fixed, (a + b) / 2, WALL_T + 0.1, b - a, H);
      col.addWall(bb, 0, H);
    };
    let cur = start - (horiz ? WALL_T : 0);
    const end = start + len + (horiz ? WALL_T : 0);
    for (const o of ops) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      solid(cur, a);
      // dintel
      if (o.h < BASE_H) piece(a, b, o.h, BASE_H, baseM);
      piece(a, b, Math.max(o.h, BASE_H), H, wallM);
      const lb = horiz ? new THREE.Box3(new THREE.Vector3(a, o.h, fixed - WALL_T / 2), new THREE.Vector3(b, H, fixed + WALL_T / 2))
        : new THREE.Box3(new THREE.Vector3(fixed - WALL_T / 2, o.h, a), new THREE.Vector3(fixed + WALL_T / 2, H, b));
      col.camBoxes.push(lb);
      decorateOpening(side, o, fixed);
      cur = b;
    }
    solid(cur, end);
    bake(g, true, false);
    group.add(g);
  };

  const deco = new THREE.Group();
  const shutterM = M.std('#b9bec4', 0.5, 0.45);
  const exitDoors: { hinge: THREE.Group; open: number; sign: number; box: ReturnType<typeof rectAABB>; x: number; z: number; baseRot: number }[] = [];
  const decorateOpening = (side: Side, o: Opening, fixed: number) => {
    const horiz = side === 'N' || side === 'S';
    const place = (m: THREE.Object3D, along: number, y: number, off = 0) => {
      const out = side === 'N' || side === 'W' ? -1 : 1;
      if (horiz) m.position.set(along, y, fixed + off * out);
      else { m.position.set(fixed + off * out, y, along); m.rotation.y = Math.PI / 2; }
      deco.add(m);
    };
    const frameMat = o.kind === 'salida' || o.kind === 'puerta' ? M.green : M.yellow;
    // marco
    place(box(0.12, o.h, WALL_T + 0.06, frameMat), o.c - o.w / 2 - 0.06, o.h / 2);
    place(box(0.12, o.h, WALL_T + 0.06, frameMat), o.c + o.w / 2 + 0.06, o.h / 2);
    place(box(o.w + 0.24, 0.12, WALL_T + 0.06, frameMat), o.c, o.h + 0.06);
    if (o.kind === 'porton' || o.kind === 'anden') {
      const drum = cyl(0.3, 0.3, o.w, M.steel, 14);
      drum.rotation.z = Math.PI / 2;
      const gg = new THREE.Group(); gg.add(drum);
      place(gg, o.c, o.h + 0.45, -0.5);
      if (o.kind === 'porton') {
        // portón de recibo cerrado (se entra a la planta por la recepción)
        place(box(o.w, o.h, 0.08, shutterM, 0, 0, 0), o.c, o.h / 2);
        for (let y = 0.3; y < o.h; y += 0.3) place(box(o.w, 0.03, 0.1, M.steel), o.c, y);
        const bb = horiz ? rectAABB(o.c, fixed, o.w, WALL_T + 0.1, o.h) : rectAABB(fixed, o.c, WALL_T + 0.1, o.w, o.h);
        col.addWall(bb, 0, o.h);
      }
      // topes de andén
      if (o.kind === 'anden') {
        place(boxB(0.3, 0.9, 0.25, M.black), o.c - o.w / 2 + 0.2, 0, 0.3);
        place(boxB(0.3, 0.9, 0.25, M.black), o.c + o.w / 2 - 0.2, 0, 0.3);
      }
    } else {
      if (o.kind === 'salida') {
        // puerta de emergencia: abre hacia afuera, sólo desde dentro (barra antipánico)
        const outSign = side === 'N' || side === 'W' ? -1 : 1;
        const hingeAlong = horiz ? o.c - o.w / 2 : o.c + o.w / 2;
        const hinge = new THREE.Group();
        const leaf = new THREE.Group();
        leaf.add(box(o.w - 0.04, o.h - 0.04, 0.05, M.std('#7f8c8d', 0.5, 0.4), o.w / 2, o.h / 2, 0));
        leaf.add(box(o.w * 0.7, 0.06, 0.06, M.red, o.w / 2, 1.0, 0.06 * -outSign));
        leaf.add(box(o.w * 0.7, 0.06, 0.06, M.red, o.w / 2, 1.0, 0.06 * outSign));
        hinge.add(leaf);
        hinge.userData.dynamic = true;
        place(hinge, hingeAlong, 0, -0.0);
        const bb = horiz ? rectAABB(o.c, fixed, o.w, WALL_T + 0.1, o.h) : rectAABB(fixed, o.c, WALL_T + 0.1, o.w, o.h);
        exitDoors.push({ hinge, open: 0, sign: outSign, box: bb, x: horiz ? o.c : fixed, z: horiz ? fixed : o.c, baseRot: hinge.rotation.y });
      }
      // letrero de salida
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.32), new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas([o.kind === 'salida' ? 'SALIDA DE EMERGENCIA' : 'ACCESO PEATONAL'], { w: 512, h: 160, bg: '#1E8449', font: 52 })) }));
      const sign = new THREE.Group(); sign.add(s);
      // orientar hacia el interior de la nave
      s.rotation.y = side === 'N' || side === 'W' ? 0 : Math.PI;
      place(sign, o.c, o.h + 0.45, -(WALL_T / 2 + 0.03));
    }
  };

  (['N', 'S', 'E', 'W'] as Side[]).forEach(buildWall);
  bake(deco);
  group.add(deco);

  // ---------- Techo de arco ----------
  const rise = 3;
  const half = D / 2;
  const R = (half * half + rise * rise) / (2 * rise);
  const ha = Math.asin(half / R);
  const roof = new THREE.Group();
  {
    const segs = 24;
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = -ha + (2 * ha * i) / segs;
      const z = nave.z + R * Math.sin(a);
      const y = H + R * Math.cos(a) - R * Math.cos(ha);
      pos.push(x0 - 0.4, y + 0.15, z, x1 + 0.4, y + 0.15, z);
      uvs.push(0, i * 1.5, (W + 0.8) / 2, i * 1.5);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const rm = new THREE.Mesh(g, M.roof);
    roof.add(rm);
    // plafón interior claro (iluminado por las lámparas) bajo la lámina
    const ceilMat = new THREE.MeshStandardMaterial({ map: M.roof.map, color: '#d6d9dc', emissive: '#5a5e63', emissiveIntensity: 0.6, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
    const ceil = new THREE.Mesh(g, ceilMat);
    ceil.position.y = -0.12;
    roof.add(ceil);
    // tímpanos (frentes del arco)
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    for (let i = 0; i <= 24; i++) { const a = -ha + (2 * ha * i) / 24; shape.lineTo(R * Math.sin(a), R * Math.cos(a) - R * Math.cos(ha)); }
    shape.lineTo(half, 0);
    const sg = new THREE.ShapeGeometry(shape);
    for (const xx of [x0 - WALL_T / 2, x1 + WALL_T / 2]) {
      const t = new THREE.Mesh(sg, M.roof);
      t.rotation.y = Math.PI / 2;
      t.position.set(xx, H, nave.z);
      roof.add(t);
    }
  }
  group.add(roof);

  // ---------- Lámparas LED (rejilla cada 8 m a 10 m) ----------
  {
    const pts: [number, number][] = [];
    for (let x = x0 + 4; x < x1; x += 8) for (let z = z0 + 4; z < z1; z += 8) pts.push([x, z]);
    const lamp = new THREE.InstancedMesh(boxGeo(1.4, 0.08, 0.45), M.glow, pts.length);
    const housing = new THREE.InstancedMesh(boxGeo(1.5, 0.12, 0.55), M.dark, pts.length);
    const rod = new THREE.InstancedMesh(boxGeo(0.03, 1.0, 0.03), M.steel, pts.length * 2);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => {
      lamp.setMatrixAt(i, m4.makeTranslation(x, 9.94, z));
      housing.setMatrixAt(i, m4.makeTranslation(x, 10.04, z));
      rod.setMatrixAt(i * 2, m4.makeTranslation(x - 0.6, 10.6, z));
      rod.setMatrixAt(i * 2 + 1, m4.makeTranslation(x + 0.6, 10.6, z));
    });
    group.add(lamp, housing, rod);
  }

  // ---------- Columnas (pilastras perimetrales) ----------
  {
    const colM = M.std(PAL.carbon, 0.5, 0.4);
    const pg = new THREE.Group();
    const okAlong = (side: Side, c: number) => open[side].every((o) => Math.abs(o.c - c) > o.w / 2 + 0.5);
    for (let x = x0 + 6; x < x1 - 1; x += 6) {
      if (okAlong('N', x)) { pg.add(boxB(0.4, H, 0.4, colM, x, 0, z0 + 0.2)); col.addStatic(rectAABB(x, z0 + 0.2, 0.4, 0.4)); }
      if (okAlong('S', x)) { pg.add(boxB(0.4, H, 0.4, colM, x, 0, z1 - 0.2)); col.addStatic(rectAABB(x, z1 - 0.2, 0.4, 0.4)); }
    }
    for (let z = z0 + 6; z < z1 - 1; z += 6) {
      if (okAlong('W', z)) { pg.add(boxB(0.4, H, 0.4, colM, x0 + 0.2, 0, z)); col.addStatic(rectAABB(x0 + 0.2, z, 0.4, 0.4)); }
      if (okAlong('E', z)) { pg.add(boxB(0.4, H, 0.4, colM, x1 - 0.2, 0, z)); col.addStatic(rectAABB(x1 - 0.2, z, 0.4, 0.4)); }
    }
    bake(pg);
    group.add(pg);
  }

  // ---------- Marcas de piso ----------
  const marks = new THREE.Group();
  const line = (ax: number, az: number, bx: number, bz: number, w: number, mat: THREE.Material, y = 0.012) => {
    const len = Math.hypot(bx - ax, bz - az);
    const m = floorRect(len, w, mat, (ax + bx) / 2, (az + bz) / 2, y);
    m.rotation.y = -Math.atan2(bz - az, bx - ax);
    marks.add(m);
  };
  for (const z of P.zonas) {
    if (z.tipo === 'pasillo_montacargas') {
      const lx0 = z.x - z.w / 2, lx1 = z.x + z.w / 2, lz0 = z.z - z.d / 2, lz1 = z.z + z.d / 2;
      if (z.w >= z.d) { line(lx0, lz0 + 0.1, lx1, lz0 + 0.1, 0.15, M.paintYellow); line(lx0, lz1 - 0.1, lx1, lz1 - 0.1, 0.15, M.paintYellow); }
      else { line(lx0 + 0.1, lz0, lx0 + 0.1, lz1, 0.15, M.paintYellow); line(lx1 - 0.1, lz0, lx1 - 0.1, lz1, 0.15, M.paintYellow); }
    } else if (['almacen', 'residuos', 'servicio'].includes(z.tipo) && z.z + z.d / 2 <= z1 + 0.2 && z.x - z.w / 2 >= x0 - 0.2) {
      const mat = z.tipo === 'almacen' ? M.paintWhite : M.paintYellow;
      const lx0 = z.x - z.w / 2, lx1 = z.x + z.w / 2, lz0 = z.z - z.d / 2, lz1 = Math.min(z.z + z.d / 2, z1);
      line(lx0, lz0, lx1, lz0, 0.08, mat); line(lx0, lz1, lx1, lz1, 0.08, mat);
      line(lx0, lz0, lx0, lz1, 0.08, mat); line(lx1, lz0, lx1, lz1, 0.08, mat);
    } else if (z.id === 'empaque') {
      const lx0 = z.x - z.w / 2, lx1 = z.x + z.w / 2, lz0 = z.z - z.d / 2, lz1 = z.z + z.d / 2;
      line(lx0, lz0, lx1, lz0, 0.08, M.paintWhite); line(lx0, lz0, lx0, lz1, 0.08, M.paintWhite);
    }
  }
  // Pasillos peatonales verdes de 1 m (decisión de diseño: no vienen en el JSON, ver TODO.md)
  const pc = zonaById(data, 'pasillo_central');
  const door = open.S.find((o) => o.kind === 'puerta');
  const ps = zonaById(data, 'pasillo_sur');
  if (door) {
    // del acceso peatonal hacia producción, cruzando el pasillo sur con paso de cebra
    const top = ps ? ps.z - ps.d / 2 - 2.0 : 27.0;
    floorPaint(marks, M.paintGreen, door.c - 0.5, top, door.c + 0.5, z1);
    if (ps) for (let zz = ps.z - ps.d / 2 + 0.25; zz < ps.z + ps.d / 2; zz += 0.6) floorPaint(marks, M.paintWhite, door.c - 0.5, zz, door.c + 0.5, zz + 0.3);
  }
  const po = zonaById(data, 'pasillo_oeste');
  if (po) floorPaint(marks, M.paintGreen, po.x + po.w / 2 + 0.15, po.z - po.d / 2, po.x + po.w / 2 + 1.05, po.z + po.d / 2);
  else floorPaint(marks, M.paintGreen, 8.5, 7.0, 9.5, 27.5);
  void pc;
  // nombres de zonas pintados en el piso
  for (const z of P.zonas) {
    if (!['almacen', 'residuos', 'servicio', 'pasillo_montacargas'].includes(z.tipo) && z.id !== 'empaque') continue;
    if (z.z - z.d / 2 > z1 || z.x + z.w / 2 < x0) continue;
    const c = textCanvas([z.nombre.toUpperCase()], { w: 1024, h: 128, bg: 'rgba(0,0,0,0)', fg: 'rgba(248,248,248,0.85)', font: 64 });
    const wTxt = Math.min(z.w, z.d, 6) > 2 ? Math.min(Math.max(z.w, z.d) * 0.8, 9) : 3;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wTxt, wTxt / 8), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2;
    if (z.d > z.w * 1.5) m.rotation.z = Math.PI / 2;
    const top = z.tipo === 'pasillo_montacargas';
    m.position.set(z.x + (top && z.w > z.d ? -z.w / 2 + wTxt / 2 + 1 : 0), 0.015, top && z.w > z.d ? z.z : z.d > z.w * 1.5 ? z.z : z.z - z.d / 2 + 0.5);
    if (z.id === 'pasillo_central') m.position.z = z.z + z.d / 2 - wTxt / 2 - 0.5;
    marks.add(m);
  }
  bake(marks, false);
  group.add(marks);

  // ---------- Anexo de oficinas ----------
  const annexIds = ['oficinas', 'oficina_gerente', 'recepcion', 'banos', 'lockers', 'comedor'];
  const annexRooms = annexIds.map((id) => zonaById(data, id)).filter(Boolean) as Zona[];
  const annexRoof = new THREE.Group();
  const annexWalls = new THREE.Group();
  // puertas: lado y coordenada (decisión de diseño)
  const roomDoors: Record<string, [Side, number][]> = {};
  const z_ = (id: string) => zonaById(data, id)!;
  if (annexRooms.length === 6) {
    const of = z_('oficinas'), ge = z_('oficina_gerente'), ba = z_('banos'), re = z_('recepcion'), lo = z_('lockers'), co = z_('comedor');
    const gx = Math.max(ge.x, of.x - of.w / 2 + 1.5);
    roomDoors.oficinas = [['N', gx], ['N', ba.x], ['E', of.z - of.d / 2 + 2.5]];
    roomDoors.oficina_gerente = [['S', gx]];
    roomDoors.banos = [['S', ba.x]];
    roomDoors.recepcion = [['E', re.z], ['E', z1 + WALL_T + 0.75]];
    roomDoors.lockers = [['W', lo.z + 1.0]];
    roomDoors.comedor = [['W', co.z], ['E', co.z]];
  }
  const RH = 3.0;
  const annexLights: [number, number][] = [];
  for (const r of annexRooms) {
    let rx0 = r.x - r.w / 2, rx1 = r.x + r.w / 2, rz0 = r.z - r.d / 2, rz1 = r.z + r.d / 2;
    const snapN = Math.abs(rz0 - z1) < 1.0; // comparte muro con la nave
    if (snapN) rz0 = z1 + WALL_T;
    const doors = roomDoors[r.id] ?? [];
    const wallSeg = (side: Side) => {
      if (side === 'N' && snapN) return;
      const horiz = side === 'N' || side === 'S';
      const fixed = side === 'N' ? rz0 : side === 'S' ? rz1 : side === 'W' ? rx0 : rx1;
      const a0 = horiz ? rx0 : rz0, a1 = horiz ? rx1 : rz1;
      const ds = doors.filter((d) => d[0] === side).map((d) => d[1]).sort((a, b) => a - b);
      let cur = a0;
      const seg = (a: number, b: number) => {
        if (b - a < 0.05) return;
        const c = (a + b) / 2, l = b - a;
        const m = horiz ? boxB(l, RH, 0.15, M.officeWall, c, 0, fixed) : boxB(0.15, RH, l, M.officeWall, fixed, 0, c);
        m.castShadow = true; m.receiveShadow = true;
        annexWalls.add(m);
        col.addWall(horiz ? rectAABB(c, fixed, l, 0.2, RH) : rectAABB(fixed, c, 0.2, l, RH), 0, RH);
      };
      for (const d of ds) { seg(cur, d - 0.6); cur = d + 0.6; }
      seg(cur, a1);
    };
    (['N', 'S', 'E', 'W'] as Side[]).forEach(wallSeg);
    const fl = floorRect(rx1 - rx0, rz1 - rz0, r.id === 'banos' ? M.white : M.officeFloor, (rx0 + rx1) / 2, (rz0 + rz1) / 2, 0.006);
    group.add(fl);
    const rf = boxB(rx1 - rx0 + 0.2, 0.15, rz1 - rz0 + 0.2, M.officeRoof, (rx0 + rx1) / 2, RH, (rz0 + rz1) / 2);
    annexRoof.add(rf);
    // plafones LED en el techo de cada sala
    for (let x = rx0 + 1.6; x < rx1 - 0.8; x += 3.2) for (let z = rz0 + 1.4; z < rz1 - 0.6; z += 2.8) annexLights.push([x, z]);
    // letrero de la sala sobre la puerta principal
    const d0 = doors[0];
    if (d0) {
      const c = textCanvas([r.nombre], { w: 512, h: 96, bg: PAL.cafe, font: 40 });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), new THREE.MeshBasicMaterial({ map: canvasTex(c) }));
      const [side, along] = d0;
      const off = 0.09;
      if (side === 'N') { s.position.set(along, 2.6, rz0 - off); s.rotation.y = Math.PI; }
      if (side === 'S') { s.position.set(along, 2.6, rz1 + off); }
      if (side === 'E') { s.position.set(rx1 + off, 2.6, along); s.rotation.y = Math.PI / 2; }
      if (side === 'W') { s.position.set(rx0 - off, 2.6, along); s.rotation.y = -Math.PI / 2; }
      annexWalls.add(s);
    }
  }
  if (annexLights.length) {
    const lm = new THREE.InstancedMesh(boxGeo(0.6, 0.03, 0.6), M.glow, annexLights.length);
    const m4 = new THREE.Matrix4();
    annexLights.forEach(([x, z], i) => lm.setMatrixAt(i, m4.makeTranslation(x, RH - 0.02, z)));
    annexRoof.add(lm);
  }
  bake(annexWalls);
  group.add(annexWalls, annexRoof);
  const annexBox = annexRooms.reduce((b, r) => b.union(new THREE.Box3(new THREE.Vector3(r.x - r.w / 2, 0, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, RH, r.z + r.d / 2))), new THREE.Box3());
  // piso del pasillo entre recepción/oficinas y lockers/comedor
  if (annexRooms.length) {
    const fl = floorRect(annexBox.max.x - annexBox.min.x + 1, annexBox.max.z - z1 + 0.5, M.apron, (annexBox.min.x + annexBox.max.x) / 2, (z1 + annexBox.max.z) / 2, 0.003);
    group.add(fl);
  }

  // ---------- Entrada principal y control de acceso ----------
  // El pasillo entre recepción y lockers es el vestíbulo; un torniquete obliga a pasar por la recepción.
  let entrance = { x: (annexBox.min.x + annexBox.max.x) / 2, z: annexBox.max.z + 3 };
  if (rec && lock) {
    const cx0 = rec.x + rec.w / 2, cx1 = lock.x - lock.w / 2, cx = (cx0 + cx1) / 2;
    const tz = z1 + WALL_T + 1.6; // entre la puerta norte (a la nave) y la sur (desde la entrada) de la recepción
    const ts = new THREE.Group();
    ts.add(boxB(0.18, 1.0, 0.3, M.steel, cx0 + 0.12, 0, tz), boxB(0.18, 1.0, 0.3, M.steel, cx1 - 0.12, 0, tz));
    ts.add(box(cx1 - cx0 - 0.3, 0.05, 0.05, M.metal, cx, 0.95, tz));
    ts.add(box(cx1 - cx0 - 0.3, 0.05, 0.05, M.metal, cx, 0.6, tz));
    ts.add(boxB(cx1 - cx0, 0.1, 0.1, M.red, cx, 1.9, tz));
    const tsSign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.28), new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas(['Acceso sólo por recepción'], { w: 512, h: 110, bg: PAL.rojo, font: 40 })) }));
    tsSign.position.set(cx, 2.2, tz + 0.06);
    ts.add(tsSign);
    bake(ts);
    group.add(ts);
    col.addWall(rectAABB(cx, tz, cx1 - cx0, 0.3, 1.0), 0, 1.0);
    // entrada principal al final del vestíbulo
    const ez = annexRooms.find((r) => r.id === 'oficinas');
    const eZ = ez ? ez.z + ez.d / 2 : 50;
    entrance = { x: cx, z: eZ + 0.2 };
    const can = new THREE.Group();
    can.add(boxB(4.4, 0.2, 3.0, M.dark, cx, 3.2, eZ + 1.4));
    for (const dx of [-2.0, 2.0]) can.add(boxB(0.15, 3.2, 0.15, M.dark, cx + dx, 0, eZ + 2.7));
    can.add(boxB(4.0, 0.03, 2.6, M.std(PAL.cafe, 0.6), cx, 0.0, eZ + 1.4));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.6), new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas(['ENTRADA PRINCIPAL · RECEPCIÓN'], { w: 1024, h: 146, bg: PAL.cafe, border: PAL.amarillo, font: 64 })) }));
    sign.position.set(cx, 3.75, eZ + 2.9);
    can.add(sign);
    bake(can);
    group.add(can);
    for (const dx of [-2.0, 2.0]) col.addStatic(rectAABB(cx + dx, eZ + 2.7, 0.2, 0.2, 3.2));
    // banqueta desde el estacionamiento
    const est = zonaById(data, 'estacionamiento');
    const px1 = est ? est.x - est.w / 2 + 6 : cx + 16;
    const walk = floorRect(px1 - cx + 1.2, 1.8, M.std('#cfc9bf', 0.85), (cx - 0.6 + px1) / 2, eZ + 3.6, 0.004);
    group.add(walk, floorRect(1.8, 3.2, M.std('#cfc9bf', 0.85), cx, eZ + 1.6, 0.004));
  }

  // ---------- Señalética NOM-026 ----------
  const signs = new THREE.Group();
  const signMats = new Map<string, THREE.Material>();
  const sign = (kind: SignKind, text: string, sym: string, x: number, y: number, z: number, rotY: number) => {
    const key = kind + text;
    let mat = signMats.get(key);
    if (!mat) { mat = new THREE.MeshStandardMaterial({ map: signTexture(kind, text, sym), roughness: 0.6 }); signMats.set(key, mat); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    signs.add(m);
  };
  const inN = z0 + 0.02, inS = z1 - 0.02, inW = x0 + 0.02, inE = x1 - 0.02;
  for (let x = x0 + 9; x < x1 - 3; x += 12) sign('precaucion', 'Precaución: tránsito de montacargas', '⚠', x, 2.6, inN, 0);
  sign('obligatoria', 'Uso obligatorio de casco', '⛑', door ? door.c - 1.85 : 21, 2.0, inS, Math.PI);
  sign('obligatoria', 'Uso obligatorio de chaleco', '🦺', door ? door.c - 1.05 : 22, 2.0, inS, Math.PI);
  sign('prohibicion', 'Prohibido fumar', '🚬', 40, 2.6, inS, Math.PI);
  sign('obligatoria', 'Uso obligatorio de lentes y tapones auditivos', '👓', inW, 2.4, 16, Math.PI / 2);
  sign('obligatoria', 'Uso obligatorio de botas con casquillo', '🥾', inW, 2.4, 22, Math.PI / 2);
  sign('precaucion', 'Riesgo eléctrico', '⚡', 12.4, 2.6, inN, 0);
  sign('prohibicion', 'Prohibido el paso a personal no autorizado', '✋', inE, 2.6, 24, -Math.PI / 2);
  sign('emergencia', 'Ruta de evacuación', '➜', inW, 2.4, 6, Math.PI / 2);
  sign('emergencia', 'Ruta de evacuación', '➜', inE, 2.6, 5, -Math.PI / 2);
  sign('emergencia', 'Punto de reunión', '⇱', 34.6 + 0.0, 2.2, z1 + WALL_T + 0.02, 0);
  // señal de la cerca de elevadores / cuarto eléctrico en sus zonas
  const ce = zonaById(data, 'cuarto_electrico');
  if (ce) sign('precaucion', 'Riesgo eléctrico: alta tensión', '⚡', ce.x - ce.w / 2 + 0.02, 2.2, ce.z, -Math.PI / 2);
  bake(signs, false);
  group.add(signs);

  // ---------- Equipo de seguridad ----------
  const seg = new THREE.Group();
  const extSign = new THREE.MeshStandardMaterial({ map: canvasTex(textCanvas(['EXTINTOR'], { w: 256, h: 96, bg: PAL.rojo, font: 46 })) });
  for (const e of P.seguridad.extintores) {
    const post = new THREE.Group();
    post.add(boxB(0.08, 1.9, 0.08, M.red, 0, 0, 0));
    const body = cyl(0.11, 0.11, 0.55, M.red, 12); body.position.set(0, 0.7, 0.12); post.add(body);
    const top = cyl(0.04, 0.06, 0.12, M.black, 8); top.position.set(0, 1.03, 0.12); post.add(top);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.17), extSign); s.position.set(0, 1.75, 0.05); post.add(s);
    const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = -0.05; post.add(s2);
    post.position.set(e.x, 0, e.z);
    seg.add(post);
    col.addStatic(rectAABB(e.x, e.z + 0.06, 0.3, 0.35, 2));
  }
  const S = P.seguridad;
  const station = (x: number, z: number, mat: THREE.Material, label: string, bg: string, h = 1.2) => {
    const g = new THREE.Group();
    g.add(boxB(0.6, h, 0.35, mat));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshBasicMaterial({ map: canvasTex(textCanvas([label], { w: 300, h: 100, bg, font: 40 })) }));
    lab.position.set(0, h + 0.15, 0); g.add(lab);
    const lab2 = lab.clone(); lab2.rotation.y = Math.PI; g.add(lab2);
    g.position.set(x, 0, z);
    seg.add(g);
    col.addStatic(rectAABB(x, z, 0.6, 0.4, h));
  };
  station(S.botiquin.x, S.botiquin.z, M.white, 'BOTIQUÍN', '#1E8449');
  station(S.lavaojos.x, S.lavaojos.z, M.green, 'LAVAOJOS', '#1E8449', 1.0);
  station(S.estacion_loto.x, S.estacion_loto.z, M.red, 'LOTO', PAL.rojo, 1.5);
  station(S.kit_derrames.x, S.kit_derrames.z, M.yellow, 'KIT DE DERRAMES', '#b8860b', 0.9);
  bake(seg);
  group.add(seg);

  // ---------- Visibilidad techo / muros ----------
  const insideNave = (p: THREE.Vector3) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
  const insideAnnex = (p: THREE.Vector3) => annexBox.containsPoint(new THREE.Vector3(p.x, 1, p.z)) || (p.x > annexBox.min.x && p.x < annexBox.max.x && p.z > z1 && p.z < annexBox.max.z);
  const setSide = (s: Side, transp: boolean) => {
    for (const m of sideMats[s]) {
      const want = transp ? 0.18 : 1;
      if (m.opacity !== want) { m.transparent = transp; m.opacity = want; m.depthWrite = !transp; m.needsUpdate = true; }
    }
  };
  return {
    group, annexRooms, insideNave, insideAnnex, entrance,
    roofOn: true,
    /** altura máxima de la cámara (bajo techo) en un punto */
    ceilingAt(x: number, z: number) {
      const p = new THREE.Vector3(x, 0, z);
      if (insideNave(p)) return H - 1.3;
      if (annexRooms.some((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2) || (insideAnnex(p) && z < annexBox.max.z)) return RH - 0.25;
      return Infinity;
    },
    update(player, cam, drone, dt = 0.016) {
      // salidas de emergencia: se abren al acercarse desde dentro; desde fuera están cerradas
      const inside = insideNave(player);
      col.setDynamic('exits', inside ? [] : exitDoors.map((d) => d.box));
      for (const d of exitDoors) {
        const near = inside && Math.hypot(player.x - d.x, player.z - d.z) < 3.0;
        d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 4);
        d.hinge.rotation.y = d.baseRot + d.sign * -1 * d.open * 1.7;
      }
      const inN = insideNave(player) || insideNave(cam);
      // techos siempre visibles; en modo dron se pueden quitar con T para ver el layout
      roof.visible = this.roofOn || !drone;
      annexRoof.visible = this.roofOn || !drone;
      const active = drone ? !this.roofOn : inN;
      setSide('N', active && cam.z < z0);
      setSide('S', active && cam.z > z1);
      setSide('W', active && cam.x < x0);
      setSide('E', active && cam.x > x1);
    },
  };
}

function floorPaint(g: THREE.Group, mat: THREE.Material, ax: number, az: number, bx: number, bz: number) {
  g.add(floorRect(bx - ax, bz - az, mat, (ax + bx) / 2, (az + bz) / 2, 0.008));
}
