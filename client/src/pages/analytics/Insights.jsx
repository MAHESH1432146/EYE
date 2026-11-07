import { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { Card, OS_LABEL, fmt } from '../../components/Charts.jsx';

const sec = (ms) => (ms === null || ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);

export default function Insights() {
  const { experiments } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [people, setPeople] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPeople([]); setParticipantId('');
    if (experimentId) api.get('/assignments', { params: { experimentId } }).then((r) => setPeople(r.data.data)).catch(() => {});
  }, [experimentId]);

  useEffect(() => {
    setData(null);
    if (!experimentId) return;
    api.get('/analytics/recommendations', { params: { experimentId, participantId: participantId || undefined } })
      .then((r) => { setData(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId, participantId]);

  const o = data?.overall;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">OS suggestions</h1>
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment">
          <option value="">Select experiment…</option>
          {(experiments || []).map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
        </select>
        <select className="input w-auto" value={participantId} onChange={(e) => setParticipantId(e.target.value)} disabled={!experimentId} aria-label="Participant">
          <option value="">All participants</option>
          {people.map((a) => <option key={a._id} value={a.participantId?._id}>{a.participantId?.name} ({a.participantId?.participantCode})</option>)}
        </select>
      </div>
      <Alert>{error}</Alert>
      {!experimentId ? <p className="text-sm text-slate-500">Select an experiment.</p> : !data ? <Spinner /> : (
        <>
          <Card title={`Suggestion box · ${data.scope}`}>
            {!o.best ? <p className="text-sm text-slate-500">Not enough data across at least two operating systems yet.</p> : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-green-50 p-4 text-green-900">
                  <div className="flex items-center gap-2 font-medium"><ThumbsUp className="h-4 w-4" /> Best overall: {OS_LABEL[o.best]}</div>
                  <p className="mt-1 text-sm">Highest self-reported completion, then fastest completion and fewest fixations per task.</p>
                </div>
                <div className="rounded-xl bg-red-50 p-4 text-red-900">
                  <div className="flex items-center gap-2 font-medium"><ThumbsDown className="h-4 w-4" /> Weakest overall: {OS_LABEL[o.poorest]}</div>
                  <ul className="mt-1 list-disc pl-5 text-sm">{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">{data.note}</p>
          </Card>

          <Card title="Per task">
            {data.tasks.length === 0 ? <p className="text-sm text-slate-500">No completed tasks yet.</p> : (
              <div className="space-y-3">
                {data.tasks.map((t) => (
                  <div key={t.taskNumber} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <div className="font-medium">Task {t.taskNumber}: {t.instruction}</div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500"><tr>{['OS', 'Completed', 'Time', 'Fixations', 'Total dwell', 'Blinks/min', 'n'].map((h) => <th key={h} className="pr-4 pb-1">{h}</th>)}</tr></thead>
                        <tbody>
                          {t.ranking.map((r) => (
                            <tr key={r.os} className={r.os === t.best ? 'text-green-700' : r.os === t.poorest ? 'text-red-700' : ''}>
                              <td className="pr-4">{OS_LABEL[r.os]}{r.os === t.best && ' · best'}{r.os === t.poorest && ' · weakest'}</td>
                              <td className="pr-4">{r.successRate === null ? 'n/a' : `${Math.round(r.successRate * 100)}%`}</td>
                              <td className="pr-4">{sec(r.time)}</td><td className="pr-4">{fmt(r.fixations)}</td>
                              <td className="pr-4">{sec(r.dwell)}</td><td className="pr-4">{fmt(r.blink)}</td><td>{r.n}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {t.reasons.length > 0 && <ul className="mt-2 list-disc pl-5 text-slate-600 dark:text-slate-300">{t.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
