import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { BoxPlot, Card, OSBar, OS_COLOR, OS_LABEL, fmt } from '../../components/Charts.jsx';

const OS = ['windows', 'macos', 'linux'];
const GROUPS = [['all', 'All operating systems'], ['primary', 'Primary OS users'], ['nonprimary', 'Non-primary OS users']];

export default function OSComparison() {
  const { experiments } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [group, setGroup] = useState('all');
  const [metric, setMetric] = useState('completionTime');
  const [taskMetric, setTaskMetric] = useState('success');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.get('/analytics/os-comparison', { params: { experimentId: experimentId || undefined, group } })
      .then((r) => { setData(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId, group]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const entries = Object.entries(data.metrics);
  const sel = data.metrics[metric];
  const taskRows = data.byTask.map((r) => ({ task: r.taskNumber, ...Object.fromEntries(OS.map((os) => [os, r[`${os}_${taskMetric}`] === null ? null : taskMetric === 'success' ? r[`${os}_success`] * 100 : r[`${os}_time`]])) }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Operating system comparison</h1>
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment">
          <option value="">All my experiments</option>
          {(experiments || []).map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
        </select>
        <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Participant group">
          {GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {OS.map((os) => (
          <div key={os} className="card p-4">
            <p className="text-xs uppercase text-slate-500">{OS_LABEL[os]} group</p>
            <p className="text-2xl font-semibold">{data.metrics.completionTime.byOS[os].participants ?? 0}</p>
            <p className="text-xs text-slate-500">participants (separate group; each uses their own OS)</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Metric</th>{OS.map((os) => <th key={os} className="px-4 py-3">{OS_LABEL[os]}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {entries.map(([k, m]) => (
              <tr key={k}>
                <td className="px-4 py-3 font-medium">{m.label}</td>
                {OS.map((os) => {
                  const s = m.byOS[os];
                  const pct = k === 'successRate' || k === 'verifiedRate';
                  return <td key={os} className="px-4 py-3">{s.n === 0 ? <span className="text-slate-400">n/a</span> : `${fmt(pct ? s.mean * 100 : s.mean)}${pct ? '%' : ''}`}{s.n > 0 && <span className="ml-1 text-xs text-slate-400">±{fmt(pct && s.sd !== null ? s.sd * 100 : s.sd)} (n={s.n})</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm">Metric:</label>
        <select className="input w-auto" value={metric} onChange={(e) => setMetric(e.target.value)}>
          {entries.map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <OSBar title={`Mean · ${sel.label}`} data={OS.map((os) => ({ os, value: sel.byOS[os].mean, n: sel.byOS[os].n }))} />
        <Card title={`Distribution (box plot) · ${sel.label}`}>
          <BoxPlot items={OS.map((os) => ({ os, summary: sel.byOS[os] }))} />
        </Card>
      </div>

      <Card title="Task-level comparison">
        <div className="mb-2 flex gap-1">
          {[['success', 'Success rate (%)'], ['time', 'Completion time (ms)']].map(([k, l]) => (
            <button key={k} onClick={() => setTaskMetric(k)} className={`btn py-1 ${taskMetric === k ? 'bg-blue-600 text-white' : 'btn-ghost border border-slate-300'}`}>{l}</button>
          ))}
        </div>
        {taskRows.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No task data yet</p> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={taskRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="task" label={{ value: 'Task number', position: 'insideBottom', offset: -2 }} />
              <YAxis />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend formatter={(v) => OS_LABEL[v]} />
              {OS.map((os) => <Line key={os} dataKey={os} stroke={OS_COLOR[os]} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
