// OS-level application detection comes from the Electron app (window.desktop) or, on Windows, the Python monitor agent.
// Both expose the same API; in a plain browser without either, every call is a no-op.
import { createAgentBridge, probeAgent } from './agent.js';

let d = typeof window !== 'undefined' ? window.desktop : undefined;

export let isDesktop = !!d;

// Resolves once the Python agent has been probed; main.jsx waits for it so isDesktop is final before the app renders.
export const desktopReady = refreshDesktop();

// Also called when a task starts, so a monitor started after the page was loaded is still picked up.
export async function refreshDesktop() {
  if (d || typeof window === 'undefined') return;
  if (await probeAgent()) { d = createAgentBridge(); isDesktop = true; }
}

const none = () => () => {};

export const desktop = {
  info: () => (d ? d.info() : Promise.resolve(null)), // { platform, appVersion, monitorSupported, permissions, source? }
  getDisplay: () => (d ? d.getDisplay() : Promise.resolve(null)), // display under the window, in DIP
  startMonitor: (rules) => (d ? d.startMonitor(rules) : Promise.resolve(false)), // rules: this task's target rules (the agent only reports matches)
  stopMonitor: () => (d ? d.stopMonitor() : Promise.resolve()),
  onActiveWindow: (cb) => (d ? d.onActiveWindow(cb) : none()), // ({ app, title, path, b }) on every change
  onOpenWindows: (cb) => (d ? d.onOpenWindows(cb) : none()), // ([{ app, title, path, proc? }]) whenever the set of open windows changes
  onAgentEvents: (cb) => (d?.onAgentEvents ? d.onAgentEvents(cb) : none()), // target launch/close/activate events with timestamps (agent only)
  onWindowState: (cb) => (d ? d.onWindowState(cb) : none()), // ('hidden' | 'minimized' | 'shown' | 'restored')
  onDisplayChanged: (cb) => (d ? d.onDisplayChanged(cb) : none()),
  onSuspend: (cb) => (d ? d.onSuspend(cb) : none()), // ('suspend' | 'resume')
  publishState: (s) => { if (d) d.publishState(s); },
  onEndRequest: (cb) => (d ? d.onEndRequest(cb) : none()),
};

// Same rule syntax and semantics as server/services/eyeTracking/targets.js (matchesRule).
const norm = (s) => String(s || '').toLowerCase().trim().replace(/\.(exe|app)$/, '');
const baseName = (p) => norm(String(p || '').split(/[\\/]/).filter(Boolean).pop());

export function matchesRule(rule, e) {
  return String(rule).split(/\s\+\s/).every((raw) => {
    let p = raw.trim();
    const neg = p.startsWith('!');
    if (neg) p = p.slice(1);
    const m = /^(process|path|title|window|titled):(.*)$/i.exec(p);
    let ok;
    if (!m) ok = `${e.app || ''} ${e.title || ''} ${e.path || ''}`.toLowerCase().includes(p.toLowerCase());
    else {
      const k = m[1].toLowerCase();
      const v = m[2].trim().toLowerCase();
      if (k === 'process') ok = norm(e.app) === norm(v) || baseName(e.path) === norm(v);
      else if (k === 'path') ok = String(e.path || '').toLowerCase().includes(v);
      else if (k === 'title') ok = String(e.title || '').toLowerCase().includes(v);
      else if (k === 'window') ok = !e.proc;
      else ok = !!e.title;
    }
    return neg ? !ok : ok;
  });
}

export const matchesTarget = (rules, e) => (rules || []).some((r) => matchesRule(r, e));
