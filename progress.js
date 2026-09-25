// Progress: lifetime stats, levels and prestige, earnable unlocks (Hard mode,
// tracks, themes, exploits) and achievements, saved in this browser. Full Access
// (unlocks.js) unlocks everything straight away; otherwise it's earned by playing.
// script.js reports what happens in a run; check() then returns anything newly earned.
//
// Levels: bits decrypted are XP, from Lv 1 to Lv 80. At Lv 80 the player can PRESTIGE:
// back to Lv 1, prestige +1, and exploits lock again. Exploits (in EXPLOIT_ORDER) and exploit
// slots unlock by level within a prestige; prestige N keeps N slots and the first N exploits
// for good, and the rest unlock sooner. Only exploits equipped in a slot are awarded. Each
// prestige also permanently unlocks the next theme in THEME_ORDER. Tracks and Hard mode are
// permanent unlocks and never reset.
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
    points: 0, // lifetime points
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
    prestige: 0,
    xp: 0, // bits decrypted this prestige
    prestigePoints: 0, // points earned this prestige
    equipped: [], // exploit ids in the loadout slots
    lastLevel: 1, // for LEVEL UP announcements
    exploitsSeen: {}, // exploit id -> true once announced this prestige
    slotsSeen: 0, // slots announced this prestige
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

  const MAX_LEVEL = 80;
  // 100 bits (12.5 bytes) per level. Lv 80 starts at 7,900 bits and its bar fills at 8,000,
  // when PRESTIGE opens: a full prestige is exactly 1 kilobyte.
  const BITS_PER_LEVEL = 100;
  const PRESTIGE_BITS = MAX_LEVEL * BITS_PER_LEVEL;
  function levelInfo() {
    const level = Math.min(MAX_LEVEL, Math.floor(d.xp / BITS_PER_LEVEL) + 1);
    const into = Math.min(BITS_PER_LEVEL, d.xp - (level - 1) * BITS_PER_LEVEL);
    return { level, into, need: BITS_PER_LEVEL, maxed: d.xp >= PRESTIGE_BITS, prestige: d.prestige, xp: Math.min(d.xp, PRESTIGE_BITS), prestigeBits: PRESTIGE_BITS };
  }

  // Weakest first. After the ones a prestige keeps, each unlocks at the next level in EXPLOIT_LEVELS.
  const EXPLOIT_ORDER = ['rng', 'bitflip', 'overflow', 'trojan', 'pivot', 'worm', 'keylogger', 'sniffer',
    'backdoor', 'logicbomb', 'honeypot', 'dictionary', 'rainbow'];
  const EXPLOIT_LEVELS = [3, 8, 13, 18, 23, 29, 35, 41, 47, 53, 59, 65, 70];
  // Loadout slots: prestige N keeps N (up to MAX_SLOTS); the rest unlock at SLOT_LEVELS in turn
  const MAX_SLOTS = 6;
  const SLOT_LEVELS = [5, 15, 30, 45, 60, 75];
  let exploitNames = {}; // id -> name, from script.js

  function exploitInfo(id) {
    const k = EXPLOIT_ORDER.indexOf(id);
    const kept = Math.min(d.prestige, EXPLOIT_ORDER.length);
    if (k < kept) return { unlocked: true, kept: true, level: 0 };
    const level = EXPLOIT_LEVELS[k - kept];
    return { unlocked: Unlocks.hasFullAccess() || levelInfo().level >= level, kept: false, level };
  }
  function slotInfo() {
    if (Unlocks.hasFullAccess()) return { slots: MAX_SLOTS, max: MAX_SLOTS, kept: MAX_SLOTS, nextLevel: 0 };
    const kept = Math.min(d.prestige, MAX_SLOTS);
    const { level } = levelInfo();
    const levels = SLOT_LEVELS.slice(0, MAX_SLOTS - kept);
    const earned = levels.filter((l) => level >= l).length;
    const next = levels.find((l) => level < l);
    return { slots: kept + earned, max: MAX_SLOTS, kept, nextLevel: next || 0 };
  }
  const unlockedExploits = () => EXPLOIT_ORDER.filter((id) => exploitInfo(id).unlocked);

  // Keep the loadout valid: only unlocked exploits, no more than the slots.
  function tidyLoadout() {
    const { slots } = slotInfo();
    d.equipped = d.equipped.filter((id, i, all) => exploitInfo(id).unlocked && all.indexOf(id) === i).slice(0, slots);
  }
  // When an exploit or slot unlocks, fill free slots with unlocked exploits in order, so new
  // unlocks are ready to use. (Not on every change, or unequipping to swap would refill.)
  function fillLoadout() {
    tidyLoadout();
    const { slots } = slotInfo();
    for (const id of unlockedExploits()) {
      if (d.equipped.length >= slots) break;
      if (!d.equipped.includes(id)) d.equipped.push(id);
    }
  }

  // Each prestige permanently unlocks the next theme
  const THEME_ORDER = [['cipher', 'CIPHER'], ['amber', 'AMBER CRT'], ['mono', 'MONOCHROME'], ['redline', 'REDLINE'],
    ['synthwave', 'SYNTHWAVE'], ['dotmatrix', 'DOT MATRIX'], ['daylight', 'DAYLIGHT'], ['glyph', 'GLYPH'], ['spectrum', 'SPECTRUM']];

  // group: where it shows in the UNLOCKS list. value() / goal drive its tracker.
  const UNLOCKS = [
    { id: 'mode-hard', group: 'MODE', name: 'HARD MODE', need: 'Score 1,500 on Normal', value: () => best('normal'), goal: 1500 },
    ...TRACK_BITS.map((goal, i) => ({
      id: `track-${i + 3}`, group: 'TRACKS', name: `TRACK ${String(i + 3).padStart(2, '0')}`,
      need: `Decrypt ${goal.toLocaleString('en-US')} bits`, value: () => d.bits, goal,
    })),
    ...THEME_ORDER.map(([id, name], i) => ({
      id: `theme-${id}`, group: 'THEMES', name, need: `Reach prestige ${i + 1}`, value: () => d.prestige, goal: i + 1,
    })),
  ];

  const themeIds = UNLOCKS.filter((u) => u.group === 'THEMES').map((u) => u.id);
  let exploitCount = 7; // set by script.js from HACKS
  let puzzleCount = 30; // set by script.js from PUZZLES

  const ACHIEVEMENTS = [
    { id: 'first-contact', name: 'FIRST CONTACT', desc: 'Start your first session', value: () => d.games, goal: 1 },
    { id: 'regular', name: 'REGULAR', desc: 'Play 25 sessions', value: () => d.games, goal: 25 },
    { id: 'veteran', name: 'VETERAN', desc: 'Play 100 sessions', value: () => d.games, goal: 100 },
    { id: 'handshake', name: 'HANDSHAKE', desc: 'Decrypt 100 bits', value: () => d.bits, goal: 100 },
    // Data decrypted, in decimal units of bits decrypted (8 bits to a byte)
    { id: 'kilobit', name: 'KILOBIT', desc: 'Decrypt 1,000 bits', value: () => d.bits, goal: 1000 },
    { id: 'kilobyte-8k', name: 'KILOBYTE', desc: 'Decrypt 8,000 bits', value: () => d.bits, goal: 8000 },
    { id: 'megabit', name: 'MEGABIT', desc: 'Decrypt 1,000,000 bits', value: () => d.bits, goal: 1000000 },
    { id: 'megabyte-8m', name: 'MEGABYTE', desc: 'Decrypt 8,000,000 bits', value: () => d.bits, goal: 8000000 },
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
    { id: 'maxed-out', name: 'MAXED OUT', desc: 'Fill Lv 80: a kilobyte of bits in one prestige', value: () => (levelInfo().maxed || d.prestige > 0 ? 1 : 0), goal: 1 },
    { id: 'rollover', name: 'ROLLOVER', desc: 'Prestige for the first time', value: () => d.prestige, goal: 1 },
    { id: 'full-spectrum', name: 'FULL SPECTRUM', desc: 'Reach prestige 9', value: () => d.prestige, goal: 9 },
    { id: 'collector', name: 'COLLECTOR', desc: 'Unlock every theme', value: () => themeIds.filter(isUnlocked).length, goal: themeIds.length },
  ];

  const goalOf = (item) => (typeof item.goal === 'function' ? item.goal() : item.goal);

  function isUnlocked(id) {
    return Unlocks.hasFullAccess() || !!d.earned[id];
  }

  // The current run, reset by startRun()
  let run = { difficulty: 'normal', mode: 'classic', drops: 0, started: false, bits: 0, chain: 0, bytes: 0 };

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
    const { level } = levelInfo();
    if (level > d.lastLevel) earned.push({ type: 'LEVEL UP', name: `LV ${level}` });
    d.lastLevel = Math.max(d.lastLevel, level);
    let opened = false;
    for (const id of EXPLOIT_ORDER) {
      if (!d.exploitsSeen[id] && exploitInfo(id).unlocked) {
        d.exploitsSeen[id] = true;
        earned.push({ type: 'UNLOCKED', name: exploitNames[id] || id });
        opened = true;
      }
    }
    const { slots } = slotInfo();
    if (slots > d.slotsSeen) {
      earned.push({ type: 'UNLOCKED', name: `EXPLOIT SLOT ${slots}` });
      d.slotsSeen = slots;
      opened = true;
    }
    if (opened) fillLoadout();
    else tidyLoadout();
    for (const a of ACHIEVEMENTS) {
      if (!d.achieved[a.id] && a.value() >= goalOf(a)) {
        d.achieved[a.id] = true;
        earned.push({ type: 'ACHIEVEMENT', name: a.name });
      }
    }
    save();
    return quiet ? [] : earned;
  }
  // Exploits and slots a prestige starts with aren't announced
  const markKept = () => {
    EXPLOIT_ORDER.forEach((id) => { if (exploitInfo(id).kept) d.exploitsSeen[id] = true; });
    d.slotsSeen = Math.max(d.slotsSeen, Math.min(d.prestige, MAX_SLOTS));
  };
  markKept();
  if (!d.equipped.length) fillLoadout(); // first load, or a new Full Access / dev unlock
  check(true); // seed from existing best scores without announcing anything

  return {
    isUnlocked,
    unlock(id) {
      const u = UNLOCKS.find((x) => x.id === id);
      return u && { ...u, goal: goalOf(u) };
    },
    setExploitCount(n) { exploitCount = n; },
    setExploitNames(names) { exploitNames = names; },
    exploitInfo,
    exploitOrder: () => [...EXPLOIT_ORDER],
    slotInfo,
    equipped: () => (tidyLoadout(), [...d.equipped]),
    isEquipped: (id) => (tidyLoadout(), d.equipped.includes(id)),
    // Returns false when it can't (locked, or every slot is taken)
    equip(id) {
      tidyLoadout();
      if (d.equipped.includes(id) || !exploitInfo(id).unlocked || d.equipped.length >= slotInfo().slots) return false;
      d.equipped.push(id);
      save();
      return true;
    },
    unequip(id) {
      d.equipped = d.equipped.filter((x) => x !== id);
      save();
    },
    levelInfo,
    // Lv 80 only: back to Lv 1 with exploits locked again; the next theme unlocks for good
    prestige() {
      if (!levelInfo().maxed) return false;
      d.prestige++;
      d.xp = 0;
      d.prestigePoints = 0;
      d.lastLevel = 1;
      d.exploitsSeen = {};
      d.slotsSeen = 0;
      d.equipped = [];
      markKept();
      fillLoadout();
      save();
      return true;
    },
    setPuzzleCount(n) { puzzleCount = n; },
    puzzleSolved: (i) => !!d.puzzles[i],
    solvePuzzle(i) { d.puzzles[i] = true; },
    // Lists for the RECORDS panel
    unlocks: () => UNLOCKS.map((u) => ({ ...u, goal: goalOf(u), current: u.value(), done: isUnlocked(u.id) })),
    achievements: () => ACHIEVEMENTS.map((a) => ({ ...a, goal: goalOf(a), current: a.value(), done: !!d.achieved[a.id] })),
    stats: () => ({ ...d, bestNormal: best('normal'), bestEasy: best('easy'), bestHard: best('hard') }),

    // Run events from script.js
    startRun(difficulty, mode = 'classic') {
      run = { difficulty, mode, drops: 0, started: false, bits: 0, chain: 0, bytes: 0 };
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
    runStats: () => ({ ...run }),
    // values: the numbers of the bits decrypted
    decrypted(values, chain) {
      d.bits += values.length;
      d.xp += values.length;
      run.bits += values.length;
      run.chain = Math.max(run.chain, chain);
      for (const v of values) d.bitsByValue[v] = (d.bitsByValue[v] || 0) + 1;
      d.bestChain = Math.max(d.bestChain, chain);
    },
    bytes(count) {
      d.bytes += count;
      run.bytes += count;
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
    addPoints(n) {
      if (n <= 0) return;
      d.points += n;
      d.prestigePoints += n;
    },
    sweep() { d.sweeps++; },
    closeCall() { d.closeCalls++; },
    check,
  };
})();
