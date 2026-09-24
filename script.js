// BLOCKCHAIN — fan recreation of the arcade minigame from Arcade Paradise.
// Core mechanic is a Drop7-style puzzle: packets 1-7 fall into a 7-wide grid
// and a packet clears when it sits in an unbroken row/column run whose length
// equals its number. Clears break down adjacent firewalls, which rise in rows
// every few drops, and a 5x combo unlocks a hack that is dropped like a packet.

const COLS = 7;
const ROWS = 7;
const MAX_ROWS = ROWS + 1; // top row holds overflow; anything left there after clears ends the run
const STEP_MS = 35; // per-row fall speed
const HACK_COMBO = 5;

const BASE_INTERVAL = 8; // drops between firewall rows
const HARD_MIN_INTERVAL = 4;
const HARD_POINTS_PER_STEP = 500; // hard mode loses one drop per this many points

const DIFFICULTIES = {
  easy: { label: 'EASY', showNext: true, interval: () => BASE_INTERVAL },
  normal: { label: 'NORMAL', showNext: false, interval: () => BASE_INTERVAL },
  hard: {
    label: 'HARD',
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
  return { type: 'number', val: 1 + Math.floor(Math.random() * 7) };
}

function newFirewall(level = 2) {
  return { type: 'firewall', level };
}

function bestKey() {
  return `blockchain-best-${difficulty}`;
}

function refillQueue() {
  while (queue.length < 2) queue.push(newPacket());
}

function initGame() {
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
      line.className = 'overflow-line';
      line.textContent = '='.repeat(80);
      boardEl.appendChild(line);
    }
  }
  updateColumnButtons();
  Music.setIntensity(dangerLevel());
}

// 0 until the tallest stack reaches 5, full at 7 (the last row under the line).
function dangerLevel() {
  const tallest = Math.max(...columns.map((c) => c.length));
  return (tallest - 4) / 3;
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
  const heldHack = queue[0].type === 'hack' ? queue[0].id : null;
  document.querySelectorAll('.hack-item').forEach((el) => {
    el.classList.toggle('held', el.dataset.hack === heldHack);
  });
}

function setMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.toggle('hidden', !text);
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
}

function overflowed() {
  return columns.some((c) => c.length > ROWS);
}

async function injectPulse() {
  setMessage('FIREWALL // INCOMING ROW');
  SFX.play('alert');
  await sleep(250);
  for (const col of columns) col.unshift(newFirewall());
  render();
  await sleep(200);
  setMessage('');
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

function awardHack(id) {
  queue.unshift({ type: 'hack', id });
  setMessage(`HACK UNLOCKED // ${HACKS[id].name}`);
  SFX.play('egg');
  updateHud();
}

async function resolveChains() {
  let chain = 0;

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
          stack[r] = cell.val === 7 ? newFirewall(2) : { type: 'number', val: cell.val + 1 };
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

function endGame() {
  gameOver = true;
  busy = true;
  SFX.play('denied');
  render();
  Music.setIntensity(0);
  finalScoreEl.textContent = score;
  newBestEl.hidden = !(score > bestAtStart);
  overlayEl.classList.remove('hidden');
}

document.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 7) attemptDrop(num - 1);
});

// Ignored mid-animation: the in-flight drop would keep mutating the fresh board.
function restart() {
  if (busy && !gameOver) return;
  SFX.play('static');
  initGame();
}

function setDifficulty(next) {
  if (next === difficulty || (busy && !gameOver)) return;
  difficulty = next;
  storage.set('blockchain-difficulty', next);
  restart();
}

document.getElementById('restart-btn').addEventListener('click', restart);
document.getElementById('overlay-restart-btn').addEventListener('click', restart);
document.querySelectorAll('.difficulty button').forEach((btn) => {
  btn.addEventListener('click', () => setDifficulty(btn.dataset.difficulty));
});

const soundBtn = document.getElementById('sound-btn');
function updateSoundBtn() {
  soundBtn.textContent = SFX.isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
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
}
musicBtn.addEventListener('click', () => {
  Music.toggle();
  updateMusicBtn();
  renderPlaylist();
});
updateMusicBtn();

const PLAYLIST_SLOTS = 3; // unmade tracks show as COMING SOON
const playlistBtn = document.getElementById('playlist-btn');
const playlistEl = document.getElementById('playlist');
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

// Retro LED spectrum under the playlist title: log-spaced bars built from
// short segments, with peak caps that fall back slowly.
const vizCanvas = document.getElementById('playlist-viz');
const vizCtx = vizCanvas.getContext('2d');
const VIZ_BARS = 28;
const VIZ_SEGMENT = 3; // css px per LED segment, plus a 1px gap
const vizPeaks = new Float32Array(VIZ_BARS);

function drawVisualizer() {
  const dpr = window.devicePixelRatio || 1;
  const w = vizCanvas.clientWidth;
  const h = vizCanvas.clientHeight;
  if (vizCanvas.width !== Math.round(w * dpr) || vizCanvas.height !== Math.round(h * dpr)) {
    vizCanvas.width = Math.round(w * dpr);
    vizCanvas.height = Math.round(h * dpr);
  }
  vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vizCtx.clearRect(0, 0, w, h);

  const spec = Music.spectrum();
  const segments = Math.floor((h + 1) / (VIZ_SEGMENT + 1));
  const gap = 2;
  const barW = (w - gap * (VIZ_BARS - 1)) / VIZ_BARS;
  for (let b = 0; b < VIZ_BARS; b++) {
    let level = 0;
    if (spec) {
      // 40Hz–14kHz, log-spaced so the kick and bass get their own bars
      const lo = 40 * Math.pow(14000 / 40, b / VIZ_BARS);
      const hi = 40 * Math.pow(14000 / 40, (b + 1) / VIZ_BARS);
      const from = Math.max(1, Math.floor(lo / spec.hzPerBin));
      const to = Math.max(from + 1, Math.ceil(hi / spec.hzPerBin));
      let peak = 0;
      for (let i = from; i < to && i < spec.data.length; i++) peak = Math.max(peak, spec.data[i]);
      level = Math.min(1, (peak / 255) * (1 + 0.7 * (b / VIZ_BARS))); // lift the quieter treble end
    }
    vizPeaks[b] = Math.max(level, vizPeaks[b] - 0.025);
    const lit = Math.round(level * segments);
    const cap = Math.min(segments - 1, Math.round(vizPeaks[b] * segments));
    const x = b * (barW + gap);
    for (let seg = 0; seg < segments; seg++) {
      const y = h - (seg + 1) * (VIZ_SEGMENT + 1) + 1;
      if (seg < lit) {
        const hot = seg / segments;
        vizCtx.fillStyle = hot > 0.8 ? 'rgba(255, 209, 102, 0.9)' : `rgba(57, 255, 143, ${(0.55 + hot * 0.45).toFixed(2)})`;
      } else if (spec && seg === cap && cap > 0) {
        vizCtx.fillStyle = 'rgba(255, 209, 102, 0.75)';
      } else {
        vizCtx.fillStyle = 'rgba(57, 255, 143, 0.08)';
      }
      vizCtx.fillRect(x, y, barW, VIZ_SEGMENT);
    }
  }
}

function visualizerLoop() {
  if (playlistEl.hidden) return;
  drawVisualizer();
  requestAnimationFrame(visualizerLoop);
}

function setPlaylistOpen(open) {
  playlistEl.hidden = !open;
  playlistBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    renderPlaylist();
    requestAnimationFrame(visualizerLoop);
  }
}

playlistBtn.addEventListener('click', () => setPlaylistOpen(playlistEl.hidden));
document.addEventListener('pointerdown', (e) => {
  if (!playlistEl.hidden && !playlistEl.contains(e.target) && !playlistBtn.contains(e.target)) setPlaylistOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !playlistEl.hidden) setPlaylistOpen(false);
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
