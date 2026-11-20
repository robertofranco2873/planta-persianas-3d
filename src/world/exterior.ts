import * as THREE from 'three';
import type { GameData } from '../data';
import { zonaById } from '../data';
import { bake, box, boxB, cyl, floorRect } from '../util/geo';
import { Collision, rectAABB } from '../player/collision';
import { Mats, canvasTex, textCanvas, PAL } from './materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function buildExterior(data: GameData, M: Mats, col: Collision, scene: THREE.Scene) {
  const P = data.planta;
  const g = new THREE.Group();
  g.name = 'exterior';

  // cielo con gradiente
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#5b8fd1') }, mid: { value: new THREE.Color('#bcd6ee') }, bot: { value: new THREE.Color('#e9e2d6') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid, top, smoothstep(0.0,0.6,h)) : mix(mid, bot, smoothstep(0.0,-0.2,h)); gl_FragColor=vec4(c,1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog('#cfdbe6', 90, 320);

  // terreno
  const grass = floorRect(700, 700, M.grass, 40, 25, -0.05);
  g.add(grass);
  const sx0 = -6, sx1 = P.sitio.ancho_x, sz0 = -2, sz1 = P.sitio.largo_z;
  const apronGeo = new THREE.PlaneGeometry(sx1 - sx0 + 6, sz1 - sz0 + 6);
  apronGeo.rotateX(-Math.PI / 2);
  const uv = apronGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (sx1 - sx0) / 6, uv.getY(i) * (sz1 - sz0) / 6);
  const apron = new THREE.Mesh(apronGeo, M.apron);
  apron.position.set((sx0 + sx1) / 2, -0.02, (sz0 + sz1) / 2);
  apron.receiveShadow = true;
  g.add(apron);

  const asphaltRect = (x: number, z: number, w: number, d: number, y: number) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const u = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w / 8, u.getY(i) * d / 8);
    const m = new THREE.Mesh(geo, M.asphalt);
    m.position.set(x, y, z); m.receiveShadow = true;
    g.add(m);
  };
  const lines = new THREE.Group();
  const paint = (x: number, z: number, w: number, d: number, mat = M.paintWhite) => lines.add(floorRect(w, d, mat, x, z, 0.006));

  const patio = zonaById(data, 'patio');
  if (patio) {
    asphaltRect(patio.x, patio.z, patio.w, patio.d, -0.005);
  }
  const via = zonaById(data, 'vialidad');
  if (via) {
    asphaltRect(via.x, via.z, via.w, via.d, -0.004);
    for (let z = via.z - via.d / 2 + 1; z < via.z + via.d / 2 - 1; z += 4) paint(via.x, z, 0.15, 2);
  }
  const est = zonaById(data, 'estacionamiento');
  const cars: { x: number; z: number; r: number; c: number }[] = [];
  if (est) {
    asphaltRect(est.x, est.z, est.w, est.d, -0.003);
    const ex0 = est.x - est.w / 2, ez0 = est.z - est.d / 2, ez1 = est.z + est.d / 2;
    const stallW = 2.6, stallD = 5;
    let k = 0;
    for (let x = ex0 + 1; x + stallW < est.x + est.w / 2 - 1; x += stallW) {
      paint(x, ez0 + stallD / 2, 0.1, stallD);
      paint(x, ez1 - stallD / 2, 0.1, stallD);
      const rnd = Math.sin(k * 12.9898) * 43758.5453;
      const f = rnd - Math.floor(rnd);
      if (f < 0.62) cars.push({ x: x + stallW / 2, z: ez0 + stallD / 2, r: 0, c: k });
      const f2 = (f * 7.13) % 1;
      if (f2 < 0.55) cars.push({ x: x + stallW / 2, z: ez1 - stallD / 2, r: Math.PI, c: k + 3 });
      k++;
    }
  }
  // andenes con remolque (patio de tráileres)
  const trailerM = M.std('#e7e7e3', 0.6, 0.2);
  const cabMats = [M.std('#C0392B', 0.4, 0.3), M.std('#2E75B6', 0.4, 0.3), M.std('#F8F8F8', 0.4, 0.3)];
  const trailers = new THREE.Group();
  P.andenes.filter((a) => a.remolque).forEach((a, i) => {
    const t = new THREE.Group();
    const L = 16, Wt = 2.6;
    t.add(boxB(L, 2.8, Wt, trailerM, L / 2 + 0.6, 1.25, 0));
    t.add(boxB(L, 0.25, Wt - 0.1, M.dark, L / 2 + 0.6, 1.0, 0));
    for (const wx of [L - 2.2, L - 1.1]) for (const wz of [-1, 1]) {
      const w = cyl(0.5, 0.5, 0.35, M.rubber, 14); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.5, wz * 1.0); t.add(w);
    }
    t.add(boxB(0.2, 1.0, 0.2, M.steel, 4, 0, -0.9), boxB(0.2, 1.0, 0.2, M.steel, 4, 0, 0.9));
    // tractocamión
    const cm = cabMats[i % 3];
    t.add(boxB(2.4, 2.2, 2.5, cm, L + 1.6, 0.9, 0));
    t.add(boxB(1.6, 1.3, 2.4, cm, L + 3.3, 0.9, 0));
    t.add(boxB(0.05, 0.9, 2.0, M.glass, L + 2.83, 2.0, 0));
    t.add(boxB(3.8, 0.4, 2.0, M.dark, L + 2.2, 0.55, 0));
    for (const wx of [L + 0.6, L + 3.4]) for (const wz of [-1, 1]) {
      const w = cyl(0.5, 0.5, 0.35, M.rubber, 14); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.5, wz * 1.05); t.add(w);
    }
    t.position.set(a.x, 0, a.z);
    trailers.add(t);
    col.addStatic(rectAABB(a.x + 0.6 + (L + 4.2) / 2, a.z, L + 4.2, Wt, 4));
    // marcas del andén
    paint(a.x + 9, a.z - 1.9, 18, 0.12, M.paintYellow);
  });
  bake(trailers);
  g.add(trailers);

  // autos (instanciados por material)
  if (cars.length) {
    const body = new THREE.BoxGeometry(4.2, 0.75, 1.8); body.translate(0, 0.6, 0);
    const cabin = new THREE.BoxGeometry(2.3, 0.6, 1.6); cabin.translate(-0.2, 1.25, 0);
    const wheelsG: THREE.BufferGeometry[] = [];
    for (const wx of [-1.35, 1.35]) for (const wz of [-0.85, 0.85]) {
      const w = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 12); w.rotateX(Math.PI / 2); w.translate(wx, 0.33, wz); wheelsG.push(w);
    }
    const wheels = mergeGeometries(wheelsG)!;
    const colors = ['#C0392B', '#F8F8F8', '#2C2E31', '#9F938C', '#2E75B6', '#6B5545', '#BDC3C7'];
    const bodyMesh = new THREE.InstancedMesh(body, M.std('#ffffff', 0.35, 0.4), cars.length);
    const cabMesh = new THREE.InstancedMesh(cabin, M.std('#2a3540', 0.1, 0.5), cars.length);
    const wheelMesh = new THREE.InstancedMesh(wheels, M.rubber, cars.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    cars.forEach((c, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + c.r);
      m4.compose(new THREE.Vector3(c.x, 0, c.z), q, new THREE.Vector3(1, 1, 1));
      bodyMesh.setMatrixAt(i, m4); cabMesh.setMatrixAt(i, m4); wheelMesh.setMatrixAt(i, m4);
      bodyMesh.setColorAt(i, new THREE.Color(colors[c.c % colors.length]));
      col.addStatic(rectAABB(c.x, c.z, 1.9, 4.3, 1.6));
    });
    for (const m of [bodyMesh, cabMesh, wheelMesh]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }

  // árboles (los del JSON + algunos de ambientación fuera del sitio)
  const trees: { x: number; z: number; s: number }[] = P.decoracion.arboles.map((t) => ({ ...t, s: 1 }));
  for (let x = -10; x <= 95; x += 9) { trees.push({ x, z: sz1 + 6 + Math.sin(x) * 1.5, s: 0.8 + ((x * 7) % 5) / 10 }); trees.push({ x, z: sz0 - 9 + Math.cos(x) * 1.5, s: 0.9 }); }
  for (let z = 4; z <= 46; z += 9) { trees.push({ x: sx0 - 7, z, s: 0.9 }); trees.push({ x: sx1 + 8, z, s: 1.0 }); }
  {
    const trunk = new THREE.CylinderGeometry(0.15, 0.22, 2.2, 8); trunk.translate(0, 1.1, 0);
    const crownA = new THREE.IcosahedronGeometry(1.6, 1); crownA.translate(0, 3.2, 0);
    const crownB = new THREE.IcosahedronGeometry(1.1, 1); crownB.translate(0.5, 4.1, 0.2);
    const crown = mergeGeometries([crownA, crownB])!;
    const tm = new THREE.InstancedMesh(trunk, M.std('#5b4433', 0.9), trees.length);
    const cm = new THREE.InstancedMesh(crown, M.std('#4d7a3a', 0.85, 0, { flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      tm.setMatrixAt(i, m4); cm.setMatrixAt(i, m4);
      cm.setColorAt(i, new THREE.Color().setHSL(0.27 + (i % 5) * 0.015, 0.4, 0.32 + (i % 3) * 0.04));
      col.addStatic(rectAABB(t.x, t.z, 0.5, 0.5, 3));
    });
    tm.castShadow = cm.castShadow = true;
    g.add(tm, cm);
  }

  // puntos de reunión
  const prSign = new THREE.MeshStandardMaterial({ map: canvasTex(textCanvas(['PUNTO DE', 'REUNIÓN'], { w: 256, h: 256, bg: '#1E8449', font: 54 })) });
  for (const p of P.seguridad.puntos_reunion) {
    paint(p.x, p.z, 4, 4, M.paintGreen);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 32), M.paintWhite);
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.012, p.z);
    lines.add(ring);
    const post = boxB(0.1, 2.2, 0.1, M.steel, p.x + 2.3, 0, p.z);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), prSign); s.position.set(p.x + 2.3, 2.5, p.z + 0.06);
    const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = p.z - 0.06;
    g.add(post, s, s2);
    col.addStatic(rectAABB(p.x + 2.3, p.z, 0.2, 0.2, 2));
  }
  bake(lines, false);
  g.add(lines);

  // letrero de la empresa junto al acceso
  const nm = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshStandardMaterial({ map: canvasTex(textCanvas([P.empresa.nombre], { w: 1536, h: 256, bg: PAL.cafe, font: 90 })) }));
  nm.position.set(P.nave.x + 8, 9.2, P.nave.z + P.nave.d / 2 + 0.33);
  g.add(nm);

  return g;
}
