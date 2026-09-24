// Progress: lifetime stats, earnable unlocks (Hard mode, tracks, themes, bonus
// exploits) and achievements, saved in this browser. Full Access (unlocks.js)
// unlocks everything straight away; otherwise each unlock is earned by playing.
// script.js reports what happens in a run; check() then returns anything newly earned.
const Progress = (() => {
  const KEY = 'bytefall-progress';
  const fresh = () => ({
    games: 0, // sessions started (first drop of a run)
    drops: 0,
    bits: 0, // bits decrypted
    bitsByValue: {}, // number -> bits of that number decrypted
    bytes: 0, // Hard: BYTE bonuses
    peeled: 0, // encryption layer levels removed
    broken: 0, // layers peeled all the way, revealing a bit
    exploits: 0, // exploits run
    exploitUses: {}, // per exploit id
    bestChain: 0,
    bestScore: 0, // any difficulty
    bestHardDrops: 0, // longest Hard session, in drops
    bestDropBytes: 0, // most bytes from a single drop
    sweeps: 0, // board cleared completely (after 10+ drops)
    closeCalls: 0, // decrypted back under the line
    dailies: 0, // days the Daily Decrypt was played
    lastDaily: '', // UTC date of the last one
    dailyStreak: 0, // consecutive days, up to lastDaily
    bestDailyStreak: 0,
    puzzles: {}, // puzzle index -> true once solved
    earned: {}, // unlock id -> true, kept once earned
    achieved: {}, // achievement id -> true
  });

  let d = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) d = { ...d, ...saved };
  } catch (e) {}
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  };

  // Best scores live under script.js's keys (named before the rename to ByteFall).
  const best = (difficulty) => {
    const key = difficulty === 'hard' ? 'blockchain-best-hard-8x8' : `blockchain-best-${difficulty}`;
    try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
  };

  // Credit players from before progression: anyone with a Hard score keeps Hard.
  try {
    if (best('hard') > 0 || Number(localStorage.getItem('blockchain-best-hard')) > 0) d.earned['mode-hard'] = true;
  } catch (e) {}

  const TRACK_BITS = [300, 750, 1500, 3000, 5000, 7500, 10000, 15000]; // tracks 03-10

  // group: where it shows in the UNLOCKS list. value() / goal drive its tracker.
  const UNLOCKS = [
    { id: 'mode-hard', group: 'MODE', name: 'HARD MODE', need: 'Score 1,500 on Normal', value: () => best('normal'), goal: 1500 },
    ...TRACK_BITS.map((goal, i) => ({
      id: `track-${i + 3}`, group: 'TRACKS', name: `TRACK ${String(i + 3).padStart(2, '0')}`,
      need: `Decrypt ${goal.toLocaleString('en-US')} bits`, value: () => d.bits, goal,
    })),
    { id: 'theme-cipher', group: 'THEMES', name: 'CIPHER', need: 'Decrypt a BYTE on Hard', value: () => d.bytes, goal: 1 },
    { id: 'theme-amber', group: 'THEMES', name: 'AMBER CRT', need: 'Play 25 sessions', value: () => d.games, goal: 25 },
    { id: 'theme-mono', group: 'THEMES', name: 'MONOCHROME', need: 'Get a 6x chain', value: () => d.bestChain, goal: 6 },
    { id: 'theme-redline', group: 'THEMES', name: 'REDLINE', need: 'Last 100 drops in one Hard session', value: () => d.bestHardDrops, goal: 100 },
    { id: 'theme-synthwave', group: 'THEMES', name: 'SYNTHWAVE', need: 'Score 5,000 in one session', value: () => d.bestScore, goal: 5000 },
    { id: 'theme-dotmatrix', group: 'THEMES', name: 'DOT MATRIX', need: 'Decrypt 2,500 bits', value: () => d.bits, goal: 2500 },
    { id: 'theme-daylight', group: 'THEMES', name: 'DAYLIGHT', need: 'Play 50 sessions', value: () => d.games, goal: 50 },
    // 1-7 so it can be earned on any difficulty (8s only fall on Hard)
    { id: 'theme-glyph', group: 'THEMES', name: 'GLYPH', need: 'Decrypt 100 of every number from 1 to 7', value: () => Math.min(...[1, 2, 3, 4, 5, 6, 7].map((n) => d.bitsByValue[n] || 0)), goal: 100 },
    { id: 'theme-spectrum', group: 'THEMES', name: 'SPECTRUM', need: 'Earn every other unlock', value: () => UNLOCKS.filter((u) => u.id !== 'theme-spectrum' && d.earned[u.id]).length, goal: () => UNLOCKS.length - 1 },
    { id: 'exploit-dictionary', group: 'EXPLOITS', name: 'DICTIONARY ATTACK', need: 'Peel 100 encryption layers', value: () => d.peeled, goal: 100 },
    { id: 'exploit-keylogger', group: 'EXPLOITS', name: 'KEYLOGGER', need: 'Run 20 exploits', value: () => d.exploits, goal: 20 },
    { id: 'exploit-backdoor', group: 'EXPLOITS', name: 'BACKDOOR', need: 'Reveal 50 bits from under encryption layers', value: () => d.broken, goal: 50 },
    { id: 'exploit-rainbow', group: 'EXPLOITS', name: 'RAINBOW TABLE', need: 'Decrypt 5,000 bits', value: () => d.bits, goal: 5000 },
  ];

  const themeIds = UNLOCKS.filter((u) => u.group === 'THEMES').map((u) => u.id);
  let exploitCount = 7; // set by script.js from HACKS
  let puzzleCount = 30; // set by script.js from PUZZLES

  const ACHIEVEMENTS = [
    { id: 'first-contact', name: 'FIRST CONTACT', desc: 'Start your first session', value: () => d.games, goal: 1 },
    { id: 'regular', name: 'REGULAR', desc: 'Play 25 sessions', value: () => d.games, goal: 25 },
    { id: 'veteran', name: 'VETERAN', desc: 'Play 100 sessions', value: () => d.games, goal: 100 },
    { id: 'handshake', name: 'HANDSHAKE', desc: 'Decrypt 100 bits', value: () => d.bits, goal: 100 },
    { id: 'kilobyte', name: 'KILOBYTE', desc: 'Decrypt 1,024 bits', value: () => d.bits, goal: 1024 },
    { id: 'data-miner', name: 'DATA MINER', desc: 'Decrypt 10,000 bits', value: () => d.bits, goal: 10000 },
    { id: 'chain-reaction', name: 'CHAIN REACTION', desc: 'Get a 4x chain', value: () => d.bestChain, goal: 4 },
    { id: 'cascade', name: 'CASCADE', desc: 'Get a 6x chain', value: () => d.bestChain, goal: 6 },
    { id: 'overclocked', name: 'OVERCLOCKED', desc: 'Get an 8x chain', value: () => d.bestChain, goal: 8 },
    { id: 'first-byte', name: 'FIRST BYTE', desc: 'Decrypt a BYTE on Hard', value: () => d.bytes, goal: 1 },
    { id: 'double-byte', name: 'DOUBLE BYTE', desc: 'Decrypt 2 bytes with one drop', value: () => d.bestDropBytes, goal: 2 },
    { id: 'byte-stream', name: 'BYTE STREAM', desc: 'Decrypt 10 bytes', value: () => d.bytes, goal: 10 },
    { id: 'layer-peeler', name: 'LAYER PEELER', desc: 'Peel 100 encryption layers', value: () => d.peeled, goal: 100 },
    { id: 'onion-router', name: 'ONION ROUTER', desc: 'Peel 1,000 encryption layers', value: () => d.peeled, goal: 1000 },
    { id: 'script-kiddie', name: 'SCRIPT KIDDIE', desc: 'Run your first exploit', value: () => d.exploits, goal: 1 },
    { id: 'black-hat', name: 'BLACK HAT', desc: 'Run 50 exploits', value: () => d.exploits, goal: 50 },
    { id: 'full-toolkit', name: 'FULL TOOLKIT', desc: 'Run every exploit at least once', value: () => Object.keys(d.exploitUses).length, goal: () => exploitCount },
    { id: 'root-access', name: 'ROOT ACCESS', desc: 'Score 1,000 in one session', value: () => d.bestScore, goal: 1000 },
    { id: 'superuser', name: 'SUPERUSER', desc: 'Score 5,000 in one session', value: () => d.bestScore, goal: 5000 },
    { id: 'kernel-mode', name: 'KERNEL MODE', desc: 'Score 10,000 in one session', value: () => d.bestScore, goal: 10000 },
    { id: 'hardened', name: 'HARDENED', desc: 'Unlock Hard mode', value: () => (isUnlocked('mode-hard') ? 1 : 0), goal: 1 },
    { id: 'ghost', name: 'GHOST', desc: 'Last 100 drops in one Hard session', value: () => d.bestHardDrops, goal: 100 },
    { id: 'clean-sweep', name: 'CLEAN SWEEP', desc: 'Clear the whole board after 10+ drops', value: () => d.sweeps, goal: 1 },
    { id: 'close-call', name: 'CLOSE CALL', desc: 'Decrypt your way back under the line', value: () => d.closeCalls, goal: 1 },
    { id: 'daily-driver', name: 'DAILY DRIVER', desc: 'Play the Daily Decrypt 7 days in a row', value: () => d.bestDailyStreak, goal: 7 },
    { id: 'locksmith', name: 'LOCKSMITH', desc: 'Solve 10 puzzles', value: () => Object.keys(d.puzzles).length, goal: 10 },
    { id: 'master-key', name: 'MASTER KEY', desc: 'Solve every puzzle', value: () => Object.keys(d.puzzles).length, goal: () => puzzleCount },
    { id: 'collector', name: 'COLLECTOR', desc: 'Unlock every theme', value: () => themeIds.filter(isUnlocked).length, goal: themeIds.length },
  ];

  const goalOf = (item) => (typeof item.goal === 'function' ? item.goal() : item.goal);

  function isUnlocked(id) {
    return Unlocks.hasFullAccess() || !!d.earned[id];
  }

  // The current run, reset by startRun()
  let run = { difficulty: 'normal', mode: 'classic', drops: 0, started: false };

  // One Daily Decrypt per UTC day counts toward the streak
  function playedDaily() {
    const today = new Date().toISOString().slice(0, 10);
    if (d.lastDaily === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    d.dailyStreak = d.lastDaily === yesterday ? d.dailyStreak + 1 : 1;
    d.bestDailyStreak = Math.max(d.bestDailyStreak, d.dailyStreak);
    d.lastDaily = today;
    d.dailies++;
  }

  // Marks newly met unlocks and achievements; returns them as [{ type, name }] (quiet: just record).
  function check(quiet = false) {
    const earned = [];
    for (const u of UNLOCKS) {
      if (!d.earned[u.id] && u.value() >= goalOf(u)) {
        d.earned[u.id] = true;
        earned.push({ type: 'UNLOCKED', name: u.name });
      }
    }
    for (const a of ACHIEVEMENTS) {
      if (!d.achieved[a.id] && a.value() >= goalOf(a)) {
        d.achieved[a.id] = true;
        earned.push({ type: 'ACHIEVEMENT', name: a.name });
      }
    }
    save();
    return quiet ? [] : earned;
  }
  check(true); // seed from existing best scores without announcing anything

  return {
    isUnlocked,
    unlock(id) {
      const u = UNLOCKS.find((x) => x.id === id);
      return u && { ...u, goal: goalOf(u) };
    },
    setExploitCount(n) { exploitCount = n; },
    setPuzzleCount(n) { puzzleCount = n; },
    puzzleSolved: (i) => !!d.puzzles[i],
    solvePuzzle(i) { d.puzzles[i] = true; },
    // Lists for the RECORDS panel
    unlocks: () => UNLOCKS.map((u) => ({ ...u, goal: goalOf(u), current: u.value(), done: isUnlocked(u.id) })),
    achievements: () => ACHIEVEMENTS.map((a) => ({ ...a, goal: goalOf(a), current: a.value(), done: !!d.achieved[a.id] })),
    stats: () => ({ ...d, bestNormal: best('normal'), bestEasy: best('easy'), bestHard: best('hard') }),

    // Run events from script.js
    startRun(difficulty, mode = 'classic') {
      run = { difficulty, mode, drops: 0, started: false };
    },
    drop() {
      if (!run.started) {
        run.started = true;
        if (run.mode !== 'puzzle') d.games++; // puzzle retries don't count as sessions
        if (run.mode === 'daily') playedDaily();
      }
      run.drops++;
      d.drops++;
      if (run.difficulty === 'hard') d.bestHardDrops = Math.max(d.bestHardDrops, run.drops);
    },
    runDrops: () => run.drops,
    // values: the numbers of the bits decrypted
    decrypted(values, chain) {
      d.bits += values.length;
      for (const v of values) d.bitsByValue[v] = (d.bitsByValue[v] || 0) + 1;
      d.bestChain = Math.max(d.bestChain, chain);
    },
    bytes(count) {
      d.bytes += count;
      d.bestDropBytes = Math.max(d.bestDropBytes, count);
    },
    peeled(broken) {
      d.peeled++;
      if (broken) d.broken++;
    },
    exploit(id) {
      d.exploits++;
      d.exploitUses[id] = (d.exploitUses[id] || 0) + 1;
    },
    score(points) {
      d.bestScore = Math.max(d.bestScore, points);
    },
    sweep() { d.sweeps++; },
    closeCall() { d.closeCalls++; },
    check,
  };
})();
