# The Force of Habit – GUI Usability & Eye-Tracking Platform

Full-stack research platform (React + Vite + Tailwind, Express, MongoDB Atlas) comparing Windows 11, macOS and Linux (openSUSE KDE Plasma) with visual-search tasks, webcam eye tracking and SUS questionnaires.

## Setup

```bash
# server
cd server
cp ../.env.example .env      # fill MONGODB_URI, JWT_SECRET, RESEARCHER_INVITE_CODE
npm install
npm run seed:researcher      # optional: creates a researcher account from SEED_* variables
npm run dev                  # http://localhost:5000

# client (second terminal)
cd client
echo VITE_API_URL=http://localhost:5000/api > .env
npm install
npm run dev                  # http://localhost:5173
```

Researchers register by choosing the Researcher role and entering `RESEARCHER_INVITE_CODE`.
Without a mail service, the forgot-password page shows the reset link directly when `NODE_ENV` is not `production`.

## Running an experiment

1. Researcher: Experiments & Tasks → create experiment → "Create default 16-task bank" (tasks are plain instructions; there are no screenshots).
2. Edit or add tasks if needed, then set the experiment status to **Active**.
3. Participants register, complete the survey, and are assigned (Participants tab). The researcher can pick specific tasks per participant; leaving the selection empty gives all active tasks for the participant's own OS.
4. Participant: consent (camera, optional screen sharing) → OS check (the OS must match what the browser reports) → fullscreen calibration (4 points, 4 clicks each) → tasks on their own computer → SUS.
5. For each task: Start (timer + gaze recording begin) → do the task on the own computer → End Task → report whether it was completed → results screen.
6. Researcher: Dashboard, Live Monitor, Eye Tracking, Heatmaps, Scan Paths, SUS Analysis, OS Comparison, Statistical Analysis, Reports (PDF/CSV), Settings (users, privacy, audit log).

## Windows monitor (Python: psutil + PyWin32)

`monitor/` is a small Python agent for the participant's Windows PC that provides real OS-level application detection to the normal browser page (no Electron needed). It serves `127.0.0.1:47831` only, answers only the allowed web-app origin, and reports only windows matching the current task's rules (plus the active window).

```
cd monitor
pip install -r requirements.txt
python agent.py            # add --origin https://your-site if the app is not on localhost:5173
python -m unittest test_matcher
```

- **psutil**: process names, executable paths, process start/exit (logged as `target_process_started/exited`).
- **PyWin32** (`win32gui`, `win32process`): top-level windows, active window, titles, owning process id. Modern apps hosted by `ApplicationFrameHost.exe` (Settings) are resolved to their own process (`SystemSettings.exe`); cloaked (closed but suspended) windows are ignored.
- **Windows API** `SetWinEventHook` (foreground, show/hide, create/destroy, minimise, cloak) wakes the scanner immediately; a 0.5 s scan is the fallback.
- Rules are mapped per task (Tasks panel). The Python matcher in `monitor/matcher.py` has the same syntax as the server's, so the web app and the agent agree on what counts as the target.
- Sessions (start, close, duration), launch/close/activate events with timestamps, and process ids are stored with the task result (`TaskResult.activity`). Closing the application never completes the task; completion stays self-reported.
- Sessions follow windows, not processes: `SystemSettings.exe` can stay alive after its window closes, so the process events are recorded but do not keep a session open.

The agent does not move the camera: gaze keeps being recorded only while the browser tab can run, so keep the study window visible (side by side or on a second monitor) or use the Electron app for background tracking.

## Desktop app (cross-application tracking and verification)

`desktop/` is an Electron shell around the same web app. In a normal browser everything still works, but a web page cannot see other applications; the desktop app adds:

- Active-window detection (`active-win`, polled every 300 ms): application name, title, path and bounds. A task is **verified** when its researcher-defined target application (Tasks panel: match strings such as `explorer.exe`, `settings`) became the active window. Verification is shown separately from the participant's self-reported completion. It proves the application was in use, not that the exact action was performed.
- Gaze keeps being recorded while other applications are in focus (background throttling disabled). Samples are tied to the active window, so TTFF, dwell and revisits can be computed for a target application or a target screen region.
- Interruptions (window minimised/hidden, display change, suspend/lock, camera loss, face lost) are recorded as intervals; nothing is filled in.
- An always-on-top controller window shows timer, instruction, active app and an End Task button.
- Camera access is granted only to the study origin; the display capture handler picks the calibrated display without a picker.

```
cd desktop
npm install
set RESEARCH_APP_URL=http://localhost:5173   # optional, this is the default
npm start
```

Limits: macOS needs Camera, Screen Recording and Accessibility permission for the app; Linux Wayland does not expose the active window (monitoring is reported as unsupported); gaze mapping assumes calibration on one fullscreen display, so multi-monitor sessions are only accurate on the calibrated display; no global click/keystroke hooks are implemented. The desktop app was not exercised with real hardware during development.

Researchers get per-task and per-participant reports under **Task Reports** (charts, verification, TTFF, revisits, CSV export `task-wise`). OS groups are separate participants, and group sizes are displayed on OS Comparison.

## Methodology notes

- Gaze: WebGazer (ridge regression + Kalman filter), calibrated fullscreen so predictions are real screen coordinates and stored as fractions of the screen. Accuracy is validated at calibration. This is an approximation and **not** equivalent to Gazepoint GP3 HD measurements. The browser window must stay visible while tracking.
- Fixations: I-DT, dispersion <= 0.05 (normalised), >= 100 ms. Metrics per task: fixation count, total and average dwell, blink count and rate (eye-openness dips of 50-600 ms), face-lost time, screen-region dwell (4x3 grid). Insufficient data gives `null` (shown as "n/a"); 0 is a measured zero.
- A web page cannot observe other applications. Task completion is **self-reported** at End Task; timing and gaze are measured. Optional screen sharing stores one reduced JPEG still per task (never video), used as the heatmap background.
- A participant only receives tasks for the OS the browser reports (verified on the server), so OS comparisons are between participants.
- SUS: standard scoring, reference 68.
- Statistics: Shapiro-Wilk, Levene (median-centred), Kruskal-Wallis + Dunn (Bonferroni) for independent groups, Friedman + Wilcoxon signed-rank (Bonferroni) when the same participants appear across OS. Small samples return "insufficient" or are labelled exploratory.
- Reports separate measured results from automatically generated findings.

## Security and privacy

bcrypt password hashing, JWT auth, role-based access, per-participant data isolation, zod validation, helmet, rate limiting, validated ObjectId query parameters, JPEG magic-byte checks on screen stills, CSV formula-injection escaping, audit log, participant withdrawal/anonymization, researcher data deletion (with confirmation). Raw webcam video is never stored or uploaded; only derived gaze coordinates are kept.

## Tests

`cd server && npm test` runs unit tests (fixations, metrics, heatmap, SUS, statistics, analysis) and an end-to-end integration test against an in-memory MongoDB (`mongodb-memory-server`, downloads a mongod binary on first run; skipped if unavailable).

## Known limitations

- PDF figures use the participant's screen still when one exists, otherwise a neutral screen-shaped grid.
- Email delivery for password reset is not implemented (dev token shown instead).
- Camera calibration must be repeated if the participant reloads the page.
