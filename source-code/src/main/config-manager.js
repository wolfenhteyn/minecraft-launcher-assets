const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
  constructor() {
    // Default game dir (config lives here always)
    this.defaultGameDir = path.join(app.getPath('appData'), '.politime-launcher');
    this.configPath = path.join(this.defaultGameDir, 'config.json');
    this.config = {};

    // Ensure default config directory exists
    if (!fs.existsSync(this.defaultGameDir)) {
      fs.mkdirSync(this.defaultGameDir, { recursive: true });
    }

    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(data);
      } else {
        this.config = this.getDefaults();
        this.save();
      }
    } catch (err) {
      console.error('Failed to load config:', err);
      this.config = this.getDefaults();
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  getDefaults() {
    return {
      username: '',
      accounts: [],
      selectedBuild: '',       // 'lite' or 'full'
      firstRun: true,          // Show welcome dialog on first launch
      ram: {
        min: 2,
        max: 4
      },
      javaPath: '',
      lastVersion: '',
      installedBuildVersion: '', // Track installed modpack version for updates
      installDir: ''             // Custom install directory (empty = use AppData default)
    };
  }

  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    return value !== undefined ? value : defaultValue;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  isFirstRun() {
    return this.get('firstRun', true);
  }

  completeFirstRun() {
    this.set('firstRun', false);
  }

  getAll() {
    return { ...this.config };
  }

  getGameDir() {
    // Use custom installDir if set, otherwise default AppData location
    const customDir = this.get('installDir', '');
    return customDir ? path.join(customDir, '.politime-launcher') : this.defaultGameDir;
  }

  setInstallDir(dirPath) {
    this.set('installDir', dirPath || '');
    // Ensure new game dir exists
    const gameDir = this.getGameDir();
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }
  }

  getModsDir() {
    const modsDir = path.join(this.getGameDir(), 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }
    return modsDir;
  }
}

module.exports = ConfigManager;
