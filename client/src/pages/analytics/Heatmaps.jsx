import { useEffect, useMemo, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments, useRecordings } from '../../hooks/useGazeData.js';
import { HeatmapView } from '../../components/GazeCanvases.jsx';
import { useSnapshotUrl } from '../../hooks/useSnapshot.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { ExperimentOSFilter } from './EyeTracking.jsx';
import { OS_LABEL } from '../experiments/Experiments.jsx';

export default function Heatmaps() {
  const { experiments, error: e1 } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [os, setOs] = useState('');
  const [taskId, setTaskId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const { recordings } = useRecordings(experimentId, os);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const snapshot = useSnapshotUrl(taskId, participantId);

  const tasks = useMemo(() => {
    const m = new Map();
    (recordings || []).forEach((r) => m.set(r.taskId, r));
    return [...m.values()].sort((a, b) => a.operatingSystem.localeCompare(b.operatingSystem) || a.task.taskNumber - b.task.taskNumber);
  }, [recordings]);
  const participants = useMemo(() => {
    const m = new Map();
    (recordings || []).filter((r) => r.taskId === taskId).forEach((r) => m.set(r.participantId, r.participant));
    return [...m.entries()];
  }, [recordings, taskId]);

  useEffect(() => { setTaskId(''); setParticipantId(''); }, [experimentId, os]);
  useEffect(() => { setParticipantId(''); }, [taskId]);

  useEffect(() => {
    setView(null);
    if (!taskId) return;
    api.get(`/gaze/heatmap/${taskId}`, { params: { participantId: participantId || undefined } })
      .then((r) => { setView(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [taskId, participantId]);

  if (!experiments) return e1 ? <Alert>{e1}</Alert> : <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Heatmaps</h1>
      <ExperimentOSFilter {...{ experiments, experimentId, setExperimentId, os, setOs }}>
        <select className="input w-auto" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Task">
          <option value="">Select task…</option>
          {tasks.map((r) => <option key={r.taskId} value={r.taskId}>{OS_LABEL[r.operatingSystem]} · Task {r.task.taskNumber}</option>)}
        </select>
        <select className="input w-auto" value={participantId} onChange={(e) => setParticipantId(e.target.value)} disabled={!taskId} aria-label="Participant">
          <option value="">All participants (aggregate)</option>
          {participants.map(([pid, p]) => <option key={pid} value={pid}>{p?.name} ({p?.participantCode})</option>)}
        </select>
      </ExperimentOSFilter>
      <Alert>{error}</Alert>
      {!taskId ? <p className="text-sm text-slate-500">Choose an experiment and a task that has gaze recordings.</p>
        : !view ? <Spinner />
        : (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">
              {view.task.instruction} · {view.recordings} recording(s) · {view.heatmap.samplesUsed} gaze samples on screen.
              {participantId ? (snapshot ? ' Background: the participant\'s captured screen still.' : ' No screen still was captured; the grid shows 4 x 3 screen regions.') : ' Aggregate over participants; the grid shows 4 x 3 screen regions.'}
            </p>
            {view.heatmap.samplesUsed === 0 && <Alert>No gaze samples fall on the screen for this selection.</Alert>}
            <div className="max-w-4xl">
              <HeatmapView src={participantId ? snapshot : null} heatmap={view.heatmap} />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              Low <span className="h-2 w-40 rounded" style={{ background: 'linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)' }} /> High
            </div>
          </div>
        )}
    </div>
  );
}
