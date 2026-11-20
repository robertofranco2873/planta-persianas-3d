import * as THREE from 'three';
import type { TipoMaquina } from '../data';
import { bake, box, boxB, cyl, cylX, cylZ } from '../util/geo';
import type { Mats } from '../world/materials';
import { canvasTex, textCanvas } from '../world/materials';

export interface MachineModel {
  group: THREE.Group;
  /** t: segundos globales; on: si está en operación */
  anim?: (t: number, dt: number, on: boolean) => void;
  setOn?: (on: boolean) => void;
  L: number; W: number; H: number;
}

type Gen = (td: TipoMaquina, L: number, W: number, H: number, M: Mats, base: THREE.MeshStandardMaterial) => MachineModel;

const dyn = (o: THREE.Object3D) => { o.userData.dynamic = true; return o; };

function table(g: THREE.Group, L: number, W: number, H: number, top: THREE.Material, leg: THREE.Material, x = 0, z = 0) {
  g.add(boxB(L, 0.05, W, top, x, H - 0.05, z));
  const lx = L / 2 - 0.06, lz = W / 2 - 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(boxB(0.05, H - 0.05, 0.05, leg, x + sx * lx, 0, z + sz * lz));
  g.add(boxB(L - 0.12, 0.03, W - 0.12, leg, x, 0.15, z));
}

// ---------------------------------------------------------------- sierra
const sierra: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const tableH = 0.88;
  // bancadas de rodillos a ambos lados del cabezal
  const headW = 1.3;
  for (const side of [-1, 1]) {
    const len = L / 2 - headW / 2;
    const cx = side * (headW / 2 + len / 2);
    for (const zz of [-0.32, 0.32]) g.add(box(len, 0.08, 0.06, M.steel, cx, tableH, zz));
    for (let x = cx - len / 2 + 0.2; x < cx + len / 2; x += 0.32) g.add(cylZ(0.04, 0.62, M.metal, x, tableH + 0.03, 0, 8));
    for (let x = cx - len / 2 + 0.1; x <= cx + len / 2; x += len / 3) for (const zz of [-0.3, 0.3]) g.add(boxB(0.05, tableH, 0.05, M.steel, x, 0, zz));
  }
  // regla y tope de medida
  g.add(box(L / 2 - headW / 2, 0.12, 0.04, M.yellow, L / 4 + headW / 4, tableH + 0.08, -0.36));
  g.add(boxB(0.12, 0.18, 0.18, M.red, L / 2 - 0.8, tableH, -0.28));
  // gabinete del cabezal
  g.add(boxB(headW, tableH - 0.02, W * 0.75, base, 0, 0, 0));
  g.add(box(headW + 0.02, 0.06, W * 0.75 + 0.02, M.dark, 0, tableH - 0.02, 0));
  g.add(boxB(0.25, 0.6, 0.3, M.dark, -0.15, tableH, -W * 0.3));
  // panel de control
  g.add(boxB(0.35, 0.35, 0.08, M.dark, headW / 2 - 0.2, tableH + 0.3, W * 0.38));
  g.add(boxB(0.06, 0.06, 0.02, M.red, headW / 2 - 0.2, tableH + 0.48, W * 0.38 + 0.05));
  // brazo y guarda
  g.add(boxB(0.2, 0.5, 0.2, M.steel, 0, tableH, -0.5));
  g.add(box(0.2, 0.15, 0.6, M.steel, 0, tableH + 0.55, -0.25));
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 20, 1, false, 0, Math.PI), M.red);
  guard.rotation.z = Math.PI / 2; guard.rotation.y = 0;
  guard.position.set(0, tableH + 0.25, 0);
  g.add(guard);
  // disco (dinámico)
  const disc = new THREE.Group();
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.012, 32), M.metal);
  d.rotation.z = Math.PI / 2;
  disc.add(d);
  for (let i = 0; i < 6; i++) { const tooth = box(0.014, 0.06, 0.02, M.dark, 0, 0.28, 0); const p = new THREE.Group(); p.rotation.x = (i / 6) * Math.PI * 2; p.add(tooth); disc.add(p); }
  disc.position.set(0, tableH + 0.2, 0);
  dyn(disc); g.add(disc);
  // tubo sobre la bancada
  g.add(cylX(0.035, L * 0.8, M.brushed, -L * 0.05, tableH + 0.11, 0.05, 10));
  bake(g);
  return { group: g, L, W, H, anim: (t, dt, on) => { if (on) disc.rotation.x -= dt * 30; } };
};

// ---------------------------------------------------------------- mesa de tela
const mesaTela: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const rollZone = 0.6;
  const tL = L - rollZone;
  const tx = rollZone / 2;
  // bastidor
  g.add(boxB(tL, 0.12, W, base, tx, H - 0.17, 0));
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.add(boxB(0.08, H - 0.17, 0.08, M.steel, tx + sx * (tL / 2 - 0.1), 0, sz * (W / 2 - 0.1)));
  g.add(box(tL - 0.2, 0.05, W - 0.2, M.steel, tx, 0.3, 0));
  // vidrio retroiluminado
  g.add(box(tL - 0.1, 0.03, W - 0.1, M.glowBlue, tx, H - 0.035, 0));
  // tela extendida
  const cloth = box(tL * 0.75, 0.005, W * 0.7, M.fabric2, tx + tL * 0.1, H - 0.015, 0);
  g.add(cloth);
  // rieles del pórtico
  for (const sz of [-1, 1]) g.add(box(tL, 0.08, 0.1, M.dark, tx, H + 0.02, sz * (W / 2 - 0.05)));
  // desenrollador motorizado
  const rx = -L / 2 + rollZone / 2;
  for (const sz of [-1, 1]) g.add(boxB(0.12, H + 0.1, 0.12, M.dark, rx, 0, sz * (W / 2 - 0.15)));
  g.add(boxB(0.3, 0.3, 0.3, M.blue, rx, H - 0.1, W / 2 - 0.15));
  const roll = cylZ(0.2, W - 0.4, M.fabric2, rx, H + 0.05, 0, 18);
  dyn(roll); g.add(roll);
  // pórtico (dinámico)
  const gantry = new THREE.Group();
  gantry.add(box(0.18, 0.18, W + 0.1, M.yellow, 0, H + 0.45, 0));
  for (const sz of [-1, 1]) gantry.add(boxB(0.22, 0.45, 0.16, M.dark, 0, H, sz * (W / 2 - 0.05)));
  const head = boxB(0.2, 0.25, 0.2, M.dark, 0, H + 0.12, 0);
  gantry.add(head);
  dyn(gantry); g.add(gantry);
  bake(g);
  const span = tL / 2 - 0.3;
  return {
    group: g, L, W, H,
    anim: (t, dt, on) => {
      if (!on) return;
      gantry.position.x = tx + Math.sin(t * 0.6) * span;
      head.position.z = Math.sin(t * 1.7) * (W / 2 - 0.4);
      roll.rotation.z += dt * 0.5;
    },
  };
};

// ---------------------------------------------------------------- entubadora
const entubadora: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const tH = H * 0.85;
  g.add(boxB(L, 0.1, W, base, 0, tH - 0.1, 0));
  for (let x = -L / 2 + 0.1; x <= L / 2; x += L / 4) for (const sz of [-1, 1]) g.add(boxB(0.05, tH - 0.1, 0.05, M.steel, x, 0, sz * (W / 2 - 0.05)));
  for (let x = -L / 2 + 0.15; x < L / 2; x += 0.22) g.add(cylZ(0.03, W - 0.1, M.metal, x, tH + 0.02, 0, 8));
  // eje giratorio con tubo
  const shaft = new THREE.Group();
  const tube = cylX(0.045, L - 0.4, M.metal, 0, 0, 0, 12);
  shaft.add(tube);
  const wrap = cylX(0.06, L * 0.55, M.fabric, -L * 0.1, 0, 0, 12);
  shaft.add(wrap);
  shaft.position.set(0, tH + 0.12, 0);
  dyn(shaft); g.add(shaft);
  for (const sx of [-1, 1]) g.add(boxB(0.12, 0.2, 0.18, M.dark, sx * (L / 2 - 0.12), tH, 0));
  // dispensador de adhesivo
  g.add(boxB(0.12, H - tH + 0.2, 0.12, M.dark, L / 2 - 0.5, tH, -W / 2 + 0.06));
  g.add(box(0.12, 0.08, W - 0.1, M.dark, L / 2 - 0.5, H + 0.2, 0));
  g.add(boxB(0.14, 0.2, 0.14, M.white, L / 2 - 0.5, H + 0.0, 0));
  // bomba de vacío
  g.add(boxB(0.5, 0.4, W * 0.8, M.blue, -L / 2 + 0.6, 0, 0));
  bake(g);
  return { group: g, L, W, H, anim: (t, dt, on) => { if (on) shaft.rotation.x += dt * 3; } };
};

// ---------------------------------------------------------------- mesas de trabajo
const kitAce: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  table(g, L, W * 0.65, H * 0.9, base, M.steel, 0, W * 0.15);
  // anaqueles con gavetas de colores
  const sz = -W / 2 + 0.12;
  for (const sx of [-1, 1]) g.add(boxB(0.04, 1.9, 0.24, M.steel, sx * (L / 2 - 0.03), 0, sz));
  const colors = [M.red, M.blue, M.yellow, M.green];
  for (let lvl = 0; lvl < 4; lvl++) {
    const y = 0.95 + lvl * 0.24;
    g.add(box(L, 0.02, 0.24, M.steel, 0, y, sz));
    for (let i = 0; i < 8; i++) g.add(boxB(L / 8 - 0.03, 0.14, 0.2, colors[(i + lvl) % 4], -L / 2 + (i + 0.5) * (L / 8), y + 0.01, sz + 0.01));
  }
  // laptop, lector y etiquetadora
  g.add(boxB(0.34, 0.02, 0.24, M.dark, -0.4, H * 0.9, W * 0.15));
  const scr = box(0.34, 0.22, 0.015, M.screen, -0.4, H * 0.9 + 0.12, W * 0.15 - 0.12); scr.rotation.x = -0.25; g.add(scr);
  g.add(boxB(0.22, 0.16, 0.2, M.white, 0.5, H * 0.9, W * 0.15));
  g.add(boxB(0.05, 0.12, 0.07, M.black, 0.15, H * 0.9, W * 0.25));
  bake(g);
  return { group: g, L, W, H };
};

const preEnsamble: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  table(g, L, W, H * 0.9, base, M.steel);
  g.add(boxB(0.8, 0.12, 0.2, M.dark, 0, H * 0.9, 0));
  g.add(cylX(0.03, 0.75, M.metal, 0, H * 0.9 + 0.2, 0));
  g.add(boxB(0.12, 0.1, 0.06, M.screen, -0.5, H * 0.9, 0.08));
  const crank = new THREE.Group();
  crank.add(box(0.03, 0.18, 0.03, M.red, 0, 0.09, 0));
  crank.add(cylX(0.02, 0.12, M.black, 0.06, 0.18, 0));
  crank.position.set(0.45, H * 0.9 + 0.2, 0);
  dyn(crank); g.add(crank);
  bake(g);
  return { group: g, L, W, H, anim: (t, dt, on) => { if (on) crank.rotation.x = (t * 3) % (Math.PI * 2); } };
};

const ensCassette: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  table(g, L, W, H * 0.9, base, M.steel);
  g.add(boxB(0.06, 1.3, 0.06, M.steel, -L / 2 + 0.1, H * 0.9, -W / 2 + 0.06));
  g.add(box(1.3, 0.05, 0.05, M.steel, -L / 2 + 0.7, H * 0.9 + 1.3, -W / 2 + 0.06));
  const tool = new THREE.Group();
  tool.add(box(0.008, 0.5, 0.008, M.black, 0, -0.25, 0));
  tool.add(box(0.05, 0.22, 0.05, M.blue, 0, -0.6, 0));
  tool.position.set(-L / 2 + 1.2, H * 0.9 + 1.3, -W / 2 + 0.06);
  dyn(tool); g.add(tool);
  for (const x of [0.3, 0.9]) g.add(boxB(0.1, 0.12, 0.2, M.red, x, H * 0.9, -0.15));
  g.add(boxB(1.1, 0.08, 0.12, M.metal, 0.3, H * 0.9, 0.12));
  bake(g);
  return { group: g, L, W, H, anim: (t, dt, on) => { if (on) tool.position.y = H * 0.9 + 1.3 + Math.sin(t * 1.4) * 0.12; } };
};

const ensBottom: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const tH = H * 0.75;
  table(g, L, W, tH, base, M.steel);
  // máquina de coser industrial blanca
  const sx = 0.2;
  g.add(boxB(0.5, 0.06, 0.2, M.white, sx, tH, 0));
  g.add(boxB(0.1, 0.32, 0.16, M.white, sx + 0.2, tH + 0.06, 0));
  g.add(box(0.48, 0.1, 0.14, M.white, sx, tH + 0.33, 0));
  g.add(boxB(0.08, 0.12, 0.12, M.white, sx - 0.22, tH + 0.16, 0));
  const needle = box(0.006, 0.08, 0.006, M.metal, sx - 0.22, tH + 0.12, 0);
  dyn(needle); g.add(needle);
  g.add(cylZ(0.05, 0.03, M.dark, sx + 0.2, tH + 0.33, 0.09));
  g.add(boxB(0.3, 0.04, 0.18, M.dark, sx, 0.05, 0.1));
  g.add(cylZ(0.05, W * 0.6, M.fabric2, -0.7, tH + 0.06, 0));
  bake(g);
  return { group: g, L, W, H, anim: (t, dt, on) => { if (on) needle.position.y = tH + 0.12 + Math.sin(t * 30) * 0.02; } };
};

const hardware: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  table(g, L, W, H * 0.9, base, M.steel);
  const colors = [M.blue, M.yellow, M.red, M.green, M.blue];
  for (let i = 0; i < 5; i++) g.add(boxB(L / 5 - 0.06, 0.08, W * 0.5, colors[i], -L / 2 + (i + 0.5) * L / 5, H * 0.9, -W * 0.15));
  for (let i = 0; i < 6; i++) g.add(boxB(0.32, 0.12, 0.22, M.blue, -L / 2 + 0.25 + i * 0.38, 0.17, 0));
  g.add(boxB(0.4, 0.1, 0.3, M.cardboard, 0.6, H * 0.9, W * 0.25));
  bake(g);
  return { group: g, L, W, H };
};

const mesaCalidad: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  table(g, L, W, H * 0.9, base, M.steel);
  const y = H * 0.9;
  g.add(boxB(0.09, 0.06, 0.09, M.yellow, -0.6, y, 0.1));
  g.add(boxB(0.25, 0.01, 0.04, M.metal, -0.3, y, 0.15));
  g.add(boxB(0.3, 0.05, 0.24, M.blue, 0.1, y, 0));
  for (let i = 0; i < 4; i++) g.add(boxB(0.06, 0.003, 0.1, M.red, 0.5 + i * 0.09, y, 0.1));
  g.add(cylX(0.04, 1.2, M.fabric2, 0, y + 0.04, -0.25));
  bake(g);
  return { group: g, L, W, H };
};

// ---------------------------------------------------------------- elevador
const elevador: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(boxB(0.14, H, 0.14, base, sx * (L / 2 - 0.07), 0, 0));
    g.add(boxB(0.14, 0.1, W, base, sx * (L / 2 - 0.07), 0, 0));
  }
  g.add(box(L, 0.14, 0.14, base, 0, H - 0.07, 0));
  // tubo superior
  g.add(cylX(0.05, L - 0.3, M.brushed, 0, H - 0.3, 0.12));
  // barra LED
  const led = box(L - 0.4, 0.04, 0.12, M.glow, 0, H - 0.16, -0.12);
  dyn(led); g.add(led);
  // tablet en brazo
  g.add(box(0.5, 0.04, 0.04, M.steel, L / 2 - 0.35, 1.4, 0.3));
  const tab = box(0.25, 0.18, 0.02, M.screen, L / 2 - 0.6, 1.45, 0.42); tab.rotation.x = -0.3; g.add(tab);
  g.add(box(0.04, 0.04, 0.35, M.steel, L / 2 - 0.12, 1.4, 0.2));
  // persiana colgando (dinámica)
  const shade = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.5, 1), M.fabric);
  cloth.position.y = -0.5;
  shade.add(cloth);
  const rail = cylX(0.025, L - 0.45, M.dark, 0, H - 1.3, 0.12);
  dyn(rail); g.add(rail);
  shade.position.set(0, H - 0.3, 0.12);
  dyn(shade); g.add(shade);
  bake(g);
  const maxDrop = H - 0.6;
  let onState = true;
  return {
    group: g, L, W, H,
    setOn(on) { onState = on; led.material = on ? M.glow : M.ledOff; },
    anim: (t, dt, on) => {
      const drop = on ? 0.5 + (0.5 + 0.5 * Math.sin(t * 0.35)) * (maxDrop - 0.5) : 0.35;
      shade.scale.y = drop;
      rail.position.y = H - 0.3 - drop;
      void onState;
    },
  };
};

// ---------------------------------------------------------------- packsize
const packsize: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const bodyD = 1.1, bodyZ = 0.05;
  g.add(boxB(L * 0.8, H * 0.65, bodyD, base, -L * 0.1, 0.25, bodyZ));
  g.add(boxB(L * 0.8, 0.25, bodyD - 0.2, M.dark, -L * 0.1, 0, bodyZ));
  g.add(box(L * 0.8 + 0.02, 0.1, bodyD + 0.02, M.yellow, -L * 0.1, 0.25 + H * 0.65 - 0.2, bodyZ));
  g.add(boxB(0.4, 0.5, 0.08, M.screen, -L * 0.4, 1.2, bodyZ + bodyD / 2 + 0.04));
  // rack de 5 bobinas (cartón plegado) detrás
  const bz = -W / 2 + 0.35;
  for (let i = 0; i < 5; i++) {
    const x = -L * 0.45 + 0.5 + i * (L * 0.8 - 1) / 4;
    g.add(boxB(1.0, 1.0, 0.6, M.cardboard, x, 0.12, bz));
    g.add(boxB(1.06, 0.12, 0.66, M.wood, x, 0, bz));
    const sheet = box(0.9, 0.02, 0.9, M.cardboard, x, 1.45, bz + 0.35);
    sheet.rotation.x = 0.7;
    g.add(sheet);
  }
  g.add(box(L * 0.8, 0.06, 0.06, M.steel, -L * 0.1, 1.85, bz + 0.3));
  // mesa de salida
  const ox = L * 0.38;
  table(g, L * 0.22, W * 0.8, 0.85, M.steel, M.steel, ox, 0);
  for (let z = -W * 0.35; z < W * 0.4; z += 0.2) g.add(cylX(0.03, L * 0.2, M.metal, ox, 0.86, z, 8));
  const boxOut = boxB(0.9, 0.25, 0.6, M.cardboard, 0, 0, 0);
  const bg = new THREE.Group(); bg.add(boxOut);
  dyn(bg); g.add(bg);
  bake(g);
  return {
    group: g, L, W, H,
    anim: (t, dt, on) => {
      const k = on ? (t * 0.25) % 1 : 0.5;
      bg.position.set(-L * 0.1 + L * 0.5 * k, 0.88, bodyZ + 0.1);
      bg.visible = k > 0.25;
    },
  };
};

const flejadora: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const tH = 0.8;
  g.add(boxB(L * 0.6, tH - 0.1, W * 0.9, base, 0, 0, 0));
  for (let x = -L / 2 + 0.1; x < L / 2; x += 0.15) g.add(cylZ(0.03, W * 0.9, M.metal, x, tH, 0, 8));
  // arco
  g.add(boxB(0.12, H - tH, 0.12, base, 0, tH, -W / 2 + 0.06));
  g.add(boxB(0.12, H - tH, 0.12, base, 0, tH, W / 2 - 0.06));
  g.add(box(0.12, 0.12, W, base, 0, H - 0.06, 0));
  g.add(boxB(0.2, 0.25, 0.25, M.blue, -L * 0.35, tH - 0.4, W / 2 - 0.13));
  bake(g);
  return { group: g, L, W, H };
};

const compresor: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  g.add(boxB(L * 0.55, H * 0.8, W, base, -L * 0.22, 0, 0));
  g.add(box(L * 0.55 + 0.02, 0.06, W + 0.02, M.dark, -L * 0.22, H * 0.6, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.02, 0.4, W * 0.6, M.dark, -L * 0.22 + L * 0.275 + 0.01, 0.4 + i * 0.12, 0));
  const tank = cyl(0.42, 0.42, H - 0.2, M.brushed, 20); tank.position.set(L * 0.29, 0.1 + (H - 0.2) / 2, 0); g.add(tank);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steel); cap.position.set(L * 0.29, H - 0.1, 0); g.add(cap);
  g.add(boxB(0.3, 0.6, 0.4, M.white, L * 0.29, 0, W / 2 - 0.2));
  g.add(cylX(0.04, L * 0.4, M.blue, L * 0.05, H * 0.75, -0.3));
  bake(g);
  return { group: g, L, W, H };
};

const tableroElectrico: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = -L / 2 + (i + 0.5) * (L / 3);
    g.add(boxB(L / 3 - 0.04, H, W, base, x, 0, 0));
    g.add(box(0.03, H * 0.8, 0.02, M.dark, x, H / 2, W / 2 + 0.01));
    g.add(box(0.06, 0.1, 0.03, M.dark, x + 0.3, H / 2, W / 2 + 0.02));
  }
  const tri = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: canvasTex(textCanvas(['⚡', 'ALTA TENSIÓN'], { w: 256, h: 256, bg: '#F1C40F', fg: '#111', font: 60 })) }));
  tri.position.set(0, H * 0.75, W / 2 + 0.02);
  g.add(tri);
  bake(g);
  return { group: g, L, W, H };
};

const rackIt: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  g.add(boxB(L, H, W, M.black, 0, 0, 0));
  g.add(box(L - 0.1, H - 0.2, 0.02, M.dark, 0, H / 2, W / 2 + 0.005));
  const leds: THREE.Mesh[] = [];
  const mats = [M.ledG.clone(), M.ledG.clone(), M.ledR.clone()];
  for (let r = 0; r < 12; r++) for (let c = 0; c < 5; c++) {
    const m = box(0.03, 0.02, 0.01, mats[(r * 5 + c) % 3], -0.2 + c * 0.1, 0.3 + r * 0.12, W / 2 + 0.02);
    leds.push(m);
    g.add(m);
  }
  bake(g, false);
  return {
    group: g, L, W, H,
    anim: (t) => {
      mats[0].emissiveIntensity = Math.sin(t * 9) > 0 ? 2.5 : 0.2;
      mats[1].emissiveIntensity = Math.sin(t * 5.3 + 1) > 0.3 ? 2.5 : 0.2;
      mats[2].emissiveIntensity = Math.sin(t * 2.1) > 0.6 ? 2.5 : 0.1;
    },
  };
};

// ---------------------------------------------------------------- racks
const cantilever = (product: 'tubo' | 'perfil'): Gen => (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const nCol = Math.max(2, Math.round(L / 2.2) + 1);
  const levels = product === 'tubo' ? [0.35, 1.15, 1.95, 2.75] : [0.4, 1.2, 2.0];
  for (let i = 0; i < nCol; i++) {
    const x = -L / 2 + 0.15 + i * (L - 0.3) / (nCol - 1);
    g.add(boxB(0.18, H, 0.22, base, x, 0, 0));
    g.add(boxB(0.18, 0.12, W, base, x, 0, 0));
    for (const y of levels) g.add(box(0.1, 0.08, W - 0.1, base, x, y, 0));
  }
  const mats = product === 'tubo' ? [M.metal] : [M.metal, M.steel];
  for (const y of levels) {
    for (const side of [-1, 1]) {
      const n = product === 'tubo' ? 7 : 5;
      for (let k = 0; k < n; k++) {
        const z = side * (0.22 + k * ((W / 2 - 0.3) / n));
        if (product === 'tubo') {
          g.add(cylX(0.04, L - 0.1, mats[0], 0, y + 0.08, z, 8));
          if (k % 2 === 0) g.add(cylX(0.04, L - 0.4, mats[0], 0.1, y + 0.15, z + 0.04, 8));
        } else {
          g.add(box(L - 0.2, 0.05, 0.08, mats[k % 2], 0, y + 0.07, z));
        }
      }
    }
  }
  bake(g);
  return { group: g, L, W, H };
};

const selective = (fill: 'tela' | 'wip' | 'pt'): Gen => (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const rows = fill === 'wip' ? [-0.6, 0.6] : [0];
  const depth = fill === 'wip' ? 1.1 : Math.min(W - 0.2, 1.2);
  const bayW = 2.7;
  const nb = Math.max(1, Math.round(L / bayW));
  const bw = L / nb;
  const lv = [0.12, 1.45, 2.75].filter((y) => y < H - 0.1);
  const fabrics = [M.fabric, M.fabric2, M.fabric3];
  const blue = M.std('#3a6ea5', 0.6);
  for (const rz of rows) {
    for (let i = 0; i <= nb; i++) {
      const x = -L / 2 + i * bw;
      for (const sz of [-1, 1]) g.add(boxB(0.08, H, 0.08, M.blue, x, 0, rz + sz * depth / 2));
    }
    for (let i = 0; i < nb; i++) {
      const cx = -L / 2 + (i + 0.5) * bw;
      for (const y of lv) {
        for (const sz of [-1, 1]) g.add(box(bw, 0.1, 0.05, base, cx, y + 0.05, rz + sz * depth / 2));
        // tarima
        g.add(boxB(bw - 0.3, 0.12, depth - 0.1, M.wood, cx, y + 0.1, rz));
        const top = y + 0.22;
        if (fill === 'tela') {
          for (let k = 0; k < 6; k++) {
            const rr = cylX(0.11, bw - 0.4, fabrics[(i + k) % 3], cx, top + 0.11 + Math.floor(k / 3) * 0.22, rz - 0.3 + (k % 3) * 0.3, 12);
            g.add(rr);
          }
        } else if (fill === 'pt') {
          for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) g.add(boxB(bw - 0.4, 0.3, 0.3, M.cardboard, cx, top + j * 0.31, rz - 0.35 + k * 0.35));
        } else {
          for (let k = 0; k < 3; k++) g.add(boxB(bw / 3 - 0.1, 0.35, depth - 0.25, k % 2 ? M.cardboard : blue, cx - bw / 3 + k * bw / 3, top, rz));
        }
      }
    }
  }
  if (fill === 'wip') {
    // carritos de 0.7 m con tubos y perfiles
    for (let i = 0; i < Math.min(4, nb); i++) {
      const cx = -L / 2 + 1.5 + i * (L - 3) / 3;
      const cz = W / 2 - 0.3;
      g.add(boxB(1.2, 0.04, 0.5, M.steel, cx, 0.2, cz));
      g.add(boxB(1.2, 0.04, 0.5, M.steel, cx, 0.8, cz));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(boxB(0.03, 0.85, 0.03, M.steel, cx + sx * 0.58, 0.05, cz + sz * 0.23));
      g.add(cylX(0.04, 1.1, M.fabric, cx, 0.88, cz));
      g.add(cylX(0.04, 1.1, M.fabric2, cx, 0.88, cz - 0.12));
    }
  }
  bake(g);
  return { group: g, L, W, H };
};

// ---------------------------------------------------------------- montacargas
const montacargas: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  const bodyL = L * 0.62;
  const bx = -L / 2 + bodyL / 2;
  g.add(boxB(bodyL, 0.75, W, base, bx, 0.25, 0));
  g.add(boxB(0.45, 0.65, W - 0.05, M.dark, -L / 2 + 0.25, 0.4, 0)); // contrapeso
  g.add(boxB(0.4, 0.4, 0.4, M.black, bx - 0.1, 1.0, 0)); // asiento
  g.add(boxB(0.08, 0.35, 0.08, M.black, bx + 0.35, 1.0, 0)); // volante
  // guarda superior
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(boxB(0.06, H - 1.0, 0.06, M.dark, bx + sx * 0.45, 1.0, sz * (W / 2 - 0.08)));
  g.add(box(1.0, 0.05, W, M.dark, bx, H - 0.02, 0));
  // mástil y horquillas
  const mx = -L / 2 + bodyL + 0.08;
  for (const sz of [-0.3, 0.3]) g.add(boxB(0.1, H + 0.1, 0.1, M.dark, mx, 0.15, sz));
  g.add(box(0.06, 0.5, W - 0.2, M.dark, mx + 0.08, 0.45, 0));
  for (const sz of [-0.25, 0.25]) g.add(box(L - bodyL - 0.2, 0.05, 0.12, M.dark, mx + (L - bodyL) / 2, 0.15, sz));
  // tarima con rollos
  g.add(boxB(L - bodyL - 0.25, 0.12, W - 0.1, M.wood, mx + (L - bodyL) / 2, 0.18, 0));
  g.add(cylZ(0.12, W - 0.2, M.fabric2, mx + 0.3, 0.42, 0));
  g.add(cylZ(0.12, W - 0.2, M.fabric, mx + 0.6, 0.42, 0));
  for (const wx of [-L / 2 + 0.35, mx - 0.2]) for (const sz of [-1, 1]) g.add(cylZ(0.24, 0.2, M.rubber, wx, 0.24, sz * (W / 2 - 0.05), 12));
  // baliza
  const beacon = cyl(0.06, 0.06, 0.1, M.std('#ff9900', 0.3, 0, { emissive: '#ff8800', emissiveIntensity: 1.5 }), 8);
  beacon.position.set(bx, H + 0.06, 0);
  dyn(beacon); g.add(beacon);
  bake(g);
  return { group: g, L, W, H, anim: (t) => { beacon.visible = Math.sin(t * 8) > 0; } };
};

const generic: Gen = (td, L, W, H, M, base) => {
  const g = new THREE.Group();
  g.add(boxB(L, H, W, base));
  bake(g);
  return { group: g, L, W, H };
};

const GENS: Record<string, Gen> = {
  sierra, mesa_tela: mesaTela, entubadora, kit_ace: kitAce, pre_ensamble: preEnsamble,
  ens_cassette: ensCassette, ens_bottom: ensBottom, elevador, hardware, packsize, flejadora,
  compresor, tablero_electrico: tableroElectrico, montacargas, rack_it: rackIt, mesa_calidad: mesaCalidad,
  rack_tubo: cantilever('tubo'), rack_perfiles: cantilever('perfil'),
  rack_tela: selective('tela'), rack_wip: selective('wip'), rack_pt: selective('pt'),
};

const baseMatCache = new Map<string, THREE.MeshStandardMaterial>();

export function buildMachine(tipo: string, td: TipoMaquina, M: Mats, largo?: number): MachineModel {
  const [dL, dW, dH] = td.dim;
  const L = largo ?? dL;
  let base = baseMatCache.get(td.color);
  if (!base) { base = M.std(td.color, 0.55, 0.25) as THREE.MeshStandardMaterial; baseMatCache.set(td.color, base); }
  const gen = GENS[tipo] ?? generic;
  const model = gen(td, L, dW, dH, M, base);
  // fusionar también las piezas animadas compuestas por varias mallas
  model.group.traverse((o) => { if (o.userData.dynamic && !(o as THREE.Mesh).isMesh && o.children.length > 1) { o.userData.dynamic = false; bake(o); o.userData.dynamic = true; } });
  // franja de mantenimiento (mtto) marcada en el piso
  if (td.mtto) {
    const m = td.mtto;
    const fw = L + 2 * m, fd = dW + 2 * m;
    const s = 0.12;
    const tape = new THREE.Group();
    const strip = (w: number, d: number, x: number, z: number, along: number) => {
      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * along / 0.5, uv.getY(i));
      const mesh = new THREE.Mesh(geo, M.hazard);
      mesh.position.set(x, 0.011, z);
      mesh.receiveShadow = true;
      tape.add(mesh);
    };
    strip(fw, s, 0, -fd / 2 + s / 2, fw);
    strip(fw, s, 0, fd / 2 - s / 2, fw);
    const sv = (x: number) => { const geo = new THREE.PlaneGeometry(s, fd - 2 * s); geo.rotateX(-Math.PI / 2); const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * (fd / 0.5), uv.getX(i)); const mm = new THREE.Mesh(geo, M.hazard); mm.position.set(x, 0.011, 0); mm.receiveShadow = true; tape.add(mm); };
    sv(-fw / 2 + s / 2); sv(fw / 2 - s / 2);
    tape.name = 'mtto';
    bake(tape, false);
    model.group.add(tape);
  }
  return model;
}
