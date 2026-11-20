const KEY = 'planta3d.descubrimientos.v1';
const PREF = 'planta3d.prefs.v1';

export class Discoveries {
  set = new Set<string>();
  listeners: (() => void)[] = [];
  constructor() {
    try { const raw = localStorage.getItem(KEY); if (raw) for (const k of JSON.parse(raw)) this.set.add(k); } catch { /* sin localStorage */ }
  }
  has(k: string) { return this.set.has(k); }
  /** Devuelve true si es nuevo. */
  add(k: string) {
    if (this.set.has(k)) return false;
    this.set.add(k);
    this.save();
    this.listeners.forEach((f) => f());
    return true;
  }
  reset() { this.set.clear(); this.save(); this.listeners.forEach((f) => f()); }
  private save() { try { localStorage.setItem(KEY, JSON.stringify([...this.set])); } catch { /* ignorar */ } }
}

/** Calidad por defecto: baja en gráficos integrados (Intel/UHD/Iris, Radeon integrada, Mali…), alta en GPU dedicada. */
function defaultQuality(): 'alta' | 'baja' {
  try {
    if (matchMedia('(pointer: coarse)').matches) return 'baja';
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
    if (/intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics|mali|adreno|swiftshader|llvmpipe/i.test(name)) return 'baja';
  } catch { /* */ }
  return 'alta';
}
export function loadPrefs(): { quality: 'alta' | 'baja'; gear?: boolean; sens?: number } {
  try { const r = localStorage.getItem(PREF); if (r) { const p = JSON.parse(r); return { ...p, quality: p.quality ?? defaultQuality() }; } } catch { /* */ }
  return { quality: defaultQuality() };
}
export function savePrefs(p: object) { try { localStorage.setItem(PREF, JSON.stringify({ ...loadPrefs(), ...p })); } catch { /* */ } }
