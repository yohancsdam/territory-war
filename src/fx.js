// Purely visual effects: particles, floating text and screen shake.
// Nothing in here affects the simulation.
import { rand } from './rng.js';

export const FX = { parts: [], texts: [], shake: 0 };

export function addText(x, y, txt, col) { FX.texts.push({ x: x, y: y, t: 0, txt: txt, col: col || '#fff' }); }
export function addPart(x, y, vx, vy, life, col, size, g) {
  if (FX.parts.length > 500) FX.parts.shift();
  FX.parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, size: size, g: g || 0 });
}
export function burst(x, y, n, col, speed, life, size, g) {
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), s = rand(0.2, 1) * speed;
    addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1) * life, col, size, g);
  }
}
export function shakeScreen(v) { FX.shake = Math.max(FX.shake, v); }

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
