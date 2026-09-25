// "DEEP WEB" — an original dark ambient techno track: a muffled four-on-the-
// floor kick and rolling bass under a detuned drone, with data bleeps and
// data chirps drifting through an echo. Synthesized live with Web Audio.
// 32-bar loop: connect, tunnel, deep, surface.
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createDeepWeb(ctx, out) {
  const BPM = 124;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Deterministic pseudo-random per step, so the "random" bleeps repeat every loop
  const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  const Fm = [53, 56, 60], Db = [53, 56, 61], Eb = [55, 58, 63], Bbm = [53, 58, 61], Cmaj = [52, 55, 60];
  const SECTION_A = { chords: [Fm, Fm, Fm, Fm, Db, Db, Eb, Eb], roots: [41, 41, 41, 41, 37, 37, 39, 39] };
  const SECTION_B = { chords: [Bbm, Bbm, Fm, Fm, Db, Db, Cmaj, Cmaj], roots: [46, 46, 41, 41, 37, 37, 36, 36] };
  const BLEEP_NOTES = [77, 80, 82, 84, 87, 89, 92, 96]; // F minor pentatonic, high
  // Acid line: [semitones above the root, accent]
  const ACID = [[0, 1], [0, 0], [12, 0], [0, 0], [3, 1], [0, 0], [15, 0], [0, 0], [0, 1], [7, 0], [0, 0], [10, 0], [0, 1], [12, 0], [3, 0], [5, 0]];

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'bright', label: 'The kick and rolling bass come out of the muffle (lowpass opens)', from: 0, span: 1 },
    { id: 'shaker', label: '16th-note shaker', from: 0.05, span: 0.25 },
    { id: 'acid', label: 'A squelchy acid synth line with accents', from: 0.4, span: 0.25 },
    { id: 'dub', label: 'Dub-techno chord stabs on the offbeats, echoing away', from: 0.72, span: 0.25 },
    { id: 'modem', label: 'The original: a dial-up modem screech on beat 3 of every bar', from: 0.72, span: 0.25, archived: true },
  ];
  // ARCHIVED layers stay here for the dev page's audio compendium but the game never plays them
  const DEFAULT_MUTED = LAYERS.filter((l) => l.archived).map((l) => l.id);

  const bus = ctx.createGain();
  bus.gain.value = 0.22;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  bus.connect(comp);
  comp.connect(out);

  // Dotted-8th echo for the bleeps
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.45;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = 'lowpass';
  delayTone.frequency.value = 2400;
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

  function noiseHit(t, level, decay, type, f, q) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const flt = filter(type, f, q);
    src.connect(flt); flt.connect(envGain(t, level, decay, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + decay);
  }

  function kick(t, open, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    const lp = filter('lowpass', 220 + 4000 * open, 0.7);
    osc.connect(lp); lp.connect(envGain(t, 0.95 * level, 0.3, bus));
    osc.start(t); osc.stop(t + 0.31);
    if (open > 0.05) noiseHit(t, 0.1 * open * level, 0.015, 'highpass', 2500);
  }

  function clap(t) {
    for (const d of [0, 0.012, 0.024]) noiseHit(t + d, 0.16, 0.12, 'bandpass', 1300, 1.2);
  }

  function hat(t, level) {
    noiseHit(t, 0.035 * level, 0.035, 'highpass', 8000);
  }

  function shaker(t, level) {
    noiseHit(t, 0.07 * level, 0.05, 'bandpass', 6000, 0.8);
  }

  function rollingBass(t, m, open) {
    const lp = filter('lowpass', 280 + 1600 * open, 2);
    const g = envGain(t, 0.16, STEP * 0.9, bus);
    lp.connect(g);
    for (const type of ['sine', 'sawtooth']) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq(m);
      osc.connect(lp);
      osc.start(t); osc.stop(t + STEP);
    }
  }

  function drone(t, notes, dur, level) {
    const lp = filter('lowpass', 700);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
    lp.connect(g); g.connect(bus);
    for (const m of notes) {
      for (const cents of [-9, 9]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq(m);
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(t); osc.stop(t + dur + 0.2);
      }
    }
  }

  // Modem bleep: a short sine that glides a little, sent into the echo
  function bleep(t, m, glideUp) {
    const osc = ctx.createOscillator();
    const f = freq(m);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * (glideUp ? 1.5 : 0.66), t + 0.07);
    const g = envGain(t, 0.035, 0.08, bus);
    g.connect(delay);
    osc.connect(g);
    osc.start(t); osc.stop(t + 0.09);
  }

  function pluck(t, m) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 1800);
    osc.connect(lp); lp.connect(envGain(t, 0.03, 0.12, bus)).connect(delay);
    osc.start(t); osc.stop(t + 0.13);
  }

  function acid(t, m, accent, level) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 300, 14);
    lp.frequency.setValueAtTime(300 + (accent ? 2600 : 1200), t);
    lp.frequency.exponentialRampToValueAtTime(280, t + STEP * 0.9);
    osc.connect(lp); lp.connect(envGain(t, (accent ? 0.17 : 0.12) * level, STEP * 0.95, bus));
    osc.start(t); osc.stop(t + STEP);
  }

  // Dub stab: a short, filtered minor chord that rings out through the dotted-8th echo
  function dubStab(t, chord, level) {
    const lp = filter('lowpass', 1500, 3);
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    const g = envGain(t, 0.065 * level, 0.22, bus);
    lp.connect(g);
    g.connect(delay);
    for (const m of chord) {
      for (const cents of [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = cents;
        osc.frequency.value = freq(m + 12);
        osc.connect(lp);
        osc.start(t); osc.stop(t + 0.24);
      }
    }
  }

  // Dial-up handshake: a warbling two-tone carrier with a hiss of noise
  function modem(t, level) {
    const dur = 0.32;
    const carrier = ctx.createOscillator();
    carrier.type = 'square';
    carrier.frequency.value = 1400;
    const warble = ctx.createOscillator();
    warble.type = 'square';
    warble.frequency.value = 36;
    const depth = ctx.createGain();
    depth.gain.value = 500;
    warble.connect(depth); depth.connect(carrier.frequency);
    const bp = filter('bandpass', 1800, 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * level, t + 0.02);
    g.gain.setValueAtTime(0.09 * level, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    carrier.connect(bp); bp.connect(g); g.connect(bus);
    carrier.start(t); carrier.stop(t + dur);
    warble.start(t); warble.stop(t + dur);
    noiseHit(t, 0.07 * level, dur, 'bandpass', 2600, 2);
  }

  return {
    step: STEP,
    loopSteps: 32 * 16,
    layers: LAYERS,
    defaultMuted: DEFAULT_MUTED,
    // solo: a layer id to hear that layer alone at full strength; muted: layer ids to leave out
    // (both from the dev page)
    schedule(step, t, intensity = 0, solo = null, muted = null) {
      const L = {};
      for (const { id, from, span } of LAYERS) {
        L[id] = solo ? Number(id === solo) : Math.max(0, Math.min(1, (intensity - from) / span));
      }
      for (const id of muted || DEFAULT_MUTED) if (!solo) L[id] = 0; // the game leaves ARCHIVED layers out; dev page: its MUTE buttons
      const base = !solo;
      const loopStep = step % (32 * 16);
      const bar = Math.floor(loopStep / 16);
      const section = Math.floor(bar / 8); // 0 connect, 1 tunnel, 2 deep, 3 surface
      const i = bar % 8;
      const s = loopStep % 16;
      const { chords, roots } = section === 2 ? SECTION_B : SECTION_A;
      const root = roots[i];
      const groove = !(section === 0 && i < 4) && !(section === 3 && i < 4);
      const muffle = base || solo === 'bright';

      // Drums
      if (groove && s % 4 === 0 && muffle) kick(t, L.bright);
      if (base && section > 0 && groove && (s === 4 || s === 12)) clap(t);
      const hatHit = groove && s % 4 === 2;
      if (hatHit) { if (base) hat(t, 1); }
      else if (L.shaker > 0) shaker(t, L.shaker);

      // Rolling bass: the three 16ths after each kick
      if (groove && s % 4 !== 0 && muffle) rollingBass(t, root + (s % 4 === 3 ? 12 : 0), L.bright);

      // Drone and texture
      if (base && s === 0 && i % 2 === 0) drone(t, chords[i], STEP * 32, section === 0 || section === 3 ? 0.03 : 0.02);
      if (base && rnd(loopStep) > 0.82) {
        bleep(t, BLEEP_NOTES[Math.floor(rnd(loopStep + 999) * BLEEP_NOTES.length)], rnd(loopStep + 7) > 0.5);
      }
      if (base && section === 2 && s % 3 === 0) pluck(t, chords[i][s % 2] + 24);

      // Intensity layers
      if (L.acid > 0) {
        const [offset, accent] = ACID[s];
        acid(t, root + offset, accent, L.acid);
      }
      if (L.dub > 0 && (s === 2 || s === 10 || (s === 7 && i % 2 === 1))) dubStab(t, chords[i], L.dub);
      if (L.modem > 0 && s === 8) modem(t, L.modem);
    },
  };
}
