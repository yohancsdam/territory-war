// Simulation entry points: battle setup, applyIntent and the fixed-step update.
import {
  W, WEAPONS, weaponDef, SOLDIER_NAMES, TEAM_SIZE, START_AIM, AIM_SPEED, AIM_LIMIT, CHARGE_TIME
} from './config.js';
import { G, S, feed } from './state.js';
import { genTerrain, groundY } from './terrain.js';
import { updateUnit } from './units.js';
import { doFire, updateProj } from './weapons.js';
import { canAct, aliveCount, startTurn, beginResolve, updateResolve } from './turns.js';
import { mulberry32, rangeOf, randomSeed } from './rng.js';
import { clamp } from './util.js';

// Builds the battlefield without starting the first turn. The online guest calls this to get
// the same map and soldiers as the host, then follows the host's snapshots.
// cfg: { names: [red, blue], hp, style, seed }. Map and soldier placement depend only on
// style and seed, so the same cfg always produces the same battlefield.
export function setupBattle(cfg) {
  S.style = genTerrain(cfg.style, cfg.seed);
  S.seed = cfg.seed;
  var rng = mulberry32((cfg.seed ^ 0x9E3779B9) >>> 0);
  function rand(a, b) { return rangeOf(rng, a, b); }
  S.proj = []; S.booms = []; S.units = []; S.feedList = []; S.feedVersion++; S.fx = []; S.projSeq = 0;
  S.ctl = { left: false, right: false, up: false, down: false };
  S.teams = [0, 1].map(function (t) {
    var ammo = {}; WEAPONS.forEach(function (w) { ammo[w.key] = w.ammo; });
    return { name: cfg.names[t], units: [], ptr: 0, ammo: ammo, stat: { dmg: 0, kills: 0, shots: 0 } };
  });
  var ranges = [[60, 250], [710, 900]];
  for (var t = 0; t < 2; t++) {
    var lo = ranges[t][0], hi = ranges[t][1];
    for (var i = 0; i < TEAM_SIZE; i++) {
      var x = lo + (i + 0.5) * (hi - lo) / TEAM_SIZE + rand(-6, 6), gy = groundY(x), tries = 0;
      while (gy < 0 && tries < 40) { x = clamp(x + (tries % 2 ? 1 : -1) * 8 * tries, 5, W - 5); gy = groundY(x); tries++; }
      if (gy < 0) { x = t === 0 ? 150 : 810; gy = groundY(x); if (gy < 0) gy = 300; }
      var u = {
        team: t, name: SOLDIER_NAMES[t][i], x: x, y: gy - 1, vx: 0, vy: 0, hp: cfg.hp, max: cfg.hp, alive: true,
        onGround: false, face: t === 0 ? 1 : -1, walkAcc: 0, walkT: 0, moving: false, lastHit: -1, hurtT: 0
      };
      S.teams[t].units.push(u); S.units.push(u);
    }
  }
  G.t = 0; G.weapon = 'pistol'; G.elev = START_AIM; G.phase = 'play'; G.active = null; G.winner = -1;
  G.fired = false; G.charging = false; G.power = 0; G.banner = ''; G.bannerT = 0;
}

export function startBattle(cfg) {
  setupBattle(cfg);
  startTurn();
}

export function resetToMenu() {
  G.phase = 'menu'; G.active = null; S.teams = null; S.units = []; S.proj = []; S.booms = []; S.fx = [];
  genTerrain('hills', randomSeed());
}

/* ---------- Player actions ---------- */
function setWeapon(k) {
  if (!canAct() || G.charging) return;
  if (!(S.teams[G.t].ammo[k] > 0)) { feed('Out of ' + weaponDef(k).name.toLowerCase() + ' ammo.'); return; }
  G.weapon = k;
}
function pressFire() {
  if (!canAct()) return;
  var T = S.teams[G.t];
  if (!(T.ammo[G.weapon] > 0)) { feed('Out of ammo.'); return; }
  if (weaponDef(G.weapon).charge) { G.charging = true; G.power = 0; } else doFire();
}
function releaseFire() { if (G.charging && canAct()) doFire(); else G.charging = false; }
function cancelCharge() { G.charging = false; G.power = 0; }
function skipTurn() { if (canAct()) { feed(G.active.name + ' skips the turn.'); beginResolve(); } }
function aimAt(px, py) {
  var u = G.active; if (!u) return;
  var dx = px - u.x, dy = py - (u.y - 16);
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    u.face = dx >= 0 ? 1 : -1;
    G.elev = clamp(Math.atan2(-dy, Math.abs(dx)), -AIM_LIMIT, AIM_LIMIT);
  }
}

function isWeapon(k) {
  for (var i = 0; i < WEAPONS.length; i++) if (WEAPONS[i].key === k) return true;
  return false;
}
function finite(v) { return typeof v === 'number' && isFinite(v); }

// The only way a player action enters the game, whether the intent comes from the local
// input or from the network. Applies to whoever is the active soldier; the caller decides
// whose intents to accept. Unknown or malformed fields are ignored.
export function applyIntent(it) {
  if (!it || !S.teams) return;
  S.ctl.left = it.left === true; S.ctl.right = it.right === true;
  S.ctl.up = it.up === true; S.ctl.down = it.down === true;
  if (typeof it.weapon === 'string' && isWeapon(it.weapon)) setWeapon(it.weapon);
  if (finite(it.aimX) && finite(it.aimY) && canAct()) aimAt(it.aimX, it.aimY);
  if (it.jump === true) G.jumpReq = true;
  if (it.fireDown === true) pressFire();
  if (it.fireUp === true) releaseFire();
  if (it.cancel === true) cancelCharge();
  if (it.skip === true) skipTurn();
}

/* ---------- Fixed-step update ---------- */
export function step(dt) {
  if (!S.teams) return;
  var ctrl = null, ctl = S.ctl;
  if (G.phase === 'play' && G.active && G.active.alive) {
    var mv = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
    if (G.charging) mv = 0;
    ctrl = { move: mv, jump: G.jumpReq && !G.charging };
    G.jumpReq = false;
    if (ctl.up) G.elev = clamp(G.elev + AIM_SPEED * dt, -AIM_LIMIT, AIM_LIMIT);
    if (ctl.down) G.elev = clamp(G.elev - AIM_SPEED * dt, -AIM_LIMIT, AIM_LIMIT);
    if (G.charging) {
      G.power = Math.min(1, G.power + dt / CHARGE_TIME);
      if (G.power >= 1) doFire();
    } else {
      G.timer -= dt;
      if (G.timer <= 0) { G.timer = 0; feed(G.active.name + ' ran out of time.'); beginResolve(); }
    }
  }
  var units = S.units;
  for (var i = 0; i < units.length; i++) updateUnit(units[i], dt, units[i] === G.active && G.phase === 'play' ? ctrl : null);
  updateProj(dt);
  if (G.phase === 'play' && G.active && !G.active.alive) beginResolve();
  if (G.phase === 'play' && S.teams && (aliveCount(0) === 0 || aliveCount(1) === 0)) beginResolve();
  if (G.phase === 'resolve') updateResolve(dt);
  if (G.bannerT > 0) G.bannerT -= dt;
}
