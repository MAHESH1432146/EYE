import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiSquareSf, fSf, normalCdf, normalInv } from '../services/statistics/distributions.js';
import { dunn, friedman, kruskalWallis, levene, rankWithTies, shapiroWilk, wilcoxonSignedRank } from '../services/statistics/hypothesisTests.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('distribution tails match reference values', () => {
  close(normalCdf(1.96), 0.975, 1e-4);
  close(normalInv(0.975), 1.96, 1e-3);
  close(chiSquareSf(3.841, 1), 0.05, 1e-3);
  close(chiSquareSf(5.991, 2), 0.05, 1e-3);
  close(fSf(4.103, 2, 10), 0.05, 1e-3);
});

test('rank ties get average ranks', () => {
  assert.deepEqual(rankWithTies([10, 20, 20, 30]).ranks, [1, 2.5, 2.5, 4]);
});

test('Shapiro-Wilk: reference value for 1:10 and rejection of heavy skew', () => {
  const r = shapiroWilk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  close(r.statistic, 0.9702, 0.002);
  close(r.p, 0.8924, 0.02);
  const skew = shapiroWilk([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 50]);
  assert.ok(skew.p < 0.001);
  assert.equal(shapiroWilk([1, 2]).status, 'insufficient');
});

test('Kruskal-Wallis: separated groups are significant, Dunn is Bonferroni-adjusted', () => {
  const kw = kruskalWallis({ a: [1, 2, 3, 4, 5], b: [6, 7, 8, 9, 10], c: [11, 12, 13, 14, 15] });
  close(kw.statistic, 12.5, 1e-9);
  assert.ok(kw.p < 0.01);
  const post = dunn(kw);
  assert.equal(post.length, 3);
  assert.ok(post.every((x) => x.pAdjusted >= x.p));
  assert.ok(post.find((x) => x.comparison === 'a vs c').significant);
});

test('Kruskal-Wallis: identical groups are not significant', () => {
  const kw = kruskalWallis({ a: [1, 5, 9, 13], b: [2, 6, 10, 14], c: [3, 7, 11, 15] });
  assert.ok(kw.p > 0.5);
});

test('Levene detects unequal spread', () => {
  const r = levene([[10, 11, 10, 11, 10, 12], [1, 20, 5, 30, 2, 40]]);
  assert.ok(r.p < 0.05);
});

test('Wilcoxon signed-rank: consistent shift is significant; tiny samples are refused', () => {
  const x = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
  const y = x.map((v, i) => v - 2 - i * 0.1);
  const r = wilcoxonSignedRank(x, y);
  assert.ok(r.p < 0.01);
  assert.equal(wilcoxonSignedRank([1, 2, 3], [2, 3, 5]).status, 'insufficient');
});

test('Friedman: consistent ordering across subjects is significant', () => {
  const m = Array.from({ length: 8 }, (_, i) => [1 + i * 0.1, 5 + i * 0.1, 9 + i * 0.1]);
  const r = friedman(m);
  close(r.effectSize.value, 1, 1e-9);
  assert.ok(r.p < 0.01);
  assert.equal(friedman([[1, 2, 3]]).status, 'insufficient');
});
