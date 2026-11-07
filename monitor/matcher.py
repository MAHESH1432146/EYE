"""Task-to-application rules. Same syntax and semantics as server/services/eyeTracking/targets.js (matchesRule).

A rule is conditions joined by " + " that must all hold (a leading ! negates):
  process:<name>  exact executable/app name (process name or exe basename, .exe ignored)
  path:<text>     executable path contains text      title:<text>  window title contains text
  window:         entry is a real window (not a bare process)      titled:  window has a title
  <text>          loose match over name, title and path
An entry is a dict with app (process name), title, path and optionally proc=True for process-list entries.
"""
import re

_PART = re.compile(r"^(process|path|title|window|titled):(.*)$", re.IGNORECASE)


def _norm(s):
    return re.sub(r"\.(exe|app)$", "", (s or "").lower().strip())


def _base(path):
    parts = [p for p in re.split(r"[\\/]", path or "") if p]
    return _norm(parts[-1]) if parts else ""


def matches_rule(rule, e):
    for raw in re.split(r"\s\+\s", str(rule)):
        p = raw.strip()
        neg = p.startswith("!")
        if neg:
            p = p[1:]
        m = _PART.match(p)
        if not m:
            hay = f"{e.get('app') or ''} {e.get('title') or ''} {e.get('path') or ''}".lower()
            ok = p.lower() in hay
        else:
            k, v = m.group(1).lower(), m.group(2).strip().lower()
            if k == "process":
                ok = _norm(e.get("app")) == _norm(v) or _base(e.get("path")) == _norm(v)
            elif k == "path":
                ok = v in (e.get("path") or "").lower()
            elif k == "title":
                ok = v in (e.get("title") or "").lower()
            elif k == "window":
                ok = not e.get("proc")
            else:
                ok = bool(e.get("title"))
        if ok == neg:
            return False
    return True


def matches_any(rules, e):
    return any(matches_rule(r, e) for r in rules)
