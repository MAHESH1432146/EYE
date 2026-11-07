import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { errorMessage } from '../../services/api.js';
import { useExperiments } from '../../hooks/useGazeData.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import { Card, OSBar, StatCard, fmt, OS_LABEL } from '../../components/Charts.jsx';

const OS = ['windows', 'macos', 'linux'];
const series = (metrics, key, scale = 1) => OS.map((os) => ({ os, value: metrics[key].byOS[os].mean === null ? null : metrics[key].byOS[os].mean * scale, n: metrics[key].byOS[os].n }));

export default function ResearcherDashboard() {
  const { experiments } = useExperiments();
  const [experimentId, setExperimentId] = useState('');
  const [ov, setOv] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setOv(null);
    const params = { experimentId: experimentId || undefined };
    Promise.all([api.get('/analytics/overview', { params }), api.get('/analytics/os-comparison', { params })])
      .then(([a, b]) => { setOv(a.data.data); setCmp(b.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId]);

  if (error) return <Alert>{error}</Alert>;
  if (!ov || !cmp) return <Spinner />;
  const { cards, charts } = ov;
  const m = cmp.metrics;
  const fam = charts.familiarity.map((f) => ({ name: OS_LABEL[f.os], 1: f.r1, 2: f.r2, 3: f.r3, 4: f.r4, 5: f.r5 }));
  const fail = charts.failures.map((f) => ({ name: OS_LABEL[f.os], Timeout: f.timeout, 'Not completed': f.incorrect }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Research dashboard</h1>
        <select className="input w-auto" value={experimentId} onChange={(e) => setExperimentId(e.target.value)} aria-label="Experiment filter">
          <option value="">All my experiments</option>
          {(experiments || []).map((e) => <option key={e._id} value={e._id}>{e.title}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered participants" value={cards.totalParticipants} />
        <StatCard label="Active participants" value={cards.activeParticipants} hint="Sessions in progress" />
        <StatCard label="Completed experiments" value={cards.completedExperiments} hint={`${cards.completedAssignments} completed sessions`} />
        <StatCard label="Ongoing experiments" value={cards.ongoingExperiments} />
        <StatCard label="Tasks performed" value={cards.totalTaskAttempts} />
        <StatCard label="Avg completion time" value={cards.avgCompletionTime === null ? 'n/a' : `${fmt(cards.avgCompletionTime / 1000, 2)} s`} hint="Correct tasks only" />
        <StatCard label="Avg SUS score" value={fmt(cards.avgSus)} hint="Reference: 68" />
        <StatCard label="Eye-tracking recordings" value={cards.eyeTrackingRecordings} />
      </div>
      {cards.totalTaskAttempts === 0 && <Alert type="success">No task data has been collected yet. Charts fill in as participants complete tasks.</Alert>}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <OSBar title="Participants by primary OS" data={charts.participantsByPrimaryOS.map((p) => ({ os: p.os, value: p.count, n: p.count }))} digits={0} />
        <OSBar title="Task completion rate, self-reported (%)" data={series(m, 'successRate', 100)} unit="%" />
        <OSBar title="Avg completion time (ms)" data={series(m, 'completionTime')} unit=" ms" digits={0} />
        <OSBar title="Avg fixations per task" data={series(m, 'fixationCount')} />
        <OSBar title="Avg fixation dwell time (ms)" data={series(m, 'dwellTime')} unit=" ms" digits={0} />
        <OSBar title="Avg fixation duration (ms)" data={series(m, 'avgFixationDuration')} unit=" ms" digits={0} />
        <OSBar title="Verified completion rate (%)" data={series(m, 'verifiedRate', 100)} unit="%" />
        <OSBar title="Time to first fixation (ms)" data={series(m, 'ttff')} unit=" ms" digits={0} />
        <OSBar title="Avg revisits per task" data={series(m, 'revisitCount')} />
        <OSBar title="Avg blink rate (per minute)" data={series(m, 'blinkRate')} />
        <OSBar title="SUS score (reference 68)" data={series(m, 'susScore')} />
        <Card title="Familiarity ratings (1-5) by OS">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fam}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              {['1', '2', '3', '4', '5'].map((k, i) => <Bar key={k} dataKey={k} stackId="a" name={`Rating ${k}`} fill={['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#4ade80'][i]} />)}
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Task failure distribution">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fail}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey="Timeout" stackId="f" fill="#f59e0b" /><Bar dataKey="Not completed" stackId="f" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <p className="text-xs text-slate-400">Eye-tracking values come from webcam gaze estimation and are approximate. "n/a" means no valid data, not zero.</p>
    </div>
  );
}
