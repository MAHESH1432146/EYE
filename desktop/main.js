'use strict';
const path = require('path');
const {
  app, BrowserWindow, ipcMain, screen, session, desktopCapturer, powerMonitor, systemPreferences, shell,
} = require('electron');

const APP_URL = process.env.RESEARCH_APP_URL || 'http://localhost:5173';
const APP_ORIGIN = new URL(APP_URL).origin;
const POLL_MS = 300;

// The study needs the webcam loop and timers to keep running while another application has focus.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let main = null;
let controller = null;
let monitorTimer = null;
let lastKey = '';
let lastListKey = '';
let pollCount = 0;
let procCache = [];
let gw = null;
let psList = null;

const isWayland = process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

function permissions() {
  const p = { camera: 'unknown', screen: 'unknown', accessibility: 'unknown' };
  if (process.platform === 'darwin') {
    p.camera = systemPreferences.getMediaAccessStatus('camera');
    p.screen = systemPreferences.getMediaAccessStatus('screen');
    p.accessibility = systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied';
  }
  return p;
}

function send(channel, payload) {
  if (main && !main.isDestroyed()) main.webContents.send(channel, payload);
}

function fromAppOrigin(webContents) {
  try { return new URL(webContents.getURL()).origin === APP_ORIGIN; } catch { return false; }
}

function createMain() {
  main = new BrowserWindow({
    width: 1280, height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  main.loadURL(APP_URL);

  // Only the study origin may open windows or navigate; everything else goes to the default browser.
  main.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  main.webContents.on('will-navigate', (e, url) => { if (new URL(url).origin !== APP_ORIGIN) e.preventDefault(); });

  for (const ev of ['minimize', 'restore', 'show', 'hide']) {
    main.on(ev, () => send('desktop:window-state', { minimize: 'minimized', restore: 'restored', show: 'shown', hide: 'hidden' }[ev]));
  }
  main.on('closed', () => { main = null; stopMonitor(); if (controller) controller.close(); });
}

function createController() {
  if (controller && !controller.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  controller = new BrowserWindow({
    width: 260, height: 230, x: workArea.x + workArea.width - 280, y: workArea.y + 20,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'controller-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  controller.setAlwaysOnTop(true, 'screen-saver');
  controller.setVisibleOnAllWorkspaces(true);
  controller.loadFile(path.join(__dirname, 'controller.html'));
  controller.on('closed', () => { controller = null; });
}

function displayForWindow() {
  return main ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay();
}

async function loadLibs() {
  if (!gw) gw = await import('get-windows');
  if (!psList && process.platform !== 'win32') psList = (await import('ps-list')).default;
}

// Bounds are reported in device-independent pixels so they match the calibrated display.
function toDip(bounds) {
  if (!bounds) return null;
  let r = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  if (process.platform === 'win32') r = screen.screenToDipRect(null, r);
  return [r.x, r.y, r.width, r.height];
}

const WIN_OPTS = { accessibilityPermission: false };

async function pollOnce() {
  try {
    await loadLibs();
    const w = await gw.activeWindow(WIN_OPTS);
    if (w) {
      const ev = { app: w.owner?.name || '', title: w.title || '', path: w.owner?.path || '', b: toDip(w.bounds) };
      const key = `${ev.app}|${ev.title}|${ev.path}|${(ev.b || []).join(',')}`;
      if (key !== lastKey) { lastKey = key; send('desktop:active-window', ev); }
    }

    // Everything currently open, so the app can tell when the target application is launched, already running or closed.
    const open = (await gw.openWindows(WIN_OPTS)).filter((x) => x.owner?.name || x.owner?.path)
      .map((x) => ({ app: x.owner?.name || '', title: x.title || '', path: x.owner?.path || '' }));
    // Windows has no process list: a window is the only reliable sign that an application is open.
    if (psList && pollCount % 3 === 0) {
      procCache = (await psList()).filter((p) => p.name).slice(0, 600).map((p) => ({ app: p.name, title: '', path: p.cmd || '', proc: true }));
    }
    pollCount += 1;
    const list = psList ? [...open, ...procCache] : open;
    const listKey = list.map((x) => `${x.app}|${x.title}|${x.path}|${x.proc ? 1 : 0}`).join('\n');
    if (listKey !== lastListKey) { lastListKey = listKey; send('desktop:open-windows', list); }
  } catch {
    // Missing permission or a transient lookup failure: skip this tick, never invent data.
  }
}

function startMonitor() {
  if (isWayland) return false;
  if (process.platform === 'darwin' && permissions().screen !== 'granted') return false;
  if (monitorTimer) return true;
  lastKey = '';
  lastListKey = '';
  pollCount = 0;
  monitorTimer = setInterval(pollOnce, POLL_MS);
  pollOnce();
  return true;
}

function stopMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}

ipcMain.handle('desktop:info', async () => {
  if (process.platform === 'darwin') {
    try { await systemPreferences.askForMediaAccess('camera'); } catch { /* reported through permissions() */ }
  }
  return { platform: process.platform, appVersion: app.getVersion(), monitorSupported: !isWayland, permissions: permissions() };
});

ipcMain.handle('desktop:display', () => {
  const d = displayForWindow();
  return { id: d.id, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor };
});

ipcMain.handle('desktop:monitor:start', () => startMonitor());
ipcMain.handle('desktop:monitor:stop', () => { stopMonitor(); });

ipcMain.on('desktop:state', (e, state) => {
  if (!main || e.sender !== main.webContents || !fromAppOrigin(e.sender)) return;
  if (!state || state.active !== true) {
    if (controller && !controller.isDestroyed()) controller.hide();
    return;
  }
  createController();
  if (!controller.isVisible()) controller.showInactive();
  controller.webContents.send('controller:state', state);
});

ipcMain.on('controller:end', (e) => {
  if (!controller || e.sender !== controller.webContents) return;
  send('desktop:end-request', true);
});

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // Camera for the study origin only; deny everything else.
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const ok = fromAppOrigin(wc) && (permission === 'media' || permission === 'display-capture') && (!details.mediaTypes || details.mediaTypes.every((t) => t === 'video'));
    cb(ok);
  });
  ses.setPermissionCheckHandler((wc, permission) => !!wc && fromAppOrigin(wc) && permission === 'media');

  // Screen capture of the calibrated display without a picker (consent is collected in the app first).
  ses.setDisplayMediaRequestHandler(async (request, cb) => {
    try {
      const target = displayForWindow();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const src = sources.find((s) => String(s.display_id) === String(target.id)) || sources[0];
      cb(src ? { video: src } : {});
    } catch {
      cb({});
    }
  });

  createMain();

  screen.on('display-metrics-changed', () => send('desktop:display-changed', true));
  screen.on('display-added', () => send('desktop:display-changed', true));
  screen.on('display-removed', () => send('desktop:display-changed', true));
  powerMonitor.on('suspend', () => send('desktop:suspend', 'suspend'));
  powerMonitor.on('resume', () => send('desktop:suspend', 'resume'));
  powerMonitor.on('lock-screen', () => send('desktop:suspend', 'suspend'));
  powerMonitor.on('unlock-screen', () => send('desktop:suspend', 'resume'));
});

app.on('window-all-closed', () => app.quit());
