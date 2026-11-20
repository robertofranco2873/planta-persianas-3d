// Prueba móvil: emula un teléfono en horizontal con toques reales (CDP)
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__game && !document.getElementById('menu').classList.contains('hidden'), null, { timeout: 120000 });
await p.screenshot({ path: 'capturas/m_menu.png' });
await p.tap('#btnEnter');
await p.waitForTimeout(1500);
await p.screenshot({ path: 'capturas/m_juego.png' });
const cdp = await ctx.newCDPSession(p);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const before = await p.evaluate(() => ({ x: window.__game.player.pos.x, z: window.__game.player.pos.z, yaw: window.__game.player.camYaw }));
// joystick: tocar a la izquierda y empujar hacia arriba
await touch('touchStart', [[120, 300]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[120, 300 - i * 10]]); await p.waitForTimeout(30); }
await p.waitForTimeout(1500);
await p.screenshot({ path: 'capturas/m_joystick.png' });
await touch('touchEnd', []);
const mid = await p.evaluate(() => ({ x: window.__game.player.pos.x, z: window.__game.player.pos.z }));
// arrastrar a la derecha para girar la cámara
await touch('touchStart', [[600, 200]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[600 - i * 15, 200]]); await p.waitForTimeout(20); }
await touch('touchEnd', []);
await p.waitForTimeout(300);
const after = await p.evaluate(() => ({ yaw: window.__game.player.camYaw }));
console.log('avanzó', Math.hypot(mid.x - before.x, mid.z - before.z).toFixed(2), 'm · giro cámara', (after.yaw - before.yaw).toFixed(2), 'rad');
// botón Dron, luego Mapa
await p.evaluate(() => { const pl = window.__game.player; pl.pos.set(25.2, 0, 32.9); pl.resolve(); });
await p.waitForTimeout(800);
await p.screenshot({ path: 'capturas/m_prompt.png' });
await p.tap('#touchui .act');
await p.waitForTimeout(700);
await p.screenshot({ path: 'capturas/m_panel.png' });
await p.tap('.pclose');
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(500);
await p.screenshot({ path: 'capturas/m_vertical.png' });
console.log(errs.join('\n') || 'sin errores');
await b.close();
