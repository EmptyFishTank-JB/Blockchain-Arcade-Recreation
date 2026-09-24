# Blockchain — Arcade Recreation

A browser recreation of **Blockchain**, the hacker-themed arcade cabinet game
from *Arcade Paradise*. Mechanically it's a Drop7-style number puzzle:

- Packets numbered 1-7 drop into a 7×7 grid, one stack (column) at a time.
- A packet disappears when the width or height of the unbroken stack it sits
  in matches its number (e.g. a `[5]` clears when it's part of an unbroken
  run of exactly 5 filled cells in its row or column).
- Clears chain: packets above collapse into the gap and may trigger more
  clears. Chains multiply your score.
- Every 8 drops a row of firewalls (`[=]`) rises from the bottom. Clearing an
  adjacent packet breaks a firewall down to `[-]`, and a second hit reveals
  its number.
- Stacks can spill into an overflow row above the `=======` line. Clears
  still resolve there (a lone `[1]` clears itself), but anything left above
  the line afterwards ends the run.

## Hacks

A 5x combo unlocks a random hack into your hack slot (a combo while the slot is
full is worth +500 instead). Press **USE** or `H` to run it:

| Hack | Effect |
|---|---|
| Worm Virus | Destroys an entire stack — pick the column |
| Stack Overflow | Adds 1 to every packet; 7s become level 2 firewalls |
| Trojan | Destroys a packet and everything around it — pick the packet |
| RNG | Randomizes every packet's value |
| Bitflip | Flips every stack upside down |

## Playing

Open `index.html` in a browser. Click a column, or press `1`-`7`, to drop the
next packet shown in the HUD. `H` uses a hack, `Esc` cancels targeting.

## Files

- `index.html` — page structure, HUD, rules and hacks panels
- `style.css` — terminal/hacker visual theme
- `script.js` — game state, rendering, chain resolution and hacks
- `sfx.js` — synthesized sound effects ported from the ECHOES terminal audio
  compendium; toggle with the SOUND button
- `music.js` — an original synthwave loop synthesized live with Web Audio;
  starts on your first click or key press, toggle with the MUSIC button
