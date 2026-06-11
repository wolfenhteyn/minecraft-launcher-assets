const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

const REMOTE_CONFIG_URL = 'https://raw.githubusercontent.com/wolfenhteyn/minecraft-launcher-assets/main/version.json';
const MOJANG_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

class Updater {
  constructor(configManager) {
    this.configManager = configManager;
    this.remoteConfigUrl = REMOTE_CONFIG_URL;
    this.remoteConfig = null;
    this.localConfigPath = path.join(configManager.getGameDir(), 'remote-config.json');

    // Download control
    this._cancelled = false;
    this._paused = false;
    this._pauseResolvers = [];

    this.loadCachedConfig();
  }

  // ── Download control ──
  cancel() {
    this._cancelled = true;
    this._paused = false;
    this._pauseResolvers.forEach(r => r());
    this._pauseResolvers = [];
  }

  pause() {
    if (!this._cancelled) this._paused = true;
  }

  resume() {
    this._paused = false;
    this._pauseResolvers.forEach(r => r());
    this._pauseResolvers = [];
  }

  resetState() {
    this._cancelled = false;
    this._paused = false;
    this._pauseResolvers = [];
  }

  _checkCancelled() {
    if (this._cancelled) throw new Error('DOWNLOAD_CANCELLED');
  }

  _waitIfPaused() {
    if (!this._paused) return Promise.resolve();
    return new Promise(resolve => this._pauseResolvers.push(resolve));
  }

  loadCachedConfig() {
    try {
      if (fs.existsSync(this.localConfigPath)) {
        const data = fs.readFileSync(this.localConfigPath, 'utf8');
        this.remoteConfig = JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load cached remote config:', err);
    }
  }

  saveCachedConfig() {
    try {
      fs.writeFileSync(this.localConfigPath, JSON.stringify(this.remoteConfig, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save cached remote config:', err);
    }
  }

  getRemoteConfig() {
    return this.remoteConfig;
  }

  // ────────────────────────────────────────────────────
  // Fetch version.json from GitHub
  // ────────────────────────────────────────────────────
  async fetchRemoteConfig() {
    return new Promise((resolve, reject) => {
      const protocol = this.remoteConfigUrl.startsWith('https') ? https : http;

      protocol.get(this.remoteConfigUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'PolitimeLauncher/1.0' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._fetchUrl(res.headers.location).then(data => {
            try {
              this.remoteConfig = JSON.parse(data);
              this.saveCachedConfig();
              resolve(this.remoteConfig);
            } catch (e) { reject(new Error('Невалідний JSON з сервера')); }
          }).catch(() => resolve(this.remoteConfig));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            this.remoteConfig = JSON.parse(data);
            this.saveCachedConfig();
            resolve(this.remoteConfig);
          } catch (err) {
            reject(new Error('Невалідний JSON з сервера конфігурації'));
          }
        });
      }).on('error', (err) => {
        console.error('Failed to fetch remote config:', err);
        resolve(this.remoteConfig);
      });
    });
  }

  // ────────────────────────────────────────────────────
  // Prepare vanilla Minecraft installation
  //   Downloads version JSON + JAR from Mojang and
  //   creates launcher_profiles.json so Forge installer
  //   can find a valid Minecraft installation.
  // ────────────────────────────────────────────────────
  async prepareVanillaInstallation(mcVersion, onProgress) {
    const gameDir = this.configManager.getGameDir();
    const versionsDir = path.join(gameDir, 'versions', mcVersion);
    const versionJsonPath = path.join(versionsDir, `${mcVersion}.json`);
    const versionJarPath = path.join(versionsDir, `${mcVersion}.jar`);
    const profilesPath = path.join(gameDir, 'launcher_profiles.json');

    // Check if vanilla is already prepared
    let isVanillaReady = false;
    try {
      if (fs.existsSync(versionJsonPath) && fs.existsSync(versionJarPath) && fs.existsSync(profilesPath)) {
        const jarSize = fs.statSync(versionJarPath).size;
        if (jarSize > 5 * 1024 * 1024) {
          isVanillaReady = true;
        } else {
          console.log(`[Updater] Vanilla JAR exists but is too small (${jarSize} bytes). Re-downloading.`);
          try { fs.unlinkSync(versionJarPath); } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[Updater] Error during vanilla ready check:', err);
    }

    if (isVanillaReady) {
      console.log('[Updater] Vanilla Minecraft already prepared');
      onProgress({ stage: 'vanilla', percent: 100, message: 'Ванільний Minecraft готовий' });
      return;
    }

    // Ensure directories exist
    fs.mkdirSync(versionsDir, { recursive: true });

    // 1. Create launcher_profiles.json (Forge installer requires this)
    if (!fs.existsSync(profilesPath)) {
      const profiles = {
        profiles: {
          "(Default)": {
            name: "(Default)",
            type: "latest-release",
            lastVersionId: mcVersion
          }
        },
        selectedProfile: "(Default)",
        clientToken: crypto.randomUUID()
      };
      fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2), 'utf8');
      console.log('[Updater] Created launcher_profiles.json');
    }

    // 2. Download version manifest from Mojang
    onProgress({ stage: 'vanilla', percent: 5, message: 'Завантаження маніфесту версій...' });
    let manifestData;
    try {
      manifestData = await this._fetchUrl(MOJANG_VERSION_MANIFEST);
    } catch (err) {
      throw new Error('Не вдалося завантажити маніфест версій Mojang: ' + err.message);
    }

    const manifest = JSON.parse(manifestData);
    const versionEntry = manifest.versions.find(v => v.id === mcVersion);
    if (!versionEntry) {
      throw new Error(`Версія ${mcVersion} не знайдена в маніфесті Mojang`);
    }

    // 3. Download version JSON
    if (!fs.existsSync(versionJsonPath)) {
      onProgress({ stage: 'vanilla', percent: 15, message: `Завантаження ${mcVersion}.json...` });
      const versionJsonData = await this._fetchUrl(versionEntry.url);
      fs.writeFileSync(versionJsonPath, versionJsonData, 'utf8');
      console.log('[Updater] Downloaded version JSON:', mcVersion);
    }

    // 4. Download version JAR (client)
    if (!fs.existsSync(versionJarPath)) {
      const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      const clientUrl = versionJson.downloads?.client?.url;
      if (!clientUrl) {
        throw new Error(`URL для клієнта ${mcVersion} не знайдено в version JSON`);
      }

      // vanilla.jar maps to global 5-24%
      onProgress({ stage: 'vanilla', percent: 5, message: `Завантаження ${mcVersion}.jar...` });
      await this.downloadFileWithProgress(clientUrl, versionJarPath, (pct, eta) => {
        onProgress({ stage: 'vanilla', percent: 5 + Math.round(pct * 0.19), message: `Завантаження клієнта: ${pct}%`, eta });
      });
      this._checkCancelled();
      console.log('[Updater] Downloaded version JAR:', mcVersion);
    }

    onProgress({ stage: 'vanilla', percent: 25, message: 'Ванільний Minecraft підготовлено!' });
  }

  // ────────────────────────────────────────────────────
  // Install NeoForge / Forge (after vanilla is ready)
  // Supports both:
  //   Forge:    forge-1.21.1-XX.X.XXX-installer.jar  → versions/1.21.1-forge-XX.X.XXX
  //   NeoForge: neoforge-21.1.XXX-installer.jar      → versions/1.21.1-neoforge-21.1.XXX
  // ────────────────────────────────────────────────────
  async installForge(javaPath, onProgress) {
    const gameDir = this.configManager.getGameDir();
    const forgeUrl = this.remoteConfig?.forge_url;
    if (!forgeUrl) {
      console.log('[Updater] No forge_url in config, skipping NeoForge/Forge install');
      return;
    }

    const mcVersion = this.remoteConfig.minecraft_version || '1.21.1';

    // Detect NeoForge vs Forge by URL filename
    const isNeoForge = /neoforge/i.test(forgeUrl);
    let loaderVersion = '';
    let versionDirName = '';

    if (isNeoForge) {
      // neoforge-21.1.232-installer.jar → loaderVersion = '21.1.232'
      const m = forgeUrl.match(/neoforge-([\d.]+)-installer/);
      loaderVersion = m ? m[1] : '';
      versionDirName = loaderVersion ? `${mcVersion}-neoforge-${loaderVersion}` : '';
      console.log(`[Updater] Detected NeoForge ${loaderVersion} for MC ${mcVersion}`);
    } else {
      // forge-1.21.1-XX.X.XXX-installer.jar → loaderVersion = 'XX.X.XXX'
      const m = forgeUrl.match(/forge-[\d.]+-([\d.]+)/);
      loaderVersion = m ? m[1] : '';
      versionDirName = loaderVersion ? `${mcVersion}-forge-${loaderVersion}` : '';
      console.log(`[Updater] Detected Forge ${loaderVersion} for MC ${mcVersion}`);
    }

    // Check if already installed
    if (versionDirName) {
      const versionDir = path.join(gameDir, 'versions', versionDirName);
      const versionJson = path.join(versionDir, `${versionDirName}.json`);
      let isInstalled = false;
      try {
        if (fs.existsSync(versionDir) && fs.existsSync(versionJson) && fs.statSync(versionJson).size > 0) {
          isInstalled = true;
        } else if (fs.existsSync(versionDir)) {
          console.log('[Updater] Loader version directory exists but is incomplete. Removing:', versionDir);
          fs.rmSync(versionDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error('[Updater] Error checking loader install status:', err);
      }

      if (isInstalled) {
        const label = isNeoForge ? 'NeoForge' : 'Forge';
        console.log(`[Updater] ${label} already installed:`, versionDir);
        onProgress({ stage: 'forge', percent: 100, message: `${label} вже встановлений` });
        return;
      }
    }

    // ── Step 1: Ensure vanilla Minecraft is installed first ──
    onProgress({ stage: 'vanilla', percent: 0, message: 'Підготовка ванільного Minecraft...' });
    await this.prepareVanillaInstallation(mcVersion, onProgress);

    // ── Step 2: Download installer (global 25-44%) ──
    const installerPath = path.join(gameDir, 'forge-installer.jar');
    const loaderLabel = isNeoForge ? 'NeoForge' : 'Forge';
    onProgress({ stage: 'forge', percent: 25, message: `Завантаження ${loaderLabel} installer...` });

    await this.downloadFileWithProgress(forgeUrl, installerPath, (pct, eta) => {
      onProgress({ stage: 'forge', percent: 25 + Math.round(pct * 0.19), message: `Завантаження ${loaderLabel}: ${pct}%`, eta });
    });
    this._checkCancelled();

    // ── Step 3: Run installer (global 45-54%) ──
    onProgress({ stage: 'forge', percent: 45, message: `Встановлення ${loaderLabel} (це може зайняти кілька хвилин)...` });

    await new Promise((resolve, reject) => {
      const args = ['-jar', installerPath, '--installClient', gameDir];
      console.log(`[Updater] Running ${loaderLabel} installer:`, javaPath, args.join(' '));

      execFile(javaPath, args, {
        cwd: gameDir,
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      }, (err, stdout, stderr) => {
        console.log(`[Updater] ${loaderLabel} stdout:`, stdout);
        if (stderr) console.log(`[Updater] ${loaderLabel} stderr:`, stderr);

        if (err) {
          console.error(`[Updater] ${loaderLabel} install error:`, err);
          reject(new Error(`Помилка встановлення ${loaderLabel}: ` + (err.message || 'невідома помилка')));
        } else {
          console.log(`[Updater] ${loaderLabel} installed successfully`);
          resolve();
        }
      });
    });

    onProgress({ stage: 'forge', percent: 55, message: `${loaderLabel} встановлено!` });
  }

  // ────────────────────────────────────────────────────
  // Download and extract the selected modpack build
  //
  // Build switching strategy:
  //   mods/           ← currently active build (has build.txt + version.txt)
  //   mods-lite/      ← stashed lite build
  //   mods-full/      ← stashed full build
  //
  // When switching: mods/ → mods-{old}/, mods-{new}/ → mods/
  // When downloading: clear mods/, download fresh into it.
  // ────────────────────────────────────────────────────
  async installModpack(buildKey, onProgress) {
    if (!this.remoteConfig?.builds?.[buildKey]) {
      throw new Error(`Збірка "${buildKey}" не знайдена в конфігурації`);
    }

    const build = this.remoteConfig.builds[buildKey];
    const gameDir = this.configManager.getGameDir();
    const modsDir = this.configManager.getModsDir();
    const remoteVersion = this.remoteConfig.version || '1.0.0';

    // ── 1. Determine what's physically in mods/ right now ──
    const buildFile = path.join(modsDir, 'build.txt');
    const versionFile = path.join(modsDir, 'version.txt');
    let activeBuild = '';
    let activeVersion = '';
    if (fs.existsSync(buildFile)) activeBuild = fs.readFileSync(buildFile, 'utf8').trim();
    if (fs.existsSync(versionFile)) activeVersion = fs.readFileSync(versionFile, 'utf8').trim();

    console.log(`[Updater] installModpack requested=${buildKey} v${remoteVersion}`);
    console.log(`[Updater]   active in mods/: build=${activeBuild || '(none)'} version=${activeVersion || '(none)'}`);

    // ── 2. If the correct build+version is already active, do nothing ──
    if (activeBuild === buildKey && activeVersion === remoteVersion && !this.remoteConfig.force_update) {
      console.log('[Updater] Correct build already active, nothing to do');
      onProgress({ stage: 'modpack', percent: 100, message: 'Збірка актуальна' });
      return;
    }

    // ── 3. Check if the requested build is stashed (downloaded previously) ──
    const stashedDir = path.join(gameDir, `mods-${buildKey}`);
    const stashedVersionFile = path.join(stashedDir, 'version.txt');
    let stashedVersion = '';
    if (fs.existsSync(stashedVersionFile)) {
      stashedVersion = fs.readFileSync(stashedVersionFile, 'utf8').trim();
    }

    const canRestoreFromStash = (stashedVersion === remoteVersion) && !this.remoteConfig.force_update;
    console.log(`[Updater]   stashed ${buildKey}: version=${stashedVersion || '(none)'} canRestore=${canRestoreFromStash}`);

    // ── 4. Stash the currently active build (if any) ──
    if (activeBuild && activeBuild !== buildKey && fs.existsSync(modsDir)) {
      const currentStash = path.join(gameDir, `mods-${activeBuild}`);
      console.log(`[Updater]   stashing active build ${activeBuild} → ${currentStash}`);
      if (fs.existsSync(currentStash)) fs.rmSync(currentStash, { recursive: true, force: true });
      fs.renameSync(modsDir, currentStash);
    }

    // ── 5a. Restore from stash (instant switch, no download) ──
    if (canRestoreFromStash) {
      onProgress({ stage: 'modpack', percent: 50, message: 'Перемикання збірки...' });
      console.log(`[Updater]   restoring ${buildKey} from stash`);
      
      // Remove current mods/ if it still exists (same build but wrong version)
      if (fs.existsSync(modsDir)) fs.rmSync(modsDir, { recursive: true, force: true });
      
      fs.renameSync(stashedDir, modsDir);
      this.configManager.set('selectedBuild', buildKey);
      this.configManager.set('installedBuildVersion', remoteVersion);
      onProgress({ stage: 'modpack', percent: 100, message: 'Збірку перемкнуто!' });
      return;
    }

    // ── 5b. Download fresh (no stash or stash is outdated) ──
    console.log(`[Updater]   downloading fresh build ${buildKey}`);
    onProgress({ stage: 'modpack', percent: 5, message: 'Очищення старих модів...' });
    
    if (fs.existsSync(modsDir)) fs.rmSync(modsDir, { recursive: true, force: true });
    if (fs.existsSync(stashedDir)) fs.rmSync(stashedDir, { recursive: true, force: true });
    fs.mkdirSync(modsDir, { recursive: true });

    // Download modpack (global 55-94%)
    const zipPath = path.join(gameDir, `modpack-${buildKey}.zip`);
    onProgress({ stage: 'modpack', percent: 55, message: `Завантаження збірки: ${build.name}...` });

    await this.downloadFileWithProgress(build.url, zipPath, (pct, eta) => {
      onProgress({ stage: 'modpack', percent: 55 + Math.round(pct * 0.39), message: `Завантаження: ${build.name} — ${pct}%`, eta });
    });
    this._checkCancelled();

    // Extract to temp (global 95%)
    onProgress({ stage: 'modpack', percent: 95, message: 'Розпакування модів...' });
    const tempDir = path.join(gameDir, 'temp_extract');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    await this.extractZip(zipPath, tempDir);

    // Find the actual mods folder inside the zip
    const actualModsDir = this._findModsFolder(tempDir);

    // Move jar files into modsDir
    onProgress({ stage: 'modpack', percent: 90, message: 'Встановлення модів...' });
    const files = fs.readdirSync(actualModsDir);
    for (const file of files) {
      const src = path.join(actualModsDir, file);
      const dst = path.join(modsDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dst);
      }
    }

    // Write tracking files
    fs.writeFileSync(path.join(modsDir, 'build.txt'), buildKey, 'utf8');
    fs.writeFileSync(path.join(modsDir, 'version.txt'), remoteVersion, 'utf8');

    // Cleanup
    try { fs.unlinkSync(zipPath); } catch (e) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    // Save to config
    this.configManager.set('selectedBuild', buildKey);
    this.configManager.set('installedBuildVersion', remoteVersion);

    onProgress({ stage: 'modpack', percent: 100, message: 'Збірку встановлено!' });
  }

  /**
   * Recursively find the folder containing .jar files (the actual mods)
   */
  _findModsFolder(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    if (items.some(i => i.isFile() && i.name.endsWith('.jar'))) return dir;
    if (items.some(i => i.isDirectory() && i.name === 'mods')) return path.join(dir, 'mods');
    for (const item of items) {
      if (item.isDirectory()) {
        const res = this._findModsFolder(path.join(dir, item.name));
        if (res) return res;
      }
    }
    return dir;
  }

  // ────────────────────────────────────────────────────
  // Full check-and-update flow (called before launch)
  //   1. Fetch remote config
  //   2. Install Forge (which first installs vanilla)
  //   3. Install/update modpack
  // ────────────────────────────────────────────────────
  async checkAndUpdate(buildKey, javaPath, onProgress) {
    this.resetState();
    onProgress({ stage: 'update', percent: 0, message: 'Перевірка оновлень...' });

    await this.fetchRemoteConfig();
    if (!this.remoteConfig) {
      onProgress({ stage: 'update', percent: 100, message: 'Не вдалося отримати конфігурацію' });
      return;
    }

    // Install Forge (vanilla is prepared inside this method)
    onProgress({ stage: 'forge', percent: 0, message: 'Перевірка Forge...' });
    await this.installForge(javaPath, onProgress);

    // Install/update modpack
    onProgress({ stage: 'modpack', percent: 0, message: 'Перевірка збірки...' });
    await this.installModpack(buildKey, onProgress);
  }

  // ────────────────────────────────────────────────────
  // Force update — wipe mods and re-download
  // ────────────────────────────────────────────────────
  async forceUpdate(buildKey, javaPath, onProgress) {
    const gameDir = this.configManager.getGameDir();
    const modsDir = this.configManager.getModsDir();
    const specificModsDir = path.join(gameDir, `mods-${buildKey}`);

    this.resetState();
    onProgress({ stage: 'update', percent: 0, message: 'Видалення старих файлів...' });

    // Clear currently active mods
    if (fs.existsSync(modsDir)) {
      fs.rmSync(modsDir, { recursive: true, force: true });
    }
    
    // Clear stashed mods for this build
    if (fs.existsSync(specificModsDir)) {
      fs.rmSync(specificModsDir, { recursive: true, force: true });
    }

    this.configManager.set('installedBuildVersion', '');
    await this.checkAndUpdate(buildKey, javaPath, onProgress);
  }

  // ────────────────────────────────────────────────────
  // Auto-install Java 17 (JRE)
  // ────────────────────────────────────────────────────
  async installJava(onProgress) {
    const javaDir = path.join(this.configManager.getGameDir(), 'java');
    
    // Check if it's already there
    if (fs.existsSync(javaDir) && fs.readdirSync(javaDir).length > 0) {
      return;
    }

    onProgress({ stage: 'java', percent: 0, message: 'Отримання посилання на Java...' });

    // Try to get java URL from remote config or fallback to Eclipse Adoptium API
    let javaUrl = this.remoteConfig?.java_url;
    if (!javaUrl) {
      // Fetch latest Java 17 JRE for Windows x64 from Adoptium
      const apiUrl = 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=windows';
      try {
        const apiResponse = await this._fetchUrl(apiUrl);
        const data = JSON.parse(apiResponse);
        javaUrl = data[0].binary.package.link;
      } catch (e) {
        throw new Error('Не вдалося знайти посилання на завантаження Java: ' + e.message);
      }
    }

    fs.mkdirSync(javaDir, { recursive: true });
    const zipPath = path.join(javaDir, 'jre.zip');

    onProgress({ stage: 'java', percent: 10, message: 'Завантаження Java 17...' });
    await this.downloadFileWithProgress(javaUrl, zipPath, (pct, eta) => {
      onProgress({ stage: 'java', percent: 10 + Math.round(pct * 0.74), message: `Завантаження Java: ${pct}%`, eta });
    });
    this._checkCancelled();

    onProgress({ stage: 'java', percent: 85, message: 'Розпакування Java...' });
    await this.extractZip(zipPath, javaDir);

    try { fs.unlinkSync(zipPath); } catch (e) {}
    onProgress({ stage: 'java', percent: 100, message: 'Java встановлено!' });
  }

  // ────────────────────────────────────────────────────
  // Utility: fetch a URL and return body as string
  // ────────────────────────────────────────────────────
  _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http;
      proto.get(url, { timeout: 30000, headers: { 'User-Agent': 'PolitimeLauncher/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this._fetchUrl(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  // ────────────────────────────────────────────────────
  // Download file with per-file progress + ETA + pause/cancel
  // onPercent(filePct 0-100, eta seconds|null)
  // ────────────────────────────────────────────────────
  downloadFileWithProgress(url, dest, onPercent) {
    return new Promise((resolve, reject) => {
      if (!url) { resolve(); return; }

      const tempDest = dest + '.tmp';

      const doDownload = (downloadUrl) => {
        if (this._cancelled) { reject(new Error('DOWNLOAD_CANCELLED')); return; }

        const protocol = downloadUrl.startsWith('https') ? https : http;
        const req = protocol.get(downloadUrl, {
          timeout: 120000,
          headers: { 'User-Agent': 'PolitimeLauncher/1.0' }
        }, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume();
            doDownload(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`Download failed: HTTP ${response.statusCode} for ${downloadUrl}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'], 10) || 0;
          let downloaded = 0;
          // ETA state (local per-file)
          let speedSamples = [];

          const file = fs.createWriteStream(tempDest);
          let done = false;

          const onData = async (chunk) => {
            if (this._paused) {
              response.pause();
              await this._waitIfPaused();
              if (this._cancelled) {
                response.destroy(); file.close();
                try { fs.unlinkSync(tempDest); } catch (e) {}
                if (!done) { done = true; reject(new Error('DOWNLOAD_CANCELLED')); }
                return;
              }
              response.resume();
            }
            if (this._cancelled) {
              response.destroy(); file.close();
              try { fs.unlinkSync(tempDest); } catch (e) {}
              if (!done) { done = true; reject(new Error('DOWNLOAD_CANCELLED')); }
              return;
            }

            downloaded += chunk.length;

            if (onPercent && totalSize > 0) {
              const pct = Math.min(99, Math.round((downloaded / totalSize) * 100));
              // ETA
              const now = Date.now();
              speedSamples.push({ time: now, bytes: downloaded });
              const cutoff = now - 5000;
              speedSamples = speedSamples.filter(s => s.time > cutoff);
              let eta = null;
              if (speedSamples.length >= 2) {
                const first = speedSamples[0];
                const last = speedSamples[speedSamples.length - 1];
                const elapsed = (last.time - first.time) / 1000;
                if (elapsed >= 0.5) {
                  const speed = (last.bytes - first.bytes) / elapsed;
                  if (speed > 0) eta = Math.max(0, Math.round((totalSize - downloaded) / speed));
                }
              }
              onPercent(pct, eta);
            }
          };

          response.on('data', onData);
          response.pipe(file);
          file.on('finish', () => {
            if (!done) {
              done = true;
              file.close(() => {
                try {
                  if (fs.existsSync(tempDest)) {
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    fs.renameSync(tempDest, dest);
                  }
                  resolve();
                } catch (err) {
                  reject(err);
                }
              });
            }
          });
          file.on('error', (err) => {
            if (!done) {
              done = true;
              try { fs.unlinkSync(tempDest); } catch (e) {}
              reject(err);
            }
          });
        });

        req.on('error', (err) => {
          try { fs.unlinkSync(tempDest); } catch (e) {}
          reject(err);
        });
      };

      doDownload(url);
    });
  }

  // ────────────────────────────────────────────────────
  // Extract a ZIP file (PowerShell on Windows)
  // ────────────────────────────────────────────────────
  async extractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
      const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
      require('child_process').exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[Updater] Extract error:', err, stderr);
          reject(new Error('Помилка розпакування: ' + err.message));
        } else {
          resolve();
        }
      });
    });
  }

  downloadFile(url, dest) {
    return this.downloadFileWithProgress(url, dest, null);
  }

  hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

module.exports = Updater;
