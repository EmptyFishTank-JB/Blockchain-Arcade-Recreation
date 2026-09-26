// "CORE DUMP" — an original 8-bit tech-death track: distorted pulse-wave guitars (tremolo riffs,
// palm-muted chugs, open-note pitch dives), a square bass, noise-channel blast beats with a china
// cymbal, and 32nd-note sweep arpeggios on a thin 12.5% pulse, in A harmonic minor at 190 BPM.
// Synthesized live with Web Audio like the other tracks.
// 32-bar loop: segfault (tremolo riff, then blasts), stack trace (gallop chugs and the lead),
// overflow (sweep arpeggios over blasts), core dump (half-time breakdown, glitch stutter out).
// schedule() takes an intensity from 0 to 1 and an optional solo layer id. ARCHIVED layers were
// taken out; TRIAL layers are candidates to try on the dev page. The game plays neither.
function createCoreDump(ctx, out) {
  const BPM = 190;
  const STEP = 60 / BPM / 4;
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Tremolo riffs, one 16th per note: [midi, how many 16ths] per bar
  const expand = (runs) => runs.flatMap(([m, n]) => Array(n).fill(m));
  const TREM = {
    p1: expand([[45, 4], [46, 4], [49, 4], [48, 4]]),
    p2: expand([[45, 4], [52, 2], [51, 2], [50, 4], [46, 4]]),
    p3: expand([[45, 2], [57, 2], [56, 2], [45, 2], [53, 2], [52, 2], [46, 2], [49, 2]]),
    p4: expand([[45, 8], [44, 4], [46, 4]]),
  };
  const SEGFAULT = ['p1', 'p2', 'p1', 'p3', 'p1', 'p2', 'p3', 'p4'];
  // Stack trace: the chug roots and the gallop (which 16ths chug)
  const TRACE_ROOTS = [33, 33, 34, 33, 33, 33, 36, 32];
  const GALLOP = [0, 2, 4, 5, 7, 8, 10, 11, 13, 15];
  // The lead over stack trace: [step, midi, length in steps] per bar
  const LEAD = [
    [[0, 81, 4], [4, 80, 2], [6, 77, 2], [8, 76, 6], [14, 77, 2]],
    [[0, 80, 4], [4, 81, 4], [8, 84, 4], [12, 83, 4]],
    [[0, 88, 6], [6, 86, 2], [8, 84, 2], [10, 83, 2], [12, 80, 4]],
    [[0, 81, 12], [12, 76, 4]],
    [[0, 81, 4], [4, 80, 2], [6, 77, 2], [8, 76, 6], [14, 77, 2]],
    [[0, 80, 4], [4, 83, 4], [8, 86, 4], [12, 89, 4]],
    [[0, 88, 4], [4, 87, 2], [6, 88, 2], [8, 92, 4], [12, 91, 4]],
    [[0, 93, 8], [8, 92, 8]],
  ];
  // Overflow: a chord a bar (Am Am B♭ B♭ G♯dim G♯dim Am E), swept up two octaves and back
  const SWEEP_CHORDS = [[57, 60, 64], [57, 60, 64], [58, 62, 65], [58, 62, 65], [56, 59, 62], [56, 59, 62], [57, 60, 64], [52, 56, 59]];
  const sweepTones = ([a, b, c]) => [a, b, c, a + 12, b + 12, c + 12, a + 24, c + 12, b + 12, a + 12, c, b];
  // Core dump: breakdown roots, and the chugs (dropping an octave on the last beat of bars 4 and 8)
  const DUMP_ROOTS = [33, 33, 33, 34, 33, 33, 31, 32];
  const BREAKDOWN = [0, 3, 6, 8, 11, 14];

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'drive', label: 'The guitars get louder and more distorted', from: 0, span: 1 },
    { id: 'china', label: 'China cymbal on every beat', from: 0.05, span: 0.25 },
    { id: 'sweeps', label: 'Sweep arpeggios following the riffs\' chords (a counter-sweep in the sweeps section)', from: 0.4, span: 0.25 },
    { id: 'harmony', label: 'Harmony: the lead a fifth up, fifths over the riffs, the breakdown chugs doubled', from: 0.4, span: 0.25 },
    { id: 'glitch', label: 'The original: a glitching "core dump" alarm on beats 1 and 3', from: 0.72, span: 0.25, archived: true },
    // TRIAL layers: candidates to audition on the dev page (PLAY adds one to the mix); the game
    // leaves them out until they're picked
    { id: 'pinch', label: 'A trial: pinch-harmonic squeals bending up off the open chugs', from: 0.72, span: 0.25, archived: true },
    { id: 'blastfill', label: 'Fills: 8-bit toms tumbling down over 32nd-note kicks into a crash, every 4th bar', from: 0.4, span: 0.25, trial: true },
    { id: 'noodle', label: 'An alien high lead: harmonic-minor 8ths doubled an octave down, with an echo, over the tremolo riff and the breakdown', from: 0.72, span: 0.25, trial: true },
    { id: 'bassdrop', label: 'Bass drops: a noise riser into a distorted 808 boom at each section and under the breakdown\'s dives', from: 0.4, span: 0.25, trial: true },
  ];
  // ARCHIVED and TRIAL layers stay here for the dev page's audio compendium but the game never plays them
  const DEFAULT_MUTED = LAYERS.filter((l) => l.archived || l.trial).map((l) => l.id);
  // The noodle lead: harmonic minor, falling and rising (8ths)
  const NOODLE = [93, 92, 89, 88, 84, 83, 80, 81, 84, 88, 89, 92, 93, 96, 92, 88];

  const bus = ctx.createGain();
  bus.gain.value = 0.24;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 4;
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

  // The guitar: pulse waves through a hard-clipping shaper and a cabinet-ish lowpass
  const gtrIn = ctx.createGain();
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 5);
  }
  clip.curve = curve;
  const cab = ctx.createBiquadFilter();
  cab.type = 'lowpass';
  cab.frequency.value = 3200;
  cab.Q.value = 0.9;
  const gtrOut = ctx.createGain();
  gtrOut.gain.value = 0.28;
  gtrIn.connect(clip);
  clip.connect(cab);
  cab.connect(gtrOut);
  gtrOut.connect(bus);

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
  const NOISE_MID = holdNoise(3);
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

  // Tight enough for 16th-note double kick at 190 BPM
  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.045);
    osc.connect(envGain(t, 0.75 * level, 0.075, bus));
    osc.start(t); osc.stop(t + 0.08);
    noise(t, NOISE_LOW, 0.1 * level, 0.012, 1500);
  }

  function snare(t, level = 1) {
    noise(t, NOISE_MID, 0.22 * level, 0.09, 1100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.04);
    osc.connect(envGain(t, 0.26 * level, 0.05, bus));
    osc.start(t); osc.stop(t + 0.06);
  }

  const ride = (t, level = 1) => noise(t, NOISE_HIGH, 0.035 * level, 0.04, 7500);
  const china = (t, level = 1) => noise(t, NOISE_MID, 0.05 * level, 0.28, 3500);
  const crash = (t) => noise(t, NOISE_HIGH, 0.09, 0.9, 4000);

  function pulse(t, m, dur, level, duty, dest = bus) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(DUTY[duty]);
    osc.frequency.value = freq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.linearRampToValueAtTime(level * 0.7, t + Math.max(0.005, dur * 0.85));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.01);
    return osc;
  }

  // A guitar note: two slightly detuned 25% pulses into the distortion. dive: drop an octave.
  function guitar(t, m, dur, level, dive = false) {
    for (const cents of [-7, 7]) {
      const osc = pulse(t, m, dur, level, 25, gtrIn);
      osc.detune.value = cents;
      if (dive) osc.frequency.exponentialRampToValueAtTime(freq(m - 12), t + dur);
    }
  }

  // The lead: a thin pulse sliding up a semitone into each note
  function lead(t, m, dur, level) {
    const osc = pulse(t, m, dur, level, 12);
    osc.frequency.setValueAtTime(freq(m - 1), t);
    osc.frequency.exponentialRampToValueAtTime(freq(m), t + 0.04);
  }

  const bass = (t, m, dur) => pulse(t, m, dur, 0.09, 50);

  // A bass drop: a distorted 808 boom (a sine falling 120 to 30 Hz, saturated) with an impact hit
  const boomShape = ctx.createWaveShaper();
  const boomCurve = new Float32Array(1024);
  for (let i = 0; i < boomCurve.length; i++) boomCurve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3);
  boomShape.curve = boomCurve;
  const boomOut = ctx.createGain();
  boomOut.gain.value = 0.45;
  boomShape.connect(boomOut);
  boomOut.connect(bus);
  function subDrop(t, level) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 1.6);
    osc.connect(envGain(t, 0.45 * level, 1.8, boomShape));
    osc.start(t); osc.stop(t + 1.85);
    const hit = ctx.createBufferSource();
    hit.buffer = NOISE_LOW;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    hit.connect(lp); lp.connect(envGain(t, 0.3 * level, 0.35, bus));
    hit.start(t); hit.stop(t + 0.35);
  }
  // A noise riser: white noise sweeping up over `dur` into a drop
  function riser(t, dur, level) {
    const src = ctx.createBufferSource();
    src.buffer = NOISE_HIGH;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.exponentialRampToValueAtTime(0.12 * level, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(t); src.stop(t + dur + 0.03);
  }
  // An 8-bit tom: a stepped triangle dropping in pitch
  function tom(t, hz, level) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.12);
    osc.connect(envGain(t, 0.35 * level, 0.14, bus));
    osc.start(t); osc.stop(t + 0.15);
    noise(t, NOISE_LOW, 0.04 * level, 0.03, 600);
  }

  // A pinch harmonic: a squeal two octaves and a fifth up, bending up a whole step with vibrato
  function pinch(t, m, level) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(DUTY[25]);
    osc.frequency.setValueAtTime(freq(m), t);
    osc.frequency.exponentialRampToValueAtTime(freq(m + 2), t + STEP * 2);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = freq(m) * 0.02;
    vib.connect(depth); depth.connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.linearRampToValueAtTime(level * 0.6, t + STEP * 3);
    env.gain.linearRampToValueAtTime(0, t + STEP * 4);
    osc.connect(env); env.connect(gtrIn);
    osc.start(t); osc.stop(t + STEP * 4 + 0.01);
    vib.start(t); vib.stop(t + STEP * 4 + 0.01);
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
      for (const id of muted || DEFAULT_MUTED) if (!solo) L[id] = 0; // the game leaves ARCHIVED and TRIAL layers out; dev page: its MUTE buttons
      const base = !solo;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 segfault, 1 stack trace, 2 overflow, 3 core dump
      const i = bar % 8;
      const s = step % 16;
      const g = 0.05 * (1 + 0.7 * L.drive); // the guitars' level
      // The riff alone before the drums, only the first time through: after that the breakdown's
      // glitch runs straight into the blasts, so the loop never stops
      const firstPass = step < 32 * 16;
      const booting = firstPass && section === 0 && i < 2;

      if (section === 0) {
        // SEGFAULT: tremolo riff, then blast beats (kick and ride with every 8th, snare between)
        const m = TREM[SEGFAULT[i]][s];
        if (base || solo === 'drive') guitar(t, m, STEP * 0.8, g);
        if (base && s % 2 === 0) bass(t, m - 12, STEP * 1.8);
        if (base && !booting) {
          if ((firstPass ? bar === 2 : bar === 0) && s === 0) crash(t);
          if (s % 2 === 0) { kick(t); ride(t); } else snare(t, 0.8);
        }
        if (base && firstPass && i === 1 && s >= 8) snare(t, 0.3 + 0.7 * ((s - 8) / 7)); // roll into the blasts
        if (L.harmony > 0 && !booting) guitar(t, m + 7, STEP * 0.8, g * 0.55 * L.harmony); // fifths over the tremolo
      } else if (section === 1) {
        // STACK TRACE: gallop chugs over 16th double kick, snare on 2 and 4, and the lead
        const root = TRACE_ROOTS[i];
        if (GALLOP.includes(s) && (base || solo === 'drive')) {
          const open = s === 0 || s === 8;
          guitar(t, open ? root + 12 : root, STEP * (open ? 1.7 : 0.55), g * (open ? 1.1 : 0.9));
        }
        if (base) {
          if (i === 0 && s === 0) crash(t);
          kick(t, s % 2 === 0 ? 1 : 0.7);
          if (s === 4 || s === 12) snare(t);
          if (s % 4 === 0) ride(t);
          if (s % 4 === 0) bass(t, root, STEP * 3.6);
        }
        for (const [start, m, len] of LEAD[i]) {
          if (start !== s) continue;
          const dur = len * STEP * 0.95;
          if (base) lead(t, m, dur, 0.05);
          if (L.harmony > 0) {
            lead(t, m + 7, dur, 0.07 * L.harmony);
            pulse(t, m - 5, dur, 0.05 * L.harmony, 25); // and a fourth below, fuller
          }
        }
      } else if (section === 2) {
        // OVERFLOW: 32nd-note sweep arpeggios over blast beats
        const tones = sweepTones(SWEEP_CHORDS[i]);
        if (base) {
          pulse(t, tones[(s * 2) % 12], STEP * 0.48, 0.045, 12);
          pulse(t + STEP / 2, tones[(s * 2 + 1) % 12], STEP * 0.48, 0.045, 12);
          if (i === 0 && s === 0) crash(t);
          if (s % 2 === 0) { kick(t); ride(t); } else snare(t, 0.8);
          if (s % 2 === 0) bass(t, SWEEP_CHORDS[i][0] - 24, STEP * 1.8);
        }
        if (base || solo === 'drive') guitar(t, SWEEP_CHORDS[i][0] - 12, STEP * 0.7, g * 0.7); // tremolo on the root
        if (L.harmony > 0) guitar(t, SWEEP_CHORDS[i][0] - 5, STEP * 0.7, g * 0.5 * L.harmony); // its fifth
      } else {
        // CORE DUMP: half-time breakdown, the chugs diving an octave on the last beat of bars 4 and 8
        const root = DUMP_ROOTS[i];
        const dive = (i === 3 || i === 7) && s === 12;
        const glitchOut = bar === 31 && s >= 8;
        if (glitchOut) {
          // The dump: a stuttering chug, cut shorter and pitched down each 16th, back into the loop
          if (base || solo === 'drive') guitar(t, root + 12 - (s - 8), STEP * 0.3, g * 1.1);
          if (base && s % 2 === 0) kick(t);
          if (base && s === 15) snare(t, 1);
        } else if (dive) {
          if (base || solo === 'drive') guitar(t, root + 12, STEP * 4, g * 1.2, true);
          if (base) { kick(t); china(t); }
          if (L.harmony > 0) guitar(t, root + 24, STEP * 4, g * 0.85 * L.harmony, true);
        } else if (BREAKDOWN.includes(s) && !(s > 12 && (i === 3 || i === 7))) {
          if (base || solo === 'drive') guitar(t, root, STEP * 1.4, g * 1.15);
          if (base) kick(t);
          if (L.harmony > 0) {
            guitar(t, root + 12, STEP * 1.4, g * 0.85 * L.harmony);
            guitar(t, root + 7, STEP * 1.4, g * 0.6 * L.harmony);
          }
        }
        if (base && !glitchOut) {
          if (s === 8) snare(t);
          if (s === 0) { china(t); if (i === 0) crash(t); }
          if (s % 4 === 2) ride(t, 0.8);
          if (s === 0 || s === 8) bass(t, root, STEP * 7);
        }
      }

      // China on every beat (where the breakdown doesn't already hit it)
      if (L.china > 0 && s % 4 === 0 && !booting && !(section === 3 && s === 0)) china(t, 0.6 * L.china);

      // Sweep arpeggios following the riffs: a minor chord on the tremolo's note (changing with it),
      // the stack trace and breakdown roots; the sweeps section gets a counter-sweep going the other way
      if (L.sweeps > 0 && !booting) {
        const root = section === 0 ? TREM[SEGFAULT[i]][s - (s % 4)] - 12 : section === 1 ? TRACE_ROOTS[i] : section === 3 ? DUMP_ROOTS[i] : null;
        if (root !== null) {
          const tones = sweepTones([root + 36, root + 39, root + 43]);
          pulse(t, tones[s % 12] + 12, STEP * 0.9, 0.11 * L.sweeps, 12);
        } else {
          const tones = sweepTones(SWEEP_CHORDS[i]);
          pulse(t, tones[11 - (s % 12)] + 12, STEP * 0.9, 0.09 * L.sweeps, 12);
        }
      }

      // TRIAL: pinch harmonics off the open chugs (stack trace's beats 1 and 3, the breakdown's
      // first chug of every other bar and its dives)
      if (L.pinch > 0) {
        const open = section === 1 && (s === 0 || s === 8) && i % 2 === 1;
        const drop = section === 3 && ((s === 0 && i % 2 === 1) || ((i === 3 || i === 7) && s === 12));
        if (open || drop) pinch(t, (section === 1 ? TRACE_ROOTS[i] : DUMP_ROOTS[i]) + 43, 0.06 * L.pinch);
      }
      // TRIAL: fills over the last two beats of every 4th bar: toms tumbling down over 32nd-note
      // kicks, landing on a crash
      if (L.blastfill > 0 && i % 4 === 3 && s >= 8 && bar !== 31) {
        tom(t, 420 - (s - 8) * 40, L.blastfill);
        if (s % 2 === 1) snare(t, 0.6 * L.blastfill);
        kick(t, 0.8 * L.blastfill); kick(t + STEP / 2, 0.6 * L.blastfill);
        if (s === 15) crash(t + STEP);
      }
      // TRIAL: the noodle lead, 8ths with a quieter echo three 16ths later
      if (L.noodle > 0 && s % 2 === 0 && ((section === 0 && i >= 4) || section === 3) && bar !== 31) {
        const m = NOODLE[(i * 8 + s / 2) % NOODLE.length];
        lead(t, m, STEP * 1.6, 0.1 * L.noodle);
        pulse(t, m - 12, STEP * 1.6, 0.05 * L.noodle, 25); // doubled an octave down
        pulse(t + STEP * 3, m, STEP * 1.2, 0.045 * L.noodle, 12); // the echo
      }
      // TRIAL: bass drops into each section (after the first-pass intro) and under the breakdown's
      // dives, each with a riser over the beat before it
      if (L.bassdrop > 0) {
        const dropAt = (at) => {
          const b = Math.floor(at / 16) % 32;
          const st = at % 16;
          const first = at < 32 * 16;
          return (b % 8 === 0 && st === 0 && !(first && b === 0)) || (first && b === 2 && st === 0) || (b >= 24 && (b % 8 === 3 || b % 8 === 7) && st === 12);
        };
        if (dropAt(step)) subDrop(t, L.bassdrop);
        if (dropAt(step + 4)) riser(t, STEP * 4, L.bassdrop); // a beat before each drop
      }

      // ARCHIVED: the "core dump" alarm, a glitchy triple blip on beats 1 and 3
      if (L.glitch > 0 && (s === 0 || s === 8)) {
        for (let k = 0; k < 3; k++) pulse(t + k * STEP / 3, 96 - k * 5, STEP / 4, 0.07 * L.glitch, 50);
      }
    },
  };
}
