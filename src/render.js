// Drawing and HUD. Reads game state, never modifies it.
import { W, H, WEAPONS, TEAM_COLORS } from './config.js';
import { G, S } from './state.js';
import { terrain, paintTerrain } from './terrain.js';
import { FX } from './fx.js';
import { rand, mulberry32 } from './rng.js';
import { clamp } from './util.js';

var TEAM_DARK = ['#8e2530', '#24509c'];
var INK = '#15191d';
var SKIN = '#f2d2ae';

var ctx = null, tCanvas = null, tctx = null, timg = null, paintedVersion = -1;
var bgCanvas = null, bgKey = '', clouds = [], vignette = null;
function $(id) { return document.getElementById(id); }

export function setupRender(canvas) {
  ctx = canvas.getContext('2d');
  tCanvas = document.createElement('canvas'); tCanvas.width = W; tCanvas.height = H;
  tctx = tCanvas.getContext('2d');
  timg = tctx.createImageData(W, H);
  bgCanvas = document.createElement('canvas'); bgCanvas.width = W; bgCanvas.height = H;
  for (var i = 0; i < 3; i++) clouds.push(makeCloud(i));
  vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  vignette.addColorStop(0, 'rgba(10,20,30,0)'); vignette.addColorStop(1, 'rgba(10,20,30,.28)');
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
}

/* ---------- Background (sky, far scenery, clouds, water) ---------- */
var SKIES = {
  hills: { sky: ['#3d8fd8', '#9fd6f5', '#e2f4ff'], sun: [800, 92, 30], far: ['#a3c6dd', '#88b79d', '#6ea47e'], water: ['#3c8fd0', '#1b4b80'] },
  islands: { sky: ['#2a5fae', '#79c0ec', '#d6f0ff'], sun: [160, 80, 26], far: ['#b2cfe6', '#9cc0dc'], water: ['#2f7fc4', '#123766'] },
  canyon: { sky: ['#5a98cd', '#f0c68c', '#f8ddb0'], sun: [770, 120, 38], far: ['#e2b48c', '#cf9568', '#bd7f55'], water: ['#4d8aa8', '#21495f'] }
};

function makeCloud(i) {
  var c = document.createElement('canvas'); c.width = 180; c.height = 80;
  var x = c.getContext('2d'), r = mulberry32(31 + i * 7);
  for (var k = 0; k < 9; k++) {
    var cx = 30 + r() * 120, cy = 38 + (r() - 0.5) * 18, rad = 16 + r() * 18;
    var g = x.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.7, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 6.283); x.fill();
  }
  return c;
}

function ridge(c, rng, base, amp, color, mesa) {
  var p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28;
  var f1 = 0.004 + rng() * 0.003, f2 = 0.012 + rng() * 0.006, f3 = 0.035 + rng() * 0.02;
  c.fillStyle = color; c.beginPath(); c.moveTo(0, H);
  for (var x = 0; x <= W + 4; x += 4) {
    var y;
    if (mesa) {
      var v = Math.sin(x * f1 + p1) + 0.6 * Math.sin(x * f2 + p2);
      var s = clamp((v - 0.1) * 5, 0, 1);
      y = base - amp * (0.25 + 0.75 * s) - amp * 0.04 * Math.sin(x * f3 + p3);
    } else {
      y = base - amp * (0.5 + 0.5 * Math.sin(x * f1 + p1)) * 0.7 - amp * 0.3 * Math.sin(x * f2 + p2) - amp * 0.07 * Math.sin(x * f3 + p3);
    }
    c.lineTo(x, y);
  }
  c.lineTo(W, H); c.closePath(); c.fill();
}

function buildBackground(style, seed) {
  var c = bgCanvas.getContext('2d'), sk = SKIES[style] || SKIES.hills, rng = mulberry32((seed ^ 0x5eed) >>> 0);
  var g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sk.sky[0]); g.addColorStop(0.62, sk.sky[1]); g.addColorStop(1, sk.sky[2]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  var sx = sk.sun[0], sy = sk.sun[1], sr = sk.sun[2];
  var glow = c.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4.5);
  glow.addColorStop(0, 'rgba(255,246,210,.55)'); glow.addColorStop(1, 'rgba(255,246,210,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(sx, sy, sr, 0, 6.283); c.fill();
  if (style === 'islands') {
    for (var i = 0; i < 8; i++) {
      var ix = 30 + rng() * (W - 60), iy = 90 + rng() * 150, iw = 12 + rng() * 26, ih = iw * (0.6 + rng() * 0.4);
      c.globalAlpha = 0.55 + rng() * 0.25;
      c.fillStyle = i % 2 ? sk.far[0] : sk.far[1];
      c.beginPath(); c.moveTo(ix - iw, iy); c.quadraticCurveTo(ix - iw * 0.6, iy + ih, ix, iy + ih * 1.1);
      c.quadraticCurveTo(ix + iw * 0.6, iy + ih, ix + iw, iy); c.closePath(); c.fill();
      c.fillStyle = '#9fcfa8'; c.fillRect(ix - iw, iy - 2, iw * 2, 2.5);
    }
    c.globalAlpha = 1;
    var fog = c.createLinearGradient(0, H * 0.6, 0, H);
    fog.addColorStop(0, 'rgba(255,255,255,0)'); fog.addColorStop(1, 'rgba(235,247,255,.8)');
    c.fillStyle = fog; c.fillRect(0, H * 0.6, W, H * 0.4);
  } else {
    var mesa = style === 'canyon';
    ridge(c, rng, mesa ? 330 : 320, mesa ? 120 : 130, sk.far[0], mesa);
    ridge(c, rng, mesa ? 385 : 375, mesa ? 80 : 70, sk.far[1], mesa);
    ridge(c, rng, mesa ? 430 : 420, mesa ? 45 : 40, sk.far[2], mesa);
  }
}

function drawBackground(time) {
  var key = terrain.style + '|' + S.seed;
  if (key !== bgKey) { buildBackground(terrain.style, S.seed); bgKey = key; }
  ctx.drawImage(bgCanvas, 0, 0);
  for (var i = 0; i < 6; i++) {
    var sp = clouds[i % 3], sc = 0.55 + (i % 3) * 0.25;
    var cx = ((i * 211 + time * (5 + i * 1.7)) % (W + 260)) - 200, cy = 30 + ((i * 53) % 150);
    ctx.globalAlpha = 0.65 + (i % 2) * 0.25;
    ctx.drawImage(sp, cx, cy, sp.width * sc, sp.height * sc);
  }
  ctx.globalAlpha = 1;
}

function drawWater(time) {
  var sk = SKIES[terrain.style] || SKIES.hills, y0 = H - 20;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (var x = 0; x <= W; x += 8) ctx.lineTo(x, y0 + Math.sin(x * 0.035 + time * 1.8) * 2.2 + Math.sin(x * 0.013 - time * 1.1) * 1.6);
  ctx.lineTo(W, H); ctx.closePath();
  var g = ctx.createLinearGradient(0, y0 - 4, 0, H);
  g.addColorStop(0, sk.water[0]); g.addColorStop(1, sk.water[1]);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (x = 0; x <= W; x += 8) {
    var y = y0 + Math.sin(x * 0.035 + time * 1.8) * 2.2 + Math.sin(x * 0.013 - time * 1.1) * 1.6;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function syncTerrain() {
  if (paintedVersion === terrain.version) return;
  paintTerrain(timg.data);
  tctx.putImageData(timg, 0, 0);
  paintedVersion = terrain.version;
}

/* ---------- Soldiers ---------- */
function drawWeapon(ax, ay, ang, f, wk, time) {
  ctx.save();
  ctx.translate(ax, ay); ctx.rotate(ang);
  if (f < 0) ctx.scale(1, -1);
  ctx.lineWidth = 1;
  if (wk === 'pistol') {
    ctx.fillStyle = '#2b2f35'; ctx.fillRect(-1, -1.6, 8, 3); ctx.fillRect(-0.5, 0, 2.4, 3.6);
  } else if (wk === 'shotgun') {
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(-7, -1.4, 6, 3.6);
    ctx.fillStyle = '#383d44'; ctx.fillRect(-2, -1.8, 16, 2.4);
    ctx.fillStyle = '#6b4426'; ctx.fillRect(5, 0.5, 5, 1.8);
  } else if (wk === 'sniper') {
    ctx.fillStyle = '#5d6a46'; ctx.fillRect(-8, -1.4, 7, 3.8);
    ctx.fillStyle = '#2b2f35'; ctx.fillRect(-2, -1.2, 21, 2);
    ctx.fillStyle = INK; ctx.fillRect(1, -4.4, 7, 2.4);
    ctx.fillStyle = '#7fd0ff'; ctx.fillRect(7.4, -4.1, 1, 1.8);
  } else if (wk === 'bazooka') {
    ctx.fillStyle = '#56633f'; ctx.fillRect(-7, -3, 21, 6);
    ctx.fillStyle = '#3e4a2c'; ctx.fillRect(-7, -3, 2, 6); ctx.fillRect(4, -3, 1.6, 6); ctx.fillRect(12, -3.4, 2.4, 6.8);
    ctx.fillStyle = INK; ctx.fillRect(2, 3, 2, 2.5);
  } else if (wk === 'grenade') {
    ctx.fillStyle = '#3f6e36'; ctx.beginPath(); ctx.arc(3, 0, 3.4, 0, 6.283); ctx.fill();
    ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(1.6, -1.8, 1.2, 1.2);
  } else if (wk === 'dynamite') {
    ctx.fillStyle = '#c62828'; ctx.fillRect(0, -2.2, 8, 4.4);
    ctx.fillStyle = '#f2d6a0'; ctx.fillRect(3, -2.2, 1.2, 4.4);
    ctx.strokeStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.quadraticCurveTo(10, -3, 11, -2); ctx.stroke();
    spark(11, -2, time);
  }
  ctx.restore();
}

function spark(x, y, time) {
  var fl = 0.6 + 0.4 * Math.sin(time * 40);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,190,80,' + (0.35 * fl).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(x, y, 1.1 + fl * 0.6, 0, 6.283); ctx.fill();
  ctx.restore();
}

function drawUnit(u, isActive, time) {
  var x = Math.round(u.x), y = Math.round(u.y), f = u.face, air = !u.onGround;
  var swing = u.moving ? Math.sin(u.walkT) * 5 : 0;
  if (!air) {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(x, y + 1, 7, 2, 0, 0, 6.283); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Legs and boots
  var lx = air ? -5 : -swing, ly = air ? -1 : 0, rx = air ? 5 : swing, ry = air ? -2 : 0;
  ctx.strokeStyle = '#262b31'; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(lx, ly); ctx.moveTo(0, -10); ctx.lineTo(rx, ry); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(lx - 1.5 + f, ly - 1.2, 3.6, 2.2); ctx.fillRect(rx - 1.5 + f, ry - 1.2, 3.6, 2.2);
  // Torso in team colours
  ctx.strokeStyle = INK; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -19); ctx.stroke();
  ctx.strokeStyle = TEAM_COLORS[u.team]; ctx.lineWidth = 4.6; ctx.stroke();
  ctx.fillStyle = TEAM_DARK[u.team]; ctx.fillRect(-2.6, -11.6, 5.2, 1.6);
  // Arms
  ctx.strokeStyle = TEAM_DARK[u.team]; ctx.lineWidth = 2.6;
  if (isActive && G.phase === 'play') {
    var ang = f === 1 ? -G.elev : Math.PI + G.elev;
    var ax = Math.cos(ang) * 7, ay = -17 + Math.sin(ang) * 7;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(ax, ay); ctx.stroke();
    drawWeapon(ax, ay, ang, f, G.weapon, time);
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(ax, ay, 1.5, 0, 6.283); ctx.fill();
  } else {
    var sw = u.moving ? Math.sin(u.walkT) * 2.5 : 0;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(-4 + sw, -11); ctx.moveTo(0, -17); ctx.lineTo(4 - sw, -11); ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.arc(-4 + sw, -11, 1.4, 0, 6.283); ctx.arc(4 - sw, -11, 1.4, 0, 6.283); ctx.fill();
  }
  // Head, eye, helmet
  ctx.fillStyle = u.hurtT > 0 ? '#ff9c9c' : SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -24, 4.8, 0, 6.283); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(f * 2.2, -24.3, 0.95, 0, 6.283); ctx.fill();
  ctx.fillStyle = TEAM_COLORS[u.team];
  ctx.beginPath(); ctx.arc(0, -25, 5.6, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = TEAM_DARK[u.team]; ctx.fillRect(f > 0 ? 0 : -7.5, -25.6, 7.5, 1.8);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, -25, 3.6, Math.PI * 1.2, Math.PI * 1.5); ctx.stroke();
  ctx.restore();

  // Name / health tag. Red uses a round marker, blue a square one, so teams don't rely on colour alone.
  var label = (isActive ? u.name + ' ' : '') + u.hp;
  ctx.font = '600 11px "Work Sans",system-ui,sans-serif';
  var tw = ctx.measureText(label).width + 16, lx2 = clamp(u.x - tw / 2, 2, W - tw - 2), ly2 = u.y - 50;
  ctx.fillStyle = 'rgba(12,20,26,.8)'; rr(ctx, lx2, ly2, tw, 17, 4); ctx.fill();
  ctx.fillStyle = TEAM_COLORS[u.team];
  if (u.team === 0) { ctx.beginPath(); ctx.arc(lx2 + 7, ly2 + 7, 3.2, 0, 6.283); ctx.fill(); }
  else ctx.fillRect(lx2 + 4, ly2 + 4, 6, 6);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(label, lx2 + 13, ly2 + 7.5);
  var frac = clamp(u.hp / u.max, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(lx2 + 3, ly2 + 13, tw - 6, 2);
  ctx.fillStyle = frac > 0.5 ? '#7bd67b' : (frac > 0.25 ? '#ffd166' : '#ef5350');
  ctx.fillRect(lx2 + 3, ly2 + 13, (tw - 6) * frac, 2);
  if (isActive && G.phase === 'play') {
    var by = ly2 - 8 + Math.sin(time * 5.5) * 2;
    ctx.fillStyle = TEAM_COLORS[u.team];
    ctx.beginPath(); ctx.moveTo(u.x - 6, by - 7); ctx.lineTo(u.x + 6, by - 7); ctx.lineTo(u.x, by + 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(12,20,26,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

/* ---------- Projectiles ---------- */
function drawProj(p, time) {
  var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
  if (p.type === 'bullet') {
    var tx = p.x - p.vx / sp * 18, ty = p.y - p.vy / sp * 18;
    var g = ctx.createLinearGradient(tx, ty, p.x, p.y);
    g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(1, 'rgba(255,250,215,1)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = g; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
  } else if (p.type === 'rocket') {
    var a = Math.atan2(p.vy, p.vx), fl = 6 + Math.random() * 6;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var fg = ctx.createLinearGradient(-7 - fl, 0, -7, 0);
    fg.addColorStop(0, 'rgba(255,120,30,0)'); fg.addColorStop(1, 'rgba(255,230,140,.95)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-7, -2.4); ctx.lineTo(-7 - fl, 0); ctx.lineTo(-7, 2.4); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#3c4148';
    ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-9.5, -5); ctx.lineTo(-4, -2.5); ctx.moveTo(-7, 2.5); ctx.lineTo(-9.5, 5); ctx.lineTo(-4, 2.5); ctx.fill();
    ctx.fillStyle = '#5f666e'; ctx.fillRect(-7, -2.5, 14, 5);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-7, -2.5, 14, 1.2);
    ctx.fillStyle = '#d9434f'; ctx.beginPath(); ctx.moveTo(7, -2.5); ctx.lineTo(11.5, 0); ctx.lineTo(7, 2.5); ctx.fill();
    ctx.restore();
  } else if (p.type === 'grenade') {
    ctx.fillStyle = '#3f6e36'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b4d26'; ctx.fillRect(p.x - 1.5, p.y - 6.5, 3, 2.4);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1.6, 1.3, 0, 6.283); ctx.fill();
    fuseText(p);
  } else {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#c62828'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.fillRect(-2.5, -6, 5, 12); ctx.strokeRect(-2.5, -6, 5, 12);
    ctx.fillStyle = '#f2d6a0'; ctx.fillRect(-2.5, -1, 5, 2);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(2, -9, 0.5, -10); ctx.stroke();
    spark(0.5, -10, time);
    ctx.restore();
    fuseText(p);
  }
}
function fuseText(p) {
  ctx.font = '700 12px "Work Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(12,20,26,.85)';
  var t = String(Math.max(0, Math.ceil(p.fuse)));
  ctx.strokeText(t, p.x, p.y - 14); ctx.fillStyle = '#fff'; ctx.fillText(t, p.x, p.y - 14);
}

/* ---------- Explosions, particles, flashes ---------- */
function drawBooms() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  S.booms.forEach(function (b) {
    var k = clamp(b.t / 0.4, 0, 1), a = 1 - k, r = b.r * (0.55 + 0.75 * k);
    var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    g.addColorStop(0, 'rgba(255,255,235,' + a.toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(255,196,80,' + (a * 0.9).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.283); ctx.fill();
  });
  ctx.restore();
  S.booms.forEach(function (b) {
    var k = clamp(b.t / 0.4, 0, 1);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - k)).toFixed(3) + ')';
    ctx.lineWidth = 1 + 4 * (1 - k);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + 1.1 * k), 0, 6.283); ctx.stroke();
  });
}

function drawParticles() {
  var i, q, a;
  for (i = 0; i < FX.parts.length; i++) {
    q = FX.parts[i]; if (q.kind === 'spark') continue;
    a = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.col;
    if (q.kind === 'smoke') {
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, 6.283); ctx.fill();
    } else {
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < FX.parts.length; i++) {
    q = FX.parts[i]; if (q.kind !== 'spark') continue;
    a = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.col;
    ctx.globalAlpha = a * 0.25; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * 1.8, 0, 6.283); ctx.fill();
    ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * 0.6, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

function drawFlashes() {
  if (!FX.flashes.length) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  FX.flashes.forEach(function (f) {
    var a = 1 - f.t / 0.09, s = f.size;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12 * s);
    g.addColorStop(0, 'rgba(255,250,220,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12 * s, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,150,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(0, -2.5 * s); ctx.lineTo(14 * s, 0); ctx.lineTo(0, 2.5 * s); ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

function drawReticle() {
  var u = G.active;
  if (!u || !u.alive || G.phase !== 'play') return;
  var ang = u.face === 1 ? -G.elev : Math.PI + G.elev;
  var ox = u.x, oy = u.y - 16, d = 58;
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(ox + Math.cos(ang) * 22, oy + Math.sin(ang) * 22); ctx.lineTo(ox + Math.cos(ang) * (d - 8), oy + Math.sin(ang) * (d - 8)); ctx.stroke();
  ctx.setLineDash([]);
  var cx = ox + Math.cos(ang) * d, cy = oy + Math.sin(ang) * d;
  ctx.strokeStyle = INK; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.283); ctx.moveTo(cx - 11, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 11, cy); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 11); ctx.stroke();
  ctx.strokeStyle = TEAM_COLORS[u.team]; ctx.lineWidth = 1.6; ctx.stroke();
  if (G.charging) {
    var bw = 50, bx = u.x - bw / 2, by = u.y + 8, pw = G.power;
    ctx.fillStyle = 'rgba(12,20,26,.85)'; rr(ctx, bx - 3, by - 3, bw + 6, 11, 4); ctx.fill();
    var g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#7bd67b'); g.addColorStop(0.6, '#ffd166'); g.addColorStop(1, '#ef5350');
    ctx.fillStyle = g; rr(ctx, bx, by, Math.max(2, bw * pw), 5, 2.5); ctx.fill();
  }
}

/* ---------- Frame ---------- */
export function draw() {
  syncTerrain();
  var time = performance.now() / 1000;
  ctx.save();
  if (FX.shake > 0) ctx.translate(rand(-FX.shake, FX.shake), rand(-FX.shake, FX.shake));
  drawBackground(time);
  drawWater(time);
  ctx.drawImage(tCanvas, 0, 0);
  if (S.teams) {
    S.proj.forEach(function (p) { drawProj(p, time); });
    S.units.forEach(function (u) { if (u.alive && u !== G.active) drawUnit(u, false, time); });
    if (G.active && G.active.alive) drawUnit(G.active, true, time);
    drawParticles();
    drawBooms();
    drawFlashes();
    drawReticle();
    ctx.font = '800 16px "Work Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    FX.texts.forEach(function (t) {
      var s = 1 + Math.max(0, 0.18 - t.t) * 3;
      ctx.save(); ctx.translate(t.x, t.y); ctx.scale(s, s);
      ctx.globalAlpha = clamp(1.2 - t.t, 0, 1);
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(12,20,26,.9)'; ctx.strokeText(t.txt, 0, 0);
      ctx.fillStyle = t.col; ctx.fillText(t.txt, 0, 0);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  if (S.teams && G.bannerT > 0 && G.phase !== 'over') {
    ctx.globalAlpha = clamp(G.bannerT, 0, 1);
    ctx.font = '800 34px "Big Shoulders Display",Impact,"Arial Narrow",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(G.banner).width + 44, bx = W / 2 - tw / 2;
    ctx.fillStyle = 'rgba(12,20,26,.78)'; rr(ctx, bx, 24, tw, 48, 8); ctx.fill();
    ctx.fillStyle = TEAM_COLORS[G.t]; rr(ctx, bx, 24, 7, 48, [8, 0, 0, 8]); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(G.banner, W / 2 + 3, 49);
    ctx.globalAlpha = 1;
  }
}

/* ---------- HUD ---------- */
var weaponSig = '', hudT = 0, feedSeen = -1, perspective = -1;
export function invalidateWeapons() { weaponSig = ''; }
// Online: which team this screen plays (0 or 1), so the HUD can say "your turn". -1 = local.
export function setPerspective(team) { perspective = team; }

function renderFeed() {
  if (feedSeen === S.feedVersion) return;
  feedSeen = S.feedVersion;
  var ul = $('feed');
  ul.innerHTML = '';
  S.feedList.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
}

export function updateHUD(dt) {
  renderFeed();
  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  var teams = S.teams;
  if (!teams) return;
  for (var t = 0; t < 2; t++) {
    var T = teams[t], hp = 0, mx = 0, al = 0;
    T.units.forEach(function (u) { mx += u.max; hp += Math.max(0, u.hp); if (u.alive) al++; });
    $('tn' + t).textContent = T.name;
    $('ts' + t).textContent = al + ' of ' + T.units.length + ' soldiers, ' + hp + ' HP';
    $('tb' + t).style.width = (mx ? hp / mx * 100 : 0) + '%';
    $('team' + t).className = 'team c' + t + ((G.phase === 'play' || G.phase === 'resolve') && G.t === t ? ' on' : '');
  }
  $('timer').textContent = G.phase === 'play' ? Math.ceil(G.timer) : (G.phase === 'resolve' ? '…' : '--');
  var who = G.active ? (teams[G.t].name + ': ' + G.active.name) : (G.phase === 'over' ? 'Battle over' : 'No battle');
  if (G.active && perspective >= 0) who = (G.t === perspective ? 'Your turn: ' : "Opponent's turn: ") + G.active.name;
  $('who').textContent = who;
  var sig = G.t + '|' + G.weapon + '|' + G.phase + '|' + WEAPONS.map(function (x) { return teams[G.t].ammo[x.key]; }).join(',');
  if (sig !== weaponSig) {
    weaponSig = sig;
    var h = '';
    WEAPONS.forEach(function (w2, i) {
      var am = teams[G.t].ammo[w2.key], txt = am === Infinity ? 'unlimited' : am + ' left';
      h += '<button type="button" data-w="' + w2.key + '" aria-pressed="' + (G.weapon === w2.key) + '"' + (am > 0 ? '' : ' disabled') + '>' + (i + 1) + '. ' + w2.name + '<small>' + txt + '</small></button>';
    });
    $('weapons').innerHTML = h;
  }
}
