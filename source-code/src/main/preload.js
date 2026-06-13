const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  // ── Window Controls ──
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // ── Auth / Username ──
  getUsername: () => ipcRenderer.invoke('config:getUsername'),
  setUsername: (username) => ipcRenderer.invoke('config:setUsername', username),

  // ── Build Selection ──
  getSelectedBuild: () => ipcRenderer.invoke('config:getSelectedBuild'),
  setSelectedBuild: (build) => ipcRenderer.invoke('config:setSelectedBuild', build),

  // ── First Run ──
  isFirstRun: () => ipcRenderer.invoke('config:isFirstRun'),
  completeFirstRun: (data) => ipcRenderer.invoke('config:completeFirstRun', data),

  // ── Settings ──
  getSettings: () => ipcRenderer.invoke('config:getSettings'),
  setSettings: (settings) => ipcRenderer.invoke('config:setSettings', settings),

  // ── Install Directory ──
  getInstallDir: () => ipcRenderer.invoke('config:getInstallDir'),
  setInstallDir: (dir) => ipcRenderer.invoke('config:setInstallDir', dir),
  pickInstallDir: () => ipcRenderer.invoke('config:pickInstallDir'),

  // ── Remote Config (builds info) ──
  getVersion: () => ipcRenderer.invoke('launcher:getVersion'),
  fetchRemoteConfig: () => ipcRenderer.invoke('updater:fetchConfig'),
  parseMarkdown: (md) => ipcRenderer.invoke('utils:parseMarkdown', md),

  // ── Java ──
  checkJava: () => ipcRenderer.invoke('java:check'),

  // ── Game ──
  launchGame: (username) => ipcRenderer.invoke('game:launch', username),
  clearLibraries: () => ipcRenderer.invoke('game:clearLibraries'),

  onProgress: (callback) => {
    ipcRenderer.on('game:progress', (_event, data) => callback(data));
  },

  onGameExited: (callback) => {
    ipcRenderer.on('game:exited', () => callback());
  },

  // ── Updater ──
  forceUpdate: () => ipcRenderer.invoke('updater:forceUpdate'),

  // ── Download Control ──
  cancelDownload: () => ipcRenderer.send('download:cancel'),
  pauseDownload: () => ipcRenderer.send('download:pause'),
  resumeDownload: () => ipcRenderer.send('download:resume'),

  // ── Shell ──
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  // ── Debug ──
  debugUpdateLauncher: () => ipcRenderer.send('debug:updateLauncher'),
  debugClearCache: () => ipcRenderer.invoke('debug:clearCache'),
  debugOpenFolder: () => ipcRenderer.send('debug:openFolder'),

  // ── System Info ──
  getSystemRAM: () => ipcRenderer.invoke('system:getRAM'),

  // ── Server Query ──
  queryServer: () => ipcRenderer.invoke('server:query'),

  // ── Accounts ──
  getSavedAccounts: () => ipcRenderer.invoke('config:getSavedAccounts'),
  addSavedAccount: (username) => ipcRenderer.invoke('config:addSavedAccount', username),
  deleteSavedAccount: (username) => ipcRenderer.invoke('config:deleteSavedAccount', username),

  // ── Screenshots ──
  listScreenshots: () => ipcRenderer.invoke('screenshots:list'),
  readScreenshot: (filename) => ipcRenderer.invoke('screenshots:read', filename),
  deleteScreenshot: (filename) => ipcRenderer.invoke('screenshots:delete', filename),
  openScreenshotsFolder: () => ipcRenderer.send('screenshots:openFolder'),
  copyScreenshot: (filename) => ipcRenderer.invoke('screenshots:copy', filename),

  // ── Custom Build / Mod Manager ──
  getDisabledMods: () => ipcRenderer.invoke('config:getDisabledMods'),
  setDisabledMods: (mods) => ipcRenderer.invoke('config:setDisabledMods', mods),
  fetchFusionModList: () => ipcRenderer.invoke('mods:fetchFusionList'),
  applyDisabledMods: (mods) => ipcRenderer.invoke('mods:applyDisabled', mods)
});
