import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFixations } from '../services/eyeTracking/fixations.js';
import { computeMetrics } from '../services/eyeTracking/metrics.js';

// 30 Hz stream: n samples around (x, y) starting at t0
const cluster = (x, y, t0, n) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 33, x: x + (i % 2) * 0.005, y }));

const aoi = { x: 0.7, y: 0.7, width: 0.1, height: 0.1 };

test('detects separate fixations', () => {
  const f = detectFixations([...cluster(0.2, 0.2, 0, 15), ...cluster(0.8, 0.8, 600, 15)]);
  assert.equal(f.length, 2);
  assert.ok(f[0].duration >= 100);
});

test('metrics: TTFF, dwell, revisit', () => {
  const s = [...cluster(0.2, 0.2, 0, 15), ...cluster(0.75, 0.75, 600, 15), ...cluster(0.2, 0.5, 1200, 15), ...cluster(0.75, 0.75, 1800, 15)];
  const m = computeMetrics(s, aoi, 0.9);
  assert.equal(m.ttff, 600);
  assert.equal(m.fixationCount, 2);
  assert.equal(m.revisitCount, 1);
  assert.ok(m.dwellTime > 400);
  assert.equal(m.dataQuality, 'good');
});

test('target never fixated: ttff null but counts are real zeros', () => {
  const m = computeMetrics(cluster(0.1, 0.1, 0, 30), aoi, 0.9);
  assert.equal(m.ttff, null);
  assert.equal(m.fixationCount, 0);
  assert.equal(m.revisitCount, 0);
});

test('insufficient data yields unavailable, not zeros', () => {
  const m = computeMetrics(cluster(0.75, 0.75, 0, 3), aoi, 0.9);
  assert.equal(m.dataQuality, 'unavailable');
  assert.equal(m.fixationCount, null);
  assert.equal(m.ttff, null);
});
