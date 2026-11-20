import * as THREE from 'three';
import { loadData, GameData, zonaById, fmtNum } from './data';
import { loadTextures, makeMaterials, Mats } from './world/materials';
import { buildBuilding } from './world/building';
import { buildExterior } from './world/exterior';
import { Collision } from './player/collision';
import { Input } from './player/input';
import { Player } from './player/player';
import { LayoutManager } from './layout/layoutManager';
import { Props, Target, NpcInst } from './interact/props';
import { Discoveries, loadPrefs, savePrefs } from './interact/discoveries';
import { machineHtml, npcHtml, interactuableHtml, catOfInteractuable, Cat, CAT_LABEL } from './interact/content';
import { drawMap } from './ui/minimap';
import { ribbon } from './util/geo';
import { Guide } from './guide/guide';
import { TouchControls, isTouchDevice } from './ui/touch';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

const CONTROLS: [string, string][] = [
  ['W A S D', 'Moverse'], ['Shift', 'Correr'], ['Mouse', 'Orbitar la cámara'], ['Rueda', 'Zoom'],
  ['E', 'Interactuar / ver'], ['G', 'Recorrido guiado: mostrar/ocultar misiones y flecha'], ['P', 'Primera / tercera persona'], ['L', 'Cambiar layout (actual ↔ propuesto)'], ['B', 'Mostrar/ocultar escenario B'],
  ['F', 'Vista de flujos'], ['M', 'Mapa grande'], ['Tab', 'Libreta de descubrimientos'], ['V', 'Modo dron (Espacio/C subir/bajar, T quitar techo)'],
  ['H', 'Ayuda'], ['Esc', 'Menú'],
];
const controlsHtml = () => CONTROLS.map(([k, v]) => `<div>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</div><div>${v}</div>`).join('');

async function main() {
  const canvas = $<HTMLCanvasElement>('c');
  const loadbar = $('loadbar'), loadmsg = $('loadmsg');
  const progress = (f: number, msg: string) => { loadbar.style.width = `${Math.round(f * 100)}%`; loadmsg.textContent = msg; };

  if (isTouchDevice()) document.body.classList.add('touch');
  const prefs = loadPrefs();
  const qs = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: qs.get('aa') === '1', powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

  // ---------------- carga
  progress(0.02, 'Cargando tipografías…');
  await Promise.race([Promise.all([document.fonts.load('400 40px Anton'), document.fonts.load('400 20px Inter'), document.fonts.load('700 20px Inter')]), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  let data: GameData;
  try {
    data = await loadData((f, m) => progress(0.05 + f * 0.25, m));
  } catch (e) {
    loadmsg.textContent = 'Error al cargar datos: ' + (e as Error).message;
    throw e;
  }
  const T = await loadTextures((f, m) => progress(0.3 + f * 0.3, m));
  const M: Mats = makeMaterials(T);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const texs = [T.concrete, T.asphalt, T.wall, T.metal, T.concreteN, T.wallN].filter(Boolean) as THREE.Texture[];
  const setAniso = (a: number) => texs.forEach((t) => { t.anisotropy = Math.min(a, maxAniso); t.needsUpdate = true; });

  progress(0.62, 'Construyendo la nave…'); await nextFrame();
  const col = new Collision();
  const building = buildBuilding(data, M, col);
  scene.add(building.group);
  progress(0.7, 'Exterior, patio y estacionamiento…'); await nextFrame();
  scene.add(buildExterior(data, M, col, scene));
  progress(0.78, 'Máquinas y operadores…'); await nextFrame();
  const lm = new LayoutManager(data, M, T, col);
  scene.add(lm.root);
  progress(0.88, 'Interactuables y personas…'); await nextFrame();
  const props = new Props(data, M, col, lm);
  scene.add(props.group);

  // ---------------- luces
  const hemi = new THREE.HemisphereLight('#e4edf7', '#8a7f72', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3df', 2.4);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.AmbientLight('#ffffff', 0.25);
  scene.add(fill);

  // ---------------- jugador
  const player = new Player(col, camera);
  player.ceiling = (x, z) => building.ceilingAt(x, z);
  scene.add(player.ch.root);
  // afuera, en la banqueta del estacionamiento, mirando hacia la entrada principal (recepción)
  const ent = building.entrance;
  const sx = ent.x + 8, sz = ent.z + 3.4;
  player.spawn(sx, sz, Math.atan2(ent.x - sx, ent.z - sz));
  player.resolve();
  if (prefs.gear) player.ch.setGear('#F1C40F', '#F1C40F');

  const input = new Input(canvas);
  const touch = isTouchDevice();
  input.noLock = touch;
  if (touch) {
    // celular/tableta: menos distancia de dibujado
    camera.far = 320; camera.updateProjectionMatrix();
    if (scene.fog instanceof THREE.Fog) { scene.fog.near = 60; scene.fog.far = 220; }
  }
  const disc = new Discoveries();
  const guide = data.recorrido ? new Guide(data, data.recorrido, props, lm, col, disc, T) : null;

  // ---------------- calidad
  let quality: 'alta' | 'baja' = prefs.quality;
  let dynRatio = 1.5;
  const applyQuality = () => {
    const hi = quality === 'alta';
    dynRatio = Math.min(devicePixelRatio, 1.5);
    renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? dynRatio : 1));
    renderer.shadowMap.enabled = hi;
    renderer.shadowMap.autoUpdate = false;
    sun.castShadow = hi;
    setAniso(Number(qs.get('aniso') ?? (hi ? 4 : 1)));
    scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && 'needsUpdate' in m) m.needsUpdate = true; });
    renderer.setSize(innerWidth, innerHeight, false);
    document.querySelectorAll<HTMLInputElement>('input[name=q]').forEach((r) => (r.checked = r.value === quality));
  };
  applyQuality();
  document.querySelectorAll<HTMLInputElement>('input[name=q]').forEach((r) => r.addEventListener('change', () => { quality = r.value as any; savePrefs({ quality }); applyQuality(); }));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

  // ---------------- libreta: lista de todo lo descubrible
  interface Entry { key: string; title: string; cat: Cat }
  const entries: Entry[] = [];
  const tipos = new Set<string>();
  for (const L of [data.layouts.actual, data.layouts.propuesto]) for (const m of L.maquinas) tipos.add(m.tipo);
  for (const t of tipos) if (data.maquinas[t]) entries.push({ key: 'm:' + t, title: data.maquinas[t].nombre, cat: 'maquinas' });
  for (const it of data.interactuables) entries.push({ key: 'i:' + it.id, title: it.titulo, cat: catOfInteractuable(it) });
  for (const n of data.npcs) entries.push({ key: 'n:' + n.id, title: n.nombre, cat: 'personas' });
  const discCount = () => entries.filter((e) => disc.has(e.key)).length;

  // ---------------- UI
  const hud = $('hud'), hudKeys = $('hudKeys'), promptEl = $('prompt'), toastEl = $('toast'), panel = $('panel');
  const notebook = $('notebook'), help = $('help'), menu = $('menu'), minimap = $<HTMLCanvasElement>('minimap');
  const bigmap = $('bigmap'), bigmapc = $<HTMLCanvasElement>('bigmapc');
  $('controlsList').innerHTML = controlsHtml();
  const TOUCH_HELP: [string, string][] = [
    ['Joystick (izquierda)', 'Caminar; empújalo a fondo para correr'], ['Arrastrar (derecha)', 'Girar la cámara'], ['Pellizcar', 'Zoom'],
    ['Ver', 'Interactuar con lo cercano (o toca el aviso)'], ['Layout · Flujos · Esc. B', 'Comparar layouts, ver flujos y escenario B'],
    ['Guía', 'Mostrar/ocultar misiones y flecha'], ['1ª/3ª', 'Primera o tercera persona'], ['Mapa · Libreta', 'Mapa grande y descubrimientos'],
    ['Dron', 'Cámara aérea (▲▼ subir/bajar, Techo)'], ['☰', 'Menú'],
  ];
  if (touch) $('controlsList').innerHTML = TOUCH_HELP.map(([k, v]) => `<div><kbd>${k}</kbd></div><div>${v}</div>`).join('');
  help.innerHTML = touch ? `<h2>Ayuda · controles táctiles</h2><div class="controls">${$('controlsList').innerHTML}</div><p style="color:#9F938C;margin-top:14px">Toca ? para cerrar.</p>` : `<h2>Ayuda · controles</h2><div class="controls">${controlsHtml()}</div><p style="color:#9F938C;margin-top:14px">Explora libremente: acércate a máquinas, pantallas y personas y presiona <kbd>E</kbd>. Usa la palanca junto al tablero de producción (o <kbd>L</kbd>) para comparar el layout actual con el propuesto. H para cerrar.</p>`;
  let toastTimer = 0;
  const toast = (title: string, sub = '', secs = 2.6) => {
    toastEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    toastEl.classList.remove('hidden');
    toastTimer = secs;
  };
  const hudVals = { cap: 0, ops: 0, rec: 0 };
  const hudTarget = { cap: 0, ops: 0, rec: 0 };
  const setHudTarget = () => { const k = lm.layout.kpis; hudTarget.cap = k.capacidad_dia; hudTarget.ops = k.operadores_por_turno; hudTarget.rec = k.recorrido_por_persiana_m; };
  setHudTarget(); Object.assign(hudVals, hudTarget);
  const renderHud = () => {
    const k = lm.layout.kpis;
    $('hudLayout').textContent = lm.layout.nombre + (lm.active === 'propuesto' && lm.showB ? ' · escenario B' : '');
    $('hudKpis').innerHTML = `<span>Capacidad/día</span> <b>${Math.round(hudVals.cap)}</b> persianas<br><span>Operadores/turno</span> <b>${Math.round(hudVals.ops)}</b> × ${k.turnos} turno${k.turnos > 1 ? 's' : ''}<br><span>Recorrido/persiana</span> <b>${Math.round(hudVals.rec)} m</b>${lm.showFlows ? '<br><span>Flujos:</span> ' + [...new Map(lm.layout.flujos.map((f) => [f.material, f.color])).entries()].map(([m, c]) => `<b style="color:${c === '#2B2C30' ? '#bbb' : c}">■</b> ${m}`).join(' ') : ''}`;
    $('hudDisc').textContent = `${discCount()} / ${entries.length} descubiertos${touch ? '' : ' · Tab libreta'}`;
  };
  disc.listeners.push(renderHud);

  let nbFilter: Cat | 'todos' = 'todos';
  const renderNotebook = () => {
    const cats: (Cat | 'todos')[] = ['todos', 'maquinas', 'kpis', 'personas', 'seguridad', 'empresa'];
    const list = entries.filter((e) => nbFilter === 'todos' || e.cat === nbFilter);
    notebook.innerHTML = `<header><h2>Libreta de descubrimientos</h2><span class="count">${discCount()} / ${entries.length} descubiertos</span>
      <span class="filters">${cats.map((c) => `<button data-c="${c}" class="${c === nbFilter ? 'on' : ''}">${c === 'todos' ? 'Todos' : CAT_LABEL[c]} (${entries.filter((e) => (c === 'todos' || e.cat === c) && disc.has(e.key)).length}/${entries.filter((e) => c === 'todos' || e.cat === c).length})</button>`).join('')}</span></header>
      <div class="list">${list.map((e) => `<div class="item ${disc.has(e.key) ? 'done' : ''}"><span class="box">${disc.has(e.key) ? '✓' : ''}</span><span><span class="t">${disc.has(e.key) ? e.title : e.title.replace(/[^\s·]/g, (ch, i) => (i < 3 ? ch : '•'))}</span><br><span class="c">${CAT_LABEL[e.cat]}</span></span></div>`).join('')}</div>
      <footer>Tab o clic fuera para cerrar · Los marcadores amarillos del minimapa son lo que te falta.</footer>`;
    notebook.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach((b) => b.addEventListener('click', () => { nbFilter = b.dataset.c as any; renderNotebook(); }));
  };

  // ---------------- estado
  let started = false;
  let overlay: 'none' | 'notebook' | 'menu' = 'menu';
  let showBig = false;
  let panelTarget: Target | null = null;
  let dialogIdx = 0;
  let talkingTo: NpcInst | null = null;
  let nearest: Target | null = null;

  const setPanel = (html: string) => {
    if (touch) html = html.replace(/E para cerrar/g, 'Toca ✕ para cerrar').replace(/E para (continuar|terminar)/g, 'Toca Ver para $1');
    panel.innerHTML = html + '<button class="pclose" aria-label="Cerrar">✕</button>';
    panel.querySelector('.pclose')!.addEventListener('click', () => closePanel());
  };
  const openPanel = (html: string, t: Target) => { setPanel(html); panel.classList.remove('hidden'); panel.scrollTop = 0; panelTarget = t; };
  const closePanel = () => { panel.classList.add('hidden'); panelTarget = null; talkingTo = null; };
  input.onWheelOverride = (dy) => { if (panelTarget && !panel.classList.contains('hidden')) { panel.scrollTop += dy; return true; } return false; };

  const showMenu = (pause: boolean) => {
    overlay = 'menu';
    menu.classList.remove('hidden');
    $('menutitle').textContent = pause ? 'Pausa' : 'Planta de persianas motorizadas · Equipo 4';
    $('menusub').textContent = pause ? `${discCount()} / ${entries.length} descubiertos` : `${data.planta.empresa.producto} · ${data.planta.empresa.ubicacion}`;
    $('btnEnter').textContent = pause ? 'Continuar' : 'Entrar a la planta';
  };
  const enterGame = () => {
    started = true; overlay = 'none';
    menu.classList.add('hidden');
    for (const id of ['hud', 'hudKeys', 'minimap', 'crosshair']) $(id).classList.remove('hidden');
    renderHud();
    input.lock();
    if (touch) {
      // pantalla completa y horizontal donde el navegador lo permite (Android); en iPhone se ignora
      try { const r = document.documentElement.requestFullscreen?.(); r?.then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {}); } catch { /* */ }
    }
  };
  $('btnEnter').addEventListener('click', enterGame);
  $('btnReset').addEventListener('click', () => { if (confirm('¿Borrar descubrimientos y progreso del recorrido?')) { disc.reset(); guide?.reset(); savePrefs({ gear: false }); player.ch.setGear(null, null); } });
  const chkGuide = $<HTMLInputElement>('chkGuide');
  chkGuide.checked = guide?.enabled ?? false;
  chkGuide.disabled = !guide;
  chkGuide.addEventListener('change', () => guide?.setEnabled(chkGuide.checked));
  guide?.onStep.push((done, next) => toast('Paso completado: ' + done.titulo, next ? 'Siguiente: ' + next.titulo : data.recorrido!.final, next ? 3 : 6));
  canvas.addEventListener('click', () => { if (started && overlay === 'none' && !input.locked) input.lock(); });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && overlay === 'none') showMenu(true);
  });
  notebook.addEventListener('click', (e) => { if (e.target === notebook) toggleNotebook(); });

  const toggleNotebook = () => {
    if (overlay === 'notebook') { overlay = 'none'; notebook.classList.add('hidden'); input.lock(); }
    else if (overlay === 'none') { overlay = 'notebook'; renderNotebook(); notebook.classList.remove('hidden'); input.unlock(); }
  };

  // ---------------- evacuación
  let evac: THREE.Group | null = null;
  let evacTimer = 0;
  const showEvacuation = () => {
    if (evac) scene.remove(evac);
    evac = new THREE.Group();
    const S = data.planta.seguridad;
    const nave = data.planta.nave;
    const x0 = nave.x - nave.w / 2, x1 = nave.x + nave.w / 2, z0 = nave.z - nave.d / 2, z1 = nave.z + nave.d / 2;
    const outward = (p: { x: number; z: number }) => (Math.abs(p.z - z0) < 0.5 ? [0, -1.5] : Math.abs(p.z - z1) < 0.5 ? [0, 1.5] : Math.abs(p.x - x0) < 0.5 ? [-1.5, 0] : [1.5, 0]);
    const nearestPR = (x: number, z: number) => S.puntos_reunion.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));
    const exits = [...S.salidas_emergencia, ...data.planta.andenes.map((a) => ({ x: a.x, z: a.z }))];
    const paths: [number, number][][] = [];
    for (const e of exits) {
      const [ox, oz] = outward(e);
      const pr = nearestPR(e.x + ox, e.z + oz);
      paths.push([[e.x - ox, e.z - oz], [e.x + ox * 2, e.z + oz * 2], [pr.x, pr.z]]);
    }
    // desde donde está el jugador
    const p = player.pos;
    if (building.insideNave(p)) {
      const ex = exits.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      const [ox, oz] = outward(ex);
      const pr = nearestPR(ex.x + ox, ex.z + oz);
      paths.push([[p.x, p.z], [ex.x - ox, ex.z - oz], [ex.x + ox * 2, ex.z + oz * 2], [pr.x, pr.z]]);
    } else {
      const pr = nearestPR(p.x, p.z);
      if (Math.hypot(pr.x - p.x, pr.z - p.z) > 3) paths.push([[p.x, p.z], [pr.x, pr.z]]);
    }
    const tex = T.arrow.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(1 / 1.2, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#22c55e', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 });
    for (const pth of paths) evac.add(new THREE.Mesh(ribbon(pth, 0.6, 0.05), mat));
    evac.userData.tex = tex;
    scene.add(evac);
    evacTimer = 30;
  };

  // ---------------- acciones
  const discover = (key: string) => { if (disc.add(key)) { const e = entries.find((x) => x.key === key); if (e) toast('¡Nuevo descubrimiento!', `${e.title} · ${discCount()} / ${entries.length}`, 2.2); } };

  const interact = () => {
    if (panelTarget) {
      if (panelTarget.kind === 'npc' && talkingTo) {
        dialogIdx++;
        if (dialogIdx < talkingTo.n.dialogo.length) { setPanel(npcHtml(talkingTo.n, dialogIdx)); return; }
      }
      closePanel();
      return;
    }
    const t = nearest;
    if (!t) return;
    if (t.kind === 'lever') { toggleLayout(); return; }
    discover(t.key);
    if (t.kind === 'machine') {
      const inst = lm.machines.get(t.machineId!)!;
      if (t.it) discover('i:' + t.it.id);
      openPanel(machineHtml(data, lm, inst, t.it), t);
    } else if (t.kind === 'npc') {
      talkingTo = t.npc!; dialogIdx = 0;
      openPanel(npcHtml(t.npc!.n, 0), t);
    } else if (t.it) {
      openPanel(interactuableHtml(data, lm, t.it), t);
      if (t.it.id === 'vitrina_producto') props.toggleVitrina();
      if (t.it.id === 'estacion_ehs') { player.ch.setGear('#F1C40F', '#F1C40F'); savePrefs({ gear: true }); toast('Casco y chaleco puestos', 'Equipo de protección personal'); }
      if (t.it.id === 'punto_reunion') { showEvacuation(); toast('Rutas de evacuación', 'Sigue las flechas verdes hacia los puntos de reunión', 3); }
    }
  };

  const toggleLayout = () => {
    const next = lm.active === 'actual' ? 'propuesto' : 'actual';
    lm.setLayout(next);
  };
  lm.onChange.push(() => {
    if (lm.active === 'propuesto') guide?.flag('accion:layout_propuesto');
    toast(lm.layout.nombre, lm.layout.descripcion, 3.5);
    setHudTarget();
    renderHud();
    if (panelTarget?.it?.id === 'tablero_produccion') setPanel(interactuableHtml(data, lm, panelTarget.it));
  });
  lm.onB.push(() => renderHud());

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.repeat) return;
    if (e.code === 'Tab') { e.preventDefault(); toggleNotebook(); return; }
    if (overlay !== 'none') return;
    switch (e.code) {
      case 'KeyE': interact(); break;
      case 'KeyL': toggleLayout(); break;
      case 'KeyB':
        if (lm.active !== 'propuesto') toast('Escenario B', 'Sólo existe en el layout propuesto: presiona L primero.');
        else if (lm.toggleB() && (guide?.flag('accion:escenario_b'), true)) toast(lm.showB ? 'Escenario B visible' : 'Escenario B oculto', lm.showB ? `+${data.layouts.propuesto.escenario_b?.maquinas_extra ?? ''} máquinas (fantasmas punteados) · capacidad ${data.layouts.propuesto.escenario_b?.capacidad_dia ?? ''}/día en ${data.layouts.propuesto.escenario_b?.turnos ?? ''} turno` : '');
        break;
      case 'KeyF':
        lm.setFlows(!lm.showFlows);
        if (lm.showFlows) guide?.flag('accion:flujos');
        discover('i:dron_flujos');
        if (lm.showFlows) toast('Vista de flujos', `Recorrido por persiana ${lm.layout.kpis.recorrido_por_persiana_m} m · traslado más largo ${lm.layout.kpis.traslado_mas_largo_m} m`);
        renderHud();
        break;
      case 'KeyM': showBig = !showBig; bigmap.classList.toggle('hidden', !showBig); break;
      case 'KeyH': help.classList.toggle('hidden'); break;
      case 'KeyG':
        if (guide) { guide.setEnabled(!guide.enabled); chkGuide.checked = guide.enabled; toast(guide.enabled ? 'Recorrido guiado activado' : 'Recorrido guiado oculto', guide.enabled ? 'Sigue la flecha azul del piso' : 'G para volver a mostrarlo', 1.8); }
        break;
      case 'KeyP':
        if (player.drone) break;
        player.firstPerson = !player.firstPerson;
        if (player.firstPerson) player.camPitch = 0.05; else player.camPitch = 0.35;
        toast(player.firstPerson ? 'Primera persona' : 'Tercera persona', '', 1.2);
        break;
      case 'KeyT':
        if (!player.drone) break;
        building.roofOn = !building.roofOn;
        toast(building.roofOn ? 'Techo visible' : 'Techo oculto', 'Vista del layout desde el dron', 1.4);
        break;
      case 'KeyV':
        player.setDrone(!player.drone);
        toast(player.drone ? 'Modo dron' : 'Modo a pie', player.drone ? 'WASD mover · Espacio/C subir/bajar · T quitar techo · Shift rápido · V para volver' : '', 2);
        break;
    }
  });

  // ---------------- táctil
  const touchUI = touch ? new TouchControls(input, canvas, () => { if (started && overlay === 'none') showMenu(true); }, () => { if (started && overlay === 'none') interact(); }) : null;
  if (touch) {
    promptEl.addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });
    bigmap.addEventListener('pointerdown', () => { showBig = false; bigmap.classList.add('hidden'); });
    help.addEventListener('pointerdown', () => help.classList.add('hidden'));
    const mission = $('mission');
    if (innerHeight < 500) mission.classList.add('collapsed');
    mission.addEventListener('pointerdown', () => mission.classList.toggle('collapsed'));
  }

  // ---------------- bucle
  let last = performance.now(), elapsed = 0;
  let frame = 0;
  let wasTrans = false;
  let fpsAcc = 0, fpsN = 0;
  (window as any).__game = { building, guide, col, lm, player, camera, renderer, scene, props, disc, toggleLayout, setLayout: (l: any) => lm.setLayout(l), enterGame, data, interact, stats: () => renderer.info.render };

  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; elapsed += dt;
    const t = elapsed;
    frame++;
    fpsAcc += dt; fpsN++;
    const controls = started && overlay === 'none';
    touchUI?.update(player.drone, controls);
    const P = (window as any).__prof ??= {}; let tp = performance.now(); const mark = (k: string) => { const n = performance.now(); P[k] = (P[k] ?? 0) * 0.95 + (n - tp) * 0.05; tp = n; };
    player.update(dt, input, controls); mark('player');
    lm.update(dt, t); mark('layout');
    if (lm.transitioning) player.resolve();
    if (wasTrans && !lm.transitioning) {
      if (player.unstick()) toast('¡Cuidado!', 'Te apartamos de la máquina que llegó a tu lugar', 1.6);
      renderHud();
    }
    wasTrans = lm.transitioning;
    mark('misc');
    props.update(dt, player.pos, talkingTo); mark('props');
    building.update(player.pos, camera.position, player.drone, dt); mark('building');
    guide?.update(dt, player.pos, scene, !started || player.drone);

    // HUD contadores animados
    let hudChanged = false;
    for (const k of ['cap', 'ops', 'rec'] as const) {
      const diff = hudTarget[k] - hudVals[k];
      if (Math.abs(diff) > 0.01) { hudVals[k] += diff * Math.min(1, dt * 3); if (Math.abs(hudTarget[k] - hudVals[k]) < 0.5) hudVals[k] = hudTarget[k]; hudChanged = true; }
    }
    if (hudChanged && started) renderHud();

    // luz del sol sigue al jugador (sombras sólo cerca)
    const focus = player.drone ? new THREE.Vector3(camera.position.x, 0, camera.position.z) : player.pos;
    sun.position.set(focus.x + 22, 42, focus.z + 14);
    sun.target.position.set(focus.x, 0, focus.z);

    // proximidad
    nearest = null;
    if (controls && !player.drone) {
      let best = 2.5;
      for (const tg of props.targets) {
        const d = tg.dist(player.pos.x, player.pos.z);
        if (d < best) { best = d; nearest = tg; }
      }
    }
    if (nearest && !panelTarget) {
      const verb = nearest.kind === 'npc' ? 'Hablar' : nearest.kind === 'lever' ? 'Usar' : 'Ver';
      promptEl.innerHTML = `<span class="k">${touch ? 'Toca' : 'E'}</span>${verb} · ${nearest.label}${!disc.has(nearest.key) && nearest.kind !== 'lever' ? ' <span style="color:#F1C40F">●</span>' : ''}`;
      promptEl.classList.remove('hidden');
    } else promptEl.classList.add('hidden');
    if (panelTarget) {
      const p = panelTarget.pos();
      if (panelTarget.dist(player.pos.x, player.pos.z) > 4.5 && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > 4.5) closePanel();
    }

    mark('prox');
    // aviso
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.add('hidden'); }
    // evacuación
    if (evac) {
      (evac.userData.tex as THREE.Texture).offset.x -= dt * 1.2;
      evacTimer -= dt;
      if (evacTimer <= 0) { scene.remove(evac); evac = null; }
    }
    // resolución adaptativa (sólo calidad alta): mantiene ~60 fps en gráficos integrados
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0;
      if (quality === 'alta') {
        const maxR = Math.min(devicePixelRatio, 1.5);
        let r = dynRatio;
        if (fps < 50 && r > 0.75) r = Math.max(0.75, r - 0.25);
        else if (fps > 58 && r < maxR) r = Math.min(maxR, r + 0.25);
        if (r !== dynRatio) { dynRatio = r; renderer.setPixelRatio(r); renderer.setSize(innerWidth, innerHeight, false); }
      }
      (window as any).__fps = fps;
    }
    // minimapa
    if (started && frame % 3 === 0) drawMap(minimap, data, lm, props, disc, { x: player.pos.x, z: player.pos.z, facing: player.facing }, camera.position, false);
    if (showBig && frame % 3 === 1) drawMap(bigmapc, data, lm, props, disc, { x: player.pos.x, z: player.pos.z, facing: player.facing }, camera.position, true);
    // sombras a medio ritmo (cada 2 cuadros)
    if (renderer.shadowMap.enabled && frame % 2 === 0) renderer.shadowMap.needsUpdate = true;
    mark('hud+map');
    renderer.render(scene, camera); mark('render');
  };

  progress(1, 'Listo'); await nextFrame();
  $('loading').classList.add('hidden');
  showMenu(false);
  hudKeys.classList.add('hidden');
  loop();
  void fmtNum; void hud;
}

main();
