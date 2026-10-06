const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("native", {
  show: () => ipcRenderer.send("show"),
  unread: n => ipcRenderer.send("unread", n),
  popup: items => ipcRenderer.send("popup", items),
  ack: id => ipcRenderer.send("ack", id),
  reply: (id, message, image) => ipcRenderer.send("reply", { id, message, image }),
  onData: cb => ipcRenderer.on("data", (_e, d) => cb(d)),
  onMarkRead: cb => ipcRenderer.on("mark-read", (_e, id) => cb(id)),
  onReply: cb => ipcRenderer.on("reply", (_e, p) => cb(p))
});
