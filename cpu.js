// VS CPU: the computer opponent. A compact copy of the board rules from script.js (Normal,
// 7x7 plus the overflow row: a bit decrypts when its number matches the unbroken line it sits
// in, across or down; decrypts peel neighboring layers; chains multiply; 4 bits in one drop
// make a nibble), with no animation. The CPU picks a column for each bit by trying them all.
// Garbage (the encrypted blocks players send each other) drops onto the top of random columns.
const CpuBoard = (() => {
  const COLS = 7;
  const ROWS = 7;
  const MAX_ROWS = ROWS + 1;
  const NIBBLE_BITS = 4;
  const NIBBLE_BONUS = 16;

  // How each level plays: ms between drops, how often it drops somewhere random instead of
  // its best column, and whether it looks one bit ahead
  const LEVELS = {
    easy: { label: 'EASY', delay: 2600, blunder: 0.35, lookahead: false },
    normal: { label: 'NORMAL', delay: 1800, blunder: 0.12, lookahead: false },
    hard: { label: 'HARD', delay: 1150, blunder: 0, lookahead: true },
  };

  const clone = (columns) => columns.map((col) => col.map((cell) => ({ ...cell })));

  function runLength(grid, row, col, dRow, dCol) {
    let count = 1;
    for (let r = row + dRow, c = col + dCol; r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS && grid[r][c]; r += dRow, c += dCol) count++;
    for (let r = row - dRow, c = col - dCol; r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS && grid[r][c]; r -= dRow, c -= dCol) count++;
    return count;
  }

  // Resolves every chain on `columns` (changed in place). reveal() picks a bit for a layer
  // peeled open. Returns { points, chain, bits }.
  function resolve(columns, reveal) {
    let chain = 0;
    let points = 0;
    let bits = 0;
    for (;;) {
      const grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
      columns.forEach((col, c) => col.forEach((cell, r) => { grid[r][c] = cell; }));
      const pops = [];
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = grid[r][c];
          if (!cell || cell.type !== 'number') continue;
          if (cell.val === runLength(grid, r, c, 1, 0) || cell.val === runLength(grid, r, c, 0, 1)) pops.push([r, c]);
        }
      }
      if (!pops.length) break;
      chain++;
      bits += pops.length;
      points += pops.reduce((n, [r, c]) => n + 10 + grid[r][c].val, 0) * chain;
      for (const [r, c] of pops) {
        for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
          if (nr < 0 || nr >= MAX_ROWS || nc < 0 || nc >= COLS) continue;
          const n = columns[nc][nr];
          if (n && n.type === 'firewall') {
            n.level--;
            if (n.level <= 0) columns[nc][nr] = { type: 'number', val: reveal() };
          }
        }
      }
      for (const [r, c] of pops) columns[c][r] = null;
      for (let c = 0; c < COLS; c++) columns[c] = columns[c].filter(Boolean);
    }
    points += Math.floor(bits / NIBBLE_BITS) * NIBBLE_BONUS;
    return { points, chain, bits };
  }

  const overflowed = (columns) => columns.some((col) => col.length > ROWS);

  // How good a board is for the CPU: low and flat is safe
  function risk(columns) {
    let r = 0;
    for (const col of columns) r += col.length * col.length;
    const tallest = Math.max(...columns.map((col) => col.length));
    return r + (tallest >= ROWS - 1 ? 60 : 0);
  }

  // Tries each column for bit `val`; returns [{ col, points, next }] for the legal ones
  function tryAll(columns, val) {
    const out = [];
    for (let c = 0; c < COLS; c++) {
      if (columns[c].length >= MAX_ROWS) continue;
      const next = clone(columns);
      next[c].push({ type: 'number', val });
      const { points } = resolve(next, () => 4); // reveals are unknown: guess a middle bit
      if (overflowed(next)) continue;
      out.push({ col: c, points, next });
    }
    return out;
  }

  // Lives for one VS match. rnd: the CPU's random stream; bits(): its next bit; layerEvery:
  // drops between rising layer rows (0 for none), as on your board.
  function create(levelId, rnd, bits, layerEvery = 0) {
    let drops = 0;
    const level = LEVELS[levelId] || LEVELS.normal;
    let columns = Array.from({ length: COLS }, () => []);
    let current = bits();
    let upcoming = bits();
    let score = 0;
    let dead = false;
    const reveal = () => 1 + Math.floor(rnd() * COLS);

    function chooseColumn() {
      const options = tryAll(columns, current);
      if (!options.length) return Math.floor(rnd() * COLS);
      if (rnd() < level.blunder) return options[Math.floor(rnd() * options.length)].col;
      let best = options[0];
      let bestScore = -Infinity;
      for (const o of options) {
        let value = o.points * 1.5 - risk(o.next);
        if (level.lookahead) {
          const follow = tryAll(o.next, upcoming);
          value += follow.length ? Math.max(...follow.map((f) => f.points - risk(f.next) * 0.5)) * 0.6 : -500;
        }
        value += rnd() * 3; // break ties
        if (value > bestScore) {
          bestScore = value;
          best = o;
        }
      }
      return best.col;
    }

    return {
      level: levelId,
      delay: level.delay,
      // Drops until its next layer row
      layerIn: () => (layerEvery ? layerEvery - (drops % layerEvery) : 0),
      columns: () => columns,
      score: () => score,
      isDead: () => dead,
      // One CPU move: returns the points it scored (0 if it didn't decrypt anything)
      step() {
        if (dead) return 0;
        const col = chooseColumn();
        columns[col].push({ type: 'number', val: current });
        let { points } = resolve(columns, reveal);
        drops++;
        if (layerEvery && drops % layerEvery === 0 && !overflowed(columns)) {
          // A row of two-peel layers rises under every column
          for (const col of columns) col.unshift({ type: 'firewall', level: 2 });
          points += resolve(columns, reveal).points;
        }
        score += points;
        current = upcoming;
        upcoming = bits();
        if (overflowed(columns)) dead = true;
        return points;
      },
      // Garbage lands on top of random columns as one-peel layers hiding a random bit; then
      // the board settles (garbage can complete a line and set off a chain, which counts)
      takeGarbage(count) {
        if (dead || count <= 0) return 0;
        for (let k = 0; k < count; k++) {
          const open = columns.map((col, c) => (col.length < MAX_ROWS ? c : -1)).filter((c) => c >= 0);
          if (!open.length) break;
          columns[open[Math.floor(rnd() * open.length)]].push({ type: 'firewall', level: 1 });
        }
        const { points } = resolve(columns, reveal);
        score += points;
        if (overflowed(columns)) dead = true;
        return points;
      },
    };
  }

  return { create, LEVELS, COLS, ROWS, MAX_ROWS };
})();
