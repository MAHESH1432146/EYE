import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2, Plus } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';

export const OS_LABEL = { windows: 'Windows 11', macos: 'macOS', linux: 'Linux / Ubuntu' };

export default function Experiments() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { operatingSystems: ['windows', 'macos', 'linux'], eyeTrackingEnabled: true } });

  const load = () =>
    api.get('/experiments', { params: { limit: 100 } }).then((r) => setRows(r.data.data)).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);

  const onSubmit = async (v) => {
    setError('');
    try {
      await api.post('/experiments', {
        ...v,
        durationMinutes: v.durationMinutes ? Number(v.durationMinutes) : undefined,
      });
      reset();
      setShowForm(false);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> New experiment</button>
      </div>
      <Alert>{error}</Alert>

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-6" noValidate>
          <div>
            <label className="label">Title</label>
            <input className="input" {...register('title', { required: 'Title is required', minLength: { value: 3, message: 'At least 3 characters' } })} />
            {errors.title && <p className="field-error">{errors.title.message}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <textarea rows={3} className="input" {...register('description')} />
          </div>
          <div>
            <span className="label">Operating systems covered by this study</span>
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(OS_LABEL).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" value={k} {...register('operatingSystems', { validate: (v) => v.length > 0 || 'Select at least one' })} /> {l}
                </label>
              ))}
            </div>
            {errors.operatingSystems && <p className="field-error">{errors.operatingSystems.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Duration (minutes)</label>
              <input type="number" className="input" {...register('durationMinutes', { min: { value: 1, message: 'Min 1' } })} />
              {errors.durationMinutes && <p className="field-error">{errors.durationMinutes.message}</p>}
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" {...register('eyeTrackingEnabled')} /> Eye tracking enabled
            </label>
          </div>
          <button className="btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Create experiment
          </button>
        </form>
      )}

      {!rows ? <Spinner /> : rows.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">No experiments yet. Create your first one.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => (
            <Link key={e._id} to={`/researcher/experiments/${e._id}`} className="card p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{e.title}</h3>
                <StatusBadge status={e.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{e.description || 'No description'}</p>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span>{e.taskCount} tasks</span>
                <span>{e.participantCount} participants</span>
                <span>{e.operatingSystems.length} OS</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
