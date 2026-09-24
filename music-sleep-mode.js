// "SLEEP MODE" — an original electronicore track (trance synths over chugging
// metal guitars) built around the public-domain German lullaby "Schlaf,
// Kindlein, schlaf". The lullaby line here is written on the tune's three-note
// tone set as an approximation. Synthesized live with Web Audio like the theme.
// 32-bar loop: music-box intro, trance build, drop, half-time breakdown.
// schedule() takes an intensity from 0 to 1 for the near-the-line layers.
function createSleepMode(ctx, out) {
  const BPM = 150;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Am F G Am Am F E Am — chug roots (drop-tuned low), pad voicings
  const ROOTS = [33, 29, 31, 33, 33, 29, 28, 33];
  const PADS = [
    [57, 60, 64], [53, 57, 60], [55, 59, 62], [57, 60, 64],
    [57, 60, 64], [53, 57, 60], [52, 56, 59], [57, 60, 64],
  ];
  // Lullaby on la-ti-do in A minor: [step, midi, length in steps] per bar
  const A = 69, B = 71, C = 72;
  const LULLABY = [
    [[0, C, 8], [8, B, 4], [12, C, 4]],
    [[0, A, 16]],
    [[0, B, 4], [4, B, 4], [8, C, 4], [12, C, 4]],
    [[0, A, 16]],
    [[0, C, 2], [2, C, 2], [4, B, 2], [6, B, 2], [8, C, 2], [10, C, 2], [12, B, 2], [14, B, 2]],
    [[0, C, 2], [2, C, 2], [4, B, 2], [6, B, 2], [8, C, 2], [10, C, 2], [12, A, 4]],
    [[0, C, 8], [8, B, 4], [12, C, 4]],
    [[0, A, 16]],
  ];
  const CHUG = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1];
  const BREAK = [0, 3, 6, 10, 12];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

  const bus = ctx.createGain();
  bus.gain.value = 0.17;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  bus.connect(comp);
  comp.connect(out);

  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = 'lowpass';
  delayTone.frequency.value = 3000;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  delay.connect(delayTone);
  delayTone.connect(feedback);
  feedback.connect(delay);
  delayTone.connect(wet);
  wet.connect(bus);

  // One shared amp for every guitar note: drive -> distortion -> cabinet EQ
  const gtrIn = ctx.createGain();
  const drive = ctx.createGain();
  drive.gain.value = 6;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = ((1 + 20) * x) / (1 + 20 * Math.abs(x));
  }
  shaper.curve = curve;
  const cabLow = ctx.createBiquadFilter();
  cabLow.type = 'lowpass';
  cabLow.frequency.value = 2200;
  const cabHigh = ctx.createBiquadFilter();
  cabHigh.type = 'highpass';
  cabHigh.frequency.value = 90;
  const gtrOut = ctx.createGain();
  gtrOut.gain.value = 0.22;
  gtrIn.connect(drive);
  drive.connect(shaper);
  shaper.connect(cabLow);
  cabLow.connect(cabHigh);
  cabHigh.connect(gtrOut);
  gtrOut.connect(bus);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    return src;
  }

  function filter(type, f, q) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = f;
    if (q !== undefined) node.Q.value = q;
    return node;
  }

  function envGain(t, peak, decay, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    g.connect(dest);
    return g;
  }

  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.08);
    osc.connect(envGain(t, 0.9 * level, 0.22, bus));
    osc.start(t); osc.stop(t + 0.23);
    const click = noiseSource();
    const hp = filter('highpass', 3000);
    click.connect(hp); hp.connect(envGain(t, 0.12 * level, 0.012, bus));
    click.start(t, Math.random()); click.stop(t + 0.015);
  }

  function snare(t, level = 1) {
    const src = noiseSource();
    const bp = filter('bandpass', 2000, 0.8);
    src.connect(bp); bp.connect(envGain(t, 0.3 * level, 0.15, bus));
    src.start(t, Math.random()); src.stop(t + 0.16);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = 200;
    body.connect(envGain(t, 0.22 * level, 0.08, bus));
    body.start(t); body.stop(t + 0.09);
  }

  function hat(t, open, level = 1) {
    const src = noiseSource();
    const hp = filter('highpass', 7500);
    const dur = open ? 0.16 : 0.035;
    src.connect(hp); hp.connect(envGain(t, (open ? 0.045 : 0.03) * level, dur, bus));
    src.start(t, Math.random()); src.stop(t + dur);
  }

  function crash(t) {
    const src = noiseSource();
    const hp = filter('highpass', 5000);
    src.connect(hp); hp.connect(envGain(t, 0.06, 1.4, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + 1.4);
  }

  function riser(t, dur) {
    const src = noiseSource();
    const bp = filter('bandpass', 400, 4);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.loop = true;
    src.start(t); src.stop(t + dur);
  }

  // Palm-muted power chord (root + fifth + octave) into the shared amp, plus a sine sub
  function chug(t, root, dur, level = 1) {
    const g = envGain(t, 0.3 * level, dur, gtrIn);
    for (const [semis, cents] of [[0, -6], [7, 5], [12, 0]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(root + semis);
      osc.detune.value = cents;
      osc.connect(g);
      osc.start(t); osc.stop(t + dur + 0.02);
    }
    const sub = ctx.createOscillator();
    sub.frequency.value = freq(root + 12);
    sub.connect(envGain(t, 0.16 * level, dur, bus));
    sub.start(t); sub.stop(t + dur + 0.02);
  }

  function musicBox(t, m, level = 1) {
    const f = freq(m);
    for (const [ratio, amp] of [[1, 1], [2, 0.35], [3, 0.12], [4.2, 0.06]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const g = envGain(t, 0.05 * level * amp, 1.4 / ratio, bus);
      g.connect(delay);
      osc.connect(g);
      osc.start(t); osc.stop(t + 1.5);
    }
  }

  function supersaw(t, m, dur, level, cutoff = 4500) {
    const lp = filter('lowpass', cutoff);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.01);
    g.gain.setValueAtTime(level, t + Math.max(0.01, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    lp.connect(g); g.connect(bus); g.connect(delay);
    for (const cents of [-18, -9, 0, 9, 18]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(m);
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.08);
    }
  }

  function pluck(t, m, bright) {
    const lp = filter('lowpass', 2500 + 4000 * bright);
    lp.connect(envGain(t, 0.03 * (1 + 0.5 * bright), 0.1, bus)).connect(delay);
    for (const cents of [-10, 10]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(m);
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(t); osc.stop(t + 0.11);
    }
  }

  function pad(t, notes, dur, level) {
    const lp = filter('lowpass', 900);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.4);
    g.gain.setValueAtTime(level, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(bus);
    for (const m of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq(m);
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur);
    }
  }

  function alarm(t, m, level) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 3000);
    osc.connect(lp); lp.connect(envGain(t, 0.016 * level, STEP * 0.9, bus));
    osc.start(t); osc.stop(t + STEP);
  }

  return {
    step: STEP,
    loopSteps: 32 * 16,
    output: bus,
    schedule(step, t, intensity = 0) {
      const I = intensity;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 intro, 1 build, 2 drop, 3 breakdown
      const i = bar % 8;
      const s = step % 16;
      const root = ROOTS[i];
      const tones = [...PADS[i], PADS[i][0] + 12];
      cabLow.frequency.setTargetAtTime(2200 + 2600 * I, t, 0.3);

      // Kick
      let kicked = false;
      if (section === 0 && i >= 4 && s === 0) { kick(t, 0.6); kicked = true; }
      if (section === 1 && s % 4 === 0) { kick(t); kicked = true; }
      if (section === 2) { kick(t, s % 4 === 0 ? 1 : 0.55); kicked = true; }
      if (section === 3 && BREAK.includes(s)) { kick(t); kicked = true; }
      if (!kicked && I > 0.05) kick(t, 0.5 * I);

      // Snare
      if (section === 1 && i === 7) snare(t, 0.3 + 0.7 * (s / 15));
      else if ((section === 1 && i >= 4) || section === 2) { if (s === 4 || s === 12) snare(t); }
      else if (section === 3 && s === 8) snare(t);

      // Hats and cymbals
      if (section === 0 && i >= 4 && s % 4 === 2) hat(t, true, 0.6);
      else if (section === 1 && s % 4 === 2) hat(t, true);
      else if (section === 2 && s % 2 === 0) hat(t, false);
      else if (section === 3 && s % 4 === 0) hat(t, true, 0.8);
      else if (I > 0.05) hat(t, false, I);
      if (s === 0 && ((section === 1 && i === 0) || (section === 2 && i % 4 === 0) || (section === 3 && i % 2 === 0))) crash(t);
      if (section === 1 && i === 6 && s === 0) riser(t, STEP * 32);

      // Guitars
      if (section === 0 && i >= 4 && s === 0) chug(t, root, STEP * 6, 0.6);
      else if (section === 2 && CHUG[s]) chug(t, root, STEP * 0.9);
      else if (section === 3 && BREAK.includes(s)) chug(t, root, STEP * 2.5, 1.1);
      else if (section <= 1 && I > 0.05 && s % 2 === 0) chug(t, root, STEP * 0.9, 0.7 * I);

      // Synths
      if (s === 0 && section !== 2) pad(t, PADS[i], STEP * 16, section === 1 ? 0.02 : 0.03);
      if (section === 1 || section === 2) pluck(t, tones[ARP[s % 8]] + 24, I);
      if (I > 0.05 && s % 2 === 0) alarm(t, s % 4 ? 84 : 81, I);

      // Lullaby
      for (const [start, m, len] of LULLABY[i]) {
        if (start !== s) continue;
        if (section === 0) musicBox(t, m);
        else if (section === 3) musicBox(t, m + 12, 0.8);
        else supersaw(t, m + 12, len * STEP, section === 2 ? 0.035 : 0.03);
      }
    },
  };
}
