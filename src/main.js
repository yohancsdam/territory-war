import './style.css';
import { DT } from './config.js';
import { G, S, takeFx, serializeSnapshot, applySnapshot, interpolateSnapshot } from './state.js';
import { genTerrain, hashMask, mask } from './terrain.js';
import { step, startBattle, applyIntent } from './sim.js';
import { playFx, updateFx } from './fx.js';
import { setupRender, draw, updateHUD } from './render.js';
import { setupInput, pollIntent, setInputEnabled } from './input.js';
import { setupMenu, showGameOver, beginBattle, session } from './menu.js';
import * as net from './net.js';
import { randomSeed } from './rng.js';

var cv = document.getElementById('cv');
setupRender(cv);
setupInput(cv);
setupMenu();
genTerrain('hills', randomSeed());

var lastT = 0, acc = 0, lastPhase = G.phase;

// Advances the game to the current time: input, simulation (local/host) or snapshot
// interpolation (guest), network traffic and effect events. Returns the elapsed seconds.
function advance() {
  var t = performance.now();
  if (!lastT) lastT = t;
  var dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  var mode = session.mode;
  setInputEnabled(!!S.teams && !session.frozen && (G.phase === 'play' || G.phase === 'resolve'));

  if (mode === 'guest') {
    if (net.intentDue(t)) {
      var mine = pollIntent();
      if (S.teams && G.t === net.GUEST_TEAM && G.phase === 'play') net.sendIntent(mine);
    }
    interpolateSnapshot();
  } else {
    var it = pollIntent();
    if (mode === 'local' || G.t === net.HOST_TEAM) applyIntent(it);
    if (!session.frozen) {
      acc += dt;
      while (acc >= DT) { step(DT); acc -= DT; }
    }
  }
  if (mode !== 'local') net.tick(t);

  takeFx().forEach(playFx);
  if (G.phase === 'over' && lastPhase !== 'over' && S.teams) showGameOver();
  lastPhase = G.phase;
  return dt;
}

function frame() {
  requestAnimationFrame(frame);
  var dt = advance();
  updateFx(dt);
  draw();
  updateHUD(dt);
}
requestAnimationFrame(frame);

// Browsers pause requestAnimationFrame in background tabs. During online play the host must
// keep simulating (and both sides keep the connection alive), so a worker timer, which isn't
// paused, drives advance() while the tab is hidden.
try {
  var ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'], { type: 'text/javascript' })));
  ticker.onmessage = function () { if (document.hidden && session.mode !== 'local') advance(); };
} catch (e) { }

// Test hook.
window.__tw = {
  start: beginBattle, startSim: startBattle, step: step, applyIntent: applyIntent,
  press: function () { applyIntent({ fireDown: true }); },
  release: function () { applyIntent({ fireUp: true }); },
  state: function () { return { G: G, teams: S.teams, units: S.units, proj: S.proj, session: session }; },
  serializeSnapshot: serializeSnapshot, applySnapshot: applySnapshot,
  mask: mask, hashMask: hashMask,
  // Generates a map (replacing the current terrain) and returns the hash of its mask.
  terrainHash: function (style, seed) { genTerrain(style, seed); return hashMask(); }
};
