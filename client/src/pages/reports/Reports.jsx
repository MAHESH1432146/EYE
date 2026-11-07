import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { Card, fmt } from '../../components/Charts.jsx';
import { download } from '../../services/download.js';

export default function Reports() {
  const { experiments, error: e1 } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [report, setReport] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantId, setParticipantId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setReport(null); setParticipants([]); setParticipantId('');
    if (!experimentId) return;
    Promise.all([api.get(`/reports/experiment/${experimentId}`), api.get('/assignments', { params: { experimentId } })])
      .then(([r, a]) => { setReport(r.data.data); setParticipants(a.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId]);

  const run = (key, fn) => async () => {
    setBusy(key); setError('');
    try { await fn(); } catch (e) {
      // Blob responses carry the error JSON as a Blob.
      const text = e.response?.data instanceof Blob ? await e.response.data.text().catch(() => '') : '';
      try { setError(JSON.parse(text).message); } catch { setError(errorMessage(e)); }
    } finally { setBusy(''); }
  };

  if (!experiments) return e1 ? <Alert>{e1}</Alert> : <Spinner />;
  const Btn = ({ k, onClick, children }) => (
    <button className="btn-ghost border border-slate-300" disabled={!!busy} onClick={run(k, onClick)}>
      <Download className="h-4 w-4" /> {busy === k ? 'Preparing…' : children}
    </button>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports and exports</h1>
      <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment">
        <option value="">Select experiment…</option>
        {experiments.map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
      </select>
      <Alert>{error}</Alert>

      {experimentId && !report && !error && <Spinner />}
      {report && (
        <>
          <Card title="Experiment research report">
            <div className="flex flex-wrap gap-2">
              <Btn k="pdf" onClick={() => download('/reports/export/pdf', { experimentId }, 'experiment-report.pdf')}>PDF report</Btn>
              <Btn k="c1" onClick={() => download('/reports/export/csv', { experimentId, dataset: 'task-results' }, 'task-results.csv')}>CSV: task results</Btn>
              <Btn k="c2" onClick={() => download('/reports/export/csv', { experimentId, dataset: 'eye-metrics' }, 'eye-metrics.csv')}>CSV: eye-tracking metrics</Btn>
              <Btn k="c3" onClick={() => download('/reports/export/csv', { experimentId, dataset: 'sus' }, 'sus.csv')}>CSV: SUS</Btn>
              <Btn k="c4" onClick={() => download('/reports/export/csv', { experimentId, dataset: 'task-wise' }, 'task-wise.csv')}>CSV: task-wise (per participant and task)</Btn>
            </div>
          </Card>

          <Card title="Report preview">
            <div className="space-y-3 text-sm">
              <p><span className="font-medium">Participants:</span> {report.demographics.assigned} assigned, {report.demographics.completed} completed, mean age {fmt(report.demographics.age.mean)}</p>
              <div>
                <p className="font-medium">Measured results</p>
                <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300">
                  {Object.values(report.taskAnalysis.metrics).map((m) => (
                    <li key={m.label}>{m.label}: {['windows', 'macos', 'linux'].map((os) => `${os} ${m.byOS[os].n ? fmt(m.byOS[os].mean) : 'n/a'}`).join(' · ')}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Automatically generated (not researcher-authored)</p>
                <ul className="list-disc pl-5">{report.generated.findings.map((f) => <li key={f}>{f}</li>)}</ul>
                <p>{report.generated.conclusion}</p>
              </div>
              <div>
                <p className="font-medium">Limitations</p>
                <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300">{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            </div>
          </Card>

          <Card title="Individual participant report">
            {participants.length === 0 ? <p className="text-sm text-slate-500">No assigned participants.</p> : (
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto" value={participantId} onChange={(e) => setParticipantId(e.target.value)} aria-label="Participant">
                  <option value="">Select participant…</option>
                  {participants.map((a) => <option key={a._id} value={a.participantId?._id}>{a.participantId?.name} ({a.participantId?.participantCode})</option>)}
                </select>
                <Btn k="ppdf" onClick={() => { if (!participantId) throw new Error('Select a participant'); return download('/reports/export/pdf', { experimentId, participantId }, 'participant-report.pdf'); }}>
                  <FileText className="h-4 w-4" /> PDF
                </Btn>
                <Btn k="pcsv" onClick={() => { if (!participantId) throw new Error('Select a participant'); return download(`/reports/participant/${participantId}`, { experimentId, format: 'csv' }, 'participant.csv'); }}>CSV</Btn>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
