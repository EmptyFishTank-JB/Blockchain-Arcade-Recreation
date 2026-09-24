// BLOCKCHAIN — fan recreation of the arcade minigame from Arcade Paradise.
// Core mechanic is a Drop7-style puzzle: packets 1-N fall into an N-wide grid
// and a packet clears when it sits in an unbroken row/column run whose length
// equals its number. Clears break down adjacent firewalls, which rise in rows
// every few drops, and a 5x combo unlocks a hack that is dropped like a packet.
// Easy and Normal play 7x7; Hard plays a full byte, 8x8 with packets up to 8.

// Grid size comes from the difficulty and is set by initGame().
let COLS = 7;
let ROWS = 7;
let MAX_ROWS = ROWS + 1; // top row holds overflow; anything left there after clears ends the run
const STEP_MS = 35; // per-row fall speed
const HACK_COMBO = 5;

const BASE_INTERVAL = 8; // drops between firewall rows
const HARD_MIN_INTERVAL = 4;
const HARD_POINTS_PER_STEP = 500; // hard mode loses one drop per this many points
const BYTE_BITS = 8; // Hard: every 8 packets cleared by one drop is a byte...
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

// easyCombo: on Easy, the chain length that unlocks each hack (stronger hacks need longer chains)
const HACKS = {
  worm: { name: 'WORM VIRUS', icon: '§', easyCombo: 5 },
  overflow: { name: 'STACK OVERFLOW', icon: '+', easyCombo: 4 },
  trojan: { name: 'TROJAN', icon: '◈', easyCombo: 4 },
  rng: { name: 'RNG', icon: '?', easyCombo: 3 },
  bitflip: { name: 'BITFLIP', icon: '↕', easyCombo: 3 },
};

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

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  },
};

let difficulty = DIFFICULTIES[storage.get('blockchain-difficulty')] ? storage.get('blockchain-difficulty') : 'normal';

const boardEl = document.getElementById('board');
const boardWrapEl = document.querySelector('.board-wrap');
const columnButtonsEl = document.getElementById('column-buttons');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const chainEl = document.getElementById('chain');
const currentEl = document.getElementById('current-piece');
const nextEl = document.getElementById('next-piece');
const nextStatEl = document.getElementById('next-stat');
const pulseCounterEl = document.getElementById('pulse-counter');
const messageEl = document.getElementById('message');
const overlayEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const newBestEl = document.getElementById('new-best');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newPacket() {
  return { type: 'number', val: 1 + Math.floor(Math.random() * COLS) };
}

function newFirewall(level = 2) {
  return { type: 'firewall', level };
}

// Hard moved to 8x8, so it keeps a fresh best apart from old 7x7 Hard scores.
function bestKey() {
  return difficulty === 'hard' ? 'blockchain-best-hard-8x8' : `blockchain-best-${difficulty}`;
}

function refillQueue() {
  while (queue.length < 2) queue.push(newPacket());
}

function initGame() {
  runId++;
  COLS = ROWS = DIFFICULTIES[difficulty].size;
  MAX_ROWS = ROWS + 1;
  boardWrapEl.style.setProperty('--cols', COLS);
  boardWrapEl.classList.toggle('byte-grid', COLS === 8);
  boardEl.classList.remove('meltdown');
  columns = Array.from({ length: COLS }, () => []);
  queue = [];
  refillQueue();
  score = 0;
  best = Number(storage.get(bestKey())) || 0;
  bestAtStart = best;
  dropsSinceLastPulse = 0;
  pulseInterval = DIFFICULTIES[difficulty].interval(0);
  gameOver = false;
  busy = false;
  chainEl.textContent = '0x';
  nextStatEl.hidden = !DIFFICULTIES[difficulty].showNext;
  document.querySelectorAll('.difficulty button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
  });
  const easy = difficulty === 'easy';
  document.getElementById('hack-intro').textContent = easy
    ? 'Chain combos unlock hacks: the longer the chain, the stronger the hack.'
    : `Get a combo of ${HACK_COMBO} to unlock a random hack.`;
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

function pieceLabel(piece) {
  return piece.type === 'hack' ? `[${HACKS[piece.id].icon}]` : `[${piece.val}]`;
}

function showPiece(el, piece) {
  el.textContent = pieceLabel(piece);
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
          div.textContent = `[${cell.val}]`;
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
  showPiece(currentEl, queue[0]);
  showPiece(nextEl, queue[1]);
  pulseCounterEl.textContent = pulseInterval - dropsSinceLastPulse;
  pulseCounterEl.closest('.stat').classList.toggle('danger', !gameOver && pulseInterval - dropsSinceLastPulse === 1);
  const heldHack = queue[0].type === 'hack' ? queue[0].id : null;
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
  if (gameOver || busy) return;
  if (columns[col].length >= MAX_ROWS) {
    SFX.play('denied');
    return;
  }

  busy = true;
  chainEl.textContent = '0x';
  setMessage('');
  const piece = queue.shift();
  refillQueue();
  updateHud();
  const landing = columns[col].length;
  for (let r = MAX_ROWS - 1; r > landing; r--) {
    render([], { row: r, col, cell: piece });
    SFX.play('click');
    await sleep(STEP_MS);
  }
  columns[col].push(piece);
  render();
  SFX.play('enter');
  await sleep(60);

  if (piece.type === 'hack') await runHack(piece.id, landing, col);
  await resolveChains();

  if (!overflowed()) {
    dropsSinceLastPulse++;
    if (dropsSinceLastPulse >= pulseInterval) {
      dropsSinceLastPulse = 0;
      await injectPulse();
      await resolveChains();
      pulseInterval = DIFFICULTIES[difficulty].interval(score);
    }
  }

  finishTurn();
}

function finishTurn() {
  updateHud();
  busy = false;
  render();
  if (overflowed()) endGame();
  // One drop until a firewall row: warn until the player drops (unless a hack message is showing)
  else if (pulseInterval - dropsSinceLastPulse === 1 && messageEl.classList.contains('hidden')) {
    setMessage('FIREWALL // INCOMING NEXT DROP', 'warn');
  }
}

function overflowed() {
  return columns.some((c) => c.length > ROWS);
}

async function injectPulse() {
  setMessage('FIREWALL // INCOMING ROW', 'alarm');
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
  let ids = Object.keys(HACKS);
  if (difficulty === 'easy') {
    const earned = ids.filter((id) => HACKS[id].easyCombo <= chain);
    if (!earned.length) return null;
    const tier = Math.max(...earned.map((id) => HACKS[id].easyCombo));
    ids = earned.filter((id) => HACKS[id].easyCombo === tier);
  } else if (chain < HACK_COMBO) {
    return null;
  }
  return ids[Math.floor(Math.random() * ids.length)];
}

// Hard: 8 packets (bits) cleared by one drop make a byte.
async function awardBytes(bytes) {
  score += bytes * BYTE_BONUS;
  updateHud();
  setMessage(`${bytes > 1 ? `${bytes} BYTES` : 'BYTE'} CLEARED // +${bytes * BYTE_BONUS}`, 'byte');
  SFX.play('egg');
  await sleep(900);
  burstMessage('number');
  setMessage('');
  await sleep(150);
}

function awardHack(id) {
  queue.unshift({ type: 'hack', id });
  setMessage(`HACK UNLOCKED // ${HACKS[id].name}`);
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
          cracked = true;
          if (neighborCell.level <= 0) {
            columns[n.col][n.row] = newPacket();
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
    const hack = hackForChain(chain);
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
// then CONNECTION LOST appears (~1.2s in total).
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

function endGame() {
  gameOver = true;
  busy = true;
  SFX.play('denied');
  render();
  Music.setIntensity(0);
  setMessage('');
  finalScoreEl.textContent = score;
  newBestEl.hidden = !(score > bestAtStart);

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
  const fresh = score === 0 && columns.every((col) => col.length === 0);
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
    if (next === difficulty) return;
    requestReset(btn, 'CONFIRM?', () => {
      difficulty = next;
      storage.set('blockchain-difficulty', next);
    });
  });
});

document.getElementById('overlay-restart-btn').addEventListener('click', restart);

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

const PLAYLIST_SLOTS = 3; // unmade tracks show as COMING SOON
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
    if (track) {
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
