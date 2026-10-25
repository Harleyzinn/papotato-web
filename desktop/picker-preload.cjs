const { contextBridge, ipcRenderer } = require('electron');
const id = new URLSearchParams(location.search).get('windowId');
contextBridge.exposeInMainWorld('capturePicker', {
  list: () => ipcRenderer.invoke('picker:list:' + id),
  select: (value) => ipcRenderer.send('picker:select:' + id, value),
});
