import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, regionSummary } from '../services/eyeTracking/metrics.js';
import { makeTargetTest, matchesRule, summariseActivity, verifyTask } from '../services/eyeTracking/targets.js';
import { APP_TARGETS } from '../services/defaultTasks.js';

test('structured rules identify the exact application and ignore look-alikes', () => {
  const anyRule = (os, app, e) => APP_TARGETS[app][os].some((r) => matchesRule(r, e));
  assert.ok(anyRule('windows', 'settings', { app: 'Settings', title: 'Settings', path: 'C:\\Windows\\ImmersiveControlPanel\\SystemSettings.exe' }));
  assert.ok(anyRule('windows', 'settings', { app: 'Application Frame Host', title: 'Settings', path: 'C:\\Windows\\System32\\ApplicationFrameHost.exe' }));
  assert.ok(!anyRule('windows', 'settings', { app: 'Google Chrome', title: 'Settings - Chrome', path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' }));
  assert.ok(!anyRule('windows', 'settings', { app: 'SettingSyncHost', title: '', path: 'C:\\Windows\\System32\\SettingSyncHost.exe' }));
  assert.ok(anyRule('windows', 'fileManager', { app: 'Windows Explorer', title: 'Documents', path: 'C:\\Windows\\explorer.exe' }));
  assert.ok(!anyRule('windows', 'fileManager', { app: 'Windows Explorer', title: 'Program Manager', path: 'C:\\Windows\\explorer.exe' }));
  assert.ok(!anyRule('macos', 'fileManager', { app: 'Finder', title: '', path: '/System/Library/CoreServices/Finder.app', proc: true }));
  assert.ok(anyRule('macos', 'fileManager', { app: 'Finder', title: '', path: '/System/Library/CoreServices/Finder.app' }));
  assert.ok(!anyRule('linux', 'fileManager', { app: 'nautilus', title: '', path: '/usr/bin/nautilus', proc: true }));
});

test('activity sessions are validated and totalled', () => {
  const a = summariseActivity({ detection: 'desktop', closedAtEnd: true, sessions: [{ startMs: 5000, endMs: 9000 }, { startMs: 0, endMs: 2000 }, { startMs: 3000, endMs: 1000 }] }, 8000);
  assert.equal(a.sessionCount, 2);
  assert.equal(a.totalMs, 2000 + 3000);
  assert.equal(a.closedAtEnd, true);
  const b = summariseActivity({ detection: 'desktop', sessions: [], events: [{ ts: 1700000000000, type: 'target_window_opened', app: 'SystemSettings.exe', pid: 42 }] }, 1000);
  assert.equal(b.events[0].kind, 'target_window_opened');
  assert.equal(b.events[0].at.getTime(), 1700000000000);
});

// 30 Hz stream: n samples around (x, y) starting at t0
const cluster = (x, y, t0, n) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 33, x: x + (i % 2) * 0.005, y }));

const task = { targetApp: { match: ['explorer.exe', 'File Explorer'] } };

test('verification distinguishes verified, not detected, unavailable and not verifiable', () => {
  assert.deepEqual(verifyTask({}, []), { status: 'not_verifiable' });
  assert.deepEqual(verifyTask(task, []), { status: 'unavailable' });
  assert.equal(verifyTask(task, [{ t: 500, app: 'Google Chrome', title: 'x' }]).status, 'not_detected');
  const v = verifyTask(task, [{ t: 100, app: 'Chrome' }, { t: 4200, app: 'Windows Explorer', title: 'Documents - File Explorer', path: 'C:\\Windows\\explorer.exe' }]);
  assert.equal(v.status, 'verified');
  assert.equal(v.firstMatchedMs, 4200);
});

test('TTFF and revisits for an application target use the active window bounds', () => {
  // display 1000x800 at origin; explorer window occupies the right half and is active from t = 1000 ms
  const record = {
    display: { x: 0, y: 0, width: 1000, height: 800 },
    appEvents: [{ t: 0, app: 'Chrome', b: [0, 0, 1000, 800] }, { t: 1000, app: 'explorer.exe', title: 'Docs', b: [500, 0, 500, 800] }],
  };
  const target = makeTargetTest(task, record);
  assert.equal(target.kind, 'app');
  const samples = [
    ...cluster(0.2, 0.5, 0, 15), // browser is active and the gaze is on the left (not the target)
    ...cluster(0.8, 0.5, 1100, 15), // inside the explorer window: first fixation on target
    ...cluster(0.2, 0.5, 1700, 15), // left half: outside the window
    ...cluster(0.8, 0.5, 2300, 15), // returns: one revisit
  ];
  const m = computeMetrics(samples, null, 0.9, { target });
  assert.equal(m.targetKind, 'app');
  assert.ok(m.ttff >= 1100 && m.ttff < 1200);
  assert.equal(m.revisitCount, 1);
  assert.ok(m.fixationCount >= 2);
});

test('region target and no target', () => {
  const samples = [...cluster(0.1, 0.1, 0, 15), ...cluster(0.8, 0.8, 600, 15)];
  const t = makeTargetTest({ targetRegion: { x: 0.7, y: 0.7, width: 0.2, height: 0.2 } }, {});
  assert.equal(computeMetrics(samples, null, 0.9, { target: t }).ttff, 600);
  assert.equal(makeTargetTest({}, {}), null);
  const m = computeMetrics(samples, null, 0.9, {});
  assert.equal(m.ttff, null);
  assert.equal(m.targetKind, 'none');
});

test('region revisits count returns to a previously viewed screen region; interruptions are summed', () => {
  const fx = (x, y) => ({ x, y, duration: 200 });
  const r = regionSummary([fx(0.1, 0.1), fx(0.9, 0.9), fx(0.1, 0.1), fx(0.1, 0.12), fx(0.9, 0.9)]);
  assert.equal(r.totalRevisits, 2); // top-left revisited once, bottom-right revisited once
  const m = computeMetrics(cluster(0.5, 0.5, 0, 30), null, 0.9, { interruptions: [{ t: 100, d: 300, reason: 'window_hidden' }, { t: 900, d: 200, reason: 'face_lost' }] });
  assert.equal(m.interruptedMs, 500);
});
