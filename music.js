// Music player: owns the AudioContext, the lookahead scheduler, the playlist
// and the intensity input. Track engines live in their own music-*.js files.

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
