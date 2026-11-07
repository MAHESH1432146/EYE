import { OS_LIST } from './dataset.js';

const NAMES = { windows: 'Windows 11', macos: 'macOS', linux: 'Linux (KDE Plasma)' };
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

function summarise(rows) {
  const ok = rows.filter((r) => r.isCorrect);
  const gaze = rows.filter((r) => r.metrics && r.metrics.dataQuality !== 'unavailable');
  const g = (k) => avg(gaze.map((r) => r.metrics[k]).filter((v) => v !== null && v !== undefined));
  return {
    n: rows.length, successRate: rows.length ? ok.length / rows.length : null, timeouts: rows.filter((r) => r.timedOut).length,
    time: avg(ok.map((r) => r.completionTime)), fixations: g('totalFixations'), dwell: g('totalDwell'), avgFix: g('avgFixationDuration'), blink: g('blinkRate'),
    gazeN: gaze.length,
  };
}

// Higher completion first, then faster completion, then fewer fixations (a more efficient search); missing values rank last.
function rank(entries) {
  const key = (v, fallback) => (v === null || v === undefined ? fallback : v);
  return [...entries].sort((a, b) =>
    key(b.s.successRate, -1) - key(a.s.successRate, -1) || key(a.s.time, Infinity) - key(b.s.time, Infinity) || key(a.s.fixations, Infinity) - key(b.s.fixations, Infinity));
}

// Explains why `poor` did worse than `best`, using only measured values (no invented numbers).
export function explain(best, poor) {
  const out = [];
  const b = best.s, p = poor.s;
  if (b.successRate !== null && p.successRate !== null && b.successRate - p.successRate >= 0.1) out.push(`Lower self-reported completion rate (${Math.round(p.successRate * 100)}% vs ${Math.round(b.successRate * 100)}%).`);
  if (p.timeouts > b.timeouts) out.push(`More timeouts (${p.timeouts} vs ${b.timeouts}), so the element was often not found in time.`);
  if (b.time !== null && p.time !== null && p.time > b.time * 1.2) out.push(`Slower to complete: ${(p.time / 1000).toFixed(1)} s vs ${(b.time / 1000).toFixed(1)} s (${(p.time / b.time).toFixed(1)}x).`);
  if (b.fixations !== null && p.fixations !== null && p.fixations > b.fixations * 1.3) out.push(`More fixations per task (${p.fixations.toFixed(1)} vs ${b.fixations.toFixed(1)}), suggesting a longer, less direct visual search.`);
  if (b.dwell !== null && p.dwell !== null && p.dwell > b.dwell * 1.3) out.push(`Longer total dwell time (${Math.round(p.dwell)} ms vs ${Math.round(b.dwell)} ms), suggesting more time spent studying the interface.`);
  if (b.avgFix !== null && p.avgFix !== null && p.avgFix > b.avgFix * 1.3) out.push(`Longer average fixations (${Math.round(p.avgFix)} ms vs ${Math.round(b.avgFix)} ms), a sign of higher processing effort.`);
  if (!out.length) out.push('Differences are small on the measured values.');
  return out;
}

/** Per-task and overall best/poorest OS from stored data; optionally restricted to one participant. */
export function recommend(ds, { participantId } = {}) {
  const rows = ds.rows.filter((r) => !participantId || r.participantId === participantId);
  const sus = ds.susRows.filter((r) => !participantId || r.participantId === participantId);

  const byOS = (subset) => OS_LIST.map((os) => ({ os, name: NAMES[os], s: summarise(subset.filter((r) => r.os === os)) })).filter((e) => e.s.n > 0);

  const tasks = [...new Set(rows.map((r) => r.taskNumber))].sort((a, b) => a - b).map((taskNumber) => {
    const subset = rows.filter((r) => r.taskNumber === taskNumber);
    const ranking = rank(byOS(subset));
    const comparable = ranking.length >= 2;
    return {
      taskNumber, instruction: subset[0]?.instruction, ranking: ranking.map((e) => ({ os: e.os, name: e.name, ...e.s })),
      best: comparable ? ranking[0].os : null, poorest: comparable ? ranking[ranking.length - 1].os : null,
      reasons: comparable ? explain(ranking[0], ranking[ranking.length - 1]) : [],
    };
  });

  const overall = rank(byOS(rows));
  const susBy = Object.fromEntries(OS_LIST.map((os) => [os, avg(sus.filter((r) => r.os === os).map((r) => r.score))]));
  const comparable = overall.length >= 2;
  const reasons = comparable ? explain(overall[0], overall[overall.length - 1]) : [];
  const worst = overall[overall.length - 1];
  if (comparable && susBy[overall[0].os] !== null && susBy[worst.os] !== null && susBy[overall[0].os] - susBy[worst.os] >= 5) {
    reasons.push(`Lower perceived usability (SUS ${susBy[worst.os].toFixed(1)} vs ${susBy[overall[0].os].toFixed(1)}).`);
  }
  return {
    scope: participantId ? 'participant' : 'all participants',
    overall: { ranking: overall.map((e) => ({ os: e.os, name: e.name, sus: susBy[e.os], ...e.s })), best: comparable ? overall[0].os : null, poorest: comparable ? worst.os : null, reasons },
    tasks,
    note: 'Automatically generated from stored measurements. Rankings use self-reported completion, then completion time, then fixations per task. Small samples and approximate webcam gaze limit confidence.',
  };
}
