// Capturas de verificación: node scripts/capturas.mjs [url] [carpeta]
// Usa el Chrome/Edge instalado (playwright-core, sin descargar navegadores).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'capturas';
const only = process.argv[4];
fs.mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game && !document.getElementById('menu').classList.contains('hidden'), null, { timeout: 120000 });
await page.evaluate(() => window.__game.enterGame());

const shots = [
  { name: 'recepcion', x: 18.0, z: 38.9, yaw: 0, pitch: 0.3, dist: 5 },
  { name: 'linea', x: 26, z: 21, yaw: 0.9, pitch: 0.55, dist: 9 },
  { name: 'andenes', x: 53, z: 14, yaw: -1.2, pitch: 0.45, dist: 8 },
  { name: 'aereo', drone: true, x: 30, y: 45, z: 62, yaw: 0, pitch: -0.75 },
];
for (const layout of ['actual', 'propuesto']) {
  await page.evaluate((l) => { const g = window.__game; if (g.lm.active !== l) g.setLayout(l); }, layout);
  await page.waitForFunction(() => !window.__game.lm.transitioning, null, { timeout: 60000 });
  for (const s of shots) {
    if (only && !s.name.includes(only)) continue;
    await page.evaluate((s) => {
      const g = window.__game, p = g.player;
      if (s.drone) { if (!p.drone) p.setDrone(true); p.dronePos.set(s.x, s.y, s.z); p.droneYaw = s.yaw; p.dronePitch = s.pitch; }
      else { if (p.drone) p.setDrone(false); p.pos.set(s.x, 0, s.z); p.camYaw = s.yaw; p.camPitch = s.pitch; p.camDist = s.dist; p.resolve(); }
    }, s);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${layout}_${s.name}.png` });
  }
}
// extras: flujos + escenario B, panel de máquina, NPC, libreta y mapa grande
if (!only || only === 'extras') {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => { const g = window.__game; g.lm.setFlows(true); g.lm.toggleB(); const p = g.player; if (!p.drone) p.setDrone(true); p.dronePos.set(32, 30, 48); p.droneYaw = 0; p.dronePitch = -0.95; });
  await page.waitForFunction(() => !window.__game.lm.transitioning, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/propuesto_flujos_B.png` });
  await ev(() => { const g = window.__game; g.lm.setFlows(false); g.player.setDrone(false); const m = g.lm.machines.get('mesa_tela_1'); g.player.pos.set(m.cur.x, 0, m.cur.z + 3.3); g.player.camYaw = 0.3; g.player.camPitch = 0.4; g.player.camDist = 5; g.player.resolve(); });
  await page.waitForTimeout(600);
  await ev(() => window.__game.interact());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/panel_maquina.png` });
  await ev(() => window.__game.interact());
  await ev(() => { const g = window.__game; const t = g.props.targets.find((x) => x.key === 'i:tablero_produccion'); const p = t.pos(); g.player.pos.set(p.x, 0, p.z - 1.0); g.player.camYaw = Math.PI; g.player.camPitch = 0.15; g.player.camDist = 4; g.player.resolve(); });
  await page.waitForTimeout(600);
  await ev(() => window.__game.interact());
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/panel_tablero.png` });
  await ev(() => window.__game.interact());
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/libreta.png` });
  await page.keyboard.press('Tab');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/mapa.png` });
  await page.keyboard.press('KeyM');
}
const info = await page.evaluate(() => ({ ...window.__game.stats(), fps: 0 }));
console.log('render info', JSON.stringify(info));
console.log(errors.slice(0, 30).join('\n') || 'sin errores de consola');
await browser.close();
