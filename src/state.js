import { TURN_TIME, START_AIM, BANNER_TIME } from './config.js';
import { carve, terrain } from './terrain.js';

// Turn and control state.
export const G = {
  phase: 'menu', t: 0, active: null, timer: TURN_TIME, weapon: 'pistol', elev: START_AIM,
  charging: false, power: 0, fired: false, resolveT: 0, stableT: 0, jumpReq: false,
  banner: '', bannerT: 0, winner: -1
};

// Battle entities. teams is null when no battle is running.
//   ctl     held controls of the active player, set by applyIntent
//   fx      visual/sound events waiting to be played locally (see fx.js playFx)
//   out     when hosting online: events waiting to go out in the next snapshot
export const S = {
  teams: null, units: [], proj: [], booms: [], seed: 0, style: 'hills', projSeq: 0,
  ctl: { left: false, right: false, up: false, down: false },
  feedList: [], feedVersion: 0,
  fx: [], out: null
};

export function feed(msg) {
  S.feedList.unshift(msg);
  if (S.feedList.length > 4) S.feedList.pop();
  S.feedVersion++;
  if (S.out) S.out.feed.push(msg);
}

export function setBanner(txt) { G.banner = txt; G.bannerT = BANNER_TIME; }

// Queues a purely cosmetic event (particles, floating text, sound, shake).
export function emit(e) {
  S.fx.push(e);
  if (S.out) S.out.fx.push(e);
}

export function takeFx() { var e = S.fx; S.fx = []; return e; }

// Start or stop collecting outgoing events for snapshots (host only).
export function setRecording(on) {
  S.out = on ? { fx: [], feed: [] } : null;
  terrain.log = on ? [] : null;
}

/* ---------- Snapshots ----------
   { type:'snapshot', frame, g, units, proj, booms, teams, carves, fx, feed }
   carves, fx and feed only contain what happened since the previous snapshot. */
var frameNo = 0;

export function serializeSnapshot() {
  var units = S.units;
  var snap = {
    type: 'snapshot', frame: ++frameNo,
    g: {
      t: G.t, active: G.active ? units.indexOf(G.active) : -1, timer: G.timer, weapon: G.weapon,
      phase: G.phase, elev: G.elev, charging: G.charging, power: G.power, fired: G.fired,
      banner: G.banner, bannerT: G.bannerT, winner: G.winner
    },
    units: units.map(function (u) {
      return {
        x: u.x, y: u.y, vx: u.vx, vy: u.vy, hp: u.hp, alive: u.alive, face: u.face,
        onGround: u.onGround, moving: u.moving, walkT: u.walkT, hurtT: u.hurtT
      };
    }),
    proj: S.proj.map(function (p) {
      return { id: p.id, type: p.type, x: p.x, y: p.y, vx: p.vx, vy: p.vy, age: p.age, fuse: p.fuse === undefined ? null : p.fuse };
    }),
    booms: S.booms.map(function (b) { return { x: b.x, y: b.y, r: b.r, t: b.t }; }),
    teams: (S.teams || []).map(function (T) {
      var ammo = {};
      for (var k in T.ammo) ammo[k] = T.ammo[k] === Infinity ? -1 : T.ammo[k];
      return { ptr: T.ptr, ammo: ammo, stat: { dmg: T.stat.dmg, kills: T.stat.kills, shots: T.stat.shots } };
    }),
    carves: [], fx: [], feed: []
  };
  if (terrain.log) { snap.carves = terrain.log; terrain.log = []; }
  if (S.out) { snap.fx = S.out.fx; snap.feed = S.out.feed; S.out.fx = []; S.out.feed = []; }
  return snap;
}

// Interpolation bookkeeping for the guest: positions move smoothly from where they were drawn
// to the latest snapshot over one snapshot interval.
var lerp = { t0: 0, dur: 1000 / 30, last: 0, units: [], proj: {} };
var UNIT_SNAP_DIST = 80;
function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

// Applies a host snapshot on top of a battle built with the same cfg (see sim.setupBattle).
export function applySnapshot(snap) {
  if (!S.teams) return;
  var g = snap.g, t = now();
  if (lerp.last) lerp.dur = Math.min(120, Math.max(16, lerp.dur * 0.8 + (t - lerp.last) * 0.2));
  lerp.last = t; lerp.t0 = t;

  G.t = g.t; G.timer = g.timer; G.weapon = g.weapon; G.phase = g.phase; G.elev = g.elev;
  G.charging = g.charging; G.power = g.power; G.fired = g.fired;
  G.banner = g.banner; G.bannerT = g.bannerT; G.winner = g.winner;
  G.active = g.active >= 0 ? S.units[g.active] || null : null;

  lerp.units = snap.units.map(function (s, i) {
    var u = S.units[i];
    if (!u) return null;
    var from = { x: u.x, y: u.y };
    if (Math.abs(from.x - s.x) > UNIT_SNAP_DIST || Math.abs(from.y - s.y) > UNIT_SNAP_DIST) from = { x: s.x, y: s.y };
    u.x = s.x; u.y = s.y; u.vx = s.vx; u.vy = s.vy; u.hp = s.hp; u.alive = s.alive; u.face = s.face;
    u.onGround = s.onGround; u.moving = s.moving; u.walkT = s.walkT; u.hurtT = s.hurtT;
    return { x0: from.x, y0: from.y, x1: s.x, y1: s.y };
  });

  var prevProj = {};
  S.proj.forEach(function (p) { prevProj[p.id] = p; });
  var nextLerp = {};
  S.proj = snap.proj.map(function (s) {
    var p = { id: s.id, type: s.type, x: s.x, y: s.y, vx: s.vx, vy: s.vy, age: s.age };
    if (s.fuse !== null) p.fuse = s.fuse;
    var old = prevProj[s.id];
    nextLerp[s.id] = { x0: old ? old.x : s.x, y0: old ? old.y : s.y, x1: s.x, y1: s.y };
    return p;
  });
  lerp.proj = nextLerp;

  S.booms = snap.booms.map(function (b) { return { x: b.x, y: b.y, r: b.r, t: b.t }; });
  snap.teams.forEach(function (s, i) {
    var T = S.teams[i]; if (!T) return;
    T.ptr = s.ptr;
    for (var k in s.ammo) T.ammo[k] = s.ammo[k] === -1 ? Infinity : s.ammo[k];
    T.stat.dmg = s.stat.dmg; T.stat.kills = s.stat.kills; T.stat.shots = s.stat.shots;
  });
  snap.carves.forEach(function (c) { carve(c.x, c.y, c.r); });
  snap.fx.forEach(function (e) { S.fx.push(e); });
  snap.feed.forEach(feed);
}

// Guest only: moves drawn positions towards the latest snapshot. Call once per frame.
export function interpolateSnapshot() {
  var a = Math.min(1, Math.max(0, (now() - lerp.t0) / lerp.dur));
  lerp.units.forEach(function (l, i) {
    var u = S.units[i]; if (!l || !u) return;
    u.x = l.x0 + (l.x1 - l.x0) * a; u.y = l.y0 + (l.y1 - l.y0) * a;
  });
  S.proj.forEach(function (p) {
    var l = lerp.proj[p.id]; if (!l) return;
    p.x = l.x0 + (l.x1 - l.x0) * a; p.y = l.y0 + (l.y1 - l.y0) * a;
  });
}
