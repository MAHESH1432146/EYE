import { useEffect, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { Card, OS_LABEL, fmt } from '../../components/Charts.jsx';

const METRICS = [
  ['completionTime', 'Completion time'], ['successRate', 'Completion rate (self-reported)'], ['fixationCount', 'Fixation count'],
  ['dwellTime', 'Total dwell time'], ['avgFixationDuration', 'Average fixation duration'], ['blinkRate', 'Blink rate'], ['ttff', 'Time to first fixation'], ['revisitCount', 'Revisit count'], ['verifiedRate', 'Verified completion rate'], ['susScore', 'SUS score'],
];
const name = (k) => OS_LABEL[k] || (k === 'nonPrimary' ? 'Non-primary' : k === 'primary' ? 'Primary' : k);
const pfmt = (p) => (p === undefined || p === null ? 'n/a' : p < 0.001 ? '< 0.001' : p.toFixed(3));

function TestRow({ t, label }) {
  if (!t) return null;
  if (t.status !== 'ok') return <tr><td className="px-3 py-2">{label || t.test}</td><td colSpan={5} className="px-3 py-2 text-slate-500">Insufficient data. {t.note}</td></tr>;
  const p = t.pAdjusted ?? t.p;
  return (
    <tr>
      <td className="px-3 py-2">{label || t.test}</td>
      <td className="px-3 py-2">{fmt(t.statistic, 3)}{t.df ? ` (df ${[].concat(t.df).join(', ')})` : ''}</td>
      <td className="px-3 py-2">{pfmt(p)}{t.pAdjusted !== undefined && <span className="text-xs text-slate-400"> adj.</span>}</td>
      <td className="px-3 py-2">{p < 0.05 ? <span className="font-medium text-green-600">Significant</span> : 'Not significant'}</td>
      <td className="px-3 py-2">{t.effectSize ? `${t.effectSize.name}: ${fmt(t.effectSize.value, 3)}` : '–'}</td>
      <td className="px-3 py-2 text-xs text-slate-500">{t.note || ''}</td>
    </tr>
  );
}

const Head = () => (
  <thead className="border-b text-xs uppercase text-slate-500">
    <tr>{['Test', 'Statistic', 'p-value', 'Status', 'Effect size', 'Note'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
  </thead>
);

function Section({ title, block }) {
  const dKeys = Object.keys(block.descriptives || {});
  return (
    <Card title={title} className="space-y-4">
      <p className="text-xs text-slate-500">Design: {block.design} · n = {block.n}</p>
      {dKeys.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>{['Group', 'n', 'Mean', 'Median', 'SD', 'Min', 'Q1', 'Q3', 'Max'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {dKeys.map((k) => { const d = block.descriptives[k]; return (
                <tr key={k}><td className="px-3 py-2">{name(k)}</td><td className="px-3 py-2">{d.n}</td>{['mean', 'median', 'sd', 'min', 'q1', 'q3', 'max'].map((f) => <td key={f} className="px-3 py-2">{fmt(d[f], 2)}</td>)}</tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <Head />
          <tbody className="divide-y">
            {block.normality && Object.entries(block.normality).map(([k, t]) => <TestRow key={k} t={t} label={`Shapiro-Wilk · ${name(k)}`} />)}
            {block.levene && <TestRow t={block.levene} />}
            <TestRow t={block.omnibus} />
            {(block.posthoc || []).map((t) => <TestRow key={t.comparison} t={t} label={`${t.test || 'Post-hoc'} · ${t.comparison.replace(/(\w+) vs (\w+)/, (_m, a, b) => `${name(a)} vs ${name(b)}`)}`} />)}
          </tbody>
        </table>
      </div>
      {block.notes?.map((n, i) => <p key={i} className="text-xs text-slate-500">{n}</p>)}
      <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">{block.interpretation}</p>
    </Card>
  );
}

export default function Statistics() {
  const { experiments } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [metric, setMetric] = useState('completionTime');
  const [group, setGroup] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.get('/analytics/statistics', { params: { experimentId: experimentId || undefined, metric, group } })
      .then((r) => { setData(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId, metric, group]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Statistical analysis</h1>
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment">
          <option value="">All my experiments</option>
          {(experiments || []).map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
        </select>
        <select className="input w-auto" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric">
          {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Participant group">
          <option value="all">All operating systems</option>
          <option value="primary">Primary OS users</option>
          <option value="nonprimary">Non-primary OS users</option>
        </select>
      </div>
      <Alert>{error}</Alert>
      {!data && !error ? <Spinner /> : data && (
        <>
          <Section title="Operating system comparison" block={data.osComparison} />
          <Section title="Participants grouped by primary OS" block={data.primaryOSGroups} />
          <Section title="Familiar (primary) vs unfamiliar OS" block={data.familiarVsUnfamiliar} />
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            {data.caveats.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
