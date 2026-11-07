import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { OS_LABEL } from './Experiments.jsx';

// Checklist of tasks grouped by OS; an empty selection means every active task for the participant's own OS.
function TaskPicker({ tasks, value, onChange }) {
  const byOS = {};
  tasks.filter((t) => t.active).forEach((t) => { (byOS[t.operatingSystem] ||= []).push(t); });
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border p-3 text-sm">
      {Object.keys(byOS).length === 0 && <p className="text-slate-500">No active tasks yet. Create tasks in the Task library tab.</p>}
      {Object.entries(byOS).map(([os, list]) => {
        const ids = list.map((t) => t._id);
        const all = ids.every((i) => value.includes(i));
        return (
          <div key={os}>
            <label className="mb-1 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={all} onChange={() => onChange(all ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])])} /> {OS_LABEL[os]}
            </label>
            <div className="grid gap-1 pl-6 sm:grid-cols-2">
              {list.map((t) => (
                <label key={t._id} className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={value.includes(t._id)} onChange={() => toggle(t._id)} /> <span>{t.taskNumber}. {t.instruction}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AssignmentsPanel({ experiment }) {
  const [assignments, setAssignments] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pick, setPick] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [editing, setEditing] = useState(null); // { id, taskIds }
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, p, t] = await Promise.all([
        api.get('/assignments', { params: { experimentId: experiment._id } }),
        api.get('/participants', { params: { limit: 100 } }),
        api.get(`/experiments/${experiment._id}/tasks`),
      ]);
      setAssignments(a.data.data);
      setParticipants(p.data.data);
      setTasks(t.data.data);
    } catch (e) { setError(errorMessage(e)); }
  }, [experiment._id]);
  useEffect(() => { load(); }, [load]);

  const assigned = new Set((assignments || []).map((a) => a.participantId?._id));
  const available = participants.filter((p) => !assigned.has(p._id));

  const submit = async () => {
    setError(''); setMsg('');
    try {
      const { data } = await api.post('/assignments', { experimentId: experiment._id, participantIds: pick, taskIds: chosen });
      setMsg(`${data.data.length} assigned.` + (data.skipped.length ? ` Skipped ${data.skipped.length}: ${data.skipped[0].reason}.` : ''));
      setPick([]);
      load();
    } catch (e) { setError(errorMessage(e)); }
  };

  const update = async (a, patch) => {
    setError('');
    try { await api.put(`/assignments/${a._id}`, patch); load(); } catch (e) { setError(errorMessage(e)); }
  };
  const remove = async (a) => {
    try { await api.delete(`/assignments/${a._id}`); load(); } catch (e) { setError(errorMessage(e)); }
  };

  const taskLabel = (a) => (a.assignedTaskIds?.length ? `${a.assignedTaskIds.length} selected task(s)` : 'All active tasks for their OS');

  if (!assignments) return error ? <Alert>{error}</Alert> : <Spinner />;

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      <Alert type="success">{msg}</Alert>

      <section className="card space-y-3 p-5">
        <h3 className="font-medium">Assign tasks to participants</h3>
        <p className="text-xs text-slate-500">
          Each participant performs the tasks on their own computer. The operating system is detected when they start, so they only receive the tasks for that OS.
        </p>
        {available.length === 0 ? (
          <p className="text-sm text-slate-500">No unassigned participants.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-lg border p-2 text-sm">
            {available.map((p) => (
              <label key={p._id} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={pick.includes(p._id)}
                  onChange={(e) => setPick(e.target.checked ? [...pick, p._id] : pick.filter((x) => x !== p._id))} />
                <span className="font-mono text-xs">{p.participantCode}</span> {p.name}
              </label>
            ))}
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-medium">Tasks ({chosen.length ? `${chosen.length} selected` : 'none selected = all active tasks for each participant\'s OS'})</p>
          <TaskPicker tasks={tasks} value={chosen} onChange={setChosen} />
        </div>
        <button className="btn-primary" disabled={!pick.length} onClick={submit}>Assign {pick.length || ''} participant(s)</button>
      </section>

      <div className="card overflow-x-auto">
        {assignments.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No participants assigned yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>{['Participant', 'Detected OS', 'Tasks', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {assignments.map((a) => (
                <tr key={a._id} className="align-top">
                  <td className="px-4 py-3">{a.participantId?.name} <span className="font-mono text-xs text-slate-400">{a.participantId?.participantCode}</span></td>
                  <td className="px-4 py-3">{a.osCheck?.matched ? OS_LABEL[a.osCheck.detectedOS] : <span className="text-slate-400">not checked yet</span>}</td>
                  <td className="px-4 py-3">
                    {editing?.id === a._id ? (
                      <div className="space-y-2">
                        <TaskPicker tasks={tasks} value={editing.taskIds} onChange={(taskIds) => setEditing({ ...editing, taskIds })} />
                        <div className="flex gap-2">
                          <button className="btn-primary py-1" onClick={async () => { await update(a, { taskIds: editing.taskIds }); setEditing(null); }}>Save</button>
                          <button className="btn-ghost py-1" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : taskLabel(a)}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="space-x-1 px-4 py-3 text-right">
                    {a.status !== 'in_progress' && editing?.id !== a._id && (
                      <button className="btn-ghost py-1" onClick={() => setEditing({ id: a._id, taskIds: (a.assignedTaskIds || []).map(String) })}>Edit tasks</button>
                    )}
                    {a.status === 'completed' && <button className="btn-ghost py-1" title="Keeps all results; only lets the participant press Finish again" onClick={() => update(a, { status: 'reopened' })}>Reopen</button>}
                    {a.status !== 'assigned' && (
                      <button className="btn-ghost py-1 text-amber-700" title="Erases this participant's results for this experiment so the tasks can be done again"
                        onClick={() => window.confirm('Erase this participant\'s task results, gaze data, screen stills and SUS answers for this experiment so they can redo it?') && update(a, { reset: true })}>
                        Reset &amp; rerun
                      </button>
                    )}
                    {a.status === 'assigned' && <button className="btn-ghost py-1 text-red-600" onClick={() => remove(a)}>Remove</button>}
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
