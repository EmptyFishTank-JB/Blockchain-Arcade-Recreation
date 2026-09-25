// "SYSTEM RESTORE" — an original lo-fi / chill track: Rhodes-style electric
// piano sevenths with a tape warble, a round upright-style bass, dusty swung
// boom-bap drums and vinyl crackle. Synthesized live with Web Audio.
// 32-bar loop: standby, restore, recovery (flute melody), reboot.
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createSystemRestore(ctx, out) {
  const BPM = 85;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const SWING = STEP * 0.3; // late off-beat 8ths for a lazy feel
  const swing = (s) => (s % 4 === 2 ? SWING : 0);

  const Ebmaj7 = [55, 58, 62, 63], Cm7 = [55, 58, 60, 63], Abmaj7 = [56, 60, 63, 67], Bb7 = [56, 58, 62, 65];
  const Fm7 = [56, 60, 63, 65], Gm7 = [55, 58, 62, 65];
  const SECTION_A = { chords: [Ebmaj7, Cm7, Abmaj7, Bb7, Ebmaj7, Cm7, Abmaj7, Bb7], roots: [39, 36, 44, 46, 39, 36, 44, 46] };
  const SECTION_B = { chords: [Fm7, Bb7, Ebmaj7, Cm7, Abmaj7, Gm7, Fm7, Bb7], roots: [41, 46, 39, 36, 44, 43, 41, 46] };
  // Flute melody for the recovery section: [step, midi, length in steps] per bar
  const FLUTE = [
    [[0, 72, 6], [6, 70, 2], [8, 68, 8]],
    [[0, 70, 4], [4, 74, 4], [8, 72, 8]],
    [[0, 67, 12], [12, 70, 4]],
    [[0, 72, 16]],
    [[0, 75, 6], [6, 74, 2], [8, 72, 8]],
    [[0, 70, 4], [4, 74, 4], [8, 77, 8]],
    [[0, 75, 8], [8, 72, 8]],
    [[0, 74, 8], [8, 70, 8]],
  ];

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'wear', label: 'The tape warble deepens and the vinyl crackle gets louder', from: 0, span: 1 },
    { id: 'stutter', label: 'Glitch stutters: a chopped piano note retriggering at the end of each bar', from: 0.05, span: 0.25 },
    { id: 'grit', label: 'A distorted bass creeping in under the clean one', from: 0.4, span: 0.25 },
    // Stack 6+ options: the game plays TOP_LAYER only; the dev page can audition both
    { id: 'strings', label: 'Tremolo strings: the chords bowed fast, an octave up', from: 0.72, span: 0.25, option: true },
    { id: 'error', label: 'The original: a dissonant tritone "error" bell every two beats', from: 0.72, span: 0.25, option: true },
  ];
  const TOP_LAYER = 'strings';
  // Without the dev page's own MUTE choices, the other option stays silent
  const DEFAULT_MUTED = LAYERS.filter((l) => l.option && l.id !== TOP_LAYER).map((l) => l.id);

  const bus = ctx.createGain();
  bus.gain.value = 0.27;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  const tone = ctx.createBiquadFilter(); // lo-fi: roll off the top end
  tone.type = 'lowpass';
  tone.frequency.value = 7000;
  bus.connect(tone);
  tone.connect(comp);
  comp.connect(out);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Vinyl: a soft hiss with sparse pops and clicks
  const vinyl = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const vd = vinyl.getChannelData(0);
  for (let i = 0; i < vd.length; i++) vd[i] = (Math.random() * 2 - 1) * 0.04;
  for (let k = 0; k < 90; k++) {
    const at = Math.floor(Math.random() * (vd.length - 40));
    const amp = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.7);
    for (let j = 0; j < 30; j++) vd[at + j] += amp * Math.exp(-j / 4);
  }

  // Grit bass: a saw through a soft-clipping shaper
  const gritShaper = ctx.createWaveShaper();
  const gc = new Float32Array(1024);
  for (let i = 0; i < gc.length; i++) {
    const x = (i / (gc.length - 1)) * 2 - 1;
    gc[i] = Math.tanh(6 * x);
  }
  gritShaper.curve = gc;
  const gritTone = ctx.createBiquadFilter();
  gritTone.type = 'lowpass';
  gritTone.frequency.value = 900;
  const gritOut = ctx.createGain();
  gritOut.gain.value = 0.12;
  gritShaper.connect(gritTone);
  gritTone.connect(gritOut);
  gritOut.connect(bus);

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
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const lp = filter('lowpass', 900);
    osc.connect(lp); lp.connect(envGain(t, 0.85 * level, 0.28, bus));
    osc.start(t); osc.stop(t + 0.3);
  }

  function snare(t, level = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = filter('bandpass', 1500, 0.8);
    const lp = filter('lowpass', 3800);
    src.connect(bp); bp.connect(lp); lp.connect(envGain(t, 0.22 * level, 0.18, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + 0.19);
  }

  function hat(t, level = 1) {
    noiseHit(t, 0.03 * level, 0.04, 'bandpass', 7000, 0.9);
  }

  function crackle(t, dur, level) {
    const src = ctx.createBufferSource();
    src.buffer = vinyl;
    src.loop = true;
    const lp = filter('lowpass', 5000);
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(lp); lp.connect(g); g.connect(bus);
    src.start(t, Math.random() * 2); src.stop(t + dur);
  }

  // Electric piano: a sine with a soft octave, a quick bright "tine", and a shared
  // tape-warble LFO on every note's pitch. Notes are strummed slightly.
  function piano(t, notes, dur, warble, level = 1) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.6;
    const depth = ctx.createGain();
    depth.gain.value = 5 + 25 * warble; // cents
    lfo.connect(depth);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    notes.forEach((m, k) => {
      const at = t + k * 0.018;
      const f = freq(m);
      for (const [ratio, amp, decay] of [[1, 1, 2.6], [2, 0.18, 1.2], [7.02, 0.05, 0.12]]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * ratio;
        depth.connect(osc.detune);
        osc.connect(envGain(at, 0.032 * level * amp, Math.min(dur, decay), bus));
        osc.start(at); osc.stop(at + Math.min(dur, decay) + 0.05);
      }
    });
  }

  function bass(t, m, dur) {
    const lp = filter('lowpass', 700);
    const g = envGain(t, 0.28, dur, bus);
    lp.connect(g);
    for (const type of ['sine', 'triangle']) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq(m);
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.02);
    }
  }

  function grit(t, m, dur, level) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(gritShaper);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // Breathy flute: a sine with delayed vibrato and a whisper of noise
  function flute(t, m, dur) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq(m);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vd2 = ctx.createGain();
    vd2.gain.setValueAtTime(0, t);
    vd2.gain.linearRampToValueAtTime(freq(m) * 0.008, t + Math.min(0.4, dur));
    vib.connect(vd2); vd2.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.08);
    g.gain.setValueAtTime(0.05, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur);
    vib.start(t); vib.stop(t + dur);
    const breath = ctx.createBufferSource();
    breath.buffer = noise;
    const bp = filter('bandpass', freq(m) * 2, 3);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.012, t);
    bg.gain.linearRampToValueAtTime(0.004, t + dur);
    breath.connect(bp); bp.connect(bg); bg.connect(bus);
    breath.start(t, Math.random() * 0.4); breath.stop(t + dur);
  }

  function stutter(t, m, level) {
    for (let k = 0; k < 4; k++) {
      const at = t + k * (STEP / 2);
      const osc = ctx.createOscillator();
      osc.frequency.value = freq(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11 * level, at);
      g.gain.setValueAtTime(0, at + STEP * 0.3); // hard gate: the "chopped" sound
      osc.connect(g); g.connect(bus);
      osc.start(at); osc.stop(at + STEP * 0.32);
    }
  }

  // Tremolo strings: the chord bowed an octave up with a fast 16th-note tremolo, a warm
  // saw ensemble (two detuned voices per note) through a soft lowpass
  function strings(t, chord, level) {
    const len = STEP * 16;
    const lp = filter('lowpass', 2600, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < 16; k++) {
      const at = t + k * STEP;
      g.gain.linearRampToValueAtTime(0.024 * level, at + 0.02);
      g.gain.linearRampToValueAtTime(0.0095 * level, at + STEP * 0.9);
    }
    g.gain.linearRampToValueAtTime(0, t + len);
    lp.connect(g); g.connect(bus);
    for (const m of chord) {
      for (const cents of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = cents;
        osc.frequency.value = freq(m + 12);
        osc.connect(lp);
        osc.start(t); osc.stop(t + len);
      }
    }
  }

  // Error chime: a bell on a tritone (A5 + Eb6)
  function errorChime(t, level) {
    for (const m of [81, 87]) {
      for (const [ratio, amp] of [[1, 1], [2.76, 0.3]]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq(m) * ratio;
        osc.connect(envGain(t, 0.08 * level * amp, 0.9, bus));
        osc.start(t); osc.stop(t + 0.95);
      }
    }
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
      for (const id of muted || DEFAULT_MUTED) if (!solo) L[id] = 0; // the game: TOP_LAYER only; dev page: its MUTE buttons
      const base = !solo;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 standby, 1 restore, 2 recovery, 3 reboot
      const i = bar % 8;
      const s = step % 16;
      const { chords, roots } = section === 2 ? SECTION_B : SECTION_A;
      const root = roots[i];
      const standby = section === 0 && i < 4;
      const halftime = section === 3 && i < 4;
      const sw = t + swing(s);

      // Vinyl and piano carry the "wear" layer, so they also play when it's soloed
      const worn = base || solo === 'wear';
      if (worn && s === 0) {
        crackle(t, STEP * 16, 0.25 * (1 + L.wear)); // a little under the music
        piano(t, chords[i], STEP * 16, L.wear);
      }
      if (worn && s === 10 && (section === 1 || section === 2)) piano(sw, chords[i].slice(1), STEP * 6, L.wear, 0.6);

      // Swung boom-bap drums
      if (base && !standby) {
        if (halftime) {
          if (s === 0) kick(t);
          if (s === 8) snare(t, 0.8);
        } else {
          if (s === 0 || s === 10 || (s === 7 && bar % 2 === 1)) kick(t, section === 0 ? 0.7 : 1);
          if (s === 4 || s === 12) snare(t, section === 0 ? 0.7 : 1);
        }
        if (s % 2 === 0) hat(sw, s % 4 === 0 ? 0.7 : 1);
      }

      // Upright bass: root on 1, fifth on the swung "and" of 3
      const bassNotes = { 0: [root, STEP * 7], 10: [root + 7, STEP * 5] };
      if (!standby && bassNotes[s]) {
        const [m, dur] = bassNotes[s];
        if (base) bass(sw, m, dur);
        if (L.grit > 0) grit(sw, m, dur, L.grit);
      }

      if (base && section === 2) {
        for (const [start, m, len] of FLUTE[i]) if (start === s) flute(t, m, len * STEP);
      }

      if (L.stutter > 0 && s === 14) stutter(t, chords[i][chords[i].length - 1] + 12, L.stutter);
      if (L.strings > 0 && s === 0) strings(t, chords[i], L.strings);
      if (L.error > 0 && (s === 0 || s === 8)) errorChime(t, L.error);
    },
  };
}
