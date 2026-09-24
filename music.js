// Original synthwave track, synthesized live with Web Audio in the same spirit
// as sfx.js: no audio files, every note is built from oscillators and noise.
// 32-bar loop in four 8-bar sections: intro, melody 1, section B with
// melody 2, then melody 1 doubled an octave up over the driving groove.
// schedule() takes an intensity from 0 to 1 that blends in extra layers
// (four-on-the-floor kick, 16th hats, brighter bass/arp, a tension pulse).

function createSynthwave(ctx, out) {
  const BPM = 108;
  const STEP = 60 / BPM / 4; // one 16th note
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Chord tones voiced for smooth movement between chords
  const Am = [57, 60, 64], F = [57, 60, 65], C = [55, 60, 64], G = [55, 59, 62];
  const Em = [55, 59, 64], E = [56, 59, 64];
  const SECTION_A = { chords: [Am, F, C, G, Am, F, C, E], roots: [45, 41, 48, 43, 45, 41, 48, 40] };
  const SECTION_B = { chords: [F, G, Em, Am, F, G, E, E], roots: [41, 43, 40, 45, 41, 43, 40, 40] };
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  // [step, midi note, length in steps] per bar
  const MELODY_1 = [
    [[0, 76, 4], [4, 72, 2], [6, 74, 2], [8, 76, 8]],
    [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 8]],
    [[0, 72, 4], [4, 74, 2], [6, 76, 2], [8, 79, 4], [12, 76, 4]],
    [[0, 74, 8], [8, 71, 2], [10, 74, 6]],
    [[0, 76, 4], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 81, 4]],
    [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 77, 4], [12, 72, 4]],
    [[0, 76, 4], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
    [[0, 71, 8], [8, 68, 2], [10, 71, 2], [12, 76, 4]],
  ];
  const MELODY_2 = [
    [[0, 81, 8], [8, 79, 4], [12, 77, 4]],
    [[0, 79, 6], [6, 74, 2], [8, 71, 4], [12, 74, 4]],
    [[0, 76, 8], [8, 79, 4], [12, 83, 4]],
    [[0, 81, 12], [12, 76, 4]],
    [[0, 77, 4], [4, 81, 4], [8, 84, 8]],
    [[0, 83, 6], [6, 81, 2], [8, 79, 8]],
    [[0, 80, 8], [8, 76, 4], [12, 71, 4]],
    [[0, 76, 12], [12, 80, 4]],
  ];

  const bus = ctx.createGain();
  bus.gain.value = 0.2;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  bus.connect(comp);
  comp.connect(out);

  // Dotted-8th echo for the arp and lead
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = 'lowpass';
  delayTone.frequency.value = 2500;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  delay.connect(delayTone);
  delayTone.connect(feedback);
  feedback.connect(delay);
  delayTone.connect(wet);
  wet.connect(bus);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
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

  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + 0.36);
  }

  // Gated reverb: a long noise tail that gets chopped off abruptly
  function snare(t, level = 1) {
    const src = noiseSource();
    const bp = filter('bandpass', 1800, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32 * level, t);
    g.gain.linearRampToValueAtTime(0.2 * level, t + 0.14);
    g.gain.linearRampToValueAtTime(0, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(t); src.stop(t + 0.17);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = 190;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.25 * level, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    body.connect(bg); bg.connect(bus);
    body.start(t); body.stop(t + 0.11);
  }

  function hat(t, open, level = 1) {
    const src = noiseSource();
    const hp = filter('highpass', 7000);
    const g = ctx.createGain();
    const dur = open ? 0.18 : 0.04;
    g.gain.setValueAtTime((open ? 0.05 : 0.035) * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  }

  function bass(t, m, dur, bright = 0) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 900, 4);
    lp.frequency.setValueAtTime(900 + 1100 * bright, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp); lp.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  function pad(t, notes, dur) {
    const lp = filter('lowpass', 1400);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.3);
    g.gain.setValueAtTime(0.03, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(bus);
    for (const m of notes) {
      for (const cents of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq(m);
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(t); osc.stop(t + dur);
      }
    }
  }

  function arp(t, m, bright = 0) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 3000 + 3500 * bright);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035 * (1 + 0.6 * bright), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(lp); lp.connect(g); g.connect(bus); g.connect(delay);
    osc.start(t); osc.stop(t + 0.13);
  }

  // Urgent high sawtooth pulse that only sounds as intensity rises
  function tension(t, m, level) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 2800);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.022 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + STEP * 0.9);
    osc.connect(lp); lp.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + STEP);
  }

  function lead(t, m, dur, level = 0.06) {
    const lp = filter('lowpass', 2400);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.02);
    g.gain.setValueAtTime(level, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    lp.connect(g); g.connect(bus); g.connect(delay);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.linearRampToValueAtTime(freq(m) * 0.006, t + Math.min(0.25, dur));
    vib.connect(vibDepth);
    for (const [type, cents] of [['sawtooth', -5], ['square', 5]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq(m);
      osc.detune.value = cents;
      vibDepth.connect(osc.frequency);
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.1);
    }
    vib.start(t); vib.stop(t + dur + 0.1);
  }

  return {
    step: STEP,
    output: bus,
    schedule(step, t, intensity = 0) {
      const I = intensity;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8);
      const i = bar % 8;
      const s = step % 16;
      const { chords, roots } = section === 2 ? SECTION_B : SECTION_A;
      const drive = section >= 2;
      const sparse = section === 0 && i < 4;

      const kickHit = !sparse && (drive ? s % 4 === 0 : s === 0 || s === 8 || (s === 10 && bar % 2 === 1));
      if (kickHit) kick(t);
      else if (s % 4 === 0 && I > 0.05) kick(t, 0.8 * I);
      if (!sparse) {
        if (s === 4 || s === 12) snare(t);
        if (i === 7 && (section === 0 || section === 2) && s > 12) snare(t, 0.4 + (s - 12) * 0.2);
      }
      if (drive || s % 2 === 0) hat(t, s % 4 === 2);
      else if (I > 0.05) hat(t, false, I);
      if (s % 2 === 0) bass(t, roots[i] + (s % 4 === 2 ? 12 : 0), STEP * 1.8, I);
      if (s === 0) pad(t, chords[i], STEP * 16);
      const tones = [...chords[i], chords[i][0] + 12];
      arp(t, tones[ARP[s % 8]] + 12, I);
      if (I > 0.05) tension(t, (s % 2 ? chords[i][2] : chords[i][0]) + 24, I);

      const melody = section === 1 || section === 3 ? MELODY_1 : section === 2 ? MELODY_2 : null;
      if (melody) {
        for (const [start, m, len] of melody[i]) {
          if (start !== s) continue;
          lead(t, m, len * STEP);
          if (section === 3) lead(t, m + 12, len * STEP, 0.025);
        }
      }
    },
  };
}

const Music = (() => {
  const STORAGE_KEY = 'blockchain-music';
  const TRACK_KEY = 'blockchain-track';
  const LOOKAHEAD = 0.12;
  const INTENSITY_EASE = 0.06; // per 16th step, ~2.5s to settle
  // Add future tracks here: each entry's create(ctx, out) returns an engine like createSynthwave's.
  const TRACKS = [
    { id: 'theme', title: 'BLOCKCHAIN THEME', create: createSynthwave },
    { id: 'sleep-mode', title: 'SLEEP MODE', create: createSleepMode },
  ];
  let enabled = true;
  let trackId = TRACKS[0].id;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    const saved = localStorage.getItem(TRACK_KEY);
    if (TRACKS.some((t) => t.id === saved)) trackId = saved;
  } catch (e) {}
  let intensity = 0;
  let targetIntensity = 0;
  let ctx = null;
  let session = null; // per-play gain so stopped notes can't bleed into the next start
  let engine = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;

  function tick() {
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.02;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      intensity += (targetIntensity - intensity) * INTENSITY_EASE;
      engine.schedule(step, nextTime, intensity);
      nextTime += engine.step;
      step++;
    }
  }

  function start() {
    if (timer) return;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
      session = ctx.createGain();
      session.gain.setValueAtTime(0, ctx.currentTime);
      session.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
      session.connect(ctx.destination);
      engine = TRACKS.find((t) => t.id === trackId).create(ctx, session);
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      timer = setInterval(tick, 25);
    } catch (e) {}
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    const old = session;
    old.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => old.disconnect(), 600);
  }

  function unlock() {
    if (enabled) start();
  }
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (!ctx || !timer) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (e) {}
    if (enabled) start();
    else stop();
  }

  return {
    isEnabled: () => enabled,
    toggle() {
      setEnabled(!enabled);
      return enabled;
    },
    tracks: () => TRACKS.map(({ id, title }) => ({ id, title })),
    currentTrack: () => trackId,
    // Selecting a track always starts it, restarting playback if another was playing.
    play(id) {
      if (!TRACKS.some((t) => t.id === id)) return;
      trackId = id;
      try { localStorage.setItem(TRACK_KEY, id); } catch (e) {}
      stop();
      setEnabled(true);
    },
    setIntensity(value) {
      targetIntensity = Math.max(0, Math.min(1, value));
    },
  };
})();
