# Planta de persianas motorizadas · Equipo 4 (recorrido 3D)

Recorrido 3D de mundo abierto por la planta de persianas motorizadas de Apodaca, N.L., del proyecto de **Diseño de Instalaciones (Equipo 4)**. Puedes caminar por la nave, ver cada máquina con su ficha técnica, hablar con el personal y cambiar al instante entre el **layout actual** y el **layout propuesto** (Etapa 3), incluido el equipo extra del **escenario B**.

- Juego publicado: https://planta-persianas-3d.pages.dev
- Código: https://github.com/robertofranco2873/planta-persianas-3d

## Controles

| Tecla | Acción |
|---|---|
| W A S D | Moverse |
| Shift | Correr |
| Mouse | Orbitar la cámara (haz clic en el juego para capturar el mouse) |
| Rueda | Zoom (o desplazar el panel abierto) |
| E | Interactuar: ver ficha, hablar, usar la palanca |
| G | Mostrar/ocultar el recorrido guiado (misiones y flecha en el piso) |
| P | Cambiar entre primera y tercera persona |
| L | Cambiar entre layout actual y propuesto (también con la palanca junto al tablero de producción) |
| B | Mostrar/ocultar el escenario B (sólo en el layout propuesto) |
| F | Vista de flujos de material |
| M | Mapa grande |
| Tab | Libreta de descubrimientos |
| V | Modo dron (Espacio/C para subir/bajar, Shift rápido, T para quitar el techo y ver el layout) |
| H | Ayuda |
| Esc | Menú (pausa, calidad gráfica y sensibilidad de la cámara) |

## Celular y tableta

El mismo enlace funciona en celular (en horizontal). Si el dispositivo es táctil aparecen los controles: joystick a la izquierda para caminar (a fondo para correr), arrastrar a la derecha para girar la cámara, pellizcar para zoom y botones para Ver, Layout, Flujos, Escenario B, Guía, 1ª/3ª persona, Dron, Mapa, Libreta, ayuda (?) y menú (☰). Arranca en calidad baja. Para probar los controles táctiles en computadora agrega `?touch=1` al enlace. `scripts/prueba_movil.mjs` simula un teléfono con toques reales.

## Recorrido guiado

Apareces afuera, en la banqueta del estacionamiento, y entras por la **entrada principal**. Un torniquete obliga a pasar por la **recepción**; los portones de recibo están cerrados y las salidas de emergencia sólo se abren desde dentro. Las puertas (corredizas de vidrio en la entrada, batientes en oficinas y en el acceso a la nave) se abren solas al acercarte. Las misiones siguen el orden de una visita real: recepción → oficinas → seguridad (EPP) → almacén de materia prima → corte → tela y entubado → ensamble → pruebas → empaque y producto terminado → andenes → comparación de layouts → flujos → punto de reunión. Una flecha azul en el piso (calculada con A* para no atravesar muros ni máquinas) indica a dónde ir; se oculta con **G** o desde el menú. Los pasos y textos están en `public/data/recorrido.json`.

## Pasillos de montacargas

La planta tiene una red de pasillos de montacargas de 4 m: norte, central (principal), oeste hacia el rack de tubo y perfiles, y sur hacia el almacén de tela. El montacargas los recorre en bucle y entra en reversa a los tramos sin salida. Las máquinas que invadían esos pasillos se movieron lo mínimo; su posición del plano original quedó guardada en `x_plano`/`z_plano` dentro de `layout_*.json` (ver `scripts/pasillos_4m.mjs` y `TODO.md`).

## Cómo correrlo en tu computadora

Requisitos: Node.js 18 o más reciente.

```bash
npm install
npm run dev        # abre http://localhost:5173
npm run build      # genera dist/
npm run deploy     # build + publica en Cloudflare Pages (requiere `npx wrangler login`)
```

## Editar el contenido sin tocar código

Todo texto y número del juego sale de `public/data/`:

| Archivo | Qué controla |
|---|---|
| `planta.json` | Nave, zonas, andenes, extintores, salidas, puntos de reunión, árboles |
| `layout_actual.json`, `layout_propuesto.json` | Posición/rotación de cada máquina, flujos, operadores y KPIs de cada layout |
| `maquinas.json` | Ficha por tipo de máquina: medidas, specs, MOST, riesgos, EPP, residuos, mejoras |
| `kpis.json` | Indicadores generales, simulación, finanzas, escenarios A/B, curva de arranque |
| `interactuables.json` | Pantallas, tableros, vitrina y estaciones (puedes agregar `"x"` y `"z"` para fijar su lugar) |
| `npcs.json` | Personas y sus diálogos (también aceptan `"x"` y `"z"`) |
| `recorrido.json` | Pasos y objetivos del recorrido guiado |

Coordenadas en metros; origen en la esquina noroeste del interior de la nave, X hacia el este y Z hacia el sur. Después de editar, `npm run deploy` vuelve a publicar.

Lo que falta en los datos y las decisiones de presentación están en [`TODO.md`](TODO.md).

## Tecnología

- Vite + TypeScript + [three.js](https://threejs.org) (sin frameworks). Geometría generada por código con las medidas de `maquinas.json`.
- Física propia: el personaje es un círculo que choca contra cajas AABB (muros, máquinas, racks); la cámara no atraviesa muros ni objetos altos.
- Interfaz en HTML/CSS; gráficas en SVG hechas a mano.
- Progreso (descubrimientos, calidad y EPP) en `localStorage`.
- Calidad *alta* (sombras y resolución adaptativa de hasta 1.5×) o *baja* (sin sombras, 1×). En gráficos integrados arranca en *baja*.
- `scripts/capturas.mjs` toma capturas de verificación con Playwright usando el Chrome instalado; `scripts/rendimiento.mjs` mide los fps.

## Créditos de assets

| Asset | Fuente | Licencia |
|---|---|---|
| Concreto (`hangar_concrete_floor`, color y normal) | [Poly Haven](https://polyhaven.com/a/hangar_concrete_floor) | CC0 |
| Asfalto (`asphalt_02`) | [Poly Haven](https://polyhaven.com/a/asphalt_02) | CC0 |
| Lámina corrugada (`corrugated_iron_02`, color y normal) | [Poly Haven](https://polyhaven.com/a/corrugated_iron_02) | CC0 |
| Placa metálica (`metal_plate`) | [Poly Haven](https://polyhaven.com/a/metal_plate) | CC0 |
| Tipografías Anton e Inter | [Google Fonts](https://fonts.google.com) | SIL Open Font License |
| Personaje, máquinas, vehículos y señalética | Generados por código en este repositorio | — |

No se usaron modelos de Quaternius ni de Kenney; si se agrega `assets/personaje.glb` (Quaternius, CC0) habría que conectarlo en `src/player/character.ts`.
