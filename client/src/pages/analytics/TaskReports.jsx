import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import { download } from '../../services/download.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import VerificationBadge from '../../components/VerificationBadge.jsx';
import { Card, OS_COLOR, OS_LABEL, fmt } from '../../components/Charts.jsx';

const OS = ['windows', 'macos', 'linux'];
const GROUPS = [['all', 'All participants'], ['primary', 'Primary OS users'], ['nonprimary', 'Non-primary OS users']];

export default function TaskReports() {
  const { experiments } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [group, setGroup] = useState('all');
  const [data, setData] = useState(null);
  const [sel, setSel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setSel('');
    api.get('/analytics/task-report', { params: { experimentId: experimentId || undefined, group } })
      .then((r) => { setData(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId, group]);

  const chart = useMemo(() => {
    if (!data) return [];
    const by = {};
    data.tasks.forEach((t) => { (by[t.taskNumber] ||= { task: `Task ${t.taskNumber}` })[t.os] = t.metrics.completionTime.mean === null ? null : +(t.metrics.completionTime.mean / 1000).toFixed(1); });
    return Object.values(by);
  }, [data]);
  const fixChart = useMemo(() => {
    if (!data) return [];
    const by = {};
    data.tasks.forEach((t) => { (by[t.taskNumber] ||= { task: `Task ${t.taskNumber}` })[t.os] = t.metrics.fixationCount.mean === null ? null : +t.metrics.fixationCount.mean.toFixed(1); });
    return Object.values(by);
  }, [data]);

  if (error) return <Alert>{error}</Alert>;
  const taskKey = (t) => `${t.os}|${t.taskNumber}`;
  const selected = data?.tasks.find((t) => taskKey(t) === sel);
  const rows = selected ? data.rows.filter((r) => r.os === selected.os && r.taskNumber === selected.taskNumber) : [];
  const m = (t, k, d = 1, scale = 1) => (t.metrics[k].n ? fmt(t.metrics[k].mean * scale, d) : 'n/a');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Task-wise reports</h1>
        <button className="btn-ghost border border-slate-300" disabled={!experimentId}
          onClick={() => download('/reports/export/csv', { experimentId, dataset: 'task-wise' }, 'task-wise.csv').catch((e) => setError(errorMessage(e)))}>
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment">
          <option value="">All my experiments</option>
          {(experiments || []).map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
        </select>
        <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Participant group">
          {GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">
        Each operating system is a separate participant group (every participant uses their own OS); group sizes are shown per task. Verified = the desktop app saw the required application; completion is otherwise self-reported.
      </p>

      {!data ? <Spinner /> : data.tasks.length === 0 ? <p className="text-sm text-slate-500">No finished tasks yet.</p> : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Mean completion time per task (s)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="task" /><YAxis /><Tooltip /><Legend formatter={(v) => OS_LABEL[v]} />
                  {OS.map((o) => <Bar key={o} dataKey={o} fill={OS_COLOR[o]} />)}
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Mean fixation count per task">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={fixChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="task" /><YAxis /><Tooltip /><Legend formatter={(v) => OS_LABEL[v]} />
                  {OS.map((o) => <Bar key={o} dataKey={o} fill={OS_COLOR[o]} />)}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>{['OS', 'Task', 'Participants', 'Time (s)', 'Self-reported', 'Verified', 'Fixations', 'Dwell (ms)', 'Avg fix. (ms)', 'TTFF (ms)', 'Revisits', 'Blinks/min', ''].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {data.tasks.map((t) => (
                  <tr key={taskKey(t)} className={sel === taskKey(t) ? 'bg-blue-50 dark:bg-blue-950' : ''}>
                    <td className="px-3 py-2">{OS_LABEL[t.os]}</td>
                    <td className="px-3 py-2" title={t.instruction}>{t.taskNumber}</td>
                    <td className="px-3 py-2">{t.participants}</td>
                    <td className="px-3 py-2">{m(t, 'completionTime', 1, 0.001)}</td>
                    <td className="px-3 py-2">{t.metrics.successRate.n ? `${fmt(t.metrics.successRate.mean * 100, 0)}%` : 'n/a'}</td>
                    <td className="px-3 py-2">{t.metrics.verifiedRate.n ? `${fmt(t.metrics.verifiedRate.mean * 100, 0)}% (n=${t.metrics.verifiedRate.n})` : <span className="text-slate-400">n/a</span>}</td>
                    <td className="px-3 py-2">{m(t, 'fixationCount')}</td>
                    <td className="px-3 py-2">{m(t, 'dwellTime', 0)}</td>
                    <td className="px-3 py-2">{m(t, 'avgFixationDuration', 0)}</td>
                    <td className="px-3 py-2">{m(t, 'ttff', 0)}</td>
                    <td className="px-3 py-2">{m(t, 'revisitCount')}</td>
                    <td className="px-3 py-2">{m(t, 'blinkRate')}</td>
                    <td className="px-3 py-2 text-right"><button className="btn-ghost py-1" onClick={() => setSel(taskKey(t))}>Compare participants</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <Card title={`Participants · ${OS_LABEL[selected.os]} · Task ${selected.taskNumber}: ${selected.instruction}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-slate-500">
                    <tr>{['Participant', 'Time (s)', 'Completion', 'Fixations', 'Dwell (ms)', 'Avg fix. (ms)', 'TTFF (ms)', 'Revisits', 'Blinks/min', 'Quality'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...rows].sort((a, b) => (a.completionTime ?? Infinity) - (b.completionTime ?? Infinity)).map((r) => (
                      <tr key={r.participantId}>
                        <td className="px-3 py-2 font-mono text-xs">{r.participant}</td>
                        <td className="px-3 py-2">{r.completionTime == null ? 'n/a' : (r.completionTime / 1000).toFixed(1)}</td>
                        <td className="px-3 py-2 text-xs"><VerificationBadge status={r.verification} selfReported={r.selfReportedComplete} /></td>
                        <td className="px-3 py-2">{fmt(r.fixations)}</td><td className="px-3 py-2">{fmt(r.dwell, 0)}</td><td className="px-3 py-2">{fmt(r.avgFixation, 0)}</td>
                        <td className="px-3 py-2">{fmt(r.ttff, 0)}</td><td className="px-3 py-2">{fmt(r.revisits)}</td><td className="px-3 py-2">{fmt(r.blinkRate)}</td>
                        <td className="px-3 py-2">{r.dataQuality || 'n/a'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
