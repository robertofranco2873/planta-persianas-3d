// Tipos y carga de los JSON de public/data. Todo el contenido del juego sale de aquí.

export interface Rect { x: number; z: number; w: number; d: number }
export interface Zona extends Rect { id: string; nombre: string; tipo: string; piso?: string }
export interface Planta {
  empresa: { nombre: string; producto: string; ubicacion: string; edificio: string; terreno_total_m2: number };
  sitio: { ancho_x: number; largo_z: number };
  nave: Rect & { altura: number; muros: string };
  zonas: Zona[];
  andenes: { id: string; nombre: string; x: number; z: number; remolque: boolean }[];
  seguridad: {
    extintores: P[]; salidas_emergencia: P[]; puntos_reunion: P[];
    botiquin: P; lavaojos: P; estacion_loto: P; kit_derrames: P;
  };
  decoracion: { arboles: P[]; lamparas_led: string; senaletica: string };
}
export interface P { x: number; z: number }

export interface MaquinaLayout {
  id: string; tipo: string; nombre?: string; x: number; z: number; rot: number;
  largo?: number; en_operacion?: boolean; solo_escenario_b?: boolean;
}
export interface Flujo { material: string; color: string; puntos: [number, number][] }
export interface LayoutKpis {
  capacidad_dia: number; recorrido_por_persiana_m: number; traslado_mas_largo_m: number;
  operadores_por_turno: number; turnos: number; takt_s: number;
  productividad_persianas_operador_dia: number; cobertura_demanda_500: string;
}
export interface Layout {
  id: string; nombre: string; descripcion: string;
  maquinas: MaquinaLayout[]; flujos: Flujo[]; operadores: P[]; kpis: LayoutKpis;
  zona_reordenada?: Rect;
  escenario_b?: Record<string, number>;
}
export interface TipoMaquina {
  nombre: string; dim: [number, number, number]; mtto?: number; color: string; modelo: string;
  descripcion: string; specs?: Record<string, string>;
  most?: { ciclo_s?: number; manual_s?: number; maquina_s?: number; espera_operador?: string; nota?: string };
  riesgos?: string[]; epp?: string[]; residuos?: string; mejora_etapa3?: string;
  cuello_botella?: boolean; animacion?: string;
}
export interface Interactuable {
  id: string; tipo: string; zona?: string; ref?: string; cerca_de?: string; titulo: string;
  contenido: string[]; modelo?: string; interaccion?: string; grafica?: string; fuente?: string;
  dinamico?: boolean; visual?: string; x?: number; z?: number;
}
export interface Npc { id: string; nombre: string; zona: string; cerca_de?: string; dialogo: string[]; x?: number; z?: number }

export interface Kpis {
  generales: Record<string, string | number>;
  simulacion: { siemens: { salida_turno: number; flujo_s: number }; flexsim: { salida_turno: number; flujo_s: number }; conclusion: string };
  finanzas: Record<string, any> & { grupos: Record<string, number> };
  etapa3: any;
  curva_arranque: [number, number, number][];
}

export interface GameData {
  planta: Planta;
  layouts: { actual: Layout; propuesto: Layout };
  maquinas: Record<string, TipoMaquina>;
  kpis: Kpis;
  interactuables: Interactuable[];
  npcs: Npc[];
  recorrido: import('./guide/guide').Recorrido | null;
}

export async function loadData(onProgress: (f: number, msg: string) => void): Promise<GameData> {
  const files = ['planta', 'layout_actual', 'layout_propuesto', 'maquinas', 'kpis', 'interactuables', 'npcs'];
  const out: Record<string, any> = {};
  let done = 0;
  // opcional: recorrido guiado
  const rec = fetch('./data/recorrido.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { out.recorrido = j; });
  await Promise.all(files.map(async (f) => {
    const r = await fetch(`./data/${f}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`No se pudo cargar data/${f}.json`);
    out[f] = await r.json();
    done++;
    onProgress(done / files.length, `Datos: ${f}.json`);
  }));
  await rec;
  const maquinas = { ...out.maquinas };
  delete maquinas._nota;
  return {
    planta: out.planta,
    layouts: { actual: out.layout_actual, propuesto: out.layout_propuesto },
    maquinas,
    kpis: out.kpis,
    interactuables: out.interactuables,
    npcs: out.npcs,
    recorrido: out.recorrido ?? null,
  };
}

export const zonaById = (d: GameData, id?: string) => d.planta.zonas.find((z) => z.id === id);

export const fmtMoney = (n: number) => '$' + n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
export const fmtNum = (n: number, dec = 0) => n.toLocaleString('es-MX', { maximumFractionDigits: dec, minimumFractionDigits: dec });
