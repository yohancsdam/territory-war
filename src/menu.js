// Setup menu, game-over screen and the sound toggle.
import { G, S } from './state.js';
import { startBattle, resetToMenu } from './sim.js';
import { invalidateWeapons } from './render.js';
import { ac, isSoundOn, setSoundOn } from './audio.js';
import { esc } from './util.js';

var lastCfg = null;
function $(id) { return document.getElementById(id); }

function readCfg() {
  return {
    names: [$('n0').value.trim() || 'Red Team', $('n1').value.trim() || 'Blue Team'],
    size: parseInt($('size').value, 10),
    hp: parseInt($('hp').value, 10),
    style: $('style').value
  };
}

export function beginBattle(cfg) {
  lastCfg = cfg;
  startBattle(cfg);
  $('menu').hidden = true; $('over').hidden = true;
  invalidateWeapons();
  $('cv').focus();
}

export function showGameOver() {
  var win = G.winner, teams = S.teams, box = $('overBox');
  box.className = 'box' + (win >= 0 ? ' win' + win : '');
  $('overTitle').textContent = win < 0 ? 'Draw' : (teams[win].name + ' wins');
  $('overText').textContent = win < 0 ? 'Both teams fell at the same time.' : 'Every enemy soldier has been eliminated.';
  var rows = '<tr><th>Team</th><th>Kills</th><th>Damage</th><th>Shots</th></tr>';
  teams.forEach(function (T, i) {
    rows += '<tr><td><span class="mark c' + i + '"></span>' + esc(T.name) + '</td><td>' + T.stat.kills + '</td><td>' + T.stat.dmg + '</td><td>' + T.stat.shots + '</td></tr>';
  });
  $('overStats').innerHTML = rows;
  $('over').hidden = false;
  $('rematch').focus();
}

export function setupMenu() {
  $('setup').addEventListener('submit', function (e) { e.preventDefault(); ac(); beginBattle(readCfg()); });
  $('rematch').addEventListener('click', function () { beginBattle(lastCfg || readCfg()); });
  $('toMenu').addEventListener('click', function () {
    $('over').hidden = true; $('menu').hidden = false;
    resetToMenu();
  });
  $('sound').addEventListener('click', function () {
    setSoundOn(!isSoundOn());
    this.setAttribute('aria-pressed', String(isSoundOn()));
    this.textContent = isSoundOn() ? 'Sound on' : 'Sound off';
  });
}
