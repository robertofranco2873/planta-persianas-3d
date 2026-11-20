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
| L | Cambiar entre layout actual y propuesto (también con la palanca junto al tablero de producción) |
| B | Mostrar/ocultar el escenario B (sólo en el layout propuesto) |
| F | Vista de flujos de material |
| M | Mapa grande |
| Tab | Libreta de descubrimientos |
| V | Modo dron (Espacio/C para subir/bajar, Shift rápido) |
| H | Ayuda |
| Esc | Menú (pausa y calidad gráfica) |

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
