// "BRUTE FORCE" — an original 8-bit chiptune track in the style of NES-era
// game music: pulse-wave leads (12.5/25/50% duty), a stepped 4-bit triangle
// bass, sample-and-hold noise drums and fast chord arpeggios. Synthesized
// live with Web Audio like the other tracks.
// 32-bar loop: boot, level 1 (melody A), level 2 (melody B), boss (duet).
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createBruteForce(ctx, out) {
  const BPM = 140;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Em = [64, 67, 71], C = [60, 64, 67], D = [62, 66, 69], Bmaj = [59, 63, 66], Am = [57, 60, 64];
  const SECTION_A = { chords: [Em, C, D, Bmaj, Em, C, Am, Bmaj], roots: [40, 36, 38, 35, 40, 36, 33, 35] };
  const SECTION_B = { chords: [C, D, Em, Em, C, D, Bmaj, Bmaj], roots: [36, 38, 40, 40, 36, 38, 35, 35] };
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  // [step, midi, length in steps] per bar
  const MELODY_A = [
    [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 78, 2], [14, 79, 2]],
    [[0, 76, 6], [6, 72, 2], [8, 76, 4], [12, 79, 4]],
    [[0, 78, 2], [2, 81, 2], [4, 86, 4], [8, 84, 2], [10, 83, 2], [12, 81, 4]],
    [[0, 83, 4], [4, 87, 4], [8, 90, 4], [12, 87, 4]],
    [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 78, 2], [14, 79, 2]],
    [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 76, 2], [8, 79, 4], [12, 84, 4]],
    [[0, 81, 4], [4, 84, 4], [8, 88, 4], [12, 86, 2], [14, 84, 2]],
    [[0, 83, 8], [8, 87, 8]],
  ];
  const MELODY_B = [
    [[0, 84, 8], [8, 83, 4], [12, 79, 4]],
    [[0, 81, 8], [8, 78, 4], [12, 81, 4]],
    [[0, 83, 12], [12, 79, 4]],
    [[0, 76, 16]],
    [[0, 84, 4], [4, 88, 4], [8, 86, 4], [12, 84, 4]],
    [[0, 86, 8], [8, 90, 4], [12, 88, 4]],
    [[0, 87, 8], [8, 83, 8]],
    [[0, 87, 4], [4, 90, 4], [8, 95, 8]],
  ];

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'bright', label: 'The arpeggio gets louder and its pulse narrows (50% → 12.5% duty) for a sharper edge', from: 0, span: 1 },
    { id: 'hats', label: '16th-note noise hi-hats', from: 0.05, span: 0.25 },
    { id: 'arp32', label: 'The arpeggio doubles to 32nd notes', from: 0.4, span: 0.25 },
    { id: 'octave', label: 'The melody doubled an octave up', from: 0.4, span: 0.25 },
    { id: 'battery', label: 'A "low battery" warning beep', from: 0.72, span: 0.25 },
  ];

  const bus = ctx.createGain();
  bus.gain.value = 0.27;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  bus.connect(comp);
  comp.connect(out);

  // Pulse waves at the NES duty cycles, built from their Fourier series
  function pulseWave(duty) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }
  const DUTY = { 12: pulseWave(0.125), 25: pulseWave(0.25), 50: pulseWave(0.5) };

  // 4-bit stepped triangle: 16 output levels like the NES triangle channel
  const triIn = ctx.createGain();
  const stepper = ctx.createWaveShaper();
  const stairs = new Float32Array(1024);
  for (let i = 0; i < stairs.length; i++) {
    const x = (i / (stairs.length - 1)) * 2 - 1;
    stairs[i] = Math.round(x * 7.5) / 7.5;
  }
  stepper.curve = stairs;
  const triOut = ctx.createGain();
  triOut.gain.value = 0.3;
  triIn.connect(stepper);
  stepper.connect(triOut);
  triOut.connect(bus);

  // Sample-and-hold noise, like the NES noise channel (longer hold = lower, grainier)
  function holdNoise(hold) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % hold === 0) v = Math.random() < 0.5 ? -1 : 1;
      d[i] = v;
    }
    return buf;
  }
  const NOISE_LOW = holdNoise(6);
  const NOISE_HIGH = holdNoise(1);

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

  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);
    osc.connect(envGain(t, 0.8 * level, 0.14, bus));
    osc.start(t); osc.stop(t + 0.15);
    noise(t, NOISE_LOW, 0.12 * level, 0.02, 200);
  }

  function snare(t, level = 1) {
    noise(t, NOISE_LOW, 0.26 * level, 0.13, 900);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    osc.connect(envGain(t, 0.3 * level, 0.06, bus));
    osc.start(t); osc.stop(t + 0.07);
  }

  function hat(t, level = 1, open = false) {
    noise(t, NOISE_HIGH, (open ? 0.05 : 0.04) * level, open ? 0.12 : 0.03, 7000);
  }

  function pulse(t, m, dur, level, duty) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(DUTY[duty]);
    osc.frequency.value = freq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.linearRampToValueAtTime(level * 0.7, t + Math.max(0.01, dur * 0.85));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  function bass(t, m, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.setValueAtTime(0.5, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(triIn);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  return {
    step: STEP,
    loopSteps: 32 * 16,
    layers: LAYERS,
    // solo: a layer id to hear that layer alone at full strength (dev page)
    schedule(step, t, intensity = 0, solo = null) {
      const L = {};
      for (const { id, from, span } of LAYERS) {
        L[id] = solo ? Number(id === solo) : Math.max(0, Math.min(1, (intensity - from) / span));
      }
      const base = !solo;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 boot, 1 level 1, 2 level 2, 3 boss
      const i = bar % 8;
      const s = step % 16;
      const { chords, roots } = section === 2 ? SECTION_B : SECTION_A;
      const booting = section === 0 && i < 4;

      // Drums
      if (base && !booting) {
        let kickHit;
        if (section === 0) kickHit = s === 0 || s === 8;
        else if (section === 3) kickHit = s % 4 === 0;
        else if (section === 2) kickHit = s === 0 || s === 6 || s === 8;
        else kickHit = s === 0 || s === 8 || (s === 10 && bar % 2 === 1);
        if (kickHit) kick(t);
        const fill = i === 7 && s >= 8 && section !== 3;
        if (fill) snare(t, 0.4 + 0.6 * ((s - 8) / 7));
        else if (section > 0 && (s === 4 || s === 12)) snare(t);
      }
      let hatHit = false;
      if (section === 0) hatHit = !booting && s % 4 === 2;
      else if (section === 3) hatHit = true;
      else hatHit = s % 2 === 0;
      if (hatHit) { if (base) hat(t, 1, section === 0); }
      else if (L.hats > 0) hat(t, L.hats);

      // Triangle bass: octave bounce on 8ths
      if (base && s % 2 === 0) bass(t, roots[i] + (s % 4 === 2 ? 12 : 0), STEP * 1.9);

      // Arpeggio "fake chords" on a pulse channel
      const tones = [...chords[i], chords[i][0] + 12];
      const arpDuty = L.bright > 0.66 ? 12 : L.bright > 0.33 ? 25 : 50;
      const arpLevel = 0.04 * (1 + 0.8 * L.bright);
      if (base || solo === 'bright') pulse(t, tones[ARP[s % 8]], STEP * 0.9, arpLevel, arpDuty);
      if (L.arp32 > 0) pulse(t + STEP / 2, tones[ARP[(s + 4) % 8]], STEP * 0.45, arpLevel * L.arp32, arpDuty);

      // Melody
      const melody = section === 1 || section === 3 ? MELODY_A : section === 2 ? MELODY_B : null;
      if (melody) {
        for (const [start, m, len] of melody[i]) {
          if (start !== s) continue;
          const dur = len * STEP * 0.95;
          if (base) {
            pulse(t, m, dur, 0.05, section === 2 ? 25 : 12);
            if (section === 3) pulse(t, m - 4, dur, 0.03, 25); // boss duet a third below
          }
          if (L.octave > 0) pulse(t, m + 12, dur, 0.07 * L.octave, 12);
        }
      }

      // "Low battery" beeps: two quick blips on beats 1 and 3
      if (L.battery > 0 && (s === 0 || s === 2 || s === 8 || s === 10)) pulse(t, 100, STEP * 0.5, 0.075 * L.battery, 50);
    },
  };
}
