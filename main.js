const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");

// Mise à jour automatique de l'exe (GitHub Releases)
let autoUpdater = null;
try { ({ autoUpdater } = require("electron-updater")); } catch (e) {}

// Adresse du site : toute modification du site apparaît automatiquement dans l'exe
const SITE_URL = "https://feedback-flame-eight.vercel.app/";
const ORIGIN = new URL(SITE_URL).origin;
// true = l'écran est assombri et bloqué derrière le pop-up ; false = le pop-up seul reste au premier plan
const BLOCK_SCREEN = true;

app.setAppUserModelId("com.agence.feedback");
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null, tray = null, quitting = false, retry = null, lastLoad = 0;
let popupWin = null, overlays = [], updateReady = false;

/* ---------- Mise à jour automatique de l'exe ---------- */
const flagFile = () => path.join(app.getPath("userData"), "updated.flag");
function consumeUpdateFlag() { // après une mise à jour, on redémarre en arrière-plan, sans ouvrir la fenêtre
  try { if (fs.existsSync(flagFile())) { fs.unlinkSync(flagFile()); return true; } } catch (e) {}
  return false;
}
function tryInstall() {
  if (!updateReady || !autoUpdater) return;
  if (popupWin) return;                   // jamais pendant un pop-up
  if (win && win.isVisible()) return;     // pas pendant que l'agent utilise la fenêtre
  try { fs.writeFileSync(flagFile(), "1"); } catch (e) {}
  quitting = true;
  autoUpdater.quitAndInstall(true, true); // installation silencieuse, puis relance
}
function initUpdater() {
  if (!autoUpdater || !app.isPackaged) return; // seulement dans l'exe installé
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;    // sinon installée à la prochaine fermeture
  autoUpdater.on("update-downloaded", () => { updateReady = true; tryInstall(); });
  autoUpdater.on("error", () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 60 * 60 * 1000);  // vérifie toutes les heures
  setInterval(tryInstall, 60 * 1000);  // installe dès que le moment est sûr
}

// Seules les pages de ton site peuvent envoyer des ordres à l'exe
const fromSite = e => { try { return e.senderFrame.url.startsWith(ORIGIN); } catch { return false; } };

/* ---------- Pop-up bloquant au centre de l'écran ---------- */
function openPopup() {
  if (popupWin) { popupWin.show(); popupWin.focus(); return; } // déjà ouvert : il se met à jour tout seul

  if (BLOCK_SCREEN) {
    const html = encodeURIComponent("<body style='margin:0;background:rgba(0,0,0,0.55)'></body>");
    overlays = screen.getAllDisplays().map(d => {
      const o = new BrowserWindow({
        x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
        frame: false, transparent: true, resizable: false, movable: false,
        skipTaskbar: true, focusable: false, hasShadow: false, show: false,
        webPreferences: { sandbox: true }
      });
      o.setAlwaysOnTop(true, "screen-saver");
      o.loadURL("data:text/html;charset=utf-8," + html);
      o.once("ready-to-show", () => o.showInactive());
      return o;
    });
  }

  popupWin = new BrowserWindow({
    width: 520, height: 620, center: true, frame: false,
    resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, show: false, backgroundColor: "#ffffff",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  popupWin.setAlwaysOnTop(true, "screen-saver"); // au-dessus de tout, même les applis plein écran
  popupWin.loadURL(SITE_URL + "popup.html");
  popupWin.once("ready-to-show", () => { popupWin.show(); popupWin.focus(); });
  // Si la page du pop-up ne charge pas, on ne bloque jamais l'écran
  popupWin.webContents.on("did-fail-load", (_e, code, _d, _u, isMainFrame) => {
    if (isMainFrame && code !== -3) closePopup();
  });
  popupWin.webContents.on("will-navigate", e => e.preventDefault());
  popupWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  popupWin.on("close", e => { if (popupWin) e.preventDefault(); }); // Alt+F4 ne le ferme pas
}

function closePopup() {
  const p = popupWin;
  popupWin = null;
  if (p && !p.isDestroyed()) p.destroy();
  overlays.forEach(o => { if (!o.isDestroyed()) o.destroy(); });
  overlays = [];
}

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
    show: !(process.argv.includes("--hidden") || consumeUpdateFlag()),
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
    { label: "Version " + app.getVersion(), enabled: false },
    { label: "Ouvrir", click: showWin },
    { label: "Quitter", click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on("click", showWin);
  // Secours : Ctrl+Alt+Maj+Q libère l'écran si le pop-up reste bloqué
  globalShortcut.register("CommandOrControl+Alt+Shift+Q", closePopup);
  initUpdater();
  // Démarre avec Windows, en arrière-plan
  app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
});

ipcMain.on("show", e => { if (fromSite(e)) showWin(); });
ipcMain.on("popup", e => { if (fromSite(e)) openPopup(); });
ipcMain.on("popup-done", e => { if (fromSite(e)) closePopup(); });
ipcMain.on("unread", (e, n) => {
  if (!fromSite(e)) return;
  if (tray) tray.setToolTip(n ? `Feedback Agence · ${n} non lu${n > 1 ? "s" : ""}` : "Feedback Agence");
  if (n && win && !win.isFocused()) win.flashFrame(true);
});

app.on("will-quit", () => globalShortcut.unregisterAll());

// Nécessaire pour que la mise à jour puisse fermer l'appli (la fenêtre se cache au lieu de se fermer)
app.on("before-quit", () => { quitting = true; });
