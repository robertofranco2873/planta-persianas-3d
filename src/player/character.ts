import * as THREE from 'three';
import { bake } from '../util/geo';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const G = (key: string, f: () => THREE.BufferGeometry) => { let g = geoCache.get(key); if (!g) { g = f(); geoCache.set(key, g); } return g; };
const Mt = (color: string, rough = 0.75, metal = 0, emissive?: string) => {
  const k = `${color}|${rough}|${metal}|${emissive}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.35 : 0 }); matCache.set(k, m); }
  return m;
};
const bx = (w: number, h: number, d: number) => G(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));

export interface CharacterOpts { vest?: string | null; overall?: string; helmet?: string | null; skin?: string; shirt?: string; simple?: boolean }

export type Pose = 'idle' | 'walk' | 'run' | 'work' | 'talk';

export class Character {
  root = new THREE.Group();
  private legL = new THREE.Group(); private legR = new THREE.Group();
  private kneeL = new THREE.Group(); private kneeR = new THREE.Group();
  private armL = new THREE.Group(); private armR = new THREE.Group();
  private elbL = new THREE.Group(); private elbR = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private vestGroup = new THREE.Group();
  private helmetGroup = new THREE.Group();
  private capGroup = new THREE.Group();
  phase = Math.random() * 10;
  /** oscilación vertical actual del cuerpo (para la cámara en primera persona) */
  get bob() { return this.body.position.y; }
  private workSeed = Math.random() * 10;

  constructor(o: CharacterOpts = {}) {
    const overall = Mt(o.overall ?? '#34495E');
    const skin = Mt(o.skin ?? '#c99a74', 0.8);
    const boot = Mt('#1d1b19', 0.9);
    const glove = Mt('#2c2e31', 0.9);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const r = new THREE.Mesh(g, m); r.position.set(x, y, z); r.castShadow = true; return r;
    };
    // piernas
    for (const [leg, knee, sx] of [[this.legL, this.kneeL, -0.1], [this.legR, this.kneeR, 0.1]] as const) {
      leg.position.set(sx, 0.88, 0);
      leg.add(mesh(bx(0.15, 0.44, 0.17), overall, 0, -0.22, 0));
      knee.position.set(0, -0.44, 0);
      knee.add(mesh(bx(0.14, 0.38, 0.15), overall, 0, -0.19, 0));
      knee.add(mesh(bx(0.15, 0.1, 0.27), boot, 0, -0.39, 0.05));
      leg.add(knee);
      this.body.add(leg);
    }
    // torso
    this.body.add(mesh(bx(0.36, 0.2, 0.2), overall, 0, 0.92, 0));
    this.body.add(mesh(bx(0.38, 0.5, 0.21), overall, 0, 1.22, 0));
    // chaleco
    this.vestGroup.add(mesh(bx(0.4, 0.4, 0.235), Mt(o.vest ?? '#F1C40F', 0.6), 0, 1.2, 0));
    const refl = o.simple ? Mt('#f2f2f2', 0.5, 0.5) : Mt('#e8e8e8', 0.3, 0.6, '#ffffff');
    this.vestGroup.add(mesh(bx(0.405, 0.04, 0.24), refl, 0, 1.12, 0));
    this.vestGroup.add(mesh(bx(0.405, 0.04, 0.24), refl, 0, 1.26, 0));
    this.vestGroup.visible = o.vest !== null;
    this.body.add(this.vestGroup);
    // brazos
    for (const [arm, elb, sx] of [[this.armL, this.elbL, -0.245], [this.armR, this.elbR, 0.245]] as const) {
      arm.position.set(sx, 1.43, 0);
      arm.add(mesh(bx(0.11, 0.32, 0.12), overall, 0, -0.16, 0));
      elb.position.set(0, -0.32, 0);
      elb.add(mesh(bx(0.1, 0.27, 0.11), overall, 0, -0.13, 0));
      elb.add(mesh(bx(0.09, 0.09, 0.1), glove, 0, -0.31, 0));
      arm.add(elb);
      this.body.add(arm);
    }
    // cabeza
    this.head.position.set(0, 1.47, 0);
    this.head.add(mesh(bx(0.1, 0.06, 0.1), skin, 0, 0.03, 0));
    const h = mesh(G('head', () => new THREE.SphereGeometry(0.12, 14, 10)), skin, 0, 0.17, 0);
    h.scale.set(1, 1.12, 1);
    this.head.add(h);
    // ojos
    const eye = Mt('#111', 0.4);
    this.head.add(mesh(G('eye', () => new THREE.SphereGeometry(0.016, 6, 4)), eye, -0.045, 0.19, 0.105));
    this.head.add(mesh(G('eye', () => new THREE.SphereGeometry(0.016, 6, 4)), eye, 0.045, 0.19, 0.105));
    // casco
    const hm = Mt(o.helmet ?? '#F1C40F', 0.35, 0.1);
    this.helmetGroup.add(mesh(G('helm', () => new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hm, 0, 0.22, 0));
    this.helmetGroup.add(mesh(G('brim', () => new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16)), hm, 0, 0.225, 0.03));
    this.helmetGroup.add(mesh(bx(0.03, 0.03, 0.27), hm, 0, 0.36, 0));
    this.helmetGroup.visible = o.helmet !== null;
    this.head.add(this.helmetGroup);
    // gorra (cuando no hay casco)
    const cap = Mt('#2C2E31', 0.8);
    this.capGroup.add(mesh(G('cap', () => new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), cap, 0, 0.21, 0));
    this.capGroup.add(mesh(bx(0.18, 0.015, 0.12), cap, 0, 0.215, 0.12));
    this.capGroup.visible = o.helmet === null;
    this.head.add(this.capGroup);
    this.body.add(this.head);
    this.root.add(this.body);
    if (o.simple) {
      // NPCs/operadores: 5 mallas (cuerpo+cabeza+EPP, 2 piernas, 2 brazos)
      if (o.helmet === null) this.helmetGroup.removeFromParent(); else this.capGroup.removeFromParent();
      if (o.vest === null) this.vestGroup.removeFromParent();
      for (const p of [this.legL, this.legR, this.armL, this.armR]) p.userData.dynamic = true;
      bake(this.body);
      for (const p of [this.legL, this.legR, this.armL, this.armR]) bake(p);
      return;
    }
    // fusionar cada articulación en pocas mallas (menos draw calls)
    const pivots = [this.legL, this.legR, this.kneeL, this.kneeR, this.armL, this.armR, this.elbL, this.elbR, this.head, this.vestGroup, this.helmetGroup, this.capGroup];
    pivots.forEach((p) => (p.userData.dynamic = true));
    bake(this.body);
    for (const p of [this.legL, this.legR, this.kneeL, this.kneeR, this.armL, this.armR, this.elbL, this.elbR, this.head, this.capGroup]) bake(p);
    bake(this.vestGroup, true, false);
    bake(this.helmetGroup, true, false);
    this.vestMesh = this.vestGroup.children.find((c) => (c as THREE.Mesh).material !== refl) as THREE.Mesh;
  }
  private vestMesh!: THREE.Mesh;

  setGear(vest: string | null, helmet: string | null) {
    this.vestGroup.visible = !!vest;
    if (vest && this.vestMesh) this.vestMesh.material = Mt(vest, 0.6);
    this.helmetGroup.visible = !!helmet;
    this.capGroup.visible = !helmet;
    if (helmet) this.helmetGroup.children.forEach((c) => ((c as THREE.Mesh).material = Mt(helmet, 0.35, 0.1)));
  }

  /** speed en m/s: controla la cadencia. */
  animate(dt: number, pose: Pose, speed = 0) {
    const t = performance.now() / 1000 + this.workSeed;
    let swing = 0, bob = 0;
    if (pose === 'walk' || pose === 'run') {
      this.phase += dt * (pose === 'run' ? 11 : 7.5) * Math.min(1.3, Math.max(0.5, speed / (pose === 'run' ? 5.5 : 2.2)));
      swing = pose === 'run' ? 0.85 : 0.55;
      bob = Math.abs(Math.sin(this.phase)) * (pose === 'run' ? 0.07 : 0.035);
    } else {
      this.phase = 0;
    }
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.kneeL.rotation.x = Math.max(0, -Math.cos(this.phase)) * swing * 1.2;
    this.kneeR.rotation.x = Math.max(0, Math.cos(this.phase)) * swing * 1.2;
    this.body.position.y = bob;
    this.body.rotation.x = pose === 'run' ? 0.12 : 0;
    if (pose === 'work') {
      const w = Math.sin(t * 2.4);
      this.armL.rotation.x = -0.9 + w * 0.15;
      this.armR.rotation.x = -0.75 - w * 0.2;
      this.elbL.rotation.x = -0.6;
      this.elbR.rotation.x = -0.7 + Math.sin(t * 4.1) * 0.2;
      this.head.rotation.x = 0.35;
      this.head.rotation.y = Math.sin(t * 0.4) * 0.2;
    } else if (pose === 'talk') {
      this.armL.rotation.x = Math.sin(t * 1.3) * 0.1;
      this.armR.rotation.x = -0.4 + Math.sin(t * 3) * 0.25;
      this.elbL.rotation.x = 0;
      this.elbR.rotation.x = -0.6;
      this.head.rotation.x = Math.sin(t * 2) * 0.05;
    } else if (pose === 'idle') {
      this.armL.rotation.x = Math.sin(t * 1.1) * 0.04;
      this.armR.rotation.x = -Math.sin(t * 1.1) * 0.04;
      this.elbL.rotation.x = this.elbR.rotation.x = -0.1;
      this.head.rotation.x = 0;
      this.body.position.y = Math.sin(t * 1.6) * 0.006;
    } else {
      this.armL.rotation.x = -s * swing * 0.9;
      this.armR.rotation.x = s * swing * 0.9;
      this.elbL.rotation.x = this.elbR.rotation.x = pose === 'run' ? -1.1 : -0.25;
      this.head.rotation.x = 0;
      this.head.rotation.y = 0;
    }
  }
}
