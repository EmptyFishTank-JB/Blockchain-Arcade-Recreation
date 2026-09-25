// BYTEFALL — a decryption puzzle inspired by Blockchain from Arcade Paradise.
// Core mechanic is Drop7-style: encrypted bits 1-N fall into an N-wide grid and
// a bit decrypts (clears) when it sits in an unbroken row/column run whose
// length equals its number. Clears peel adjacent encryption layers (the
// 'firewall' cells, which rise in rows every few drops), and a 5x combo
// unlocks an exploit (a 'hack' piece) that is dropped like a bit.
// Easy and Normal play 7x7; Hard plays a full byte, 8x8 with bits up to 8.

// Grid size comes from the difficulty and is set by initGame().
let COLS = 7;
let ROWS = 7;
let MAX_ROWS = ROWS + 1; // top row holds overflow; anything left there after clears ends the run
const STEP_MS = 35; // per-row fall speed
const HACK_COMBO = 5;

const BASE_INTERVAL = 8; // drops between firewall rows
const HARD_MIN_INTERVAL = 4;
const HARD_POINTS_PER_STEP = 700; // hard mode loses one drop per this many points
const BYTE_BITS = 8; // Hard: every 8 bits decrypted by one drop is a byte...
const BYTE_BONUS = 256; // ...worth 2^8 points
const NIBBLE_BITS = 4; // Easy and Normal: every 4 is a nibble...
const NIBBLE_BONUS = 16; // ...worth 2^4 points
// The bonus a drop's decrypts earn: a BYTE on Hard, a NIBBLE on Easy and Normal
const PACKETS = {
  byte: { name: 'BYTE', plural: 'BYTES', bits: BYTE_BITS, bonus: BYTE_BONUS },
  nibble: { name: 'NIBBLE', plural: 'NIBBLES', bits: NIBBLE_BITS, bonus: NIBBLE_BONUS },
};

const DIFFICULTIES = {
  easy: { label: 'EASY', size: 7, packet: 'nibble', showNext: true, interval: () => BASE_INTERVAL },
  normal: { label: 'NORMAL', size: 7, packet: 'nibble', showNext: false, interval: () => BASE_INTERVAL },
  hard: {
    label: 'HARD',
    size: 8,
    packet: 'byte',
    showNext: false,
    interval: (pts) => Math.max(HARD_MIN_INTERVAL, BASE_INTERVAL - Math.floor(pts / HARD_POINTS_PER_STEP)),
  },
};

// easyCombo: on Easy, the chain length that unlocks each hack (stronger hacks need longer chains).
// Which exploits a player can get comes from progress.js (levels and DECRYPTOR ranks).
const HACKS = {
  'worm-virus': { name: 'WORM VIRUS', icon: '§', easyCombo: 5 },
  'buffer-overflow': { name: 'BUFFER OVERFLOW', icon: '+', easyCombo: 4 },
  trojan: { name: 'TROJAN', icon: '◈', easyCombo: 4 },
  rng: { name: 'RNG', icon: '?', easyCombo: 3 },
  bitflip: { name: 'BITFLIP', icon: '\u2195', easyCombo: 3 },
  'dictionary-attack': { name: 'DICTIONARY ATTACK', icon: '#', easyCombo: 4 },
  keylogger: { name: 'KEYLOGGER', icon: '@', easyCombo: 3 },
  backdoor: { name: 'BACKDOOR', icon: '_', easyCombo: 4 },
  'rainbow-table': { name: 'RAINBOW TABLE', icon: '*', easyCombo: 5 },
  'packet-sniffer': { name: 'PACKET SNIFFER', icon: '~', easyCombo: 3 },
  'logic-bomb': { name: 'LOGIC BOMB', icon: '!', easyCombo: 4 },
  honeypot: { name: 'HONEYPOT', icon: '\u25CE', easyCombo: 4 },
  pivot: { name: 'PIVOT', icon: '\u21C6', easyCombo: 3 },
};
const KEYLOGGER_DROPS = 10; // drops the keylogger keeps showing the next bits for
const KEYLOGGER_PREVIEW = 3;
const SNIFFER_BITS = 3; // bits the packet sniffer lets you choose
const BOMB_DROPS = 3; // drops before a logic bomb detonates
const BLAST_RADIUS = 2; // logic bomb and honeypot reach: a 5x5 area

// The Daily Decrypt uses the same five exploits for everyone; elsewhere it's your equipped loadout.
const DAILY_EXPLOITS = ['worm-virus', 'buffer-overflow', 'trojan', 'rng', 'bitflip'];
const hackAvailable = (id) => (daily ? DAILY_EXPLOITS.includes(id) : Progress.isEquipped(id));
Progress.setExploitCount(Object.keys(HACKS).length);
Progress.setExploitNames(Object.fromEntries(Object.entries(HACKS).map(([id, h]) => [id, h.name])));

let columns = []; // columns[c] = array of cells, index 0 = bottom
let queue = []; // upcoming pieces; queue[0] is the one being dropped
let score = 0;
let best = 0;
let bestAtStart = 0;
let dropsSinceLastPulse = 0;
let pulseInterval = BASE_INTERVAL;
let gameOver = false;
let busy = false; // true while animating/resolving, blocks input
let runId = 0; // bumped on every new game so a pending game-over sequence can tell it's stale
let keyloggerDrops = 0; // drops left with the keylogger's preview showing
let snifferBits = 0; // bits left whose number the player can pick
let pivotFrom = null; // PIVOT: column picked, waiting for the player to pick a neighbor
let pivotWith = null; // PIVOT: the neighbor the landing pivot swaps with
let breached = false; // BREACH: the board was cleared

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  },
};

// The EASY / NORMAL / HARD choice (CLASSIC mode). `difficulty` is the rules of the current
// run: the classic choice in CLASSIC, Normal in every other mode.
let classicDifficulty = DIFFICULTIES[storage.get('bytefall-difficulty')] ? storage.get('bytefall-difficulty') : 'normal';
if (classicDifficulty === 'hard' && !Progress.isUnlocked('mode-hard')) classicDifficulty = 'normal';
let difficulty = classicDifficulty;

const BLITZ_SECONDS = 120;
const DAILY_BLITZ_SECONDS = 60;
const DAILY_BITS = 40; // the Daily Decrypt deals a fixed stack of bits, then ends
const BREACH_BITS = 30; // BREACH deals 30
const BREACH_ROWS = 3; // rows of the pre-built firewall
const BREACH_LAYER_POINTS = 25; // BREACH: extra points for each layer broken open
const BREACH_CLEAR_BONUS = 1000; // BREACH: the whole board cleared
let dealt = 0; // bits dealt so far this run (DECRYPT, BREACH)
const dealLimit = () => (mode === 'decrypt' ? DAILY_BITS : mode === 'breach' ? BREACH_BITS : Infinity);
// DAILY: the first run of each daily game each day is the official one (its score is today's);
// the rest are practice. Daily Decrypt keeps its original key names.
let dailyOfficial = true;
const dailyTag = (kind = mode) => (kind === 'decrypt' ? '' : `${kind}-`);
const dailyKey = (kind = mode) => `bytefall-daily-${dailyTag(kind)}${todayKey()}`;
const dailyPlayedKey = (kind = mode) => `bytefall-daily-played-${dailyTag(kind)}${todayKey()}`;
const DAILY_KINDS = { decrypt: 'DAILY DECRYPT', puzzle: 'DAILY PUZZLE', blitz: 'DAILY BLITZ', breach: 'BREACH' };
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const utcWeekday = () => (new Date().getUTCDay() + 6) % 7; // Monday = 0
let reportedScore = 0; // points already added to lifetime data extracted
// The official-or-practice note on each daily game's info line
const dailyNote = (date, what) => (dailyOfficial
  ? `${DAILY_KINDS[mode]} // ${date} (UTC): ${what} Your first attempt today is the official one.`
  : `${DAILY_KINDS[mode]} // ${date} // PRACTICE: your official score today is ${fmt(Number(storage.get(dailyKey())) || 0)}.`);
// `mode` is the game being played. The mode row picks CLASSIC, DAILY, BLITZ, ZEN or PUZZLE; under
// DAILY (`daily`) the second row picks DECRYPT, PUZZLE, BLITZ or BREACH (BREACH is daily only).
const MODES = {
  classic: { label: 'CLASSIC' },
  decrypt: {
    label: 'DAILY DECRYPT',
    info: (date) => dailyNote(date, `the same ${DAILY_BITS} bits for everyone.`),
  },
  blitz: {
    label: 'BLITZ',
    info: (date) => (daily
      ? dailyNote(date, `the same bits for everyone and ${DAILY_BLITZ_SECONDS} seconds on the clock.`)
      : 'BLITZ // 2 minutes on the clock, starting with your first drop. Score all you can.'),
  },
  zen: { label: 'ZEN', noLayers: true, info: () => 'ZEN // no encryption layers and no clock. Just decrypt.' },
  puzzle: {
    label: 'PUZZLE',
    noLayers: true, // no new layers rise (puzzles can start with some)
    noHacks: true,
    info: (date) => {
      const n = currentPuzzle().pieces.length;
      const rule = `Decrypt every block on the board with exactly the ${n === 1 ? 'bit' : `${n} bits`} given, in order.`;
      return daily ? `DAILY PUZZLE // ${date} // ${WEEKDAYS[utcWeekday()]}, DIFFICULTY ${utcWeekday() + 1}/7: ${rule} Retry as often as you like.` : rule;
    },
  },
  vs: {
    label: 'VS CPU',
    // Rising layers are optional in VS (the LAYERS toggle); both boards get them when on
    get noLayers() { return !vsLayers; },
    noHacks: true,
    info: () => `VS CPU // ${CpuBoard.LEVELS[vsLevel].label} // LAYERS ${vsLayers ? 'ON' : 'OFF'}: your chains send encrypted blocks onto the CPU's board, and its chains send them onto yours. Your chains cancel blocks headed your way first. The first to overflow loses. The CPU starts with your first drop.`,
  },
  breach: {
    label: 'BREACH',
    noLayers: true, // the firewall is built at the start; no new layers rise
    info: (date) => dailyNote(date, `break through a ${BREACH_ROWS}-row firewall with ${BREACH_BITS} bits. +${BREACH_LAYER_POINTS} for every layer broken, +${BREACH_CLEAR_BONUS} for clearing the board.`),
  },
};
Progress.setPuzzleCount(PUZZLES.length);
Progress.setTrackCount(Music.tracks().length);
// PUZZLE: the first unsolved one, or the one you were on
const firstUnsolved = () => {
  const i = PUZZLES.findIndex((_, n) => !Progress.puzzleSolved(n));
  return i < 0 ? PUZZLES.length - 1 : i;
};
let puzzleIndex = Math.min(Number(storage.get('bytefall-puzzle')) || firstUnsolved(), firstUnsolved());
let overlayNext = null; // what the overlay button does in PUZZLE: 'next' or 'retry'
// The mode row's choice ('daily' or one of MODES) and the daily game under it
const TOP_MODES = ['classic', 'daily', 'blitz', 'zen', 'puzzle', 'vs'];
// VS CPU: the opponent's level
let vsLevel = CpuBoard.LEVELS[storage.get('bytefall-vs-level')] ? storage.get('bytefall-vs-level') : 'normal';
let vsLayers = storage.get('bytefall-vs-layers') !== 'off'; // new layer rows every 8 drops, for both boards
let topMode = TOP_MODES.includes(storage.get('bytefall-mode')) ? storage.get('bytefall-mode') : 'classic';
let dailyKind = DAILY_KINDS[storage.get('bytefall-daily-kind')] ? storage.get('bytefall-daily-kind') : 'decrypt';
let daily = false;
let mode = 'classic';
function setModeFromChoice() {
  daily = topMode === 'daily';
  mode = daily ? dailyKind : topMode;
}
setModeFromChoice();

// PUZZLE: the archive puzzle picked, or today's daily one (daily-puzzles.js). The daily list
// is dated from its first Monday and a whole number of weeks long, so past its end it loops
// and each weekday keeps its difficulty.
function todayPuzzle() {
  const day = Math.floor((Date.parse(`${todayKey()}T00:00:00Z`) - Date.parse(`${DAILY_PUZZLES[0].date}T00:00:00Z`)) / 86400000);
  return DAILY_PUZZLES[((day % DAILY_PUZZLES.length) + DAILY_PUZZLES.length) % DAILY_PUZZLES.length];
}
const currentPuzzle = () => (daily ? todayPuzzle() : PUZZLES[puzzleIndex]);
const dailyPuzzleTriesKey = () => `bytefall-daily-puzzle-tries-${todayKey()}`;
const dailyPuzzleSolvedKey = () => `bytefall-daily-puzzle-solved-${todayKey()}`;

// Randomness. DAILY seeds each stream from the date, so the bits you're dealt are the same for
// everyone however they play; bits revealed under layers and exploits use their own streams.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const todayKey = () => new Date().toISOString().slice(0, 10); // UTC, so the daily is the same worldwide
const dice = { queue: Math.random, reveal: Math.random, hack: Math.random };
function setupDice() {
  if (daily) {
    const day = todayKey();
    for (const stream of Object.keys(dice)) dice[stream] = seeded(hashString(`bytefall:${day}:${dailyTag()}${stream}`));
  } else if (mode === 'vs') {
    // You and the CPU get the same bits, in the same order
    vsSeed = Math.floor(Math.random() * 2 ** 31);
    for (const stream of Object.keys(dice)) dice[stream] = seeded(hashString(`bytefall:vs:${vsSeed}:${stream}`));
  } else {
    for (const stream of Object.keys(dice)) dice[stream] = Math.random;
  }
}
let vsSeed = 0;

// BLITZ clock: counts down from the first drop, paused while the tab is hidden
let timeLeft = BLITZ_SECONDS;
let clockRunning = false;
let timeUp = false;

const boardEl = document.getElementById('board');
const boardWrapEl = document.querySelector('.board-wrap');
const columnButtonsEl = document.getElementById('column-buttons');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const chainEl = document.getElementById('chain');
const currentEl = document.getElementById('current-piece');
const nextEl = document.getElementById('next-piece');
const nextStatEl = document.getElementById('next-stat');
const nextLabelEl = document.getElementById('next-label');
const pulseCounterEl = document.getElementById('pulse-counter');
const messageEl = document.getElementById('message');
const overlayEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const newBestEl = document.getElementById('new-best');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// stream: 'queue' for bits you're dealt, 'reveal' for bits uncovered or rerolled on the board
function newPacket(stream = 'reveal') {
  return { type: 'number', val: 1 + Math.floor(dice[stream]() * COLS) };
}

// Points for a bit a chain decrypts: 10 plus its number ([4] is 14), times the chain.
// Blocks wiped out by exploits are a flat 10 each.
const blockPoints = (cell) => 10 + (cell && cell.type === 'number' ? cell.val : 0);
const EXPLOIT_POINTS = 10;
const pointsFor = (positions) => positions.length * EXPLOIT_POINTS;

function newFirewall(level = 2) {
  return { type: 'firewall', level };
}

// Other modes keep their own bests; DAILY keeps today's official score (practice runs save nothing).
function bestKey() {
  if (daily) return dailyOfficial ? dailyKey() : null;
  if (mode !== 'classic') return `bytefall-best-${mode}`;
  return `bytefall-best-${difficulty}`;
}

// Always enough upcoming bits for the widest preview (the keylogger's). PUZZLE has a fixed list.
function refillQueue() {
  if (mode === 'puzzle') return;
  while (queue.length < 1 + KEYLOGGER_PREVIEW && dealt < dealLimit()) {
    queue.push(newPacket('queue'));
    dealt++;
  }
}

// DECRYPT, BREACH: bits still to drop (dealt-but-waiting plus not yet dealt)
const dailyBitsLeft = () => dealLimit() - dealt + queue.filter((p) => p.type === 'number').length;

function initGame() {
  runId++;
  difficulty = mode === 'classic' ? classicDifficulty : 'normal';
  dailyOfficial = daily && mode !== 'puzzle' && !storage.get(dailyPlayedKey());
  setupDice();
  Progress.startRun(difficulty, mode, mode === 'puzzle' && !daily ? puzzleIndex : null, daily);
  timeLeft = daily ? DAILY_BLITZ_SECONDS : BLITZ_SECONDS;
  clockRunning = false;
  timeUp = false;
  applyModeUi();
  COLS = ROWS = DIFFICULTIES[difficulty].size;
  MAX_ROWS = ROWS + 1;
  boardWrapEl.style.setProperty('--cols', COLS);
  boardWrapEl.classList.toggle('byte-grid', COLS === 8);
  boardEl.classList.remove('meltdown');
  columns = Array.from({ length: COLS }, () => []);
  queue = [];
  dealt = 0;
  reportedScore = 0;
  refillQueue();
  if (mode === 'puzzle') loadPuzzle();
  if (mode === 'breach') buildBreachWall();
  startVs();
  score = 0;
  best = Number(storage.get(daily ? dailyKey() : bestKey())) || 0;
  bestAtStart = best;
  dropsSinceLastPulse = 0;
  keyloggerDrops = 0;
  snifferBits = 0;
  pivotFrom = null;
  pivotWith = null;
  breached = false;
  pulseInterval = DIFFICULTIES[difficulty].interval(0);
  gameOver = false;
  busy = false;
  chainEl.textContent = '0x';
  document.querySelectorAll('#difficulty-row button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.difficulty === classicDifficulty);
  });
  const easy = difficulty === 'easy';
  document.getElementById('hack-intro').textContent = easy
    ? 'Chains earn your equipped exploits: the longer the chain, the stronger the exploit.'
    : `Chain ${HACK_COMBO} decrypts in one drop to get a random exploit from your equipped slots.`;
  document.querySelectorAll('.hack-item').forEach((el) => {
    el.querySelector('.combo').textContent = `${easy ? HACKS[el.dataset.hack].easyCombo : HACK_COMBO}x`;
  });
  document.getElementById('overflow-top').textContent = COLS;
  document.getElementById('rules-keys').textContent = `Click a column or press 1\u2013${COLS} to drop`;
  document.getElementById('rules-pulse').textContent = difficulty === 'hard'
    ? `every ${BASE_INTERVAL} drops, tightening to every ${HARD_MIN_INTERVAL} as your score climbs`
    : `every ${BASE_INTERVAL} drops`;
  updateHud();
  buildColumnButtons();
  render();
  overlayEl.classList.add('hidden');
  setMessage('');
  refreshExploitCards();
  fitBoard();
}

// A layer peeled to 0 shows the bit under it: fixed in PUZZLE boards, random otherwise.
function revealBit(layer) {
  return layer.hidden ? { type: 'number', val: layer.hidden } : newPacket();
}

// BREACH: the bottom rows start as a firewall, the same for everyone today. Layers are level 1 or 2
// and hide bits from the day's reveal stream.
function buildBreachWall() {
  const wall = seeded(hashString(`bytefall:${todayKey()}:breach-wall`));
  columns = columns.map(() => Array.from({ length: BREACH_ROWS }, () => newFirewall(wall() < 0.5 ? 1 : 2)));
}
const layersLeft = () => columns.reduce((n, c) => n + c.filter((cell) => cell && cell.type === 'firewall').length, 0);

// PUZZLE: 'L2:5' is a level 2 layer hiding a [5]; plain numbers are bits.
function loadPuzzle() {
  const puzzle = currentPuzzle();
  columns = puzzle.board.map((col) => col.map((block) => {
    if (typeof block === 'number') return { type: 'number', val: block };
    const [level, hidden] = block.slice(1).split(':').map(Number);
    return { type: 'firewall', level, hidden };
  }));
  queue = puzzle.pieces.map((val) => ({ type: 'number', val }));
}

function setPuzzle(i) {
  puzzleIndex = i;
  storage.set('bytefall-puzzle', String(i));
  SFX.play('static');
  initGame();
}

// Runs at the end of each PUZZLE turn (when the board didn't overflow).
function checkPuzzle() {
  if (daily && columns.every((c) => c.length === 0)) {
    const first = !storage.get(dailyPuzzleSolvedKey());
    if (first) {
      storage.set(dailyPuzzleSolvedKey(), storage.get(dailyPuzzleTriesKey()) || '1');
      Progress.dailyPuzzleSolved(utcWeekday(), Number(storage.get(dailyPuzzleSolvedKey())));
    }
    announce(Progress.check());
    showPuzzleResult(true, first);
  } else if (daily) {
    if (!queue.length) showPuzzleResult(false);
  } else if (columns.every((c) => c.length === 0)) {
    const first = !Progress.puzzleSolved(puzzleIndex);
    Progress.solvePuzzle(puzzleIndex);
    announce(Progress.check());
    showPuzzleResult(true, first);
  } else if (!queue.length) {
    showPuzzleResult(false);
  }
}

function showPuzzleResult(solved, firstTime = false) {
  gameOver = true;
  busy = true;
  setMessage('');
  SFX.play(solved ? 'egg' : 'denied');
  if (!solved && !daily) Progress.puzzleFailed();
  const last = daily || puzzleIndex === PUZZLES.length - 1;
  overlayNext = solved && !last ? 'next' : 'retry';
  document.querySelector('.overlay-box').classList.toggle('win', solved);
  document.getElementById('overlay-title').textContent = solved ? 'DECRYPTED' : 'OUT OF BITS';
  const tries = Number(storage.get(dailyPuzzleSolvedKey())) || 0;
  document.getElementById('overlay-sub').textContent = daily
    ? (solved ? `Today's puzzle cracked${tries ? ` in ${tries} ${tries === 1 ? 'try' : 'tries'}` : ''}.` : 'Blocks are still encrypted.')
    : solved
    ? (last ? 'Every puzzle solved. The whole archive is yours.' : `Puzzle ${puzzleIndex + 1} cracked${firstTime ? '' : ' again'}.`)
    : 'Blocks are still encrypted.';
  finalScoreEl.textContent = score;
  newBestEl.hidden = true;
  const note = document.getElementById('overlay-note');
  note.hidden = false;
  note.textContent = daily
    ? `DAILY PUZZLE // ${todayKey()} // ${WEEKDAYS[utcWeekday()]}`
    : `PUZZLE ${puzzleIndex + 1} / ${PUZZLES.length} // ${PUZZLES.filter((_, n) => Progress.puzzleSolved(n)).length} SOLVED`;
  shareBtn.hidden = !(daily && tries);
  shareBtn.textContent = 'SHARE';
  document.getElementById('overlay-restart-btn').textContent = overlayNext === 'next' ? 'NEXT PUZZLE' : 'RETRY';
  if (!daily) updatePuzzleNav();
  const run = runId;
  setTimeout(() => {
    if (run === runId) overlayEl.classList.remove('hidden');
  }, solved ? 500 : 700);
}

const puzzleNavEl = document.getElementById('puzzle-nav');
function updatePuzzleNav() {
  const label = document.getElementById('puzzle-label');
  label.textContent = `PUZZLE ${puzzleIndex + 1} / ${PUZZLES.length}${Progress.puzzleSolved(puzzleIndex) ? ' \u2713' : ''}`;
  label.classList.toggle('solved', Progress.puzzleSolved(puzzleIndex));
  document.getElementById('puzzle-prev').disabled = puzzleIndex === 0;
  // Ahead: any solved puzzle, or the first unsolved one
  document.getElementById('puzzle-next').disabled = puzzleIndex + 1 >= PUZZLES.length || puzzleIndex + 1 > firstUnsolved();
}
document.getElementById('puzzle-prev').addEventListener('click', () => {
  if (!busy || gameOver) setPuzzle(puzzleIndex - 1);
});
document.getElementById('puzzle-next').addEventListener('click', () => {
  if (!busy || gameOver) setPuzzle(puzzleIndex + 1);
});

// Size the board so the whole game panel fits the window's height (no clipping at the top or
// bottom), between MIN_BOARD and the CSS maximum.
const MIN_BOARD = 240;
const crtEl = document.querySelector('.crt');
function fitBoard() {
  layoutVsTop();
  const frame = document.querySelector('.board-frame');
  boardWrapEl.style.maxWidth = '';
  const cssMax = boardWrapEl.getBoundingClientRect().width;
  const rest = crtEl.getBoundingClientRect().height - frame.getBoundingClientRect().height;
  const pad = parseFloat(getComputedStyle(document.body).paddingTop) * 2;
  const ratio = frame.offsetHeight / frame.offsetWidth;
  const width = Math.max(MIN_BOARD, Math.min(cssMax, (window.innerHeight - pad - rest) / ratio));
  boardWrapEl.style.maxWidth = `${Math.floor(width)}px`;
}
window.addEventListener('resize', fitBoard);

function buildColumnButtons() {
  columnButtonsEl.innerHTML = '';
  for (let c = 0; c < COLS; c++) {
    const btn = document.createElement('button');
    btn.textContent = c + 1;
    btn.addEventListener('click', () => attemptDrop(c));
    columnButtonsEl.appendChild(btn);
  }
}

function updateColumnButtons() {
  updateFreeBtn();
  const buttons = columnButtonsEl.querySelectorAll('button');
  buttons.forEach((btn, c) => {
    const target = pivotFrom !== null && Math.abs(c - pivotFrom) === 1;
    // While PIVOT waits for a side, only the two neighbors can be pressed: the choice is committed
    btn.disabled = gameOver || busy || (pivotFrom !== null ? !target : columns[c].length >= MAX_ROWS);
    btn.classList.toggle('pivot-from', c === pivotFrom);
    btn.classList.toggle('pivot-target', target);
    btn.textContent = target ? (c < pivotFrom ? '\u2190' : '\u2192') : String(c + 1);
  });
}

// GLYPH theme: each number is a shape with that many corners (1 is a teardrop pointing up,
// 2 a lens), in a 100x100 box.
const GLYPHS = {
  1: '<path d="M50 12 L72.21 48.48 A26 26 0 1 1 27.79 48.48 Z"/>',
  2: '<path d="M50 12 Q90 52 50 92 Q10 52 50 12 Z"/>',
  3: '<polygon points="50.0,14.0 84.6,74.0 15.4,74.0"/>',
  4: '<polygon points="78.3,25.7 78.3,82.3 21.7,82.3 21.7,25.7"/>',
  5: '<polygon points="50.0,14.0 88.0,41.6 73.5,86.4 26.5,86.4 12.0,41.6"/>',
  6: '<polygon points="50.0,14.0 84.6,34.0 84.6,74.0 50.0,94.0 15.4,74.0 15.4,34.0"/>',
  7: '<polygon points="50.0,14.0 81.3,29.1 89.0,62.9 67.4,90.0 32.6,90.0 11.0,62.9 18.7,29.1"/>',
  8: '<polygon points="65.3,17.0 87.0,38.7 87.0,69.3 65.3,91.0 34.7,91.0 13.0,69.3 13.0,38.7 34.7,17.0"/>',
};
const themeIs = (id) => document.documentElement.dataset.theme === id;
const glyphSvg = (n) => `<svg class="glyph" viewBox="0 0 100 100" aria-hidden="true">${GLYPHS[n]}</svg>`;

// A bit's cell content: [n], or its glyph with a small number under GLYPH.
function fillBit(el, val) {
  if (themeIs('glyph')) {
    el.innerHTML = `${glyphSvg(val)}<span class="glyph-num">${val}</span>`;
    el.classList.add('has-glyph');
    el.setAttribute('aria-label', String(val));
  } else {
    el.textContent = `[${val}]`;
    el.classList.remove('has-glyph');
    el.removeAttribute('aria-label');
  }
}

// SPECTRUM: each bit keeps its own random hue speed, direction and phase across re-renders,
// measured from a shared clock so the cycle carries on smoothly when the board redraws.
function spinBit(el, cell) {
  if (!themeIs('spectrum')) return;
  if (!cell.spin) cell.spin = { dur: 3 + Math.random() * 7, phase: Math.random(), reverse: Math.random() < 0.5 };
  const { dur, phase, reverse } = cell.spin;
  const t = performance.now() / 1000 / dur + phase;
  el.style.setProperty('--spin', `${dur.toFixed(2)}s`);
  el.style.setProperty('--spin-delay', `${(-(t % 1) * dur).toFixed(2)}s`);
  el.style.setProperty('--spin-dir', reverse ? 'reverse' : 'normal');
  el.style.setProperty('--bit-h', String(Math.round(phase * 360))); // still hue under reduced motion
}

// Exploit icons are text, except where a phone could turn the character into an emoji: those
// are drawn as SVG (BITFLIP's up/down arrow). iconHtml() is for places that render markup.
const ICON_SVG = {
  bitflip: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5"/></svg>',
};
const iconHtml = (id) => ICON_SVG[id] || HACKS[id].icon;
const UPDOWN_SVG = ICON_SVG.bitflip;

function pieceLabel(piece) {
  return piece.type === 'hack' ? `[${HACKS[piece.id].icon}]` : `[${piece.val}]`;
}

// A bit in a HUD square: its number (or glyph); an exploit shows its icon
function showPiece(el, piece) {
  if (piece.type === 'number') {
    fillBit(el, piece.val);
    // VS shows CURRENT as a bare [n] (no box); elsewhere the box shows just the number
    if (!themeIs('glyph')) el.textContent = mode === 'vs' && el === currentEl ? `[${piece.val}]` : String(piece.val);
  } else {
    el.innerHTML = iconHtml(piece.id);
  }
  el.classList.toggle('hack', piece.type === 'hack');
  el.title = piece.type === 'hack' ? HACKS[piece.id].name : '';
}

function buildGrid() {
  // grid[row][col], row 0 = bottom, MAX_ROWS-1 = overflow row
  const grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < columns[c].length; r++) {
      grid[r][c] = columns[c][r];
    }
  }
  return grid;
}

function render(popped = [], falling = null) {
  boardEl.innerHTML = '';
  const grid = buildGrid();
  if (falling) grid[falling.row][falling.col] = falling.cell;
  for (let r = MAX_ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.pos = `${r},${c}`;
      if (r >= ROWS) div.classList.add('overflow');
      if (cell) {
        if (cell.type === 'number') {
          div.classList.add('disc');
          fillBit(div, cell.val);
          spinBit(div, cell);
        } else if (cell.type === 'hack') {
          div.classList.add('hack');
          div.innerHTML = `[${iconHtml(cell.id)}]`;
        } else if (cell.type === 'bomb') {
          div.classList.add('hack', 'armed', 'bomb');
          div.textContent = `[!${cell.timer}]`;
          div.title = `LOGIC BOMB: detonates in ${cell.timer} drop${cell.timer === 1 ? '' : 's'}`;
        } else if (cell.type === 'honeypot') {
          div.classList.add('hack', 'armed');
          div.textContent = `[${HACKS.honeypot.icon}]`;
          div.title = 'HONEYPOT: waiting for a bit beside it to decrypt';
        } else {
          div.classList.add('firewall');
          if (cell.level < 2) div.classList.add('cracked');
          div.textContent = cell.level < 2 ? '[-]' : '[=]';
        }
      }
      if (popped.some((p) => p.row === r && p.col === c)) {
        div.classList.add('pop');
      }
      boardEl.appendChild(div);
    }
    if (r === ROWS) {
      const line = document.createElement('div');
      // Glows red while any stack is right under the line
      line.className = columns.some((c) => c.length >= ROWS) ? 'overflow-line hot' : 'overflow-line';
      line.textContent = '='.repeat(80);
      boardEl.appendChild(line);
    }
  }
  updateColumnButtons();
  Music.setIntensity(dangerLevel());
}

// The last three stack heights under the line: on 7x7, 33% at 4, 67% at 5 and full from 6
// (one higher each on Hard's 8x8).
function dangerLevel() {
  const tallest = Math.max(...columns.map((c) => c.length));
  return (tallest - (ROWS - 4)) / 3;
}

function updateHud() {
  if (score > best && bestKey()) {
    best = score;
    storage.set(bestKey(), String(best));
  }
  scoreEl.textContent = score;
  bestEl.textContent = best;
  if (queue[0]) showPiece(currentEl, queue[0]);
  else {
    currentEl.textContent = '';
    currentEl.classList.remove('hack');
  }
  // Easy previews the next bit; an active keylogger shows the next three; PUZZLE shows what's left.
  const preview = mode === 'puzzle' ? Math.min(KEYLOGGER_PREVIEW, Math.max(0, queue.length - 1))
    : keyloggerDrops > 0 ? KEYLOGGER_PREVIEW : DIFFICULTIES[difficulty].showNext ? 1 : 0;
  nextStatEl.hidden = !preview;
  nextLabelEl.textContent = keyloggerDrops > 0 ? `KEYLOG ${keyloggerDrops}` : 'NEXT';
  nextStatEl.classList.toggle('keylogger', keyloggerDrops > 0);
  const hudBits = document.getElementById('hud-bits');
  if (hudBits.classList.contains('has-next') !== !!preview) {
    hudBits.classList.toggle('has-next', !!preview);
    requestAnimationFrame(fitBoard); // the HUD may wrap differently now
  }
  nextEl.innerHTML = '';
  for (const piece of queue.slice(1, 1 + preview)) {
    const sq = document.createElement('div');
    sq.className = 'bit-sq';
    showPiece(sq, piece);
    nextEl.appendChild(sq);
  }
  pulseCounterEl.textContent = mode === 'puzzle' ? queue.length : mode === 'breach' ? layersLeft() : pulseInterval - dropsSinceLastPulse;
  if (dealLimit() < Infinity) showClock();
  pulseCounterEl.closest('.stat').classList.toggle('danger', !gameOver && !MODES[mode].noLayers && pulseInterval - dropsSinceLastPulse === 1);
  if (pivotFrom !== null && !(queue[0] && queue[0].id === 'pivot')) clearPivotChoice();
  const sniffing = snifferBits > 0 && queue[0] && queue[0].type === 'number';
  currentEl.closest('.stat').classList.toggle('sniffing', !!sniffing);
  document.getElementById('current-label').innerHTML = sniffing ? `SNIFF ${snifferBits} ${UPDOWN_SVG}` : 'CURRENT';
  currentEl.title = sniffing ? 'Tap (or press up / down) to change this bit' : '';
  const heldHack = queue[0] && queue[0].type === 'hack' ? queue[0].id : null;
  document.querySelectorAll('.hack-item').forEach((el) => {
    el.classList.toggle('held', el.dataset.hack === heldHack);
  });
}

function setMessage(text, tone = '') {
  messageEl.textContent = text;
  messageEl.classList.toggle('hidden', !text);
  messageEl.classList.remove('warn', 'alarm', 'byte');
  if (tone) messageEl.classList.add(tone);
}

// Burst the message's text into particles (the text itself, not the full-width box)
function burstMessage(type) {
  const range = document.createRange();
  range.selectNodeContents(messageEl);
  FX.burst([{ rect: range.getBoundingClientRect(), type }]);
}

// PIVOT: a middle column asks which neighbor to swap with (second tap, or the arrow keys).
// Once picked, the player is committed: only the two neighbors are accepted.
function choosePivot(col) {
  pivotFrom = col;
  setMessage(`PIVOT // SWAP COLUMN ${col + 1} WITH \u2190 ${col} OR ${col + 2} \u2192`);
  SFX.play('click');
  updateColumnButtons();
}
function clearPivotChoice() {
  if (pivotFrom === null) return;
  pivotFrom = null;
  setMessage('');
  updateColumnButtons();
}

async function attemptDrop(col) {
  if (gameOver || busy || !queue.length) return;
  if (queue[0].type === 'hack' && queue[0].id === 'pivot') {
    if (pivotFrom !== null) {
      if (Math.abs(col - pivotFrom) !== 1) {
        SFX.play('denied');
        return;
      }
      pivotWith = col; // the second tap: drop into the picked column, swap with this one
      col = pivotFrom;
      clearPivotChoice();
    } else if (col === 0 || col === COLS - 1) {
      clearPivotChoice();
      pivotWith = col === 0 ? 1 : COLS - 2; // edges have only one neighbor
    } else {
      choosePivot(col);
      return;
    }
  }
  if (mode === 'vs' && !vsStarted) {
    SFX.play('denied');
    return;
  }
  if (columns[col].length >= MAX_ROWS) {
    pivotWith = null;
    SFX.play('denied');
    return;
  }

  busy = true;
  chainEl.textContent = '0x';
  setMessage('');
  const piecesBefore = columns.reduce((n, c) => n + c.length, 0);
  const scoreBefore = score;
  const piece = queue.shift();
  refillQueue();
  if (keyloggerDrops > 0) keyloggerDrops--;
  const sniffedOut = snifferBits === 1 && piece.type === 'number'; // the Packet Sniffer's last bit
  if (snifferBits > 0 && piece.type === 'number') snifferBits--;
  updateHud();
  const landing = columns[col].length;
  for (let r = MAX_ROWS - 1; r > landing; r--) {
    render([], { row: r, col, cell: piece });
    SFX.play('click');
    await sleep(STEP_MS);
  }
  columns[col].push(piece);
  if (daily && dailyOfficial) storage.set(dailyPlayedKey(), '1'); // this is today's official run
  if (daily && mode === 'puzzle' && Progress.runDrops() === 0) {
    const tries = (Number(storage.get(dailyPuzzleTriesKey())) || 0) + 1;
    storage.set(dailyPuzzleTriesKey(), String(tries));
    if (tries >= 10) Progress.secret('stubborn');
  }
  Progress.drop();
  if (Progress.runDrops() === 1) refreshExploitCards(); // the loadout locks for this session
  if (mode === 'blitz') clockRunning = true;
  let wentOver = overflowed();
  render();
  SFX.play('enter');
  await sleep(60);

  if (piece.type === 'hack') await runHack(piece.id, landing, col);
  await resolveChains();
  await tickBombs();

  if (!overflowed() && !MODES[mode].noLayers) {
    dropsSinceLastPulse++;
    if (dropsSinceLastPulse >= pulseInterval) {
      dropsSinceLastPulse = 0;
      await injectPulse();
      wentOver = wentOver || overflowed();
      await resolveChains();
      pulseInterval = DIFFICULTIES[difficulty].interval(score);
    }
  }

  if (mode === 'breach' && !overflowed() && columns.every((c) => c.length === 0)) {
    score += BREACH_CLEAR_BONUS;
    breached = true;
    Progress.breached();
  }
  if (!overflowed()) {
    if (wentOver) Progress.closeCall();
    if (piecesBefore >= 5 && Progress.runDrops() >= 10 && columns.every((c) => c.length === 0)) Progress.sweep();
    if (sniffedOut) Progress.wiretap();
  }
  if (mode === 'vs' && !overflowed()) await vsAfterDrop(score - scoreBefore);
  Progress.endDrop({
    hack: piece.type === 'hack', heights: columns.map((c) => c.length), rows: ROWS, over: overflowed(),
    lastSecond: mode === 'blitz' && timeLeft <= 1,
  });
  finishTurn();
}

function finishTurn() {
  updateHud();
  busy = false;
  render();
  Progress.score(score);
  Progress.addPoints(score - reportedScore);
  reportedScore = score;
  announce(Progress.check());
  if (overflowed()) endGame();
  else if (timeUp) endGame('time');
  else if (cpuDown) endGame('win');
  else if (breached) endGame('breached');
  else if (dealLimit() < Infinity && !queue.length) endGame('daily');
  else if (mode === 'puzzle') checkPuzzle();
  // One drop until a firewall row: warn until the player drops (unless a hack message is showing)
  else if (!MODES[mode].noLayers && pulseInterval - dropsSinceLastPulse === 1 && messageEl.classList.contains('hidden')) {
    setMessage('ENCRYPTION // NEW LAYER NEXT DROP', 'warn');
  }
}

function overflowed() {
  return columns.some((c) => c.length > ROWS);
}

async function injectPulse() {
  setMessage('ENCRYPTION // NEW LAYER', 'alarm');
  SFX.play('alert');
  await sleep(800);
  for (const col of columns) col.unshift(newFirewall());
  render();
  await sleep(200);
  burstMessage('warning');
  setMessage('');
  await sleep(150);
}

// Drops everything above each gap by one row per frame so falls read block by block.
async function collapse() {
  while (true) {
    for (const col of columns) {
      while (col.length && col[col.length - 1] === null) col.pop();
    }
    const gapped = columns.filter((col) => col.includes(null));
    if (!gapped.length) break;
    for (const col of gapped) col.splice(col.indexOf(null), 1);
    render();
    SFX.play('click');
    await sleep(STEP_MS);
  }
  render();
}

function computeRunLength(grid, row, col, dRow, dCol) {
  let count = 1;
  let r = row + dRow;
  let c = col + dCol;
  while (r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS && grid[r][c]) {
    count++;
    r += dRow;
    c += dCol;
  }
  r = row - dRow;
  c = col - dCol;
  while (r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS && grid[r][c]) {
    count++;
    r -= dRow;
    c -= dCol;
  }
  return count;
}

function hackForChain(chain) {
  let ids = Object.keys(HACKS).filter(hackAvailable);
  if (difficulty === 'easy') {
    const earned = ids.filter((id) => HACKS[id].easyCombo <= chain);
    if (!earned.length) return null;
    const tier = Math.max(...earned.map((id) => HACKS[id].easyCombo));
    ids = earned.filter((id) => HACKS[id].easyCombo === tier);
  } else if (chain < HACK_COMBO) {
    return null;
  }
  return ids[Math.floor(dice.hack() * ids.length)];
}

// Hard: 8 bits decrypted by one drop make a byte. Easy and Normal: 4 make a nibble.
async function awardPackets(kind, count) {
  const packet = PACKETS[kind];
  score += count * packet.bonus;
  if (kind === 'byte') Progress.bytes(count);
  else Progress.nibbles(count);
  updateHud();
  setMessage(`${count > 1 ? `${count} ${packet.plural}` : packet.name} DECRYPTED // +${count * packet.bonus}`, 'byte');
  SFX.play('egg');
  await sleep(900);
  burstMessage('number');
  setMessage('');
  await sleep(150);
}

function awardHack(id) {
  queue.unshift({ type: 'hack', id });
  setMessage(`EXPLOIT READY // ${HACKS[id].name}`);
  SFX.play('egg');
  updateHud();
}

async function resolveChains() {
  let chain = 0;
  let cleared = 0;

  while (true) {
    const grid = buildGrid();
    const pops = [];

    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (!cell || cell.type !== 'number') continue;
        const vertical = computeRunLength(grid, r, c, 1, 0);
        const horizontal = computeRunLength(grid, r, c, 0, 1);
        if (cell.val === vertical || cell.val === horizontal) {
          pops.push({ row: r, col: c });
        }
      }
    }

    // HONEYPOT: a bit decrypting beside one also decrypts every bit of that number within
    // BLAST_RADIUS of the trap, and the trap is spent
    const sprung = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c] || grid[r][c].type !== 'honeypot') continue;
        const values = pops.filter((p) => Math.abs(p.row - r) + Math.abs(p.col - c) === 1).map((p) => grid[p.row][p.col].val);
        if (!values.length) continue;
        sprung.push({ row: r, col: c });
        Progress.sting();
        for (let dr = -BLAST_RADIUS; dr <= BLAST_RADIUS; dr++) {
          for (let dc = -BLAST_RADIUS; dc <= BLAST_RADIUS; dc++) {
            const cell = grid[r + dr] && grid[r + dr][c + dc];
            if (cell && cell.type === 'number' && values.includes(cell.val) && !pops.some((p) => p.row === r + dr && p.col === c + dc)) {
              pops.push({ row: r + dr, col: c + dc });
            }
          }
        }
        setMessage(`HONEYPOT // CAUGHT EVERY [${[...new Set(values)].join('] [')}]`);
      }
    }

    if (pops.length === 0) break;

    chain++;
    cleared += pops.length;
    Progress.decrypted(pops.map((p) => grid[p.row][p.col].val), chain);
    score += pops.reduce((n, pos) => n + blockPoints(grid[pos.row][pos.col]), 0) * chain;
    chainEl.textContent = `${chain}x`;

    FX.burst(cellsAt([...pops, ...sprung]));
    render([...pops, ...sprung]);
    updateHud();
    SFX.play('burst');
    if (chain >= 2) SFX.play('egg');
    await sleep(220);

    let cracked = false;
    let revealed = false;
    for (const p of pops) {
      const neighbors = [
        { row: p.row + 1, col: p.col },
        { row: p.row - 1, col: p.col },
        { row: p.row, col: p.col + 1 },
        { row: p.row, col: p.col - 1 },
      ];
      for (const n of neighbors) {
        if (n.row < 0 || n.row >= MAX_ROWS || n.col < 0 || n.col >= COLS) continue;
        const neighborCell = columns[n.col][n.row];
        if (neighborCell && neighborCell.type === 'firewall') {
          neighborCell.level--;
          Progress.peeled(neighborCell.level <= 0);
          cracked = true;
          if (neighborCell.level <= 0) {
            if (mode === 'breach') score += BREACH_LAYER_POINTS;
            columns[n.col][n.row] = revealBit(neighborCell);
            revealed = true;
          }
        }
      }
    }

    if (revealed) SFX.play('punct');
    else if (cracked) SFX.play('backspace');

    for (const p of [...pops, ...sprung]) columns[p.col][p.row] = null;
    await collapse();
    updateHud();
    await sleep(100);
  }

  if (chain > 0) {
    await sleep(300);
    const kind = mode === 'puzzle' ? null : DIFFICULTIES[difficulty].packet;
    const packets = kind ? Math.floor(cleared / PACKETS[kind].bits) : 0;
    if (packets) await awardPackets(kind, packets);
    const hack = MODES[mode].noHacks ? null : hackForChain(chain);
    if (hack) awardHack(hack);
    else setMessage('');
  }
}

// LOGIC BOMB: after each drop every armed bomb (except one just placed) counts down; at zero it
// wipes out everything within BLAST_RADIUS, then the board settles and chains resolve.
async function tickBombs() {
  const blasts = [];
  columns.forEach((stack, c) => stack.forEach((cell, r) => {
    if (!cell || cell.type !== 'bomb') return;
    if (cell.fresh) {
      cell.fresh = false;
      return;
    }
    cell.timer--;
    if (cell.timer <= 0) blasts.push({ row: r, col: c });
  }));
  if (!blasts.length) {
    render();
    return;
  }
  const hits = [];
  for (const b of blasts) {
    for (let dr = -BLAST_RADIUS; dr <= BLAST_RADIUS; dr++) {
      for (let dc = -BLAST_RADIUS; dc <= BLAST_RADIUS; dc++) {
        const pos = { row: b.row + dr, col: b.col + dc };
        if (occupied(pos.row, pos.col) && !hits.some((h) => h.row === pos.row && h.col === pos.col)) hits.push(pos);
      }
    }
  }
  setMessage('LOGIC BOMB // DETONATED');
  FX.burst(cellsAt(hits));
  render(hits);
  SFX.play('burst');
  SFX.play('denied');
  await sleep(260);
  score += pointsFor(hits.filter((h) => columns[h.col][h.row].type !== 'bomb'));
  for (const h of hits) columns[h.col][h.row] = null;
  Progress.bombHits(hits.length - blasts.length);
  await collapse();
  await resolveChains();
}

// PACKET SNIFFER: step the current bit's number up or down (wrapping 1..COLS)
function sniff(step) {
  if (snifferBits <= 0 || busy || gameOver || !queue[0] || queue[0].type !== 'number') return;
  queue[0] = { type: 'number', val: ((queue[0].val - 1 + step + COLS) % COLS) + 1 };
  SFX.play('click');
  updateHud();
}
currentEl.addEventListener('click', () => sniff(1));

// DOM cells for board positions, captured before a re-render replaces them.
function cellsAt(positions) {
  return positions.map(({ row, col }) => ({
    el: boardEl.querySelector(`[data-pos="${row},${col}"]`),
    type: columns[col][row] && (['bomb', 'honeypot'].includes(columns[col][row].type) ? 'hack' : columns[col][row].type),
  }));
}

function occupied(row, col) {
  return row >= 0 && row < MAX_ROWS && col >= 0 && col < COLS && !!columns[col][row];
}

// The hack piece has just landed at (row, col) on top of its stack.
async function runHack(id, row, col) {
  Progress.exploit(id);
  if (columns.flat().filter(Boolean).length === 1) Progress.secret('overkill'); // nothing but the exploit
  setMessage(`${HACKS[id].name} // EXECUTING`);
  SFX.play('static');

  if (id === 'worm-virus' || id === 'trojan') {
    const hits = [];
    if (id === 'worm-virus') {
      columns[col].forEach((_, r) => hits.push({ row: r, col }));
    } else {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (occupied(row + dr, col + dc)) hits.push({ row: row + dr, col: col + dc });
        }
      }
    }
    FX.burst(cellsAt(hits));
    render(hits);
    SFX.play('burst');
    await sleep(220);
    score += pointsFor(hits.filter((h) => !(h.row === row && h.col === col))); // not the exploit itself
    for (const h of hits) columns[h.col][h.row] = null;
    await collapse();
  } else if (id === 'dictionary-attack') {
    // Peel one layer off every encryption block at once
    columns[col].pop();
    const peeled = [];
    columns.forEach((stack, c) => stack.forEach((cell, r) => {
      if (cell.type === 'firewall') peeled.push({ row: r, col: c });
    }));
    FX.burst(cellsAt(peeled));
    let revealed = false;
    for (const { row: r, col: c } of peeled) {
      const cell = columns[c][r];
      cell.level--;
      Progress.peeled(cell.level <= 0);
      if (cell.level <= 0) {
        if (mode === 'breach') score += BREACH_LAYER_POINTS;
        columns[c][r] = revealBit(cell);
        revealed = true;
      }
    }
    render();
    SFX.play(revealed ? 'punct' : 'backspace');
    await sleep(300);
  } else if (id === 'backdoor') {
    // Delete the whole bottom row, layers included; everything drops by one
    columns[col].pop();
    const hits = columns.map((stack, c) => (stack.length ? { row: 0, col: c } : null)).filter(Boolean);
    FX.burst(cellsAt(hits));
    render(hits);
    SFX.play('burst');
    await sleep(220);
    score += pointsFor(hits);
    for (const h of hits) columns[h.col][0] = null;
    await collapse();
  } else if (id === 'rainbow-table') {
    // Decrypt every bit showing the most common number (ties go to the higher number)
    columns[col].pop();
    const counts = {};
    columns.forEach((stack) => stack.forEach((cell) => {
      if (cell.type === 'number') counts[cell.val] = (counts[cell.val] || 0) + 1;
    }));
    const target = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a] || b - a)[0];
    const hits = [];
    columns.forEach((stack, c) => stack.forEach((cell, r) => {
      if (cell.type === 'number' && cell.val === target) hits.push({ row: r, col: c });
    }));
    if (hits.length) {
      setMessage(`RAINBOW TABLE // CRACKED EVERY [${target}]`);
      FX.burst(cellsAt(hits));
      render(hits);
      SFX.play('burst');
      await sleep(220);
      for (const h of hits) columns[h.col][h.row] = null;
      Progress.decrypted(hits.map(() => target), 1);
      score += pointsFor(hits);
      await collapse();
    } else {
      render();
    }
  } else if (id === 'logic-bomb' || id === 'honeypot') {
    // Both stay on the board as armed blocks where they landed
    columns[col][row] = id === 'logic-bomb' ? { type: 'bomb', timer: BOMB_DROPS, fresh: true } : { type: 'honeypot' };
    const armedTypes = columns.flat().map((cell) => cell && cell.type);
    if (armedTypes.includes('bomb') && armedTypes.includes('honeypot')) Progress.secret('double-trouble');
    render();
    SFX.play('enter');
    await sleep(300);
  } else if (id === 'pivot') {
    // Swap the column it landed in with the neighbor the player picked
    columns[col].pop();
    const other = pivotWith === null ? (col === 0 ? 1 : col - 1) : pivotWith;
    pivotWith = null;
    [columns[col], columns[other]] = [columns[other], columns[col]];
    render();
    SFX.play('static');
    await sleep(300);
  } else if (id === 'packet-sniffer') {
    columns[col].pop();
    snifferBits = SNIFFER_BITS;
    render();
    SFX.play('enter');
    await sleep(300);
  } else if (id === 'keylogger') {
    columns[col].pop();
    keyloggerDrops = KEYLOGGER_DROPS;
    render();
    SFX.play('enter');
    await sleep(300);
  } else {
    columns[col].pop();
    for (const stack of columns) {
      if (id === 'bitflip') stack.reverse();
      stack.forEach((cell, r) => {
        if (cell.type !== 'number') return;
        if (id === 'buffer-overflow') {
          stack[r] = cell.val === COLS ? newFirewall(2) : { type: 'number', val: cell.val + 1 };
        } else if (id === 'rng') {
          stack[r] = newPacket();
        }
      });
    }
    render();
    SFX.play('enter');
    await sleep(300);
  }

  updateHud();
  setMessage('');
}

// Game over: every piece shakes and heats up, bursts at its own random moment,
// then TRACE COMPLETE appears (~1.2s in total).
// Every piece on the board heats up, shakes and bursts into code over ~1s. Returns the piece count.
function meltBoard(run) {
  const pieces = [...boardEl.querySelectorAll('.cell.disc, .cell.firewall, .cell.hack')];
  boardEl.classList.add('meltdown');
  let sounds = 0;
  for (const el of pieces) {
    el.style.animationDelay = `${-Math.random() * 0.08}s, 0s`; // out-of-step shaking
    setTimeout(() => {
      if (run !== runId) return;
      FX.burst([{ el, type: 'hot' }]);
      el.style.opacity = '0';
      if (sounds < 6 && Math.random() < 0.5) {
        sounds++;
        SFX.play('burst');
      }
    }, 450 + Math.random() * 600);
  }
  return pieces.length;
}

// reason: 'trace' (something left above the line) or 'time' (BLITZ ran out)
function endGame(reason = 'trace') {
  gameOver = true;
  refreshExploitCards(); // the loadout can change again
  busy = true;
  clockRunning = false;
  SFX.play('denied');
  render();
  Music.setIntensity(0);
  setMessage('');
  finalScoreEl.textContent = score;
  newBestEl.hidden = !(score > bestAtStart);
  const endings = {
    trace: ['TRACE COMPLETE', 'They found you.'],
    time: ["TIME'S UP", 'The connection timed out.'],
    daily: [mode === 'breach' ? 'BREACH COMPLETE' : 'DAILY COMPLETE', `All ${dealLimit()} bits dropped.`],
    breached: ['FIREWALL BREACHED', `Every block cleared. +${BREACH_CLEAR_BONUS}`],
    win: ['YOU WIN', `The ${CpuBoard.LEVELS[vsLevel].label} CPU overflowed first.`],
  };
  if (mode === 'vs') {
    if (reason === 'trace') endings.trace = ['CPU WINS', `The ${CpuBoard.LEVELS[vsLevel].label} CPU traced you first.`];
    Progress.vsResult(vsLevel, reason === 'win');
    stopVs();
    holdCpu(false);
  }
  document.getElementById('overlay-title').textContent = endings[reason][0];
  document.getElementById('overlay-sub').textContent = endings[reason][1];
  const note = document.getElementById('overlay-note');
  note.hidden = mode === 'classic';
  note.textContent = daily
    ? (dailyOfficial ? `${DAILY_KINDS[mode]} // OFFICIAL SCORE // ${todayKey()}` : `${DAILY_KINDS[mode]} PRACTICE // OFFICIAL SCORE TODAY ${fmt(best)}`)
    : `${MODES[mode].label} // BEST ${best}`;
  if (daily) newBestEl.hidden = true;
  shareBtn.hidden = !daily || mode === 'puzzle';
  shareBtn.textContent = 'SHARE';

  if (mode === 'puzzle') {
    if (!daily) Progress.puzzleFailed();
  } else {
    Progress.endRun({
      score, reason, boardEmpty: columns.every((c) => c.length === 0),
      track: Music.isEnabled() ? Music.currentTrack() : null, theme: document.documentElement.dataset.theme || 'terminal',
      font: shownFont().id,
      silent: SFX.isMuted() && !Music.isEnabled(),
    });
    if (mode === 'breach' && layersLeft() === 1) Progress.secret('so-close');
  }
  announce(Progress.check());

  const run = runId;
  meltBoard(run);
  setTimeout(() => {
    if (run === runId) overlayEl.classList.remove('hidden');
  }, 1200);
}

// KONAMI (hidden achievement): up up down down left right left right B A
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiAt = 0;
document.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  konamiAt = key === KONAMI[konamiAt] ? konamiAt + 1 : key === KONAMI[0] ? 1 : 0;
  if (konamiAt === KONAMI.length) {
    konamiAt = 0;
    Progress.secret('konami');
    announce(Progress.check());
  }
});

document.addEventListener('keydown', (e) => {
  if (mode === 'vs' && !vsStarted && !gameOver && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    startMatch();
    return;
  }
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= COLS) attemptDrop(num - 1);
  else if (e.key === 'ArrowLeft' && pivotFrom !== null) { e.preventDefault(); attemptDrop(pivotFrom - 1); }
  else if (e.key === 'ArrowRight' && pivotFrom !== null) { e.preventDefault(); attemptDrop(pivotFrom + 1); }
  else if (e.key === 'ArrowUp' && snifferBits > 0) { e.preventDefault(); sniff(1); }
  else if (e.key === 'ArrowDown' && snifferBits > 0) { e.preventDefault(); sniff(-1); }
});

// Ignored mid-animation: the in-flight drop would keep mutating the fresh board.
function restart() {
  if (busy && !gameOver) return;
  resetNow();
}

function resetNow() {
  disarmReset();
  SFX.play('static');
  initGame();
}

// Resetting a live run (RESTART or a new difficulty) takes two presses, like the ECHOES dice
// roller's reset: the first arms that button for a few seconds, the second melts the board down
// and starts over. Only one button is armed at a time.
const RESET_CONFIRM_MS = 3500;
let armed = null; // { btn, label, timer }

function disarmReset() {
  if (!armed) return;
  clearTimeout(armed.timer);
  armed.btn.textContent = armed.label;
  armed.btn.classList.remove('danger');
  armed = null;
}

function armReset(btn, confirmText) {
  disarmReset();
  armed = { btn, label: btn.textContent, timer: setTimeout(disarmReset, RESET_CONFIRM_MS) };
  btn.textContent = confirmText;
  btn.classList.add('danger');
  SFX.play('alert');
}

// apply() runs just before the new run starts (e.g. switching the difficulty).
function requestReset(btn, confirmText, apply = () => {}) {
  // Nothing to lose once the run is over or before the first drop.
  // (PUZZLE boards are short and restart as they started, so they never ask)
  const fresh = mode === 'puzzle' || (score === 0 && columns.every((col) => col.length === 0));
  if (gameOver || fresh) {
    if (busy && !gameOver) return;
    apply();
    resetNow();
    return;
  }
  if (!armed || armed.btn !== btn) {
    armReset(btn, confirmText);
    return;
  }
  if (busy) return; // stays armed; mid-drop the board can't be wiped yet
  disarmReset();
  if (Progress.runDrops() > 0) Progress.restarted();
  busy = true;
  updateColumnButtons();
  Music.setIntensity(0);
  setMessage('');
  const run = runId;
  const melting = meltBoard(run);
  setTimeout(() => {
    if (run !== runId) return;
    apply();
    resetNow();
  }, melting ? 1200 : 0);
}

const restartBtn = document.getElementById('restart-btn');
restartBtn.addEventListener('click', () => requestReset(restartBtn, 'CONFIRM RESTART?'));

document.querySelectorAll('#difficulty-row button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.difficulty;
    if (next === classicDifficulty) return;
    if (next === 'hard' && !Progress.isUnlocked('mode-hard')) {
      SFX.play('denied');
      showToast(`LOCKED // ${Progress.unlock('mode-hard').need.toUpperCase()}`);
      return;
    }
    requestReset(btn, 'CONFIRM?', () => {
      classicDifficulty = next;
      storage.set('bytefall-difficulty', next);
    });
  });
});

// Mode buttons: switching mid-run asks to confirm, like RESTART.
document.querySelectorAll('.modes button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.mode;
    if (next === topMode) return;
    requestReset(btn, 'CONFIRM?', () => {
      if (next === 'vs') storage.set('bytefall-before-vs', topMode); // QUIT comes back here
      topMode = next;
      storage.set('bytefall-mode', next);
      setModeFromChoice();
    });
  });
});

// VS CPU: LAYERS ON / OFF
const vsLayersBtn = document.getElementById('vs-layers-btn');
vsLayersBtn.addEventListener('click', () => {
  requestReset(vsLayersBtn, 'CONFIRM?', () => {
    vsLayers = !vsLayers;
    storage.set('bytefall-vs-layers', vsLayers ? 'on' : 'off');
  });
});

// VS CPU's opponent level
document.querySelectorAll('#vs-levels button[data-vs]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.vs;
    if (next === vsLevel) return;
    requestReset(btn, 'CONFIRM?', () => {
      vsLevel = next;
      storage.set('bytefall-vs-level', next);
    });
  });
});

// DAILY's games: DECRYPT, PUZZLE, BLITZ, BREACH
document.querySelectorAll('#daily-kinds button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.daily;
    if (next === dailyKind) return;
    requestReset(btn, 'CONFIRM?', () => {
      dailyKind = next;
      storage.set('bytefall-daily-kind', next);
      setModeFromChoice();
    });
  });
});

// Shows what the current mode changes: the mode row, its note, the difficulty row (CLASSIC
// only), the layer countdown (not in ZEN) and the BLITZ clock.
function applyModeUi() {
  document.querySelectorAll('.modes button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === topMode);
  });
  document.querySelectorAll('#daily-kinds button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.daily === dailyKind);
  });
  const info = document.getElementById('mode-info');
  info.hidden = mode === 'classic';
  info.textContent = mode === 'classic' ? '' : MODES[mode].info(todayKey());
  document.getElementById('difficulty-row').hidden = mode !== 'classic';
  document.getElementById('daily-kinds').hidden = !daily;
  updateVsChrome();
  document.querySelectorAll('#vs-levels button[data-vs]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.vs === vsLevel);
  });
  vsLayersBtn.textContent = `ENCRYPTED LAYERS: ${vsLayers ? 'ON' : 'OFF'}`;
  vsLayersBtn.classList.toggle('active', vsLayers);
  document.body.classList.toggle('vs-mode', mode === 'vs'); // a slimmer header, room for the boards
  document.getElementById('pulse-stat').hidden = !!MODES[mode].noLayers && mode !== 'puzzle' && mode !== 'breach';
  document.getElementById('pulse-label').textContent = mode === 'puzzle' ? 'BITS LEFT' : mode === 'breach' ? 'LAYERS LEFT' : 'NEW LAYER IN';
  puzzleNavEl.hidden = mode !== 'puzzle' || daily;
  if (mode === 'puzzle' && !daily) updatePuzzleNav();
  // The overlay goes back to its trace look until a puzzle result changes it
  overlayNext = null;
  document.querySelector('.overlay-box').classList.remove('win');
  document.getElementById('overlay-restart-btn').textContent = mode === 'puzzle' ? 'RETRY' : 'NEW SESSION';
  document.getElementById('time-stat').hidden = mode !== 'blitz' && dealLimit() === Infinity;
  document.getElementById('time-label').textContent = mode === 'blitz' ? 'TIME' : 'BITS LEFT';
  shareBtn.hidden = true;
  showClock();
}

const timeLeftEl = document.getElementById('time-left');
function showClock() {
  if (dealLimit() < Infinity) {
    timeLeftEl.textContent = dailyBitsLeft();
    timeLeftEl.closest('.stat').classList.remove('time-low');
    return;
  }
  const secs = Math.ceil(timeLeft);
  timeLeftEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  timeLeftEl.closest('.stat').classList.toggle('time-low', clockRunning && secs <= 10);
}

let lastClockTick = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - lastClockTick) / 1000;
  lastClockTick = now;
  if (mode !== 'blitz' || !clockRunning || gameOver || document.hidden) return;
  timeLeft = Math.max(0, timeLeft - dt);
  showClock();
  if (timeLeft === 0 && !timeUp) {
    timeUp = true;
    if (!busy) endGame('time'); // mid-drop: finishTurn ends it once the drop resolves
  }
}, 200);

// VS CPU. Your chains attack: every VS_POINTS_PER_BLOCK points a drop scores sends one encrypted
// block (up to a full board row pair at once). Attacks cancel blocks headed your way first; what's
// left lands on the other board after its next move, on top of random columns, as one-peel
// layers. The CPU moves on its own clock from your first drop, paused while a panel is open or
// the tab is hidden.
const VS_POINTS_PER_BLOCK = 30;
const VS_MAX_BLOCKS = 14;
let cpu = null;
let incoming = 0; // blocks headed for you
let cpuPending = 0; // blocks headed for the CPU
let cpuDown = false; // the CPU overflowed (the win shows once your drop finishes)
let vsStarted = false; // START pressed on the setup overlay
let cpuClock = 0;
const cpuStatEl = document.getElementById('cpu-stat');
const incomingEl = document.getElementById('incoming');
const vsBlocks = (points) => Math.min(VS_MAX_BLOCKS, Math.floor(points / VS_POINTS_PER_BLOCK));

function startVs() {
  incoming = 0;
  cpuPending = 0;
  cpuDown = false;
  cpuClock = 0;
  vsStarted = false;
  // The setup overlay: shown (popping back in) whenever a match hasn't started
  vsSetupEl.hidden = mode !== 'vs';
  if (mode === 'vs') {
    vsSetupEl.style.animation = 'none';
    void vsSetupEl.offsetWidth;
    vsSetupEl.style.animation = '';
  }
  if (mode !== 'vs') {
    cpu = null;
    showVs();
    return;
  }
  const rnd = seeded(hashString(`bytefall:vs:${vsSeed}:cpu`));
  const bits = seeded(hashString(`bytefall:vs:${vsSeed}:queue`)); // the same bits you get
  cpu = CpuBoard.create(vsLevel, rnd, () => 1 + Math.floor(bits() * CpuBoard.COLS), vsLayers ? BASE_INTERVAL : 0);
  showVs();
}
function stopVs() {
  cpuClock = 0;
}

// Your attack, then the blocks still headed your way land
async function vsAfterDrop(points) {
  sendToCpu(vsBlocks(points));
  while (incoming > 0 && !overflowed() && !gameOver) {
    const n = Math.min(incoming, VS_MAX_BLOCKS);
    incoming -= n;
    showVs();
    const before = score;
    await takeGarbage(n);
    await resolveChains();
    sendToCpu(vsBlocks(score - before)); // a chain set off by the garbage counts as an attack too
  }
  showVs();
}
function sendToCpu(blocks) {
  const cancel = Math.min(blocks, incoming);
  incoming -= cancel;
  cpuPending += blocks - cancel;
  showVs();
}
function sendToPlayer(blocks) {
  const cancel = Math.min(blocks, cpuPending);
  cpuPending -= cancel;
  incoming += blocks - cancel;
  if (blocks - cancel > 0) SFX.play('alert');
  showVs();
}

// Encrypted blocks drop onto the top of random columns
async function takeGarbage(n) {
  setMessage(`INCOMING // ${n} ENCRYPTED BLOCK${n === 1 ? '' : 'S'}`, 'alarm');
  for (let k = 0; k < n; k++) {
    const open = columns.map((col, c) => (col.length < MAX_ROWS ? c : -1)).filter((c) => c >= 0);
    if (!open.length) break;
    const c = open[Math.floor(Math.random() * open.length)];
    columns[c].push(newFirewall(1));
    render();
    SFX.play('click');
    await sleep(70);
  }
  SFX.play('punct');
  await sleep(200);
  setMessage('');
}

// One CPU move: it drops a bit, attacks, then takes the blocks headed its way
function cpuMove() {
  sendToPlayer(vsBlocks(cpu.step()));
  if (cpuPending > 0 && !cpu.isDead()) {
    const n = Math.min(cpuPending, VS_MAX_BLOCKS);
    cpuPending -= n;
    sendToPlayer(vsBlocks(cpu.takeGarbage(n)));
  }
  drawCpu();
  if (cpu.isDead() && !cpuDown) {
    cpuDown = true;
    if (!busy && !gameOver) endGame('win');
  }
}

let lastCpuTick = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = now - lastCpuTick;
  lastCpuTick = now;
  if (mode !== 'vs' || !cpu || !vsStarted || gameOver || cpuDown || document.hidden || panelOpen()) return;
  cpuClock += dt;
  if (cpuClock >= cpu.delay) {
    cpuClock -= cpu.delay;
    cpuMove();
  }
}, 100);

// The CPU's board beside your stats (numbers and layers), plus the blocks headed each way
const cpuGridEl = document.getElementById('cpu-grid');
const cpuFullEl = document.getElementById('cpu-full');
function drawCpu() {
  if (!cpu) return;
  const cols = cpu.columns();
  const cells = [];
  for (let r = CpuBoard.MAX_ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < CpuBoard.COLS; c++) {
      const b = cols[c][r];
      let cls = r >= CpuBoard.ROWS ? 'over' : '';
      let text = '';
      if (b && b.type === 'number') {
        cls += ' bit';
        text = b.val;
      } else if (b) {
        cls += ' layer';
        text = b.level < 2 ? '-' : '=';
      }
      if (r === CpuBoard.ROWS) cls += ' over-edge';
      cells.push(`<i class="${cls.trim()}">${text}</i>`);
    }
  }
  cpuGridEl.innerHTML = cells.join('');
  const tallest = Math.max(...cols.map((col) => col.length));
  cpuStatEl.classList.toggle('low', tallest >= CpuBoard.ROWS - 1);
  if (!cpuFullEl.hidden) drawCpuFull();
}

// Held: the CPU's board at full size, drawn like yours
function drawCpuFull() {
  const cols = cpu.columns();
  cpuFullEl.innerHTML = '';
  cpuFullEl.style.setProperty('--cols', CpuBoard.COLS);
  for (let r = CpuBoard.MAX_ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < CpuBoard.COLS; c++) {
      const b = cols[c][r];
      const div = document.createElement('div');
      div.className = 'cell';
      if (r >= CpuBoard.ROWS) div.classList.add('overflow');
      if (b && b.type === 'number') {
        div.classList.add('disc');
        fillBit(div, b.val);
      } else if (b) {
        div.classList.add('firewall');
        if (b.level < 2) div.classList.add('cracked');
        div.textContent = b.level < 2 ? '[-]' : '[=]';
      }
      cpuFullEl.appendChild(div);
    }
    if (r === CpuBoard.ROWS) {
      const line = document.createElement('div');
      line.className = 'overflow-line';
      line.textContent = '='.repeat(80);
      cpuFullEl.appendChild(line);
    }
  }
}
function holdCpu(on) {
  if (!cpu || mode !== 'vs') on = false;
  cpuFullEl.hidden = !on;
  if (on) drawCpuFull();
}
cpuStatEl.addEventListener('pointerdown', (e) => {
  if (!cpu) return;
  cpuStatEl.setPointerCapture(e.pointerId);
  holdCpu(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cpuStatEl.addEventListener(type, () => holdCpu(false));
cpuStatEl.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press shouldn't open a menu

// START: the setup overlay bursts apart and the match (and the CPU's clock) begins
const vsSetupEl = document.getElementById('vs-setup');
function startMatch() {
  if (mode !== 'vs' || vsStarted || gameOver) return;
  vsStarted = true;
  FX.burst([{ el: vsSetupEl, type: 'warning' }]);
  vsSetupEl.hidden = true;
  SFX.play('static');
}
document.getElementById('vs-start').addEventListener('click', startMatch);

// QUIT: back to the mode you came from (two presses mid-match, like RESTART)
const vsQuitBtn = document.getElementById('vs-quit');
vsQuitBtn.addEventListener('click', () => {
  requestReset(vsQuitBtn, 'CONFIRM QUIT?', () => {
    const back = storage.get('bytefall-before-vs');
    topMode = TOP_MODES.includes(back) && back !== 'vs' ? back : 'classic';
    storage.set('bytefall-mode', topMode);
    setModeFromChoice();
  });
});

// The status line in the mode row's place, and how many stat rows the left column has
function updateVsChrome() {
  const rows = [...document.querySelectorAll('.hud > .stat:not(.cpu-stat), .hud > .hud-bits')].filter((el) => !el.hidden).length;
  document.getElementById('vs-status').textContent = `VS ${CpuBoard.LEVELS[vsLevel].label} CPU // LAYERS ${vsLayers ? 'ON' : 'OFF'}`;
  document.querySelector('.hud').style.setProperty('--vs-rows', rows);
}

// VS: the HUD takes the room from under the corner icons to where the regular HUD ends, so your
// board keeps its regular size and place. Measured by briefly laying out the regular header and HUD.
function layoutVsTop() {
  const hud = document.querySelector('.hud');
  hud.style.height = '';
  hud.style.marginTop = '';
  if (mode !== 'vs') return;
  // Laid out as Classic shows it: the difficulty row on, no mode note
  const diffRow = document.getElementById('difficulty-row');
  const info = document.getElementById('mode-info');
  const wasHidden = [diffRow.hidden, info.hidden];
  document.body.classList.remove('vs-mode');
  cpuStatEl.hidden = true;
  diffRow.hidden = false;
  info.hidden = true;
  // (relative to the game card, which can move as the page re-centers)
  const cardTop = () => crtEl.getBoundingClientRect().top;
  const bottom = hud.getBoundingClientRect().bottom - cardTop();
  const top = document.querySelector('.records-btn').getBoundingClientRect().bottom - cardTop() + 8;
  [diffRow.hidden, info.hidden] = wasHidden;
  cpuStatEl.hidden = false;
  document.body.classList.add('vs-mode');
  hud.style.marginTop = '0px';
  const vsTop = hud.getBoundingClientRect().top - cardTop();
  hud.style.marginTop = `${top - vsTop}px`;
  hud.style.height = `${bottom - top}px`;
  // The CPU's board fills the height (its label takes ~24px), up to 60% of the width
  const gridH = bottom - top - 24;
  hud.style.setProperty('--vs-cpu-w', `${Math.round(Math.min(hud.clientWidth * 0.6, gridH * 7 / 8 + 14))}px`);
}

function showVs() {
  const vs = mode === 'vs' && !!cpu;
  cpuStatEl.hidden = !vs;
  incomingEl.hidden = !vs || incoming === 0;
  if (!vs) return;
  incomingEl.textContent = `\u25BC ${incoming} INCOMING`;
  // CPU // its score, and the blocks headed its way
  document.getElementById('cpu-label').textContent = `CPU // ${fmt(cpu.score())}${cpuPending ? ` \u25BC${cpuPending}` : ''}`;
  drawCpu();
}

// SHARE (DAILY): the phone's share sheet where there is one, otherwise copy to the clipboard.
const shareBtn = document.getElementById('overlay-share-btn');
function dailyShareText() {
  const run = Progress.runStats();
  const bar = (part, whole) => {
    const filled = Math.round((Math.min(part, whole) / whole) * 10);
    return `${'\u25AE'.repeat(filled)}${'\u25AF'.repeat(10 - filled)}`;
  };
  const head = `BYTEFALL // ${DAILY_KINDS[mode]} ${todayKey()}`;
  const url = location.href.split(/[?#]/)[0];
  if (mode === 'puzzle') {
    const tries = Number(storage.get(dailyPuzzleSolvedKey())) || 1;
    return [`${head} // ${WEEKDAYS[utcWeekday()]} ${utcWeekday() + 1}/7`, `Solved in ${tries} ${tries === 1 ? 'try' : 'tries'}`, url].join('\n');
  }
  const practice = dailyOfficial ? '' : ' (practice)';
  if (mode === 'breach') {
    const total = BREACH_ROWS * COLS;
    const broken = total - layersLeft();
    return [`${head}${practice}`, `${fmt(score)} pts // ${broken}/${total} layers broken${breached ? ' // BREACHED' : ''}`, bar(broken, total), url].join('\n');
  }
  if (mode === 'blitz') {
    return [`${head}${practice}`, `${fmt(score)} pts in ${DAILY_BLITZ_SECONDS}s // ${run.chain}x best chain // ${run.bits} bits decrypted`, url].join('\n');
  }
  return [`${head}${practice}`, `${fmt(score)} pts // ${run.chain}x best chain // ${run.bits} bits decrypted`, bar(run.bits, DAILY_BITS), url].join('\n');
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}
shareBtn.addEventListener('click', async () => {
  const text = dailyShareText();
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await copyText(text);
    shareBtn.textContent = 'COPIED';
  } catch (e) {
    if (e && e.name === 'AbortError') return; // closed the share sheet
    shareBtn.textContent = 'COPY FAILED';
  }
});

document.getElementById('overlay-restart-btn').addEventListener('click', () => {
  if (mode === 'puzzle' && !daily && overlayNext === 'next') setPuzzle(Math.min(puzzleIndex + 1, PUZZLES.length - 1));
  else restart();
});

const soundBtn = document.getElementById('sound-btn');
function updateSoundBtn() {
  soundBtn.textContent = SFX.isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  soundBtn.classList.toggle('on', !SFX.isMuted());
}
soundBtn.addEventListener('click', () => {
  SFX.toggle();
  updateSoundBtn();
  SFX.play('punct');
});
updateSoundBtn();

const musicBtn = document.getElementById('music-btn');
function updateMusicBtn() {
  musicBtn.textContent = Music.isEnabled() ? 'MUSIC: ON' : 'MUSIC: OFF';
  musicBtn.classList.toggle('on', Music.isEnabled());
}
musicBtn.addEventListener('click', () => {
  Music.toggle();
  updateMusicBtn();
  renderPlaylist();
});
updateMusicBtn();

// Drop buttons under the grid (default, easier to reach on phones) or above it.
const buttonsPosBtn = document.getElementById('buttons-pos-btn');
let buttonsOnTop = storage.get('bytefall-buttons') === 'top';
function updateButtonsPos() {
  boardWrapEl.classList.toggle('buttons-top', buttonsOnTop);
  buttonsPosBtn.textContent = `DROP BUTTONS: ${buttonsOnTop ? 'TOP' : 'BOTTOM'}`;
}
buttonsPosBtn.addEventListener('click', () => {
  buttonsOnTop = !buttonsOnTop;
  storage.set('bytefall-buttons', buttonsOnTop ? 'top' : 'bottom');
  updateButtonsPos();
});
updateButtonsPos();

// Color themes: each id matches a [data-theme] block in style.css ('terminal' is the default :root).
// Every theme but TERMINAL is unlocked by progress.js (theme-<id>). Keep the head script in index.html in sync.
const THEMES = [
  { id: 'terminal', label: 'TERMINAL', desc: 'green bits, grey layers, amber cracks and exploits.' },
  { id: 'cipher', label: 'CIPHER', desc: 'cyan bits, magenta layers, yellow cracks and exploits.' },
  { id: 'amber-crt', label: 'AMBER CRT', desc: 'an old amber monitor: grey layers, white cracks and exploits.' },
  { id: 'monochrome', label: 'MONOCHROME', desc: 'black and white; layers are told apart by stripes and dashed borders.' },
  { id: 'redline', label: 'REDLINE', desc: 'red-alert intrusion: steel-blue layers, yellow cracks, a white trace.' },
  { id: 'synthwave', label: 'SYNTHWAVE', desc: 'pink bits, purple layers, orange cracks and a cyan trace.' },
  { id: 'dot-matrix', label: 'DOT MATRIX', desc: 'four shades of olive green, like an old handheld game screen.' },
  { id: 'paper', label: 'PAPER', desc: 'near-black ink and grey on pale paper with gold accents, for bright rooms and outdoors.' },
  { id: 'glyph', label: 'GLYPH', desc: 'bits become shapes with one corner per point: a teardrop is 1, a triangle 3, an octagon 8.' },
  { id: 'spectrum', label: 'SPECTRUM', desc: 'every bit cycles through the rainbow on its own while the page drifts slowly behind them.' },
];
const themeAvailable = (t) => t.id === 'terminal' || Progress.isUnlocked(`theme-${t.id}`);
const themeListEl = document.getElementById('theme-list');
const themeNoteEl = document.getElementById('theme-note');
const themeMeta = document.querySelector('meta[name="theme-color"]');
// The saved choice is kept even while locked, so it comes back once unlocked.
Progress.setThemeCount(THEMES.length);
let themeId = THEMES.some((t) => t.id === storage.get('bytefall-theme')) ? storage.get('bytefall-theme') : 'terminal';

function applyTheme() {
  const theme = THEMES.find((t) => t.id === themeId);
  const shown = themeAvailable(theme) ? theme : THEMES[0];
  if (shown.id === 'terminal') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = shown.id;
  themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg-solid').trim();
  // GLYPH swaps the bits' markup, so redraw the board and HUD (once the game exists)
  if (columns.length) {
    render();
    updateHud();
  }
  themeNoteEl.textContent = `${shown.label}: ${shown.desc}`;

  themeListEl.innerHTML = '';
  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-option';
    btn.classList.toggle('active', t.id === shown.id);
    btn.setAttribute('aria-pressed', String(t.id === shown.id));
    btn.textContent = t.label;
    const swatches = document.createElement('span');
    swatches.className = 'swatches';
    swatches.dataset.theme = t.id;
    swatches.innerHTML = '<i></i><i></i><i></i>';
    btn.appendChild(swatches);
    if (!themeAvailable(t)) {
      // Locked: tapping shows what unlocks it
      btn.classList.add('locked');
      btn.addEventListener('click', () => {
        const u = Progress.unlock(`theme-${t.id}`);
        themeNoteEl.textContent = `${t.label} is locked. ${u.need} to unlock it (${Math.min(u.value(), u.goal).toLocaleString('en-US')} / ${u.goal.toLocaleString('en-US')}).`;
      });
    } else {
      btn.addEventListener('click', () => {
        if (themeId !== t.id) {
          Progress.themeChanged();
          announce(Progress.check());
        }
        themeId = t.id;
        storage.set('bytefall-theme', themeId);
        applyTheme();
      });
    }
    themeListEl.appendChild(btn);
  }
}
applyTheme();

// Fonts: COURIER is free; the pixel fonts unlock by earning achievements (progress.js's font-<id>)
const FONTS = [
  { id: 'courier', label: 'COURIER', desc: 'the classic terminal typewriter.' },
  { id: 'press-start', label: 'PRESS START', desc: 'chunky 8-bit arcade pixels.' },
  { id: 'bytesized', label: 'BYTESIZED', desc: 'tiny pixel type, for the hard-core.' },
];
const fontAvailable = (f) => f.id === 'courier' || Progress.isUnlocked(`font-${f.id}`);
const fontListEl = document.getElementById('font-list');
const fontNoteEl = document.getElementById('font-note');
let fontId = FONTS.some((f) => f.id === storage.get('bytefall-font')) ? storage.get('bytefall-font') : 'courier';
const shownFont = () => {
  const font = FONTS.find((f) => f.id === fontId);
  return fontAvailable(font) ? font : FONTS[0];
};
function applyFont() {
  const shown = shownFont();
  const before = document.documentElement.dataset.font;
  if (shown.id === 'courier') delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = shown.id;
  if (before !== document.documentElement.dataset.font) requestAnimationFrame(fitBoard); // text sizes shift
  fontNoteEl.textContent = `${shown.label}: ${shown.desc}`;
  fontListEl.innerHTML = '';
  for (const f of FONTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-option';
    btn.classList.toggle('active', f.id === shown.id);
    btn.setAttribute('aria-pressed', String(f.id === shown.id));
    btn.textContent = f.label;
    btn.dataset.fontPreview = f.id; // each name shows in its own font
    if (!fontAvailable(f)) {
      btn.classList.add('locked');
      btn.addEventListener('click', () => {
        const u = Progress.unlock(`font-${f.id}`);
        fontNoteEl.textContent = `${f.label} is locked. ${u.need} to unlock it (${Math.min(u.value(), u.goal).toLocaleString('en-US')} / ${u.goal.toLocaleString('en-US')}).`;
      });
    } else {
      btn.addEventListener('click', () => {
        fontId = f.id;
        storage.set('bytefall-font', fontId);
        applyFont();
      });
    }
    fontListEl.appendChild(btn);
  }
}
applyFont();

const PLAYLIST_SLOTS = 10; // unmade tracks show as COMING SOON
const settingsBtn = document.getElementById('settings-btn');
const settingsEl = document.getElementById('settings');
const playlistTracksEl = document.getElementById('playlist-tracks');

function renderPlaylist() {
  playlistTracksEl.innerHTML = '';
  const tracks = Music.tracks();
  for (let n = 0; n < Math.max(PLAYLIST_SLOTS, tracks.length); n++) {
    const track = tracks[n];
    const btn = document.createElement('button');
    const num = String(n + 1).padStart(2, '0');
    if (track && track.locked) {
      btn.textContent = `${num}  ${track.title}`;
      btn.disabled = true;
      btn.classList.add('locked');
      const need = document.createElement('span');
      need.className = 'need';
      need.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>${Progress.unlock(`track-${n + 1}`).goal.toLocaleString('en-US')}`;
      btn.appendChild(need);
      btn.title = `${track.need} to unlock`;
    } else if (track) {
      btn.textContent = `${num}  ${track.title}`;
      btn.classList.toggle('active', track.id === Music.currentTrack());
      btn.classList.toggle('playing', track.id === Music.currentTrack() && Music.isEnabled());
      btn.addEventListener('click', () => {
        Music.play(track.id);
        updateMusicBtn();
        renderPlaylist();
      });
    } else {
      btn.textContent = `${num}  COMING SOON`;
      btn.disabled = true;
    }
    const li = document.createElement('li');
    li.appendChild(btn);
    playlistTracksEl.appendChild(li);
  }
}

const vizBtn = document.getElementById('viz-toggle');
const playlistViz = createVisualizer(document.getElementById('playlist-viz'), Music.getAnalyser);

function updateVizLabel() {
  const next = playlistViz.mode === 'bars' ? 'wave' : 'bars';
  vizBtn.setAttribute('aria-label', `Visualizer: ${playlistViz.mode}. Click to switch to ${next}.`);
  vizBtn.title = `Switch to ${next}`;
}
vizBtn.addEventListener('click', () => {
  playlistViz.toggle();
  updateVizLabel();
});
updateVizLabel();

function visualizerLoop() {
  if (settingsEl.hidden) return;
  playlistViz.draw();
  requestAnimationFrame(visualizerLoop);
}

const MODE_LABELS = { repeat: 'MODE: REPEAT', sequence: 'MODE: SEQUENCE', shuffle: 'MODE: SHUFFLE' };
const modeBtn = document.getElementById('play-mode-btn');
function updateModeBtn() {
  modeBtn.textContent = MODE_LABELS[Music.getMode()];
  modeBtn.classList.add('on'); // same brightness in every mode
}
modeBtn.addEventListener('click', () => {
  Music.cycleMode();
  updateModeBtn();
});
updateModeBtn();
Music.onTrackChange(() => {
  if (!settingsEl.hidden) renderPlaylist();
});

const bgPlayBtn = document.getElementById('bg-play-btn');
function updateBgPlayBtn() {
  bgPlayBtn.textContent = `BACKGROUND PLAY: ${Music.isBackgroundPlay() ? 'ON' : 'OFF'}`;
  bgPlayBtn.classList.toggle('on', Music.isBackgroundPlay());
}
bgPlayBtn.addEventListener('click', () => {
  Music.setBackgroundPlay(!Music.isBackgroundPlay());
  updateBgPlayBtn();
});
updateBgPlayBtn();

function setSettingsOpen(open) {
  settingsEl.hidden = !open;
  if (open && !recordsEl.hidden) setRecordsOpen(false);
  settingsBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    renderPlaylist();
    requestAnimationFrame(visualizerLoop);
  }
}

settingsBtn.addEventListener('click', () => setSettingsOpen(settingsEl.hidden));
document.addEventListener('pointerdown', (e) => {
  if (!settingsEl.hidden && !settingsEl.contains(e.target) && !settingsBtn.contains(e.target)) setSettingsOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsEl.hidden) setSettingsOpen(false);
});

// VIBRATION: on devices that support it (Android), the game's key sound events also buzz,
// whether or not SOUND is on. On by default there; the setting is hidden elsewhere.
const HAPTICS = { enter: 8, burst: 18, egg: [14, 30, 14], alert: 40, denied: [60, 40, 90], backspace: 10, punct: 14 };
const canVibrate = typeof navigator.vibrate === 'function';
let vibrate = canVibrate && storage.get('bytefall-vibrate') !== 'off';
const playSound = SFX.play;
SFX.play = (name) => {
  playSound(name);
  if (vibrate && HAPTICS[name]) {
    try { navigator.vibrate(HAPTICS[name]); } catch (e) {}
  }
};
const vibrateBtn = document.getElementById('vibrate-btn');
vibrateBtn.hidden = !canVibrate;
function updateVibrateBtn() {
  vibrateBtn.textContent = `VIBRATION: ${vibrate ? 'ON' : 'OFF'}`;
  vibrateBtn.classList.toggle('on', vibrate);
}
vibrateBtn.addEventListener('click', () => {
  vibrate = !vibrate;
  storage.set('bytefall-vibrate', vibrate ? 'on' : 'off');
  updateVibrateBtn();
  if (vibrate) navigator.vibrate(20);
});
updateVibrateBtn();

// FULLSCREEN (app view): the browser's fullscreen mode where it's allowed (Android Chrome,
// desktop). iPhones don't allow it for pages, so there the note points to Add to Home Screen,
// which opens the game full screen like an app (see manifest.webmanifest). Hidden once the
// game is already running as an installed app.
const fullscreenBtn = document.getElementById('fullscreen-btn');
const appNoteEl = document.getElementById('app-note');
const runningAsApp = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
const canFullscreen = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
function updateFullscreenBtn() {
  const on = !!document.fullscreenElement;
  fullscreenBtn.textContent = `FULLSCREEN: ${on ? 'ON' : 'OFF'}`;
  fullscreenBtn.classList.toggle('on', on);
}
fullscreenBtn.hidden = runningAsApp || !canFullscreen;
appNoteEl.hidden = runningAsApp;
appNoteEl.textContent = canFullscreen
  ? 'FULLSCREEN hides the browser bars. For an app icon on your phone, use your browser’s Add to Home Screen.'
  : 'For full screen on this device, use Share → Add to Home Screen: ByteFall then opens like an app.';
fullscreenBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {}
});
document.addEventListener('fullscreenchange', () => {
  updateFullscreenBtn();
  requestAnimationFrame(fitBoard); // the window just changed height
});
updateFullscreenBtn();

// DAILY BONUS: the first time the game opens each day (the player's own date), one free exploit
// is banked behind the FREE EXPLOIT button until used. It's one of the first five in the unlock
// order, locked or not, so new players get a feel for them. Unused, it doesn't stack. Not in DAILY or
// PUZZLE, which stay the same for everyone.
const FREE_KEY = 'bytefall-free-exploit';
const localDay = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const freeBtn = document.getElementById('free-exploit-btn');
let freeExploit = { day: '', ready: false };
try { freeExploit = { ...freeExploit, ...JSON.parse(storage.get(FREE_KEY)) }; } catch (e) {}
const saveFree = () => storage.set(FREE_KEY, JSON.stringify(freeExploit));
let freeGrantedNow = false;
if (freeExploit.day !== localDay()) {
  freeExploit = { day: localDay(), ready: true };
  saveFree();
  freeGrantedNow = true;
}
function updateFreeBtn() {
  freeBtn.hidden = !freeExploit.ready || daily || mode === 'puzzle' || mode === 'vs';
  freeBtn.disabled = gameOver || busy || pivotFrom !== null;
}
freeBtn.addEventListener('click', () => {
  if (!freeExploit.ready || gameOver || busy || pivotFrom !== null || daily || mode === 'puzzle' || mode === 'vs') return;
  const ids = Progress.exploitOrder().slice(0, 5);
  const id = ids[Math.floor(Math.random() * ids.length)];
  freeExploit.ready = false;
  saveFree();
  queue.unshift({ type: 'hack', id });
  setMessage(`FREE EXPLOIT // ${HACKS[id].name}`);
  burstMessage('warning');
  SFX.play('egg');
  updateHud();
  updateFreeBtn();
});

// UNLOCKED / ACHIEVEMENT pop-ups, shown one at a time: each pops in, holds, bursts apart, and
// only then does the next one show
const TOAST_SHOW_MS = 2200;
const TOAST_GAP_MS = 1250; // the burst's longest particles live 1.2s
const toastEl = document.getElementById('toast');
const toastQueue = [];
let toastShowing = false;
function showToast(text) {
  toastQueue.push(text);
  if (!toastShowing) nextToast();
}
// Pop-ups wait while RECORDS or SETTINGS is open (one already showing finishes above the panel)
const panelOpen = () => !recordsEl.hidden || !settingsEl.hidden;
function nextToast() {
  toastShowing = toastQueue.length > 0;
  if (!toastShowing) return;
  if (panelOpen()) {
    setTimeout(nextToast, 250);
    return;
  }
  const text = toastQueue.shift();
  toastEl.textContent = text;
  toastEl.hidden = false;
  placeToast();
  toastEl.classList.remove('show');
  void toastEl.offsetWidth; // restart the pop-in animation
  toastEl.classList.add('show');
  setTimeout(() => {
    FX.burst([{ el: toastEl, type: 'warning' }]);
    toastEl.hidden = true;
    setTimeout(nextToast, TOAST_GAP_MS); // the next one waits until this one has crumbled away
  }, TOAST_SHOW_MS);
}

// Centers the pop-up over the overflow row, masking its blocks; falls back to
// the top of the screen when the board isn't on screen
function placeToast() {
  const row = boardEl.querySelectorAll('.cell.overflow');
  const a = row[0] && row[0].getBoundingClientRect();
  const z = row.length && row[row.length - 1].getBoundingClientRect();
  const onBoard = a && a.width > 0 && a.bottom > 0 && a.top < innerHeight;
  toastEl.classList.toggle('on-board', !!onBoard);
  toastEl.style.top = onBoard ? `${(a.top + a.bottom) / 2}px` : '';
  toastEl.style.left = onBoard ? `${(a.left + z.right) / 2}px` : '';
}
window.addEventListener('resize', () => toastEl.hidden || placeToast());
window.addEventListener('scroll', () => toastEl.hidden || placeToast(), { passive: true });

// Track unlocks are named TRACK 03 etc.; add the title once the track exists.
function unlockLabel(name) {
  const m = name.match(/^TRACK (\d+)$/);
  const track = m && Music.tracks()[Number(m[1]) - 1];
  return track ? `${name} // ${track.title}` : name;
}

function announce(earned) {
  updateLevelBar();
  if (!earned.length) return;
  SFX.play('egg');
  for (const e of earned) showToast(`${e.type} // ${unlockLabel(e.name)}`);
  applyUnlocks();
  if (!recordsEl.hidden) renderRecords();
}

// Level bar under the title: level, DECRYPTOR rank and XP (bits) toward the next level
const levelBarEl = document.getElementById('level-bar');
function updateLevelBar() {
  const lv = Progress.levelInfo();
  document.getElementById('level-label').textContent = `LV ${lv.level}${lv.decryptor ? ` \u00b7 D${lv.decryptor}` : ''}`;
  document.getElementById('xp-fill').style.width = `${lv.maxed ? 100 : (lv.into / lv.need) * 100}%`;
  document.getElementById('xp-label').textContent = lv.maxed ? 'DECRYPTOR READY' : `${fmt(lv.into)} / ${fmt(lv.need)} BITS`;
  levelBarEl.classList.toggle('maxed', lv.maxed);
}
levelBarEl.addEventListener('click', () => {
  recordsTab = 'unlocks';
  setRecordsOpen(true);
});

// RECORDS panel: unlocks and achievements with trackers, and lifetime stats
const recordsBtn = document.getElementById('records-btn');
const recordsEl = document.getElementById('records');
const recordsBodyEl = document.getElementById('records-body');
let recordsTab = 'unlocks';
const fmt = (n) => Number(n).toLocaleString('en-US');
// Bits decrypted as data, in decimal units: 1 kilobit = 1,000 bits, 1 kilobyte = 8,000 bits
function fmtData(bits) {
  if (bits < 1000) return `${fmt(bits)} bits`;
  if (bits < 8000) return `${(bits / 1000).toFixed(2)} kilobits`;
  if (bits < 1000000) return `${(bits / 8000).toFixed(2)} kilobytes`;
  if (bits < 8000000) return `${(bits / 1000000).toFixed(2)} megabits`;
  return `${(bits / 8000000).toFixed(2)} megabytes`;
}

function recordRow({ name, desc, current, goal, done }) {
  const li = document.createElement('li');
  li.className = done ? 'rec-row done' : 'rec-row';
  const shown = Math.min(current, goal);
  li.innerHTML = '<div class="rec-head"><span class="rec-name"></span><span class="rec-state"></span></div>'
    + '<p class="rec-desc"></p><div class="rec-bar"><i></i></div>';
  li.querySelector('.rec-name').textContent = name;
  if (done) li.querySelector('.rec-name').insertAdjacentHTML('beforeend', ' <span class="rec-check">✓</span>');
  // Done: the full goal shows (in amber), e.g. 25 / 25
  li.querySelector('.rec-state').textContent = `${fmt(done ? goal : shown)} / ${fmt(goal)}`;
  li.querySelector('.rec-desc').textContent = desc;
  li.querySelector('.rec-bar i').style.width = `${done ? 100 : (shown / goal) * 100}%`;
  return li;
}

// A RECORDS section title in amber, after an amber ======= line
function recHead(title) {
  const sep = document.createElement('div');
  sep.className = 'rec-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '='.repeat(80);
  const head = document.createElement('p');
  head.className = 'rec-group';
  head.textContent = title;
  recordsBodyEl.append(sep, head);
}

function renderRecords() {
  recordsEl.querySelectorAll('.records-tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === recordsTab));
  });
  recordsBodyEl.innerHTML = '';
  if (recordsTab === 'unlocks') {
    // Level and DECRYPTOR rank, with RANK UP (four presses) once at Lv 80
    const lv = Progress.levelInfo();
    const box = document.createElement('div');
    box.className = 'rec-level';
    const row = recordRow({
      name: `LV ${lv.level} // DECRYPTOR ${lv.decryptor}`,
      desc: lv.maxed
        ? 'A kilobyte decrypted. Rank up to the next DECRYPTOR rank to start again at Lv 1: exploits and slots lock again (you keep one more of each for good), and the next theme unlocks for good.'
        : `100 bits per level. Fill Lv 80 (${fmt(lv.xp)} / ${fmt(lv.rankBits)} bits, a kilobyte) to rank up to DECRYPTOR ${lv.decryptor + 1}.`,
      current: lv.maxed ? 1 : lv.into,
      goal: lv.maxed ? 1 : lv.need,
      done: lv.maxed,
    });
    row.style.borderBottom = 'none';
    // Bright green labels with amber numbers
    row.querySelector('.rec-name').innerHTML = `LV <em>${lv.level}</em> // DECRYPTOR <em>${lv.decryptor}</em>${lv.maxed ? ' <span class="rec-check">✓</span>' : ''}`;
    row.querySelector('.rec-state').innerHTML = `<em>${fmt(lv.maxed ? lv.need : lv.into)}</em> / <em>${fmt(lv.need)}</em>`;
    const rowList = document.createElement('ul');
    rowList.className = 'rec-list';
    rowList.appendChild(row);
    box.appendChild(rowList);
    if (lv.maxed) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-rankup';
      btn.textContent = `RANK UP TO DECRYPTOR ${lv.decryptor + 1}?`;
      // Each press arms the next warning (for a few seconds); the fourth one ranks up
      const warnings = ['CONFIRM? EXPLOITS LOCK AGAIN', 'NO GOING BACK. ARE YOU SURE?', 'YES, ENCRYPT MY PROGRESS!!'];
      let stage = 0;
      btn.addEventListener('click', () => {
        if (!armed || armed.btn !== btn) stage = 0;
        if (stage < warnings.length) {
          armReset(btn, warnings[stage++]);
          return;
        }
        disarmReset();
        if (Progress.rankUp()) {
          showToast(`DECRYPTOR ${Progress.levelInfo().decryptor} // BACK TO LV 1`);
          announce(Progress.check());
          applyUnlocks();
          renderRecords();
        }
      });
      box.appendChild(btn);
    }
    recordsBodyEl.appendChild(box);

    // This rank's exploit unlocks
    const exUnlocked = Progress.exploitOrder().filter((id) => Progress.exploitInfo(id).unlocked).length;
    recHead(`// EXPLOITS // DECRYPTOR ${lv.decryptor} (${exUnlocked} / ${Progress.exploitOrder().length})`);
    const exList = document.createElement('ul');
    exList.className = 'rec-list';
    const slotsNow = Progress.slotInfo();
    exList.appendChild(recordRow({
      name: `EXPLOIT SLOTS ${slotsNow.slots} / ${slotsNow.max}`,
      desc: slotsNow.nextLevel ? `Next slot at Lv ${slotsNow.nextLevel}. Each DECRYPTOR rank keeps one more.` : 'Each DECRYPTOR rank keeps one more, up to 6.',
      current: slotsNow.slots,
      goal: slotsNow.max,
      done: slotsNow.slots >= slotsNow.max,
    }));
    for (const id of Progress.exploitOrder()) {
      const info = Progress.exploitInfo(id);
      exList.appendChild(recordRow({
        name: HACKS[id].name,
        desc: info.kept ? 'Kept for good by your DECRYPTOR rank' : `Unlocks at Lv ${info.level}`,
        current: info.kept ? 1 : Math.min(lv.level, info.level),
        goal: info.kept ? 1 : info.level,
        done: info.unlocked,
      }));
    }
    recordsBodyEl.appendChild(exList);

    let group = '';
    let list = null;
    const unlocks = Progress.unlocks();
    for (const u of unlocks) {
      if (u.group !== group) {
        group = u.group;
        const inGroup = unlocks.filter((x) => x.group === group);
        recHead(`// ${group} (${inGroup.filter((x) => x.done).length} / ${inGroup.length})`);
        list = document.createElement('ul');
        list.className = 'rec-list';
        recordsBodyEl.appendChild(list);
      }
      const m = u.name.match(/^TRACK (\d+)$/);
      const track = m && Music.tracks()[Number(m[1]) - 1];
      const name = m ? `${u.name} · ${track ? track.title : 'COMING SOON'}` : u.name;
      list.appendChild(recordRow({ name, desc: u.need, current: u.current, goal: u.goal, done: u.done }));
    }
  } else if (recordsTab === 'achievements') {
    // HIDDEN and IMPOSSIBLE ones get their own sections at the bottom; hidden ones count toward
    // EARNED, impossible ones don't
    const all = Progress.achievements();
    const counted = all.filter((a) => !a.impossible);
    const summary = document.createElement('p');
    summary.className = 'rec-summary';
    summary.textContent = `${counted.filter((a) => a.done).length} / ${counted.length} EARNED`;
    recordsBodyEl.appendChild(summary);
    const listOf = (items) => {
      const list = document.createElement('ul');
      list.className = 'rec-list';
      for (const a of items) {
        // Hidden ones stay a mystery until earned
        const secret = a.hidden && !a.done;
        list.appendChild(recordRow({ name: secret ? '???' : a.name, desc: secret ? 'Hidden: keep playing to find it' : a.desc, current: a.current, goal: a.goal, done: a.done }));
      }
      return list;
    };
    const section = (title, items) => {
      recHead(title);
      recordsBodyEl.appendChild(listOf(items));
    };
    // Standard ones under their group's // TITLE
    const standard = counted.filter((a) => !a.hidden);
    for (const group of [...new Set(standard.map((a) => a.group))]) {
      const items = standard.filter((a) => a.group === group);
      section(`// ${group} (${items.filter((a) => a.done).length} / ${items.length})`, items);
    }
    const hidden = counted.filter((a) => a.hidden);
    section(`// HIDDEN ACHIEVEMENTS !? (${hidden.filter((a) => a.done).length} / ${hidden.length} FOUND)`, hidden);
    section('// IMPOSSIBLE ACHIEVEMENTS', all.filter((a) => a.impossible));
  } else {
    const s = Progress.stats();
    const favorite = Object.entries(s.exploitUses).sort((a, b) => b[1] - a[1])[0];
    const lv = Progress.levelInfo();
    const rows = [
      ['LEVEL', `${lv.level}`],
      ['DECRYPTOR RANK', `${lv.decryptor}`],
      ['SESSIONS PLAYED', fmt(s.games)],
      ['TOTAL DROPS', fmt(s.drops)],
      ['BITS DECRYPTED', fmt(s.bits)],
      ['NIBBLES DECRYPTED', fmt(s.nibbles)],
      ['MOST NIBBLES IN ONE DROP', fmt(s.bestDropNibbles)],
      ['NIBBLE BONUS POINTS', fmt(s.nibbles * NIBBLE_BONUS)],
      ['BYTES DECRYPTED', fmt(s.bytes)],
      ['LAYERS PEELED', fmt(s.peeled)],
      ['BITS REVEALED', fmt(s.broken)],
      ['EXPLOITS RUN', fmt(s.exploits)],
      ['FAVORITE EXPLOIT', favorite ? `${HACKS[favorite[0]] ? HACKS[favorite[0]].name : favorite[0]} (${fmt(favorite[1])})` : '—'],
      ['LONGEST CHAIN', `${s.bestChain}x`],
      ['BEST SCORE // EASY', fmt(s.bestEasy)],
      ['BEST SCORE // NORMAL', fmt(s.bestNormal)],
      ['BEST SCORE // HARD', fmt(s.bestHard)],
      ['LONGEST HARD SESSION', `${fmt(s.bestHardDrops)} drops`],
      ['CLEAN SWEEPS', fmt(s.sweeps)],
      ['CLOSE CALLS', fmt(s.closeCalls)],
      ['DAILY DECRYPTS PLAYED', fmt(s.dailies)],
      ['DAILY STREAK', `${fmt(s.lastDaily === todayKey() || s.lastDaily === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? s.dailyStreak : 0)} (best ${fmt(s.bestDailyStreak)})`],
      ['DAILY DECRYPT TODAY', storage.get(dailyPlayedKey('decrypt')) ? fmt(Number(storage.get(dailyKey('decrypt'))) || 0) : 'not played'],
      ['DATA DECRYPTED', fmtData(s.bits)],
      ['TOTAL POINTS', fmt(s.points)],
      ['BEST // BLITZ', fmt(Number(storage.get('bytefall-best-blitz')) || 0)],
      ['BEST // ZEN', fmt(Number(storage.get('bytefall-best-zen')) || 0)],
      ...Object.entries(CpuBoard.LEVELS).map(([id, l]) => [`VS ${l.label} CPU // WON-LOST`, `${fmt(s.vsWins[id] || 0)} - ${fmt(s.vsLosses[id] || 0)}`]),
    ];
    const dl = document.createElement('dl');
    dl.className = 'rec-stats';
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      const line = document.createElement('div'); // label ........ value
      line.append(dt, dd);
      dl.append(line);
    }
    recordsBodyEl.appendChild(dl);
    // RESET PROGRESS: two presses, like RESTART. Clears stats, unlocks, achievements, puzzles and
    // best scores; settings (sound, music, theme choice...) stay.
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'rec-reset';
    reset.textContent = 'RESET PROGRESS';
    reset.addEventListener('click', () => {
      if (!armed || armed.btn !== reset) {
        armReset(reset, 'CONFIRM? THIS ERASES ALL PROGRESS');
        return;
      }
      disarmReset();
      try {
        Object.keys(localStorage)
          .filter((k) => k === 'bytefall-progress' || k === 'bytefall-puzzle' || k.startsWith('bytefall-best-')
            || k.startsWith('bytefall-best-') || k.startsWith('bytefall-daily-'))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) {}
      location.reload();
    });
    recordsBodyEl.appendChild(reset);
  }
}

function setRecordsOpen(open) {
  recordsEl.hidden = !open;
  recordsBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    setSettingsOpen(false);
    renderRecords();
  }
}
recordsBtn.addEventListener('click', () => setRecordsOpen(recordsEl.hidden));
recordsEl.querySelectorAll('.records-tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    recordsTab = b.dataset.tab;
    renderRecords();
  });
});
document.addEventListener('pointerdown', (e) => {
  if (!recordsEl.hidden && !recordsEl.contains(e.target) && !recordsBtn.contains(e.target)) setRecordsOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !recordsEl.hidden) setRecordsOpen(false);
});

// Locked exploits dim with their points tracker (this rank); DAILY shows its fixed five.
// Exploit cards, in unlock order: locked (with the level that unlocks them), unlocked (tap to
// equip) or equipped (tap to remove). DAILY shows its fixed five instead.
const hacksPanelEl = document.querySelector('.panel-hacks');
// The loadout can only change before a session's first drop, or once it's over
const loadoutEditable = () => gameOver || Progress.runDrops() === 0;
const slotInfoEl = document.getElementById('slot-info');
function refreshExploitCards() {
  const { slots, max, nextLevel } = Progress.slotInfo();
  const equipped = Progress.equipped();
  const editable = loadoutEditable();
  if (daily) {
    slotInfoEl.textContent = mode === 'puzzle' ? 'DAILY PUZZLE // NO EXPLOITS' : 'DAILY // THE SAME FIVE EXPLOITS FOR EVERYONE';
  } else {
    slotInfoEl.textContent = `SLOTS ${equipped.length} / ${slots}`
      + (slots < max ? (nextLevel ? ` // NEXT SLOT AT LV ${nextLevel}` : ' // MORE SLOTS WITH DECRYPTOR RANKS') : '')
      + (editable ? '' : ' // LOCKED UNTIL THE SESSION ENDS');
  }
  for (const id of Progress.exploitOrder()) {
    const el = hacksPanelEl.querySelector(`.hack-item[data-hack="${id}"]`);
    if (!el) continue;
    hacksPanelEl.appendChild(el); // keep the cards in unlock order
    const info = Progress.exploitInfo(id);
    const on = daily ? DAILY_EXPLOITS.includes(id) : equipped.includes(id);
    el.classList.toggle('locked', daily ? !on : !info.unlocked);
    el.classList.toggle('unlocked', !daily && info.unlocked && editable);
    el.classList.toggle('equipped', on);
    let tag;
    if (daily) tag = on ? '' : 'NOT USED IN THE DAILY';
    else if (!info.unlocked) tag = `UNLOCKS AT LV ${info.level} THIS RANK`;
    else if (!editable) tag = on ? '' : 'NOT EQUIPPED THIS SESSION';
    else if (on) tag = 'TAP TO REMOVE';
    else tag = equipped.length < slots ? 'TAP TO EQUIP' : 'SLOTS FULL // REMOVE ONE TO SWAP';
    el.querySelector('.lock-tag').textContent = tag;
  }
}
// DEV (the dev page's UNLOCK EVERYTHING switch): press and hold any exploit card for 2 seconds
// to make it your next drop, slotted or not, to try it out.
const DEV_HOLD_MS = 2000;
let devHold = null; // { card, timer }
let devHoldFired = false; // swallow the click that ends a successful hold
function cancelDevHold() {
  if (!devHold) return;
  clearTimeout(devHold.timer);
  devHold.card.classList.remove('dev-holding');
  devHold = null;
}
hacksPanelEl.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.hack-item');
  if (!card || !Unlocks.isDevUnlock()) return;
  cancelDevHold();
  devHoldFired = false;
  card.classList.add('dev-holding');
  devHold = {
    card,
    timer: setTimeout(() => {
      const id = card.dataset.hack;
      cancelDevHold();
      devHoldFired = true;
      if (gameOver || busy || pivotFrom !== null) {
        SFX.play('denied');
        return;
      }
      queue.unshift({ type: 'hack', id });
      setMessage(`DEV // ${HACKS[id].name} READY`);
      SFX.play('egg');
      updateHud();
    }, DEV_HOLD_MS),
  };
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) hacksPanelEl.addEventListener(type, cancelDevHold);
hacksPanelEl.addEventListener('contextmenu', (e) => {
  if (Unlocks.isDevUnlock() && e.target.closest('.hack-item')) e.preventDefault(); // long-press menu on phones
});

hacksPanelEl.addEventListener('click', (e) => {
  if (devHoldFired) {
    devHoldFired = false;
    return;
  }
  const card = e.target.closest('.hack-item');
  if (!card || daily || !Progress.exploitInfo(card.dataset.hack).unlocked) return;
  if (!loadoutEditable()) {
    SFX.play('denied');
    showToast('LOADOUT LOCKED // FINISH OR RESTART TO CHANGE IT');
    return;
  }
  const id = card.dataset.hack;
  if (Progress.isEquipped(id)) {
    Progress.unequip(id);
    SFX.play('backspace');
  } else if (Progress.equip(id)) {
    SFX.play('enter');
  } else {
    SFX.play('denied');
    showToast(Progress.slotInfo().slots ? 'SLOTS FULL // REMOVE ONE TO SWAP' : 'NO EXPLOIT SLOTS YET');
  }
  refreshExploitCards();
});

// Refreshes everything that can be locked, after progress or Full Access changes.
function applyUnlocks() {
  refreshExploitCards();
  updateLevelBar();
  const hardBtn = document.querySelector('#difficulty-row [data-difficulty="hard"]');
  const hardLocked = !Progress.isUnlocked('mode-hard');
  hardBtn.classList.toggle('locked', hardLocked);
  hardBtn.title = hardLocked ? `${Progress.unlock('mode-hard').need} to unlock` : '';
  Music.refreshUnlocks();
  applyTheme();
  applyFont();
  renderPlaylist();
}
Unlocks.onChange(applyUnlocks);
applyUnlocks();
document.getElementById('dev-badge').hidden = !Unlocks.isDevUnlock();
document.body.classList.toggle('dev-unlock', Unlocks.isDevUnlock());

initGame();
updateFreeBtn();
if (freeGrantedNow) showToast('DAILY BONUS // 1 FREE EXPLOIT READY');

function formatCentral(isoDate) {
  const d = new Date(isoDate);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  const hh = get('hour') === '24' ? '00' : get('hour');
  return `${date} ${hh}:${get('minute')} ${get('timeZoneName')}`;
}

fetch('https://api.github.com/repos/EmptyFishTank-JB/ByteFall/commits?sha=main&per_page=1')
  .then((r) => {
    if (!r.ok) throw new Error('bad response');
    return r.json();
  })
  .then((data) => {
    const c = data[0];
    document.getElementById('commitInfo').textContent = c.sha.slice(0, 7);
    document.getElementById('updatedInfo').textContent = formatCentral(c.commit.committer.date);
  })
  .catch(() => {
    document.getElementById('commitInfo').textContent = 'unavailable';
    document.getElementById('updatedInfo').textContent = 'unavailable';
  });
