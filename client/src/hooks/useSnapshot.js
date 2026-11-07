import { useEffect, useState } from 'react';
import api from '../services/api.js';

// Loads a participant's screen still through the authenticated API; null when none was captured.
export function useSnapshotUrl(taskId, participantId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    setUrl(null);
    if (!taskId) return undefined;
    let objectUrl;
    let cancelled = false;
    api.get(`/gaze/snapshot/${taskId}`, { params: { participantId: participantId || undefined }, responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(r.data);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [taskId, participantId]);
  return url;
}
