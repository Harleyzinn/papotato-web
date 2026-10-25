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
    updateStatus: () => ipcRenderer.invoke('desktop:update:status'),
    checkUpdates: () => ipcRenderer.invoke('desktop:update:check'),
    installUpdate: () => ipcRenderer.invoke('desktop:update:install'),
    setCallActive: (active) => ipcRenderer.send('desktop:update:call-active', active === true),
    onUpdate: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('desktop:update:state', handler);
      return () => ipcRenderer.removeListener('desktop:update:state', handler);
    },
  }),
);
ipcRenderer.on('desktop:export-config', () => ipcRenderer.invoke('desktop:config:export'));
