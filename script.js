// BLOCKCHAIN — fan recreation of the arcade minigame from Arcade Paradise.
// Core mechanic is a Drop7-style puzzle: packets 1-7 fall into a 7-wide grid
// and a packet clears when it sits in an unbroken row/column run whose length
// equals its number. Clears break down adjacent firewalls, which rise in rows
// every few drops, and a 5x combo unlocks a one-shot hack.

const COLS = 7;
const ROWS = 7;
const MAX_ROWS = ROWS + 1; // top row holds overflow; anything left there after clears ends the run
const PULSE_INTERVAL = 8; // drops between firewall-row injections
const STEP_MS = 35; // per-row fall speed
const HACK_COMBO = 5;

const HACKS = {
  worm: { name: 'WORM VIRUS', icon: '§', target: 'column' },
  overflow: { name: 'STACK OVERFLOW', icon: '≡', target: null },
  trojan: { name: 'TROJAN', icon: '◈', target: 'cell' },
  rng: { name: 'RNG', icon: '?', target: null },
  bitflip: { name: 'BITFLIP', icon: '↕', target: null },
};

let columns = []; // columns[c] = array of cells, index 0 = bottom
let score = 0;
let dropsSinceLastPulse = 0;
let currentDisc = null;
let gameOver = false;
let busy = false; // true while animating/resolving, blocks input
let heldHack = null;
let targeting = null; // hack id awaiting a target

const boardEl = document.getElementById('board');
const columnButtonsEl = document.getElementById('column-buttons');
const scoreEl = document.getElementById('score');
const chainEl = document.getElementById('chain');
const nextDiscEl = document.getElementById('next-disc');
const pulseCounterEl = document.getElementById('pulse-counter');
const messageEl = document.getElementById('message');
const overlayEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const hackSlotEl = document.getElementById('hack-slot');
const hackNameEl = document.getElementById('hack-name');
const hackBtn = document.getElementById('hack-btn');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newPacket() {
  return { type: 'number', val: 1 + Math.floor(Math.random() * 7) };
}

function newFirewall(level = 2) {
  return { type: 'firewall', level };
}

function initGame() {
  columns = Array.from({ length: COLS }, () => []);
  score = 0;
  dropsSinceLastPulse = 0;
  gameOver = false;
  busy = false;
  heldHack = null;
  targeting = null;
  currentDisc = newPacket();
  chainEl.textContent = '0x';
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
    btn.addEventListener('click', () => onColumn(c));
    columnButtonsEl.appendChild(btn);
  }
}

function onColumn(col) {
  if (targeting === 'worm') {
    if (columns[col].length && !busy) runHack('worm', { col });
    return;
  }
  if (!targeting) attemptDrop(col);
}

function updateColumnButtons() {
  const buttons = columnButtonsEl.querySelectorAll('button');
  buttons.forEach((btn, c) => {
    let disabled = gameOver || busy;
    if (targeting === 'worm') disabled = disabled || columns[c].length === 0;
    else if (targeting) disabled = true;
    else disabled = disabled || columns[c].length >= MAX_ROWS;
    btn.disabled = disabled;
  });
}

function updateHackUi() {
  const hack = heldHack && HACKS[heldHack];
  hackSlotEl.classList.toggle('armed', !!hack);
  hackNameEl.textContent = hack ? `${hack.icon} ${hack.name}` : `— ${HACK_COMBO}x COMBO TO UNLOCK`;
  hackBtn.textContent = targeting ? 'CANCEL' : 'USE';
  hackBtn.disabled = !hack || busy || gameOver;
  document.querySelectorAll('.hack-item').forEach((el) => {
    el.classList.toggle('held', el.dataset.hack === heldHack);
  });
  boardEl.classList.toggle('targeting', !!targeting);
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
      div.dataset.row = r;
      div.dataset.col = c;
      if (r >= ROWS) div.classList.add('overflow');
      if (cell) {
        if (cell.type === 'number') {
          div.classList.add('disc');
          div.textContent = `[${cell.val}]`;
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
  updateHackUi();
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
  if (gameOver || busy || targeting) return;
  if (columns[col].length >= MAX_ROWS) {
    SFX.play('denied');
    return;
  }

  busy = true;
  chainEl.textContent = '0x';
  const landing = columns[col].length;
  for (let r = MAX_ROWS - 1; r > landing; r--) {
    render([], { row: r, col, cell: currentDisc });
    SFX.play('click');
    await sleep(STEP_MS);
  }
  columns[col].push(currentDisc);
  render();
  SFX.play('enter');
  await sleep(60);

  await resolveChains();

  if (!overflowed()) {
    dropsSinceLastPulse++;
    if (dropsSinceLastPulse >= PULSE_INTERVAL) {
      dropsSinceLastPulse = 0;
      await injectPulse();
      await resolveChains();
    }
  }

  currentDisc = newPacket();
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

function awardHack() {
  if (heldHack) {
    score += 500;
    setMessage('HACK SLOT FULL // +500');
  } else {
    const ids = Object.keys(HACKS);
    heldHack = ids[Math.floor(Math.random() * ids.length)];
    setMessage(`HACK UNLOCKED // ${HACKS[heldHack].name}`);
  }
  SFX.play('egg');
  updateHackUi();
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

    render(pops);
    updateHud();
    SFX.play('pop');
    if (chain >= 2) SFX.play('egg');
    if (chain === HACK_COMBO) awardHack();
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
    if (chain < HACK_COMBO) setMessage('');
  }
}

function activateHack() {
  if (!heldHack || busy || gameOver) return;
  if (targeting) {
    cancelTargeting();
    return;
  }
  const hack = HACKS[heldHack];
  if (!hack.target) {
    runHack(heldHack);
    return;
  }
  targeting = heldHack;
  setMessage(hack.target === 'column' ? 'WORM VIRUS // SELECT A STACK' : 'TROJAN // SELECT A PACKET');
  SFX.play('punct');
  render();
}

function cancelTargeting() {
  targeting = null;
  setMessage('');
  render();
}

function occupied(row, col) {
  return row >= 0 && row < MAX_ROWS && col >= 0 && col < COLS && !!columns[col][row];
}

async function runHack(id, target = {}) {
  busy = true;
  targeting = null;
  heldHack = null;
  chainEl.textContent = '0x';
  setMessage(`${HACKS[id].name} // EXECUTING`);
  SFX.play('static');

  if (id === 'worm' || id === 'trojan') {
    const hits = [];
    if (id === 'worm') {
      columns[target.col].forEach((_, row) => hits.push({ row, col: target.col }));
    } else {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const row = target.row + dr;
          const col = target.col + dc;
          if (occupied(row, col)) hits.push({ row, col });
        }
      }
    }
    render(hits);
    SFX.play('pop');
    await sleep(220);
    for (const h of hits) columns[h.col][h.row] = null;
    score += hits.length * 10;
    await collapse();
  } else {
    for (const col of columns) {
      if (id === 'bitflip') col.reverse();
      col.forEach((cell, row) => {
        if (cell.type !== 'number') return;
        if (id === 'overflow') {
          col[row] = cell.val === 7 ? newFirewall(2) : { type: 'number', val: cell.val + 1 };
        } else if (id === 'rng') {
          col[row] = newPacket();
        }
      });
    }
    render();
    SFX.play('enter');
    await sleep(300);
  }

  updateHud();
  setMessage('');
  await resolveChains();
  finishTurn();
}

boardEl.addEventListener('click', (e) => {
  const cellEl = e.target.closest('.cell');
  if (!cellEl || !targeting || busy) return;
  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  if (targeting === 'worm') onColumn(col);
  else if (targeting === 'trojan' && occupied(row, col)) runHack('trojan', { row, col });
});

function endGame() {
  gameOver = true;
  busy = true;
  targeting = null;
  SFX.play('denied');
  render();
  finalScoreEl.textContent = score;
  overlayEl.classList.remove('hidden');
}

document.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 7) {
    onColumn(num - 1);
  } else if (e.key === 'h' || e.key === 'H') {
    activateHack();
  } else if (e.key === 'Escape' && targeting) {
    cancelTargeting();
  }
});

function restart() {
  SFX.play('static');
  initGame();
}

document.getElementById('restart-btn').addEventListener('click', restart);
document.getElementById('overlay-restart-btn').addEventListener('click', restart);
hackBtn.addEventListener('click', activateHack);
document.getElementById('rules-pulse').textContent = PULSE_INTERVAL;
document.getElementById('hack-combo').textContent = HACK_COMBO;

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
