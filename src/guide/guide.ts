import * as THREE from 'three';
import type { GameData } from '../data';
import { zonaById } from '../data';
import type { Collision, AABB } from '../player/collision';
import type { LayoutManager } from '../layout/layoutManager';
import type { Props, Target } from '../interact/props';
import type { Discoveries } from '../interact/discoveries';
import type { Textures } from '../world/materials';
import { ribbon } from '../util/geo';
import { NavGrid } from './path';

export interface Objetivo { tipo: 'ver' | 'zona' | 'anden' | 'accion'; ref: string; texto: string }
export interface Paso { id: string; titulo: string; descripcion: string; objetivos: Objetivo[] }
export interface Recorrido { titulo: string; final: string; pasos: Paso[] }

const KEY = 'planta3d.recorrido.v1';
const COLOR = '#35d6ff';

interface Goal { x: number; z: number; reached: (x: number, z: number) => boolean }

export class Guide {
  enabled = true;
  private flags = new Set<string>();
  private grid = new NavGrid();
  private gridSig = '';
  private arrow: THREE.Mesh | null = null;
  private arrowMat: THREE.MeshBasicMaterial;
  private tex: THREE.Texture;
  private marker: THREE.Group;
  private lastPathAt = -1;
  private lastFrom = new THREE.Vector2(1e9, 1e9);
  private lastGoalKey = '';
  private stepIdx = -1;
  private el: HTMLElement;
  group = new THREE.Group();
  onStep: ((done: Paso, next: Paso | null) => void)[] = [];

  constructor(private d: GameData, private R: Recorrido, private props: Props, private lm: LayoutManager,
    private col: Collision, private disc: Discoveries, T: Textures) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); (s.flags ?? []).forEach((f: string) => this.flags.add(f)); this.enabled = s.enabled !== false; }
    } catch { /* */ }
    this.tex = T.arrow.clone(); this.tex.needsUpdate = true;
    this.tex.wrapS = THREE.RepeatWrapping; this.tex.repeat.set(1 / 1.1, 1);
    this.arrowMat = new THREE.MeshBasicMaterial({ map: this.tex, color: COLOR, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
    // marcador flotante sobre el objetivo
    this.marker = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), new THREE.MeshBasicMaterial({ color: COLOR }));
    cone.rotation.x = Math.PI;
    this.marker.add(cone);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.userData.ring = true;
    this.marker.add(ring);
    this.group.add(this.marker);
    this.el = document.getElementById('mission')!;
    this.stepIdx = this.currentIndex();
    this.render();
    disc.listeners.push(() => this.render());
  }

  private save() { try { localStorage.setItem(KEY, JSON.stringify({ flags: [...this.flags], enabled: this.enabled })); } catch { /* */ } }
  reset() { this.flags.clear(); this.save(); this.stepIdx = this.currentIndex(); this.lastGoalKey = ''; this.render(); }
  setEnabled(v: boolean) { this.enabled = v; this.save(); this.render(); if (!v) this.clearArrow(); this.lastGoalKey = ''; }
  flag(name: string) { if (!this.flags.has(name)) { this.flags.add(name); this.save(); this.render(); } }

  done(o: Objetivo) {
    if (o.tipo === 'ver') return this.disc.has(o.ref);
    return this.flags.has(`${o.tipo}:${o.ref}`);
  }
  private currentIndex() {
    const i = this.R.pasos.findIndex((p) => !p.objetivos.every((o) => this.done(o)));
    return i < 0 ? this.R.pasos.length : i;
  }
  get step(): Paso | null { return this.R.pasos[this.stepIdx] ?? null; }

  // ---------------------------------------------------------------- objetivo actual → punto destino
  private goalFor(o: Objetivo, px: number, pz: number): Goal | null {
    if (o.tipo === 'ver') {
      let best: Target | null = null, bd = Infinity;
      for (const t of this.props.targets) {
        if (t.key !== o.ref) continue;
        const dd = t.dist(px, pz);
        if (dd < bd) { bd = dd; best = t; }
      }
      if (!best) return null;
      const p = best.pos();
      const t = best;
      return { x: p.x, z: p.z, reached: (x, z) => t.dist(x, z) < 1.6 && !this.wallBetween(x, z, p.x, p.z) };
    }
    if (o.tipo === 'zona') {
      const z = zonaById(this.d, o.ref);
      if (!z) return null;
      return { x: z.x, z: z.z, reached: (x, zz) => Math.abs(x - z.x) < z.w / 2 - 0.6 && Math.abs(zz - z.z) < z.d / 2 - 0.6 };
    }
    if (o.tipo === 'anden') {
      const a = this.d.planta.andenes.find((k) => k.id === o.ref);
      if (!a) return null;
      const gx = a.x - 2.5, gz = a.z;
      return { x: gx, z: gz, reached: (x, z) => Math.hypot(x - gx, z - gz) < 1.5 };
    }
    if (o.tipo === 'accion' && o.ref === 'layout_propuesto') {
      const t = this.props.targets.find((k) => k.kind === 'lever');
      if (!t) return null;
      const p = t.pos();
      return { x: p.x, z: p.z, reached: (x, z) => t.dist(x, z) < 1.6 && !this.wallBetween(x, z, p.x, p.z) };
    }
    return null;
  }

  /** Revisa objetivos de posición y avance de pasos. */
  update(dt: number, player: THREE.Vector3, scene: THREE.Scene, hidden: boolean) {
    // objetivos de zona/andén se cumplen al llegar
    const st = this.step;
    if (st) for (const o of st.objetivos) {
      if (this.done(o) || (o.tipo !== 'zona' && o.tipo !== 'anden')) continue;
      const g = this.goalFor(o, player.x, player.z);
      if (g && g.reached(player.x, player.z)) this.flag(`${o.tipo}:${o.ref}`);
    }
    const idx = this.currentIndex();
    if (idx !== this.stepIdx) {
      const prev = this.R.pasos[this.stepIdx];
      this.stepIdx = idx;
      if (prev && idx > this.R.pasos.indexOf(prev)) this.onStep.forEach((f) => f(prev, this.step));
      this.lastGoalKey = '';
      this.render();
    }

    this.tex.offset.x -= dt * 1.4;
    const show = this.enabled && !hidden && !!this.step;
    this.group.visible = show;
    if (this.group.parent !== scene) scene.add(this.group);
    if (!show) return;

    // destino: primer objetivo pendiente con lugar físico
    const pending = this.step!.objetivos.filter((o) => !this.done(o));
    let goal: Goal | null = null, gkey = '';
    for (const o of pending) { goal = this.goalFor(o, player.x, player.z); if (goal) { gkey = o.tipo + o.ref; break; } }
    if (!goal) { this.clearArrow(); this.marker.visible = false; return; }
    this.marker.visible = true;
    const t = performance.now() / 1000;
    this.marker.children[0].position.y = 3.0 + Math.sin(t * 2.5) * 0.25;
    this.marker.children[0].rotation.y = t * 1.5;
    this.marker.position.set(goal.x, 0, goal.z);
    (this.marker.children[1] as THREE.Mesh).position.y = 0.06;

    // rejilla de navegación (se reconstruye si cambian las colisiones relevantes)
    const sig = `${this.lm.active}|${this.lm.transitioning}|${this.col.dynamic.get('exits')?.length ?? 0}`;
    if (sig !== this.gridSig && !this.lm.transitioning) {
      this.gridSig = sig;
      this.grid.rebuild(this.navBoxes(), 0.32);
      this.lastGoalKey = '';
    }
    const now = t;
    const moved = this.lastFrom.distanceTo(new THREE.Vector2(player.x, player.z));
    if (goal.reached(player.x, player.z)) { this.clearArrow(); this.path = []; this.lastGoalKey = gkey; return; }
    if (gkey !== this.lastGoalKey || !this.path.length) {
      this.recompute(player, goal, gkey, now);
    } else if (moved > 0.3) {
      // recorta la ruta existente mientras haya línea de vista; si se pierde, recalcula
      const P = this.path;
      while (P.length > 2 && this.grid.clear(player.x, player.z, P[2][0], P[2][1])) P.splice(1, 1);
      if (P.length >= 2 && this.grid.clear(player.x, player.z, P[1][0], P[1][1])) {
        P[0] = [player.x, player.z];
        this.lastFrom.set(player.x, player.z);
        this.setArrow(P);
      } else if (now - this.lastPathAt > 0.5) this.recompute(player, goal, gkey, now);
    }
  }

  /** ¿Hay un muro (nave u oficinas) entre dos puntos? Ignora dinteles sobre puertas. */
  private wallBetween(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax, dz = bz - az;
    for (const b of this.col.camBoxes) {
      if (b.min.y > 0.5) continue;
      let t0 = 0, t1 = 1;
      for (const [o, d, mn, mx] of [[ax, dx, b.min.x, b.max.x], [az, dz, b.min.z, b.max.z]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { t0 = 2; break; } continue; }
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t0 <= t1) return true;
    }
    return false;
  }
  private path: [number, number][] = [];
  private recompute(player: THREE.Vector3, goal: Goal, gkey: string, now: number) {
    this.lastGoalKey = gkey; this.lastPathAt = now; this.lastFrom.set(player.x, player.z);
    this.path = this.grid.find(player.x, player.z, goal.x, goal.z, goal.reached) ?? [[player.x, player.z], [goal.x, goal.z]];
    this.setArrow(this.path);
  }
  private *navBoxes(): Generator<AABB> {
    yield* this.col.static;
    for (const [k, arr] of this.col.dynamic) if (k !== 'forklift' && k !== 'npcs' && k !== 'ops') yield* arr;
  }
  private clearArrow() { if (this.arrow) { this.group.remove(this.arrow); this.arrow.geometry.dispose(); this.arrow = null; } }
  private setArrow(path: [number, number][]) {
    this.clearArrow();
    if (path.length < 2) return;
    this.arrow = new THREE.Mesh(ribbon(path, 0.55, 0.06), this.arrowMat);
    this.arrow.renderOrder = 6;
    this.group.add(this.arrow);
  }

  // ---------------------------------------------------------------- panel HUD
  render() {
    const el = this.el;
    if (!el) return;
    if (!this.enabled) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const n = this.R.pasos.length;
    const st = this.step;
    if (!st) {
      el.innerHTML = `<div class="mt">${this.R.titulo} · completo ✓</div><p>${this.R.final}</p><div class="mk">G ocultar guía</div>`;
      return;
    }
    el.innerHTML = `<div class="mt">${this.R.titulo} · paso ${this.stepIdx + 1}/${n}</div>
      <div class="ms">${st.titulo}</div><p>${st.descripcion}</p>
      <ul>${st.objetivos.map((o) => `<li class="${this.done(o) ? 'ok' : ''}"><span>${this.done(o) ? '✓' : ''}</span>${o.texto}</li>`).join('')}</ul>
      <div class="mk">Sigue la flecha azul · ${document.body.classList.contains('touch') ? 'botón Guía para ocultar · toca para plegar' : 'G ocultar guía'}</div>`;
  }
}
