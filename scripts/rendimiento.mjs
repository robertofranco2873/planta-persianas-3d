import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:5173/' + (process.argv[2] ?? ''));
await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
await p.evaluate(() => window.__game.enterGame());
const measure = async (label, setup) => {
  await p.evaluate(setup);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => new Promise((res) => { const g = window.__game; const f0 = g.renderer.info.render.frame; const t0 = performance.now(); setTimeout(() => res({ fps: ((g.renderer.info.render.frame - f0) / ((performance.now() - t0) / 1000)).toFixed(1), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, prof: Object.fromEntries(Object.entries(window.__prof).map(([k, v]) => [k, +v.toFixed(2)])) }), 3000); }));
  console.log(label, JSON.stringify(r));
};
const pos = (x, z, yaw, pitch, dist) => `(() => { const p = window.__game.player; p.pos.set(${x},0,${z}); p.camYaw=${yaw}; p.camPitch=${pitch}; p.camDist=${dist}; })()`;
await measure('vacia', `(() => { const g = window.__game; g.scene.children.forEach((c, i) => { if (i > 0) c.visible = false; }); })()`);
await p.evaluate(() => window.__game.scene.children.forEach((c) => (c.visible = true)));
await p.evaluate((q) => { const r = document.querySelector('input[name=q][value=baja]'); r.checked = true; r.dispatchEvent(new Event('change')); });
await measure('baja linea norender', pos(26, 21, 0.9, 0.55, 9) + ';window.__r = window.__game.renderer.render; window.__game.renderer.render = function(){ this.info.render.frame++; }');
await p.evaluate(() => { window.__game.renderer.render = window.__r; });
await p.setViewportSize({ width: 320, height: 180 });
await measure('baja linea 320px', pos(26, 21, 0.9, 0.55, 9));
await p.setViewportSize({ width: 1280, height: 720 });
await measure('baja linea sin minimapa', pos(26, 21, 0.9, 0.55, 9) + ';document.getElementById("minimap").getContext = () => ({clearRect(){},fillRect(){},strokeRect(){},save(){},restore(){},translate(){},rotate(){},setLineDash(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},fillText(){}})');
for (const q of ['alta', 'baja']) {
  await p.evaluate((q) => { const r = document.querySelector(`input[name=q][value=${q}]`); r.checked = true; r.dispatchEvent(new Event('change')); }, q);
  await measure(q + ' recepcion', pos(18, 38.9, 0, 0.3, 5));
  await measure(q + ' linea', pos(26, 21, 0.9, 0.55, 9));
  await measure(q + ' vista amplia', pos(52, 30, 0.8, 0.6, 16));
}
await b.close();
