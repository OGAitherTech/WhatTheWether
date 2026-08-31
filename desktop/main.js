/* ============================================================
   Aither Weather — Electron main process.

   The desktop app is the same static web app, loaded from the
   packaged resources. No API keys, no bundled server, no build
   step for the web side.
   ============================================================ */

const { app, BrowserWindow, Menu, shell, dialog, ipcMain,
        Tray, nativeImage, Notification, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
log.transports.file.level = 'info';

/* Updates come from the project's own GitHub releases.

   electron-builder writes latest.yml (and the mac/linux equivalents)
   beside the installers when a release is published, and the updater
   reads those. Nothing here needs a token: the repository is public,
   so the update feed is a public URL like any other download.

   Auto-download is off. A weather app quietly pulling ninety
   megabytes over somebody's tethered connection is not a courtesy —
   it asks first, and it only asks once per launch. */
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

let updateState = { status: 'idle', version: null, notes: null, progress: 0,
                    currentVersion: null, checkedAt: null };
let promptedVersion = null;
let readyPromptedVersion = null;
let periodicUpdateTimer = null;

function setUpdateState(patch) {
  updateState = Object.assign({}, updateState, patch);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateState);
    if (updateState.status === 'downloading') {
      mainWindow.setProgressBar(Math.max(0, Math.min(1, (updateState.progress || 0) / 100)));
    } else {
      mainWindow.setProgressBar(-1);
    }
  }
}

function releaseNotes(info) {
  const notes = info && info.releaseNotes;
  if (typeof notes === 'string') return notes.slice(0, 4000);
  if (Array.isArray(notes)) {
    return notes.map((item) => typeof item === 'string' ? item : item && item.note)
      .filter(Boolean).join('\n\n').slice(0, 4000);
  }
  return null;
}

async function promptForAvailableUpdate(info) {
  const version = String((info && info.version) || 'new');
  if (!mainWindow || promptedVersion === version) return;
  promptedVersion = version;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aither Weather update available',
    message: `Aither Weather ${version} is available.`,
    detail: `${releaseNotes(info) || 'A newer desktop version is ready.'}\n\n` +
            'Download it now? Installation waits until you approve the restart.',
    buttons: ['Download update', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (result.response === 0) {
    setUpdateState({ status: 'downloading', progress: 0 });
    try { await autoUpdater.downloadUpdate(); }
    catch (err) { setUpdateState({ status: 'error', notes: String(err && err.message) }); }
  }
}

async function promptForReadyUpdate(info) {
  const version = String((info && info.version) || updateState.version || 'new');
  if (!mainWindow || readyPromptedVersion === version) return;
  readyPromptedVersion = version;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update ready',
    message: `Aither Weather ${version} is ready to install.`,
    detail: 'Restart now to finish the update, or keep using the app and install when you quit.',
    buttons: ['Restart and install', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (result.response === 0) {
    app.isQuitting = true;
    setImmediate(() => autoUpdater.quitAndInstall());
  }
}

// In development the app sits one level up; once packaged it is
// copied into the resources directory as "app".
function appRoot() {
  const packaged = path.join(process.resourcesPath || '', 'app');
  if (process.resourcesPath && fs.existsSync(path.join(packaged, 'index.html'))) {
    return packaged;
  }
  return path.join(__dirname, '..');
}

let mainWindow = null;
let tray = null;
let normalBounds = null;
let saveBoundsTimer = null;

/* Desktop-only preferences, kept beside the app's own data rather
   than in the page's localStorage: they describe the window and the
   tray, which the page does not own. */
const PREFS_FILE = () => path.join(app.getPath('userData'), 'desktop-prefs.json');
const DEFAULT_PREFS = {
  launchAtLogin: false,
  trayWeather: true,
  alwaysOnTop: false,
  minimiseToTray: false,
  autoCheckUpdates: true,
  startCompact: false,
};

const WINDOW_STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

function readWindowState() {
  try { return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE(), 'utf8')); }
  catch (_) { return {}; }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isCompactMode || mainWindow.isMinimized() ||
      mainWindow.isFullScreen() || mainWindow.webContents.getZoomFactor() !== 1) return;
  const state = { bounds: mainWindow.getBounds(), maximized: mainWindow.isMaximized() };
  try { fs.writeFileSync(WINDOW_STATE_FILE(), JSON.stringify(state)); }
  catch (err) { log.warn('could not save window state', err && err.message); }
}

function visibleBounds(candidate) {
  if (!candidate || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return null;
  const displays = screen.getAllDisplays();
  const visible = displays.some(({ workArea }) =>
    candidate.x < workArea.x + workArea.width && candidate.x + candidate.width > workArea.x &&
    candidate.y < workArea.y + workArea.height && candidate.y + candidate.height > workArea.y);
  return visible ? candidate : null;
}

function sendCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('desktop-command', command);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleCompact(force) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = typeof force === 'boolean' ? force : !mainWindow.isCompactMode;
  if (next === !!mainWindow.isCompactMode) return next;
  if (next) {
    normalBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(360, 500);
    mainWindow.setBounds(Object.assign({}, normalBounds, { width: 430, height: 720 }));
    mainWindow.setAlwaysOnTop(true, 'floating');
  } else {
    mainWindow.setAlwaysOnTop(!!readPrefs().alwaysOnTop);
    if (normalBounds) mainWindow.setBounds(normalBounds);
  }
  mainWindow.isCompactMode = next;
  sendCommand(next ? 'compact-on' : 'compact-off');
  return next;
}

function readPrefs() {
  try {
    const raw = fs.readFileSync(PREFS_FILE(), 'utf8');
    return Object.assign({}, DEFAULT_PREFS, JSON.parse(raw));
  } catch (err) {
    return Object.assign({}, DEFAULT_PREFS);
  }
}

function writePrefs(patch) {
  const next = Object.assign({}, readPrefs(), patch || {});
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(PREFS_FILE(), JSON.stringify(next, null, 2));
  } catch (err) {
    log.warn('could not save desktop preferences', err && err.message);
  }
  applyPrefs(next);
  return next;
}

function applyPrefs(prefs) {
  try {
    // Only meaningful where the OS has the concept.
    if (process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: !!prefs.launchAtLogin });
    }
  } catch (err) {
    log.warn('login item not settable', err && err.message);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(!!prefs.alwaysOnTop);
  }
  if (!prefs.trayWeather && tray) { tray.destroy(); tray = null; }
}

function createWindow() {
  const saved = readWindowState();
  const bounds = visibleBounds(saved.bounds);
  mainWindow = new BrowserWindow({
    width: bounds ? bounds.width : 1280,
    height: bounds ? bounds.height : 900,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#0a0e17',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Avoid a white flash before the dark UI paints.
  mainWindow.once('ready-to-show', () => {
    if (saved.maximized) mainWindow.maximize();
    mainWindow.show();
    if (readPrefs().startCompact) toggleCompact(true);
  });
  mainWindow.loadFile(path.join(appRoot(), 'index.html'));

  // External links open in the real browser, never in the app frame.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  const scheduleSaveBounds = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveWindowState, 250);
  };
  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);

  // Closing to the tray is a desktop habit; it is off unless asked for.
  mainWindow.on('close', (event) => {
    const prefs = readPrefs();
    if (prefs.minimiseToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  applyPrefs(readPrefs());
}


/* ============================================================
   Updates
   ============================================================ */

function wireUpdater() {
  setUpdateState({ currentVersion: app.getVersion() });
  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    setUpdateState({ status: 'available', version: info && info.version,
                     notes: releaseNotes(info), checkedAt: new Date().toISOString() });
    promptForAvailableUpdate(info);
  });
  autoUpdater.on('update-not-available', () =>
    setUpdateState({ status: 'current', checkedAt: new Date().toISOString() }));
  autoUpdater.on('download-progress', (p) =>
    setUpdateState({ status: 'downloading', progress: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({ status: 'ready', version: info && info.version, progress: 100 });
    promptForReadyUpdate(info);
  });
  autoUpdater.on('error', (err) => {
    // An update that cannot be checked is not a reason to interrupt
    // somebody looking at the weather.
    log.warn('update check failed', err && err.message);
    setUpdateState({ status: 'error', notes: String((err && err.message) || err) });
  });
}

function scheduleUpdateChecks() {
  clearInterval(periodicUpdateTimer);
  if (!readPrefs().autoCheckUpdates) return;
  // Re-check while the app remains resident in the tray. Four hours
  // catches a release promptly without turning GitHub into a polling service.
  periodicUpdateTimer = setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000);
}

async function checkForUpdates({ silent = true } = {}) {
  if (!app.isPackaged) {
    setUpdateState({ status: 'dev' });
    return updateState;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setUpdateState({ status: 'error', notes: String((err && err.message) || err) });
  }
  if (!silent && updateState.status === 'current') {
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Up to date',
      message: `Aither Weather ${app.getVersion()} is the newest version.`,
      buttons: ['OK'],
    });
  }
  return updateState;
}

/* ============================================================
   Tray — the current temperature beside the system clock
   ============================================================ */

function ensureTray() {
  if (tray || !readPrefs().trayWeather) return;
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) image = image.resize({ width: 18, height: 18 });
  tray = new Tray(image);
  tray.setToolTip('Aither Weather');
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Aither Weather', click: showMainWindow },
    { label: 'Weather Glance', click: () => { showMainWindow(); toggleCompact(); } },
    { label: 'Search for a Place…', click: () => { showMainWindow(); sendCommand('search'); } },
    { label: 'Refresh Weather', click: () => sendCommand('refresh') },
    { label: 'Check for Updates…', click: () => checkForUpdates({ silent: false }) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

/* ============================================================
   The channels the page may use
   ============================================================ */

function wireIpc() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:state', () => updateState);
  ipcMain.handle('update:check', () => checkForUpdates({ silent: true }));
  ipcMain.handle('update:install', async () => {
    if (updateState.status === 'available') {
      setUpdateState({ status: 'downloading', progress: 0 });
      try { await autoUpdater.downloadUpdate(); }
      catch (err) { setUpdateState({ status: 'error', notes: String(err && err.message) }); }
      return updateState;
    }
    if (updateState.status === 'ready') {
      app.isQuitting = true;
      setImmediate(() => autoUpdater.quitAndInstall());
    }
    return updateState;
  });

  ipcMain.handle('prefs:get', () => readPrefs());
  ipcMain.handle('prefs:set', (_e, patch) => {
    // Only the keys this app knows about, and only of the right type:
    // the renderer is trusted, but a typo should not write junk into
    // the preferences file.
    const clean = {};
    for (const key of Object.keys(DEFAULT_PREFS)) {
      if (patch && typeof patch[key] === 'boolean') clean[key] = patch[key];
    }
    const next = writePrefs(clean);
    if (next.trayWeather) ensureTray();
    scheduleUpdateChecks();
    return next;
  });

  ipcMain.handle('tray:weather', (_e, info) => {
    if (!readPrefs().trayWeather) return false;
    ensureTray();
    if (!tray || !info) return false;
    const temp = typeof info.temp === 'string' ? info.temp.slice(0, 12) : '';
    const place = typeof info.place === 'string' ? info.place.slice(0, 60) : '';
    const condition = typeof info.condition === 'string' ? info.condition.slice(0, 60) : '';
    // macOS and Windows show a title beside the icon; Linux trays
    // vary, so the tooltip carries the same information either way.
    if (typeof tray.setTitle === 'function') tray.setTitle(temp ? ` ${temp}` : '');
    tray.setToolTip([place, condition, temp].filter(Boolean).join(' · ') || 'Aither Weather');
    return true;
  });

  ipcMain.handle('notify', (_e, payload) => {
    if (!Notification.isSupported() || !payload) return false;
    const title = String(payload.title || 'Aither Weather').slice(0, 120);
    const body = String(payload.body || '').slice(0, 400);
    new Notification({ title, body, silent: false }).show();
    return true;
  });

  ipcMain.handle('window:command', (_e, command) => {
    const allowed = new Set(['show', 'hide', 'toggle-compact', 'toggle-maximize',
                             'zoom-in', 'zoom-out', 'zoom-reset']);
    if (!allowed.has(command) || !mainWindow) return false;
    if (command === 'show') showMainWindow();
    if (command === 'hide') mainWindow.hide();
    if (command === 'toggle-compact') return toggleCompact();
    if (command === 'toggle-maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
    }
    const wc = mainWindow.webContents;
    if (command === 'zoom-in') wc.setZoomFactor(Math.min(1.5, wc.getZoomFactor() + 0.1));
    if (command === 'zoom-out') wc.setZoomFactor(Math.max(0.7, wc.getZoomFactor() - 0.1));
    if (command === 'zoom-reset') wc.setZoomFactor(1);
    return true;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh Weather',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendCommand('refresh'),
        },
        {
          label: 'Search for a Place…',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendCommand('palette'),
        },
        {
          label: 'Use My Location',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => sendCommand('location'),
        },
        {
          label: 'Weather Glance',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => toggleCompact(),
        },
        {
          label: 'Toggle Fullscreen',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => mainWindow && mainWindow.webContents.setZoomFactor(1) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => mainWindow && mainWindow.webContents.setZoomFactor(Math.min(1.5, mainWindow.webContents.getZoomFactor() + 0.1)) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow && mainWindow.webContents.setZoomFactor(Math.max(0.7, mainWindow.webContents.getZoomFactor() - 0.1)) },
        { type: 'separator' }, { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Aither Weather',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Aither Weather',
            message: `Aither Weather ${app.getVersion()}`,
            detail: 'Neon weather with a real-map radar, a 48-hour outlook, and a\n' +
                    'local AI that roasts the forecast.\n\n' +
                    'No API keys. Weather from the National Weather Service,\n' +
                    'MET Norway and Open-Meteo; radar from RainViewer and NOAA.',
            buttons: ['OK'],
          }),
        },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates({ silent: false }),
        },
        {
          label: 'Weather Data Sources',
          click: () => shell.openExternal('https://open-meteo.com/'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// A second launch should focus the existing window, not open another.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      showMainWindow();
    }
  });

  app.whenReady().then(() => {
    wireUpdater();
    wireIpc();
    buildMenu();
    createWindow();
    const registered = globalShortcut.register('CommandOrControl+Shift+W', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
      else showMainWindow();
    });
    if (!registered) log.warn('global quick-show shortcut unavailable');
    if (readPrefs().trayWeather) ensureTray();
    // One check a few seconds after launch, once the window has
    // settled and the weather is already on screen.
    if (readPrefs().autoCheckUpdates) setTimeout(() => checkForUpdates(), 6000);
    scheduleUpdateChecks();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => {
  clearInterval(periodicUpdateTimer);
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
