import * as THREE from 'three';

export const PAL = {
  cafe: '#6B5545', topo: '#9F938C', carbon: '#2C2E31', blanco: '#F8F8F8', amarillo: '#F1C40F', rojo: '#C0392B',
};

export interface Textures {
  concrete: THREE.Texture; concreteN?: THREE.Texture;
  asphalt: THREE.Texture;
  wall: THREE.Texture; wallN?: THREE.Texture;
  metal: THREE.Texture;
  hazard: THREE.Texture;
  arrow: THREE.Texture;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}
export function canvasTex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noiseTex(base: string, spread: number, size = 256) {
  const [c, g] = canvas(size, size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size / 6; i++) {
    const v = (Math.random() - 0.5) * spread;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  return canvasTex(c, true, true);
}
function ribTex() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, '#aeb2b7'); gr.addColorStop(0.3, '#e1e3e6'); gr.addColorStop(0.6, '#c3c6ca'); gr.addColorStop(1, '#a5a9ae');
    g.fillStyle = gr; g.fillRect(x, 0, 32, 128);
  }
  return canvasTex(c, true, true);
}

async function load(loader: THREE.TextureLoader, url: string, srgb: boolean): Promise<THREE.Texture | undefined> {
  try {
    const t = await loader.loadAsync(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  } catch {
    return undefined;
  }
}

export async function loadTextures(onProgress: (f: number, msg: string) => void): Promise<Textures> {
  const L = new THREE.TextureLoader();
  const list: [keyof Textures, string, boolean][] = [
    ['concrete', 'concrete_diff', true], ['concreteN', 'concrete_nor', false],
    ['asphalt', 'asphalt_diff', true],
    ['wall', 'wall_diff', true], ['wallN', 'wall_nor', false],
    ['metal', 'metal_diff', true],
  ];
  const res: Partial<Textures> = {};
  let n = 0;
  await Promise.all(list.map(async ([k, f, s]) => {
    (res as any)[k] = await load(L, `./assets/tex/${f}.jpg`, s);
    n++;
    onProgress(n / list.length, `Texturas: ${f}`);
  }));
  // concreto pulido gris claro y lámina gris clara a partir de las fotos CC0
  if (res.concrete) res.concrete = remap(res.concrete, 0.6, 0.82, [1, 0.99, 0.97]);
  if (res.wall) res.wall = remap(res.wall, 0.62, 0.9, [0.97, 0.98, 1]);
  // respaldos procedurales si no hay red / archivo
  res.concrete ??= noiseTex('#9a9a98', 0.08);
  res.asphalt ??= noiseTex('#3b3d40', 0.12);
  res.wall ??= ribTex();
  res.metal ??= noiseTex('#a7adb3', 0.05);
  res.hazard = hazardTex();
  res.arrow = arrowTex();
  return res as Textures;
}

/** Escala de grises normalizada a [lo, hi] (conserva el detalle de la foto). */
function remap(t: THREE.Texture, lo: number, hi: number, tint: [number, number, number]) {
  const img = t.image as HTMLImageElement;
  const [c, g] = canvas(img.width, img.height);
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let mn = 255, mx = 0;
  for (let i = 0; i < px.length; i += 16) { const l = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; if (l < mn) mn = l; if (l > mx) mx = l; }
  const span = Math.max(1, mx - mn);
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 - mn) / span;
    const v = (lo + l * (hi - lo)) * 255;
    px[i] = v * tint[0]; px[i + 1] = v * tint[1]; px[i + 2] = v * tint[2];
  }
  g.putImageData(d, 0, 0);
  const out = canvasTex(c, true, true);
  out.anisotropy = 8;
  t.dispose();
  return out;
}

function hazardTex() {
  const [c, g] = canvas(128, 32);
  g.fillStyle = PAL.amarillo; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#1a1a1a';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill();
  }
  return canvasTex(c, true, true);
}
function arrowTex() {
  const [c, g] = canvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 22, 128, 20);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(40, 6); g.lineTo(88, 32); g.lineTo(40, 58); g.lineTo(52, 32); g.fill();
  return canvasTex(c, true, true);
}

/** Materiales compartidos (se crean una sola vez). */
export function makeMaterials(T: Textures) {
  const std = (color: string, rough = 0.7, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const brushed = T.metal;
  return {
    floor: new THREE.MeshStandardMaterial({ map: T.concrete, normalMap: T.concreteN, color: '#ffffff', roughness: 0.55, metalness: 0.0, normalScale: new THREE.Vector2(0.4, 0.4) }),
    asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt, color: '#8a8a8a', roughness: 0.95 }),
    apron: new THREE.MeshStandardMaterial({ map: T.concrete, color: '#a9a6a0', roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ map: T.wall, normalMap: T.wallN, color: '#ffffff', roughness: 0.5, metalness: 0.35 }),
    wallBase: std('#a3a09a', 0.9),
    roof: new THREE.MeshStandardMaterial({ map: T.wall, color: '#b8bcc0', roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    officeWall: std(PAL.blanco, 0.85),
    officeFloor: std('#d8d2c8', 0.6),
    officeRoof: std('#e9e7e2', 0.9),
    grass: std('#6f7f4a', 1),
    metal: std('#c3c8cd', 0.35, 0.75),
    brushed: new THREE.MeshStandardMaterial({ map: brushed, color: '#d0d4d8', roughness: 0.35, metalness: 0.7 }),
    steel: std('#7d858c', 0.45, 0.6),
    dark: std(PAL.carbon, 0.6, 0.3),
    black: std('#151617', 0.7),
    rubber: std('#1e1f20', 0.9),
    yellow: std(PAL.amarillo, 0.5, 0.1),
    red: std(PAL.rojo, 0.5, 0.1),
    orange: std('#D35400', 0.55, 0.2),
    blue: std('#2E75B6', 0.5, 0.2),
    green: std('#1E8449', 0.6),
    cafe: std(PAL.cafe, 0.7),
    topo: std(PAL.topo, 0.7),
    white: std(PAL.blanco, 0.6),
    wood: std('#b08850', 0.85),
    cardboard: std('#b98f5a', 0.9),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }),
    glow: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.6 }),
    glowBlue: new THREE.MeshStandardMaterial({ color: '#bfe6ff', emissive: '#bfe6ff', emissiveIntensity: 0.9 }),
    screen: new THREE.MeshStandardMaterial({ color: '#0d1b2a', emissive: '#1d3d5c', emissiveIntensity: 0.6, roughness: 0.2 }),
    ledG: new THREE.MeshStandardMaterial({ color: '#22ff66', emissive: '#22ff66', emissiveIntensity: 2 }),
    ledR: new THREE.MeshStandardMaterial({ color: '#ff3322', emissive: '#ff3322', emissiveIntensity: 2 }),
    ledOff: std('#333', 0.5),
    hazard: new THREE.MeshStandardMaterial({ map: T.hazard, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
    paintYellow: new THREE.MeshStandardMaterial({ color: PAL.amarillo, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
    paintGreen: new THREE.MeshStandardMaterial({ color: '#2E9E5B', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }),
    paintWhite: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
    fabric: std('#e8e2d6', 0.95, 0, { side: THREE.DoubleSide }),
    fabric2: std('#cfc6b6', 0.95),
    fabric3: std('#9d958b', 0.95),
    std,
  };
}
export type Mats = ReturnType<typeof makeMaterials>;

/** Textura de texto para letreros (sprites o planos). */
export function textCanvas(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: number; border?: string; title?: boolean } = {}) {
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const [c, g] = canvas(w, h);
  g.fillStyle = opts.bg ?? 'rgba(44,46,49,0.92)';
  roundRect(g, 2, 2, w - 4, h - 4, 14); g.fill();
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 4; roundRect(g, 3, 3, w - 6, h - 6, 14); g.stroke(); }
  g.fillStyle = opts.fg ?? PAL.blanco;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = opts.font ?? Math.min(48, (h * 0.7) / lines.length);
  lines.forEach((l, i) => {
    g.font = `${i === 0 && opts.title !== false ? '700' : '400'} ${i === 0 ? fs : fs * 0.8}px Inter, sans-serif`;
    g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.15, w - 20);
  });
  return c;
}
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function textSprite(lines: string[], worldW: number, opts: Parameters<typeof textCanvas>[1] = {}) {
  const c = textCanvas(lines, opts);
  const mat = new THREE.SpriteMaterial({ map: canvasTex(c), depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(worldW, worldW * c.height / c.width, 1);
  s.renderOrder = 10;
  return s;
}

/** Señalética NOM-026-STPS en canvas. */
export type SignKind = 'obligatoria' | 'precaucion' | 'emergencia' | 'prohibicion';
export function signTexture(kind: SignKind, text: string, symbol: string) {
  const [c, g] = canvas(256, 320);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 316);
  const cx = 128, cy = 118;
  if (kind === 'obligatoria') {
    g.fillStyle = '#1F5FA8'; g.beginPath(); g.arc(cx, cy, 92, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
  } else if (kind === 'precaucion') {
    g.fillStyle = '#F1C40F'; g.strokeStyle = '#111'; g.lineWidth = 12;
    g.beginPath(); g.moveTo(cx, 22); g.lineTo(cx + 104, 206); g.lineTo(cx - 104, 206); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#111';
  } else if (kind === 'emergencia') {
    g.fillStyle = '#1E8449'; g.fillRect(14, 24, 228, 190);
    g.fillStyle = '#fff';
  } else {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 92, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#C0392B'; g.lineWidth = 18; g.beginPath(); g.arc(cx, cy, 84, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#111';
  }
  g.font = '700 84px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(symbol, cx, kind === 'precaucion' ? cy + 26 : cy);
  if (kind === 'prohibicion') {
    g.strokeStyle = '#C0392B'; g.lineWidth = 18; g.beginPath(); g.moveTo(cx - 60, cy - 60); g.lineTo(cx + 60, cy + 60); g.stroke();
  }
  g.fillStyle = '#111'; g.font = '700 26px Inter, sans-serif';
  const words = text.split(' ');
  const lines: string[] = []; let cur = '';
  for (const w of words) { if (g.measureText(cur + ' ' + w).width > 230) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  lines.push(cur.trim());
  lines.forEach((l, i) => g.fillText(l, cx, 250 + i * 30));
  return canvasTex(c);
}
