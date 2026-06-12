// ══ Theme definitions ══
const THEMES = {
  dark:   { emoji: '🔥', name: 'Вечірнє багаття' },
  light:  { emoji: '❄️', name: 'Зимовий бриз' },
  forest: { emoji: '🌿', name: 'Дрімучий ліс' },
  nebula: { emoji: '🌌', name: 'Галактична туманність' },
  ocean:  { emoji: '🌊', name: 'Глибокий океан' },
  cherry: { emoji: '🌸', name: 'Сакура' },
  aurora: { emoji: '🌠', name: 'Полярне сяйво' },
  lava:   { emoji: '🌋', name: 'Вулканічна лава' },
  storm:  { emoji: '⛈️', name: 'Грозова ніч' },
  candy:  { emoji: '🍬', name: 'Цукерковий сон' },
};

// Initial theme loading (to prevent flash)
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

document.addEventListener('DOMContentLoaded', async () => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // ── Theme Picker ──
  const btnThemeToggle  = $('#btn-theme-toggle');
  const themeIconEmoji  = $('#theme-icon-emoji');
  const themeDropdown   = $('#theme-dropdown');
  const themeOptions    = document.querySelectorAll('.theme-option');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const info = THEMES[theme] || THEMES.dark;
    themeIconEmoji.textContent = info.emoji;
    btnThemeToggle.title = info.name;
    // Update active state on options
    themeOptions.forEach(opt => {
      opt.classList.toggle('active', opt.dataset.theme === theme);
    });
    // Particle system is notified automatically via MutationObserver in particles.js
  }

  // Initialize
  applyTheme(savedTheme);

  // Toggle dropdown
  btnThemeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.toggle('open');
  });

  // Pick theme
  themeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const newTheme = opt.dataset.theme;
      applyTheme(newTheme);
      themeDropdown.classList.remove('open');
      if (window.uiSounds) window.uiSounds.toggle();
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!$('#theme-picker-wrap').contains(e.target)) {
      themeDropdown.classList.remove('open');
    }
  });

  // ── Element refs ──
  const usernameInput    = $('#username-input');
  const usernameHint     = $('#username-hint');
  const playBtn          = $('#btn-play');
  const playLabel        = $('#play-label');
  const statusDot        = $('#status-dot');
  const statusText       = $('#status-text');
  const progressWrap     = $('#progress-wrap');
  const progressBar      = $('#progress-bar');
  const progressMsg      = $('#progress-msg');
  const progressPct      = $('#progress-pct');
  const progressEta      = $('#progress-eta');
  const downloadControls = $('#download-controls');
  const btnPause         = $('#btn-pause-download');
  const pauseLabel       = $('#pause-label');
  const btnCancel        = $('#btn-cancel-download');
  const buildLite        = $('#build-lite');
  const buildFull        = $('#build-full');

  // Settings
  const settingsModal    = $('#settings-modal');
  const ramMin           = $('#ram-min');
  const ramMax           = $('#ram-max');
  const ramMinVal        = $('#ram-min-val');
  const ramMaxVal        = $('#ram-max-val');
  const settingsBuild    = $('#settings-build');
  const javaStatus       = $('#java-status');
  const gameDir          = $('#game-dir');

  // Welcome
  const welcomeModal     = $('#welcome-modal');
  const welcomeUsername  = $('#welcome-username');
  const welcomeHint      = $('#welcome-username-hint');
  const wbLite           = $('#wb-lite');
  const wbFull           = $('#wb-full');
  const welcomeStartBtn  = $('#btn-welcome-start');
  const welcomeCloseBtn  = $('#btn-welcome-close');

  let isLaunching = false;
  let selectedBuild = 'lite';
  let isPaused = false;

  // ── Smooth progress state ──
  let displayedPct = 0;
  let targetPct = 0;
  let pctAnimFrame = null;

  function animateProgress() {
    if (Math.abs(displayedPct - targetPct) > 0.3) {
      displayedPct += (targetPct - displayedPct) * 0.12;
      progressBar.style.width = displayedPct + '%';
      progressPct.textContent = Math.round(displayedPct) + '%';
      if (/^\d+%$/.test(playLabel.textContent)) playLabel.textContent = Math.round(displayedPct) + '%';
      pctAnimFrame = requestAnimationFrame(animateProgress);
    } else {
      displayedPct = targetPct;
      progressBar.style.width = targetPct + '%';
      progressPct.textContent = Math.round(targetPct) + '%';
      if (/^\d+%$/.test(playLabel.textContent)) playLabel.textContent = Math.round(targetPct) + '%';
      pctAnimFrame = null;
    }
  }

  function setProgress(pct) {
    targetPct = pct;
    if (!pctAnimFrame) pctAnimFrame = requestAnimationFrame(animateProgress);
  }

  function resetProgress() {
    if (pctAnimFrame) { cancelAnimationFrame(pctAnimFrame); pctAnimFrame = null; }
    displayedPct = 0;
    targetPct = 0;
    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
    progressEta.textContent = '';
    downloadControls.style.display = 'none';
    isPaused = false;
    pauseLabel.textContent = 'Пауза';
    btnPause.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
  }

  function formatETA(seconds) {
    if (seconds == null || seconds < 0) return '';
    if (seconds < 10) return '~менше 10с';
    if (seconds < 60) return `~${seconds}с залишилось`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `~${m}хв ${s}с залишилось` : `~${m}хв залишилось`;
  }


  // ── Username Validation ──
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;

  function validateUsername(input, hint) {
    const v = input.value.trim();
    if (!v) { hint.textContent = ''; hint.className = 'field-hint'; return false; }
    if (v.length < 3) { hint.textContent = 'Мінімум 3 символи'; hint.className = 'field-hint err'; return false; }
    if (!usernameRegex.test(v)) { hint.textContent = 'Латинські літери, цифри та _'; hint.className = 'field-hint err'; return false; }
    hint.textContent = 'Нікнейм валідний ✓'; hint.className = 'field-hint ok'; return true;
  }

  usernameInput.addEventListener('input', () => validateUsername(usernameInput, usernameHint));

  // ── Window Controls ──
  $('#btn-minimize').addEventListener('click', () => window.launcherAPI.minimizeWindow());
  $('#btn-close').addEventListener('click', () => window.launcherAPI.closeWindow());

  // ── Build Selector (main screen) ──
  function setActiveBuild(build) {
    selectedBuild = build;
    buildLite.classList.toggle('active', build === 'lite');
    buildFull.classList.toggle('active', build === 'full');
    window.launcherAPI.setSelectedBuild(build);
  }

  buildLite.addEventListener('click', () => { setActiveBuild('lite'); if (window.uiSounds) window.uiSounds.click(); });
  buildFull.addEventListener('click', () => { setActiveBuild('full'); if (window.uiSounds) window.uiSounds.click(); });

  // ── Load saved state ──
  async function init() {
    // Load news
    loadNews();

    // Load launcher version
    try {
      const version = await window.launcherAPI.getVersion();
      const versionEl = $('#launcher-version-text');
      if (versionEl && version) {
        versionEl.textContent = `v${version}`;
      }
    } catch (e) {
      console.error('Failed to get launcher version:', e);
    }

    // Check first run
    const firstRun = await window.launcherAPI.isFirstRun();
    if (firstRun) {
      showWelcome();
      return;
    }

    // Load saved username
    const savedName = await window.launcherAPI.getUsername();
    if (savedName) { usernameInput.value = savedName; validateUsername(usernameInput, usernameHint); }

    // Load saved build
    const savedBuild = await window.launcherAPI.getSelectedBuild();
    setActiveBuild(savedBuild || 'lite');
  }

  init();

  // ═══ Server Status Monitoring ═══
  const serverStatus = $('#server-status');
  const playersPopup = $('#players-popup');
  const playersPopupList = $('#players-popup-list');
  const playersPopupTitle = $('#players-popup-title');
  const playersPopupClose = $('#players-popup-close');

  let serverData = null;

  async function queryServer() {
    try {
      serverData = await window.launcherAPI.queryServer();
      if (serverData && serverData.success) {
        serverStatus.innerHTML = `<span class="server-offline-dot online"></span>${serverData.online}/${serverData.max} • ptime.pp.ua`;
      } else {
        serverStatus.innerHTML = `<span class="server-offline-dot offline"></span>ptime.pp.ua`;
      }
    } catch (e) {
      serverStatus.innerHTML = `<span class="server-offline-dot offline"></span>ptime.pp.ua`;
    }
  }

  queryServer();
  setInterval(queryServer, 30000);

  serverStatus.addEventListener('click', () => {
    if (window.uiSounds) window.uiSounds.click();
    if (playersPopup.style.display === 'none') {
      renderPlayersPopup();
      playersPopup.style.display = 'block';
    } else {
      playersPopup.style.display = 'none';
    }
  });

  playersPopupClose.addEventListener('click', () => {
    playersPopup.style.display = 'none';
  });

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!playersPopup.contains(e.target) && !serverStatus.contains(e.target)) {
      playersPopup.style.display = 'none';
    }
  });

  function renderPlayersPopup() {
    if (!serverData || !serverData.success) {
      playersPopupList.innerHTML = '<div class="players-popup-empty">Сервер недоступний</div>';
      playersPopupTitle.textContent = 'Сервер офлайн';
      return;
    }
    playersPopupTitle.textContent = `Гравці онлайн (${serverData.online}/${serverData.max})`;
    if (!serverData.players || serverData.players.length === 0) {
      if (serverData.online > 0) {
        playersPopupList.innerHTML = '<div class="players-popup-empty">Список гравців приховано сервером</div>';
      } else {
        playersPopupList.innerHTML = '<div class="players-popup-empty">Ніхто не грає зараз</div>';
      }
      return;
    }
    playersPopupList.innerHTML = serverData.players.map(p =>
      `<div class="player-row">
        <img class="player-head" src="https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/20" alt="${p.name}" loading="lazy">
        <span class="player-name">${p.name}</span>
      </div>`
    ).join('');
  }

  // ═══ Music Player ═══
  const btnMusicToggle = $('#btn-music-toggle');
  const musicViz = $('#music-viz');
  const musicVol = $('#music-vol');

  // Dynamically generate visualizer bars (12 bars for a premium look)
  const VIZ_BARS_COUNT = 12;
  musicViz.innerHTML = '';
  for (let i = 0; i < VIZ_BARS_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'viz-bar';
    bar.innerHTML = `
      <div class="viz-bar-fill"></div>
      <div class="viz-bar-peak"></div>
    `;
    musicViz.appendChild(bar);
  }

  const vizFills = musicViz.querySelectorAll('.viz-bar-fill');
  const vizPeaks = musicViz.querySelectorAll('.viz-bar-peak');

  let audioCtx = null;
  let audioSource = null;
  let analyser = null;
  let audioElement = null;
  let musicPlaying = false;
  let musicFiles = [];
  let vizAnimFrame = null;

  // Visualizer physics states
  const GRAVITY = 0.12;
  const MAX_HEIGHT = 18;
  const IDLE_HEIGHT = 2;
  const ATTACK_RATE = 0.85;
  const DECAY_RATE = 0.75;

  const currentHeights = new Float32Array(VIZ_BARS_COUNT);
  const peakHeights = new Float32Array(VIZ_BARS_COUNT);
  const peakSpeeds = new Float32Array(VIZ_BARS_COUNT);

  // Initialize bars to idle state
  for (let i = 0; i < VIZ_BARS_COUNT; i++) {
    currentHeights[i] = IDLE_HEIGHT;
    peakHeights[i] = IDLE_HEIGHT;
    vizFills[i].style.height = `${IDLE_HEIGHT}px`;
    vizPeaks[i].style.bottom = `${IDLE_HEIGHT}px`;
  }

  // Scan for music files via audio element
  const MUSIC_DIR = '../../assets/music/';
  // We'll try known filenames; user adds MP3s to assets/music/
  async function initMusicPlayer() {
    // Try to find music files by loading a test
    const testNames = ['ambient', 'track1', 'track2', 'track3', 'music', 'lofi', 'minecraft'];
    const extensions = ['.mp3', '.ogg', '.wav'];
    
    for (const name of testNames) {
      for (const ext of extensions) {
        const path = MUSIC_DIR + name + ext;
        try {
          const resp = await fetch(path, { method: 'HEAD' });
          if (resp.ok) musicFiles.push(path);
        } catch(e) {}
      }
    }

    // Also try numbered files
    for (let i = 1; i <= 10; i++) {
      for (const ext of ['.mp3', '.ogg']) {
        const path = MUSIC_DIR + i + ext;
        try {
          const resp = await fetch(path, { method: 'HEAD' });
          if (resp.ok) musicFiles.push(path);
        } catch(e) {}
      }
    }

    // Restore volume
    const savedVol = localStorage.getItem('musicVol');
    if (savedVol !== null) musicVol.value = savedVol;
  }

  initMusicPlayer();

  btnMusicToggle.addEventListener('click', () => {
    if (window.uiSounds) window.uiSounds.click();
    if (musicPlaying) {
      stopMusic();
    } else {
      playMusic();
    }
  });

  musicVol.addEventListener('input', () => {
    if (audioElement) audioElement.volume = musicVol.value / 100;
    localStorage.setItem('musicVol', musicVol.value);
  });

  function playMusic() {
    if (musicFiles.length === 0) {
      // No music files found
      btnMusicToggle.title = 'Немає музики в assets/music/';
      return;
    }

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!audioElement) {
      audioElement = new Audio();
      audioElement.loop = false;
      audioElement.addEventListener('ended', () => {
        // Play next random track
        const src = musicFiles[Math.floor(Math.random() * musicFiles.length)];
        audioElement.src = src;
        audioElement.play();
      });

      audioSource = audioCtx.createMediaElementSource(audioElement);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.45;
      audioSource.connect(analyser);
      analyser.connect(audioCtx.destination);
    }

    const src = musicFiles[Math.floor(Math.random() * musicFiles.length)];
    audioElement.src = src;
    audioElement.volume = musicVol.value / 100;
    audioElement.play().then(() => {
      musicPlaying = true;
      btnMusicToggle.classList.add('active');
      btnMusicToggle.title = 'Вимкнути музику';
      musicViz.classList.add('playing');
      startViz();
    }).catch(() => {
      btnMusicToggle.title = 'Помилка відтворення';
    });
  }

  function stopMusic() {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    musicPlaying = false;
    btnMusicToggle.classList.remove('active');
    btnMusicToggle.title = 'Увімкнути музику';
    musicViz.classList.remove('playing');
    if (vizAnimFrame) { cancelAnimationFrame(vizAnimFrame); vizAnimFrame = null; }
    
    // Reset heights to idle
    for (let i = 0; i < VIZ_BARS_COUNT; i++) {
      currentHeights[i] = IDLE_HEIGHT;
      peakHeights[i] = IDLE_HEIGHT;
      peakSpeeds[i] = 0;
      vizFills[i].style.height = `${IDLE_HEIGHT}px`;
      vizPeaks[i].style.bottom = `${IDLE_HEIGHT}px`;
    }
  }

  function startViz() {
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Map logarithmic bands to 12 bars (focusing on active audible ranges)
    const BANDS = [
      { start: 1, end: 1 },    // Bar 0: Sub-bass
      { start: 2, end: 2 },    // Bar 1: Bass
      { start: 3, end: 3 },    // Bar 2: Mid-bass
      { start: 4, end: 4 },    // Bar 3: Low mids
      { start: 5, end: 6 },    // Bar 4: Mids
      { start: 7, end: 8 },    // Bar 5: Mids
      { start: 9, end: 11 },   // Bar 6: Mids
      { start: 12, end: 14 },  // Bar 7: Upper mids
      { start: 15, end: 18 },  // Bar 8: High mids
      { start: 19, end: 23 },  // Bar 9: Highs (presence)
      { start: 24, end: 30 },  // Bar 10: Highs
      { start: 31, end: 42 }   // Bar 11: Highs (brilliance)
    ];

    function updateViz() {
      if (!musicPlaying) return;
      analyser.getByteFrequencyData(dataArray);

      const maxValHeight = MAX_HEIGHT - IDLE_HEIGHT;

      for (let i = 0; i < VIZ_BARS_COUNT; i++) {
        const band = BANDS[i];
        let val = 0;
        for (let b = band.start; b <= band.end; b++) {
          if (dataArray[b] > val) val = dataArray[b];
        }

        // Normalize (0.0 to 1.0)
        const normalizedVal = val / 255;
        const targetHeight = IDLE_HEIGHT + normalizedVal * maxValHeight;

        // Smooth height (fast attack, slow release)
        if (targetHeight > currentHeights[i]) {
          currentHeights[i] = currentHeights[i] * (1 - ATTACK_RATE) + targetHeight * ATTACK_RATE;
        } else {
          currentHeights[i] = currentHeights[i] * DECAY_RATE + targetHeight * (1 - DECAY_RATE);
        }

        if (currentHeights[i] < IDLE_HEIGHT) currentHeights[i] = IDLE_HEIGHT;

        // Peak physics with gravity
        if (currentHeights[i] >= peakHeights[i]) {
          peakHeights[i] = currentHeights[i];
          peakSpeeds[i] = 0;
        } else {
          peakSpeeds[i] += GRAVITY;
          peakHeights[i] -= peakSpeeds[i];
          if (peakHeights[i] < currentHeights[i]) {
            peakHeights[i] = currentHeights[i];
            peakSpeeds[i] = 0;
          }
        }

        // Apply styles to fill and peak
        vizFills[i].style.height = `${currentHeights[i]}px`;
        vizPeaks[i].style.bottom = `${peakHeights[i]}px`;
      }

      vizAnimFrame = requestAnimationFrame(updateViz);
    }
    updateViz();
  }

  async function loadNews() {
    const newsContainer = $('#news-container');
    try {
      const response = await fetch('https://raw.githubusercontent.com/wolfenhteyn/minecraft-launcher-assets/main/news.md');
      if (!response.ok) throw new Error('Failed to load news');
      let markdownText = await response.text();
      
      // Support custom badge syntax: [badge:Text]
      markdownText = markdownText.replace(/\[badge:(.*?)\]/g, '<div class="dash-badge">$1</div>');
      
      // Parse using 'marked' via the main process
      let html = await window.launcherAPI.parseMarkdown(markdownText);
      
      // Make all links open externally
      html = html.replace(/<a href="(.*?)"(.*?)>(.*?)<\/a>/g, `<a href="#" onclick="window.launcherAPI.openExternal('$1'); return false;">$3</a>`);
      
      newsContainer.innerHTML = html;
    } catch (e) {
      console.error('Could not load news from GitHub:', e);
      // fallback news is already in DOM
    }
  }

  // ═══ Welcome Modal ═══
  let welcomeBuild = '';
  let welcomeInstallDir = ''; // empty = AppData default

  function showWelcome() {
    welcomeModal.style.display = 'flex';
  }

  function updateWelcomeBtn() {
    const nameOk = usernameRegex.test(welcomeUsername.value.trim());
    const buildOk = !!welcomeBuild;
    welcomeStartBtn.disabled = !(nameOk && buildOk);
  }

  welcomeUsername.addEventListener('input', () => {
    validateUsername(welcomeUsername, welcomeHint);
    updateWelcomeBtn();
  });

  wbLite.addEventListener('click', () => {
    welcomeBuild = 'lite';
    wbLite.classList.add('active'); wbFull.classList.remove('active');
    updateWelcomeBtn();
  });
  wbFull.addEventListener('click', () => {
    welcomeBuild = 'full';
    wbFull.classList.add('active'); wbLite.classList.remove('active');
    updateWelcomeBtn();
  });

  // Install dir picker in welcome
  $('#wb-pick-dir').addEventListener('click', async () => {
    const chosen = await window.launcherAPI.pickInstallDir();
    const pathEl = $('#wb-dir-path');
    if (chosen) {
      welcomeInstallDir = chosen;
      pathEl.textContent = chosen + '\\.politime-launcher';
      pathEl.title = chosen + '\\.politime-launcher';
    } else {
      welcomeInstallDir = '';
      pathEl.textContent = 'За замовчуванням (AppData)';
    }
  });

  welcomeStartBtn.addEventListener('click', async () => {
    const name = welcomeUsername.value.trim();
    if (!usernameRegex.test(name) || !welcomeBuild) return;

    await window.launcherAPI.addSavedAccount(name);
    await window.launcherAPI.completeFirstRun({ username: name, build: welcomeBuild });
    // Save install dir if chosen
    if (welcomeInstallDir) {
      await window.launcherAPI.setSettings({ installDir: welcomeInstallDir });
    }

    // Apply to main screen
    usernameInput.value = name;
    validateUsername(usernameInput, usernameHint);
    setActiveBuild(welcomeBuild);

    welcomeModal.style.display = 'none';
    welcomeCloseBtn.style.display = 'none';
  });

  welcomeCloseBtn.addEventListener('click', () => {
    if (window.uiSounds) window.uiSounds.click();
    welcomeModal.style.display = 'none';
    welcomeCloseBtn.style.display = 'none';
  });

  // ═══ Play Button ═══
  playBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!validateUsername(usernameInput, usernameHint)) {
      usernameInput.focus();
      usernameInput.style.animation = 'shake .4s ease';
      setTimeout(() => usernameInput.style.animation = '', 400);
      return;
    }
    if (isLaunching) return;

    isLaunching = true;
    playBtn.disabled = true;
    playLabel.textContent = 'ПІДГОТОВКА...';
    statusDot.className = 'status-dot busy';
    statusText.textContent = 'Запуск...';
    progressWrap.style.display = 'block';
    resetProgress();
    if (window.uiSounds) window.uiSounds.launch();

    try {
      const result = await window.launcherAPI.launchGame(username);
      if (result.success) {
        stopMusic();
      } else {
        if (result.error === 'CANCELLED') { resetAfterCancel(); }
        else showError(result.error);
      }
    } catch (e) {
      showError(e.message || 'Помилка запуску');
    }
  });

  function showError(msg) {
    isLaunching = false;
    playBtn.disabled = false;
    playLabel.textContent = 'ГРАТИ';
    statusDot.className = 'status-dot err';
    statusText.textContent = 'Помилка';
    progressMsg.textContent = msg;
    resetProgress();
    if (window.uiSounds) window.uiSounds.error();
    setTimeout(() => {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Готовий до гри';
      progressWrap.style.display = 'none';
    }, 10000);
  }

  function resetAfterCancel() {
    isLaunching = false;
    playBtn.disabled = false;
    playLabel.textContent = 'ГРАТИ';
    statusDot.className = 'status-dot';
    statusText.textContent = 'Готовий до гри';
    progressMsg.textContent = 'Завантаження скасовано';
    resetProgress();
    setTimeout(() => { progressWrap.style.display = 'none'; }, 3000);
  }

  // ── Progress ──
  const DOWNLOAD_STAGES = new Set(['download', 'update', 'forge', 'modpack', 'java', 'vanilla']);

  window.launcherAPI.onProgress(data => {
    if (isPaused) return;
    progressWrap.style.display = 'block';
    progressMsg.textContent = data.message || '';

    if (data.stage === 'launcher-update') {
      setProgress(data.percent);
      statusDot.className = 'status-dot busy';
      statusText.textContent = 'Оновлення лаунчера';
      playBtn.disabled = true;
      playLabel.textContent = 'ОНОВЛЕННЯ';
      downloadControls.style.display = 'none';
    } else if (DOWNLOAD_STAGES.has(data.stage)) {
      setProgress(data.percent);
      statusDot.className = 'status-dot busy';
      statusText.textContent = 'Завантаження';
      downloadControls.style.display = 'flex';
      if (!isPaused) playLabel.textContent = Math.round(displayedPct) + '%';
      // ETA
      if (data.eta != null) {
        progressEta.textContent = formatETA(data.eta);
      } else {
        progressEta.textContent = '';
      }
    } else if (data.stage === 'launch') {
      setProgress(100, true);
      statusText.textContent = 'Запуск гри';
      playLabel.textContent = 'ЗАПУСК...';
      downloadControls.style.display = 'none';
      progressEta.textContent = '';
    }
  });

  // ── Download control buttons ──
  btnPause.addEventListener('click', () => {
    if (!isPaused) {
      isPaused = true;
      window.launcherAPI.pauseDownload();
      pauseLabel.textContent = 'Продовжити';
      btnPause.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      progressMsg.textContent = 'Завантаження призупинено';
      statusText.textContent = 'Пауза';
    } else {
      isPaused = false;
      window.launcherAPI.resumeDownload();
      pauseLabel.textContent = 'Пауза';
      btnPause.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
      statusText.textContent = 'Завантаження';
    }
  });

  btnCancel.addEventListener('click', () => {
    if (!confirm('Скасувати завантаження?')) return;
    window.launcherAPI.cancelDownload();
  });

  window.launcherAPI.onGameExited(() => {
    isLaunching = false;
    playBtn.disabled = false;
    playLabel.textContent = 'ГРАТИ';
    statusDot.className = 'status-dot';
    statusText.textContent = 'Готовий до гри';
    resetProgress();
    progressWrap.style.display = 'none';
  });

  // ═══ Settings ═══
  $('#btn-settings').addEventListener('click', async () => {
    settingsModal.style.display = 'flex';
    if (window.uiSounds) window.uiSounds.modalOpen();
    await loadSettings();
  });

  function closeSettings() { settingsModal.style.display = 'none'; }
  $('#btn-settings-close').addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

  async function loadSettings() {
    try {
      const s = await window.launcherAPI.getSettings();
      ramMin.value = s.ramMin; ramMax.value = s.ramMax;
      ramMinVal.textContent = s.ramMin + ' GB';
      ramMaxVal.textContent = s.ramMax + ' GB';
      settingsBuild.value = s.selectedBuild || 'lite';
      gameDir.textContent = s.gameDir || '—';
      // Store install dir for save
      gameDir.dataset.installDir = s.installDir || '';

      const java = await window.launcherAPI.checkJava();
      if (java.found) {
        javaStatus.textContent = '✓ Java ' + java.version;
        javaStatus.className = 'java-badge ok';
      } else {
        javaStatus.textContent = '✗ Java не знайдена';
        javaStatus.className = 'java-badge bad';
      }

      // RAM Helper
      await updateRAMHelper();
    } catch (e) { console.error('Settings load error:', e); }
  }

  // Install dir picker
  $('#btn-pick-dir').addEventListener('click', async () => {
    const chosen = await window.launcherAPI.pickInstallDir();
    if (chosen) {
      gameDir.dataset.installDir = chosen;
      const { join } = { join: (a, b) => a + '\\' + b };
      gameDir.textContent = chosen + '\\.politime-launcher';
    }
  });

  $('#btn-reset-dir').addEventListener('click', () => {
    gameDir.dataset.installDir = '';
    gameDir.textContent = '(за замовчуванням — AppData)';
  });

  ramMin.addEventListener('input', () => {
    let v = +ramMin.value;
    if (v > +ramMax.value) { ramMax.value = v; ramMaxVal.textContent = v + ' GB'; }
    ramMinVal.textContent = v + ' GB';
  });
  ramMax.addEventListener('input', () => {
    let v = +ramMax.value;
    if (v < +ramMin.value) { ramMin.value = v; ramMinVal.textContent = v + ' GB'; }
    ramMaxVal.textContent = v + ' GB';
  });

  $('#btn-settings-save').addEventListener('click', async () => {
    const newBuild = settingsBuild.value;
    await window.launcherAPI.setSettings({
      ramMin: +ramMin.value,
      ramMax: +ramMax.value,
      selectedBuild: newBuild,
      installDir: gameDir.dataset.installDir || ''
    });
    setActiveBuild(newBuild);
    closeSettings();
  });

  // Clear libraries
  $('#btn-clear-libraries').addEventListener('click', async () => {
    if (window.uiSounds) window.uiSounds.click();
    if (!confirm('Очистити кеш бібліотек гри? Це вирішить помилки запуску (наприклад, ZLIB/EOFException). Ваші світи (збереження) та налаштування не постраждають.')) return;
    closeSettings();
    try {
      playBtn.disabled = true;
      playLabel.textContent = 'ОЧИЩЕННЯ...';
      statusDot.className = 'status-dot busy';
      statusText.textContent = 'Очищення бібліотек';
      progressWrap.style.display = 'block';
      
      const r = await window.launcherAPI.clearLibraries();
      if (r.success) {
        statusText.textContent = 'Бібліотеки очищено';
        alert('Кеш бібліотек успішно очищено! Натисніть «ГРАТИ», щоб завантажити чисті файли та запустити гру.');
      } else {
        showError(r.error || 'Невідома помилка під час очищення');
      }
    } catch (e) {
      showError(e.message);
    } finally {
      playBtn.disabled = false;
      playLabel.textContent = 'ГРАТИ';
      statusDot.className = 'status-dot';
      setTimeout(() => {
        statusText.textContent = 'Готовий до гри';
        progressWrap.style.display = 'none';
      }, 3000);
    }
  });

  // Force update
  $('#btn-force-update').addEventListener('click', async () => {
    if (!confirm('Видалити всі моди та завантажити збірку заново?')) return;
    closeSettings();
    try {
      playBtn.disabled = true;
      playLabel.textContent = 'ОНОВЛЕННЯ...';
      statusDot.className = 'status-dot busy';
      statusText.textContent = 'Оновлення';
      progressWrap.style.display = 'block';
      const r = await window.launcherAPI.forceUpdate();
      if (r.success) { statusText.textContent = 'Оновлено'; }
      else showError(r.error);
    } catch (e) { showError(e.message); }
    finally {
      playBtn.disabled = false; playLabel.textContent = 'ГРАТИ';
      statusDot.className = 'status-dot';
      setTimeout(() => { statusText.textContent = 'Готовий до гри'; progressWrap.style.display = 'none'; }, 3000);
    }
  });

  // ── Debug Mode ──
  $('#btn-debug-update').addEventListener('click', () => {
    closeSettings();
    window.launcherAPI.debugUpdateLauncher();
  });
  
  $('#btn-debug-cache').addEventListener('click', async () => {
    if (!confirm('Ви впевнені? Це видалить всі конфіги та збереження лаунчера!')) return;
    const r = await window.launcherAPI.debugClearCache();
    if (r) alert('Кеш очищено. Лаунчер буде закрито.');
  });

  $('#btn-debug-welcome').addEventListener('click', () => {
    if (window.uiSounds) window.uiSounds.click();
    closeSettings();
    welcomeCloseBtn.style.display = 'flex';
    showWelcome();
  });
  
  $('#btn-open-folder').addEventListener('click', () => {
    window.launcherAPI.debugOpenFolder();
  });

  // Enter to play
  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') playBtn.click(); });

  // ═══ RAM Helper ═══
  const ramHint = $('#ram-hint');
  const ramSystemInfo = $('#ram-system-info');
  let systemRAM = null;

  async function updateRAMHelper() {
    try {
      systemRAM = await window.launcherAPI.getSystemRAM();
      ramSystemInfo.textContent = `Системна пам'ять: ${systemRAM.totalGB} GB всього • ${systemRAM.freeGB} GB вільно`;

      // Dynamically set max slider based on system RAM
      const maxAllowed = Math.min(16, Math.floor(systemRAM.totalGB));
      ramMax.max = maxAllowed;
      ramMin.max = maxAllowed;

      updateRAMHint();
    } catch (e) {
      ramSystemInfo.textContent = 'Не вдалося визначити системну пам\'ять';
    }
  }

  function updateRAMHint() {
    const maxVal = +ramMax.value;
    const currentBuild = settingsBuild ? settingsBuild.value : 'lite';

    if (!systemRAM) {
      ramHint.textContent = '';
      ramHint.className = 'ram-hint';
      return;
    }

    const halfSystem = systemRAM.totalGB / 2;

    if (maxVal > halfSystem) {
      ramHint.textContent = `⚠️ Забагато! Виділено більше половини системної RAM (${systemRAM.totalGB} GB). Система може підгальмовувати.`;
      ramHint.className = 'ram-hint danger';
    } else if (maxVal < 3 && currentBuild === 'full') {
      ramHint.textContent = '⚠️ Може бути замало для повної збірки з модами. Рекомендовано 4-6 GB.';
      ramHint.className = 'ram-hint danger';
    } else if (maxVal < 3) {
      ramHint.textContent = '🟡 Достатньо для полегшеної збірки, але можуть бути лаги.';
      ramHint.className = 'ram-hint warn';
    } else if (maxVal >= 3 && maxVal <= 6) {
      const rec = currentBuild === 'full' ? 'Рекомендовано 5-6 GB для повної збірки.' : '';
      ramHint.textContent = `✅ Оптимально для більшості збірок. ${rec}`;
      ramHint.className = 'ram-hint good';
    } else {
      ramHint.textContent = '✅ Відмінно! Гра працюватиме максимально плавно.';
      ramHint.className = 'ram-hint good';
    }
  }

  // Update hint when sliders change
  ramMin.addEventListener('input', updateRAMHint);
  ramMax.addEventListener('input', updateRAMHint);
  if (settingsBuild) settingsBuild.addEventListener('change', updateRAMHint);

  // ═══ UI Sounds Toggle ═══
  const uiSoundsClicksToggle = $('#ui-sounds-clicks-toggle');
  const uiSoundsSystemToggle = $('#ui-sounds-system-toggle');

  if (uiSoundsClicksToggle && window.uiSounds) {
    uiSoundsClicksToggle.checked = window.uiSounds.clicksEnabled;
    uiSoundsClicksToggle.addEventListener('change', () => {
      window.uiSounds.setClicksEnabled(uiSoundsClicksToggle.checked);
    });
  }

  if (uiSoundsSystemToggle && window.uiSounds) {
    uiSoundsSystemToggle.checked = window.uiSounds.systemEnabled;
    uiSoundsSystemToggle.addEventListener('change', () => {
      window.uiSounds.setSystemEnabled(uiSoundsSystemToggle.checked);
    });
  }

  // ── Saved Accounts Dropdown ──
  const btnAccountsToggle = $('#btn-accounts-toggle');
  const accountsDropdown  = $('#accounts-dropdown');
  const accountsList      = $('#accounts-list');
  const btnAddAccount     = $('#btn-add-account-action');

  async function populateAccounts() {
    try {
      const list = await window.launcherAPI.getSavedAccounts();
      if (!list || list.length === 0) {
        accountsList.innerHTML = '<div class="players-popup-empty">Немає збережених акаунтів</div>';
        return;
      }
      accountsList.innerHTML = list.map(username => `
        <div class="account-item" data-username="${username.replace(/"/g, '&quot;')}">
          <img class="account-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(username)}/24" onerror="this.src='../../assets/logo.webp'">
          <span class="account-name">${username}</span>
          <button class="account-delete-btn" data-username="${username.replace(/"/g, '&quot;')}" title="Видалити">&times;</button>
        </div>
      `).join('');

      // Add click listener to select account
      accountsList.querySelectorAll('.account-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('account-delete-btn')) return;
          const u = item.dataset.username;
          usernameInput.value = u;
          validateUsername(usernameInput, usernameHint);
          accountsDropdown.style.display = 'none';
          if (window.uiSounds) window.uiSounds.click();
        });
      });

      // Add click listener to delete account
      accountsList.querySelectorAll('.account-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const u = btn.dataset.username;
          if (confirm(`Видалити акаунт ${u} зі списку?`)) {
            await window.launcherAPI.deleteSavedAccount(u);
            populateAccounts();
            if (window.uiSounds) window.uiSounds.click();
          }
        });
      });
    } catch (e) {
      console.error('Failed to populate saved accounts:', e);
    }
  }

  btnAccountsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.uiSounds) window.uiSounds.click();
    if (accountsDropdown.style.display === 'none') {
      populateAccounts();
      accountsDropdown.style.display = 'flex';
    } else {
      accountsDropdown.style.display = 'none';
    }
  });

  btnAddAccount.addEventListener('click', (e) => {
    e.stopPropagation();
    usernameInput.value = '';
    usernameInput.focus();
    validateUsername(usernameInput, usernameHint);
    accountsDropdown.style.display = 'none';
    if (window.uiSounds) window.uiSounds.click();
  });

  // Close accounts dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!accountsDropdown.contains(e.target) && e.target !== btnAccountsToggle && !btnAccountsToggle.contains(e.target)) {
      accountsDropdown.style.display = 'none';
    }
  });

  // ── Screenshots Gallery ──
  const btnScreenshots           = $('#btn-screenshots');
  const screenshotsModal         = $('#screenshots-modal');
  const screenshotsGrid          = $('#screenshots-grid');
  const screenshotsEmpty         = $('#screenshots-empty');
  const btnScreenshotsOpenFolder = $('#btn-screenshots-open-folder');
  const btnScreenshotsClose      = $('#btn-screenshots-close');

  const screenshotViewModal      = $('#screenshot-view-modal');
  const screenshotViewTitle      = $('#screenshot-view-title');
  const screenshotViewCounter    = $('#screenshot-view-counter');
  const screenshotViewAmbient    = $('#screenshot-view-ambient');
  const screenshotViewImg        = $('#screenshot-view-img');
  const btnScreenshotViewDelete  = $('#btn-screenshot-view-delete');
  const btnScreenshotViewCopy    = $('#btn-screenshot-view-copy');
  const btnScreenshotViewClose   = $('#btn-screenshot-view-close');
  const btnScreenshotViewPrev    = $('#btn-screenshot-view-prev');
  const btnScreenshotViewNext    = $('#btn-screenshot-view-next');

  let activeScreenshotName = '';
  let screenshotList = [];

  async function loadScreenshots() {
    try {
      screenshotsGrid.innerHTML = '';
      const list = await window.launcherAPI.listScreenshots();
      if (!list || list.length === 0) {
        screenshotList = [];
        screenshotsGrid.style.display = 'none';
        screenshotsEmpty.style.display = 'flex';
        return;
      }
      screenshotsGrid.style.display = 'grid';
      screenshotsEmpty.style.display = 'none';

      screenshotList = list.map(scr => scr.name);

      list.forEach(scr => {
        const card = document.createElement('div');
        card.className = 'screenshot-card';
        card.dataset.name = scr.name;
        card.innerHTML = `
          <div class="screenshot-img-wrap">
            <img src="" alt="${scr.name}" class="screenshot-thumb">
            <div class="screenshot-card-actions">
              <button class="card-action-btn view-btn" title="Переглянути">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="card-action-btn copy-btn" title="Копіювати">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="card-action-btn delete-btn" title="Видалити">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="screenshot-meta">
            <span class="screenshot-name">${scr.name}</span>
            <span class="screenshot-date">${new Date(scr.birthtime).toLocaleString('uk-UA')}</span>
          </div>
        `;
        screenshotsGrid.appendChild(card);

        // Load thumbnail lazily as base64
        const img = card.querySelector('img');
        window.launcherAPI.readScreenshot(scr.name).then(dataUrl => {
          if (dataUrl) {
            img.src = dataUrl;
          }
        });

        // Click to view large image
        card.addEventListener('click', async (e) => {
          const actionBtn = e.target.closest('.card-action-btn');
          if (actionBtn) {
            if (actionBtn.classList.contains('view-btn')) {
              if (window.uiSounds) window.uiSounds.click();
              openScreenshot(scr.name);
            } else if (actionBtn.classList.contains('copy-btn')) {
              handleCopyFromCard(scr.name, actionBtn);
            } else if (actionBtn.classList.contains('delete-btn')) {
              handleDeleteFromCard(scr.name);
            }
            return;
          }

          if (window.uiSounds) window.uiSounds.click();
          openScreenshot(scr.name);
        });
      });
    } catch (e) {
      console.error('Failed to load screenshots:', e);
    }
  }

  async function handleCopyFromCard(name, btn) {
    if (window.uiSounds) window.uiSounds.click();
    const success = await window.launcherAPI.copyScreenshot(name);
    if (success) {
      const oldHtml = btn.innerHTML;
      btn.style.background = 'var(--leaf)';
      btn.style.borderColor = 'var(--leaf)';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;
      setTimeout(() => {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.innerHTML = oldHtml;
      }, 1500);
    } else {
      alert('Не вдалося скопіювати скриншот.');
    }
  }

  async function handleDeleteFromCard(name) {
    if (confirm(`Ви дійсно бажаєте видалити скриншот ${name}?`)) {
      if (window.uiSounds) window.uiSounds.click();
      const success = await window.launcherAPI.deleteScreenshot(name);
      if (success) {
        loadScreenshots();
      } else {
        alert('Не вдалося видалити файл скриншоту.');
      }
    }
  }

  async function openScreenshot(name) {
    activeScreenshotName = name;
    screenshotViewTitle.textContent = name;

    const idx = screenshotList.indexOf(name);
    if (idx !== -1) {
      screenshotViewCounter.textContent = `${idx + 1} / ${screenshotList.length}`;
    } else {
      screenshotViewCounter.textContent = '';
    }

    screenshotViewImg.src = '';
    screenshotViewAmbient.style.backgroundImage = 'none';
    screenshotViewModal.style.display = 'flex';

    const dataUrl = await window.launcherAPI.readScreenshot(name);
    if (dataUrl) {
      screenshotViewImg.src = dataUrl;
      screenshotViewAmbient.style.backgroundImage = `url("${dataUrl}")`;
    }
  }

  function navigateScreenshot(dir) {
    if (screenshotList.length === 0 || !activeScreenshotName) return;
    let idx = screenshotList.indexOf(activeScreenshotName);
    if (idx === -1) return;

    idx += dir;
    if (idx < 0) {
      idx = screenshotList.length - 1;
    } else if (idx >= screenshotList.length) {
      idx = 0;
    }

    if (window.uiSounds) window.uiSounds.click();
    openScreenshot(screenshotList[idx]);
  }

  btnScreenshots.addEventListener('click', () => {
    if (window.uiSounds) window.uiSounds.modalOpen();
    screenshotsModal.style.display = 'flex';
    loadScreenshots();
  });

  btnScreenshotsClose.addEventListener('click', () => {
    screenshotsModal.style.display = 'none';
  });

  btnScreenshotsOpenFolder.addEventListener('click', () => {
    window.launcherAPI.openScreenshotsFolder();
  });

  screenshotsModal.addEventListener('click', e => {
    if (e.target === screenshotsModal) {
      screenshotsModal.style.display = 'none';
    }
  });

  // View Modal actions
  function closeScreenshotView() {
    screenshotViewModal.style.display = 'none';
    activeScreenshotName = '';
  }

  btnScreenshotViewClose.addEventListener('click', closeScreenshotView);
  
  screenshotViewModal.addEventListener('click', e => {
    if (e.target === screenshotViewModal) {
      closeScreenshotView();
    }
  });

  btnScreenshotViewPrev.addEventListener('click', () => {
    navigateScreenshot(-1);
  });

  btnScreenshotViewNext.addEventListener('click', () => {
    navigateScreenshot(1);
  });

  btnScreenshotViewDelete.addEventListener('click', async () => {
    if (!activeScreenshotName) return;
    if (confirm(`Ви дійсно бажаєте видалити скриншот ${activeScreenshotName}?`)) {
      if (window.uiSounds) window.uiSounds.click();
      const nameToDelete = activeScreenshotName;
      const idx = screenshotList.indexOf(nameToDelete);
      const success = await window.launcherAPI.deleteScreenshot(nameToDelete);
      if (success) {
        screenshotList.splice(idx, 1);
        if (screenshotList.length === 0) {
          closeScreenshotView();
          loadScreenshots();
        } else {
          const nextIdx = idx < screenshotList.length ? idx : screenshotList.length - 1;
          openScreenshot(screenshotList[nextIdx]);
          loadScreenshots();
        }
      } else {
        alert('Не вдалося видалити файл скриншоту.');
      }
    }
  });

  btnScreenshotViewCopy.addEventListener('click', async () => {
    if (!activeScreenshotName) return;
    if (window.uiSounds) window.uiSounds.click();
    const success = await window.launcherAPI.copyScreenshot(activeScreenshotName);
    if (success) {
      const oldText = btnScreenshotViewCopy.textContent;
      btnScreenshotViewCopy.textContent = 'Скопійовано! ✓';
      btnScreenshotViewCopy.style.borderColor = 'var(--leaf)';
      btnScreenshotViewCopy.style.color = 'var(--leaf)';
      setTimeout(() => {
        btnScreenshotViewCopy.textContent = oldText;
        btnScreenshotViewCopy.style.borderColor = '';
        btnScreenshotViewCopy.style.color = '';
      }, 1500);
    } else {
      alert('Не вдалося скопіювати скриншот.');
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (screenshotViewModal.style.display === 'flex') {
      if (e.key === 'ArrowLeft') {
        navigateScreenshot(-1);
      } else if (e.key === 'ArrowRight') {
        navigateScreenshot(1);
      } else if (e.key === 'Escape') {
        closeScreenshotView();
      }
    } else if (screenshotsModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        screenshotsModal.style.display = 'none';
      }
    }
  });
});
