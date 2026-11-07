import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import { useSnapshotUrl } from '../../hooks/useSnapshot.js';
import { useExperiments, useRecordings } from '../../hooks/useGazeData.js';
import { ScanPathView } from '../../components/GazeCanvases.jsx';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { ExperimentOSFilter } from './EyeTracking.jsx';
import { OS_LABEL } from '../experiments/Experiments.jsx';

function Player({ data, participantId }) {
  const snapshot = useSnapshotUrl(data.task._id, participantId);
  const total = data.fixations.length;
  const [step, setStep] = useState(total);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setStep(total); setPlaying(false); }, [data, total]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setStep((s) => {
      if (s >= total) { setPlaying(false); return s; }
      return s + 1;
    }), 700);
    return () => clearInterval(id);
  }, [playing, total]);

  const toggle = () => { if (!playing && step >= total) setStep(0); setPlaying((p) => !p); };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button className="btn-ghost border border-slate-300 py-1" onClick={toggle} disabled={!total}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? 'Pause' : 'Play'}
        </button>
        <button className="btn-ghost border border-slate-300 py-1" onClick={() => { setPlaying(false); setStep(0); }}><RotateCcw className="h-4 w-4" /> Reset</button>
        <span className="text-xs text-slate-500">Fixation {step} / {total}</span>
      </div>
      {total === 0 && <Alert>No fixations detected (insufficient or too dispersed gaze data).</Alert>}
      <ScanPathView src={snapshot} fixations={data.fixations} upTo={step} />
    </div>
  );
}

export default function ScanPaths() {
  const { experiments, error: e1 } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [os, setOs] = useState('');
  const [mode, setMode] = useState('single');
  const [participantId, setParticipantId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [taskNumber, setTaskNumber] = useState('');
  const { recordings } = useRecordings(experimentId, mode === 'single' ? os : '');
  const [single, setSingle] = useState(null);
  const [compare, setCompare] = useState(null);
  const [error, setError] = useState('');

  const participants = useMemo(() => {
    const m = new Map();
    (recordings || []).forEach((r) => m.set(r.participantId, r.participant));
    return [...m.entries()];
  }, [recordings]);
  const mine = (recordings || []).filter((r) => r.participantId === participantId);
  const taskNumbers = [...new Set(mine.map((r) => r.task.taskNumber))].sort((a, b) => a - b);

  useEffect(() => { setParticipantId(''); setTaskId(''); setTaskNumber(''); }, [experimentId, os, mode]);
  useEffect(() => { setTaskId(''); setTaskNumber(''); }, [participantId]);

  useEffect(() => {
    setSingle(null);
    if (mode !== 'single' || !taskId || !participantId) return;
    api.get(`/gaze/scanpath/${taskId}`, { params: { participantId } })
      .then((r) => { setSingle(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [mode, taskId, participantId]);

  useEffect(() => {
    setCompare(null);
    if (mode !== 'compare' || !taskNumber || !participantId) return;
    const targets = mine.filter((r) => String(r.task.taskNumber) === String(taskNumber));
    Promise.all(targets.map((r) =>
      api.get(`/gaze/scanpath/${r.taskId}`, { params: { participantId } }).then((x) => x.data.data)
    ))
      .then((all) => { setCompare(all); setError(''); })
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, taskNumber, participantId, recordings]);

  if (!experiments) return e1 ? <Alert>{e1}</Alert> : <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scan paths</h1>
      <div className="flex gap-1">
        {[['single', 'Single task'], ['compare', 'OS comparison']].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={`btn ${mode === k ? 'bg-blue-600 text-white' : 'btn-ghost border border-slate-300'}`}>{l}</button>
        ))}
      </div>
      <ExperimentOSFilter {...{ experiments, experimentId, setExperimentId }} os={os} setOs={mode === 'single' ? setOs : undefined}>
        <select className="input w-auto" value={participantId} onChange={(e) => setParticipantId(e.target.value)} aria-label="Participant">
          <option value="">Select participant…</option>
          {participants.map(([pid, p]) => <option key={pid} value={pid}>{p?.name} ({p?.participantCode})</option>)}
        </select>
        {mode === 'single' ? (
          <select className="input w-auto" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!participantId} aria-label="Task">
            <option value="">Select task…</option>
            {mine.map((r) => <option key={r.taskId} value={r.taskId}>{OS_LABEL[r.operatingSystem]} · Task {r.task.taskNumber}</option>)}
          </select>
        ) : (
          <select className="input w-auto" value={taskNumber} onChange={(e) => setTaskNumber(e.target.value)} disabled={!participantId} aria-label="Task number">
            <option value="">Select task number…</option>
            {taskNumbers.map((n) => <option key={n} value={n}>Task {n}</option>)}
          </select>
        )}
      </ExperimentOSFilter>
      <Alert>{error}</Alert>

      {mode === 'single' && (!single ? <p className="text-sm text-slate-500">Select a participant and task.</p> : (
        <div className="max-w-4xl space-y-2">
          <p className="text-sm text-slate-500">
            {single.task.instruction} · I-DT: dispersion ≤ {single.fixationParams.dispersionThreshold}, ≥ {single.fixationParams.minDurationMs} ms. Circle size reflects duration.
          </p>
          <Player data={single} participantId={participantId} />
        </div>
      ))}

      {mode === 'compare' && (!compare ? <p className="text-sm text-slate-500">Select a participant and task number.</p> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {['windows', 'macos', 'linux'].map((k) => {
            const d = compare.find((c) => c.task.operatingSystem === k);
            return (
              <div key={k} className="space-y-2">
                <h3 className="font-medium">{OS_LABEL[k]}</h3>
                {d ? <Player data={d} participantId={participantId} /> : <p className="text-sm text-slate-500">No recording for this OS.</p>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
