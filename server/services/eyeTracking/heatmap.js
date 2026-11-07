export const GRID = { w: 80, h: 45 };

// Gaussian-smoothed 2D histogram of normalised gaze points; values are scaled to 0..1 by the peak.
export function buildHeatmap(points, { w = GRID.w, h = GRID.h, sigma = 2.5 } = {}) {
  const grid = new Float32Array(w * h);
  const r = Math.ceil(sigma * 3);
  let used = 0;
  for (const p of points) {
    if (!(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) continue; // off-stimulus gaze is not plotted
    used++;
    const cx = p.x * (w - 1);
    const cy = p.y * (h - 1);
    for (let y = Math.max(0, Math.floor(cy) - r); y <= Math.min(h - 1, Math.ceil(cy) + r); y++) {
      for (let x = Math.max(0, Math.floor(cx) - r); x <= Math.min(w - 1, Math.ceil(cx) + r); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        grid[y * w + x] += Math.exp(-d2 / (2 * sigma * sigma));
      }
    }
  }
  let max = 0;
  for (const v of grid) if (v > max) max = v;
  const values = Array.from(grid, (v) => (max ? +(v / max).toFixed(3) : 0));
  return { w, h, values, samplesUsed: used };
}
