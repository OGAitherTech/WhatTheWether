/* preload.js — the only bridge between the page and the desktop.

   The window runs with contextIsolation on and nodeIntegration off,
   so the app itself has no access to Node. This exposes a small,
   named surface and nothing else: the page can ask about updates and
   set desktop preferences, and it cannot reach the file system, spawn
   anything, or require a module.

   Every channel here is one the renderer initiates. Nothing accepts a
   path, a URL or a command from the page. */
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_EVENTS = ['update-status', 'desktop-command'];

contextBridge.exposeInMainWorld('aitherDesktop', {
  // Marks the build as the desktop one. The web app reads this to
  // switch on the things only a desktop can do.
  isDesktop: true,
  platform: process.platform,
  version: () => ipcRenderer.invoke('app:version'),

  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    state: () => ipcRenderer.invoke('update:state'),
  },

  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (patch) => ipcRenderer.invoke('prefs:set', patch),
  },

  // A tray label the browser cannot draw: the current temperature
  // beside the system clock.
  setTrayWeather: (info) => ipcRenderer.invoke('tray:weather', info),

  // Native notifications, which do not need the page to be open.
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // A fixed allow-listed set of window actions. No dimensions, paths,
  // URLs, shell commands, or arbitrary IPC channels cross this bridge.
  window: {
    show: () => ipcRenderer.invoke('window:command', 'show'),
    hide: () => ipcRenderer.invoke('window:command', 'hide'),
    toggleCompact: () => ipcRenderer.invoke('window:command', 'toggle-compact'),
    toggleMaximize: () => ipcRenderer.invoke('window:command', 'toggle-maximize'),
    zoomIn: () => ipcRenderer.invoke('window:command', 'zoom-in'),
    zoomOut: () => ipcRenderer.invoke('window:command', 'zoom-out'),
    zoomReset: () => ipcRenderer.invoke('window:command', 'zoom-reset'),
  },

  on: (event, handler) => {
    if (!ALLOWED_EVENTS.includes(event) || typeof handler !== 'function') return () => {};
    const wrapped = (_e, payload) => handler(payload);
    ipcRenderer.on(event, wrapped);
    return () => ipcRenderer.removeListener(event, wrapped);
  },
});
