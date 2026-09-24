// Ambient "defragmenting" micro-grid drawn behind the board. Data blocks are
// shuffled toward the top-left one move at a time while a few shimmer. Before
// a pass finishes, a freshly scattered pass starts and the two crossfade, so
// the cycle reads as one continuous process instead of snapping back.
function startGridBackground(canvas) {
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
    const rect = canvas.getBoundingClientRect();
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

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const offX = (canvas.clientWidth - cols * PITCH + GAP) / 2;
    const offY = (canvas.clientHeight - rows * PITCH + GAP) / 2;
    for (let i = 0; i < size; i++) {
      let alpha = 0;
      for (const { pass, weight } of layers) {
        alpha += weight * ((pass.data[i] ? 0.06 : 0.018) + pass.glow[i] * 0.22);
      }
      ctx.fillStyle = `rgba(57, 255, 143, ${alpha.toFixed(3)})`;
      ctx.fillRect(offX + (i % cols) * PITCH, offY + Math.floor(i / cols) * PITCH, BLOCK, BLOCK);
    }
  }

  function tick(now) {
    const newest = layers[layers.length - 1].pass;
    if (!fadeStart && newest.misplaced <= OVERLAP_MS / TICK_MS) {
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
      step(pass);
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
