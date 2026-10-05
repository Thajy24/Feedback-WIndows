const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require("electron");
const path = require("path");

app.setAppUserModelId("com.agence.feedback");
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null, tray = null, quitting = false;

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
  // Fermer la fenêtre la met dans la zone de notification : l'appli continue de tourner
  win.on("close", e => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
}

app.on("second-instance", showWin);

app.whenReady().then(() => {
  if (!gotLock) return;
  createWindow();
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Feedback Agence");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Ouvrir", click: showWin },
    { label: "Quitter", click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on("click", showWin);
  // Démarre avec Windows, en arrière-plan
  app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
});

ipcMain.on("show", showWin);
ipcMain.on("unread", (_e, n) => {
  if (tray) tray.setToolTip(n ? `Feedback Agence · ${n} non lu${n > 1 ? "s" : ""}` : "Feedback Agence");
  if (n && win && !win.isFocused()) win.flashFrame(true);
});
