import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, regionSummary } from '../services/eyeTracking/metrics.js';

const cluster = (x, y, t0, n) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 33, x: x + (i % 2) * 0.005, y }));

test('blink rate is per minute of tracked time and withheld for short recordings', () => {
  const long = [...cluster(0.2, 0.2, 0, 100), ...cluster(0.8, 0.8, 3300, 100)]; // ~6.6 s tracked
  const m = computeMetrics(long, null, 0.9, { blinks: [{ t: 500, d: 120 }, { t: 2500, d: 100 }, { t: 5000, d: 140 }] });
  assert.equal(m.blinkCount, 3);
  assert.ok(Math.abs(m.blinkRate - (3 / 6.6) * 60) < 1);
  const short = computeMetrics(cluster(0.2, 0.2, 0, 30), null, 0.9, { blinks: [{ t: 100, d: 100 }] });
  assert.equal(short.blinkCount, 1);
  assert.equal(short.blinkRate, null, 'too little tracked time to report a rate');
});

test('general metrics and regions come from real fixations', () => {
  const s = [...cluster(0.1, 0.1, 0, 15), ...cluster(0.9, 0.9, 600, 15)];
  const m = computeMetrics(s, null, 0.9);
  assert.equal(m.totalFixations, 2);
  assert.ok(m.totalDwell > 300);
  assert.equal(m.regions.mostViewed.length, 2);
  assert.equal(m.fixationCount, null, 'no AOI supplied, so target metrics are unavailable');
});

test('face lost for most of the task downgrades quality', () => {
  const m = computeMetrics(cluster(0.5, 0.5, 0, 30), null, 0.9, { faceLostMs: 5000 });
  assert.equal(m.dataQuality, 'poor');
});

test('regionSummary ignores off-stimulus fixations', () => {
  const r = regionSummary([{ x: 2, y: 2, duration: 500 }, { x: 0.1, y: 0.1, duration: 200 }]);
  assert.equal(r.cells.reduce((s, c) => s + c.fixations, 0), 1);
});
