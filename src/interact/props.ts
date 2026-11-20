import * as THREE from 'three';
import type { GameData, Interactuable, Npc, Zona } from '../data';
import { zonaById } from '../data';
import { bake, box, boxB, cyl, cylX } from '../util/geo';
import { Collision, rectAABB, rotatedAABB } from '../player/collision';
import { Character } from '../player/character';
import type { LayoutManager, LayoutId } from '../layout/layoutManager';
import { Mats, canvasTex, PAL, roundRect } from '../world/materials';
import { RESIDUO_COLORS } from './content';

export interface Spot { x: number; z: number; rot: number }

/**
 * Ubicación de cada interactuable dentro de su zona. Son decisiones de presentación
 * (el JSON sólo dice la zona). Si el interactuable trae `x`,`z` en el JSON, mandan esos.
 * rot = hacia dónde mira el frente del objeto (0 = sur/+Z, π = norte/−Z, π/2 = este/+X).
 */
const PLACE: Record<string, (d: GameData) => Spot> = {
  vitrina_producto: (d) => { const z = zonaById(d, 'recepcion')!; return { x: z.x - z.w / 2 + 1.2, z: d.planta.nave.d + 1.3, rot: 0 }; },
  placa_equipo: (d) => { const z = zonaById(d, 'recepcion')!; return { x: z.x - z.w / 2 + 0.1, z: z.z + 0.2, rot: Math.PI / 2 }; },
  mapa_ubicacion: (d) => { const z = zonaById(d, 'recepcion')!; return { x: z.x, z: d.planta.nave.d + 0.32, rot: 0 }; },
  terminal_finanzas: (d) => { const z = zonaById(d, 'oficina_gerente')!; return { x: Math.max(z.x, 0.8), z: z.z - 0.7, rot: 0 }; },
  sala_juntas: (d) => { const z = zonaById(d, 'oficinas')!; return { x: z.x + 2, z: z.z + z.d / 2 - 0.1, rot: Math.PI }; },
  justificacion: (d) => { const z = zonaById(d, 'oficinas')!; return { x: z.x - z.w / 2 + 0.12, z: z.z + 0.5, rot: Math.PI / 2 }; },
  tablero_produccion: (d) => ({ x: 33.0, z: d.planta.nave.d - 0.08, rot: Math.PI }),
  tablero_balanceo: (d) => ({ x: 27.9, z: d.planta.nave.d - 0.08, rot: Math.PI }),
  pantalla_simulacion: (d) => { const z = zonaById(d, 'mantenimiento')!; return { x: z.x, z: d.planta.nave.d - 0.08, rot: Math.PI }; },
  estacion_ehs: (d) => ({ x: 25.2, z: d.planta.nave.d - 0.35, rot: Math.PI }),
  area_residuos: (d) => { const z = zonaById(d, 'residuos')!; return { x: z.x - z.w / 2 - 1.7, z: d.planta.nave.d - 0.5, rot: Math.PI }; },
  // al final del pasillo oeste de montacargas, frente al rack de tubo
  almacenes_info: (d) => { const z = zonaById(d, 'almacen_mp')!; return { x: z.x + z.w / 2 + 0.6, z: z.z + z.d / 2 + 1.4, rot: Math.PI / 2 }; },
  tablero_rh: (d) => { const z = zonaById(d, 'comedor')!; return { x: z.x, z: z.z - z.d / 2 + 0.12, rot: 0 }; },
};
const NPC_PLACE: Record<string, (d: GameData) => Spot> = {
  gerente: (d) => { const s = PLACE.terminal_finanzas(d); return { x: s.x, z: s.z - 0.85, rot: 0 }; },
  supervisor: (d) => ({ x: 31.2, z: d.planta.nave.d - 1.7, rot: Math.PI }),
  ing_procesos: (d) => { const z = zonaById(d, 'mantenimiento')!; return { x: z.x + 1.2, z: d.planta.nave.d - 1.2, rot: Math.PI }; },
  almacenista: (d) => { const z = zonaById(d, 'almacen_mp')!; return { x: z.x - 0.2, z: z.z - z.d / 2 + 0.3, rot: 0 }; },
  montacarguista: (d) => { const z = zonaById(d, 'pasillo_norte')!; return { x: z.x - 6, z: z.z - z.d / 2 + 0.5, rot: 0 }; },
};
const VEST: Record<string, [string | null, string | null, string]> = {
  gerente: [null, null, '#F8F8F8'], supervisor: ['#E67E22', '#F8F8F8', '#34495E'], ing_procesos: ['#2E75B6', '#F8F8F8', '#34495E'],
  inspector: ['#8E44AD', '#F8F8F8', '#34495E'], ehs: ['#27AE60', '#27AE60', '#2C2E31'], tecnico: ['#C0392B', '#F1C40F', '#2E75B6'],
  montacarguista: ['#E67E22', '#F1C40F', '#34495E'], almacenista: ['#F39C12', '#F1C40F', '#6B5545'], operador_sierra: ['#F1C40F', '#F1C40F', '#34495E'],
};

export interface Target {
  key: string;            // clave de descubrimiento (libreta)
  kind: 'it' | 'machine' | 'npc' | 'lever';
  label: string;
  /** distancia del jugador al objeto (borde de la huella) */
  dist(x: number, z: number): number;
  pos(): { x: number; z: number };
  it?: Interactuable; npc?: NpcInst; machineId?: string;
}
export interface NpcInst { n: Npc; ch: Character; x: number; z: number; ry: number; tx: number; tz: number; talking: boolean; baseRot: number }

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' '); const out: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}
export function screenCanvas(title: string, lines: string[], w = 1024, h = 576, accent = PAL.amarillo) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#16181b'; g.fillRect(0, 0, w, h);
  g.fillStyle = PAL.cafe; g.fillRect(0, 0, w, 92);
  g.fillStyle = accent; g.fillRect(0, 92, w, 6);
  g.fillStyle = PAL.blanco; g.font = '400 54px Anton, Impact, sans-serif'; g.textBaseline = 'middle';
  g.fillText(title, 28, 48, w - 56);
  g.font = '400 30px Inter, sans-serif';
  let y = 140;
  for (const l of lines) {
    for (const [i, ln] of wrap(g, l, w - 90).entries()) {
      if (y > h - 24) break;
      if (i === 0) { g.fillStyle = accent; g.fillRect(28, y - 6, 12, 12); }
      g.fillStyle = '#e8e4e0'; g.fillText(ln, 56, y);
      y += 38;
    }
    y += 10;
  }
  return c;
}

export class Props {
  group = new THREE.Group();
  targets: Target[] = [];
  npcs: NpcInst[] = [];
  private boardCanvas!: HTMLCanvasElement;
  private boardTex!: THREE.CanvasTexture;
  private boardAnim = { t: 1, from: {} as Record<string, number>, to: {} as Record<string, number> };
  private lever?: THREE.Object3D;
  private leverAngle = 0;
  private vitrinaShade?: THREE.Object3D;
  private vitrinaOpen = false;
  private vitrinaK = 1;
  ehsGear?: THREE.Object3D;
  /** posición de cada interactuable (para minimapa) */
  spots = new Map<string, Spot[]>();

  constructor(private d: GameData, private M: Mats, private col: Collision, private lm: LayoutManager) {
    this.group.name = 'props';
    this.buildFurniture();
    for (const it of d.interactuables) this.buildInteractuable(it);
    this.buildMachineTargets();
    this.buildNpcs();
    lm.onChange.push((l) => this.onLayout(l));
  }

  private screen(it: Interactuable, s: Spot, w: number, h: number, y: number, canvas?: HTMLCanvasElement) {
    const g = new THREE.Group();
    g.add(box(w + 0.12, h + 0.12, 0.08, this.M.dark, 0, 0, 0));
    const tex = canvasTex(canvas ?? screenCanvas(it.titulo, it.contenido));
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.3 }));
    sc.position.z = 0.045;
    g.add(sc);
    g.position.set(s.x, y, s.z);
    g.rotation.y = s.rot;
    this.group.add(g);
    return { g, tex };
  }

  private addTarget(key: string, kind: Target['kind'], label: string, x: number, z: number, w: number, d: number, extra: Partial<Target> = {}) {
    const b = rectAABB(x, z, w, d);
    this.targets.push({
      key, kind, label,
      dist: (px, pz) => { const cx = Math.max(b.minX, Math.min(px, b.maxX)), cz = Math.max(b.minZ, Math.min(pz, b.maxZ)); return Math.hypot(px - cx, pz - cz); },
      pos: () => ({ x, z }),
      ...extra,
    });
  }

  private spotFor(it: Interactuable): Spot | null {
    if (it.x != null && it.z != null) return { x: it.x, z: it.z, rot: 0 };
    const f = PLACE[it.id];
    if (f) return f(this.d);
    const z = zonaById(this.d, it.zona);
    return z ? { x: z.x, z: z.z, rot: 0 } : null;
  }

  private buildInteractuable(it: Interactuable) {
    const M = this.M;
    const key = 'i:' + it.id;
    if (it.ref) return; // se maneja como máquina (rack_iot → servidor_iot)
    if (it.id === 'punto_reunion' || it.zona === 'exterior') {
      const pts = this.d.planta.seguridad.puntos_reunion;
      pts.forEach((p) => this.addTarget(key, 'it', it.titulo, p.x, p.z, 4, 4, { it }));
      this.spots.set(key, pts.map((p) => ({ ...p, rot: 0 })));
      return;
    }
    if (!it.zona) return; // habilidades (vista de flujos)
    const s = this.spotFor(it);
    if (!s) return;
    this.spots.set(key, [s]);
    const front = (dist: number) => ({ x: s.x + Math.sin(s.rot) * dist, z: s.z + Math.cos(s.rot) * dist });
    const wallTarget = (w: number) => { const f = front(0.4); const horiz = Math.abs(Math.sin(s.rot)) < 0.5; this.addTarget(key, 'it', it.titulo, f.x, f.z, horiz ? w : 0.8, horiz ? 0.8 : w, { it }); };
    switch (it.id) {
      case 'tablero_produccion': {
        this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 1024; this.boardCanvas.height = 576;
        const { tex } = this.screen(it, s, 3.4, 1.9, 2.4, this.boardCanvas);
        this.boardTex = tex as THREE.CanvasTexture;
        const k = this.lm.layout.kpis as any;
        this.boardAnim = { t: 1, from: { ...k }, to: { ...k } };
        this.drawBoard(1);
        wallTarget(3.4);
        // palanca física
        const lx = s.x + 2.2, lz = s.z - 0.5;
        const base = new THREE.Group();
        base.add(boxB(0.5, 1.0, 0.4, M.dark, 0, 0, 0));
        base.add(box(0.52, 0.12, 0.42, M.hazard, 0, 0.9, 0));
        const pivot = new THREE.Group(); pivot.position.set(0, 1.02, 0);
        pivot.add(box(0.05, 0.6, 0.05, M.steel, 0, 0.3, 0));
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), M.red); knob.position.y = 0.62; pivot.add(knob);
        base.add(pivot);
        base.position.set(lx, 0, lz);
        this.group.add(base);
        this.lever = pivot;
        this.col.addStatic(rectAABB(lx, lz, 0.5, 0.4, 1));
        this.addTarget('lever', 'lever', 'Palanca: cambiar de layout', lx, lz, 0.5, 0.4);
        break;
      }
      case 'vitrina_producto': {
        const g = new THREE.Group();
        g.add(boxB(1.6, 0.9, 0.7, M.white, 0, 0, 0));
        g.add(boxB(1.64, 0.05, 0.74, M.dark, 0, 0.9, 0));
        g.add(boxB(1.6, 1.6, 0.7, M.glass, 0, 0.95, 0));
        // persiana en exhibición
        g.add(boxB(1.3, 0.12, 0.12, M.white, 0, 2.3, 0));
        const shade = new THREE.Group();
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), M.fabric3); cloth.position.y = -0.5; shade.add(cloth);
        const rail = box(1.22, 0.03, 0.03, M.dark, 0, -1, 0); shade.add(rail);
        shade.position.set(0, 2.3, 0);
        g.add(shade);
        this.vitrinaShade = shade;
        // control remoto en pedestal
        g.add(boxB(0.12, 0.03, 0.22, M.dark, 0.55, 0.93, 0.15));
        g.add(boxB(0.03, 0.01, 0.03, M.red, 0.55, 0.96, 0.2));
        g.position.set(s.x, 0, s.z); g.rotation.y = s.rot;
        this.group.add(g);
        this.col.addStatic(rectAABB(s.x, s.z, 1.7, 0.8, 2.4));
        this.addTarget(key, 'it', it.titulo, s.x, s.z, 1.7, 0.8, { it });
        break;
      }
      case 'placa_equipo': {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
        const g = c.getContext('2d')!;
        const gr = g.createLinearGradient(0, 0, 1024, 640); gr.addColorStop(0, '#8a6a3c'); gr.addColorStop(0.5, '#c9a46a'); gr.addColorStop(1, '#7a5a30');
        g.fillStyle = gr; roundRect(g, 0, 0, 1024, 640, 30); g.fill();
        g.strokeStyle = '#4a3418'; g.lineWidth = 10; roundRect(g, 14, 14, 996, 612, 24); g.stroke();
        g.fillStyle = '#2b1d0c'; g.textAlign = 'center'; g.font = '400 64px Anton, sans-serif';
        g.fillText(it.titulo, 512, 100, 940);
        g.font = '600 36px Inter, sans-serif';
        const names = it.contenido.join(' · ').split('·').map((x) => x.trim());
        names.forEach((n, i) => g.fillText(n, i % 2 ? 730 : 294, 200 + Math.floor(i / 2) * 82, 420));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.875), new THREE.MeshStandardMaterial({ map: canvasTex(c), metalness: 0.5, roughness: 0.35 }));
        m.position.set(s.x + 0.02, 1.55, s.z); m.rotation.y = s.rot;
        this.group.add(m);
        wallTarget(1.4);
        break;
      }
      case 'mapa_ubicacion': this.screen(it, s, 2.2, 1.24, 1.7); wallTarget(2.2); break;
      case 'sala_juntas': this.screen(it, s, 2.6, 1.46, 1.6); wallTarget(2.6); break;
      case 'justificacion': this.screen(it, s, 2.4, 1.35, 1.6); wallTarget(2.4); break;
      case 'pantalla_simulacion': this.screen(it, s, 2.4, 1.35, 2.2); wallTarget(2.4); break;
      case 'tablero_balanceo': this.screen(it, s, 2.6, 1.46, 2.3); wallTarget(2.6); break;
      case 'tablero_rh': this.screen(it, s, 2.0, 1.12, 1.6); wallTarget(2.0); break;
      case 'terminal_finanzas': {
        const g = new THREE.Group();
        g.add(boxB(1.6, 0.04, 0.8, M.wood, 0, 0.72, 0));
        g.add(boxB(1.5, 0.7, 0.04, M.dark, 0, 0.02, -0.36));
        for (const sx of [-0.76, 0.76]) g.add(boxB(0.04, 0.72, 0.76, M.dark, sx, 0, 0));
        const mon = this.screen(it, { x: 0, z: 0, rot: 0 }, 0.6, 0.34, 0, screenCanvas(it.titulo, it.contenido));
        this.group.remove(mon.g); mon.g.position.set(0, 1.0, -0.15); mon.g.rotation.y = Math.PI; g.add(mon.g);
        g.add(boxB(0.06, 0.1, 0.06, M.dark, 0, 0.76, -0.15));
        g.position.set(s.x, 0, s.z); g.rotation.y = 0;
        this.group.add(g);
        this.col.addStatic(rectAABB(s.x, s.z, 1.6, 0.8, 0.8));
        this.addTarget(key, 'it', it.titulo, s.x, s.z, 1.6, 0.8, { it });
        break;
      }
      case 'estacion_ehs': {
        const g = new THREE.Group();
        g.add(boxB(1.3, 2.0, 0.45, M.green, 0, 0, 0));
        g.add(boxB(1.2, 0.04, 0.4, M.white, 0, 1.2, 0.03));
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.yellow); helmet.position.set(-0.3, 1.24, 0.1);
        const vest = boxB(0.4, 0.45, 0.06, M.std('#F1C40F', 0.6), 0.3, 1.45, 0.24);
        const gear = new THREE.Group(); gear.add(helmet, vest); g.add(gear);
        this.ehsGear = gear;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: canvasTex(screenCanvas('ESTACIÓN EHS', [], 512, 128, '#27AE60')) }));
        sign.position.set(0, 2.2, 0.0); g.add(sign);
        g.position.set(s.x, 0, s.z); g.rotation.y = s.rot;
        this.group.add(g);
        this.col.addStatic(rectAABB(s.x, s.z, 1.3, 0.5, 2));
        this.addTarget(key, 'it', it.titulo, s.x, s.z, 1.3, 0.5, { it });
        break;
      }
      case 'area_residuos': {
        const m = it.contenido[0].match(/:\s*(.*)\.$/);
        const tipos = m ? m[1].split(/,\s*|\s+y\s+/) : [];
        const n = Math.max(tipos.length, 1);
        const g = new THREE.Group();
        tipos.forEach((t, i) => {
          const x = (i - (n - 1) / 2) * 0.72;
          const mat = this.M.std(RESIDUO_COLORS[i % RESIDUO_COLORS.length], 0.6);
          g.add(boxB(0.6, 0.9, 0.6, mat, x, 0, 0));
          g.add(boxB(0.64, 0.06, 0.64, M.dark, x, 0.9, 0));
          const c = document.createElement('canvas'); c.width = 256; c.height = 96;
          const cg = c.getContext('2d')!; cg.fillStyle = '#fff'; cg.fillRect(0, 0, 256, 96); cg.fillStyle = '#111'; cg.font = '700 34px Inter'; cg.textAlign = 'center'; cg.fillText(t.toUpperCase(), 128, 60, 240);
          const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: canvasTex(c) }));
          lab.position.set(x, 0.6, 0.305); g.add(lab);
        });
        g.position.set(s.x, 0, s.z); g.rotation.y = s.rot;
        this.group.add(g);
        const w = n * 0.72;
        this.col.addStatic(rectAABB(s.x, s.z, w, 0.65, 1));
        this.addTarget(key, 'it', it.titulo, s.x, s.z, w, 0.65, { it });
        break;
      }
      case 'almacenes_info': {
        const g = new THREE.Group();
        g.add(boxB(0.08, 1.2, 0.08, M.steel, 0, 0, -0.5), boxB(0.08, 1.2, 0.08, M.steel, 0, 0, 0.5));
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ map: canvasTex(screenCanvas(it.titulo, it.contenido, 1024, 584)), side: THREE.DoubleSide }));
        sc.position.set(0, 1.6, 0); sc.rotation.y = Math.PI / 2; g.add(sc);
        g.position.set(s.x, 0, s.z);
        this.group.add(g);
        this.col.addStatic(rectAABB(s.x, s.z, 0.2, 1.2, 2));
        this.addTarget(key, 'it', it.titulo, s.x, s.z, 0.3, 1.4, { it });
        break;
      }
      default: {
        const g = boxB(0.8, 1.6, 0.4, M.topo, s.x, 0, s.z);
        this.group.add(g);
        this.col.addStatic(rectAABB(s.x, s.z, 0.8, 0.4, 1.6));
        this.addTarget(key, 'it', it.titulo, s.x, s.z, 0.8, 0.4, { it });
      }
    }
  }

  private buildMachineTargets() {
    const refs = new Map(this.d.interactuables.filter((i) => i.ref).map((i) => [i.ref!, i]));
    for (const inst of this.lm.machines.values()) {
      const it = refs.get(inst.id);
      this.targets.push({
        key: 'm:' + inst.tipo, kind: 'machine', label: inst.nombre, machineId: inst.id, it,
        dist: (px, pz) => {
          if (inst.cur.s < 0.5) return Infinity;
          const b = rotatedAABB(inst.cur.x, inst.cur.z, inst.model.L, inst.model.W, inst.cur.rot * Math.PI / 180);
          const cx = Math.max(b.minX, Math.min(px, b.maxX)), cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
          return Math.hypot(px - cx, pz - cz);
        },
        pos: () => ({ x: inst.cur.x, z: inst.cur.z }),
      });
    }
  }

  // ---------------------------------------------------------------- NPCs
  private npcSpot(n: Npc, l: LayoutId): Spot {
    if (n.x != null && n.z != null) return { x: n.x, z: n.z, rot: 0 };
    const boxes = this.lm.targetBoxes(l);
    const free = (x: number, z: number) => this.col.findFreeWith(x, z, 0.5, boxes);
    if (n.cerca_de) {
      const m = this.lm.machines.get(n.cerca_de);
      const p = m?.pose[l];
      if (m && p) {
        const r = p.rot * Math.PI / 180;
        const b = rotatedAABB(p.x, p.z, m.model.L, m.model.W, r);
        // lado este de la máquina, luego cualquiera libre
        const f = free(b.maxX + 0.7, p.z);
        return { x: f.x, z: f.z, rot: Math.atan2(p.x - f.x, p.z - f.z) };
      }
      const s = this.spots.get('i:' + n.cerca_de)?.[0];
      if (s) { const f = free(s.x + Math.sin(s.rot) * 1.2 + 1.6, s.z + Math.cos(s.rot) * 1.2); return { x: f.x, z: f.z, rot: s.rot }; }
    }
    const pl = NPC_PLACE[n.id];
    if (pl) { const s = pl(this.d); const f = free(s.x, s.z); return { x: f.x, z: f.z, rot: s.rot }; }
    const z = zonaById(this.d, n.zona) as Zona | undefined;
    if (z) { const f = free(z.x, z.z); return { x: f.x, z: f.z, rot: 0 }; }
    return { x: 30, z: 20, rot: 0 };
  }

  private buildNpcs() {
    for (const n of this.d.npcs) {
      const [vest, helmet, overall] = VEST[n.id] ?? ['#F1C40F', '#F8F8F8', '#34495E'];
      const ch = new Character({ vest, helmet, overall, simple: true });
      const s = this.npcSpot(n, this.lm.active);
      const inst: NpcInst = { n, ch, x: s.x, z: s.z, ry: s.rot, tx: s.x, tz: s.z, talking: false, baseRot: s.rot };
      ch.root.position.set(s.x, 0, s.z);
      ch.root.rotation.y = s.rot;
      this.group.add(ch.root);
      this.npcs.push(inst);
      this.targets.push({
        key: 'n:' + n.id, kind: 'npc', label: n.nombre, npc: inst,
        dist: (px, pz) => Math.max(0, Math.hypot(px - inst.x, pz - inst.z) - 0.3),
        pos: () => ({ x: inst.x, z: inst.z }),
      });
    }
    this.updateNpcColliders();
  }
  private updateNpcColliders() {
    this.col.setDynamic('npcs', this.npcs.map((n) => rectAABB(n.x, n.z, 0.5, 0.5, 1.8)));
  }

  private onLayout(l: LayoutId) {
    for (const n of this.npcs) {
      const s = this.npcSpot(n.n, l);
      n.tx = s.x; n.tz = s.z; n.baseRot = s.rot;
    }
    const k = this.lm.layout.kpis as any;
    this.boardAnim = { t: 0, from: { ...this.boardAnim.to }, to: { ...k } };
  }

  // ---------------------------------------------------------------- tablero dinámico
  private drawBoard(k: number) {
    const c = this.boardCanvas; if (!c) return;
    const g = c.getContext('2d')!;
    const { from, to } = this.boardAnim;
    const v = (key: string) => { const a = Number(from[key]), b = Number(to[key]); return isNaN(a) || isNaN(b) ? to[key] : a + (b - a) * k; };
    g.fillStyle = '#121416'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = PAL.cafe; g.fillRect(0, 0, c.width, 96);
    g.fillStyle = PAL.amarillo; g.fillRect(0, 96, c.width, 6);
    g.fillStyle = PAL.blanco; g.font = '400 52px Anton, sans-serif'; g.textBaseline = 'middle';
    g.fillText('TABLERO DE PRODUCCIÓN', 28, 50);
    g.textAlign = 'right'; g.fillStyle = PAL.amarillo; g.font = '400 40px Anton, sans-serif';
    g.fillText(this.lm.layout.nombre.toUpperCase(), c.width - 28, 50); g.textAlign = 'left';
    const cells: [string, string, string][] = [
      ['CAPACIDAD / DÍA', Math.round(Number(v('capacidad_dia'))).toString(), 'persianas'],
      ['OPERADORES / TURNO', Math.round(Number(v('operadores_por_turno'))).toString(), `× ${Math.round(Number(v('turnos')))} turno(s)`],
      ['RECORRIDO / PERSIANA', Math.round(Number(v('recorrido_por_persiana_m'))) + ' m', ''],
      ['TRASLADO MÁS LARGO', Math.round(Number(v('traslado_mas_largo_m'))) + ' m', ''],
      ['TAKT', Number(v('takt_s')).toFixed(1) + ' s', ''],
      ['PRODUCTIVIDAD', Number(v('productividad_persianas_operador_dia')).toFixed(1), 'persianas/operador/día'],
    ];
    cells.forEach(([lab, val, sub], i) => {
      const x = 28 + (i % 3) * 330, y = 130 + Math.floor(i / 3) * 210;
      g.fillStyle = '#1f2226'; g.fillRect(x, y, 310, 190);
      g.fillStyle = '#9F938C'; g.font = '600 24px Inter, sans-serif'; g.fillText(lab, x + 16, y + 30);
      g.fillStyle = PAL.blanco; g.font = '400 84px Anton, sans-serif'; g.fillText(val, x + 16, y + 105);
      g.fillStyle = '#9F938C'; g.font = '400 22px Inter, sans-serif'; g.fillText(sub, x + 16, y + 165);
    });
    g.fillStyle = '#9F938C'; g.font = '400 22px Inter, sans-serif';
    g.fillText(`Cobertura demanda 500/día: ${to.cobertura_demanda_500}`, 28, c.height - 20);
    this.boardTex.needsUpdate = true;
  }

  toggleVitrina() { this.vitrinaOpen = !this.vitrinaOpen; }

  update(dt: number, player: THREE.Vector3, talkingTo: NpcInst | null) {
    // tablero
    if (this.boardAnim.t < 1) {
      this.boardAnim.t = Math.min(1, this.boardAnim.t + dt / 1.5);
      const e = 1 - Math.pow(1 - this.boardAnim.t, 3);
      this.drawBoard(e);
    }
    // palanca
    const want = this.lm.active === 'propuesto' ? -0.6 : 0.6;
    this.leverAngle += (want - this.leverAngle) * Math.min(1, dt * 6);
    if (this.lever) this.lever.rotation.z = this.leverAngle;
    // vitrina
    if (this.vitrinaShade) {
      const target = this.vitrinaOpen ? 0.12 : 1;
      this.vitrinaK += (target - this.vitrinaK) * Math.min(1, dt * 1.5);
      this.vitrinaShade.scale.y = this.vitrinaK;
    }
    // NPCs
    let moved = false;
    for (const n of this.npcs) {
      const dx = n.tx - n.x, dz = n.tz - n.z;
      const dist = Math.hypot(dx, dz);
      let pose: 'idle' | 'walk' | 'talk' = 'idle';
      if (dist > 0.05) {
        const step = Math.min(dist, dt * 2.2);
        n.x += (dx / dist) * step; n.z += (dz / dist) * step;
        n.ry = Math.atan2(dx, dz);
        pose = 'walk'; moved = true;
      } else {
        const pd = Math.hypot(player.x - n.x, player.z - n.z);
        const look = pd < 4 ? Math.atan2(player.x - n.x, player.z - n.z) : n.baseRot;
        let d = look - n.ry; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        n.ry += d * Math.min(1, dt * 5);
        if (talkingTo === n) pose = 'talk';
      }
      n.ch.root.position.set(n.x, 0, n.z);
      n.ch.root.rotation.y = n.ry;
      n.ch.animate(dt, pose, 2.2);
    }
    if (moved) this.updateNpcColliders();
  }

  // ---------------------------------------------------------------- mobiliario
  private buildFurniture() {
    const d = this.d, M = this.M, g = new THREE.Group();
    const add = (m: THREE.Mesh, collide = true) => { g.add(m); if (collide) { const p = m.position; const gg = m.geometry as THREE.BoxGeometry; const pr = gg.parameters; if (pr) this.col.addStatic(rectAABB(p.x, p.z, pr.width, pr.depth, pr.height)); } };
    const rec = zonaById(d, 'recepcion');
    if (rec) {
      add(boxB(2.4, 1.05, 0.7, M.cafe, rec.x + 1.6, 0, rec.z + 1.2));
      add(boxB(2.5, 0.05, 0.8, M.white, rec.x + 1.6, 1.05, rec.z + 1.2), false);
      g.add(box(0.5, 0.32, 0.03, M.screen, rec.x + 1.6, 1.3, rec.z + 1.35));
    }
    const of = zonaById(d, 'oficinas');
    if (of) {
      const tz = of.z + 1.5;
      add(boxB(5.5, 0.75, 1.5, M.wood, of.x + 2, 0, tz));
      for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) add(boxB(0.45, 0.48, 0.45, M.dark, of.x + 2 - 2.2 + i * 1.1, 0, tz + sz * 1.1), false);
      // escritorios
      for (let i = 0; i < 4; i++) {
        const x = of.x - of.w / 2 + 2 + i * 2.2, z = of.z - of.d / 2 + 2.2;
        if (x > of.x - 2) break;
        add(boxB(1.4, 0.75, 0.7, M.white, x, 0, z));
        g.add(box(0.5, 0.3, 0.03, M.screen, x, 0.95, z - 0.2));
      }
    }
    const co = zonaById(d, 'comedor');
    if (co) for (let i = 0; i < 3; i++) {
      const z = co.z - 2.6 + i * 2.6;
      add(boxB(2.6, 0.75, 1.0, M.white, co.x - 0.4, 0, z));
      for (const sz of [-1, 1]) add(boxB(2.4, 0.45, 0.35, M.cafe, co.x - 0.4, 0, z + sz * 0.75), false);
    }
    const lo = zonaById(d, 'lockers');
    if (lo) for (let i = 0; i < 2; i++) {
      add(boxB(lo.w - 1.6, 1.9, 0.45, M.std('#5d6d7e', 0.5, 0.4), lo.x + 0.4, 0, lo.z - lo.d / 2 + 0.8 + i * (lo.d - 1.4)));
    }
    const ba = zonaById(d, 'banos');
    if (ba) for (let i = 0; i < 4; i++) add(boxB(0.05, 2.0, 1.4, M.topo, ba.x - ba.w / 2 + 1.4 + i * 1.3, 0, ba.z - ba.d / 2 + 1.0));
    bake(g);
    this.group.add(g);
  }
}
