import { useState } from 'react';
import { useExperiments, useRecordings } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import VerificationBadge from '../../components/VerificationBadge.jsx';
import { OS_LABEL } from '../experiments/Experiments.jsx';

const fmt = (v, unit = '') => (v === null || v === undefined ? <span className="text-slate-400" title="Unavailable">n/a</span> : `${v}${unit}`);
const QUALITY = { good: 'bg-green-100 text-green-700', fair: 'bg-amber-100 text-amber-800', poor: 'bg-red-100 text-red-700', unavailable: 'bg-slate-100 text-slate-500' };

export function ExperimentOSFilter({ experiments, experimentId, setExperimentId, os, setOs, children }) {
  return (
    <div className="flex flex-wrap gap-3">
      <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment">
        <option value="">Select experiment…</option>
        {experiments.map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
      </select>
      {setOs && (
        <select className="input w-auto" value={os} onChange={(e) => setOs(e.target.value)} aria-label="Operating system">
          <option value="">All operating systems</option>
          {Object.entries(OS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      )}
      {children}
    </div>
  );
}

export default function EyeTracking() {
  const { experiments, error: e1 } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [os, setOs] = useState('');
  const { recordings, error: e2 } = useRecordings(experimentId, os);

  if (!experiments) return e1 ? <Alert>{e1}</Alert> : <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Eye tracking recordings</h1>
      <p className="text-sm text-slate-500">
        Webcam-based gaze estimates (WebGazer). Fixations use I-DT (dispersion ≤ 0.05, ≥ 100 ms). "n/a" means the metric could not be computed from the data; 0 is a measured zero.
      </p>
      <ExperimentOSFilter {...{ experiments, experimentId, setExperimentId, os, setOs }} />
      <Alert>{e2}</Alert>
      <div className="card overflow-x-auto">
        {!experimentId ? <p className="p-6 text-sm text-slate-500">Select an experiment.</p>
          : !recordings ? <Spinner />
          : recordings.length === 0 ? <p className="p-6 text-sm text-slate-500">No gaze recordings yet.</p>
          : (
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>{['Participant', 'OS', 'Task', 'Samples', 'Fixations', 'Total dwell', 'Avg fixation', 'TTFF', 'Revisits', 'Blinks/min', 'Face lost', 'Completion', 'Quality'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {recordings.map((r) => (
                  <tr key={`${r.participantId}${r.taskId}`}>
                    <td className="px-4 py-3">{r.participant?.name} <span className="font-mono text-xs text-slate-400">{r.participant?.participantCode}</span></td>
                    <td className="px-4 py-3">{OS_LABEL[r.operatingSystem]}</td>
                    <td className="px-4 py-3">{r.task?.taskNumber}</td>
                    <td className="px-4 py-3">{r.sampleCount}</td>
                    <td className="px-4 py-3">{fmt(r.metrics?.totalFixations)}</td>
                    <td className="px-4 py-3">{fmt(r.metrics?.totalDwell, ' ms')}</td>
                    <td className="px-4 py-3">{fmt(r.metrics?.avgFixationDuration, ' ms')}</td>
                    <td className="px-4 py-3">{fmt(r.metrics?.ttff, ' ms')}</td>
                    <td className="px-4 py-3">{fmt(r.metrics?.revisitCount)}</td>
                    <td className="px-4 py-3">{fmt(r.metrics?.blinkRate)}</td>
                    <td className="px-4 py-3">{r.metrics?.faceLostMs == null ? <span className="text-slate-400">n/a</span> : `${(r.metrics.faceLostMs / 1000).toFixed(1)} s`}</td>
                    <td className="px-4 py-3 text-xs"><VerificationBadge status={r.verification} selfReported={r.selfReported} /></td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${QUALITY[r.metrics?.dataQuality || 'unavailable']}`}>{r.metrics?.dataQuality || 'pending'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
