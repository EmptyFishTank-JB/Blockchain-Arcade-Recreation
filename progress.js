// Progress: lifetime stats, levels and DECRYPTOR ranks, earnable unlocks (Hard mode,
// tracks, themes, exploits) and achievements, saved in this browser. Full Access
// (unlocks.js) unlocks everything straight away; otherwise it's earned by playing.
// script.js reports what happens in a run; check() then returns anything newly earned.
//
// Levels: bits decrypted are XP, from Lv 1 to Lv 80. At Lv 80 the player can RANK UP to the
// next DECRYPTOR rank: back to Lv 1, rank +1, and exploits lock again. Exploits (in EXPLOIT_ORDER)
// and exploit slots unlock by level within a rank; DECRYPTOR N keeps N slots and the first N exploits
// for good, and the rest unlock sooner. Only exploits equipped in a slot are awarded. Each
// rank also permanently unlocks the next theme in THEME_ORDER. Tracks and Hard mode are
// permanent unlocks and never reset.
const Progress = (() => {
  const KEY = 'bytefall-progress';
  const fresh = () => ({
    games: 0, // sessions started (first drop of a run)
    drops: 0,
    bits: 0, // bits decrypted
    bitsByValue: {}, // number -> bits of that number decrypted
    bytes: 0, // Hard: BYTE bonuses
    nibbles: 0, // Easy and Normal: NIBBLE bonuses
    bestDropNibbles: 0, // most nibbles from a single drop
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
    decryptor: 0, // DECRYPTOR rank
    xp: 0, // bits decrypted this rank
    decryptorPoints: 0, // points earned this rank
    equipped: [], // exploit ids in the loadout slots
    lastLevel: 1, // for LEVEL UP announcements
    exploitsSeen: {}, // exploit id -> true once announced this rank
    slotsSeen: 0, // slots announced this rank
    firstDropClears: 0, // sessions where the first drop decrypted something
    bestClearStreak: 0, // most drops in a row that each decrypted a bit
    bestNoToolsScore: 0, // best score in a session with no exploit run
    bestDropBits: 0, // most bits decrypted by one drop
    bestDropBroken: 0, // most layers broken open by one drop
    fullStacks: 0, // columns filled to the line, then brought down to half height
    bestRunCloseCalls: 0,
    bestBlitz: 0,
    bestZenDrops: 0,
    perfectDailies: 0, // Daily Decrypts ended with the board empty
    puzzleTries: {}, // puzzle index -> attempts (runs with at least one drop)
    firstTries: 0, // puzzles solved on the first attempt
    puzzleStreak: 0, // solves since the last failed puzzle
    bestPuzzleStreak: 0,
    bestBombHits: 0, // most blocks one Logic Bomb blast wiped
    stings: 0, // Honeypots sprung
    wiretaps: 0, // Packet Sniffers used up without losing the run
    pivotChains: 0, // PIVOT drops that decrypted bits
    bestRunExploits: 0,
    bestEquipped: 0, // most loadout slots filled at once
    tracksHeard: {}, // track id -> true once played
    tracksPlayed: {}, // track id -> true after a full session (10+ drops) on it
    themesPlayed: {}, // theme id -> true after a full session in it
    fontsPlayed: {}, // font id -> true after a full session in it
    lateNight: 0, // dropped a bit between 2 and 4 AM
    birthday: 0, // dropped a bit on Sep 23
    rageQuit: 0, // restarted 10 live sessions in one sitting
    snakeEyes: 0, // lost with 0 points
    leet: 0, // finished on exactly 1,337
    bestClassicDrops: 0, // longest CLASSIC session, in drops
    dailyDay: { date: '', kinds: {} }, // daily games played on the latest UTC day
    dailySweeps: 0, // days all four daily games were played
    breaches: 0, // BREACH boards cleared
    sundaySolves: 0, // Sunday (hardest) daily puzzles solved
    dailyFirstTries: 0, // daily puzzles solved on the first try
    secrets: {}, // hidden achievement id -> true (reported by script.js)
    vsWins: {}, // VS CPU: CPU level -> wins
    vsLosses: {}, // VS CPU: CPU level -> losses
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
    const key = `bytefall-best-${difficulty}`;
    try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
  };

  // Credit players from before progression: anyone with a Hard score keeps Hard.
  try {
    if (best('hard') > 0) d.earned['mode-hard'] = true;
  } catch (e) {}

  // Tracks 02-10: each roughly 1.5-2.8x the last, so the early ones come quickly
  const TRACK_BITS = [125, 350, 800, 1600, 3000, 5000, 7500, 11000, 15000];

  const MAX_LEVEL = 80;
  // 100 bits (12.5 bytes) per level. Lv 80 starts at 7,900 bits and its bar fills at 8,000,
  // when RANK UP opens: a full DECRYPTOR rank is exactly 1 kilobyte.
  const BITS_PER_LEVEL = 100;
  const RANK_BITS = MAX_LEVEL * BITS_PER_LEVEL;
  function levelInfo() {
    const level = Math.min(MAX_LEVEL, Math.floor(d.xp / BITS_PER_LEVEL) + 1);
    const into = Math.min(BITS_PER_LEVEL, d.xp - (level - 1) * BITS_PER_LEVEL);
    return { level, into, need: BITS_PER_LEVEL, maxed: d.xp >= RANK_BITS, decryptor: d.decryptor, xp: Math.min(d.xp, RANK_BITS), rankBits: RANK_BITS };
  }

  // Weakest first. After the ones a rank keeps, each unlocks at the next level in EXPLOIT_LEVELS.
  const EXPLOIT_ORDER = ['rng', 'bitflip', 'buffer-overflow', 'trojan', 'pivot', 'worm-virus', 'keylogger', 'packet-sniffer',
    'backdoor', 'logic-bomb', 'honeypot', 'dictionary-attack', 'rainbow-table'];
  const EXPLOIT_LEVELS = [3, 8, 13, 18, 23, 29, 35, 41, 47, 53, 59, 65, 70];
  // Loadout slots: DECRYPTOR N keeps N (up to MAX_SLOTS); the rest unlock at SLOT_LEVELS in turn
  const MAX_SLOTS = 6;
  const SLOT_LEVELS = [5, 15, 30, 45, 60, 75];
  let exploitNames = {}; // id -> name, from script.js

  function exploitInfo(id) {
    const k = EXPLOIT_ORDER.indexOf(id);
    const kept = Math.min(d.decryptor, EXPLOIT_ORDER.length);
    if (k < kept) return { unlocked: true, kept: true, level: 0 };
    const level = EXPLOIT_LEVELS[k - kept];
    return { unlocked: Unlocks.hasFullAccess() || levelInfo().level >= level, kept: false, level };
  }
  function slotInfo() {
    if (Unlocks.hasFullAccess()) return { slots: MAX_SLOTS, max: MAX_SLOTS, kept: MAX_SLOTS, nextLevel: 0 };
    const kept = Math.min(d.decryptor, MAX_SLOTS);
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

  // Each DECRYPTOR rank permanently unlocks the next theme
  const THEME_ORDER = [['cipher', 'CIPHER'], ['amber-crt', 'AMBER CRT'], ['monochrome', 'MONOCHROME'], ['anaglyph', 'ANAGLYPH'],
    ['synthwave', 'SYNTHWAVE'], ['dot-matrix', 'DOT MATRIX'], ['paper', 'PAPER'], ['glyph', 'GLYPH'], ['spectrum', 'SPECTRUM']];

  // Pixel fonts (COURIER is free): [id, name, achievements needed]
  const FONT_ORDER = [['share-tech', 'SHARE TECH MONO', 10], ['press-start', 'PRESS START', 25], ['bitcount', 'BITCOUNT', 40], ['bytesized', 'BYTESIZED', 55]];

  // group: where it shows in the UNLOCKS list. value() / goal drive its tracker.
  const UNLOCKS = [
    { id: 'mode-hard', group: 'MODE', name: 'HARD MODE', need: 'Score 2,000 on Normal', value: () => best('normal'), goal: 2000 },
    ...TRACK_BITS.map((goal, i) => ({
      id: `track-${i + 2}`, group: 'TRACKS', name: `TRACK ${String(i + 2).padStart(2, '0')}`,
      need: `Decrypt ${goal.toLocaleString('en-US')} bits`, value: () => d.bits, goal,
    })),
    ...THEME_ORDER.map(([id, name], i) => ({
      id: `theme-${id}`, group: 'THEMES', name, need: `Reach DECRYPTOR ${i + 1}`, value: () => d.decryptor, goal: i + 1,
    })),
    // Fonts unlock by achievements earned
    ...FONT_ORDER.map(([id, name, goal]) => ({
      id: `font-${id}`, group: 'FONTS', name, need: `Earn ${goal} achievements`, value: () => count(d.achieved), goal,
    })),
  ];

  const themeIds = UNLOCKS.filter((u) => u.group === 'THEMES').map((u) => u.id);
  const trackIds = UNLOCKS.filter((u) => u.group === 'TRACKS').map((u) => u.id);
  let exploitCount = 7; // set by script.js from HACKS
  let puzzleCount = 30; // set by script.js from PUZZLES
  let trackCount = 7; // set by script.js from Music.tracks()
  let themeCount = 10; // set by script.js from THEMES
  let sittingRestarts = 0; // live sessions restarted since the page loaded
  let sittingThemes = 0; // theme changes since the page loaded
  let sittingTracks = 0; // tracks picked since the page loaded
  const count = (obj) => Object.keys(obj).length;

  const ACHIEVEMENTS = [
    { id: 'first-contact', name: 'FIRST CONTACT', desc: 'Start your first session', value: () => d.games, goal: 1 },
    { id: 'regular', name: 'REGULAR', desc: 'Play 25 sessions', value: () => d.games, goal: 25 },
    { id: 'veteran', name: 'VETERAN', desc: 'Play 100 sessions', value: () => d.games, goal: 100 },
    { id: 'handshake', name: 'HANDSHAKE', desc: 'Decrypt 100 bits', value: () => d.bits, goal: 100 },
    // Data decrypted, in decimal units of bits decrypted (8 bits to a byte)
    { id: 'kilobit', name: 'KILOBIT', desc: 'Decrypt 1,000 bits', value: () => d.bits, goal: 1000 },
    { id: 'kilobyte', name: 'KILOBYTE', desc: 'Decrypt 8,000 bits', value: () => d.bits, goal: 8000 },
    { id: 'megabit', name: 'MEGABIT', desc: 'Decrypt 1,000,000 bits', value: () => d.bits, goal: 1000000 },
    { id: 'megabyte', name: 'MEGABYTE', desc: 'Decrypt 8,000,000 bits', value: () => d.bits, goal: 8000000 },
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
    { id: 'daily-driver', name: 'DAILY DRIVER', desc: 'Play a Daily game 7 days in a row', value: () => d.bestDailyStreak, goal: 7 },
    { id: 'locksmith', name: 'LOCKSMITH', desc: 'Solve 10 puzzles', value: () => Object.keys(d.puzzles).length, goal: 10 },
    { id: 'master-key', name: 'MASTER KEY', desc: 'Solve every puzzle', value: () => Object.keys(d.puzzles).length, goal: () => puzzleCount },
    { id: 'maxed-out', name: 'MAXED OUT', desc: 'Fill Lv 80 as DECRYPTOR 9', value: () => (d.decryptor >= 10 || (d.decryptor >= 9 && levelInfo().maxed) ? 1 : 0), goal: 1 },
    { id: 'rollover', name: 'ROLLOVER', desc: 'Rank up to DECRYPTOR 1', value: () => d.decryptor, goal: 1 },
    { id: 'full-spectrum', name: 'FULL SPECTRUM', desc: 'Unlock every theme', value: () => themeIds.filter(isUnlocked).length, goal: themeIds.length },
    { id: 'collector', name: 'COLLECTOR', desc: 'Unlock every music track (15,000 bits)', value: () => trackIds.filter(isUnlocked).length, goal: trackIds.length },
    // Skill
    { id: 'zero-day', name: 'ZERO-DAY', desc: 'Decrypt a bit with the first drop of a session', value: () => d.firstDropClears, goal: 1 },
    { id: 'surgical', name: 'SURGICAL', desc: '20 drops in a row that each decrypt a bit (exploit drops skip)', value: () => d.bestClearStreak, goal: 20 },
    { id: 'no-tools', name: 'NO TOOLS', desc: 'Score 2,000 in one session without running an exploit', value: () => d.bestNoToolsScore, goal: 2000 },
    { id: 'heap-spray', name: 'HEAP SPRAY', desc: 'Decrypt 15 bits with one drop', value: () => d.bestDropBits, goal: 15 },
    { id: 'full-stack', name: 'FULL STACK', desc: 'Fill a column to the line, then bring it back down to half height', value: () => d.fullStacks, goal: 1 },
    { id: 'firewall-breach', name: 'FIREWALL BREACH', desc: 'Break 3 encryption layers open with one drop', value: () => d.bestDropBroken, goal: 3 },
    { id: 'second-wind', name: 'SECOND WIND', desc: 'Get two CLOSE CALLs in one session', value: () => d.bestRunCloseCalls, goal: 2 },
    // Modes
    { id: 'speed-run', name: 'SPEED RUN', desc: 'Score 1,000 in one Blitz', value: () => d.bestBlitz, goal: 1000 },
    { id: 'blitzkrieg', name: 'BLITZKRIEG', desc: 'Score 3,000 in one Blitz', value: () => d.bestBlitz, goal: 3000 },
    { id: 'zen-master', name: 'ZEN MASTER', desc: 'Last 300 drops in one Zen session', value: () => d.bestZenDrops, goal: 300 },
    { id: 'daily-grind', name: 'DAILY GRIND', desc: 'Play the Daily on 30 different days', value: () => d.dailies, goal: 30 },
    { id: 'streak', name: 'STREAK', desc: 'Play a Daily game 30 days in a row', value: () => d.bestDailyStreak, goal: 30 },
    { id: 'perfect-daily', name: 'PERFECT DAILY', desc: 'Finish a Daily Decrypt with the board empty', value: () => d.perfectDailies, goal: 1 },
    { id: 'first-try', name: 'FIRST TRY', desc: 'Solve a puzzle on your first attempt', value: () => d.firstTries, goal: 1 },
    { id: 'pickpocket', name: 'PICKPOCKET', desc: 'Solve 5 puzzles in a row without failing one', value: () => d.bestPuzzleStreak, goal: 5 },
    // Exploits
    { id: 'time-bomb', name: 'TIME BOMB', desc: 'Wipe 5 blocks with one Logic Bomb blast', value: () => d.bestBombHits, goal: 5 },
    { id: 'sting', name: 'STING', desc: 'Spring a Honeypot', value: () => d.stings, goal: 1 },
    { id: 'wiretap', name: 'WIRETAP', desc: 'Use all 3 Packet Sniffer bits without losing the session', value: () => d.wiretaps, goal: 1 },
    { id: 'lateral-movement', name: 'LATERAL MOVEMENT', desc: 'Start a chain with a PIVOT', value: () => d.pivotChains, goal: 1 },
    { id: 'chained-exploits', name: 'CHAINED EXPLOITS', desc: 'Run 3 exploits in one session', value: () => d.bestRunExploits, goal: 3 },
    { id: 'arsenal', name: 'ARSENAL', desc: 'Fill all 6 exploit slots', value: () => d.bestEquipped, goal: MAX_SLOTS },
    // Collection and progress
    { id: 'tech-support', name: 'TECH SUPPORT', desc: 'Play a full session (10+ drops) in the SHARE TECH MONO font', value: () => (d.fontsPlayed['share-tech'] ? 1 : 0), goal: 1 },
    { id: 'insert-coin', name: 'INSERT COIN', desc: 'Play a full session (10+ drops) in the PRESS START font', value: () => (d.fontsPlayed['press-start'] ? 1 : 0), goal: 1 },
    { id: 'bit-by-bit', name: 'BIT BY BIT', desc: 'Play a full session (10+ drops) in the BITCOUNT font', value: () => (d.fontsPlayed.bitcount ? 1 : 0), goal: 1 },
    { id: 'bite-sized', name: 'BITE-SIZED', desc: 'Play a full session (10+ drops) in the BYTESIZED font', value: () => (d.fontsPlayed.bytesized ? 1 : 0), goal: 1 },
    { id: 'dj', name: 'DJ', desc: 'Listen to every track', value: () => count(d.tracksHeard), goal: () => trackCount },
    { id: 'audiophile', name: 'AUDIOPHILE', desc: 'Play a full session (10+ drops) on every track', value: () => count(d.tracksPlayed), goal: () => trackCount },
    { id: 'chameleon', name: 'CHAMELEON', desc: 'Play a full session (10+ drops) in every theme', value: () => count(d.themesPlayed), goal: () => themeCount },
    { id: 'lv-40', name: 'LV 40', desc: 'Reach level 40', value: () => (d.decryptor > 0 ? 40 : levelInfo().level), goal: 40 },
    { id: 'gigabit', name: 'GIGABIT', desc: 'Decrypt 1,000,000,000 bits', value: () => d.bits, goal: 1000000000, impossible: true },
    { id: 'insomniac', name: 'INSOMNIAC', desc: 'Play between 2 and 4 AM', value: () => d.lateNight, goal: 1 },
    { id: 'birthday', name: 'BIRTHDAY', desc: "Play on September 23, ByteFall's birthday", value: () => d.birthday, goal: 1, hidden: true },
    // Hidden until earned
    { id: 'rage-quit', name: 'RAGE QUIT', desc: 'Restart 10 sessions in one sitting', value: () => d.rageQuit, goal: 1, hidden: true },
    { id: 'snake-eyes', name: 'SNAKE EYES', desc: 'Lose a session with 0 points', value: () => d.snakeEyes, goal: 1, hidden: true },
    { id: '1337', name: '1337', desc: 'Finish a session on exactly 1,337 points', value: () => d.leet, goal: 1, hidden: true },
    // More: skill, totals and modes
    { id: 'lifer', name: 'LIFER', desc: 'Play 500 sessions', value: () => d.games, goal: 500 },
    { id: 'marathon', name: 'MARATHON', desc: 'Last 250 drops in one Classic session', value: () => d.bestClassicDrops, goal: 250 },
    { id: 'supernova', name: 'SUPERNOVA', desc: 'Get a 10x chain', value: () => d.bestChain, goal: 10 },
    { id: 'byte-array', name: 'BYTE ARRAY', desc: 'Decrypt 100 bytes', value: () => d.bytes, goal: 100 },
    { id: 'triple-byte', name: 'TRIPLE BYTE', desc: 'Decrypt 3 bytes with one drop', value: () => d.bestDropBytes, goal: 3 },
    { id: 'onion-core', name: 'ONION CORE', desc: 'Peel 10,000 encryption layers', value: () => d.peeled, goal: 10000 },
    { id: 'demolition', name: 'DEMOLITION', desc: 'Break 500 encryption layers all the way open', value: () => d.broken, goal: 500 },
    { id: 'advanced-persistent-threat', name: 'ADVANCED PERSISTENT THREAT', desc: 'Run 500 exploits', value: () => d.exploits, goal: 500 },
    { id: 'hypervisor', name: 'HYPERVISOR', desc: 'Score 20,000 in one session', value: () => d.bestScore, goal: 20000 },
    { id: 'hard-target', name: 'HARD TARGET', desc: 'Score 5,000 on Hard', value: () => best('hard'), goal: 5000 },
    { id: 'full-range', name: 'FULL RANGE', desc: 'Decrypt 100 of every number from [1] to [7]', value: () => Math.min(...[1, 2, 3, 4, 5, 6, 7].map((n) => d.bitsByValue[n] || 0)), goal: 100 },
    { id: '106473', name: '106473', desc: 'Decrypt 106,473 bits', value: () => d.bits, goal: 106473 },
    { id: 'lucky-sevens', name: 'LUCKY SEVENS', desc: 'Decrypt 1,000 [7]s', value: () => d.bitsByValue[7] || 0, goal: 1000 },
    { id: 'lightspeed', name: 'LIGHTSPEED', desc: 'Score 5,000 in one Blitz', value: () => d.bestBlitz, goal: 5000 },
    { id: 'daily-sweep', name: 'DAILY SWEEP', desc: 'Play all four daily games on the same day', value: () => d.dailySweeps, goal: 1 },
    { id: 'breached', name: 'BREACHED', desc: 'Clear the whole board in BREACH', value: () => d.breaches, goal: 1 },
    { id: 'one-shot', name: 'ONE SHOT', desc: 'Solve a daily puzzle on the first try', value: () => d.dailyFirstTries, goal: 1 },
    { id: 'sunday-best', name: 'SUNDAY BEST', desc: "Solve a Sunday daily puzzle (the week's hardest)", value: () => d.sundaySolves, goal: 1 },
    { id: 'safecracker', name: 'SAFECRACKER', desc: 'Solve 30 puzzles', value: () => count(d.puzzles), goal: 30 },
    { id: 'century', name: 'CENTURY', desc: 'Play a Daily game 100 days in a row', value: () => d.bestDailyStreak, goal: 100 },
    { id: 'triple-crown', name: 'TRIPLE CROWN', desc: 'Reach DECRYPTOR 3', value: () => d.decryptor, goal: 3 },
    // Nibbles (Easy and Normal: 4 bits decrypted by one drop)
    ...[
      ['just-a-crumb', 'JUST A CRUMB', 'Decrypt your first nibble', 1],
      ['a-full-byte', 'A FULL BYTE', 'Decrypt 2 nibbles (8 bits: one byte)', 2],
      ['64-bit-architecture', '64-BIT ARCHITECTURE', 'Decrypt 16 nibbles (64 bits)', 16],
      ['snack-attack', 'SNACK ATTACK', 'Decrypt 100 nibbles', 100],
      ['nibbling', 'NIBBLING', 'Decrypt 250 nibbles (1,000 bits: a kilobit)', 250],
      ['kilonibble', 'KILONIBBLE', 'Decrypt 1,000 nibbles', 1000],
      ['kibinibble', 'KIBINIBBLE', 'Decrypt 1,024 nibbles', 1024],
      ['kibibyte', 'KIBIBYTE', 'Decrypt 2,048 nibbles (1,024 bytes)', 2048],
      ['dial-up-speeds', 'DIAL-UP SPEEDS', 'Decrypt 16,384 nibbles (65,536 bits)', 16384],
      ['16-bit-era', 'THE 16-BIT ERA', 'Decrypt 65,536 nibbles (2^16)', 65536],
      ['64k-memory-limit', '64K MEMORY LIMIT', 'Decrypt 131,072 nibbles (65,536 bytes: 64 KiB)', 131072],
      ['meganibble', 'MEGANIBBLE', 'Decrypt 1,000,000 nibbles', 1000000],
      ['mebinibble', 'MEBINIBBLE', 'Decrypt 1,048,576 nibbles (1,024 x 1,024)', 1048576],
      ['mebibyte', 'MEBIBYTE', 'Decrypt 2,097,152 nibbles (1,048,576 bytes: 1 MiB)', 2097152],
    ].map(([id, name, desc, goal]) => ({ id, name, desc, value: () => d.nibbles, goal })),
    // More hidden ones
    ...[
      ['konami', 'KONAMI', 'Enter the Konami code'],
      ['not-found', 'NOT FOUND', 'Finish a session on exactly 404 points'],
      ['deep-thought', 'DEEP THOUGHT', 'Finish a session with exactly 42 bits decrypted'],
      ['jackpot', 'JACKPOT', 'Decrypt seven [7]s with one drop'],
      ['silent-running', 'SILENT RUNNING', 'Play a full session (10+ drops) with the sound and music off'],
      ['stubborn', 'STUBBORN', 'Try the same daily puzzle 10 times'],
      ['so-close', 'SO CLOSE', 'End a BREACH with one layer left'],
      ['full-house', 'FULL HOUSE', 'Survive a drop with every column one block from the line or higher'],
      ['theme-park', 'THEME PARK', 'Change the theme 10 times in one sitting'],
      ['channel-surfer', 'CHANNEL SURFER', 'Pick a track 10 times in one sitting'],
      ['last-second', 'LAST SECOND', 'Decrypt a bit in Blitz with under a second left'],
      ['palindrome', 'PALINDROME', 'Finish a session on a score that reads the same backwards (4+ digits)'],
      ['overkill', 'OVERKILL', 'Run an exploit on an empty board'],
      ['double-trouble', 'DOUBLE TROUBLE', 'Have a Logic Bomb and a Honeypot armed at the same time'],
      ['friday-13th', 'FRIDAY THE 13TH', 'Play on a Friday the 13th'],
      ['pi-day', 'PI DAY', 'Play on March 14'],
    ].map(([id, name, desc]) => ({ id, name, desc, value: () => (d.secrets[id] ? 1 : 0), goal: 1, hidden: true })),
    // Impossible (or nearly): lifetime points. Listed on their own, outside the EARNED count.
    { id: '32-bit-overflow', name: '32-BIT OVERFLOW', desc: 'Decrypt 1,073,741,824 nibbles (2^32 bits)', value: () => d.nibbles, goal: 1073741824, impossible: true },
    { id: 'gigabyte', name: 'GIGABYTE', desc: 'Earn 8,000,000,000 points in total', value: () => d.points, goal: 8e9, impossible: true },
    { id: 'terabyte', name: 'TERABYTE', desc: 'Earn 8,000,000,000,000 points in total', value: () => d.points, goal: 8e12, impossible: true },
  ];

  // RECORDS sections, in order. Hidden and impossible ones show in their own sections at the
  // bottom whatever their group; the group is also the category in achievements.csv.
  const ACHIEVEMENT_GROUPS = [
    ['SESSIONS', ['first-contact', 'regular', 'veteran', 'lifer', 'marathon', 'rage-quit']],
    ['BITS DECRYPTED', ['handshake', 'kilobit', 'kilobyte', 'megabit', 'megabyte', '106473', 'full-range', 'lucky-sevens', 'jackpot', 'gigabit']],
    ['NIBBLES', ['just-a-crumb', 'a-full-byte', '64-bit-architecture', 'snack-attack', 'nibbling', 'kilonibble', 'kibinibble', 'kibibyte', 'dial-up-speeds', '16-bit-era', '64k-memory-limit', 'meganibble', 'mebinibble', 'mebibyte', '32-bit-overflow']],
    ['CHAINS AND SKILL', ['chain-reaction', 'cascade', 'overclocked', 'supernova', 'heap-spray', 'surgical', 'zero-day', 'clean-sweep', 'close-call', 'second-wind', 'full-stack', 'full-house']],
    ['SCORE', ['root-access', 'superuser', 'kernel-mode', 'hypervisor', 'no-tools', 'snake-eyes', '1337', 'not-found', 'deep-thought', 'palindrome', 'gigabyte', 'terabyte']],
    ['HARD MODE AND BYTES', ['hardened', 'ghost', 'hard-target', 'first-byte', 'double-byte', 'triple-byte', 'byte-stream', 'byte-array']],
    ['ENCRYPTION LAYERS', ['layer-peeler', 'onion-router', 'onion-core', 'demolition', 'firewall-breach']],
    ['EXPLOITS', ['script-kiddie', 'black-hat', 'advanced-persistent-threat', 'full-toolkit', 'chained-exploits', 'arsenal', 'time-bomb', 'sting', 'wiretap', 'lateral-movement', 'overkill', 'double-trouble']],
    ['BLITZ AND ZEN', ['speed-run', 'blitzkrieg', 'lightspeed', 'zen-master', 'last-second']],
    ['DAILY', ['daily-driver', 'daily-grind', 'streak', 'century', 'daily-sweep', 'perfect-daily', 'breached', 'one-shot', 'sunday-best', 'stubborn', 'so-close']],
    ['PUZZLES', ['first-try', 'locksmith', 'safecracker', 'master-key', 'pickpocket']],
    ['LEVELS AND DECRYPTOR RANKS', ['lv-40', 'maxed-out', 'rollover', 'triple-crown', 'full-spectrum']],
    ['THEMES, FONTS AND MUSIC', ['collector', 'chameleon', 'tech-support', 'insert-coin', 'bit-by-bit', 'bite-sized', 'dj', 'audiophile', 'theme-park', 'channel-surfer', 'silent-running']],
    ['DATES AND TIMES', ['insomniac', 'birthday', 'friday-13th', 'pi-day']],
    ['SECRETS', ['konami']],
  ];
  const groupOf = {};
  ACHIEVEMENT_GROUPS.forEach(([group, ids]) => ids.forEach((id) => { groupOf[id] = group; }));
  const byId = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const ORDERED = [
    ...ACHIEVEMENT_GROUPS.flatMap(([, ids]) => ids.map((id) => byId[id])).filter(Boolean),
    ...ACHIEVEMENTS.filter((a) => !groupOf[a.id]), // any not listed above land at the end
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
    d.bestEquipped = Math.max(d.bestEquipped, d.equipped.length);
    for (const a of ACHIEVEMENTS) {
      if (!d.achieved[a.id] && a.value() >= goalOf(a)) {
        d.achieved[a.id] = true;
        earned.push({ type: 'ACHIEVEMENT', name: a.name });
      }
    }
    save();
    return quiet ? [] : earned;
  }
  // Exploits and slots a rank starts with aren't announced
  const markKept = () => {
    EXPLOIT_ORDER.forEach((id) => { if (exploitInfo(id).kept) d.exploitsSeen[id] = true; });
    d.slotsSeen = Math.max(d.slotsSeen, Math.min(d.decryptor, MAX_SLOTS));
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
    rankUp() {
      if (!levelInfo().maxed) return false;
      d.decryptor++;
      d.xp = 0;
      d.decryptorPoints = 0;
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
    setTrackCount(n) { trackCount = n; },
    setThemeCount(n) { themeCount = n; },
    puzzleSolved: (i) => !!d.puzzles[i],
    solvePuzzle(i) {
      if (!d.puzzles[i] && d.puzzleTries[i] === 1) d.firstTries++;
      d.puzzles[i] = true;
      d.puzzleStreak++;
      d.bestPuzzleStreak = Math.max(d.bestPuzzleStreak, d.puzzleStreak);
    },
    puzzleFailed() { d.puzzleStreak = 0; },
    // Lists for the RECORDS panel
    unlocks: () => UNLOCKS.map((u) => ({ ...u, goal: goalOf(u), current: u.value(), done: isUnlocked(u.id) })),
    // In RECORDS order, each with its section (group)
    achievements: () => ORDERED.map((a) => ({ ...a, group: groupOf[a.id] || 'OTHER', goal: goalOf(a), current: a.value(), done: !!d.achieved[a.id] })),
    stats: () => ({ ...d, bestNormal: best('normal'), bestEasy: best('easy'), bestHard: best('hard') }),

    // Run events from script.js
    // mode: the game played ('decrypt', 'breach' and the others); daily: a daily game
    startRun(difficulty, mode = 'classic', puzzle = null, daily = false) {
      run = {
        difficulty, mode, puzzle, daily, drops: 0, started: false, bits: 0, chain: 0, bytes: 0,
        exploits: 0, closeCalls: 0, clearStreak: 0, dropBits: 0, dropSevens: 0, dropBroken: 0, pivoted: false, fullCols: new Set(),
      };
    },
    drop() {
      if (!run.started) {
        run.started = true;
        if (run.mode !== 'puzzle') d.games++; // puzzle retries don't count as sessions
        if (run.daily) {
          playedDaily();
          const today = new Date().toISOString().slice(0, 10);
          if (d.dailyDay.date !== today) d.dailyDay = { date: today, kinds: {} };
          if (!d.dailyDay.kinds[run.mode]) {
            d.dailyDay.kinds[run.mode] = true;
            if (count(d.dailyDay.kinds) === 4) d.dailySweeps++;
          }
        }
        if (run.mode === 'puzzle' && run.puzzle !== null) d.puzzleTries[run.puzzle] = (d.puzzleTries[run.puzzle] || 0) + 1;
      }
      run.drops++;
      d.drops++;
      if (run.difficulty === 'hard') d.bestHardDrops = Math.max(d.bestHardDrops, run.drops);
      if (run.mode === 'zen') d.bestZenDrops = Math.max(d.bestZenDrops, run.drops);
      if (run.mode === 'classic') d.bestClassicDrops = Math.max(d.bestClassicDrops, run.drops);
      const now = new Date();
      if (now.getHours() >= 2 && now.getHours() < 4) d.lateNight = 1;
      if (now.getMonth() === 8 && now.getDate() === 23) d.birthday = 1;
      if (now.getDay() === 5 && now.getDate() === 13) d.secrets['friday-13th'] = true;
      if (now.getMonth() === 2 && now.getDate() === 14) d.secrets['pi-day'] = true;
      if (typeof Music !== 'undefined' && Music.isEnabled()) d.tracksHeard[Music.currentTrack()] = true;
    },
    // After a drop and everything it set off. heights: each column's height; over: the board overflowed.
    endDrop({ hack, heights, rows, over, lastSecond }) {
      if (run.dropSevens >= 7) d.secrets.jackpot = true;
      if (lastSecond && run.dropBits > 0) d.secrets['last-second'] = true;
      if (!over && heights.every((h) => h >= rows - 1)) d.secrets['full-house'] = true;
      if (run.dropBits > 0) run.clearStreak++;
      else if (!hack) run.clearStreak = 0;
      d.bestClearStreak = Math.max(d.bestClearStreak, run.clearStreak);
      if (run.drops === 1 && run.dropBits > 0 && run.mode !== 'puzzle') d.firstDropClears++;
      d.bestDropBits = Math.max(d.bestDropBits, run.dropBits);
      d.bestDropBroken = Math.max(d.bestDropBroken, run.dropBroken);
      if (run.pivoted && run.dropBits > 0) d.pivotChains++;
      if (!over) {
        heights.forEach((h, c) => {
          if (h >= rows) run.fullCols.add(c);
          else if (run.fullCols.has(c) && h <= Math.floor(rows / 2)) {
            run.fullCols.delete(c);
            d.fullStacks++;
          }
        });
      }
      run.dropBits = 0;
      run.dropSevens = 0;
      run.dropBroken = 0;
      run.pivoted = false;
    },
    // A session ended (not PUZZLE): reason 'trace', 'time' or 'daily'
    endRun({ score, reason, boardEmpty, track, theme, font, silent }) {
      if (score === 404) d.secrets['not-found'] = true;
      if (run.bits === 42) d.secrets['deep-thought'] = true;
      if (score >= 1000 && String(score) === [...String(score)].reverse().join('')) d.secrets.palindrome = true;
      if (silent && run.drops >= 10) d.secrets['silent-running'] = true;
      if (run.mode === 'decrypt' && reason === 'daily' && boardEmpty) d.perfectDailies++;
      if (run.drops >= 10) {
        if (track) d.tracksPlayed[track] = true;
        d.themesPlayed[theme] = true;
        if (font) d.fontsPlayed[font] = true;
      }
      if (reason === 'trace' && score === 0 && run.drops > 0) d.snakeEyes = 1;
      if (score === 1337) d.leet = 1;
    },
    heardTrack(id) {
      d.tracksHeard[id] = true;
      if (++sittingTracks >= 10) d.secrets['channel-surfer'] = true;
    },
    themeChanged() {
      if (++sittingThemes >= 10) d.secrets['theme-park'] = true;
    },
    // Hidden achievements script.js spots itself (KONAMI, OVERKILL and the like)
    secret(id) { d.secrets[id] = true; },
    breached() { d.breaches++; },
    vsResult(level, won) {
      const tally = won ? d.vsWins : d.vsLosses;
      tally[level] = (tally[level] || 0) + 1;
    },
    dailyPuzzleSolved(weekday, tries) {
      if (weekday === 6) d.sundaySolves++;
      if (tries === 1) d.dailyFirstTries++;
    },
    // A live session thrown away with RESTART or a difficulty switch
    restarted() {
      sittingRestarts++;
      if (sittingRestarts >= 10) d.rageQuit = 1;
    },
    runDrops: () => run.drops,
    runStats: () => ({ ...run }),
    // values: the numbers of the bits decrypted
    decrypted(values, chain) {
      d.bits += values.length;
      d.xp += values.length;
      run.bits += values.length;
      run.dropBits += values.length;
      run.dropSevens += values.filter((v) => v === 7).length;
      run.chain = Math.max(run.chain, chain);
      for (const v of values) d.bitsByValue[v] = (d.bitsByValue[v] || 0) + 1;
      d.bestChain = Math.max(d.bestChain, chain);
    },
    bytes(count) {
      d.bytes += count;
      run.bytes += count;
      d.bestDropBytes = Math.max(d.bestDropBytes, count);
    },
    nibbles(count) {
      d.nibbles += count;
      d.bestDropNibbles = Math.max(d.bestDropNibbles, count);
    },
    peeled(broken) {
      d.peeled++;
      if (broken) {
        d.broken++;
        run.dropBroken++;
      }
    },
    exploit(id) {
      d.exploits++;
      d.exploitUses[id] = (d.exploitUses[id] || 0) + 1;
      run.exploits++;
      d.bestRunExploits = Math.max(d.bestRunExploits, run.exploits);
      if (id === 'pivot') run.pivoted = true;
    },
    score(points) {
      d.bestScore = Math.max(d.bestScore, points);
      if (run.mode === 'blitz' && !run.daily) d.bestBlitz = Math.max(d.bestBlitz, points);
      if (run.exploits === 0 && run.mode !== 'puzzle') d.bestNoToolsScore = Math.max(d.bestNoToolsScore, points);
    },
    bombHits(n) { d.bestBombHits = Math.max(d.bestBombHits, n); },
    sting() { d.stings++; },
    wiretap() { d.wiretaps++; },
    addPoints(n) {
      if (n <= 0) return;
      d.points += n;
      d.decryptorPoints += n;
    },
    sweep() { d.sweeps++; },
    closeCall() {
      d.closeCalls++;
      run.closeCalls++;
      d.bestRunCloseCalls = Math.max(d.bestRunCloseCalls, run.closeCalls);
    },
    check,
  };
})();
