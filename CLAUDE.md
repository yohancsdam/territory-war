# Territory War — project notes for Claude Code

Read `GAME_DESIGN.md` (the spec, in Spanish) at the start of every session. `PROMPTS.md` is the
step-by-step work plan. Keep the spec up to date when a new decision is made.

## What it is

A 2D side-view, turn-based tactical battle game for the browser with destructible terrain.
Two teams of 6 stickman soldiers shoot each other until one team is wiped out. Inspired by
Territory War (Afro-Ninja) but with original code, names and art.

Scope of this phase: local two-player on one device, plus basic online play for two over WebRTC
(PeerJS). No CPU opponent, campaign, progression or final art. See spec section 7 for the full
"not in this phase" list. Don't add features outside the scope.

`territory-war-base.html` is the working prototype the project grew from. It is **refactored,
not rewritten**: physics, weapons and terrain generation work and must keep behaving the same.

## Project conventions

- **Everything is in English**: game UI text, code, comments and docs written from now on.
- **All tuning values live in `src/config.js`** (weapon damage, explosion radius, speeds, timers…).
  Gameplay code reads them from there; don't hard-code new magic numbers in gameplay modules.
- The GitHub repository is called `territory-war` (Vite `base` for Pages: `/territory-war/`).
- Vite + plain JavaScript ES modules. No TypeScript, no game framework.

## Rules (spec section 3)

Turns
- Red always starts. **One soldier per turn**, then the other team plays.
- Inside a team, soldiers rotate in order (1–6) and wrap around.
- If the soldier whose turn it is is dead, the next living soldier of the same team plays.
- **One shot per turn.** After shooting, the turn ends once everything has stopped moving.
- **Turn timer: 60 seconds.** When it runs out the turn is lost without shooting.

Combat
- 6 soldiers per team, fixed (not configurable).
- **Friendly fire on:** explosions hurt your own soldiers.
- **No fall damage.** Only leaving the map (sides or the bottom) kills.
- Explosions knock soldiers back and destroy terrain.
- **No wind.** Trajectories depend only on angle, power and gravity.

Victory
- The team that eliminates all 6 enemy soldiers wins. Both teams at zero at once is a draw.

Maps
- Three styles: hills, floating islands, canyon (plus a "random" choice among them).
- The exact relief is generated from a **seed**. Same seed + same style = same map, always.
  This is mandatory for online play: only map generation and initial soldier placement use the
  seeded PRNG (`src/rng.js`); visual effects may use `Math.random`.

## Module layout (spec section 5)

```
index.html            page markup: HUD, menus, overlays
vite.config.js
src/
  main.js             boot, frame loop, DOM wiring
  config.js           all constants and tuning values
  rng.js              seeded PRNG (mulberry32) + non-seeded rand for visuals
  terrain.js          genTerrain, paintTerrain, solid, carve, groundY
  units.js            updateUnit, hurt, die, tryStep
  weapons.js          doFire, explode, stepBullet, stepRocket, stepThrown
  turns.js            startTurn, beginResolve, finishTurn, updateResolve, endGame
  sim.js              step, startBattle, applyIntent (the simulation entry points)
  state.js            G, teams, units, proj; serializeSnapshot / applySnapshot
  fx.js / audio.js    particles, floating text, screen shake, synth sounds (visual/audio only)
  input.js            keyboard, mouse, touch → intent object
  render.js           draw, drawUnit, drawProj, drawReticle, HUD
  menu.js             start screen, setup and lobby
  net.js              PeerJS: room, host, guest
test/
  rules.test.js       Vitest rule tests
```

## The critical boundary: input → simulation → render

- **`input.js` never touches game state.** It only produces a plain intent object:
  `{ left, right, up, down, jump, fireDown, fireUp, cancel, skip, weapon, aimX, aimY }`
- **`applyIntent(intent)` is the only way a player action enters the simulation**, whether the
  intent comes from the local keyboard or from the network.
- **`render.js` never modifies game state.** It only reads and draws it.
- Simulation modules don't touch the DOM, so they run under Node for tests.
- `net.js` stays thin: it only calls `applyIntent`, `serializeSnapshot` and `applySnapshot`.

## Online model (spec section 6)

Host-authoritative. The host (always red) simulates everything and sends snapshots at 30 Hz.
The guest (blue) doesn't simulate: it sends intents at 30 Hz during its turn and draws what it
receives, interpolating positions. Terrain is synced by sending the seed in `init` and then only
new craters (`carves`) in each snapshot — **never the terrain mask**.

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest rule tests
- `npm run build` — production build into `dist/`
