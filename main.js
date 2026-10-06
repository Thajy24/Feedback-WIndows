const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require("electron");
const path = require("path");

// true  : le pop-up assombrit tout l'écran, l'agent doit répondre pour pouvoir cliquer ailleurs
// false : simple fenêtre pop-up au centre, toujours au premier plan, sans bloquer le reste
const BLOQUANT = true;

app.setAppUserModelId("com.agence.feedback");
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null, tray = null, quitting = false;
const queue = [], seen = new Set(), overlays = [];

function showWin() {
  if (!win) return;
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 660,
    show: !process.argv.includes("--hidden"),
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), backgroundThrottling: false }
  });
  win.loadFile("index.html");
  win.on("close", e => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
}

/* ---------- Pop-up de feedback (un à la fois, dans l'ordre d'arrivée) ---------- */
function createOverlays(item) {
  const primaryId = screen.getPrimaryDisplay().id;
  const displays = BLOQUANT ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
  displays.forEach(d => {
    const isPrimary = d.id === primaryId;
    const geometry = BLOQUANT
      ? { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, transparent: true }
      : { width: 480, height: 430, center: true };
    const w = new BrowserWindow({
      ...geometry,
      frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, "preload.js"), backgroundThrottling: false }
    });
    w.setAlwaysOnTop(true, "screen-saver");
    w.on("close", e => e.preventDefault()); // impossible de fermer sans répondre
    w.loadFile("popup.html", { query: { primary: isPrimary ? "1" : "0", block: BLOQUANT ? "1" : "0" } });
    w.once("ready-to-show", () => { w.show(); if (isPrimary) w.focus(); });
    if (isPrimary) {
      w.webContents.once("did-finish-load", () => {
        w.webContents.send("data", { ...item, remaining: queue.length });
      });
    }
    overlays.push(w);
  });
}

function closeOverlays() {
  overlays.splice(0).forEach(w => w.destroy());
}

function next() {
  if (overlays.length || !queue.length) return;
  createOverlays(queue.shift());
}

ipcMain.on("popup", (_e, items) => {
  items.forEach(it => {
    if (!seen.has(it.id)) { seen.add(it.id); queue.push(it); }
  });
  next();
});
ipcMain.on("ack", (_e, id) => {
  closeOverlays();
  if (win) win.webContents.send("mark-read", id);
  setTimeout(next, 400);
});
ipcMain.on("reply", (_e, payload) => {
  closeOverlays();
  if (win) win.webContents.send("reply", payload);
  setTimeout(next, 400);
});

ipcMain.on("show", showWin);
ipcMain.on("unread", (_e, n) => {
  if (tray) tray.setToolTip(n ? `Feedback Agence · ${n} non lu${n > 1 ? "s" : ""}` : "Feedback Agence");
});

app.on("second-instance", showWin);

app.whenReady().then(() => {
  if (!gotLock) return;
  createWindow();
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Feedback Agence");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Ouvrir", click: showWin },
    { label: "Quitter", click: () => { quitting = true; closeOverlays(); app.quit(); } }
  ]));
  tray.on("click", showWin);
  app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
});
