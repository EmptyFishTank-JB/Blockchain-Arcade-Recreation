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
- A decrypted bit scores 10 plus its number (a `[4]` is 14, a `[7]` is 17).
  Blocks wiped out by exploits score a flat 10.
- Decrypts chain: bits above fall into the gap and may make new matches.
  Chains multiply the points.
- Every 8 drops a row of encryption layers (`[=]`) rises from the bottom.
  Decrypting a bit beside one peels it down to `[-]`, and a second peel
  reveals the bit underneath.
- Columns can spill into an overflow row above the `========` line. Decrypts
  still resolve there (a lone `[1]` decrypts itself), but anything left above
  the line afterwards completes the trace and ends the run.

## Exploits

On Normal and Hard, a 5x chain unlocks a random exploit. On Easy, each exploit
has its own chain length, so shorter chains unlock the weaker ones. The exploit
waits in the exploit button (the game card's lower-right corner), which glows
green and shows the exploit's icon (with a count if more are waiting). Tap it
(or press E) to arm the exploit: the button pulses amber and the exploit is
your next drop, with no taking it back. Drop it into a column like a bit and it
runs where it lands. With nothing to arm, the button opens the menu's EXPLOITS tab:

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
| DAILY | Four daily games, picked on a second row under the modes. Each is the same for everyone that UTC day, and each keeps a daily streak. **DECRYPT**: a fixed stack of 40 bits dealt from a seed of the date (Normal rules, the five standard exploits); it ends when the stack runs out. **PUZZLE**: a new puzzle every day (from `daily-puzzles.js`), harder through the week: Monday is 1 bit, Sunday 4 bits with layers; you get 4 tries a day (a try counts from its first drop); once it's solved or the tries are used up, later runs are practice. **BLITZ**: the same bits for everyone against a 60-second clock. **BREACH** (daily only): the board starts with a 3-row firewall of level 1 and 2 layers and you get 30 bits to break through; each layer broken is +25 and clearing the whole board is +1,000. For DECRYPT, BLITZ and BREACH your first run each day is the official score and later runs are practice. SHARE on the results screen (every daily game, win or lose; the puzzle shares one square per try) sends or copies your result |
| BLITZ | Normal rules against a 2-minute clock that starts on your first drop (paused while the tab is hidden) |
| ZEN | Normal rules with no encryption layers and no clock |
| VS | VS CPU (`cpu.js`): you against an EASY / NORMAL / HARD computer opponent (faster and smarter up the levels), on Normal rules with no exploits and the same bits in the same order. A setup screen over your board picks the level and, below it, ENCRYPTED LAYERS: ON / OFF (the usual layer row every 8 drops, on both boards); START bursts it apart and starts the CPU's clock, and it comes back after the win / loss screen. Every 30 points a drop scores sends one encrypted block (a one-peel layer hiding a random bit) onto the other board, dropping onto the top of random columns after its next move; your chains cancel blocks headed your way first. The first to overflow loses. In a match the header gives way to a VS. CPU title between the top icons (green VS., amber CPU), the level and layers line, your stats and the CPU's board (with its numbers, playing each move back: bits falling, decrypting and layers peeling; press and hold it to see it full size over yours with all your board's effects), laid out so your board keeps its regular size and place; QUIT (the lower-left corner) in a match turns red and a second press ends it, back to the setup screen; on the setup screen one press goes back to your previous mode (dragging off the button before letting go cancels a press). CURRENT shows [?] until START. The CPU pauses while a panel is open. RECORDS → STATS keeps wins and losses per level |
| PUZZLE | 60 set boards (in `puzzles.js`): decrypt every block using exactly the bits given, in order. Solving one opens the next; the arrow buttons move between them. No new layers rise and no exploits drop; puzzle layers hide a fixed bit |

Switching modes mid-run asks to confirm, like RESTART. Each mode keeps its
own best score.

## Difficulty

| Setting | Effect |
|---|---|
| Easy | Shows the next bit, and exploits unlock at 3x–5x depending on the exploit; NIBBLE bonus |
| Normal | New encryption layer every 8 drops; NIBBLE bonus |
| Hard | A full byte: 8×8 grid with bits 1-8; new layer every 8 drops, minus one per 700 points, down to every 4; BYTE bonus |

On Hard, every 8 bits a single drop decrypts, chains included, make a byte:
**BYTE DECRYPTED** adds a 256-point (2^8) bonus per byte. On Easy and Normal
(and the modes that play Normal rules, all but PUZZLE), every 4 bits make a
nibble: **NIBBLE DECRYPTED** adds a 16-point (2^4) bonus per nibble.

High scores are saved in your browser, one per difficulty (Hard's started
fresh when it moved to 8×8).

## Levels, DECRYPTOR ranks and unlocks

**Levels.** Every bit you decrypt is XP: **100 bits (12.5 bytes) per level**,
Lv 1 to **Lv 80**. Lv 80's bar fills at 8,000 bits, so a full DECRYPTOR rank
is exactly **1 kilobyte**. The level bar sits under the title.

**DECRYPTOR ranks** (the game's prestige). With Lv 80 full, RANK UP TO
DECRYPTOR (in RECORDS → UNLOCKS, four presses) starts you again at Lv 1 one
rank higher. Exploits and slots lock again, but DECRYPTOR N keeps N slots (up
to 6) and the first N exploits for good, and the rest unlock sooner. Each rank
also permanently unlocks the next theme.

**Exploit slots (loadout).** Only exploits equipped in a slot are awarded.
Slots unlock at Lv 5, 15, 30, 45, 60 and 75 (6 at most). Exploits unlock by
level in this order: RNG (3), BITFLIP (8), BUFFER OVERFLOW (13), TROJAN (18),
PIVOT (23), WORM VIRUS (29), KEYLOGGER (35), PACKET SNIFFER (41), BACKDOOR
(47), LOGIC BOMB (53), HONEYPOT (59), DICTIONARY ATTACK (65), RAINBOW TABLE
(70); with a
rank's kept exploits, the rest move down this list. A new unlock drops
into a free slot by itself; tap an exploit card to remove or equip it. The loadout
is locked during a session: change it before the first drop or after the game ends. The
daily games always use the five standard exploits, so they're the same for
everyone.

**Themes** unlock by DECRYPTOR rank, for good: CIPHER (1), AMBER CRT (2), MONOCHROME
(3), ANAGLYPH (4), SYNTHWAVE (5), DOT MATRIX (6), PAPER (7), GLYPH (8),
SPECTRUM (9).

**Fonts** (SETTINGS → FONT) unlock by achievements earned, for good: COURIER is
the default, SHARE TECH MONO opens at 10 achievements, PRESS START (Press Start
2P) at 25, BITCOUNT (Bitcount Single) at 40 and BYTESIZED at 55. Each has an
achievement for playing a full session in it (TECH SUPPORT, INSERT COIN, BIT BY
BIT, BITE-SIZED). The font changes all the
game's text (the particles and the dev page too); the fonts are bundled in
`fonts/` and scaled so the layout stays the same as in Courier.

**Permanent unlocks:** Hard mode (score 2,000 on Normal) and tracks 02-10
(125 / 350 / 800 / 1,600 / 3,000 / 5,000 / 7,500 / 11,000 / 15,000 bits decrypted in
total; 09-10 are still to come).

The menu icon (lines / trophy, top left) opens three tabs, each its own card:
**RULES**, **RECORDS** and **EXPLOITS**. RECORDS has level and DECRYPTOR rank,
every unlock and achievement with a progress tracker, and lifetime stats
(UNLOCKS / ACHIEVEMENTS / STATS). New unlocks, level-ups
and achievements pop up as they happen. Progress is saved in the browser
(`bytefall-progress`).

`progress.js` holds the stats, levels, unlocks and achievements; `script.js`
reports each drop, decrypt, peel, byte, exploit and point to it.

**Dev switches.** The `</>` dev page has UNLOCK EVERYTHING (like owning Full
Access, for this browser; the game shows a DEV badge while it's on), JUMP TO
LV 80 and +10 LEVELS for testing DECRYPTOR ranks, slots and exploit unlocks. With UNLOCK EVERYTHING on,
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
  free exploit waits in the exploit button, marked FREE!.
  Arming it makes one of the first five exploits (RNG, BITFLIP, BUFFER OVERFLOW, TROJAN, WORM VIRUS) your next drop, even if you haven't unlocked it yet, so new players get to try them. It doesn't stack
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

Themes (picked from the swatch grid in settings; the page fades to the new one over 1 second, 1.25 into or out of PAPER):

| Theme | Bits | Layers | Cracks & exploits | Trace |
|---|---|---|---|---|
| TERMINAL (default) | green | grey | amber | red |
| CIPHER | cyan | magenta | yellow | orange-red |
| AMBER CRT | amber | grey | white | red |
| MONOCHROME | light grey | striped grey | white | white |
| ANAGLYPH | off-white with red/cyan 3D fringes | red | cyan | red |
| SYNTHWAVE | pink | purple | orange | cyan |
| DOT MATRIX | olive green | dark green | pale green | red |
| PAPER | near-black ink on paper | grey | dark amber (gold) | red |
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

**The corners.** RESTART is the arrows icon in the game card's lower-left
corner, greyed out until a session's first bit drops (QUIT in VS); the exploit
button is in the lower-right.

**No scrolling.** On every screen (phones, the app and desktop) the footer sits
inside SETTINGS and the game card fills the screen height, so the game page never
scrolls. The header sits at the top of the card, level with the icons; the
board stays centered.

RESTART and the difficulty buttons ask for a second press mid-run (RESTART
turns red, like the other confirms; the text buttons read CONFIRM?; either cancels itself
after a few seconds), then the board melts down like a traced run before the
new one starts. Once a run is over, or before the first drop, they act straight
away.

## Files

`index.html` (and `dev-tools/audio.html`) load their CSS and JS with a `?v=N`
tag. Bump `N` on all of those links whenever any of those files change, so browsers don't pair a fresh page
with a cached older script (GitHub Pages lets browsers cache for 10 minutes).

- `index.html` — page structure, HUD, rules and exploits panels
- `style.css` — terminal/hacker visual theme
- `script.js` — game state, rendering, chain resolution and exploits
- `unlocks.js` — the Full Access check (never owned on the website; `?unlockall` previews it)
- `fonts/` — the unlockable fonts, Share Tech Mono (Carrois Type Design), Press Start 2P (CodeMan38), Bitcount Single (Petr van Blokland) and Bytesized (Baltdev), from Google Fonts, with their SIL Open Font License files
- `cpu.js` — VS CPU: the computer opponent (a copy of the board rules with no animation, and a player that tries every column)
- `progress.js` — lifetime stats, earnable unlocks and achievements
- `achievements.csv` — every achievement grouped by what it's about (category, name, description, goal, and whether it's standard, hidden or impossible)
- `manifest.webmanifest`, `icons/` — the home-screen app view and icons
- `puzzles.js` — the PUZZLE boards, generated and verified by brute force (1-3 solutions each, none solvable in fewer drops)
- `daily-puzzles.js` — the DAILY PUZZLE boards, one per UTC day for about three years (then they loop), generated and verified the same way (1-3 solutions each)
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
  Music starts on your first click or key press, on the track you last picked or played (track 01 at first) (toggle with the
  MUSIC button in settings) and intensifies as your tallest stack nears the
  red line (from height 4, full at 6; one higher on Hard's 8×8). The settings panel holds the playlist,
  which also has
  a small visualizer of the live music (click it to switch between LED bars
  and an oscilloscope wave), a MODE button (REPEAT, or SEQUENCE / SHUFFLE,
  which play each track 4 times and then fade into the next), and the
  BACKGROUND PLAY toggle (keep playing or pause when you switch tabs or
  apps). New tracks go in the `TRACKS` list here, with their engine in a
  `music-*.js` file
- `music-bytefall-theme.js` — track 01, BYTEFALL THEME: an original synthwave loop
  (intro, melody 1, section B with melody 2, octave-doubled climax)
- `music-sleep-mode.js` — track 02, SLEEP MODE: original electronicore
  (music box, trance synths, chugging distorted guitars, double-kick) at
  150 BPM, built on the public-domain lullaby "Schlaf, Kindlein, schlaf".
  Unlocked at 125 bits.
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
- `music-standby-mode.js` — track 08, STANDBY MODE: an original early-60s
  soul ballad at 112 BPM in B♭ major (walking upright bass, finger snaps and
  guiro, clean guitar, a breathy saxophone melody in a warm room reverb;
  standby, signal, connected, hold). Unlocked at 7,500 bits.
- `dev-tools/audio.html` — the audio compendium, opened by the `</>` icon in
  the footer: every sound effect and track with a play button, where each is
  used in the game, a seekable progress line and a live intensity slider for
  each track, a MUTE / PLAY button per intensity layer to hear the mix without
  it, and a SOLO button to hear just what it adds. ARCHIVED layers are sounds
  that were taken out of a track (NIGHT DRIVE's wailing siren, DEEP WEB's
  dial-up modem, ZERO DAY's air-raid siren): the game never plays them, and
  here they start muted so they can still be heard
- `audio/` — offline WAV renders of the music for reference (not loaded by
  the game). `01-bytefall-theme.wav` through `08-standby-mode.wav` are one full
  loop of each track at full intensity (stack 6+, every layer the game plays,
  archived layers left out). Older versions: `bytefall-theme-v1.wav` is the
  original 16-bar theme loop, `bytefall-theme-v2.wav` the first 32-bar
  version, `sleep-mode-v1.wav` the first SLEEP MODE
