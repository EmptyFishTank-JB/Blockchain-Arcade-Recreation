// "STANDBY MODE" — an original early-60s soul ballad: a walking upright bass,
// finger snaps and a guiro scrape, a clean guitar picking the chords, and a
// breathy saxophone singing the melody through a warm room reverb.
// Synthesized live with Web Audio.
// 32-bar loop: standby (the groove), signal (the sax melody), connected (the
// melody up high), hold (the melody back down with bluesy slides).
// schedule() takes an intensity from 0 to 1 and an optional solo layer id.
function createStandbyMode(ctx, out) {
  const BPM = 112;
  const STEP = 60 / BPM / 4; // one 16th note
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // B-flat major, two bars per chord: B♭ B♭ Gm Gm E♭ F B♭ B♭
  const Bb = { root: 46, triad: [58, 62, 65] };
  const Gm = { root: 43, triad: [55, 58, 62] };
  const Eb = { root: 39, triad: [55, 58, 63] };
  const F = { root: 41, triad: [53, 57, 60] };
  const BARS = [Bb, Bb, Gm, Gm, Eb, F, Bb, Bb];

  // Sax melodies: [step, midi, length in steps] per bar
  const PHRASE_A = [
    [[4, 65, 4], [8, 67, 2], [10, 65, 2], [12, 62, 4]],
    [[0, 65, 10], [12, 62, 2], [14, 60, 2]],
    [[0, 62, 6], [6, 58, 2], [8, 62, 4], [12, 65, 4]],
    [[0, 67, 12], [12, 65, 4]],
    [[0, 63, 4], [4, 65, 2], [6, 67, 2], [8, 70, 6], [14, 67, 2]],
    [[0, 69, 4], [4, 67, 4], [8, 65, 8]],
    [[0, 62, 4], [4, 65, 4], [8, 70, 8]],
    [[0, 70, 12]],
  ];
  const PHRASE_B = [
    [[2, 70, 2], [4, 72, 4], [8, 74, 6], [14, 72, 2]],
    [[0, 70, 8], [8, 67, 4], [12, 65, 4]],
    [[0, 67, 4], [4, 70, 4], [8, 74, 4], [12, 72, 4]],
    [[0, 70, 10], [10, 67, 2], [12, 65, 4]],
    [[0, 67, 4], [4, 70, 4], [8, 75, 8]],
    [[0, 74, 6], [6, 72, 2], [8, 69, 4], [12, 72, 4]],
    [[0, 74, 8], [8, 70, 4], [12, 65, 4]],
    [[0, 70, 16]],
  ];
  // One bar of walking bass, as offsets from the chord root: [step, semitones, length]
  const WALK = [[0, 0, 6], [6, 7, 2], [8, 12, 4], [12, 9, 2], [14, 11, 2]];

  // B-flat major scale (pitch classes), for the harmony sax a third below the melody
  const SCALE = [10, 0, 2, 3, 5, 7, 9];
  function thirdBelow(m) {
    const k = SCALE.indexOf(((m % 12) + 12) % 12);
    if (k < 0) return m - 4;
    const pc = SCALE[(k + 5) % 7]; // two scale steps down
    let down = (((m % 12) - pc) + 12) % 12;
    if (down === 0) down = 12;
    return m - down;
  }

  // Intensity layers: each fades in over `span` starting at `from` (0–1).
  // The game's stack heights settle at 33% (4), 67% (5) and 100% (6+).
  const LAYERS = [
    { id: 'warmth', label: 'The sax, guitar and bass get warmer and brighter', from: 0, span: 1 },
    { id: 'shaker', label: 'A shaker on the 8ths and a tambourine on 2 and 4', from: 0.05, span: 0.25 },
    { id: 'strings', label: 'A string section swelling under the chords', from: 0.4, span: 0.25 },
    { id: 'harmony', label: 'A second sax harmonizing a third below the melody', from: 0.72, span: 0.25 },
  ];
  // ARCHIVED layers stay here for the dev page's audio compendium but the game never plays them
  const DEFAULT_MUTED = LAYERS.filter((l) => l.archived).map((l) => l.id);

  const bus = ctx.createGain();
  bus.gain.value = 0.22; // level-matched to the other tracks
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  bus.connect(comp);
  comp.connect(out);

  // A warm room: a convolver with a synthesized 2.2s decaying impulse
  const room = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
  }
  room.buffer = ir;
  const roomTone = ctx.createBiquadFilter();
  roomTone.type = 'lowpass';
  roomTone.frequency.value = 4500;
  const roomOut = ctx.createGain();
  roomOut.gain.value = 0.32;
  room.connect(roomTone);
  roomTone.connect(roomOut);
  roomOut.connect(bus);
  const roomSend = ctx.createGain();
  roomSend.connect(room);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // A little growl for the sax
  const growl = new Float32Array(1024);
  for (let i = 0; i < growl.length; i++) {
    const x = (i / (growl.length - 1)) * 2 - 1;
    growl[i] = Math.tanh(1.8 * x);
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

  // Both dry and into the room
  function toMix(node, send) {
    node.connect(bus);
    const s = ctx.createGain();
    s.gain.value = send;
    node.connect(s);
    s.connect(roomSend);
  }

  // Soft felt kick on 1 and 3
  function kick(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    osc.connect(envGain(t, 0.26 * level, 0.3, bus));
    osc.start(t); osc.stop(t + 0.32);
  }

  // Finger snap on 2 and 4: a sharp, bright burst with a lot of room
  function snap(t, level = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = filter('bandpass', 2600, 1.4);
    const g = envGain(t, 0.9 * level, 0.07, bus);
    const s = ctx.createGain();
    s.gain.value = 0.9;
    g.connect(s); s.connect(roomSend);
    src.connect(bp); bp.connect(g);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.08);
  }

  // Guiro: a quick run of tiny scrapes
  function guiro(t, level, long) {
    const n = long ? 7 : 4;
    const gap = long ? 0.016 : 0.012;
    for (let k = 0; k < n; k++) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = filter('bandpass', 3400, 3);
      src.connect(bp); bp.connect(envGain(t + k * gap, 0.55 * level, 0.012, bus));
      src.start(t + k * gap, Math.random() * 0.5); src.stop(t + k * gap + 0.015);
    }
  }

  function shaker(t, level) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = filter('highpass', 6500);
    src.connect(hp); hp.connect(envGain(t, 0.15 * level, 0.05, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + 0.06);
  }

  function tambourine(t, level) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = filter('bandpass', 9000, 2);
    src.connect(bp); bp.connect(envGain(t, 0.3 * level, 0.13, bus));
    src.start(t, Math.random() * 0.5); src.stop(t + 0.14);
  }

  // Upright bass: a round plucked sine and triangle, a little brighter with warmth
  function bass(t, m, len, warmth) {
    const dur = len * STEP;
    const lp = filter('lowpass', 500 + 500 * warmth, 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.95);
    lp.connect(g); g.connect(bus);
    for (const type of ['sine', 'triangle']) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq(m);
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur);
    }
  }

  // Clean guitar: a soft plucked note (Karplus-style would be heavier; this is a filtered pluck)
  function guitar(t, m, warmth, level = 1) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq(m);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq(m);
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.25;
    const lp = filter('lowpass', 1400 + 1600 * warmth, 0.8);
    lp.frequency.setValueAtTime(2600 + 1600 * warmth, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    osc.connect(lp); osc2.connect(mix2); mix2.connect(lp);
    const g = envGain(t, 0.075 * level, 0.9, bus);
    lp.connect(g);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s); s.connect(roomSend);
    osc.start(t); osc.stop(t + 0.95);
    osc2.start(t); osc2.stop(t + 0.95);
  }

  // String section: detuned saws with a slow swell, held for the chord
  function strings(t, triad, dur, level) {
    const lp = filter('lowpass', 2200, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.009 * level, t + 0.8);
    g.gain.setValueAtTime(0.009 * level, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g);
    toMix(g, 0.8);
    for (const m of [...triad, triad[0] + 12]) {
      for (const cents of [-8, 0, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq(m);
        osc.detune.value = cents;
        const vib = ctx.createOscillator();
        vib.frequency.value = 5 + Math.random();
        const vibAmt = ctx.createGain();
        vibAmt.gain.value = 4;
        vib.connect(vibAmt); vibAmt.connect(osc.detune);
        osc.connect(lp);
        osc.start(t); osc.stop(t + dur + 0.05);
        vib.start(t); vib.stop(t + dur + 0.05);
      }
    }
  }

  // Saxophone: a buzzy saw/square reed through vocal-like formant filters, a touch of growl,
  // breath noise, a scoop up into each note (or a slide from the last one) and a vibrato
  // that blooms on held notes
  let lastSax = null;
  function sax(t, m, dur, warmth, level = 1, from = null, scoop = 1) {
    const f0 = freq(m);
    const start = from !== null ? freq(from) : freq(m - scoop);
    const src = ctx.createGain();
    for (const [type, amt] of [['sawtooth', 0.7], ['square', 0.3]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(start, t);
      osc.frequency.exponentialRampToValueAtTime(f0, t + (from !== null ? 0.09 : 0.06));
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + Math.min(0.25, dur * 0.4));
      depth.gain.linearRampToValueAtTime(f0 * 0.012, t + Math.min(0.7, dur));
      vib.connect(depth); depth.connect(osc.frequency);
      const a = ctx.createGain();
      a.gain.value = amt;
      osc.connect(a); a.connect(src);
      osc.start(t); osc.stop(t + dur + 0.12);
      vib.start(t); vib.stop(t + dur + 0.12);
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = growl;
    src.connect(shaper);
    // Formants of a tenor-ish reed, plus a gentle lowpass that opens with warmth
    const body = ctx.createGain();
    for (const [hz, q, amt] of [[520, 3, 1], [1450, 5, 0.55], [2600, 7, 0.25]]) {
      const bp = filter('bandpass', hz, q);
      const a = ctx.createGain();
      a.gain.value = amt;
      shaper.connect(bp); bp.connect(a); a.connect(body);
    }
    const lp = filter('lowpass', 2300 + 1800 * warmth, 0.7);
    body.connect(lp);
    // Breath
    const br = ctx.createBufferSource();
    br.buffer = noise;
    const brBp = filter('bandpass', 1800, 1.2);
    const brG = ctx.createGain();
    brG.gain.value = 0.05;
    br.connect(brBp); brBp.connect(brG); brG.connect(lp);
    br.start(t, Math.random() * 0.5); br.stop(t + dur + 0.12);
    const g = ctx.createGain();
    const peak = 0.34 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.05);
    g.gain.linearRampToValueAtTime(peak * 0.8, t + Math.min(0.3, dur * 0.5));
    g.gain.setValueAtTime(peak * 0.8, t + Math.max(0.06, dur - 0.08));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    lp.connect(g);
    toMix(g, 0.7);
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
      const section = Math.floor(bar / 8); // 0 standby, 1 signal, 2 connected, 3 hold
      const i = bar % 8;
      const s = step % 16;
      const chord = BARS[i];
      const intro = section === 0 && i < 2; // bass and snaps alone

      // Warmth brightens the sax, guitar and bass, so they also play when it's soloed
      const warm = base || solo === 'warmth';
      if (warm) {
        for (const [start, off, len] of WALK) {
          if (start !== s) continue;
          // The last note of each bar leads into the next chord's root
          const next = BARS[(i + 1) % 8].root;
          const m = start === 14 ? next - 1 : chord.root + off;
          bass(t, m, len, L.warmth);
        }
        if (!intro) {
          // Guitar picks the chord on the 8ths: root, fifth, third, fifth...
          const pick = [0, 2, 1, 2, 0, 2, 1, 2];
          if (s % 2 === 0) guitar(t, chord.triad[pick[s / 2]], L.warmth, s % 4 === 0 ? 1 : 0.7);
        }
      }

      if (base) {
        if (s === 0 || s === 8) kick(t, intro ? 0.6 : 1);
        if (s === 4 || s === 12) snap(t);
        if (!intro && (s === 2 || s === 10)) guiro(t, 1, s === 10);
      }

      if (L.shaker > 0 && !intro) {
        if (s % 2 === 0) shaker(t, (s % 4 === 2 ? 1.4 : 0.8) * L.shaker);
        if (s === 4 || s === 12) tambourine(t, L.shaker);
      }
      // Strings hold each chord: two bars, except E♭ and F (one bar each)
      if (L.strings > 0 && s === 0 && [0, 2, 4, 5, 6].includes(i)) {
        strings(t, chord.triad, STEP * (i === 4 || i === 5 ? 16 : 32), L.strings);
      }

      // The sax: signal, connected (up high), hold (back down, with bluesy slides)
      if (section >= 1) {
        const phrase = section === 2 ? PHRASE_B : PHRASE_A;
        for (const [start, m, len] of phrase[i]) {
          if (start !== s) continue;
          const bluesy = section === 3;
          const from = lastSax;
          const legato = from !== null && Math.abs(from - m) <= 5 && start !== 0;
          if (base) {
            sax(t, m, len * STEP, L.warmth, 1, legato ? from : null, bluesy ? 2 : 1);
          }
          if (L.harmony > 0) sax(t, thirdBelow(m), len * STEP, L.warmth, 0.17 * L.harmony, null, bluesy ? 2 : 1);
          lastSax = m;
        }
        if (s === 15 && i === 7) lastSax = null;
      }
    },
  };
}
