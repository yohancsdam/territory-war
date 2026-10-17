// Purely visual and audio effects: particles, floating text, screen shake and sounds.
// The simulation never calls this module directly; it queues events with state.emit()
// and the frame loop plays them here (on the host from the local queue, on the guest from
// snapshots). Nothing in here affects the simulation.
import { rand } from './rng.js';
import { sfx } from './audio.js';

export const FX = { parts: [], texts: [], shake: 0 };

function addPart(x, y, vx, vy, life, col, size, g) {
  if (FX.parts.length > 500) FX.parts.shift();
  FX.parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, size: size, g: g || 0 });
}
function burst(x, y, n, col, speed, life, size, g) {
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), s = rand(0.2, 1) * speed;
    addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1) * life, col, size, g);
  }
}

// Event shapes (built by the simulation):
//   { k:'burst', x, y, n, col, speed, life, size, g }
//   { k:'trail', x, y }                 rocket smoke puff
//   { k:'text', x, y, txt, col }
//   { k:'shake', v }
//   { k:'sfx', s }                      'shot' | 'big' | 'boom' | 'hit'
export function playFx(e) {
  if (e.k === 'burst') burst(e.x, e.y, e.n, e.col, e.speed, e.life, e.size, e.g);
  else if (e.k === 'trail') addPart(e.x, e.y, rand(-15, 15), rand(-15, 15), 0.5, '#9aa0a6', 3, 0);
  else if (e.k === 'text') FX.texts.push({ x: e.x, y: e.y, t: 0, txt: e.txt, col: e.col || '#fff' });
  else if (e.k === 'shake') FX.shake = Math.max(FX.shake, e.v);
  else if (e.k === 'sfx') sfx(e.s);
}

export function updateFx(dt) {
  var i;
  for (i = FX.parts.length - 1; i >= 0; i--) {
    var q = FX.parts[i];
    q.life -= dt; if (q.life <= 0) { FX.parts.splice(i, 1); continue; }
    q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
  }
  for (i = FX.texts.length - 1; i >= 0; i--) {
    var t = FX.texts[i]; t.t += dt; t.y -= 22 * dt; if (t.t > 1.2) FX.texts.splice(i, 1);
  }
  if (FX.shake > 0) FX.shake = Math.max(0, FX.shake - dt * 32);
}

export function clearFx() { FX.parts = []; FX.texts = []; FX.shake = 0; }
