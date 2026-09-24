# Blockchain — Arcade Recreation

A browser recreation of **Blockchain**, the hacker-themed arcade cabinet game
from *Arcade Paradise*. Mechanically it's a Drop7-style number puzzle:

- Discs numbered 1-7 drop into a 7×7 grid, one column at a time.
- A disc pops when it sits inside an unbroken row or column run whose length
  equals its number (e.g. a `5` clears when it's part of an unbroken run of
  exactly 5 filled cells in its row or column).
- Popping can chain: discs above collapse into the gap and may trigger more
  pops. Chains multiply your score, and a 5x chain triggers a bonus.
- Every few drops a "pulse" pushes a row of blank packets into the bottom of
  the grid. Blanks don't pop on their own — an adjacent pop cracks them, and
  two cracks turn a blank into a live numbered disc.
- The run ends when the grid overflows (a column fills to the top).

## Playing

Open `index.html` in a browser. Click a column, or press number keys `1`-`7`,
to drop the next disc shown in the HUD.

## Files

- `index.html` — page structure and HUD
- `style.css` — terminal/hacker visual theme
- `script.js` — game state, rendering, and chain-resolution logic
