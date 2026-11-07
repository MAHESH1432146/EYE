import { detectFixations } from './fixations.js';

export const METRIC_PARAMS = {
  aoiMargin: 0.02, // AOI is padded to absorb webcam gaze error
  minSamples: 10,
  minRateHz: 3,
  minBlinkTrackedMs: 5000, // blink rate is not reported from shorter observations
  regionGrid: { cols: 4, rows: 3 },
};

export const inAOI = (p, aoi, margin = METRIC_PARAMS.aoiMargin) =>
  p.x >= aoi.x - margin && p.x <= aoi.x + aoi.width + margin && p.y >= aoi.y - margin && p.y <= aoi.y + aoi.height + margin;

export function assessQuality(samples, calibrationQuality, faceLostMs = 0) {
  if (samples.length < METRIC_PARAMS.minSamples) return 'unavailable';
  const span = samples[samples.length - 1].t - samples[0].t;
  if (span <= 0) return 'unavailable';
  const rate = ((samples.length - 1) / span) * 1000;
  if (rate < METRIC_PARAMS.minRateHz) return 'unavailable';
  let q = rate >= 10 ? 'good' : rate >= 5 ? 'fair' : 'poor';
  if (calibrationQuality != null && calibrationQuality < 0.5) q = 'poor';
  if (faceLostMs / (span + faceLostMs) > 0.3) q = 'poor'; // face missing for over 30% of the task
  return q;
}

// Fixation count and dwell per grid cell over the stimulus; cells are row-major (row 0 = top).
export function regionSummary(fixations) {
  const { cols, rows } = METRIC_PARAMS.regionGrid;
  const cells = Array.from({ length: cols * rows }, (_, i) => ({ row: Math.floor(i / cols), col: i % cols, fixations: 0, dwell: 0, visits: 0 }));
  let last = -1; // cell of the previous fixation; a visit starts whenever the gaze enters a different cell
  for (const f of fixations) {
    if (f.x < 0 || f.x > 1 || f.y < 0 || f.y > 1) { last = -1; continue; } // fixations off the display belong to no region
    const idx = Math.min(rows - 1, Math.floor(f.y * rows)) * cols + Math.min(cols - 1, Math.floor(f.x * cols));
    const c = cells[idx];
    c.fixations += 1;
    c.dwell += f.duration;
    if (idx !== last) c.visits += 1;
    last = idx;
  }
  const total = cells.reduce((s, c) => s + c.dwell, 0);
  // revisits = returns to a region after leaving it (visits beyond the first)
  const withShare = cells.map(({ visits, ...c }) => ({ ...c, dwell: Math.round(c.dwell), share: total ? +(c.dwell / total).toFixed(3) : 0, revisits: Math.max(0, visits - 1) }));
  return { cols, rows, cells: withShare, totalRevisits: withShare.reduce((s, c) => s + c.revisits, 0), mostViewed: [...withShare].filter((c) => c.fixations > 0).sort((a, b) => b.dwell - a.dwell).slice(0, 3) };
}

const EMPTY_EXTRA = {
  totalFixations: null, totalDwell: null, avgFixationDuration: null, blinkCount: null, blinkRate: null, trackedMs: null, faceLostMs: null, regions: null,
  totalRevisits: null, interruptedMs: null, targetKind: 'none',
};

/**
 * Returns null metrics when data is insufficient (never invented values).
 * With adequate data: counts and dwell are real values (0 is a measured zero);
 * ttff === null then means the target was never fixated.
 * extra: { blinks: [{t, d}], faceLostMs, interruptions: [{t, d, reason}],
 *          target: { kind, test(fixation) } } - target comes from the task's app or region definition.
 */
export function computeMetrics(samples, aoi, calibrationQuality, extra = {}) {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const faceLostMs = extra.faceLostMs || 0;
  const dataQuality = assessQuality(sorted, calibrationQuality, faceLostMs);
  const empty = { ttff: null, fixationCount: null, dwellTime: null, revisitCount: null, dataQuality, ...EMPTY_EXTRA };
  if (dataQuality === 'unavailable') return empty;

  const fixations = detectFixations(sorted);
  const trackedMs = sorted[sorted.length - 1].t - sorted[0].t; // gaps while the face was lost contain no samples
  const blinks = extra.blinks || [];
  const regions = regionSummary(fixations);
  const general = {
    totalFixations: fixations.length,
    totalDwell: Math.round(fixations.reduce((s, f) => s + f.duration, 0)),
    avgFixationDuration: fixations.length ? Math.round(fixations.reduce((s, f) => s + f.duration, 0) / fixations.length) : null,
    blinkCount: blinks.length,
    blinkRate: trackedMs >= METRIC_PARAMS.minBlinkTrackedMs ? +((blinks.length / trackedMs) * 60000).toFixed(1) : null,
    trackedMs: Math.round(trackedMs),
    faceLostMs: Math.round(faceLostMs),
    regions,
    totalRevisits: regions.totalRevisits,
    interruptedMs: Math.round((extra.interruptions || []).reduce((s, i) => s + (i.d || 0), 0)),
  };
  const target = extra.target || (aoi ? { kind: 'region', test: (f) => inAOI(f, aoi) } : null);
  if (!target) return { ttff: null, fixationCount: null, dwellTime: null, revisitCount: null, dataQuality, ...general, targetKind: 'none' };

  const inside = fixations.map((f) => target.test(f));
  // Revisit = re-entries to the target after leaving it; consecutive on-target fixations are one visit.
  let visits = 0;
  inside.forEach((v, i) => { if (v && (i === 0 || !inside[i - 1])) visits++; });
  const hits = fixations.filter((_, i) => inside[i]);
  return {
    ttff: hits.length ? Math.round(hits[0].start) : null,
    fixationCount: hits.length,
    dwellTime: Math.round(hits.reduce((a, f) => a + f.duration, 0)),
    revisitCount: Math.max(0, visits - 1),
    dataQuality,
    ...general,
    targetKind: target.kind,
  };
}
