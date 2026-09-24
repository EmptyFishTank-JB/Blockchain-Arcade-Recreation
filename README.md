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

On Normal and Hard, a 5x combo unlocks a random hack. On Easy, each hack has
its own combo, so shorter chains unlock the weaker ones. The hack becomes your
next drop; drop it into a column like a packet and it goes off where it lands:

| Hack | Easy combo | Effect |
|---|---|---|
| Worm Virus `[§]` | 5x | Destroys the entire stack it's dropped into |
| Stack Overflow `[+]` | 4x | Adds 1 to every packet; 7s become level 2 firewalls |
| Trojan `[◈]` | 4x | Destroys every packet around the spot where it lands |
| RNG `[?]` | 3x | Randomizes every packet's value |
| Bitflip `[↕]` | 3x | Flips every stack upside down |

A drop earns at most one hack, picked from the longest chain it set off.

## Difficulty

| Setting | Effect |
|---|---|
| Easy | Shows the next packet, and hacks unlock at 3x–5x depending on the hack |
| Normal | Firewall row every 8 drops |
| Hard | Firewall row every 8 drops, minus one per 500 points, down to every 4 |

High scores are saved in your browser, one per difficulty.

## Playing

Open `index.html` in a browser. Click a column, or press `1`-`7`, to drop the
current packet shown in the HUD.

## Files

`index.html` (and `dev-tools/audio.html`) load their CSS and JS with a `?v=N`
tag. Bump `N` on all of those links whenever any of those files change, so browsers don't pair a fresh page
with a cached older script (GitHub Pages lets browsers cache for 10 minutes).

- `index.html` — page structure, HUD, rules and hacks panels
- `style.css` — terminal/hacker visual theme
- `script.js` — game state, rendering, chain resolution and hacks
- `fx.js` — particle overlay: cleared cells dissolve into pixel fragments and
  drifting hex/binary glyphs (skipped under reduced motion)
- `viz.js` — the shared music visualizer (LED bars or auto-gained
  oscilloscope wave with a CRT trail) used by the playlist and the dev page;
  the chosen style is remembered for both
- `grid-bg.js` — the dim "defragmenting" micro-grid animated behind the board
  (static when the OS asks for reduced motion)
- `sfx.js` — synthesized sound effects, mostly ported from the ECHOES terminal
  audio compendium, plus a retro 8-bit "data burst" for clears; toggle with
  the SOUND button
- `music.js` — the music player: scheduler, playlist and intensity input.
  Music starts on your first click or key press (toggle with the MUSIC
  button) and intensifies as your tallest stack nears the red line (from
  height 4, full at 6). The speaker icon opens the playlist, which also has
  a small visualizer of the live music (click it to switch between LED bars
  and an oscilloscope wave) and the BACKGROUND PLAY toggle (keep playing or pause when you switch tabs or
  apps). New tracks go in the `TRACKS` list here, with their engine in a
  `music-*.js` file
- `music-theme.js` — track 01, BLOCKCHAIN THEME: an original synthwave loop
  (intro, melody 1, section B with melody 2, octave-doubled climax)
- `music-sleep-mode.js` — track 02, SLEEP MODE: original electronicore
  (music box, trance synths, chugging distorted guitars, double-kick) at
  150 BPM, built on the public-domain lullaby "Schlaf, Kindlein, schlaf".
- `music-brute-force.js` — track 03, BRUTE FORCE: original NES-style
  chiptune at 140 BPM (pulse-wave leads, stepped triangle bass, noise drums,
  arpeggiated chords; boot, level 1, level 2, boss duet).
- `music-deep-web.js` — track 04, DEEP WEB: original dark ambient techno at
  124 BPM (muffled kick, rolling bass, drone, modem bleeps; connect, tunnel,
  deep, surface).
- `music-zero-day.js` — track 05, ZERO DAY: original drum & bass at 172 BPM
  (two-step break, reese bass, saw pad; infiltrate, payload, exploit,
  escape).
  Each track lists its intensity layers (`LAYERS`) with the level each fades
  in at: hi-hats from 5% (stack 4), heavier drums/guitars from 40% (stack 5),
  the alarm layer from 72% (stack 6+); the brightening grows the whole way
- `dev-tools/audio.html` — the audio compendium, opened by the `</>` icon in
  the footer: every sound effect and track with a play button, where each is
  used in the game, a seekable progress line and a live intensity slider for
  each track, and a SOLO button per intensity layer to hear just what it adds
- `audio/` — offline WAV renders of the music for reference (not loaded by
  the game): `blockchain-theme-v1.wav` is the original 16-bar loop,
  `blockchain-theme-v2.wav` the current 32-bar version,
  `sleep-mode-v1.wav` track 02
