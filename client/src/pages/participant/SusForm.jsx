import { useEffect, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import Alert from '../../components/Alert.jsx';
import Spinner from '../../components/Spinner.jsx';

const LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

export default function SusForm({ experimentId, operatingSystem, osLabel, onDone }) {
  const [statements, setStatements] = useState(null);
  const [answers, setAnswers] = useState(Array(10).fill(null));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/sus/statements').then((r) => setStatements(r.data.data.statements)).catch((e) => setError(errorMessage(e)));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/sus/submit', { experimentId, operatingSystem, responses: answers });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (!statements) return error ? <Alert>{error}</Alert> : <Spinner />;
  const missing = answers.filter((a) => a === null).length;

  return (
    <div className="card space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold">{osLabel} questionnaire</h2>
        <p className="text-sm text-slate-500">Rate each statement about {osLabel} from 1 (strongly disagree) to 5 (strongly agree).</p>
      </div>
      {statements.map((text, i) => (
        <fieldset key={i} className="space-y-2">
          <legend className="text-sm font-medium">{i + 1}. {text}</legend>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {LABELS.map((l, v) => (
              <label key={v} className={`cursor-pointer rounded-lg border p-2 transition ${answers[i] === v + 1 ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" className="sr-only" name={`q${i}`} checked={answers[i] === v + 1}
                  onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? v + 1 : x)))} />
                <div className="text-base font-semibold">{v + 1}</div>
                <div className="hidden sm:block">{l}</div>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Alert>{error}</Alert>
      <button className="btn-primary" disabled={missing > 0 || busy} onClick={submit}>
        {missing > 0 ? `${missing} unanswered` : 'Submit questionnaire'}
      </button>
    </div>
  );
}
