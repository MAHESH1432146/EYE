import { useEffect, useRef } from 'react';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The participant's screen still when one exists; otherwise a neutral 16:9 screen-shaped grid.
async function loadBackground(src) {
  if (src) {
    try {
      const img = await loadImage(src);
      return { source: img, w: img.naturalWidth, h: img.naturalHeight };
    } catch { /* fall through to the placeholder */ }
  }
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const g = c.getContext('2d');
  g.fillStyle = '#e2e8f0';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#cbd5e1';
  g.lineWidth = 2;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo((c.width * i) / 4, 0); g.lineTo((c.width * i) / 4, c.height); g.stroke(); }
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(0, (c.height * i) / 3); g.lineTo(c.width, (c.height * i) / 3); g.stroke(); }
  return { source: c, w: c.width, h: c.height };
}

// Blue (low) -> green -> yellow -> red (high), transparent where attention is negligible.
function heatColor(v) {
  if (v < 0.04) return [0, 0, 0, 0];
  const stops = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]];
  const p = Math.min(0.999, v) * (stops.length - 1);
  const i = Math.floor(p);
  const f = p - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return [...c, Math.round(Math.min(0.75, 0.25 + v * 0.6) * 255)];
}

export function HeatmapView({ src, heatmap }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    loadBackground(src).then((img) => {
      if (cancelled || !ref.current) return;
      const c = ref.current;
      c.width = img.w;
      c.height = img.h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img.source, 0, 0);

      const layer = document.createElement('canvas');
      layer.width = heatmap.w;
      layer.height = heatmap.h;
      const lctx = layer.getContext('2d');
      const data = lctx.createImageData(heatmap.w, heatmap.h);
      heatmap.values.forEach((v, i) => data.data.set(heatColor(v), i * 4));
      lctx.putImageData(data, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(layer, 0, 0, c.width, c.height);
    });
    return () => { cancelled = true; };
  }, [src, heatmap]);
  return <canvas ref={ref} className="w-full rounded-lg border" role="img" aria-label="Gaze heatmap" />;
}

export function ScanPathView({ src, fixations, upTo = fixations.length }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    loadBackground(src).then((img) => {
      if (cancelled || !ref.current) return;
      const c = ref.current;
      c.width = img.w;
      c.height = img.h;
      const ctx = c.getContext('2d');
      const { width: W, height: H } = c;
      ctx.drawImage(img.source, 0, 0);

      const shown = fixations.slice(0, upTo);
      const unit = W / 1000;
      ctx.lineWidth = 2 * Math.max(1, unit);
      ctx.strokeStyle = 'rgba(124,58,237,0.7)';
      ctx.beginPath();
      shown.forEach((f, i) => (i ? ctx.lineTo(f.x * W, f.y * H) : ctx.moveTo(f.x * W, f.y * H)));
      ctx.stroke();

      shown.forEach((f) => {
        const r = Math.min(34, 10 + f.duration / 40) * Math.max(1, unit);
        ctx.beginPath();
        ctx.arc(f.x * W, f.y * H, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.45)';
        ctx.fill();
        ctx.strokeStyle = '#6d28d9';
        ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.round(14 * Math.max(1, unit))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(f.order), f.x * W, f.y * H);
        ctx.font = `${Math.round(11 * Math.max(1, unit))}px sans-serif`;
        ctx.fillText(`${Math.round(f.duration)}ms`, f.x * W, f.y * H + r + 10 * Math.max(1, unit));
      });
    });
    return () => { cancelled = true; };
  }, [src, fixations, upTo]);
  return <canvas ref={ref} className="w-full rounded-lg border" role="img" aria-label="Gaze scan path" />;
}
