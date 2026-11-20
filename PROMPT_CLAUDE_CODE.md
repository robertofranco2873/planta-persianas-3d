# Prompt para Claude Code — Planta 3D de persianas motorizadas (mundo abierto)

> Abre en VS Code la carpeta donde guardaste `planta3d-datos.zip`, abre Claude Code y pega todo lo que está debajo de la línea.

---

Quiero que construyas un juego web 3D de mundo abierto que recorra una planta de manufactura real de nuestro proyecto escolar (Diseño de Instalaciones, Equipo 4): una planta de persianas motorizadas en Apodaca, N.L. Tú te encargas de todo: crear el repositorio, programar, subir a GitHub y publicar gratis en Cloudflare Pages. Trabaja por fases, verifica cada fase corriendo el proyecto y haz commit y push al terminar cada una.

## 0. Preparación (hazla tú antes de programar)

Estoy en Windows con VS Code; usa comandos que funcionen en PowerShell.

1. Revisa que existan `node` (≥ 18), `npm`, `git` y `gh` (GitHub CLI). Si falta `gh`, instálalo con `winget install --id GitHub.cli` y avísame si tengo que reiniciar la terminal.
2. Revisa las sesiones con `gh auth status` y `npx wrangler whoami`. Si alguna no está iniciada, ejecuta `gh auth login --web` o `npx wrangler login`, que abren el navegador. Dime claramente que tengo que aprobar ahí y espera a que te confirme.
3. En la carpeta actual hay un archivo `planta3d-datos.zip` (o su contenido ya descomprimido). Crea la carpeta del proyecto `planta-persianas-3d` y descomprime ahí el zip, de modo que queden en su raíz `data/`, `referencias/`, `assets/`, `LEEME.md` y este prompt (`PROMPT_CLAUDE_CODE.md`). Trabaja dentro de esa carpeta de aquí en adelante.
4. Inicializa git con un `.gitignore` para Node (`node_modules`, `dist`, `.wrangler`, `.env`) y haz el primer commit con los datos.
5. Crea el repositorio en mi cuenta de GitHub y súbelo: `gh repo create planta-persianas-3d --public --source . --remote origin --push`. Si el nombre ya existe, agrégale `-v2`.
6. Crea el proyecto de Cloudflare Pages con `npx wrangler pages project create planta-persianas-3d --production-branch main`. Publicarás con `npx wrangler pages deploy dist --project-name planta-persianas-3d`.

## 1. Material que ya está en el repositorio

Lee todo esto antes de escribir código:

- `data/planta.json`: sitio, nave, zonas (pasillos, almacenes, oficinas, comedor, patio, estacionamiento), andenes, elementos de seguridad (extintores, salidas, puntos de reunión) y decoración. Coordenadas en metros: origen = esquina noroeste del interior de la nave, **X hacia el este, Z hacia el sur, Y altura**. Cada zona trae centro (`x`,`z`) y tamaño (`w` en X, `d` en Z).
- `data/layout_actual.json` y `data/layout_propuesto.json`: posición (`x`,`z`) y rotación (`rot`, grados sobre Y) de cada máquina por `id`, rutas de flujo de materiales (`flujos`), posiciones de operadores y KPIs de cada layout. Una misma máquina conserva su `id` en ambos layouts; las que tienen `"solo_escenario_b": true` sólo existen en el escenario B del propuesto.
- `data/maquinas.json`: catálogo por `tipo` con dimensiones `[largo X, ancho Z, alto Y]`, color, descripción del modelo 3D a construir, ficha técnica, tiempos MOST, riesgos, EPP, residuos y mejoras de la Etapa 3.
- `data/kpis.json`: indicadores generales, simulación, finanzas, escenarios de la Etapa 3 y curva de arranque.
- `data/interactuables.json`: pantallas, tableros, exhibidores y estaciones con su contenido.
- `data/npcs.json`: personajes de la planta con sus diálogos.
- `referencias/layout_actual_plano.png` y `referencias/layout_propuesto_plano.png`: planos 2D de donde salieron las coordenadas. Úsalos para entender la disposición, no los muestres en el juego salvo en el minimapa si te sirve.
- `assets/` (puede estar vacío): si ahí hay `personaje.glb` u otros modelos, úsalos; si no, genéralos por código.

Regla de contenido: **todo texto y número que aparezca en el juego sale de esos JSON**. No inventes datos de la planta. Si algo falta, deja un marcador visible y anótalo en `TODO.md`.

## 2. Stack y restricciones

- Vite + TypeScript + three.js (sin React, sin motores pesados). Física propia simple: colisiones del personaje (cápsula) contra cajas AABB de muros, máquinas y racks. Puedes usar `three-mesh-bvh` sólo si lo necesitas.
- UI en HTML/CSS superpuesto al canvas, sin frameworks. Gráficas simples con SVG o canvas 2D hechas a mano.
- Todo estático: sin backend ni base de datos. El progreso del jugador (descubrimientos, ajustes) va en `localStorage` envuelto en try/catch.
- Sólo computadora (teclado y mouse); no hace falta soporte táctil.
- Peso total de descarga ≤ 15 MB, 60 fps en una laptop con gráficos integrados. Textura máxima de 1K, `devicePixelRatio` limitado a 1.5, interruptor de calidad (alta/baja) en el menú.
- Idioma de la interfaz: español.
- Build a `dist/`, listo para Cloudflare Pages (comando `npm run build`, salida `dist`). Mueve `data/` a `public/data/` (o cárgalo con `fetch`) para que el contenido se pueda editar sin tocar código.

## 3. Estilo visual: "intermedio"

Ni low-poly plano ni fotorrealista. Geometría generada por código con medidas reales, materiales PBR (`MeshStandardMaterial`) y buena iluminación:

- Paleta del proyecto: café `#6B5545`, topo `#9F938C`, carbón `#2C2E31`, blanco cálido `#F8F8F8`, acentos de seguridad amarillo `#F1C40F` y rojo `#C0392B`.
- Texturas CC0 de Poly Haven (1K) para piso de concreto pulido, asfalto del patio, lámina metálica de muros y metal cepillado. Descárgalas con su API pública si tienes red; si no, crea texturas procedurales en canvas.
- Iluminación: `HemisphereLight` + una `DirectionalLight` con sombras suaves (mapa de 2048, sólo para objetos cercanos al jugador) y luces de techo simuladas con paneles emisivos. Tono ACES Filmic, sRGB.
- Piso: pasillos de montacargas de 4 m con franjas amarillas, pasillos peatonales verdes de 1 m, y alrededor de cada máquina la franja de mantenimiento (`mtto`, 1 m por lado) marcada con líneas amarillas/negras en el piso.
- Señalética NOM-026 (obligatoria azul, precaución amarilla, emergencia verde, prohibición roja) como texturas de canvas en muros y columnas.
- Exterior: patio de tráileres con 3 remolques en los andenes del este, estacionamiento con autos simples, árboles, cielo con gradiente y un poco de niebla a lo lejos.
- La nave mide 60 × 34.7 m y 11 m de alto. Cuando el jugador está dentro, oculta o vuelve semitransparente el techo y el muro que tapan la cámara.

## 4. Personaje y cámara

- Tercera persona. Si existe `assets/personaje.glb` con animaciones (idle, walk, run), úsalo; si no, construye un trabajador con primitivas (casco amarillo, chaleco reflejante, overol) y anima el caminar por código.
- Controles: WASD para moverse, Shift para correr, mouse para orbitar la cámara (pointer lock), rueda para zoom, E para interactuar, L para cambiar de layout, B para mostrar u ocultar el escenario B, F para la vista de flujos, M para el minimapa grande, Tab para la libreta de descubrimientos, V para modo dron (cámara libre aérea), H para ayuda, Esc para menú.
- La cámara no atraviesa muros (raycast hacia el personaje). El personaje no atraviesa máquinas, racks ni muros; las puertas de las oficinas y los portones de la nave están abiertos.
- Punto de inicio: frente a la recepción, mirando hacia la nave.

## 5. Máquinas y escena

- Construye una función generadora por `tipo` de `maquinas.json` siguiendo su campo `modelo` y escalando a `dim`. Que se reconozcan: la sierra con bancada de rodillos y disco con guarda; la mesa de tela con vidrio retroiluminado y pórtico; la entubadora larga con rodillos; el elevador como marco alto con la persiana colgando; la Packsize con su rack de bobinas de cartón; racks naranjas con tarimas, rollos y tubos; mesas de ensamble con herramientas.
- Usa `InstancedMesh` o geometrías fusionadas para lo repetido (racks, elevadores, autos, lámparas).
- Animaciones ligeras en bucle: disco de la sierra girando, pórtico de la mesa de tela yendo y viniendo, la persiana del elevador subiendo y bajando, una caja saliendo de la Packsize, LEDs parpadeando en el rack IoT, el montacargas recorriendo en bucle el pasillo norte y el central.
- Coloca operadores (figuras del mismo estilo que el personaje, con animación idle de trabajo) en las posiciones `operadores` del layout activo.
- Las máquinas que en el layout tienen `"en_operacion": false` (2 de los 8 elevadores) se muestran apagadas, con una etiqueta "holgura".

## 6. Cambio instantáneo de layout (lo más importante)

- La tecla L, o una palanca física junto al tablero de producción, alterna entre **Layout actual** y **Layout propuesto**.
- Transición de ~1.5 s: cada máquina se desliza (y gira si cambia `rot`) desde su posición en un layout a la del otro, emparejadas por `id`. Las que sólo existen en uno aparecen o desaparecen escalando. Los operadores se reacomodan igual. Breve efecto de polvo o destello y un aviso en la pantalla con el nombre del layout.
- Si una máquina iba a quedar encima del jugador, empújalo a la posición libre más cercana.
- En el propuesto, la tecla B muestra el equipo del escenario B como "fantasmas" semitransparentes con contorno punteado y etiqueta "Escenario B".
- Al cambiar de layout se actualizan: las rutas de flujo, el tablero de producción (contadores animados con los `kpis` del layout activo), el minimapa y el HUD.
- Vista de flujos (F): dibuja en el piso las polilíneas de `flujos` con su color, flechas animadas que avanzan en la dirección del material, y un letrero flotante con el recorrido por persiana y el traslado más largo del layout activo.

## 7. Interacción y contenido (mundo abierto, sin misiones)

- No hay historia ni orden obligatorio. El jugador explora libremente.
- Todo lo de `interactuables.json`, cada máquina y cada NPC es interactuable: al acercarse a menos de 2.5 m aparece "E · Ver"; al presionar E se abre un panel lateral con título, contenido y, si aplica, una gráfica (barras de inversión por grupo, flujo acumulado, comparativo de escenarios A vs B, utilización por operación, curva de arranque).
- Ficha de máquina: nombre, descripción, especificaciones, tiempos MOST (barra de manual vs máquina y % de espera del operador), riesgos, EPP, residuos y mejora de la Etapa 3. Agrega la cantidad de esa máquina en el layout activo y si es cuello de botella.
- Coloca cada interactuable en su `zona` (centro de la zona o junto a la máquina de `cerca_de`/`ref`), como objetos con sentido: pantallas en muros, tableros kanban en columnas, una vitrina con la persiana en recepción, contenedores de colores en residuos, una estación EHS con casco y chaleco.
- NPCs: miran al jugador al acercarse y su diálogo avanza con E. Usa el mismo modelo del personaje con otros colores de chaleco según el área.
- Libreta de descubrimientos (Tab): lista todo lo interactuable con casillas que se marcan al verlo, con un contador "X / N descubiertos" y filtros por categoría (máquinas, KPIs, personas, seguridad, empresa). Se guarda en `localStorage`.
- Minimapa en la esquina con la planta vista desde arriba, el personaje, el layout activo y marcadores de lo no descubierto.
- Detalles divertidos opcionales: el chaleco y casco de la estación EHS se le ponen al personaje; en la vitrina de recepción la persiana sube y baja con E; en el punto de reunión, E muestra flechas verdes de evacuación desde donde estás.

## 8. Pantallas de interfaz

- Pantalla de carga con barra de progreso y el título "Planta de persianas motorizadas · Equipo 4".
- Pantalla de inicio con botón "Entrar a la planta", la lista de controles y el selector de calidad.
- HUD discreto: layout activo, 3 KPIs principales del layout (capacidad/día, operadores por turno, recorrido por persiana), contador de descubrimientos y ayuda de teclas.
- Tipografía: Anton (títulos) e Inter (texto) desde Google Fonts. Paneles con fondo carbón `#2C2E31` al 92%, bordes topo y encabezados café.

## 9. Estructura sugerida

```
src/
  main.ts            arranque, loop, calidad
  world/             nave, zonas, exterior, señalética, iluminación
  machines/          un generador por tipo + animaciones
  layout/            carga de layouts, transición, flujos, escenario B
  player/            controlador, cámara, colisiones
  npc/               NPCs y operadores
  interact/          proximidad, paneles, gráficas, libreta
  ui/                HUD, minimapa, menús, carga
public/data/         los JSON
public/assets/       modelos y texturas
```

## 10. Fases (verifica y haz commit en cada una)

1. **Mundo base** (después de la preparación del punto 0): proyecto Vite, carga de JSON, nave, zonas, pasillos, exterior, iluminación, personaje caminando con colisiones y cámara. Verifica que las medidas coincidan con el plano de referencia.
2. **Máquinas**: generadores por tipo, colocación del layout actual, franjas de mantenimiento, animaciones, montacargas y operadores.
3. **Cambio de layout**: transición L, escenario B, vista de flujos, tablero de producción dinámico.
4. **Contenido**: interactuables, fichas de máquina, NPCs, gráficas, libreta y minimapa.
5. **Pulido y publicación**: pantallas de carga e inicio, ajustes de rendimiento, `README.md` con controles y créditos de assets (licencias CC0/Poly Haven/Quaternius/Kenney), build final y despliegue.

En cada fase corre `npm run dev`. Si tienes Playwright disponible, toma capturas desde 3 puntos (recepción, centro de la línea, andenes) en ambos layouts, revisa que nada flote, se encime ni atraviese muros, y corrige antes de pasar a la siguiente.

## 11. Publicación

- Al terminar cada fase: `npm run build`, commit, `git push` y `npx wrangler pages deploy dist --project-name planta-persianas-3d`. Pásame la URL de cada despliegue para revisarlo en el navegador.
- Agrega un script `npm run deploy` que haga build y deploy en un solo paso, para que después yo pueda republicar con un comando.
- Al final dame: la URL pública (`https://planta-persianas-3d.pages.dev` o la que asigne Cloudflare), el link del repositorio, cómo correrlo localmente, qué assets descargaste y con qué licencia, y lo que quedó en `TODO.md`.

Si algo de este prompt contradice los datos de los JSON, manda el JSON. Si una decisión es menor, tómala tú; pregúntame sólo si algo cambia de fondo el resultado.
