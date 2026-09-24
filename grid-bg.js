// Ambient "defragmenting" micro-grid drawn behind the board. Data blocks are
// shuffled toward the top-left one move at a time, a few shimmer at random,
// and once everything is packed the grid scatters and starts over.
function startGridBackground(canvas) {
  const BLOCK = 5; // css px
  const GAP = 2;
  const PITCH = BLOCK + GAP;
  const TICK_MS = 40;
  const FILL = 0.42; // share of blocks that hold "data"
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');

  let cols = 0;
  let rows = 0;
  let data = new Uint8Array(0);
  let glow = new Float32Array(0);
  let writePtr = 0;
  let readPtr = 0;
  let restAt = 0; // timestamp when a finished defrag should scatter again

  function scatter() {
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() < FILL ? 1 : 0;
      if (data[i]) glow[i] = Math.random() * 0.5;
    }
    writePtr = 0;
    readPtr = data.length - 1;
    restAt = 0;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(1, Math.floor(rect.width / PITCH));
    rows = Math.max(1, Math.floor(rect.height / PITCH));
    data = new Uint8Array(cols * rows);
    glow = new Float32Array(cols * rows);
    scatter();
    draw();
  }

  // One defrag move: pull the last data block into the first free slot.
  function step(now) {
    if (restAt) {
      if (now >= restAt) scatter();
      return;
    }
    while (writePtr < data.length && data[writePtr]) writePtr++;
    while (readPtr >= 0 && !data[readPtr]) readPtr--;
    if (writePtr >= readPtr) {
      restAt = now + 2500;
      return;
    }
    data[readPtr] = 0;
    data[writePtr] = 1;
    glow[readPtr] = 0.6;
    glow[writePtr] = 1;
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const offX = (canvas.clientWidth - cols * PITCH + GAP) / 2;
    const offY = (canvas.clientHeight - rows * PITCH + GAP) / 2;
    for (let i = 0; i < data.length; i++) {
      const alpha = (data[i] ? 0.06 : 0.018) + glow[i] * 0.22;
      ctx.fillStyle = `rgba(57, 255, 143, ${alpha.toFixed(3)})`;
      ctx.fillRect(offX + (i % cols) * PITCH, offY + Math.floor(i / cols) * PITCH, BLOCK, BLOCK);
    }
  }

  let last = 0;
  function frame(now) {
    if (now - last >= TICK_MS) {
      last = now;
      step(now);
      for (let i = 0; i < glow.length; i++) glow[i] *= 0.9;
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(Math.random() * data.length);
        if (data[i]) glow[i] = Math.max(glow[i], 0.35);
      }
      draw();
    }
    requestAnimationFrame(frame);
  }

  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  if (!reduceMotion) requestAnimationFrame(frame);
}

startGridBackground(document.getElementById('board-bg'));
