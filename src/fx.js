// Purely visual and audio effects: particles, floating text, muzzle flashes, screen shake and
// sounds. The simulation never calls this module directly; it queues events with state.emit()
// and the frame loop plays them here (on the host from the local queue, on the guest from
// snapshots). Nothing in here affects the simulation.
import { rand } from './rng.js';
import { sfx } from './audio.js';
import { debrisColors } from './terrain.js';

export const FX = { parts: [], texts: [], flashes: [], shake: 0 };

// kind: 'dot' (plain), 'spark' (glowing, additive), 'smoke' (soft, grows), 'chunk' (debris)
function addPart(x, y, vx, vy, life, col, size, g, kind) {
  if (FX.parts.length > 700) FX.parts.shift();
  FX.parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, size: size, g: g || 0, kind: kind || 'dot', rot: rand(0, 6.28) });
}
function burst(x, y, n, col, speed, life, size, g, kind) {
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), s = rand(0.2, 1) * speed;
    addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1) * life, col, size * rand(0.7, 1.3), g, kind);
  }
}

// Event shapes (built by the simulation):
//   { k:'burst', x, y, n, col, speed, life, size, g, kind? }
//   { k:'debris', x, y, n, speed }      chunks of terrain in the map's colours
//   { k:'trail', x, y }                 rocket smoke puff
//   { k:'flash', x, y, ang, size }      muzzle flash
//   { k:'text', x, y, txt, col }
//   { k:'shake', v }
//   { k:'sfx', s }                      'shot' | 'big' | 'boom' | 'hit'
export function playFx(e) {
  if (e.k === 'burst') burst(e.x, e.y, e.n, e.col, e.speed, e.life, e.size, e.g, e.kind);
  else if (e.k === 'debris') {
    var cols = debrisColors();
    for (var i = 0; i < e.n; i++) {
      var a = rand(-3.0, -0.14), s = rand(0.3, 1) * e.speed;
      addPart(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.2), cols[i % cols.length], rand(2, 4.5), 700, 'chunk');
    }
  }
  else if (e.k === 'trail') addPart(e.x, e.y, rand(-12, 12), rand(-18, 4), 0.7, '#b8bcc0', 3.5, -30, 'smoke');
  else if (e.k === 'flash') FX.flashes.push({ x: e.x, y: e.y, ang: e.ang, size: e.size || 1, t: 0 });
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
    if (q.kind === 'smoke') { q.size += dt * 9; q.vx *= 1 - dt * 1.5; q.vy *= 1 - dt * 1.5; }
    else if (q.kind === 'spark') { q.vx *= 1 - dt * 2; q.vy *= 1 - dt * 2; }
    else if (q.kind === 'chunk') q.rot += dt * 8;
  }
  for (i = FX.texts.length - 1; i >= 0; i--) {
    var t = FX.texts[i]; t.t += dt; t.y -= 22 * dt; if (t.t > 1.2) FX.texts.splice(i, 1);
  }
  for (i = FX.flashes.length - 1; i >= 0; i--) {
    FX.flashes[i].t += dt; if (FX.flashes[i].t > 0.09) FX.flashes.splice(i, 1);
  }
  if (FX.shake > 0) FX.shake = Math.max(0, FX.shake - dt * 32);
}

export function clearFx() { FX.parts = []; FX.texts = []; FX.flashes = []; FX.shake = 0; }
