import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { ExperimentOSFilter } from './EyeTracking.jsx';
import { OS_LABEL } from '../experiments/Experiments.jsx';

const COLORS = { windows: '#2563eb', macos: '#64748b', linux: '#16a34a' };
const f = (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(1));

export default function SusAnalysis() {
  const { experiments, error: e1 } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    if (!experimentId) return;
    api.get(`/sus/analysis/${experimentId}`).then((r) => { setData(r.data.data); setError(''); }).catch((e) => setError(errorMessage(e)));
  }, [experimentId]);

  if (!experiments) return e1 ? <Alert>{e1}</Alert> : <Spinner />;
  const rows = data ? Object.entries(data.byOS) : [];
  const chart = rows.map(([os, s]) => ({ os: OS_LABEL[os], key: os, mean: s.mean === null ? null : +s.mean.toFixed(1), n: s.n }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">SUS analysis</h1>
      <ExperimentOSFilter {...{ experiments, experimentId, setExperimentId }} />
      <Alert>{error}</Alert>
      {!experimentId ? <p className="text-sm text-slate-500">Select an experiment.</p> : !data ? <Spinner /> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>{['Operating system', 'n', 'Mean', 'Median', 'SD', 'Min', 'Max', `vs ${data.reference}`].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(([os, s]) => (
                  <tr key={os}>
                    <td className="px-4 py-3 font-medium">{OS_LABEL[os]}</td>
                    <td className="px-4 py-3">{s.n}</td>
                    <td className="px-4 py-3">{f(s.mean)}</td>
                    <td className="px-4 py-3">{f(s.median)}</td>
                    <td className="px-4 py-3">{f(s.sd)}</td>
                    <td className="px-4 py-3">{f(s.min)}</td>
                    <td className="px-4 py-3">{f(s.max)}</td>
                    <td className="px-4 py-3">{s.aboveReference === null ? 'n/a' : s.aboveReference ? <span className="text-green-600">Above</span> : <span className="text-red-600">At/below</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chart.every((c) => c.n === 0) ? <p className="text-sm text-slate-500">No SUS responses submitted yet.</p> : (
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-medium">Mean SUS score (reference = {data.reference})</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="os" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={data.reference} stroke="#f59e0b" strokeDasharray="5 5" label="68" />
                  <Bar dataKey="mean" name="Mean SUS">
                    {chart.map((c) => <Cell key={c.key} fill={COLORS[c.key]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {rows.map(([os, s]) => (
              <div key={os} className="card p-4">
                <h3 className="mb-2 text-sm font-medium">{OS_LABEL[os]} · individual scores</h3>
                {s.scores.length === 0 ? <p className="text-sm text-slate-500">No responses.</p> : (
                  <ul className="space-y-1 text-sm">
                    {s.scores.map((x, i) => <li key={i} className="flex justify-between"><span>{x.participant} <span className="font-mono text-xs text-slate-400">{x.code}</span></span><span>{x.score}</span></li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
