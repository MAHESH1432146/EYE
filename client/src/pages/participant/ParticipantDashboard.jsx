import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';

export default function ParticipantDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState({});

  useEffect(() => {
    api.get(`/participants/${user._id}/progress`).then((r) => setProgress(r.data.data)).catch((e) => setError(errorMessage(e)));
  }, [user._id]);

  const showResults = async (experimentId) => {
    try {
      const { data } = await api.get(`/reports/participant/${user._id}`, { params: { experimentId } });
      setResults((r) => ({ ...r, [experimentId]: data.data }));
    } catch (e) { setError(errorMessage(e)); }
  };

  const resume = async (experimentId) => {
    try {
      await api.post(`/experiments/${experimentId}/resume-tasks`);
      navigate(`/participant/experiments/${experimentId}`);
    } catch (e) { setError(errorMessage(e)); }
  };

  const withdraw = async () => {
    if (!window.confirm('This removes your name, email, age, gender and education and deactivates your account. Anonymous results stay in the study. This cannot be undone.')) return;
    try {
      await api.post(`/participants/${user._id}/anonymize`, { confirm: 'ANONYMIZE' });
      logout();
    } catch (e) { setError(errorMessage(e)); }
  };

  if (error) return <Alert>{error}</Alert>;
  if (!progress) return <Spinner />;

  const Step = ({ done, label }) => (
    <li className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-slate-400" />}
      {label}
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hello, {user.name}</h1>
        <p className="text-sm text-slate-500">Your participant ID: <span className="font-mono">{user.participantCode}</span></p>
      </div>
      <section className="card p-6">
        <h2 className="font-medium">Your progress</h2>
        <ul className="mt-3 space-y-2">
          <Step done={progress.surveyCompleted} label="Participant survey" />
        </ul>
        {!progress.surveyCompleted && (
          <Link to="/participant/survey" className="btn-primary mt-4">Complete the survey</Link>
        )}
      </section>
      <section className="card p-6">
        <h2 className="font-medium">Assigned experiments</h2>
        {progress.assignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No experiments have been assigned to you yet.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {progress.assignments.map((a) => (
              <li key={a._id} className="py-2">
                <div className="flex justify-between">
                <span>{a.experimentId?.title}</span>
                <span className="flex items-center gap-3">
                  <span className="text-slate-500">
                    {a.status === 'completed' ? (a.taskStats?.finishedEarly ? 'Finished early' : 'Completed') : <span className="capitalize">{a.status.replace('_', ' ')}</span>}
                    {a.taskStats && a.status !== 'assigned' && ` (${a.taskStats.done} of ${a.taskStats.total} tasks done)`}
                  </span>
                  {['active', 'in_progress'].includes(a.experimentId?.status) && a.status !== 'completed' && (
                    <Link to={`/participant/experiments/${a.experimentId._id}`} className="btn-primary py-1">{a.status === 'in_progress' ? 'Continue' : 'Open'}</Link>
                  )}
                  {a.status === 'completed' && a.taskStats?.finishedEarly && ['active', 'in_progress'].includes(a.experimentId?.status) && (
                    <button className="btn-primary py-1" onClick={() => resume(a.experimentId._id)}>Continue tasks</button>
                  )}
                  {a.status === 'completed' && a.experimentId?.showResultsToParticipants && (
                    <button className="btn-ghost py-1" onClick={() => showResults(a.experimentId._id)}>View my results</button>
                  )}
                </span>
                </div>
                {results[a.experimentId?._id] && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
                    {['windows', 'macos', 'linux'].map((os) => {
                      const s = results[a.experimentId._id].byOS[os];
                      return <div key={os} className="capitalize">{os}: completed {s.successRate === null ? 'n/a' : `${Math.round(s.successRate * 100)}%`}, SUS {s.sus ?? 'n/a'}</div>;
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card p-6">
        <h2 className="font-medium">Privacy</h2>
        <p className="mt-1 text-sm text-slate-500">You can withdraw and have your personal details removed at any time.</p>
        <button className="btn-ghost mt-3 text-red-600" onClick={withdraw}>Withdraw and anonymize my data</button>
      </section>
    </div>
  );
}
