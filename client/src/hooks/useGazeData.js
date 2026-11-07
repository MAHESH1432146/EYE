import { useEffect, useState } from 'react';
import api, { errorMessage } from '../services/api.js';

export function useExperiments() {
  const [experiments, setExperiments] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/experiments', { params: { limit: 100 } })
      .then((r) => setExperiments(r.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return { experiments, error };
}

export function useRecordings(experimentId, operatingSystem) {
  const [recordings, setRecordings] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!experimentId) { setRecordings(null); return; }
    setRecordings(null);
    api.get('/gaze/recordings', { params: { experimentId, operatingSystem: operatingSystem || undefined } })
      .then((r) => { setRecordings(r.data.data); setError(''); })
      .catch((e) => setError(errorMessage(e)));
  }, [experimentId, operatingSystem]);
  return { recordings, error };
}
