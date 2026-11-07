import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Alert from '../../components/Alert.jsx';
import Spinner from '../../components/Spinner.jsx';

const OS = [['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']];
const FREQ = ['daily', 'weekly', 'monthly', 'rarely', 'never'];

export default function Survey() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sequence, setSequence] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    api
      .get(`/participants/${user._id}`)
      .then(({ data }) => {
        const p = data.data.profile;
        if (p?.surveyCompleted) reset(p);
        else if (p?.age) reset({ age: p.age });
        setSequence(data.data.recommendedSequence);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoaded(true));
  }, [user._id, reset]);

  const onSubmit = async (v) => {
    setError('');
    try {
      const { data } = await api.put(`/participants/${user._id}`, v);
      setSequence(data.recommendedSequence);
      navigate('/participant');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!loaded) return <Spinner />;
  const req = { required: 'Required' };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-6" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Participant survey</h1>
        <p className="text-sm text-slate-500">Participant ID: <span className="font-mono">{user.participantCode}</span></p>
      </div>
      <Alert>{error}</Alert>
      {sequence && <Alert type="success">Your OS test order: {sequence.join(' → ')}</Alert>}

      <section className="card grid gap-4 p-6 sm:grid-cols-3">
        <div>
          <label className="label">Age</label>
          <input type="number" className="input" {...register('age', { ...req, min: { value: 10, message: 'Min 10' }, max: { value: 120, message: 'Max 120' } })} />
          {errors.age && <p className="field-error">{errors.age.message}</p>}
        </div>
        <div>
          <label className="label">Gender (optional)</label>
          <select className="input" {...register('gender')}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non-binary">Non-binary</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </select>
        </div>
        <div>
          <label className="label">Education (optional)</label>
          <input className="input" {...register('education')} />
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <label className="label">Which operating system do you primarily use?</label>
          <select className="input" {...register('primaryOS', req)}>
            <option value="">Select…</option>
            {OS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {errors.primaryOS && <p className="field-error">{errors.primaryOS.message}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {OS.map(([v, l]) => (
            <div key={v} className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <h3 className="font-medium">{l}</h3>
              <div>
                <label className="label">How often do you use it?</label>
                <select className="input capitalize" {...register(`usageFrequency.${v}`, req)}>
                  <option value="">Select…</option>
                  {FREQ.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                {errors.usageFrequency?.[v] && <p className="field-error">Required</p>}
              </div>
              <div>
                <label className="label">Familiarity (1–5)</label>
                <select className="input" {...register(`familiarity.${v}`, req)}>
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {errors.familiarity?.[v] && <p className="field-error">Required</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="max-w-xs">
          <label className="label">Years using your primary OS</label>
          <input type="number" step="0.5" className="input" {...register('yearsOfExperience', { ...req, min: { value: 0, message: 'Min 0' } })} />
          {errors.yearsOfExperience && <p className="field-error">{errors.yearsOfExperience.message}</p>}
        </div>
      </section>

      <button className="btn-primary" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Save survey
      </button>
    </form>
  );
}
