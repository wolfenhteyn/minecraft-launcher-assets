const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

class JavaChecker {
  /**
   * Finds a suitable Java installation.
   *
   * Priority: custom path → best-match from common dirs → JAVA_HOME → PATH
   *
   * @param {string} customPath  - User-specified Java path (takes top priority)
   * @param {number} minJava     - Minimum required Java major version (default: 17)
   *                               Pass 21 for NeoForge 1.21+, 17 for old Forge/vanilla
   * @returns {Promise<{found: boolean, path: string, version: string, score: number}>}
   */
  static async findJava(customPath = '', minJava = 17) {
    // 1. Custom path always wins (user knows best)
    if (customPath && fs.existsSync(customPath)) {
      const result = await JavaChecker.testJava(customPath);
      if (result.found) return result;
    }

    // 2. Check saved path from launcher's own Java download (javaw-path.txt)
    const allJavas = [];
    try {
      const appData = process.env.APPDATA || process.env.LOCALAPPDATA || '';
      const pathFiles = [
        path.join(appData, '.politime-launcher', 'java', 'javaw-path.txt'),
      ];
      for (const pf of pathFiles) {
        if (fs.existsSync(pf)) {
          const saved = fs.readFileSync(pf, 'utf8').trim();
          if (fs.existsSync(saved)) {
            const result = await JavaChecker.testJava(saved);
            if (result.found) allJavas.push(result);
          }
        }
      }
    } catch (e) { /* skip */ }

    // 3. Local downloaded Java (legacy — scan java/ folder)
    const localJavaDir = path.join(process.env.APPDATA || process.env.LOCALAPPDATA, '.politime-launcher', 'java');

    if (fs.existsSync(localJavaDir)) {
      const dirs = fs.readdirSync(localJavaDir);
      for (const dir of dirs) {
        for (const exe of ['javaw.exe', 'java.exe']) {
          const p = path.join(localJavaDir, dir, 'bin', exe);
          if (fs.existsSync(p)) {
            const result = await JavaChecker.testJava(p);
            if (result.found) allJavas.push(result);
          }
        }
      }
    }

    // 3. Scan common install directories and collect ALL found javas

    const commonPaths = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Foundation'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Zulu'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Java'),
    ];

    for (const basePath of commonPaths) {
      if (!fs.existsSync(basePath)) continue;
      try {
        const dirs = fs.readdirSync(basePath).filter(d =>
          d.toLowerCase().includes('jdk') || d.toLowerCase().includes('jre')
        );
        for (const dir of dirs) {
          for (const exe of ['javaw.exe', 'java.exe']) {
            const p = path.join(basePath, dir, 'bin', exe);
            if (fs.existsSync(p)) {
              const result = await JavaChecker.testJava(p);
              if (result.found) {
                allJavas.push(result);
                break; // one exe per dir is enough
              }
            }
          }
        }
      } catch (e) { /* skip inaccessible */ }
    }

    // 3. JAVA_HOME
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      for (const exe of ['javaw.exe', 'java.exe']) {
        const p = path.join(javaHome, 'bin', exe);
        if (fs.existsSync(p)) {
          const result = await JavaChecker.testJava(p);
          if (result.found && !allJavas.some(j => j.path === result.path)) {
            allJavas.push(result);
            break;
          }
        }
      }
    }

    // 4. PATH fallback
    for (const cmd of ['javaw', 'java']) {
      const result = await JavaChecker.testJava(cmd);
      if (result.found && !allJavas.some(j => j.version === result.version)) {
        allJavas.push(result);
      }
    }

    if (allJavas.length === 0) {
      return { found: false, path: '', version: '' };
    }

    // 5. Pick the best Java for the required version
    const pick = JavaChecker.pickBestJava(allJavas, minJava);
    console.log(`[JavaChecker] Found ${allJavas.length} Java(s):`,
      allJavas.map(j => `v${j.version} @ ${j.path}`).join(' | '));
    console.log(`[JavaChecker] Selected: v${pick.version} @ ${pick.path} (minJava=${minJava})`);
    return pick;
  }

  /**
   * Pick the best Java from a list based on the minimum required major version.
   *
   * minJava=17 (old Forge / vanilla): prefers Java 17, accepts 18-20, deprioritises 21+
   * minJava=21 (NeoForge 1.21+):      prefers Java 21, accepts 21-24, also accepts 25+
   */
  static pickBestJava(javas, minJava = 17) {
    const scored = javas.map(j => {
      const major = JavaChecker.getMajorVersion(j.version);
      let score = 0;

      if (minJava >= 21) {
        // NeoForge 1.21+: needs Java 21+
        if (major >= 21 && major <= 24) score = 100;  // ideal range
        else if (major >= 25)           score = 80;   // newer, still works
        else if (major >= 17)           score = 5;    // too old for NeoForge 1.21
        else                             score = 1;    // definitely too old
      } else {
        // Old Forge / Vanilla: Java 17 preferred
        if (major === 17)                    score = 100;  // perfect
        else if (major >= 18 && major <= 20) score = 80;   // compatible
        else if (major === 16)               score = 50;   // might work
        else if (major >= 21)               score = 10;   // likely broken for old Forge
        else                                 score = 5;    // too old
      }

      return { ...j, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  static getMajorVersion(versionStr) {
    if (!versionStr) return 0;
    // "17.0.16" → 17, "1.8.0_362" → 8, "25" → 25
    const parts = versionStr.split('.');
    const first = parseInt(parts[0], 10);
    if (first === 1 && parts.length > 1) return parseInt(parts[1], 10); // legacy 1.8 format
    return first;
  }

  /**
   * Tests if a given java path is valid and returns version info
   */
  static testJava(javaPath) {
    return new Promise((resolve) => {
      try {
        execFile(javaPath, ['-version'], { timeout: 10000 }, (err, stdout, stderr) => {
          if (err) {
            resolve({ found: false, path: javaPath, version: '' });
            return;
          }

          const output = stderr || stdout || '';
          const versionMatch = output.match(/version\s+"?(\d+[\.\d+]*)/i);
          const version = versionMatch ? versionMatch[1] : 'unknown';

          resolve({
            found: true,
            path: javaPath,
            version: version
          });
        });
      } catch (e) {
        resolve({ found: false, path: javaPath, version: '' });
      }
    });
  }
}

module.exports = JavaChecker;
