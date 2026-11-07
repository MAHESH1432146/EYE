import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import TaskRunner from './TaskRunner.jsx';
import Calibration from './Calibration.jsx';
import SusForm from './SusForm.jsx';
import OsCheck from './OsCheck.jsx';
import { GazeTracker } from '../../services/gaze.js';
import { ScreenCapture } from '../../services/screenCapture.js';
import { OS_LABEL } from '../experiments/Experiments.jsx';

function Progress({ s }) {
  const rows = [
    ['Participant survey', s.surveyCompleted],
    ['Informed consent', !!s.consent],
    ...s.assignment.sequence.flatMap((os) => {
      const tasks = s.tasksByOS[os];
      return [
        [`${OS_LABEL[os]} tasks`, tasks.length > 0 && tasks.every((t) => t.completed)],
        [`${OS_LABEL[os]} SUS`, s.susDone.includes(os)],
      ];
    }),
  ];
  return (
    <ul className="card space-y-2 p-5 text-sm">
      {rows.map(([l, d]) => (
        <li key={l} className="flex items-center gap-2">
          {d ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
          {l}
        </li>
      ))}
    </ul>
  );
}

function ConsentStep({ s, onDone }) {
  const [participation, setParticipation] = useState(false);
  const [camera, setCamera] = useState(false);
  const [screen, setScreen] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      await api.post(`/experiments/${s.experiment._id}/consent`, { participation: true, cameraConsent: camera, screenConsent: screen });
      onDone();
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <div className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold">Research information and consent</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{s.experiment.description || 'This study looks at how people find their way around the interface of their own operating system.'}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>You will carry out tasks assigned by the researcher on your own computer, such as opening a settings page, then rate your operating system with a short questionnaire.</li>
        <li>Your responses and timings are stored against your participant ID and visible only to you and the researcher.</li>
        <li>If eye tracking is enabled, your webcam is used to estimate where you look, locally in your browser. Video is never recorded or uploaded; only derived gaze coordinates, blink counts and quality information are stored. Webcam gaze is approximate and not equivalent to dedicated eye-tracker hardware.</li>
        <li>Optionally you can share your screen. Only one reduced still image per task is stored, to show what was on screen when you finished; no video is kept. Do not leave private information visible if you choose this.</li>
        <li>You may stop at any time.</li>
      </ul>
      <Alert>{error}</Alert>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={participation} onChange={(e) => setParticipation(e.target.checked)} />
        I have read the information above and consent to take part in this study.
      </label>
      {s.experiment.eyeTrackingEnabled && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={camera} onChange={(e) => setCamera(e.target.checked)} />
          I consent to my webcam being used for gaze estimation (no video is stored).
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={screen} onChange={(e) => setScreen(e.target.checked)} />
        (Optional) I consent to sharing my screen so one reduced still image per task can be stored.
      </label>
      <button className="btn-primary" disabled={!participation} onClick={submit}>Give consent and continue</button>
    </div>
  );
}

export default function ExperimentRun() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [osIntroSeen, setOsIntroSeen] = useState(null);
  const trackerRef = useRef(null);
  const screenRef = useRef(new ScreenCapture());
  const [screenOn, setScreenOn] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [camPhase, setCamPhase] = useState('idle'); // idle | starting | calibrating | ready
  const [camError, setCamError] = useState('');

  useEffect(() => () => { trackerRef.current?.stop(); screenRef.current.stop(); }, []);

  const shareScreen = async () => {
    setScreenError('');
    try { await screenRef.current.start(); setScreenOn(true); } catch (e) { setScreenError(e.message || 'Screen sharing was cancelled'); }
  };

  const enableCamera = async () => {
    setCamError('');
    setCamPhase('starting');
    try {
      trackerRef.current = await new GazeTracker().start();
      setCamPhase('calibrating');
    } catch (e) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setCamError(e.message);
      setCamPhase('idle');
    }
  };

  const load = useCallback(
    () => api.get(`/experiments/${id}/session`).then((r) => setS(r.data.data)).catch((e) => setError(errorMessage(e))),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    try { await api.post(`/experiments/${id}/start`); load(); } catch (e) { setError(errorMessage(e)); }
  };
  const finish = async () => {
    try { await api.post(`/experiments/${id}/complete`); trackerRef.current?.stop(); trackerRef.current = null; screenRef.current.stop(); load(); } catch (e) { setError(errorMessage(e)); }
  };
  // After the questionnaire the experiment ends and the participant returns to the dashboard; with more OS sections left it just continues.
  const afterSus = async () => {
    try { await api.post(`/experiments/${id}/complete`); navigate('/participant'); } catch { load(); }
  };

  if (!s) return error ? <Alert>{error}</Alert> : <Spinner />;

  const status = s.assignment.status;
  const currentOS = s.assignment.sequence.find((os) => s.tasksByOS[os].some((t) => !t.completed) || !s.susDone.includes(os));
  let body;

  if (status === 'completed') {
    body = (
      <div className="card space-y-2 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <h2 className="text-xl font-semibold">Experiment complete</h2>
        <p className="text-sm text-slate-500">Thank you for taking part.</p>
        <Link to="/participant" className="btn-primary mx-auto">Back to dashboard</Link>
      </div>
    );
  } else if (!s.surveyCompleted) {
    body = (
      <div className="card space-y-3 p-6">
        <p>Please complete the participant survey before starting.</p>
        <Link to="/participant/survey" className="btn-primary w-fit">Open survey</Link>
      </div>
    );
  } else if (s.osMismatch) {
    const m = s.osMismatch;
    const names = (m.assignedOS || []).map((o) => OS_LABEL[o]).join(', ');
    body = (
      <div className="card space-y-3 p-6">
        <Alert>
          {m.reason === 'unsupported' && 'Your operating system could not be identified as Windows, macOS or Linux, so no tasks can be loaded on this device.'}
          {m.reason === 'not_in_experiment' && `Operating System Mismatch! You are using ${OS_LABEL[m.detectedOS]}, but this experiment only covers: ${names}. No tasks were loaded.`}
          {m.reason === 'no_assigned_tasks' && `Operating System Mismatch! You are using ${OS_LABEL[m.detectedOS]}, but the researcher assigned you tasks for: ${names}. No tasks were loaded. Please ask the researcher to assign ${OS_LABEL[m.detectedOS]} tasks.`}
        </Alert>
        <Link to="/participant" className="btn-ghost w-fit">Back to dashboard</Link>
      </div>
    );
  } else if (!s.consent) {
    body = <ConsentStep s={s} onDone={load} />;
  } else if (!s.assignment.osCheck && status !== 'in_progress') {
    body = <OsCheck experimentId={id} onDone={load} />;
  } else if (s.gazeActive && camPhase !== 'ready') {
    body = camPhase === 'calibrating' ? (
      <Calibration experimentId={id} tracker={trackerRef.current} onDone={() => { setCamPhase('ready'); load(); }} />
    ) : (
      <div className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Enable your camera</h2>
        <p className="text-sm text-slate-500">
          Eye tracking needs your webcam to estimate where you look. Your browser will ask for permission. Video is processed locally and never stored or uploaded.
          Webcam gaze is an approximation of dedicated eye-tracker hardware.
        </p>
        <Alert>{camError}</Alert>
        <button className="btn-primary" disabled={camPhase === 'starting'} onClick={enableCamera}>
          {camPhase === 'starting' ? 'Starting camera…' : 'Enable camera and calibrate'}
        </button>
      </div>
    );
  } else if (status !== 'in_progress') {
    body = (
      <div className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Ready to begin</h2>
        <p className="text-sm text-slate-500">
          You will do {Object.values(s.tasksByOS).flat().length} task(s) assigned by the researcher on your own {s.assignment.sequence.map((o) => OS_LABEL[o]).join(', ')} computer, then answer a short questionnaire.
          When a task starts, the timer and eye tracking start; do the task on your computer, then come back to this window and press End Task. Keep this window visible (for example snapped to one side or on a second monitor) so tracking keeps running.
        </p>
        {s.consent?.screenConsent && (
          <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <p className="mb-2">Screen sharing (optional, one reduced still per task): {screenOn ? <strong className="text-green-600">on</strong> : 'off'}</p>
            {!screenOn && <button className="btn-ghost border border-slate-300" onClick={shareScreen}>Share my screen</button>}
            <Alert>{screenError}</Alert>
          </div>
        )}
        {s.gazeActive && <Alert type="success">Calibration completed. Gaze is recorded during tasks as coordinates only.</Alert>}
        <Alert>{error}</Alert>
        <button className="btn-primary" onClick={start}>Start experiment</button>
      </div>
    );
  } else if (!currentOS) {
    body = (
      <div className="card space-y-3 p-6">
        <h2 className="text-lg font-semibold">All tasks finished</h2>
        <Alert>{error}</Alert>
        <button className="btn-primary" onClick={finish}>Finish experiment</button>
      </div>
    );
  } else {
    const tasks = s.tasksByOS[currentOS];
    const idx = tasks.findIndex((t) => !t.completed);
    if (idx === -1) {
      body = <SusForm key={currentOS} experimentId={id} operatingSystem={currentOS} osLabel={OS_LABEL[currentOS]} onDone={afterSus} />;
    } else if (idx === 0 && osIntroSeen !== currentOS) {
      body = (
        <div className="card space-y-3 p-8 text-center">
          <h2 className="text-xl font-semibold">{OS_LABEL[currentOS]}</h2>
          <p className="text-sm text-slate-500">You will now complete {tasks.length} task(s) on your own {OS_LABEL[currentOS]} computer.</p>
          <button className="btn-primary mx-auto" onClick={() => setOsIntroSeen(currentOS)}>Begin</button>
        </div>
      );
    } else {
      body = <TaskRunner key={tasks[idx]._id} task={tasks[idx]} index={idx} total={tasks.length} osLabel={OS_LABEL[currentOS]} tracker={s.gazeActive ? trackerRef.current : null} screen={screenRef.current} onFinished={load} />;
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{s.experiment.title}</h1>
        {s.detectedOS && <p className="-mt-2 text-sm text-slate-500">Detected operating system: <strong>{OS_LABEL[s.detectedOS]}</strong></p>}
        {body}
      </div>
      <Progress s={s} />
    </div>
  );
}
