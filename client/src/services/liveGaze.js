// Same I-DT algorithm and heatmap kernel as the server, so live numbers match the saved ones.
const DISPERSION = 0.05;
const MIN_DURATION_MS = 100;

const dispersion = (w) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of w) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return maxX - minX + (maxY - minY);
};

export function detectFixations(samples) {
  const out = [];
  let i = 0;
  while (i < samples.length) {
    let j = i;
    while (j < samples.length && samples[j].t - samples[i].t < MIN_DURATION_MS) j++;
    if (j >= samples.length) break;
    if (dispersion(samples.slice(i, j + 1)) <= DISPERSION) {
      while (j + 1 < samples.length && dispersion(samples.slice(i, j + 2)) <= DISPERSION) j++;
      const w = samples.slice(i, j + 1);
      out.push({
        order: out.length + 1, start: w[0].t, end: w[w.length - 1].t, duration: w[w.length - 1].t - w[0].t,
        x: w.reduce((a, s) => a + s.x, 0) / w.length, y: w.reduce((a, s) => a + s.y, 0) / w.length,
      });
      i = j + 1;
    } else i++;
  }
  return out;
}

export function buildHeatmap(points, w = 80, h = 45, sigma = 2.5) {
  const grid = new Float32Array(w * h);
  const r = Math.ceil(sigma * 3);
  for (const p of points) {
    if (!(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) continue;
    const cx = p.x * (w - 1), cy = p.y * (h - 1);
    for (let y = Math.max(0, Math.floor(cy) - r); y <= Math.min(h - 1, Math.ceil(cy) + r); y++) {
      for (let x = Math.max(0, Math.floor(cx) - r); x <= Math.min(w - 1, Math.ceil(cx) + r); x++) {
        grid[y * w + x] += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));
      }
    }
  }
  let max = 0;
  for (const v of grid) if (v > max) max = v;
  return { w, h, values: Array.from(grid, (v) => (max ? v / max : 0)) };
}
