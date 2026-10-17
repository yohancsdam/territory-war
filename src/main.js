import './style.css';
import { DT } from './config.js';
import { G, S, takeFx, serializeSnapshot, applySnapshot } from './state.js';
import { genTerrain, hashMask, mask } from './terrain.js';
import { step, startBattle, applyIntent } from './sim.js';
import { playFx, updateFx } from './fx.js';
import { setupRender, draw, updateHUD } from './render.js';
import { setupInput, pollIntent, setInputEnabled } from './input.js';
import { setupMenu, showGameOver, beginBattle } from './menu.js';
import { randomSeed } from './rng.js';

var cv = document.getElementById('cv');
setupRender(cv);
setupInput(cv);
setupMenu();
genTerrain('hills', randomSeed());

var lastTs = 0, acc = 0, lastPhase = G.phase;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
  setInputEnabled(!!S.teams && (G.phase === 'play' || G.phase === 'resolve'));
  applyIntent(pollIntent());
  acc += dt;
  while (acc >= DT) { step(DT); acc -= DT; }
  takeFx().forEach(playFx);
  if (G.phase === 'over' && lastPhase !== 'over') showGameOver();
  lastPhase = G.phase;
  updateFx(dt);
  draw();
  updateHUD(dt);
}
requestAnimationFrame(frame);

// Test hook.
window.__tw = {
  start: beginBattle, startSim: startBattle, step: step, applyIntent: applyIntent,
  press: function () { applyIntent({ fireDown: true }); },
  release: function () { applyIntent({ fireUp: true }); },
  state: function () { return { G: G, teams: S.teams, units: S.units, proj: S.proj }; },
  serializeSnapshot: serializeSnapshot, applySnapshot: applySnapshot,
  mask: mask, hashMask: hashMask,
  // Generates a map (replacing the current terrain) and returns the hash of its mask.
  terrainHash: function (style, seed) { genTerrain(style, seed); return hashMask(); }
};
