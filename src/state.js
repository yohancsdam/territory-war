import { TURN_TIME, START_AIM, BANNER_TIME } from './config.js';

// Turn and control state.
export const G = {
  phase: 'menu', t: 0, active: null, timer: TURN_TIME, weapon: 'pistol', elev: START_AIM,
  charging: false, power: 0, fired: false, resolveT: 0, stableT: 0, jumpReq: false,
  banner: '', bannerT: 0, winner: -1
};

// Battle entities. teams is null when no battle is running.
export const S = {
  teams: null, units: [], proj: [], booms: [],
  feedList: [], feedVersion: 0
};

export const keys = { left: false, right: false, up: false, down: false };

export function feed(msg) {
  S.feedList.unshift(msg);
  if (S.feedList.length > 4) S.feedList.pop();
  S.feedVersion++;
}

export function setBanner(txt) { G.banner = txt; G.bannerT = BANNER_TIME; }
