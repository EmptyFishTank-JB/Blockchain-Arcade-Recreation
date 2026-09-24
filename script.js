// BLOCKCHAIN — fan recreation of the arcade minigame from Arcade Paradise.
// Core mechanic is a Drop7-style puzzle: discs 1-7 fall into a 7-wide grid
// and a numbered disc pops when it sits in an unbroken row/column run whose
// length equals its number. Popping can crack/convert blank "packet" discs
// that get injected periodically ("pulses"), and chains award combo bonuses.

const COLS = 7;
const ROWS = 7;
const PULSE_INTERVAL = 5; // drops between blank-row injections
const STEP_MS = 35; // per-row fall speed

let columns = []; // columns[c] = array of cells, index 0 = bottom
let score = 0;
let dropsSinceLastPulse = 0;
let currentDisc = null;
let gameOver = false;
let busy = false; // true while resolving chains, blocks input

const boardEl = document.getElementById('board');
const columnButtonsEl = document.getElementById('column-buttons');
const scoreEl = document.getElementById('score');
const chainEl = document.getElementById('chain');
const nextDiscEl = document.getElementById('next-disc');
const pulseCounterEl = document.getElementById('pulse-counter');
const messageEl = document.getElementById('message');
const overlayEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newNumberDisc() {
  return { type: 'number', val: 1 + Math.floor(Math.random() * 7) };
}

function newBlankDisc() {
  return { type: 'blank', cracks: 0 };
}

function initGame() {
  columns = Array.from({ length: COLS }, () => []);
  score = 0;
  dropsSinceLastPulse = 0;
  gameOver = false;
  busy = false;
  currentDisc = newNumberDisc();
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
    btn.disabled = gameOver || busy || columns[c].length >= ROWS;
  });
}

function buildGrid() {
  // grid[row][col], row 0 = bottom, ROWS-1 = top
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
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
  // Display top row first (visual row 0) down to bottom (visual row ROWS-1)
  for (let visualRow = 0; visualRow < ROWS; visualRow++) {
    const r = ROWS - 1 - visualRow;
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      const div = document.createElement('div');
      div.className = 'cell';
      if (cell) {
        if (cell.type === 'number') {
          div.classList.add('disc');
          div.textContent = `[${cell.val}]`;
        } else {
          div.classList.add('blank');
          if (cell.cracks > 0) div.classList.add('cracked');
          div.textContent = cell.cracks > 0 ? '[-]' : '[=]';
        }
      }
      if (popped.some((p) => p.row === r && p.col === c)) {
        div.classList.add('pop');
      }
      boardEl.appendChild(div);
    }
  }
  updateColumnButtons();
}

function updateHud() {
  scoreEl.textContent = score;
  nextDiscEl.textContent = currentDisc ? `[${currentDisc.val}]` : '[?]';
  pulseCounterEl.textContent = PULSE_INTERVAL - dropsSinceLastPulse;
}

function setMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.toggle('hidden', !text);
}

async function attemptDrop(col) {
  if (gameOver || busy) return;
  if (columns[col].length >= ROWS) {
    SFX.play('denied');
    return;
  }

  busy = true;
  chainEl.textContent = '0x';
  const landing = columns[col].length;
  for (let r = ROWS - 1; r > landing; r--) {
    render([], { row: r, col, cell: currentDisc });
    SFX.play('click');
    await sleep(STEP_MS);
  }
  columns[col].push(currentDisc);
  render();
  SFX.play('enter');
  await sleep(60);

  await resolveChains();

  dropsSinceLastPulse++;
  if (dropsSinceLastPulse >= PULSE_INTERVAL) {
    dropsSinceLastPulse = 0;
    await injectPulse();
    if (gameOver) return;
    await resolveChains();
  }

  currentDisc = newNumberDisc();
  updateHud();
  busy = false;
  render();

  if (columns.every((c) => c.length >= ROWS)) {
    endGame();
  }
}

async function injectPulse() {
  setMessage('PULSE // INCOMING PACKET ROW');
  SFX.play('alert');
  await sleep(250);
  for (let c = 0; c < COLS; c++) {
    if (columns[c].length >= ROWS) {
      endGame();
      return;
    }
    columns[c].unshift(newBlankDisc());
    if (columns[c].length > ROWS) {
      endGame();
      return;
    }
  }
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
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c]) {
    count++;
    r += dRow;
    c += dCol;
  }
  r = row - dRow;
  c = col - dCol;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c]) {
    count++;
    r -= dRow;
    c -= dCol;
  }
  return count;
}

async function resolveChains() {
  let chain = 0;

  while (true) {
    const grid = buildGrid();
    const pops = [];

    for (let r = 0; r < ROWS; r++) {
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

    if (chain === 5) {
      score += 500;
      setMessage('CHAIN BREAK! +500 BONUS');
    }

    render(pops);
    updateHud();
    SFX.play('pop');
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
        if (n.row < 0 || n.row >= ROWS || n.col < 0 || n.col >= COLS) continue;
        const neighborCell = columns[n.col][n.row];
        if (neighborCell && neighborCell.type === 'blank') {
          neighborCell.cracks++;
          cracked = true;
          if (neighborCell.cracks >= 2) {
            columns[n.col][n.row] = newNumberDisc();
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
    if (chain < 5) setMessage('');
  }
}

function endGame() {
  gameOver = true;
  busy = true;
  SFX.play('denied');
  render();
  finalScoreEl.textContent = score;
  overlayEl.classList.remove('hidden');
}

document.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 7) {
    attemptDrop(num - 1);
  }
});

function restart() {
  SFX.play('static');
  initGame();
}

document.getElementById('restart-btn').addEventListener('click', restart);
document.getElementById('overlay-restart-btn').addEventListener('click', restart);

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
