import { inAOI } from './metrics.js';

const rulesOf = (task) => (task?.targetApp?.match || []).map((s) => String(s).trim()).filter(Boolean);

const norm = (s) => String(s || '').toLowerCase().trim().replace(/\.(exe|app)$/, '');
const baseName = (p) => norm(String(p || '').split(/[\\/]/).filter(Boolean).pop());

/**
 * One rule is parts joined by " + " that must all hold. Part forms (prefix ! negates):
 *   process:<name>  exact executable/app name (app name or path basename, .exe/.app ignored)
 *   path:<text>     executable path contains text      title:<text>  window title contains text
 *   window:         entry is a real window (not a bare process)      titled:  window has a title
 *   <text>          loose match over app, title and path (legacy rules)
 * An event is {app, title, path, proc?}; proc marks an entry that came from the process list.
 */
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

const eventMatches = (rules, e) => rules.some((r) => matchesRule(r, e));

/** Validates and totals the activity sessions reported by the desktop app (times in ms since the task started). */
export function summariseActivity(input, limitMs) {
  const sessions = (input?.sessions || [])
    .map((s) => ({ startMs: Math.max(0, Math.round(s.startMs)), endMs: Math.round(s.endMs), app: s.app }))
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs >= s.startMs && s.startMs <= limitMs)
    .map((s) => ({ ...s, endMs: Math.min(s.endMs, limitMs), durationMs: Math.min(s.endMs, limitMs) - s.startMs }))
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 200);
  return {
    detection: input?.detection === 'desktop' ? 'desktop' : 'manual', sessions, sessionCount: sessions.length,
    totalMs: sessions.reduce((a, s) => a + s.durationMs, 0), closedAtEnd: !!input?.closedAtEnd,
    events: (input?.events || []).slice(0, 500).map(({ ts, type, ...e }) => ({ ...e, kind: type, at: new Date(ts) })),
  };
}

/**
 * Task verification from the desktop app's active-window timeline.
 * not_verifiable: no target app defined; unavailable: target defined but no desktop events were received
 * (e.g. browser session); not_detected: events exist but the target app never became active.
 */
export function verifyTask(task, appEvents) {
  const rules = rulesOf(task);
  if (!rules.length) return { status: 'not_verifiable' };
  if (!appEvents?.length) return { status: 'unavailable' };
  const hit = [...appEvents].sort((a, b) => a.t - b.t).find((e) => eventMatches(rules, e));
  return hit ? { status: 'verified', matchedApp: hit.app, firstMatchedMs: Math.round(hit.t) } : { status: 'not_detected' };
}

/**
 * Builds the "is this fixation on the target?" test for a task, or null when no target is defined / measurable.
 * Region target: fractions of the calibrated display. App target: the gaze point must lie inside the active
 * window of the target app at that moment (focus alone when the window bounds were not reported).
 */
export function makeTargetTest(task, record) {
  const reg = task?.targetRegion;
  if (reg?.width > 0 && reg?.height > 0) {
    return { kind: 'region', test: (f) => inAOI(f, { x: reg.x, y: reg.y, width: reg.width, height: reg.height }) };
  }
  const rules = rulesOf(task);
  const events = [...(record?.appEvents || [])].sort((a, b) => a.t - b.t);
  const d = record?.display;
  if (!rules.length || !events.length) return null;
  return {
    kind: 'app',
    test: (f) => {
      let active = null;
      for (const e of events) { if (e.t <= f.start) active = e; else break; }
      if (!active || !eventMatches(rules, active)) return false;
      if (!active.b?.length || !d?.width) return true;
      const gx = d.x + f.x * d.width;
      const gy = d.y + f.y * d.height;
      const [bx, by, bw, bh] = active.b;
      return gx >= bx && gx <= bx + bw && gy >= by && gy <= by + bh;
    },
  };
}
