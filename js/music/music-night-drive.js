// "NIGHT DRIVE" — an original outrun / synthwave track: a pumping 16th-note
// octave bass that ducks under every kick, wide detuned saw pads, a gated-reverb
// snare with tom fills, a bright arpeggio and a gliding lead, both through a
// dotted-8th echo. Synthesized live with Web Audio.
// 32-bar loop: ignition, cruise, neon (lead melody), overdrive (doubled lead).
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createNightDrive(ctx, out) {
  const BPM = 100;
  const STEP = 60 / BPM / 4; // one 16th note
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // F# minor. Pad voicings (4 notes) and bass roots per bar.
  const Fsm = [54, 57, 61, 66], D = [54, 57, 62, 66], A = [52, 57, 61, 64], E = [52, 56, 59, 64];
  const Csm = [56, 61, 64, 68];
  const SECTION_A = { chords: [Fsm, D, A, E, Fsm, D, A, E], roots: [42, 38, 45, 40, 42, 38, 45, 40] };
  const SECTION_B = { chords: [D, E, Csm, Fsm, D, E, A, E], roots: [38, 40, 37, 42, 38, 40, 45, 40] };
  // Lead melody for neon and overdrive: [step, midi, length in steps] per bar
  const LEAD = [
    [[0, 73, 6], [6, 74, 2], [8, 76, 8]],
    [[0, 76, 4], [4, 74, 4], [8, 71, 8]],
    [[0, 73, 12], [12, 76, 4]],
    [[0, 78, 16]],
    [[0, 81, 6], [6, 78, 2], [8, 76, 8]],
    [[0, 76, 4], [4, 78, 4], [8, 80, 8]],
    [[0, 81, 8], [8, 76, 8]],
    [[0, 80, 12], [12, 78, 4]],
  ];
  const ARP = [0, 1, 2, 3, 1, 2, 3, 4]; // index 4 = the top note an octave up

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'glow', label: 'The pads, bass and arpeggio open up and brighten', from: 0, span: 1 },
    { id: 'drive', label: 'Driving 16th-note hi-hats and a tambourine on 2 and 4', from: 0.05, span: 0.25 },
    { id: 'countdown', label: 'Countdown: a clock ticking every beat over a low heartbeat', from: 0.05, span: 0.25 },
    { id: 'brass', label: 'Brass: bright 80s synth-brass chord stabs on the offbeats', from: 0.05, span: 0.25 },
    { id: 'turbo', label: 'Four-on-the-floor kicks and an overdriven bass under the clean one', from: 0.4, span: 0.25 },
    { id: 'choir', label: 'Choir: a swelling "ahh" choir pad behind everything', from: 0.4, span: 0.25 },
    { id: 'riser', label: 'Riser: a white-noise sweep building over two bars into a crash', from: 0.4, span: 0.25 },
    { id: 'chase', label: 'Chase: a second arpeggio racing at 32nd notes, two octaves up', from: 0.72, span: 0.25 },
    { id: 'siren', label: 'The original: a wailing siren lead sweeping over the top', from: 0.72, span: 0.25, archived: true },
  ];
  // ARCHIVED layers stay here for the dev page's audio compendium but the game never plays them
  const DEFAULT_MUTED = LAYERS.filter((l) => l.archived).map((l) => l.id);

  const bus = ctx.createGain();
  bus.gain.value = 0.068; // level-matched to the other tracks
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  bus.connect(comp);
  comp.connect(out);

  // Pads and bass run through a "sidechain" gain that dips on every kick: the pumping feel
  const duck = ctx.createGain();
  duck.connect(bus);

  // Dotted-8th echo for the arpeggio and lead
  const echoIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 3200;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  echoIn.connect(delay);
  delay.connect(echoTone);
  echoTone.connect(fb);
  fb.connect(delay);
  echoTone.connect(wet);
  wet.connect(bus);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Overdrive for the turbo bass
  const driveShaper = ctx.createWaveShaper();
  const dc = new Float32Array(1024);
  for (let i = 0; i < dc.length; i++) {
    const x = (i / (dc.length - 1)) * 2 - 1;
    dc[i] = Math.tanh(5 * x);
  }
  driveShaper.curve = dc;
  const driveTone = ctx.createBiquadFilter();
  driveTone.type = 'lowpass';
  driveTone.frequency.value = 1400;
  const driveOut = ctx.createGain();
  driveOut.gain.value = 0.1;
  driveShaper.connect(driveTone);
  driveTone.connect(driveOut);
  driveOut.connect(duck);

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

  function pump(t) {
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.35, t);
    duck.gain.linearRampToValueAtTime(1, t + STEP * 2.6);
  }

  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    osc.connect(envGain(t, 0.9 * level, 0.32, bus));
    osc.start(t); osc.stop(t + 0.34);
    const click = ctx.createBufferSource();
    click.buffer = noise;
    const hp = filter('highpass', 3000);
    click.connect(hp); hp.connect(envGain(t, 0.08 * level, 0.015, bus));
    click.start(t); click.stop(t + 0.02);
    pump(t);
  }

  // The 80s gated-reverb snare: a short body plus a burst of bright noise that holds,
  // then is cut off abruptly (the "gate") instead of fading away
  function gatedHit(t, level, bodyHz, noiseHz, hold) {
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(bodyHz * 1.4, t);
    body.frequency.exponentialRampToValueAtTime(bodyHz, t + 0.05);
    body.connect(envGain(t, 0.35 * level, 0.12, bus));
    body.start(t); body.stop(t + 0.14);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = filter('bandpass', noiseHz, 0.6);
    const lp = filter('lowpass', 8000);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * level, t);
    g.gain.linearRampToValueAtTime(0.17 * level, t + hold);
    g.gain.linearRampToValueAtTime(0, t + hold + 0.02);
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + hold + 0.03);
  }
  const snare = (t, level = 1) => gatedHit(t, level, 190, 2200, 0.24);
  const tom = (t, hz) => gatedHit(t, 0.9, hz, 500, 0.18);

  function hat(t, level = 1, open = false) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = filter('highpass', 8000);
    src.connect(hp); hp.connect(envGain(t, 0.05 * level, open ? 0.16 : 0.035, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + 0.2);
  }

  function tambourine(t, level) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = filter('bandpass', 9500, 2);
    src.connect(bp); bp.connect(envGain(t, 0.12 * level, 0.12, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + 0.13);
  }

  // Wide pad: three detuned saws per note, a slow swell, filtered brighter with the glow
  function pad(t, notes, dur, glow) {
    const lp = filter('lowpass', 1100 + 2800 * glow, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.35);
    g.gain.setValueAtTime(0.022, t + dur - 0.25);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(duck);
    for (const m of notes) {
      for (const cents of [-11, 0, 11]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq(m);
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(t); osc.stop(t + dur + 0.02);
      }
    }
  }

  // Pumping octave bass: a plucky filtered saw on every 16th, root and octave in turn
  function bass(t, m, glow) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 500, 4);
    lp.frequency.setValueAtTime(700 + 1200 * glow, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + STEP * 0.9);
    osc.connect(lp); lp.connect(envGain(t, 0.2, STEP * 0.95, duck));
    osc.start(t); osc.stop(t + STEP);
  }

  function turboBass(t, m, level) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 3.8);
    osc.connect(g); g.connect(driveShaper);
    osc.start(t); osc.stop(t + STEP * 4);
  }

  // Bright arpeggio: a square pluck, dry plus the echo
  function arp(t, m, glow) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq(m);
    const lp = filter('lowpass', 2200 + 3000 * glow);
    const g = envGain(t, 0.035, STEP * 1.6, bus);
    osc.connect(lp); lp.connect(g); lp.connect(echoIn);
    osc.start(t); osc.stop(t + STEP * 1.7);
  }

  // Gliding lead: two detuned saws that slide into each note, with delayed vibrato
  let lastLead = null;
  // glideFrom: the note to slide from (the previous lead note); remember: update it (off for doubles)
  function lead(t, m, dur, level = 1, glideFrom = lastLead, remember = true) {
    const lp = filter('lowpass', 3400, 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * level, t + 0.03);
    g.gain.setValueAtTime(0.05 * level, t + dur - 0.06);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(bus); g.connect(echoIn);
    const from = glideFrom === null ? m : glideFrom;
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(freq(from), t);
      osc.frequency.exponentialRampToValueAtTime(freq(m), t + 0.07); // portamento
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq(m) * 0.012, t + Math.min(0.5, dur));
      vib.connect(depth); depth.connect(osc.frequency);
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur);
      vib.start(t); vib.stop(t + dur);
    }
    if (remember) lastLead = m;
  }


  // Chase: a second arpeggio at 32nd notes racing two octaves up
  function chase(t, chord, s, level) {
    const tones = [...chord, chord[1] + 12, chord[2] + 12].map((m) => m + 24);
    for (const half of [0, 1]) {
      const at = t + half * (STEP / 2);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq(tones[(s * 2 + half) % tones.length]);
      const lp = filter('lowpass', 3800);
      osc.connect(lp); lp.connect(envGain(at, 0.15 * level, STEP * 0.45, bus));
      osc.start(at); osc.stop(at + STEP * 0.5);
    }
  }

  // Countdown: a dry clock tick on every beat over a low heartbeat (lub-dub)
  function tick(t, beat, level) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = beat % 2 ? 2400 : 1800; // tick, tock
    const hp = filter('highpass', 1200);
    osc.connect(hp); hp.connect(envGain(t, 0.16 * level, 0.035, bus));
    osc.start(t); osc.stop(t + 0.04);
  }
  function heartbeat(t, level) {
    for (const [at, amp] of [[0, 1], [0.16, 0.7]]) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(70, t + at);
      osc.frequency.exponentialRampToValueAtTime(42, t + at + 0.12);
      osc.connect(envGain(t + at, 0.9 * level * amp, 0.18, bus));
      osc.start(t + at); osc.stop(t + at + 0.18);
    }
  }

  // Brass: bright 80s synth-brass chord stabs with a quick filter swell
  function brass(t, chord, level) {
    const lp = filter('lowpass', 900, 1.5);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(4200, t + 0.03);
    lp.frequency.exponentialRampToValueAtTime(1100, t + 0.3);
    const g = envGain(t, 0.14 * level, 0.32, bus);
    lp.connect(g);
    for (const m of chord) {
      for (const cents of [-9, 9]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = cents;
        osc.frequency.value = freq(m + 12);
        osc.connect(lp);
        osc.start(t); osc.stop(t + 0.34);
      }
    }
  }

  // Riser: white noise sweeping up across two bars, then a crash on the next downbeat
  function riser(t, level) {
    const len = STEP * 32;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = filter('bandpass', 400, 3);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * level, t + len - 0.02);
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(t); src.stop(t + len);
  }
  function crash(t, level) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = filter('highpass', 5000);
    src.connect(hp); hp.connect(envGain(t, 0.3 * level, 1.4, bus));
    src.start(t); src.stop(t + 1.45);
  }

  // Choir: an "ahh" pad, buzzy saws shaped by vowel formant filters, swelling each bar
  function choir(t, chord, dur, level) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.21 * level, t + 0.6);
    g.gain.setValueAtTime(0.21 * level, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(bus);
    const formants = [[750, 1], [1200, 0.5], [2600, 0.25]].map(([f, amp]) => {
      const bp = filter('bandpass', f, 8);
      const fg = ctx.createGain();
      fg.gain.value = amp;
      bp.connect(fg); fg.connect(g);
      return bp;
    });
    for (const m of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(m);
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.6;
      const depth = ctx.createGain();
      depth.gain.value = freq(m) * 0.006;
      vib.connect(depth); depth.connect(osc.frequency);
      for (const bp of formants) osc.connect(bp);
      osc.start(t); osc.stop(t + dur);
      vib.start(t); vib.stop(t + dur);
    }
  }

  // Siren: a detuned saw wailing up and down a fifth over two bars
  function siren(t, m, level) {
    const len = STEP * 32;
    const lp = filter('lowpass', 2600, 2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * level, t + 0.4);
    g.gain.setValueAtTime(0.07 * level, t + len - 0.4);
    g.gain.linearRampToValueAtTime(0, t + len);
    lp.connect(g); g.connect(bus); g.connect(echoIn);
    for (const cents of [-15, 15]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(freq(m), t);
      osc.frequency.linearRampToValueAtTime(freq(m + 7), t + len / 2);
      osc.frequency.linearRampToValueAtTime(freq(m), t + len);
      osc.connect(lp);
      osc.start(t); osc.stop(t + len);
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
      for (const id of muted || DEFAULT_MUTED) if (!solo) L[id] = 0; // the game leaves ARCHIVED layers out; dev page: its MUTE buttons
      const base = !solo;
      const bar = Math.floor(step / 16) % 32;
      const section = Math.floor(bar / 8); // 0 ignition, 1 cruise, 2 neon, 3 overdrive
      const i = bar % 8;
      const s = step % 16;
      const { chords, roots } = section >= 2 ? SECTION_B : SECTION_A;
      const chord = chords[i];
      const root = roots[i];
      const ignition = section === 0 && i < 4; // pads and arpeggio alone
      const fill = i === 7 && s >= 12; // tom fill into the next phrase

      // The glow layer brightens the pads, bass and arpeggio, so they also play when it's soloed
      const glowing = base || solo === 'glow';
      if (glowing && s === 0) pad(t, chord, STEP * 16, L.glow);
      if (glowing && !ignition) bass(t, root + (s % 2 ? 12 : 0), L.glow);
      if (glowing && (section !== 0 || s % 2 === 0)) {
        const tones = [...chord, chord[1] + 12].map((m) => m + 12);
        if (section === 3) tones.forEach((_, k) => { tones[k] += 12; });
        arp(t, tones[ARP[s % 8]], L.glow);
      }

      // Drums: kick on 1 and 3 (plus a push before 3), gated snare on 2 and 4, 8th hats
      if (base && !ignition) {
        if (fill) {
          tom(t, [170, 140, 115, 90][s - 12]);
        } else {
          if (s === 0 || s === 8 || (s === 6 && section >= 1)) kick(t, section === 0 ? 0.75 : 1);
          if ((s === 4 || s === 12) && section >= 1) snare(t);
        }
        if (section >= 1 && s % 2 === 0) hat(t, s % 4 === 2 ? 1 : 0.6, s % 8 === 6);
      }

      if (L.drive > 0 && !ignition) {
        hat(t, (s % 2 ? 9 : 6) * L.drive, s % 4 === 2);
        if (s === 4 || s === 12) tambourine(t, 8 * L.drive);
      }
      if (L.turbo > 0 && !ignition) {
        if (s % 4 === 0 && !(base && (s === 0 || s === 8))) kick(t, 0.8 * L.turbo);
        if (s % 4 === 0) turboBass(t, root, L.turbo);
      }

      if (base && section >= 2) {
        for (const [start, m, len] of LEAD[i]) {
          if (start !== s) continue;
          const from = lastLead;
          lead(t, m, len * STEP);
          if (section === 3) lead(t, m - 12, len * STEP, 0.7, from === null ? null : from - 12, false); // doubled an octave down
        }
      }

      // Countdown and brass (stack 4), choir and riser (stack 5), chase (stack 6+); siren is archived
      if (L.chase > 0 && section + i > 0) chase(t, chord, s, L.chase);
      if (L.countdown > 0 && s % 4 === 0) {
        tick(t, s / 4, L.countdown);
        if (s === 0 || s === 8) heartbeat(t, L.countdown);
      }
      if (L.brass > 0 && !ignition && (s === 2 || s === 6 || s === 10 || s === 14)) brass(t, chord, L.brass);
      if (L.riser > 0 && s === 0 && bar % 2 === 0) {
        crash(t, L.riser);
        riser(t, L.riser);
      }
      if (L.choir > 0 && s === 0) choir(t, chord, STEP * 16, L.choir);
      if (L.siren > 0 && s === 0 && bar % 2 === 0) siren(t, root + 36, L.siren);
    },
  };
}
