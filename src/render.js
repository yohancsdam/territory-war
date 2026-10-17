// Drawing and HUD. Reads game state, never modifies it.
import { W, H, WEAPONS, TEAM_COLORS } from './config.js';
import { G, S } from './state.js';
import { terrain, paintTerrain } from './terrain.js';
import { FX } from './fx.js';
import { rand } from './rng.js';
import { clamp } from './util.js';

var ctx = null, tCanvas = null, tctx = null, timg = null, paintedVersion = -1;
function $(id) { return document.getElementById(id); }

export function setupRender(canvas) {
  ctx = canvas.getContext('2d');
  tCanvas = document.createElement('canvas'); tCanvas.width = W; tCanvas.height = H;
  tctx = tCanvas.getContext('2d');
  timg = tctx.createImageData(W, H);
}

function syncTerrain() {
  if (paintedVersion === terrain.version) return;
  paintTerrain(timg.data);
  tctx.putImageData(timg, 0, 0);
  paintedVersion = terrain.version;
}

function drawSky(time) {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6fbfee'); g.addColorStop(1, '#d8f0ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,244,190,.9)'; ctx.beginPath(); ctx.arc(820, 90, 34, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (var i = 0; i < 4; i++) {
    var cx = ((i * 260 + time * 8 * (1 + i * 0.15)) % (W + 240)) - 120, cy = 60 + i * 38;
    ctx.beginPath(); ctx.ellipse(cx, cy, 50, 16, 0, 0, 6.283); ctx.ellipse(cx + 28, cy - 8, 32, 14, 0, 0, 6.283); ctx.ellipse(cx - 26, cy - 4, 28, 12, 0, 0, 6.283); ctx.fill();
  }
}
function drawUnit(u, isActive) {
  ctx.save();
  ctx.translate(Math.round(u.x), Math.round(u.y));
  var f = u.face, swing = u.moving ? Math.sin(u.walkT) * 5 : 0;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#15191d'; ctx.lineWidth = 2.4;
  var air = !u.onGround;
  // Legs
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.lineTo(air ? -5 : -swing, air ? -1 : 0);
  ctx.moveTo(0, -10); ctx.lineTo(air ? 5 : swing, air ? -2 : 0);
  // Body
  ctx.moveTo(0, -10); ctx.lineTo(0, -19);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  if (isActive && G.phase === 'play') {
    var ang = f === 1 ? -G.elev : Math.PI + G.elev;
    var ax = Math.cos(ang) * 8, ay = -17 + Math.sin(ang) * 8;
    ctx.moveTo(0, -17); ctx.lineTo(ax, ay);
    ctx.stroke();
    var wk = G.weapon, len = wk === 'sniper' ? 17 : (wk === 'bazooka' ? 15 : (wk === 'shotgun' ? 13 : 9));
    ctx.lineWidth = (wk === 'bazooka' || wk === 'sniper') ? 3.4 : 2.8;
    ctx.beginPath();
    if (wk === 'grenade' || wk === 'dynamite') {
      ctx.fillStyle = wk === 'grenade' ? '#3d6b35' : '#c62828';
      ctx.arc(ax + Math.cos(ang) * 3, ay + Math.sin(ang) * 3, 3, 0, 6.283); ctx.fill();
    } else {
      ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(ang) * len, ay + Math.sin(ang) * len); ctx.stroke();
    }
    ctx.lineWidth = 2.4;
  } else {
    ctx.moveTo(0, -17); ctx.lineTo(-5, -11); ctx.moveTo(0, -17); ctx.lineTo(5, -11);
    ctx.stroke();
  }
  // Head
  ctx.fillStyle = u.hurtT > 0 ? '#ff9c9c' : '#f4e9d8';
  ctx.beginPath(); ctx.arc(0, -24, 4.8, 0, 6.283); ctx.fill(); ctx.stroke();
  // Team helmet
  ctx.fillStyle = TEAM_COLORS[u.team];
  ctx.beginPath(); ctx.arc(0, -24, 5.4, Math.PI, 0); ctx.closePath(); ctx.fill();
  if (u.team === 1) { ctx.fillRect(f > 0 ? 2 : -8, -25, 6, 2); }
  ctx.restore();
  // Label
  var label = (isActive ? u.name + ' ' : '') + u.hp;
  ctx.font = '600 11px "Work Sans",system-ui,sans-serif';
  var tw = ctx.measureText(label).width + 14, lx = u.x - tw / 2, ly = u.y - 46;
  lx = clamp(lx, 2, W - tw - 2);
  ctx.fillStyle = 'rgba(12,20,26,.78)';
  ctx.beginPath(); ctx.rect(lx, ly, tw, 14); ctx.fill();
  ctx.fillStyle = TEAM_COLORS[u.team];
  if (u.team === 0) { ctx.beginPath(); ctx.arc(lx + 6, ly + 7, 3.2, 0, 6.283); ctx.fill(); }
  else ctx.fillRect(lx + 3, ly + 4, 6, 6);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(label, lx + 12, ly + 7.5);
  if (isActive && G.phase === 'play') {
    var by = ly - 8 + Math.sin(performance.now() / 180) * 2;
    ctx.fillStyle = TEAM_COLORS[u.team];
    ctx.beginPath(); ctx.moveTo(u.x - 6, by - 7); ctx.lineTo(u.x + 6, by - 7); ctx.lineTo(u.x, by + 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(12,20,26,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}
function drawProj(p) {
  if (p.type === 'bullet') {
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    ctx.strokeStyle = '#ffe082'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * 9, p.y - p.vy / sp * 9); ctx.stroke();
  } else if (p.type === 'rocket') {
    var a = Math.atan2(p.vy, p.vx);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
    ctx.fillStyle = '#4a4f55'; ctx.fillRect(-7, -2.5, 14, 5);
    ctx.fillStyle = '#d9434f'; ctx.beginPath(); ctx.moveTo(7, -2.5); ctx.lineTo(11, 0); ctx.lineTo(7, 2.5); ctx.fill();
    ctx.restore();
  } else if (p.type === 'grenade') {
    ctx.fillStyle = '#3d6b35'; ctx.strokeStyle = '#15191d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 6.283); ctx.fill(); ctx.stroke();
    fuseText(p);
  } else {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#c62828'; ctx.strokeStyle = '#15191d'; ctx.lineWidth = 1.5;
    ctx.fillRect(-2.5, -6, 5, 12); ctx.strokeRect(-2.5, -6, 5, 12);
    ctx.fillStyle = Math.floor(p.age * 10) % 2 ? '#ffd166' : '#fb8500';
    ctx.beginPath(); ctx.arc(0, -8, 2, 0, 6.283); ctx.fill();
    ctx.restore();
    fuseText(p);
  }
}
function fuseText(p) {
  ctx.font = '700 12px "Work Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(12,20,26,.85)';
  var t = String(Math.max(0, Math.ceil(p.fuse)));
  ctx.strokeText(t, p.x, p.y - 12); ctx.fillStyle = '#fff'; ctx.fillText(t, p.x, p.y - 12);
}
function drawReticle() {
  var u = G.active;
  if (!u || !u.alive || G.phase !== 'play') return;
  var ang = u.face === 1 ? -G.elev : Math.PI + G.elev;
  var ox = u.x, oy = u.y - 16, d = 56;
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(ox + Math.cos(ang) * 20, oy + Math.sin(ang) * 20); ctx.lineTo(ox + Math.cos(ang) * d, oy + Math.sin(ang) * d); ctx.stroke();
  ctx.setLineDash([]);
  var cx = ox + Math.cos(ang) * d, cy = oy + Math.sin(ang) * d;
  ctx.strokeStyle = '#15191d'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.283); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 10); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  if (G.charging) {
    var bw = 46, bx = u.x - bw / 2, by = u.y + 8;
    ctx.fillStyle = 'rgba(12,20,26,.8)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
    var pw = G.power;
    ctx.fillStyle = pw < 0.5 ? '#7bd67b' : (pw < 0.8 ? '#ffd166' : '#ef5350');
    ctx.fillRect(bx, by, bw * pw, 5);
  }
}

export function draw() {
  syncTerrain();
  var time = performance.now() / 1000;
  ctx.save();
  if (FX.shake > 0) ctx.translate(rand(-FX.shake, FX.shake), rand(-FX.shake, FX.shake));
  drawSky(time);
  ctx.drawImage(tCanvas, 0, 0);
  var vg = ctx.createLinearGradient(0, H - 46, 0, H);
  vg.addColorStop(0, 'rgba(30,10,40,0)'); vg.addColorStop(1, 'rgba(30,10,40,.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, H - 46, W, 46);
  if (S.teams) {
    S.booms.forEach(function (b) {
      var k = b.t / 0.4;
      ctx.fillStyle = 'rgba(255,210,100,' + (0.75 * (1 - k)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.5 + 0.8 * k), 0, 6.283); ctx.fill();
    });
    S.proj.forEach(drawProj);
    S.units.forEach(function (u) { if (u.alive && u !== G.active) drawUnit(u, false); });
    if (G.active && G.active.alive) drawUnit(G.active, true);
    FX.parts.forEach(function (q) {
      ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
      ctx.fillStyle = q.col; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    });
    ctx.globalAlpha = 1;
    drawReticle();
    ctx.font = '700 15px "Work Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    FX.texts.forEach(function (t) {
      ctx.globalAlpha = clamp(1.2 - t.t, 0, 1);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(12,20,26,.85)'; ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.col; ctx.fillText(t.txt, t.x, t.y);
    });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (S.teams && G.bannerT > 0 && G.phase !== 'over') {
    ctx.globalAlpha = clamp(G.bannerT, 0, 1);
    ctx.font = '800 34px "Big Shoulders Display",Impact,"Arial Narrow",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(G.banner).width + 40;
    ctx.fillStyle = 'rgba(12,20,26,.75)'; ctx.fillRect(W / 2 - tw / 2, 26, tw, 46);
    ctx.fillStyle = TEAM_COLORS[G.t]; ctx.fillRect(W / 2 - tw / 2, 26, 6, 46);
    ctx.fillStyle = '#fff'; ctx.fillText(G.banner, W / 2 + 3, 50);
    ctx.globalAlpha = 1;
  }
}

/* ---------- HUD ---------- */
var weaponSig = '', hudT = 0, feedSeen = -1;
export function invalidateWeapons() { weaponSig = ''; }

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
  $('who').textContent = G.active ? (teams[G.t].name + ': ' + G.active.name) : (G.phase === 'over' ? 'Battle over' : 'No battle');
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
