import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import TasksPanel from './TasksPanel.jsx';
import AssignmentsPanel from './AssignmentsPanel.jsx';

const STATUSES = ['draft', 'active', 'in_progress', 'completed', 'archived'];
const TABS = [['tasks', 'Task library'], ['assignments', 'Participants'], ['settings', 'Settings']];

export default function ExperimentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exp, setExp] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('tasks');
  const [notice, setNotice] = useState('');

  const load = useCallback(
    () => api.get(`/experiments/${id}`).then((r) => setExp(r.data.data)).catch((e) => setError(errorMessage(e))),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  const save = async (patch) => {
    setError(''); setNotice('');
    try {
      const { data } = await api.put(`/experiments/${id}`, patch);
      setExp(data.data);
      setNotice('Saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this experiment? If it has recorded results it will be archived instead.')) return;
    try {
      await api.delete(`/experiments/${id}`);
      navigate('/researcher/experiments');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!exp) return error ? <Alert>{error}</Alert> : <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{exp.title}</h1>
          <StatusBadge status={exp.status} />
        </div>
        <select className="input w-auto" value={exp.status} onChange={(e) => save({ status: e.target.value })} aria-label="Experiment status">
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>
      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'tasks' && <TasksPanel experiment={exp} onChanged={load} />}
      {tab === 'assignments' && <AssignmentsPanel experiment={exp} />}
      {tab === 'settings' && (
        <form
          className="card max-w-xl space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            save({
              title: f.get('title'),
              description: f.get('description'),
              durationMinutes: f.get('durationMinutes') ? Number(f.get('durationMinutes')) : undefined,
              eyeTrackingEnabled: f.get('eyeTrackingEnabled') === 'on',
              showResultsToParticipants: f.get('showResultsToParticipants') === 'on',
            });
          }}
        >
          <div><label className="label">Title</label><input name="title" className="input" defaultValue={exp.title} required minLength={3} /></div>
          <div><label className="label">Description</label><textarea name="description" rows={3} className="input" defaultValue={exp.description} /></div>
          <div><label className="label">Duration (min)</label><input name="durationMinutes" type="number" min={1} className="input" defaultValue={exp.durationMinutes} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="eyeTrackingEnabled" defaultChecked={exp.eyeTrackingEnabled} /> Eye tracking enabled</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showResultsToParticipants" defaultChecked={exp.showResultsToParticipants} /> Show results to participants</label>
          <div className="flex justify-between">
            <button className="btn-primary">Save settings</button>
            <button type="button" className="btn-ghost text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete / archive</button>
          </div>
        </form>
      )}
    </div>
  );
}
