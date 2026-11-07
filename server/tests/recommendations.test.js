import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../services/analytics/recommendations.js';

const row = (os, ok, time, fixations, timedOut = false) => ({
  participantId: `p-${os}`, os, taskNumber: 1, instruction: 'Open the file manager.', isCorrect: ok, timedOut, completionTime: time,
  metrics: fixations === null ? null : { dataQuality: 'good', totalFixations: fixations, totalDwell: fixations * 250, avgFixationDuration: 250, blinkRate: 15 },
});

test('ranks OS per task and explains the weakest one from measured values', () => {
  const ds = { rows: [row('windows', true, 15000, 10), row('macos', true, 25000, 20), row('linux', false, 120000, 60, true)], susRows: [] };
  const r = recommend(ds);
  assert.equal(r.tasks[0].best, 'windows');
  assert.equal(r.tasks[0].poorest, 'linux');
  assert.ok(r.tasks[0].reasons.some((x) => /completion rate/.test(x)));
  assert.ok(r.tasks[0].reasons.some((x) => /More fixations/.test(x)));
  assert.equal(r.overall.best, 'windows');
});

test('no comparison is made from a single OS', () => {
  const r = recommend({ rows: [row('windows', true, 10000, 10)], susRows: [] });
  assert.equal(r.overall.best, null);
  assert.deepEqual(r.tasks[0].reasons, []);
});
