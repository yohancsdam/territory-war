// Keyboard, mouse and touch → plain intent objects. This module never reads or writes game
// state: the simulation receives intents through applyIntent(), wherever they come from.
//
// Intent shape: { left, right, up, down, jump, fireDown, fireUp, cancel, skip, weapon, aimX, aimY }
//   left/right/up/down  held buttons (booleans)
//   jump/fireDown/fireUp/cancel/skip  happened at least once since the last poll
//   weapon  weapon key picked since the last poll, or null
//   aimX/aimY  last pointer position on the battlefield (canvas px) since the last poll, or null
import { W, H, WEAPONS } from './config.js';
import { ac } from './audio.js';

var held = { left: false, right: false, up: false, down: false };
var edges = freshEdges();
var enabled = false;

function freshEdges() {
  return { jump: false, fireDown: false, fireUp: false, cancel: false, skip: false, weapon: null, aimX: null, aimY: null };
}

// Returns the current intent and clears the one-shot events.
export function pollIntent() {
  var it = {
    left: held.left, right: held.right, up: held.up, down: held.down,
    jump: edges.jump, fireDown: edges.fireDown, fireUp: edges.fireUp, cancel: edges.cancel, skip: edges.skip,
    weapon: edges.weapon, aimX: edges.aimX, aimY: edges.aimY
  };
  edges = freshEdges();
  return it;
}

// When disabled (menus, game over) keys are left alone so forms keep working.
export function setInputEnabled(v) {
  v = !!v;
  if (v === enabled) return;
  enabled = v;
  releaseAll();
  edges = freshEdges();
}

function releaseAll() { held.left = held.right = held.up = held.down = false; }
function typing(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }
var weaponKeys = {};
WEAPONS.forEach(function (w, i) { weaponKeys['Digit' + (i + 1)] = w.key; });

export function setupInput(cv) {
  function aimFrom(e) {
    var r = cv.getBoundingClientRect();
    edges.aimX = (e.clientX - r.left) * W / r.width;
    edges.aimY = (e.clientY - r.top) * H / r.height;
  }
  cv.addEventListener('pointermove', function (e) { if (enabled) aimFrom(e); });
  cv.addEventListener('pointerdown', function (e) {
    if (!enabled) return;
    e.preventDefault();
    ac();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    if (e.button === 2) { edges.cancel = true; return; }
    aimFrom(e); edges.fireDown = true;
  });
  cv.addEventListener('pointerup', function (e) { if (enabled && e.button !== 2) edges.fireUp = true; });
  cv.addEventListener('pointercancel', function () { if (enabled) edges.cancel = true; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); if (enabled) edges.cancel = true; });

  window.addEventListener('keydown', function (e) {
    if (!enabled || typing(e.target)) return;
    var c = e.code, handled = true;
    if (c === 'KeyA' || c === 'ArrowLeft') held.left = true;
    else if (c === 'KeyD' || c === 'ArrowRight') held.right = true;
    else if (c === 'ArrowUp') held.up = true;
    else if (c === 'ArrowDown') held.down = true;
    else if (c === 'KeyW') { if (!e.repeat) edges.jump = true; }
    else if (c === 'Space') { if (!e.repeat) { ac(); edges.fireDown = true; } }
    else if (c === 'Escape') edges.cancel = true;
    else if (weaponKeys[c]) edges.weapon = weaponKeys[c];
    else handled = false;
    if (handled) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    var c = e.code;
    if (c === 'KeyA' || c === 'ArrowLeft') held.left = false;
    else if (c === 'KeyD' || c === 'ArrowRight') held.right = false;
    else if (c === 'ArrowUp') held.up = false;
    else if (c === 'ArrowDown') held.down = false;
    else if (c === 'Space') {
      if (enabled && !typing(e.target)) { edges.fireUp = true; e.preventDefault(); }
    }
  });
  window.addEventListener('blur', releaseAll);

  // Touch buttons
  Array.prototype.forEach.call(document.getElementById('pad').querySelectorAll('button'), function (b) {
    var k = b.getAttribute('data-k');
    var isHeld = k === 'left' || k === 'right' || k === 'up' || k === 'down';
    function down(e) {
      e.preventDefault();
      if (!enabled) return;
      ac();
      if (isHeld) held[k] = true;
      else if (k === 'jump') edges.jump = true;
      else if (k === 'skip') edges.skip = true;
      else if (k === 'fire') edges.fireDown = true;
    }
    function up(e) {
      e.preventDefault();
      if (isHeld) held[k] = false;
      else if (k === 'fire' && enabled) edges.fireUp = true;
    }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', function () { if (isHeld) held[k] = false; });
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  document.getElementById('weapons').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-w]');
    if (!b) return;
    b.blur();
    if (enabled) edges.weapon = b.getAttribute('data-w');
  });
}
