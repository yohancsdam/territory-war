import './style.css';
import { DT } from './config.js';
import { G, S, keys } from './state.js';
import { genTerrain, mask } from './terrain.js';
import { step, startBattle, setWeapon, pressFire, releaseFire } from './sim.js';
import { doFire } from './weapons.js';
import { updateFx } from './fx.js';
import { setupRender, draw, updateHUD } from './render.js';
import { setupInput } from './input.js';
import { setupMenu, showGameOver, beginBattle } from './menu.js';

var cv = document.getElementById('cv');
setupRender(cv);
setupInput(cv);
setupMenu();
genTerrain('hills');

var lastTs = 0, acc = 0, lastPhase = G.phase;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
  acc += dt;
  while (acc >= DT) { step(DT); acc -= DT; }
  if (G.phase === 'over' && lastPhase !== 'over') showGameOver();
  lastPhase = G.phase;
  updateFx(dt);
  draw();
  updateHUD(dt);
}
requestAnimationFrame(frame);

window.__tw = {
  start: beginBattle, startSim: startBattle, step: step, fire: doFire, press: pressFire, release: releaseFire,
  state: function () { return { G: G, teams: S.teams, units: S.units, proj: S.proj }; },
  keys: keys, setWeapon: setWeapon, mask: mask
};
