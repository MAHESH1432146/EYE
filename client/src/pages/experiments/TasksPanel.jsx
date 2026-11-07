import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import RegionPicker from '../../components/RegionPicker.jsx';
import { OS_LABEL } from './Experiments.jsx';

function TaskEditor({ task, onClose, onSaved }) {
  const [t, setT] = useState(task);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const save = () =>
    run(async () => {
      const { data } = await api.put(`/tasks/${t._id}`, {
        instruction: t.instruction, category: t.category, difficulty: t.difficulty, timeLimit: Number(t.timeLimit), active: t.active,
        targetApp: { match: (t.targetApp?.match || []).map((s) => s.trim()).filter(Boolean) },
        targetRegion: t.targetRegion?.width > 0 ? { x: t.targetRegion.x, y: t.targetRegion.y, width: t.targetRegion.width, height: t.targetRegion.height } : null,
      });
      setT(data.data);
      onSaved();
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm('Delete this task?')) return;
      await api.delete(`/tasks/${t._id}`);
      onSaved();
      onClose();
    });

  const set = (k) => (e) => setT({ ...t, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{OS_LABEL[t.operatingSystem]} · Task {t.taskNumber}</h3>
        <button className="btn-ghost" onClick={onClose}>Close</button>
      </div>
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Instruction (the participant does this on their own computer)</label>
          <input className="input" value={t.instruction} onChange={set('instruction')} />
        </div>
        <div><label className="label">Category</label><input className="input" value={t.category || ''} onChange={set('category')} /></div>
        <div>
          <label className="label">Difficulty</label>
          <select className="input" value={t.difficulty} onChange={set('difficulty')}>
            {['easy', 'medium', 'hard'].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div><label className="label">Time limit (seconds)</label><input type="number" min={10} className="input" value={t.timeLimit} onChange={set('timeLimit')} /></div>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={t.active} onChange={set('active')} /> Active</label>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-sm font-medium">Target and verification</p>
        <div>
          <label className="label">Target application (desktop app only)</label>
          <input className="input" placeholder="e.g. process:systemsettings, process:applicationframehost + title:settings" value={(t.targetApp?.match || []).join(', ')}
            onChange={(e) => setT({ ...t, targetApp: { match: e.target.value.split(',') } })} />
          <p className="mt-1 text-xs text-slate-500">
            Comma-separated rules; any one matching means the application is open. A rule can combine conditions with &quot; + &quot;: process:name (exact executable or app name), path:text, title:text, window: (a real window, not a background process), titled: (window has a title); prefix ! to exclude. A plain word is a loose match over name, title and path. The activity starts when a rule first matches, and closing and reopening are recorded as separate sessions.
            Without a target app, completion is self-reported only. Time to first fixation and revisits are measured on this application's window.
          </p>
        </div>
        <div>
          <label className="label">Target screen region (optional; works in the browser too)</label>
          <RegionPicker value={t.targetRegion} onChange={(r) => setT({ ...t, targetRegion: r })} />
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span>{t.targetRegion?.width > 0 ? `x ${(t.targetRegion.x * 100).toFixed(0)}%, y ${(t.targetRegion.y * 100).toFixed(0)}%, ${(t.targetRegion.width * 100).toFixed(0)}% \u00d7 ${(t.targetRegion.height * 100).toFixed(0)}% of the screen (takes precedence over the application)` : 'No region set'}</span>
            {t.targetRegion?.width > 0 && <button type="button" className="btn-ghost py-0" onClick={() => setT({ ...t, targetRegion: null })}>Clear</button>}
          </div>
        </div>
      </div>
      <div className="flex justify-between">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save task</button>
        <button className="btn-ghost text-red-600" disabled={busy} onClick={remove}>Delete</button>
      </div>
    </div>
  );
}

export default function TasksPanel({ experiment, onChanged }) {
  const [os, setOs] = useState(experiment.operatingSystems[0]);
  const [tasks, setTasks] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(
    () => api.get(`/experiments/${experiment._id}/tasks`).then((r) => setTasks(r.data.data)).catch((e) => setError(errorMessage(e))),
    [experiment._id]
  );
  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged(); };

  const seed = async () => {
    setError(''); setMsg('');
    try {
      const { data } = await api.post(`/experiments/${experiment._id}/tasks/seed-defaults`);
      setMsg(`${data.created} tasks created.`);
      refresh();
    } catch (e) { setError(errorMessage(e)); }
  };

  const addTask = async () => {
    const instruction = window.prompt('Task instruction');
    if (!instruction) return;
    const used = (tasks || []).filter((t) => t.operatingSystem === os).map((t) => t.taskNumber);
    try {
      await api.post('/tasks', { experimentId: experiment._id, operatingSystem: os, taskNumber: Math.max(0, ...used) + 1, instruction });
      refresh();
    } catch (e) { setError(errorMessage(e)); }
  };

  const toggle = async (t) => {
    try { await api.put(`/tasks/${t._id}`, { active: !t.active }); refresh(); } catch (e) { setError(errorMessage(e)); }
  };

  if (!tasks) return <Spinner />;
  const list = tasks.filter((t) => t.operatingSystem === os);

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      <Alert type="success">{msg}</Alert>
      <p className="text-sm text-slate-500">
        Tasks are plain instructions. Participants perform them on their own computer, and only see the tasks for the operating system they are actually using.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {experiment.operatingSystems.map((k) => (
            <button key={k} onClick={() => { setOs(k); setSelected(null); }}
              className={`btn ${os === k ? 'bg-blue-600 text-white' : 'btn-ghost border border-slate-300'}`}>{OS_LABEL[k]}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost border border-slate-300" onClick={seed}><Wand2 className="h-4 w-4" /> Create default 16-task bank</button>
          <button className="btn-ghost border border-slate-300" onClick={addTask}>Add task</button>
        </div>
      </div>

      {selected && <TaskEditor key={selected._id} task={selected} onClose={() => setSelected(null)} onSaved={refresh} />}

      <div className="card overflow-x-auto">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No tasks for this OS yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>{['#', 'Instruction', 'Category', 'Difficulty', 'Limit', 'Target', 'Active', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {list.map((t) => (
                <tr key={t._id} className={t.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">{t.taskNumber}</td>
                  <td className="px-4 py-3">{t.instruction}</td>
                  <td className="px-4 py-3">{t.category}</td>
                  <td className="px-4 py-3 capitalize">{t.difficulty}</td>
                  <td className="px-4 py-3">{t.timeLimit}s</td>
                  <td className="px-4 py-3 text-xs">{t.targetRegion?.width > 0 ? 'region' : t.targetApp?.match?.length ? t.targetApp.match[0] : <span className="text-slate-400">self-report</span>}</td>
                  <td className="px-4 py-3"><input type="checkbox" checked={t.active} onChange={() => toggle(t)} aria-label="Active" /></td>
                  <td className="px-4 py-3 text-right"><button className="btn-ghost py-1" onClick={() => setSelected(t)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
