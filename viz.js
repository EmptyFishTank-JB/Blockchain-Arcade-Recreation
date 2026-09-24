// Shared music visualizer for the game's playlist and the dev audio page.
// Two styles, switched by clicking: 'bars' (retro LED spectrum with falling
// peak caps) and 'wave' (oscilloscope line with auto-gain and a CRT trail).
// The chosen style is remembered for both pages.
function createVisualizer(canvas, getAnalyser, { bars = 28 } = {}) {
  const MODE_KEY = 'blockchain-viz-mode';
  const SEGMENT = 3; // css px per LED segment, plus a 1px gap
  const g = canvas.getContext('2d');
  const peaks = new Float32Array(bars);
  let freq = null;
  let wave = null;
  let loudness = 0.02; // rolling peak for the wave's auto-gain
  let mode = 'bars';
  try { if (localStorage.getItem(MODE_KEY) === 'wave') mode = 'wave'; } catch (e) {}

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function drawBars(an, w, h) {
    g.clearRect(0, 0, w, h);
    if (an && (!freq || freq.length !== an.frequencyBinCount)) freq = new Uint8Array(an.frequencyBinCount);
    if (an) an.getByteFrequencyData(freq);
    const hzPerBin = an ? an.context.sampleRate / an.fftSize : 1;
    const segments = Math.floor((h + 1) / (SEGMENT + 1));
    const gap = 2;
    const barW = (w - gap * (bars - 1)) / bars;
    for (let b = 0; b < bars; b++) {
      let level = 0;
      if (an) {
        // 40Hz–14kHz, log-spaced so the kick and bass get their own bars
        const lo = 40 * Math.pow(14000 / 40, b / bars);
        const hi = 40 * Math.pow(14000 / 40, (b + 1) / bars);
        const from = Math.max(1, Math.floor(lo / hzPerBin));
        const to = Math.max(from + 1, Math.ceil(hi / hzPerBin));
        let peak = 0;
        for (let i = from; i < to && i < freq.length; i++) peak = Math.max(peak, freq[i]);
        level = Math.min(1, (peak / 255) * (1 + 0.7 * (b / bars))); // lift the quieter treble end
      }
      peaks[b] = Math.max(level, peaks[b] - 0.025);
      const lit = Math.round(level * segments);
      const cap = Math.min(segments - 1, Math.round(peaks[b] * segments));
      const x = b * (barW + gap);
      for (let seg = 0; seg < segments; seg++) {
        const y = h - (seg + 1) * (SEGMENT + 1) + 1;
        if (seg < lit) {
          const hot = seg / segments;
          g.fillStyle = hot > 0.8 ? 'rgba(255, 209, 102, 0.9)' : `rgba(57, 255, 143, ${(0.55 + hot * 0.45).toFixed(2)})`;
        } else if (an && seg === cap && cap > 0) {
          g.fillStyle = 'rgba(255, 209, 102, 0.75)';
        } else {
          g.fillStyle = 'rgba(57, 255, 143, 0.08)';
        }
        g.fillRect(x, y, barW, SEGMENT);
      }
    }
  }

  function drawWave(an, w, h, now) {
    // Fade the previous frame instead of clearing it: a short phosphor trail
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = an ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 1)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    const mid = h / 2;
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.beginPath();
    if (an) {
      if (!wave || wave.length !== an.fftSize) wave = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(wave);
      let max = 0;
      for (let i = 0; i < wave.length; i++) max = Math.max(max, Math.abs(wave[i]));
      loudness = Math.max(max, loudness * 0.97, 0.004);
      const gain = Math.min(14, 0.9 / loudness);
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w;
        const y = mid - wave[i] * gain * mid;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(57, 255, 143, 0.95)';
      g.shadowColor = 'rgba(57, 255, 143, 0.8)';
      g.shadowBlur = 6;
    } else {
      const t = now / 1000;
      for (let x = 0; x <= w; x += 3) {
        const p = x / w;
        const y = mid + Math.sin(p * 12 + t * 1.3) * h * 0.1 * Math.sin(p * 3 + 0.4) + Math.sin(p * 41 + t * 3) * h * 0.02;
        if (x) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(57, 255, 143, 0.3)';
      g.shadowBlur = 0;
    }
    g.stroke();
    g.shadowBlur = 0;
  }

  return {
    get mode() { return mode; },
    toggle() {
      mode = mode === 'bars' ? 'wave' : 'bars';
      try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
      const { w, h } = fit();
      g.clearRect(0, 0, w, h);
      return mode;
    },
    draw(now = performance.now()) {
      const { w, h } = fit();
      const an = getAnalyser();
      if (mode === 'wave') drawWave(an, w, h, now);
      else drawBars(an, w, h);
    },
  };
}
