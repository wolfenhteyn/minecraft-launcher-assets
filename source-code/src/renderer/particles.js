// ═══════ Politime Launcher — Multi-Theme Particle System ═══════

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.running = true;
    this.lightningTimer = 0;
    this.lightningBolts = [];
    this.auroraRibbons = [];

    this.resize();
    window.addEventListener('resize', () => this.resize());

    document.querySelector('.app').addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    document.querySelector('.app').addEventListener('mouseleave', () => {
      this.mouseX = -1000;
      this.mouseY = -1000;
    });

    // Theme observer — reinit on change
    this.theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.observer = new MutationObserver(() => {
      const newTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      if (newTheme !== this.theme) {
        this.theme = newTheme;
        this.lightningBolts = [];
        this.auroraRibbons = [];
        this.init();
      }
    });
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    this.init();
    this.animate();
  }

  resize() {
    const app = document.querySelector('.app');
    if (!app) return;
    this.canvas.width = app.offsetWidth;
    this.canvas.height = app.offsetHeight;
  }

  getThemeConfig() {
    const configs = {
      dark: {
        count: 45,
        colors: [
          { r: 255, g: 205, b: 56 },
          { r: 255, g: 140, b: 66 },
          { r: 255, g: 94,  b: 58 },
          { r: 255, g: 107, b: 158 },
        ],
        mode: 'fireflies',
      },
      light: {
        count: 60,
        colors: [
          { r: 0,   g: 112, b: 243 },
          { r: 0,   g: 176, b: 255 },
          { r: 121, g: 40,  b: 202 },
          { r: 0,   g: 223, b: 216 },
        ],
        mode: 'snow',
      },
      forest: {
        count: 50,
        colors: [
          { r: 46,  g: 204, b: 113 },
          { r: 168, g: 224, b: 99  },
          { r: 0,   g: 184, b: 148 },
          { r: 253, g: 203, b: 110 },
        ],
        mode: 'fireflies',
      },
      nebula: {
        count: 65,
        colors: [
          { r: 155, g: 89,  b: 182 },
          { r: 195, g: 155, b: 211 },
          { r: 233, g: 30,  b: 140 },
          { r: 92,  g: 53,  b: 204 },
        ],
        mode: 'stardrift',
      },
      ocean: {
        count: 48,
        colors: [
          { r: 0,   g: 151, b: 178 },
          { r: 0,   g: 201, b: 228 },
          { r: 127, g: 239, b: 255 },
          { r: 0,   g: 81,  b: 162 },
        ],
        mode: 'bubbles',
      },
      cherry: {
        count: 52,
        colors: [
          { r: 233, g: 30,  b: 140 },
          { r: 240, g: 98,  b: 146 },
          { r: 255, g: 183, b: 213 },
          { r: 206, g: 147, b: 216 },
        ],
        mode: 'petals',
      },
      aurora: {
        count: 40,
        colors: [
          { r: 0,   g: 229, b: 176 },
          { r: 0,   g: 255, b: 213 },
          { r: 0,   g: 191, b: 255 },
          { r: 123, g: 47,  b: 190 },
        ],
        mode: 'aurora',
      },
      lava: {
        count: 55,
        colors: [
          { r: 255, g: 61,  b: 0   },
          { r: 255, g: 109, b: 0   },
          { r: 255, g: 214, b: 0   },
          { r: 191, g: 54,  b: 12  },
        ],
        mode: 'embers',
      },
      storm: {
        count: 80,
        colors: [
          { r: 74,  g: 158, b: 255 },
          { r: 130, g: 191, b: 255 },
          { r: 200, g: 230, b: 255 },
          { r: 21,  g: 101, b: 192 },
        ],
        mode: 'rain',
      },
      candy: {
        count: 50,
        colors: [
          { r: 255, g: 110, b: 247 },
          { r: 255, g: 209, b: 102 },
          { r: 6,   g: 214, b: 160 },
          { r: 255, g: 107, b: 107 },
          { r: 184, g: 247, b: 255 },
        ],
        mode: 'candy',
      },
    };
    return configs[this.theme] || configs.dark;
  }

  init() {
    const cfg = this.getThemeConfig();
    this.count = cfg.count;
    this.particles = [];
    for (let i = 0; i < this.count; i++) {
      this.particles.push(this.createParticle(false, cfg));
    }
    // Init aurora ribbons
    if (cfg.mode === 'aurora') {
      this.auroraRibbons = [];
      for (let i = 0; i < 5; i++) {
        this.auroraRibbons.push(this.createAuroraRibbon(cfg, true));
      }
    }
  }

  createAuroraRibbon(cfg, randomOffset = false) {
    const colors = cfg.colors;
    const c = colors[Math.floor(Math.random() * colors.length)];
    return {
      x: randomOffset ? Math.random() * this.canvas.width * 1.5 - this.canvas.width * 0.5 : -this.canvas.width * 0.3,
      y: this.canvas.height * (0.1 + Math.random() * 0.6),
      width: this.canvas.width * (0.3 + Math.random() * 0.5),
      height: 12 + Math.random() * 30,
      speed: 0.15 + Math.random() * 0.35,
      opacity: 0.06 + Math.random() * 0.12,
      color: c,
      wave: Math.random() * Math.PI * 2,
      waveSpeed: 0.008 + Math.random() * 0.012,
      waveAmp: 15 + Math.random() * 40,
    };
  }

  createParticle(fromBottom = false, cfg) {
    if (!cfg) cfg = this.getThemeConfig();
    const mode = cfg.mode;
    const base = {
      x: Math.random() * this.canvas.width,
      y: fromBottom ? this.canvas.height + 10 : Math.random() * this.canvas.height,
      life: Math.random() * 200 + 100,
      maxLife: 0,
      opacity: Math.random() * 0.5 + 0.1,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.03 + 0.01,
      colorIdx: Math.floor(Math.random() * cfg.colors.length),
    };

    if (mode === 'snow') {
      base.y = fromBottom ? -10 : Math.random() * this.canvas.height;
      base.vx = (Math.random() - 0.5) * 0.4;
      base.vy = Math.random() * 0.5 + 0.2;
      base.size = Math.random() * 3 + 1;
      base.opacity = Math.random() * 0.6 + 0.2;
      base.wobble = Math.random() * Math.PI * 2;
      base.wobbleSpeed = Math.random() * 0.02 + 0.005;

    } else if (mode === 'fireflies') {
      base.vx = (Math.random() - 0.5) * 0.3;
      base.vy = -(Math.random() * 0.4 + 0.15);
      base.size = Math.random() * 2.5 + 1;

    } else if (mode === 'stardrift') {
      base.vx = (Math.random() - 0.5) * 0.15;
      base.vy = (Math.random() - 0.5) * 0.15;
      base.size = Math.random() * 1.5 + 0.5;
      base.opacity = Math.random() * 0.8 + 0.2;
      base.twinkleSpeed = Math.random() * 0.06 + 0.02;
      base.life = Math.random() * 400 + 200;

    } else if (mode === 'bubbles') {
      base.vx = (Math.random() - 0.5) * 0.2;
      base.vy = -(Math.random() * 0.3 + 0.1);
      base.size = Math.random() * 4 + 1.5;
      base.wobble = Math.random() * Math.PI * 2;
      base.wobbleSpeed = Math.random() * 0.025 + 0.008;
      base.opacity = Math.random() * 0.3 + 0.05;

    } else if (mode === 'petals') {
      base.vx = (Math.random() - 0.3) * 0.5;
      base.vy = Math.random() * 0.45 + 0.15;
      base.size = Math.random() * 3 + 1.5;
      base.angle = Math.random() * Math.PI * 2;
      base.angleSpeed = (Math.random() - 0.5) * 0.04;
      base.y = fromBottom ? -10 : Math.random() * this.canvas.height;
      base.wobble = Math.random() * Math.PI * 2;
      base.wobbleSpeed = Math.random() * 0.03 + 0.01;
      base.opacity = Math.random() * 0.5 + 0.15;

    } else if (mode === 'aurora') {
      // Small drifting dots for aurora depth
      base.vx = (Math.random() - 0.5) * 0.08;
      base.vy = (Math.random() - 0.5) * 0.05;
      base.size = Math.random() * 1.2 + 0.3;
      base.opacity = Math.random() * 0.4 + 0.05;
      base.twinkleSpeed = Math.random() * 0.04 + 0.01;
      base.life = Math.random() * 600 + 300;

    } else if (mode === 'embers') {
      // Embers: rise fast, drift sideways, flicker
      base.vx = (Math.random() - 0.5) * 0.8;
      base.vy = -(Math.random() * 1.2 + 0.4);
      base.size = Math.random() * 2.5 + 0.5;
      base.opacity = Math.random() * 0.8 + 0.2;
      base.twinkleSpeed = Math.random() * 0.12 + 0.04;
      base.life = Math.random() * 120 + 50;
      base.wobble = Math.random() * Math.PI * 2;
      base.wobbleSpeed = Math.random() * 0.05 + 0.02;
      // Spark trails
      base.trail = [];
      base.trailLen = Math.floor(Math.random() * 6 + 3);

    } else if (mode === 'rain') {
      // Rain: steep diagonal fall
      base.x = Math.random() * (this.canvas.width + 200) - 100;
      base.y = fromBottom ? -20 : Math.random() * this.canvas.height;
      base.vx = -0.6 + (Math.random() - 0.5) * 0.2;
      base.vy = 5 + Math.random() * 4;
      base.length = 8 + Math.random() * 16;
      base.opacity = 0.1 + Math.random() * 0.3;
      base.life = 300;

    } else if (mode === 'candy') {
      // Candy: rotating geometric shapes floating up
      base.vx = (Math.random() - 0.5) * 0.5;
      base.vy = -(Math.random() * 0.35 + 0.1);
      base.size = Math.random() * 6 + 3;
      base.angle = Math.random() * Math.PI * 2;
      base.angleSpeed = (Math.random() - 0.5) * 0.06;
      base.shape = Math.floor(Math.random() * 4); // 0=circle, 1=square, 2=triangle, 3=star
      base.opacity = Math.random() * 0.5 + 0.2;
      base.wobble = Math.random() * Math.PI * 2;
      base.wobbleSpeed = Math.random() * 0.02 + 0.005;
    }

    return base;
  }

  drawStar(ctx, x, y, r, points, alpha, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? r : r * 0.45;
      const a = (i * Math.PI) / points;
      if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
    ctx.fill();
    ctx.restore();
  }

  animate() {
    if (!this.running) return;
    const cfg = this.getThemeConfig();
    const colors = cfg.colors;
    const mode = cfg.mode;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ── Aurora ribbons ──────────────────────────────
    if (mode === 'aurora') {
      for (let i = 0; i < this.auroraRibbons.length; i++) {
        const r = this.auroraRibbons[i];
        r.wave += r.waveSpeed;
        r.x += r.speed;

        const yOff = Math.sin(r.wave) * r.waveAmp;
        const grad = this.ctx.createLinearGradient(r.x, 0, r.x + r.width, 0);
        grad.addColorStop(0, `rgba(${r.color.r},${r.color.g},${r.color.b},0)`);
        grad.addColorStop(0.2, `rgba(${r.color.r},${r.color.g},${r.color.b},${r.opacity})`);
        grad.addColorStop(0.8, `rgba(${r.color.r},${r.color.g},${r.color.b},${r.opacity * 0.7})`);
        grad.addColorStop(1, `rgba(${r.color.r},${r.color.g},${r.color.b},0)`);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.ellipse(r.x + r.width / 2, r.y + yOff, r.width / 2, r.height, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = grad;
        this.ctx.filter = 'blur(8px)';
        this.ctx.fill();
        this.ctx.filter = 'none';
        this.ctx.restore();

        // Respawn ribbon when it scrolls off
        if (r.x > this.canvas.width + 100) {
          this.auroraRibbons[i] = this.createAuroraRibbon(cfg, false);
          this.auroraRibbons[i].x = -this.canvas.width * 0.4;
        }
      }
    }

    // ── Lightning bolts (storm mode) ────────────────
    if (mode === 'rain') {
      this.lightningTimer++;
      // Spawn lightning at random intervals
      if (this.lightningTimer > 60 + Math.random() * 180) {
        this.lightningTimer = 0;
        if (Math.random() > 0.4) {
          this.lightningBolts.push({
            x: Math.random() * this.canvas.width,
            life: 8 + Math.floor(Math.random() * 6),
            maxLife: 14,
            segments: this.generateLightning(
              Math.random() * this.canvas.width,
              0,
              this.canvas.height * (0.3 + Math.random() * 0.5)
            ),
          });
        }
      }
      // Draw + age lightning
      for (let b = this.lightningBolts.length - 1; b >= 0; b--) {
        const bolt = this.lightningBolts[b];
        const bAlpha = (bolt.life / bolt.maxLife) * 0.85;
        this.ctx.save();
        this.ctx.strokeStyle = `rgba(200, 230, 255, ${bAlpha})`;
        this.ctx.lineWidth = bolt.life > bolt.maxLife * 0.6 ? 2 : 1;
        this.ctx.shadowColor = `rgba(100,180,255,${bAlpha * 0.8})`;
        this.ctx.shadowBlur = 12;
        this.ctx.beginPath();
        for (let s = 0; s < bolt.segments.length; s++) {
          if (s === 0) this.ctx.moveTo(bolt.segments[s].x, bolt.segments[s].y);
          else this.ctx.lineTo(bolt.segments[s].x, bolt.segments[s].y);
        }
        this.ctx.stroke();
        this.ctx.restore();
        bolt.life--;
        if (bolt.life <= 0) this.lightningBolts.splice(b, 1);
      }
    }

    // ── Main particles ───────────────────────────────
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.maxLife === 0) p.maxLife = p.life;

      // Movement
      if (mode === 'snow') {
        p.wobble += p.wobbleSpeed;
        p.vx = Math.sin(p.wobble) * 0.3;
        p.x += p.vx;
        p.y += p.vy;

      } else if (mode === 'fireflies') {
        const dx = p.x - this.mouseX;
        const dy = p.y - this.mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80 && dist > 0) {
          const force = (80 - dist) / 80 * 0.5;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.x += p.vx;
        p.y += p.vy;

      } else if (mode === 'stardrift') {
        p.x += p.vx;
        p.y += p.vy;

      } else if (mode === 'bubbles') {
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.3;
        p.y += p.vy;

      } else if (mode === 'petals') {
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.4;
        p.y += p.vy;
        p.angle += p.angleSpeed;

      } else if (mode === 'aurora') {
        p.x += p.vx;
        p.y += p.vy;

      } else if (mode === 'embers') {
        p.wobble += p.wobbleSpeed;
        // Store trail
        if (p.trail) {
          p.trail.unshift({ x: p.x, y: p.y });
          if (p.trail.length > p.trailLen) p.trail.pop();
        }
        p.vx += Math.sin(p.wobble) * 0.02;
        p.vx *= 0.98;
        p.x += p.vx;
        p.y += p.vy;
        // Gravity deceleration
        p.vy *= 0.994;

      } else if (mode === 'rain') {
        p.x += p.vx;
        p.y += p.vy;

      } else if (mode === 'candy') {
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.3;
        p.y += p.vy;
        p.angle += p.angleSpeed;
      }

      p.life--;
      p.twinkle += p.twinkleSpeed;

      const twinkleAlpha = 0.5 + 0.5 * Math.sin(p.twinkle);
      const lifeRatio = p.life / p.maxLife;
      const fadeAlpha = lifeRatio < 0.15 ? lifeRatio / 0.15 : (lifeRatio > 0.85 ? (1 - lifeRatio) / 0.15 : 1);
      const alpha = p.opacity * twinkleAlpha * fadeAlpha;

      const color = colors[p.colorIdx % colors.length];

      // ── Draw by mode ────────────────────────────────
      if (mode === 'snow') {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.12})`;
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
        this.ctx.fill();

      } else if (mode === 'stardrift') {
        const glow = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        glow.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${alpha * 0.9})`);
        glow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        this.ctx.fillStyle = glow;
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        this.ctx.fill();

      } else if (mode === 'bubbles') {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        this.ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.6})`;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        // Specular highlight
        this.ctx.beginPath();
        this.ctx.arc(p.x - p.size * 0.6, p.y - p.size * 0.6, p.size * 0.4, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255,255,255,${alpha * 0.4})`;
        this.ctx.fill();

      } else if (mode === 'petals') {
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.angle);
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, p.size * 1.8, p.size * 0.9, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.7})`;
        this.ctx.fill();
        this.ctx.restore();
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.1})`;
        this.ctx.fill();

      } else if (mode === 'aurora') {
        // Small glowing dot for depth
        const g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${alpha * 0.7})`);
        g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        this.ctx.fillStyle = g;
        this.ctx.fill();

      } else if (mode === 'embers') {
        // Draw trail
        if (p.trail && p.trail.length > 1) {
          for (let t = 0; t < p.trail.length - 1; t++) {
            const tAlpha = alpha * (1 - t / p.trail.length) * 0.5;
            const tSize = p.size * (1 - t / p.trail.length);
            this.ctx.beginPath();
            this.ctx.arc(p.trail[t].x, p.trail[t].y, tSize * 0.8, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${tAlpha})`;
            this.ctx.fill();
          }
        }
        // Ember core: bright hot center
        const eGlow = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        eGlow.addColorStop(0, `rgba(255,255,200,${alpha})`);
        eGlow.addColorStop(0.3, `rgba(${color.r},${color.g},${color.b},${alpha * 0.8})`);
        eGlow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        this.ctx.fillStyle = eGlow;
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255,255,220,${alpha})`;
        this.ctx.fill();

      } else if (mode === 'rain') {
        // Rain streak
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(p.x + p.vx * p.length * 0.5, p.y - p.vy * p.length * 0.15);
        this.ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.7})`;
        this.ctx.lineWidth = 0.7;
        this.ctx.stroke();

      } else if (mode === 'candy') {
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.angle);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.8})`;
        this.ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
        this.ctx.lineWidth = 1;
        if (p.shape === 0) {
          // Circle
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        } else if (p.shape === 1) {
          // Rounded square (manual arc for Electron compat)
          const s = p.size;
          const r = s * 0.4;
          this.ctx.beginPath();
          this.ctx.moveTo(-s + r, -s);
          this.ctx.arcTo(s, -s, s, -s + r, r);
          this.ctx.arcTo(s, s, s - r, s, r);
          this.ctx.arcTo(-s, s, -s, s - r, r);
          this.ctx.arcTo(-s, -s, -s + r, -s, r);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        } else if (p.shape === 2) {
          // Triangle
          this.ctx.beginPath();
          this.ctx.moveTo(0, -p.size);
          this.ctx.lineTo(p.size * 0.87, p.size * 0.5);
          this.ctx.lineTo(-p.size * 0.87, p.size * 0.5);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        } else {
          // Star (drawn in local rotated space)
          const pts = 5;
          const outer = p.size;
          const inner = p.size * 0.45;
          this.ctx.beginPath();
          for (let si = 0; si < pts * 2; si++) {
            const rad = si % 2 === 0 ? outer : inner;
            const a = (si * Math.PI) / pts - Math.PI / 2;
            if (si === 0) this.ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else this.ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
          }
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        }
        this.ctx.restore();
        // Glow halo
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.08})`;
        this.ctx.fill();

      } else {
        // Default: fireflies glow + core
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.15})`;
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
        this.ctx.fill();
      }

      // Respawn
      let dead = false;
      if (mode === 'snow' || mode === 'petals') {
        dead = p.y > this.canvas.height + 20 || p.x < -40 || p.x > this.canvas.width + 40;
      } else if (mode === 'bubbles') {
        dead = p.y < -20;
      } else if (mode === 'embers') {
        dead = p.life <= 0 || p.y < -20;
      } else if (mode === 'rain') {
        dead = p.y > this.canvas.height + 20 || p.x < -100;
      } else if (mode === 'candy') {
        dead = p.life <= 0 || p.y < -30;
      } else {
        dead = p.life <= 0 || p.y < -20 || p.x < -20 || p.x > this.canvas.width + 20;
      }

      if (dead) {
        this.particles[i] = this.createParticle(
          mode === 'fireflies' || mode === 'bubbles' || mode === 'embers', cfg
        );
        if (mode === 'snow' || mode === 'petals' || mode === 'rain') {
          this.particles[i].y = -10;
          this.particles[i].x = Math.random() * (this.canvas.width + 100) - 50;
        }
      }
    }

    requestAnimationFrame(() => this.animate());
  }

  generateLightning(x1, y1, y2) {
    const segs = [{ x: x1, y: y1 }];
    const steps = 10 + Math.floor(Math.random() * 8);
    let cx = x1, cy = y1;
    for (let i = 0; i < steps; i++) {
      cy += (y2 - y1) / steps;
      cx += (Math.random() - 0.5) * 60;
      segs.push({ x: cx, y: cy });
    }
    return segs;
  }

  destroy() {
    this.running = false;
    this.observer.disconnect();
  }
}

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('particles-canvas');
  if (canvas) {
    window.particleSystem = new ParticleSystem(canvas);
  }
});
