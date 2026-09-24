// Particle overlay for cleared cells: each one dissolves into pixel fragments
// (left to right) that scatter and fade, with a few hex/binary glyphs drifting
// up out of it. Only animates while particles are alive.
const FX = (() => {
  const canvas = document.getElementById('board-fx');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = { number: '57, 255, 143', hack: '255, 209, 102', firewall: '175, 175, 175' };
  const GLYPHS = '0101010123456789ABCDEF';
  const SPLIT = 5; // fragments per side
  let particles = [];
  let running = false;
  let last = 0;

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  }

  // cells: [{ el, type }] — the DOM cells being cleared
  function burst(cells) {
    if (reduceMotion || !cells.length) return;
    const origin = fit();
    for (const { el, type } of cells) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const x0 = r.left - origin.left;
      const y0 = r.top - origin.top;
      const piece = r.width / SPLIT;
      const cx = x0 + r.width / 2;
      const cy = y0 + r.height / 2;
      const color = COLORS[type] || COLORS.number;
      for (let gx = 0; gx < SPLIT; gx++) {
        for (let gy = 0; gy < SPLIT; gy++) {
          const x = x0 + gx * piece + piece / 2;
          const y = y0 + gy * piece + piece / 2;
          const angle = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.8;
          const speed = 40 + Math.random() * 110;
          particles.push({
            kind: 'frag', x, y, color,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 30,
            size: piece * (0.55 + Math.random() * 0.35),
            delay: gx * 0.03 + Math.random() * 0.03,
            life: 0.45 + Math.random() * 0.35,
            age: 0,
          });
        }
      }
      for (let k = 0; k < 3; k++) {
        particles.push({
          kind: 'glyph', color,
          ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          x: cx + (Math.random() - 0.5) * r.width * 0.6,
          y: cy,
          vx: (Math.random() - 0.5) * 30,
          vy: -35 - Math.random() * 45,
          size: Math.max(9, r.width * 0.22),
          delay: 0.05 + Math.random() * 0.1,
          life: 0.8 + Math.random() * 0.4,
          age: 0,
        });
      }
    }
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    particles = particles.filter((p) => {
      p.age += dt;
      const t = p.age - p.delay;
      if (t < 0) {
        if (p.kind === 'frag') drawFrag(p, 1, p.size);
        return true;
      }
      if (t > p.life) return false;
      const fade = 1 - t / p.life;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + (p.kind === 'frag' ? 60 : 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'frag') drawFrag(p, fade, p.size * (0.4 + 0.6 * fade));
      else {
        ctx.fillStyle = `rgba(${p.color}, ${(0.7 * fade).toFixed(3)})`;
        ctx.font = `bold ${p.size}px 'Courier New', monospace`;
        ctx.fillText(p.ch, p.x, p.y);
      }
      return true;
    });
    ctx.globalCompositeOperation = 'source-over';
    if (particles.length) requestAnimationFrame(frame);
    else {
      running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawFrag(p, alpha, size) {
    ctx.fillStyle = `rgba(${p.color}, ${(0.85 * alpha).toFixed(3)})`;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }

  return { burst };
})();
