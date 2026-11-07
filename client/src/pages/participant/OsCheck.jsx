import { useState } from 'react';
import { Monitor } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Alert from '../../components/Alert.jsx';
import { OS_NAME, detectClientOS, osCheckMessage } from '../../services/osDetect.js';

const OPTIONS = [['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Ubuntu / Linux']];

// All three options stay visible; selecting one is compared with the OS the browser reports.
export default function OsCheck({ experimentId, onDone }) {
  const [selected, setSelected] = useState(null);
  const [detected, setDetected] = useState(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (os) => { setSelected(os); setDetected(detectClientOS()); setError(''); };
  const detect = () => { const d = detectClientOS(); setDetected(d); if (d) setSelected(d); };

  const result = selected && detected !== undefined ? osCheckMessage(detected, selected) : null;
  const detectedOnly = !selected && detected !== undefined;

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/experiments/${experimentId}/os-check`, { selectedOS: selected });
      if (!data.data.matched) {
        const m = data.data.mismatch;
        setError(m && m.reason !== 'unsupported'
          ? `Operating System Mismatch! You are using ${OS_NAME[m.detectedOS]}, but the researcher's setup covers: ${m.assignedOS.map((o) => OS_NAME[o]).join(', ')}.`
          : osCheckMessage(data.data.detectedOS, selected).text);
      } else onDone();
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  return (
    <div className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold">Operating system check</h2>
      <p className="text-sm text-slate-500">Select the operating system you are using right now, or let the app detect it.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => pick(k)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${selected === k ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
            <Monitor className="h-6 w-6" /> {l}
          </button>
        ))}
      </div>
      <button className="btn-ghost border border-slate-300" onClick={detect}>Detect my operating system</button>
      {detectedOnly && <Alert type={detected ? 'success' : 'error'}>{detected ? `Detected: ${OS_NAME[detected]}. Select it above to continue.` : osCheckMessage(null).text}</Alert>}
      {result && <Alert type={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
      <Alert>{error}</Alert>
      <button className="btn-primary" disabled={!result?.ok || busy} onClick={confirm}>Continue</button>
    </div>
  );
}
