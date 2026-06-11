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
        try { dl.req.pause(); } catch (e) {}
      }
    }
  });

  ipcMain.on('download:resume', () => {
    isPaused = false;
    for (const dl of activeDownloads) {
      if (dl.req) {
        try { dl.req.resume(); } catch (e) {}
      }
      if (dl.resumeResolve) dl.resumeResolve();
    }
  });

  ipcMain.on('download:cancel', () => {
    isCancelled = true;
    isPaused = false;
    for (const dl of activeDownloads) {
      if (dl.req) {
        try { dl.req.abort(); } catch (e) {}
      }
      if (dl.reject) dl.reject(new Error('DOWNLOAD_CANCELLED'));
    }
    activeDownloads.clear();
  });
}

// Monkey-patch Handler.prototype.downloadAsync
const originalDownloadAsync = Handler.prototype.downloadAsync;

Handler.prototype.downloadAsync = function (url, directory, name, retry, type) {
  if (isCancelled) return Promise.reject(new Error('DOWNLOAD_CANCELLED'));

  const self = this;
  const originalBaseRequest = this.baseRequest;

  return new Promise((resolve, reject) => {
    const dlState = { req: null, resumeResolve: null, reject: reject };
    activeDownloads.add(dlState);

    const cleanup = () => {
      self.baseRequest = originalBaseRequest;
      activeDownloads.delete(dlState);
    };

    const runDownload = async () => {
      if (isCancelled) { cleanup(); return reject(new Error('DOWNLOAD_CANCELLED')); }

      if (isPaused) {
        await new Promise(res => { dlState.resumeResolve = res; });
        dlState.resumeResolve = null;
      }

      if (isCancelled) { cleanup(); return reject(new Error('DOWNLOAD_CANCELLED')); }

      self.baseRequest = function (...args) {
        const req = originalBaseRequest.apply(self, args);
        dlState.req = req;
        if (isPaused) req.pause();
        return req;
      };

      try {
        const originalPromise = originalDownloadAsync.call(self, url, directory, name, retry, type);
        self.baseRequest = originalBaseRequest;

        originalPromise
          .then((result) => {
            cleanup();
            isCancelled ? reject(new Error('DOWNLOAD_CANCELLED')) : resolve(result);
          })
          .catch((err) => {
            cleanup();
            isCancelled ? reject(new Error('DOWNLOAD_CANCELLED')) : reject(err);
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

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  _getNeoForgeJvmArgs(gameDir, forgeVersion) {
    try {
      const neoJsonPath = path.join(gameDir, 'versions', forgeVersion, `${forgeVersion}.json`);
      if (!fs.existsSync(neoJsonPath)) return [];
      const neo = JSON.parse(fs.readFileSync(neoJsonPath, 'utf8'));
      if (!neo.arguments || !neo.arguments.jvm) return [];

      const vars = {
        '${version_name}': forgeVersion,
        '${library_directory}': path.join(gameDir, 'libraries'),
        '${classpath_separator}': path.delimiter
      };

      return neo.arguments.jvm
        .filter(arg => typeof arg === 'string') // Ignore rule-based objects
        .map(arg => arg.replace(/\$\{[^}]+\}/g, match => vars[match] || match));
    } catch (e) {
      console.error('[Launcher] Failed to parse NeoForge JVM args:', e);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Main Launch Router
  // ─────────────────────────────────────────────────────────────────
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

    // Pre-populate servers.dat if it doesn't exist
    const serversDatPath = path.join(gameDir, 'servers.dat');
    if (!fs.existsSync(serversDatPath)) {
      const serversB64 = 'CgAACQAHc2VydmVycwoAAAABCAAEbmFtZQAIUG9saXRpbWUIAAJpcAALcHRpbWUucHAudWEBAA5hY2NlcHRUZXh0dXJlcwEAAA==';
      try {
        fs.writeFileSync(serversDatPath, Buffer.from(serversB64, 'base64'));
      } catch (e) {}
    }

    if (onProgress) {
      onProgress({ stage: 'launch', percent: 10, message: 'Підготовка до запуску...' });
    }

    this.isRunning = true;

    try {
      const auth = Authenticator.getAuth(username);
      
      let mclcForgePath = null;
      let finalVersionConfig = {
        number: version,
        type: 'release'
      };

      if (forgeVersion) {
        if (forgeVersion.includes('neoforge')) {
          finalVersionConfig.custom = forgeVersion;
          console.log('[MC] Using MCLC directly for NeoForge:', forgeVersion);
        } else {
          // Old Forge: MCLC expects vanilla version number + forge installer path
          const forgeInstallerPath = path.join(gameDir, 'forge-installer.jar');
          if (fs.existsSync(forgeInstallerPath)) {
            mclcForgePath = forgeInstallerPath;
            console.log('[MC] Passing Forge installer to MCLC:', forgeInstallerPath);
          }
        }
      }

      let finalCustomArgs = [
        '-Dsun.rmi.transport.tcp.responseTimeout=2000',
        '--add-modules', 'jdk.incubator.vector',
        '--add-exports', 'java.base/sun.security.util=ALL-UNNAMED',
        '--add-opens', 'java.base/java.util.jar=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
        '--add-opens', 'java.base/java.util=ALL-UNNAMED',
        '--add-opens', 'java.base/java.net=ALL-UNNAMED',
        '--add-opens', 'java.base/java.nio=ALL-UNNAMED',
        '--add-opens', 'java.base/jdk.internal.misc=ALL-UNNAMED'
      ];

      if (forgeVersion && forgeVersion.includes('neoforge')) {
        const neoArgs = this._getNeoForgeJvmArgs(gameDir, forgeVersion);
        finalCustomArgs = finalCustomArgs.concat(neoArgs);
        console.log('[MC] Injected NeoForge JVM arguments:', neoArgs.length);
      }

      const launchOpts = {
        authorization: auth,
        root: gameDir,
        version: finalVersionConfig,
        memory: {
          max: `${ramMax}G`,
          min: `${ramMin}G`
        },
        javaPath: javaPath,
        customArgs: finalCustomArgs,
        overrides: {
          detached: false
        }
      };

      if (mclcForgePath) launchOpts.forge = mclcForgePath;

      if (serverHost) {
        launchOpts.server = {
          host: serverHost,
          port: serverPort || '20001'
        };
      }

      // Set up MCLC event listeners
      this.client.on('debug', (e) => { console.log('[MC Debug]', e); });
      this.client.on('data',  (e) => { console.log('[MC Data]',  e); });

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
          onProgress({ stage: 'launch', percent: 100, message: 'Гру запущено!' });
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

      const proc = await this.client.launch(launchOpts);
      if (isCancelled) throw new Error('DOWNLOAD_CANCELLED');
      if (!proc) throw new Error('Не вдалося запустити гру (перевірте логи)');

    } catch (err) {
      this.isRunning = false;
      throw err;
    }
  }
}

module.exports = GameLauncher;
