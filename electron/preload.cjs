const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  open: (kind = "pdf") => ipcRenderer.invoke("file:open", kind),
  save: (bytes, name) => ipcRenderer.invoke("file:save", bytes, name),
  dirty: (value) => ipcRenderer.send("document:dirty", value === true),
  onAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },
});
