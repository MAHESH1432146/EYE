import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendSequence } from '../services/sequence.js';

test('least familiar first, primary OS last', () => {
  const seq = recommendSequence({
    primaryOS: 'windows',
    usageFrequency: { windows: 'daily', macos: 'monthly', linux: 'never' },
    familiarity: { windows: 5, macos: 3, linux: 1 },
  });
  assert.deepEqual(seq, ['linux', 'macos', 'windows']);
});

test('primary OS is placed last even if another OS is rated higher', () => {
  const seq = recommendSequence({
    primaryOS: 'macos',
    usageFrequency: { windows: 'weekly', macos: 'weekly', linux: 'never' },
    familiarity: { windows: 5, macos: 4, linux: 1 },
  });
  assert.equal(seq[2], 'macos');
});
