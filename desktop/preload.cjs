const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'papotatoDesktop',
  Object.freeze({
    getConfig: () => ipcRenderer.invoke('desktop:config:get'),
    saveConfig: (config) => ipcRenderer.invoke('desktop:config:save', config),
    exportConfig: () => ipcRenderer.invoke('desktop:config:export'),
    getVersion: () => ipcRenderer.invoke('desktop:version'),
    hostStatus: () => ipcRenderer.invoke('desktop:host:status'),
    hostStart: () => ipcRenderer.invoke('desktop:host:start'),
    hostStop: () => ipcRenderer.invoke('desktop:host:stop'),
  }),
);
ipcRenderer.on('desktop:export-config', () => ipcRenderer.invoke('desktop:config:export'));
