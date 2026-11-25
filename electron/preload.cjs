const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  print: (job) => ipcRenderer.invoke("document:print", job),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  openReleases: () => ipcRenderer.invoke("updates:releases"),
  readClipboard: () => ipcRenderer.invoke("clipboard:read"),
  nativeClipboard: (action) => ipcRenderer.invoke("clipboard:edit", action),
  writeClipboard: (content) => ipcRenderer.invoke("clipboard:write", content),
  findFont: (name) => ipcRenderer.invoke("fonts:find", name),
  open: (kind = "pdf") => ipcRenderer.invoke("file:open", kind),
  save: (bytes, name) => ipcRenderer.invoke("file:save", bytes, name),
  exportFile: (file) => ipcRenderer.invoke("file:export", file),
  language: (locale) => ipcRenderer.send("ui:language", locale),
  dirty: (value) => ipcRenderer.send("document:dirty", value === true),
  onAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },
});
