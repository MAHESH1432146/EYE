'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controller', {
  onState: (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on('controller:state', fn);
    return () => ipcRenderer.removeListener('controller:state', fn);
  },
  end: () => ipcRenderer.send('controller:end'),
});
