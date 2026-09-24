# ByteFall

A browser number puzzle about cracking encrypted data, inspired by
**Blockchain**, the hacker-themed arcade cabinet game in *Arcade Paradise*.
Mechanically it's a Drop7-style puzzle:

- Encrypted bits numbered 1-7 fall into a 7×7 terminal, one column at a time
  (Hard: 1-8 on an 8×8 grid, a full byte).
- A bit decrypts (clears) when its number matches the length of the unbroken
  line it sits in, across or down (e.g. a `[5]` decrypts when it's part of an
  unbroken run of exactly 5 filled cells in its row or column).
- Decrypts chain: bits above fall into the gap and may make new matches.
  Chains multiply your score.
- Every 8 drops a row of encryption layers (`[=]`) rises from the bottom.
  Decrypting a bit beside one peels it down to `[-]`, and a second peel
  reveals the bit underneath.
- Columns can spill into an overflow row above the `========` line. Decrypts
  still resolve there (a lone `[1]` decrypts itself), but anything left above
  the line afterwards completes the trace and ends the run.

## Exploits

On Normal and Hard, a 5x chain unlocks a random exploit. On Easy, each exploit
has its own chain length, so shorter chains unlock the weaker ones. The exploit
becomes your next drop; drop it into a column like a bit and it runs where it
lands:

| Exploit | Easy chain | Effect |
|---|---|---|
| Worm Virus `[§]` | 5x | Wipes out every block in the column it lands in |
| Buffer Overflow `[+]` | 4x | Adds 1 to every bit; the top number (7, or 8 on Hard) is re-encrypted under two layers |
| Trojan `[◈]` | 4x | Wipes out every block touching the spot where it lands |
| RNG `[?]` | 3x | Scrambles every bit to a random number |
| Bitflip `[↕]` | 3x | Turns every column upside down |
| Dictionary Attack `[#]` * | 4x | Every encryption layer on the board loses one level at once |
| Keylogger `[@]` * | 3x | Shows your next 3 bits for the next 10 drops |
| Backdoor `[_]` * | 4x | Deletes the entire bottom row, layers included; everything drops by one |
| Rainbow Table `[*]` * | 5x | Decrypts every bit showing the most common number on the board |

\* Bonus exploits, unlocked by playing (see below).

A drop earns at most one exploit, picked from the longest chain it set off.

## Modes

| Mode | What changes |
|---|---|
| CLASSIC | The main game, on EASY / NORMAL / HARD |
| DAILY | The Daily Decrypt: bits dealt from a seed of the UTC date, so everyone gets the same sequence that day (Normal rules). Keeps a best per day and a daily streak |
| BLITZ | Normal rules against a 2-minute clock that starts on your first drop (paused while the tab is hidden) |
| ZEN | Normal rules with no encryption layers and no clock |
| PUZZLE | 30 set boards (in `puzzles.js`): decrypt every block using exactly the bits given, in order. Solving one opens the next; ◀ ▶ move between them. No new layers rise and no exploits drop; puzzle layers hide a fixed bit |

Switching modes mid-run asks to confirm, like RESTART. Each mode keeps its
own best score.

## Difficulty

| Setting | Effect |
|---|---|
| Easy | Shows the next bit, and exploits unlock at 3x–5x depending on the exploit |
| Normal | New encryption layer every 8 drops |
| Hard | A full byte: 8×8 grid with bits 1-8; new layer every 8 drops, minus one per 500 points, down to every 4; BYTE bonus |

On Hard, every 8 bits a single drop decrypts, chains included, make a byte:
**BYTE DECRYPTED** adds a 256-point (2^8) bonus per byte.

High scores are saved in your browser, one per difficulty (Hard's started
fresh when it moved to 8×8).

## Unlocks, achievements and stats

Easy, Normal, tracks 01-02, the TERMINAL theme and the five standard
exploits are open from the start. Everything else is earned by playing:

| Unlock | Requirement |
|---|---|
| Hard mode | Score 1,500 on Normal |
| Tracks 03-10 | Decrypt 300 / 750 / 1,500 / 3,000 / 5,000 / 7,500 / 10,000 / 15,000 bits in total (07-10 are still to come) |
| CIPHER | Decrypt a BYTE on Hard |
| AMBER CRT | Play 25 sessions |
| MONOCHROME | Get a 6x chain |
| REDLINE | Last 100 drops in one Hard session |
| SYNTHWAVE | Score 5,000 in one session |
| Dictionary Attack | Peel 100 encryption layers |
| Keylogger | Run 20 exploits |
| Backdoor | Reveal 50 bits from under encryption layers |
| Rainbow Table | Decrypt 5,000 bits |
| DOT MATRIX | Decrypt 2,500 bits |
| DAYLIGHT | Play 50 sessions |
| GLYPH | Decrypt 100 of every number from 1 to 7 |
| SPECTRUM | Earn every other unlock |

The trophy icon (top-left of the terminal) opens **RECORDS**: every unlock
and all 25 achievements with progress trackers, plus lifetime stats. Newly
earned unlocks and achievements pop up as UNLOCKED // … and ACHIEVEMENT // ….
Locked items show their requirement where they appear (the Hard button, the
theme grid, the playlist and the exploit cards). Progress is saved in the
browser (`bytefall-progress`); players who already had a Hard score keep Hard.

`progress.js` holds the stats, the unlock list (`UNLOCKS`) and the
achievements (`ACHIEVEMENTS`); `script.js` reports each drop, decrypt,
peel, byte and exploit to it.

## Daily bonus, vibration and resetting

- **Daily bonus:** the first time the game opens each day (local date), one
  free exploit is banked behind the ⚡ FREE EXPLOIT button next to RESTART.
  Tapping it makes a random unlocked exploit your next drop. It doesn't stack
  if unused, and it's hidden in DAILY and PUZZLE so those stay equal for
  everyone.
- **Vibration:** on devices that support it (Android), drops, decrypts,
  exploits, new layers and game over give a short buzz. VIBRATION in
  settings turns it off; the option only appears where it works.
- **Reset progress:** at the bottom of RECORDS → STATS, with a two-press
  confirm. It clears stats, unlocks, achievements, puzzles and best scores;
  settings stay.

## Full Access

The Android app is planned as free with a banner ad, plus one purchase,
**Full Access**: no ads, and every unlock straight away. Nothing needs it;
everything can also be earned. `unlocks.js` holds that check (never owned on
the website; the app will set it from Google Play). Add `?unlockall` to the
URL to preview everything unlocked.

## Playing

Open `index.html` in a browser. Tap a numbered drop button (under the grid by
default), or press `1`-`7` (`1`-`8` on Hard), to drop the current bit shown in the HUD.

The gear/speaker icon in the corner opens the settings: sound and music on or
off, whether the drop buttons sit under or above the grid, the color theme
and the playlist.

Themes (picked from the swatch grid in settings):

| Theme | Bits | Layers | Cracks & exploits | Trace |
|---|---|---|---|---|
| TERMINAL (default) | green | grey | amber | red |
| CIPHER | cyan | magenta | yellow | orange-red |
| AMBER CRT | amber | grey | white | red |
| MONOCHROME | light grey | striped grey | white | white |
| REDLINE | red | steel blue | yellow | white |
| SYNTHWAVE | pink | purple | orange | cyan |
| DOT MATRIX | olive green | dark green | pale green | red |
| DAYLIGHT | dark green ink on paper | tan | dark amber | red |
| GLYPH | shapes on blueprint blue | slate | amber | red |
| SPECTRUM | each bit cycles the rainbow on its own | grey (still) | near-white (still) | cycles |

GLYPH draws each bit as a shape with one corner per point of its number (1 is
a teardrop pointing up, 2 a lens, 3 a triangle... 8 an octagon), with a small
number in the corner. SPECTRUM gives every bit its own random hue speed,
direction and phase, slowly hue-rotates the rest of the page, and turns the
background grid into dimmed rainbow blocks; it holds still under reduced motion.

Every color in `style.css` is a named role in `:root`; a theme is a
`[data-theme="…"]` block that overrides those values, plus an entry in
`THEMES` in `script.js` and in the small theme script in `index.html`'s
head. All but TERMINAL are unlocked by playing (see below).

RESTART and the difficulty buttons ask for a second press mid-run (CONFIRM
RESTART? / CONFIRM?, which cancels itself after a few seconds), then the
board melts down like a traced run before the new one starts. Once a run is
over, or before the first drop, they act straight away.

## Files

`index.html` (and `dev-tools/audio.html`) load their CSS and JS with a `?v=N`
tag. Bump `N` on all of those links whenever any of those files change, so browsers don't pair a fresh page
with a cached older script (GitHub Pages lets browsers cache for 10 minutes).

- `index.html` — page structure, HUD, rules and exploits panels
- `style.css` — terminal/hacker visual theme
- `script.js` — game state, rendering, chain resolution and exploits
- `unlocks.js` — the Full Access check (never owned on the website; `?unlockall` previews it)
- `progress.js` — lifetime stats, earnable unlocks and achievements
- `puzzles.js` — the PUZZLE boards, generated and verified by brute force (each has 1-2 solutions and can't be solved in fewer drops)
- `fx.js` — particle overlay: cleared cells dissolve into pixel fragments and
  drifting hex/binary glyphs (skipped under reduced motion)
- `viz.js` — the shared music visualizer (LED bars or auto-gained
  oscilloscope wave with a CRT trail) used by the playlist and the dev page;
  the chosen style is remembered for both
- `grid-bg.js` — the dim "defragmenting" micro-grid animated behind the board
  (static when the OS asks for reduced motion)
- `sfx.js` — synthesized sound effects, mostly ported from the ECHOES terminal
  audio compendium, plus a retro 8-bit "data burst" for clears; toggle with
  the SOUND button in settings
- `music.js` — the music player: scheduler, playlist and intensity input.
  Music starts on your first click or key press on track 01 (toggle with the
  MUSIC button in settings) and intensifies as your tallest stack nears the
  red line (from height 4, full at 6; one higher on Hard's 8×8). The settings panel holds the playlist,
  which also has
  a small visualizer of the live music (click it to switch between LED bars
  and an oscilloscope wave), a MODE button (REPEAT, or SEQUENCE / SHUFFLE,
  which play each track 4 times and then fade into the next), and the
  BACKGROUND PLAY toggle (keep playing or pause when you switch tabs or
  apps). New tracks go in the `TRACKS` list here, with their engine in a
  `music-*.js` file
- `music-theme.js` — track 01, BYTEFALL THEME: an original synthwave loop
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
- `music-system-restore.js` — track 06, SYSTEM RESTORE: original lo-fi at
  85 BPM (electric piano sevenths with tape warble, upright bass, swung
  drums, vinyl crackle, flute; standby, restore, recovery, reboot).
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
