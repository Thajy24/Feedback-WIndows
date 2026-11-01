const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("native", {
  show: () => ipcRenderer.send("show"),
  unread: n => ipcRenderer.send("unread", n)
});
