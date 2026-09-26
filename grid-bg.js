// Ambient "defragmenting" micro-grid drawn behind the board. Data blocks are
// shuffled toward the top-left one move at a time while a few shimmer. Before
// a pass finishes, a freshly scattered pass starts and the two crossfade, so
// the cycle reads as one continuous process instead of snapping back.
// { defrag: false } draws only the starlight: the scattered blocks shimmering, never moving
// (the HUD boxes).
function startGridBackground(canvas, { defrag = true } = {}) {
  const BLOCK = 5; // css px
  const GAP = 2;
  const PITCH = BLOCK + GAP;
  const TICK_MS = 40;
  const FILL = 0.42; // share of blocks that hold "data"
  const OVERLAP_MS = 5000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');

  let cols = 0;
  let rows = 0;
  let size = 0;
  let layers = []; // [{ pass, weight }] — oldest first
  let fadeStart = 0; // when the newest layer began fading in; 0 = no crossfade running

  function createPass() {
    const data = new Uint8Array(size);
    const glow = new Float32Array(size);
    let count = 0;
    for (let i = 0; i < size; i++) {
      if (Math.random() < FILL) {
        data[i] = 1;
        count++;
      }
    }
    // Blocks sitting past the packed region; each move fixes exactly one.
    let misplaced = 0;
    for (let i = count; i < size; i++) misplaced += data[i];
    return { data, glow, writePtr: 0, readPtr: size - 1, misplaced };
  }

  // One defrag move: pull the last data block into the first free slot.
  function step(pass) {
    if (!pass.misplaced) return;
    const { data, glow } = pass;
    while (data[pass.writePtr]) pass.writePtr++;
    while (!data[pass.readPtr]) pass.readPtr--;
    data[pass.readPtr] = 0;
    data[pass.writePtr] = 1;
    glow[pass.readPtr] = 0.6;
    glow[pass.writePtr] = 1;
    pass.misplaced--;
  }

  function resize() {
    // (its layout size: a pop-in animation's scale mustn't count)
    const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(1, Math.floor(rect.width / PITCH));
    rows = Math.max(1, Math.floor(rect.height / PITCH));
    size = cols * rows;
    layers = [{ pass: createPass(), weight: 1 }];
    fadeStart = 0;
    draw();
  }

  // SPECTRUM: every block cycles through the hues like the bits do, at its own speed and phase
  const hash = (i, k) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg-rgb').trim() || '57, 255, 143';
    const rainbow = document.documentElement.dataset.theme === 'spectrum';
    // ANAGLYPH: each block drifts between red and cyan at its own speed and phase (like
    // SPECTRUM's hues), over a red fringe on its left and a cyan one on its right, like the bits
    const anaglyph = document.documentElement.dataset.theme === 'anaglyph';
    const secs = performance.now() / 1000;
    const offX = (canvas.clientWidth - cols * PITCH + GAP) / 2;
    const offY = (canvas.clientHeight - rows * PITCH + GAP) / 2;
    for (let i = 0; i < size; i++) {
      let alpha = 0;
      for (const { pass, weight } of layers) {
        alpha += weight * ((pass.data[i] ? 0.06 : 0.018) + pass.glow[i] * 0.22);
      }
      const x = offX + (i % cols) * PITCH;
      const y = offY + Math.floor(i / cols) * PITCH;
      if (anaglyph) {
        const fringe = (alpha * 1.2).toFixed(3);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 40, 80, ${fringe})`;
        ctx.fillRect(x - 1, y, BLOCK, BLOCK);
        ctx.fillStyle = `rgba(0, 220, 255, ${fringe})`;
        ctx.fillRect(x + 1, y, BLOCK, BLOCK);
        ctx.globalCompositeOperation = 'source-over';
        const t = 0.5 + 0.5 * Math.sin(secs * (0.5 + hash(i, 2) * 1.5) + hash(i, 1) * 6.283); // 0 red .. 1 cyan
        ctx.fillStyle = `rgba(${Math.round(255 - 255 * t)}, ${Math.round(40 + 180 * t)}, ${Math.round(80 + 175 * t)}, ${(alpha * 1.3).toFixed(3)})`;
        ctx.fillRect(x, y, BLOCK, BLOCK);
        continue;
      }
      ctx.fillStyle = rainbow
        ? `hsla(${((hash(i, 1) * 360 + secs * (36 + hash(i, 2) * 84)) % 360).toFixed(0)}, 100%, 60%, ${alpha.toFixed(3)})`
        : `rgba(${fg}, ${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, BLOCK, BLOCK);
    }
  }

  function tick(now) {
    const newest = layers[layers.length - 1].pass;
    if (defrag && !fadeStart && newest.misplaced <= OVERLAP_MS / TICK_MS) {
      layers.push({ pass: createPass(), weight: 0 });
      fadeStart = now;
    }
    if (fadeStart) {
      const t = Math.min(1, (now - fadeStart) / OVERLAP_MS);
      layers[0].weight = 1 - t;
      layers[1].weight = t;
      if (t >= 1) {
        layers.shift();
        fadeStart = 0;
      }
    }
    for (const { pass } of layers) {
      if (defrag) step(pass);
      for (let i = 0; i < size; i++) pass.glow[i] *= 0.9;
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(Math.random() * size);
        if (pass.data[i]) pass.glow[i] = Math.max(pass.glow[i], 0.35);
      }
    }
    draw();
  }

  let last = 0;
  function frame(now) {
    if (now - last >= TICK_MS) {
      last = now;
      tick(now);
    }
    requestAnimationFrame(frame);
  }

  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  if (!reduceMotion) requestAnimationFrame(frame);
}

startGridBackground(document.getElementById('board-bg'));
// VS setup: the defrag behind its options (the board's cells are covered)
startGridBackground(document.getElementById('vs-setup-bg'));
// The HUD boxes (SCORE, CHAIN, NEW LAYER IN, CURRENT...): the starlight only
document.querySelectorAll('.hud .stat:not(.cpu-stat)').forEach((stat) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'stat-bg';
  canvas.setAttribute('aria-hidden', 'true');
  stat.prepend(canvas);
  startGridBackground(canvas, { defrag: false });
});
