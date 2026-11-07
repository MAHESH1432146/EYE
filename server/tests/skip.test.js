import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskQuery } from '../controllers/runController.js';

test('skipped tasks are removed from the participant\'s task query', () => {
  assert.deepEqual(taskQuery({ assignedTaskIds: [], skippedTaskIds: [] }, 'e', 'windows'), { experimentId: 'e', active: true, operatingSystem: 'windows' });
  assert.deepEqual(taskQuery({ assignedTaskIds: ['a', 'b', 'c'], skippedTaskIds: ['b'] }, 'e', 'windows')._id, { $in: ['a', 'c'] });
  assert.deepEqual(taskQuery({ assignedTaskIds: [], skippedTaskIds: ['x'] }, 'e', 'windows')._id, { $nin: ['x'] });
});
