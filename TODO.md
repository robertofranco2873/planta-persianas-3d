# TODO · datos faltantes y decisiones tomadas

Regla del proyecto: todo texto y número del juego sale de `public/data/*.json`. Aquí se anota lo que falta en los JSON y las decisiones de presentación que no vienen en los datos.

## Datos que faltan en los JSON (se muestra un marcador "⚠ Pendiente" en el juego)

- **Flujo acumulado** (`terminal_finanzas`, gráfica "línea de flujo acumulado"): los JSON sólo traen VPN, TIR, payback y utilidad del año 1; falta la serie de flujo de efectivo por año. Agregar en `kpis.finanzas`, por ejemplo `"flujo_acumulado": [[0, -29290495], [1, ...], ...]`.
- **Utilización por operación** (`tablero_balanceo`, "barras de utilización por operación"): no viene el % por operación. Mientras tanto se grafica el ciclo MOST de cada equipo contra el takt. Agregar en `kpis.generales`, por ejemplo `"utilizacion": {"Sierras": 0.81, ...}`.

## Correcciones de presentación (no cambian los datos)

- **Operadores encima de su máquina**: varias posiciones de `operadores` caen dentro de la huella de la máquina (p. ej. `(20.4, 12.4)` sobre la bancada de la sierra de tubo). Se dibujan en el punto libre más cercano (< 1 m). Si quieren exactitud, mover esas coordenadas en `layout_*.json`.
- **NPCs sin coordenadas**: `npcs.json` sólo trae la zona; se colocan junto a su máquina (`cerca_de`) o en un punto libre de la zona. Se pueden fijar agregando `"x"` y `"z"` al NPC.
- **Interactuables sin coordenadas**: se ubican en su zona en muros/columnas (ver `PLACE` en `src/interact/props.ts`). Si un interactuable trae `"x"` y `"z"` en el JSON, mandan esos.
- **Pasillos peatonales verdes de 1 m**: el JSON no los ubica. Se pintaron dos tramos que no cruzan máquinas en ningún layout (frente al acceso peatonal sur y junto al almacén de MP).
- **Acceso peatonal nave ↔ oficinas**: se abrió entre recepción y lockers (el plano muestra la entrada a oficinas ahí). La salida de emergencia de `(20.4, 34.7)` queda detrás del rack de tela, como en el plano.
- **Pasillo de montacargas**: el prompt dice 4 m, el JSON trae 3.7 m (norte) y 2.1 m (central); manda el JSON.
- **Sin perfiles de piso elevados en andenes**: los remolques están a nivel de piso.

## Pendientes opcionales

- Personaje con animaciones de Quaternius (`assets/personaje.glb`): el código actual genera al trabajador con primitivas; si se agrega el `.glb` habría que conectarlo en `src/player/character.ts`.
- Rendimiento: en una Intel UHD la calidad *baja* da ~60 fps; *alta* (sombras) baja la resolución sola para mantener la fluidez (~45–60 fps según la vista).
