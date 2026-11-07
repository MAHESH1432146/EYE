import { useEffect, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import { useSnapshotUrl } from '../../hooks/useSnapshot.js';
import Alert from '../../components/Alert.jsx';
import Spinner from '../../components/Spinner.jsx';
import { ScanPathView } from '../../components/GazeCanvases.jsx';

const ROWS = ['top', 'middle', 'bottom'];
const COLS = ['left', 'center-left', 'center-right', 'right'];
const area = (c) => `${ROWS[c.row]} ${COLS[c.col]}`;
const n = (v, unit = '') => (v === null || v === undefined ? 'n/a' : `${v}${unit}`);

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function Verification({ v, selfReported }) {
  const map = {
    verified: ['bg-green-50 text-green-800', `Verified automatically: ${v?.matchedApp || 'the required application'} was opened${v?.firstMatchedMs != null ? ` at ${(v.firstMatchedMs / 1000).toFixed(1)} s` : ''}.`],
    not_detected: ['bg-amber-50 text-amber-900', 'The required application was not detected. Completion is self-reported only.'],
    unavailable: ['bg-slate-100 text-slate-600', 'Automatic checking was not available (browser session). Completion is self-reported only.'],
    not_verifiable: ['bg-slate-100 text-slate-600', 'This task cannot be checked automatically. Completion is self-reported only.'],
  };
  const [cls, text] = map[v?.status || 'not_verifiable'];
  return <div className={`rounded-lg px-3 py-2 text-sm ${cls}`}>{text} You reported the task as {selfReported ? 'complete' : 'not complete'}.</div>;
}

// After a task: go on to the next one, or stop and move to the questionnaire (remaining tasks are skipped).
export function NextButtons({ hasMore, onContinue, onFinishAll }) {
  const [busy, setBusy] = useState(false);
  const finishAll = async () => {
    if (!window.confirm('Finish now? The remaining tasks will be skipped and the experiment will end.')) return;
    setBusy(true);
    try { await onFinishAll(); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap gap-3">
      <button className="btn-primary" disabled={busy} onClick={onContinue}>{hasMore ? 'Continue to next task' : 'Continue'}</button>
      {hasMore && <button className="btn-ghost border border-slate-300" disabled={busy} onClick={finishAll}>Finish all tasks</button>}
    </div>
  );
}

// Shown to the participant after each task; every value is derived from the recorded gaze (n/a when unavailable).
export default function TaskResults({ taskId, headline, onContinue, hasMore, onFinishAll }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const snapshot = useSnapshotUrl(taskId);

  useEffect(() => {
    api.get(`/gaze/result/${taskId}`).then((x) => setR(x.data.data)).catch((e) => setError(errorMessage(e)));
  }, [taskId]);

  if (error) return <div className="space-y-3"><Alert>{error}</Alert><button className="btn-primary" onClick={onContinue}>Continue</button></div>;
  if (!r) return <Spinner />;
  const g = r.gaze;
  const m = g?.metrics;
  const unavailable = !g || m.dataQuality === 'unavailable';

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{headline}</h2>
      <Verification v={r.verification} selfReported={r.selfReportedComplete} />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Task completion time" value={n(r.completionTime !== null && r.completionTime !== undefined ? (r.completionTime / 1000).toFixed(2) : null, ' s')} hint={r.timedOut ? 'time limit reached' : r.selfReportedComplete ? 'you reported it complete' : 'you reported it not complete'} />
        {!unavailable && (
          <>
            <Stat label="Total fixations" value={n(m.totalFixations)} />
            <Stat label="Total dwell time" value={n(m.totalDwell, ' ms')} />
            <Stat label="Average fixation" value={n(m.avgFixationDuration, ' ms')} />
            <Stat label="Blink rate" value={m.blinkRate === null ? 'n/a' : `${m.blinkRate}/min`} hint={`${n(m.blinkCount)} blinks · ${(m.trackedMs / 1000).toFixed(1)} s tracked`} />
            <Stat label="Face not detected" value={`${((m.faceLostMs || 0) / 1000).toFixed(1)} s`} hint={m.interruptedMs ? `${(m.interruptedMs / 1000).toFixed(1)} s of recorded interruptions` : undefined} />
            {m.targetKind !== 'none' && (
              <>
                <Stat label="Time to first fixation on target" value={m.ttff === null ? 'not reached' : `${m.ttff} ms`} />
                <Stat label="Revisits to target" value={n(m.revisitCount)} hint={`${n(m.fixationCount)} fixations on target`} />
              </>
            )}
            <Stat label="Region revisits" value={n(m.totalRevisits)} hint="returns to a previously viewed screen area" />
            <Stat label="Gaze samples" value={g.sampleCount} hint={`quality: ${m.dataQuality}`} />
          </>
        )}
      </div>

      {unavailable ? (
        <Alert>Not enough eye-tracking data was captured for this task (face or eyes were not detected often enough), so no gaze results are shown.</Alert>
      ) : (
        <>
          {m.dataQuality === 'poor' && <Alert>Tracking quality was poor for this task; treat the numbers below as unreliable.</Alert>}
          <div className="max-w-2xl">
            <div><p className="mb-1 text-sm font-medium">Gaze movement (numbered fixations)</p><ScanPathView src={snapshot} fixations={g.fixations} /></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
              <p className="mb-1 font-medium">Most viewed screen areas</p>
              {m.regions.mostViewed.length === 0 ? <p className="text-slate-500">No fixations on the image.</p> : (
                <ol className="list-decimal pl-5">
                  {m.regions.mostViewed.map((c) => <li key={`${c.row}${c.col}`}>{area(c)}: {c.fixations} fixation(s), {c.dwell} ms ({Math.round(c.share * 100)}% of dwell)</li>)}
                </ol>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
              <p className="mb-1 text-sm font-medium">Fixation coordinates (share of image width/height)</p>
              <table className="w-full text-left">
                <thead className="text-slate-500"><tr><th>#</th><th>x</th><th>y</th><th>start</th><th>dwell</th></tr></thead>
                <tbody>{g.fixations.map((f) => <tr key={f.order}><td>{f.order}</td><td>{f.x.toFixed(3)}</td><td>{f.y.toFixed(3)}</td><td>{Math.round(f.start)} ms</td><td>{Math.round(f.duration)} ms</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <NextButtons hasMore={hasMore} onContinue={onContinue} onFinishAll={onFinishAll} />
    </div>
  );
}
