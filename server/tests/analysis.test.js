import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseMetric } from '../services/statistics/analysis.js';
import { observations } from '../services/analytics/dataset.js';

const sus = (id, os, score, primaryOS = 'windows') => ({ participantId: id, os, score, isPrimary: os === primaryOS, primaryOS });

test('same participants across OS use repeated-measures methods', () => {
  const susRows = [];
  for (let i = 0; i < 8; i++) {
    susRows.push(sus(`p${i}`, 'windows', 80 + i), sus(`p${i}`, 'macos', 60 + i), sus(`p${i}`, 'linux', 40 + i));
  }
  const r = analyseMetric({ rows: [], susRows }, 'susScore');
  assert.match(r.osComparison.design, /repeated/);
  assert.equal(r.osComparison.omnibus.test, 'Friedman');
  assert.ok(r.osComparison.omnibus.p < 0.01);
  assert.equal(r.osComparison.posthoc.length, 3);
});

test('disjoint participants use independent-group methods', () => {
  const susRows = [];
  for (let i = 0; i < 5; i++) {
    susRows.push(sus(`a${i}`, 'windows', 80 + i), sus(`b${i}`, 'macos', 60 + i), sus(`c${i}`, 'linux', 40 + i));
  }
  const r = analyseMetric({ rows: [], susRows }, 'susScore');
  assert.equal(r.osComparison.omnibus.test, 'Kruskal-Wallis');
});

test('no data gives insufficient results, not invented numbers', () => {
  const r = analyseMetric({ rows: [], susRows: [] }, 'susScore');
  assert.equal(r.osComparison.omnibus.status, 'insufficient');
  assert.equal(r.familiarVsUnfamiliar.omnibus.status, 'insufficient');
});

test('unavailable gaze metrics are excluded rather than zero-filled', () => {
  const row = (q, v) => ({ participantId: 'p', os: 'windows', taskNumber: 1, isCorrect: true, completionTime: 1000, isPrimary: false, metrics: { dataQuality: q, totalFixations: v } });
  const obs = observations({ rows: [row('unavailable', null), row('good', 0), row('good', 3)], susRows: [] }, 'fixationCount');
  assert.deepEqual(obs.map((o) => o.value), [0, 3]);
});
