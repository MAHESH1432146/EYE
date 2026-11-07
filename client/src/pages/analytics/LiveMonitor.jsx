import { useEffect, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import { useSnapshotUrl } from '../../hooks/useSnapshot.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import { HeatmapView } from '../../components/GazeCanvases.jsx';
import Alert from '../../components/Alert.jsx';
import Spinner from '../../components/Spinner.jsx';
import { StatCard, OS_LABEL } from '../../components/Charts.jsx';

const val = (v, unit = '') => (v === null || v === undefined ? 'n/a' : `${v}${unit}`);

export default function LiveMonitor() {
  const { experiments } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [active, setActive] = useState([]);
  const [sel, setSel] = useState(null);
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const snapshot = useSnapshotUrl(live?.finished ? sel?.taskId : null, sel?.participantId);

  // Participants currently running a task.
  useEffect(() => {
    if (!experimentId) { setActive([]); return undefined; }
    const load = () => api.get('/gaze/live/active', { params: { experimentId } }).then((r) => setActive(r.data.data)).catch((e) => setError(errorMessage(e)));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [experimentId]);

  // Metrics and heatmap refresh every 2 s while the task runs.
  useEffect(() => {
    setLive(null);
    if (!sel) return undefined;
    const load = () => api.get(`/gaze/live/${sel.taskId}`, { params: { participantId: sel.participantId } }).then((r) => { setLive(r.data.data); setError(''); }).catch((e) => setError(errorMessage(e)));
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [sel]);

  const m = live?.metrics;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Live monitor</h1>
      <p className="text-sm text-slate-500">Follow a participant's current task. Values are recomputed from the gaze received so far (webcam estimate, approximate).</p>
      <select className="input w-auto" value={experimentId} onChange={(e) => { setExperimentId(e.target.value); setSel(null); }} aria-label="Experiment">
        <option value="">Select experiment…</option>
        {(experiments || []).map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
      </select>
      <Alert>{error}</Alert>

      {experimentId && (active.length === 0 ? <p className="text-sm text-slate-500">No participant is running a task right now.</p> : (
        <div className="flex flex-wrap gap-2">
          {active.map((a) => (
            <button key={a.taskId + a.participantId} onClick={() => setSel({ taskId: a.taskId, participantId: a.participantId })}
              className={`btn ${sel?.taskId === a.taskId ? 'bg-blue-600 text-white' : 'btn-ghost border border-slate-300'}`}>
              {a.participant?.name} · {OS_LABEL[a.operatingSystem]} · Task {a.task?.taskNumber}
            </button>
          ))}
        </div>
      ))}

      {sel && !live && <Spinner />}
      {live && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${live.running ? 'animate-pulse bg-green-500' : 'bg-slate-400'}`} />
            {live.running ? 'Task in progress' : live.finished ? `Finished (${live.isCorrect ? 'reported complete' : 'reported not complete'})` : 'Waiting'} · {live.task.instruction}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Gaze samples" value={live.samples} hint={`${(live.elapsedMs / 1000).toFixed(1)} s recorded`} />
            <StatCard label="Fixations (anywhere)" value={live.fixations} />
            <StatCard label="Blink rate" value={m.blinkRate === null ? 'n/a' : `${m.blinkRate}/min`} hint={`${val(m.blinkCount)} blinks`} />
            <StatCard label="Dwell total" value={val(m.totalDwell, ' ms')} />
            <StatCard label="Avg fixation" value={val(m.avgFixationDuration, ' ms')} hint={`quality: ${m.dataQuality}`} />
          </div>
          <div className="max-w-4xl"><HeatmapView src={snapshot} heatmap={live.heatmap} /></div>
        </div>
      )}
    </div>
  );
}
