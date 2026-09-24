// Music player: owns the AudioContext, the lookahead scheduler, the playlist
// and the intensity input. Track engines live in their own music-*.js files.

const Music = (() => {
  const STORAGE_KEY = 'blockchain-music';
  const BG_KEY = 'blockchain-music-bg';
  const MODE_KEY = 'blockchain-music-mode';
  const MODES = ['repeat', 'sequence', 'shuffle'];
  const FADE_OUT = 3; // seconds of fade at the end of a track's last loop
  const LOOPS_PER_TRACK = 4; // sequence/shuffle: plays before moving to the next track
  const LOOKAHEAD = 0.12;
  // Hidden tabs get their timers throttled to ~1/s, so queue more notes ahead while in the background.
  const HIDDEN_LOOKAHEAD = 1.5;
  const INTENSITY_EASE = 0.06; // per 16th step, ~2.5s to settle
  // Add future tracks here: each entry's create(ctx, out) returns an engine like createSynthwave's.
  // free: playable without Full Access (see unlocks.js); the rest need it.
  const TRACKS = [
    { id: 'theme', title: 'BYTEFALL THEME', create: createSynthwave, free: true },
    { id: 'sleep-mode', title: 'SLEEP MODE', create: createSleepMode, free: true },
    { id: 'brute-force', title: 'BRUTE FORCE', create: createBruteForce },
    { id: 'deep-web', title: 'DEEP WEB', create: createDeepWeb },
    { id: 'zero-day', title: 'ZERO DAY', create: createZeroDay },
    { id: 'system-restore', title: 'SYSTEM RESTORE', create: createSystemRestore },
  ];
  let enabled = true;
  let backgroundPlay = false;
  let trackId = TRACKS[0].id; // every visit starts on track 01
  let mode = 'repeat';
  try {
    if (MODES.includes(localStorage.getItem(MODE_KEY))) mode = localStorage.getItem(MODE_KEY);
    enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    backgroundPlay = localStorage.getItem(BG_KEY) === 'on';
  } catch (e) {}
  let intensity = 0;
  let targetIntensity = 0;
  let ctx = null;
  let analyser = null;
  let session = null; // per-play gain so stopped notes can't bleed into the next start
  let engine = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let loopsToPlay = LOOPS_PER_TRACK;
  let fadeStarted = false;
  let onTrackChange = null;

  function openSession(fadeIn) {
    session = ctx.createGain();
    session.gain.setValueAtTime(0, ctx.currentTime);
    session.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn);
    session.connect(analyser);
    engine = TRACKS.find((t) => t.id === trackId).create(ctx, session);
    step = 0;
    loopsToPlay = LOOPS_PER_TRACK;
    fadeStarted = false;
  }

  const isLocked = (track) => !track.free && !Unlocks.hasFullAccess();

  // Sequence and shuffle only move between tracks the player can play.
  function nextTrackId() {
    const open = TRACKS.filter((t) => !isLocked(t));
    const i = open.findIndex((t) => t.id === trackId);
    if (mode === 'sequence') return open[(i + 1) % open.length].id;
    const others = open.filter((t) => t.id !== trackId); // shuffle never repeats back to back
    return others.length ? others[Math.floor(Math.random() * others.length)].id : trackId;
  }

  // Sequence/shuffle: fade out over the end of the last loop, then start the next track.
  function advance() {
    if (mode === 'repeat') return;
    const end = loopsToPlay * engine.loopSteps;
    if (!fadeStarted && step >= end - Math.ceil(FADE_OUT / engine.step)) {
      fadeStarted = true;
      session.gain.setValueAtTime(1, nextTime);
      session.gain.linearRampToValueAtTime(0, nextTime + (end - step) * engine.step);
    }
    if (step >= end) {
      const old = session;
      setTimeout(() => old.disconnect(), (nextTime - ctx.currentTime + 1) * 1000);
      trackId = nextTrackId();
      openSession(0.8);
      if (onTrackChange) onTrackChange(trackId);
    }
  }

  function tick() {
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.02;
    const ahead = document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD;
    while (nextTime < ctx.currentTime + ahead) {
      advance();
      intensity += (targetIntensity - intensity) * INTENSITY_EASE;
      engine.schedule(step, nextTime, intensity);
      nextTime += engine.step;
      step++;
    }
  }

  function start() {
    if (timer) return;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.72;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -34;
        analyser.connect(ctx.destination);
      }
      ctx.resume();
      openSession(1.5);
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
    if (document.hidden && !backgroundPlay) ctx.suspend();
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
    tracks: () => TRACKS.map((t) => ({ id: t.id, title: t.title, locked: isLocked(t) })),
    currentTrack: () => trackId,
    // The music's output analyser for the playlist visualizer; null when nothing is playing.
    getAnalyser: () => (timer ? analyser : null),
    // Selecting a track always starts it, restarting playback if another was playing.
    play(id) {
      const track = TRACKS.find((t) => t.id === id);
      if (!track || isLocked(track)) return;
      trackId = id;
      stop();
      setEnabled(true);
    },
    getMode: () => mode,
    // Cycles repeat → sequence → shuffle. Switching mid-track keeps the current track going.
    cycleMode() {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
      if (timer) {
        if (fadeStarted) {
          session.gain.cancelScheduledValues(ctx.currentTime);
          session.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
          fadeStarted = false;
        }
        loopsToPlay = Math.max(LOOPS_PER_TRACK, Math.floor(step / engine.loopSteps) + 1);
      }
      return mode;
    },
    onTrackChange(fn) {
      onTrackChange = fn;
    },
    isBackgroundPlay: () => backgroundPlay,
    setBackgroundPlay(on) {
      backgroundPlay = on;
      try { localStorage.setItem(BG_KEY, on ? 'on' : 'off'); } catch (e) {}
    },
    // After Full Access changes: a locked track that is current falls back to track 01.
    refreshUnlocks() {
      if (!isLocked(TRACKS.find((t) => t.id === trackId))) return;
      if (timer) this.play(TRACKS[0].id);
      else trackId = TRACKS[0].id;
    },
    setIntensity(value) {
      targetIntensity = Math.max(0, Math.min(1, value));
    },
  };
})();
