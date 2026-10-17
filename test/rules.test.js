import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DT, H, TEAM_SIZE, TURN_TIME } from '../src/config.js';
import { G, S, serializeSnapshot, applySnapshot, setRecording } from '../src/state.js';
import { startBattle, setupBattle, step, applyIntent } from '../src/sim.js';
import { genTerrain, hashMask, groundY } from '../src/terrain.js';
import { explode } from '../src/weapons.js';
import { hurt } from '../src/units.js';

const CFG = { names: ['Red', 'Blue'], hp: 100, style: 'hills', seed: 1234 };

function run(seconds) { for (let i = 0; i < Math.round(seconds / DT); i++) step(DT); }
function runUntil(pred, maxSeconds = 30) {
  const n = Math.round(maxSeconds / DT);
  for (let i = 0; i < n; i++) { if (pred()) return true; step(DT); }
  return pred();
}
// Skips the current turn and waits for the next one to start.
function passTurn() {
  const before = G.active;
  applyIntent({ skip: true });
  expect(G.phase).toBe('resolve');
  expect(runUntil(() => G.phase === 'over' || (G.phase === 'play' && G.active !== before))).toBe(true);
}
// The snapshot without the parts that only describe "what happened since last time".
function stable(snap) {
  const { frame, carves, fx, feed, ...rest } = snap;
  return rest;
}

beforeEach(() => { setRecording(false); startBattle({ ...CFG }); });
afterEach(() => setRecording(false));

describe('turns', () => {
  it('red starts and turns alternate red → blue → red', () => {
    expect(G.t).toBe(0);
    expect(G.active.team).toBe(0);
    passTurn();
    expect(G.t).toBe(1);
    expect(G.active.team).toBe(1);
    passTurn();
    expect(G.t).toBe(0);
  });

  it('soldiers rotate in order within a team and wrap around', () => {
    const red = [];
    for (let i = 0; i <= TEAM_SIZE; i++) {
      expect(G.t).toBe(0);
      red.push(G.active.name);
      passTurn(); // red
      passTurn(); // blue
    }
    const order = S.teams[0].units.map(u => u.name);
    expect(red).toEqual([...order, order[0]]);
  });

  it('a dead soldier is skipped and the next living one of the same team plays', () => {
    const [rex, ana, pipo] = S.teams[0].units;
    hurt(ana, 1000, 1);
    expect(ana.alive).toBe(false);
    expect(G.active).toBe(rex);
    passTurn();
    passTurn();
    expect(G.active).toBe(pipo);
  });

  it('when the timer runs out the turn is lost without firing', () => {
    expect(G.timer).toBe(TURN_TIME);
    expect(runUntil(() => G.phase === 'resolve', TURN_TIME + 1)).toBe(true);
    expect(G.fired).toBe(false);
    expect(S.teams[0].stat.shots).toBe(0);
    expect(runUntil(() => G.phase === 'play')).toBe(true);
    expect(G.t).toBe(1);
  });

  it('only one shot per turn', () => {
    applyIntent({ fireDown: true, aimX: 900, aimY: 0 });
    expect(G.fired).toBe(true);
    const shots = S.teams[0].stat.shots;
    applyIntent({ fireDown: true });
    expect(S.teams[0].stat.shots).toBe(shots);
  });
});

describe('victory', () => {
  it('the battle ends when a team loses all 6 soldiers', () => {
    const blue = S.teams[1].units;
    expect(blue.length).toBe(6);
    blue.slice(0, 5).forEach(u => hurt(u, 1000, 0));
    run(0.5);
    expect(G.phase).toBe('play');
    hurt(blue[5], 1000, 0);
    expect(runUntil(() => G.phase === 'over')).toBe(true);
    expect(G.winner).toBe(0);
  });

  it('both teams wiped out at once is a draw', () => {
    S.units.forEach(u => hurt(u, 1000, 0));
    expect(runUntil(() => G.phase === 'over')).toBe(true);
    expect(G.winner).toBe(-1);
  });
});

describe('combat', () => {
  it('friendly fire: explosions hurt soldiers of the same team', () => {
    const ally = S.teams[0].units[1];
    explode(ally.x, ally.y - 13, 42, 55, 420, 0);
    expect(ally.hp).toBeLessThan(100);
  });

  it('falling from very high does not hurt', () => {
    const u = S.teams[1].units[2];
    expect(groundY(u.x)).toBeGreaterThan(100);
    u.y = 5; u.vx = 0; u.vy = 0; u.onGround = false;
    run(0.05);
    expect(u.onGround).toBe(false);
    expect(runUntil(() => u.onGround, 5)).toBe(true);
    expect(u.alive).toBe(true);
    expect(u.hp).toBe(100);
  });

  it('leaving the map kills the soldier', () => {
    const [a, b] = S.teams[1].units;
    a.x = -40; a.onGround = false;
    b.y = H + 50; b.onGround = false;
    step(DT);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
  });
});

describe('seeded terrain', () => {
  it('the same seed and style always produce the same terrain', () => {
    for (const style of ['hills', 'islands', 'canyon', 'random']) {
      genTerrain(style, 777);
      const a = hashMask();
      genTerrain(style, 777);
      expect(hashMask()).toBe(a);
      genTerrain(style, 778);
      expect(hashMask()).not.toBe(a);
    }
  });

  it('the same cfg places the soldiers in the same spots', () => {
    const spots = () => S.units.map(u => [u.x, u.y]);
    const a = spots();
    startBattle({ ...CFG });
    expect(spots()).toEqual(a);
  });
});

describe('snapshots', () => {
  // Gets a battle into an interesting state: a crater, damage, a rocket in the air.
  function midBattle() {
    setRecording(true);
    explode(480, 300, 40, 30, 200, 0);
    applyIntent({ weapon: 'bazooka', aimX: G.active.x + 60, aimY: 0 });
    applyIntent({ fireDown: true });
    run(0.3);
    applyIntent({ fireUp: true });
    run(0.1);
    expect(S.proj.length).toBe(1);
  }

  it('applySnapshot(serializeSnapshot()) leaves the state equivalent', () => {
    midBattle();
    const snap = JSON.parse(JSON.stringify(serializeSnapshot()));
    const hash = hashMask();
    applySnapshot(snap);
    expect(stable(serializeSnapshot())).toEqual(stable(snap));
    expect(hashMask()).toBe(hash);
  });

  it('a fresh replica built from the same cfg matches the host after one snapshot', () => {
    midBattle();
    const hostHash = hashMask();
    const snap = JSON.parse(JSON.stringify(serializeSnapshot()));
    expect(snap.carves.length).toBeGreaterThan(0);

    // Guest side: same cfg (seed), then the host's snapshot.
    setRecording(false);
    setupBattle({ ...CFG });
    expect(hashMask()).not.toBe(hostHash);
    applySnapshot(snap);
    expect(hashMask()).toBe(hostHash);
    expect(stable(serializeSnapshot())).toEqual(stable(snap));
    expect(G.active).toBe(S.units[snap.g.active]);
  });
});

describe('applyIntent', () => {
  it('ignores malformed fields', () => {
    applyIntent({ weapon: 'laser', aimX: NaN, left: 'yes', fireDown: 1 });
    expect(G.weapon).toBe('pistol');
    expect(S.ctl.left).toBe(false);
    expect(G.fired).toBe(false);
  });
});
