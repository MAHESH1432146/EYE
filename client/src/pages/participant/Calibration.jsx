import { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import Alert from '../../components/Alert.jsx';
import { desktop } from '../../services/desktop.js';

const GRID = [[0.12, 0.15], [0.88, 0.15], [0.12, 0.85], [0.88, 0.85]];
const VALIDATION = [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]];
const CLICKS_PER_POINT = 4;
const PASS = 0.5; // share of validation samples within tolerance
const MAX_FAILS_BEFORE_OVERRIDE = 3;

const px = ([fx, fy]) => ({ left: `${fx * 100}%`, top: `${fy * 100}%` });

export default function Calibration({ experimentId, tracker, onDone }) {
  const [step, setStep] = useState('intro'); // intro | train | validate | result
  const [clicks, setClicks] = useState(() => GRID.map(() => 0));
  const [vIndex, setVIndex] = useState(0);
  const [quality, setQuality] = useState(null);
  const [fails, setFails] = useState(0);
  const [error, setError] = useState('');
  const samples = useRef([]);
  const stepRef = useRef('intro');
  stepRef.current = step;
  const [faceOk, setFaceOk] = useState(true);

  useEffect(() => tracker.subscribeStatus((s) => setFaceOk(s.faceDetected)), [tracker]);

  const trained = clicks.every((c) => c >= CLICKS_PER_POINT);

  // Calibration runs fullscreen so gaze coordinates equal real screen coordinates; leaving it aborts the run.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && stepRef.current !== 'intro' && stepRef.current !== 'result') {
        setStep('intro');
        setClicks(GRID.map(() => 0));
        setError('Fullscreen was closed. Fullscreen is needed so eye tracking maps to your real screen; start again.');
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const begin = async () => {
    setError('');
    try {
      await document.documentElement.requestFullscreen();
      setStep('train');
    } catch {
      setError('Fullscreen could not be started. Allow fullscreen for this site and try again.');
    }
  };

  useEffect(() => {
    if (step === 'train' && trained) setStep('validate');
  }, [step, trained]);

  // Validation: show each point for 2.2 s, keep predictions after the first 0.9 s (saccade settling).
  useEffect(() => {
    if (step !== 'validate') return;
    samples.current = [];
    let hits = 0;
    let total = 0;
    let i = 0;
    let tolerance;
    let timer;

    const unsub = tracker.subscribe((g) => {
      if (performance.now() - pointStart < 900) return;
      const [fx, fy] = VALIDATION[i];
      const d = Math.hypot(g.x - fx * window.innerWidth, g.y - fy * window.innerHeight);
      total++;
      if (d <= tolerance) hits++;
    });

    let pointStart = performance.now();
    tolerance = 0.15 * window.innerWidth;
    const next = () => {
      i++;
      if (i >= VALIDATION.length) {
        unsub();
        setQuality(total ? hits / total : 0);
        setStep('result');
        return;
      }
      pointStart = performance.now();
      setVIndex(i);
      timer = setTimeout(next, 2200);
    };
    timer = setTimeout(next, 2200);
    return () => { clearTimeout(timer); unsub(); };
  }, [step, tracker]);

  const pass = quality !== null && quality >= PASS;

  const accept = async () => {
    setError('');
    try {
      await api.post('/gaze/calibration', { experimentId, quality });
      const display = await desktop.getDisplay(); // Electron: which physical display was calibrated
      tracker.finishCalibration(window.innerWidth, window.innerHeight, display); // measured while still fullscreen
      await document.exitFullscreen?.().catch(() => {});
      onDone(quality);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const retry = () => {
    setFails((f) => f + 1);
    setClicks(GRID.map(() => 0));
    setVIndex(0);
    setStep('train');
  };

  return (
    <div className="fixed inset-0 z-40 bg-white text-slate-800">
      {!faceOk && step !== 'intro' && step !== 'result' && (
        <div role="alert" className="absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Face or eyes not detected. Face the camera, keep your head in the preview and improve the lighting.
        </div>
      )}
      {step === 'intro' && (
        <div className="mx-auto mt-24 max-w-lg space-y-4 p-6 text-center">
          <h2 className="text-2xl font-semibold">Webcam calibration</h2>
          <p className="text-sm text-slate-600">
            Sit about an arm's length from the screen with your face well lit and keep your head still. Look at each dot and click it
            {' '}{CLICKS_PER_POINT} times while keeping your eyes on it. The screen goes fullscreen so your gaze is measured against your real screen, then a short accuracy check follows. Your video stays in your browser and is never stored.
          </p>
          <Alert>{error}</Alert>
          <button className="btn-primary" onClick={begin}>Start calibration</button>
        </div>
      )}

      {step === 'train' && (
        <>
          <p className="absolute left-1/2 top-4 -translate-x-1/2 text-sm text-slate-500">Look at each dot and click it {CLICKS_PER_POINT} times</p>
          {GRID.map((p, i) => {
            const c = clicks[i];
            const done = c >= CLICKS_PER_POINT;
            return (
              <button
                key={i}
                aria-label={`Calibration point ${i + 1}`}
                disabled={done}
                onClick={(e) => {
                  tracker.addCalibrationPoint(e.clientX, e.clientY);
                  setClicks((cs) => cs.map((v, j) => (j === i ? v + 1 : v)));
                }}
                className={`absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition ${done ? 'border-green-600 bg-green-500' : 'border-violet-700 bg-violet-500'}`}
                style={{ ...px(p), opacity: done ? 0.4 : 0.35 + (c / CLICKS_PER_POINT) * 0.65 }}
              />
            );
          })}
        </>
      )}

      {step === 'validate' && (
        <>
          <p className="absolute left-1/2 top-4 -translate-x-1/2 text-sm text-slate-500">Accuracy check: look at the dot without clicking</p>
          <span className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" style={px(VALIDATION[vIndex])} />
        </>
      )}

      {step === 'result' && (
        <div className="mx-auto mt-24 max-w-md space-y-4 p-6 text-center">
          <h2 className="text-2xl font-semibold">{pass ? 'Calibration complete' : 'Calibration quality is low'}</h2>
          <p className="text-sm text-slate-600">
            Accuracy score: <strong>{Math.round(quality * 100)}%</strong> (needs {PASS * 100}% or more).
          </p>
          <Alert>{error}</Alert>
          {pass ? (
            <button className="btn-primary" onClick={accept}>Continue</button>
          ) : (
            <>
              <p className="text-sm text-slate-500">Improve lighting, keep your head still and try again.</p>
              <button className="btn-primary" onClick={retry}>Recalibrate</button>
              {fails + 1 >= MAX_FAILS_BEFORE_OVERRIDE && (
                <div>
                  <button className="btn-ghost" onClick={accept}>Continue anyway (data will be flagged as poor quality)</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
