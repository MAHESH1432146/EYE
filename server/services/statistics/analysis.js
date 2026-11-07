import { describe } from '../statistics/descriptive.js';
import { ALPHA, dunn, friedman, kruskalWallis, levene, shapiroWilk, wilcoxonSignedRank } from '../statistics/hypothesisTests.js';
import { METRICS, OS_LIST, observations, perParticipant } from '../analytics/dataset.js';

const MIN_RELIABLE_N = 10;

const clean = (r) => {
  if (!r) return r;
  const { _meta, ...rest } = r;
  return rest;
};

function interpret(result, n) {
  if (!result || result.status !== 'ok') return `Not enough data for inference${result?.note ? ` (${result.note})` : ''}.`;
  const sig = result.p < ALPHA;
  const small = n < MIN_RELIABLE_N ? ' Sample is small (n < 10); treat as exploratory only.' : '';
  const es = result.effectSize ? ` ${result.effectSize.name} = ${result.effectSize.value.toFixed(3)}.` : '';
  return (sig
    ? `Automatic interpretation: a statistically significant difference was detected (p = ${result.p.toPrecision(3)}).${es}`
    : `Automatic interpretation: no statistically significant difference was detected (p = ${result.p.toPrecision(3)}); this does not demonstrate equivalence.${es}`) + small;
}

function holm(pairs) {
  const m = pairs.length;
  return pairs.map((p) => (p.status === 'ok' ? { ...p, pAdjusted: Math.min(1, p.p * m), significant: Math.min(1, p.p * m) < ALPHA, correction: 'Bonferroni' } : p));
}

function normalityAndVariance(groups) {
  const normality = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, shapiroWilk(v)]));
  return { normality, levene: levene(Object.values(groups)) };
}

function compareOS(pp) {
  const byOS = {};
  for (const os of OS_LIST) {
    const rows = pp.filter((r) => r.os === os);
    if (rows.length) byOS[os] = rows;
  }
  const osWithData = Object.keys(byOS);
  const valuesBy = Object.fromEntries(osWithData.map((os) => [os, byOS[os].map((r) => r.value)]));
  const descriptives = Object.fromEntries(osWithData.map((os) => [os, describe(valuesBy[os])]));
  const { normality, levene: lev } = normalityAndVariance(valuesBy);

  const counts = new Map();
  pp.forEach((r) => counts.set(r.participantId, (counts.get(r.participantId) || 0) + 1));
  const repeated = [...counts.values()].some((c) => c > 1);
  const design = repeated ? 'repeated-measures (same participants across OS)' : 'independent groups';

  const lookup = Object.fromEntries(osWithData.map((os) => [os, new Map(byOS[os].map((r) => [r.participantId, r.value]))]));
  let omnibus = null;
  let posthoc = [];
  let n = 0;

  if (osWithData.length < 2) {
    omnibus = { status: 'insufficient', note: 'Need data from at least two operating systems' };
  } else if (repeated) {
    const pairs = [];
    for (let i = 0; i < osWithData.length; i++) for (let j = i + 1; j < osWithData.length; j++) pairs.push([osWithData[i], osWithData[j]]);
    const pairwise = pairs.map(([a, b]) => {
      const ids = [...lookup[a].keys()].filter((id) => lookup[b].has(id));
      return { comparison: `${a} vs ${b}`, ...wilcoxonSignedRank(ids.map((id) => lookup[a].get(id)), ids.map((id) => lookup[b].get(id))) };
    });
    if (osWithData.length >= 3) {
      const complete = [...lookup[osWithData[0]].keys()].filter((id) => osWithData.every((os) => lookup[os].has(id)));
      n = complete.length;
      omnibus = friedman(complete.map((id) => osWithData.map((os) => lookup[os].get(id))));
      posthoc = holm(pairwise);
    } else {
      omnibus = pairwise[0];
      n = omnibus.n || 0;
    }
  } else {
    const kw = kruskalWallis(valuesBy);
    omnibus = clean(kw);
    posthoc = dunn(kw);
    n = kw.n || 0;
  }
  return {
    design, n, descriptives, normality, levene: lev, omnibus: clean(omnibus), posthoc,
    interpretation: interpret(omnibus, n),
    notes: [
      repeated
        ? 'Observations are averaged per participant and compared with repeated-measures methods (Friedman, Wilcoxon signed-rank); dependent data are not treated as independent.'
        : 'Participants appear in one OS only, so independent-group methods (Kruskal-Wallis, Dunn) are used.',
    ],
  };
}

function comparePrimaryGroups(pp) {
  const perPerson = new Map();
  pp.forEach((r) => {
    if (!r.primaryOS) return;
    const cur = perPerson.get(r.participantId) || { primaryOS: r.primaryOS, v: [] };
    cur.v.push(r.value);
    perPerson.set(r.participantId, cur);
  });
  const groups = {};
  perPerson.forEach(({ primaryOS, v }) => { (groups[primaryOS] ||= []).push(v.reduce((a, b) => a + b, 0) / v.length); });
  const descriptives = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, describe(v)]));
  const kw = kruskalWallis(groups);
  const n = Object.values(groups).flat().length;
  return {
    design: 'independent groups (participants grouped by declared primary OS)', n, descriptives,
    ...normalityAndVariance(groups), omnibus: clean(kw), posthoc: dunn(kw), interpretation: interpret(kw, n),
  };
}

function compareFamiliarity(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const cur = by.get(r.participantId) || { p: [], u: [] };
    (r.isPrimary ? cur.p : cur.u).push(r.value);
    by.set(r.participantId, cur);
  });
  const both = [...by.values()].filter((x) => x.p.length && x.u.length);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const x = both.map((b) => avg(b.p));
  const y = both.map((b) => avg(b.u));
  const w = wilcoxonSignedRank(x, y);
  return {
    design: 'paired (each participant: primary OS vs mean of non-primary OS)', n: both.length,
    descriptives: { primary: describe(x), nonPrimary: describe(y) }, omnibus: w, interpretation: interpret(w, both.length),
  };
}

export function analyseMetric(ds, metric, group = 'all') {
  if (!METRICS[metric]) throw new Error('Unknown metric');
  const obs = observations(ds, metric, group);
  const pp = perParticipant(obs);
  const allObs = observations(ds, metric, 'all');
  const familiarRows = allObs.map((o) => ({ participantId: o.participantId, isPrimary: o.isPrimary, value: o.value }));
  return {
    metric, label: METRICS[metric].label, group, observations: obs.length,
    osComparison: compareOS(pp),
    primaryOSGroups: comparePrimaryGroups(perParticipant(allObs)),
    familiarVsUnfamiliar: compareFamiliarity(familiarRows),
    caveats: [
      'Webcam gaze is an approximation and not equivalent to Gazepoint GP3 HD measurements.',
      'Significance is only reported when sample size supports the test; small samples are exploratory.',
    ],
  };
}
