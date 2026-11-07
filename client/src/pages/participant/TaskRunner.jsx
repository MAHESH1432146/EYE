import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EyeOff, MonitorCheck, ScanFace } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Alert from '../../components/Alert.jsx';
import { detectFixations } from '../../services/liveGaze.js';
import { desktop, isDesktop, matchesTarget, refreshDesktop } from '../../services/desktop.js';
import TaskResults, { NextButtons } from './TaskResults.jsx';

const EMPTY_LIVE = { fixations: 0, totalDwell: 0, avgDwell: 0, currentDwell: 0, blinks: 0, blinkRate: null, x: null, y: null, rx: null, ry: null, samples: 0 };

const CLOSE_DEBOUNCE_MS = 1500;
const clock = (ms) => new Date(ms).toLocaleTimeString();
const secsText = (ms) => `${(ms / 1000).toFixed(1)} s`;

const STATUS = {
  not_started: { label: 'Activity Not Yet Started', cls: 'bg-slate-100 text-slate-700' },
  started: { label: 'Activity Started', cls: 'bg-green-50 text-green-800' },
  closed: { label: 'Activity Closed', cls: 'bg-amber-50 text-amber-900' },
};
const activityStatus = (sessions) => (!sessions.length ? 'not_started' : sessions.some((s) => s.endMs === null) ? 'started' : 'closed');

function ActivityPanel({ sessions, nowMs, manual }) {
  const status = activityStatus(sessions);
  const st = STATUS[status];
  return (
    <div className={`space-y-2 rounded-lg px-3 py-2 text-sm ${st.cls}`} aria-live="polite">
      <p className="font-medium">{st.label}</p>
      {status === 'not_started' && manual && <p className="text-xs">You started this task manually; the target application has not been detected yet.</p>}
      {status === 'closed' && <p className="text-xs">The application was closed. That does not mean the task is complete: press End Task when you are done, or reopen the application.</p>}
      {sessions.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead><tr><th className="pr-3">Session</th><th className="pr-3">Started</th><th className="pr-3">Closed</th><th>Duration</th></tr></thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={s.startedAt}>
                <td className="pr-3">{i + 1}</td><td className="pr-3">{clock(s.startedAt)}</td>
                <td className="pr-3">{s.closedAt ? clock(s.closedAt) : 'open'}</td><td>{secsText((s.endMs ?? nowMs) - s.startMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between gap-2 text-sm"><span className="text-slate-500">{label}</span><span className="font-mono font-medium">{value}</span></div>;
}

// A task the participant carries out on their own computer. Timer and tracking run from Start until End Task.
export default function TaskRunner({ task, index, total, osLabel, tracker, screen, onFinished }) {
  const { id: experimentId } = useParams();
  const [phase, setPhase] = useState('instruction'); // instruction | running | ending | results | feedback
  const [data, setData] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [faceOk, setFaceOk] = useState(true);
  const [notice, setNotice] = useState('');
  const [live, setLive] = useState(EMPTY_LIVE);
  const [activeApp, setActiveApp] = useState(null);
  const [startedBy, setStartedBy] = useState(null);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [activity, setActivity] = useState({ sessions: [] }); // target-application sessions, ms since the task began
  const [monitorOk, setMonitorOk] = useState(true);
  const sessionsRef = useRef([]);
  const absentSince = useRef(null);
  const closeTimer = useRef(null);
  const baseline = useRef(null);
  const agentEvents = useRef([]);
  const [detected, setDetected] = useState(null); // { app, at } first time the task's target app became active
  const deadline = useRef(0);
  const submitting = useRef(false);
  const beginning = useRef(false);
  const buffer = useRef([]);
  const allSamples = useRef([]);
  const blinkBuf = useRef([]);
  const appBuf = useRef([]);
  const interruptBuf = useRef([]);
  const openInterrupt = useRef({}); // reason -> start (ms since onset)
  const blinkTotal = useRef(0);
  const onset = useRef(0);
  const endClick = useRef({ at: 0, elapsed: 0, frame: null });
  const recording = useRef(false);
  const flushing = useRef(null);
  const lastPoint = useRef(null);
  const stateRef = useRef({});

  const rel = () => Math.round(performance.now() - onset.current);
  const hasMore = index + 1 < total;
  const finishAll = async () => {
    try {
      await api.post(`/experiments/${experimentId}/finish-tasks`);
      onFinished();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const rules = task.targetApp?.match || [];

  // An interruption is recorded as a real gap (start and duration); nothing is generated to fill it.
  const beginInterrupt = (reason) => { if (openInterrupt.current[reason] === undefined) openInterrupt.current[reason] = rel(); };
  const endInterrupt = (reason) => {
    const t = openInterrupt.current[reason];
    if (t === undefined) return;
    delete openInterrupt.current[reason];
    interruptBuf.current.push({ t, d: Math.max(0, rel() - t), reason });
  };
  const closeAllInterrupts = () => Object.keys(openInterrupt.current).forEach(endInterrupt);

  // Target-application sessions. A short absence is ignored so title changes or window switches inside the app do not split a session.
  const syncActivity = () => setActivity({ sessions: sessionsRef.current.map((s) => ({ ...s })) });
  const onPresence = (present, app) => {
    const open = sessionsRef.current.find((s) => s.endMs === null);
    if (present) {
      clearTimeout(closeTimer.current);
      absentSince.current = null;
      if (!open) { sessionsRef.current.push({ startMs: rel(), endMs: null, app, startedAt: Date.now(), closedAt: null }); syncActivity(); }
    } else if (open && absentSince.current === null) {
      absentSince.current = rel();
      const at = Date.now();
      closeTimer.current = setTimeout(() => {
        open.endMs = absentSince.current;
        open.closedAt = at;
        absentSince.current = null;
        syncActivity();
      }, CLOSE_DEBOUNCE_MS);
    }
  };
  const activityPayload = (endMs) => {
    const sessions = sessionsRef.current.map((s) => ({ startMs: s.startMs, endMs: s.endMs ?? Math.min(absentSince.current ?? endMs, endMs), app: s.app }));
    const closedAtEnd = sessions.length > 0 && sessionsRef.current.every((s) => s.endMs !== null || absentSince.current !== null);
    return { detection: isDesktop && rules.length ? 'desktop' : 'manual', sessions, closedAtEnd, events: agentEvents.current.slice(-500) };
  };

  // OS-level launch/close/activate events with their real timestamps, kept for the record from arming until the task ends.
  useEffect(() => {
    if (!['armed', 'running', 'ending'].includes(phase) || !isDesktop || !rules.length) return undefined;
    return desktop.onAgentEvents((evs) => agentEvents.current.push(...evs.map(({ ts, type, app, pid, title, path, alreadyRunning }) => ({ ts, type, app, pid, title, path, alreadyRunning }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Sends buffered gaze, blinks, active-window events and interruptions; failed batches are kept for the next attempt.
  const flush = useCallback(() => {
    if (flushing.current) return flushing.current;
    flushing.current = (async () => {
      let pending = buffer.current.splice(0);
      let blinks = blinkBuf.current.splice(0);
      let apps = appBuf.current.splice(0);
      let gaps = interruptBuf.current.splice(0);
      try {
        do {
          const batch = pending.splice(0, 500);
          const b = blinks.splice(0, 100);
          const a = apps.splice(0, 200);
          const g = gaps.splice(0, 50);
          if (!recording.current) break;
          try {
            await api.post('/gaze/samples/batch', {
              taskId: task._id, samples: batch, blinks: b, appEvents: a, interruptions: g, faceLostMs: tracker?.faceLostMs(),
            });
          } catch {
            buffer.current.unshift(...batch, ...pending);
            blinkBuf.current.unshift(...b, ...blinks);
            appBuf.current.unshift(...a, ...apps);
            interruptBuf.current.unshift(...g, ...gaps);
            pending = []; blinks = []; apps = []; gaps = [];
          }
        } while (pending.length || blinks.length || apps.length || gaps.length);
      } finally {
        flushing.current = null;
      }
    })();
    return flushing.current;
  }, [task._id, tracker]);

  // Real gaze and blink events from the webcam; gaze is stored as a fraction of the participant's calibrated screen.
  useEffect(() => {
    if (phase !== 'running' || !tracker || !recording.current) return undefined;
    const unsubGaze = tracker.subscribe((g) => {
      lastPoint.current = { x: g.x, y: g.y };
      const n = tracker.normalise(g);
      const s = { t: rel(), x: +n.x.toFixed(4), y: +n.y.toFixed(4) };
      buffer.current.push(s);
      allSamples.current.push(s);
    });
    const unsubBlink = tracker.subscribeBlinks((b) => {
      blinkTotal.current += 1;
      blinkBuf.current.push({ t: Math.max(0, Math.round(b.start - onset.current)), d: Math.round(b.d) });
    });
    const unsubStatus = tracker.subscribeStatus((s) => {
      setFaceOk(s.faceDetected);
      if (s.cameraError) { beginInterrupt('camera_error'); setNotice('The camera stopped. Reconnect it; gaze cannot be recorded until it is back.'); }
      else if (!s.faceDetected) beginInterrupt('face_lost');
      else endInterrupt('face_lost');
    });
    const flushTimer = setInterval(flush, 2000);

    // Live measurements, recomputed from the samples received so far.
    let ticks = 0;
    const liveTimer = setInterval(() => {
      ticks += 1;
      const samples = allSamples.current;
      const fx = detectFixations(samples);
      const total = fx.reduce((a, f) => a + f.duration, 0);
      const last = samples[samples.length - 1];
      const tail = fx[fx.length - 1];
      const trackedMs = Math.max(0, performance.now() - onset.current - tracker.faceLostMs());
      const p = lastPoint.current;
      setLive({
        fixations: fx.length, totalDwell: Math.round(total), avgDwell: fx.length ? Math.round(total / fx.length) : 0,
        currentDwell: tail && last && last.t - tail.end < 150 ? Math.round(tail.duration) : 0,
        blinks: blinkTotal.current, blinkRate: trackedMs >= 5000 ? +((blinkTotal.current / trackedMs) * 60000).toFixed(1) : null,
        x: p ? Math.round(p.x) : null, y: p ? Math.round(p.y) : null, rx: last ? last.x : null, ry: last ? last.y : null, samples: samples.length,
      });
    }, 500);
    return () => { unsubGaze(); unsubBlink(); unsubStatus(); clearInterval(flushTimer); clearInterval(liveTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tracker, screen, flush]);

  // Desktop app: active-window timeline (verification, target windows), window visibility, display and power events.
  useEffect(() => {
    if (phase !== 'running' || !isDesktop || !recording.current) return undefined;
    const offWin = desktop.onActiveWindow((w) => {
      appBuf.current.push({ t: rel(), app: w.app, title: w.title, path: w.path, b: w.b });
      setActiveApp(w.app || w.title || null);
      if (rules.length && matchesTarget(rules, w)) {
        setDetected((d) => d || { app: w.app || w.title, at: rel() });
        onPresence(true, w.app || w.title);
      }
    });
    const offList = desktop.onOpenWindows((list) => {
      const hit = rules.length ? list.find((e) => matchesTarget(rules, e)) : null;
      if (rules.length) onPresence(!!hit, hit && (hit.app || hit.title));
    });
    const offState = desktop.onWindowState((s) => {
      if (s === 'hidden' || s === 'minimized') beginInterrupt('window_hidden');
      else endInterrupt('window_hidden');
    });
    const offDisplay = desktop.onDisplayChanged(() => {
      interruptBuf.current.push({ t: rel(), d: 0, reason: 'display_changed' });
      setNotice('Your display setup changed. Gaze accuracy may be reduced until you recalibrate.');
    });
    const offPower = desktop.onSuspend((s) => (s === 'suspend' ? beginInterrupt('system_suspend') : endInterrupt('system_suspend')));
    const flushTimer = tracker ? null : setInterval(flush, 2000); // with a camera the gaze effect already flushes
    return () => { offWin(); offList(); offState(); offDisplay(); offPower(); if (flushTimer) clearInterval(flushTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tracker, flush]);

  // Sends the final data and the outcome. The screen still (if sharing) was taken at the moment the task ended.
  const submit = useCallback(async (body, frame) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      closeAllInterrupts();
      await flush();
      await flush(); // second pass picks up samples that arrived during the first
      if (frame && recording.current) {
        await api.post('/gaze/snapshot', { taskId: task._id, image: frame.image, width: frame.width, height: frame.height }).catch(() => {});
      }
      const { data: r } = await api.post(`/tasks/${task._id}/complete`, { ...body, activity: activityPayload(body.endedAfterMs ?? rel()) });
      desktop.stopMonitor();
      desktop.publishState({ active: false });
      setMessage(r.data.timedOut ? 'Time is up.' : 'Task ended.');
      if (recording.current && (tracker || isDesktop)) setPhase('results');
      else { setPhase('feedback'); }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task._id, onFinished, flush, tracker]);

  // Timer, gaze recording and all calculations begin here, when the activity actually starts.
  const begin = async (trigger, how = 'manual') => {
    if (beginning.current) return;
    beginning.current = true;
    setError('');
    try {
      const { data: r } = await api.post(`/tasks/${task._id}/start`);
      setData(r.data);
      if (tracker || isDesktop) {
        try {
          const info = await desktop.info();
          const display = tracker?.display || (isDesktop ? await desktop.getDisplay() : null);
          await api.post('/gaze/recordings', {
            taskId: task._id, withGaze: !!tracker, ...(display && { display }),
            environment: { source: info?.source || (isDesktop ? 'desktop' : 'browser'), platform: info?.platform, appVersion: info?.appVersion },
          });
          recording.current = true;
          tracker?.resetTaskStats();
          if (isDesktop) await desktop.startMonitor(rules);
        } catch (e) {
          recording.current = false;
          setNotice(`Measurements could not be started: ${errorMessage(e)}`);
        }
      }
      onset.current = performance.now();
      deadline.current = onset.current + r.data.remainingMs;
      if (trigger?.app || trigger?.title) {
        appBuf.current.push({ t: 0, app: trigger.app, title: trigger.title, path: trigger.path, b: trigger.b });
        setActiveApp(trigger.app || trigger.title);
        setDetected({ app: trigger.app || trigger.title, at: 0 });
        onPresence(true, trigger.app || trigger.title);
      }
      setStartedBy(how);
      setRemaining(r.data.remainingMs);
      setPhase('running');
    } catch (e) {
      beginning.current = false;
      if (e.response?.status === 409 && /already completed/i.test(errorMessage(e))) setAlreadyDone(true);
      setError(errorMessage(e));
    }
  };

  // The task stays "Activity Not Yet Started" until the target application is detected (or the participant confirms manually).
  const start = async () => {
    setError('');
    await refreshDesktop();
    if (isDesktop && rules.length) {
      const info = await desktop.info();
      const ok = !!info?.monitorSupported && (await desktop.startMonitor(rules));
      setMonitorOk(ok);
    }
    setPhase('armed');
  };

  useEffect(() => {
    if (phase !== 'armed' || !isDesktop || !rules.length) return undefined;
    baseline.current = null;
    // An application that was already open counts only once the participant interacts with it (it becomes the active window);
    // one that is launched, or closed and reopened, counts as soon as its window appears.
    const offList = desktop.onOpenWindows((list) => {
      const hit = list.find((e) => matchesTarget(rules, e));
      if (baseline.current === null) { baseline.current = !!hit; return; }
      if (!hit) baseline.current = false;
      else if (!baseline.current) begin(hit, 'detected');
    });
    const offWin = desktop.onActiveWindow((w) => { if (matchesTarget(rules, w)) begin(w, 'detected'); });
    return () => { offList(); offWin(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const id = setInterval(() => {
      const left = Math.max(0, deadline.current - performance.now());
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        submit({ outcome: 'timeout' }, screen?.frame());
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, submit, screen]);

  // End Task freezes the clock and tracking immediately; the participant then reports whether they finished.
  const endTask = useCallback(() => {
    endClick.current = { at: performance.now(), elapsed: Math.round(performance.now() - onset.current), frame: screen?.frame() || null };
    setPhase('ending');
  }, [screen]);
  const cancelEnd = () => {
    deadline.current += performance.now() - endClick.current.at; // the paused time does not count against the limit
    setPhase('running');
  };
  const report = (outcome) => submit({ outcome, endedAfterMs: endClick.current.elapsed }, endClick.current.frame);

  // Mirror the task state into the always-on-top controller window so End Task stays reachable over other applications.
  stateRef.current = { phase, remaining, instruction: task.instruction, activeApp, detected, faceOk, live, status: activityStatus(activity.sessions) };
  useEffect(() => {
    if (!isDesktop || (phase !== 'running' && phase !== 'ending')) return undefined;
    const push = () => {
      const s = stateRef.current;
      desktop.publishState({
        active: true, ending: s.phase === 'ending', instruction: s.instruction, remainingMs: s.remaining, activeApp: s.activeApp,
        verified: s.detected ? s.detected.app : null, activity: s.status, faceOk: s.faceOk, fixations: s.live.fixations, blinkRate: s.live.blinkRate,
      });
    };
    push();
    const id = setInterval(push, 500);
    const off = desktop.onEndRequest(() => { if (stateRef.current.phase === 'running') endTask(); });
    return () => { clearInterval(id); off(); };
  }, [phase, endTask]);

  if (phase === 'instruction') {
    return (
      <div className="card mx-auto max-w-xl space-y-4 p-8 text-center">
        <p className="text-sm text-slate-500">{osLabel} · Task {index + 1} of {total}</p>
        <h2 className="text-xl font-semibold">{task.instruction}</h2>
        <p className="text-sm text-slate-500">
          Do this on your own computer. The timer and eye tracking start when the activity starts ({isDesktop && rules.length ? 'when you open the required application' : 'when you switch to your work window or confirm'}); press End Task when you are done.
          You have {task.timeLimit >= 120 ? `${Math.round(task.timeLimit / 6) / 10} minutes` : `${task.timeLimit} seconds`}.
          {isDesktop
            ? ' You can switch to other applications; a small End Task window stays on top while you work.'
            : ' Keep this window visible (snapped to one side or on a second monitor) so tracking keeps running.'}
        </p>
        {rules.length > 0 && isDesktop && <p className="text-xs text-slate-400">The desktop app will check automatically whether the required application was opened.</p>}
        <Alert>{error}</Alert>
        <button className="btn-primary" onClick={start}>Start</button>
      </div>
    );
  }

  if (phase === 'armed') {
    return (
      <div className="card mx-auto max-w-xl space-y-4 p-8 text-center">
        <p className="text-sm text-slate-500">{osLabel} · Task {index + 1} of {total}</p>
        <h2 className="text-xl font-semibold">{task.instruction}</h2>
        <p className={`rounded-lg px-3 py-2 text-sm font-medium ${STATUS.not_started.cls}`}>{STATUS.not_started.label}</p>
        <p className="text-sm text-slate-500">
          {isDesktop && rules.length && monitorOk
            ? 'The timer and all measurements begin automatically when the desktop app detects the application this task asks for. Opening anything else does not start it.'
            : isDesktop && rules.length
              ? 'Automatic detection is not available on this system (for example a missing permission or Wayland). Confirm below when you begin.'
              : 'Automatic detection is not running. Start the Windows monitor (python monitor/agent.py) or the desktop app, then press Start again; or confirm below when you begin and the activity will not be detected automatically.'}
        </p>
        <Alert>{error}</Alert>
        {alreadyDone ? (
          <NextButtons hasMore={hasMore} onContinue={onFinished} onFinishAll={finishAll} />
        ) : (
          <button className="btn-ghost border border-slate-300" onClick={() => begin(null, 'manual')}>I am starting the task now</button>
        )}
      </div>
    );
  }

  if (phase === 'feedback') {
    return (
      <div className="card mx-auto max-w-xl space-y-4 p-8 text-center">
        <p className="text-lg">{message}</p>
        <div className="flex justify-center"><NextButtons hasMore={hasMore} onContinue={onFinished} onFinishAll={finishAll} /></div>
      </div>
    );
  }
  if (phase === 'results') return <TaskResults taskId={task._id} headline={message} onContinue={onFinished} hasMore={hasMore} onFinishAll={finishAll} />;

  const secs = Math.ceil(remaining / 1000);
  const tracking = !!tracker;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-slate-500">{osLabel} · Task {index + 1} of {total}</p>
          <p className="font-medium">{data.instruction}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg px-3 py-1 font-mono text-lg ${secs <= 10 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`} aria-label="Time left">{mm}:{ss}</div>
          <button className="btn bg-red-600 px-6 py-3 text-base text-white hover:bg-red-700" disabled={phase !== 'running' || busy} onClick={endTask}>End Task</button>
        </div>
      </div>
      <Alert>{error}</Alert>

      {phase === 'running' && <ActivityPanel sessions={activity.sessions} nowMs={rel()} manual={startedBy === 'manual'} />}

      {phase === 'ending' && (
        <div role="dialog" aria-label="End task" className="card space-y-3 border-red-200 p-5">
          <p className="font-medium">Task stopped at {(endClick.current.elapsed / 1000).toFixed(1)} s. Did you complete the task?</p>
          {activityStatus(activity.sessions) === 'closed' && <p className="text-sm text-amber-700">The target application was closed before you ended the task. Closing is not treated as completing; your answer is recorded as self-reported only.</p>}
          {detected
            ? <p className="text-sm text-green-700">The desktop app detected <strong>{detected.app}</strong> at {(detected.at / 1000).toFixed(1)} s. This is checked again on the server; your answer is recorded separately as self-reported.</p>
            : rules.length > 0 && isDesktop && <p className="text-sm text-amber-700">The required application was not detected. You can still report the task as complete; it will be marked self-reported only.</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => report('completed')}>Yes, I completed it</button>
            <button className="btn-ghost border border-slate-300" disabled={busy} onClick={() => report('not_completed')}>No, I could not complete it</button>
            <button className="btn-ghost" disabled={busy} onClick={cancelEnd}>Keep working</button>
          </div>
        </div>
      )}

      {notice && <Alert type="error">{notice}</Alert>}
      {tracking && !faceOk && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <EyeOff className="h-4 w-4" /> Your face or eyes cannot be detected. Face the camera, keep your head in view and check the lighting. Gaze is not recorded while this is shown.
        </div>
      )}

      {isDesktop && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${detected ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
          <MonitorCheck className="h-4 w-4" />
          {detected ? `Application detected: ${detected.app}` : rules.length ? 'Waiting for the required application to open…' : 'No automatic check for this task; press End Task when you are done.'}
          {activeApp && <span className="ml-auto text-xs opacity-70">Active: {activeApp}</span>}
        </div>
      )}

      {tracking ? (
        <div className="max-w-xs">
          <aside className="card h-fit space-y-3 p-4" aria-label="Live eye tracking">
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${faceOk ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
              <ScanFace className="h-4 w-4" /> {faceOk ? 'Face and eyes detected · tracking' : 'Face not detected'}
            </div>
            <div className="space-y-1">
              <Row label="Gaze X, Y (px)" value={live.x === null ? 'n/a' : `${live.x}, ${live.y}`} />
              <Row label="Gaze on screen" value={live.rx === null ? 'n/a' : `${(live.rx * 100).toFixed(0)}%, ${(live.ry * 100).toFixed(0)}%`} />
              <Row label="Fixations" value={live.fixations} />
              <Row label="Dwell total" value={`${live.totalDwell} ms`} />
              <Row label="Dwell average" value={`${live.avgDwell} ms`} />
              <Row label="Current fixation" value={`${live.currentDwell} ms`} />
              <Row label="Blinks" value={live.blinks} />
              <Row label="Blink rate" value={live.blinkRate === null ? 'measuring\u2026' : `${live.blinkRate}/min`} />
              <Row label="Gaze samples" value={live.samples} />
            </div>
          </aside>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Eye tracking is off for this session. Do the task, then press End Task.</p>
      )}
    </div>
  );
}
