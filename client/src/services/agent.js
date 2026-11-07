// Bridge to the Python monitor (monitor/agent.py, PyWin32 + psutil) running on the participant's PC. Same shape as window.desktop.
const BASE = 'http://127.0.0.1:47831';
const POLL_MS = 400;

export async function probeAgent() {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(800) });
    return (await r.json())?.agent === 'force-of-habit-monitor';
  } catch {
    return false;
  }
}

export function createAgentBridge() {
  const subs = { active: new Set(), windows: new Set(), events: new Set() };
  const sub = (set) => (cb) => { set.add(cb); return () => set.delete(cb); };
  let timer = null;
  let since = 0;
  let lastActive = null;
  let lastWindows = null;
  let polling = false;

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const j = await (await fetch(`${BASE}/state?since=${since}`)).json();
      since = j.seq;
      const a = j.active;
      const aKey = a ? `${a.hwnd}|${a.app}|${a.title}|${(a.b || []).join(',')}` : '';
      if (a && aKey !== lastActive) subs.active.forEach((cb) => cb({ app: a.app, title: a.title, path: a.path, b: a.b }));
      lastActive = aKey;
      const list = (j.windows || []).map((w) => ({ app: w.app, title: w.title, path: w.path, pid: w.pid }));
      const wKey = JSON.stringify(list);
      if (wKey !== lastWindows) { lastWindows = wKey; subs.windows.forEach((cb) => cb(list)); }
      if (j.events?.length) subs.events.forEach((cb) => cb(j.events));
    } catch {
      // The agent was stopped; the next poll retries and nothing is invented meanwhile.
    } finally {
      polling = false;
    }
  }

  return {
    info: async () => ({ platform: 'win32', appVersion: 'monitor-agent', monitorSupported: true, permissions: {}, source: 'agent' }),
    getDisplay: async () => ({ id: 0, x: 0, y: 0, width: window.screen.width, height: window.screen.height, scaleFactor: window.devicePixelRatio }),
    startMonitor: async (rules = []) => {
      try {
        await fetch(`${BASE}/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules }) });
      } catch {
        return false;
      }
      if (!timer) { lastActive = null; lastWindows = null; timer = setInterval(poll, POLL_MS); poll(); }
      return true;
    },
    stopMonitor: async () => {
      clearInterval(timer);
      timer = null;
      await fetch(`${BASE}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    },
    onActiveWindow: sub(subs.active),
    onOpenWindows: sub(subs.windows),
    onAgentEvents: sub(subs.events),
    onWindowState: () => () => {},
    onDisplayChanged: () => () => {},
    onSuspend: () => () => {},
    publishState: () => {},
    onEndRequest: () => () => {},
  };
}
