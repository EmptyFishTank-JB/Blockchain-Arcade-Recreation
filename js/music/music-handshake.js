// "HANDSHAKE" — an original 8-bit battle theme in the style of handheld RPG battles from the Game
// Boy era: two pulse channels (a lead with delayed vibrato, and a second voice), a busy 4-bit
// wave-channel bass bouncing in octaves, and a light noise-channel kit, in C minor at 176 BPM.
// Synthesized live with Web Audio like the other tracks.
// 32-bar loop: encounter (the groove, then the main theme), battle (the answer, higher), bridge
// (long vibrato notes over arpeggios), critical (a rising chromatic figure and the turnaround).
// The first time through, a falling chromatic intro run takes the place of the groove's riff.
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createHandshake(ctx, out) {
  const BPM = 176;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Cm = [60, 63, 67], Ab = [56, 60, 63], Bb = [58, 62, 65], G = [55, 59, 62], Eb = [63, 67, 70];
  const Fm = [65, 68, 72], Gm = [55, 58, 62], Db = [61, 65, 68];
  const CHORDS = [
    [Cm, Cm, Cm, Ab, Cm, Ab, Bb, G], // encounter
    [Ab, Bb, Gm, Cm, Ab, Bb, G, G], // battle
    [Eb, Bb, Cm, Ab, Fm, Bb, Eb, G], // bridge
    [Cm, Db, Cm, Db, Cm, Ab, Bb, G], // critical
  ];
  // [step, midi, length in steps] per bar; encounter's first two bars are the groove (no lead)
  const MELODY = [
    [
      [], [],
      [[0, 79, 3], [3, 79, 1], [4, 80, 2], [6, 79, 2], [8, 75, 4], [12, 77, 4]],
      [[0, 79, 6], [6, 77, 2], [8, 75, 2], [10, 74, 2], [12, 72, 4]],
      [[0, 80, 3], [3, 80, 1], [4, 82, 2], [6, 80, 2], [8, 79, 4], [12, 75, 4]],
      [[0, 77, 6], [6, 79, 2], [8, 82, 4], [12, 86, 4]],
      [[0, 84, 3], [3, 84, 1], [4, 83, 2], [6, 84, 2], [8, 87, 4], [12, 86, 4]],
      [[0, 84, 4], [4, 82, 2], [6, 80, 2], [8, 79, 4], [12, 83, 4]],
    ],
    [
      [[0, 84, 4], [4, 82, 4], [8, 80, 4], [12, 79, 4]],
      [[0, 82, 4], [4, 80, 4], [8, 79, 4], [12, 77, 4]],
      [[0, 79, 6], [6, 77, 2], [8, 74, 4], [12, 70, 4]],
      [[0, 72, 12], [12, 75, 4]],
      [[0, 84, 4], [4, 87, 4], [8, 86, 4], [12, 84, 4]],
      [[0, 86, 4], [4, 89, 4], [8, 87, 4], [12, 86, 4]],
      [[0, 83, 6], [6, 84, 2], [8, 86, 4], [12, 83, 4]],
      [[0, 79, 4], [4, 83, 4], [8, 86, 4], [12, 89, 4]],
    ],
    [
      [[0, 79, 16]],
      [[0, 77, 8], [8, 74, 8]],
      [[0, 75, 16]],
      [[0, 72, 8], [8, 75, 8]],
      [[0, 77, 16]],
      [[0, 74, 8], [8, 77, 8]],
      [[0, 79, 12], [12, 82, 4]],
      [[0, 83, 16]],
    ],
    null, // critical: the rising figure, built below
  ];
  // Critical: a figure on a note rising a semitone a bar, then a falling run into the loop
  function criticalBar(i) {
    if (i === 7) return Array.from({ length: 16 }, (_, k) => [k, 86 - k, 1]);
    const n = 72 + i;
    return [n, n + 3, n + 7, n + 3, n + 12, n + 7, n + 3, n + 7].map((m, k) => [k * 2, m, 2]);
  }
  // The groove's riff (encounter's first two bars, after the first time through): stabs on G and C
  const GROOVE = [[0, 67], [3, 72], [6, 67], [8, 70], [11, 72], [14, 67]];

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'energy', label: 'The lead brightens (50% → 25% duty) and its vibrato deepens', from: 0, span: 1 },
    { id: 'drums', label: 'A fuller noise kit: kicks and 16th-note hats', from: 0.05, span: 0.25 },
    { id: 'echo', label: 'An echo of the lead, three 16ths behind on the second pulse', from: 0.05, span: 0.25 },
    { id: 'arps', label: 'Fast "fake chord" arpeggios, three notes a 16th', from: 0.4, span: 0.25 },
    { id: 'harmony', label: 'The second pulse harmonizing the lead a third below', from: 0.4, span: 0.25 },
    { id: 'lowhp', label: 'The low-HP alarm: a rapid two-tone beep', from: 0.72, span: 0.25 },
  ];

  const bus = ctx.createGain();
  bus.gain.value = 0.43; // level-matched to the other tracks
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  bus.connect(comp);
  comp.connect(out);

  // Pulse waves at the Game Boy's duty cycles, built from their Fourier series
  function pulseWave(duty) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }
  const DUTY = { 12: pulseWave(0.125), 25: pulseWave(0.25), 50: pulseWave(0.5) };

  // The wave channel: a 32-sample, 4-bit table (a rounded saw), as its Fourier series
  const WAVE = (() => {
    const N = 32;
    const table = Array.from({ length: N }, (_, k) => Math.round(15 * Math.pow(k / (N - 1), 0.8)) / 7.5 - 1);
    const H = 16;
    const real = new Float32Array(H);
    const imag = new Float32Array(H);
    for (let h = 1; h < H; h++) {
      for (let k = 0; k < N; k++) {
        real[h] += (table[k] * Math.cos((2 * Math.PI * h * k) / N)) / N;
        imag[h] += (table[k] * Math.sin((2 * Math.PI * h * k) / N)) / N;
      }
    }
    return ctx.createPeriodicWave(real, imag);
  })();

  // The noise channel's two modes: long (hissy) and short (metallic, 7-bit)
  function lfsrNoise(short) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let reg = 0x7fff;
    const hold = 4;
    let v = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % hold === 0) {
        const bit = (reg ^ (reg >> 1)) & 1;
        reg = (reg >> 1) | (bit << 14);
        if (short) reg = (reg & ~0x40) | (bit << 6);
        v = reg & 1 ? -1 : 1;
      }
      d[i] = v;
    }
    return buf;
  }
  const NOISE_LONG = lfsrNoise(false);
  const NOISE_SHORT = lfsrNoise(true);

  function envGain(t, peak, decay, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    g.connect(dest);
    return g;
  }

  function noise(t, buf, level, decay, hp) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    src.connect(f); f.connect(envGain(t, level, decay, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + decay);
  }
  const hat = (t, level = 1) => noise(t, NOISE_SHORT, 0.035 * level, 0.03, 6000);
  const snare = (t, level = 1) => noise(t, NOISE_LONG, 0.16 * level, 0.12, 1200);
  const kick = (t, level = 1) => noise(t, NOISE_LONG, 0.2 * level, 0.06, 60);

  // A pulse note; vib: delayed vibrato depth in semitones (on notes long enough to hold)
  function pulse(t, m, dur, level, duty, vib = 0) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(DUTY[duty]);
    osc.frequency.value = freq(m);
    if (vib > 0 && dur > 0.3) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.16);
      depth.gain.linearRampToValueAtTime(freq(m) * (Math.pow(2, vib / 12) - 1), t + 0.35);
      lfo.connect(depth); depth.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.01);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.linearRampToValueAtTime(level * 0.75, t + Math.max(0.005, dur * 0.85));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  function bass(t, m, dur) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(WAVE);
    osc.frequency.value = freq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.setValueAtTime(0.16, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  // A diatonic third below in C minor (with B natural, the leading tone, taking G)
  const SCALE = [0, 2, 3, 5, 7, 8, 10];
  function thirdBelow(m) {
    const pc = ((m % 12) + 12) % 12;
    if (pc === 11) return m - 4;
    const idx = SCALE.indexOf(pc);
    if (idx < 0) return m - 3;
    const target = SCALE[(idx + 5) % 7];
    return m - ((pc - target + 12) % 12);
  }

  return {
    step: STEP,
    loopSteps: 32 * 16,
    layers: LAYERS,
    // solo: a layer id to hear that layer alone at full strength; muted: layer ids to leave out
    // (both from the dev page)
    schedule(step, t, intensity = 0, solo = null, muted = null) {
      const L = {};
      for (const { id, from, span } of LAYERS) {
        L[id] = solo ? Number(id === solo) : Math.max(0, Math.min(1, (intensity - from) / span));
      }
      if (muted && !solo) for (const id of muted) L[id] = 0; // dev page MUTE buttons
      const base = !solo;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 encounter, 1 battle, 2 bridge, 3 critical
      const i = bar % 8;
      const s = step % 16;
      const chord = CHORDS[section][i];
      const root = chord[0] - 24;
      const intro = step < 32; // the first time through, bars 1-2: the falling intro run

      // Wave-channel bass: octave bounce on 8ths, walking up to the next chord every other bar
      if (base && s % 2 === 0) {
        const walk = i % 2 === 1 && s >= 12;
        bass(t, walk ? root + [7, 10][(s - 12) / 2] : root + (s % 4 === 2 ? 12 : 0), STEP * 1.8);
      }

      // Noise kit: hats on 8ths and snare on 2 and 4; the drums layer adds kicks and 16th hats
      if (base && !intro) {
        if (s % 2 === 0) hat(t);
        if (s === 4 || s === 12) snare(t);
      }
      if (L.drums > 0 && !intro) {
        if (s === 0 || s === 6 || s === 8 || (s === 10 && i % 2 === 1)) kick(t, L.drums);
        if (s % 2 === 1) hat(t, 0.7 * L.drums);
      }

      // The lead (pulse 1): 50% duty brightening to 25%, with delayed vibrato
      const duty = L.energy > 0.5 ? 25 : 50;
      const vib = 0.25 + 0.25 * L.energy;
      const notes = section === 3 ? criticalBar(i) : MELODY[section][i];
      for (const [start, m, len] of notes) {
        if (start !== s) continue;
        const dur = len * STEP * 0.95;
        if (base || solo === 'energy') pulse(t, m, dur, 0.05 * (1 + 0.3 * L.energy), duty, vib);
        if (L.echo > 0) pulse(t + STEP * 3, m, dur, 0.036 * L.echo, 12);
        if (L.harmony > 0) pulse(t, thirdBelow(m), dur, 0.035 * L.harmony, 25, vib);
      }

      // Pulse 2: the intro run (first time only), the groove's stabs, and the bridge's arpeggio
      if (base) {
        if (intro) {
          pulse(t, 96 - (step % 32), STEP * 0.9, 0.045, 12);
          pulse(t, 84 - (step % 32), STEP * 0.9, 0.03, 25);
          if (s === 0) snare(t, 0.6);
        } else if (section === 0 && i < 2) {
          for (const [st, m] of GROOVE) if (st === s) pulse(t, m + (i === 1 && st >= 8 ? 1 : 0), STEP * 1.5, 0.04, 25);
        } else if (section === 2) {
          const tones = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12];
          pulse(t, tones[s % 4], STEP * 0.9, 0.03, 12);
        }
      }

      // Fake-chord arpeggios: the chord's three notes in one 16th
      if (L.arps > 0 && !intro) {
        for (let k = 0; k < 3; k++) pulse(t + (k * STEP) / 3, chord[k] + 12, STEP / 3, 0.042 * L.arps, 12);
      }

      // The low-HP alarm: a rapid two-tone beep on every beat
      if (L.lowhp > 0 && s % 4 === 0) {
        pulse(t, 93, STEP * 0.5, 0.04 * L.lowhp, 50);
        pulse(t + STEP * 0.5, 88, STEP * 0.5, 0.04 * L.lowhp, 50);
      }
    },
  };
}
