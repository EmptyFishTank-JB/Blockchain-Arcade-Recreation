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

A 5x combo unlocks a random hack, which becomes your next drop. Drop it into a
column like a packet and it goes off where it lands:

| Hack | Effect |
|---|---|
| Worm Virus `[§]` | Destroys the entire stack it's dropped into |
| Stack Overflow `[+]` | Adds 1 to every packet; 7s become level 2 firewalls |
| Trojan `[◈]` | Destroys every packet around the spot where it lands |
| RNG `[?]` | Randomizes every packet's value |
| Bitflip `[↕]` | Flips every stack upside down |

## Difficulty

| Setting | Effect |
|---|---|
| Easy | Shows the next packet as well as the current one |
| Normal | Firewall row every 8 drops |
| Hard | Firewall row every 8 drops, minus one per 500 points, down to every 4 |

High scores are saved in your browser, one per difficulty.

## Playing

Open `index.html` in a browser. Click a column, or press `1`-`7`, to drop the
current packet shown in the HUD.

## Files

`index.html` loads its CSS and JS with a `?v=N` tag. Bump `N` on all four
links whenever any of those files change, so browsers don't pair a fresh page
with a cached older script (GitHub Pages lets browsers cache for 10 minutes).

- `index.html` — page structure, HUD, rules and hacks panels
- `style.css` — terminal/hacker visual theme
- `script.js` — game state, rendering, chain resolution and hacks
- `sfx.js` — synthesized sound effects ported from the ECHOES terminal audio
  compendium; toggle with the SOUND button
- `music.js` — an original synthwave track synthesized live with Web Audio
  (32-bar loop: intro, melody 1, section B with melody 2, octave-doubled
  climax); starts on your first click or key press, toggle with the MUSIC
  button
- `audio/` — offline WAV renders of the music for reference (not loaded by
  the game): `blockchain-theme-v1.wav` is the original 16-bar loop,
  `blockchain-theme-v2.wav` the current 32-bar version
