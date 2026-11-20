// Gráficas SVG simples hechas a mano.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const C = { grid: 'rgba(159,147,140,0.35)', txt: '#d9d4cf', a: '#F1C40F', b: '#2E75B6', c: '#C0392B', d: '#9F938C' };

export function hbars(items: { label: string; value: number; color?: string; text?: string }[], opts: { w?: number; unit?: string; ref?: { value: number; label: string } } = {}) {
  const w = opts.w ?? 400, rowH = 26, left = 128, right = 64;
  const h = items.length * rowH + 14 + (opts.ref ? 16 : 0);
  const max = Math.max(...items.map((i) => i.value), opts.ref?.value ?? 0) || 1;
  const sx = (v: number) => left + (v / max) * (w - left - right);
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">`;
  items.forEach((it, i) => {
    const y = 6 + i * rowH;
    s += `<text x="${left - 6}" y="${y + 15}" text-anchor="end" font-size="11.5" fill="${C.txt}">${esc(it.label)}</text>`;
    s += `<rect x="${left}" y="${y + 3}" width="${Math.max(1, sx(it.value) - left)}" height="${rowH - 9}" rx="3" fill="${it.color ?? C.a}"/>`;
    s += `<text x="${sx(it.value) + 5}" y="${y + 15}" font-size="11.5" fill="${C.txt}">${esc(it.text ?? String(it.value))}</text>`;
  });
  if (opts.ref) {
    const x = sx(opts.ref.value);
    s += `<line x1="${x}" x2="${x}" y1="4" y2="${h - 16}" stroke="${C.c}" stroke-width="2" stroke-dasharray="4 3"/>`;
    s += `<text x="${x}" y="${h - 3}" text-anchor="middle" font-size="11" fill="${C.c}">${esc(opts.ref.label)}</text>`;
  }
  return s + '</svg>';
}

/** Barras agrupadas: categorías × series. */
export function groupedBars(cats: string[], series: { name: string; color: string; values: number[]; fmt?: (v: number) => string }[], w = 400) {
  const h = 210, top = 26, bottom = 40, left = 10;
  const gw = (w - left * 2) / cats.length;
  const bw = (gw - 18) / series.length;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">`;
  series.forEach((se, k) => {
    s += `<rect x="${left + k * 110}" y="4" width="12" height="12" fill="${se.color}"/><text x="${left + k * 110 + 16}" y="14" font-size="12" fill="${C.txt}">${esc(se.name)}</text>`;
  });
  cats.forEach((c, i) => {
    const max = Math.max(...series.map((se) => se.values[i])) || 1;
    const x0 = left + i * gw + 9;
    series.forEach((se, k) => {
      const v = se.values[i];
      const bh = (v / max) * (h - top - bottom - 16);
      const x = x0 + k * bw, y = h - bottom - bh;
      s += `<rect x="${x}" y="${y}" width="${bw - 4}" height="${bh}" rx="3" fill="${se.color}"/>`;
      s += `<text x="${x + (bw - 4) / 2}" y="${y - 4}" text-anchor="middle" font-size="10.5" fill="${C.txt}">${esc(se.fmt ? se.fmt(v) : String(v))}</text>`;
    });
    s += `<text x="${x0 + (gw - 18) / 2}" y="${h - bottom + 16}" text-anchor="middle" font-size="11" fill="${C.txt}">${esc(c)}</text>`;
  });
  s += `<line x1="${left}" x2="${w - left}" y1="${h - bottom}" y2="${h - bottom}" stroke="${C.grid}"/>`;
  return s + '</svg>';
}

/** Línea con puntos. xs/ys numéricos. */
export function lineChart(pts: [number, number][], opts: { w?: number; xLabel?: string; yLabel?: string; yMax?: number; fmtY?: (v: number) => string; color?: string } = {}) {
  const w = opts.w ?? 400, h = 210, l = 40, r = 14, t = 14, b = 34;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yMax = opts.yMax ?? Math.max(...ys);
  const X = (v: number) => l + ((v - x0) / (x1 - x0 || 1)) * (w - l - r);
  const Y = (v: number) => h - b - (v / (yMax || 1)) * (h - t - b);
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">`;
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    s += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}"/><text x="${l - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="${C.txt}">${esc(opts.fmtY ? opts.fmtY(v) : String(Math.round(v)))}</text>`;
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  s += `<path d="${d}" fill="none" stroke="${opts.color ?? C.a}" stroke-width="2.5"/>`;
  pts.forEach((p) => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="${opts.color ?? C.a}"/><text x="${X(p[0])}" y="${h - b + 14}" text-anchor="middle" font-size="10" fill="${C.txt}">${p[0]}</text>`; });
  if (opts.xLabel) s += `<text x="${(l + w - r) / 2}" y="${h - 4}" text-anchor="middle" font-size="11" fill="${C.txt}">${esc(opts.xLabel)}</text>`;
  if (opts.yLabel) s += `<text x="4" y="10" font-size="11" fill="${C.txt}">${esc(opts.yLabel)}</text>`;
  return s + '</svg>';
}

/** Barra apilada manual vs máquina (MOST). */
export function stackBar(parts: { label: string; value: number; color: string }[], w = 400) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let x = 0;
  let s = `<svg viewBox="0 0 ${w} 58" width="100%" role="img">`;
  parts.forEach((p) => {
    const pw = (p.value / total) * w;
    s += `<rect x="${x}" y="4" width="${pw}" height="26" fill="${p.color}"/>`;
    if (pw > 50) s += `<text x="${x + pw / 2}" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="#111">${p.value} s</text>`;
    x += pw;
  });
  x = 0;
  parts.forEach((p, i) => { s += `<rect x="${i * 170}" y="40" width="11" height="11" fill="${p.color}"/><text x="${i * 170 + 15}" y="50" font-size="11.5" fill="${C.txt}">${esc(p.label)}</text>`; });
  return s + '</svg>';
}

export const COLORS = C;
