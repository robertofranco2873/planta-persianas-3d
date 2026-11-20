import type { GameData } from '../data';
import type { LayoutManager } from '../layout/layoutManager';
import type { Props } from '../interact/props';
import type { Discoveries } from '../interact/discoveries';

const ZONE_COL: Record<string, string> = {
  pasillo_montacargas: 'rgba(241,196,15,0.25)', produccion: 'rgba(159,147,140,0.18)', almacen: 'rgba(211,84,0,0.25)',
  residuos: 'rgba(120,120,120,0.35)', servicio: 'rgba(46,117,182,0.22)', oficina: 'rgba(248,248,248,0.25)', exterior: 'rgba(70,72,76,0.6)',
};

export function drawMap(cv: HTMLCanvasElement, d: GameData, lm: LayoutManager, props: Props, disc: Discoveries,
  player: { x: number; z: number; facing: number }, cam: { x: number; z: number }, big: boolean) {
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const x0 = -7, x1 = 88, z0 = -4, z1 = 53;
  const pad = big ? 30 : 6;
  const s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0));
  const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
  const X = (x: number) => ox + (x - x0) * s, Z = (z: number) => oz + (z - z0) * s;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#3d4a35'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#7d7a74'; g.fillRect(X(-6), Z(-2), (d.planta.sitio.ancho_x + 6) * s, (d.planta.sitio.largo_z + 2) * s);
  const zones = [...d.planta.zonas].sort((a, b) => (a.tipo === 'exterior' ? -1 : 0) - (b.tipo === 'exterior' ? -1 : 0));
  for (const z of zones) {
    g.fillStyle = ZONE_COL[z.tipo] ?? 'rgba(255,255,255,0.1)';
    g.fillRect(X(z.x - z.w / 2), Z(z.z - z.d / 2), z.w * s, z.d * s);
  }
  const n = d.planta.nave;
  g.strokeStyle = '#F8F8F8'; g.lineWidth = big ? 3 : 1.5;
  g.strokeRect(X(n.x - n.w / 2), Z(n.z - n.d / 2), n.w * s, n.d * s);
  // máquinas
  for (const m of lm.machines.values()) {
    if (m.cur.s < 0.05) continue;
    g.save();
    g.translate(X(m.cur.x), Z(m.cur.z));
    g.rotate(m.cur.rot * Math.PI / 180);
    const w = m.model.L * s * m.cur.s, h = m.model.W * s * m.cur.s;
    if (m.soloB) { g.setLineDash([3, 2]); g.strokeStyle = '#8fc1ff'; g.lineWidth = 1; g.strokeRect(-w / 2, -h / 2, w, h); g.setLineDash([]); }
    else { g.fillStyle = m.td.color; g.fillRect(-w / 2, -h / 2, w, h); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.5; g.strokeRect(-w / 2, -h / 2, w, h); }
    g.restore();
  }
  // flujos
  if (lm.showFlows) {
    for (const f of lm.layout.flujos) {
      g.strokeStyle = f.color; g.lineWidth = big ? 3 : 1.5; g.beginPath();
      f.puntos.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.stroke();
    }
  }
  // NPCs
  for (const npc of props.npcs) {
    g.fillStyle = '#F8F8F8'; g.beginPath(); g.arc(X(npc.x), Z(npc.z), big ? 4 : 2, 0, Math.PI * 2); g.fill();
  }
  // no descubiertos
  const seen = new Set<string>();
  for (const t of props.targets) {
    if (t.kind === 'lever' || disc.has(t.key)) continue;
    const p = t.pos();
    const k = t.key + Math.round(p.x) + ',' + Math.round(p.z);
    if (seen.has(k)) continue; seen.add(k);
    g.fillStyle = '#F1C40F'; g.strokeStyle = '#2C2E31'; g.lineWidth = 1;
    g.beginPath(); g.arc(X(p.x), Z(p.z), big ? 5 : 2.4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (big) {
    g.font = '600 12px Inter, sans-serif'; g.fillStyle = 'rgba(248,248,248,0.9)'; g.textAlign = 'center';
    for (const z of d.planta.zonas) if (z.w * s > 60) g.fillText(z.nombre, X(z.x), Z(z.z) + 4, z.w * s);
    g.textAlign = 'left'; g.font = '400 28px Anton, sans-serif'; g.fillStyle = '#F1C40F';
    g.fillText(lm.layout.nombre + (lm.showB && lm.active === 'propuesto' ? ' · escenario B' : ''), 16, 34);
    g.font = '400 12px Inter'; g.fillStyle = '#ddd';
    g.fillText('● amarillo: por descubrir   ● blanco: personas   ▲ tú', 16, H - 12);
  }
  // cámara (cono) y jugador
  const px = X(player.x), pz = Z(player.z);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  const ca = Math.atan2(player.x - cam.x, player.z - cam.z);
  g.beginPath(); g.moveTo(px, pz); g.arc(px, pz, big ? 60 : 22, Math.PI / 2 - ca - 0.5, Math.PI / 2 - ca + 0.5); g.closePath(); g.fill();
  g.save(); g.translate(px, pz); g.rotate(-player.facing + Math.PI);
  const r = big ? 9 : 5;
  g.fillStyle = '#C0392B'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -r * 1.3); g.lineTo(r, r); g.lineTo(0, r * 0.4); g.lineTo(-r, r); g.closePath(); g.fill(); g.stroke();
  g.restore();
  if (!big) { g.font = '600 10px Inter'; g.fillStyle = '#F1C40F'; g.fillText(lm.layout.nombre, 6, 13); }
}
