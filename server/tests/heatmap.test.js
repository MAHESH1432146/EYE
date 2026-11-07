import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatmap } from '../services/eyeTracking/heatmap.js';

test('heatmap peaks at the gaze cluster and ignores off-stimulus points', () => {
  const pts = [...Array(20)].map(() => ({ x: 0.5, y: 0.5 }));
  pts.push({ x: 5, y: 5 });
  const hm = buildHeatmap(pts);
  assert.equal(hm.samplesUsed, 20);
  const peak = hm.values.indexOf(1);
  const px = peak % hm.w;
  const py = Math.floor(peak / hm.w);
  assert.ok(Math.abs(px - 0.5 * (hm.w - 1)) <= 1);
  assert.ok(Math.abs(py - 0.5 * (hm.h - 1)) <= 1);
  assert.equal(hm.values[0], 0);
});

test('empty input gives an all-zero grid', () => {
  assert.ok(buildHeatmap([]).values.every((v) => v === 0));
});
