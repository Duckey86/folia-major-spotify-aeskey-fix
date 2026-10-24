'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// electron/soloist/keyPromptPreload.cjs
// Only a single, narrowly scoped IPC method crosses the password prompt's context boundary.
contextBridge.exposeInMainWorld('soloistSetup', {
  saveKey: key => ipcRenderer.invoke('folia-soloist-private-save-key', key),
});
