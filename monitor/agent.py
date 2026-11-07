"""Windows application monitor for The Force of Habit.

Runs on the participant's PC and serves what the study needs over http://127.0.0.1 only:
  * psutil      - process names, executable paths, process start/exit
  * win32gui / win32process (PyWin32) - top-level windows, active window, title, owning process id
  * SetWinEventHook (user32) - foreground, show/hide, create/destroy, minimise and cloak events, so changes are seen immediately

Only windows that match the rules of the current task are reported (plus the active window), so unrelated window titles
are not sent to the web page. Task completion is not decided here; this only reports what is open.
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

if sys.platform != "win32":
    sys.exit("This monitor uses PyWin32 and Windows APIs and runs on Windows only.")

import psutil
import win32con
import win32gui
import win32process

from matcher import matches_any

VERSION = "1.0.0"
PORT = 47831
MAX_EVENTS = 1000
user32 = ctypes.windll.user32
dwmapi = ctypes.windll.dwmapi
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # window rectangles in physical pixels
except Exception:
    pass

_proc_cache = {}


def process_info(pid):
    """(name, exe) for a pid; psutil may be denied access to protected processes."""
    hit = _proc_cache.get(pid)
    if hit:
        return hit
    try:
        p = psutil.Process(pid)
        info = (p.name(), p.exe() or "")
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        try:
            info = (psutil.Process(pid).name(), "")
        except Exception:
            return ("", "")
    if len(_proc_cache) > 2000:
        _proc_cache.clear()
    _proc_cache[pid] = info
    return info


def is_cloaked(hwnd):
    v = wt.DWORD(0)
    dwmapi.DwmGetWindowAttribute(wt.HWND(hwnd), wt.DWORD(14), ctypes.byref(v), ctypes.sizeof(v))  # DWMWA_CLOAKED
    return v.value != 0


def real_pid(hwnd, pid):
    """Modern (UWP) apps such as Settings are hosted by ApplicationFrameHost; the app's own process owns a child window."""
    name, _ = process_info(pid)
    if name.lower() != "applicationframehost.exe":
        return pid
    found = []

    def child(h, _):
        try:
            _, cpid = win32process.GetWindowThreadProcessId(h)
        except Exception:
            return True
        if cpid and cpid != pid:
            found.append(cpid)
        return True

    try:
        win32gui.EnumChildWindows(hwnd, child, None)
    except Exception:
        pass
    return found[0] if found else pid


def window_info(hwnd):
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        owner = real_pid(hwnd, pid)
        name, exe = process_info(owner)
        host_name, host_exe = process_info(pid)
        dpi = (user32.GetDpiForWindow(wt.HWND(hwnd)) or 96) / 96.0
        l, t, r, b = win32gui.GetWindowRect(hwnd)
        return {
            "hwnd": hwnd, "pid": owner, "hostPid": pid, "app": name or host_name, "path": exe or host_exe,
            "title": win32gui.GetWindowText(hwnd),
            "b": [round(l / dpi), round(t / dpi), round((r - l) / dpi), round((b - t) / dpi)],
            "minimized": bool(win32gui.IsIconic(hwnd)),
        }
    except Exception:
        return None


def enum_windows():
    out = []

    def cb(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd) or not win32gui.GetWindowText(hwnd) or is_cloaked(hwnd):
            return True
        if win32gui.GetWindow(hwnd, win32con.GW_OWNER):
            return True  # owned dialogs and popups
        if win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE) & win32con.WS_EX_TOOLWINDOW:
            return True
        info = window_info(hwnd)
        if info:
            out.append(info)
        return True

    win32gui.EnumWindows(cb, None)
    return out


class Monitor:
    def __init__(self):
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.rules = []
        self.seq = 0
        self.events = []
        self.active = None
        self.windows = []
        self._reset()

    def _reset(self):
        self.prev_windows = None  # hwnd -> info; None until the first scan after rules change (already-running apps)
        self.prev_procs = None
        self.prev_active_hwnd = None
        self.last_proc_scan = 0.0

    def set_rules(self, rules):
        with self.lock:
            self.rules = [str(r)[:160] for r in rules][:10]
            self._reset()
            self.windows = []
        self.wake.set()

    def _emit(self, type_, info, **extra):
        self.seq += 1
        ev = {"seq": self.seq, "ts": int(time.time() * 1000), "type": type_, "app": info.get("app"), "pid": info.get("pid"), "title": info.get("title", ""), "path": info.get("path", "")}
        ev.update(extra)
        self.events.append(ev)
        del self.events[:-MAX_EVENTS]

    def scan(self):
        with self.lock:
            rules = list(self.rules)
        fg = win32gui.GetForegroundWindow()
        active = window_info(fg) if fg else None
        if not rules:
            with self.lock:
                self.active, self.windows = active, []
            return
        matched = {w["hwnd"]: w for w in enum_windows() if matches_any(rules, w)}
        with self.lock:
            first = self.prev_windows is None
            prev = self.prev_windows or {}
            for h, w in matched.items():
                if h not in prev:
                    self._emit("target_window_opened", w, alreadyRunning=first)
            for h, w in prev.items():
                if h not in matched:
                    self._emit("target_window_closed", w)
            self.prev_windows = matched
            if active and active["hwnd"] in matched and active["hwnd"] != self.prev_active_hwnd:
                self._emit("target_activated", active)
            self.prev_active_hwnd = active["hwnd"] if active else None

            # Process lifetime from psutil, logged for the record; sessions are driven by windows because
            # some apps (for example SystemSettings.exe) keep a suspended process after their window is closed.
            now = time.time()
            if now - self.last_proc_scan >= 1.0:
                self.last_proc_scan = now
                procs = {}
                for p in psutil.process_iter(["pid", "name", "exe"]):
                    e = {"app": p.info.get("name") or "", "path": p.info.get("exe") or "", "title": "", "proc": True}
                    if e["app"] and matches_any(rules, e):
                        procs[p.info["pid"]] = e
                before = self.prev_procs
                for pid, e in procs.items():
                    if before is None or pid not in before:
                        self._emit("target_process_started", {**e, "pid": pid}, alreadyRunning=before is None)
                for pid, e in (before or {}).items():
                    if pid not in procs:
                        self._emit("target_process_exited", {**e, "pid": pid})
                self.prev_procs = procs
            self.active = active
            self.windows = list(matched.values())

    def run(self):
        while True:
            self.wake.wait(0.5)
            self.wake.clear()
            try:
                self.scan()
            except Exception as exc:  # a failed scan must not stop monitoring
                print("scan error:", exc, file=sys.stderr)

    def state(self, since):
        with self.lock:
            return {
                "seq": self.seq, "ts": int(time.time() * 1000), "active": self.active, "windows": self.windows,
                "events": [e for e in self.events if e["seq"] > since],
            }


def start_hooks(wake):
    """Wakes the scanner on window events (SetWinEventHook) so launches, closes and focus changes are seen immediately."""
    proc_t = ctypes.WINFUNCTYPE(None, wt.HANDLE, wt.DWORD, wt.HWND, wt.LONG, wt.LONG, wt.DWORD, wt.DWORD)

    def callback(hook, event, hwnd, id_object, id_child, thread, ms):
        if id_object == 0 and id_child == 0:  # OBJID_WINDOW
            wake.set()

    cb = proc_t(callback)

    def pump():
        user32.SetWinEventHook.restype = wt.HANDLE
        ranges = [(0x0003, 0x0003), (0x0016, 0x0017), (0x8000, 0x8003), (0x8017, 0x8018)]  # foreground, minimise, create..hide, cloak
        for lo, hi in ranges:
            user32.SetWinEventHook(lo, hi, 0, cb, 0, 0, 0)  # WINEVENT_OUTOFCONTEXT
        msg = wt.MSG()
        while user32.GetMessageW(ctypes.byref(msg), 0, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

    threading.Thread(target=pump, daemon=True).start()
    return cb  # keep a reference so the callback is not garbage collected


def make_handler(monitor, origins, port):
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _allowed(self):
            origin = self.headers.get("Origin")
            if self.headers.get("Host") not in hosts:  # blocks DNS rebinding
                return None
            if origin and origin not in origins:
                return None
            return origin or ""

        def _send(self, code, body=None, origin=""):
            data = json.dumps(body).encode() if body is not None else b""
            self.send_response(code)
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            o = self._allowed()
            self._send(204 if o is not None else 403, None, o or "")

        def do_GET(self):
            o = self._allowed()
            if o is None:
                return self._send(403, {"error": "forbidden"})
            url = urlparse(self.path)
            if url.path == "/health":
                return self._send(200, {"agent": "force-of-habit-monitor", "version": VERSION, "platform": "windows"}, o)
            if url.path == "/state":
                since = int((parse_qs(url.query).get("since") or ["0"])[0] or 0)
                return self._send(200, monitor.state(since), o)
            self._send(404, {"error": "not found"}, o)

        def do_POST(self):
            o = self._allowed()
            if o is None:
                return self._send(403, {"error": "forbidden"})
            length = min(int(self.headers.get("Content-Length") or 0), 8192)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                return self._send(400, {"error": "invalid json"}, o)
            path = urlparse(self.path).path
            if path == "/task":
                rules = body.get("rules")
                if not isinstance(rules, list) or not all(isinstance(r, str) for r in rules):
                    return self._send(400, {"error": "rules must be a list of strings"}, o)
                monitor.set_rules(rules)
                return self._send(200, {"ok": True}, o)
            if path == "/stop":
                monitor.set_rules([])
                return self._send(200, {"ok": True}, o)
            self._send(404, {"error": "not found"}, o)

    return Handler


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--origin", action="append", help="web app origin allowed to read this monitor (repeatable)")
    args = ap.parse_args()
    origins = set(args.origin or ["http://localhost:5173", "http://127.0.0.1:5173"])

    monitor = Monitor()
    hooks = start_hooks(monitor.wake)  # noqa: F841
    threading.Thread(target=monitor.run, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(monitor, origins, args.port))
    print(f"Monitor listening on http://127.0.0.1:{args.port} for {', '.join(sorted(origins))}. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
