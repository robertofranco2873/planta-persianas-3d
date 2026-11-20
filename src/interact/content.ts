import type { GameData, Interactuable, Npc, TipoMaquina } from '../data';
import { fmtMoney, fmtNum } from '../data';
import type { LayoutManager, MachineInst } from '../layout/layoutManager';
import { groupedBars, hbars, lineChart, stackBar, COLORS } from './charts';

export type Cat = 'maquinas' | 'kpis' | 'personas' | 'seguridad' | 'empresa';
export const CAT_LABEL: Record<Cat, string> = { maquinas: 'Máquinas', kpis: 'KPIs', personas: 'Personas', seguridad: 'Seguridad', empresa: 'Empresa' };

const CAT_BY_ID: Record<string, Cat> = {
  vitrina_producto: 'empresa', placa_equipo: 'empresa', mapa_ubicacion: 'empresa', justificacion: 'empresa', almacenes_info: 'empresa', rack_iot: 'empresa',
  terminal_finanzas: 'kpis', sala_juntas: 'kpis', tablero_produccion: 'kpis', tablero_balanceo: 'kpis', pantalla_simulacion: 'kpis', tablero_rh: 'kpis', dron_flujos: 'kpis',
  estacion_ehs: 'seguridad', punto_reunion: 'seguridad', area_residuos: 'seguridad',
};
export function catOfInteractuable(it: Interactuable): Cat {
  return CAT_BY_ID[it.id] ?? (it.tipo === 'tablero_kpi' || it.tipo === 'pantalla' ? 'kpis' : it.tipo === 'estacion' || it.tipo === 'senal' ? 'seguridad' : 'empresa');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const list = (arr: string[]) => `<ul>${arr.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
const header = (cat: string, title: string) => `<header><div class="cat">${esc(cat)}</div><h2>${esc(title)}</h2></header>`;
const todo = (msg: string) => `<p class="todo">⚠ Pendiente: ${esc(msg)} (ver TODO.md)</p>`;
const money = (s: string) => { const m = /\$?\s*([\d.,]+)\s*M/.exec(s); return m ? parseFloat(m[1].replace(',', '')) : NaN; };

export function machineHtml(d: GameData, lm: LayoutManager, inst: MachineInst, extra?: Interactuable) {
  const td: TipoMaquina = inst.td;
  const cnt = lm.countTipo(inst.tipo);
  const layoutName = lm.layout.nombre;
  let h = header('Máquina · ' + td.nombre, inst.nombre);
  h += '<div class="body">';
  if (inst.soloB) h += `<p><span class="tag" style="background:#2E75B6">Sólo en escenario B</span></p>`;
  h += `<p>${esc(td.descripcion)}</p>`;
  h += `<p><span class="tag">${esc(layoutName)}: ${cnt.base} instalada${cnt.base === 1 ? '' : 's'}${cnt.b ? ` (+${cnt.b} en escenario B)` : ''}</span>`;
  if (td.cuello_botella) h += `<span class="tag red">Cuello de botella</span>`;
  if (!inst.on) h += `<span class="tag yel">Holgura (fuera de operación)</span>`;
  h += '</p>';
  if (td.specs) {
    h += '<h4>Especificaciones</h4><table>';
    for (const [k, v] of Object.entries(td.specs)) h += `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`;
    h += '</table>';
  }
  if (td.most) {
    h += '<h4>Tiempos MOST</h4>';
    const m = td.most;
    if (m.manual_s != null && m.maquina_s != null) {
      h += stackBar([{ label: `Manual (${m.manual_s} s)`, value: m.manual_s, color: COLORS.a }, { label: `Máquina (${m.maquina_s} s)`, value: m.maquina_s, color: '#5d9bd5' }]);
    }
    h += '<table>';
    if (m.ciclo_s != null) h += `<tr><td>Ciclo</td><td>${m.ciclo_s} s</td></tr>`;
    if (m.espera_operador) h += `<tr><td>Espera del operador</td><td><b>${esc(m.espera_operador)}</b> del ciclo</td></tr>`;
    if (m.nota) h += `<tr><td>Nota</td><td>${esc(m.nota)}</td></tr>`;
    h += '</table>';
  }
  if (td.riesgos?.length) h += `<h4>Riesgos</h4>${td.riesgos.map((r) => `<span class="tag red">${esc(r)}</span>`).join('')}`;
  if (td.epp?.length) h += `<h4>EPP</h4>${td.epp.map((r) => `<span class="tag yel">${esc(r)}</span>`).join('')}`;
  if (td.residuos) h += `<h4>Residuos</h4><p>${esc(td.residuos)}</p>`;
  if (td.mejora_etapa3) h += `<h4>Mejora Etapa 3</h4><p>${esc(td.mejora_etapa3)}</p>`;
  if (extra) h += `<h4>${esc(extra.titulo)}</h4>${list(extra.contenido)}`;
  h += '<p class="hint">E para cerrar</p></div>';
  return h;
}

export function npcHtml(n: Npc, idx: number) {
  let h = header('Persona', n.nombre);
  h += `<div class="body"><p class="dialog">${esc(n.dialogo[idx])}</p>`;
  h += `<p class="hint">${idx + 1} / ${n.dialogo.length} · ${idx + 1 < n.dialogo.length ? 'E para continuar' : 'E para terminar'}</p></div>`;
  return h;
}

export function interactuableHtml(d: GameData, lm: LayoutManager, it: Interactuable, kpiOverride?: Record<string, number>) {
  const cat = catOfInteractuable(it);
  let h = header({ maquinas: 'Máquina', kpis: 'Indicadores', personas: 'Persona', seguridad: 'Seguridad', empresa: 'Empresa' }[cat], it.titulo);
  h += '<div class="body">';
  if (it.id !== 'tablero_produccion') h += list(it.contenido);
  const K = d.kpis;
  switch (it.id) {
    case 'tablero_produccion': {
      const L = lm.layout, k = L.kpis;
      h += `<p><span class="tag yel">${esc(L.nombre)}</span></p><p>${esc(L.descripcion)}</p><table>`;
      const rows: [string, string][] = [
        ['Capacidad', `${fmtNum(kpiOverride?.capacidad_dia ?? k.capacidad_dia)} persianas/día`],
        ['Takt', `${k.takt_s} s`], ['Turnos', String(k.turnos)],
        ['Operadores por turno', String(k.operadores_por_turno)],
        ['Recorrido por persiana', `${k.recorrido_por_persiana_m} m`],
        ['Traslado más largo', `${k.traslado_mas_largo_m} m`],
        ['Productividad', `${k.productividad_persianas_operador_dia} persianas/operador/día`],
        ['Cobertura de demanda (500)', k.cobertura_demanda_500],
      ];
      for (const [a, b] of rows) h += `<tr><td>${a}</td><td><b>${esc(b)}</b></td></tr>`;
      h += '</table>';
      const A = d.layouts.actual.kpis, P = d.layouts.propuesto.kpis;
      h += '<h4>Actual vs propuesto</h4>';
      h += groupedBars(['Capacidad/día', 'Recorrido (m)', 'Traslado máx. (m)', 'Operadores/turno'], [
        { name: 'Actual', color: COLORS.d, values: [A.capacidad_dia, A.recorrido_por_persiana_m, A.traslado_mas_largo_m, A.operadores_por_turno] },
        { name: 'Propuesto', color: COLORS.a, values: [P.capacidad_dia, P.recorrido_por_persiana_m, P.traslado_mas_largo_m, P.operadores_por_turno] },
      ]);
      const eb = d.layouts.propuesto.escenario_b;
      if (eb && lm.active === 'propuesto') {
        h += '<h4>Escenario B (tecla B)</h4><table>';
        for (const [kk, v] of Object.entries(eb)) h += `<tr><td>${esc(kk.replace(/_/g, ' '))}</td><td>${v}</td></tr>`;
        h += '</table>';
      }
      h += `<p class="hint">${esc(it.contenido[0])}</p><p class="hint">Palanca o tecla L: cambiar de layout.</p>`;
      break;
    }
    case 'terminal_finanzas': {
      const g = K.finanzas.grupos;
      h += '<h4>Inversión por grupo</h4>';
      h += hbars(Object.entries(g).map(([k, v]) => ({ label: k, value: v as number, text: fmtMoney(v as number) })));
      h += `<table><tr><td>Inversión inicial</td><td>${fmtMoney(K.finanzas.inversion_inicial)}</td></tr><tr><td>Ventas año 1</td><td>${fmtMoney(K.finanzas.ventas_ano1)}</td></tr><tr><td>TIR</td><td>${esc(K.finanzas.tir)}</td></tr><tr><td>Payback</td><td>${esc(K.finanzas.payback)}</td></tr></table>`;
      h += '<h4>Flujo acumulado</h4>' + todo('los JSON no traen la serie anual de flujo de efectivo para graficar el flujo acumulado');
      break;
    }
    case 'sala_juntas': {
      const a = K.etapa3.escenario_a, b = K.etapa3.escenario_b;
      h += '<h4>Comparativo escenario A vs B</h4>';
      h += groupedBars(['Inversión ($M)', 'Beneficio/mes ($M)', 'VPN 36 m ($M)', 'Capacidad/día'], [
        { name: 'A · ' + a.nombre.split(' ').slice(0, 2).join(' '), color: COLORS.a, values: [money(a.inversion), money(a.beneficio_mensual), money(a.vpn_36m), a.capacidad] },
        { name: 'B · ' + b.nombre.split(' ').slice(0, 2).join(' '), color: COLORS.b, values: [money(b.inversion), money(b.beneficio_mensual), money(b.vpn_36m), b.capacidad] },
      ]);
      h += '<table><tr><td></td><td><b>A</b></td><td><b>B</b></td></tr>';
      for (const k of ['nombre', 'recuperacion', 'roi_12m', 'costo_turno']) h += `<tr><td>${k.replace(/_/g, ' ')}</td><td>${esc(String(a[k]))}</td><td>${esc(String(b[k]))}</td></tr>`;
      h += '</table>';
      break;
    }
    case 'tablero_balanceo': {
      const items = Object.entries(d.maquinas).filter(([, t]) => t.most?.ciclo_s).map(([, t]) => ({ label: t.nombre.replace(/\s*\(.*\)/, '').slice(0, 22), value: t.most!.ciclo_s!, text: `${t.most!.ciclo_s} s`, color: t.cuello_botella ? COLORS.c : COLORS.a }));
      h += '<h4>Tiempo de ciclo MOST por operación vs takt</h4>';
      h += hbars(items, { ref: { value: Number(K.generales.takt_s), label: `takt ${K.generales.takt_s} s` } });
      h += '<table>';
      for (const k of ['oee', 'eficiencia_balanceo', 'cuello_botella', 'capacidad_real_mes']) h += `<tr><td>${k.replace(/_/g, ' ')}</td><td>${esc(String(K.generales[k]))}</td></tr>`;
      h += '</table>';
      h += todo('la utilización (%) por operación no viene en los JSON; se grafica el ciclo MOST de cada equipo (varias máquinas en paralelo)');
      break;
    }
    case 'pantalla_simulacion': {
      const s = K.simulacion;
      h += '<h4>Salida por turno</h4>' + hbars([{ label: 'Siemens', value: s.siemens.salida_turno, color: COLORS.b }, { label: 'FlexSim', value: s.flexsim.salida_turno, color: COLORS.a }]);
      h += `<p>${esc(s.conclusion)}</p>`;
      break;
    }
    case 'tablero_rh': {
      h += '<h4>Curva de arranque (% de producción por semana)</h4>';
      h += lineChart(K.curva_arranque.map((r) => [r[0], r[1]] as [number, number]), { yMax: 100, xLabel: 'Semana', fmtY: (v) => v + '%' });
      h += '<table><tr><td>Semana</td><td>Persianas/semana</td></tr>' + K.curva_arranque.map((r) => `<tr><td>${r[0]}</td><td>${fmtNum(r[2])}</td></tr>`).join('') + '</table>';
      h += '<table>' + ['personal_total', 'directos', 'indirectos', 'turno'].map((k) => `<tr><td>${k.replace(/_/g, ' ')}</td><td>${esc(String(K.generales[k]))}</td></tr>`).join('') + '</table>';
      break;
    }
    case 'mapa_ubicacion': {
      // ponderación municipal / estatal tomada del propio contenido
      for (const line of it.contenido.slice(0, 2)) {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (!m) continue;
        const items = m[2].split('·').map((p) => p.trim().replace(/\.$/, '')).map((p) => { const mm = p.match(/^(.*?)\s+([\d.]+)$/); return mm ? { label: mm[1], value: parseFloat(mm[2]) } : null; }).filter(Boolean) as { label: string; value: number }[];
        if (items.length) h += `<h4>${esc(m[1])}</h4>` + hbars(items.map((x, i) => ({ ...x, text: x.value.toFixed(2), color: i === 0 ? COLORS.a : COLORS.d })));
      }
      h += `<p class="hint">${esc(d.planta.empresa.ubicacion)}</p>`;
      break;
    }
    case 'area_residuos': {
      const m = it.contenido[0].match(/:\s*(.*)\.$/);
      if (m) {
        const tipos = m[1].split(/,\s*|\s+y\s+/);
        const cols = RESIDUO_COLORS;
        h += '<h4>Contenedores</h4>' + tipos.map((t, i) => `<span class="tag" style="background:${cols[i % cols.length]};color:${i === 6 ? '#111' : '#fff'}">${esc(t)}</span>`).join('');
      }
      break;
    }
    case 'vitrina_producto':
      h += `<p class="hint">${esc(d.planta.empresa.producto)}</p>`;
      break;
  }
  if (it.interaccion && it.id !== 'tablero_produccion') h += `<p class="hint">${esc(it.interaccion)}</p>`;
  h += '<p class="hint">E para cerrar</p></div>';
  return h;
}

export const RESIDUO_COLORS = ['#7f8c8d', '#8e44ad', '#f39c12', '#a0522d', '#2E75B6', '#C0392B', '#d5d8dc'];
