import { chiSquareSf, fSf, normalInv, normalSf } from './distributions.js';
import { mean, median } from './descriptive.js';

export const ALPHA = 0.05;

// Average ranks (ties share the mean rank). Returns ranks aligned to the input and tie group sizes.
export function rankWithTies(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  const ties = [];
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
    ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, ties };
}
const tieTerm = (ties) => ties.reduce((s, t) => s + (t ** 3 - t), 0);
const poly = (c, x) => c.reduce((acc, ci, i) => acc + ci * x ** i, 0);

/** Shapiro-Wilk W with Royston (1995) p-value approximation; valid for 3 <= n <= 5000. */
export function shapiroWilk(values) {
  const x = [...values].sort((a, b) => a - b);
  const n = x.length;
  if (n < 3 || n > 5000) return { test: 'Shapiro-Wilk', status: 'insufficient', note: 'Requires 3 to 5000 observations' };
  if (x[n - 1] - x[0] === 0) return { test: 'Shapiro-Wilk', status: 'insufficient', note: 'All values identical' };

  const nn2 = Math.floor(n / 2);
  const m = Array.from({ length: nn2 }, (_, i) => normalInv((i + 1 - 0.375) / (n + 0.25)));
  const a = new Array(nn2);
  if (n === 3) {
    a[0] = Math.SQRT1_2;
  } else {
    const summ2 = 2 * m.reduce((s, v) => s + v * v, 0);
    const ss = Math.sqrt(summ2);
    const rsn = 1 / Math.sqrt(n);
    const a1 = poly([0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], rsn) - m[0] / ss;
    let fac;
    if (n > 5) {
      const a2 = -m[1] / ss + poly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], rsn);
      fac = Math.sqrt((summ2 - 2 * m[0] ** 2 - 2 * m[1] ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2));
      a[0] = a1; a[1] = a2;
      for (let i = 2; i < nn2; i++) a[i] = -m[i] / fac;
    } else {
      fac = Math.sqrt((summ2 - 2 * m[0] ** 2) / (1 - 2 * a1 ** 2));
      a[0] = a1;
      for (let i = 1; i < nn2; i++) a[i] = -m[i] / fac;
    }
  }
  let num = 0;
  for (let i = 0; i < nn2; i++) num += a[i] * (x[n - 1 - i] - x[i]);
  const mu = mean(x);
  const den = x.reduce((s, v) => s + (v - mu) ** 2, 0);
  const w = Math.min(1, (num * num) / den);

  let p;
  if (n === 3) {
    p = Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.PI / 3));
  } else {
    const y = Math.log(1 - w);
    const lx = Math.log(n);
    let mm, s, yy = y;
    if (n <= 11) {
      const gamma = -2.273 + 0.459 * n;
      if (y >= gamma) return { test: 'Shapiro-Wilk', status: 'ok', statistic: w, p: 1e-99, n, normal: false };
      yy = -Math.log(gamma - y);
      mm = poly([0.544, -0.39978, 0.025054, -6.714e-4], n);
      s = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
      mm = poly([-1.5861, -0.31082, -0.083751, 0.0038915], lx);
      s = Math.exp(poly([-0.4803, -0.082676, 0.0030302], lx));
    }
    p = normalSf((yy - mm) / s);
  }
  return { test: 'Shapiro-Wilk', status: 'ok', statistic: w, p, n, normal: p >= ALPHA };
}

/** Brown-Forsythe variant of Levene's test (deviations from the group median). */
export function levene(groups) {
  const g = groups.filter((x) => x.length > 0);
  const k = g.length;
  const N = g.reduce((s, x) => s + x.length, 0);
  if (k < 2 || g.some((x) => x.length < 2)) return { test: "Levene's (median-centred)", status: 'insufficient', note: 'Needs >= 2 groups with >= 2 observations' };
  const z = g.map((x) => { const m = median(x); return x.map((v) => Math.abs(v - m)); });
  const zbar = z.map(mean);
  const grand = mean(z.flat());
  const between = z.reduce((s, zi, i) => s + zi.length * (zbar[i] - grand) ** 2, 0);
  const within = z.reduce((s, zi, i) => s + zi.reduce((a, v) => a + (v - zbar[i]) ** 2, 0), 0);
  if (within === 0) return { test: "Levene's (median-centred)", status: 'insufficient', note: 'No within-group variation' };
  const F = (between / (k - 1)) / (within / (N - k));
  const p = fSf(F, k - 1, N - k);
  return { test: "Levene's (median-centred)", status: 'ok', statistic: F, df: [k - 1, N - k], p, equalVariances: p >= ALPHA };
}

/** Kruskal-Wallis H (tie-corrected) for independent groups, with epsilon-squared effect size. */
export function kruskalWallis(groupMap) {
  const names = Object.keys(groupMap).filter((k) => groupMap[k].length > 0);
  const k = names.length;
  const sizes = names.map((n) => groupMap[n].length);
  const N = sizes.reduce((a, b) => a + b, 0);
  if (k < 2 || sizes.some((s) => s < 2)) return { test: 'Kruskal-Wallis', status: 'insufficient', note: 'Needs >= 2 groups with >= 2 observations each' };
  const { ranks, ties } = rankWithTies(names.flatMap((n) => groupMap[n]));
  const C = 1 - tieTerm(ties) / (N ** 3 - N);
  if (C === 0) return { test: 'Kruskal-Wallis', status: 'insufficient', note: 'All values identical' };
  let off = 0;
  const rankSums = sizes.map((s) => { const r = ranks.slice(off, off + s).reduce((a, b) => a + b, 0); off += s; return r; });
  const H = ((12 / (N * (N + 1))) * rankSums.reduce((s, r, i) => s + (r * r) / sizes[i], 0) - 3 * (N + 1)) / C;
  return {
    test: 'Kruskal-Wallis', status: 'ok', statistic: H, df: k - 1, p: chiSquareSf(H, k - 1), n: N,
    effectSize: { name: 'epsilon-squared', value: (H * (N + 1)) / (N * N - 1) },
    _meta: { names, sizes, rankSums, ranks, ties, N },
  };
}

/** Dunn's post-hoc test (tie-corrected z) with Bonferroni adjustment, from a Kruskal-Wallis result. */
export function dunn(kw) {
  if (kw.status !== 'ok') return [];
  const { names, sizes, rankSums, ties, N } = kw._meta;
  const sigma2 = (N * (N + 1)) / 12 - tieTerm(ties) / (12 * (N - 1));
  const pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs.push([i, j]);
  return pairs.map(([i, j]) => {
    const z = (rankSums[i] / sizes[i] - rankSums[j] / sizes[j]) / Math.sqrt(sigma2 * (1 / sizes[i] + 1 / sizes[j]));
    const p = 2 * normalSf(Math.abs(z));
    const pAdj = Math.min(1, p * pairs.length);
    return { comparison: `${names[i]} vs ${names[j]}`, statistic: z, p, pAdjusted: pAdj, significant: pAdj < ALPHA, correction: 'Bonferroni' };
  });
}

/** Wilcoxon signed-rank test (normal approximation with tie and continuity corrections). */
export function wilcoxonSignedRank(x, y) {
  const d = x.map((v, i) => v - y[i]).filter((v) => v !== 0);
  const n = d.length;
  const label = 'Wilcoxon signed-rank';
  if (n < 6) return { test: label, status: 'insufficient', note: `Only ${n} non-zero paired differences (needs >= 6)`, n };
  const { ranks, ties } = rankWithTies(d.map(Math.abs));
  const wPlus = d.reduce((s, v, i) => (v > 0 ? s + ranks[i] : s), 0);
  const total = (n * (n + 1)) / 2;
  const mu = total / 2;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieTerm(ties) / 48;
  const z = (Math.abs(wPlus - mu) - 0.5) / Math.sqrt(variance);
  return {
    test: label, status: 'ok', statistic: Math.min(wPlus, total - wPlus), z, p: Math.min(1, 2 * normalSf(Math.max(0, z))), n,
    effectSize: { name: 'r = |Z|/sqrt(N)', value: Math.abs(z) / Math.sqrt(n) },
    note: n < 10 ? 'Small sample: normal approximation is rough' : undefined,
  };
}

/** Friedman test for k related samples (rows = subjects, all complete), with Kendall's W. */
export function friedman(matrix) {
  const n = matrix.length;
  const k = n ? matrix[0].length : 0;
  if (n < 5 || k < 3) return { test: 'Friedman', status: 'insufficient', note: `Needs >= 5 complete participants and >= 3 conditions (have ${n})`, n };
  const rankSums = new Array(k).fill(0);
  let tieSum = 0;
  for (const row of matrix) {
    const { ranks, ties } = rankWithTies(row);
    ranks.forEach((r, j) => { rankSums[j] += r; });
    tieSum += tieTerm(ties);
  }
  let Q = (12 / (n * k * (k + 1))) * rankSums.reduce((s, r) => s + r * r, 0) - 3 * n * (k + 1);
  const C = 1 - tieSum / (n * k * (k * k - 1));
  if (C === 0) return { test: 'Friedman', status: 'insufficient', note: 'All values identical', n };
  Q /= C;
  return {
    test: 'Friedman', status: 'ok', statistic: Q, df: k - 1, p: chiSquareSf(Q, k - 1), n,
    effectSize: { name: "Kendall's W", value: Q / (n * (k - 1)) },
  };
}
