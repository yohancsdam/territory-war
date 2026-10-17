import { TURN_TIME, RESOLVE_MIN_TIME, RESOLVE_SETTLE_TIME, RESOLVE_MAX_TIME } from './config.js';
import { G, S, feed, setBanner } from './state.js';

export function canAct() { return !!S.teams && G.phase === 'play' && G.active && G.active.alive && !G.fired; }
export function aliveCount(t) { var n = 0; S.teams[t].units.forEach(function (u) { if (u.alive) n++; }); return n; }
export function nextUnit(t) {
  var T = S.teams[t], n = T.units.length;
  for (var k = 0; k < n; k++) {
    var idx = (T.ptr + k) % n;
    if (T.units[idx].alive) { T.ptr = (idx + 1) % n; return T.units[idx]; }
  }
  return null;
}
export function startTurn() {
  var u = nextUnit(G.t);
  if (!u) { endGame(); return; }
  G.active = u; G.timer = TURN_TIME; G.phase = 'play'; G.fired = false; G.charging = false; G.power = 0; G.jumpReq = false;
  S.ctl = { left: false, right: false, up: false, down: false };
  if (!(S.teams[G.t].ammo[G.weapon] > 0)) G.weapon = 'pistol';
  setBanner(S.teams[G.t].name + "'s turn: " + u.name);
  feed(S.teams[G.t].name + "'s turn: " + u.name + '.');
}
export function beginResolve() {
  if (G.phase !== 'play') return;
  G.phase = 'resolve'; G.resolveT = 0; G.stableT = 0; G.charging = false; G.power = 0;
}
export function finishTurn() {
  var a = aliveCount(0), b = aliveCount(1);
  if (a === 0 || b === 0) { endGame(); return; }
  G.t = 1 - G.t;
  startTurn();
}
export function updateResolve(dt) {
  G.resolveT += dt;
  var busy = S.proj.length > 0 || S.booms.length > 0;
  if (!busy) for (var i = 0; i < S.units.length; i++) { if (S.units[i].alive && !S.units[i].onGround) { busy = true; break; } }
  if (busy) G.stableT = 0; else G.stableT += dt;
  if ((G.resolveT > RESOLVE_MIN_TIME && G.stableT > RESOLVE_SETTLE_TIME) || G.resolveT > RESOLVE_MAX_TIME) finishTurn();
}
// Ends the battle. The UI notices G.phase === 'over' and shows the result screen.
export function endGame() {
  G.phase = 'over'; G.active = null;
  var a = aliveCount(0), b = aliveCount(1);
  G.winner = (a === 0 && b === 0) ? -1 : (a === 0 ? 1 : 0);
  feed(G.winner < 0 ? 'The battle ends in a draw.' : S.teams[G.winner].name + ' wins the battle!');
}
