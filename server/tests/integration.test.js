import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Full-stack workflow against an in-memory MongoDB. Skipped automatically if the binary cannot be obtained.
let mongod, server, base, mongoose, models, skip = false;

before(async () => {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
  } catch (err) {
    skip = `mongodb-memory-server unavailable: ${err.message}`;
    return;
  }
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  process.env.RESEARCHER_INVITE_CODE = 'invite-123';
  mongoose = (await import('mongoose')).default;
  await mongoose.connect(process.env.MONGODB_URI);
  const { createApp } = await import('../app.js');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  models = {
    Task: (await import('../models/Task.js')).default,
    User: (await import('../models/User.js')).default,
    TaskResult: (await import('../models/TaskData.js')).TaskResult,
    Assignment: (await import('../models/Experiment.js')).ExperimentAssignment,
  };
});

after(async () => {
  server?.close();
  await mongoose?.disconnect();
  await mongod?.stop();
});

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : await res.text();
  return { status: res.status, data, type };
}

const survey = {
  age: 30, gender: 'prefer-not-to-say', education: 'BSc', primaryOS: 'windows', yearsOfExperience: 10,
  usageFrequency: { windows: 'daily', macos: 'monthly', linux: 'never' },
  familiarity: { windows: 5, macos: 3, linux: 1 },
};

// A minimal valid JPEG header followed by padding: enough for the magic-byte and size checks.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 1)]).toString('base64');

test('end-to-end research workflow', { timeout: 120000 }, async (t) => {
  if (skip) return t.skip(skip);

  // Authentication and role control
  const bad = await call('POST', '/auth/register', null, { name: 'Eve', email: 'eve@x.io', password: 'Passw0rdX', role: 'researcher' });
  assert.equal(bad.status, 403, 'researcher registration needs an invite code');
  const r = await call('POST', '/auth/register', null, { name: 'Researcher', email: 'r@x.io', password: 'Passw0rdX', role: 'researcher', inviteCode: 'invite-123' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.passwordHash, undefined, 'password hash never exposed');
  const A = await call('POST', '/auth/register', null, { name: 'Alice', email: 'a@x.io', password: 'Passw0rdX' });
  const B = await call('POST', '/auth/register', null, { name: 'Bob', email: 'b@x.io', password: 'Passw0rdX' });
  assert.equal((await call('POST', '/auth/register', null, { name: 'Alice2', email: 'a@x.io', password: 'Passw0rdX' })).status, 409);
  assert.equal((await call('POST', '/auth/login', null, { email: 'a@x.io', password: 'wrong-pass1' })).status, 401);
  const rt = r.data.token, at = A.data.token, bt = B.data.token;
  const aid = A.data.user._id, bid = B.data.user._id;

  // Experiment and instruction-only tasks (no screenshots, no AOIs)
  const exp = (await call('POST', '/experiments', rt, { title: 'Pilot study', description: 'd' })).data.data;
  assert.equal((await call('POST', `/experiments/${exp._id}/tasks/seed-defaults`, rt)).data.created, 48);
  await models.Task.updateMany({ taskNumber: { $gt: 2 } }, { active: false });
  assert.equal((await call('POST', `/tasks/${(await models.Task.findOne({ taskNumber: 1 }))._id}/screenshot`, rt)).status, 404, 'screenshot upload no longer exists');
  assert.equal((await call('PUT', `/experiments/${exp._id}`, rt, { status: 'active' })).status, 200);
  const tasks = (await call('GET', `/experiments/${exp._id}/tasks`, rt)).data.data;
  const win = tasks.filter((x) => x.operatingSystem === 'windows' && x.taskNumber <= 2).sort((a, b) => a.taskNumber - b.taskNumber);

  assert.equal((await call('GET', '/experiments', at)).status, 403, 'participants cannot use researcher routes');
  assert.equal((await call('GET', '/analytics/overview', bt)).status, 403);

  assert.equal((await call('PUT', `/participants/${aid}`, at, survey)).status, 200);
  assert.equal((await call('PUT', `/participants/${aid}`, bt, survey)).status, 403, 'cannot edit another participant');
  assert.equal((await call('GET', `/participants/${aid}`, bt)).status, 403, 'cannot read another participant');
  await call('PUT', `/participants/${bid}`, bt, survey);

  // The researcher assigns specific tasks to each participant
  const asgA = await call('POST', '/assignments', rt, { experimentId: exp._id, participantIds: [aid], taskIds: win.map((x) => x._id) });
  assert.equal(asgA.status, 201);
  assert.equal((await call('POST', '/assignments', rt, { experimentId: exp._id, participantIds: [bid], taskIds: [win[0]._id] })).status, 201);
  assert.equal((await call('GET', `/experiments/${exp._id}/session`, (await call('POST', '/auth/register', null, { name: 'Cy', email: 'c@x.io', password: 'Passw0rdX' })).data.token)).status, 404, 'unassigned participant has no session');

  // Participant A: consent, OS check, tasks on their own (Windows) computer
  assert.equal((await call('POST', `/experiments/${exp._id}/start`, at)).status, 409, 'consent required first');
  assert.equal((await call('POST', `/experiments/${exp._id}/consent`, at, { participation: true, cameraConsent: false, screenConsent: true })).status, 201);
  assert.equal((await call('POST', `/experiments/${exp._id}/start`, at)).status, 409, 'OS check required');
  assert.equal((await call('POST', `/experiments/${exp._id}/os-check`, at, { selectedOS: 'macos' })).data.data.matched, false, 'selected macOS but the request comes from Windows');
  assert.equal((await call('POST', `/experiments/${exp._id}/start`, at)).status, 409, 'mismatch does not unlock the study');
  assert.equal((await call('POST', `/experiments/${exp._id}/os-check`, at, { selectedOS: 'windows' })).data.data.matched, true);

  let session = (await call('GET', `/experiments/${exp._id}/session`, at)).data.data;
  assert.deepEqual(Object.keys(session.tasksByOS), ['windows'], 'only the participant\'s own OS');
  assert.equal(session.tasksByOS.windows.length, 2);
  assert.equal((await call('POST', `/experiments/${exp._id}/start`, at)).status, 200);

  const macTask = tasks.find((x) => x.operatingSystem === 'macos' && x.taskNumber === 1)._id;
  assert.equal((await call('POST', `/tasks/${macTask}/start`, at)).status, 403, 'macOS tasks are never given to a Windows participant');

  const [t1, t2] = session.tasksByOS.windows;
  assert.equal((await call('POST', `/tasks/${t1._id}/start`, at)).status, 200);
  // Desktop app: no camera, so no calibration is needed; the active-window timeline is what gets verified
  assert.equal((await call('POST', '/gaze/recordings', at, { taskId: t1._id, environment: { source: 'desktop', platform: 'win32' } })).status, 201);
  assert.equal((await call('POST', '/gaze/samples/batch', at, { taskId: t1._id, samples: [], appEvents: [{ t: 300, app: 'Google Chrome', title: 'Research' }, { t: 2500, app: 'explorer.exe', title: 'Documents' }] })).status, 201);
  assert.equal((await call('POST', '/gaze/snapshot', at, { taskId: t1._id, image: jpeg, width: 800, height: 450 })).status, 201, 'screen still stored with consent');
  assert.equal((await call('POST', '/gaze/snapshot', at, { taskId: t1._id, image: Buffer.from('not a jpeg at all, just text padding'.repeat(5)).toString('base64'), width: 800, height: 450 })).status, 400);
  const done1 = await call('POST', `/tasks/${t1._id}/complete`, at, { outcome: 'completed' });
  assert.equal(done1.data.data.selfReportedComplete, true);
  assert.equal(done1.data.data.verification.status, 'verified', 'File Explorer became active during task 1');
  assert.equal(done1.data.data.verification.matchedApp, 'explorer.exe');
  assert.equal((await call('POST', `/tasks/${t1._id}/complete`, at, { outcome: 'completed' })).status, 409, 'cannot resubmit');
  assert.equal((await call('POST', `/tasks/${t2._id}/start`, at)).status, 200);
  assert.equal((await call('POST', `/tasks/${t2._id}/complete`, at, { outcome: 'timeout' })).status, 400, 'the timer cannot be faked');
  assert.equal((await call('POST', `/tasks/${t2._id}/complete`, at, { outcome: 'not_completed' })).data.data.selfReportedComplete, false);
  assert.equal((await call('POST', `/experiments/${exp._id}/complete`, at)).status, 409, 'questionnaire required first');

  assert.equal((await call('POST', '/sus/submit', at, { experimentId: exp._id, operatingSystem: 'windows', responses: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1] })).status, 201);
  assert.equal((await call('POST', '/sus/submit', at, { experimentId: exp._id, operatingSystem: 'windows', responses: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] })).status, 409, 'one SUS per OS');
  assert.equal((await call('POST', '/sus/submit', at, { experimentId: exp._id, operatingSystem: 'windows', responses: [1, 2, 3] })).status, 400);
  assert.equal((await call('POST', `/experiments/${exp._id}/complete`, at)).status, 200);

  // Participant B only received the one task the researcher chose
  await call('POST', `/experiments/${exp._id}/consent`, bt, { participation: true, cameraConsent: false });
  await call('POST', `/experiments/${exp._id}/os-check`, bt, { selectedOS: 'windows' });
  // Stale data from an earlier version: a familiarity-ordered sequence that starts with macOS must not leak through.
  await models.Assignment.updateOne({ participantId: bid }, { assignedOSSequence: ['macos', 'linux', 'windows'] });
  const sb = (await call('GET', `/experiments/${exp._id}/session`, bt)).data.data;
  assert.deepEqual(sb.assignment.sequence, ['windows']);
  assert.deepEqual(Object.keys(sb.tasksByOS), ['windows']);
  assert.equal(sb.detectedOS, 'windows');
  assert.equal(sb.osMismatch, null);
  assert.equal(sb.tasksByOS.windows.length, 1);
  assert.equal((await call('POST', `/experiments/${exp._id}/start`, bt)).status, 200);
  assert.equal((await call('POST', `/tasks/${t2._id}/start`, bt)).status, 403, 'task not assigned to this participant');
  await call('POST', `/tasks/${t1._id}/start`, bt);
  assert.equal((await call('POST', '/gaze/snapshot', bt, { taskId: t1._id, image: jpeg, width: 800, height: 450 })).status, 403, 'no screen consent, no capture');

  // Researcher assigned only macOS tasks, participant is on Windows: a clear mismatch, no tasks loaded
  const D = await call('POST', '/auth/register', null, { name: 'Dee', email: 'd@x.io', password: 'Passw0rdX' });
  await call('POST', '/assignments', rt, { experimentId: exp._id, participantIds: [D.data.user._id], taskIds: [macTask] });
  const sd = (await call('GET', `/experiments/${exp._id}/session`, D.data.token)).data.data;
  assert.equal(sd.osMismatch.reason, 'no_assigned_tasks');
  assert.deepEqual(sd.osMismatch.assignedOS, ['macos']);
  assert.equal(sd.osMismatch.detectedOS, 'windows');
  assert.deepEqual(sd.tasksByOS, {});
  assert.equal((await call('POST', `/tasks/${macTask}/start`, D.data.token)).status, 409);
  const chk = await call('POST', `/experiments/${exp._id}/os-check`, D.data.token, { selectedOS: 'windows' });
  assert.equal(chk.data.data.matched, false, 'detected OS matches the selection but the assigned tasks do not');

  // Screen stills: owner and owning researcher only
  const snapA = await call('GET', `/gaze/snapshot/${t1._id}?participantId=${aid}`, rt);
  assert.equal(snapA.status, 200);
  assert.match(snapA.type, /image\/jpeg/);
  assert.equal((await call('GET', `/gaze/snapshot/${t1._id}`, bt)).status, 404, 'a participant cannot read another participant\'s still');
  assert.equal((await call('GET', `/gaze/snapshot/${t1._id}`, at)).status, 200);

  // Analytics, SUS, reports
  const ov = (await call('GET', `/analytics/overview?experimentId=${exp._id}`, rt)).data.data;
  assert.equal(ov.cards.totalTaskAttempts, 2);
  assert.equal(ov.cards.avgSus, 100);
  const cmp = (await call('GET', `/analytics/os-comparison?experimentId=${exp._id}`, rt)).data.data;
  assert.equal(cmp.metrics.successRate.byOS.windows.mean, 0.5);
  assert.equal(cmp.metrics.fixationCount.byOS.windows.n, 0, 'no gaze data: unavailable, not zero');
  const stats = await call('GET', `/analytics/statistics?experimentId=${exp._id}&metric=susScore`, rt);
  assert.equal(stats.status, 200);
  assert.equal(stats.data.data.osComparison.omnibus.status, 'insufficient', 'one participant on one OS cannot support inference');
  assert.equal((await call('GET', `/sus/analysis/${exp._id}`, rt)).data.data.byOS.windows.mean, 100);

  const csv = await call('GET', `/reports/export/csv?experimentId=${exp._id}&dataset=task-results`, rt);
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Participant,OS,Task/);
  assert.equal(csv.data.trim().split(/\r?\n/).length, 3);
  const pdf = await call('GET', `/reports/export/pdf?experimentId=${exp._id}`, rt);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');
  const ppdf = await call('GET', `/reports/export/pdf?experimentId=${exp._id}&participantId=${aid}`, rt);
  assert.equal(ppdf.data.subarray(0, 4).toString(), '%PDF');
  const rep = await call('GET', `/reports/participant/${aid}?experimentId=${exp._id}`, rt);
  assert.equal(rep.data.data.summary.correct, 1);
  assert.equal((await call('GET', `/reports/participant/${aid}?experimentId=${exp._id}`, bt)).status, 403);
  assert.equal((await call('GET', `/reports/participant/${aid}?experimentId=${exp._id}`, at)).status, 403, 'results hidden unless enabled');

  // Injection and privacy
  assert.equal((await call('GET', `/gaze/recordings?experimentId[$ne]=x`, rt)).status, 400, 'operator injection rejected');
  const logs = await call('GET', '/admin/audit-logs', rt);
  assert.ok(logs.data.data.some((l) => l.action === 'experiment.complete'));

  const before = await models.TaskResult.countDocuments({ participantId: aid });
  assert.equal((await call('POST', `/admin/participants/${aid}/anonymize`, rt, { confirm: 'ANONYMIZE' })).status, 200);
  const anon = await models.User.findById(aid);
  assert.equal(anon.name, 'Anonymized participant');
  assert.equal(await models.TaskResult.countDocuments({ participantId: aid }), before, 'results remain linked by id');
  assert.equal((await call('POST', '/auth/login', null, { email: 'a@x.io', password: 'Passw0rdX' })).status, 401, 'old credentials no longer work');

  assert.equal((await call('DELETE', `/admin/participants/${aid}`, rt, { confirm: 'wrong' })).status, 400);
  assert.equal((await call('DELETE', `/admin/participants/${aid}`, rt, { confirm: anon.participantCode })).status, 200);
  assert.equal(await models.TaskResult.countDocuments({ participantId: aid }), 0);
});
