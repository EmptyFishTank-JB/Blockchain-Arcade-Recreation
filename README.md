# ByteFall

A browser number puzzle about cracking encrypted data, inspired by
**Blockchain**, the hacker-themed arcade cabinet game in *Arcade Paradise*.

- **Play:** https://emptyfishtank-jb.github.io/ByteFall/
- **Studio:** Empty Fish Tank
- **Born:** September 23, 2026, 8:13 PM CST

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
| Bitflip `[↕]` (drawn as an arrow icon) | 3x | Turns every column upside down |
| Dictionary Attack `[#]` * | 4x | Every encryption layer on the board loses one level at once |
| Keylogger `[@]` * | 3x | Shows your next 3 bits for the next 10 drops |
| Backdoor `[_]` * | 4x | Deletes the entire bottom row, layers included; everything drops by one |
| Rainbow Table `[*]` * | 5x | Decrypts every bit showing the most common number on the board |
| Pivot `[⇆]` * | 3x | Swaps the column it lands in with a neighbor: pick the column, then tap ← or → (or press the arrow keys), with no backing out once picked; edge columns swap with their only neighbor |
| Packet Sniffer `[~]` * | 3x | For your next 3 bits, tap CURRENT (or press ↑ / ↓) to pick each one's number |
| Logic Bomb `[!]` * | 4x | Lands as a `[!3]` block counting down each drop; at zero it wipes out the 5×5 around it |
| Honeypot `[◎]` * | 4x | Lands as a trap; when a bit next to it decrypts, every bit of that number within 2 cells decrypts too |

Every exploit is unlocked by level and has to be equipped in a slot (see below).

A drop earns at most one exploit, picked from the longest chain it set off.

## Modes

| Mode | What changes |
|---|---|
| CLASSIC | The main game, on EASY / NORMAL / HARD |
| DAILY | The Daily Decrypt: a fixed stack of 40 bits dealt from a seed of the UTC date, so everyone gets the same bits (Normal rules, the five standard exploits). It ends when the stack runs out. Your first run each day is the official score; later runs are practice. SHARE on the results screen sends or copies your result. Keeps a daily streak |
| BLITZ | Normal rules against a 2-minute clock that starts on your first drop (paused while the tab is hidden) |
| ZEN | Normal rules with no encryption layers and no clock |
| PUZZLE | 30 set boards (in `puzzles.js`): decrypt every block using exactly the bits given, in order. Solving one opens the next; the arrow buttons move between them. No new layers rise and no exploits drop; puzzle layers hide a fixed bit |

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

## Levels, prestige and unlocks

**Levels.** Every bit you decrypt is XP: **100 bits (12.5 bytes) per level**,
Lv 1 to **Lv 80**. Lv 80's bar fills at 8,000 bits, so a full prestige is
exactly **1 kilobyte**. The level bar sits under the title; tapping it opens
RECORDS.

**Prestige.** With Lv 80 full, PRESTIGE (in RECORDS → UNLOCKS, two presses)
starts you again at Lv 1 with prestige +1. Exploits and slots lock again, but
prestige N keeps N slots (up to 6) and the first N exploits for good, and the
rest unlock sooner. Each prestige also permanently unlocks the next theme.

**Exploit slots (loadout).** Only exploits equipped in a slot are awarded.
Slots unlock at Lv 5, 15, 30, 45, 60 and 75 (6 at most). Exploits unlock by
level in this order: RNG (3), BITFLIP (8), BUFFER OVERFLOW (13), TROJAN (18),
PIVOT (23), WORM VIRUS (29), KEYLOGGER (35), PACKET SNIFFER (41), BACKDOOR
(47), LOGIC BOMB (53), HONEYPOT (59), DICTIONARY ATTACK (65), RAINBOW TABLE
(70); with a
prestige's kept exploits, the rest move down this list. A new unlock drops
into a free slot by itself; tap an exploit card to remove or equip it. The loadout
is locked during a session: change it before the first drop or after the game ends. The
Daily Decrypt always uses the five standard exploits, so it's the same for
everyone.

**Themes** unlock by prestige, for good: CIPHER (1), AMBER CRT (2), MONOCHROME
(3), REDLINE (4), SYNTHWAVE (5), DOT MATRIX (6), DAYLIGHT (7), GLYPH (8),
SPECTRUM (9).

**Permanent unlocks:** Hard mode (score 1,500 on Normal) and tracks 03-10
(300 / 750 / 1,500 / 3,000 / 5,000 / 7,500 / 10,000 / 15,000 bits decrypted in
total; 07-10 are still to come).

The trophy icon opens **RECORDS**: level and prestige, every unlock and
achievement with a progress tracker, and lifetime stats. New unlocks, level-ups
and achievements pop up as they happen. Progress is saved in the browser
(`bytefall-progress`).

`progress.js` holds the stats, levels, unlocks and achievements; `script.js`
reports each drop, decrypt, peel, byte, exploit and point to it.

**Dev switches.** The `</>` dev page has UNLOCK EVERYTHING (like owning Full
Access, for this browser; the game shows a DEV badge while it's on), JUMP TO
LV 80 and +10 LEVELS for testing prestige, slots and exploit unlocks. With UNLOCK EVERYTHING on,
press and hold any exploit card for 2 seconds to make it your next drop.

## App view on a phone

- **FULLSCREEN** in settings hides the browser bars (Android Chrome and
  desktop browsers; iPhones don't allow it for web pages, so it's hidden there).
- **Add to Home Screen** (Chrome's menu on Android, Share on iPhone) installs
  ByteFall with its own icon, and it opens full screen like an app, without
  browser bars. `manifest.webmanifest` and `icons/` (the icon's source is
  `icons/icon.svg`) set that up.

## Daily bonus, vibration and resetting

- **Daily bonus:** the first time the game opens each day (local date), one
  free exploit is banked behind the FREE EXPLOIT button (lightning icon) next to RESTART.
  Tapping it makes one of the first five exploits (RNG, BITFLIP, BUFFER OVERFLOW, TROJAN, WORM VIRUS) your next drop, even if you haven't unlocked it yet, so new players get to try them. It doesn't stack
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
- `manifest.webmanifest`, `icons/` — the home-screen app view and icons
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
- `music-night-drive.js` — track 07, NIGHT DRIVE: original synthwave / outrun
  at 100 BPM in F♯ minor (pumping octave bass ducking under the kick, detuned
  saw pads, gated-reverb snare and tom fills, arpeggio and gliding lead through
  a dotted-8th echo; ignition, cruise, neon, overdrive). Unlocked at 5,000 bits.
- `dev-tools/audio.html` — the audio compendium, opened by the `</>` icon in
  the footer: every sound effect and track with a play button, where each is
  used in the game, a seekable progress line and a live intensity slider for
  each track, a MUTE / PLAY button per intensity layer to hear the mix without
  it, and a SOLO button to hear just what it adds. ARCHIVED layers are sounds
  that were taken out of a track (NIGHT DRIVE's wailing siren, DEEP WEB's
  dial-up modem, ZERO DAY's air-raid siren): the game never plays them, and
  here they start muted so they can still be heard
- `audio/` — offline WAV renders of the music for reference (not loaded by
  the game). `01-bytefall-theme.wav` through `07-night-drive.wav` are one full
  loop of each track at full intensity (stack 6+, every layer the game plays,
  archived layers left out). Older versions: `blockchain-theme-v1.wav` is the
  original 16-bar theme loop, `blockchain-theme-v2.wav` the first 32-bar
  version, `sleep-mode-v1.wav` the first SLEEP MODE
