// "ZERO DAY" — an original drum & bass track: a two-step breakbeat with ghost
// snares, a detuned "reese" bass with a wobbling filter and sub, and an urgent
// saw pad. Synthesized live with Web Audio.
// 32-bar loop: infiltrate, payload, exploit, escape.
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createZeroDay(ctx, out) {
  const BPM = 172;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Dm = [62, 65, 69], Bb = [58, 62, 65], Cmaj = [60, 64, 67], Gm = [55, 58, 62], Amaj = [57, 61, 64];
  const SECTION_A = { chords: [Dm, Dm, Bb, Cmaj, Dm, Dm, Gm, Amaj], roots: [38, 38, 34, 36, 38, 38, 31, 33] };
  const SECTION_B = { chords: [Bb, Cmaj, Dm, Dm, Bb, Cmaj, Amaj, Amaj], roots: [34, 36, 38, 38, 34, 36, 33, 33] };
  // Lead stabs for the exploit section: [step, midi] per bar
  const LEAD = [
    [[0, 74], [3, 77], [6, 81], [10, 79], [12, 77]],
    [[0, 76], [3, 79], [6, 84], [10, 81], [13, 79]],
    [[0, 77], [3, 81], [6, 86], [10, 84], [12, 81]],
    [[0, 81], [6, 77], [10, 74]],
    [[0, 74], [3, 77], [6, 81], [10, 79], [12, 77]],
    [[0, 76], [3, 79], [6, 84], [10, 81], [13, 79]],
    [[0, 76], [3, 81], [6, 85], [10, 88]],
    [[0, 85], [4, 81], [8, 76], [12, 73]],
  ];

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'bright', label: 'The reese bass filter opens and wobbles harder', from: 0, span: 1 },
    { id: 'hats', label: '16th-note hi-hats', from: 0.05, span: 0.25 },
    { id: 'rollers', label: 'Extra kick and ghost-snare hits for a busier, double-time break', from: 0.4, span: 0.25 },
    { id: 'rave', label: 'Rave stabs: syncopated minor chord hits over the break', from: 0.72, span: 0.25 },
    { id: 'siren', label: 'The original: an air-raid siren rising and falling each bar', from: 0.72, span: 0.25, archived: true },
  ];
  // ARCHIVED layers stay here for the dev page's audio compendium but the game never plays them
  const DEFAULT_MUTED = LAYERS.filter((l) => l.archived).map((l) => l.id);

  const bus = ctx.createGain();
  bus.gain.value = 0.19;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  bus.connect(comp);
  comp.connect(out);

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

  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.06);
    osc.connect(envGain(t, 0.9 * level, 0.2, bus));
    osc.start(t); osc.stop(t + 0.21);
    noiseHit(t, 0.12 * level, 0.012, 'highpass', 3000);
  }

  function snare(t, level = 1) {
    noiseHit(t, 0.3 * level, 0.16, 'bandpass', 1900, 0.9);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(200, t);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.05);
    body.connect(envGain(t, 0.25 * level, 0.08, bus));
    body.start(t); body.stop(t + 0.09);
  }

  function hat(t, level = 1, open = false) {
    noiseHit(t, (open ? 0.045 : 0.035) * level, open ? 0.14 : 0.03, 'highpass', 8500);
  }

  // Reese: two detuned saws beating against each other, a wobbling lowpass, and a sine sub
  function reese(t, m, dur, open) {
    const lp = filter('lowpass', 450 + 1400 * open, 3);
    const wob = ctx.createOscillator();
    wob.frequency.value = 1.2 + 2.4 * open;
    const wobDepth = ctx.createGain();
    wobDepth.gain.value = 220 + 700 * open;
    wob.connect(wobDepth); wobDepth.connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.01);
    g.gain.setValueAtTime(0.1, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(bus);
    for (const cents of [-14, 14]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(m);
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur);
    }
    wob.start(t); wob.stop(t + dur);
    const sub = ctx.createOscillator();
    sub.frequency.value = freq(m - 12);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.15, t + 0.01);
    sg.gain.setValueAtTime(0.15, t + dur - 0.03);
    sg.gain.linearRampToValueAtTime(0, t + dur);
    sub.connect(sg); sg.connect(bus);
    sub.start(t); sub.stop(t + dur);
  }

  function pad(t, notes, dur, level) {
    const lp = filter('lowpass', 1500);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.12);
    g.gain.setValueAtTime(level, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(bus);
    for (const m of notes) {
      for (const cents of [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq(m);
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(t); osc.stop(t + dur);
      }
    }
  }

  function stab(t, m) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 2600);
    osc.connect(lp); lp.connect(envGain(t, 0.05, STEP * 2.5, bus));
    osc.start(t); osc.stop(t + STEP * 2.6);
  }

  // Rave stab: a punchy minor chord hit (detuned square + saw, fast filter drop), the classic
  // jungle / drum & bass "hoover" stab
  function raveStab(t, chord, level) {
    const lp = filter('lowpass', 1200, 2);
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(1000, t + 0.14);
    const g = envGain(t, 0.06 * level, 0.18, bus);
    lp.connect(g);
    for (const m of chord) {
      for (const [type, cents] of [['square', -12], ['sawtooth', 12]]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.detune.value = cents;
        osc.frequency.value = freq(m + 12);
        osc.connect(lp);
        osc.start(t); osc.stop(t + 0.2);
      }
    }
  }

  // Air-raid siren: one rise-and-fall sweep across the bar
  function siren(t, level) {
    const dur = STEP * 16;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.linearRampToValueAtTime(1150, t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(520, t + dur);
    const lp = filter('lowpass', 2400);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * level, t + 0.2);
    g.gain.setValueAtTime(0.06 * level, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(lp); lp.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur);
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
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 infiltrate, 1 payload, 2 exploit, 3 escape
      const i = bar % 8;
      const s = step % 16;
      const { chords, roots } = section === 2 ? SECTION_B : SECTION_A;
      const root = roots[i];
      const drums = !(section === 0 && i < 4) && !(section === 3 && i < 4);

      // Two-step break: kick on 1 and the "and" of 3, snare on 2 and 4, ghosts after
      if (drums) {
        const kickHit = s === 0 || s === 10;
        const snareHit = s === 4 || s === 12;
        const ghost = section >= 1 && (s === 7 || s === 15);
        const roll = i === 7 && (section === 0 || section === 3) && s >= 8;
        if (roll) { if (base) snare(t, 0.35 + 0.65 * ((s - 8) / 7)); }
        else if (kickHit) { if (base) kick(t); }
        else if (snareHit) { if (base) snare(t); }
        else if (ghost) { if (base) snare(t, 0.3); }
        else if (L.rollers > 0 && (s === 2 || s === 6 || s === 9 || s === 11 || s === 14)) {
          if (s === 6 || s === 11) kick(t, 0.7 * L.rollers);
          else snare(t, 0.35 * L.rollers);
        }
      }
      const hatHit = (drums || section === 0) && s % 2 === 0;
      if (hatHit) { if (base) hat(t, s % 4 === 2 ? 1 : 0.6, s === 14); }
      else if (L.hats > 0) hat(t, 2.8 * L.hats);

      // Reese bassline: the root for most of the bar, a fifth on the kick at the "and" of 3
      if ((base || solo === 'bright') && section + i > 0) {
        if (s === 0) reese(t, root, STEP * 10, L.bright);
        else if (s === 10) reese(t, root + 7, STEP * 6, L.bright);
      }

      if (base && s === 0) pad(t, chords[i], STEP * 16, section === 3 && i < 4 ? 0.035 : 0.018);
      if (base && section === 2) {
        for (const [start, m] of LEAD[i]) if (start === s) stab(t, m);
      }
      // 3-3-2 syncopation, with an extra push at the end of every other bar
      if (L.rave > 0 && (s === 0 || s === 3 || s === 6 || (s === 14 && i % 2 === 1))) raveStab(t, chords[i], L.rave);
      if (L.siren > 0 && s === 0) siren(t, L.siren);
    },
  };
}
