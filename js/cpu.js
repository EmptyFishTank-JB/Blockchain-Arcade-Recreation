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
    insane: { label: 'INSANE', delay: 800, blunder: 0, lookahead: true },
  };
  // The bots: how each one weighs points against a risky board, extra blunders, and its speed
  // (a multiple of the level's delay; GLITCH's jumps around each move)
  const BOTS = {
    bot: { label: 'BOT', pointsW: 1.5, riskW: 1, blunder: 0, speed: 1 },
    grifter: { label: 'GRIFTER', pointsW: 3, riskW: 0.55, blunder: 0, speed: 1 },
    bunker: { label: 'BUNKER', pointsW: 0.8, riskW: 1.8, blunder: 0, speed: 1.15 },
    glitch: { label: 'GLITCH', pointsW: 1.5, riskW: 1, blunder: 0.08, speed: 0.8, erratic: true },
  };

  const clone = (columns) => columns.map((col) => col.map((cell) => cell && { ...cell }));

  function runLength(grid, row, col, dRow, dCol) {
    let count = 1;
    for (let r = row + dRow, c = col + dCol; r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS && grid[r][c]; r += dRow, c += dCol) count++;
    for (let r = row - dRow, c = col - dCol; r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS && grid[r][c]; r -= dRow, c -= dCol) count++;
    return count;
  }

  // Resolves every chain on `columns` (changed in place). reveal() picks a bit for a layer
  // peeled open. record(frame), if given, gets each step for the preview to play back: the
  // bits decrypting ({ pops }), then the board after ({ peeled }). Returns { points, chain, bits }.
  function resolve(columns, reveal, record) {
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
      if (record) record({ pops, chain });
      const peeled = [];
      for (const [r, c] of pops) {
        for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
          if (nr < 0 || nr >= MAX_ROWS || nc < 0 || nc >= COLS) continue;
          const n = columns[nc][nr];
          if (n && n.type === 'firewall') {
            n.level--;
            if (n.level <= 0) columns[nc][nr] = { type: 'number', val: reveal() };
            peeled.push([nr, nc]);
          }
        }
      }
      for (const [r, c] of pops) columns[c][r] = null;
      if (record) record({ gone: pops, peeled }); // the peels, with the decrypted bits gone
      for (let c = 0; c < COLS; c++) columns[c] = columns[c].filter(Boolean);
      if (record) record({ settled: true }); // everything fallen into place
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
  // exploits: the EXPLOITS setting. The CPU earns one with a chain of 3 or more and uses it when
  // it pays off: WORM VIRUS wipes its tallest column, DICTIONARY ATTACK peels every layer by one.
  function create(levelId, rnd, bits, layerEvery = 0, botId = 'bot', exploits = false) {
    let drops = 0;
    const level = LEVELS[levelId] || LEVELS.normal;
    const bot = BOTS[botId] || BOTS.bot;
    const rollDelay = () => level.delay * bot.speed * (bot.erratic ? 0.55 + rnd() * 0.9 : 1);
    let nextDelay = rollDelay();
    let held = null; // an exploit waiting to be used
    let used = null; // the one used on the last move (for script.js to announce)
    let columns = Array.from({ length: COLS }, () => []);
    let current = bits();
    let upcoming = bits();
    let score = 0;
    let dead = false;
    const reveal = () => 1 + Math.floor(rnd() * COLS);
    // What the preview plays back (script.js takes it after each move): board snapshots, each
    // with what's happening in it
    let frames = [];
    const record = (info) => frames.push({ columns: clone(columns), ...info });

    function chooseColumn() {
      const options = tryAll(columns, current);
      if (!options.length) return Math.floor(rnd() * COLS);
      if (rnd() < level.blunder + bot.blunder) return options[Math.floor(rnd() * options.length)].col;
      let best = options[0];
      let bestScore = -Infinity;
      for (const o of options) {
        let value = o.points * bot.pointsW - risk(o.next) * bot.riskW;
        if (level.lookahead) {
          const follow = tryAll(o.next, upcoming);
          value += follow.length ? Math.max(...follow.map((f) => f.points * bot.pointsW / 1.5 - risk(f.next) * 0.5 * bot.riskW)) * 0.6 : -500;
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
      bot: botId,
      // ms until its next move (GLITCH's lurches between 55% and 145% of it, move to move)
      get delay() { return nextDelay; },
      // Drops until its next layer row
      layerIn: () => (layerEvery ? layerEvery - (drops % layerEvery) : 0),
      columns: () => columns,
      score: () => score,
      isDead: () => dead,
      // One CPU move: returns the points it scored (0 if it didn't decrypt anything)
      // The preview's frames since the last call
      takeFrames() {
        const out = frames;
        frames = [];
        return out;
      },
      held: () => held,
      used: () => used,
      step() {
        if (dead) return 0;
        used = null;
        // An exploit when it pays off: the worm once a column is getting tall, the dictionary
        // once there are layers to peel
        if (held) {
          const tallest = Math.max(...columns.map((c) => c.length));
          const layers = columns.reduce((n, c) => n + c.filter((b) => b && b.type === 'firewall').length, 0);
          if (held === 'worm-virus' && tallest >= ROWS - 2) {
            const c = columns.findIndex((col) => col.length === tallest);
            record({ pops: columns[c].map((_, r) => [r, c]) });
            columns[c] = [];
            record({ settled: true });
            used = held;
          } else if (held === 'dictionary-attack' && layers >= 4) {
            const peeled = [];
            columns.forEach((col, c) => col.forEach((b, r) => {
              if (!b || b.type !== 'firewall') return;
              b.level--;
              if (b.level <= 0) col[r] = { type: 'number', val: reveal() };
              peeled.push([r, c]);
            }));
            record({ peeled });
            score += resolve(columns, reveal, record).points;
            used = held;
          }
          if (used) held = null;
        }
        const col = chooseColumn();
        nextDelay = rollDelay();
        record({ fall: { col, row: columns[col].length, val: current } });
        columns[col].push({ type: 'number', val: current });
        record({ landed: [[columns[col].length - 1, col]] });
        const first = resolve(columns, reveal, record);
        let { points } = first;
        if (exploits && !held && first.chain >= 3) held = rnd() < 0.5 ? 'worm-virus' : 'dictionary-attack';
        drops++;
        if (layerEvery && drops % layerEvery === 0 && !overflowed(columns)) {
          // A row of two-peel layers rises under every column
          for (const col of columns) col.unshift({ type: 'firewall', level: 2 });
          record({ rose: true });
          points += resolve(columns, reveal, record).points;
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
        const landed = [];
        for (let k = 0; k < count; k++) {
          const open = columns.map((col, c) => (col.length < MAX_ROWS ? c : -1)).filter((c) => c >= 0);
          if (!open.length) break;
          const c = open[Math.floor(rnd() * open.length)];
          columns[c].push({ type: 'firewall', level: 1 });
          landed.push([columns[c].length - 1, c]);
        }
        record({ landed, garbage: true });
        const { points } = resolve(columns, reveal, record);
        score += points;
        if (overflowed(columns)) dead = true;
        return points;
      },
    };
  }

  return { create, LEVELS, BOTS, COLS, ROWS, MAX_ROWS };
})();
