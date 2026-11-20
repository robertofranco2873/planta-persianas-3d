// Ajuste único (ya aplicado): abre pasillos de montacargas de 4 m moviendo lo mínimo las máquinas.
// Conserva la posición del plano original en "x_plano"/"z_plano". Ejecutar dos veces no cambia nada.
import fs from 'node:fs';
const P = 'public/data/';
const read = (f) => JSON.parse(fs.readFileSync(P + f, 'utf8'));
const write = (f, d) => fs.writeFileSync(P + f, JSON.stringify(d, null, 1) + '\n');
const nota = 'Movida para dejar pasillos de montacargas de 4 m (ver TODO.md)';

function move(L, id, x, z) {
  const m = L.maquinas.find((k) => k.id === id);
  if (m.x_plano === undefined) { m.x_plano = m.x; m.z_plano = m.z; }
  if (x != null) m.x = x;
  if (z != null) m.z = z;
  m._ajuste = nota;
}
const mapPts = (L, f) => L.flujos.forEach((fl) => (fl.puntos = fl.puntos.map(([x, z]) => f(x, z))));

// ---------------- planta: pasillos
const pl = read('planta.json');
if (!pl.zonas.some((z) => z.id === 'pasillo_oeste')) {
  const zn = pl.zonas.find((z) => z.id === 'pasillo_norte'); zn.d = 4.0;
  const zc = pl.zonas.find((z) => z.id === 'pasillo_central'); zc.w = 4.0;
  pl.zonas.splice(2, 0,
    { id: 'pasillo_oeste', nombre: 'Pasillo de montacargas oeste (4 m) · MP tubo y perfiles', tipo: 'pasillo_montacargas', x: 7.0, z: 16.0, w: 4.0, d: 18.0 },
    { id: 'pasillo_sur', nombre: 'Pasillo de montacargas sur (4 m) · MP tela', tipo: 'pasillo_montacargas', x: 27.75, z: 29.9, w: 26.5, d: 4.0 });
  write('planta.json', pl);
}

// ---------------- layout actual
const A = read('layout_actual.json');
if (!A.maquinas.some((m) => m._ajuste)) {
  for (let i = 1; i <= 8; i++) move(A, 'elevador_' + i, 47.3, null);
  move(A, 'mesa_tela_1', null, 25.4); move(A, 'mesa_tela_2', null, 25.4);
  move(A, 'entubadora_1', 38.5, 24.9); move(A, 'entubadora_2', 38.5, 26.9);
  mapPts(A, (x, z) => {
    if (x === 46.2) x = 47.3;
    if (x === 38.0 && z === 26.7) z = 25.9;
    if (z === 26.3) z = 25.4;
    return [x, z];
  });
  const op = A.operadores;
  op[3] = { x: 26.4, z: 22.9 }; op[4] = { x: 33.2, z: 22.9 }; op[5] = { x: 38.5, z: 24.1 }; op[6] = { x: 38.5, z: 27.6 };
  write('layout_actual.json', A);
}

// ---------------- layout propuesto
const B = read('layout_propuesto.json');
if (!B.maquinas.some((m) => m._ajuste)) {
  for (let i = 1; i <= 8; i++) move(B, 'elevador_' + i, 47.3, null);
  move(B, 'sierra_cassette', null, 12.5); move(B, 'sierra_bottom', null, 14.9); move(B, 'sierra_tubo', null, 17.4);
  move(B, 'mesa_tela_1', null, 25.4); move(B, 'mesa_tela_2', null, 25.4);
  move(B, 'mesa_tela_3', null, 20.5); move(B, 'mesa_tela_4', null, 20.5);
  for (const [id, z] of [['entubadora_3', 22.6], ['entubadora_4', 23.8], ['entubadora_1', 25.0], ['entubadora_2', 26.2], ['entubadora_respaldo', 27.4]]) move(B, id, null, z);
  move(B, 'ens_bottom', 39.6, null); move(B, 'ens_bottom_2', 39.6, null);
  mapPts(B, (x, z) => {
    if (x === 46.2) x = 47.3;
    if (x === 40.4) x = 39.6;
    if (z === 13) z = 12.5;
    if (z === 15.4) z = 14.9;
    if (x === 29.1 && z === 17.9) z = 17.4;
    if (x === 29.1 && z >= 22 && z <= 29) z = Math.round((z - 1) * 10) / 10;
    if (z === 24.5 && x === 20.6) z = 23.5;
    if (z === 24.5 && x === 29.1) z = 23.5;
    if (x === 34.8 && z === 26) z = 25.4;
    return [x, z];
  });
  B.flujos[0].puntos = [[2.9, 18.6], [23.3, 18.6], [29.1, 17.4], [29.1, 25.0]];
  B.flujos[1].puntos = [[18.8, 32.9], [20.6, 32.9], [20.6, 22.9], [29.1, 22.9], [29.1, 25.0]];
  const op = B.operadores;
  op[1] = { x: 32.5, z: 25.0 }; op[2] = { x: 20.6, z: 28.1 }; op[5] = { x: 39.6, z: 20.6 }; op[6] = { x: 44.6, z: 15.1 }; op[7] = { x: 44.6, z: 24.8 };
  write('layout_propuesto.json', B);
}
console.log('listo');
