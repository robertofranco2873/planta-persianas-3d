import * as THREE from 'three';
import type { GameData, Layout, MaquinaLayout, TipoMaquina } from '../data';
import { buildMachine, MachineModel } from '../machines/generators';
import { Collision, rotatedAABB, AABB } from '../player/collision';
import { Character } from '../player/character';
import type { Mats, Textures } from '../world/materials';
import { textSprite } from '../world/materials';
import { deg, easeInOut, lerp, polyLength, ribbon } from '../util/geo';

export type LayoutId = 'actual' | 'propuesto';

interface Pose { x: number; z: number; rot: number; on: boolean }
export interface MachineInst {
  id: string; tipo: string; td: TipoMaquina; nombre: string;
  model: MachineModel; root: THREE.Group;
  pose: Partial<Record<LayoutId, Pose>>;
  soloB: boolean;
  cur: { x: number; z: number; rot: number; s: number };
  from?: { x: number; z: number; rot: number; s: number };
  to?: { x: number; z: number; rot: number; s: number };
  holgura?: THREE.Sprite;
  ghost?: THREE.Object3D;
  on: boolean;
}

const DUR = 1.5;

export class LayoutManager {
  active: LayoutId = 'actual';
  showB = false;
  showFlows = false;
  machines = new Map<string, MachineInst>();
  root = new THREE.Group();
  private ops: { ch: Character; cur: { x: number; z: number; s: number; ry: number }; from?: any; to?: any }[] = [];
  private flowGroups: Record<LayoutId, THREE.Group>;
  private flowTex: THREE.Texture;
  private trans = -1;
  private fx: Dust;
  forklift?: MachineInst;
  private forkS = 0;
  private forkLen = 0;
  onChange: ((l: LayoutId) => void)[] = [];
  onB: ((b: boolean) => void)[] = [];

  constructor(private data: GameData, private M: Mats, T: Textures, private col: Collision) {
    this.root.name = 'layout';
    const L = data.layouts;
    const ids = new Map<string, { a?: MaquinaLayout; p?: MaquinaLayout }>();
    for (const m of L.actual.maquinas) ids.set(m.id, { ...(ids.get(m.id) ?? {}), a: m });
    for (const m of L.propuesto.maquinas) ids.set(m.id, { ...(ids.get(m.id) ?? {}), p: m });
    for (const [id, { a, p }] of ids) {
      const ml = (a ?? p)!;
      const td = data.maquinas[ml.tipo];
      if (!td) { console.warn('Tipo sin ficha:', ml.tipo); continue; }
      const model = buildMachine(ml.tipo, td, M, ml.largo);
      const root = new THREE.Group();
      root.add(model.group);
      root.userData.machineId = id;
      const pose: MachineInst['pose'] = {};
      if (a) pose.actual = { x: a.x, z: a.z, rot: a.rot, on: a.en_operacion !== false };
      if (p) pose.propuesto = { x: p.x, z: p.z, rot: p.rot, on: p.en_operacion !== false };
      const soloB = !!p?.solo_escenario_b;
      const inst: MachineInst = { id, tipo: ml.tipo, td, nombre: ml.nombre ?? td.nombre, model, root, pose, soloB, cur: { x: 0, z: 0, rot: 0, s: 0 }, on: true };
      if (soloB) this.makeGhost(inst);
      this.machines.set(id, inst);
      this.root.add(root);
      if (ml.tipo === 'montacargas') this.forklift = inst;
    }
    // operadores
    const nOps = Math.max(L.actual.operadores.length, L.propuesto.operadores.length);
    for (let i = 0; i < nOps; i++) {
      const ch = new Character({ vest: '#F1C40F', helmet: '#F8F8F8', overall: '#34495E', simple: true });
      this.root.add(ch.root);
      this.ops.push({ ch, cur: { x: 0, z: 0, s: 0, ry: 0 } });
    }
    // flujos
    this.flowTex = T.arrow.clone();
    this.flowTex.needsUpdate = true;
    this.flowTex.wrapS = THREE.RepeatWrapping;
    this.flowTex.repeat.set(1 / 1.4, 1);
    this.flowGroups = { actual: this.buildFlows(L.actual), propuesto: this.buildFlows(L.propuesto) };
    this.root.add(this.flowGroups.actual, this.flowGroups.propuesto);
    this.fx = new Dust();
    this.root.add(this.fx.points);
    this.setupForklift();
    this.applyInstant();
  }

  get layout(): Layout { return this.data.layouts[this.active]; }

  private opCache: Partial<Record<LayoutId, { x: number; z: number }[]>> = {};
  /** Cajas de colisión de las máquinas sólidas de un layout (sin montacargas ni fantasmas). */
  targetBoxes(id: LayoutId) {
    const out: AABB[] = [];
    for (const m of this.machines.values()) {
      const p = m.pose[id];
      if (!p || m.soloB || m === this.forklift) continue;
      out.push(rotatedAABB(p.x, p.z, m.model.L, m.model.W, deg(p.rot), m.model.H, m.id));
    }
    return out;
  }
  /** Posiciones de operadores del JSON, desplazadas al punto libre más cercano si caen sobre una máquina. */
  opSpots(id: LayoutId) {
    if (!this.opCache[id]) {
      const boxes = this.targetBoxes(id);
      this.opCache[id] = this.data.layouts[id].operadores.map((p) => this.col.findFreeWith(p.x, p.z, 0.4, boxes));
    }
    return this.opCache[id]!;
  }
  get transitioning() { return this.trans >= 0; }

  private target(inst: MachineInst) {
    const p = inst.pose[this.active];
    const visible = !!p && (!inst.soloB || (this.active === 'propuesto' && this.showB));
    const ref = p ?? inst.pose.actual ?? inst.pose.propuesto!;
    return { x: ref.x, z: ref.z, rot: ref.rot, s: visible ? 1 : 0 };
  }

  private applyInstant() {
    for (const inst of this.machines.values()) {
      inst.cur = this.target(inst);
      this.place(inst);
    }
    const ops = this.opSpots(this.active);
    this.ops.forEach((o, i) => {
      const p = ops[i];
      o.cur = p ? { x: p.x, z: p.z, s: 1, ry: this.faceMachine(p.x, p.z) } : { ...o.cur, s: 0 };
      this.placeOp(o);
    });
    this.refreshState();
    this.updateColliders();
  }

  private place(inst: MachineInst) {
    const { x, z, rot, s } = inst.cur;
    inst.root.position.set(x, 0, z);
    inst.root.rotation.y = -deg(rot);
    inst.root.scale.setScalar(Math.max(s, 0.0001));
    inst.root.visible = s > 0.01;
  }
  private placeOp(o: (typeof this.ops)[number]) {
    o.ch.root.position.set(o.cur.x, 0, o.cur.z);
    o.ch.root.rotation.y = o.cur.ry;
    o.ch.root.scale.setScalar(Math.max(o.cur.s, 0.0001));
    o.ch.root.visible = o.cur.s > 0.01;
  }

  /** Orientación para que el operador mire a la máquina más cercana. */
  private faceMachine(x: number, z: number) {
    let best: MachineInst | undefined, bd = Infinity;
    for (const m of this.machines.values()) {
      const t = this.target(m);
      if (t.s < 0.5 || m.tipo === 'montacargas' || m.tipo.startsWith('rack')) continue;
      const b = rotatedAABB(t.x, t.z, m.model.L, m.model.W, deg(t.rot));
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return 0;
    const t = this.target(best);
    const b = rotatedAABB(t.x, t.z, best.model.L, best.model.W, deg(t.rot));
    const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    return Math.atan2(cx - x, cz - z);
  }

  private refreshState() {
    for (const inst of this.machines.values()) {
      const p = inst.pose[this.active];
      inst.on = p ? p.on : true;
      inst.model.setOn?.(inst.on);
      if (!inst.on && !inst.holgura) {
        inst.holgura = textSprite(['holgura', 'fuera de operación'], 1.8, { w: 384, h: 128, bg: 'rgba(192,57,43,0.9)', font: 48 });
        inst.holgura.position.set(0, inst.model.H + 0.6, 0);
        inst.root.add(inst.holgura);
      }
      if (inst.holgura) inst.holgura.visible = !inst.on;
    }
    this.flowGroups.actual.visible = this.showFlows && this.active === 'actual' && !this.transitioning;
    this.flowGroups.propuesto.visible = this.showFlows && this.active === 'propuesto' && !this.transitioning;
  }

  updateColliders() {
    const boxes: AABB[] = [];
    for (const inst of this.machines.values()) {
      if (inst.soloB || inst.cur.s < 0.3 || inst === this.forklift) continue;
      const s = inst.cur.s;
      boxes.push(rotatedAABB(inst.cur.x, inst.cur.z, inst.model.L * s, inst.model.W * s, deg(inst.cur.rot), inst.model.H, inst.id));
    }
    this.col.setDynamic('machines', boxes);
    this.col.setDynamic('ops', this.ops.filter((o) => o.cur.s > 0.5).map((o) => rotatedAABB(o.cur.x, o.cur.z, 0.5, 0.5, 0, 1.8)));
  }

  setLayout(id: LayoutId) {
    if (id === this.active || this.transitioning) return false;
    const prevOps = this.ops.map((o) => ({ ...o.cur }));
    for (const inst of this.machines.values()) inst.from = { ...inst.cur };
    this.active = id;
    for (const inst of this.machines.values()) {
      inst.to = this.target(inst);
      // girar por el camino corto
      let d = inst.to.rot - inst.from!.rot;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      inst.to.rot = inst.from!.rot + d;
      const moved = Math.hypot(inst.to.x - inst.from!.x, inst.to.z - inst.from!.z) > 0.2 || Math.abs(inst.to.s - inst.from!.s) > 0.1;
      if (moved && inst !== this.forklift) { this.fx.burst(inst.from!.x, inst.from!.z, 10); this.fx.burst(inst.to.x, inst.to.z, 14, 0.25); }
    }
    const ops = this.opSpots(id);
    this.ops.forEach((o, i) => {
      o.from = prevOps[i];
      const p = ops[i];
      o.to = p ? { x: p.x, z: p.z, s: 1, ry: 0 } : { ...prevOps[i], s: 0 };
      if (o.from.s < 0.5 && p) { o.from = { ...o.to, s: 0 }; }
    });
    this.trans = 0;
    this.refreshState();
    this.onChange.forEach((f) => f(id));
    return true;
  }

  toggleB() {
    if (this.active !== 'propuesto' || this.transitioning) return false;
    this.showB = !this.showB;
    for (const inst of this.machines.values()) if (inst.soloB) { inst.from = { ...inst.cur }; inst.to = this.target(inst); }
    this.trans = 0;
    this.onB.forEach((f) => f(this.showB));
    return true;
  }

  setFlows(v: boolean) { this.showFlows = v; this.refreshState(); }

  /** Actualiza transición y animaciones. Devuelve true si las colisiones cambiaron. */
  update(dt: number, t: number) {
    let changed = false;
    if (this.trans >= 0) {
      this.trans = Math.min(1, this.trans + dt / DUR);
      const k = easeInOut(this.trans);
      for (const inst of this.machines.values()) {
        if (!inst.from || !inst.to) continue;
        inst.cur = {
          x: lerp(inst.from.x, inst.to.x, k), z: lerp(inst.from.z, inst.to.z, k), rot: lerp(inst.from.rot, inst.to.rot, k),
          s: lerp(inst.from.s, inst.to.s, k),
        };
        if (inst !== this.forklift) this.place(inst);
      }
      this.ops.forEach((o) => {
        if (!o.from || !o.to) return;
        const ry = Math.atan2(o.to.x - o.from.x, o.to.z - o.from.z);
        o.cur = { x: lerp(o.from.x, o.to.x, k), z: lerp(o.from.z, o.to.z, k), s: lerp(o.from.s, o.to.s, k), ry: Math.hypot(o.to.x - o.from.x, o.to.z - o.from.z) > 0.3 ? ry : o.cur.ry };
        this.placeOp(o);
      });
      changed = true;
      if (this.trans >= 1) {
        this.trans = -1;
        for (const inst of this.machines.values()) { inst.cur = inst.to ?? inst.cur; inst.from = inst.to = undefined; if (inst !== this.forklift) this.place(inst); }
        this.ops.forEach((o) => { if (o.to) o.cur = { ...o.to, ry: this.faceMachine(o.to.x, o.to.z) }; o.from = o.to = undefined; this.placeOp(o); });
        this.refreshState();
      }
      this.updateColliders();
    }
    // animaciones de máquinas
    for (const inst of this.machines.values()) if (inst.root.visible && inst.model.anim) inst.model.anim(t, dt, inst.on && !inst.soloB);
    // operadores
    const moving = this.trans >= 0;
    for (const o of this.ops) if (o.ch.root.visible) o.ch.animate(dt, moving ? 'walk' : 'work', 2);
    // montacargas
    this.updateForklift(dt);
    this.flowTex.offset.x -= dt * 0.9;
    this.fx.update(dt);
    return changed;
  }

  // ---------------------------------------------------------------- montacargas
  private forkSegs: { ax: number; az: number; bx: number; bz: number; len: number; yaw: number }[] = [];
  private setupForklift() {
    const P = this.data.planta;
    const Z = (id: string) => P.zonas.find((z) => z.id === id);
    const pn = Z('pasillo_norte'), pc = Z('pasillo_central'), po = Z('pasillo_oeste'), ps = Z('pasillo_sur');
    if (!pn || !pc || !this.forklift) return;
    const zN = pn.z, xC = pc.x;
    const pts: [number, number][] = [];
    // pasillo oeste (MP tubo/perfiles): entra de frente y sale en reversa
    if (po) pts.push([po.x, zN], [po.x, po.z + po.d / 2 - 1.5], [po.x, zN]);
    else pts.push([pn.x - pn.w / 2 + 4, zN]);
    pts.push([xC, zN], [xC, ps ? ps.z : pc.z + pc.d / 2 - 2.5]);
    // pasillo sur (MP tela): ida y vuelta en reversa
    if (ps) pts.push([ps.x - ps.w / 2 + 2, ps.z], [xC, ps.z]);
    pts.push([xC, zN]);
    // zona de andenes: entra hacia el sur y regresa en reversa
    const xD = pn.x + pn.w / 2 - 4.5;
    pts.push([xD, zN], [xD, zN + 8], [xD, zN]);
    pts.push(pts[0]);
    // segmentos con orientación (reversa después de una vuelta en U)
    let prevTravel = NaN, reverse = false;
    this.forkSegs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const travel = Math.atan2(-(bz - az), bx - ax);
      if (!isNaN(prevTravel)) {
        let d = travel - prevTravel; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        reverse = Math.abs(d) > 2.6 ? !reverse : false;
      }
      this.forkSegs.push({ ax, az, bx, bz, len, yaw: travel + (reverse ? Math.PI : 0) });
      prevTravel = travel;
    }
    this.forkLen = this.forkSegs.reduce((t, g) => t + g.len, 0);
  }
  private updateForklift(dt: number) {
    const f = this.forklift;
    const S = this.forkSegs;
    if (!f || S.length < 2) return;
    this.forkS = (this.forkS + dt * 2.0) % this.forkLen;
    let s = this.forkS;
    const lerpA = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
    for (let i = 0; i < S.length; i++) {
      const g = S[i];
      if (s <= g.len) {
        const k = s / g.len;
        const x = lerp(g.ax, g.bx, k), z = lerp(g.az, g.bz, k);
        const B = 0.9;
        let yaw = g.yaw;
        const prev = S[(i - 1 + S.length) % S.length], next = S[(i + 1) % S.length];
        if (s < B) yaw = lerpA(prev.yaw, g.yaw, 0.5 + 0.5 * (s / B));
        else if (g.len - s < B) yaw = lerpA(g.yaw, next.yaw, 0.5 * (1 - (g.len - s) / B));
        f.root.position.set(x, 0, z);
        f.root.rotation.y = yaw;
        f.cur = { x, z, rot: -yaw * 180 / Math.PI, s: 1 };
        this.col.setDynamic('forklift', [rotatedAABB(x, z, f.model.L, f.model.W, yaw, 2.2, 'montacargas')]);
        return;
      }
      s -= g.len;
    }
  }

  // ---------------------------------------------------------------- fantasmas del escenario B
  private makeGhost(inst: MachineInst) {
    const ghostMat = new THREE.MeshStandardMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.28, depthWrite: false, emissive: '#5a7fa8', emissiveIntensity: 0.4 });
    inst.model.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = ghostMat; m.castShadow = false; }
    });
    const { L, W, H } = inst.model;
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(L + 0.1, H + 0.05, W + 0.1));
    const lines = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.25, gapSize: 0.18 }));
    lines.computeLineDistances();
    lines.position.y = H / 2;
    inst.model.group.add(lines);
    const lab = textSprite(['Escenario B'], 1.8, { w: 384, h: 96, bg: 'rgba(46,117,182,0.9)', font: 50 });
    lab.position.set(0, H + 0.5, 0);
    inst.model.group.add(lab);
  }

  // ---------------------------------------------------------------- flujos
  private buildFlows(L: Layout) {
    const g = new THREE.Group();
    const order = ['persiana', 'perfiles', 'tela', 'tubo'];
    for (const f of L.flujos) {
      const yOff = 0.03 + order.indexOf(f.material) * 0.004;
      const geo = ribbon(f.puntos, 0.38, yOff);
      const mat = new THREE.MeshBasicMaterial({ map: this.flowTex, color: f.color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 5;
      g.add(m);
      // puntos de inicio/fin
      for (const [i, pt] of [[0, f.puntos[0]], [1, f.puntos[f.puntos.length - 1]]] as const) {
        const ring = new THREE.Mesh(new THREE.CircleGeometry(i === 0 ? 0.35 : 0.45, 20), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.9, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(pt[0], yOff + 0.002, pt[1]);
        g.add(ring);
      }
    }
    // letrero flotante
    const k = L.kpis;
    const mats = [...new Set(L.flujos.map((f) => f.material))];
    const sumBy = mats.map((m) => `${m}: ${Math.round(L.flujos.filter((f) => f.material === m).reduce((s, f) => s + polyLength(f.puntos), 0))} m dibujados`);
    const s = textSprite([L.nombre, `Recorrido por persiana: ${k.recorrido_por_persiana_m} m`, `Traslado más largo: ${k.traslado_mas_largo_m} m`], 9, { w: 1024, h: 300, bg: 'rgba(44,46,49,0.9)', border: '#F1C40F', font: 66 });
    const per = L.flujos.find((f) => f.material === 'persiana') ?? L.flujos[0];
    const xs = per.puntos.map((p) => p[0]), zs = per.puntos.map((p) => p[1]);
    s.position.set((Math.min(...xs) + Math.max(...xs)) / 2, 7.2, (Math.min(...zs) + Math.max(...zs)) / 2);
    g.add(s);
    g.userData.legend = sumBy;
    g.visible = false;
    return g;
  }

  /** Lista de instancias visibles (sólidas) en el layout activo. */
  visibleMachines() {
    return [...this.machines.values()].filter((m) => m.cur.s > 0.5 && !m.soloB);
  }
  countTipo(tipo: string, id: LayoutId = this.active) {
    const L = this.data.layouts[id];
    const base = L.maquinas.filter((m) => m.tipo === tipo && !m.solo_escenario_b).length;
    const b = L.maquinas.filter((m) => m.tipo === tipo && m.solo_escenario_b).length;
    return { base, b };
  }
}

/** Polvo/destello al mover máquinas. */
class Dust {
  points: THREE.Points;
  private N = 600;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private i = 0;
  constructor() {
    this.pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const cg = c.getContext('2d')!; const gr = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: '#efe6d8', size: 0.45, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.8, depthWrite: false }));
    this.points.frustumCulled = false;
    for (let k = 0; k < this.N; k++) this.pos[k * 3 + 1] = -100;
  }
  burst(x: number, z: number, n: number, delay = 0) {
    for (let k = 0; k < n; k++) {
      const j = this.i++ % this.N;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
      this.pos.set([x + Math.cos(a) * r, 0.1 + Math.random() * 0.3, z + Math.sin(a) * r], j * 3);
      this.vel.set([Math.cos(a) * 0.8, 0.6 + Math.random() * 0.8, Math.sin(a) * 0.8], j * 3);
      this.life[j] = 1.0 + delay + Math.random() * 0.4;
    }
  }
  update(dt: number) {
    let any = false;
    for (let k = 0; k < this.N; k++) {
      if (this.life[k] <= 0) continue;
      any = true;
      this.life[k] -= dt;
      if (this.life[k] <= 0) { this.pos[k * 3 + 1] = -100; continue; }
      this.pos[k * 3] += this.vel[k * 3] * dt;
      this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt;
      this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      this.vel[k * 3 + 1] -= dt * 0.6;
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
  }
}
