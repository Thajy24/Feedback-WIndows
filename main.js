const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");

// Adresse du site : toute modification du site apparaît automatiquement dans l'exe
const SITE_URL = "https://feedback-flame-eight.vercel.app/";
const ORIGIN = new URL(SITE_URL).origin;

app.setAppUserModelId("com.agence.feedback");
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null, tray = null, quitting = false, retry = null, lastLoad = 0;

function showWin() {
  if (!win) return;
  win.show();
  win.focus();
}

function loadSite() {
  clearTimeout(retry);
  win.loadURL(SITE_URL).catch(() => {}); // les erreurs sont gérées par did-fail-load
}

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 660,
    show: !process.argv.includes("--hidden"),
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  loadSite();

  // Pas d'internet : page de secours, puis nouvel essai toutes les 10 secondes
  win.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = chargement annulé
    win.loadFile(path.join(__dirname, "offline.html"));
    clearTimeout(retry);
    retry = setTimeout(loadSite, 10000);
  });
  win.webContents.on("did-finish-load", () => {
    if (win.webContents.getURL().startsWith(ORIGIN)) lastLoad = Date.now();
  });

  // Sécurité : seule la page du site peut s'afficher ; les autres liens s'ouvrent dans le navigateur
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN) && !url.startsWith("file://")) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Fermer la fenêtre la met dans la zone de notification : l'appli continue de tourner
  win.on("close", e => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });

  // Reprendre la dernière version du site quand l'agent rouvre la fenêtre (si > 10 min)
  win.on("show", () => {
    if (Date.now() - lastLoad > 10 * 60 * 1000) loadSite();
  });
  // Fenêtre cachée pendant des heures : rechargement discret toutes les 6 h
  setInterval(() => { if (!win.isVisible()) loadSite(); }, 6 * 3600 * 1000);
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
