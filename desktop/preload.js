'use strict';
// Exposes a minimal, fixed API to the web app. No Node access is given to page content.
const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('desktop:info'),
  getDisplay: () => ipcRenderer.invoke('desktop:display'),
  startMonitor: () => ipcRenderer.invoke('desktop:monitor:start'),
  stopMonitor: () => ipcRenderer.invoke('desktop:monitor:stop'),
  onActiveWindow: subscribe('desktop:active-window'),
  onOpenWindows: subscribe('desktop:open-windows'),
  onWindowState: subscribe('desktop:window-state'),
  onDisplayChanged: subscribe('desktop:display-changed'),
  onSuspend: subscribe('desktop:suspend'),
  publishState: (state) => ipcRenderer.send('desktop:state', state),
  onEndRequest: subscribe('desktop:end-request'),
});
