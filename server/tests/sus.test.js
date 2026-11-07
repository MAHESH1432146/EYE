import { test } from 'node:test';
import assert from 'node:assert/strict';
import { susScore, SUS_STATEMENTS } from '../services/statistics/sus.js';
import { describe } from '../services/statistics/descriptive.js';

test('SUS: best and worst possible answers', () => {
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
  assert.equal(susScore(Array(10).fill(3)), 50);
});

test('SUS: rejects invalid input', () => {
  assert.throws(() => susScore([1, 2, 3]));
  assert.throws(() => susScore([6, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
  assert.equal(SUS_STATEMENTS.length, 10);
});

test('descriptive statistics', () => {
  const d = describe([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(d.n, 8);
  assert.equal(d.mean, 5);
  assert.equal(d.median, 4.5);
  assert.ok(Math.abs(d.sd - 2.138) < 0.001);
  assert.equal(describe([]).mean, null);
});
