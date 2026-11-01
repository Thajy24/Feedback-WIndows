const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("native", {
  show: () => ipcRenderer.send("show"),
  unread: n => ipcRenderer.send("unread", n),
  popup: () => ipcRenderer.send("popup"),          // ouvre le pop-up bloquant
  popupDone: () => ipcRenderer.send("popup-done")  // le ferme (tout est lu)
});
