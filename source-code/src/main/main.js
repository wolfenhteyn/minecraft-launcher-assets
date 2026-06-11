const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const net = require('net');
const os = require('os');
const { exec } = require('child_process');
const ConfigManager = require('./config-manager');
const JavaChecker = require('./java-checker');
const GameLauncher = require('./game-launcher');
const Updater = require('./updater');
const DiscordRPC = require('./discord-rpc');

// Discord RPC configuration (change this ID if you register your own app on Discord)
const DISCORD_CLIENT_ID = '1506631553923416084';
let rpcClient = null;
let rpcStartTimestamp = Date.now();
let currentRpcState = 'idle'; // 'idle', 'launching', 'playing'
let rpcSelectedBuild = 'lite';
let rpcPlayerCountText = '';

// Read launcher version from package.json
const LAUNCHER_VERSION = require('../../package.json').version;

let mainWindow = null;
let configManager = null;
let gameLauncher = null;
let updater = null;

function updateDiscordPresence() {
  if (!rpcClient) return;

  const isTest = DISCORD_CLIENT_ID === '810516608447873024' || DISCORD_CLIENT_ID === '375630656040828928';
  const activity = {
    // Assets remain commented out until uploaded to Discord Developer Portal
    /*
    assets: {
      large_image: isTest ? 'top' : 'logo',
      large_text: 'Politime'
    },
    */
  };

  if (currentRpcState === 'idle') {
    activity.details = 'У лаунчері | Сайт: web.ptime.pp.ua';
    const buildNames = {
      lite: 'Lite збірка',
      medium: 'Medium збірка',
      hard: 'Hard збірка'
    };
    const buildLabel = buildNames[rpcSelectedBuild] || `Збірка: ${rpcSelectedBuild}`;

    const countPart = rpcPlayerCountText ? ` (${rpcPlayerCountText})` : '';
    activity.state = `${buildLabel}${countPart}`;

    activity.timestamps = {
      start: rpcStartTimestamp
    };
  } else if (currentRpcState === 'launching') {
    activity.details = 'Готується до гри | Сайт: web.ptime.pp.ua';
    activity.state = `Запуск збірки: ${rpcSelectedBuild}`;
    activity.timestamps = {
      start: rpcStartTimestamp
    };
  } else if (currentRpcState === 'playing') {
    activity.details = 'Грає на сервері | Сайт: web.ptime.pp.ua';
    activity.state = `Збірка: ${rpcSelectedBuild}`;
    activity.timestamps = {
      start: rpcStartTimestamp
    };
  }

  rpcClient.updateActivity(activity);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 580,
    minWidth: 960,
    minHeight: 580,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e17',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function sendProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game:progress', data);
  }
}

// ════════════════════════════════════════════════════
// Launcher self-update check
//   Fetches remote config, compares launcher_version
//   with our package.json version. If newer, downloads
//   the installer and runs it, then quits.
// ════════════════════════════════════════════════════
async function checkLauncherUpdate(forceUpdate = false) {
  try {
    console.log(`[Launcher] Current version: ${LAUNCHER_VERSION}`);

    // Fetch remote config
    await updater.fetchRemoteConfig();
    const remoteConfig = updater.getRemoteConfig();
    if (!remoteConfig) {
      console.log('[Launcher] Could not fetch remote config, skipping self-update check');
      return false;
    }

    const remoteVersion = remoteConfig.launcher_version;
    const launcherUrl = remoteConfig.launcher_url;

    if (!remoteVersion || !launcherUrl) {
      console.log('[Launcher] No launcher_version or launcher_url in remote config');
      return false;
    }

    console.log(`[Launcher] Remote version: ${remoteVersion}`);

    if (!forceUpdate && !isNewerVersion(remoteVersion, LAUNCHER_VERSION)) {
      console.log('[Launcher] Launcher is up to date');
      return false;
    }

    if (forceUpdate) {
      console.log(`[Launcher] Debug force update initiated!`);
    } else {
      console.log(`[Launcher] Update available: ${LAUNCHER_VERSION} → ${remoteVersion}`);
    }

    // Send update notification to renderer
    sendProgress({
      stage: 'launcher-update',
      percent: 0,
      message: `Завантаження нової версії лаунчера (v${remoteVersion})...`
    });

    // Download installer to temp/downloads folder
    const downloadsDir = app.getPath('downloads');
    const installerPath = path.join(downloadsDir, 'PolitimeLauncherSetup.exe');

    await updater.downloadFileWithProgress(launcherUrl, installerPath, (percent) => {
      sendProgress({
        stage: 'launcher-update',
        percent,
        message: `Завантаження оновлення: ${percent}%`
      });
    });

    sendProgress({
      stage: 'launcher-update',
      percent: 100,
      message: 'Запуск інсталятора...'
    });

    // Run the installer and quit — use spawn with shell:true so Windows
    // properly elevates / opens it without SmartScreen silently blocking it.
    const { spawn } = require('child_process');
    spawn('cmd.exe', ['/c', 'start', '', '/wait', installerPath], {
      detached: true,
      shell: false,
      stdio: 'ignore'
    }).unref();

    console.log('[Launcher] Installer launched, quitting in 2s...');
    setTimeout(() => {
      app.quit();
    }, 2000);

    return true; // update initiated
  } catch (err) {
    console.error('[Launcher] Self-update error:', err);
    return false;
  }
}

/**
 * Compare semver strings: returns true if remote > local
 */
function isNewerVersion(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

function setupIPC() {
  // ── Window Controls ──
  ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
  ipcMain.on('window:close', () => { if (mainWindow) mainWindow.close(); });

  // ── Config / Auth ──
  ipcMain.handle('config:getUsername', async () => configManager.get('username', ''));
  ipcMain.handle('config:setUsername', async (_e, username) => { configManager.set('username', username); return true; });

  // ── Config / Saved Accounts ──
  ipcMain.handle('config:getSavedAccounts', async () => {
    return configManager.get('accounts', []);
  });
  ipcMain.handle('config:addSavedAccount', async (_e, username) => {
    if (!username || typeof username !== 'string') return false;
    const name = username.trim();
    if (!name) return false;
    let list = configManager.get('accounts', []);
    if (!list.includes(name)) {
      list.push(name);
      configManager.set('accounts', list);
    }
    return true;
  });
  ipcMain.handle('config:deleteSavedAccount', async (_e, username) => {
    let list = configManager.get('accounts', []);
    list = list.filter(u => u !== username);
    configManager.set('accounts', list);
    return true;
  });

  // ── Screenshots ──
  ipcMain.handle('screenshots:list', async () => {
    try {
      const scrDir = path.join(configManager.getGameDir(), 'screenshots');
      if (!fs.existsSync(scrDir)) {
        return [];
      }
      const files = fs.readdirSync(scrDir);
      const list = [];
      for (const file of files) {
        const filePath = path.join(scrDir, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
          list.push({
            name: file,
            birthtime: stats.birthtimeMs || stats.mtimeMs,
            size: stats.size
          });
        }
      }
      list.sort((a, b) => b.birthtime - a.birthtime);
      return list;
    } catch (err) {
      console.error('[Screenshots] Failed to list:', err);
      return [];
    }
  });

  ipcMain.handle('screenshots:read', async (_e, filename) => {
    try {
      const filePath = path.join(configManager.getGameDir(), 'screenshots', filename);
      if (!fs.existsSync(filePath)) return null;
      
      const ext = path.extname(filename).toLowerCase();
      let mime = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      
      const data = fs.readFileSync(filePath);
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch (err) {
      console.error('[Screenshots] Failed to read:', err);
      return null;
    }
  });

  ipcMain.handle('screenshots:delete', async (_e, filename) => {
    try {
      const filePath = path.join(configManager.getGameDir(), 'screenshots', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Screenshots] Failed to delete:', err);
      return false;
    }
  });

  ipcMain.on('screenshots:openFolder', () => {
    const scrDir = path.join(configManager.getGameDir(), 'screenshots');
    if (!fs.existsSync(scrDir)) {
      fs.mkdirSync(scrDir, { recursive: true });
    }
    shell.openPath(scrDir);
  });

  ipcMain.handle('screenshots:copy', async (_e, filename) => {
    try {
      const filePath = path.join(configManager.getGameDir(), 'screenshots', filename);
      if (fs.existsSync(filePath)) {
        const image = nativeImage.createFromPath(filePath);
        clipboard.writeImage(image);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Screenshots] Failed to copy:', err);
      return false;
    }
  });

  // ── Build Selection ──
  ipcMain.handle('config:getSelectedBuild', async () => configManager.get('selectedBuild', ''));
  ipcMain.handle('config:setSelectedBuild', async (_e, build) => {
    configManager.set('selectedBuild', build);
    rpcSelectedBuild = build;
    updateDiscordPresence();
    return true;
  });

  // ── First Run ──
  ipcMain.handle('config:isFirstRun', async () => configManager.isFirstRun());
  ipcMain.handle('config:completeFirstRun', async (_e, data) => {
    if (data.username) configManager.set('username', data.username);
    if (data.build) {
      configManager.set('selectedBuild', data.build);
      rpcSelectedBuild = data.build;
      updateDiscordPresence();
    }
    configManager.completeFirstRun();
    return true;
  });

  // ── Launcher version ──
  ipcMain.handle('launcher:getVersion', async () => LAUNCHER_VERSION);

  // ── Markdown Parser ──
  ipcMain.handle('utils:parseMarkdown', async (_e, md) => {
    const { marked } = await import('marked');
    return marked.parse(md);
  });

  // ── Settings ──
  ipcMain.handle('config:getSettings', async () => ({
    ramMin: configManager.get('ram.min', 2),
    ramMax: configManager.get('ram.max', 4),
    javaPath: configManager.get('javaPath', ''),
    gameDir: configManager.getGameDir(),
    selectedBuild: configManager.get('selectedBuild', 'lite'),
    installDir: configManager.get('installDir', '')
  }));

  ipcMain.handle('config:setSettings', async (_e, settings) => {
    if (settings.ramMin !== undefined) configManager.set('ram.min', settings.ramMin);
    if (settings.ramMax !== undefined) configManager.set('ram.max', settings.ramMax);
    if (settings.javaPath !== undefined) configManager.set('javaPath', settings.javaPath);
    if (settings.selectedBuild !== undefined) configManager.set('selectedBuild', settings.selectedBuild);
    if (settings.installDir !== undefined) configManager.setInstallDir(settings.installDir);
    return true;
  });

  // ── Install Directory Picker ──
  ipcMain.handle('config:pickInstallDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Оберіть папку для встановлення Minecraft',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // ── Download Control ──
  ipcMain.on('download:cancel', () => updater.cancel());
  ipcMain.on('download:pause', () => updater.pause());
  ipcMain.on('download:resume', () => updater.resume());

  // ── Remote Config ──
  ipcMain.handle('updater:fetchConfig', async () => {
    try {
      const config = await updater.fetchRemoteConfig();
      return { success: true, config };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Java Check ──
  ipcMain.handle('java:check', async () => {
    const customPath = configManager.get('javaPath', '');
    return await JavaChecker.findJava(customPath);
  });

  // ── Game Launch ──
  ipcMain.handle('game:clearLibraries', async () => {
    try {
      const gameDir = configManager.getGameDir();
      const targets = [
        path.join(gameDir, 'libraries'),
        path.join(gameDir, 'versions'),
        path.join(gameDir, 'forge-installer.jar')
      ];
      for (const t of targets) {
        if (fs.existsSync(t)) {
          fs.rmSync(t, { recursive: true, force: true });
        }
      }
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('game:launch', async (_e, username) => {
    try {
      configManager.set('username', username);
      if (username) {
        const name = username.trim();
        if (name) {
          let list = configManager.get('accounts', []);
          if (!list.includes(name)) {
            list.push(name);
            configManager.set('accounts', list);
          }
        }
      }
      rpcSelectedBuild = configManager.get('selectedBuild', 'lite');
      currentRpcState = 'launching';

      rpcStartTimestamp = Date.now();
      updateDiscordPresence();

      // Check Java
      const customJavaPath = configManager.get('javaPath', '');
      let javaResult = await JavaChecker.findJava(customJavaPath);

      if (!javaResult.found || javaResult.score < 80) {
        sendProgress({ stage: 'java', percent: 0, message: 'Оптимальна Java не знайдена. Завантаження Java 17...' });
        await updater.fetchRemoteConfig();
        await updater.installJava(sendProgress);
        javaResult = await JavaChecker.findJava('');

        if (!javaResult.found) {
          return { success: false, error: 'Помилка встановлення Java. Встановіть Java 17+ вручну або вкажіть шлях у налаштуваннях.' };
        }
      }

      // Get selected build — THIS is the build user chose in the UI right now
      const selectedBuild = configManager.get('selectedBuild', 'lite');

      // Check for updates / install forge + modpack
      // Pass the selectedBuild — updater will handle switching if needed
      sendProgress({ stage: 'update', percent: 0, message: 'Перевірка оновлень...' });
      await updater.checkAndUpdate(selectedBuild, javaResult.path, sendProgress);

      // Get loader (NeoForge/Forge) version from remote config
      const remoteConfig = updater.getRemoteConfig();
      const forgeUrl = remoteConfig?.forge_url || '';
      const isNeoForge = /neoforge/i.test(forgeUrl);
      let forgeVersion = '';
      if (isNeoForge) {
        const m = forgeUrl.match(/neoforge-([\d.]+)-installer/);
        forgeVersion = m ? m[1] : '';
      } else {
        const m = forgeUrl.match(/forge-[\d.]+-([\d.]+)/);
        forgeVersion = m ? m[1] : '';
      }

      // Launch the game
      sendProgress({ stage: 'launch', percent: 0, message: 'Запуск Minecraft...' });

      const config = configManager.getAll();
      await gameLauncher.launch({
        username,
        javaPath: javaResult.path,
        gameDir: configManager.getGameDir(),
        ramMin: config.ram?.min || 2,
        ramMax: config.ram?.max || 4,
        version: remoteConfig?.minecraft_version || '1.21.1',
        forgeVersion: forgeVersion,
        serverHost: 'ptime.pp.ua',
        serverPort: '20001',
        onProgress: sendProgress
      });

      // Hide launcher
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }

      currentRpcState = 'playing';
      rpcStartTimestamp = Date.now();
      updateDiscordPresence();

      return { success: true };
    } catch (err) {
      console.error('Launch error:', err);
      currentRpcState = 'idle';
      rpcStartTimestamp = Date.now();
      updateDiscordPresence();
      if (err.message === 'DOWNLOAD_CANCELLED') {
        // User cancelled — reset UI cleanly
        return { success: false, error: 'CANCELLED' };
      }
      return { success: false, error: err.message || 'Невідома помилка запуску' };
    }
  });

  ipcMain.on('game:closed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  });

  // ── Force Update ──
  ipcMain.handle('updater:forceUpdate', async () => {
    try {
      const selectedBuild = configManager.get('selectedBuild', 'lite');
      const customJavaPath = configManager.get('javaPath', '');
      const javaResult = await JavaChecker.findJava(customJavaPath);
      if (!javaResult.found) {
        return { success: false, error: 'Java не знайдена' };
      }
      await updater.forceUpdate(selectedBuild, javaResult.path, sendProgress);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Debug ──
  ipcMain.on('debug:updateLauncher', () => {
    checkLauncherUpdate(true);
  });

  ipcMain.handle('debug:clearCache', async () => {
    try {
      const gameDir = configManager.getGameDir();
      if (fs.existsSync(gameDir)) {
        fs.rmSync(gameDir, { recursive: true, force: true });
      }
      setTimeout(() => app.quit(), 500);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  });

  ipcMain.on('debug:openFolder', () => {
    shell.openPath(configManager.getGameDir());
  });

  // ── Shell ──
  ipcMain.on('shell:openExternal', (_e, url) => shell.openExternal(url));

  // ── System Info ──
  ipcMain.handle('system:getRAM', async () => {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    return {
      totalGB: Math.round(totalBytes / (1024 * 1024 * 1024) * 10) / 10,
      freeGB: Math.round(freeBytes / (1024 * 1024 * 1024) * 10) / 10
    };
  });

  // ── Server Query (Minecraft SLP) ──
  ipcMain.handle('server:query', async () => {
    return new Promise((resolve) => {
      const host = 'ptime.pp.ua';
      const port = 20001;
      const timeout = 5000;

      try {
        const socket = net.createConnection({ host, port, timeout }, () => {
          // Handshake packet
          const hostBuf = Buffer.from(host, 'utf8');
          const dataLength = 1 + varintSize(47) + varintSize(hostBuf.length) + hostBuf.length + 2 + 1;
          const handshake = Buffer.alloc(varintSize(dataLength) + dataLength);
          let offset = 0;
          offset = writeVarint(handshake, dataLength, offset);
          offset = writeVarint(handshake, 0x00, offset); // packet id
          offset = writeVarint(handshake, 47, offset);    // protocol version
          offset = writeVarint(handshake, hostBuf.length, offset);
          hostBuf.copy(handshake, offset); offset += hostBuf.length;
          handshake.writeUInt16BE(port, offset); offset += 2;
          offset = writeVarint(handshake, 1, offset); // next state = status

          // Status request packet
          const statusReq = Buffer.from([0x01, 0x00]);

          socket.write(handshake);
          socket.write(statusReq);

          let receivedData = Buffer.alloc(0);

          socket.on('data', (chunk) => {
            receivedData = Buffer.concat([receivedData, chunk]);

            try {
              let off = 0;
              const { value: packetLen, size: s1 } = readVarint(receivedData, off); off += s1;
              if (receivedData.length < off + packetLen) return; // wait for more data

              const { size: s2 } = readVarint(receivedData, off); off += s2; // packet id
              const { value: strLen, size: s3 } = readVarint(receivedData, off); off += s3;
              const jsonStr = receivedData.slice(off, off + strLen).toString('utf8');

              socket.destroy();

              const parsed = JSON.parse(jsonStr);
              const onlineCount = parsed.players?.online || 0;
              const maxCount = parsed.players?.max || 0;
              rpcPlayerCountText = `Онлайн: ${onlineCount} / ${maxCount}`;
              updateDiscordPresence();

              const players = parsed.players?.sample || [];
              resolve({
                online: onlineCount,
                max: maxCount,
                players: players.map(p => ({ name: p.name, uuid: p.id })),
                motd: typeof parsed.description === 'string' ? parsed.description : (parsed.description?.text || ''),
                success: true
              });
            } catch (e) {
              // not enough data yet, wait
            }
          });
        });

        socket.on('timeout', () => { socket.destroy(); resolve({ success: false, online: 0, max: 0, players: [] }); });
        socket.on('error', () => { socket.destroy(); resolve({ success: false, online: 0, max: 0, players: [] }); });
      } catch (e) {
        resolve({ success: false, online: 0, max: 0, players: [] });
      }
    });
  });
}

// ── Varint helpers for Minecraft protocol ──
function writeVarint(buf, value, offset) {
  while (true) {
    if ((value & ~0x7F) === 0) { buf[offset++] = value; return offset; }
    buf[offset++] = (value & 0x7F) | 0x80;
    value >>>= 7;
  }
}
function readVarint(buf, offset) {
  let value = 0, size = 0, b;
  do {
    b = buf[offset + size];
    value |= (b & 0x7F) << (7 * size);
    size++;
  } while ((b & 0x80) !== 0);
  return { value, size };
}
function varintSize(value) {
  let size = 0;
  do { value >>>= 7; size++; } while (value !== 0);
  return size;
}

app.whenReady().then(async () => {
  configManager = new ConfigManager();
  gameLauncher = new GameLauncher(mainWindow, configManager);
  updater = new Updater(configManager);

  createWindow();
  setupIPC();

  gameLauncher.setWindow(mainWindow);

  // Initialize Discord RPC
  try {
    rpcClient = new DiscordRPC(DISCORD_CLIENT_ID);
    rpcSelectedBuild = configManager.get('selectedBuild', 'lite');
    rpcClient.connect();

    rpcClient.on('ready', () => {
      console.log('[Discord RPC] Session is ready!');
      updateDiscordPresence();
    });
  } catch (err) {
    console.error('[Discord RPC] Failed to init:', err);
  }

  gameLauncher.on('game-exited', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('game:exited');
    }

    currentRpcState = 'idle';
    rpcStartTimestamp = Date.now();
    updateDiscordPresence();
  });

  // ── Self-update check (runs after window is ready) ──
  mainWindow.webContents.on('did-finish-load', async () => {
    const updating = await checkLauncherUpdate();
    if (updating) {
      // Launcher is updating, UI is blocked, app will quit soon
      return;
    }
  });
});

app.on('window-all-closed', () => app.quit());
