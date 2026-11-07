import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectOSFromUA } from '../services/osDetect.js';

test('detects desktop operating systems from the User-Agent', () => {
  assert.equal(detectOSFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), 'windows');
  assert.equal(detectOSFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605'), 'macos');
  assert.equal(detectOSFromUA('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Firefox/120'), 'linux');
});

test('mobile and unknown platforms are not valid', () => {
  assert.equal(detectOSFromUA('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile'), null);
  assert.equal(detectOSFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), null);
  assert.equal(detectOSFromUA(''), null);
});
