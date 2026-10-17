// Keyboard, mouse and touch controls.
import { W, H } from './config.js';
import { G, S, keys } from './state.js';
import { canAct } from './turns.js';
import { setWeapon, pressFire, releaseFire, cancelCharge, skipTurn, aimAt } from './sim.js';
import { invalidateWeapons } from './render.js';

function typing(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }
var weaponKeys = { Digit1: 'pistol', Digit2: 'shotgun', Digit3: 'sniper', Digit4: 'bazooka', Digit5: 'grenade', Digit6: 'dynamite' };

export function setupInput(cv) {
  function pointerPos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  cv.addEventListener('pointermove', function (e) {
    if (!canAct()) return;
    var p = pointerPos(e); aimAt(p.x, p.y);
  });
  cv.addEventListener('pointerdown', function (e) {
    if (!canAct()) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    if (e.button === 2) { cancelCharge(); return; }
    var p = pointerPos(e); aimAt(p.x, p.y); pressFire();
  });
  cv.addEventListener('pointerup', function (e) { if (e.button === 2) return; releaseFire(); });
  cv.addEventListener('pointercancel', cancelCharge);
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); cancelCharge(); });

  window.addEventListener('keydown', function (e) {
    if (!S.teams || typing(e.target) || G.phase === 'menu' || G.phase === 'over') return;
    var c = e.code, handled = true;
    if (c === 'KeyA' || c === 'ArrowLeft') keys.left = true;
    else if (c === 'KeyD' || c === 'ArrowRight') keys.right = true;
    else if (c === 'ArrowUp') keys.up = true;
    else if (c === 'ArrowDown') keys.down = true;
    else if (c === 'KeyW') { if (!e.repeat) G.jumpReq = true; }
    else if (c === 'Space') { if (!e.repeat) pressFire(); }
    else if (c === 'Escape') cancelCharge();
    else if (weaponKeys[c]) setWeapon(weaponKeys[c]);
    else handled = false;
    if (handled) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    var c = e.code;
    if (c === 'KeyA' || c === 'ArrowLeft') keys.left = false;
    else if (c === 'KeyD' || c === 'ArrowRight') keys.right = false;
    else if (c === 'ArrowUp') keys.up = false;
    else if (c === 'ArrowDown') keys.down = false;
    else if (c === 'Space') {
      if (S.teams && !typing(e.target)) { releaseFire(); e.preventDefault(); }
    }
  });
  window.addEventListener('blur', function () { keys.left = keys.right = keys.up = keys.down = false; });

  // Touch buttons
  Array.prototype.forEach.call(document.getElementById('pad').querySelectorAll('button'), function (b) {
    var k = b.getAttribute('data-k');
    function down(e) {
      e.preventDefault();
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') keys[k] = true;
      else if (k === 'jump') G.jumpReq = true;
      else if (k === 'skip') skipTurn();
      else if (k === 'fire') pressFire();
    }
    function up(e) {
      e.preventDefault();
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') keys[k] = false;
      else if (k === 'fire') releaseFire();
    }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', function () { if (k === 'left' || k === 'right' || k === 'up' || k === 'down') keys[k] = false; });
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  document.getElementById('weapons').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-w]');
    if (!b) return;
    setWeapon(b.getAttribute('data-w')); b.blur();
    invalidateWeapons();
  });
}
