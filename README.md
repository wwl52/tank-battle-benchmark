# Steel Vanguard — Original Tank Battle

An original, fully offline **Tank Battle / Battle City style** game built with plain
HTML5 + Canvas + vanilla JavaScript (ES2022 + `node:test`). No frameworks, no
npm dependencies, no CDN, no external assets: every sprite is drawn by code on a
Canvas, every sound is synthesized by the Web Audio API, every level is generated
deterministically by a seeded RNG.

> Original name, original 35 levels, original pixel art, original synthesized SFX.
> Contains no copyrighted sprites, maps, music, or trademarks from any commercial game.

## Run

```bash
npm start     # serves at http://localhost:18081
npm test      # runs the 58-test suite (node:test, zero dependencies)
```

Windows quick scripts:
- `start.bat` — minimal-window background server + auto-open browser (if it is already running, directly opens the page); double-click to play.
- `stop.bat` — one-click stop of the server on port 18081.

Debug / automation harness: open `http://localhost:18081/?debug=1`, then use
`window.__TANK_BATTLE_TEST__` (see [Debug mode](#debug-mode)).

## Project structure

```
tank-battle-benchmark/
├─ index.html            entry page (single canvas, no build step)
├─ styles.css            pixel-crisp scaling + fixed aspect ratio
├─ package.json          npm start / npm test
├─ server.mjs            zero-dependency static server (Node http)
├─ README.md
├─ ARCHITECTURE.md
├─ QA_REPORT.md
├─ BENCHMARK_REPORT.md
├─ src/
│  ├─ main.js            browser wiring: input ↔ game ↔ renderer ↔ audio ↔ storage
│  ├─ config.js          all tuning constants (tick rate, speeds, timers)
│  ├─ game.js            core simulation (rules, bullets, damage, spawning, flow)
│  ├─ state-machine.js   game-flow states + legal transitions
│  ├─ loop.js            60 Hz fixed-timestep loop with catch-up clamp
│  ├─ renderer.js        Canvas 2D pixel-art rendering (no assets)
│  ├─ input.js           keyboard: hold/edge tracking, per-player isolation
│  ├─ audio.js           Web Audio synthesis engine (all SFX generated)
│  ├─ storage.js         versioned localStorage save (safe parse + migrations)
│  ├─ rng.js             deterministic mulberry32 RNG (+ string hash seeds)
│  ├─ collision.js       AABB + swept bullet collision, rigid map movement
│  ├─ map.js             tile world, brick sub-quadrants, base wall bookkeeping
│  ├─ levels.js          35 deterministic procedural stages
│  ├─ level-validator.js reachability + integrity checks for every stage
│  ├─ ai.js              enemy AI (goal scoring + throttled BFS) + demo AI
│  ├─ entities/          tank/player/enemy/bullet/powerup/effects (pure logic)
│  └─ ui/                menu model + HUD view builder (data, not pixels)
└─ tests/                58 tests across 8 files (collision/damage/powerups/
                         spawning/state-machine/level-validator/input/
                         deterministic sim)
```

## Controls

| Key | Action |
|---|---|
| `W A S D` | Player 1 move |
| `Space` | Player 1 fire |
| `Arrow keys` | Player 2 move |
| `Enter` | Player 2 fire |
| `P` | Pause / resume |
| `R` | Restart current stage |
| `M` | Mute / unmute |
| `Esc` | Back to menu / close help |
| `F2` | Toggle debug overlay |

Arrow keys and Space never scroll the page. Window blur auto-pauses; restoring
focus does **not** auto-resume — the user presses `P`.

## Rules summary

- Each stage spawns **20 enemies**, max **4** active at once, from 3 top spawn
  points (star flash animation while materialising).
- Protect the **base** at the bottom centre. Any faction's shell destroys it and
  ends the run — including a player shooting their own base.
- Shoot flashing **carriers** (4 per stage) to drop a power-up.

### Enemy types

| Type | Speed | Shells | HP | Score |
|---|---|---|---|---|
| basic | slow | normal | 1 | 100 |
| fast | fast | normal | 1 | 200 |
| power | slow | fast + fast bullets | 1 | 300 |
| armor | slow | normal | 4 (visible damage stages) | 400 |

### Terrain

| Tile | Tanks | Bullets | Notes |
|---|---|---|---|
| empty | pass | pass | |
| brick | block | block, destroyed **by chunk** (4 quadrants per cell) | |
| steel | block | block; only L3 piercing shells break it | |
| water | block | pass | animated |
| grass | pass | pass | drawn above tanks (hide) |
| ice | pass | pass | tanks keep sliding after input release, per-tank state |
| base | block | destroyed by any shell | defence ring around it |

### Power-ups (one at a time on the field)

| Icon | Effect |
|---|---|
| `★` | fire level +1 (max 3) |
| `⊙` | ~10 s shield (blinks before expiry) |
| `⏱` | ~10 s freeze on all enemies and enemy shells (spawn queue keeps filling; new tanks are also frozen) |
| `⛏` | ~18 s: base defence walls become steel; restore on expiry; re-pick refreshes the timer |
| `✸` | destroys every active (materialised) enemy, scored like normal kills |
| `+1` | extra life |
| `⚡` | **LASER** — instant beam along the facing lane: burns brick *and* steel and kills every enemy in the lane (base area protected) |
| `»` | **RAPID** — ~10 s machine-gun: ~4× fire cadence and 1.8× shell speed |
| `Y` | **SCATTER** — ~12 s triple-shot: each trigger pull fans three shells sideways |

Weapon drops share the same one-at-a-time pickup slot and are lost on death.

### Fire levels

- L0: 1 shell on screen, normal speed
- L1: +bullet speed
- L2: 2 shells on screen, faster cadence
- L3: piercing shells that break steel (keeps L1/L2 perks)

**Death rule (documented & deterministic):** dying lowers your fire level by
exactly one (never below 0). Upgrades never carry across death beyond that.

**Score thresholds:** every 20 000 points grants one extra life; the threshold
resets upward after each award. Power-ups give 500 points; kills give the
table above; per-player kill tallies (by type) are shown in the stage report.

### Save data (localStorage, versioned)

`highScore`, `maxUnlockedLevel` (stage select safety), `soundOn`, `volume`,
`lastMode`. Corrupted JSON / missing / old fields are repaired on load with safe
defaults — a broken save never blocks startup. CLEAR DATA in the main menu wipes it.

## Debug mode

With `?debug=1`, the page exposes `window.__TANK_BATTLE_TEST__`:

`version, startGame(options), resetGame(), pauseGame(), resumeGame(),
stepFrames(n), setPlayerInput(pid, state), getSnapshot(), spawnEnemy(type, pos),
spawnPowerUp(type, pos), damageTank(id, amount), destroyBase(),
clearActiveEnemies()`.

`getSnapshot()` is fully JSON-serialisable (state, seed, frame, players,
enemies, shells, power-up, base, timers, remaining enemies, active-object
counts). Normal gameplay does not depend on this interface.

## Known limitations

- `BROWSER_VISUAL_CHECK = TOOL_LIMITED`: no browser automation/screenshot tool
  was connected in this environment, so screens were verified through the
  static server + module parse checks instead of rendered screenshots.
- Gamepad support is not implemented (keyboard is complete).
- Levels are procedurally generated (seeded, stable per version) rather than
  hand-drawn; layouts are validated for solvability instead of art-directed.
