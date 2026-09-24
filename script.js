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
const HARD_POINTS_PER_STEP = 500; // hard mode loses one drop per this many points
const BYTE_BITS = 8; // Hard: every 8 bits decrypted by one drop is a byte...
const BYTE_BONUS = 256; // ...worth 2^8 points

const DIFFICULTIES = {
  easy: { label: 'EASY', size: 7, showNext: true, interval: () => BASE_INTERVAL },
  normal: { label: 'NORMAL', size: 7, showNext: false, interval: () => BASE_INTERVAL },
  hard: {
    label: 'HARD',
    size: 8,
    byteBonus: true,
    showNext: false,
    interval: (pts) => Math.max(HARD_MIN_INTERVAL, BASE_INTERVAL - Math.floor(pts / HARD_POINTS_PER_STEP)),
  },
};

// easyCombo: on Easy, the chain length that unlocks each hack (stronger hacks need longer chains).
// unlock: a bonus exploit, only awarded once that progress.js unlock is earned.
const HACKS = {
  worm: { name: 'WORM VIRUS', icon: '§', easyCombo: 5 },
  overflow: { name: 'BUFFER OVERFLOW', icon: '+', easyCombo: 4 },
  trojan: { name: 'TROJAN', icon: '◈', easyCombo: 4 },
  rng: { name: 'RNG', icon: '?', easyCombo: 3 },
  bitflip: { name: 'BITFLIP', icon: '↕', easyCombo: 3 },
  dictionary: { name: 'DICTIONARY ATTACK', icon: '#', easyCombo: 4, unlock: 'exploit-dictionary' },
  keylogger: { name: 'KEYLOGGER', icon: '@', easyCombo: 3, unlock: 'exploit-keylogger' },
  backdoor: { name: 'BACKDOOR', icon: '_', easyCombo: 4, unlock: 'exploit-backdoor' },
  rainbow: { name: 'RAINBOW TABLE', icon: '*', easyCombo: 5, unlock: 'exploit-rainbow' },
};
const KEYLOGGER_DROPS = 10; // drops the keylogger keeps showing the next bits for
const KEYLOGGER_PREVIEW = 3;

const hackAvailable = (id) => !HACKS[id].unlock || Progress.isUnlocked(HACKS[id].unlock);
Progress.setExploitCount(Object.keys(HACKS).length);

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
let classicDifficulty = DIFFICULTIES[storage.get('blockchain-difficulty')] ? storage.get('blockchain-difficulty') : 'normal';
if (classicDifficulty === 'hard' && !Progress.isUnlocked('mode-hard')) classicDifficulty = 'normal';
let difficulty = classicDifficulty;

const BLITZ_SECONDS = 120;
const MODES = {
  classic: { label: 'CLASSIC' },
  daily: { label: 'DAILY', info: (date) => `DAILY DECRYPT // ${date} (UTC): the same bits for everyone today, on Normal rules.` },
  blitz: { label: 'BLITZ', info: () => 'BLITZ // 2 minutes on the clock, starting with your first drop. Score all you can.' },
  zen: { label: 'ZEN', noLayers: true, info: () => 'ZEN // no encryption layers and no clock. Just decrypt.' },
  puzzle: {
    label: 'PUZZLE',
    noLayers: true, // no new layers rise (puzzles can start with some)
    noHacks: true,
    info: () => `Decrypt every block on the board with exactly the ${PUZZLES[puzzleIndex].pieces.length === 1 ? 'bit' : `${PUZZLES[puzzleIndex].pieces.length} bits`} given, in order.`,
  },
};
Progress.setPuzzleCount(PUZZLES.length);
// PUZZLE: the first unsolved one, or the one you were on
const firstUnsolved = () => {
  const i = PUZZLES.findIndex((_, n) => !Progress.puzzleSolved(n));
  return i < 0 ? PUZZLES.length - 1 : i;
};
let puzzleIndex = Math.min(Number(storage.get('bytefall-puzzle')) || firstUnsolved(), firstUnsolved());
let overlayNext = null; // what the overlay button does in PUZZLE: 'next' or 'retry'
let mode = MODES[storage.get('bytefall-mode')] ? storage.get('bytefall-mode') : 'classic';

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
  if (mode === 'daily') {
    const day = todayKey();
    for (const stream of Object.keys(dice)) dice[stream] = seeded(hashString(`bytefall:${day}:${stream}`));
  } else {
    for (const stream of Object.keys(dice)) dice[stream] = Math.random;
  }
}

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

function newFirewall(level = 2) {
  return { type: 'firewall', level };
}

// Hard moved to 8x8, so it keeps a fresh best apart from old 7x7 Hard scores.
// Other modes keep their own bests; DAILY keeps one per day.
function bestKey() {
  if (mode === 'daily') return `bytefall-daily-${todayKey()}`;
  if (mode !== 'classic') return `bytefall-best-${mode}`;
  return difficulty === 'hard' ? 'blockchain-best-hard-8x8' : `blockchain-best-${difficulty}`;
}

// Always enough upcoming bits for the widest preview (the keylogger's). PUZZLE has a fixed list.
function refillQueue() {
  if (mode === 'puzzle') return;
  while (queue.length < 1 + KEYLOGGER_PREVIEW) queue.push(newPacket('queue'));
}

function initGame() {
  runId++;
  difficulty = mode === 'classic' ? classicDifficulty : 'normal';
  setupDice();
  Progress.startRun(difficulty, mode);
  timeLeft = BLITZ_SECONDS;
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
  refillQueue();
  if (mode === 'puzzle') loadPuzzle();
  score = 0;
  best = Number(storage.get(bestKey())) || 0;
  bestAtStart = best;
  dropsSinceLastPulse = 0;
  keyloggerDrops = 0;
  pulseInterval = DIFFICULTIES[difficulty].interval(0);
  gameOver = false;
  busy = false;
  chainEl.textContent = '0x';
  document.querySelectorAll('.difficulty button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.difficulty === classicDifficulty);
  });
  const easy = difficulty === 'easy';
  document.getElementById('hack-intro').textContent = easy
    ? 'Chains unlock exploits: the longer the chain, the stronger the exploit.'
    : `Chain ${HACK_COMBO} decrypts in one drop to unlock a random exploit.`;
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
}

// A layer peeled to 0 shows the bit under it: fixed in PUZZLE boards, random otherwise.
function revealBit(layer) {
  return layer.hidden ? { type: 'number', val: layer.hidden } : newPacket();
}

// PUZZLE: 'L2:5' is a level 2 layer hiding a [5]; plain numbers are bits.
function loadPuzzle() {
  const puzzle = PUZZLES[puzzleIndex];
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
  if (columns.every((c) => c.length === 0)) {
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
  const last = puzzleIndex === PUZZLES.length - 1;
  overlayNext = solved && !last ? 'next' : 'retry';
  document.querySelector('.overlay-box').classList.toggle('win', solved);
  document.getElementById('overlay-title').textContent = solved ? 'DECRYPTED' : 'OUT OF BITS';
  document.getElementById('overlay-sub').textContent = solved
    ? (last ? 'Every puzzle solved. The whole archive is yours.' : `Puzzle ${puzzleIndex + 1} cracked${firstTime ? '' : ' again'}.`)
    : 'Blocks are still encrypted.';
  finalScoreEl.textContent = score;
  newBestEl.hidden = true;
  const note = document.getElementById('overlay-note');
  note.hidden = false;
  note.textContent = `PUZZLE ${puzzleIndex + 1} / ${PUZZLES.length} // ${PUZZLES.filter((_, n) => Progress.puzzleSolved(n)).length} SOLVED`;
  document.getElementById('overlay-restart-btn').textContent = overlayNext === 'next' ? 'NEXT PUZZLE' : 'RETRY';
  updatePuzzleNav();
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
  const buttons = columnButtonsEl.querySelectorAll('button');
  buttons.forEach((btn, c) => {
    btn.disabled = gameOver || busy || columns[c].length >= MAX_ROWS;
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

function pieceLabel(piece) {
  return piece.type === 'hack' ? `[${HACKS[piece.id].icon}]` : `[${piece.val}]`;
}

function showPiece(el, piece) {
  if (piece.type === 'number') fillBit(el, piece.val);
  else el.textContent = pieceLabel(piece);
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
          div.textContent = pieceLabel(cell);
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
  if (score > best) {
    best = score;
    storage.set(bestKey(), String(best));
  }
  scoreEl.textContent = score;
  bestEl.textContent = best;
  if (queue[0]) showPiece(currentEl, queue[0]);
  else currentEl.textContent = '[ ]';
  // Easy previews the next bit; an active keylogger shows the next three; PUZZLE shows what's left.
  const preview = mode === 'puzzle' ? Math.min(KEYLOGGER_PREVIEW, Math.max(0, queue.length - 1))
    : keyloggerDrops > 0 ? KEYLOGGER_PREVIEW : DIFFICULTIES[difficulty].showNext ? 1 : 0;
  nextStatEl.hidden = !preview;
  nextLabelEl.textContent = keyloggerDrops > 0 ? `KEYLOG ${keyloggerDrops}` : 'NEXT';
  nextStatEl.classList.toggle('keylogger', keyloggerDrops > 0);
  if (preview === 1) showPiece(nextEl, queue[1]);
  else if (preview) {
    const upcoming = queue.slice(1, 1 + preview);
    if (themeIs('glyph')) {
      nextEl.innerHTML = `<span class="glyphs">${upcoming.map((p) => (p.type === 'number' ? glyphSvg(p.val) : pieceLabel(p))).join('')}</span>`;
    } else {
      nextEl.textContent = upcoming.map(pieceLabel).join('');
    }
    nextEl.classList.remove('hack');
    nextEl.title = '';
  }
  pulseCounterEl.textContent = mode === 'puzzle' ? queue.length : pulseInterval - dropsSinceLastPulse;
  pulseCounterEl.closest('.stat').classList.toggle('danger', !gameOver && !MODES[mode].noLayers && pulseInterval - dropsSinceLastPulse === 1);
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

async function attemptDrop(col) {
  if (gameOver || busy || !queue.length) return;
  if (columns[col].length >= MAX_ROWS) {
    SFX.play('denied');
    return;
  }

  busy = true;
  chainEl.textContent = '0x';
  setMessage('');
  const piecesBefore = columns.reduce((n, c) => n + c.length, 0);
  const piece = queue.shift();
  refillQueue();
  if (keyloggerDrops > 0) keyloggerDrops--;
  updateHud();
  const landing = columns[col].length;
  for (let r = MAX_ROWS - 1; r > landing; r--) {
    render([], { row: r, col, cell: piece });
    SFX.play('click');
    await sleep(STEP_MS);
  }
  columns[col].push(piece);
  Progress.drop();
  if (mode === 'blitz') clockRunning = true;
  let wentOver = overflowed();
  render();
  SFX.play('enter');
  await sleep(60);

  if (piece.type === 'hack') await runHack(piece.id, landing, col);
  await resolveChains();

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

  if (!overflowed()) {
    if (wentOver) Progress.closeCall();
    if (piecesBefore >= 5 && Progress.runDrops() >= 10 && columns.every((c) => c.length === 0)) Progress.sweep();
  }
  finishTurn();
}

function finishTurn() {
  updateHud();
  busy = false;
  render();
  Progress.score(score);
  announce(Progress.check());
  if (overflowed()) endGame();
  else if (timeUp) endGame('time');
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

// Hard: 8 bits decrypted by one drop make a byte.
async function awardBytes(bytes) {
  score += bytes * BYTE_BONUS;
  Progress.bytes(bytes);
  updateHud();
  setMessage(`${bytes > 1 ? `${bytes} BYTES` : 'BYTE'} DECRYPTED // +${bytes * BYTE_BONUS}`, 'byte');
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

    if (pops.length === 0) break;

    chain++;
    cleared += pops.length;
    Progress.decrypted(pops.map((p) => grid[p.row][p.col].val), chain);
    score += pops.length * 10 * chain;
    chainEl.textContent = `${chain}x`;

    FX.burst(cellsAt(pops));
    render(pops);
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
            columns[n.col][n.row] = revealBit(neighborCell);
            revealed = true;
          }
        }
      }
    }

    if (revealed) SFX.play('punct');
    else if (cracked) SFX.play('backspace');

    for (const p of pops) columns[p.col][p.row] = null;
    await collapse();
    updateHud();
    await sleep(100);
  }

  if (chain > 0) {
    await sleep(300);
    const bytes = DIFFICULTIES[difficulty].byteBonus ? Math.floor(cleared / BYTE_BITS) : 0;
    if (bytes) await awardBytes(bytes);
    const hack = MODES[mode].noHacks ? null : hackForChain(chain);
    if (hack) awardHack(hack);
    else setMessage('');
  }
}

// DOM cells for board positions, captured before a re-render replaces them.
function cellsAt(positions) {
  return positions.map(({ row, col }) => ({
    el: boardEl.querySelector(`[data-pos="${row},${col}"]`),
    type: columns[col][row] && columns[col][row].type,
  }));
}

function occupied(row, col) {
  return row >= 0 && row < MAX_ROWS && col >= 0 && col < COLS && !!columns[col][row];
}

// The hack piece has just landed at (row, col) on top of its stack.
async function runHack(id, row, col) {
  Progress.exploit(id);
  setMessage(`${HACKS[id].name} // EXECUTING`);
  SFX.play('static');

  if (id === 'worm' || id === 'trojan') {
    const hits = [];
    if (id === 'worm') {
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
    for (const h of hits) columns[h.col][h.row] = null;
    score += (hits.length - 1) * 10;
    await collapse();
  } else if (id === 'dictionary') {
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
    for (const h of hits) columns[h.col][0] = null;
    score += hits.length * 10;
    await collapse();
  } else if (id === 'rainbow') {
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
      score += hits.length * 10;
      await collapse();
    } else {
      render();
    }
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
        if (id === 'overflow') {
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
  busy = true;
  clockRunning = false;
  SFX.play('denied');
  render();
  Music.setIntensity(0);
  setMessage('');
  finalScoreEl.textContent = score;
  newBestEl.hidden = !(score > bestAtStart);
  document.getElementById('overlay-title').textContent = reason === 'time' ? "TIME'S UP" : 'TRACE COMPLETE';
  document.getElementById('overlay-sub').textContent = reason === 'time' ? 'The connection timed out.' : 'They found you.';
  const note = document.getElementById('overlay-note');
  note.hidden = mode === 'classic';
  note.textContent = mode === 'daily' ? `DAILY DECRYPT // ${todayKey()} // TODAY'S BEST ${best}` : `${MODES[mode].label} // BEST ${best}`;

  const run = runId;
  meltBoard(run);
  setTimeout(() => {
    if (run === runId) overlayEl.classList.remove('hidden');
  }, 1200);
}

document.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= COLS) attemptDrop(num - 1);
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

document.querySelectorAll('.difficulty button').forEach((btn) => {
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
      storage.set('blockchain-difficulty', next);
    });
  });
});

// Mode buttons: switching mid-run asks to confirm, like RESTART.
document.querySelectorAll('.modes button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.mode;
    if (next === mode) return;
    requestReset(btn, 'CONFIRM?', () => {
      mode = next;
      storage.set('bytefall-mode', next);
    });
  });
});

// Shows what the current mode changes: the mode row, its note, the difficulty row (CLASSIC
// only), the layer countdown (not in ZEN) and the BLITZ clock.
function applyModeUi() {
  document.querySelectorAll('.modes button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const info = document.getElementById('mode-info');
  info.hidden = mode === 'classic';
  info.textContent = mode === 'classic' ? '' : MODES[mode].info(todayKey());
  document.querySelector('.difficulty').hidden = mode !== 'classic';
  document.getElementById('pulse-stat').hidden = !!MODES[mode].noLayers && mode !== 'puzzle';
  document.getElementById('pulse-label').textContent = mode === 'puzzle' ? 'BITS LEFT' : 'NEW LAYER IN';
  puzzleNavEl.hidden = mode !== 'puzzle';
  if (mode === 'puzzle') updatePuzzleNav();
  // The overlay goes back to its trace look until a puzzle result changes it
  overlayNext = null;
  document.querySelector('.overlay-box').classList.remove('win');
  document.getElementById('overlay-restart-btn').textContent = mode === 'puzzle' ? 'RETRY' : 'NEW SESSION';
  document.getElementById('time-stat').hidden = mode !== 'blitz';
  showClock();
}

const timeLeftEl = document.getElementById('time-left');
function showClock() {
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

document.getElementById('overlay-restart-btn').addEventListener('click', () => {
  if (mode === 'puzzle' && overlayNext === 'next') setPuzzle(Math.min(puzzleIndex + 1, PUZZLES.length - 1));
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
let buttonsOnTop = storage.get('blockchain-buttons') === 'top';
function updateButtonsPos() {
  boardWrapEl.classList.toggle('buttons-top', buttonsOnTop);
  buttonsPosBtn.textContent = `DROP BUTTONS: ${buttonsOnTop ? 'TOP' : 'BOTTOM'}`;
}
buttonsPosBtn.addEventListener('click', () => {
  buttonsOnTop = !buttonsOnTop;
  storage.set('blockchain-buttons', buttonsOnTop ? 'top' : 'bottom');
  updateButtonsPos();
});
updateButtonsPos();

// Color themes: each id matches a [data-theme] block in style.css ('terminal' is the default :root).
// Every theme but TERMINAL is unlocked by progress.js (theme-<id>). Keep the head script in index.html in sync.
const THEMES = [
  { id: 'terminal', label: 'TERMINAL', desc: 'green bits, grey layers, amber cracks and exploits.' },
  { id: 'cipher', label: 'CIPHER', desc: 'cyan bits, magenta layers, yellow cracks and exploits.' },
  { id: 'amber', label: 'AMBER CRT', desc: 'an old amber monitor: grey layers, white cracks and exploits.' },
  { id: 'mono', label: 'MONOCHROME', desc: 'black and white; layers are told apart by stripes and dashed borders.' },
  { id: 'redline', label: 'REDLINE', desc: 'red-alert intrusion: steel-blue layers, yellow cracks, a white trace.' },
  { id: 'synthwave', label: 'SYNTHWAVE', desc: 'pink bits, purple layers, orange cracks and a cyan trace.' },
  { id: 'dotmatrix', label: 'DOT MATRIX', desc: 'four shades of olive green, like an old handheld game screen.' },
  { id: 'daylight', label: 'DAYLIGHT', desc: 'dark ink on pale paper, for bright rooms and outdoors.' },
  { id: 'glyph', label: 'GLYPH', desc: 'bits become shapes with one corner per point: a teardrop is 1, a triangle 3, an octagon 8.' },
  { id: 'spectrum', label: 'SPECTRUM', desc: 'every bit cycles through the rainbow on its own while the page drifts slowly behind them.' },
];
const themeAvailable = (t) => t.id === 'terminal' || Progress.isUnlocked(`theme-${t.id}`);
const themeListEl = document.getElementById('theme-list');
const themeNoteEl = document.getElementById('theme-note');
const themeMeta = document.querySelector('meta[name="theme-color"]');
// The saved choice is kept even while locked, so it comes back once unlocked.
let themeId = THEMES.some((t) => t.id === storage.get('blockchain-theme')) ? storage.get('blockchain-theme') : 'terminal';

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
        themeId = t.id;
        storage.set('blockchain-theme', themeId);
        applyTheme();
      });
    }
    themeListEl.appendChild(btn);
  }
}
applyTheme();

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
      btn.dataset.need = `\u{1F512} ${Progress.unlock(`track-${n + 1}`).goal.toLocaleString('en-US')}`;
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

// UNLOCKED / ACHIEVEMENT pop-ups, shown one at a time
const toastEl = document.getElementById('toast');
const toastQueue = [];
let toastShowing = false;
function showToast(text) {
  toastQueue.push(text);
  if (!toastShowing) nextToast();
}
function nextToast() {
  const text = toastQueue.shift();
  toastShowing = !!text;
  if (!text) return;
  toastEl.textContent = text;
  toastEl.hidden = false;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth; // restart the pop-in animation
  toastEl.classList.add('show');
  setTimeout(() => {
    FX.burst([{ el: toastEl, type: 'warning' }]);
    toastEl.hidden = true;
    setTimeout(nextToast, 250);
  }, 2200);
}

// Track unlocks are named TRACK 03 etc.; add the title once the track exists.
function unlockLabel(name) {
  const m = name.match(/^TRACK (\d+)$/);
  const track = m && Music.tracks()[Number(m[1]) - 1];
  return track ? `${name} // ${track.title}` : name;
}

function announce(earned) {
  if (!earned.length) return;
  SFX.play('egg');
  for (const e of earned) showToast(`${e.type} // ${unlockLabel(e.name)}`);
  if (earned.some((e) => e.type === 'UNLOCKED')) applyUnlocks();
  if (!recordsEl.hidden) renderRecords();
}

// RECORDS panel: unlocks and achievements with trackers, and lifetime stats
const recordsBtn = document.getElementById('records-btn');
const recordsEl = document.getElementById('records');
const recordsBodyEl = document.getElementById('records-body');
let recordsTab = 'unlocks';
const fmt = (n) => Number(n).toLocaleString('en-US');

function recordRow({ name, desc, current, goal, done }) {
  const li = document.createElement('li');
  li.className = done ? 'rec-row done' : 'rec-row';
  const shown = Math.min(current, goal);
  li.innerHTML = '<div class="rec-head"><span class="rec-name"></span><span class="rec-state"></span></div>'
    + '<p class="rec-desc"></p><div class="rec-bar"><i></i></div>';
  li.querySelector('.rec-name').textContent = name;
  li.querySelector('.rec-state').textContent = done ? '✓' : `${fmt(shown)} / ${fmt(goal)}`;
  li.querySelector('.rec-desc').textContent = desc;
  li.querySelector('.rec-bar i').style.width = `${done ? 100 : (shown / goal) * 100}%`;
  return li;
}

function renderRecords() {
  recordsEl.querySelectorAll('.records-tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === recordsTab));
  });
  recordsBodyEl.innerHTML = '';
  if (recordsTab === 'unlocks') {
    let group = '';
    let list = null;
    for (const u of Progress.unlocks()) {
      if (u.group !== group) {
        group = u.group;
        const h = document.createElement('p');
        h.className = 'rec-group';
        h.textContent = `// ${group}`;
        recordsBodyEl.appendChild(h);
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
    const all = Progress.achievements();
    const summary = document.createElement('p');
    summary.className = 'rec-summary';
    summary.textContent = `${all.filter((a) => a.done).length} / ${all.length} EARNED`;
    recordsBodyEl.appendChild(summary);
    const list = document.createElement('ul');
    list.className = 'rec-list';
    for (const a of all) list.appendChild(recordRow({ name: a.name, desc: a.desc, current: a.current, goal: a.goal, done: a.done }));
    recordsBodyEl.appendChild(list);
  } else {
    const s = Progress.stats();
    const favorite = Object.entries(s.exploitUses).sort((a, b) => b[1] - a[1])[0];
    const rows = [
      ['SESSIONS PLAYED', fmt(s.games)],
      ['TOTAL DROPS', fmt(s.drops)],
      ['BITS DECRYPTED', fmt(s.bits)],
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
      ['BEST // DAILY TODAY', fmt(Number(storage.get(`bytefall-daily-${todayKey()}`)) || 0)],
      ['BEST // BLITZ', fmt(Number(storage.get('bytefall-best-blitz')) || 0)],
      ['BEST // ZEN', fmt(Number(storage.get('bytefall-best-zen')) || 0)],
    ];
    const dl = document.createElement('dl');
    dl.className = 'rec-stats';
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    }
    recordsBodyEl.appendChild(dl);
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

// Refreshes everything that can be locked, after progress or Full Access changes.
function applyUnlocks() {
  // Bonus exploits dim with their requirement and tracker until unlocked
  document.querySelectorAll('.hack-item[data-unlock]').forEach((el) => {
    const u = Progress.unlock(el.dataset.unlock);
    el.classList.toggle('locked', !hackAvailable(el.dataset.hack));
    el.querySelector('.lock-tag').textContent = `UNLOCK: ${u.need.toUpperCase()} (${Math.min(u.value(), u.goal)}/${u.goal})`;
  });
  const hardBtn = document.querySelector('.difficulty [data-difficulty="hard"]');
  const hardLocked = !Progress.isUnlocked('mode-hard');
  hardBtn.classList.toggle('locked', hardLocked);
  hardBtn.title = hardLocked ? `${Progress.unlock('mode-hard').need} to unlock` : '';
  Music.refreshUnlocks();
  applyTheme();
  renderPlaylist();
}
Unlocks.onChange(applyUnlocks);
applyUnlocks();

initGame();

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

fetch('https://api.github.com/repos/EmptyFishTank-JB/Blockchain-Arcade-Recreation/commits?sha=main&per_page=1')
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
