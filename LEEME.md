# Planta 3D · Equipo 4: archivos para Claude Code

Esta carpeta contiene todo lo que Claude Code necesita para construir el recorrido 3D de mundo abierto de la planta de persianas motorizadas, con el layout actual y el propuesto.

## Qué hay aquí

| Archivo | Qué contiene |
|---|---|
| `PROMPT_CLAUDE_CODE.md` | El prompt que vas a pegar en Claude Code |
| `data/planta.json` | Sitio, nave (60 × 34.7 m, 11 m de alto), zonas, pasillos, andenes, seguridad |
| `data/layout_actual.json` | Máquinas, flujos de material, operadores y KPIs del layout actual |
| `data/layout_propuesto.json` | Lo mismo para el layout en U de la Etapa 3, más el equipo del escenario B |
| `data/maquinas.json` | Ficha de cada tipo de máquina: medidas, specs, MOST, riesgos, EPP, residuos, mejoras |
| `data/kpis.json` | Producción, simulación, finanzas, escenarios A y B, curva de arranque |
| `data/interactuables.json` | Pantallas, tableros, vitrina y estaciones con su información |
| `data/npcs.json` | Personajes de la planta y sus diálogos |
| `referencias/*.png` | Planos 2D de los que se dedujeron las coordenadas |
| `assets/` | Vacía. Aquí van los modelos opcionales (ver abajo) |

Todo el texto del juego sale de los JSON. Si quieres corregir un dato, cambiar un diálogo o agregar un punto de información, edita el JSON y no hace falta tocar el código.

## Máquinas consideradas (supuestas con lo último del proyecto)

| Máquina | Actual | Propuesto (A) | Solo en escenario B |
|---|---|---|---|
| Sierras (tubo, bottom rail, cassette) | 3 | 3 | — |
| Mesas de corte de tela | 2 | 2 | +2 |
| Entubadoras | 2 | 2 | +2 y 1 de respaldo |
| Kit Ace / pre-ensamble | 1 / 1 | 1 / 1 | — |
| Ensamble de cassette / de bottom (costura) | 1 / 1 | 1 / 1 | +1 / +1 |
| Elevadores de prueba | 8 (6 operando, 2 de holgura) | 8 | — |
| Hardware, Packsize + 2 flejadoras | 1 | 1 | — |

También se incluyen el compresor, la subestación, los racks (tubo, perfiles, tela, WIP y PT), el montacargas, el rack IoT y la mesa de calidad.

## Qué tienes que hacer tú

Claude Code crea el repositorio, lo sube a GitHub y lo publica en Cloudflare. Tú solo:

1. **Guarda `planta3d-datos.zip`** en una carpeta de trabajo (por ejemplo `Documentos\Proyectos`) y abre esa carpeta en VS Code. No hace falta descomprimirlo.
2. **Opcional: el personaje.** Si quieres uno con animaciones más naturales, descarga gratis el **Ultimate Animated Character Pack** de Quaternius (CC0, quaternius.com) y deja el `.glb` del trabajador en la misma carpeta. Pídele a Claude Code que lo use como `assets/personaje.glb`. Si no, él arma uno con figuras simples.
3. **Abre Claude Code y pega el prompt** (`PROMPT_CLAUDE_CODE.md`, desde la línea horizontal hacia abajo).
4. **Aprueba los inicios de sesión** si te los pide: GitHub (`gh auth login`) y Cloudflare (`wrangler login`) abren el navegador una sola vez para que autorices.
5. **Revisa por fases.** Trabaja en 5 fases; al final de cada una hace commit, push y despliegue, y te pasa la URL para que lo pruebes y le pidas cambios.

## Notas

- Las coordenadas son aproximadas a partir del plano (escala ~14.7 px por metro). Las proporciones y la ubicación de cada área son fieles a lo que describimos, pero no son medidas exactas de AutoCAD.
- El juego usa los textos en español. Si después quieres una versión en inglés, se puede agregar un archivo de traducciones sin rehacer el juego.
- En `npcs.json` los personajes son puestos de la planta (gerente, supervisor, inspectora, etc.). Los nombres del equipo aparecen solo en una placa en la recepción.
