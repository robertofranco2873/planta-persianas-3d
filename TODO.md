# TODO · datos faltantes y decisiones tomadas

Regla del proyecto: todo texto y número del juego sale de `public/data/*.json`. Aquí se anota lo que falta en los JSON y las decisiones de presentación que no vienen en los datos.

## Datos que faltan en los JSON (se muestra un marcador "⚠ Pendiente" en el juego)

- **Flujo acumulado** (`terminal_finanzas`, gráfica "línea de flujo acumulado"): los JSON sólo traen VPN, TIR, payback y utilidad del año 1; falta la serie de flujo de efectivo por año. Agregar en `kpis.finanzas`, por ejemplo `"flujo_acumulado": [[0, -29290495], [1, ...], ...]`.
- **Utilización por operación** (`tablero_balanceo`, "barras de utilización por operación"): no viene el % por operación. Mientras tanto se grafica el ciclo MOST de cada equipo contra el takt. Agregar en `kpis.generales`, por ejemplo `"utilizacion": {"Sierras": 0.81, ...}`.

## Correcciones de presentación (no cambian los datos)

- **Operadores encima de su máquina**: varias posiciones de `operadores` caen dentro de la huella de la máquina (p. ej. `(20.4, 12.4)` sobre la bancada de la sierra de tubo). Se dibujan en el punto libre más cercano (< 1 m). Si quieren exactitud, mover esas coordenadas en `layout_*.json`.
- **NPCs sin coordenadas**: `npcs.json` sólo trae la zona; se colocan junto a su máquina (`cerca_de`) o en un punto libre de la zona. Se pueden fijar agregando `"x"` y `"z"` al NPC.
- **Interactuables sin coordenadas**: se ubican en su zona en muros/columnas (ver `PLACE` en `src/interact/props.ts`). Si un interactuable trae `"x"` y `"z"` en el JSON, mandan esos.
- **Pasillos peatonales verdes de 1 m**: el JSON no los ubica. Se pintaron junto al pasillo oeste de montacargas y desde el acceso peatonal sur hacia producción, con paso de cebra donde cruza el pasillo sur.
- **Acceso peatonal nave ↔ oficinas**: se abrió entre recepción y lockers (el plano muestra la entrada a oficinas ahí). La salida de emergencia de `(20.4, 34.7)` queda detrás del rack de tela, como en el plano.
- **Pasillos de montacargas de 4 m** (cambio solicitado): el pasillo norte pasó de 3.7 a 4 m y el central de 2.1 a 4 m (como dicen sus nombres); se agregaron `pasillo_oeste` (rack de tubo/perfiles) y `pasillo_sur` (rack de tela). Para despejarlos se movieron, en ambos layouts: los 8 elevadores (x 46.2 → 47.3), mesas de tela y entubadoras (≈1–1.6 m al norte), y en el propuesto las sierras (0.5 m al norte) y los ensambles de bottom rail (x 40.4 → 39.6). La posición original quedó en `x_plano`/`z_plano` y los flujos/operadores se ajustaron igual. **Los KPIs (recorrido 146/108 m, traslado más largo 33/21 m) siguen siendo los del plano original**: los cambios de distancia son de 1–2 m; si el equipo recalcula, actualizar `kpis` de cada layout.
- **Entrada por recepción** (cambio solicitado): el pasillo entre recepción y lockers funciona como vestíbulo con la entrada principal al sur; un torniquete obliga a cruzar la recepción (se le agregó una segunda puerta hacia la nave). Los portones de recibo norte se muestran cerrados y las salidas de emergencia sólo abren desde dentro. La puerta de lockers se recorrió 1 m al sur para no quedar del otro lado del torniquete.
- **Recorrido guiado**: el orden de las misiones (recepción → oficinas → EPP → MP → producción → PT → andenes → layouts → flujos → evacuación) es una propuesta; se edita en `public/data/recorrido.json`.
- **Sin perfiles de piso elevados en andenes**: los remolques están a nivel de piso.

## Pendientes opcionales

- Personaje con animaciones de Quaternius (`assets/personaje.glb`): el código actual genera al trabajador con primitivas; si se agrega el `.glb` habría que conectarlo en `src/player/character.ts`.
- Rendimiento: en una Intel UHD la calidad *baja* da ~60 fps; *alta* (sombras) baja la resolución sola para mantener la fluidez (~45–60 fps según la vista).
