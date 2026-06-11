const { Client, Authenticator } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');

// Track MCLC download state and active requests
let isPaused = false;
let isCancelled = false;
const activeDownloads = new Set();

// Register IPC listeners for MCLC download controls
if (ipcMain) {
  ipcMain.on('download:pause', () => {
    isPaused = true;
    for (const dl of activeDownloads) {
      if (dl.req) {
        try {
          dl.req.pause();
        } catch (e) {
          console.error('[Launcher Patch] Failed to pause request:', e);
        }
      }
    }
  });

  ipcMain.on('download:resume', () => {
    isPaused = false;
    for (const dl of activeDownloads) {
      if (dl.req) {
        try {
          dl.req.resume();
        } catch (e) {
          console.error('[Launcher Patch] Failed to resume request:', e);
        }
      }
      if (dl.resumeResolve) {
        dl.resumeResolve();
      }
    }
  });

  ipcMain.on('download:cancel', () => {
    isCancelled = true;
    isPaused = false;
    for (const dl of activeDownloads) {
      if (dl.req) {
        try {
          dl.req.abort();
        } catch (e) {
          console.error('[Launcher Patch] Failed to abort request:', e);
        }
      }
      if (dl.reject) {
        dl.reject(new Error('DOWNLOAD_CANCELLED'));
      }
    }
    activeDownloads.clear();
  });
}

// Monkey-patch Handler.prototype.downloadAsync
const originalDownloadAsync = Handler.prototype.downloadAsync;

Handler.prototype.downloadAsync = function (url, directory, name, retry, type) {
  if (isCancelled) {
    return Promise.reject(new Error('DOWNLOAD_CANCELLED'));
  }

  const self = this;
  const originalBaseRequest = this.baseRequest;

  return new Promise((resolve, reject) => {
    const dlState = {
      req: null,
      resumeResolve: null,
      reject: reject
    };

    activeDownloads.add(dlState);

    const cleanup = () => {
      self.baseRequest = originalBaseRequest;
      activeDownloads.delete(dlState);
    };

    const runDownload = async () => {
      if (isCancelled) {
        cleanup();
        reject(new Error('DOWNLOAD_CANCELLED'));
        return;
      }

      if (isPaused) {
        await new Promise(res => {
          dlState.resumeResolve = res;
        });
        dlState.resumeResolve = null;
      }

      if (isCancelled) {
        cleanup();
        reject(new Error('DOWNLOAD_CANCELLED'));
        return;
      }

      // Temporarily override baseRequest synchronously to capture the request instance
      self.baseRequest = function (...args) {
        const req = originalBaseRequest.apply(self, args);
        dlState.req = req;
        if (isPaused) {
          req.pause();
        }
        return req;
      };

      try {
        const originalPromise = originalDownloadAsync.call(self, url, directory, name, retry, type);
        
        // Restore baseRequest immediately after calling the synchronous setup portion of downloadAsync
        self.baseRequest = originalBaseRequest;

        originalPromise
          .then((result) => {
            cleanup();
            if (isCancelled) {
              reject(new Error('DOWNLOAD_CANCELLED'));
            } else {
              resolve(result);
            }
          })
          .catch((err) => {
            cleanup();
            if (isCancelled) {
              reject(new Error('DOWNLOAD_CANCELLED'));
            } else {
              reject(err);
            }
          });
      } catch (err) {
        self.baseRequest = originalBaseRequest;
        cleanup();
        reject(err);
      }
    };

    runDownload();
  });
};

class GameLauncher extends EventEmitter {
  constructor(window, configManager) {
    super();
    this.window = window;
    this.configManager = configManager;
    this.client = new Client();
    this.isRunning = false;
  }

  setWindow(window) {
    this.window = window;
  }

  /**
   * Launch Minecraft with the given options
   */
  async launch(options) {
    if (this.isRunning) {
      throw new Error('Гра вже запущена');
    }

    const {
      username,
      javaPath,
      gameDir,
      ramMin,
      ramMax,
      version,
      forgeVersion,
      serverHost,
      serverPort,
      onProgress
    } = options;

    // Create offline auth
    const auth = Authenticator.getAuth(username);

    // Pre-populate servers.dat if it doesn't exist
    const serversDatPath = path.join(gameDir, 'servers.dat');
    if (!fs.existsSync(serversDatPath)) {
      // Base64 of a basic servers.dat containing 'Politime' (ptime.pp.ua)
      const serversB64 = 'CgAACQAHc2VydmVycwoAAAABCAAEbmFtZQAIUG9saXRpbWUIAAJpcAALcHRpbWUucHAudWEBAA5hY2NlcHRUZXh0dXJlcwEAAA==';
      try {
        fs.writeFileSync(serversDatPath, Buffer.from(serversB64, 'base64'));
        console.log('[MC] Created default servers.dat');
      } catch (e) {
        console.error('[MC] Failed to create servers.dat:', e);
      }
    }

    // Build launch options
    const launchOpts = {
      authorization: auth,
      root: gameDir,
      version: {
        number: version,
        type: 'release'
      },
      memory: {
        max: `${ramMax}G`,
        min: `${ramMin}G`
      },
      javaPath: javaPath,
      overrides: {
        detached: false
      }
    };

    // Pass NeoForge/Forge installer jar to MCLC — it handles both formats for 1.17+
    if (forgeVersion) {
      const forgeInstallerPath = path.join(gameDir, 'forge-installer.jar');
      if (fs.existsSync(forgeInstallerPath)) {
        launchOpts.forge = forgeInstallerPath;
        console.log('[MC] Passing NeoForge/Forge installer to MCLC:', forgeInstallerPath);
      } else {
        console.log('[MC] NeoForge/Forge installer not found, launching vanilla. Expected:', forgeInstallerPath);
      }
    }

    // Add server auto-connect
    if (serverHost) {
      launchOpts.server = {
        host: serverHost,
        port: serverPort || '20001'
      };
    }

    // Set up event listeners
    this.client.on('debug', (e) => {
      console.log('[MC Debug]', e);
    });

    this.client.on('data', (e) => {
      console.log('[MC Data]', e);
    });

    this.client.on('progress', (e) => {
      if (onProgress) {
        onProgress({
          stage: 'download',
          percent: Math.round((e.task / e.total) * 100),
          message: `Завантаження: ${e.type} (${e.task}/${e.total})`
        });
      }
    });

    this.client.on('download-status', (e) => {
      if (onProgress) {
        onProgress({
          stage: 'download',
          percent: Math.round((e.current / e.total) * 100),
          message: `Завантаження файлів: ${e.name}`
        });
      }
    });

    this.client.on('arguments', (e) => {
      console.log('[MC Args]', e);
      if (onProgress) {
        onProgress({
          stage: 'launch',
          percent: 100,
          message: 'Гру запущено!'
        });
      }
    });

    this.client.on('close', (exitCode) => {
      console.log('[MC] Game closed with exit code:', exitCode);
      this.isRunning = false;
      this.emit('game-exited', exitCode);
    });

    // Reset MCLC download control state
    isCancelled = false;
    isPaused = false;
    activeDownloads.clear();

    // Launch
    this.isRunning = true;
    
    if (onProgress) {
      onProgress({
        stage: 'launch',
        percent: 10,
        message: 'Підготовка до запуску...'
      });
    }

    try {
      const proc = await this.client.launch(launchOpts);
      if (isCancelled) {
        throw new Error('DOWNLOAD_CANCELLED');
      }
      if (!proc) {
        throw new Error('Не вдалося запустити гру (перевірте логи)');
      }
    } catch (err) {
      this.isRunning = false;
      throw err;
    }
  }
}

module.exports = GameLauncher;
